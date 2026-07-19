import { ASSET_BASE_URL } from '../../assetPaths.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function headerMarkup(characterName = '', showFullscreen = false) {
    return `
<div class="wp-mien-header">
    <span class="wp-mien-header-actions wp-mien-header-actions-left">
        <button type="button" id="wp-mien-refresh" title="Reload expressions" aria-label="Reload expressions"><i class="fa-solid fa-rotate"></i></button>
        ${showFullscreen ? '<button type="button" id="wp-mien-fullscreen" title="Full-screen expression" aria-label="View expression full screen"><i class="fa-solid fa-expand"></i></button>' : ''}
    </span>
    <span class="wp-mien-brand"><span class="wp-mien-mark"><img src="${ASSET_BASE_URL}/weyphone_mien_2.webp" alt="" /></span><span class="wp-mien-heading"><strong>Mien</strong>${characterName ? `<small>${escapeHtml(characterName)}</small>` : ''}</span></span>
    <span class="wp-mien-header-actions wp-mien-header-actions-right">
        <button type="button" class="wp-inline-help" data-app-key="mien" title="What is this?" aria-label="What is this?"><i class="fa-solid fa-circle-question"></i></button>
    </span>
</div>`;
}

function displayLabels(expressions) {
    const totals = new Map();
    const seen = new Map();
    for (const expression of expressions) totals.set(expression.label, (totals.get(expression.label) ?? 0) + 1);
    return expressions.map(expression => {
        const position = (seen.get(expression.label) ?? 0) + 1;
        seen.set(expression.label, position);
        return totals.get(expression.label) > 1 ? `${expression.label} · ${position}` : expression.label;
    });
}

export function renderMienScreen(container, {
    gallery = null,
    selectedIndex = 0,
    loading = false,
    applying = false,
    error = '',
    appliedLabel = '',
    fullscreen = false,
} = {}) {
    const characterName = gallery?.character?.name ?? '';
    const header = headerMarkup(characterName, Boolean(gallery?.expressions?.length));
    if (loading) {
        container.innerHTML = `${header}
<div class="wp-mien-state"><i class="fa-solid fa-circle-notch fa-spin"></i><strong>Opening the expression case…</strong><span>Checking local sprites and Registrar galleries.</span></div>`;
        return;
    }
    if (error) {
        container.innerHTML = `${header}
<div class="wp-mien-state wp-mien-error"><i class="fa-solid fa-face-frown-open"></i><strong>Gallery unavailable</strong><span>${escapeHtml(error)}</span><button type="button" id="wp-mien-retry">Try again</button></div>`;
        return;
    }
    if (!gallery?.character) {
        container.innerHTML = `${header}
<div class="wp-mien-state"><i class="fa-regular fa-images"></i><strong>No character selected</strong><span>Open a character chat, then come back to Mien.</span></div>`;
        return;
    }
    if (!gallery.expressions?.length) {
        container.innerHTML = `${header}
<div class="wp-mien-state"><i class="fa-regular fa-face-meh"></i><strong>No expression gallery found</strong><span>${escapeHtml(characterName)} does not currently have local or Registrar expressions available.</span></div>`;
        return;
    }

    const index = Math.max(0, Math.min(gallery.expressions.length - 1, selectedIndex));
    const selected = gallery.expressions[index];
    const labels = displayLabels(gallery.expressions);
    const sourceLabel = gallery.source === 'registrar' ? 'Registrar gallery' : 'Installed sprites';
    const outfits = gallery.outfits?.length ? gallery.outfits : [{
        id: gallery.selectedOutfitId || 'current',
        label: gallery.outfit || gallery.folderName || 'Current outfit',
    }];
    if (fullscreen) {
        container.innerHTML = `
<div class="wp-mien-fullscreen-view">
    <button type="button" id="wp-mien-fullscreen-exit" title="Exit full screen" aria-label="Exit full screen"><i class="fa-solid fa-compress"></i></button>
    <button type="button" class="wp-mien-step wp-mien-fullscreen-prev" id="wp-mien-prev" aria-label="Previous expression"${gallery.expressions.length < 2 ? ' disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
    <figure class="wp-mien-fullscreen-figure">
        <img src="${escapeHtml(selected.path)}" alt="${escapeHtml(labels[index])}" />
        <figcaption><strong>${escapeHtml(labels[index])}</strong><span>${escapeHtml(outfits.find(outfit => outfit.id === gallery.selectedOutfitId)?.label ?? '')}</span></figcaption>
    </figure>
    <button type="button" class="wp-mien-step wp-mien-fullscreen-next" id="wp-mien-next" aria-label="Next expression"${gallery.expressions.length < 2 ? ' disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
    <button type="button" id="wp-mien-apply" class="wp-mien-apply wp-mien-fullscreen-apply"${applying ? ' disabled' : ''}><i class="fa-solid ${applying ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'}"></i>${applying ? 'Setting…' : 'Set in chat'}</button>
</div>`;
        return;
    }
    container.innerHTML = `${header}
<div class="wp-mien">
    <div class="wp-mien-toolbar">
        <label class="wp-mien-outfit-label" for="wp-mien-outfit"><i class="fa-solid fa-shirt"></i><span class="wp-sr-only">Outfit</span>
            <select id="wp-mien-outfit" aria-label="Outfit">
                ${outfits.map(outfit => `<option value="${escapeHtml(outfit.id)}"${outfit.id === gallery.selectedOutfitId ? ' selected' : ''}>${escapeHtml(outfit.label)}</option>`).join('')}
            </select>
        </label>
        <span class="wp-mien-count">${gallery.expressions.length} expression${gallery.expressions.length === 1 ? '' : 's'}</span>
    </div>
    <div class="wp-mien-meta"><span>${escapeHtml(sourceLabel)}</span><span>${outfits.length} outfit${outfits.length === 1 ? '' : 's'}</span></div>
    <div class="wp-mien-stage" data-mien-stage>
        <button type="button" class="wp-mien-step" id="wp-mien-prev" aria-label="Previous expression"${gallery.expressions.length < 2 ? ' disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
        <figure class="wp-mien-preview">
            <img src="${escapeHtml(selected.path)}" alt="${escapeHtml(labels[index])}" />
            <figcaption>${escapeHtml(labels[index])}</figcaption>
        </figure>
        <button type="button" class="wp-mien-step" id="wp-mien-next" aria-label="Next expression"${gallery.expressions.length < 2 ? ' disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
    </div>
    <button type="button" id="wp-mien-apply" class="wp-mien-apply"${applying ? ' disabled' : ''}>
        <i class="fa-solid ${applying ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'}"></i>
        ${applying ? 'Setting expression…' : 'Set in chat'}
    </button>
    ${appliedLabel ? `<div class="wp-mien-applied"><i class="fa-solid fa-check"></i> ${escapeHtml(appliedLabel)} is set until the next character message.</div>` : '<div class="wp-mien-hint">Browsing here will not change the chat. Only “Set in chat” applies an expression.</div>'}
    <div class="wp-mien-strip" role="list" aria-label="Expressions">
        ${gallery.expressions.map((expression, expressionIndex) => `
        <button type="button" class="wp-mien-thumb${expressionIndex === index ? ' wp-selected' : ''}" data-mien-index="${expressionIndex}" role="listitem" title="${escapeHtml(labels[expressionIndex])}" aria-label="${escapeHtml(labels[expressionIndex])}">
            <img src="${escapeHtml(expression.path)}" alt="" loading="lazy" />
            <span>${escapeHtml(labels[expressionIndex])}</span>
        </button>`).join('')}
    </div>
</div>`;
}
