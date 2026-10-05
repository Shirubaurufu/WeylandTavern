import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { buildRegistrarBook } from '../../../../../src/registrar/export.js';
import { normalizeCatalog, collectionMembers, matchesFilter, publicItem } from '../../../../../src/registrar/catalog.js';
import { readLibrary, changeLibrary, saveLibraryChange, librarySummary, BOOK_NAME } from '../../../../../src/registrar/library.js';
import { createRegistrarRouter } from '../../../../../src/endpoints/registrar.js';
import { safePortrait, escapeRegistrar, visibleRegistrarItems, renderRegistrar } from '../lib/ui/apps/registrar.js';
import { hiddenByRegistrarFilters, normalizeRegistrarFilters, registrarFilterOptions } from '../lib/registrarFilters.js';

const npc = { kind: 'character', id: 999, characterId: 999, name: 'Testy, Test', surname: 'Tester', status: 'public', species: 'Nekomimi', gender: 'Female', baseAge: 22, schoolYear: 'MCY', ownerName: 'Creator', ownerId: 'owner', summary: 'A curious student.', appearance: 'Tall.', personality: 'Curious.', speech: 'Thoughtful.', onlineHandle: '@test', dwelling: 'Test Hall 3', major: 'Art', roster: 'artist', outfitEntries: '[{"name":"Studio","description":"A paint-covered apron"}]', knownBackground: 'Grew up painting.', backgroundKeywords: 'paint, history', secrets: 'Keeps a sketchbook.', secretsKeywords: 'sketchbook', room: 'Full of canvases.', updatedAt: '2026-09-10T00:00:00Z' };
const location = { kind: 'location', id: 1, locationId: 1, name: 'Test Hall', status: 'public', summary: 'A residence.', description: 'A quiet building.', extraKeys: 'dorm, hall', denizens: 'Artists.', events: 'Art night.', ownerName: 'Creator', subLocations: '[{"name":"Studio","extraKeys":"paint","description":"An airy room."}]' };
const collection = { kind: 'collection', id: 2, collectionId: 2, name: 'Art Club', status: 'public', selectionMode: 'Static', selectedCharacters: encodeURIComponent('[999,"L1"]'), filter: '', ownerName: 'Creator' };
const catalog = [npc, location, collection];
const empty = () => ({ entries: {}, registrar: { format: 'weyphone-registrar-v1', records: [], sources: [] } });

test('browse filters use exact labels and keep downloads accessible', () => {
    const anthro = { key: 'character:1', kind: 'character', name: 'Dez', species: 'Rabbit Kemono', tags: ['furry'] };
    const mimi = { key: 'character:2', kind: 'character', name: 'Student', species: 'fox kemonomimi', summary: 'An anthropology student.' };
    assert.equal(hiddenByRegistrarFilters(anthro, { tags: [' FURRY '] }), true);
    assert.equal(hiddenByRegistrarFilters({ ...mimi, gender: 'Female' }, { gender: ['male'] }), false);
    assert.equal(hiddenByRegistrarFilters({ ...mimi, gender: 'Male' }, { gender: ['male'] }), true);
    assert.equal(hiddenByRegistrarFilters({ ...mimi, tags: ['Tsundere'] }, { tags: ['tsundere'] }), true);
    assert.deepEqual(normalizeRegistrarFilters({ tags: ['A', ' a ', 2] }).tags, ['a']);
    assert.ok(registrarFilterOptions([], { tags: ['old tag'] }).tags.some(([value]) => value === 'old tag'));
    assert.equal(publicItem(npc).gender, 'Female');
    const state = { items: [anthro, mimi], tab: 'character', query: '', sort: 'name', browseFilters: { tags: ['furry'] }, library: { items: [anthro], sources: [{ key: anthro.key }] } };
    assert.deepEqual(visibleRegistrarItems(state).map(row => row.key), [mimi.key]);
    assert.equal(visibleRegistrarItems({ ...state, browseFilters: {} }).length, 2);
    assert.deepEqual(visibleRegistrarItems({ ...state, tab: 'library' }).map(row => row.key), [anthro.key]);
});

