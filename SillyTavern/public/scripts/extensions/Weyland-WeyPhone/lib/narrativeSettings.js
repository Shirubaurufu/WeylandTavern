// lib/narrativeSettings.js
//
// WeyPhone's Narrative app is deliberately a control surface over Weyland Tavern's existing
// variables and Quick Replies. It does not own prompt prose. Whenever a setting needs a derived
// prompt block, the canonical text is extracted from Weyland.NarrativeSettings at click time or
// the existing rebuild Quick Reply is executed by index.js.

import { specialSheetBoxes } from '../../quick-reply-ext/src/specialSheets.js';

export const NARRATIVE_TABS = Object.freeze(['essentials', 'style', 'modes', 'perspective']);

export const NARRATOR_OPTIONS = Object.freeze([
    { id: 'Default', globalKey: 'Default', label: 'Default', description: 'Weyland’s default writing style. A little of everything.' },
    { id: 'Lauren', globalKey: 'Lauren', label: 'Lauren', description: 'Gooey, warm, adoring… and utterly willing to break your heart.' },
    { id: 'Lucky', globalKey: 'Lucky', label: 'Lucky', description: 'Prioritizes objective detail, quiet humor and authenticity.' },
    { id: 'Salem', globalKey: 'Salem', label: 'Salem', description: 'Harsh, cynical and ready to do the wrong thing.' },
]);

export const PROMPT_OPTIONS = Object.freeze([
    { id: 'Current Prompt', label: 'Current', description: 'The default and recommended prompt.' },
    // Held since 2026-10-03: the old Beta graduated to Current. The slot stays on the shelf, greyed out and not selectable,
    // until there is a new beta to bring forward. Flip `disabled` off (and give it a description) when that day comes.
    { id: 'Beta Prompt', label: 'Beta', description: 'Empty slot. Nothing in testing right now.', disabled: true },
    { id: 'Old Prompt 2026', label: '2026', description: 'The prompt used before Weyland’s second anniversary.' },
    { id: 'Old Prompt 2025', label: '2025', description: 'The older Sonnet 3.7-era prompt.' },
    { id: 'Mini Prompt', label: 'Mini', description: 'A very early, compact prompt brought back with modern formatting and all PromptOS options.' },
]);

// PromptOS "Roleplay Shift": one optional feedback item the Beta prompt injects (quick-reply-ext
// XXX → buildRoleplayShiftItem). `id` is the value stored in the RoleplayShift global and must
// match the keys in quick-reply-ext/src/roleplayShifts.js. Like the rest of this file, only the
// labels live here; the prompt prose stays in quick-reply-ext. Descriptions mirror the TOOLTIP
// lines in "Prompt Review/Feedback Modifiers - DRAFT.txt".
export const SHIFT_OPTIONS = Object.freeze([
    { id: 'None', label: 'None', description: 'No course correction. The prompt runs as written.' },
    // General-Use is the original built-in Beta feedback (rav.js reason2Empirical). It was briefly
    // called "Temporary" while it was only kept for testing; resolveShift maps that old value over.
    { id: 'General-Use', label: 'General-Use', description: 'The original built-in feedback: real language and energy, characters who lead and are allowed to be flawed, and the full scene sheet every message. Needs Analysis on.' },
    { id: 'Hard Mode', label: 'Hard Mode', description: 'A sharp jolt toward harsher, rawer behavior. Use it for 1-2 messages, then switch back.' },
    { id: 'Self-Destruction', label: 'Self-Destruction', description: 'Characters act on their worst impulses - sabotage, relapse, pushing you away - and it sticks.' },
    { id: 'Slow Burn', label: 'Slow Burn', description: 'Trust and affection take a long time to earn. Strangers stay strangers until you change that.' },
    { id: 'Initiative', label: 'Initiative', description: 'Characters lead: they make plans, pick fights, drag you places, and stop asking what you want to do.' },
    { id: 'Horror', label: 'Horror', description: 'Real danger. Graphic, frightening descriptions, and bad choices can maim or kill your character.' },
    { id: 'Toxicity', label: 'Toxicity', description: 'Mean characters stop holding back. Insults get personal, specific and genuinely cruel.' },
    { id: 'Intimacy', label: 'Intimacy', description: 'Explicit, character-led sex scenes. No constant check-ins, no fade to black.' },
    { id: 'Flawed Communication', label: 'Flawed Communication', description: 'Characters talk and think the messy way their card says they do: broken grammar, crude thoughts, second-language slips, misunderstandings.' },
    { id: 'Intoxication', label: 'Intoxication', description: 'Drunk and high characters actually act like it: slurring, no filter, sloppy, and sometimes a nightmare.' },
    // Opens the preset screen (lib/ui/apps/customShift.js) rather than applying directly. The
    // preset in use lives in the RoleplayShiftCustom global as { id, name, text }.
    { id: 'Custom Preset', label: 'Custom Preset', description: 'Your own feedback, in your own words. Write, save and pick your presets.' },
]);

