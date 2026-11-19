import { ASSET_BASE_URL } from '../../assetPaths.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * The NSFW switch is the same setting as "Hide/Show NSFW Images/Costumes" in the chat bar's Costumes & Backgrounds
 * menu (global NSFW, inverted: true = hidden). It sits here because Mien is where players see the outfits it hides.
 */
function nsfwButton(nsfwHidden) {
    const title = nsfwHidden ? 'NSFW images are hidden. Tap to show them.' : 'NSFW images are shown. Tap to hide them.';
    return `<button type="button" id="wp-mien-nsfw" class="wp-mien-nsfw${nsfwHidden ? '' : ' is-on'}" aria-pressed="${!nsfwHidden}" title="${title}" aria-label="${title}"><i class="fa-solid ${nsfwHidden ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i><span>18+</span></button>`;
}

function headerMarkup(characterName = '', showFullscreen = false, nsfwHidden = null) {
    return `
<div class="wp-mien-header">
    <span class="wp-mien-header-actions wp-mien-header-actions-left">
        <button type="button" id="wp-mien-refresh" title="Reload expressions" aria-label="Reload expressions"><i class="fa-solid fa-rotate"></i></button>
        ${showFullscreen ? '<button type="button" id="wp-mien-fullscreen" title="Full-screen expression" aria-label="View expression full screen"><i class="fa-solid fa-expand"></i></button>' : ''}
    </span>
    <span class="wp-mien-brand"><span class="wp-mien-mark"><img src="${ASSET_BASE_URL}/weyphone_mien_2.webp" alt="" /></span><span class="wp-mien-heading"><strong>Mien</strong>${characterName ? `<small>${escapeHtml(characterName)}</small>` : ''}</span></span>
    <span class="wp-mien-header-actions wp-mien-header-actions-right">
        ${nsfwHidden === null ? '' : nsfwButton(nsfwHidden)}
        <button type="button" class="wp-inline-help" data-app-key="mien" title="What is this?" aria-label="What is this?"><i class="fa-solid fa-circle-question"></i></button>
    </span>
</div>`;
}

/** Corner badge on a bonus-outfit face that needs Paw Patrol Plus. */
const PLUS_BADGE = '<span class="wp-mien-plus-badge"><i class="fa-solid fa-lock" aria-hidden="true"></i> Plus</span>';

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

/**
 * Wear / Keep on, the part of the old wand-menu costume picker Mien didn't have. Only for installed sprites on a
 * card whose costume quick-reply-ext runs (wardrobe.supported); everything else keeps Mien as a pure gallery.
 * wardrobe = WeylandOutfits.describe() plus `busy`; `extraOutfit` = this outfit needs Paw Patrol Plus or above.
 */