test('WIP characters are visible and importable; private, deleted and unknown statuses stay excluded', () => {
    const callie = { ...npc, characterId: 872, name: 'Callie', status: 'wip' };
    const rows = normalizeCatalog({ character: [npc, callie, { ...callie, status: 'private' }, { ...callie, deletedAt: 'now' }, { ...callie, status: 'draft' }] });
    assert.deepEqual(rows.map(row => row.name), [npc.name, 'Callie']);
    const item = publicItem(rows[1]);
    assert.equal(item.status, 'wip');
    const library = librarySummary(changeLibrary(empty(), 'install', 'character:872', rows));
    assert.equal(library.items[0].status, 'wip');
    const target = { innerHTML: '', querySelectorAll: () => [] };
    const state = { items: [item], library, tab: 'character', query: '', sort: 'name', page: 0 };
    renderRegistrar(target, state);
    assert.match(target.innerHTML, /rg-wip-badge/);
    assert.match(target.innerHTML, /Callie/);
    renderRegistrar(target, { ...state, detail: item.key });
    assert.match(target.innerHTML, /Work in progress: this character is still being developed/);
    renderRegistrar(target, { ...state, items: [{ ...item, status: 'public' }], library: null });
    assert.doesNotMatch(target.innerHTML, /rg-wip-badge/);
});

test('updating an import preserves unloaded members', () => {
    let book = changeLibrary(empty(), 'install', 'collection:2', catalog);
    book = changeLibrary(book, 'deactivate', 'character:999', []);
    book = changeLibrary(book, 'install', 'collection:2', catalog);
    assert.deepEqual(book.registrar.inactive, ['character:999']);
    assert.equal(librarySummary(book).items.find(row => row.key === 'character:999').active, false);
});

test('subbot export preserves macro age, roster, companions, aliases and selective lore', () => {
    const book = buildRegistrarBook([npc]);
    const entries = Object.values(book.entries);
    assert.equal(entries.length, 6);
    assert.equal(entries.find(row => row.comment === 'Character Roster').constant, true);
    const profile = entries.find(row => row.comment === 'Testy');
    assert.match(profile.content, /\{\{getvar::22YO\}\}/);
    assert.match(profile.content, /Studio Outfit/);
    assert.equal(profile.constant, false);
    assert.ok(profile.key.includes('!Test'));
    assert.equal(profile.scanDepth, 2);
    assert.deepEqual(entries.find(row => row.comment.endsWith('Backstory/History')).keysecondary, ['paint', 'history']);
    assert.ok(entries.find(row => row.comment.endsWith('Secrets')));
    assert.ok(entries.find(row => row.comment.endsWith('Dorm room/Housing')));
    assert.ok(entries.find(row => row.comment.endsWith('End Section')));
    assert.equal(book.first_mes, undefined);
});

test('mixed large character IDs and location/sub-location entries do not collide', () => {
    const book = buildRegistrarBook([npc, { ...npc, id: 600, name: 'Another' }, location]);
    const values = Object.values(book.entries);
    assert.equal(values.length, 14);
    const sub = values.find(row => row.comment === 'Test Hall, Studio');
    assert.deepEqual(sub.keysecondary, ['Studio', 'studio', 'paint']);
    assert.equal(values.find(row => row.comment === 'Location List').constant, true);
    assert.match(values.find(row => row.comment === 'Test Hall').content, /Sub-Locations/);
});

test('static and dynamic collections include only their public selected members', () => {
    assert.deepEqual(collectionMembers(collection, catalog), [npc, location]);
    const dynamic = { ...collection, selectionMode: 'Dynamic', filter: encodeURIComponent('owner:creator type:character'), deselectedCharacters: '[]' };
    assert.deepEqual(collectionMembers(dynamic, catalog), [npc]);
    dynamic.deselectedCharacters = encodeURIComponent('[999]');
    assert.deepEqual(collectionMembers(dynamic, catalog), []);
    assert.ok(matchesFilter(npc, 'species:nekomimi owner:!other'));
    assert.ok(matchesFilter(npc, 'owner:other|creator "curious student"'));
    assert.equal(matchesFilter(npc, 'unknown:field'), false);
    const normalized = normalizeCatalog({ character: [npc, { ...npc, deletedAt: 'now' }, { ...npc, status: 'private' }] });
    assert.equal(normalized.length, 1);
});

