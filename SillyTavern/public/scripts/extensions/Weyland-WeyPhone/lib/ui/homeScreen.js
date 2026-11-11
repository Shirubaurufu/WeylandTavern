// lib/ui/homeScreen.js

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Folders on the home screen. Lucky (2026-10-20): the grid was full (four rows of four), so the
// small factory apps share one tile to make room for new ones. A folder is only a launcher
// grouping; the apps keep their registry entries, labels, badges and screens.
export const HOME_FOLDERS = {
    utilities: { label: 'Utilities', apps: ['calculator', 'clock', 'notes', 'aethel-companion'] },
};
const FOLDER_PREFIX = 'folder:';

// Home placement is intentionally independent from APP_REGISTRY order: the registry is also
// consumed by Settings, Sync, and app-name editing, none of which should be reshuffled merely
// because a tile moves on the launcher. `folder:<id>` places a folder tile.
export const HOME_GRID_ORDER = [
    'chronicle', 'feed',
    'chat', 'board',
    'pawxai', 'mien', 'weybooru', 'registrar',
    'housing', 'kressa', 'understudy', 'narrative',
    'weystore',
    'settings',
    'folder:utilities',
];

// The dock: the bar along the bottom of the home screen. Messages and Contacts live there, next
// to the Sync button, and nowhere else (Lucky, 2026-11-10). They went missing from it when the
// WeyStore made every tile arrangeable and the two were folded into the grid; the dock was left
// holding only Sync. They are fixed here on purpose: the launcher layout never contains them, so
// they cannot be dragged into the grid or a folder, and they cannot be uninstalled either.
export const DOCK_APP_KEYS = Object.freeze(['messages', 'contacts']);
const IN_DOCK = new Set(DOCK_APP_KEYS);

const HOME_GRID_RANK = new Map(HOME_GRID_ORDER.map((key, index) => [key, index]));
// Apps the order does not name (extension-provided tiles, see `extraApps`) go in front of the
// first folder, so they land in the open slots of the last row instead of after Settings.
const EXTRA_RANK = HOME_GRID_ORDER.findIndex(key => key.startsWith(FOLDER_PREFIX)) - 0.5;
const IN_FOLDER = new Set(Object.values(HOME_FOLDERS).flatMap(folder => folder.apps));

function iconMarkup(app) {
    return app.icon
        ? `<img src="${escapeHtml(app.icon)}" alt="" />`
        : `<i class="${escapeHtml(app.iconFa ?? 'fa-solid fa-mobile-screen')}"></i>`;
}

const badgeMarkup = badge => (badge > 0 ? `<span class="wp-app-badge">${badge > 9 ? '9+' : badge}</span>` : '');

function tileMarkup(app, { disabled, tierLocked = false, badge }) {
    const lockMarkup = tierLocked ? '<span class="wp-app-tier-lock" aria-hidden="true"><i class="fa-solid fa-lock"></i></span>' : '';
    return `
<button class="wp-app-tile${disabled || tierLocked ? ' wp-app-tile-disabled' : ''}${tierLocked ? ' wp-app-tile-tier-locked' : ''}" data-app="${escapeHtml(app.key)}" style="--wp-app-accent:${escapeHtml(app.accent)}">
    <span class="wp-app-icon">${iconMarkup(app)}${badgeMarkup(badge)}${lockMarkup}</span>
    <span class="wp-app-label">${escapeHtml(app.label)}</span>
</button>`;
}

/** A folder tile: a 2x2 preview of its apps' icons, and the sum of their badges. It carries
 *  data-folder (never data-app), so index.js opens the folder instead of an app. */
