// lib/weystore.js
//
// WeyStore's logic: which apps are installed, the loadouts, and the plain-data model the store
// screens draw from. No DOM and no SillyTavern imports, so it runs under node --test.
//
// WHAT "UNINSTALLED" MEANS. An uninstalled app loses its home-screen tile and nothing else is
// deleted: threads, notes, saved posts and settings all stay, so putting an app back is instant
// and lossless. That is deliberate. The store is a way to tidy the phone, not a way to lose data,
// and it means install/uninstall never needs a scary confirmation.
//
// STORAGE. settings.weystore = { off: { [appKey]: true }, seen: { [appKey]: true } }.
//  - `off` is an EXCLUSION map, not an allowlist, so an app added by a later release (or by another
//    extension) shows up installed without a migration. Existing players keep the phone they had.
//  - Both are objects keyed by app, not arrays, because lib/settingsSync.js merges objects per key
//    but treats arrays as one atomic value. Two devices removing different apps must both win.

import { DOCK_APP_KEYS, HOME_FOLDERS, HOME_GRID_ORDER } from './ui/homeScreen.js';
import { STORE_SHELVES, storeListing } from './weystoreCatalog.js';

/** Apps the phone cannot work without. They are listed in the store as "Built in" and never
 *  offer a remove button. Built-in means protected from uninstall, not pinned to one launcher
 *  position, with one exception: Messages and Contacts sit in the dock and stay there (DOCK below). */
export const SYSTEM_APP_KEYS = Object.freeze(['messages', 'contacts', 'settings', 'weystore', 'narrative']);

const SYSTEM = new Set(SYSTEM_APP_KEYS);

export function isSystemApp(key) {
    return SYSTEM.has(key);
}

/** The live store state, created on demand. getSettings only backfills top-level keys, so an older
 *  save (or a hand-edited one) can arrive without the inner maps. */
export function storeState(settings) {
    const isMap = value => value && typeof value === 'object' && !Array.isArray(value);
    if (!isMap(settings.weystore)) settings.weystore = {};
    if (!isMap(settings.weystore.off)) settings.weystore.off = {};
    if (!isMap(settings.weystore.seen)) settings.weystore.seen = {};
    if (!isMap(settings.weystore.layout)) settings.weystore.layout = {};
    if (!Array.isArray(settings.weystore.layout.order)) settings.weystore.layout.order = [];
    if (!isMap(settings.weystore.layout.folders)) settings.weystore.layout.folders = {};
    return settings.weystore;
}

const FOLDER_PREFIX = 'folder:';

// Dock apps (Messages, Contacts) are not part of the arrangeable launcher at all. Every layout
// function drops them from the keys it works with, so a layout saved while they were still
// draggable heals itself the next time it is read: the two simply go back to the dock.
const DOCK = new Set(DOCK_APP_KEYS);
export const isDockApp = key => DOCK.has(key);
const withoutDock = keys => keys.filter(key => !DOCK.has(key));

const validFolderName = value => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Folder';

/** Folders are a trailing launcher section, never app-order placeholders. Keeping this invariant
 *  in the data model means deleting/dissolving a folder cannot make ordinary apps jump around. */
function foldersLast(layout) {
    const apps = [];
    const folderMarkers = [];
    for (const item of layout.order) {
        (item.startsWith(FOLDER_PREFIX) ? folderMarkers : apps).push(item);
    }
    layout.order = [...apps, ...folderMarkers];
    return layout;
}

function defaultHomeLayout(allKeys, externalKeys = []) {
    const appKeys = withoutDock(allKeys);
    const known = new Set(appKeys.filter(Boolean));
    const factoryFolderKeys = new Set(Object.values(HOME_FOLDERS).flatMap(folder => folder.apps));
    const looseExternalKeys = externalKeys.filter(key => !factoryFolderKeys.has(key));
    const folders = {};
    const order = [];
    const added = new Set();
    const addApp = key => {
        if (!known.has(key) || added.has(key)) return;
        added.add(key);
        order.push(key);
    };
    let externalsPlaced = false;
    for (const slot of HOME_GRID_ORDER) {
        if (!slot.startsWith(FOLDER_PREFIX)) {
            addApp(slot);
            continue;
        }
        if (!externalsPlaced) {
            looseExternalKeys.forEach(addApp);
            externalsPlaced = true;
        }
        const id = slot.slice(FOLDER_PREFIX.length);
        const definition = HOME_FOLDERS[id];
        const apps = (definition?.apps ?? []).filter(key => known.has(key) && !added.has(key));
        apps.forEach(key => added.add(key));
        if (apps.length >= 2) {
            folders[id] = { name: definition?.label || 'Folder', apps };
            order.push(`${FOLDER_PREFIX}${id}`);
        } else {
            order.push(...apps);
        }
    }
    externalKeys.forEach(addApp);
    appKeys.forEach(addApp);
    return foldersLast({ order, folders });
}

