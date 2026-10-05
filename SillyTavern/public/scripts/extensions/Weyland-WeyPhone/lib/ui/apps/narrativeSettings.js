// lib/ui/apps/narrativeSettings.js
//
// PromptOS's product shell — a control-deck read on Storytelling Settings: a masthead, an icon
// tab bar, and a few bespoke controls (the Roleplay Shift picker, the message mode strip) sitting
// on top of plain-language cards, each carrying enough explanation that a user who has never opened
// Storytelling Settings before can still make an informed choice. Each data-narrative-* hook below
// maps to a branch of handleNarrativeAction in index.js (Roleplay Shift added "set-shift") — this
// file only owns presentation, exactly like lib/narrativeSettings.js only owns data shape.
import { DOSE_OPTIONS, EXPERIMENTAL_MODE_VARIABLES, FOCUS_OPTIONS, INTRO_CONSTANT_MODE_OPTIONS, INTRO_MODE_OPTIONS, MENTAL_TOGGLES, MODE_TOGGLES, NARRATIVE_TABS, NARRATOR_OPTIONS, POV_OPTIONS, PROMPT_OPTIONS, SHIFT_OPTIONS } from '../../narrativeSettings.js';
import { ASSET_BASE_URL } from '../../assetPaths.js';
import { narratorPickerHtml, playNarratorMotion } from './narratorPicker.js';
import { narratorStrengthHtml } from './narratorStrength.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function selectedClass(active) {
    return active ? ' wp-narrative-selected' : '';
}

/** A "?" disclosure with the fuller explanation, collapsed by default. Deliberately a sibling of
 * any nearby toggle/choice button rather than nested inside one — buttons can't contain other
 * interactive controls, and nesting it would make opening the tooltip also fire the toggle. */
function infoDisclosure(text, label) {
    if (!text) return '';
    return `<details class="wp-narrative-info"><summary aria-label="More about ${escapeHtml(label)}"><i class="fa-solid fa-circle-info"></i></summary><p>${escapeHtml(text)}</p></details>`;
}

function choiceButtons(items, active, action, valueKey = 'id', disabled = false, rowClass = '') {
    return `<div class="wp-narrative-choice-grid${rowClass ? ` ${rowClass}` : ''}">${items.map(item => `
        <button type="button" class="wp-narrative-choice${selectedClass(active === item[valueKey])}" data-narrative-action="${escapeHtml(action)}" data-value="${escapeHtml(item[valueKey])}" ${disabled ? 'disabled' : ''}>
            <span class="wp-narrative-choice-dot" aria-hidden="true"></span>
            <strong>${escapeHtml(item.label ?? item.short)}</strong>
            <small>${escapeHtml(item.description)}</small>
        </button>`).join('')}</div>`;
}

/** Mental health directives: a toggle row plus an independent info disclosure, since the two need
 * to be clickable without either one triggering the other. */
function toggleRows(items, values, scope) {
    return `<div class="wp-narrative-toggle-list">${items.map(item => {
        const active = Boolean(values[item.variable]);
        return `
        <div class="wp-narrative-toggle-row">
            <button type="button" class="wp-narrative-toggle-main" data-narrative-action="toggle-${escapeHtml(scope)}" data-variable="${escapeHtml(item.variable)}" aria-pressed="${active}">
            <span><strong>${escapeHtml(item.label)}</strong></span>
                <span class="wp-narrative-switch${active ? ' is-on' : ''}"><i></i></span>
            </button>
            ${infoDisclosure(item.tooltip, item.label)}
        </div>`;
    }).join('')}</div>`;
}

// Section metadata for the tab bar lives here, not in lib/narrativeSettings.js — it's
// presentation, not the underlying variable/Quick Reply contract that file exists to protect.
const TAB_META = {
    essentials: { label: 'Home', icon: 'fa-gauge-high' },
    style: { label: 'Narrator', icon: 'fa-feather-pointed' },
    modes: { label: 'Modes', icon: 'fa-sliders' },
    perspective: { label: 'POV', icon: 'fa-eye' },
};

/** A terminal/control-panel wordmark rather than a badge-and-name lockup — "OS" gets its own
 * accent color as a boot-readout accent, not decoration for its own sake, and the mark anchors
 * the right edge at a size that reads as the header's focal point instead of a small corner icon. */
function narrativeMasthead(snapshot) {
    const promptLabel = PROMPT_OPTIONS.find(option => option.id === snapshot.prompt)?.label ?? snapshot.prompt;
    return `
    <div class="wp-narrative-masthead">
        <div class="wp-narrative-brand">
            <span class="wp-narrative-brand-eyebrow">Storytelling Settings</span>
            <h1 class="wp-narrative-wordmark">Prompt<span>OS</span></h1>
        </div>
        <div class="wp-narrative-masthead-actions">
            ${snapshot.hardMode ? '<span class="wp-narrative-hard-indicator" title="Hard Mode enabled" aria-label="Hard Mode enabled"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></span>' : ''}
            <span class="wp-narrative-readout" title="Active system prompt"><small>Prompt</small><strong>${escapeHtml(promptLabel)}</strong></span>
            <button type="button" class="wp-inline-help" data-app-key="narrative" title="What is this?" aria-label="What is this?"><i class="fa-solid fa-circle-question"></i></button>
        </div>
        <img class="wp-narrative-mark" src="${ASSET_BASE_URL}/weyphone_promptos_control-core.webp" alt="" />
    </div>`;
}

