// lib/ui/apps/understudy.js
//
// Copycat's product shell. The stable `understudy` storage and routing keys deliberately remain
// internal so existing installs keep every setting while the visible app can use its final name.
// Fragile rewrite logic stays in lib/understudy.js; this module only renders the app.
//
// Three sections, and the split is by QUESTION rather than by feature:
//   Pawpad:   "rewrite this message", plus the draft once there is one. The whole loop lives
//              here; a review step on its own tab only added a click between writing a note and
//              reading the result.
//   Edits:    "how should it be changed": narrator, scope, context depth, message modes. These are
//              per-scene creative choices that get changed often, so they are buttons rather than
//              dropdowns and each one explains itself once selected.
//   Settings: "how does the app run": models, theme, automation. Set rarely, then left alone.

import { UNDERSTUDY_SCOPES, UNDERSTUDY_NARRATORS } from '../../understudy.js';
import { modelSelect, fallbackModelSelect, modelQuickfills, toggleRowMarkup } from './settings.js';

export const UNDERSTUDY_CAST_MODELS = ['gemini-3.8-flash', 'deepseek-v4-pro-thinking', 'gemini-3.1-pro-preview', 'gemma-4-31b-it', 'minimax-m3'];
// The two standouts, best first. Which one is recommended as the fallback depends on which is
// selected as the primary: recommending the same model as its own backup would not help.
//
// deepseek-v4-pro (non-thinking) is deliberately absent from both lists. On this task it returned
// its input near-verbatim - one measured run came back 99% identical word-for-word - while the
// thinking variant performs the rewrite properly. Same family, completely different result.
export const UNDERSTUDY_TOP_MODELS = ['gemini-3.8-flash', 'deepseek-v4-pro-thinking'];

// Four distinct cat-inspired moods rather than four shades of one. The stable ids remain in place
// so an update never resets an existing user's chosen palette.
export const COPYCAT_PALETTES = Object.freeze([
    { id: 'opening-night', label: 'Velvet Paws', colors: ['#160d15', '#7d003d', '#ff747c'] },
    { id: 'green-room', label: 'Mossy Window', colors: ['#0d1512', '#1d3a30', '#d8a657'] },
    { id: 'after-hours', label: 'Midnight Zoomies', colors: ['#10111d', '#292442', '#a98cff'] },
    { id: 'terminal-bloom', label: 'Neon Whiskers', colors: ['#10191a', '#29494c', '#ff79bd'] },
]);

// Scene context is capped at 10. More context grounds the rewrite, but Copycat already sends the
// entire character profile, and past roughly ten messages the log stops adding information and
// starts competing with the brief for the model's attention.
export const UNDERSTUDY_MAX_CONTEXT = 10;
export const UNDERSTUDY_RECOMMENDED_CONTEXT = 5;