// Custom Preset: one free-text box that goes in exactly where a built-in shift's player quote goes,
// wrapped in the same header, audit and closing as every other shift. 4,000 characters is about
// the longest built-in quote (Horror 4,059, General-Use 4,091; most sit around 3,300), so a preset
// can be as long as ours but nobody can paste a whole system prompt in there.
export const CUSTOM_FEEDBACK_LIMIT = 4000;
export const CUSTOM_NAME_LIMIT = 40;

/** Applies the injected-text rules before a preset is saved: no indented or hard-wrapped lines
 * (SillyTavern's output breaks on them), no em dashes (the house style everywhere in injected
 * text), no runs of blank lines, no wrapping quote marks (the prompt adds its own), and the cap. */
export function cleanCustomFeedback(text) {
    let cleaned = String(text ?? '').replace(/\r\n?/g, '\n')
        .split('\n').map(line => line.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '')).join('\n')
        .replace(/\s*\u2014\s*/g, ' - ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (cleaned.length >= 2 && cleaned.startsWith('"') && cleaned.endsWith('"')) cleaned = cleaned.slice(1, -1).trim();
    return cleaned.slice(0, CUSTOM_FEEDBACK_LIMIT).trim();
}

export function cleanCustomName(name) {
    return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, CUSTOM_NAME_LIMIT).trim();
}

/** The New preset box starts filled with Slow Burn's player quote, as an example of the candid,
 * venting voice that works. Just the quote: no notes or calibration, since the box is only that. */
export function customShiftExample(shiftBodies) {
    const body = String(shiftBodies?.['Slow Burn'] ?? '');
    const start = body.indexOf('> "');
    const end = body.indexOf('\nNARRATOR NOTES:');
    if (start < 0 || end < start) return '';
    return cleanCustomFeedback(body.slice(start + 2, end));
}

/** The preset in use, from the RoleplayShiftCustom global, or null if it's missing or broken. */
export function readCustomPreset(raw) {
    try {
        const preset = JSON.parse(String(raw || ''));
        return preset && typeof preset.text === 'string' && preset.text.trim() ? preset : null;
    } catch {
        return null;
    }
}

/** "A dose of..." (quick-reply-ext/src/dose.js): every shift can be dosed for a secret 2-10
 * replies, Hard Mode and General-Use included. None has nothing to dose. */
export const DOSE_OPTIONS = Object.freeze(SHIFT_OPTIONS.filter(option => option.id !== 'None'));

/** Hard Mode is still stored in HardToggle (the shared assembler, classic menu and the
 * phone opt-ins all read it), so it always wins; a leftover "Hard Mode" in RoleplayShift after
 * HardToggle was switched off elsewhere reads as None, matching what XXX actually injects. */
export function resolveShift(roleplayShift, hardToggle) {
    if (on(hardToggle)) return 'Hard Mode';
    const saved = String(roleplayShift ?? '').trim();
    if (saved === 'Hard Mode') return 'None';
    if (saved === 'Temporary') return 'General-Use';
    return SHIFT_OPTIONS.some(option => option.id === saved) ? saved : 'None';
}

// PromptOS "Roleplay intro context" (quick-reply-ext/src/introContext.js owns the logic). An intro
// whose context fades gets all three; one whose context is always on (a ConstantScenario) only
// gets On/Off, where its "On" is simply the default (auto) state.
export const INTRO_MODE_OPTIONS = Object.freeze([
    { id: 'auto', label: 'Auto', description: 'Fades once the conversation moves on. The default.' },
    { id: 'on', label: 'On', description: 'Stays in context until you change it.' },
    { id: 'off', label: 'Off', description: 'Dropped. Turn it back on any time.' },
]);
export const INTRO_CONSTANT_MODE_OPTIONS = Object.freeze([
    { id: 'auto', label: 'On', description: 'Always in context. This intro does not fade on its own.' },
    { id: 'off', label: 'Off', description: 'Dropped. Turn it back on any time.' },
]);

