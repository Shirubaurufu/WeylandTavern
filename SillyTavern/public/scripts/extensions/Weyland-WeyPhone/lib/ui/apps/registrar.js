// The Registrar is an editorial field guide, intentionally separate from the phone's chat UI.
import { ASSET_BASE_URL } from '../../assetPaths.js';
import { FILTER_FIELDS, normalizeRegistrarFilters, registrarFilterOptions, hiddenByRegistrarFilters } from '../../registrarFilters.js';

export function escapeRegistrar(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
const e = escapeRegistrar;
const labels = { character: 'Characters', location: 'Locations', collection: 'Collections', library: 'My world' };

function wipBadge(item) {
    return item.kind === 'character' && item.status === 'wip'
        ? '<span class="rg-wip-badge" title="Work in progress — this character is still being developed"><i class="fa-solid fa-pencil" aria-hidden="true"></i> WIP <span class="wp-sr-only">— Work in progress</span></span>' : '';
}

export function safePortrait(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && ['imagedelivery.net', 'registrar.weybooru.com'].includes(url.hostname) ? url.href : '';
    } catch { return ''; }
}

export function registrarLink(item) {
    const route = { character: 'character', location: 'location', collection: 'collections' }[item.kind];
    return route && /^\d+$/.test(String(item.id)) ? `https://registrar.weybooru.com/${route}/${item.id}` : 'https://registrar.weybooru.com/';
}

function art(item, large = false) {
    const url = safePortrait(item.portrait);
    const glyph = item.kind === 'location' ? '⌖' : item.kind === 'collection' ? '❧' : item.name.slice(0, 1);
    return `<div class="rg-art${large ? ' rg-art-large' : ''}" data-kind="${e(item.kind)}"><span aria-hidden="true">${e(glyph)}</span>${url ? `<img src="${e(url)}" alt="${e(item.name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}</div>`;
}

