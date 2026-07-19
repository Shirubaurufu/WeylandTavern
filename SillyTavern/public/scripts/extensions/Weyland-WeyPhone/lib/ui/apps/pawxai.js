// lib/ui/apps/pawxai.js

import { PAWXAI_MAX_PROMPTS, PAWXAI_PALETTES, groupSavedPawXaiPrompts } from '../../pawxai.js';
import { ASSET_BASE_URL } from '../../assetPaths.js';
import { RECOMMENDED_PHONE_MODEL, ALTERNATE_PHONE_MODELS } from './settings.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function option(value, label, selected) {
    return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

function tabs(activeTab, savedCount) {
    return `<div class="wp-pawxai-tabs" role="tablist">
        <button type="button" class="wp-pawxai-tab${activeTab === 'generate' ? ' wp-active' : ''}" data-pawxai-tab="generate"><i class="fa-solid fa-wand-magic-sparkles"></i> Create</button>
        <button type="button" class="wp-pawxai-tab${activeTab === 'saved' ? ' wp-active' : ''}" data-pawxai-tab="saved"><i class="fa-solid fa-bookmark"></i> Saved${savedCount ? ` <span>${savedCount}</span>` : ''}</button>
        <button type="button" class="wp-pawxai-tab${activeTab === 'settings' ? ' wp-active' : ''}" data-pawxai-tab="settings"><i class="fa-solid fa-sliders"></i> Settings</button>
    </div>`;
}

function resultCard(result, index) {
    return `<article class="wp-pawxai-prompt-card" data-pawxai-result-index="${index}">
        <div class="wp-pawxai-card-head"><span class="wp-pawxai-prompt-title">${escapeHtml(result.title)}</span><div>
            <button type="button" class="wp-pawxai-icon-button wp-pawxai-copy" data-pawxai-result-index="${index}" title="Copy prompt"><i class="fa-regular fa-copy"></i></button>
            <button type="button" class="wp-pawxai-icon-button wp-pawxai-save" data-pawxai-result-index="${index}" title="Save prompt"><i class="fa-regular fa-bookmark"></i></button>
            <button type="button" class="wp-pawxai-icon-button wp-pawxai-delete-result" data-pawxai-result-index="${index}" title="Remove from view"><i class="fa-solid fa-xmark"></i></button>
        </div></div>
        <div class="wp-pawxai-prompt-text">${escapeHtml(result.prompt)}</div>
    </article>`;
}

function renderGenerate(settings, source, generating) {
    const lastRun = settings.lastRun;
    const sourceName = source?.characterName || lastRun?.characterName || 'No active character';
    const sourceText = source?.message || 'Open a roleplay chat with a character message, then return here.';
    const results = Array.isArray(lastRun?.prompts) ? lastRun.prompts : [];
    return `<section class="wp-pawxai-create">
        <div class="wp-pawxai-source-card">
            <div class="wp-pawxai-source-top"><div class="wp-pawxai-source-label"><i class="fa-solid fa-comment-dots"></i> Latest from ${escapeHtml(sourceName)}</div>
                <button type="button" id="wp-pawxai-refresh-source" class="wp-pawxai-icon-button" title="Check for the latest character message"><i class="fa-solid fa-rotate"></i></button>
            </div>
            <p>${escapeHtml(sourceText)}</p>
        </div>
        <div class="wp-pawxai-quick-row">
            <label>Prompts
                <input id="wp-pawxai-count-quick" type="number" min="1" max="${PAWXAI_MAX_PROMPTS}" value="${settings.promptCount}" />
            </label>
            <label>Focus
                <select id="wp-pawxai-focus-quick">
                    ${option('balanced', 'Balanced', settings.focus)}
                    ${option('character', 'Character', settings.focus)}
                    ${option('environment', 'Environment', settings.focus)}
                    ${option('action', 'Action', settings.focus)}
                    ${option('cinematic', 'Cinematic', settings.focus)}
                </select>
            </label>
        </div>
        <button type="button" id="wp-pawxai-generate" class="wp-pawxai-generate"${generating || !source ? ' disabled' : ''}>
            <i class="fa-solid fa-${generating ? 'spinner fa-spin' : 'paw'}"></i>
            ${generating ? 'Writing prompts…' : `Generate ${settings.promptCount} prompt${settings.promptCount === 1 ? '' : 's'}`}
        </button>
        ${results.length ? `<div class="wp-pawxai-results-head"><span>${escapeHtml(lastRun.characterName)} set</span><small>${results.length} prompt${results.length === 1 ? '' : 's'}</small></div>
            <div class="wp-pawxai-results">${results.map(resultCard).join('')}</div>` : `<div class="wp-pawxai-empty">
                <i class="fa-solid fa-sparkles"></i>
                <strong>Turn the latest scene into something drawable.</strong>
                <span>PawXai writes portable SDXL-style prompts for the generator of your choice.</span>
            </div>`}
    </section>`;
}

