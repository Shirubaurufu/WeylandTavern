import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { desiredFiles, syncRegistrarExpressions, folderName, STATE_FILE } from '../../../../../src/registrar/expressions.js';
import { saveLibraryChange } from '../../../../../src/registrar/library.js';
import { expressionsKey, publicItem } from '../../../../../src/registrar/catalog.js';
import { createRegistrarApp } from '../lib/registrarApp.js';

const IMG = 'https://imagedelivery.net/acct';
const list = entries => JSON.stringify(entries.map(([label, id]) => ({ label, path: `${IMG}/${id}/expression` })));
const maple = (overrides = {}) => ({
    kind: 'character', id: 373, characterId: 373, name: 'Maple', status: 'public', summary: 'Syrup.', updatedAt: '2026-09-10T00:00:00Z',
    expressionsClothed: list([['neutral', 'n1'], ['anger', 'a1'], ['anger', 'a2']]),
    expressionsUnderwear: list([['neutral', 'u1']]),
    expressionsNude: '[]',
    ...overrides,
});

function fakeFetch({ type = 'image/avif', fail = new Set() } = {}) {
    const calls = [];
    const impl = async (url, options) => {
        calls.push(url);
        assert.match(options.headers.Accept, /^image\/avif/);
        if (fail.has(url)) return { ok: false, status: 503, headers: new Map() };
        return { ok: true, status: 200, headers: new Map([['content-type', type]]), arrayBuffer: async () => new TextEncoder().encode(`bytes of ${url}`).buffer };
    };
    return { impl, calls };
}

async function setup(t, records) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wp-reg-expr-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    const directories = { worlds: path.join(dir, 'worlds'), characters: path.join(dir, 'characters') };
    for (const record of records) await saveLibraryChange(directories, 'install', `character:${record.id}`, records);
    return directories;
}
const ls = async dir => (await fs.readdir(dir)).sort();

test('desiredFiles keeps alternates, drops unsafe labels and foreign hosts', () => {
    const files = desiredFiles(maple({
        expressionsNude: JSON.stringify([
            { label: '../../evil', path: `${IMG}/x/expression` },
            { label: 'joy', path: 'https://attacker.example/joy.png' },
            { label: 'joy', path: 'http://imagedelivery.net/insecure' },
            { label: 'Relief', path: `${IMG}/r1/expression` },
        ]),
    }));
    assert.deepEqual(Object.keys(files).sort(), ['clothed/anger', 'clothed/anger-2', 'clothed/neutral', 'nude/relief', 'underwear/neutral']);
    assert.deepEqual(desiredFiles({ expressionsClothed: 'not json' }), {});
});

test('sync downloads once, re-fetches only changed images, and removes deleted ones', async t => {
    const directories = await setup(t, [maple()]);
    const first = fakeFetch();
    const progress = await syncRegistrarExpressions(directories, { fetchImpl: first.impl });
    assert.deepEqual({ total: progress.total, done: progress.done, failed: progress.failed }, { total: 4, done: 4, failed: 0 });
    const root = path.join(directories.characters, folderName(373));
    assert.deepEqual(await ls(path.join(root, 'clothed')), ['anger-2.avif', 'anger.avif', 'neutral.avif']);
    assert.deepEqual(await ls(path.join(root, 'underwear')), ['neutral.avif']);

    const again = fakeFetch();
    assert.equal((await syncRegistrarExpressions(directories, { fetchImpl: again.impl })).total, 0);
    assert.equal(again.calls.length, 0, 'unchanged sprites are not downloaded again');

    // Creator replaced the neutral sprite (new URL) and deleted the second anger.
    const updated = maple({ expressionsClothed: list([['neutral', 'n2'], ['anger', 'a1']]), updatedAt: '2026-09-11T00:00:00Z' });
    await saveLibraryChange(directories, 'install', 'character:373', [updated]);
    const third = fakeFetch({ type: 'image/png' });
    await syncRegistrarExpressions(directories, { fetchImpl: third.impl });
    assert.deepEqual(third.calls, [`${IMG}/n2/expression`]);
    assert.deepEqual(await ls(path.join(root, 'clothed')), ['anger.avif', 'neutral.png'], 'format change leaves one file per label');
    const state = JSON.parse(await fs.readFile(path.join(root, STATE_FILE), 'utf8'));
    assert.equal(state.files['clothed/neutral'], `${IMG}/n2/expression`);
    assert.equal(state.files['clothed/anger-2'], undefined);
});

