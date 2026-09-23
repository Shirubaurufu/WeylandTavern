// Weyland Network: the API panel's "Network" button and its popup for "Use 1.1.1.1 for HelixMind".
//
// The actual work happens in the server (src/weyland-dns.js): when this setting is on, the server
// looks up HelixMind through Cloudflare's 1.1.1.1 instead of the user's internet provider. That is
// the same fix as changing a device's DNS to 1.1.1.1, applied to HelixMind only, without asking the
// user to touch their device settings (which reads as shady and loses people).
//
// The setting lives in extension_settings.weylandNetwork.cloudflareDns, saved with the user's normal
// settings; the server reads it from there on each request. New users get it on from their seeded
// default settings; existing users have no key, which means off. This file never turns it on by
// itself - a missing key is left missing until the user flips the switch.
//
// Placement: an icon-only shield in the Connection Profile button row, right after the recycle
// (reload profile) icon and so just before Router's shuffle icon. Streamlined mode hides the
// profile heading and a couple of its icons but keeps that row, so the shield shows in both modes.
// The row is rendered by the connection-manager extension, sometimes late, so placement retries;
// if that extension is disabled the shield falls back to the Connect row.
//
// Copy note: written for a nervous first-timer. Say what DNS is, who runs 1.1.1.1, link to it so
// they can check for themselves, and state plainly what does not change. No em dashes (Lucky's
// rule for user-facing text).

const MODULE = 'weylandNetwork';
const BUTTON_ID = 'weyland_network_button';

function settings() {
    const { extensionSettings } = SillyTavern.getContext();
    return extensionSettings[MODULE] ?? null;
}

function isEnabled() {
    return settings()?.cloudflareDns === true;
}

function setEnabled(enabled) {
    const context = SillyTavern.getContext();
    context.extensionSettings[MODULE] = { ...(settings() ?? {}), cloudflareDns: Boolean(enabled) };
    context.saveSettingsDebounced();
    updateButton();
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function describeLastLookup(status) {
    if (!status?.lastLookup) return 'No HelixMind connection yet since Weyland Tavern started.';
    const minutes = Math.max(0, Math.round((Date.now() - status.lastLookup) / 60000));
    const when = minutes === 0 ? 'just now' : minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
    return status.lastVia === 'cloudflare'
        ? `Last HelixMind connection went through 1.1.1.1 (${when}).`
        : `Last HelixMind connection used your internet provider's DNS (${when}).`;
}

async function fetchStatus() {
    try {
        const response = await fetch('/api/weyland/dns-status', { headers: SillyTavern.getContext().getRequestHeaders() });
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
}

async function openPopup() {
    const context = SillyTavern.getContext();
    const status = await fetchStatus();
    const html = `
<div class="weyland-network-popup">
    <div class="weyland-network-head">
        <i class="fa-solid fa-shield-halved"></i>
        <h3>DNS Routing: 1.1.1.1</h3>
    </div>
    <p>Some internet providers aren't compatible with the HelixMind connection, or filter it, which can stop your messages from going through.</p>
    <p>To get around this, Weyland Tavern can send its HelixMind DNS requests through <b>1.1.1.1</b>. DNS is the internet's address book: it's how your computer looks up where a website lives.</p>
    <p>1.1.1.1 is a well trusted, reputable DNS service run by Cloudflare. It's generally considered more private and secure than many internet providers' DNS, and it's often faster too.</p>
    <p class="weyland-network-link"><i class="fa-solid fa-arrow-up-right-from-square"></i> <a href="https://one.one.one.one/" target="_blank" rel="noopener noreferrer">Learn more about 1.1.1.1 from Cloudflare</a></p>
    <label class="checkbox_label weyland-network-toggle">
        <input type="checkbox" id="weyland_network_toggle" ${isEnabled() ? 'checked' : ''} />
        <span>Enable DNS routing through 1.1.1.1</span>
    </label>
    <p class="weyland-network-reassure">This only affects requests made through Weyland Tavern. Your device's settings, your browser and your other apps are not changed, and you can switch this off at any time.</p>
    <p class="weyland-network-status">${escapeHtml(describeLastLookup(status))}</p>
    <details class="weyland-network-note">
        <summary>Still having trouble with this on?</summary>
        <p>Your router, or a school or workplace network, may be filtering HelixMind directly. Those filters have to be turned off on that network, so try another network (like your phone's data) to check.</p>
    </details>
</div>`;
    // The toggle saves the moment it changes; the popup's own button just closes it.
    const onChange = event => {
        if (event.target?.id === 'weyland_network_toggle') setEnabled(event.target.checked);
    };
    document.addEventListener('change', onChange);
    try {
        await context.callGenericPopup(html, context.POPUP_TYPE.TEXT, '', { okButton: 'Done', wide: false });
    } finally {
        document.removeEventListener('change', onChange);
    }
}

function updateButton() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;
    const on = isEnabled();
    button.classList.toggle('weyland-network-on', on);
    button.title = on ? 'DNS Routing: using 1.1.1.1 for HelixMind' : 'DNS Routing: 1.1.1.1 is off';
}

const PLACEMENT_RETRY_MS = 500;
const PLACEMENT_GIVE_UP_AFTER = 40; // 20s, then settle for the Connect row

/** @param {boolean} allowFallback */
function addButton(allowFallback = false) {
    const existing = document.getElementById(BUTTON_ID);
    // Once in the profile row it is final; a fallback copy moves up if the row appears later.
    if (existing?.dataset.placement === 'profile') return true;

    const reload = document.getElementById('reload_connection_profile');
    let button = existing;
    if (!button) {
        // Same element shape as its neighbours (<i class="menu_button fa-solid ...">) so it
        // inherits their size, spacing and hover styling.
        button = document.createElement('i');
        button.id = BUTTON_ID;
        button.className = 'menu_button fa-solid fa-shield-halved';
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', 'DNS Routing (1.1.1.1)');
        button.addEventListener('click', () => void openPopup());
    }

    if (reload) {
        reload.after(button);
        button.dataset.placement = 'profile';
    } else if (allowFallback && !existing) {
        const anchor = document.getElementById('test_api_button') ?? document.getElementById('api_button_openai');
        if (!anchor?.parentElement) return false;
        anchor.parentElement.appendChild(button);
        button.dataset.placement = 'connect';
    } else {
        return Boolean(existing);
    }
    updateButton();
    return button.dataset.placement === 'profile';
}

function placeButton() {
    let attempts = 0;
    const timer = setInterval(() => {
        attempts++;
        if (addButton(attempts >= PLACEMENT_GIVE_UP_AFTER) || attempts >= PLACEMENT_GIVE_UP_AFTER) clearInterval(timer);
    }, PLACEMENT_RETRY_MS);
}

jQuery(() => {
    placeButton();
    // Settings load after extensions initialize; refresh the button's on/off look once they have.
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource.on(event_types.SETTINGS_LOADED, () => { addButton(); updateButton(); });
});
