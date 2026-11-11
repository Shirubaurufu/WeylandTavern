import test from 'node:test';
import assert from 'node:assert/strict';

import { APP_REGISTRY, getSyncApps } from '../lib/appRegistry.js';
import { defaultSettings, getSettings } from '../lib/config.js';
import { HOME_GRID_ORDER, renderHomeScreen } from '../lib/ui/homeScreen.js';
import { renderWeyStoreScreen } from '../lib/ui/apps/weystore.js';
import { getAppHelp } from '../lib/ui/appHelp.js';
import {
    LOADOUTS, SYSTEM_APP_KEYS, appFootprint, applyLoadout, buildStoreModel, createHomeFolder,
    homeLayout, homeLocation, isAppInstalled, markAppSeen, matchingLoadout, moveHomeApp,
    moveHomeFolder, removeEmptyHomeFolder, setAppInstalled, storeState,
} from '../lib/weystore.js';
import { STORE_SHELVES, listedKeys, storeListing } from '../lib/weystoreCatalog.js';

const container = () => ({ innerHTML: '' });
const fresh = () => structuredClone(defaultSettings);
const BUILT_IN = APP_REGISTRY.map(app => app.key);
const LAST_SMOKE = { key: 'last-smoke-demo', label: 'Last Smoke', icon: '/ls.png', accent: '#d1263a', mount() {} };
const AETHEL = { key: 'aethel-companion', label: 'Aethel', icon: '/a.png', accent: '#a98bc4', mount() {} };
const model = (settings, extra = {}) => buildStoreModel({ registry: APP_REGISTRY, settings, day: 0, ...extra });

// ------------------------------------------------------------ install state

test('a fresh phone has every app installed, and old saves without the store key still work', () => {
    const settings = fresh();
    for (const key of BUILT_IN) assert.equal(isAppInstalled(settings, key), true, key);
    // An install saved before the WeyStore existed has no `weystore` key at all.
    assert.equal(isAppInstalled({}, 'notes'), true);
    assert.equal(isAppInstalled({ weystore: null }, 'notes'), true);
    // getSettings backfills the key for such a save.
    const migrated = getSettings({ WeyPhone: { conversations: {}, phoneApps: {} } });
    assert.deepEqual(migrated.weystore, { off: {}, seen: {}, layout: { order: [], folders: {} } });
});

test('uninstalling is an exclusion: unknown future apps count as installed', () => {
    const settings = fresh();
    assert.equal(setAppInstalled(settings, 'board', false), true);
    assert.equal(isAppInstalled(settings, 'board'), false);
    assert.equal(isAppInstalled(settings, 'an-app-from-next-year'), true);
    // No-op calls report no change, so the caller does not save or redraw for nothing.
    assert.equal(setAppInstalled(settings, 'board', false), false);
    assert.equal(setAppInstalled(settings, 'board', true), true);
    assert.deepEqual(settings.weystore.off, {});
});

test('built-in apps can never be removed, by any route', () => {
    const settings = fresh();
    for (const key of SYSTEM_APP_KEYS) {
        assert.equal(setAppInstalled(settings, key, false), false, key);
        assert.equal(isAppInstalled(settings, key), true, key);
    }
    // Even a hand-edited save that claims they are off.
    settings.weystore.off = { messages: true, weystore: true, settings: true, contacts: true };
    for (const key of SYSTEM_APP_KEYS) assert.equal(isAppInstalled(settings, key), true, key);
    for (const loadout of LOADOUTS) {
        applyLoadout(settings, loadout.id, BUILT_IN);
        for (const key of SYSTEM_APP_KEYS) assert.equal(isAppInstalled(settings, key), true, `${loadout.id}/${key}`);
    }
});

test('store state is a per-app map so two devices merge instead of overwriting each other', () => {
    const settings = { weystore: { off: ['notes'], seen: 'x' } }; // wrong shapes are repaired
    const state = storeState(settings);
    assert.deepEqual(state, { off: {}, seen: {}, layout: { order: [], folders: {} } });
    assert.equal(Array.isArray(state.off), false);
});

