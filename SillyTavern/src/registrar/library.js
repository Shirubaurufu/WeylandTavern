import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import writeFileAtomic from 'write-file-atomic';
import { buildRegistrarBook } from './export.js';
import { itemKey, collectionMembers, publicItem } from './catalog.js';

export const BOOK_NAME = 'Weyland Registrar - WeyPhone';
const MARKER = 'weyphone-registrar-v1';
const locks = new Map();
const digest = entries => createHash('sha256').update(JSON.stringify(entries)).digest('hex');
const filePath = directories => path.join(directories.worlds, `${BOOK_NAME}.json`);

export async function readLibrary(directories) {
    let book;
    try { book = JSON.parse(await fs.readFile(filePath(directories), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { entries: {}, registrar: { format: MARKER, sources: [], records: [], inactive: [] } }; throw error; }
    if (book.registrar?.format !== MARKER) throw new Error(`A different lorebook already uses the name “${BOOK_NAME}”. Rename it in World Info before importing here.`);
    return book;
}

export function librarySummary(book) {
    const { sources, records, inactive } = book.registrar;
    const inactiveSet = new Set(inactive ?? []);
    // Roster/locations-list content is the only thing sent with every message (see buildRosterEntry
    // /buildLocationsEntry in export.js) - everything else is triggered by name only. ~4 chars/token
    // is the standard rough English estimate; this is not the exact provider tokenizer count.
    const constantChars = Object.values(book.entries)
        .filter(entry => entry.constant)
        .reduce((sum, entry) => sum + String(entry.content ?? '').length, 0);
    return {
        bookName: BOOK_NAME, sources,
        items: records.map(item => ({ ...publicItem(item), active: !inactiveSet.has(itemKey(item)) })),
        entryCount: Object.keys(book.entries).length,
        constantTokens: Math.ceil(constantChars / 4),
    };
}

/**
 * Sources own references, not copies: importing overlapping collections never duplicates NPCs.
 * @param {{startPaused?: boolean}} [options] startPaused: install new members already deactivated
 * (used by the "load new imports automatically" off setting) - a big collection can be added
 * without touching the current token cost until the user chooses to load individual members.
 */
export function changeLibrary(book, action, key, catalog, now = new Date().toISOString(), options = {}) {
    if (book.registrar.entriesHash && digest(book.entries) !== book.registrar.entriesHash) {
        throw new Error('This app’s lorebook has manual edits. Export a copy and rename it in World Info before rebuilding your Registrar library; your edits have been preserved.');
    }
    let sources = structuredClone(book.registrar.sources);
    const records = new Map(book.registrar.records.map(item => [itemKey(item), item]));
    const inactive = new Set(book.registrar.inactive ?? []);
    if (action === 'remove') {
        sources = sources.filter(source => source.key !== key);
    } else if (action === 'install') {
        const item = catalog.find(row => itemKey(row) === key);
        if (!item) throw new Error('This entry is no longer public on the Registrar. Your existing import has been kept.');
        const members = item.kind === 'collection' ? collectionMembers(item, catalog) : [item];
        if (!members.length) throw new Error('This collection has no publicly available characters or locations to import.');
        const wasKnown = new Set(records.keys());
        for (const member of members) {
            records.set(itemKey(member), member);
            // Only apply startPaused to members genuinely new to this library - re-installing to
            // pick up an update must never silently pause something the user already had loaded.
            if (!wasKnown.has(itemKey(member))) {
                if (options.startPaused) inactive.add(itemKey(member));
                else inactive.delete(itemKey(member));
            }
        }
        const source = { key, name: item.name, kind: item.kind, updatedAt: item.updatedAt, installedAt: now, members: members.map(itemKey) };
        sources = [...sources.filter(old => old.key !== key), source];
    } else if (action === 'activate' || action === 'deactivate') {
        if (!records.has(key)) throw new Error('This entry is not in your world.');
        if (action === 'deactivate') inactive.add(key); else inactive.delete(key);
    } else throw new Error('Unknown library action.');
    const needed = new Set(sources.flatMap(source => source.members));
    const kept = [...records.values()].filter(item => needed.has(itemKey(item)));
    for (const staleKey of inactive) if (!needed.has(staleKey)) inactive.delete(staleKey);
    const active = kept.filter(item => !inactive.has(itemKey(item)));
    const result = buildRegistrarBook(active);
    result.registrar = { format: MARKER, sources, records: kept, inactive: [...inactive], entriesHash: digest(result.entries) };
    return result;
}

export async function saveLibraryChange(directories, action, key, catalog, options = {}) {
    const filename = filePath(directories);
    // Serialize read/modify/write per user; two phone tabs cannot drop each other's imports.
    const previous = locks.get(filename) || Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
        const current = await readLibrary(directories);
        const next = changeLibrary(current, action, key, catalog, undefined, options);
        await fs.mkdir(directories.worlds, { recursive: true });
        // Retain the immediately previous managed book for recovery after removals/updates.
        if (current.registrar.entriesHash) await writeFileAtomic(`${filename}.bak`, JSON.stringify(current, null, 2));
        await writeFileAtomic(filename, JSON.stringify(next, null, 2));
        return next;
    });
    locks.set(filename, operation);
    try { return await operation; } finally { if (locks.get(filename) === operation) locks.delete(filename); }
}