function narrativeNav(active) {
    return `
    <nav class="wp-narrative-tabs" role="tablist" aria-label="PromptOS settings sections">
        ${NARRATIVE_TABS.map(key => `<button type="button" class="wp-narrative-tab${key === active ? ' wp-active' : ''}" data-narrative-tab="${key}" role="tab" aria-selected="${key === active}"><i class="fa-solid ${TAB_META[key].icon}"></i><span>${TAB_META[key].label}</span></button>`).join('')}
    </nav>`;
}

/** Course correction (Roleplay Shift). Layout from the PromptOS UI lab ("08"): "A dose of..." top
 * right, a dot-matrix readout that names and explains whatever is in effect, then None/Custom above
 * the rest of the shifts. The keys reuse the original choice-button look (name only, the readout
 * does the explaining). Hard Mode still keeps its own caution note, since it's the one choice meant
 * for 1-2 messages only.
 *
 * Doses (quick-reply-ext/src/dose.js): the syringe arms the grid so the next shift tapped is dosed
 * into this chat for a secret 2-10 replies instead of being set. A live dose takes over the readout
 * with an early way out, and deliberately never says how long it has left: the player not being in
 * control of when it ends is the whole feature. */
function roleplayShiftCard(snapshot) {
    const active = snapshot.shift && snapshot.shift !== 'None';
    const isHard = snapshot.shift === 'Hard Mode';
    const dose = snapshot.dose;
    const armed = Boolean(snapshot.doseArmed && snapshot.hasChat && !dose);
    const selected = SHIFT_OPTIONS.find(option => option.id === (snapshot.shift || 'None')) || SHIFT_OPTIONS[0];
    const regularName = selected.id === 'Custom Preset' && snapshot.customPreset ? `Custom: ${snapshot.customPreset.name}` : selected.label;
    // `whisper` is the small centred line under a dose's description (Lucky's ask: say the range,
    // never the actual count).
    const readout = dose
        ? { label: 'Dose · this chat', status: 'In your system', value: dose.shift === 'Custom Preset' && snapshot.customPreset ? `Custom: ${snapshot.customPreset.name}` : dose.shift, color: SHIFT_COLORS[dose.shift], say: 'Wears off on its own. You won’t know when.', whisper: '(in 2-10 responses)' }
        : armed
            ? { label: 'Pick your dose', status: 'Armed', value: 'A dose of...', say: 'Your next pick takes over for a little while, then wears off. You won’t know when.', whisper: '(in 2-10 responses)' }
            : { label: 'Regular shift', status: 'Until changed', value: regularName, color: SHIFT_COLORS[selected.id], say: selected.description };
    return `
    <section class="wp-narrative-card wp-narrative-hard-card wp-narrative-shift-card${active || dose ? ' is-on' : ''}${armed ? ' is-armed' : ''}">
        <div class="wp-narrative-cc-head">
            <div class="wp-narrative-cc-titles">
                <h3><span class="wp-narrative-led${active || dose ? '' : ' is-off'}" aria-hidden="true"></span>Course correction<span class="wp-narrative-slash">/</span><button type="button" class="wp-narrative-cc-help" data-narrative-help="course-correction" title="What is Course Correction?" aria-label="What is Course Correction?"><i class="fa-solid fa-circle-question"></i></button></h3>
                <p>A nudge in the direction your story needs.</p>
            </div>
            ${doseControl(snapshot, dose, armed, regularName)}
        </div>
        <div class="wp-narrative-matrix wp-narrative-shift-readout" aria-live="polite">
            <div class="wp-narrative-lcd">
                <div class="wp-narrative-lcd-meta"><span>${escapeHtml(readout.label)}</span><b>&#9679; ${escapeHtml(readout.status)}</b></div>
                <div class="wp-narrative-readout-val"${readout.color ? ` style="--wn-shift-color: ${readout.color}"` : ''}>${escapeHtml(readout.value)}</div>
                <div class="wp-narrative-readout-say">${escapeHtml(readout.say)}</div>
                ${readout.whisper ? `<div class="wp-narrative-readout-whisper">${escapeHtml(readout.whisper)}</div>` : ''}
            </div>
        </div>
        <div class="wp-narrative-shift-keys">
            <div class="wp-narrative-shift-row wp-narrative-shift-topbar">${SHIFT_OPTIONS.filter(option => ['None', 'Custom Preset'].includes(option.id)).map(option => shiftKey(option, snapshot, armed)).join('')}</div>
            <div class="wp-narrative-shift-row">${SHIFT_OPTIONS.filter(option => !['None', 'Custom Preset'].includes(option.id)).map(option => shiftKey(option, snapshot, armed)).join('')}</div>
        </div>
        ${!armed && !dose && isHard ? '<div class="wp-narrative-warning"><i class="fa-solid fa-triangle-exclamation"></i> Hard Mode is meant for 1-2 messages. Left on, it pushes every scene harsher and can make characters unrealistically and permanently negative.</div>' : ''}
        ${snapshot.shift === 'General-Use' && !snapshot.analysisEnabled ? '<div class="wp-narrative-warning"><i class="fa-solid fa-triangle-exclamation"></i> General-Use only works with Analysis on. Right now nothing is being sent.</div>' : ''}
    </section>`;
}

