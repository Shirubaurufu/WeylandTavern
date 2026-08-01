// WT Helix Usage Monitor — API panel tracker
// Renders a HelixMind message-cooldown tracker after the API settings section,
// mirroring the welcome-panel tracker UI. Always visible in the API panel
// when a HelixMind key is set.

import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { reconcileTally, bucketByHour, oldestTallyMs, WINDOW_MS } from './usageTally.js';

const LOG = '[WT Helix Tracker]';
const TRACKER_ID = 'hm-api-tracker';
const MODULE_NAME = 'WT-HelixUsage';

let trackerEl = null;
let countdownInterval = null;
let expiryTimeMs = null;
let lastSeenKey = null;
let keyPollInterval = null;

function formatMillisecondsToTime(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return hours > 0
        ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
        : `${pad(minutes)}:${pad(seconds)}`;
}

const HELIX_USAGE_PROXY = '/api/weyland/helix-usage';

async function fetchHelixUsageData(apiKey) {
    // Fetch per-key usage through Weyland's server proxy. The provider's new backend only
    // allows browser CORS from its own origin, so we can't call it from this page directly;
    // the proxy fetches server-side and returns { used, limit, remaining } already computed.
    const response = await fetch(HELIX_USAGE_PROXY, {
        method: 'GET',
        headers: { 'X-Helix-Key': apiKey },
        cache: 'no-store', // usage changes constantly; never serve a stale cached count
    });

    if (!response.ok) {
        throw new Error(`Usage request failed: ${response.status} ${response.statusText}`);
    }

    const parsed = await response.json();
    const used = Number(parsed?.used);
    const limit = Number(parsed?.limit);

    const currentUsage = Number.isFinite(used) ? used : 0;
    // A non-positive/unknown limit is treated as "no finite cap": the display then shows the
    // running count instead of "remaining / limit".
    const totalLimit = (Number.isFinite(limit) && limit > 0) ? limit : Infinity;

    // The live "next message" countdown is driven by the local hourly tally (a later step),
    // not a records call — so there is no oldest-record lookup here. null => shows "Ready".
    return {
        current_usage_count: currentUsage,
        total_limit: totalLimit,
        oldest_ms: null,
    };
}

function stopCountdown() {
    clearInterval(countdownInterval);
    countdownInterval = null;
    expiryTimeMs = null;
}

function startCountdown(expiry) {
    stopCountdown();
    expiryTimeMs = expiry;
    const timerText = trackerEl?.querySelector('#hm-api-next-message-time-text');
    if (!timerText) return;

    const update = () => {
        if (!trackerEl || expiryTimeMs === null) return;
        const remaining = expiryTimeMs - Date.now();
        if (remaining <= 0) {
            stopCountdown();
            timerText.textContent = 'Refreshing...';
            void refreshUsage();
            return;
        }
        timerText.textContent = formatMillisecondsToTime(remaining);
    };

    update();
    countdownInterval = setInterval(update, 1000);
}

function getHelixApiKey() {
    const ctx = SillyTavern?.getContext?.();
    return ctx?.variables?.global?.get('HMKey') ?? null;
}

// ── Estimated Hour Breakdown (local tally) ──────────────────────────────────────

/** Load the persisted tally store from extensionSettings (server-side, cross-device). */
function getTallyStore() {
    const ctx = SillyTavern?.getContext?.();
    const bucket = ctx?.extensionSettings?.[MODULE_NAME];
    const tally = bucket && typeof bucket === 'object' ? bucket.tally : null;
    return (tally && Array.isArray(tally.tallies)) ? tally : { lastUsed: null, tallies: [] };
}

/** Persist the tally store. */
function saveTallyStore(store) {
    const ctx = SillyTavern?.getContext?.();
    if (!ctx?.extensionSettings) return;
    if (!ctx.extensionSettings[MODULE_NAME] || typeof ctx.extensionSettings[MODULE_NAME] !== 'object') {
        ctx.extensionSettings[MODULE_NAME] = {};
    }
    ctx.extensionSettings[MODULE_NAME].tally = { lastUsed: store.lastUsed, tallies: store.tallies };
    saveSettingsDebounced();
}

/** Hour label like "5 AM" in the user's locale. */
function formatHourLabel(hourStartMs) {
    return new Date(hourStartMs).toLocaleTimeString([], { hour: 'numeric' });
}

/** Epoch ms of the upcoming local midnight. */
function nextMidnightMs(now) {
    const d = new Date(now);
    d.setHours(24, 0, 0, 0);
    return d.getTime();
}

/**
 * Draw the per-hour usage bars. Rows are oldest-first (soonest to renew first); a "Tomorrow"
 * divider marks where a row's renewal (its hour + 24h) crosses the next midnight.
 */