function wardrobeMarkup(gallery, wardrobe, outfit) {
    if (!wardrobe?.supported || gallery.source !== 'local' || !outfit) return '';
    const extraOutfit = Boolean(outfit.extra);
    const folder = gallery.folderName;
    const name = escapeHtml(outfit.label);
    // On a duo card the pick is also WHO is shown ("Lyris", "Lyris & Vesper"), so the notes name the set.
    const character = escapeHtml(gallery.duo ? outfit.setLabel ?? '' : gallery.character?.name ?? '');
    const worn = folder === wardrobe.wearing;
    const picked = worn && folder === wardrobe.pick;
    const stuck = picked && wardrobe.stick;
    const locked = extraOutfit && !wardrobe.member;
    const busy = Boolean(wardrobe.busy);
    let wear;
    if (locked) {
        wear = `<button type="button" id="wp-mien-wear" class="wp-mien-wear" disabled><i class="fa-solid fa-crown"></i>Plus outfit</button>`;
    } else if (picked) {
        const back = gallery.duo ? 'Go back to the scene deciding who is shown and what they wear' : `Go back to what the story has ${character} wearing`;
        wear = `<button type="button" id="wp-mien-wear" class="wp-mien-wear is-worn" data-mien-wear="off"${busy ? ' disabled' : ''} title="${back}"><i class="fa-solid fa-rotate-left"></i>Take off</button>`;
    } else if (worn) {
        wear = `<button type="button" id="wp-mien-wear" class="wp-mien-wear is-worn" disabled><i class="fa-solid fa-check"></i>Wearing now</button>`;
    } else {
        wear = `<button type="button" id="wp-mien-wear" class="wp-mien-wear" data-mien-wear="on"${busy ? ' disabled' : ''}><i class="fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-shirt'}"></i>Wear ${name}</button>`;
    }
    const stick = `<button type="button" id="wp-mien-stick" class="wp-mien-stick${stuck ? ' is-on' : ''}" aria-pressed="${stuck}"${locked || busy ? ' disabled' : ''}
        title="${stuck ? `Let the story change ${character}'s outfit again` : `Keep ${character} in this outfit, whatever the story's outfit codes say`}">
        <i class="fa-solid fa-thumbtack"></i><span>${stuck ? 'Kept on' : 'Keep on'}</span></button>`;
    let note = '';
    if (locked) note = 'Wearing bonus outfits is a Paw Patrol Plus perk. Their neutral face is free for everyone.';
    else if (stuck && gallery.duo) note = `${character} stays on screen in ${name} in this chat. Moods still change.`;
    else if (stuck) note = `${character} stays in ${name} in this chat. Moods still change.`;
    else if (picked && gallery.duo && wardrobe.autoCostumes) note = `Showing ${character} in ${name} until the story changes outfits. Keep on holds it.`;
    else if (picked && wardrobe.autoCostumes) note = `Wearing ${name} until the story changes outfits. Keep on holds it.`;
    else if (picked) note = `Wearing ${name}. Auto-Costumes is off, so it stays until you pick another.`;
    return `
    <div class="wp-mien-wardrobe">${wear}${stick}</div>
    ${note ? `<div class="wp-mien-wardrobe-note">${note}</div>` : ''}`;
}

/**
 * Duo cards: one pill per sprite set that has outfits ("Lyris & Vesper", "Lyris", "Vesper"). Picking one only
 * changes what Mien is browsing; Wear is what puts that set on screen. The set showing in the chat gets a dot.
 */
function castMarkup(gallery, wardrobe) {
    if (!gallery.duo) return '';
    const sets = [];
    for (const outfit of gallery.outfits ?? []) {
        if (!sets.some(set => set.base === outfit.set)) sets.push({ base: outfit.set, label: outfit.setLabel });
    }
    if (sets.length < 2) return '';
    const browsing = gallery.outfits.find(outfit => outfit.id === gallery.selectedOutfitId)?.set;
    const showing = String(wardrobe?.wearing ?? '').split('/')[0];
    return `
    <div class="wp-mien-cast" role="group" aria-label="Who's showing">
        ${sets.map(set => `<button type="button" class="wp-mien-cast-pill${set.base === browsing ? ' is-on' : ''}" data-mien-set="${escapeHtml(set.base)}" aria-pressed="${set.base === browsing}"${set.base === showing ? ' title="On screen now"' : ''}>${set.base === showing ? '<span class="wp-mien-cast-dot" aria-hidden="true"></span>' : ''}${escapeHtml(set.label)}</button>`).join('')}
    </div>`;
}

/** Outfit picker label: marks what she has on and which outfits need Paw Patrol Plus to wear. */
function outfitOptionLabel(outfit, wardrobe) {
    if (!wardrobe?.supported || outfit.source !== 'local') return outfit.label;
    if (outfit.folderName === wardrobe.wearing) return `${outfit.label} · wearing`;
    if (outfit.extra && !wardrobe.member) return `${outfit.label} · Plus`;
    return outfit.label;
}

