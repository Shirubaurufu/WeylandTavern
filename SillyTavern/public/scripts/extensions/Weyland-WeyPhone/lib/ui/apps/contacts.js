// lib/ui/apps/contacts.js

import { castPortraitUrl } from '../../castDirectory.js';
import { placeholderPortraitUrl } from '../../placeholderPortraits.js';

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function portraitMarkup(entry, size) {
    const castUrl = castPortraitUrl(entry);
    const localUrl = entry.localPortraitUrl || null;
    const placeholder = placeholderPortraitUrl(entry.name);
    if (castUrl) {
        const localFallback = localUrl ? ` data-fallback-url="${escapeHtml(localUrl)}"` : '';
        return `<img class="wp-contact-portrait ${size}" src="${escapeHtml(castUrl)}"${localFallback} data-placeholder-url="${escapeHtml(placeholder)}" alt="" loading="lazy" decoding="async" />`;
    }
    if (localUrl) return `<img class="wp-contact-portrait ${size}" src="${escapeHtml(localUrl)}" data-placeholder-url="${escapeHtml(placeholder)}" alt="" loading="lazy" decoding="async" />`;
    return `<img class="wp-contact-portrait ${size}" src="${escapeHtml(placeholder)}" alt="" loading="lazy" decoding="async" />`;
}

/**
 * The Contacts app list: search bar + alphabetically grouped cast directory.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{entries: import('../../castDirectory.js').CastEntry[], query: string}} state
 */
export function renderContactsAppScreen(container, { entries, query }) {
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    const groups = new Map();
    for (const entry of sorted) {
        const letter = (entry.name[0] ?? '#').toUpperCase();
        if (!groups.has(letter)) groups.set(letter, []);
        groups.get(letter).push(entry);
    }
    const listMarkup = sorted.length === 0
        ? '<div class="wp-empty-state">No contacts match that search.</div>'
        : [...groups.entries()].map(([letter, members]) => `
<div class="wp-contact-group">
    <div class="wp-contact-group-letter">${escapeHtml(letter)}</div>
    ${members.map(entry => `
    <button class="wp-contact-row" data-contact-name="${escapeHtml(entry.name)}">
        ${portraitMarkup(entry, 'wp-portrait-sm')}
        <span class="wp-contact-row-main">
            <span class="wp-contact-row-name">${escapeHtml(entry.displayName ?? entry.name)}</span>
            <span class="wp-contact-row-sub">${escapeHtml(entry.summary || entry.occupation || entry.species || '')}</span>
        </span>
    </button>`).join('')}
</div>`).join('');

    container.innerHTML = `
<div class="wp-contacts-app">
    <div class="wp-contact-search-wrap">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input id="wp-contact-search" type="text" placeholder="Search ${entries.length} contacts" value="${escapeHtml(query)}" />
    </div>
    <div class="wp-contact-list">${listMarkup}</div>
</div>`;
}

/**
 * A single contact's detail card.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{entry: import('../../castDirectory.js').CastEntry, messagable: boolean, lorebookOnly?: boolean, lorebookLabel?: string, knowsUser?: boolean, displayName?: string, renameKey?: string, currentRename?: string}} state
 *   `messagable`: whether tapping Message can actually open a texting thread (the name resolves
 *   to an installed SillyTavern character). `knowsUser`: the prior-history default for NEW
 *   threads with this character (toggle hidden when not messagable). `renameKey`: the
 *   settings.contactRenames key this contact's custom name lives under (installed character name
 *   when resolvable, else the cast name); `currentRename` its current value if any.
 */
export function renderContactDetailScreen(container, { entry, messagable, lorebookOnly = false, lorebookLabel = 'the Weyland lorebook', knowsUser = true, displayName, renameKey, currentRename, contactContext = '' }) {
    const rows = [
        ['Species', entry.species],
        ['Occupation', entry.occupation],
        ['Age', entry.age],
        ['Birthday', entry.birthday],
        ['Height', entry.height],
        ['Home', entry.home],
        ['Association', entry.association],
        ['Username', entry.handle],
    ].filter(([, value]) => String(value ?? '').trim() !== '');

    container.innerHTML = `
<div class="wp-contact-detail">
    <div class="wp-contact-hero">
        ${portraitMarkup(entry, 'wp-portrait-lg')}
        <div class="wp-contact-hero-name">${escapeHtml(displayName ?? entry.name)}</div>
        ${(displayName && displayName !== entry.name) ? `<div class="wp-contact-hero-realname">${escapeHtml(entry.name)}</div>` : ''}
        ${entry.summary ? `<div class="wp-contact-hero-summary">${escapeHtml(entry.summary)}</div>` : ''}
        ${entry.tag.length ? `<div class="wp-contact-tags">${entry.tag.map(t => `<span class="wp-contact-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </div>
    <button id="wp-contact-message-btn" class="menu_button" data-contact-name="${escapeHtml(entry.name)}"${messagable ? '' : ' disabled title="No installed character card or matching lorebook subbot was found."'}>
        <i class="fa-solid fa-comment-sms"></i> ${messagable ? 'Message' : 'Not reachable'}
    </button>
    ${lorebookOnly ? `<div class="wp-contact-source-note"><i class="fa-solid fa-book-open"></i> Texting personality comes from ${escapeHtml(lorebookLabel)}.</div>` : ''}
    ${messagable ? `
    <label class="wp-contact-history-row" title="When off, new texting threads start with this character having no idea who you are — 'who is this? how'd you get my number?' energy.">
        <span class="wp-contact-history-label">Prior history? <span class="wp-contact-history-sub">New threads assume you already know each other</span></span>
        <span class="wp-toggle-switch">
            <input type="checkbox" id="wp-contact-history-toggle" class="wp-toggle-input" data-contact-name="${escapeHtml(entry.name)}"${knowsUser ? ' checked' : ''} />
            <span class="wp-toggle-track"><span class="wp-toggle-thumb"></span></span>
        </span>
    </label>` : ''}
    ${renameKey ? `
    <label class="wp-contact-history-row" title="How this contact's name displays on YOUR phone — their real identity doesn't change.">
        <span class="wp-contact-history-label"><i class="fa-solid fa-pencil"></i> Edit name</span>
        <input type="text" class="wp-settings-contact-rename wp-contact-rename-input" data-char-name="${escapeHtml(renameKey)}" placeholder="${escapeHtml(entry.name)}" value="${escapeHtml(currentRename ?? '')}" />
    </label>` : ''}
    ${messagable && renameKey ? `
    <label class="wp-contact-context-card">
        <span class="wp-contact-history-label"><i class="fa-solid fa-heart"></i> Relationship context</span>
        <span class="wp-contact-history-sub">Tell WeyPhone what this person already knows or feels about you. This influences every texting thread with them.</span>
        <textarea id="wp-contact-context" data-char-name="${escapeHtml(renameKey)}" placeholder="Example: Miu and I have been together for years and are super lovey-dovey.">${escapeHtml(contactContext)}</textarea>
    </label>` : ''}
    ${entry.description ? `<div class="wp-contact-description">${escapeHtml(entry.description)}</div>` : ''}
    ${rows.length ? `<div class="wp-contact-info">${rows.map(([label, value]) => `
        <div class="wp-contact-info-row">
            <span class="wp-contact-info-label">${escapeHtml(label)}</span>
            <span class="wp-contact-info-value">${escapeHtml(value)}</span>
        </div>`).join('')}</div>` : ''}
</div>`;
}
