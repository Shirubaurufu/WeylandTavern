// Registrar lorebooks downloaded from registrar.weybooru.com are normal SillyTavern World Info
// books. Their constant "Character Roster" entry is the stable, compact directory, while each
// character's exact-name entry contains the full subbot profile used for texting and occasional
// social-app appearances.

import { findLorebookCharacterEntry } from './worldInfo.js';

// The book the in-app Registrar importer manages. Must match BOOK_NAME in
// SillyTavern/src/registrar/library.js (server side).
export const REGISTRAR_APP_BOOK_NAME = 'Weyland Registrar - WeyPhone';

/** Portrait URLs from the in-app importer's own metadata (book.registrar.records), keyed by the
 * lowercased roster name. A record's `name` can carry an AKA after a comma ("Patsy, Patricia"),
 * while the roster line uses just the first part. Manually downloaded books have no records. */
function registrarPortraits(book) {
    const portraits = new Map();
    for (const record of Array.isArray(book?.registrar?.records) ? book.registrar.records : []) {
        const name = String(record?.name ?? '').split(',')[0].trim().toLowerCase();
        if (name && record.portrait && !record.deletedAt) portraits.set(name, String(record.portrait));
    }
    return portraits;
}

export function isRegistrarBookName(name) {
    return /registrar/i.test(String(name ?? ''));
}

export function findRegistrarBookNames(worldNames) {
    return [...new Set((Array.isArray(worldNames) ? worldNames : [])
        .filter(isRegistrarBookName))];
}

function splitRosterFields(value) {
    return String(value ?? '').split(',').map(part => part.trim()).filter(Boolean);
}

function fieldValue(fields, label) {
    const prefix = `${label.toLowerCase()}:`;
    const field = fields.find(item => item.toLowerCase().startsWith(prefix));
    return field ? field.slice(field.indexOf(':') + 1).trim() : '';
}

function normalizeHandle(value) {
    const handle = String(value ?? '').trim();
    if (!handle) return '';
    return handle.startsWith('@') ? handle : `@${handle}`;
}

function rosterEntry(book) {
    return Object.values(book?.entries ?? {}).find(entry => entry && !entry.disable &&
        (/character roster/i.test(String(entry.comment ?? '')) || /\[CHARACTER ROSTER\b/i.test(String(entry.content ?? ''))));
}

function profileNames(book) {
    const names = [];
    for (const entry of Object.values(book?.entries ?? {})) {
        if (!entry || entry.disable || !entry.content) continue;
        const match = String(entry.content).match(/^\s*\[([^\]\r\n]+?)\s+INFO\]/i);
        if (match && !/^END\s+/i.test(match[1])) names.push(match[1].trim());
    }
    return [...new Set(names)];
}

