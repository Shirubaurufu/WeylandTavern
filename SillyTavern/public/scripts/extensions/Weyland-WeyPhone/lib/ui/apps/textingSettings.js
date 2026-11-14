import { collectPhoneModelIds, modelQuickfills, MODEL_DEFAULTS } from './settings.js';

const QUICK_MODELS = [MODEL_DEFAULTS.texting.primary, MODEL_DEFAULTS.texting.backup, 'glm-4.7-thinking', 'gemma-4-31b-it'];

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function renderTextingSettingsScreen(container, { settings, currentLiveModel = '' }) {
    const selected = String(settings.textingModelOverride ?? '').trim();
    const effective = selected || currentLiveModel;
    const backup = String(settings.textingFallbackModel ?? '').trim();
    // 3.8 Flash used to be filtered out of these lists while it was retired; it is back (2026-11-14).
    const models = collectPhoneModelIds(selected);
    if (currentLiveModel && !models.includes(currentLiveModel)) models.push(currentLiveModel);
    const backupModels = collectPhoneModelIds(backup);
    container.innerHTML = `
<div class="wp-settings">
    <div class="wp-settings-section">
        <div class="wp-settings-section-title">Texting model</div>
        <p id="wp-texting-model-status" class="wp-settings-hint" role="status">${selected ? 'Selected model' : 'Following your current chat model'}: <strong>${escapeHtml(effective || 'Chosen by your connection profile')}</strong></p>
        <label class="wp-settings-field wp-settings-field-column">
            <span>Choose a model</span>
            <select class="wp-model-select" data-input-id="wp-settings-texting-model">
                <option value=""${selected ? '' : ' selected'}>Follow current chat model</option>
                ${models.sort().map(id => `<option value="${escapeHtml(id)}"${id === selected ? ' selected' : ''}>${escapeHtml(id)}${id === MODEL_DEFAULTS.texting.primary ? ' (recommended)' : ''}</option>`).join('')}
            </select>
        </label>
        <label class="wp-settings-field wp-settings-field-column">
            <span>Model ID <small>(editable for models missing from the list)</small></span>
            <input id="wp-settings-texting-model" type="text" autocomplete="off" spellcheck="false" placeholder="Blank follows current chat model" value="${escapeHtml(selected)}" />
        </label>
        <div class="wp-settings-recommend-row">
            <button type="button" class="wp-btn-sm wp-model-quickfill" data-input-id="wp-settings-texting-model" data-model="">Follow chat model</button>
            <button type="button" class="wp-btn-sm wp-settings-use-current-model" data-input-id="wp-settings-texting-model" title="Keep using this model even when your main chat model changes">Use current model</button>
        </div>
        ${modelQuickfills('wp-settings-texting-model', QUICK_MODELS)}
        <p class="wp-settings-hint">Changes save automatically and apply to your next requested reply in DMs and group texts. Finish editing a custom ID by tapping outside the field.</p>
        <p class="wp-settings-hint">Linked threads use the main roleplay model. Kressa has her own model setting.</p>
    </div>
    <div class="wp-settings-section">
        <div class="wp-settings-section-title">Backup model</div>
        <label class="wp-settings-field wp-settings-field-column">
            <span>If the texting model fails</span>
            <select class="wp-model-select" data-input-id="wp-settings-texting-fallback">
                <option value=""${backup ? '' : ' selected'}>No backup</option>
                ${backupModels.map(id => `<option value="${escapeHtml(id)}"${id === backup ? ' selected' : ''}>${escapeHtml(id)}${id === MODEL_DEFAULTS.texting.backup ? ' (recommended backup)' : ''}</option>`).join('')}
            </select>
        </label>
        <label class="wp-settings-field wp-settings-field-column">
            <span>Backup model ID</span>
            <input id="wp-settings-texting-fallback" type="text" autocomplete="off" spellcheck="false" placeholder="Blank disables backup" value="${escapeHtml(backup)}" />
        </label>
        ${modelQuickfills('wp-settings-texting-fallback', [MODEL_DEFAULTS.texting.backup, MODEL_DEFAULTS.texting.primary])}
        <div class="wp-settings-recommend-row">
            <button type="button" class="wp-btn-sm wp-model-quickfill" data-input-id="wp-settings-texting-fallback" data-model="">No backup</button>
        </div>
        <p class="wp-settings-hint">Retries a failed request once using this model. Your primary choice stays selected. Changes save automatically.</p>
    </div>
    <button type="button" id="wp-texting-all-settings" class="wp-settings-link-row"><span>All phone settings<small>Connections, appearance, and more</small></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
</div>`;
}
