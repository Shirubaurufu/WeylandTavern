// lib/communityLorebook.js
//
// User-picked "community contacts": characters found by scanning a lorebook the user chooses
// themselves (any World Info book — not just registrar.weybooru.com exports). Unlike the
// automatic Registrar pickup in lib/registrarLorebook.js, this is a deliberate two-step flow:
// the user selects which book(s) to scan, then picks which detected entries actually become
// contacts. Community lorebooks mix real characters with dorm/backstory/lore entries, so the
// scan rejects recognizable supporting-lore entries before the user makes the final selection.
//
// Resolution at message-send time is NOT this module's job — index.js's existing
// resolveContactCapability/resolveCharacterPrompt already re-check the source lorebook live on
// every send and throw/refuse when the entry (or the whole book) is gone, so a community contact
// whose lorebook was later deleted naturally becomes unmessageable with zero extra code here.

function truncate(text, max = 140) {
    const trimmed = String(text ?? '').trim().replace(/\s+/g, ' ');
    return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

// Books whose whole purpose is dorm assignments or roleplay history/backstory, never individual
// characters — noise in the picker, so they're filtered out of the selectable list entirely.
const EXCLUDED_BOOK_NAME_RE = /(history|dorm)|^chat[_ ]book[_ ]/i;

/** @param {string} name */
export function isExcludedFromCommunityPicker(name) {
    return EXCLUDED_BOOK_NAME_RE.test(String(name ?? ''));
}

/** @param {string[]} worldNames */
export function communityPickableBookNames(worldNames) {
    return (Array.isArray(worldNames) ? worldNames : []).filter(name => !isExcludedFromCommunityPicker(name));
}

// The Registrar/directory summary entry (see lib/registrarLorebook.js's rosterEntry) is a
// machine-readable index of every character in the book, not a character itself — never a
// candidate on its own.
const CHARACTER_ROSTER_NAME_RE = /^character roster$/i;
const NON_CHARACTER_ENTRY_NAME_RE = /(?:^|[\s/:[\]()_-])(?:backstor(?:y|ies)|histor(?:y|ies)|dorm(?:itory)?|housing|room|location|setting|scenario|timeline|end\s+section|secrets?)(?=$|[\s/:[\]()_-])/i;
const END_MARKER_CONTENT_RE = /^\s*(?:[-=]+\s*)?\[\s*END\b/i;

/**
 * Rejects entries whose labels/body identify them as supporting lore rather than a person.
 * This is intentionally a conservative negative filter: unfamiliar character formats remain
 * selectable, while the common split-profile companions (history, housing, end markers, etc.)
 * do not masquerade as additional contacts.
 * @param {string} name
 * @param {string} content
 */
export function isLikelyCommunityContactCandidate(name, content) {
    const normalizedName = String(name ?? '').trim();
    const normalizedContent = String(content ?? '').trim();
    if (!normalizedName || CHARACTER_ROSTER_NAME_RE.test(normalizedName)) return false;
    if (NON_CHARACTER_ENTRY_NAME_RE.test(normalizedName)) return false;
    if (END_MARKER_CONTENT_RE.test(normalizedContent)) return false;
    return true;
}

/**
 * Scans one already-loaded World Info book for candidate characters. An entry is a candidate
 * when it's enabled, has body text, has SOME name to show (its comment, falling back to its
 * first non-empty key), and is not recognizable supporting lore. Two entries that resolve to
 * the same name keep only the first (an entry's
 * insertion order in `book.entries` is stable, matching World Info's own display order).
 * @param {{entries?: Record<string, {comment?: string, key?: string|string[], content?: string, disable?: boolean}>}} book
 * @param {string} lorebookName
 * @returns {Array<{name: string, lorebookName: string, preview: string}>}
 */
export function scanBookForCandidates(book, lorebookName) {
    const seen = new Set();
    const candidates = [];
    for (const entry of Object.values(book?.entries ?? {})) {
        if (!entry || entry.disable) continue;
        const content = String(entry.content ?? '').trim();
        if (!content) continue;
        const keys = Array.isArray(entry.key) ? entry.key : [entry.key].filter(Boolean);
        const name = String(entry.comment ?? '').trim() || String(keys.find(k => String(k ?? '').trim()) ?? '').trim();
        if (!isLikelyCommunityContactCandidate(name, content)) continue;
        const dedupeKey = name.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        candidates.push({ name, lorebookName, preview: truncate(content) });
    }
    return candidates;
}

function contactKey(name, lorebookName) {
    return `${String(name ?? '').trim().toLowerCase()}|${String(lorebookName ?? '').trim().toLowerCase()}`;
}

/**
 * Adds picked candidates to settings.communityContacts, skipping ones already present (same name
 * + source book, case-insensitive).
 * @param {{communityContacts?: Array<{name: string, lorebookName: string, addedAt: number}>}} settings
 * @param {Array<{name: string, lorebookName: string}>} candidates
 * @param {number} [now]
 * @returns {number} how many were actually added (excludes duplicates)
 */
export function addCommunityContacts(settings, candidates, now = Date.now()) {
    if (!Array.isArray(settings.communityContacts)) settings.communityContacts = [];
    const existing = new Set(settings.communityContacts.map(c => contactKey(c.name, c.lorebookName)));
    let added = 0;
    for (const candidate of candidates) {
        const key = contactKey(candidate.name, candidate.lorebookName);
        if (existing.has(key)) continue;
        existing.add(key);
        settings.communityContacts.push({ name: candidate.name, lorebookName: candidate.lorebookName, addedAt: now });
        added++;
    }
    return added;
}

/** @param {{communityContacts?: Array}} settings */
export function getCommunityContacts(settings) {
    return Array.isArray(settings.communityContacts) ? settings.communityContacts : [];
}

/** Removes only the selected name/source-book pairs. Returns how many were deleted. */
export function deleteCommunityContacts(settings, selectedKeys) {
    const contacts = getCommunityContacts(settings);
    const keys = new Set([...selectedKeys].map(key => String(key).trim().toLowerCase()));
    settings.communityContacts = contacts.filter(contact => !keys.has(contactKey(contact.name, contact.lorebookName)));
    return contacts.length - settings.communityContacts.length;
}

/** The unique source lorebook names community contacts currently reference (for cache loading). */
export function communityLorebookNames(settings) {
    return [...new Set(getCommunityContacts(settings).map(c => c.lorebookName).filter(Boolean))];
}

/**
 * Shapes one community contact into the same directory-entry fields the Contacts app already
 * renders for official/registrar entries.
 * @param {{name: string, lorebookName: string}} contact
 */
export function communityContactDirectoryEntry(contact) {
    return {
        name: contact.name,
        gender: '', age: '', birthday: '', height: '', species: '', summary: '', occupation: '',
        home: '', association: `Community — ${contact.lorebookName}`, handle: '',
        tag: ['Community'], description: '', image: '',
        registrar: false, community: true, lorebookName: contact.lorebookName,
    };
}