/** Behind Course correction's "?" (opened in the phone's notice dialog by index.js, keyed by
 * data-narrative-help). Lucky's explanation, lightly cleaned up; ***x*** renders bold italic. */
export const NARRATIVE_HELP = {
    'course-correction': {
        kicker: 'PromptOS',
        title: 'Course Correction',
        paragraphs: [
            'Course Correction allows you to add modifiers to your response that strongly encourage specific behaviors.',
            'Promptside, when you select one of these options, the bot is handed a fake "feedback" section from you.',
            'This feedback section tells the bot that it hasn\'t been following directions and that you need it to behave in a very specific way.',
            'Each modifier has a casual-speech feedback section, an outlined section with specific ways to change its behavior, and a handful of example outputs, all of which were carefully handwritten by Lucky.',
            'Be aware that some modifiers may have unexpected or poor results with some characters. Adding a Horror modifier to a warm scene of you cuddling Ava could do nothing, could make the story suddenly take a drastic turn, or could degrade output by confusing the bot.',
            'You may also select "A dose of..." a modifier. If you do so, the bot will receive the modifier for 2-10 messages (***not counting rerolls***). This can make scenes more organic, as you aren\'t able to choose when to calm things down.',
        ],
    },
};

// Each shift's own colour on the Course correction screen (presentation only; the ids are the
// RoleplayShift values). Picked to read clearly on the dark dot-matrix screen and to stay apart from
// each other: Toxicity purple, Intimacy pink, Initiative green, and so on.
const SHIFT_COLORS = {
    None: '#bba79c',
    'General-Use': '#f3dfc6',
    'Hard Mode': '#ff4d4d',
    'Self-Destruction': '#ff8040',
    'Slow Burn': '#ffb45c',
    Initiative: '#6fe08a',
    Horror: '#a9c8ff',
    Toxicity: '#c27dff',
    Intimacy: '#ff7ac6',
    'Flawed Communication': '#ffe066',
    Intoxication: '#5fd6e8',
    'Custom Preset': '#e3b3ff',
};

/** One shift key: the original choice button, compact. Armed, it doses instead of setting, and the
 * choices that can't be dosed (None) are disabled. The full description is the button's tooltip. */
function shiftKey(option, snapshot, armed) {
    const selected = !armed && (snapshot.shift || 'None') === option.id;
    const canDose = DOSE_OPTIONS.some(item => item.id === option.id);
    return `
                <button type="button" class="wp-narrative-choice wp-narrative-shift-key${selectedClass(selected)}" data-narrative-action="${armed ? 'start-dose' : 'set-shift'}" data-value="${escapeHtml(option.id)}" aria-pressed="${selected}" title="${escapeHtml(option.description)}" ${armed && !canDose ? 'disabled' : ''}>
                    <span class="wp-narrative-choice-dot" aria-hidden="true"></span><strong>${escapeHtml(option.id === 'Custom Preset' ? 'Custom' : option.label)}</strong>
                </button>`;
}

/** Top-right of Course correction: "A dose of..." (arms the grid), or "End it now" while a dose is in. */
function doseControl(snapshot, dose, armed, regularName) {
    if (dose) {
        return `
            <div class="wp-narrative-dose">
                <button type="button" class="wp-narrative-dose-btn is-live" data-narrative-action="end-dose"><i class="fa-solid fa-syringe" aria-hidden="true"></i> End it now</button>
                <small>Then back to ${escapeHtml(regularName)}</small>
            </div>`;
    }
    const hint = !snapshot.hasChat ? 'Open a roleplay first' : armed ? 'Tap again to cancel' : 'Wears off on its own';
    return `
            <div class="wp-narrative-dose">
                <button type="button" class="wp-narrative-dose-btn${armed ? ' is-armed' : ''}" data-narrative-action="arm-dose" aria-pressed="${armed}" ${snapshot.hasChat ? '' : 'disabled'}><i class="fa-solid fa-syringe" aria-hidden="true"></i> A dose of...</button>
                <small>${hint}</small>
            </div>`;
}

/** The line under a locked control while a built-in-prompt card's chat is open (see builtInPrompt
 * in lib/narrativeSettings.js). Empty otherwise. */
function builtInPromptNote(snapshot, text) {
    if (!snapshot.builtInPrompt) return '';
    return `<div class="wp-narrative-note wp-narrative-builtin-note"><i class="fa-solid fa-lock"></i><span>${escapeHtml(snapshot.builtInPrompt)} ${escapeHtml(text)}</span></div>`;
}