export function understudyRecommendedFallback(modelOverride) {
    const lead = String(modelOverride || '');
    return UNDERSTUDY_TOP_MODELS.find(model => model !== lead) ?? UNDERSTUDY_TOP_MODELS[0];
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export const UNDERSTUDY_STATUS_LINES = [
    'Prowling through the prose…',
    'Following the thread…',
    'Sharpening the voice…',
    'Batting away flat phrasing…',
    'Hunting for where it flinched…',
    'Landing on the right words…',
];

// The phone's shared app bar is hidden for Copycat (it only repeated "Copycat" and the help
// button), so the help button lives here, at the masthead's right edge.
function copycatMasthead() {
    return `
    <div class="wp-copycat-masthead">
        <img class="wp-copycat-logo" src="/scripts/extensions/Weyland-WeyPhone/assets/weyphone_copycat.webp" alt="" />
        <div class="wp-copycat-brand"><strong>Copycat</strong></div>
        <span class="wp-copycat-live"><i></i> Ready</span>
        <button type="button" class="wp-inline-help wp-copycat-help" data-app-key="understudy" title="What is this?" aria-label="What is this?"><i class="fa-solid fa-circle-question"></i></button>
    </div>`;
}

function copycatNavigation(active) {
    return `
    <div class="wp-copycat-nav" role="tablist" aria-label="Copycat sections">
        <button type="button" class="wp-copycat-nav-button${active === 'stage' ? ' wp-active' : ''}" data-copycat-view="stage" role="tab" aria-selected="${active === 'stage'}"><i class="fa-solid fa-paw"></i> Pawpad</button>
        <button type="button" class="wp-copycat-nav-button${active === 'edits' ? ' wp-active' : ''}" data-copycat-view="edits" role="tab" aria-selected="${active === 'edits'}"><i class="fa-solid fa-pen-ruler"></i> Instincts</button>
        <button type="button" class="wp-copycat-nav-button${active === 'settings' ? ' wp-active' : ''}" data-copycat-view="settings" role="tab" aria-selected="${active === 'settings'}"><i class="fa-solid fa-sliders"></i> Settings</button>
    </div>`;
}

/**
 * A row of mutually exclusive choice buttons, with the selected option's explanation printed
 * underneath. One description at a time rather than all of them: the point is to confirm what
 * the current choice does, and printing every blurb turns the panel into a wall of text.
 *
 * @param {object} config
 * @param {string} config.group value written to data-copycat-choice, used by the click handler
 * @param {{key: string, label: string, blurb: string}[]} config.options
 * @param {string} config.value currently selected key
 */
function choiceRow({ group, options, value }) {
    const selected = options.find(option => option.key === value) ?? options[0];
    return `
        <div class="wp-copycat-choices" role="group">
            ${options.map(option => `<button type="button" class="wp-copycat-choice${option.key === selected.key ? ' wp-selected' : ''}" data-copycat-choice="${group}" data-value="${escapeHtml(option.key)}" aria-pressed="${option.key === selected.key}">${escapeHtml(option.label)}</button>`).join('')}
        </div>
        <p class="wp-copycat-choice-blurb">${escapeHtml(selected.blurb)}</p>`;
}

function sourceCard(target, scope, isSpanScoped, noSpans) {
    return `
    <section class="wp-understudy-card">
        <div class="wp-understudy-card-head">
            <span class="wp-understudy-who">${escapeHtml(target.characterName)}</span>
            <span class="wp-understudy-role">Last reply</span>
            ${target.header ? '<span class="wp-understudy-protected"><i class="fa-solid fa-lock"></i> header &amp; footer held</span>' : ''}
        </div>
        <div class="wp-understudy-source">${escapeHtml(target.body)}</div>
        ${isSpanScoped && !noSpans ? `<div class="wp-understudy-spancount"><i class="fa-solid fa-scissors"></i> ${target.spanCount} fragment${target.spanCount === 1 ? '' : 's'} in scope</div>` : ''}
        ${readingPicker(target)}
    </section>`;
}

/**
 * Which stored reading the next rewrite works from. Hidden until a message actually has more
 * than one, since with a single reading there is nothing to choose.
 */
function readingPicker(target) {
    const count = Number(target.readingCount ?? 1);
    if (count < 2) return '';
    const at = Number(target.readingIndex ?? 0);
    const label = at === 0 ? 'the original' : `rewrite ${at}`;
    return `
        <div class="wp-understudy-reading" title="Which existing version of this message Copycat rewrites from. Applied rewrites are stored as readings, so you can go back and re-roll any of them.">
            <button type="button" id="wp-understudy-reading-prev" class="wp-understudy-reading-step"${at === 0 ? ' disabled' : ''} aria-label="Previous reading"><i class="fa-solid fa-chevron-left"></i></button>
            <span class="wp-understudy-reading-label">Rewriting <strong>${escapeHtml(label)}</strong><small>${at + 1} of ${count}</small></span>
            <button type="button" id="wp-understudy-reading-next" class="wp-understudy-reading-step"${at >= count - 1 ? ' disabled' : ''} aria-label="Next reading"><i class="fa-solid fa-chevron-right"></i></button>
        </div>`;
}

function stageView({ target, draft, generating, error, settings, applied, take, statusIndex, feedback, scope, isSpanScoped, noSpans, showOriginal }) {
    const hasDraft = Boolean(draft.trim());
    return `
    <div class="wp-copycat-section-head">
        <div><span>Current reply</span><strong>${escapeHtml(scope.label)}</strong></div>
        <button type="button" id="wp-understudy-refresh" class="wp-copycat-refresh" title="Point Copycat at the newest reply and clear anything left over from an older one."><i class="fa-solid fa-arrows-rotate"></i> Refresh</button>
    </div>
    <div class="wp-copycat-section-sub">${hasDraft ? `Copy ${take} ready to review` : 'Nudge the next copy'}</div>
    ${hasDraft ? '' : sourceCard(target, scope, isSpanScoped, noSpans)}
    ${noSpans ? `<div class="wp-understudy-note wp-understudy-note-warn"><i class="fa-solid fa-triangle-exclamation"></i><span>No ${escapeHtml(scope.spanKind)} in this reply. Choose another rewrite scope under Edits.</span></div>` : ''}
    ${error ? `<div class="wp-understudy-note wp-understudy-note-error"><i class="fa-solid fa-circle-exclamation"></i><span>${escapeHtml(error)}</span></div>` : ''}
    ${applied ? '<div class="wp-understudy-note wp-understudy-note-ok"><i class="fa-solid fa-check"></i><span>Rewrite added to the chat. Swipe the reply to compare it with the original.</span></div>' : ''}

    ${hasDraft ? `
    <div class="wp-understudy-tabs" role="tablist">
        <button type="button" id="wp-understudy-tab-take" class="wp-understudy-tab${showOriginal ? '' : ' wp-active'}" role="tab" aria-selected="${!showOriginal}">Rewrite</button>
        <button type="button" id="wp-understudy-tab-original" class="wp-understudy-tab${showOriginal ? ' wp-active' : ''}" role="tab" aria-selected="${showOriginal}">Original</button>
    </div>
    ${showOriginal
        ? `<section class="wp-understudy-card wp-understudy-compare-card"><div class="wp-understudy-card-head"><span class="wp-understudy-eyebrow">Original reading</span></div><div class="wp-understudy-source">${escapeHtml(target.body)}</div></section>`
        : `<div class="wp-understudy-draft-wrap"><label class="wp-understudy-draft-head" for="wp-understudy-draft"><span>Copycat's rewrite</span><small>Editable before use</small></label><textarea id="wp-understudy-draft" class="wp-understudy-draft" spellcheck="false">${escapeHtml(draft)}</textarea></div>`}` : ''}

    ${generating ? `
    <div class="wp-understudy-stage" role="status" aria-live="polite"><span class="wp-understudy-stage-icon"><i class="fa-solid fa-rotate"></i></span><div><strong class="wp-understudy-stage-text">${escapeHtml(UNDERSTUDY_STATUS_LINES[statusIndex % UNDERSTUDY_STATUS_LINES.length])}</strong></div><div class="wp-understudy-stage-glow"></div></div>` : `
    <section class="wp-understudy-note-box">
        <label class="wp-understudy-note-head" for="wp-understudy-feedback"><span><i class="fa-solid fa-paw"></i> Catnip note</span><small>Optional · strongest instruction</small></label>
        <textarea id="wp-understudy-feedback" class="wp-understudy-feedback" rows="2" spellcheck="false" placeholder="Write custom instructions for your rewrite here.">${escapeHtml(feedback)}</textarea>
        <label class="wp-understudy-deviate" title="Let Copycat choose a different direction instead of only rewording this one."><span><strong>Let it wander</strong><small>${isSpanScoped ? 'Whole-passage rewrites only' : 'Tell the AI it’s allowed to make major changes'}</small></span><span class="wp-copycat-switch"><input type="checkbox" id="wp-understudy-deviate"${settings.allowDeviation ? ' checked' : ''}${isSpanScoped ? ' disabled' : ''} /><i></i></span></label>
    </section>
    ${hasDraft ? `
    <div class="wp-understudy-actions">
        <button type="button" id="wp-understudy-apply" class="wp-understudy-apply"><i class="fa-solid fa-check"></i> Use this rewrite</button>
        <div class="wp-understudy-actions-secondary">
            <button type="button" id="wp-understudy-run" class="wp-understudy-again"><i class="fa-solid fa-rotate"></i> Rewrite Again</button>
            <button type="button" id="wp-understudy-discard" class="wp-understudy-discard"><i class="fa-regular fa-trash-can"></i> Discard</button>
        </div>
    </div>`
        : `<button type="button" id="wp-understudy-run" class="wp-understudy-run"${noSpans ? ' disabled' : ''}><i class="fa-solid fa-wand-magic-sparkles"></i><span>Rewrite Message</span><i class="fa-solid fa-arrow-right"></i></button>`}`}`;
}

/**
 * The Edits panel: everything about HOW the message gets changed.
 *
 * Narrator leads because it is the widest-reaching choice: it changes what kind of scene comes
 * back, not just its wording.
 */
function editsView({ settings }) {
    const narrator = String(settings.narrator ?? 'off');
    const narratorOptions = [
        { key: 'off', label: 'Off', blurb: 'No narrator modifier. Copycat follows the character and the scene only.' },
        { key: 'chat', label: 'This chat', blurb: 'Follows whichever narrator is set in Storytelling Settings, including a per-chat override.' },
        ...UNDERSTUDY_NARRATORS.map(entry => ({
            key: entry.key,
            label: entry.label.split(' - ')[0].trim(),
            blurb: `${entry.blurb} Applied to Copycat only, your chat's own narrator is untouched.`,
        })),
    ];
    // Explicit short labels rather than trimming the long ones: deriving them by string surgery
    // produced "unflinching" as a standalone button, which reads as a fragment.
    const SCOPE_BUTTON_LABELS = { full: 'Everything', uncomfortable: 'Unflinching', dialogue: 'Dialogue', dialogueThoughts: 'Dialogue + thoughts', thoughts: 'Thoughts', actions: 'Narration' };
    const scopeOptions = Object.entries(UNDERSTUDY_SCOPES).map(([key, value]) => ({
        key,
        label: SCOPE_BUTTON_LABELS[key] ?? value.label,
        blurb: value.hint,
    }));
    const context = Math.min(UNDERSTUDY_MAX_CONTEXT, Math.max(0, Number(settings.contextMessages ?? UNDERSTUDY_RECOMMENDED_CONTEXT)));

    return `
    <div class="wp-copycat-section-head"><div><span>Instincts</span><strong>How this reply gets changed</strong></div><small>Applies to Copycat only</small></div>

    <section class="wp-copycat-edit-block">
        <h4>Narrator</h4>
        <p class="wp-copycat-edit-note">A narrator changes how scenes are described and which direction they tend to go: how much is lingered on, how warm or how brutal the framing is. This applies to Copycat's rewrites only and never touches your chat's own narrator.</p>
        ${choiceRow({ group: 'narrator', options: narratorOptions, value: narrator })}
    </section>

    <section class="wp-copycat-edit-block">
        <h4>Scope</h4>
        <p class="wp-copycat-edit-note">Scope is how much of the reply Copycat is allowed to touch. A narrow scope extracts only those fragments and splices the results back, so nothing outside them can change.</p>
        ${choiceRow({ group: 'scope', options: scopeOptions, value: String(settings.scope ?? 'full') })}
    </section>

    <section class="wp-copycat-edit-block">
        <h4>Scene context</h4>
        <p class="wp-copycat-edit-note">How many recent messages ride along with the rewrite. Copycat always gets the character's full profile; this is just how much of the conversation comes with it.</p>
        <label class="wp-copycat-stepper" for="wp-understudy-context">
            <input id="wp-understudy-context" type="number" min="0" max="${UNDERSTUDY_MAX_CONTEXT}" step="1" value="${context}" />
            <span>messages <em>(recommended: ${UNDERSTUDY_RECOMMENDED_CONTEXT}; max: ${UNDERSTUDY_MAX_CONTEXT})</em></span>
        </label>
    </section>

    <section class="wp-copycat-edit-block">
        <h4>Message modes</h4>
        <p class="wp-copycat-edit-note">Your language and POV settings always travel with a rewrite and are not listed here. This is the one standing instruction you choose.</p>
        ${toggleRowMarkup({ id: 'wp-understudy-modes', label: 'Message modes', sub: 'Tell Copycat the register when the reply is already tagged ONYX, RUBY or OPAL', checked: settings.sendModes !== false })}
    </section>`;
}

/**
 * The rewrite stage.
 *
 * @param {HTMLElement} container #wp-screen-body
 * @param {object} state
 */
export function renderUnderstudyScreen(container, { target, draft, generating, error, settings, applied, take = 0, showOriginal = false, statusIndex = 0, feedback = '', section = 'stage' }) {
    const activeSection = section === 'edits' ? 'edits' : 'stage';
    if (activeSection === 'edits') {
        container.innerHTML = `<div class="wp-understudy">${copycatMasthead()}${copycatNavigation('edits')}<main class="wp-copycat-content">${editsView({ settings })}</main></div>`;
        return;
    }
    if (!target) {
        container.innerHTML = `<div class="wp-understudy">${copycatMasthead()}${copycatNavigation('stage')}<div class="wp-understudy-empty"><div class="wp-understudy-empty-mark"><i class="fa-solid fa-cat"></i></div><strong>Nothing to copy yet</strong><span>Open a roleplay chat with a character reply, then come back to give it another life.</span></div></div>`;
        return;
    }
    const scope = UNDERSTUDY_SCOPES[settings.scope] ?? UNDERSTUDY_SCOPES.full;
    const isSpanScoped = Boolean(scope.spanKind);
    const noSpans = isSpanScoped && target.spanCount === 0;
    const state = { target, draft, generating, error, settings, applied, take, showOriginal, statusIndex, feedback, scope, isSpanScoped, noSpans };
    container.innerHTML = `<div class="wp-understudy">${copycatMasthead()}${copycatNavigation('stage')}<main class="wp-copycat-content">${stageView(state)}</main></div>`;
}

/** The settings screen: how the app runs, rather than how a scene is changed. */
export function renderUnderstudySettingsScreen(container, { settings, currentLiveModel }) {
    const activePalette = COPYCAT_PALETTES.some(palette => palette.id === settings.palette) ? settings.palette : 'opening-night';
    const autoMode = String(settings.autoMode ?? 'off');
    const autoTrigger = String(settings.autoTrigger ?? 'every');
    const cadenceField = autoTrigger === 'always'
        ? ''
        : autoTrigger === 'chance'
            ? `<label class="wp-settings-field wp-settings-field-column"><span>Chance per reply <small>%</small></span><input id="wp-understudy-autochance" type="number" min="1" max="100" step="1" value="${Number(settings.autoChance ?? 25)}" /></label>`
            : `<label class="wp-settings-field wp-settings-field-column"><span>Every N replies</span><input id="wp-understudy-autoevery" type="number" min="1" max="50" step="1" value="${Number(settings.autoEvery ?? 5)}" /></label>`;

    container.innerHTML = `
<div class="wp-understudy wp-understudy-settings-shell">
    ${copycatMasthead()}${copycatNavigation('settings')}
    <div class="wp-settings wp-understudy-settings">
        <section class="wp-settings-section">
            <div class="wp-settings-section-title">Models</div>
            <label class="wp-settings-field wp-settings-field-column">
                <span>Copycat model <small>Writes the rewrite</small></span>
                <div class="wp-settings-inline">
                    <input id="wp-understudy-model" type="text" placeholder="${escapeHtml(currentLiveModel || 'model id')}" value="${escapeHtml(settings.modelOverride ?? '')}" />
                    <button type="button" class="wp-btn-sm wp-settings-use-current-model" data-input-id="wp-understudy-model">Use current</button>
                </div>
                ${modelSelect('wp-understudy-model', settings.modelOverride ?? '')}
                ${modelQuickfills('wp-understudy-model', UNDERSTUDY_CAST_MODELS)}
                <span class="wp-settings-sublabel">Backup model</span>
                ${fallbackModelSelect('wp-understudy-fallback', settings.fallbackModel, understudyRecommendedFallback(settings.modelOverride))}
                <small class="wp-settings-recommend-disclaimer">Gemini 3.8 Flash is the strongest here by a clear margin and is the default. DeepSeek V4 Pro Thinking is the solid second. Avoid non-thinking DeepSeek for rewrites: it tends to hand back what you gave it.</small>
            </label>
        </section>

        <section class="wp-settings-section">
            <div class="wp-settings-section-title">Theme</div>
            <div class="wp-copycat-palette-grid">${COPYCAT_PALETTES.map(palette => `<button type="button" class="wp-copycat-palette-button${palette.id === activePalette ? ' wp-selected' : ''}" data-palette="${palette.id}" aria-pressed="${palette.id === activePalette}"><span class="wp-copycat-palette-swatches" aria-hidden="true">${palette.colors.map(color => `<i style="background:${color}"></i>`).join('')}</span><span>${palette.label}</span></button>`).join('')}</div>
        </section>

        <section class="wp-settings-section">
            <div class="wp-settings-section-title">Automatic rewrites</div>
            <label class="wp-settings-field wp-settings-field-column">
                <span>Automation</span>
                <select id="wp-understudy-automode" class="wp-understudy-scope-select">
                    <option value="off"${autoMode === 'off' ? ' selected' : ''}>Off, only when I ask</option>
                    <option value="semi"${autoMode === 'semi' ? ' selected' : ''}>Prepare a rewrite and notify me</option>
                    <option value="full"${autoMode === 'full' ? ' selected' : ''}>Add the rewrite as a swipe</option>
                </select>
            </label>
            ${autoMode === 'off' ? '' : `
            <label class="wp-settings-field wp-settings-field-column">
                <span>Trigger</span>
                <select id="wp-understudy-autotrigger" class="wp-understudy-scope-select">
                    <option value="always"${autoTrigger === 'always' ? ' selected' : ''}>Always, every character reply</option>
                    <option value="every"${autoTrigger === 'every' ? ' selected' : ''}>Every few replies</option>
                    <option value="chance"${autoTrigger === 'chance' ? ' selected' : ''}>At random</option>
                </select>
            </label>
            ${cadenceField}
            <div class="wp-settings-hint">Each automatic rewrite uses one generation${autoTrigger === 'always' ? ', so Always roughly doubles your generation use' : ''}. Copycat never rewrites one of its own rewrites.</div>`}
        </section>

        <section class="wp-copycat-safety-card"><i class="fa-solid fa-cat"></i><div><strong>Your original keeps all nine lives</strong><span>Copycat adds rewrites as swipes. The date, location, time, and expression footer are restored exactly.</span></div></section>
    </div>
</div>`;
}
