import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistrarApp } from '../lib/registrarApp.js';

function fixture(t, failing = new Set()) {
    const prior = globalThis.document;
    globalThis.document = { activeElement: {} };
    t.after(() => { if (prior) globalThis.document = prior; else delete globalThis.document; });
    const handlers = {};
    const root = { addEventListener: (name, fn) => { handlers[name] = fn; }, querySelector: () => null, querySelectorAll: () => [] };
    const container = { innerHTML: '', scrollTop: 0, firstElementChild: root, contains: () => true, querySelector: () => null, querySelectorAll: () => [] };
    const oldDate = '2026-09-01T00:00:00Z', newDate = '2026-09-02T00:00:00Z';
    const items = [1, 2].map(id => ({ key: `character:${id}`, kind: 'character', id, name: `Character ${id}`, members: [], updatedAt: newDate }));
    const library = { bookName: 'Test', items: [], sources: items.map(row => ({ ...row, updatedAt: oldDate })) };
    const requests = [], activations = [], expressionRequests = [], edited = new Set();
    const app = createRegistrarApp({
        getAutoActivateNewImports: () => false, isActive: () => false,
        async request(route, body) {
            if (route.startsWith('/expressions/')) { expressionRequests.push(route); return { running: false, total: 0, done: 0, failed: 0, errors: [] }; }
            if (!body) return route === '/catalog' ? { items } : library;
            requests.push(body);
            if (edited.has(body.key) && !body.overwriteEdits) throw Object.assign(new Error('Manual edits detected. Proceeding will overwrite these changes.'), { code: 'REGISTRAR_EDITS_DETECTED' });
            edited.delete(body.key);
            if (failing.has(body.key)) throw new Error('Download failed');
            library.sources.find(row => row.key === body.key).updatedAt = newDate;
            return library;
        },
        async onLibraryChange(_library, activate) { activations.push(activate); },
    });
    app.mount(container);
    const click = action => handlers.click({ target: { closest: () => ({ dataset: typeof action === 'string' ? { rgAction: action } : action }) } });
    return { app, container, click, requests, activations, failing, expressionRequests, library, items, edited };
}

test('scan only checks; Update all installs found updates and disappears after success', async t => {
    const f = fixture(t);
    await new Promise(resolve => setImmediate(resolve));
    await f.click('settings');
    assert.doesNotMatch(f.container.innerHTML, /data-rg-action="updateAll"/);
    await f.click('scanUpdates');
    assert.equal(f.requests.length, 0);
    assert.match(f.container.innerHTML, /data-rg-action="updateAll"/);
    const work = f.click('updateAll');
    await f.click('updateAll'); // Duplicate clicks must not enqueue another batch.
    await work;
    assert.deepEqual(f.requests.map(row => row.key), ['character:1', 'character:2']);
    assert.ok(f.requests.every(row => row.action === 'install' && row.startPaused));
    assert.deepEqual(f.activations, [false, false]);
    assert.match(f.container.innerHTML, /All 2 updates downloaded and applied/);
    assert.doesNotMatch(f.container.innerHTML, /data-rg-action="updateAll"/);
    await f.click('scanUpdates');
    assert.match(f.container.innerHTML, /Everything is up to date/);
});

test('failed updates remain retryable without re-downloading successful updates', async t => {
    const f = fixture(t, new Set(['character:1']));
    await new Promise(resolve => setImmediate(resolve));
    await f.click('settings'); await f.click('scanUpdates'); await f.click('updateAll');
    assert.match(f.container.innerHTML, /1 of 2 updates applied\. 1 failed/);
    assert.match(f.container.innerHTML, /Character 1: Download failed/);
    f.failing.clear();
    await f.click('updateAll');
    assert.deepEqual(f.requests.map(row => row.key), ['character:1', 'character:2', 'character:1']);
    assert.doesNotMatch(f.container.innerHTML, /data-rg-action="updateAll"/);
});

test('individual edited update can cancel without mutation, then explicitly overwrite', async t => {
    const f = fixture(t);
    await new Promise(resolve => setImmediate(resolve));
    f.edited.add('character:1');
    await f.click({ rgInstall: 'character:1' });
    assert.match(f.container.innerHTML, /Edits detected/);
    assert.match(f.container.innerHTML, /Update and overwrite edits/);
    assert.equal(f.activations.length, 0);
    await f.click('cancel');
    assert.doesNotMatch(f.container.innerHTML, /rg-confirm-title/);
    assert.equal(f.requests.length, 1);
    assert.ok(f.edited.has('character:1'));
    await f.click({ rgInstall: 'character:1' });
    await f.click('confirm');
    assert.equal(f.requests.at(-1).overwriteEdits, true);
    assert.equal(f.activations.length, 1);
    assert.doesNotMatch(f.container.innerHTML, /rg-confirm-title/);
});

test('Update all pauses for each edited import and cancellation leaves remaining updates retryable', async t => {
    const f = fixture(t);
    await new Promise(resolve => setImmediate(resolve));
    f.edited.add('character:1'); f.edited.add('character:2');
    await f.click('settings'); await f.click('scanUpdates'); await f.click('updateAll');
    assert.match(f.container.innerHTML, /Edits detected/);
    assert.equal(f.requests.length, 1);
    await f.click('cancel');
    assert.equal(f.activations.length, 0);
    await f.click('updateAll');
    await f.click('confirm');
    assert.equal(f.activations.length, 1);
    assert.match(f.container.innerHTML, /Edits detected/);
    assert.ok(f.edited.has('character:2'), 'confirming the first character must not authorize the next');
    await f.click('cancel');
    await f.click('updateAll');
    await f.click('confirm');
    assert.equal(f.activations.length, 2);
    assert.equal(f.requests.filter(row => row.key === 'character:1' && row.overwriteEdits).length, 1);
    assert.equal(f.requests.filter(row => row.key === 'character:2' && row.overwriteEdits).length, 1);
    assert.match(f.container.innerHTML, /All 1 update downloaded and applied/);
    assert.doesNotMatch(f.container.innerHTML, /rg-confirm-title/);
});


test('empty-library walkthrough uses a catalog character without saving an import', async t => {
    const f = fixture(t);
    await new Promise(resolve => setImmediate(resolve));
    f.library.sources = [];
    f.app.showTutorialStep('world-card');
    assert.match(f.container.innerHTML, /rg-load-toggle/);
    assert.match(f.container.innerHTML, /Character [12]/);
    assert.equal(f.library.items.length, 0);
    assert.equal(f.library.sources.length, 0);
    assert.equal(f.requests.length, 0);
    f.app.closeTutorial();
    assert.doesNotMatch(f.container.innerHTML, /rg-load-toggle/);
    assert.equal(f.requests.length, 0);
});