export function visibleRegistrarItems(state) {
    const sourceKeys = new Set(state.library?.sources.map(source => source.key) || []);
    const all = new Map((state.library?.items || []).map(item => [item.key, item]));
    // The live catalog copy is fresher (title/summary/portrait may have changed upstream), but only
    // the library copy carries `active` (load/unload state) - the catalog has no such concept, so a
    // naive overwrite would silently reset every item back to "loaded" on the next render.
    for (const item of state.items) all.set(item.key, all.has(item.key) ? { ...item, active: all.get(item.key).active } : item);
    // Removed/private upstream content remains manageable from the saved local import.
    for (const source of state.library?.sources || []) if (!all.has(source.key)) all.set(source.key, { ...source, id: source.key.split(':')[1], summary: 'Saved in your world. This entry is not currently in the public catalog.', members: source.members });
    let items = [...all.values()].filter(item => state.tab === 'library' ? sourceKeys.has(item.key) : item.kind === state.tab && state.items.some(row => row.key === item.key));
    if (state.tab !== 'library') items = items.filter(item => !hiddenByRegistrarFilters(item, state.browseFilters));
    const terms = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    items = items.filter(item => terms.every(term => [item.name, item.surname, item.summary, item.owner, item.species, item.major, ...(item.tags || [])].join(' ').toLowerCase().includes(term)));
    items.sort(state.sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
    return items;
}


function card(item, state, index) {
    const installed = state.library?.items.some(row => row.key === item.key) || state.library?.sources.some(row => row.key === item.key);
    const meta = item.kind === 'character' ? [item.age && `Age ${e(item.age)}`, item.tokens ? `${item.tokens.toLocaleString()} tokens` : ''].filter(Boolean).join(' · ') : '';
    const paused = state.tab === 'library' && item.active === false;
    const cardButton = `<button type="button" class="rg-card rg-card-${e(item.kind)}${paused ? ' rg-card-paused' : ''}" data-rg-open="${e(item.key)}">
        ${art(item)}<span class="rg-card-copy"><span class="rg-eyebrow">${item.kind === 'collection' ? `${item.members?.length || 0} people & places` : item.kind === 'location' ? 'Around Weyland' : e(item.species || 'Campus character')}${meta ? `<span class="rg-card-meta">${meta}</span>` : ''}</span>
        <strong>${e(item.name)}</strong>${wipBadge(item)}<span class="rg-summary">${e(item.summary)}</span>
        <span class="rg-card-foot"><span>${paused ? '<b class="rg-stamp">UNLOADED</b>' : installed ? '<b class="rg-stamp">IN YOUR WORLD</b>' : `by ${e(item.owner || 'the community')}`}</span><span aria-hidden="true">↗</span></span></span>
        <span class="rg-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span></button>`;
    // Toggling load state is a My World-only control, and only applies to items that get their own
    // World Info entries (not collections, which are just a reference list of other members).
    if (state.tab !== 'library' || item.kind === 'collection') return cardButton;
    return `<div class="rg-card-wrap">${cardButton}<button type="button" class="rg-load-toggle" data-rg-toggle="${e(item.key)}" title="${paused ? 'Load into your roleplays' : 'Unload without removing'}">${paused ? 'Load' : 'Unload'}</button></div>`;
}

function detail(item, state) {
    const source = state.library?.sources.find(row => row.key === item.key);
    const included = state.library?.sources.filter(row => row.members.includes(item.key)) || [];
    const memberKeys = item.members || source?.members || [];
    const members = memberKeys.map(key => state.items.find(row => row.key === key) || state.library?.items.find(row => row.key === key)).filter(Boolean);
    const date = item.updatedAt && !Number.isNaN(Date.parse(item.updatedAt)) ? new Date(item.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown';
    const canInstall = state.items.some(row => row.key === item.key) && !item.unavailable && (item.kind !== 'collection' || members.length > 0);
    return `<article class="rg-detail">
        <button type="button" class="rg-back" data-rg-action="back">← Back to ${e(labels[state.tab].toLowerCase())}</button>
        ${art(item, true)}
        <div class="rg-detail-heading">
            <div class="rg-detail-heading-name"><span class="rg-eyebrow">${e(item.kind)} · No. ${e(item.id)}</span><h2>${e(item.name)}</h2>${item.surname ? `<p class="rg-surname">${e(item.surname)}</p>` : ''}</div>
            <p class="rg-detail-summary">${e(item.summary)}</p>
            ${wipBadge(item)}${item.kind === 'character' && item.status === 'wip' ? '<p class="rg-wip-note">Work in progress: this character is still being developed. Their details may be incomplete or change in future updates.</p>' : ''}
            <div class="rg-byline">Created by <b>${e(item.owner || 'the community')}</b><br>Updated ${e(date)}</div>
        </div>
        <div class="rg-import-box"><span class="rg-eyebrow">${source ? 'In your world' : 'Not yet imported'}</span>
        <p>${item.kind === 'character' ? 'Imports their subbot, background and home lore.<br><br>No character card or greeting is created.' : item.kind === 'location' ? 'Imports its lore, denizens and sub-locations.' : `${members.filter(row => row.kind === 'character').length} characters and ${members.filter(row => row.kind === 'location').length} locations, gathered by their curator.<br><br>Shared entries are only imported once.`}</p>
        ${included.length && !source ? `<p class="rg-included">Already included through ${included.map(row => e(row.name)).join(', ')}.</p>` : ''}
        <button type="button" class="rg-primary" data-rg-install="${e(item.key)}" ${state.busy || !state.library || !canInstall ? 'disabled' : ''}>${state.busy ? 'Working…' : source ? 'Update this import' : 'Add to my world'} <span aria-hidden="true">↓</span></button>
        ${source ? `<button type="button" class="rg-text-button" data-rg-remove="${e(item.key)}" ${state.busy ? 'disabled' : ''}>Remove this import</button>` : ''}</div>
        ${item.kind === 'collection' ? `<section class="rg-members"><h3>Inside this collection</h3>${members.length ? members.map(row => `<button type="button" data-rg-open="${e(row.key)}"><span>${row.kind === 'location' ? '⌖' : '○'}</span><span>${e(row.name)}<small>${e(row.kind)}</small></span><span>→</span></button>`).join('') : '<p>No public members are available.</p>'}</section>` : Object.entries(item.details || {}).filter(([, value]) => value).map(([title, value]) => `<details class="rg-fold"><summary>${e(title)}</summary><p>${e(value)}</p></details>`).join('')}
        <a class="rg-site-link" href="${e(registrarLink(item))}" target="_blank" rel="noopener noreferrer">View or edit on the Registrar ↗</a>
    </article>`;
}

function settingsPanel(state) {
    const filters = normalizeRegistrarFilters(state.browseFilters);
    const options = registrarFilterOptions(state.items, filters);
    const filterNames = { gender: 'genders', species: 'species', tags: 'tags' };
    return `<div class="rg-dialog-shade"><section class="rg-dialog" role="dialog" aria-modal="true" aria-labelledby="rg-settings-title">
        <h2 id="rg-settings-title">Settings</h2>
        <details class="rg-browse-filters" ${state.filtersOpen ? 'open' : ''}><summary>Browse filters · ${FILTER_FIELDS.reduce((sum, field) => sum + filters[field].length, 0)} hidden labels</summary>
        <p>Check any genders, species or tags you want to hide from Characters. A match in any category hides the character. These preferences are saved automatically.</p>
        <p>Uses creator labels, so missing or inconsistent labels may slip through. My world and collections are unchanged; collections may still contain hidden characters.</p>
        ${FILTER_FIELDS.map(field => `<fieldset><legend>Hide ${filterNames[field]}</legend>
        <input type="search" data-rg-filter-search="${field}" aria-label="Search ${filterNames[field]}" placeholder="Search ${filterNames[field]}…" value="${e(state.filterSearch?.[field] || '')}">
        <div class="rg-filter-options">${options[field].map(([value, label], index) => `<label data-rg-filter-option ${label.toLowerCase().includes((state.filterSearch?.[field] || '').trim().toLowerCase()) ? '' : 'hidden'}><input id="rg-filter-${field}-${index}" type="checkbox" data-rg-filter="${field}" value="${e(value)}" ${filters[field].includes(value) ? 'checked' : ''}> <span>${e(label)}</span></label>`).join('') || '<p>No labels available in the current catalog.</p>'}</div></fieldset>`).join('')}
        <button type="button" data-rg-action="clearFilters">Clear all filters</button></details>
        <div class="rg-settings-row"><div><strong>Scan for updates</strong><small>Checks your downloads for newer versions. Scanning does not apply updates.</small></div><button type="button" data-rg-action="scanUpdates" ${state.loading || state.busy ? 'disabled' : ''}>${state.loading ? 'Scanning…' : 'Scan'}</button></div>
        ${state.scanResult ? `<p class="rg-token-note" role="status">${e(state.scanResult)}</p>` : ''}
        ${state.error ? `<p class="rg-token-note" role="alert">${e(state.error)}</p>` : ''}
        ${state.pendingUpdates?.length ? `<div class="rg-settings-row"><div><strong>Update your downloads</strong><small>Downloads and applies all updates found by the scan. Loaded and unloaded entries keep their current settings.</small></div><button type="button" data-rg-action="updateAll" ${state.busy || state.loading ? 'disabled' : ''}>${state.updatingAll ? 'Updating…' : 'Update all'}</button></div>` : ''}
        <div class="rg-settings-row"><div><strong>Load new imports automatically</strong><small>Off starts every new import unloaded, so a big collection can't quietly inflate your token cost.</small></div><label class="rg-switch"><input type="checkbox" id="rg-autoload-toggle" ${state.autoActivateNewImports ? 'checked' : ''}><span></span></label></div>
        <div><button type="button" data-rg-action="closeSettings">Close</button></div>
    </section></div>`;
}

// Weyland Tavern ships World Info budget_cap=24000 (data/default-user/settings.json); World Info
// stops activating further entries once the constant + triggered entries in a single prompt hit
// that cap, and warns with a toast when it does. 15,000 leaves real headroom under that hard cap
// for whichever subbots actually get triggered in a scene, on top of the always-on roster cost.
const WORLD_INFO_BUDGET_CAP = 24000;
const RECOMMENDED_ROSTER_LIMIT = 15000;

function tokenBar(tokens, cap, markers) {
    const pct = value => Math.min(100, (value / cap) * 100);
    // A real but tiny value (e.g. 119 of 24,000) rounds to a sliver that reads as "the bar is
    // broken/empty" rather than "usage is low" - floor the visible fill so it's always legible,
    // the exact number is already spelled out in the text underneath.
    const fillPct = tokens > 0 ? Math.max(pct(tokens), 2) : 0;
    // A label centered on its tick (the default) runs off the dialog's edge once that tick sits
    // near 0% or 100% - "24k" wrapped into its own 3-line column instead of just sitting at the
    // right edge. Align it to whichever side it's actually near instead of always centering.
    const scaleLabel = (value, text) => {
        const p = pct(value);
        const shift = p > 90 ? '-100%' : p < 10 ? '0' : '-50%';
        return `<span style="left:${p}%; transform:translateX(${shift})">${e(text)}</span>`;
    };
    return `<div class="rg-token-bar-wrap">
        <div class="rg-token-bar"><div class="rg-token-bar-fill" style="width:${fillPct}%"></div>${markers.map(m => `<span class="rg-token-bar-mark" style="left:${pct(m.value)}%" title="${e(m.label)}"></span>`).join('')}</div>
        <div class="rg-token-bar-scale"><span style="left:0">0</span>${markers.map(m => scaleLabel(m.value, m.short)).join('')}</div>
    </div>`;
}

function tokenCostPanel(state) {
    const active = (state.library?.items ?? []).filter(row => row.kind === 'character' && row.active !== false);
    const largest = [...active].sort((a, b) => b.tokens - a.tokens).slice(0, 10);
    const constantTokens = state.library?.constantTokens ?? 0;
    const over = constantTokens > RECOMMENDED_ROSTER_LIMIT;
    return `<div class="rg-dialog-shade"><section class="rg-dialog rg-token-panel" role="dialog" aria-modal="true" aria-labelledby="rg-token-title">
        <h2 id="rg-token-title">Token cost</h2>
        <p class="rg-token-note">Roster and locations list — sent with every message, regardless of scene.</p>
        ${tokenBar(constantTokens, WORLD_INFO_BUDGET_CAP, [{ value: RECOMMENDED_ROSTER_LIMIT, label: 'Recommended limit: 15,000', short: '15k' }, { value: WORLD_INFO_BUDGET_CAP, label: 'World Info hard cap: 24,000', short: '24k' }])}
        <p class="rg-token-note rg-token-total${over ? ' rg-token-over' : ''}"><b>~${constantTokens.toLocaleString()} tokens</b></p>
        <ul class="rg-token-limits"><li>Recommended under ${RECOMMENDED_ROSTER_LIMIT.toLocaleString()}</li><li>Hard cap ${WORLD_INFO_BUDGET_CAP.toLocaleString()}</li></ul>
        ${over ? '<p class="rg-token-note rg-token-over">Over the recommended limit — unload a few characters or locations below to bring this down.</p>' : ''}
        <p class="rg-token-note">Everything below only loads when a character is actually mentioned in a scene.</p>
        ${largest.length ? `<ol class="rg-token-list">${largest.map(row => `<li><span>${e(row.name)}</span><span>${row.tokens.toLocaleString()}</span></li>`).join('')}</ol>` : '<p class="rg-token-note">No loaded characters yet.</p>'}
        <div><button type="button" data-rg-action="closeTokenCost">Close</button></div>
    </section></div>`;
}

export function renderRegistrar(container, state) {
    const items = visibleRegistrarItems(state);
    const source = state.library?.sources.find(row => row.key === state.detail);
    const item = state.items.find(row => row.key === state.detail) || state.library?.items.find(row => row.key === state.detail) || (source && { ...source, id: source.key.split(':')[1], members: source.members });
    const pages = Math.max(1, Math.ceil(items.length / 12));
    state.page = Math.min(state.page, pages - 1);
    const count = state.library?.items.length || 0;
    container.innerHTML = `<div class="rg-app">
        <header class="rg-masthead"><div class="rg-wordmark"><span class="rg-seal" aria-hidden="true"><img src="${ASSET_BASE_URL}/registrar_seal.png" alt="" /></span><div class="rg-wordmark-text"><span class="rg-eyebrow">Weyland University</span><h1>Registrar</h1><span class="rg-edition">APP EDITION</span></div></div><div class="rg-masthead-actions"><button type="button" class="wp-inline-help rg-help" data-app-key="registrar" title="What is this?" aria-label="What is this?"><i class="fa-solid fa-circle-question"></i></button><button type="button" class="rg-help" data-rg-action="settings" title="Settings" aria-label="Settings"><i class="fa-solid fa-gear"></i></button></div></header>
        <nav class="rg-tabs" aria-label="Registrar sections">${Object.entries(labels).map(([key, label]) => `<button type="button" data-rg-tab="${key}" aria-pressed="${state.tab === key}">${label}${key === 'library' && count ? `<sup>${count}</sup>` : ''}</button>`).join('')}</nav>
        <div class="rg-page">
        ${state.error ? `<div class="rg-notice rg-error" role="alert">${e(state.error)} <button type="button" data-rg-action="refresh">Try again</button></div>` : ''}
        ${state.notice ? `<div class="rg-notice" role="status">${e(state.notice)}</div>` : ''}
        ${item ? detail(item, state) : `
            ${state.tab === 'library' && count ? `<div class="rg-world-switch"><div><strong>${state.active ? 'Registrar Active' : 'Registrar Paused'}</strong><small>${count} people & places · ${state.library.entryCount} lore entries</small></div><button type="button" data-rg-action="tokenCost">Token cost</button><button type="button" data-rg-action="active" ${state.busy ? 'disabled' : ''}>${state.active ? 'Pause' : 'Activate'}</button></div>` : ''}
            <form class="rg-search" role="search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search Registrar" placeholder="${state.tab === 'location' ? 'Find a place…' : state.tab === 'collection' ? 'Find a collection…' : 'Name, creator, or a little curiosity…'}" value="${e(state.query)}"><button type="submit" aria-label="Search">→</button></form>
            <div class="rg-list-heading"><span>${state.loading && !state.items.length ? 'Loading catalog…' : `${items.length} ${state.tab === 'library' ? 'imports' : labels[state.tab].toLowerCase()}`}</span><select aria-label="Sort Registrar"><option value="updated" ${state.sort === 'updated' ? 'selected' : ''}>Recently updated</option><option value="name" ${state.sort === 'name' ? 'selected' : ''}>A–Z</option></select></div>
            <div class="rg-cards ${state.tab === 'collection' ? 'rg-collections' : ''}">${items.slice(state.page * 12, state.page * 12 + 12).map((row, index) => card(row, state, state.page * 12 + index)).join('')}</div>
            ${!items.length ? `<div class="rg-empty"><span aria-hidden="true">❧</span><h3>${state.loading ? 'Loading…' : state.query ? 'No matches.' : state.tab === 'library' ? 'Nothing imported yet.' : 'No results.'}</h3><p>${state.loading ? 'Fetching the public Registrar catalog.' : state.query ? 'Try a name, species, creator, or another keyword.' : state.tab === 'library' ? 'Browse Characters, Locations or Collections, then choose Add to my world.' : 'Refresh the catalog to try again.'}</p></div>` : ''}
            ${pages > 1 ? `<div class="rg-pagination"><button type="button" data-rg-action="previous" ${state.page === 0 ? 'disabled' : ''}>← Previous</button><span>${state.page + 1} / ${pages}</span><button type="button" data-rg-action="next" ${state.page >= pages - 1 ? 'disabled' : ''}>Next →</button></div>` : ''}
            <footer class="rg-footer"><span>Made by Josh, driven by the community, living in Weyland.</span><button type="button" data-rg-action="refresh" ${state.loading || state.busy ? 'disabled' : ''}>Refresh ↻</button><a href="https://registrar.weybooru.com" target="_blank" rel="noopener noreferrer">Original Registrar ↗</a></footer>`}
        </div>
        ${state.confirm ? `<div class="rg-dialog-shade"><section class="rg-dialog" role="dialog" aria-modal="true" aria-labelledby="rg-confirm-title"><h2 id="rg-confirm-title">${state.confirm.action === 'remove' ? 'Remove this import?' : 'Import this collection?'}</h2><p>${e(state.confirm.message)}</p><div><button type="button" data-rg-action="cancel">Cancel</button><button type="button" class="rg-primary" data-rg-action="confirm">${state.confirm.action === 'remove' ? 'Remove import' : 'Add collection'}</button></div></section></div>` : ''}
        ${state.tokenCost ? tokenCostPanel(state) : ''}
        ${state.settingsOpen ? settingsPanel(state) : ''}
    </div>`;
    // Broken portraits retain the typographic fallback without an inline handler or unsafe HTML.
    container.querySelectorAll('.rg-art img').forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
}
