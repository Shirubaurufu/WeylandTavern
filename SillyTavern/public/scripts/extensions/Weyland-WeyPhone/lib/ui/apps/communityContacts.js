// lib/ui/apps/communityContacts.js
//
// Settings -> Community Contacts: a two-step picker (pick lorebook(s) to scan, then pick which
// detected entries become contacts), plus the summary/clear row shown on the main Settings
// screen. See lib/communityLorebook.js for the scanning/storage logic this only renders.

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * The summary row on the main Settings screen: contact count, "Find contacts" link, and a
 * selective "Delete community contacts" action (only shown once there's something to delete).
 * @param {{count: number}} state
 */
export function communityContactsSummaryMarkup({ count }) {
    return `
<div class="wp-settings-section">
    <div class="wp-settings-section-title">Community Contacts</div>
    <div class="wp-settings-hint">Add characters from your own lorebooks. History and dorm books are hidden; you pick who actually becomes a contact.</div>
    <button type="button" id="wp-community-contacts-button" class="wp-settings-link-row">
        <span>Find contacts in a lorebook <small>${count} ${count === 1 ? 'community contact' : 'community contacts'} added</small></span>
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
    </button>
    ${count > 0 ? `
    <div class="wp-settings-field wp-format-row">
        <span>Delete community contacts <small>Choose individual contacts to remove. Their lorebooks and conversations are untouched.</small></span>
        <button type="button" id="wp-community-delete-button" class="wp-btn-sm wp-danger-button">Delete</button>
    </div>` : ''}
</div>`;
}

/**
 * Step 1: pick which lorebook(s) to scan.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{worldNames: string[], selected: Set<string>}} state
 */
export function renderCommunityBooksScreen(container, { worldNames, selected }) {
    if (worldNames.length === 0) {
        container.innerHTML = '<div class="wp-empty-state">No lorebooks found. Attach or create one in SillyTavern\'s World Info panel first.</div>';
        return;
    }
    container.innerHTML = `
<div class="wp-settings wp-community-books-screen">
    <div class="wp-settings-hint">Pick one or more lorebooks to scan for characters.</div>
    <div class="wp-community-book-list">
        ${worldNames.map(name => `
        <label class="wp-community-book-row">
            <input type="checkbox" class="wp-community-book-checkbox" value="${escapeHtml(name)}"${selected.has(name) ? ' checked' : ''} />
            <span>${escapeHtml(name)}</span>
        </label>`).join('')}
    </div>
    <button type="button" id="wp-community-scan-button" class="wp-community-cta-button"${selected.size === 0 ? ' disabled' : ''}>Scan ${selected.size > 0 ? `${selected.size} selected` : 'selected'}</button>
</div>`;
}

/**
 * Step 2: pick which detected entries become contacts.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{candidates: Array<{name: string, lorebookName: string, preview: string}>, selected: Set<string>, existingKeys: Set<string>}} state
 *   `selected`/`existingKeys` are keyed by `${name}|${lorebookName}` (lowercased).
 */
export function renderCommunityPickScreen(container, { candidates, selected, existingKeys }) {
    if (candidates.length === 0) {
        container.innerHTML = '<div class="wp-empty-state">No named entries with body text found in the selected lorebook(s).</div>';
        return;
    }
    const grouped = new Map();
    for (const candidate of candidates) {
        if (!grouped.has(candidate.lorebookName)) grouped.set(candidate.lorebookName, []);
        grouped.get(candidate.lorebookName).push(candidate);
    }
    const selectedCount = [...selected].filter(key => !existingKeys.has(key)).length;
    container.innerHTML = `
<div class="wp-settings wp-community-pick-screen">
    <div class="wp-settings-hint">Pick who should become a contact. Already-added contacts are checked off and can't be selected again.</div>
    ${[...grouped.entries()].map(([lorebookName, entries]) => `
    <div class="wp-settings-section">
        <div class="wp-settings-section-title">${escapeHtml(lorebookName)}</div>
        ${entries.map(candidate => {
            const key = `${candidate.name.toLowerCase()}|${candidate.lorebookName.toLowerCase()}`;
            const alreadyAdded = existingKeys.has(key);
            return `
        <label class="wp-community-candidate-row${alreadyAdded ? ' wp-community-candidate-added' : ''}">
            <input type="checkbox" class="wp-community-candidate-checkbox" value="${escapeHtml(key)}"${alreadyAdded ? ' checked disabled' : selected.has(key) ? ' checked' : ''} />
            <span class="wp-community-candidate-main">
                <span class="wp-community-candidate-name">${escapeHtml(candidate.name)}${alreadyAdded ? ' <small>(already added)</small>' : ''}</span>
                <span class="wp-community-candidate-preview">${escapeHtml(candidate.preview)}</span>
            </span>
        </label>`;
        }).join('')}
    </div>`).join('')}
    <button type="button" id="wp-community-add-button" class="wp-community-cta-button"${selectedCount === 0 ? ' disabled' : ''}>Add ${selectedCount > 0 ? selectedCount : ''} ${selectedCount === 1 ? 'Contact' : 'Contacts'}</button>
</div>`;
}

/**
 * Selective deletion screen. Nothing is preselected so opening it cannot remove a contact.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{contacts: Array<{name: string, lorebookName: string}>, selected: Set<string>}} state
 */
export function renderCommunityDeleteScreen(container, { contacts, selected }) {
    if (contacts.length === 0) {
        container.innerHTML = '<div class="wp-empty-state">No community contacts to delete.</div>';
        return;
    }
    container.innerHTML = `
<div class="wp-settings wp-community-delete-screen">
    <div class="wp-settings-hint">Select only the contacts you want to delete. Their source lorebooks and existing conversations will not be changed.</div>
    <div class="wp-community-book-list">
        ${contacts.map(contact => {
            const key = `${contact.name.toLowerCase()}|${contact.lorebookName.toLowerCase()}`;
            return `
        <label class="wp-community-candidate-row">
            <input type="checkbox" class="wp-community-delete-checkbox" value="${escapeHtml(key)}"${selected.has(key) ? ' checked' : ''} />
            <span class="wp-community-candidate-main">
                <span class="wp-community-candidate-name">${escapeHtml(contact.name)}</span>
                <span class="wp-community-candidate-preview">Source: ${escapeHtml(contact.lorebookName)}</span>
            </span>
        </label>`;
        }).join('')}
    </div>
    <button type="button" id="wp-community-delete-confirm" class="wp-community-cta-button wp-community-cta-danger"${selected.size === 0 ? ' disabled' : ''}>Delete ${selected.size > 0 ? selected.size : ''} ${selected.size === 1 ? 'Contact' : 'Contacts'}</button>
</div>`;
}
