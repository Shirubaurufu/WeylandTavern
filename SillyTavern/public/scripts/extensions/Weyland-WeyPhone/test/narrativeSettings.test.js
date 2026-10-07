import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    extractClothingDirective,
    extractHardModeDirective,
    extractHardModeOffDirective,
    extractLanguageDirective,
    extractPovDirective,
    POV_OPTIONS,
    readNarrativeSnapshot,
    resolveShift,
    SHIFT_OPTIONS,
    currentScenarioLabel,
    DOSE_OPTIONS,
} from '../lib/narrativeSettings.js';
import { renderNarrativeSettingsScreen } from '../lib/ui/apps/narrativeSettings.js';
import { applyGeminiBypass, GEMINI_BOX6_EXPLICIT, GEMINI_BYPASS_PROMPT, stripGeminiExplicitBox } from '../../quick-reply-ext/src/promptModifiers.js';

function canonicalNarrativeScript() {
    const path = fileURLToPath(new URL('../../../../../data/default-user/QuickReplies/Weyland.json', import.meta.url));
    const set = JSON.parse(readFileSync(path, 'utf8'));
    const quickReply = set.qrList.find(item => item.label === 'NarrativeSettings');
    assert.ok(quickReply?.message, 'the canonical NarrativeSettings Quick Reply should exist');
    return quickReply.message;
}

test('the Narrative app derives prompt payloads from the canonical Quick Reply', () => {
    const script = canonicalNarrativeScript();
    assert.match(extractHardModeDirective(script), /TEMPORARY SCENE DIRECTION/);
    assert.match(extractHardModeOffDirective(script), /Temporary Analysis Enabled/);
    assert.match(extractClothingDirective(script), /CLOTHING SUBSECTION/);

    const language = extractLanguageDirective(script, 'French');
    assert.match(language, /French/);
    assert.doesNotMatch(language, /LanguageChoice/);

    for (const option of POV_OPTIONS) {
        const directive = extractPovDirective(script, option.id);
        assert.ok(directive.length > 100, `${option.id} should resolve through the existing menu`);
    }
});

test('snapshot reads the same global and chat-local variables used by Storytelling Settings', () => {
    const globals = new Map([
        ['Default', 'default narrator prompt'],
        ['Lucky', 'lucky narrator prompt'],
        ['Narrator', 'lucky narrator prompt'],
        ['PromptChoice', 'Beta Prompt'],
        ['HardToggle', 'On'],
        ['GeminiBypassToggle', 'Enabled'],
        ['AnalysisToggle', 'Disabled'],
        ['ThinkingFramework', 'Level 1'],
        ['LanguageChoice', 'Japanese'],
        ['POVType', '3rd/3rd POV'],
        ['Focus', 'Split'],
        ['OnyxToggle', 'Enabled'],
        ['SecretsToggle', 'Enabled'],
        ['oochide1', '<p style="display: none !important;">'],
    ]);
    const locals = new Map([
        ['LocalN', '- Set to Default'],
        ['LocalNarrator', 'default narrator prompt'],
        ['RPPOVLocalSet', '1st POV Narration/2nd POV Persona'],
    ]);
    const snapshot = readNarrativeSnapshot({
        getGlobal: key => globals.get(key),
        getLocal: key => locals.get(key),
        hasChat: true,
    });

    // Beta became Current on 2026-10-03; a saved "Beta Prompt" (everyone's old default) shows as the Current cartridge.
    assert.equal(snapshot.prompt, 'Current Prompt');
    assert.equal(snapshot.globalNarrator, 'Lucky');
    assert.equal(snapshot.localNarrator, 'Default');
    assert.equal(snapshot.localNarratorOverride, true);
    assert.equal(snapshot.localPovOverride, true);
    assert.equal(snapshot.hardMode, true);
    assert.equal(snapshot.geminiBypass, true);
    assert.equal(snapshot.analysisEnabled, false);
    assert.equal(snapshot.commandsHidden, true);
    assert.equal(snapshot.modes.OnyxToggle, true);
    assert.equal(snapshot.mental.SecretsToggle, true);
});

test('analysis defaults to on when the toggle has never been set', () => {
    const snapshot = readNarrativeSnapshot({
        getGlobal: () => undefined,
        getLocal: () => undefined,
        hasChat: false,
    });
    assert.equal(snapshot.analysisEnabled, true);
});

