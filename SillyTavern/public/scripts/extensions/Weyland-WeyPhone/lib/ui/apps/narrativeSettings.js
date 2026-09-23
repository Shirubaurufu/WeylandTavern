// lib/ui/apps/narrativeSettings.js
//
// PromptOS's product shell — a control-deck read on Storytelling Settings: a masthead, an icon
// tab bar, and a few bespoke controls (the Hard Mode guard switch, the message mode strip) sitting
// on top of plain-language cards, each carrying enough explanation that a user who has never opened
// Storytelling Settings before can still make an informed choice. Every data-narrative-* hook below
// is unchanged from the previous render, so index.js's click handling needs no edits — this file
// only owns presentation, exactly like lib/narrativeSettings.js only owns data shape.
import { EXPERIMENTAL_MODE_VARIABLES, FOCUS_OPTIONS, MENTAL_TOGGLES, MODE_TOGGLES, NARRATIVE_TABS, NARRATOR_OPTIONS, POV_OPTIONS, PROMPT_OPTIONS } from '../../narrativeSettings.js';
import { ASSET_BASE_URL } from '../../assetPaths.js';

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

function choiceButtons(items, active, action, valueKey = 'id', disabled = false) {
    return `<div class="wp-narrative-choice-grid">${items.map(item => `
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
                <span><strong>${escapeHtml(item.label)}</strong>${item.recommended ? '<em class="wp-narrative-recommended">Recommended</em>' : ''}</span>
                <span class="wp-narrative-switch${active ? ' is-on' : ''}"><i></i></span>
            </button>
            ${infoDisclosure(item.tooltip, item.label)}
        </div>`;
    }).join('')}</div>`;
}

function statusPill(label, value, kind = '') {
    return `<span class="wp-narrative-status ${kind}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></span>`;
}