function renderBreakdown(tallies) {
    const wrapEl = trackerEl?.querySelector('#hm-api-breakdown');
    const listEl = trackerEl?.querySelector('#hm-api-breakdown-list');
    if (!wrapEl || !listEl) return;

    const now = Date.now();
    const buckets = bucketByHour(tallies, now);
    if (buckets.length === 0) {
        wrapEl.style.display = 'none';
        listEl.innerHTML = '';
        return;
    }

    // Group by when each hour's messages renew (its hour + 24h): before the upcoming midnight
    // = "Today", at/after = "Tomorrow". Buckets are oldest-first, so the soonest-to-renew
    // (today) come first. Each header only appears if its group has rows.
    const midnight = nextMidnightMs(now);
    const today = [];
    const tomorrow = [];
    for (const b of buckets) {
        ((b.hourStart + WINDOW_MS) < midnight ? today : tomorrow).push(b);
    }

    const rowHtml = (b) => {
        const msgs = b.count === 1 ? '1 message' : `${b.count} messages`;
        return '<div class="hm-bd-row">'
            + `<span class="hm-bd-hour">${formatHourLabel(b.hourStart)}</span> - `
            + `<span class="hm-bd-count">${msgs}</span>`
            + '</div>';
    };

    let html = '';
    if (today.length) html += '<div class="hm-bd-daybreak">Today</div>' + today.map(rowHtml).join('');
    if (tomorrow.length) html += '<div class="hm-bd-daybreak">Tomorrow</div>' + tomorrow.map(rowHtml).join('');

    wrapEl.style.display = '';
    listEl.innerHTML = html;
}

async function refreshUsage() {
    if (!trackerEl) return;
    const messagesUsedText = trackerEl.querySelector('#hm-api-messages-used-text');
    const nextMessageTimeText = trackerEl.querySelector('#hm-api-next-message-time-text');
    const nextContainer = trackerEl.querySelector('#hm-api-next-message-container');

    if (!messagesUsedText || !nextMessageTimeText) return;

    const apiKey = getHelixApiKey();
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
        messagesUsedText.textContent = 'Key Error';
        nextMessageTimeText.textContent = 'Key Error';
        stopCountdown();
        return;
    }

    // Only show "Loading..." when there isn't already a value on screen — otherwise frequent
    // refreshes (e.g. from SETTINGS_UPDATED) flicker the number.
    if (!/\d/.test(messagesUsedText.textContent)) {
        messagesUsedText.textContent = 'Loading...';
        nextMessageTimeText.textContent = 'Loading...';
    }

    try {
        const data = await fetchHelixUsageData(apiKey);

        if (typeof data.total_limit === 'number' && Number.isFinite(data.total_limit)) {
            messagesUsedText.textContent = `${data.total_limit - data.current_usage_count} / ${data.total_limit}`;
        } else {
            messagesUsedText.textContent = `${data.current_usage_count}`;
        }

        // Estimated hour breakdown: reconcile the local tally to the authoritative used count,
        // persist it ONLY when it actually changed (saving re-emits SETTINGS_UPDATED, which
        // would re-trigger this refresh and loop), and redraw.
        const store = reconcileTally(getTallyStore(), data.current_usage_count, Date.now());
        if (store.changed) saveTallyStore(store);
        renderBreakdown(store.tallies);

        const finiteLimit = Number.isFinite(data.total_limit);
        const remaining = finiteLimit ? (data.total_limit - data.current_usage_count) : Infinity;

        // "Next message" counts down only at the cap; otherwise a slot is free right now.
        if (remaining > 0) {
            nextMessageTimeText.textContent = 'Ready';
            if (nextContainer) nextContainer.style.display = 'none';
            stopCountdown();
            return;
        }

        const oldest = oldestTallyMs(store.tallies, Date.now());
        if (oldest == null) {
            nextMessageTimeText.textContent = 'Ready';
            if (nextContainer) nextContainer.style.display = 'none';
            stopCountdown();
            return;
        }
        const expiry = oldest + WINDOW_MS;
        if (expiry <= Date.now()) {
            nextMessageTimeText.textContent = 'Slot Open!';
            stopCountdown();
            return;
        }
        if (nextContainer) nextContainer.style.display = 'inline';
        startCountdown(expiry);
    } catch (error) {
        console.error(`${LOG} Error fetching Helix usage data:`, error);
        messagesUsedText.textContent = 'Error';
        nextMessageTimeText.textContent = 'Error';
        stopCountdown();
    }
}

// Toggle the key-set vs key-unset UI. Returns whether a key is present. Does NOT fetch —
// so it's safe to call on frequent events (e.g. SETTINGS_UPDATED) without hitting the API.
function updateKeyVisibility() {
    if (!trackerEl) return false;
    const unset = trackerEl.querySelector('#hm-api-key-unset');
    const set = trackerEl.querySelector('#hm-api-key-set');
    const key = getHelixApiKey();
    const hasKey = typeof key === 'string' && key.trim().includes('helix');

    if (hasKey) {
        if (unset) unset.style.display = 'none';
        if (set) set.style.display = '';
    } else {
        stopCountdown();
        if (unset) unset.style.display = '';
        if (set) set.style.display = 'none';
    }
    return hasKey;
}