test('overlapping collections deduplicate and removals preserve independently imported content', () => {
    let book = changeLibrary(empty(), 'install', 'collection:2', catalog);
    book = changeLibrary(book, 'install', 'character:999', catalog);
    assert.equal(book.registrar.records.length, 2);
    assert.equal(Object.values(book.entries).filter(row => row.comment === 'Testy').length, 1);
    book = changeLibrary(book, 'remove', 'collection:2', []);
    assert.deepEqual(book.registrar.records.map(row => row.kind), ['character']);
    book = changeLibrary(book, 'remove', 'character:999', []);
    assert.deepEqual(book.entries, {});
});

test('deactivate unloads an entry\'s World Info without removing it, and activate restores it', () => {
    let book = changeLibrary(empty(), 'install', 'character:999', catalog);
    assert.ok(Object.values(book.entries).some(row => row.comment === 'Testy'));
    assert.ok(Object.values(book.entries).some(row => row.comment === 'Character Roster'));

    book = changeLibrary(book, 'deactivate', 'character:999', []);
    assert.deepEqual(book.entries, {});
    assert.equal(book.registrar.records.length, 1, 'record stays cached, no re-fetch needed to restore it');
    assert.deepEqual(book.registrar.inactive, ['character:999']);
    let summary = librarySummary(book);
    assert.equal(summary.items[0].active, false);
    assert.equal(summary.constantTokens, 0);

    // Reactivating needs no catalog lookup - the record was kept, not dropped.
    book = changeLibrary(book, 'activate', 'character:999', []);
    assert.ok(Object.values(book.entries).some(row => row.comment === 'Testy'));
    assert.deepEqual(book.registrar.inactive, []);
    summary = librarySummary(book);
    assert.equal(summary.items[0].active, true);
    assert.ok(summary.constantTokens > 0);
});

test('deactivate rejects a key that was never imported, and pruning drops stale inactive keys on removal', () => {
    let book = changeLibrary(empty(), 'install', 'character:999', catalog);
    assert.throws(() => changeLibrary(book, 'deactivate', 'character:1', []), /not in your world/);
    book = changeLibrary(book, 'deactivate', 'character:999', []);
    // Removing the only source that references a deactivated item must not leave its key
    // haunting `inactive` forever once nothing `needed` references it any more.
    book = changeLibrary(book, 'remove', 'character:999', []);
    assert.deepEqual(book.registrar.inactive, []);
});

test('a paused character is excluded from a mixed collection\'s built entries but its location stays active', () => {
    let book = changeLibrary(empty(), 'install', 'collection:2', catalog);
    book = changeLibrary(book, 'deactivate', 'character:999', []);
    assert.equal(Object.values(book.entries).some(row => row.comment === 'Testy'), false);
    assert.ok(Object.values(book.entries).some(row => row.comment === 'Test Hall'));
    // Both members are still tracked as records - only the character's entries were dropped.
    assert.deepEqual(book.registrar.records.map(row => row.kind).sort(), ['character', 'location']);
});

test('startPaused installs a new collection with every member unloaded, without touching the constant roster', () => {
    const book = changeLibrary(empty(), 'install', 'collection:2', catalog, undefined, { startPaused: true });
    assert.deepEqual(book.entries, {}, 'no roster/lore entries built for members that start paused');
    assert.equal(book.registrar.records.length, 2, 'both members are still recorded, just inactive');
    assert.deepEqual(book.registrar.inactive.sort(), ['character:999', 'location:1']);
});

test('startPaused never re-pauses a member the library already had loaded', () => {
    let book = changeLibrary(empty(), 'install', 'character:999', catalog);
    assert.ok(Object.values(book.entries).some(row => row.comment === 'Testy'));
    // Re-installing the same collection (e.g. to pick up an update) with startPaused must not
    // silently unload something the user already had active.
    book = changeLibrary(book, 'install', 'collection:2', catalog, undefined, { startPaused: true });
    assert.ok(Object.values(book.entries).some(row => row.comment === 'Testy'), 'previously-active member stays active');
    assert.deepEqual(book.registrar.inactive, ['location:1'], 'only the genuinely new member starts paused');
});