test('a failed image keeps the old copy and is retried next time', async t => {
    const directories = await setup(t, [maple()]);
    await syncRegistrarExpressions(directories, { fetchImpl: fakeFetch().impl });
    await saveLibraryChange(directories, 'install', 'character:373', [maple({ expressionsClothed: list([['neutral', 'n9'], ['anger', 'a1'], ['anger', 'a2']]) })]);
    const failing = fakeFetch({ fail: new Set([`${IMG}/n9/expression`]) });
    const result = await syncRegistrarExpressions(directories, { fetchImpl: failing.impl });
    assert.equal(result.failed, 1);
    assert.match(result.errors[0], /Maple clothed\/neutral: .*503/);
    const root = path.join(directories.characters, folderName(373));
    assert.ok(await fs.stat(path.join(root, 'clothed', 'neutral.avif')), 'previous sprite still shown');
    const retry = fakeFetch();
    await syncRegistrarExpressions(directories, { fetchImpl: retry.impl });
    assert.deepEqual(retry.calls, [`${IMG}/n9/expression`]);
});

test('removing an import deletes only folders this feature created', async t => {
    const directories = await setup(t, [maple()]);
    await syncRegistrarExpressions(directories, { fetchImpl: fakeFetch().impl });
    const foreign = path.join(directories.characters, 'Registrar-999');
    await fs.mkdir(foreign, { recursive: true });
    await fs.writeFile(path.join(foreign, 'mine.png'), 'user file');
    await saveLibraryChange(directories, 'remove', 'character:373', []);
    await syncRegistrarExpressions(directories, { fetchImpl: fakeFetch().impl });
    assert.deepEqual(await ls(directories.characters), ['Registrar-999']);
});

test('expressionsKey changes with the sprite lists and is exposed on public items', () => {
    assert.equal(expressionsKey(maple()), publicItem(maple()).expressionsKey);
    assert.notEqual(expressionsKey(maple()), expressionsKey(maple({ expressionsNude: list([['joy', 'j1']]) })));
    assert.equal(expressionsKey({ kind: 'location', id: 1 }), '');
});

test('Scan for updates flags changed sprites even with the same updatedAt, and re-checks sprites', async t => {
    const prior = globalThis.document;
    globalThis.document = { activeElement: {} };
    t.after(() => { if (prior) globalThis.document = prior; else delete globalThis.document; });
    const handlers = {};
    const root = { addEventListener: (name, fn) => { handlers[name] = fn; }, querySelector: () => null, querySelectorAll: () => [] };
    const container = { innerHTML: '', scrollTop: 0, firstElementChild: root, contains: () => true, querySelector: () => null, querySelectorAll: () => [] };
    const date = '2026-09-02T00:00:00Z';
    const items = [{ key: 'character:373', kind: 'character', id: 373, name: 'Maple', members: [], updatedAt: date, expressionsKey: 'new' }];
    const library = { bookName: 'Test', items: [{ ...items[0], expressionsKey: 'old' }], sources: [{ key: 'character:373', name: 'Maple', updatedAt: date, members: ['character:373'] }] };
    const routes = [];
    const app = createRegistrarApp({
        getAutoActivateNewImports: () => true, isActive: () => true,
        async request(route) {
            routes.push(route);
            if (route.startsWith('/expressions/')) return { running: false, total: 0, done: 0, failed: 0, errors: [] };
            return route === '/catalog' ? { items } : library;
        },
        async onLibraryChange() {},
    });
    app.mount(container);
    await new Promise(resolve => setImmediate(resolve));
    await handlers.click({ target: { closest: () => ({ dataset: { rgAction: 'settings' } }) } });
    await handlers.click({ target: { closest: () => ({ dataset: { rgAction: 'scanUpdates' } }) } });
    await new Promise(resolve => setImmediate(resolve));
    assert.match(container.innerHTML, /1 update found/);
    assert.ok(routes.includes('/expressions/sync'));
});

test('progress line: live count while running, result only for the session that watched it', async () => {
    const { expressionStatusLine } = await import('../lib/ui/apps/registrar.js');
    const base = { running: false, total: 84, done: 84, failed: 0, errors: [] };
    assert.match(expressionStatusLine({ expressionStatus: { ...base, running: true, done: 28 } }), /Downloading expressions… 28 of 84 images/);
    assert.equal(expressionStatusLine({ expressionStatus: base }), '', 'an old finished job is not re-announced');
    assert.match(expressionStatusLine({ expressionStatus: base, expressionWatched: true }), /Expressions downloaded \(84 images\)/);
    assert.match(expressionStatusLine({ expressionStatus: { ...base, failed: 2, errors: ['Maple clothed/joy: <b>503</b>'] }, expressionWatched: true }), /2 images failed \(Maple clothed\/joy: &lt;b&gt;503&lt;\/b&gt;\)/);
    assert.equal(expressionStatusLine({ expressionStatus: { ...base, total: 0, done: 0 } }), '');
});