/**
 * The player's home-screen arrangement, repaired against the apps that exist in this build.
 * Missing/new apps are added in the default order; stale keys disappear without disturbing the
 * rest. This is read-only so merely opening the store never dirties settings.
 */
export function homeLayout(settings, allKeys, externalKeys = []) {
    const appKeys = withoutDock(allKeys);
    const fallback = defaultHomeLayout(appKeys, externalKeys);
    const saved = settings?.weystore?.layout;
    if (!saved || !Array.isArray(saved.order) || !saved.order.length || !saved.folders || typeof saved.folders !== 'object') {
        return fallback;
    }
    const known = new Set(appKeys.filter(Boolean));
    const claimed = new Set();
    const order = [];
    const folders = {};
    for (const item of saved.order) {
        if (typeof item !== 'string') continue;
        if (!item.startsWith(FOLDER_PREFIX)) {
            if (known.has(item) && !claimed.has(item)) {
                claimed.add(item);
                order.push(item);
            }
            continue;
        }
        const id = item.slice(FOLDER_PREFIX.length);
        if (!id || folders[id]) continue;
        const source = saved.folders[id];
        if (!source || !Array.isArray(source.apps)) continue;
        const apps = source.apps.filter(key => known.has(key) && !claimed.has(key));
        apps.forEach(key => claimed.add(key));
        if (apps.length >= 2 || id.startsWith('custom-')) {
            folders[id] = { name: validFolderName(source.name), apps };
            order.push(item);
        } else if (apps.length === 1) {
            order.push(apps[0]);
        }
    }
    // Keep the user's order, then append genuinely new apps in the same relative order they would
    // have received on a fresh phone.
    const appendFrom = layout => {
        for (const item of layout.order) {
            if (item.startsWith(FOLDER_PREFIX)) {
                const source = layout.folders[item.slice(FOLDER_PREFIX.length)];
                for (const key of source?.apps ?? []) {
                    if (!claimed.has(key) && known.has(key)) {
                        claimed.add(key);
                        order.push(key);
                    }
                }
            } else if (!claimed.has(item) && known.has(item)) {
                claimed.add(item);
                order.push(item);
            }
        }
    };
    appendFrom(fallback);
    appKeys.forEach(key => {
        if (known.has(key) && !claimed.has(key)) order.push(key);
    });
    return foldersLast({ order, folders });
}

function saveHomeLayout(settings, layout) {
    foldersLast(layout);
    storeState(settings).layout = {
        order: [...layout.order],
        folders: Object.fromEntries(Object.entries(layout.folders).map(([id, folder]) => [id, {
            name: validFolderName(folder.name),
            apps: [...folder.apps],
        }])),
    };
}

function appLocation(layout, key) {
    const top = layout.order.indexOf(key);
    if (top >= 0) return { type: 'top', index: top };
    for (const [id, folder] of Object.entries(layout.folders)) {
        const index = folder.apps.indexOf(key);
        if (index >= 0) return { type: 'folder', id, index };
    }
    return null;
}

function detachApp(layout, key) {
    const location = appLocation(layout, key);
    if (!location) return;
    if (location.type === 'top') layout.order.splice(location.index, 1);
    else {
        layout.folders[location.id].apps.splice(location.index, 1);
        cleanFolder(layout, location.id);
    }
}

function cleanFolder(layout, id) {
    const folder = layout.folders[id];
    // A drag that leaves fewer than two apps closes the folder. The remaining app takes the
    // folder's old grid slot; an empty folder simply disappears.
    if (!folder || folder.apps.length >= 2) return;
    const marker = `${FOLDER_PREFIX}${id}`;
    const at = layout.order.indexOf(marker);
    if (at >= 0) layout.order.splice(at, 1, ...folder.apps);
    delete layout.folders[id];
}