function folderTileMarkup(id, folder, apps, badges) {
    const badge = apps.reduce((sum, app) => sum + (badges[app.key] ?? 0), 0);
    return `
<button class="wp-app-tile wp-folder-tile" data-folder="${escapeHtml(id)}" aria-haspopup="dialog">
    <span class="wp-app-icon wp-folder-icon">${apps.slice(0, 4).map(app => `<span class="wp-folder-mini" style="--wp-app-accent:${escapeHtml(app.accent)}">${iconMarkup(app)}</span>`).join('')}${badgeMarkup(badge)}</span>
    <span class="wp-app-label">${escapeHtml(folder.label)}</span>
</button>`;
}

/** The opened folder: a closed-by-default sheet over the home grid. Its tiles are ordinary app
 *  tiles, so the normal [data-app] click path opens them. */
function folderSheetMarkup(id, folder, apps, tile) {
    return `
<div class="wp-folder-sheet" data-folder-sheet="${escapeHtml(id)}" role="dialog" aria-label="${escapeHtml(folder.label)}" hidden>
    <button type="button" class="wp-folder-backdrop" data-folder-close aria-label="Close folder"></button>
    <div class="wp-folder-panel">
        <div class="wp-folder-title">${escapeHtml(folder.label)}</div>
        <div class="wp-app-grid">${apps.map(tile).join('')}</div>
    </div>
</div>`;
}

/**
 * The Android-style home screen: wallpaper (a CSS layer on the shell), app grid with unread
 * badges, folders, and the Sync tray.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{
 *   apps: Array<{key: string, label: string, icon: string, accent: string, requiresRoleplay: boolean}>,
 *   extraApps?: Array<{key: string, label: string, icon?: string, iconFa?: string, accent: string}>,
 *   badges: Record<string, number>,
 *   flavorAppsEnabled: boolean,
 *   syncing: boolean,
 *   airplane: boolean,
 *   syncAvailable?: boolean,
 *   layout?: {order: string[], folders: Record<string, {name: string, apps: string[]}>},
 * }} state
 * `apps` is only the INSTALLED apps: index.js filters out whatever the player removed in the
 * WeyStore before calling this, so everything here simply follows the list and saved layout.
 * `syncAvailable` is false when none of the four Sync feeds is installed; the Sync button then leaves
 * the dock (Messages and Contacts stay), since pressing it would spend a generation on apps the
 * player cannot open.
 * `extraApps` are tiles other extensions add at runtime (index.js `externalApps`); they never need a
 * roleplay chat and have no badges of their own.
 */