// Section metadata for the tab bar lives here, not in lib/narrativeSettings.js — it's
// presentation, not the underlying variable/Quick Reply contract that file exists to protect.
const TAB_META = {
    essentials: { label: 'Home', icon: 'fa-gauge-high' },
    style: { label: 'Style', icon: 'fa-feather-pointed' },
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

/** Hard Mode gets its own guarded-switch treatment rather than the generic pill — it's the one
 * setting on this screen that changes what the model is willing to write, so it should not read
 * as just another row in a list. The description is deliberately closer to Lucky's own original
 * Storytelling Settings wording than a trimmed-down summary — this is the one setting where a
 * user genuinely needs to understand the tradeoff, not just the gist. */
function hardModeCard(snapshot) {
    const on = snapshot.hardMode;
    const promptSupportsIt = ['Current Prompt', 'Beta Prompt'].includes(snapshot.prompt);
    return `
    <section class="wp-narrative-card wp-narrative-hard-card${on ? ' is-on' : ''}">
        <div class="wp-narrative-card-heading"><div><span>Short-term intensity</span><h3>Hard Mode</h3></div></div>
        <ul class="wp-narrative-bullets">
            <li>Adds Lucky's Hard Mode modifier.</li>
            <li>Pushes models to embrace negativity and mental illness, hard. Can make normally soft characters cold/detached and hard characters rough - caution advised.</li>
            <li>Meant for short stretches only.</li>
            <li>Leaving it on for a long time can push characters into being unrealistically and permanently negative, past what's actually true to who they are.</li>
        </ul>
        <button type="button" class="wp-narrative-guard" data-narrative-action="toggle-hard" aria-pressed="${on}">
            <span class="wp-narrative-guard-track"><span class="wp-narrative-guard-thumb"></span></span>
            <span class="wp-narrative-guard-label">${on ? 'On' : 'Off'}</span>
        </button>
        ${!promptSupportsIt ? '<div class="wp-narrative-warning"><i class="fa-solid fa-triangle-exclamation"></i> This prompt does not inject Hard Mode. Enabling it switches to Current, matching the classic menu.</div>' : ''}
    </section>`;
}

/** Analysis keeps the model-specific tradeoff visible while clearly identifying the enabled state
 * as the recommended default for most models. */
function analysisCard(snapshot) {
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
        ${snapshot.hardMode ? '<div class="wp-narrative-note"><i class="fa-solid fa-circle-info"></i> Hard Mode stays fully in effect either way — with the analysis off, it runs as a short standalone pre-analysis instead of a full section.</div>' : ''}
    </section>`;
}

function geminiBypassCard(snapshot) {
    const on = snapshot.geminiBypass;
    return `
    <section class="wp-narrative-card wp-narrative-gemini-card${on ? ' is-on' : ''}">
        <div class="wp-narrative-card-heading"><div><span>Optional model compatibility</span><h3>Gemini Bypass (Beta)</h3></div><i class="fa-solid fa-bolt"></i></div>
        <p>Adds an experimental layer that may improve the reliability of Gemini-based models including Gemini 3.1 Pro, 3.8 Flash and Gemma.</p>
        <button type="button" class="wp-narrative-gemini-toggle" data-narrative-action="toggle-gemini-bypass" aria-pressed="${on}">
            <span><strong>${on ? 'Enabled' : 'Disabled'}</strong><small>Gemini reasoning-loop safeguard</small></span>
            <span class="wp-narrative-switch${on ? ' is-on' : ''}" aria-hidden="true"><i></i></span>
        </button>
    </section>`;
}

function essentials(snapshot) {
    return `
    <section class="wp-narrative-hero">
        <span class="wp-narrative-eyebrow">Current roleplay recipe</span>
        <h2>${escapeHtml(snapshot.prompt)}</h2>
        <p>${snapshot.hasChat ? 'Changes apply to the open roleplay. Global choices remain your defaults unless marked “this chat”.' : 'Open a roleplay to use chat-only overrides and character-specific scenarios.'}</p>
        <div class="wp-narrative-status-row">
            ${statusPill('Narrator', snapshot.localNarrator, snapshot.localNarratorOverride ? 'is-local' : '')}
            ${statusPill('Analysis', snapshot.analysisEnabled ? 'On' : 'Off')}
            ${statusPill('POV', snapshot.localPovOverride ? 'Chat override' : snapshot.povType, snapshot.localPovOverride ? 'is-local' : '')}
            ${statusPill('Language', snapshot.language)}
        </div>
    </section>
    <section class="wp-narrative-card">
        <div class="wp-narrative-card-heading"><div><span>Foundation</span><h3>System prompt</h3></div><i class="fa-solid fa-layer-group"></i></div>
        <p>A system prompt is the foundational instruction set the model reads before anything else in a roleplay. It's what defines how characters think, speak, and behave underneath whatever scene you're actually in.</p>
        ${choiceButtons(PROMPT_OPTIONS, snapshot.prompt, 'set-prompt')}
    </section>
    ${hardModeCard(snapshot)}
    ${analysisCard(snapshot)}
    ${geminiBypassCard(snapshot)}
    <section class="wp-narrative-card">
        <div class="wp-narrative-card-heading"><div><span>Character setup</span><h3>School year & scenario</h3></div><i class="fa-solid fa-graduation-cap"></i></div>
        <p>Uses the existing character-specific scenario picker, including every backend-maintained option.</p>
        <button type="button" class="wp-narrative-primary" data-narrative-action="school-year" ${snapshot.hasChat ? '' : 'disabled'}>Choose year or scenario <i class="fa-solid fa-chevron-right"></i></button>
    </section>`;
}

function style(snapshot) {
    return `
    <section class="wp-narrative-card">
        <div class="wp-narrative-card-heading"><div><span>Global default</span><h3>Narrator</h3></div><i class="fa-solid fa-feather-pointed"></i></div>
        <p>A narrator sets the voice describing your scenes — how much detail lingers, how warm or how brutal the framing gets, and what kind of story the world leans toward. It changes how things are told, not who your characters are.</p>
        ${choiceButtons(NARRATOR_OPTIONS, snapshot.globalNarrator, 'set-global-narrator')}
    </section>
    <section class="wp-narrative-card">
        <div class="wp-narrative-card-heading"><div><span>Translation</span><h3>Roleplay language</h3></div><i class="fa-solid fa-language"></i></div>
        <p>Characters remain unaware of the translation. English clears the extra language modifier.</p>
        <div class="wp-narrative-language-row"><input id="wp-narrative-language" type="text" value="${escapeHtml(snapshot.language)}" placeholder="English" /><button type="button" data-narrative-action="save-language">Apply</button></div>
        ${snapshot.language && snapshot.language.trim().toLowerCase() !== 'english' ? '<button type="button" class="wp-narrative-secondary" data-narrative-action="reset-language">Reset to English</button>' : ''}
    </section>`;
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
        <div class="wp-narrative-card-heading"><div><span>Scene-aware instructions</span><h3>Message modes</h3></div><i class="fa-solid fa-sliders"></i></div>
        <p>These tell the model how to handle intimacy and trauma when a scene calls for it — tap <i class="fa-solid fa-circle-info"></i> on any of them for the full explanation. Sapphire remains automatic and has no instruction payload to disable.</p>
        ${modeStrip(mainModes, snapshot.modes)}
    </section>
    <section class="wp-narrative-card wp-narrative-experimental-card">
        <div class="wp-narrative-card-heading"><div><span>Still in testing</span><h3>Experimental</h3></div><i class="fa-solid fa-flask"></i></div>
        <p>Newer additions that haven't had as much time in the oven — expect rougher edges than the modes above.</p>
        ${modeStrip(experimentalModes, snapshot.modes)}
    </section>
    <section class="wp-narrative-card">
        <div class="wp-narrative-card-heading"><div><span>Emotional range</span><h3>Mental health directives</h3></div><i class="fa-solid fa-heart-pulse"></i></div>
        <p>Even with all of these off, characters stay written to feel authentic and human, these just encourage specific parts of the emotional spectrum.</p>
        <p>Tap <i class="fa-solid fa-circle-info"></i> on any of them for a brief summary of what they do.</p>
        <div class="wp-narrative-preset-row">
            <button type="button" data-narrative-action="mental-preset" data-value="recommended">Recommended</button>
            <button type="button" data-narrative-action="mental-preset" data-value="all">All on</button>
            <button type="button" data-narrative-action="mental-preset" data-value="none">All off</button>
        </div>
        ${toggleRows(MENTAL_TOGGLES, snapshot.mental, 'mental')}
    </section>
    <section class="wp-narrative-card">
        <div class="wp-narrative-card-heading"><div><span>Chat display</span><h3>Commands & OOC prompts</h3></div><button type="button" class="wp-narrative-switch${snapshot.commandsHidden ? ' is-on' : ''}" data-narrative-action="toggle-command-visibility" aria-pressed="${snapshot.commandsHidden}"><i></i></button></div>
        <p>${snapshot.commandsHidden ? 'Hidden: technical command and OOC messages stay out of sight.' : 'Visible: command and OOC messages appear in the chat.'}</p>
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
        <div class="wp-narrative-card-heading"><div><span>When paths separate</span><h3>Narrative focus</h3></div><i class="fa-solid fa-arrows-split-up-and-left"></i></div>
        ${choiceButtons(FOCUS_OPTIONS, snapshot.focus, 'set-focus')}
    </section>`;
}

export function renderNarrativeSettingsScreen(container, { snapshot, tab = 'essentials' }) {
    const activeTab = NARRATIVE_TABS.includes(tab) ? tab : 'essentials';
    const body = activeTab === 'style' ? style(snapshot)
        : activeTab === 'modes' ? modes(snapshot)
        : activeTab === 'perspective' ? perspective(snapshot)
        : essentials(snapshot);
    container.innerHTML = `
<div class="wp-narrative">
    ${narrativeMasthead(snapshot)}
    ${narrativeNav(activeTab)}
    <div class="wp-narrative-content">${body}
        <section class="wp-narrative-legacy">
            <button type="button" data-narrative-action="legacy-menu"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open classic Storytelling Settings</button>
            <small>The classic menu remains available as a compatibility fallback.</small>
        </section>
    </div>
</div>`;
}