test('Roleplay Shift: HardToggle always wins, and a stale or unknown value reads as None', () => {
    assert.equal(resolveShift(undefined, undefined), 'None');
    assert.equal(resolveShift('Horror', 'Off'), 'Horror');
    assert.equal(resolveShift('Horror', 'On'), 'Hard Mode');
    // The classic menu can switch HardToggle off without touching RoleplayShift.
    assert.equal(resolveShift('Hard Mode', 'Off'), 'None');
    assert.equal(resolveShift('Consequences', 'Off'), 'None');
});

test('every Roleplay Shift the picker offers has a prompt body (or is handled from rav.js)', async () => {
    const { SHIFT_BODIES } = await import('../../quick-reply-ext/src/roleplayShifts.js');
    // Custom Preset's text is the player's own (test/customShift.test.js covers it).
    const fromRav = ['None', 'General-Use', 'Hard Mode', 'Custom Preset'];
    for (const option of SHIFT_OPTIONS) {
        if (option.disabled || fromRav.includes(option.id)) continue;
        assert.ok(String(SHIFT_BODIES[option.id] ?? '').length > 500, `${option.id} should have an encoded body`);
    }
});

test('the Roleplay Shift card flags Hard Mode as short-term and supports feedback on legacy prompts', () => {
    const target = { innerHTML: '' };
    const base = { hasChat: false, prompt: 'Beta Prompt', hardMode: false, shift: 'None', analysisEnabled: true, modes: {}, mental: {} };
    renderNarrativeSettingsScreen(target, { snapshot: base, tab: 'essentials' });
    assert.doesNotMatch(target.innerHTML, /wp-narrative-shift-card is-on/);

    renderNarrativeSettingsScreen(target, { snapshot: { ...base, hardMode: true, shift: 'Hard Mode' }, tab: 'essentials' });
    assert.match(target.innerHTML, /wp-narrative-shift-card is-on/);
    assert.match(target.innerHTML, /meant for 1-2 messages/);

    renderNarrativeSettingsScreen(target, { snapshot: { ...base, prompt: 'Old Prompt 2025', shift: 'Horror' }, tab: 'essentials' });
    assert.doesNotMatch(target.innerHTML, /Only the Beta prompt sends Roleplay Shifts/);

    renderNarrativeSettingsScreen(target, { snapshot: { ...base, shift: 'General-Use', analysisEnabled: false }, tab: 'essentials' });
    assert.match(target.innerHTML, /General-Use only works with Analysis on/);
});