function freshFolderId(layout) {
    let number = 1;
    while (layout.folders[`custom-${number}`]) number++;
    return `custom-${number}`;
}

/** The most folders the launcher will hold, created or factory. */
export const FOLDER_LIMIT = 4;

/**
 * Adds an empty folder at the end of the grid. Null when the launcher already holds
 * FOLDER_LIMIT folders. Folders are made here now; dropping apps on each other swaps them.
 */
export function createHomeFolder(settings, { appKeys, externalKeys = [] }) {
    const layout = homeLayout(settings, appKeys, externalKeys);
    if (Object.keys(layout.folders).length >= FOLDER_LIMIT) return null;
    const id = freshFolderId(layout);
    layout.folders[id] = { name: 'Folder', apps: [] };
    layout.order.push(`${FOLDER_PREFIX}${id}`);
    saveHomeLayout(settings, layout);
    return id;
}

/** Removes a user-created empty folder. Populated folders are deliberately refused: moving their
 *  apps out first makes the destructive scope visible and keeps this button as harmless as an app
 *  tile's minus control. */
export function removeEmptyHomeFolder(settings, { appKeys, externalKeys = [], folderId }) {
    const layout = homeLayout(settings, appKeys, externalKeys);
    const folder = layout.folders[folderId];
    if (!folder || folder.apps.length !== 0) return false;
    const marker = `${FOLDER_PREFIX}${folderId}`;
    const at = layout.order.indexOf(marker);
    if (at >= 0) layout.order.splice(at, 1);
    delete layout.folders[folderId];
    saveHomeLayout(settings, layout);
    return true;
}

/**
 * Moves one app in the saved launcher layout. Dropping in the middle of a folder adds to it;
 * dropping dead centre on another app swaps the two (wherever they live — grid, or either
 * folder); edge drops place before/after the target. A blank home-screen drop appends to the grid.
 */
export function moveHomeApp(settings, { appKeys, externalKeys = [], draggedKey, targetKey, targetFolderId = '', mode = 'before' }) {
    const known = new Set(withoutDock(appKeys));
    // A dock app cannot be picked up, and nothing can be placed relative to one.
    if (!known.has(draggedKey) || draggedKey === targetKey || DOCK.has(targetKey)) return false;
    const layout = homeLayout(settings, appKeys, externalKeys);
    const before = JSON.stringify(layout);

    if (targetFolderId && layout.folders[targetFolderId] && mode === 'folder') {
        if (layout.folders[targetFolderId].apps.includes(draggedKey)) return false;
        detachApp(layout, draggedKey);
        layout.folders[targetFolderId].apps.push(draggedKey);
    } else if (mode === 'swap') {
        // Capture both slots first, then write each key into the other's slot in place; no
        // splices, so the recorded indices stay valid whichever mix of grid and folder it is.
        const draggedAt = appLocation(layout, draggedKey);
        const targetAt = appLocation(layout, targetKey);
        if (!draggedAt) return false;
        const put = (location, key) => {
            if (location.type === 'top') layout.order[location.index] = key;
            else layout.folders[location.id].apps[location.index] = key;
        };
        put(draggedAt, targetKey);
        if (targetAt) put(targetAt, draggedKey);
        else layout.order.push(draggedKey);
    } else {
        detachApp(layout, draggedKey);
        if (targetFolderId && layout.folders[targetFolderId]) {
            const marker = `${FOLDER_PREFIX}${targetFolderId}`;
            const targetIndex = layout.order.indexOf(marker);
            if (targetIndex >= 0) {
                layout.order.splice(targetIndex + (mode === 'after' ? 1 : 0), 0, draggedKey);
            } else {
                layout.order.push(draggedKey);
            }
            if (JSON.stringify(layout) === before) return false;
            saveHomeLayout(settings, layout);
            return true;
        }
        const target = appLocation(layout, targetKey);
        if (!target) {
            layout.order.push(draggedKey);
        } else if (target.type === 'folder') {
            const offset = mode === 'after' ? 1 : 0;
            layout.folders[target.id].apps.splice(target.index + offset, 0, draggedKey);
        } else {
            const offset = mode === 'after' ? 1 : 0;
            layout.order.splice(target.index + offset, 0, draggedKey);
        }
    }
    if (JSON.stringify(layout) === before) return false;
    saveHomeLayout(settings, layout);
    return true;
}