/** Analysis keeps the model-specific tradeoff visible while clearly identifying the enabled state
 * as the recommended default for most models. While a built-in-prompt card is open the switch is
 * locked: those cards always fill out their own scene sheet. */
function analysisCard(snapshot) {
    if (snapshot.builtInPrompt) return analysisCardLocked(snapshot);
    const on = snapshot.analysisEnabled;
    return `
    <section class="wp-narrative-card wp-narrative-analysis-card${on ? ' is-on' : ''}">
        <div class="wp-narrative-card-heading"><div><span>Pre-response reasoning</span><h3>Analysis <em class="wp-narrative-recommended wp-narrative-analysis-recommended">Recommended</em></h3></div><i class="fa-solid fa-magnifying-glass"></i></div>
        <p>Before writing, the model can work through scene state, character truth, and footer codes in a hidden reasoning block. Turning it off skips straight to the response.</p>
        <div class="wp-narrative-compare">
            <div class="wp-narrative-compare-col${on ? ' wp-narrative-compare-active' : ''}">
                <strong>Analysis · Recommended</strong>
                <ul class="wp-narrative-bullets">
                    <li>Better memory</li>
                    <li>Better output, generally</li>
                    <li>Sonnet sees the biggest boost</li>
                    <li>Longer response time (~20s more)</li>
                </ul>
            </div>
            <div class="wp-narrative-compare-col${on ? '' : ' wp-narrative-compare-active'}">
                <strong>No analysis</strong>
                <ul class="wp-narrative-bullets">
                    <li>Potentially more creative (untested)</li>
                    <li>Worse memory / contextual understanding</li>
                    <li>Gemma and 3.8 Flash see an output boost</li>
                    <li>Faster response time (~20s saved)</li>
                </ul>
            </div>
        </div>
        <button type="button" class="wp-narrative-gemini-toggle" data-narrative-action="toggle-analysis" aria-pressed="${on}">
            <span><strong>${on ? 'Enabled' : 'Disabled'}</strong><small>Recommended for most models</small></span>
            <span class="wp-narrative-switch${on ? ' is-on' : ''}" aria-hidden="true"><i></i></span>
        </button>
        ${snapshot.shift && !['None', 'General-Use'].includes(snapshot.shift) ? '<div class="wp-narrative-note"><i class="fa-solid fa-circle-info"></i> Your Roleplay Shift stays in effect either way. With the analysis off, it is sent on its own ahead of the system prompt.</div>' : ''}
    </section>`;
}

/** The Analysis card in a Kinsbane / Mirror / Muse chat: no comparison table (it doesn't apply),
 * the switch drawn always-on and disabled, and the reason underneath. */
function analysisCardLocked(snapshot) {
    return `
    <section class="wp-narrative-card wp-narrative-analysis-card is-on is-locked">
        <div class="wp-narrative-card-heading"><div><span>Pre-response reasoning</span><h3>Analysis</h3></div><i class="fa-solid fa-magnifying-glass"></i></div>
        <button type="button" class="wp-narrative-gemini-toggle" disabled aria-disabled="true" aria-pressed="true">
            <span><strong>Always on</strong><small>Built into this character</small></span>
            <span class="wp-narrative-switch is-on" aria-hidden="true"><i></i></span>
        </button>
        ${builtInPromptNote(snapshot, 'always fills out its own scene sheet before writing. This setting applies to your other chats.')}
    </section>`;
}

/** The READ ME button at the bottom opens lib/ui/apps/geminiFilterGuide.js, the explainer for
 * Google's word filter (it's also where the chat's Gemini-block note sends players, so keep its
 * label in sync with lib/ui/geminiBlockNotice.js). It uses data-narrative-guide rather than
 * data-narrative-action because opening a static page doesn't need handleNarrativeAction's busy
 * spinner or "settings updated" toast. */
function geminiBypassCard(snapshot) {
    const on = snapshot.geminiBypass;
    return `
    <section class="wp-narrative-card wp-narrative-gemini-card${on ? ' is-on' : ''}">
        <div class="wp-narrative-card-heading"><div><h3>Gemini Bypass (Beta)</h3></div><i class="fa-solid fa-bolt"></i></div>
        <p>Adds an experimental layer that may improve the reliability of Gemini-based models including Gemini 3.1 Pro, 3.8 Flash and Gemma. On the Beta prompt it also removes the explicit warm-up section that Gemini refuses to work with.</p>
        <button type="button" class="wp-narrative-gemini-toggle" data-narrative-action="toggle-gemini-bypass" aria-pressed="${on}">
            <span><strong>${on ? 'Enabled' : 'Disabled'}</strong><small>Gemini reasoning-loop safeguard</small></span>
            <span class="wp-narrative-switch${on ? ' is-on' : ''}" aria-hidden="true"><i></i></span>
        </button>
        <div class="wp-narrative-note wp-narrative-gemini-note"><i class="fa-solid fa-circle-info"></i><span>Getting "The prompt could not be submitted"? This toggle can't fix that one. The guide below explains what can.</span></div>
        <button type="button" class="wp-narrative-readme" data-narrative-guide="open"><i class="fa-solid fa-book-open" aria-hidden="true"></i> READ ME - Gemini Filter Guide</button>
    </section>`;
}

