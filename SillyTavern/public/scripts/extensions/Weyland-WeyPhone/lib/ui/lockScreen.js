// lib/ui/lockScreen.js

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function createLockScreenMarkup() {
    return `
<div id="wp-lock-screen">
    <div id="wp-lock-clock">12:00</div>
    <div id="wp-lock-date">Monday, January 1</div>
    <div id="wp-lock-notifications"></div>
    <div id="wp-lock-hint"><i class="fa-solid fa-chevron-up"></i> Swipe up to unlock</div>
</div>
<div id="wp-dim-overlay" title="Tap to wake"></div>`;
}

/**
 * @param {{clockText: string, dateText: string, notifications: Array<{title: string, text: string, appIcon?: string}>}} state
 *   `notifications` should already be capped/newest-first (index.js passes the top few unread).
 */
export function renderLockScreen({ clockText, dateText, notifications }) {
    const clock = document.getElementById('wp-lock-clock');
    if (clock) clock.textContent = clockText;
    const date = document.getElementById('wp-lock-date');
    if (date) date.textContent = dateText;
    const list = document.getElementById('wp-lock-notifications');
    if (!list) return;
    list.innerHTML = notifications.map(item => `
<div class="wp-lock-notification">
    ${item.appIcon ? `<img class="wp-lock-notification-icon" src="${escapeHtml(item.appIcon)}" alt="" />` : ''}
    <div class="wp-lock-notification-body">
        <div class="wp-lock-notification-title">${escapeHtml(item.title)}</div>
        <div class="wp-lock-notification-text">${escapeHtml(item.text)}</div>
    </div>
</div>`).join('');
}