/** Reorders a whole folder on the launcher grid. A target app inside another folder resolves to
 *  that folder's grid slot, so a folder can never become nested inside another folder. */
export function moveHomeFolder(settings, { appKeys, externalKeys = [], draggedFolderId, targetKey = '', targetFolderId = '', mode = 'before' }) {
    const layout = homeLayout(settings, appKeys, externalKeys);
    const before = JSON.stringify(layout);
    const marker = `${FOLDER_PREFIX}${draggedFolderId}`;
    const from = layout.order.indexOf(marker);
    if (from < 0 || !layout.folders[draggedFolderId]) return false;

    let targetMarker = '';
    if (targetFolderId && layout.folders[targetFolderId]) targetMarker = `${FOLDER_PREFIX}${targetFolderId}`;
    else if (targetKey) {
        const target = appLocation(layout, targetKey);
        // A top-level app is not a valid folder-order anchor: folders always live after every app.
        // Apps inside another folder still identify that folder, allowing folder-to-folder sorting.
        if (target?.type === 'top') return false;
        if (target?.type === 'folder') targetMarker = `${FOLDER_PREFIX}${target.id}`;
    }
    if (targetMarker === marker) return false;

    layout.order.splice(from, 1);
    const targetIndex = targetMarker ? layout.order.indexOf(targetMarker) : -1;
    if (targetIndex < 0) layout.order.push(marker);
    else layout.order.splice(targetIndex + (mode === 'after' ? 1 : 0), 0, marker);
    foldersLast(layout);
    if (JSON.stringify(layout) === before) return false;
    saveHomeLayout(settings, layout);
    return true;
}

export function renameHomeFolder(settings, { appKeys, externalKeys = [], folderId, name }) {
    const layout = homeLayout(settings, appKeys, externalKeys);
    const folder = layout.folders[folderId];
    if (!folder) return false;
    const next = validFolderName(name);
    if (folder.name === next) return false;
    folder.name = next;
    saveHomeLayout(settings, layout);
    return true;
}

/** Read-only check. Never creates state, so it is safe on a frozen or partial settings object.
 *  Apps whose listing says defaultOff (the Last Smoke demo) invert the convention: they ship OFF
 *  the phone, so only an explicit on marker in the map counts as installed. */
export function isAppInstalled(settings, key) {
    if (SYSTEM.has(key)) return true;
    const off = settings?.weystore?.off;
    if (storeListing(key).defaultOff === true) return off?.[key] === false;
    return off?.[key] !== true;
}

/**
 * Installs or uninstalls one app. System apps are refused.
 * @returns {boolean} whether anything changed (the caller only saves and redraws when true)
 */
export function setAppInstalled(settings, key, installed) {
    if (!key || SYSTEM.has(key)) return false;
    const { off } = storeState(settings);
    const wasInstalled = isAppInstalled(settings, key);
    if (wasInstalled === Boolean(installed)) return false;
    if (storeListing(key).defaultOff === true) {
        // defaultOff apps mark an explicit ON with false; absence is their resting, off state.
        if (installed) off[key] = false;
        else delete off[key];
    } else if (installed) delete off[key];
    else off[key] = true;
    return true;
}

/** An app is "new" until the player has opened its store page once. */
export function markAppSeen(settings, key) {
    const { seen } = storeState(settings);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
}

// Loadouts: one tap to a sensible phone. `off` lists what the loadout removes; `only` (when
// present) instead lists the only non-system apps it keeps. They act on the apps the phone ships
// with. Tiles added by other extensions are left exactly as the player had them, except by
// "The works", which turns everything on.
export const LOADOUTS = Object.freeze([
    { id: 'works', label: 'The works', blurb: 'Every app on the phone.', off: [] },
    { id: 'quiet', label: 'Quiet phone', blurb: 'No feeds and no Sync. Everything else stays.', off: ['chronicle', 'feed', 'chat', 'board'] },
    { id: 'texting', label: 'Just texting', blurb: 'Messages, Kressa and PromptOS. Nothing else.', only: ['kressa', 'narrative'] },
]);