// Cartridge labels for the System Prompt Selection bay (8-bit font, so short).
const PROMPT_CART_LABELS = { 'Current Prompt': 'CURRENT', 'Beta Prompt': 'BETA', 'Old Prompt 2026': '2026', 'Old Prompt 2025': '2025', 'Mini Prompt': 'MINI' };

/** "Current Setup:" on a dot-matrix screen (it replaced the "Current roleplay recipe" box). Same
 * readings as before; chat-only overrides and an active shift light up. */
function currentSetupScreen(snapshot) {
    const promptLabel = PROMPT_OPTIONS.find(option => option.id === snapshot.prompt)?.label ?? snapshot.prompt;
    // While a dose is in, the row itself reads "Dose" (the cell is too narrow for "Dose: Toxicity").
    const shiftRow = snapshot.dose ? ['Dose', snapshot.dose.shift, true] : ['Shift', snapshot.shift || 'None', Boolean(snapshot.shift && snapshot.shift !== 'None')];
    // A built-in-prompt card ignores the prompt choice, the narrator and the Analysis toggle, so the
    // screen says so instead of listing settings that aren't in this chat's prompt.
    const builtIn = Boolean(snapshot.builtInPrompt);
    const rows = [
        ['Prompt', builtIn ? 'Built-in' : promptLabel, builtIn],
        ['Narrator', builtIn ? 'Built-in' : snapshot.localNarrator, !builtIn && snapshot.localNarratorOverride],
        ['Analysis', builtIn ? 'Built-in' : (snapshot.analysisEnabled ? 'On' : 'Off'), false],
        shiftRow,
        ['POV', snapshot.localPovOverride ? 'Chat override' : snapshot.povType, snapshot.localPovOverride],
        ['Language', snapshot.language, false],
    ];
    return `
    <section class="wp-narrative-matrix wp-narrative-setup">
        <div class="wp-narrative-lcd">
            <div class="wp-narrative-lcd-meta"><span>Current Setup:</span><b>&#9679; Live</b></div>
            <dl class="wp-narrative-setup-grid">${rows.map(([label, value, hot]) => `<div><dt>${label}</dt><dd${hot ? ' class="is-hot"' : ''}>${escapeHtml(value)}</dd></div>`).join('')}</dl>
        </div>
        <div class="wp-narrative-matrix-caption"><span class="wp-narrative-led" aria-hidden="true"></span>Dot matrix · storytelling system</div>
    </section>`;
}

/** "System Prompt Selection:" as one cartridge bay. The old explanation of what a system prompt is
 * sits behind the ? (top right); each cart's own description is its tooltip. */
function systemPromptBay(snapshot) {
    return `
    <section class="wp-narrative-prompt-bay">
        <div class="wp-narrative-bay-head">
            <h3>System Prompt Selection:</h3>
            <details class="wp-narrative-bay-help"><summary title="What is a system prompt?" aria-label="What is a system prompt?"><i class="fa-solid fa-circle-question"></i></summary>
                <p>A system prompt is the foundational instruction set the model reads before anything else in a roleplay. It's what defines how characters think, speak, and behave underneath whatever scene you're actually in.</p></details>
        </div>
        <div class="wp-narrative-carts" role="group" aria-label="System prompt">${PROMPT_OPTIONS.map(option => {
            const inserted = option.id === snapshot.prompt;
            // Kinsbane Manor / Mirror Weyland / Muse run their own built-in prompt: every cart is drawn
            // greyed out with no action, like a held slot, so nothing here looks like it changes this chat.
            if (snapshot.builtInPrompt && !option.disabled) return `
            <button type="button" class="wp-narrative-cart is-held is-locked" disabled aria-disabled="true" title="${escapeHtml(option.description)}">
                <span class="wp-narrative-cart-body"><span class="wp-narrative-cart-label">${escapeHtml(PROMPT_CART_LABELS[option.id] ?? option.label)}</span><span class="wp-narrative-cart-grip" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="wp-narrative-cart-pins" aria-hidden="true"></span></span>
                <small>&#9679; LOCKED</small>
            </button>`;
            // A held slot (no beta right now) is drawn but greyed out and carries no action, so it cannot be inserted.
            if (option.disabled) return `
            <button type="button" class="wp-narrative-cart is-held" disabled aria-disabled="true" title="${escapeHtml(option.description)}">
                <span class="wp-narrative-cart-body"><span class="wp-narrative-cart-label">${escapeHtml(PROMPT_CART_LABELS[option.id] ?? option.label)}</span><span class="wp-narrative-cart-grip" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="wp-narrative-cart-pins" aria-hidden="true"></span></span>
                <small>&#9679; EMPTY SLOT</small>
            </button>`;
            return `
            <button type="button" class="wp-narrative-cart${inserted ? ' is-in' : ''}" data-narrative-action="set-prompt" data-value="${escapeHtml(option.id)}" aria-pressed="${inserted}" title="${escapeHtml(option.description)}">
                <span class="wp-narrative-cart-body"><span class="wp-narrative-cart-label">${escapeHtml(PROMPT_CART_LABELS[option.id] ?? option.label)}</span><span class="wp-narrative-cart-grip" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="wp-narrative-cart-pins" aria-hidden="true"></span></span>
                <small>&#9650; INSERTED</small>
            </button>`;
        }).join('')}
        </div>
        <div class="wp-narrative-bay-foot"><span>${PROMPT_OPTIONS.filter(option => !option.disabled).length} Promptcarts&trade; detected</span></div>
        ${builtInPromptNote(snapshot, 'runs its own built-in system prompt. Prompt choice applies to your other chats.')}
    </section>`;
}