test('updates replace old profiles and protect manual edits', () => {
    let book = changeLibrary(empty(), 'install', 'character:999', catalog);
    const changed = { ...npc, personality: 'Updated character.' };
    book = changeLibrary(book, 'install', 'character:999', [changed]);
    assert.match(Object.values(book.entries).find(row => row.comment === 'Testy').content, /Updated character/);
    book.entries[5000].content += ' A manual edit.';
    assert.throws(() => changeLibrary(book, 'install', 'character:999', catalog), /Manual edits/);
    assert.throws(() => changeLibrary(empty(), 'install', 'character:1', catalog), /no longer public/);
});

test('serialized imports persist per user, preserve existing files and retain a recovery copy', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'weyphone-registrar-'));
    try {
        const directories = { worlds: path.join(dir, 'worlds') };
        await Promise.all([saveLibraryChange(directories, 'install', 'character:999', catalog), saveLibraryChange(directories, 'install', 'location:1', catalog)]);
        const book = await readLibrary(directories);
        assert.equal(book.registrar.sources.length, 2);
        assert.equal(book.registrar.records.length, 2);
        assert.ok(await fs.stat(path.join(directories.worlds, `${BOOK_NAME}.json.bak`)));
        await fs.writeFile(path.join(directories.worlds, `${BOOK_NAME}.json`), '{"entries":{}}');
        await assert.rejects(saveLibraryChange(directories, 'install', 'character:999', catalog), /different lorebook/);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('edited updates require explicit confirmation, preserve unrelated edits and create no duplicate books', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'weyphone-registrar-confirm-'));
    try {
        const directories = { worlds: dir };
        const filename = path.join(dir, `${BOOK_NAME}.json`);
        const other = { ...npc, id: 1000, name: 'Other' };
        let book = await saveLibraryChange(directories, 'install', 'character:999', catalog);
        book = await saveLibraryChange(directories, 'install', 'character:1000', [other]);
        Object.values(book.entries).find(row => row.comment === 'Testy').content += ' My custom lore.';
        Object.values(book.entries).find(row => row.comment === 'Other').content += ' Other custom lore.';
        book.entries[99999] = { uid: 99999, comment: 'Custom entry', content: 'Keep me' };
        await fs.writeFile(filename, JSON.stringify(book));
        const before = await fs.readFile(filename, 'utf8');
        const changed = { ...npc, personality: 'Updated character.' };
        await assert.rejects(saveLibraryChange(directories, 'install', 'character:999', [changed]), error => error.code === 'REGISTRAR_EDITS_DETECTED');
        assert.equal(await fs.readFile(filename, 'utf8'), before, 'cancel/no confirmation leaves lore untouched');
        const next = await saveLibraryChange(directories, 'install', 'character:999', [changed], { overwriteEdits: true });
        assert.match(Object.values(next.entries).find(row => row.comment === 'Testy').content, /Updated character/);
        assert.doesNotMatch(Object.values(next.entries).find(row => row.comment === 'Testy').content, /My custom lore/);
        assert.match(Object.values(next.entries).find(row => row.comment === 'Other').content, /Other custom lore/);
        assert.equal(next.entries[99999].content, 'Keep me');
        // Updating a clean character again does not ask about the other character's edits.
        await saveLibraryChange(directories, 'install', 'character:999', [changed]);
        // Remove the first character: the second moves UID slots but retains its edits.
        const removed = await saveLibraryChange(directories, 'remove', 'character:999', []);
        assert.match(Object.values(removed.entries).find(row => row.comment === 'Other').content, /Other custom lore/);
        assert.equal(Object.values(removed.entries).some(row => row.comment === 'Testy'), false);
        assert.deepEqual((await fs.readdir(dir)).filter(name => name.endsWith('.json')), [`${BOOK_NAME}.json`]);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('deleted entries remain recoverable by update or removal and invalid requests do not change edited lore', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'weyphone-registrar-deleted-'));
    try {
        const directories = { worlds: dir };
        const filename = path.join(dir, `${BOOK_NAME}.json`);
        const book = await saveLibraryChange(directories, 'install', 'character:999', catalog);
        book.entries = {};
        await fs.writeFile(filename, JSON.stringify(book));
        await assert.rejects(saveLibraryChange(directories, 'install', 'character:1', catalog), /no longer public/);
        assert.deepEqual(await readLibrary(directories), book);
        await assert.rejects(saveLibraryChange(directories, 'install', 'character:999', catalog), error => error.code === 'REGISTRAR_EDITS_DETECTED');
        const restored = await saveLibraryChange(directories, 'install', 'character:999', catalog, { overwriteEdits: true });
        assert.ok(Object.values(restored.entries).some(row => row.comment === 'Testy'));
        restored.entries = {};
        await fs.writeFile(filename, JSON.stringify(restored));
        await saveLibraryChange(directories, 'remove', 'character:999', []);
        assert.deepEqual(librarySummary(await readLibrary(directories)).items, []);
        await saveLibraryChange(directories, 'install', 'character:999', catalog);
        await fs.unlink(filename);
        assert.deepEqual(librarySummary(await readLibrary(directories)).sources, []);
        assert.equal((await saveLibraryChange(directories, 'install', 'character:999', catalog)).registrar.records.length, 1);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('API validates identifiers and imports full mixed lore without making character cards', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'weyphone-registrar-api-'));
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { directories: { worlds: dir } }; next(); });
    app.use('/api/registrar', createRegistrarRouter(async () => catalog));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const root = `http://127.0.0.1:${server.address().port}/api/registrar`;
    try {
        const list = await (await fetch(`${root}/catalog`)).json();
        assert.equal(list.items.length, 3);
        assert.deepEqual(list.items[2].members, ['character:999', 'location:1']);
        let response = await fetch(`${root}/library`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'install', key: '../escape' }) });
        assert.equal(response.status, 400);
        response = await fetch(`${root}/library`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'install', key: 'collection:2' }) });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).items.length, 2);
        assert.deepEqual(await fs.readdir(dir), [`${BOOK_NAME}.json`]);
        const edited = await readLibrary({ worlds: dir });
        edited.entries = {};
        await fs.writeFile(path.join(dir, `${BOOK_NAME}.json`), JSON.stringify(edited));
        response = await fetch(`${root}/library`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'install', key: 'character:999' }) });
        assert.equal(response.status, 409);
        assert.equal((await response.json()).code, 'REGISTRAR_EDITS_DETECTED');
        response = await fetch(`${root}/library`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'install', key: 'character:999', overwriteEdits: true }) });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).savedEditsBookName, undefined);
    } finally { await new Promise(resolve => server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); }
});