function renderSaved(savedPrompts, selectedCharacter, formatRelativeTime) {
    const groups = groupSavedPawXaiPrompts(savedPrompts);
    if (!groups.length) return `<div class="wp-pawxai-empty wp-pawxai-saved-empty"><i class="fa-regular fa-bookmark"></i><strong>No saved prompts yet.</strong><span>Save any result and it will appear here under its character.</span></div>`;
    const selected = groups.find(group => group.characterName === selectedCharacter);
    if (!selected) return `<div class="wp-pawxai-character-list">
        <div class="wp-pawxai-library-intro"><strong>Saved by character</strong><small>Choose a name to open their prompt collection.</small></div>
        ${groups.map(group => `<button type="button" class="wp-pawxai-character-row" data-pawxai-character="${escapeHtml(group.characterName)}">
            <span class="wp-pawxai-character-avatar">${escapeHtml(group.characterName.charAt(0).toUpperCase())}</span>
            <span><strong>${escapeHtml(group.characterName)}</strong><small>${group.prompts.length} saved prompt${group.prompts.length === 1 ? '' : 's'}</small></span>
            <i class="fa-solid fa-chevron-right"></i>
        </button>`).join('')}
    </div>`;
    return `<div class="wp-pawxai-library-detail">
        <button type="button" class="wp-pawxai-library-back"><i class="fa-solid fa-arrow-left"></i> All characters</button>
        <header class="wp-pawxai-library-heading"><span class="wp-pawxai-character-avatar">${escapeHtml(selected.characterName.charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(selected.characterName)}</strong><small>${selected.prompts.length} saved prompt${selected.prompts.length === 1 ? '' : 's'}</small></div></header>
        <div class="wp-pawxai-library">${selected.prompts.map(entry => `<article class="wp-pawxai-saved-card">
            <div class="wp-pawxai-card-head"><span class="wp-pawxai-prompt-title">${escapeHtml(entry.title || 'Saved prompt')}</span><div>
                <button type="button" class="wp-pawxai-icon-button wp-pawxai-copy-saved" data-pawxai-saved-id="${escapeHtml(entry.id)}" title="Copy prompt"><i class="fa-regular fa-copy"></i></button>
                <button type="button" class="wp-pawxai-icon-button wp-pawxai-delete-saved" data-pawxai-saved-id="${escapeHtml(entry.id)}" title="Delete prompt"><i class="fa-solid fa-trash"></i></button>
            </div></div>
            <div class="wp-pawxai-prompt-text">${escapeHtml(entry.prompt)}</div>
            <small class="wp-pawxai-saved-time">${escapeHtml(formatRelativeTime(entry.createdAt))}</small>
        </article>`).join('')}</div>
    </div>`;
}

function modelQuickfills() {
    return `<div class="wp-settings-recommend-row"><span class="wp-settings-recommend-label">Quick fill:</span>
        <button type="button" class="wp-btn-sm wp-model-quickfill" data-input-id="wp-pawxai-model" data-model="${RECOMMENDED_PHONE_MODEL}">${RECOMMENDED_PHONE_MODEL}</button>
        ${ALTERNATE_PHONE_MODELS.map(model => `<button type="button" class="wp-btn-sm wp-model-quickfill" data-input-id="wp-pawxai-model" data-model="${model}">${model}</button>`).join('')}
    </div>`;
}

