// WT Helix Usage Monitor — API panel tracker
// Renders a HelixMind message-cooldown tracker after the API settings section,
// mirroring the welcome-panel tracker UI. Always visible in the API panel
// when a HelixMind key is set.

import { eventSource, event_types } from '../../../../script.js';

const LOG = '[WT Helix Tracker]';
const TRACKER_ID = 'hm-api-tracker';

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

async function fetchHelixUsageData(apiKey) {
    const response = await fetch('https://helixmind.online/v1/usage', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const parsed = await response.json();
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    let active = [];

    if (parsed.data && Array.isArray(parsed.data)) {
        active = parsed.data
            .map((item) => ({ ...item, timestamp_ms: item.timestamp * 1000 }))
            .filter((m) => m.timestamp_ms >= cutoff)
            .sort((a, b) => a.timestamp_ms - b.timestamp_ms);
    }

    let totalLimit = Infinity;
    if (parsed.limit === '') {
        totalLimit = Infinity;
    } else if (parsed.limit && !Number.isNaN(parseInt(parsed.limit, 10))) {
        totalLimit = parseInt(parsed.limit, 10);
    }

    return {
        current_usage_count: active.length,
        messages: active,
        total_limit: totalLimit,
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

    messagesUsedText.textContent = 'Loading...';
    nextMessageTimeText.textContent = 'Loading...';

    try {
        const data = await fetchHelixUsageData(apiKey);

        if (typeof data.total_limit === 'number' && Number.isFinite(data.total_limit)) {
            messagesUsedText.textContent = `${data.total_limit - data.current_usage_count} / ${data.total_limit}`;
        } else {
            messagesUsedText.textContent = `${data.current_usage_count}`;
        }

        if (data.current_usage_count === 0 || !data.messages || data.messages.length === 0) {
            nextMessageTimeText.textContent = 'Ready';
            if (nextContainer) nextContainer.style.display = 'none';
            stopCountdown();
            return;
        }

        if (nextContainer) nextContainer.style.display = 'inline';

        const oldestMs = data.messages[0].timestamp_ms;
        const expiry = oldestMs + (24 * 60 * 60 * 1000);
        if (expiry <= Date.now()) {
            nextMessageTimeText.textContent = 'Slot Open!';
            stopCountdown();
            return;
        }

        startCountdown(expiry);
    } catch (error) {
        console.error(`${LOG} Error fetching Helix usage data:`, error);
        messagesUsedText.textContent = 'Error';
        nextMessageTimeText.textContent = 'Error';
        stopCountdown();
    }
}

function updateKeyUI() {
    if (!trackerEl) return;
    const unset = trackerEl.querySelector('#hm-api-key-unset');
    const set = trackerEl.querySelector('#hm-api-key-set');
    const key = getHelixApiKey();
    const hasKey = typeof key === 'string' && key.trim().includes('helix');

    if (hasKey) {
        if (unset) unset.style.display = 'none';
        if (set) set.style.display = '';
        void refreshUsage();
    } else {
        stopCountdown();
        if (unset) unset.style.display = '';
        if (set) set.style.display = 'none';
    }
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
                (<span class="hm-tracker-label">Next Message: <span id="hm-api-next-message-time-text">Loading...</span>)
            </span>
            <button id="hm-api-clear-tracker-key" class="menu_button hm-api-clear-button">
                <i class="fa-solid fa-xmark"></i>
                <span>Clear Tracker Key</span>
            </button>
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
        if (trackerEl) updateKeyUI();
    });

    eventSource.on(event_types.GENERATION_ENDED, () => {
        if (!trackerEl) return;
        const key = getHelixApiKey();
        if (key) void refreshUsage();
    });
});