export function renderMienScreen(container, {
    gallery = null,
    selectedIndex = 0,
    loading = false,
    applying = false,
    error = '',
    appliedLabel = '',
    fullscreen = false,
    lockedLabel = '',
    wardrobe = null,
    nsfwHidden = null,
} = {}) {
    const characterName = gallery?.character?.name ?? '';
    const header = headerMarkup(characterName, Boolean(gallery?.expressions?.length), nsfwHidden);
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
    // A bonus-outfit face that needs Paw Patrol Plus (lockBonusFaces in lib/mien.js): shown dimmed, not usable.
    const faceLocked = Boolean(selected.plusLocked);
    const labels = displayLabels(gallery.expressions);
    const sourceLabel = gallery.source === 'registrar' ? 'Registrar gallery' : 'Installed sprites';
    const outfits = gallery.outfits?.length ? gallery.outfits : [{
        id: gallery.selectedOutfitId || 'current',
        label: gallery.outfit || gallery.folderName || 'Current outfit',
    }];
    // A duo card's outfit picker lists the set being browsed (see castMarkup); everyone else gets every outfit.
    const browsingSet = gallery.duo ? outfits.find(outfit => outfit.id === gallery.selectedOutfitId)?.set : null;
    const pickerOutfits = browsingSet ? outfits.filter(outfit => outfit.set === browsingSet) : outfits;
    if (fullscreen) {
        container.innerHTML = `
<div class="wp-mien-fullscreen-view">
    <button type="button" id="wp-mien-fullscreen-exit" title="Exit full screen" aria-label="Exit full screen"><i class="fa-solid fa-compress"></i></button>
    <button type="button" class="wp-mien-step wp-mien-fullscreen-prev" id="wp-mien-prev" aria-label="Previous expression"${gallery.expressions.length < 2 ? ' disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
    <figure class="wp-mien-fullscreen-figure${faceLocked ? ' is-plus-locked' : ''}">
        <img src="${escapeHtml(selected.path)}" alt="${escapeHtml(labels[index])}" />
        ${faceLocked ? PLUS_BADGE : ''}
        <figcaption><strong>${escapeHtml(labels[index])}</strong><span>${escapeHtml(outfits.find(outfit => outfit.id === gallery.selectedOutfitId)?.label ?? '')}</span></figcaption>
    </figure>
    <button type="button" class="wp-mien-step wp-mien-fullscreen-next" id="wp-mien-next" aria-label="Next expression"${gallery.expressions.length < 2 ? ' disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
    <button type="button" id="wp-mien-apply" class="wp-mien-apply wp-mien-fullscreen-apply"${applying || faceLocked ? ' disabled' : ''}><i class="fa-solid ${applying ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'}"></i>${applying ? 'Setting…' : 'Set in chat'}</button>
</div>`;
        return;
    }
    container.innerHTML = `${header}
<div class="wp-mien">
    ${castMarkup(gallery, wardrobe)}
    <div class="wp-mien-toolbar">
        <label class="wp-mien-outfit-label" for="wp-mien-outfit"><i class="fa-solid fa-shirt"></i><span class="wp-sr-only">Outfit</span>
            <select id="wp-mien-outfit" aria-label="Outfit">
                ${pickerOutfits.map(outfit => `<option value="${escapeHtml(outfit.id)}"${outfit.id === gallery.selectedOutfitId ? ' selected' : ''}>${escapeHtml(outfitOptionLabel(outfit, wardrobe))}</option>`).join('')}
            </select>
        </label>
        <span class="wp-mien-count">${gallery.expressions.length} expression${gallery.expressions.length === 1 ? '' : 's'}</span>
    </div>
    <div class="wp-mien-meta"><span>${escapeHtml(sourceLabel)}</span><span>${pickerOutfits.length} outfit${pickerOutfits.length === 1 ? '' : 's'}</span></div>
    ${creditLine(gallery.duo ? gallery.setCredits?.[outfits.find(outfit => outfit.id === gallery.selectedOutfitId)?.set] ?? gallery.credit : gallery.credit)}
    ${wardrobeMarkup(gallery, wardrobe, outfits.find(outfit => outfit.id === gallery.selectedOutfitId))}
    <div class="wp-mien-stage" data-mien-stage>
        <button type="button" class="wp-mien-step" id="wp-mien-prev" aria-label="Previous expression"${gallery.expressions.length < 2 ? ' disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
        <figure class="wp-mien-preview${faceLocked ? ' is-plus-locked' : ''}">
            <img src="${escapeHtml(selected.path)}" alt="${escapeHtml(labels[index])}" title="Tap to view full screen" />
            ${faceLocked ? PLUS_BADGE : ''}
            <figcaption>${escapeHtml(labels[index])}</figcaption>
        </figure>
        <button type="button" class="wp-mien-step" id="wp-mien-next" aria-label="Next expression"${gallery.expressions.length < 2 ? ' disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
    </div>
    <div class="wp-mien-apply-row">
        <button type="button" id="wp-mien-apply" class="wp-mien-apply"${applying || faceLocked ? ' disabled' : ''}>
            <i class="fa-solid ${applying ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'}"></i>
            ${applying ? 'Setting expression…' : 'Set in chat'}
        </button>
        <button type="button" id="wp-mien-lock" class="wp-mien-lock${lockedLabel ? ' is-locked' : ''}" aria-pressed="${Boolean(lockedLabel)}"${faceLocked && !lockedLabel ? ' disabled' : ''}
            title="${lockedLabel ? `Unlock ${lockedLabel}` : 'Lock the selected expression so character messages cannot change it'}"
            aria-label="${lockedLabel ? `Unlock ${lockedLabel}` : 'Lock the selected expression'}">
            <i class="fa-solid ${lockedLabel ? 'fa-lock' : 'fa-lock-open'}" aria-hidden="true"></i>
            <span>${lockedLabel ? `Locked: ${escapeHtml(lockedLabel)}` : 'Lock'}</span>
        </button>
    </div>
    ${appliedLabel ? `<div class="wp-mien-applied"><i class="fa-solid fa-check"></i> ${escapeHtml(appliedLabel)} is set until the next character message.</div>`
        : lockedLabel ? `<div class="wp-mien-applied"><i class="fa-solid fa-lock"></i> ${escapeHtml(lockedLabel)} is locked. Character messages will not change it.</div>`
        : faceLocked ? '<div class="wp-mien-hint"><i class="fa-solid fa-lock"></i> Bonus outfits open every face with Paw Patrol Plus. Neutral is free for everyone.</div>'
        : `<div class="wp-mien-hint">${wardrobe?.supported && gallery.source === 'local'
            ? 'Browsing here will not change the chat. “Wear” changes the outfit, “Set in chat” shows one face.'
            : 'Browsing here will not change the chat. Only “Set in chat” applies an expression.'}</div>`}
    <div class="wp-mien-strip" role="list" aria-label="Expressions">
        ${gallery.expressions.map((expression, expressionIndex) => `
        <button type="button" class="wp-mien-thumb${expressionIndex === index ? ' wp-selected' : ''}${expression.plusLocked ? ' is-plus-locked' : ''}" data-mien-index="${expressionIndex}" role="listitem" title="${escapeHtml(labels[expressionIndex])}${expression.plusLocked ? ' (Paw Patrol Plus)' : ''}" aria-label="${escapeHtml(labels[expressionIndex])}${expression.plusLocked ? ', needs Paw Patrol Plus' : ''}">
            <img src="${escapeHtml(expression.path)}" alt="" loading="lazy" />
            <span>${expression.plusLocked ? '<i class="fa-solid fa-lock" aria-hidden="true"></i> ' : ''}${escapeHtml(labels[expressionIndex])}</span>
        </button>`).join('')}
    </div>
</div>`;
}

// "Expressions by @artist" (and who removed the backgrounds), from the card's creator notes. Nothing when the card has none.
// It sits under the outfit/count rows, not after the thumbnail grid: down there it was ~1,000 px below the fold.
// On duo cards it is the credit of the set being browsed (one sister, one artist). Each line stays on one line;
// anything too long ends in "…" and the full text is in the tooltip.
function creditLine(credit) {
    if (!credit?.artist) return '';
    const main = `Expressions by ${credit.artist}`;
    const extra = credit.backgrounds ? `Backgrounds removed by ${credit.backgrounds}` : '';
    return `<div class="wp-mien-credit"><i class="fa-solid fa-paintbrush" aria-hidden="true"></i><span class="wp-mien-credit-text">`
        + `<span class="wp-mien-credit-line" title="${escapeHtml(main)}">Expressions by <strong>${escapeHtml(credit.artist)}</strong></span>`
        + (extra ? `<span class="wp-mien-credit-line wp-mien-credit-extra" title="${escapeHtml(extra)}">Backgrounds removed by <strong>${escapeHtml(credit.backgrounds)}</strong></span>` : '')
        + '</span></div>';
}
