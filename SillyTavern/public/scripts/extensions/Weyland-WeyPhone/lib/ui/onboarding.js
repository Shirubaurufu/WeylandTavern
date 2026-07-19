// lib/ui/onboarding.js
//
// First-open onboarding: a short stack of paginated cards shown the very first time the phone
// is picked up (settings.ui.onboarded flag). Prev/next buttons only — no swipe, so it can't be
// dismissed by accident before the message-budget warning is seen.

export const ONBOARDING_PAGES = [
    {
        icon: 'fa-solid fa-heart',
        title: 'Thank you, Aero!',
        body: 'WeyPhone V2.1 is based on the original WeyPhone project made by @aerosplat.\n\nWeyPhone V1 walked so we could run.',
        emphasis: 'Thank you Aero!! I hope you like the new look!~',
    },
    {
        icon: 'fa-solid fa-mobile-screen-button',
        title: 'This is your WeyPhone',
        body: 'A real(ish) phone for your pocket dimension. Swipe up to unlock, drag it around by the status bar, and lock it again with the nav-bar padlock. Wallpapers, app names, and everything else live in Settings.',
    },
    {
        icon: 'fa-solid fa-battery-half',
        title: 'One sync, one message',
        body: 'The social-app refresh generates all four feeds in one request. In Messages, the arrow adds as many texts as you want to the chat, then the refresh button asks the character to reply to the whole burst. Only refresh spends one message from your daily budget; nothing generates on its own.',
    },
];

/**
 * @param {number} index
 * @param {number} [pageCount]
 * @returns {number} index clamped into [0, pageCount - 1]
 */
export function clampOnboardingPage(index, pageCount = ONBOARDING_PAGES.length) {
    return Math.min(Math.max(index, 0), pageCount - 1);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Renders the current onboarding card into the overlay container.
 * @param {HTMLElement} container #wp-onboarding
 * @param {{pageIndex: number}} state
 */
export function renderOnboarding(container, { pageIndex }) {
    const index = clampOnboardingPage(pageIndex);
    const page = ONBOARDING_PAGES[index];
    const isFirst = index === 0;
    const isLast = index === ONBOARDING_PAGES.length - 1;
    container.innerHTML = `
<div class="wp-onboarding-card" data-page="${index}">
    <div class="wp-onboarding-icon"><i class="${escapeHtml(page.icon)}"></i></div>
    <div class="wp-onboarding-title">${escapeHtml(page.title)}</div>
    <div class="wp-onboarding-body">${escapeHtml(page.body).replace(/\n/g, '<br>')}</div>
    ${page.emphasis ? `<strong class="wp-onboarding-emphasis">${escapeHtml(page.emphasis)}</strong>` : ''}
    <div class="wp-onboarding-dots">${ONBOARDING_PAGES.map((_, i) =>
        `<span class="wp-onboarding-dot${i === index ? ' wp-active' : ''}"></span>`).join('')}</div>
    <div class="wp-onboarding-nav">
        <button type="button" id="wp-onboard-prev" class="wp-btn-sm"${isFirst ? ' disabled' : ''}>Back</button>
        <button type="button" id="wp-onboard-next" class="wp-btn-sm wp-onboarding-next">${isLast ? "Let's go" : 'Next'}</button>
    </div>
</div>`;
}
