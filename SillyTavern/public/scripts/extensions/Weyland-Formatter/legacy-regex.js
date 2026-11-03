// Legacy regex replacement for Weyland-Formatter.
//
// Older character cards (and the default global regex list) carry Regex-extension scripts
// that are either covered by the Formatter now, or are simple enough to run as plain JS.
// This module installs `globalThis.weylandRegexHook`, which regex/engine.js checks on every
// getRegexedString() call:
//   - isRetired(script): legacy scripts that are skipped instead of run.
//   - builtins: JS versions of the still-useful universal scripts. They use the same
//     placement / markdownOnly / promptOnly / runOnEdit gating as a regex script, so they
//     apply in exactly the same places the old scripts did.
// If Weyland-Formatter is not loaded the hook never exists and every script runs as before,
// so nothing breaks for users who have the extension turned off.
//
// The scripts stay on the cards for now; as each card is re-uploaded they can be removed.

import { substituteParams, saveSettingsDebounced } from '../../../script.js';
import { extension_settings } from '../../extensions.js';
import { getGlobalVariable } from '../../variables.js';
import { regexFromString } from '../../utils.js';

// Mirrors regex_placement in regex/engine.js (not imported to avoid a circular import).
const USER_INPUT = 1;
const AI_OUTPUT = 2;

/**
 * Legacy scripts to skip. A script is retired if its name matches exactly (case-insensitive),
 * or, for entries that list `patterns`, if its find regex is the same pattern under a different
 * name (e.g. "Replace Pic 3"). Pattern matching is only used where renamed copies are known to
 * exist, so personal scripts with their own names are never caught by accident.
 */
const retiredScripts = [
    // Display-only [P###]/[I###] image swaps. Formatter's introImagesExt renders both prefixes.
    {
        names: ['Replace Pic', 'Replace Pic 2', 'Replace Pic 3'],
        patterns: [String.raw`\[\s*P(\d{3})\s*\]`, String.raw`\[\s*I(\d{3})\s*\]`],
    },
    // Refusal / meta-commentary strippers. Retired outright, no JS replacement.
    { names: ['Assistant'] },
    { names: ['Contraints', 'Constraints'] },
    // "____" -> "__". Formatter's tooManyUnderscores already collapses 3+ underscores in replies,
    // and no greeting uses four in a row.
    { names: ['Remove ____'] },
    // Tier banners from when single greetings could be locked to a tier. Tiers now apply to the
    // whole character before it is opened, so the tags are no longer used anywhere.
    { names: ['PP', 'PPP'] },
    // Was meant to hide LTM "EXITING ROLEPLAY" messages, but never worked: its find regex
    // ({{getglobalvar::LTMRegexFind}}) was not set to substitute, so it only matched that literal text.
    { names: ['Sonnet Think'] },
    // Global scripts the Startup Commands QR used to switch off one by one. The Formatter covers
    // what they did (footer codes, bracket/asterisk/code-fence cleanup), and skipping them here
    // takes effect immediately instead of needing a refresh per toggle.
    {
        names: [
            'Find Last Character', 'Remove **', 'Remove ``````', 'Remove ]]', 'Remove ))',
            'Swap [ for ]', 'Swap ( for )', 'Clothing Codes',
        ],
    },
    // Disabled in the shipped defaults; the Formatter's header extensions replaced it.
    { names: ['Title Bar Bolded'] },
    // The scripts below are replaced by the builtins further down.
    { names: ['Hide Pic'] },
    { names: ['Trim'] },
    { names: ['OOC Prompt Help'] },
    { names: ['!Command Hider', '2nd !Command Hider'] },
    { names: ['Hide Ooc Prompts'] },
];

const retiredNames = new Set(retiredScripts.flatMap(entry => entry.names.map(name => name.toLowerCase())));
const retiredPatterns = new Set(retiredScripts.flatMap(entry => entry.patterns ?? []));

// findRegex string -> pattern source, so each script's regex is parsed once rather than per message.
const patternSourceCache = new Map();

function getPatternSource(findRegex) {
    if (!patternSourceCache.has(findRegex)) {
        patternSourceCache.set(findRegex, regexFromString(findRegex)?.source ?? null);
    }
    return patternSourceCache.get(findRegex);
}

/** @returns {boolean} true if the legacy script should be skipped */
function isRetired(script) {
    if (!script) return false;
    if (retiredNames.has(String(script.scriptName ?? '').toLowerCase())) return true;
    if (!script.findRegex || retiredPatterns.size === 0) return false;
    return retiredPatterns.has(getPatternSource(script.findRegex));
}

