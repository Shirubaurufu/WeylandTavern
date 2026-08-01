// lib/ui/apps/comingSoon.js

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * A static placeholder screen for an app that has a home-grid tile but no functionality yet
 * (e.g. the Weyland Registrar app). Deliberately has no interactive elements of its own — the
 * shared header back/help buttons still work normally around it.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{label: string, note?: string}} state
 */
export function renderComingSoonScreen(container, { label, note = 'Check back soon.' }) {
    container.innerHTML = `
<div class="wp-coming-soon">
    <div class="wp-coming-soon-scanlines"></div>
    <div class="wp-coming-soon-body">
        <i class="fa-solid fa-hourglass-half wp-coming-soon-icon" aria-hidden="true"></i>
        <div class="wp-coming-soon-label">${escapeHtml(label)}</div>
        <div class="wp-coming-soon-title">Coming soon!</div>
        <div class="wp-coming-soon-note">${escapeHtml(note)}</div>
    </div>
</div>`;
}