test('loadouts set a whole phone and report which one is active', () => {
    const settings = fresh();
    assert.equal(matchingLoadout(settings, BUILT_IN), 'works');
    assert.equal(applyLoadout(settings, 'quiet', BUILT_IN), true);
    assert.deepEqual(Object.keys(settings.weystore.off).sort(), ['board', 'chat', 'chronicle', 'feed']);
    assert.equal(matchingLoadout(settings, BUILT_IN), 'quiet');

    applyLoadout(settings, 'texting', BUILT_IN);
    const kept = BUILT_IN.filter(key => isAppInstalled(settings, key)).sort();
    assert.deepEqual(kept, ['contacts', 'kressa', 'messages', 'narrative', 'settings', 'weystore']);

    // One more change and it is the player's own mix again.
    setAppInstalled(settings, 'notes', true);
    assert.equal(matchingLoadout(settings, BUILT_IN), null);
    assert.equal(applyLoadout(settings, 'nope', BUILT_IN), false);
});

test('only "The works" touches tiles added by other extensions', () => {
    const settings = fresh();
    setAppInstalled(settings, 'last-smoke-demo', false);
    applyLoadout(settings, 'quiet', BUILT_IN, ['last-smoke-demo']);
    assert.equal(isAppInstalled(settings, 'last-smoke-demo'), false);
    assert.equal(matchingLoadout(settings, BUILT_IN, ['last-smoke-demo']), 'quiet');
    applyLoadout(settings, 'works', BUILT_IN, ['last-smoke-demo']);
    assert.equal(isAppInstalled(settings, 'last-smoke-demo'), true);
});

