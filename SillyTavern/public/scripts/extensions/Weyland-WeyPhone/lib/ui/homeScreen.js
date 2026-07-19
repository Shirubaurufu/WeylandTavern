// lib/ui/homeScreen.js

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Home placement is intentionally independent from APP_REGISTRY order: the registry is also
// consumed by Settings, Sync, and app-name editing, none of which should be reshuffled merely
// because a tile moves on the launcher.
export const HOME_GRID_ORDER = [
    'chronicle', 'feed',
    'chat', 'board',
    'pawxai', 'mien',
    'housing', 'kressa',
    'calculator', 'notes',
    'settings',
];

const HOME_GRID_RANK = new Map(HOME_GRID_ORDER.map((key, index) => [key, index]));

function tileMarkup(app, { disabled, tierLocked = false, badge }) {
    const badgeMarkup = badge > 0 ? `<span class="wp-app-badge">${badge > 9 ? '9+' : badge}</span>` : '';
    const lockMarkup = tierLocked ? '<span class="wp-app-tier-lock" aria-hidden="true"><i class="fa-solid fa-lock"></i></span>' : '';
    const iconMarkup = app.icon
        ? `<img src="${escapeHtml(app.icon)}" alt="" />`
        : `<i class="${escapeHtml(app.iconFa ?? 'fa-solid fa-mobile-screen')}"></i>`;
    return `
<button class="wp-app-tile${disabled || tierLocked ? ' wp-app-tile-disabled' : ''}${tierLocked ? ' wp-app-tile-tier-locked' : ''}" data-app="${escapeHtml(app.key)}" style="--wp-app-accent:${escapeHtml(app.accent)}">
    <span class="wp-app-icon">${iconMarkup}${badgeMarkup}${lockMarkup}</span>
    <span class="wp-app-label">${escapeHtml(app.label)}</span>
</button>`;
}

/**
 * The Android-style home screen: wallpaper (a CSS layer on the shell), app grid with unread
 * badges, and a dock row (Messages / Sync / Contacts).
 * @param {HTMLElement} container #wp-screen-body
 * @param {{
 *   apps: Array<{key: string, label: string, icon: string, accent: string, requiresRoleplay: boolean}>,
 *   badges: Record<string, number>,
 *   flavorAppsEnabled: boolean,
 *   syncing: boolean,
 *   airplane: boolean,
 * }} state
 */
export function renderHomeScreen(container, { apps, badges, flavorAppsEnabled, syncing, airplane }) {
    const gridApps = apps
        .filter(a => !['messages', 'contacts'].includes(a.key))
        .sort((a, b) => (HOME_GRID_RANK.get(a.key) ?? Number.MAX_SAFE_INTEGER)
            - (HOME_GRID_RANK.get(b.key) ?? Number.MAX_SAFE_INTEGER));
    const dockApps = apps.filter(a => ['messages', 'contacts'].includes(a.key));
    container.innerHTML = `
<div class="wp-home">
    <div class="wp-app-grid">
        ${gridApps.map(app => tileMarkup(app, {
            disabled: app.requiresRoleplay && !flavorAppsEnabled,
            tierLocked: app.tierLocked,
            badge: badges[app.key] ?? 0,
        })).join('')}
    </div>
    <div class="wp-dock">
        ${dockApps.map(app => tileMarkup(app, { disabled: false, badge: badges[app.key] ?? 0 })).join('')}
        <button class="wp-app-tile wp-dock-sync${syncing ? ' wp-syncing' : ''}" data-action="unified-sync" ${(airplane || syncing || !flavorAppsEnabled) ? 'disabled' : ''} title="One API call refreshes every app">
            <span class="wp-app-icon wp-sync-icon"><i class="fa-solid fa-rotate${syncing ? ' fa-spin' : ''}"></i></span>
            <span class="wp-app-label">${syncing ? 'Syncing…' : 'Sync'}</span>
        </button>
    </div>
</div>`;
}
