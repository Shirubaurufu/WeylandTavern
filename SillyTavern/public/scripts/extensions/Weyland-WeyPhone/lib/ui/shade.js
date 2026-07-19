// lib/ui/shade.js

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function createShadeMarkup() {
    return `
<div id="wp-shade">
    <div id="wp-shade-panel">
        <div id="wp-quick-settings">
            <button class="wp-quick-tile" data-tile="sync" title="One API call refreshes every app">
                <i class="fa-solid fa-rotate"></i><span>Sync</span>
            </button>
            <button class="wp-quick-tile" data-tile="airplane" title="Disable all generation">
                <i class="fa-solid fa-plane"></i><span>Airplane</span>
            </button>
            <button class="wp-quick-tile" data-tile="dnd" title="Mute WeyPhone toasts">
                <i class="fa-solid fa-moon"></i><span>Do Not Disturb</span>
            </button>
            <button class="wp-quick-tile" data-tile="lock" title="Lock the phone">
                <i class="fa-solid fa-lock"></i><span>Lock</span>
            </button>
        </div>
        <div id="wp-shade-header">
            <span id="wp-shade-title">Notifications</span>
            <button id="wp-shade-clear" class="wp-text-btn">Clear all</button>
        </div>
        <div id="wp-shade-list"></div>
        <div id="wp-shade-grabber"><span></span></div>
    </div>
</div>`;
}

/**
 * @param {{
 *   notifications: Array<{id: string, appKey: string, title: string, text: string, timestamp: number, read: boolean, appIcon?: string}>,
 *   formatRelativeTime: (ts: number) => string,
 *   syncing: boolean, airplane: boolean, dnd: boolean, syncEnabled: boolean,
 * }} state
 */
export function renderShade({ notifications, formatRelativeTime, syncing, airplane, dnd, syncEnabled }) {
    const list = document.getElementById('wp-shade-list');
    if (list) {
        list.innerHTML = notifications.length === 0
            ? '<div id="wp-shade-empty">No notifications. Pull down and hit Sync to fill the phone.</div>'
            : notifications.map(item => `
<div class="wp-shade-notification${item.read ? ' wp-read' : ''}" data-notification-id="${escapeHtml(item.id)}" data-app="${escapeHtml(item.appKey)}">
    ${item.appIcon ? `<img class="wp-shade-notification-icon" src="${escapeHtml(item.appIcon)}" alt="" />` : ''}
    <div class="wp-shade-notification-body">
        <div class="wp-shade-notification-top">
            <span class="wp-shade-notification-title">${escapeHtml(item.title)}</span>
            <span class="wp-shade-notification-time">${escapeHtml(formatRelativeTime(item.timestamp))}</span>
        </div>
        <div class="wp-shade-notification-text">${escapeHtml(item.text)}</div>
    </div>
</div>`).join('');
    }

    const setTile = (tile, active, disabled = false, spinning = false) => {
        const el = document.querySelector(`.wp-quick-tile[data-tile="${tile}"]`);
        if (!el) return;
        el.classList.toggle('wp-tile-active', active);
        el.disabled = disabled;
        const icon = el.querySelector('i');
        if (icon) icon.classList.toggle('fa-spin', spinning);
    };
    setTile('sync', syncing, airplane || !syncEnabled || syncing, syncing);
    setTile('airplane', airplane);
    setTile('dnd', dnd);
    setTile('lock', false);
}