const globalVar = name => String(getGlobalVariable(name) ?? '');

const customStartHelpHtml = '<div style="text-align: center;"><font size="7"><strong>Custom Start</strong></font></div><br><br>'
    + '__This is the custom start scenario prompt for {{char}}.__<br>'
    + '__Sonnet is very good at custom starts, though the quality may vary for other models.__<br>'
    + '__The ooc prompt has already been prepared.__<br>'
    + '__Simply respond in parenthesis what you what for your custom scenario.__<br>'
    + '__This can be as complex as you want, or as simple as: (Star Wars)__<br>'
    + '__*These underlined instructions are invisible to the AI.*__';

/**
 * JS replacements for the universal scripts. Flags match the original scripts so the regex
 * engine applies them at the same points (stored text vs. display vs. outgoing prompt).
 * `run(text, { characterOverride })` returns the new text.
 */
const builtins = [
    {
        // Was "Hide Pic" (on every card): keeps image codes in greetings out of the prompt so
        // the model does not learn to write them.
        scriptName: 'Weyland: Hide image codes from AI',
        placement: [USER_INPUT, AI_OUTPUT],
        markdownOnly: false,
        promptOnly: true,
        runOnEdit: true,
        run: text => text.replace(/\[\s*[PI]\d{3}\s*\]/g, ''),
    },
    {
        // Was "Trim": the model sometimes copies the custom-start marker into its footer as a
        // clothing code. Anything but a leading [CS] becomes the regular-clothes code [RC].
        // Not global, same as the original: only the first stray [CS] is changed.
        scriptName: 'Weyland: Stray [CS] to [RC]',
        placement: [AI_OUTPUT],
        markdownOnly: false,
        promptOnly: false,
        runOnEdit: true,
        run: text => text.replace(/(?<!^)\[CS\](?!\n)/, '[RC]'),
    },
    {
        // Was "OOC Prompt Help": the [CS] marker at the top of custom-start greetings becomes
        // the instructions banner.
        scriptName: 'Weyland: Custom start help',
        placement: [AI_OUTPUT],
        markdownOnly: true,
        promptOnly: false,
        runOnEdit: true,
        run: (text, { characterOverride } = {}) => text.includes('[CS]')
            // Function form so a "$" in the character's name is not read as a replacement pattern.
            ? text.replace('[CS]', () => substituteParams(customStartHelpHtml, undefined, characterOverride))
            : text,
    },
    {
        // Was "!Command Hider" + "2nd !Command Hider". Those had no g flag, so each wrapped one
        // command and two copies covered two per message; the g flag here covers any number.
        // The wrapper comes from the commandhide1/2 globals that the Narrative Settings QR
        // switches between hidden and styled.
        scriptName: 'Weyland: !Command hider',
        placement: [USER_INPUT, AI_OUTPUT],
        markdownOnly: true,
        promptOnly: false,
        runOnEdit: true,
        run: text => text.replace(/(?<!\S)!\w+/g, match => `${globalVar('commandhide1')}${match}${globalVar('commandhide2')}`),
    },
    {
        // Was "Hide Ooc Prompts". The original had no g flag and only wrapped the first (OOC: ...)
        // in a message; this wraps all of them. Wrapper comes from the oochide1/2 globals.
        scriptName: 'Weyland: OOC prompt hider',
        placement: [USER_INPUT, AI_OUTPUT],
        markdownOnly: true,
        promptOnly: false,
        runOnEdit: true,
        run: text => text.replace(/\([oO][oO][cC]:[^)]*\)/g, match => `${globalVar('oochide1')}${match}${globalVar('oochide2')}`),
    },
].map(script => ({ ...script, disabled: false, minDepth: null, maxDepth: null }));

export function installLegacyRegexHook() {
    globalThis.weylandRegexHook = { isRetired, builtins };
}

/**
 * Marks retired *global* scripts as disabled so the regex panel matches what actually runs.
 * Sets the flag directly instead of using /regex-toggle, which saves through saveRegexScript()
 * and reloads the chat once per script. Here it is one debounced settings save and no reload;
 * the panel picks up the change on its next CHAT_CHANGED redraw.
 * Character-embedded scripts are left alone: changing them would rewrite the card PNGs, and
 * they are skipped by the hook regardless.
 */
export function disableRetiredGlobalScripts() {
    let changed = false;
    for (const script of extension_settings.regex ?? []) {
        if (!script.disabled && isRetired(script)) {
            script.disabled = true;
            changed = true;
        }
    }
    if (changed) saveSettingsDebounced();
}