export const THINKING_OPTIONS = Object.freeze([
    { id: 'Level 2', label: 'Full', description: 'The most detailed pre-response analysis.' },
    { id: 'Level 1', label: 'Fast', description: 'Condensed analysis with less waiting.' },
    { id: 'Disabled', label: 'Off', description: 'Skip the analysis framework.' },
    { id: 'Debug', label: 'Debug', description: 'Developer-facing framework diagnostics.' },
]);

export const POV_OPTIONS = Object.freeze([
    { id: '3rd POV Narration/2nd POV Persona', short: '3rd / 2nd', type: '3rd/2nd POV', description: 'External narration; the user is “you”.' },
    { id: '3rd POV Narration/3rd POV Persona', short: '3rd / 3rd', type: '3rd/3rd POV', description: 'External narration; the user is named.' },
    { id: '1st POV Narration/2nd POV Persona', short: '1st / 2nd', type: '1st/2nd POV', description: 'Character narrates as “I”; the user is “you”.' },
    { id: '1st POV Narration/3rd POV Persona', short: '1st / 3rd', type: '1st/3rd POV', description: 'Character narrates as “I”; the user is named.' },
]);

// `description` is the short line shown right on the row; `tooltip` is the fuller explanation
// from Storytelling Settings' own Message Mode menu, shown on demand via the row's "?" — a new
// user should never have to already know what "Onyx" means to make an informed choice.
export const MODE_TOGGLES = Object.freeze([
    { variable: 'OnyxToggle', label: 'Onyx', description: 'Slow, vivid adult-romance intimacy.', tooltip: 'For intimacy that would be found in an adult romance novel — romantic and erotic, but focused on the intimacy of close connection rather than explicit detail. Asks the model to slow down and savor the moment with vivid, precise description.' },
    { variable: 'RubyToggle', label: 'Ruby', description: 'Explicit smut-focused intimacy.', tooltip: 'For anything that belongs less in a romance novel and more in a smut novel. Opens the door for the model to be as explicit as it wishes, with a full framework for NSFW content.' },
    { variable: 'OpalToggle', label: 'Opal', description: 'Human, guarded treatment of trauma and disclosure.', tooltip: 'Guides the model to take a more human approach to describing a character’s past and trauma instead of summarizing or info-dumping it. Characters may, ironically, become less willing to discuss details they’d otherwise share freely — that reluctance is intentional.' },
    { variable: 'HTML!', label: 'HTML', description: 'Allow in-world screens, signs, and interfaces in HTML.', tooltip: 'Sends HTML instructions along with the prompt, so the model may attempt to render in-world screens, signs, or interfaces as actual HTML in its responses.' },
    { variable: 'ClothingTrack', label: 'Clothing', description: 'Keep a small hidden outfit-continuity footer.', tooltip: 'Adds a brief, hidden tracker to the end of each message recording the character’s current outfit. Can improve outfit continuity, at the cost of a small amount of extra tokens per message.' },
    { variable: 'OOCMode', label: 'OOC Mode', description: 'Pause the roleplay and talk to your narrator about it.', tooltip: 'Steps outside the story. While it\'s on, the Weyland roleplay prompt is set aside and your narrator talks with you directly, as themselves, about the roleplay: questions, feedback, plans or confusion. With no narrator picked, you\'re talking to the AI itself. The character, lorebooks and chat history stay in context. Replies won\'t roleplay while it\'s on, so turn it off to get back to the story.' },
]);

// OOC Mode isn't a message mode like the others: while it's on, quick-reply-ext's XXX() swaps the
// whole Weyland base prompt for an out-of-character one (quick-reply-ext/src/oocMode.js), so its
// toggle rebuilds XXX instead of NewEntries (see toggle-mode in index.js).
export const OOC_MODE_VARIABLE = 'OOCMode';

// These are still early and behind their own "Experimental" card in the UI, separate from the
// established Onyx/Ruby/Opal modes above.
export const EXPERIMENTAL_MODE_VARIABLES = Object.freeze(['HTML!', 'ClothingTrack', OOC_MODE_VARIABLE]);

