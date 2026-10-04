// lib/ui/apps/customShift.js
//
// PromptOS -> Roleplay Shift -> Custom Preset: the player's own feedback presets. One free-text
// box per preset, sent exactly where a built-in shift's player quote goes (quick-reply-ext XXX ->
// buildRoleplayShiftItem wraps it in the same header, audit and closing). Kept out of
// narrativeSettings.js (the main PromptOS screen) so the two can change independently.
//
// Presentation only, like the main screen: every data-narrative-action here maps to a
// "custom-*" branch of handleNarrativeAction in index.js, and the text rules (limit, cleanup,
// Slow Burn example) live in lib/narrativeSettings.js.
import { CUSTOM_FEEDBACK_LIMIT, CUSTOM_NAME_LIMIT } from '../../narrativeSettings.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Shown to the player, never sent. It asks for the candid, venting voice the built-in shifts use,
// because the model takes a real upset player far more seriously than a list of rules.
const HOW_TO = 'Talk to the narrator like a person. Vent about what kept going wrong in your last roleplay, what you wanted instead, and what you are okay with happening because of it. Be specific, be informal, swear if you want. Narrators land short of what you ask for, so aim past where you actually want it.';

/** customShift.css sits next to this module; it's linked once, the first time the screen opens. */
function ensureStylesheet() {
    if (typeof document === 'undefined' || document.getElementById('wp-custom-shift-css')) return;
    const link = document.createElement('link');
    link.id = 'wp-custom-shift-css';
    link.rel = 'stylesheet';
    link.href = new URL('./customShift.css', import.meta.url).href;
    document.head.append(link);
}

// Behind the editor's "?" button: what actually happens to the text, so players know they're
// writing to the narrator, not writing the prompt.
const HOW_IT_WORKS = 'Your feedback is not sent on its own. Weyland wraps it in a custom shell, the same one the built-in shifts use, that tells the narrator this is your report on what went wrong and asks it to adjust how it writes whenever a moment calls for it. It shapes the narrator\'s planning, and the story itself never mentions it. That is why talking to it like a frustrated player works better than writing rules: the narrator takes a real person seriously.';

function presetRow(preset, activeId, deletePendingId) {
    const active = preset.id === activeId;
    const preview = String(preset.text ?? '').split('\n').find(line => line.trim()) ?? '';
    const confirming = deletePendingId === preset.id;
    return `
    <div class="wp-custom-preset${active ? ' is-active' : ''}">
        <div class="wp-custom-preset-text">
            <strong>${escapeHtml(preset.name)}${active ? ' <em>In use</em>' : ''}</strong>
            <small>${escapeHtml(preview.length > 110 ? `${preview.slice(0, 110)}...` : preview)}</small>
        </div>
        <div class="wp-custom-preset-actions">
            <button type="button" class="wp-custom-use" data-narrative-action="custom-use" data-value="${escapeHtml(preset.id)}" ${active ? 'disabled' : ''}>${active ? 'Using' : 'Use'}</button>
            <button type="button" data-narrative-action="custom-edit" data-value="${escapeHtml(preset.id)}">Edit</button>
            <button type="button" class="wp-custom-delete${confirming ? ' is-confirming' : ''}" data-narrative-action="custom-delete" data-value="${escapeHtml(preset.id)}">${confirming ? 'Tap again' : 'Delete'}</button>
        </div>
    </div>`;
}

// A new preset's box is empty, with the Slow Burn quote as grey placeholder text (like the name
// box's), so it reads as an example to replace rather than a box that's already full.
function editor(editing, example) {
    const text = String(editing.text ?? '');
    const placeholder = editing.id || !example ? '' : `EXAMPLE::: ${example}`;
    return `
    <section class="wp-narrative-card wp-custom-editor">
        <div class="wp-narrative-card-heading"><div><span>${editing.id ? 'Edit preset' : 'New preset'}</span><h3>Your feedback</h3></div></div>
        <details class="wp-custom-help"><summary title="How your feedback is used" aria-label="How your feedback is used"><i class="fa-solid fa-circle-question"></i></summary><p>${escapeHtml(HOW_IT_WORKS)}</p></details>
        <p>${escapeHtml(HOW_TO)}</p>
        <label class="wp-custom-label" for="wp-custom-name">Name</label>
        <input id="wp-custom-name" class="wp-custom-name" type="text" maxlength="${CUSTOM_NAME_LIMIT}" value="${escapeHtml(editing.name ?? '')}" placeholder="e.g. Bar fights get real">
        <label class="wp-custom-label" for="wp-custom-text">Feedback</label>
        <textarea id="wp-custom-text" class="wp-custom-text" maxlength="${CUSTOM_FEEDBACK_LIMIT}" rows="14" spellcheck="true" placeholder="${escapeHtml(placeholder)}">${escapeHtml(text)}</textarea>
        <div class="wp-custom-count"><span id="wp-custom-count">${text.length}</span> / ${CUSTOM_FEEDBACK_LIMIT}</div>
        <div class="wp-custom-editor-actions">
            <button type="button" class="wp-narrative-primary" data-narrative-action="custom-save">Save preset</button>
            <button type="button" data-narrative-action="custom-cancel">Cancel</button>
        </div>
    </section>`;
}

/**
 * @param {HTMLElement} container
 * @param {{ presets: Array<{id: string, name: string, text: string}>, activeId?: string|null,
 *   shiftIsCustom?: boolean, editing?: {id?: string, name?: string, text?: string}|null,
 *   deletePendingId?: string|null, example?: string }} state  example = the new-preset placeholder
 */
export function renderCustomShiftScreen(container, { presets = [], activeId = null, shiftIsCustom = false, editing = null, deletePendingId = null, example = '' }) {
    ensureStylesheet();
    container.innerHTML = `
<div class="wp-narrative wp-custom-shift">
    <div class="wp-narrative-content">
        <button type="button" class="wp-custom-back" data-narrative-action="custom-back"><i class="fa-solid fa-chevron-left"></i> Roleplay Shift</button>
        ${editing ? editor(editing, example) : `
        <section class="wp-narrative-card">
            <div class="wp-narrative-card-heading"><div><span>Roleplay Shift</span><h3>Custom Preset</h3></div><i class="fa-solid fa-pen-nib"></i></div>
            <p>Your own feedback for the narrator, in your own words. Pick one to use it as your shift. It goes in exactly where a built-in shift's feedback goes, and it can be dosed too.</p>
            ${presets.length ? `<div class="wp-custom-list">${presets.map(preset => presetRow(preset, shiftIsCustom ? activeId : null, deletePendingId)).join('')}</div>` : '<p class="wp-custom-empty">No presets yet. Make your first one below.</p>'}
            <button type="button" class="wp-narrative-primary" data-narrative-action="custom-new"><i class="fa-solid fa-plus"></i> New preset</button>
        </section>`}
    </div>
</div>`;
}