function essentials(snapshot) {
    return `
    ${currentSetupScreen(snapshot)}
    ${systemPromptBay(snapshot)}
    ${analysisCard(snapshot)}
    ${geminiBypassCard(snapshot)}
    ${roleplayShiftCard(snapshot)}
    <section class="wp-narrative-card">
        <div class="wp-narrative-card-heading"><div><span>Character setup</span><h3>Change School Year or Scenario</h3></div><i class="fa-solid fa-graduation-cap"></i></div>
        <p>Allows you to set the internal year forward and jump to other roleplay greetings, along with their embedded context entries.</p>
        <button type="button" class="wp-narrative-primary" data-narrative-action="school-year" ${snapshot.hasChat ? '' : 'disabled'}>Choose year or scenario <i class="fa-solid fa-chevron-right"></i></button>
    </section>
    ${introContextCard(snapshot)}`;
}

/** Sits under "Change School Year or Scenario": that card picks which intro you start with, this one
 * decides whether that intro's starting situation stays in context. Variant groups (Loona's drunk
 * start, Willow's eyes) carry their value as "group|option" since choiceButtons has one data-value. */
function introContextCard(snapshot) {
    const intro = snapshot.intro;
    const heading = '<div class="wp-narrative-card-heading"><div><h3>Roleplay Intro Context</h3><span class="wp-narrative-intro-scope">This chat only</span></div><i class="fa-solid fa-clapperboard"></i></div>';
    if (!snapshot.hasChat || !intro?.available) {
        return `
    <section class="wp-narrative-card wp-narrative-intro-card">
        ${heading}
        <p>${escapeHtml(intro?.reason || 'Open a roleplay to change its intro context.')}</p>
    </section>`;
    }
    const context = intro.context;
    const contextOptions = context?.fades ? INTRO_MODE_OPTIONS : INTRO_CONSTANT_MODE_OPTIONS;
    const contextActive = context && !context.fades && context.mode === 'on' ? 'auto' : context?.mode;
    return `
    <section class="wp-narrative-card wp-narrative-intro-card">
        ${heading}
        <p>Roleplay greetings usually carry a context entry that explains to the character what’s going on and how to proceed in its new situation.</p>
        <p>By default, these usually fall off after a number of messages, but you can manually enable or disable them here if your roleplay takes a different direction.</p>
        ${context ? choiceButtons(contextOptions, contextActive, 'set-intro-context', 'id', false, 'wp-narrative-choice-row') : ''}
        ${(intro.variants ?? []).map(group => `
        <div class="wp-narrative-intro-group">
            <strong class="wp-narrative-intro-group-label">${escapeHtml(group.label)}</strong>
            ${choiceButtons(group.options.map(option => ({ ...option, id: `${group.id}|${option.id}`, description: option.description ?? '' })), `${group.id}|${group.current}`, 'set-intro-variant')}
        </div>`).join('')}
    </section>`;
}

// Shown behind the picker's ? chip, one paragraph per entry (a \n is a line break; the last entry is the punchline).
const NARRATOR_BLURB = [
    'Narrators give the bot a specific voice and artistic belief to reach for throughout your roleplay. They influence how scenes are described as well as what directions they go in.',
    'Choosing a warm narrator doesn’t prevent you from experiencing rough emotional scenes…\n…nor does a harsh narrator prevent you from experiencing soft, tender moments.',
    'They are all balanced, so try each out.',
];

function style(snapshot) {
    return `
    ${narratorPickerHtml({ options: NARRATOR_OPTIONS, selected: snapshot.globalNarrator, from: snapshot.narratorFrom, busy: snapshot.narratorBusy, blurb: NARRATOR_BLURB })}
    ${narratorStrengthHtml({ strength: snapshot.narratorStrength, disabled: Boolean(snapshot.builtInPrompt) })}`;
}

/** Onyx/Ruby/Opal/HTML/Clothing each get a colored channel tab so the row reads as a distinct
 * instruction rather than one more line in an undifferentiated list — the color has no meaning
 * of its own, it just makes several otherwise-identical rows visually distinguishable at a glance. */