// `tooltip` text is Lucky's own explanation from Storytelling Settings' Mental Health Directives
// menu, condensed only where the original repeated itself.
export const MENTAL_TOGGLES = Object.freeze([
    { variable: 'MentalToggle', label: 'Mental health isn’t romantic', tooltip: 'Love is not the cure for mental illness, and mentally ill people may not respond to kindness in the "right" way. Characters may reflexively push away comfort, self-sabotage when things are going well, or react to affection with suspicion or anger. Progress is not linear — relapse is possible even after months of improvement.' },
    { variable: 'SecretsToggle', label: 'Secrets, boundaries & conflict', recommended: true, tooltip: 'Characters have secrets about their past, trauma, and coping mechanisms that aren’t easily shared. They may deflect, lie, or shut down when pressed about painful topics. Trust must be earned through consistent action, not extracted through one heartfelt question. Crossing a boundary may cause explosive conflict, withdrawal, or relationship damage.' },
    { variable: 'DialogueToggle', label: 'Dialogue that hurts', recommended: true, tooltip: 'When characters are hurting, angry, or spiraling, their dialogue reflects it authentically — they may say cruel things they don’t mean, target known insecurities, or become incoherent through sobs. Speech and thought get fragmented and raw instead of staying articulate and controlled.' },
    { variable: 'HappyToggle', label: 'Authenticity, not happiness', tooltip: 'The model’s job is to portray the character with unflinching honesty, not to make sure your character feels good or that relationships succeed. Characters may make bad choices, self-destruct, or become genuinely unlikable, and relationships may fall apart without reconciliation — that still counts as a success if it’s authentic to the character.' },
    { variable: 'JoyToggle', label: 'Warmth, joy & safety', recommended: true, tooltip: 'Broken people still laugh, feel butterflies, and have moments of genuine happiness. Mental illness doesn’t erase someone’s capacity for joy, warmth, or safety — good moments don’t need to be tainted with hidden pain or foreshadowing, and characters can be goofy, playful, and genuinely content when circumstances allow.' },
]);

export const FOCUS_OPTIONS = Object.freeze([
    { id: 'Character', label: 'Character', description: 'Follow the character when the scene splits.' },
    { id: 'User', label: 'User', description: 'Follow the user and the world around them.' },
    { id: 'Split', label: 'Split', description: 'Follow both sides in separate scene sections.' },
]);

export function enabled(value) {
    return String(value ?? '').trim().toLowerCase() === 'enabled';
}

export function on(value) {
    return String(value ?? '').trim().toLowerCase() === 'on';
}

export function normalizePromptText(value) {
    return String(value ?? '')
        .replace(/\\([{}])/g, '$1')
        .replace(/\r\n/g, '\n')
        .trim();
}

/** Pull the manually-enabled Hard Mode directive from its canonical Quick Reply. */
export function extractHardModeDirective(script) {
    const source = String(script ?? '');
    const start = source.indexOf('[TEMPORARY SCENE DIRECTION]');
    const close = '[END TEMPORARY SCENE DIRECTION]';
    const end = source.indexOf(close, start);
    if (start < 0 || end < start) return '';
    return normalizePromptText(source.slice(start, end + close.length));
}

/** The original menu restores this reroll-analysis reminder when manual Hard Mode is disabled. */
export function extractHardModeOffDirective(script) {
    const source = String(script ?? '');
    const start = source.indexOf('[Temporary Analysis Enabled]');
    if (start < 0) return '';
    const end = source.indexOf('\n/:Weyland.XXX', start);
    if (end < start) return '';
    return normalizePromptText(source.slice(start, end).replace(/\s*\|\s*$/, ''));
}

/** Pull the Clothing Tracker payload from the canonical Quick Reply instead of duplicating it. */
export function extractClothingDirective(script) {
    const source = String(script ?? '');
    const start = source.indexOf('[CLOTHING SUBSECTION:');
    if (start < 0) return '';
    const end = source.indexOf(' :}', start);
    if (end < start) return '';
    return normalizePromptText(source.slice(start, end));
}

/** Build the language block from the live Quick Reply template. Only the chosen language is filled. */
export function extractLanguageDirective(script, language) {
    const source = String(script ?? '');
    const start = source.indexOf('[CRITICAL LANGUAGE MODIFIER:');
    if (start < 0) return '';
    const end = source.indexOf(' :}', start);
    if (end < start) return '';
    const chosen = String(language ?? '').trim();
    return normalizePromptText(source.slice(start, end))
        .replaceAll('{{getglobalvar::LanguageChoice}}', chosen);
}

/**
 * Pull a POV payload from the existing menu branch. The first matching branch is the shared
 * global/local implementation; whether it is stored globally or per-chat is decided by index.js.
 */