export function renderHomeScreen(container, { apps, extraApps = [], badges, flavorAppsEnabled, syncing, airplane, syncAvailable = true, generationAllowance, formatCooldown = value => String(value), layout = null }) {
    const tile = app => tileMarkup(app, {
        disabled: app.requiresRoleplay && !flavorAppsEnabled,
        tierLocked: app.tierLocked,
        badge: badges[app.key] ?? 0,
    });
    const known = new Set(apps.map(a => a.key));
    const extras = extraApps.filter(a => a?.key && !known.has(a.key));
    // Dock apps are drawn in the dock and are never part of the grid, whatever a saved layout says.
    const dockApps = DOCK_APP_KEYS.map(key => apps.find(a => a.key === key)).filter(Boolean);
    const visibleApps = [
        ...apps.filter(a => !IN_DOCK.has(a.key)),
        ...extras.map(app => ({ ...app, requiresRoleplay: false })),
    ];
    const gridEntries = [];
    const sheets = [];
    if (layout?.order?.length) {
        const all = new Map(visibleApps.map(app => [app.key, app]));
        const placed = new Set();
        let rank = 0;
        for (const item of layout.order) {
            if (item.startsWith(FOLDER_PREFIX)) {
                const id = item.slice(FOLDER_PREFIX.length);
                const saved = layout.folders?.[id];
                if (!saved) continue;
                const inside = saved.apps.map(key => all.get(key)).filter(Boolean);
                inside.forEach(app => placed.add(app.key));
                if (!inside.length) continue;
                if (inside.length === 1) gridEntries.push({ rank: rank++, html: tile(inside[0]) });
                else {
                    const folder = { label: saved.name || 'Folder', apps: saved.apps };
                    gridEntries.push({ rank: rank++, html: folderTileMarkup(id, folder, inside, badges) });
                    sheets.push(folderSheetMarkup(id, folder, inside, tile));
                }
                continue;
            }
            const app = all.get(item);
            if (!app || placed.has(item)) continue;
            placed.add(item);
            gridEntries.push({ rank: rank++, html: tile(app) });
        }
        // A newly-added extension can appear before the saved layout has been opened and repaired.
        // Keep it usable immediately, at the end, rather than hiding it until the next store visit.
        for (const app of all.values()) {
            if (!placed.has(app.key)) gridEntries.push({ rank: rank++, html: tile(app) });
        }
    } else {
        gridEntries.push(
            ...apps.filter(a => !IN_FOLDER.has(a.key) && !IN_DOCK.has(a.key))
                .map(app => ({ rank: HOME_GRID_RANK.get(app.key) ?? Number.MAX_SAFE_INTEGER, html: tile(app) })),
            ...extras.filter(app => !IN_FOLDER.has(app.key))
                .map((app, index) => ({ rank: EXTRA_RANK + index / 1000, html: tile({ ...app, requiresRoleplay: false }) })),
        );
        for (const [id, folder] of Object.entries(HOME_FOLDERS)) {
            const inside = folder.apps.map(key => visibleApps.find(a => a.key === key)).filter(Boolean);
            if (!inside.length) continue;
            const rank = HOME_GRID_RANK.get(FOLDER_PREFIX + id) ?? Number.MAX_SAFE_INTEGER;
            // A folder holding one app is just an extra tap. When the player has removed the others in
            // the WeyStore, the survivor takes the folder's place as an ordinary tile.
            if (inside.length === 1) {
                gridEntries.push({ rank, html: tile(inside[0]) });
                continue;
            }
            gridEntries.push({ rank, html: folderTileMarkup(id, folder, inside, badges) });
            sheets.push(folderSheetMarkup(id, folder, inside, tile));
        }
    }
    gridEntries.sort((a, b) => a.rank - b.rank);
    container.innerHTML = `
<div class="wp-home">
    <div class="wp-app-grid">
        ${gridEntries.map(entry => entry.html).join('')}
    </div>
    <div class="wp-dock">
        ${dockApps.map(app => tileMarkup(app, { disabled: false, tierLocked: app.tierLocked, badge: badges[app.key] ?? 0 })).join('')}
        ${syncAvailable ? `<button class="wp-app-tile wp-dock-sync${syncing ? ' wp-syncing' : ''}" data-action="unified-sync" ${(airplane || syncing || !flavorAppsEnabled) ? 'disabled' : ''} title="One API call refreshes every app">
            <span class="wp-app-icon wp-sync-icon"><i class="fa-solid fa-rotate${syncing ? ' fa-spin' : ''}"></i></span>
            <span class="wp-app-label">${syncing ? 'Syncing…' : 'Sync'}</span>
            ${generationAllowance ? `<span class="wp-rate-limit-status">${generationAllowance.allowed
                ? (Number.isFinite(generationAllowance.remaining) ? `${generationAllowance.remaining} ready` : 'Unlimited')
                : `Ready in ${escapeHtml(formatCooldown(generationAllowance.retryAfterMs))}`}</span>` : ''}
        </button>` : ''}
    </div>
    ${sheets.join('')}
</div>`;
}

/** Opens or closes a folder sheet rendered by renderHomeScreen. Returns true if it found one. */
export function setHomeFolderOpen(container, id, open) {
    const sheets = container.querySelectorAll('.wp-folder-sheet');
    let found = false;
    for (const sheet of sheets) {
        const match = sheet.dataset.folderSheet === id;
        sheet.hidden = !(open && match);
        found ||= match;
    }
    return found;
}