test('remote display strings and image URLs are constrained; removed public imports remain visible', () => {
    assert.equal(safePortrait('javascript:alert(1)'), '');
    assert.equal(safePortrait('https://untrusted.example/image'), '');
    assert.equal(safePortrait('https://imagedelivery.net/a/b/public'), 'https://imagedelivery.net/a/b/public');
    assert.equal(escapeRegistrar('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
    const source = { key: 'collection:2', kind: 'collection', name: 'Saved collection', members: [] };
    const state = { tab: 'library', query: '', sort: 'name', items: [], library: { items: [], sources: [source] } };
    assert.equal(visibleRegistrarItems(state)[0].key, 'collection:2');
    assert.equal(publicItem(npc).details.Personality, npc.personality);
});

test('an unloaded item keeps its paused state after merging in the fresher catalog copy', () => {
    // The catalog has no concept of load state - only the library copy does. Merging catalog
    // metadata (title/summary/portrait may have changed upstream) over the library copy must not
    // silently flip every unloaded item back to "loaded" just because it's still public.
    const libraryItem = { key: 'character:999', kind: 'character', name: 'Testy', summary: 'old summary', active: false };
    const catalogItem = { key: 'character:999', kind: 'character', name: 'Testy', summary: 'new summary', active: undefined };
    const state = { tab: 'library', query: '', sort: 'name', items: [catalogItem], library: { items: [libraryItem], sources: [{ key: 'character:999', members: ['character:999'] }] } };
    const [visible] = visibleRegistrarItems(state);
    assert.equal(visible.active, false);
    assert.equal(visible.summary, 'new summary', 'fresher catalog metadata still wins for everything but active');
});