const MODE_ACCENTS = {
    OnyxToggle: '#8b7bb8',
    RubyToggle: '#c2445b',
    OpalToggle: '#57b8a0',
    'HTML!': '#8a8a8a',
    ClothingTrack: '#d9a441',
};

/** Each row is a container with an independent toggle button and info disclosure as siblings,
 * not one nested inside the other — see infoDisclosure's note on why. */
function modeStrip(items, values) {
    return `<div class="wp-narrative-strip-list">${items.map(item => {
        const active = Boolean(values[item.variable]);
        const color = MODE_ACCENTS[item.variable] ?? '#c58a52';
        return `
        <div class="wp-narrative-strip${active ? ' is-on' : ''}" style="--wp-narrative-strip-color:${color}">
            <span class="wp-narrative-strip-tab" aria-hidden="true"></span>
            <button type="button" class="wp-narrative-strip-main" data-narrative-action="toggle-mode" data-variable="${escapeHtml(item.variable)}" aria-pressed="${active}">
                <span class="wp-narrative-strip-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.description)}</small></span>
                <span class="wp-narrative-switch${active ? ' is-on' : ''}"><i></i></span>
            </button>
            ${infoDisclosure(item.tooltip, item.label)}
        </div>`;
    }).join('')}</div>`;
}

function modes(snapshot) {
    const mainModes = MODE_TOGGLES.filter(item => !EXPERIMENTAL_MODE_VARIABLES.includes(item.variable));
    const experimentalModes = MODE_TOGGLES.filter(item => EXPERIMENTAL_MODE_VARIABLES.includes(item.variable));
    return `
    <section class="wp-narrative-card">
        <div class="wp-narrative-card-heading"><div><h3>Message Modes</h3></div><i class="fa-solid fa-sliders"></i></div>
        <p>These tell the model how to handle intimacy and trauma when a scene calls for it — tap <i class="fa-solid fa-circle-info"></i> on any of them for the full explanation. Sapphire remains automatic and has no instruction payload to disable.</p>
        ${modeStrip(mainModes, snapshot.modes)}
    </section>
    <section class="wp-narrative-card wp-narrative-experimental-card">
        <div class="wp-narrative-card-heading"><div><h3>Experimental Settings</h3></div><i class="fa-solid fa-flask"></i></div>
        <p>Newer additions that haven't had as much time in the oven — expect rougher edges than the modes above.</p>
        ${modeStrip(experimentalModes, snapshot.modes)}
    </section>
    <section class="wp-narrative-card">
        <div class="wp-narrative-card-heading"><div><h3>Mental Health Directives</h3></div><i class="fa-solid fa-heart-pulse"></i></div>
        <p>Mental health directives are optional modifiers that give additional instructions to the AI on how to approach specific scenes and scenarios.</p>
        <p>These modifiers may improve output, but may also degrade short term memory.</p>
        <p>We are experimenting with moving on without them. If you notice genuine and observable changes from enabling them, please let us know in Discord feedback.</p>
        <p>Tap <i class="fa-solid fa-circle-info"></i> on any of them for a brief summary of what they do.</p>
        ${toggleRows(MENTAL_TOGGLES, snapshot.mental, 'mental')}
    </section>
    <section class="wp-narrative-card">
        <div class="wp-narrative-card-heading"><div><h3>Command and OOC Visibility</h3></div><button type="button" class="wp-narrative-switch${snapshot.commandsHidden ? ' is-on' : ''}" data-narrative-action="toggle-command-visibility" aria-pressed="${snapshot.commandsHidden}"><i></i></button></div>
        <p>${snapshot.commandsHidden ? 'Hidden: technical command and OOC messages stay out of sight.' : 'Visible: command and OOC messages appear in the chat.'}</p>
    </section>
    <section class="wp-narrative-card">
        <div class="wp-narrative-card-heading wp-narrative-language-heading"><div><h3>Roleplay Language</h3><span class="wp-narrative-language-caption">Auto-Translation</span></div><i class="fa-solid fa-language"></i></div>
        <p>Characters remain unaware of the translation. English clears the extra language modifier.</p>
        <div class="wp-narrative-language-row"><input id="wp-narrative-language" type="text" value="${escapeHtml(snapshot.language)}" placeholder="English" /><button type="button" data-narrative-action="save-language">Apply</button></div>
        ${snapshot.language && snapshot.language.trim().toLowerCase() !== 'english' ? '<button type="button" class="wp-narrative-secondary" data-narrative-action="reset-language">Reset to English</button>' : ''}
    </section>`;
}