function renderSettings(settings, currentLiveModel) {
    return `<div class="wp-settings wp-pawxai-settings">
        <a class="wp-pawxai-referral-card" href="https://pixai.art/referral?refCode=YB7SKUFW&amp;utm_source=referral" target="_blank" rel="noopener noreferrer">
            <span class="wp-pawxai-referral-icon" aria-hidden="true"><i class="fa-solid fa-gift"></i></span>
            <span class="wp-pawxai-referral-copy">
                <strong>Make your prompts real with PixAI</strong>
                <span>Join PixAI and we both get 20,000 free credits!</span>
                <small>Referral code <b>YB7SKUFW</b></small>
            </span>
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
        </a>
        <div class="wp-settings-section">
            <div class="wp-settings-section-title">Generation</div>
            <label class="wp-settings-field wp-settings-field-column"><span>Default model <small>(blank = current chat model)</small></span>
                <div class="wp-settings-inline"><input id="wp-pawxai-model" type="text" placeholder="${escapeHtml(currentLiveModel || 'model id')}" value="${escapeHtml(settings.modelOverride)}" /><button type="button" class="wp-btn-sm wp-settings-use-current-model" data-input-id="wp-pawxai-model">Use current</button></div>
                ${modelQuickfills()}
            </label>
            <label class="wp-settings-field"><span>Prompts per set <small>(max ${PAWXAI_MAX_PROMPTS})</small></span><input id="wp-pawxai-count" type="number" min="1" max="${PAWXAI_MAX_PROMPTS}" value="${settings.promptCount}" /></label>
            <label class="wp-settings-field"><span>Focus</span><select id="wp-pawxai-focus">
                ${option('balanced', 'Balanced', settings.focus)}${option('character', 'Character', settings.focus)}${option('environment', 'Environment', settings.focus)}${option('action', 'Action', settings.focus)}${option('cinematic', 'Cinematic', settings.focus)}
            </select></label>
            <label class="wp-settings-field"><span>Framing</span><select id="wp-pawxai-framing">
                ${option('auto', 'Auto', settings.framing)}${option('portrait', 'Portrait', settings.framing)}${option('medium shot', 'Medium shot', settings.framing)}${option('full body', 'Full body', settings.framing)}${option('wide shot', 'Wide shot', settings.framing)}${option('dynamic angle', 'Dynamic angle', settings.framing)}
            </select></label>
            <label class="wp-settings-field"><span>Variation</span><select id="wp-pawxai-variation">
                ${option('close', 'Close variations', settings.variation)}${option('balanced', 'Balanced', settings.variation)}${option('wild', 'Wide variations', settings.variation)}
            </select></label>
            <label class="wp-settings-toggle-row"><span class="wp-settings-toggle-label">Use character card<span class="wp-settings-sub">Helps preserve appearance details not repeated in the latest message.</span></span><input id="wp-pawxai-description" type="checkbox"${settings.includeCharacterDescription ? ' checked' : ''} /></label>
        </div>
        <div class="wp-settings-section">
            <div class="wp-settings-section-title">Prompt Ingredients</div>
            <label class="wp-settings-field wp-settings-field-column"><span>Always work these in</span><textarea id="wp-pawxai-custom" rows="4" placeholder="camera tags, LoRA triggers, artist-free style tags…">${escapeHtml(settings.customFragments)}</textarea></label>
            <label class="wp-settings-field wp-settings-field-column"><span>Quality suffix</span><textarea id="wp-pawxai-quality" rows="3">${escapeHtml(settings.qualityTags)}</textarea></label>
            <div class="wp-settings-hint">Character prompts receive <strong>broad shoulders</strong>. Adult-only explicit scenes are preserved when they are present in the source.</div>
        </div>
        <div class="wp-settings-section wp-pawxai-feedback-block">
            <div class="wp-settings-section-title">Feedback to PawXai</div>
            <div class="wp-settings-hint">You can use this box to communicate directly with the model. Treat it like guidance for how PawXai should write every prompt.</div>
            <label class="wp-settings-field wp-settings-field-column"><span>Writing guidance</span><textarea id="wp-pawxai-feedback" rows="5" placeholder="Really focus on the tags for the hair!">${escapeHtml(settings.modelFeedback)}</textarea></label>
        </div>
        <div class="wp-settings-section">
            <div class="wp-settings-section-title">Color Palette</div>
            <div class="wp-pawxai-palette-grid">
                ${PAWXAI_PALETTES.map(palette => `<button type="button" class="wp-pawxai-palette-button${palette.id === settings.palette ? ' wp-selected' : ''}" data-palette="${palette.id}" aria-pressed="${palette.id === settings.palette}">
                    <span class="wp-pawxai-palette-swatches" aria-hidden="true">${palette.colors.map(color => `<i style="background:${color}"></i>`).join('')}</span>
                    <span>${escapeHtml(palette.label)}</span>
                </button>`).join('')}
            </div>
        </div>
    </div>`;
}

/** @param {HTMLElement} container */
export function renderPawXaiScreen(container, { settings, activeTab = 'generate', selectedSavedCharacter = null, source, generating = false, currentLiveModel = '', formatRelativeTime = () => '' }) {
    const savedCount = settings.savedPrompts.length;
    const content = activeTab === 'saved'
        ? renderSaved(settings.savedPrompts, selectedSavedCharacter, formatRelativeTime)
        : activeTab === 'settings'
            ? renderSettings(settings, currentLiveModel)
            : renderGenerate(settings, source, generating);
    container.innerHTML = `<div class="wp-pawxai">
        <header class="wp-pawxai-masthead"><span class="wp-pawxai-logo"><img src="${ASSET_BASE_URL}/weyphone_pawxai.webp" alt="" /></span><div><strong>PawXai</strong><small>Scene to SDXL prompt studio</small></div></header>
        ${tabs(activeTab, savedCount)}
        <div class="wp-pawxai-content">${content}</div>
    </div>`;
}