export function extractPovDirective(script, optionId) {
    const source = String(script ?? '');
    const marker = `/if left={{getvar::OptionChoice2}} right="${optionId}" rule=eq {:`;
    const branch = source.indexOf(marker);
    if (branch < 0) return '';
    const pass = source.indexOf('/pass ', branch + marker.length);
    if (pass < 0) return '';
    const end = source.indexOf('\n/if left={{getvar::RPPOVLocalSet}}', pass);
    if (end < pass) return '';
    return normalizePromptText(source.slice(pass + '/pass '.length, end).replace(/\s*\|\s*$/, ''));
}

function narratorNameForPrompt(prompt, getGlobal) {
    const value = String(prompt ?? '');
    for (const option of NARRATOR_OPTIONS) {
        if (value && value === String(getGlobal(option.globalKey) ?? '')) return option.id;
    }
    return 'Default';
}

export function readNarrativeSnapshot({ getGlobal, getLocal, hasChat = false, intro = null, dose = null, characterName = '' }) {
    const localNarratorOverride = hasChat && String(getLocal('LocalN') ?? '').trim() !== '';
    const globalNarrator = narratorNameForPrompt(getGlobal('Narrator'), getGlobal);
    const localNarrator = localNarratorOverride
        ? narratorNameForPrompt(getLocal('LocalNarrator'), getGlobal)
        : globalNarrator;
    const language = String(getGlobal('LanguageChoice') || 'English').trim() || 'English';
    // "Beta Prompt" was everyone's saved default until Beta became Current (2026-10-03); the prompt builder treats the two as
    // the same, so show the cartridge that is actually inserted.
    const savedPrompt = String(getGlobal('PromptChoice') || getGlobal('MainPromptChoice') || 'Current Prompt').trim();
    const prompt = savedPrompt === 'Beta Prompt' ? 'Current Prompt' : savedPrompt;
    const thinking = String(getGlobal('ThinkingFramework') || 'Disabled').trim();
    const localPovLabel = hasChat ? String(getLocal('RPPOVLocalSet') ?? '').trim() : '';

    return {
        hasChat,
        // Kinsbane Manor, Mirror Weyland and Muse bring their own system prompt and scene sheet
        // (quick-reply-ext/src/specialSheets.js), so the prompt cartridges and the Analysis toggle do
        // nothing in their chats. Holds the card name while one is open, else null.
        builtInPrompt: hasChat && specialSheetBoxes(characterName) ? characterName : null,
        prompt,
        hardMode: on(getGlobal('HardToggle')),
        shift: resolveShift(getGlobal('RoleplayShift'), getGlobal('HardToggle')),
        // Supplied by quick-reply-ext's describeIntroContext() (null outside WeyTav, e.g. in tests).
        intro,
        // quick-reply-ext's describeDose(): { shift } while this chat has a dose in it, else null.
        // It never says how long is left; that's the point of a dose.
        dose: hasChat ? dose : null,
        customPreset: readCustomPreset(getGlobal('RoleplayShiftCustom')),
        geminiBypass: enabled(getGlobal('GeminiBypassToggle')),
        // Unset (a fresh account, or anyone who hasn't touched this yet) defaults to On — the
        // analysis has always run unconditionally until this toggle existed, so "never set" must
        // read the same as "explicitly on" rather than silently going quiet for existing users.
        analysisEnabled: enabled(getGlobal('AnalysisToggle') || 'Enabled'),
        thinking,
        globalNarrator,
        localNarrator,
        localNarratorOverride,
        language,
        povType: String(getGlobal('POVType') || '3rd/2nd POV').trim(),
        localPovLabel,
        localPovOverride: Boolean(localPovLabel),
        focus: String(getGlobal('Focus') || 'Character').trim(),
        commandsHidden: String(getGlobal('oochide1') ?? '').includes('display: none'),
        modes: Object.fromEntries(MODE_TOGGLES.map(item => [item.variable, enabled(getGlobal(item.variable))])),
        mental: Object.fromEntries(MENTAL_TOGGLES.map(item => [item.variable, enabled(getGlobal(item.variable))])),
    };
}

export function mentalPresetValues(preset) {
    const all = Object.fromEntries(MENTAL_TOGGLES.map(item => [item.variable, 'Enabled']));
    if (preset === 'all') return all;
    if (preset === 'none') return Object.fromEntries(MENTAL_TOGGLES.map(item => [item.variable, 'Disabled']));
    if (preset === 'recommended') {
        return Object.fromEntries(MENTAL_TOGGLES.map(item => [item.variable, item.recommended ? 'Enabled' : 'Disabled']));
    }
    return {};
}