function perspective(snapshot) {
    return `
    <section class="wp-narrative-card">
        <div class="wp-narrative-card-heading"><div><span>Global default</span><h3>Point of view</h3></div><i class="fa-solid fa-eye"></i></div>
        ${choiceButtons(POV_OPTIONS, snapshot.povType, 'set-global-pov', 'type')}
    </section>
    <section class="wp-narrative-card">
        <div class="wp-narrative-card-heading"><div><span>Current chat only</span><h3>POV override</h3></div>${snapshot.localPovOverride ? '<span class="wp-narrative-local-badge">ACTIVE</span>' : ''}</div>
        <p>Override this roleplay without changing the default used by new chats.</p>
        ${choiceButtons(POV_OPTIONS, snapshot.localPovLabel, 'set-local-pov', 'id', !snapshot.hasChat)}
        <button type="button" class="wp-narrative-secondary" data-narrative-action="reset-local-pov" ${snapshot.hasChat && snapshot.localPovOverride ? '' : 'disabled'}>Use global POV</button>
    </section>
    <section class="wp-narrative-card">
        <div class="wp-narrative-card-heading"><div><span>When paths separate</span><h3>Narrative Focus</h3></div><i class="fa-solid fa-arrows-split-up-and-left"></i></div>
        ${choiceButtons(FOCUS_OPTIONS, snapshot.focus, 'set-focus', 'id', false, 'wp-narrative-focus-grid')}
    </section>`;
}

// ---- In-place redraw helpers -----------------------------------------------------------------------
// Every action redraws this whole screen with innerHTML (index.js), and two things about that were felt:
//  1. The app's screen entrance (style.css: #wp-screen-body > * { animation: wp-screen-in }) replays on every
//     redraw, so each tap dipped the screen to 40% opacity and slid it in from the right. That is a
//     navigation effect. A redraw over a PromptOS screen that is already showing is marked
//     wp-narrative-still to skip it; arriving from another screen still gets the entrance.
//  2. Cards change height (the Course Correction readout grows with a longer description). The redraw
//     destroys the browser's own scroll anchor, so everything below jumped, including the control just
//     tapped. Re-anchor by hand: remember where the tapped control's CONTAINER (or, failing that, the topmost
//     visible control's) sat on screen, and scroll by however far it moved. The container, never the control
//     itself: a control can move itself when its state changes (a seated System Prompt cartridge sits 6px
//     lower than an unseated one), and compensating for that crept the page down 6px on every tap.
const hasNarrativeScreen = container => typeof container?.querySelector === 'function' && Boolean(container.querySelector('.wp-narrative'));

const controlKey = el => [el.dataset?.narrativeAction ?? '', el.dataset?.value ?? '', el.dataset?.variable ?? ''].join('|');

// The control's wrapper (grid, row or strip). Its top follows layout shifts above it but not the control's own state.
const anchorTop = el => (el.parentElement ?? el).getBoundingClientRect().top;

function findControl(container, key) {
    return [...container.querySelectorAll('[data-narrative-action]')].find(el => controlKey(el) === key) ?? null;
}

function captureScrollAnchor(container, preferredKey) {
    // Tests render into a bare { innerHTML } object with no layout to anchor to.
    if (typeof container?.querySelectorAll !== 'function') return null;
    const box = container.getBoundingClientRect();
    let el = preferredKey ? findControl(container, preferredKey) : null;
    if (!el) el = [...container.querySelectorAll('[data-narrative-action]')].find(c => { const top = c.getBoundingClientRect().top; return top >= box.top && top < box.bottom; });
    if (!el) return null;
    return { key: controlKey(el), offset: anchorTop(el) - box.top, hadFocus: globalThis.document?.activeElement === el };
}

function restoreScrollAnchor(container, anchor) {
    if (!anchor) return;
    const el = findControl(container, anchor.key);
    if (!el) return;
    const delta = (anchorTop(el) - container.getBoundingClientRect().top) - anchor.offset;
    if (Math.abs(delta) >= 1) container.scrollTop += delta;
    // The old button had focus; its replacement should, so keyboard users are not dropped at the top of the page.
    if (anchor.hadFocus) el.focus({ preventScroll: true });
}

export function renderNarrativeSettingsScreen(container, { snapshot: data, tab = 'essentials', doseArmed = false, narratorFrom = null, narratorBusy = false, anchorKey = '' }) {
    // doseArmed is screen state (index.js), not a setting, so it rides along on the snapshot here.
    // narratorFrom/narratorBusy are the same kind of thing for the narrator picker: only set for the one
    // optimistic draw right after a tap (see 'set-global-narrator' in index.js and narratorPicker.js).
    const snapshot = { ...data, doseArmed, narratorFrom, narratorBusy };
    const activeTab = NARRATIVE_TABS.includes(tab) ? tab : 'essentials';
    const body = activeTab === 'style' ? style(snapshot)
        : activeTab === 'modes' ? modes(snapshot)
        : activeTab === 'perspective' ? perspective(snapshot)
        : essentials(snapshot);
    const inPlace = hasNarrativeScreen(container);
    const anchor = captureScrollAnchor(container, anchorKey);
    container.innerHTML = `
<div class="wp-narrative${inPlace ? ' wp-narrative-still' : ''}">
    ${narrativeMasthead(snapshot)}
    ${narrativeNav(activeTab)}
    <div class="wp-narrative-content">${body}
    </div>
</div>`;
    restoreScrollAnchor(container, anchor);
    // The picker was painted in its previous state; flip it to the new one so the swing-open transitions.
    if (activeTab === 'style' && narratorFrom) playNarratorMotion(container, snapshot.globalNarrator);
}
