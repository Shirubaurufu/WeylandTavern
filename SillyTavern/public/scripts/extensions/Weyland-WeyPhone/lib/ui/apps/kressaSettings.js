// lib/ui/apps/kressaSettings.js

import { RECOMMENDED_PHONE_MODEL, ALTERNATE_PHONE_MODELS } from './settings.js';

// Curated rather than free-form so every option keeps message contrast readable. The three colors
// are also used by the settings swatches; the full surface mapping lives in style.css.
export const KRESSA_PALETTES = Object.freeze([
    { id: 'twilight', label: 'Twilight', colors: ['#e9deef', '#c5a4d8', '#7c4fbd'] },
    { id: 'rosewood', label: 'Rosewood', colors: ['#f2e3eb', '#dbaec5', '#a34276'] },
    { id: 'cyberberry', label: 'Cyberberry', colors: ['#fff9fa', '#8b233f', '#701a33'] },
    { id: 'midnight-violet', label: 'Midnight Violet', colors: ['#171322', '#44305f', '#b58ae8'] },
    { id: 'lavender-latte', label: 'Lavender Latte', colors: ['#ede4df', '#d2b9d4', '#805688'] },
    { id: 'ocean-bloom', label: 'Ocean Bloom', colors: ['#dfecef', '#b6d1d7', '#3f7891'] },
    { id: 'forest-sprite', label: 'Forest Sprite', colors: ['#e4ece6', '#bcd2c1', '#456f59'] },
    { id: 'ember-plum', label: 'Golden Hour', colors: ['#fff5df', '#e7b75d', '#a74f23'] },
    { id: 'night-owl', label: 'Night Owl', colors: ['#17151a', '#4a2530', '#b4677a'] },
    { id: 'terminal-bloom', label: 'Terminal Bloom', colors: ['#10191a', '#263c3e', '#ff79bd'] },
]);

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Kressa's own settings cog: her model selection and visual palette. The model stays deliberately
 * separate from the phone-wide override; blank means the LIVE main-chat model.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{settings: {kressaModel?: string}, currentLiveModel: string}} state
 */
export function renderKressaSettingsScreen(container, { settings, currentLiveModel }) {
    const activePalette = KRESSA_PALETTES.some(palette => palette.id === settings.kressaPalette)
        ? settings.kressaPalette
        : 'twilight';
    container.innerHTML = `
<div class="wp-settings wp-kressa-settings">
    <div class="wp-settings-section">
        <div class="wp-settings-section-title">Color Palette</div>
        <div class="wp-kressa-palette-grid">
            ${KRESSA_PALETTES.map(palette => `
            <button type="button" class="wp-kressa-palette-button${palette.id === activePalette ? ' wp-selected' : ''}" data-palette="${palette.id}" aria-pressed="${palette.id === activePalette}">
                <span class="wp-kressa-palette-swatches" aria-hidden="true">${palette.colors.map(color => `<i style="background:${color}"></i>`).join('')}</span>
                <span>${palette.label}</span>
            </button>`).join('')}
        </div>
    </div>
    <div class="wp-settings-section">
        <div class="wp-settings-section-title">Kressa's Model</div>
        <label class="wp-settings-field wp-settings-field-column" title="Model ID used only for Kressa's replies. Leave blank to use whatever model your chat is currently connected to — recommended, so Kressa always feels like the real thing.">
            <span>Model for Kressa <small>(blank = current chat model, recommended)</small></span>
            <div class="wp-settings-inline">
                <input id="wp-kressa-model" type="text" placeholder="${escapeHtml(currentLiveModel || 'model id')}" value="${escapeHtml(settings.kressaModel ?? '')}" />
            </div>
            <div class="wp-settings-recommend-row">
                <span class="wp-settings-recommend-label">Quick fill:</span>
                <button type="button" class="wp-btn-sm wp-model-quickfill" data-input-id="wp-kressa-model" data-model="${RECOMMENDED_PHONE_MODEL}">${RECOMMENDED_PHONE_MODEL}</button>
                ${ALTERNATE_PHONE_MODELS.map(m => `<button type="button" class="wp-btn-sm wp-model-quickfill" data-input-id="wp-kressa-model" data-model="${m}">${m}</button>`).join('')}
            </div>
            <small class="wp-settings-recommend-disclaimer">By default Kressa runs on your live chat model so her dedicated assistant app stays capable. Set a model here only if you want her on something cheaper.</small>
        </label>
    </div>
    <div class="wp-settings-section">
        <div class="wp-settings-section-title">Kressa's Behavior</div>
        <label class="wp-settings-toggle-row">
            <span class="wp-settings-toggle-label">Allow Hard Mode for Kressa<span class="wp-settings-sub">Apply Weyland Hard Mode to Kressa while the global Hard Mode toggle is on</span></span>
            <span class="wp-toggle-switch">
                <input id="wp-kressa-hard-mode" class="wp-toggle-input" type="checkbox" ${settings.kressaHardModeEnabled ? 'checked' : ''} />
                <span class="wp-toggle-track"><span class="wp-toggle-thumb"></span></span>
            </span>
        </label>
        <div class="wp-settings-hint">Off by default. Kressa ignores the global storytelling modifier unless you enable this setting.</div>
    </div>
</div>`;
}