test('expressions badge and "With expressions" filter', async () => {
    const { renderRegistrar, visibleRegistrarItems } = await import('../lib/ui/apps/registrar.js');
    const { normalizeRegistrarFilters, hiddenByRegistrarFilters } = await import('../lib/registrarFilters.js');
    assert.equal(publicItem(maple()).expressions, 4);
    assert.equal(publicItem({ kind: 'location', id: 1, name: 'Hall' }).expressions, 0);
    const withSprites = { key: 'character:373', kind: 'character', id: 373, name: 'Maple', expressions: 84, tags: [] };
    const without = { key: 'character:5', kind: 'character', id: 5, name: 'Plain', expressions: 0, tags: [] };
    const place = { key: 'location:1', kind: 'location', id: 1, name: 'Hall' };
    assert.equal(normalizeRegistrarFilters({}).onlyExpressions, false);
    assert.equal(normalizeRegistrarFilters({ onlyExpressions: 'yes' }).onlyExpressions, false);
    assert.equal(hiddenByRegistrarFilters(without, { onlyExpressions: true }), true);
    assert.equal(hiddenByRegistrarFilters(withSprites, { onlyExpressions: true }), false);
    assert.equal(hiddenByRegistrarFilters(place, { onlyExpressions: true }), false, 'locations are never hidden by it');
    const state = { items: [withSprites, without], tab: 'character', query: '', sort: 'name', page: 0, browseFilters: { onlyExpressions: true }, library: { items: [], sources: [] } };
    assert.deepEqual(visibleRegistrarItems(state).map(row => row.name), ['Maple']);
    const container = { innerHTML: '', querySelectorAll: () => [] };
    renderRegistrar(container, state);
    assert.match(container.innerHTML, /data-rg-action="toggleExpressions" aria-pressed="true"/);
    assert.equal((container.innerHTML.match(/class="rg-expr-badge"/g) || []).length, 1, 'badge only on the character with sprites');
    renderRegistrar(container, { ...state, tab: 'location' });
    assert.doesNotMatch(container.innerHTML, /toggleExpressions/, 'toggle only on Characters');
});

test('"With expressions" toggle flips, persists and resets the page', async t => {
    const prior = globalThis.document;
    globalThis.document = { activeElement: {} };
    t.after(() => { if (prior) globalThis.document = prior; else delete globalThis.document; });
    const handlers = {};
    const root = { addEventListener: (name, fn) => { handlers[name] = fn; }, querySelector: () => null, querySelectorAll: () => [] };
    const container = { innerHTML: '', scrollTop: 0, firstElementChild: root, contains: () => true, querySelector: () => null, querySelectorAll: () => [] };
    const saved = [];
    const app = createRegistrarApp({
        getAutoActivateNewImports: () => true, isActive: () => true, getBrowseFilters: () => ({ tags: ['furry'] }), setBrowseFilters: value => saved.push(value),
        async request(route) { return route === '/catalog' ? { items: [] } : route.startsWith('/expressions/') ? { running: false, total: 0, done: 0, failed: 0, errors: [] } : { bookName: 'T', items: [], sources: [] }; },
        async onLibraryChange() {},
    });
    app.mount(container);
    const click = action => handlers.click({ target: { closest: () => ({ dataset: { rgAction: action } }) } });
    await click('toggleExpressions');
    assert.deepEqual(saved.at(-1), { gender: [], species: [], tags: ['furry'], onlyExpressions: true }, 'other filters kept');
    await click('toggleExpressions');
    assert.equal(saved.at(-1).onlyExpressions, false);
});

test('a server not yet restarted (no expression counts) hides the toggle and never empties the list', async () => {
    const { renderRegistrar, visibleRegistrarItems } = await import('../lib/ui/apps/registrar.js');
    const old = [{ key: 'character:1', kind: 'character', id: 1, name: 'A', tags: [] }, { key: 'character:2', kind: 'character', id: 2, name: 'B', tags: [] }];
    const state = { items: old, tab: 'character', query: '', sort: 'name', page: 0, browseFilters: { onlyExpressions: true }, library: { items: [], sources: [] } };
    assert.equal(visibleRegistrarItems(state).length, 2);
    const container = { innerHTML: '', querySelectorAll: () => [] };
    renderRegistrar(container, state);
    assert.doesNotMatch(container.innerHTML, /toggleExpressions/);
});