test('Roleplay intro context card: fading toggle, always-on toggle, variant picker, unavailable', () => {
    const target = { innerHTML: '' };
    const base = { hasChat: true, prompt: 'Beta Prompt', shift: 'None', analysisEnabled: true, modes: {}, mental: {} };
    const render = intro => {
        renderNarrativeSettingsScreen(target, { snapshot: { ...base, intro }, tab: 'essentials' });
        return target.innerHTML;
    };

    // Rein-style intro: a Scenario that fades -> Auto / On / Off, current mode selected.
    let html = render({ available: true, context: { mode: 'on', fades: true }, variants: [] });
    assert.match(html, /Roleplay Intro Context/);
    for (const mode of ['auto', 'on', 'off']) assert.match(html, new RegExp(`data-narrative-action="set-intro-context" data-value="${mode}"`));
    assert.match(html, /wp-narrative-selected" data-narrative-action="set-intro-context" data-value="on"/);

    // ConstantScenario intro: never fades, so only On (= auto) / Off.
    html = render({ available: true, context: { mode: 'auto', fades: false }, variants: [] });
    assert.doesNotMatch(html, /set-intro-context" data-value="on"/);
    assert.match(html, /wp-narrative-selected" data-narrative-action="set-intro-context" data-value="auto"/);

    // Loona's drunk start: the variant group replaces the generic toggle and carries its own Off.
    html = render({ available: true, context: null, variants: [{ id: 'loona-drunk', label: 'Drunk start', current: 'turbo-hooked', options: [{ id: 'turbo-hooked', label: 'Turbo drunk, almost hooked up' }, { id: 'off', label: 'Off' }] }] });
    assert.doesNotMatch(html, /set-intro-context/);
    assert.match(html, /wp-narrative-selected" data-narrative-action="set-intro-variant" data-value="loona-drunk\|turbo-hooked"/);
    assert.match(html, /data-value="loona-drunk\|off"/);

    // Unavailable (Mirror, Weybot, or an intro with nothing to toggle) shows the reason, no buttons.
    html = render({ available: false, reason: 'Mirror World manages its own starting context.', context: null, variants: [] });
    assert.match(html, /Mirror World manages its own starting context\./);
    assert.doesNotMatch(html, /set-intro-/);
});

test('Mental Health Directives are individual choices with the updated explanation', () => {
    const target = {innerHTML:''};
    renderNarrativeSettingsScreen(target, {tab:'modes',snapshot:{modes:{},mental:{}}});
    assert.match(target.innerHTML, /<h3>Mental Health Directives<\/h3>/);
    assert.match(target.innerHTML, /Mental health directives are optional modifiers/);
    assert.match(target.innerHTML, /These modifiers may improve output, but may also degrade short term memory\./);
    assert.match(target.innerHTML, /please let us know in Discord feedback\./);
    assert.match(target.innerHTML, /for a brief summary of what they do\./);
    assert.doesNotMatch(target.innerHTML, /Emotional range|mental-preset|Recommended|All on|All off/);
    assert.equal((target.innerHTML.match(/data-narrative-action="toggle-mental"/g) ?? []).length, 5);
});

test('Narrative renders a phone-native control surface without embedding prompt payloads', () => {
    const target = { innerHTML: '' };
    const snapshot = {
        hasChat: false,
        prompt: 'Current Prompt',
        hardMode: false,
        geminiBypass: false,
        analysisEnabled: true,
        thinking: 'Level 2',
        globalNarrator: 'Default',
        localNarrator: 'Default',
        localNarratorOverride: false,
        language: 'English',
        povType: '3rd/2nd POV',
        localPovLabel: '',
        localPovOverride: false,
        focus: 'Character',
        commandsHidden: false,
        modes: {},
        mental: {},
    };

    renderNarrativeSettingsScreen(target, { snapshot, tab: 'essentials' });
    assert.match(target.innerHTML, /data-narrative-tab="style"/);
    assert.match(target.innerHTML, /data-narrative-action="set-shift"/);
    for (const option of SHIFT_OPTIONS.filter(item => !item.disabled)) {
        assert.match(target.innerHTML, new RegExp(`data-narrative-action="set-shift" data-value="${option.id}"`));
    }
    assert.match(target.innerHTML, /Course correction<span class="wp-narrative-slash">/);
    // Home's dot-matrix "Current Setup:" screen and the System Prompt Selection cartridge bay.
    assert.match(target.innerHTML, /Current Setup:/);
    assert.match(target.innerHTML, /<dt>Prompt<\/dt><dd>Current<\/dd>/);
    assert.match(target.innerHTML, /System Prompt Selection:/);
    assert.match(target.innerHTML, /wp-narrative-cart is-in" data-narrative-action="set-prompt" data-value="Current Prompt"/);
    for (const id of ['Old Prompt 2026', 'Old Prompt 2025', 'Mini Prompt']) {
        assert.match(target.innerHTML, new RegExp(`class="wp-narrative-cart" data-narrative-action="set-prompt" data-value="${id}"`));
    }
    // Beta is a held slot: drawn, greyed out, and with no action to click. Only the four real cartridges are counted.
    assert.match(target.innerHTML, /class="wp-narrative-cart is-held" disabled/);
    assert.doesNotMatch(target.innerHTML, /data-value="Beta Prompt"/);
    assert.match(target.innerHTML, /4 Promptcarts&trade; detected/);
    assert.doesNotMatch(target.innerHTML, /Beta recommended/);
    assert.match(target.innerHTML, /wp-narrative-bay-help[\s\S]*foundational instruction set/, 'the explanation sits behind the ?');
    assert.match(target.innerHTML, /Gemini Bypass \(Beta\)/);
    assert.match(target.innerHTML, /Adds an experimental layer that may improve the reliability of Gemini-based models including Gemini 3\.1 Pro, 3\.8 Flash and Gemma\./);
    assert.match(target.innerHTML, /data-narrative-action="toggle-gemini-bypass"/);
    assert.match(target.innerHTML, /data-narrative-action="toggle-analysis"/);
    assert.match(target.innerHTML, /Analysis · Recommended/);
    assert.match(target.innerHTML, /Recommended for most models/);
    assert.match(target.innerHTML, /No analysis/);
    assert.doesNotMatch(target.innerHTML, /wp-narrative-hard-indicator/);
    assert.doesNotMatch(target.innerHTML, /SPECIFIC INSTRUCTIONS/);
    assert.match(target.innerHTML, /data-narrative-action="school-year" disabled/);
    // the classic-menu button was removed: the PromptOS tabs are the whole interface now
    assert.doesNotMatch(target.innerHTML, /Open classic Storytelling Settings/);
    assert.doesNotMatch(target.innerHTML, /data-narrative-action="legacy-menu"/);
    assert.doesNotMatch(target.innerHTML, /TEMPORARY SCENE DIRECTION/);

    renderNarrativeSettingsScreen(target, { snapshot: { ...snapshot, hardMode: true }, tab: 'essentials' });
    assert.match(target.innerHTML, /class="wp-narrative-hard-indicator"[^>]*title="Hard Mode enabled"/);

    renderNarrativeSettingsScreen(target, { snapshot, tab: 'style' });
    assert.match(target.innerHTML, /data-narrative-action="set-global-narrator"/);
    renderNarrativeSettingsScreen(target, { snapshot, tab: 'perspective' });
    assert.match(target.innerHTML, /data-narrative-action="set-local-pov"[^>]*disabled/);
});

test('Gemini Bypass can still find box 6 in the real Beta body (cut markers have not drifted)', async () => {
    const { ravs } = await import('../../quick-reply-ext/src/promptRegistry.js');
    const body = ravs.get('Beta Prompt').body;
    const stripped = stripGeminiExplicitBox(body);
    assert.ok(GEMINI_BOX6_EXPLICIT.test(body), 'Beta body should contain "Long One [6/6]" ... "- Still on 6 here -"');
    assert.doesNotMatch(stripped, /VULGARITY IS AUTHENTICITY/);
    assert.doesNotMatch(stripped, /STILL cussing/);
    // The half of box 6 the model still needs survives the cut.
    assert.match(stripped, /Long One \[6\/6\]/);
    assert.match(stripped, /THREE PATHS/);
    assert.match(stripped, /END OF SCENE SHEET/);
});

test('Gemini Bypass prepends its hidden directive ahead of the canonical prompt', () => {
    const canonical = '[WEYLAND RESPONSE ANALYSIS PROCEDURE]';
    const modified = applyGeminiBypass(canonical, true);
    assert.ok(modified.startsWith(GEMINI_BYPASS_PROMPT));
    assert.ok(modified.indexOf(GEMINI_BYPASS_PROMPT) < modified.indexOf(canonical));
    assert.equal(applyGeminiBypass(canonical, false), canonical);
});

test('A dose of...: new replies use it up, rerolls never do, quiet generations are ignored', async () => {
    const { nextDoseState } = await import('../../quick-reply-ext/src/doseRules.js');
    // Three-reply dose: replies 1-3 are dosed, the 4th new reply ends it.
    let state = { used: 0, total: 3 };
    for (const expected of [1, 2, 3]) {
        const next = nextDoseState(state, 'normal');
        assert.deepEqual(next, { live: true, used: expected, ended: false });
        state = { ...state, used: next.used };
        // Rerolling the reply in front of you keeps it dosed and uses nothing.
        assert.deepEqual(nextDoseState(state, 'swipe'), { live: true, used: expected, ended: false });
        assert.deepEqual(nextDoseState(state, 'regenerate'), { live: true, used: expected, ended: false });
        assert.deepEqual(nextDoseState(state, 'continue'), { live: true, used: expected, ended: false });
    }
    assert.deepEqual(nextDoseState(state, 'normal'), { live: false, used: 3, ended: true });
    // Undefined type is a plain send.
    assert.equal(nextDoseState({ used: 0, total: 2 }, undefined).used, 1);
    // Rerolling right after starting a dose doses that reply, and it counts as the first.
    assert.deepEqual(nextDoseState({ used: 0, total: 4 }, 'swipe'), { live: true, used: 1, ended: false });
    assert.equal(nextDoseState({ used: 1, total: 4 }, 'quiet'), null);
    assert.equal(nextDoseState({ used: 1, total: 4 }, 'impersonate'), null);
});

test('A dose of...: lengths stay within 2-10 and lean short', async () => {
    const { rollDoseLength } = await import('../../quick-reply-ext/src/doseRules.js');
    assert.equal(rollDoseLength(() => 0), 2);
    assert.equal(rollDoseLength(() => 0.999999), 10);
    const counts = {};
    for (let i = 0; i < 1000; i++) {
        const length = rollDoseLength(() => i / 1000);
        assert.ok(length >= 2 && length <= 10, `${length} out of range`);
        counts[length] = (counts[length] ?? 0) + 1;
    }
    assert.ok(counts[3] > counts[9] && counts[4] > counts[10], 'short doses should be more common than long ones');
});

test('A dose of... card: arm, pick from dosable shifts, live banner never shows the count', () => {
    const target = { innerHTML: '' };
    const base = { hasChat: true, prompt: 'Beta Prompt', hardMode: false, shift: 'None', analysisEnabled: true, modes: {}, mental: {} };

    renderNarrativeSettingsScreen(target, { snapshot: base, tab: 'essentials' });
    assert.match(target.innerHTML, /data-narrative-action="arm-dose"/);
    assert.match(target.innerHTML, /data-narrative-action="set-shift"/);
    assert.doesNotMatch(target.innerHTML, /data-narrative-action="start-dose"/);

    // Not armed: the readout names and explains the regular shift.
    renderNarrativeSettingsScreen(target, { snapshot: { ...base, shift: 'Slow Burn' }, tab: 'essentials' });
    assert.match(target.innerHTML, /<span>Regular shift<\/span>[\s\S]*wp-narrative-readout-val" style="--wn-shift-color: #ffb45c">Slow Burn<[\s\S]*Trust and affection take a long time to earn/);
    assert.doesNotMatch(target.innerHTML, /wp-narrative-readout-whisper/, 'the range whisper is only for doses');

    // Armed: the grid doses instead of setting; every shift can be dosed except None (disabled).
    renderNarrativeSettingsScreen(target, { snapshot: base, tab: 'essentials', doseArmed: true });
    assert.match(target.innerHTML, /wp-narrative-shift-card[^"]*is-armed/);
    assert.match(target.innerHTML, /data-narrative-action="start-dose" data-value="Hard Mode"/);
    assert.match(target.innerHTML, /data-narrative-action="start-dose" data-value="Toxicity"/);
    assert.doesNotMatch(target.innerHTML, /data-narrative-action="start-dose" data-value="General-Use"/);
    assert.match(target.innerHTML, /data-narrative-action="start-dose" data-value="None"[^>]*disabled/);
    assert.doesNotMatch(target.innerHTML, /data-narrative-action="start-dose" data-value="Toxicity"[^>]*disabled/);
    assert.doesNotMatch(target.innerHTML, /data-narrative-action="set-shift"/);
    assert.match(target.innerHTML, /Pick your dose/);
    assert.match(target.innerHTML, /wp-narrative-readout-whisper">\(in 2-10 responses\)</);

    // No chat: the syringe can't arm.
    renderNarrativeSettingsScreen(target, { snapshot: { ...base, hasChat: false }, tab: 'essentials', doseArmed: true });
    assert.match(target.innerHTML, /Open a roleplay first/);
    assert.match(target.innerHTML, /data-narrative-action="arm-dose"[^>]*disabled/);
    assert.doesNotMatch(target.innerHTML, /data-narrative-action="start-dose"/);

    // Live dose: the readout says so, early way out, Current Setup shows it, nothing hints at how long is left.
    renderNarrativeSettingsScreen(target, { snapshot: { ...base, shift: 'Slow Burn', dose: { shift: 'Toxicity' } }, tab: 'essentials' });
    assert.match(target.innerHTML, /Dose · this chat[\s\S]*wp-narrative-readout-val" style="--wn-shift-color: #c27dff">Toxicity</);
    assert.match(target.innerHTML, /Wears off on its own\. You won’t know when\.[\s\S]*\(in 2-10 responses\)/);
    assert.match(target.innerHTML, /data-narrative-action="end-dose"/);
    assert.doesNotMatch(target.innerHTML, /data-narrative-action="arm-dose"/);
    assert.match(target.innerHTML, /Then back to Slow Burn/);
    assert.match(target.innerHTML, /<dt>Dose<\/dt><dd class="is-hot">Toxicity<\/dd>/);
    assert.doesNotMatch(target.innerHTML, /\b\d+ (more )?(replies|messages) (left|remaining)/i);

    renderNarrativeSettingsScreen(target, { snapshot: { ...base, prompt: 'Current Prompt', dose: { shift: 'Horror' } }, tab: 'essentials' });
    assert.doesNotMatch(target.innerHTML, /Doses only take effect on the Beta prompt/);
});

test('the dose snapshot only exists with a chat open', () => {
    const getGlobal = () => '';
    const getLocal = () => '';
    assert.deepEqual(readNarrativeSnapshot({ getGlobal, getLocal, hasChat: true, dose: { shift: 'Horror' } }).dose, { shift: 'Horror' });
    assert.equal(readNarrativeSnapshot({ getGlobal, getLocal, hasChat: false, dose: { shift: 'Horror' } }).dose, null);
    assert.equal(readNarrativeSnapshot({ getGlobal, getLocal, hasChat: true }).dose, null);
});

test('active scenario comes from greeting context, not a stale or cancelled year picker', () => {
    const path = fileURLToPath(new URL('../../../../../data/default-user/QuickReplies/Weyland.json', import.meta.url));
    const script = JSON.parse(readFileSync(path, 'utf8')).qrList.find(item => item.label === 'School Year').message;
    const locals = { Scenario: 'Summer wants to drop out of college.', Year: '' };
    const read = key => locals[key];
    assert.equal(currentScenarioLabel(read, 'Summer', script), 'Cheerleader Tryouts');
    locals.Year = 'Sophomore';
    assert.equal(currentScenarioLabel(read, 'Summer', script), 'Cheerleader Tryouts');
    locals.Scenario = 'Moonlight Festival';
    assert.equal(currentScenarioLabel(read, 'Summer', script), 'Moonlight Festival');
    locals.IntroCtxStash = JSON.stringify({ Scenario: locals.Scenario });
    locals.Scenario = '';
    assert.equal(currentScenarioLabel(read, 'Summer', script), 'Moonlight Festival');
    delete locals.IntroCtxStash;
    locals.Year = 'Scenario: Moonlight Festival';
    assert.equal(currentScenarioLabel(read, 'Summer', script), 'Original greeting');
    assert.equal(currentScenarioLabel(() => 'ONCE GAVEN IS GONE', 'Yue-Lin', script), 'The Breaking');
    const snapshot = readNarrativeSnapshot({ getGlobal: () => '', getLocal: key => key === 'Scenario' ? 'drop out of college' : '', hasChat: true, characterName: 'Summer', schoolYearScript: script });
    assert.equal(snapshot.scenario, 'Cheerleader Tryouts');
});

test('Beta course correction is unavailable for both regular selection and doses', () => {
    assert.ok(SHIFT_OPTIONS.find(item => item.id === 'Beta')?.disabled);
    assert.ok(!SHIFT_OPTIONS.some(item => item.id === 'General-Use'));
    assert.ok(!DOSE_OPTIONS.some(item => ['Beta', 'General-Use'].includes(item.id)));
    assert.equal(resolveShift('Beta', 'Off'), 'None');
    const target = { innerHTML: '' };
    for (const doseArmed of [false, true]) {
        renderNarrativeSettingsScreen(target, { snapshot: { hasChat: true, shift: 'None', modes: {}, mental: {} }, doseArmed });
        assert.match(target.innerHTML, /wp-narrative-shift-key" disabled aria-disabled="true"[^>]*title="Unavailable right now\."[^>]*>[\s\S]*?<strong>Beta<\/strong>/);
        assert.doesNotMatch(target.innerHTML, /data-value="(?:Beta|General-Use)"/);
    }
});