// Visibility + a usage refresh. Use on load / key change / generation-ended — not on every
// settings save, or we'd hit the usage endpoint far more than needed.
function updateKeyUI() {
    if (updateKeyVisibility()) void refreshUsage();
}

async function setKeyFromInput() {
    const ctx = SillyTavern?.getContext?.();
    if (!ctx) return;
    const input = trackerEl?.querySelector('#hm-api-tracker-key-input');
    const trimmed = input instanceof HTMLInputElement ? input.value.trim() : '';
    if (!trimmed) return;
    if (!trimmed.includes('helix')) {
        toastr.error('Please copy the entire key, including the \'helix-\' part.');
        return;
    }
    await ctx.executeSlashCommandsWithOptions(
        `/setglobalvar key=HMKey ${trimmed} | /secret-write quiet=true label=api_key_custom key=api_key_custom ${trimmed}`,
    );
    if (input instanceof HTMLInputElement) input.value = '';
    updateKeyUI();
}

async function clearKey() {
    const ctx = SillyTavern?.getContext?.();
    if (!ctx) return;
    stopCountdown();
    await ctx.executeSlashCommandsWithOptions(
        '/flushglobalvar HMKey | /secret-delete quiet=true key=api_key_custom api_key_custom',
    );
    updateKeyUI();
}

function buildTracker() {
    const container = document.createElement('div');
    container.id = TRACKER_ID;
    container.innerHTML = `
        <div id="hm-api-key-unset">
            <p>Provide your HelixMind API key to enable the message cooldown tracker. Your key begins with "helix-" and that should be included below.</p>
            <div class="hm-key-input-row">
                <input id="hm-api-tracker-key-input" type="text" placeholder="helix-..." autocomplete="off" spellcheck="false">
                <button id="hm-api-set-tracker-key" class="menu_button">
                    <i class="fa-solid fa-clock"></i>
                    <span>Set Tracker Key</span>
                </button>
            </div>
        </div>
        <div id="hm-api-key-set" style="display: none;">
            Messages Available: <span id="hm-api-messages-used-text">Loading...</span>
            <span id="hm-api-next-message-container">
                (<span class="hm-tracker-label">Next Message: <span id="hm-api-next-message-time-text">Loading...</span></span>)
            </span>
            <button id="hm-api-clear-tracker-key" class="menu_button hm-api-clear-button">
                <i class="fa-solid fa-xmark"></i>
                <span>Clear Tracker Key</span>
            </button>
            <div id="hm-api-breakdown" class="hm-breakdown" style="display: none;">
                <div class="hm-breakdown-title">Estimated Hour Breakdown</div>
                <div id="hm-api-breakdown-list" class="hm-breakdown-list"></div>
            </div>
        </div>
    `;
    return container;
}

function wireEvents() {
    if (!trackerEl) return;
    const setBtn = trackerEl.querySelector('#hm-api-set-tracker-key');
    const clearBtn = trackerEl.querySelector('#hm-api-clear-tracker-key');
    const input = trackerEl.querySelector('#hm-api-tracker-key-input');

    setBtn?.addEventListener('click', () => { void setKeyFromInput(); });
    clearBtn?.addEventListener('click', () => { void clearKey(); });
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            void setKeyFromInput();
        }
    });
}

function injectTracker(retries = 20) {
    if (document.getElementById(TRACKER_ID)) return;

    const openaiApi = document.getElementById('openai_api');
    if (!openaiApi) {
        if (retries > 0) {
            setTimeout(() => injectTracker(retries - 1), 500);
        } else {
            console.warn(`${LOG} #openai_api not found after retries; tracker not injected.`);
        }
        return;
    }

    trackerEl = buildTracker();
    openaiApi.after(trackerEl);
    wireEvents();
    updateKeyUI();
    console.log(`${LOG} Injected after #openai_api`);

    if (!keyPollInterval) {
        lastSeenKey = getHelixApiKey();
        keyPollInterval = setInterval(syncKeyState, 2000);
    }
}

function syncKeyState() {
    if (!trackerEl) return;
    const key = getHelixApiKey();
    if (key !== lastSeenKey) {
        lastSeenKey = key;
        updateKeyUI();
    }
}

jQuery(async () => {
    injectTracker();

    eventSource.on(event_types.SETTINGS_UPDATED, () => {
        // Visibility only — never fetch on arbitrary settings saves. Key changes are picked up
        // by the 2s key poll (syncKeyState), and usage by GENERATION_ENDED below.
        if (trackerEl) updateKeyVisibility();
    });

    eventSource.on(event_types.GENERATION_ENDED, () => {
        if (!trackerEl) return;
        const key = getHelixApiKey();
        if (!key) return;
        void refreshUsage(); // prompt number update
        // The provider's per-key count can lag a moment behind the finished generation, so
        // re-check shortly after to catch (and tally) the increment. Reconcile is idempotent,
        // so if the first fetch already saw it, this one adds nothing.
        setTimeout(() => {
            if (trackerEl && getHelixApiKey()) void refreshUsage();
        }, 3500);
    });
});