test('the Last Smoke demo ships off the phone until the player adds it', () => {
    const settings = fresh();
    assert.equal(isAppInstalled(settings, 'last-smoke-demo'), false, 'default is off, unlike every other tile');
    assert.equal(isAppInstalled(settings, 'chronicle'), true, 'ordinary apps still default to on');
    assert.equal(setAppInstalled(settings, 'last-smoke-demo', true), true);
    assert.equal(settings.weystore.off['last-smoke-demo'], false, 'an explicit on marker, so it survives reloads');
    assert.equal(isAppInstalled(settings, 'last-smoke-demo'), true);
    assert.equal(setAppInstalled(settings, 'last-smoke-demo', true), false, 'a second add changes nothing');
    assert.equal(setAppInstalled(settings, 'last-smoke-demo', false), true);
    assert.equal(isAppInstalled(settings, 'last-smoke-demo'), false);
    assert.equal('last-smoke-demo' in settings.weystore.off, false, 'off is the resting state, not a marker');
    // The shelf and app page say so, and the copy keeps its paragraphs.
    const target = container();
    renderWeyStoreScreen(target, model(settings, { externalApps: [LAST_SMOKE] }), { detailKey: 'last-smoke-demo' });
    assert.match(target.innerHTML, /data-ws-action="get" data-key="last-smoke-demo"/);
    assert.match(target.innerHTML, /wp-ws-action-note">\(DEMO\)/);
    const abouts = target.innerHTML.match(/<p class="wp-ws-about">[\s\S]*?<\/p>/g) ?? [];
    assert.equal(abouts.length, 4, 'the demo page renders its four paragraphs');
    assert.match(target.innerHTML, /down to one card/);
    assert.doesNotMatch(target.innerHTML, /down to two cards/);
});

// ------------------------------------------------------------ catalog

test('every app the phone ships has a hand-written listing on a real shelf', () => {
    const shelfIds = new Set(STORE_SHELVES.map(shelf => shelf.id));
    for (const app of APP_REGISTRY) {
        if (app.key === 'weystore') continue; // the store does not list itself
        assert.ok(listedKeys().includes(app.key), `${app.key} needs a listing in weystoreCatalog.js`);
        const listing = storeListing(app.key);
        assert.ok(listing.tagline && listing.about, app.key);
        assert.ok(shelfIds.has(listing.shelf), `${app.key} shelf`);
        assert.notEqual(listing.shelf, 'extras', `${app.key} belongs on a named shelf`);
        assert.ok(['free', 'sync', 'message'].includes(listing.cost.kind), `${app.key} must state its cost`);
        assert.equal(listing.fresh, false, `${app.key} is not a new arrival`);
        assert.match(listing.hero, /weystore\/hero_[a-z]+(?:-v\d+)?\.(?:webp|avif)$/, `${app.key} banner`); // no PNG banners: Kressa's was 1.8 MB
        for (const pair of listing.pairs) assert.ok(listedKeys().includes(pair), `${app.key} pairs with unknown ${pair}`);
    }
});

test('what a listing says about cost matches how the app really behaves', () => {
    // The four Sync feeds are exactly the apps the registry marks as part of Sync.
    const syncListed = listedKeys().filter(key => storeListing(key).cost.kind === 'sync').sort();
    assert.deepEqual(syncListed, getSyncApps().map(app => app.key).sort());
    // Apps whose help says "nothing here spends a message" are listed as free.
    for (const key of ['clock', 'weybooru', 'narrative', 'registrar']) {
        assert.equal(storeListing(key).cost.kind, 'free', key);
        const help = getAppHelp(key);
        assert.ok(help.bullets.some(item => /never calls a model|spends a message/i.test(item)), `${key} help`);
    }
});

test('store copy follows the house rules: no invented stats, no unreleased characters, no em dashes', () => {
    const everything = JSON.stringify([STORE_SHELVES, listedKeys().map(key => storeListing(key)), LOADOUTS, getAppHelp('weystore')]);
    assert.doesNotMatch(everything, /—/, 'no em dashes');
    assert.doesNotMatch(everything, /chaska|aethel/i, 'unreleased characters stay out of the store');
    assert.doesNotMatch(everything, /\b(rating|ratings|reviews?|downloads?|stars?)\b/i, 'no fake store furniture');
    const rendered = container();
    renderWeyStoreScreen(rendered, model(fresh(), { externalApps: [LAST_SMOKE] }));
    assert.doesNotMatch(rendered.innerHTML, /—|chaska|aethel/i);
});

test('an extension tile gets a page: its own store block wins, then the catalog, then a default', () => {
    const unknown = storeListing('mystery-app', { key: 'mystery-app', label: 'Mystery' });
    assert.equal(unknown.shelf, 'extras');
    assert.equal(unknown.hero, null);
    assert.equal(unknown.fresh, false, 'an unknown tile cannot claim the spotlight');
    assert.ok(unknown.about.length > 0);

    const known = storeListing('last-smoke-demo', LAST_SMOKE);
    assert.equal(known.shelf, 'games');
    assert.equal(known.cost.kind, 'free');
    assert.match(known.hero, /^\/scripts\/extensions\/Weyland-LastSmoke-Demo\/demo\/assets\//);

    const described = storeListing('mystery-app', { store: { tagline: 'Hello', shelf: 'games', hero: 'https://x/y.webp' } });
    assert.equal(described.tagline, 'Hello');
    assert.equal(described.shelf, 'games');
    assert.equal(described.hero, 'https://x/y.webp');
});

// ------------------------------------------------------------ model

test('the model lists every app once, never the store itself, with honest counts', () => {
    const settings = fresh();
    setAppInstalled(settings, 'board', false);
    const store = model(settings, { externalApps: [LAST_SMOKE] });
    assert.equal(store.byKey.has('weystore'), false);
    assert.equal(store.totalCount, APP_REGISTRY.length - 1 + 1);
    // board is off, and the Last Smoke demo ships off by default.
    assert.equal(store.installedCount, store.totalCount - 2);
    const shelved = store.shelves.flatMap(shelf => shelf.keys);
    assert.deepEqual([...shelved].sort(), store.apps.map(app => app.key).sort(), 'every app is on exactly one shelf');
    assert.equal(new Set(shelved).size, shelved.length);
    assert.equal(store.shelves[0].id, 'games', 'the new demo leads the page');
    assert.ok(store.shelves.every(shelf => shelf.keys.length > 0), 'empty shelves are dropped');
    assert.equal(model(fresh()).shelves.some(shelf => shelf.id === 'games'), false);
    assert.deepEqual(store.byKey.get('messages').system, true);
    assert.deepEqual(store.byKey.get('kressa').needsMembership, true);
    assert.deepEqual(store.byKey.get('mien').needsRoleplay, true);
});

test('spotlight: a new arrival first, then a daily pick that prefers what you do not have', () => {
    const settings = fresh();
    const withDemo = model(settings, { externalApps: [LAST_SMOKE] });
    assert.deepEqual(withDemo.spotlight, { key: 'last-smoke-demo', kicker: 'New arrival' });

    // Once its page has been opened it stops being new. Last Smoke has its own neutral demo label
    // instead of the generic "Not on your phone yet" copy used for ordinary missing apps.
    assert.equal(markAppSeen(settings, 'last-smoke-demo'), true);
    assert.equal(markAppSeen(settings, 'last-smoke-demo'), false);
    const seen = model(settings, { externalApps: [LAST_SMOKE] });
    assert.equal(seen.byKey.get('last-smoke-demo').fresh, false);
    assert.equal(seen.spotlight.kicker, 'Featured demo');
    assert.equal(seen.byKey.get(seen.spotlight.key).system, false, 'never spotlights a built-in app');

    // The same day always gives the same pick; a different day can give another.
    assert.equal(model(settings, { day: 5 }).spotlight.key, model(settings, { day: 5 }).spotlight.key);
    const picks = new Set([0, 1, 2, 3, 4, 5, 6].map(day => model(settings, { day }).spotlight.key));
    assert.ok(picks.size > 1);

    setAppInstalled(settings, 'notes', false);
    assert.deepEqual(model(settings, { day: 3 }).spotlight, { key: 'notes', kicker: 'Not on your phone yet' });
});

test('footprint reports what the player really has saved, and nothing when there is nothing', () => {
    const settings = fresh();
    assert.equal(appFootprint(settings, 'messages'), '');
    settings.conversations = { a: { charName: 'Vera' }, b: { charName: 'Kressa', isDedicatedApp: 'kressa' }, c: { charName: 'Belle' } };
    settings.ui.notes = [{ id: 1 }];
    settings.ui.clockAlarms = [{}, {}];
    settings.ui.clockTimers = [{}];
    settings.savedPosts = { feed: [{}, {}, {}] };
    assert.equal(appFootprint(settings, 'messages'), '2 threads');
    assert.equal(appFootprint(settings, 'kressa'), '1 thread');
    assert.equal(appFootprint(settings, 'notes'), '1 note');
    assert.equal(appFootprint(settings, 'clock'), '2 alarms, 1 timer');
    assert.equal(appFootprint(settings, 'feed'), '3 saved posts');
    assert.equal(appFootprint(settings, 'chronicle'), '');
    assert.equal(appFootprint(settings, 'calculator'), '');
    assert.equal(appFootprint({}, 'messages'), '');
});

test('"Lives in" follows the real home screen', () => {
    assert.equal(homeLocation('messages'), 'Dock');
    assert.equal(homeLocation('contacts'), 'Dock');
    assert.equal(homeLocation('notes'), 'Utilities folder');
    assert.equal(homeLocation('feed'), 'Home screen');
});

// ------------------------------------------------------------ home screen

test('the factory layout puts Aethel in Utilities, leaves Last Smoke loose, and keeps folders last', () => {
    const layout = homeLayout(
        fresh(),
        [...BUILT_IN, AETHEL.key, LAST_SMOKE.key],
        [AETHEL.key, LAST_SMOKE.key],
    );
    assert.deepEqual(layout.folders.utilities.apps, ['calculator', 'clock', 'notes', 'aethel-companion']);
    assert.doesNotMatch(layout.order.join(','), /aethel-companion/);
    assert.ok(layout.order.indexOf('last-smoke-demo') < layout.order.indexOf('folder:utilities'));
    // Messages and Contacts belong to the dock, so the arrangeable layout never holds them.
    assert.equal(layout.order.includes('messages'), false);
    assert.equal(layout.order.includes('contacts'), false);
    assert.ok(layout.order.slice(layout.order.indexOf('folder:utilities')).every(item => item.startsWith('folder:')));
    assert.equal(homeLocation(AETHEL.key, layout), 'Utilities folder');
});

function homeTiles(settings, extraApps = []) {
    const target = container();
    renderHomeScreen(target, {
        apps: APP_REGISTRY.filter(app => isAppInstalled(settings, app.key)),
        extraApps: extraApps.filter(app => isAppInstalled(settings, app.key)),
        badges: {}, flavorAppsEnabled: true, syncing: false, airplane: false,
        syncAvailable: getSyncApps().some(app => isAppInstalled(settings, app.key)),
    });
    return target.innerHTML;
}

test('the WeyStore has a home tile, placed just before Settings', () => {
    assert.ok(APP_REGISTRY.some(app => app.key === 'weystore' && app.screenView === 'weystore' && app.inGrid));
    const storeAt = HOME_GRID_ORDER.indexOf('weystore');
    assert.equal(HOME_GRID_ORDER[storeAt + 1], 'settings');
    assert.match(homeTiles(fresh()), /data-app="weystore"/);
});

test('an uninstalled app has no tile, in the grid, the dock or a folder', () => {
    const settings = fresh();
    setAppInstalled(settings, 'board', false);
    setAppInstalled(settings, 'last-smoke-demo', true);
    setAppInstalled(settings, 'last-smoke-demo', false);
    const html = homeTiles(settings, [LAST_SMOKE]);
    assert.doesNotMatch(html, /data-app="board"/);
    assert.doesNotMatch(html, /data-app="last-smoke-demo"/);
    assert.match(html, /data-app="feed"/);
    // The demo ships off, so its tile only exists once the player has added it.
    assert.doesNotMatch(homeTiles(fresh(), [LAST_SMOKE]), /data-app="last-smoke-demo"/);
    const added = fresh();
    setAppInstalled(added, 'last-smoke-demo', true);
    assert.match(homeTiles(added, [LAST_SMOKE]), /data-app="last-smoke-demo"/);
});

test('a folder left with one app becomes that app; an empty folder disappears', () => {
    const settings = fresh();
    setAppInstalled(settings, 'calculator', false);
    assert.match(homeTiles(settings), /data-folder="utilities"/, 'two apps is still a folder');
    setAppInstalled(settings, 'clock', false);
    const one = homeTiles(settings);
    assert.doesNotMatch(one, /data-folder="utilities"/);
    assert.doesNotMatch(one, /wp-folder-sheet/);
    assert.match(one, /data-app="notes"/);
    setAppInstalled(settings, 'notes', false);
    const none = homeTiles(settings);
    assert.doesNotMatch(none, /data-folder=|data-app="notes"/);
});

test('custom folders can be built, accept apps from home, and collapse when an app leaves', () => {
    const settings = fresh();
    const folderId = createHomeFolder(settings, { appKeys: BUILT_IN });
    assert.equal(folderId, 'custom-1');
    let layout = homeLayout(settings, BUILT_IN);
    assert.ok(layout.order.includes('folder:custom-1'), 'a new empty folder remains visible while it is being built');
    assert.deepEqual(layout.folders['custom-1'].apps, []);

    assert.equal(moveHomeApp(settings, { appKeys: BUILT_IN, draggedKey: 'chronicle', targetFolderId: folderId, mode: 'folder' }), true);
    assert.equal(moveHomeApp(settings, { appKeys: BUILT_IN, draggedKey: 'feed', targetFolderId: folderId, mode: 'folder' }), true);
    layout = homeLayout(settings, BUILT_IN);
    assert.deepEqual(layout.folders['custom-1'].apps, ['chronicle', 'feed']);

    // An edge/home drop takes the app out. Reducing the folder to one app dissolves the folder and
    // puts that remaining app back on the launcher as a normal tile.
    assert.equal(moveHomeApp(settings, { appKeys: BUILT_IN, draggedKey: 'chronicle', targetKey: 'board', mode: 'before' }), true);
    layout = homeLayout(settings, BUILT_IN);
    assert.equal(layout.folders['custom-1'], undefined);
    assert.equal(layout.order.includes('folder:custom-1'), false);
    assert.ok(layout.order.includes('feed'));
    assert.ok(layout.order.indexOf('chronicle') < layout.order.indexOf('board'));
});

test('an empty folder has an explicit safe removal path, while a populated one is refused', () => {
    const settings = fresh();
    const emptyId = createHomeFolder(settings, { appKeys: BUILT_IN });
    assert.equal(removeEmptyHomeFolder(settings, { appKeys: BUILT_IN, folderId: emptyId }), true);
    assert.equal(homeLayout(settings, BUILT_IN).folders[emptyId], undefined);
    assert.equal(removeEmptyHomeFolder(settings, { appKeys: BUILT_IN, folderId: emptyId }), false);

    const populatedId = createHomeFolder(settings, { appKeys: BUILT_IN });
    moveHomeApp(settings, { appKeys: BUILT_IN, draggedKey: 'feed', targetFolderId: populatedId, mode: 'folder' });
    assert.equal(removeEmptyHomeFolder(settings, { appKeys: BUILT_IN, folderId: populatedId }), false);
    assert.deepEqual(homeLayout(settings, BUILT_IN).folders[populatedId].apps, ['feed']);
});

test('Messages and Contacts stay in the dock: no uninstall, no dragging, and old layouts heal', () => {
    const settings = fresh();
    assert.equal(moveHomeApp(settings, { appKeys: BUILT_IN, draggedKey: 'messages', targetKey: 'chronicle', mode: 'before' }), false);
    assert.equal(moveHomeApp(settings, { appKeys: BUILT_IN, draggedKey: 'feed', targetKey: 'contacts', mode: 'swap' }), false);
    const folderId = createHomeFolder(settings, { appKeys: BUILT_IN });
    assert.equal(moveHomeApp(settings, { appKeys: BUILT_IN, draggedKey: 'contacts', targetFolderId: folderId, mode: 'folder' }), false);
    assert.equal(setAppInstalled(settings, 'messages', false), false);
    assert.equal(setAppInstalled(settings, 'contacts', false), false);
    assert.equal(homeLocation('messages'), 'Dock');

    // A layout saved while the two were still draggable (one loose, one inside a folder).
    const old = fresh();
    old.weystore.layout = {
        order: ['messages', 'chronicle', 'feed', 'folder:custom-1'],
        folders: { 'custom-1': { name: 'People', apps: ['contacts', 'kressa', 'housing'] } },
    };
    const healed = homeLayout(old, BUILT_IN);
    assert.equal(JSON.stringify(healed).includes('messages'), false);
    assert.deepEqual(healed.folders['custom-1'].apps, ['kressa', 'housing']);
    const html = homeTiles(old);
    const [grid, rest] = html.split('<div class="wp-dock');
    assert.doesNotMatch(grid, /data-app="(messages|contacts)"/);
    const dock = rest.split('</div>')[0];
    assert.deepEqual([...dock.matchAll(/data-app="([^"]+)"/g)].map(m => m[1]), ['messages', 'contacts']);
    assert.match(dock, /data-action="unified-sync"/);
});

test('folders stay after every app and can only be reordered against other folders', () => {
    const settings = fresh();
    const folderId = createHomeFolder(settings, { appKeys: BUILT_IN });
    moveHomeApp(settings, { appKeys: BUILT_IN, draggedKey: 'chronicle', targetFolderId: folderId, mode: 'folder' });
    moveHomeApp(settings, { appKeys: BUILT_IN, draggedKey: 'feed', targetFolderId: folderId, mode: 'folder' });
    assert.equal(moveHomeFolder(settings, {
        appKeys: BUILT_IN, draggedFolderId: folderId, targetKey: 'board', mode: 'before',
    }), false, 'an app cannot pull a folder into the app ordering');
    const layout = homeLayout(settings, BUILT_IN);
    const firstFolder = layout.order.findIndex(item => item.startsWith('folder:'));
    assert.ok(layout.order.slice(0, firstFolder).every(item => !item.startsWith('folder:')));
    assert.ok(layout.order.slice(firstFolder).every(item => item.startsWith('folder:')));
    assert.deepEqual(layout.folders['custom-1'].apps, ['chronicle', 'feed']);
});

test('legacy interleaved layouts are read with stable app order and all folders at the end', () => {
    const settings = fresh();
    settings.weystore.layout = {
        order: ['chronicle', 'folder:custom-1', 'board', 'folder:utilities', 'housing', 'settings'],
        folders: {
            'custom-1': { name: 'Social', apps: ['feed', 'chat'] },
            utilities: { name: 'Utilities', apps: ['calculator', 'clock', 'notes'] },
        },
    };
    const layout = homeLayout(settings, BUILT_IN);
    assert.deepEqual(layout.order.filter(item => !item.startsWith('folder:')).slice(0, 4), [
        'chronicle', 'board', 'housing', 'settings',
    ]);
    assert.deepEqual(layout.order.slice(-2), ['folder:custom-1', 'folder:utilities']);
});

test('the Sync button leaves the dock only when all four feeds are gone', () => {
    const settings = fresh();
    for (const key of ['chronicle', 'feed', 'chat']) setAppInstalled(settings, key, false);
    assert.match(homeTiles(settings), /data-action="unified-sync"/);
    setAppInstalled(settings, 'board', false);
    const html = homeTiles(settings);
    assert.doesNotMatch(html, /data-action="unified-sync"/);
    assert.match(html, /data-app="messages"/);
    assert.match(html, /data-app="contacts"/);
});

// ------------------------------------------------------------ screens

test('the shelf is button-free while every poster still opens its app page', () => {
    const settings = fresh();
    setAppInstalled(settings, 'board', false);
    const target = container();
    renderWeyStoreScreen(target, model(settings, { externalApps: [LAST_SMOKE] }), { tab: 'browse' });
    const html = target.innerHTML;
    assert.doesNotMatch(html, /data-ws-action="(?:get|launch)"/, 'home cards have no redundant action buttons');
    assert.match(html, /Last Smoke/);
    assert.match(html, /wp-ws-chip-demo">\(DEMO\)/);
    assert.match(html, /wp-ws-tag-new/);
    assert.match(html, /Built in/);
    assert.match(html, /<b>\d+<\/b> of \d+ on your phone/);
    // Every app has a way into its page.
    for (const app of APP_REGISTRY) {
        if (app.key === 'weystore') continue;
        assert.match(html, new RegExp(`data-ws-action="detail" data-key="${app.key}"`), app.key);
    }
});

test('a pending install does not bring a Get button back to the shelf', () => {
    const settings = fresh();
    setAppInstalled(settings, 'board', false);
    const target = container();
    renderWeyStoreScreen(target, model(settings), { tab: 'browse', busyKey: 'board' });
    assert.doesNotMatch(target.innerHTML, /wp-ws-cta-busy/);
    assert.doesNotMatch(target.innerHTML, /data-ws-action="get" data-key="board"/);
});

test('an app page states the facts and only offers Remove when that is allowed', () => {
    const settings = fresh();
    settings.ui.notes = [{ id: 1 }, { id: 2 }];
    const target = container();
    renderWeyStoreScreen(target, model(settings), { detailKey: 'notes' });
    let html = target.innerHTML;
    assert.match(html, /data-ws-screen="detail"/);
    assert.match(html, /data-ws-action="remove" data-key="notes"/);
    assert.match(html, /2 notes/);
    assert.match(html, /Utilities folder/);
    assert.match(html, /Free to run/);
    assert.match(html, /Everything you saved in it is kept/);
    assert.doesNotMatch(html, /wp-ws-top/, 'an app page drops the masthead');

    setAppInstalled(settings, 'notes', false);
    renderWeyStoreScreen(target, model(settings), { detailKey: 'notes' });
    html = target.innerHTML;
    assert.match(html, /data-ws-action="get" data-key="notes"/);
    assert.doesNotMatch(html, /data-ws-action="remove"/);
    assert.match(html, /Not installed\. Still holding 2 notes/);

    renderWeyStoreScreen(target, model(settings), { detailKey: 'messages' });
    assert.doesNotMatch(target.innerHTML, /data-ws-action="remove"/);
    // Built-in pages pin the fact instead of an "If you remove it" block.
    assert.match(target.innerHTML, /wp-ws-builtin-note/);
    assert.doesNotMatch(target.innerHTML, /If you remove it/);

    // A page for an app that no longer exists falls back to the shelf instead of throwing.
    renderWeyStoreScreen(target, model(settings), { detailKey: 'gone' });
    assert.match(target.innerHTML, /data-ws-screen="browse"/);
});

test('a membership app explains the lock instead of hiding the app', () => {
    const target = container();
    renderWeyStoreScreen(target, model(fresh(), { isLocked: app => Boolean(app.tierGated) }), { detailKey: 'kressa' });
    assert.match(target.innerHTML, /wp-ws-locked/);
    assert.match(target.innerHTML, /Paw Patrol Plus or Platinum/);
    assert.match(target.innerHTML, /data-ws-action="launch" data-key="kressa"/);
});

test('a membership app off the phone is never offered as a Get', () => {
    const settings = fresh();
    setAppInstalled(settings, 'kressa', false);
    const locked = { isLocked: app => Boolean(app.tierGated) };
    const target = container();
    // The shelf stays button-free. The app page explains the membership requirement instead of
    // ever offering a Get.
    renderWeyStoreScreen(target, model(settings, locked), { tab: 'browse' });
    assert.doesNotMatch(target.innerHTML, /data-ws-action="get" data-key="kressa"/);
    assert.doesNotMatch(target.innerHTML, /wp-ws-cta-membership/);
    renderWeyStoreScreen(target, model(settings, locked), { detailKey: 'kressa' });
    assert.doesNotMatch(target.innerHTML, /data-ws-action="get" data-key="kressa"/);
    assert.match(target.innerHTML, /Adding this one takes a Paw Patrol Plus or Platinum membership/);
    // My phone's Available row shows the crown instead of a +.
    renderWeyStoreScreen(target, model(settings, locked), { tab: 'phone' });
    assert.doesNotMatch(target.innerHTML, /data-ws-action="toggle" data-key="kressa"/);
    assert.match(target.innerHTML, /wp-ws-mini-mark-member/);
});

test('My phone mirrors the home screen: toggles for removable apps, pins for built-in ones', () => {
    const settings = fresh();
    setAppInstalled(settings, 'mien', false);
    // The demo ships off; add it so the ordering assertions cover the extension tile in the grid.
    setAppInstalled(settings, 'last-smoke-demo', true);
    const target = container();
    renderWeyStoreScreen(target, model(settings, { externalApps: [LAST_SMOKE] }), { tab: 'phone' });
    const html = target.innerHTML;
    assert.match(html, /data-ws-action="toggle" data-key="mien"\s+aria-pressed="false"/);
    assert.match(html, /data-ws-action="toggle" data-key="feed"\s+aria-pressed="true"/);
    assert.doesNotMatch(html, /data-ws-action="toggle" data-key="(messages|contacts|settings|narrative)"/);
    assert.equal((html.match(/wp-ws-mini-pin/g) ?? []).length, 5, 'Messages, Contacts, Settings, PromptOS and the store itself are pinned');
    // The store is not on its own shelf, but its tile is on the home screen, so it must be movable here.
    assert.match(html, /data-ws-drag-key="weystore"/);
    // Same order as the launcher: every loose app (including protected system apps), then folders.
    // (The arrangeable grid only; the fixed dock row comes after it and is checked below.)
    const tiles = [...html.split('wp-ws-mini-dock')[0].matchAll(/data-ws-drag-key="([^"]+)"|data-folder-id="([^"]+)"|title="([^"]+) is built in"/g)].map(m => m[1] ?? m[2] ?? m[3]);
    assert.ok(tiles.indexOf('chronicle') < tiles.indexOf('last-smoke-demo'), 'grid apps come before the extension tile');
    assert.ok(tiles.indexOf('last-smoke-demo') < tiles.indexOf('utilities'), 'the extension tile sits ahead of the Utilities folder');
    const utilityIndex = tiles.indexOf('utilities');
    assert.ok(tiles.slice(0, utilityIndex).every(item => !['utilities', 'custom-1', 'custom-2'].includes(item)));
    // The dock pair is shown in its own fixed row, never as something to drag.
    assert.doesNotMatch(html, /data-ws-drag-key="(messages|contacts)"/);
    assert.match(html, /wp-ws-mini-dock[\s\S]*title="Messages is built in"[\s\S]*title="Contacts is built in"/);
    assert.equal(tiles.at(-1), 'utilities', 'folders remain after every movable app');
    for (const loadout of LOADOUTS) assert.match(html, new RegExp(`data-loadout="${loadout.id}"`));
    assert.match(html, /data-ws-action="new-folder"/);
    assert.doesNotMatch(html, /Nothing you saved is deleted, so try them freely/);
});

test('My phone gives only empty folders the same minus control used by apps', () => {
    const settings = fresh();
    const folderId = createHomeFolder(settings, { appKeys: BUILT_IN });
    const target = container();
    renderWeyStoreScreen(target, model(settings), { tab: 'phone' });
    assert.match(target.innerHTML, new RegExp(`data-ws-action="remove-folder" data-folder-id="${folderId}"`));

    moveHomeApp(settings, { appKeys: BUILT_IN, draggedKey: 'feed', targetFolderId: folderId, mode: 'folder' });
    renderWeyStoreScreen(target, model(settings), { tab: 'phone' });
    assert.doesNotMatch(target.innerHTML, /data-ws-action="remove-folder"/);
});

test('the undo bar and the entrance flag only appear when asked for', () => {
    const target = container();
    renderWeyStoreScreen(target, model(fresh()), { tab: 'browse' });
    assert.doesNotMatch(target.innerHTML, /wp-ws-snack|data-ws-enter/);
    renderWeyStoreScreen(target, model(fresh()), { tab: 'browse', entering: true, snack: { text: 'Yip Yap removed.', undo: { keys: ['board'] } } });
    assert.match(target.innerHTML, /data-ws-enter/);
    assert.match(target.innerHTML, /Yip Yap removed\./);
    assert.match(target.innerHTML, /data-ws-action="undo"/);
    renderWeyStoreScreen(target, model(fresh()), { snack: { text: 'Added.' } });
    assert.doesNotMatch(target.innerHTML, /data-ws-action="undo"/);
});

test('names and taglines are escaped, including a renamed app and an extension label', () => {
    const target = container();
    const evil = { key: 'evil', label: '<img src=x onerror=1>', accent: 'red', store: { tagline: '"><script>' }, mount() {} };
    renderWeyStoreScreen(target, model(fresh(), { externalApps: [evil], labelFor: key => (key === 'notes' ? '<b>N</b>' : null) }), { tab: 'browse' });
    assert.doesNotMatch(target.innerHTML, /<img src=x|<script>|<b>N<\/b>/);
    assert.match(target.innerHTML, /&lt;b&gt;N&lt;\/b&gt;/);
});