function loadoutWantsInstalled(loadout, key) {
    if (SYSTEM.has(key)) return true;
    return loadout.only ? loadout.only.includes(key) : !loadout.off.includes(key);
}

/**
 * @param {object} settings
 * @param {string} loadoutId
 * @param {string[]} builtInKeys keys of the apps WeyPhone ships (APP_REGISTRY)
 * @param {string[]} [externalKeys] keys of tiles other extensions added
 * @returns {boolean} whether anything changed
 */
export function applyLoadout(settings, loadoutId, builtInKeys, externalKeys = []) {
    const loadout = LOADOUTS.find(candidate => candidate.id === loadoutId);
    if (!loadout) return false;
    let changed = false;
    for (const key of builtInKeys) {
        changed = setAppInstalled(settings, key, loadoutWantsInstalled(loadout, key)) || changed;
    }
    if (loadout.id === 'works') {
        for (const key of externalKeys) changed = setAppInstalled(settings, key, true) || changed;
    }
    return changed;
}

/** Which loadout the phone currently matches exactly, or null when it is the player's own mix. */
export function matchingLoadout(settings, builtInKeys, externalKeys = []) {
    for (const loadout of LOADOUTS) {
        const builtInsMatch = builtInKeys.every(key => isAppInstalled(settings, key) === loadoutWantsInstalled(loadout, key));
        const externalsMatch = loadout.id !== 'works' || externalKeys.every(key => isAppInstalled(settings, key));
        if (builtInsMatch && externalsMatch) return loadout.id;
    }
    return null;
}

/** Where an app's tile lives, for the store page's "Lives in" fact. */
export function homeLocation(key, layout = null) {
    if (DOCK.has(key)) return 'Dock';
    if (layout) {
        for (const folder of Object.values(layout.folders ?? {})) {
            if (folder.apps.includes(key)) return `${folder.name} folder`;
        }
        return 'Home screen';
    }
    for (const folder of Object.values(HOME_FOLDERS)) {
        if (folder.apps.includes(key)) return `${folder.label} folder`;
    }
    return 'Home screen';
}

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * What this app is holding on THIS phone, as a short human line ('' when it holds nothing worth
 * naming). Real numbers from the player's own data are the store's answer to fake download counts,
 * and they are what makes "removing it keeps your stuff" concrete.
 */
export function appFootprint(settings, key) {
    const list = value => (Array.isArray(value) ? value : []);
    const conversations = Object.values(settings?.conversations ?? {});
    switch (key) {
        case 'messages': {
            const threads = conversations.filter(thread => !thread?.isDedicatedApp).length;
            return threads ? plural(threads, 'thread') : '';
        }
        case 'kressa': {
            const threads = conversations.filter(thread => thread?.isDedicatedApp === 'kressa').length;
            return threads ? plural(threads, 'thread') : '';
        }
        case 'chronicle':
        case 'feed':
        case 'chat':
        case 'board': {
            const saved = list(settings?.savedPosts?.[key]).length;
            return saved ? plural(saved, 'saved post') : '';
        }
        case 'notes': {
            const notes = list(settings?.ui?.notes).length || list(settings?.notes).length;
            return notes ? plural(notes, 'note') : '';
        }
        case 'clock': {
            const alarms = list(settings?.ui?.clockAlarms).length;
            const timers = list(settings?.ui?.clockTimers).length;
            return [alarms && plural(alarms, 'alarm'), timers && plural(timers, 'timer')].filter(Boolean).join(', ');
        }
        case 'pawxai': {
            const saved = list(settings?.pawxai?.savedPrompts).length;
            return saved ? plural(saved, 'saved prompt') : '';
        }
        case 'understudy': {
            const recipes = list(settings?.understudy?.catnipRecipes).length;
            return recipes ? plural(recipes, 'Catnip note') : '';
        }
        case 'narrative': {
            const presets = list(settings?.customShiftPresets).length;
            return presets ? plural(presets, 'custom shift') : '';
        }
        case 'contacts': {
            const added = list(settings?.communityContacts).length;
            return added ? plural(added, 'community contact') : '';
        }
        default:
            return '';
    }
}

/** A stable day number, so "Today's pick" changes at local midnight and not on every redraw. */
export function dayNumber(date = new Date()) {
    return Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
}