function profileSummary(profileText) {
    const match = String(profileText ?? '').match(/\bSummary\s*:\s*\[\s*([\s\S]*?)\s*\]/i);
    return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

/**
 * Turns one imported Registrar lorebook into contact/roster records. A missing primary profile is
 * retained as an unreachable contact so the UI can say so honestly; normal Registrar downloads
 * include one and therefore produce a textable contact.
 */
export function parseRegistrarLorebook(book, bookName = 'Weyland Registrar') {
    const parsed = [];
    const portraits = registrarPortraits(book);
    const rosterText = String(rosterEntry(book)?.content ?? '');
    for (const rawLine of rosterText.split(/\r?\n/)) {
        const match = rawLine.trim().match(/^([^:\[\]]+):\s*\((.*)\)\s*$/);
        if (!match) continue;
        const name = match[1].trim();
        const fields = splitRosterFields(match[2]);
        const profile = findLorebookCharacterEntry(book, name);
        const gender = fields.find(field => /^(female|male|nonbinary|non-binary|genderfluid|gender-fluid)$/i.test(field)) ?? '';
        const major = fieldValue(fields, 'Major');
        const handle = normalizeHandle(fieldValue(fields, 'Username'));
        const summary = profileSummary(profile?.content)
            || (fields[2] && !/^(female|male|nonbinary|username:)/i.test(fields[2]) ? fields[2] : '');
        const home = major
            ? fields.slice(fields.findIndex(field => field.toLowerCase().startsWith('major:')) + 1).filter(field => !/^\{\{/.test(field)).join(', ')
            : fields.at(-1) ?? '';
        parsed.push({
            name,
            gender,
            age: '',
            birthday: '',
            height: '',
            species: fields[0] ?? '',
            summary,
            occupation: major,
            home,
            association: 'Weyland Registrar',
            handle,
            tag: ['Registrar'],
            description: summary,
            image: portraits.get(name.toLowerCase()) ?? '',
            registrar: true,
            lorebookName: bookName,
            profileText: profile ? String(profile.content ?? '').trim() : '',
        });
    }

    // Older/community-customized exports may omit the roster entry. The [Name INFO] marker still
    // gives WeyPhone a safe minimal contact instead of making an otherwise valid subbot invisible.
    for (const name of profileNames(book)) {
        if (parsed.some(entry => entry.name.toLowerCase() === name.toLowerCase())) continue;
        const profile = findLorebookCharacterEntry(book, name);
        parsed.push({
            name,
            gender: '', age: '', birthday: '', height: '', species: '', summary: '', occupation: '', home: '',
            association: 'Weyland Registrar', handle: '', tag: ['Registrar'], description: '', image: portraits.get(name.toLowerCase()) ?? '',
            registrar: true,
            lorebookName: bookName,
            profileText: profile ? String(profile.content ?? '').trim() : '',
        });
    }
    return parsed;
}

export async function loadRegistrarLorebooks({ worldNames, loadWorldInfo }) {
    const books = new Map();
    const contacts = [];
    const loaded = await Promise.all(findRegistrarBookNames(worldNames).map(async name => {
        try {
            const book = await loadWorldInfo(name);
            if (!book?.entries) return null;
            return { name, book, contacts: parseRegistrarLorebook(book, name) };
        } catch (error) {
            console.warn(`[WeyPhone] Could not read Registrar lorebook "${name}":`, error);
            return null;
        }
    }));
    for (const result of loaded) {
        if (!result) continue;
        books.set(result.name, result.book);
        contacts.push(...result.contacts);
    }
    return { books, contacts };
}

const autoContactKey = (name, lorebookName) => `${String(name ?? '').trim().toLowerCase()}|${String(lorebookName ?? '').trim().toLowerCase()}`;

/**
 * Characters imported through the in-app Registrar become Contacts automatically. They're added
 * to settings.communityContacts (the same list the manual Community Contacts picker fills), and
 * settings.registrarAutoContacts remembers which ones this added:
 * - each newly imported character is added once;
 * - a contact the user deletes stays deleted, because it's still remembered while the character
 *   remains imported;
 * - a character removed or unloaded in the Registrar app (gone, or its entries disabled) has its
 *   auto-added contact removed and forgotten, so loading it again re-adds it.
 * Only the in-app importer's book is synced: manually downloaded Registrar books keep the old,
 * opt-in picker flow.
 * @returns {boolean} whether settings changed (caller saves)
 */
export function syncRegistrarAutoContacts(settings, registrarContacts) {
    if (!Array.isArray(settings.communityContacts)) settings.communityContacts = [];
    const tracked = new Set(Array.isArray(settings.registrarAutoContacts) ? settings.registrarAutoContacts : []);
    const present = (Array.isArray(registrarContacts) ? registrarContacts : [])
        .filter(contact => contact.lorebookName === REGISTRAR_APP_BOOK_NAME && contact.profileText);
    const presentKeys = new Set(present.map(contact => autoContactKey(contact.name, contact.lorebookName)));
    let changed = false;

    for (const contact of present) {
        const key = autoContactKey(contact.name, contact.lorebookName);
        if (tracked.has(key)) continue;
        tracked.add(key);
        if (!settings.communityContacts.some(item => autoContactKey(item.name, item.lorebookName) === key)) {
            settings.communityContacts.push({ name: contact.name, lorebookName: contact.lorebookName, addedAt: Date.now() });
        }
        changed = true;
    }
    for (const key of [...tracked]) {
        if (presentKeys.has(key)) continue;
        tracked.delete(key);
        settings.communityContacts = settings.communityContacts.filter(item => autoContactKey(item.name, item.lorebookName) !== key);
        changed = true;
    }
    if (changed) settings.registrarAutoContacts = [...tracked];
    return changed;
}

export function registrarRosterEntry(contact) {
    return {
        name: contact.name,
        handle: contact.handle || `@${contact.name.replace(/[^a-z0-9]+/gi, '').toLowerCase()}`,
        bio: [contact.species, contact.occupation, contact.summary].filter(Boolean).join(' — '),
        registrar: true,
        profileText: contact.profileText ?? '',
    };
}

export function sampleRegistrarRoster(roster, count = 2, randomFn = Math.random) {
    const pool = [...(Array.isArray(roster) ? roster : [])];
    const chosen = [];
    const limit = Math.min(Math.max(0, count), pool.length);
    while (chosen.length < limit) {
        const index = Math.min(pool.length - 1, Math.floor(randomFn() * pool.length));
        chosen.push(pool.splice(index, 1)[0]);
    }
    return chosen;
}
