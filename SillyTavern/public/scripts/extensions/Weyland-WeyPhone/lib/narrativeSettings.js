// lib/narrativeSettings.js
//
// WeyPhone's Narrative app is deliberately a control surface over Weyland Tavern's existing
// variables and Quick Replies. It does not own prompt prose. Whenever a setting needs a derived
// prompt block, the canonical text is extracted from Weyland.NarrativeSettings at click time or
// the existing rebuild Quick Reply is executed by index.js.

export const NARRATIVE_TABS = Object.freeze(['essentials', 'style', 'modes', 'perspective']);

export const NARRATOR_OPTIONS = Object.freeze([
    { id: 'Default', globalKey: 'Default', label: 'Default', description: 'Objective and balanced, without a narrator persona.' },
    { id: 'Lucky', globalKey: 'Lucky', label: 'Lucky', description: 'Gritty, witty, and balanced between warmth and angst.' },
    { id: 'Lauren', globalKey: 'Lauren', label: 'Lauren', description: 'Warm, romantic, hopeful, and openly sentimental.' },
    { id: 'Salem', globalKey: 'Salem', label: 'Salem', description: 'Dark, emotional, opinionated, and strong with horror or angst.' },
]);

export const PROMPT_OPTIONS = Object.freeze([
    { id: 'Current Prompt', label: 'Current', description: 'The default, most compatible prompt. Safe to leave this alone.' },
    { id: 'Beta Prompt', label: 'Beta', description: 'The most recent prompt. Still being tested, but recommended to use.' },
    { id: 'Old Prompt 2026', label: '2026', description: 'The prompt used before Weyland’s second anniversary.' },
    { id: 'Old Prompt 2025', label: '2025', description: 'The older Sonnet 3.7-era prompt.' },
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
]);

// Both are still early and behind their own "Experimental" card in the UI, separate from the
// established Onyx/Ruby/Opal modes above.
export const EXPERIMENTAL_MODE_VARIABLES = Object.freeze(['HTML!', 'ClothingTrack']);

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

export function readNarrativeSnapshot({ getGlobal, getLocal, hasChat = false }) {
    const localNarratorOverride = hasChat && String(getLocal('LocalN') ?? '').trim() !== '';
    const globalNarrator = narratorNameForPrompt(getGlobal('Narrator'), getGlobal);
    const localNarrator = localNarratorOverride
        ? narratorNameForPrompt(getLocal('LocalNarrator'), getGlobal)
        : globalNarrator;
    const language = String(getGlobal('LanguageChoice') || 'English').trim() || 'English';
    const prompt = String(getGlobal('PromptChoice') || getGlobal('MainPromptChoice') || 'Current Prompt').trim();
    const thinking = String(getGlobal('ThinkingFramework') || 'Disabled').trim();
    const localPovLabel = hasChat ? String(getLocal('RPPOVLocalSet') ?? '').trim() : '';

    return {
        hasChat,
        prompt,
        hardMode: on(getGlobal('HardToggle')),
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