/**
 * Builds everything the store screens show, as plain data.
 *
 * @param {object} options
 * @param {Array<object>} options.registry APP_REGISTRY
 * @param {Array<object>} [options.externalApps] tiles other extensions added (window.weyPhoneExternalApps)
 * @param {object} options.settings WeyPhone settings
 * @param {(key: string) => string} [options.labelFor] display name, with the player's renames applied
 * @param {(app: object) => boolean} [options.isLocked] true when the player's membership cannot open the app
 * @param {number} [options.day] dayNumber(); injectable for tests
 */
export function buildStoreModel({ registry, externalApps = [], settings, labelFor = null, isLocked = () => false, day = dayNumber() }) {
    const seen = settings?.weystore?.seen ?? {};
    const toEntry = (app, external) => {
        const listing = storeListing(app.key, external ? app : null);
        const system = isSystemApp(app.key);
        return {
            key: app.key,
            label: external ? app.label : (labelFor?.(app.key) ?? app.label),
            icon: app.icon ?? null,
            iconFa: app.iconFa ?? null,
            accent: app.accent || '#8A8A8A',
            external,
            system,
            installed: isAppInstalled(settings, app.key),
            locked: !external && isLocked(app),
            needsRoleplay: !external && app.requiresRoleplay === true,
            needsMembership: !external && Boolean(app.tierGated),
            fresh: listing.fresh === true && seen[app.key] !== true,
            footprint: appFootprint(settings, app.key),
            home: 'Home screen',
            listing,
        };
    };
    // The store never lists itself: there is nothing to install, and "WeyStore, in the WeyStore"
    // is exactly the kind of filler this page exists to avoid.
    const apps = [
        ...registry.filter(app => app.key !== 'weystore').map(app => toEntry(app, false)),
        ...externalApps.map(app => toEntry(app, true)),
    ];
    const byKey = new Map(apps.map(app => [app.key, app]));
    // The store's own tile. It is not on the shelf, but it IS a tile on the home screen, so My
    // phone needs it to let the player put it where they want. The layout is built from every
    // registry key (the store included) for the same reason, and so it matches what index.js
    // passes when a drag is saved.
    const selfApp = registry.find(app => app.key === 'weystore');
    const self = selfApp ? toEntry(selfApp, false) : null;
    const layout = homeLayout(settings, [...registry.map(app => app.key), ...externalApps.map(app => app.key)], externalApps.map(app => app.key));
    for (const app of apps) app.home = homeLocation(app.key, layout);

    const shelved = new Set();
    const shelves = STORE_SHELVES
        .map(shelf => {
            const keys = apps.filter(app => app.listing.shelf === shelf.id).map(app => app.key);
            // Catalog order wins inside a shelf; anything the catalog does not order keeps its place.
            const order = shelf.order ?? [];
            keys.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
            for (const key of keys) shelved.add(key);
            return { id: shelf.id, title: shelf.title, blurb: shelf.blurb, keys };
        })
        .filter(shelf => shelf.keys.length > 0);

    // Spotlight: a new arrival first. Otherwise one app a day, preferring something the player
    // does not have yet (a pick they already own is a wasted banner), and never a system app.
    const removable = apps.filter(app => !app.system);
    const fresh = removable.find(app => app.fresh);
    const pool = removable.filter(app => !app.installed).length ? removable.filter(app => !app.installed) : removable;
    const pick = fresh ?? (pool.length ? pool[((day % pool.length) + pool.length) % pool.length] : null);
    const spotlight = pick ? {
        key: pick.key,
        kicker: fresh ? 'New arrival'
            : pick.key === 'last-smoke-demo' ? 'Featured demo'
            : pick.installed ? 'Today’s pick' : 'Not on your phone yet',
    } : null;

    const builtInKeys = registry.map(app => app.key);
    const externalKeys = externalApps.map(app => app.key);
    return {
        apps,
        byKey,
        self,
        folderLimit: FOLDER_LIMIT,
        dockKeys: [...DOCK_APP_KEYS],
        shelves,
        spotlight,
        loadouts: LOADOUTS,
        activeLoadout: matchingLoadout(settings, builtInKeys, externalKeys),
        installedCount: apps.filter(app => app.installed).length,
        totalCount: apps.length,
        layout,
    };
}
