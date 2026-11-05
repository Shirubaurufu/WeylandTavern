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

import { applyHelixMindDefaults } from './helixRequestDefaults.js';
import { swapRetiredMainModels } from './retiredModels.js';
import { moveVectorThresholdOnce, VECTOR_THRESHOLD_DEFAULT } from './vectorThreshold.js';

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
    if (!status) return "Couldn't check the last address lookup.";
    // Only routed lookups are recorded by the server. No record doesn't imply no connection.
    if (!status.lastLookup) return 'No HelixMind address lookup has been recorded yet.';
    const minutes = Math.max(0, Math.round((Date.now() - status.lastLookup) / 60000));
    const when = minutes === 0 ? 'just now' : minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
    return status.lastVia === 'cloudflare'
        ? `Last recorded HelixMind lookup used 1.1.1.1 (${when}).`
        : `Last recorded HelixMind lookup used the computer's usual DNS (${when}).`;
}

async function fetchStatus() {
    try {
        const response = await fetch('/api/weyland/dns-status', { headers: SillyTavern.getContext().getRequestHeaders() });
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
}

export async function openWeylandNetworkSettings() {
    const context = SillyTavern.getContext();
    const status = await fetchStatus();
    const html = `
<div class="weyland-network-popup">
    <div class="weyland-network-head">
        <i class="fa-solid fa-shield-halved"></i>
        <h3>DNS Routing: 1.1.1.1</h3>
    </div>
    <p>Before Weyland can connect to HelixMind, it needs to look up its internet address. This is called DNS. Some internet providers block that lookup or send it to a warning page.</p>
    <p>This setting asks Cloudflare's <b>1.1.1.1</b> service for HelixMind's address instead. It can help with those lookup problems, though it won't fix every connection error.</p>
    <p class="weyland-network-link"><i class="fa-solid fa-arrow-up-right-from-square"></i> <a href="https://one.one.one.one/" target="_blank" rel="noopener noreferrer">Learn more about 1.1.1.1 from Cloudflare</a></p>
    <label class="checkbox_label weyland-network-toggle">
        <input type="checkbox" id="weyland_network_toggle" ${isEnabled() ? 'checked' : ''} />
        <span>Enable DNS routing through 1.1.1.1</span>
    </label>
    <p class="weyland-network-reassure">This applies only to HelixMind address lookups made by Weyland. It leaves your device settings and other apps alone. You can switch it off at any time.</p>
    <p class="weyland-network-status">${escapeHtml(describeLastLookup(status))}</p>
    <details class="weyland-network-note">
        <summary>Still having trouble with this on?</summary>
        <p>Your router or network may still be filtering the connection itself. Try another network, such as a phone hotspot, on the computer running Weyland.</p>
        <p>Switching only the phone you use to open Weyland won't change the computer's connection to HelixMind. On a school or workplace network, ask its staff about connection restrictions.</p>
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
        button.addEventListener('click', () => void openWeylandNetworkSettings());
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
    // HelixMind always gets Weyland's tuned penalty defaults and no logprobs; helixRequestDefaults.js has the
    // full story (a player's garbled GLM-5 and "internal server error" replies, 2026-10-17).
    // CHAT_COMPLETION_SETTINGS_READY fires once per chat request with the final body (openai.js generate_data),
    // after presets, Weyland-Router's model pick and every other setting are applied; listeners edit it in place.
    // Lives in this extension because it already owns "how Weyland talks to HelixMind", and it always loads.
    // Its own try/catch: a bug here must never stop a message from being sent.
    eventSource.on(event_types.CHAT_COMPLETION_SETTINGS_READY, data => {
        try {
            const changed = applyHelixMindDefaults(data);
            if (changed.length) console.info(`[Weyland Network] HelixMind request stripped to essentials: ${changed.join(', ')}`);
        } catch (error) {
            console.error('[Weyland Network] HelixMind defaults Error:', error);
        }
    });

    // HelixMind retired DeepSeek and MiniMax (2026-11): move a saved HelixMind connection off them, once (see retiredModels.js).
    // APP_READY, because both the chat completion settings and the Connection Profiles are loaded by then.
    const runRetiredModelSwap = () => {
        try {
            const context = SillyTavern.getContext();
            const moved = swapRetiredMainModels(context);
            if (moved.connection) {
                // Keep the model box on screen in step with the setting that was just changed
                const input = document.getElementById('custom_model_id');
                if (input instanceof HTMLInputElement) input.value = context.chatCompletionSettings.custom_model;
            }
            if (moved.connection || moved.profiles) {
                console.info('[Weyland Network] HelixMind retired DeepSeek and MiniMax; the saved connection model was moved to Gemini 3.8 Flash.');
                globalThis.toastr?.info('HelixMind retired its DeepSeek and MiniMax models, so your connection was switched to Gemini 3.8 Flash. You can pick another model any time.', 'Model switched', { timeOut: 15000 });
            }
        } catch (error) {
            console.error('[Weyland Network] Retired model swap Error:', error);
        }
    };
    eventSource.on(event_types.APP_READY, runRetiredModelSwap);
    // Backstop in case APP_READY fired before this listener existed. Safe to run twice: the marker makes the second run a no-op.
    setTimeout(runRetiredModelSwap, 8000);

    // Vector threshold 0.5 -> 0.45 for installs still on the old shipped value, once (see vectorThreshold.js).
    const runVectorThresholdMove = () => {
        try {
            if (!moveVectorThresholdOnce(SillyTavern.getContext())) return;
            // Vector Storage keeps its own copy of its settings from page load. Its slider handler copies the slider value
            // into both that copy and extension_settings, so going through it makes the new value apply without a reload.
            const slider = document.getElementById('vectors_score_threshold');
            if (slider instanceof HTMLInputElement) {
                slider.value = String(VECTOR_THRESHOLD_DEFAULT);
                slider.dispatchEvent(new Event('input', { bubbles: true }));
            }
            console.info(`[Weyland Network] Vector Storage score threshold moved from 0.5 to ${VECTOR_THRESHOLD_DEFAULT} (new Weyland default).`);
        } catch (error) {
            console.error('[Weyland Network] Vector threshold move Error:', error);
        }
    };
    eventSource.on(event_types.APP_READY, runVectorThresholdMove);
    setTimeout(runVectorThresholdMove, 8000);
});
