const { extensionSettings, renderExtensionTemplateAsync, saveSettingsDebounced, eventSource, event_types } = SillyTavern.getContext();
import { stopGeneration } from '../../../../script.js';
import { oai_settings } from '../../../openai.js';
export const WT_ROUTER_MODULE_NAME = "Weyland-Router";

// =========================
// ========= SETUP =========
// =========================

const extensionVersion = "1.1.0";

/**
 * @typedef {Object} ModelEntry
 * @property {string} id
 * @property {string} [profileName]
 * @property {number} weight
 * @property {number | null} [timeoutMs]
 * @property {number | null} cooldownUntil
 * @property {number | null} [extendedCooldownUntil]
 * @property {number[]} [failureHistory]  // timestamps within the rolling window
 */

/**
 * @typedef {Object} WeylandRouterSettings
 * @property {boolean} enabled
 * @property {boolean} debug
 * @property {'random' | 'priority'} routingMode
 * @property {ModelEntry[]} pool
 * @property {number} timeoutMs
 * @property {number} cooldownMs              // regular cooldown
 * @property {number} extendedCooldownMs      // extended cooldown after circuit trips
 * @property {number} failureWindowMs         // rolling window for counting failures
 * @property {number} failureThreshold        // failures in window before extended CD kicks in
 * @property {boolean} suppressApiErrors
 */

/** @type {WeylandRouterSettings} */
const defaultSettings = {
    enabled: false,
    debug: false,
    routingMode: 'random',
    pool: [],
    timeoutMs: 60000,
    cooldownMs: 5 * 60 * 1000,                // 5 min
    extendedCooldownMs: 3 * 60 * 60 * 1000,   // 3 hours
    failureWindowMs: 30 * 60 * 1000,          // 30 min rolling window
    failureThreshold: 4,                       // 4 failures in window → extended CD
    suppressApiErrors: true
};

/** @type {WeylandRouterSettings} */
let settings = undefined;

// Runtime state
let currentlySelectedModel = null;
let attemptedThisTurn = new Set();
let generationTimeoutId = null;
let isRetrying = false;
// One-shot token set by triggerRetry() and consumed by the next interceptor call.
// Survives any /trigger delay, unlike isRetrying which auto-clears on a 1s timer.
let pendingRetryAttempt = false;
let originalCustomModel = null;
let originalToastrError = null;
let currentGenId = 0;       // increments each time we roll a model
let watchingGenId = null;   // the genId we expect onGenerationEnded to validate against
let lastFinalizedGenId = null; // genId of the most recent attempt that was finalized, so MESSAGE_RECEIVED can't re-run finalize
let currentAttemptSnapshot = null;
let lastSelectedModel = null;
let lastSelectedAt = 0;
let manualStopRequestedAt = 0;
const ROUTER_ATTEMPT_LOCK_KEY = '__weylandRouterAttemptLock';
const ROUTER_INSTANCE_ID = `${WT_ROUTER_MODULE_NAME}:${extensionVersion}:${Math.random().toString(36).slice(2)}`;

// =========================
// ======== LOGGING ========
// =========================

const MAX_LOG_LINES = 200;
const LOG_STORAGE_KEY = `${WT_ROUTER_MODULE_NAME}:eventLog`;
/** @type {{ts: string, msg: string, type: string}[]} */
const eventLog = [];

function getTimestamp() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

function routerEvent(msg, type = 'info') {
    const entry = { ts: getTimestamp(), msg, type };
    eventLog.push(entry);
    if (eventLog.length > MAX_LOG_LINES) eventLog.shift();
    persistEventLog();
    console.debug(`[${WT_ROUTER_MODULE_NAME}] ${entry.ts} ${msg}`);
    appendLogLine(entry);
}

function routerLog(text, data) {
    if (settings?.debug) {
        data !== undefined
            ? console.debug(`[${WT_ROUTER_MODULE_NAME}] ${text}`, data)
            : console.debug(`[${WT_ROUTER_MODULE_NAME}] ${text}`);
    }
}

function appendLogLine(entry) {
    const panel = document.getElementById('wtr-log-output');
    if (!panel) return;
    const line = document.createElement('div');
    line.className = `wtr-log-line wtr-log-${entry.type}`;
    line.innerHTML = `<span class="wtr-log-ts">${entry.ts}</span><span class="wtr-log-msg">${escapeHtml(entry.msg)}</span>`;
    panel.appendChild(line);
    while (panel.children.length > MAX_LOG_LINES) panel.removeChild(panel.firstChild);
    panel.scrollTop = panel.scrollHeight;
}

function loadEventLog() {
    try {
        const stored = JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || '[]');
        if (!Array.isArray(stored)) return;
        eventLog.length = 0;
        stored.slice(-MAX_LOG_LINES).forEach(entry => {
            if (entry?.ts && entry?.msg) {
                eventLog.push({ ts: String(entry.ts), msg: String(entry.msg), type: String(entry.type || 'info') });
            }
        });
    } catch (err) {
        console.warn(`[${WT_ROUTER_MODULE_NAME}] Could not load persistent log`, err);
    }
}

function persistEventLog() {
    try {
        localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(eventLog.slice(-MAX_LOG_LINES)));
    } catch (err) {
        console.warn(`[${WT_ROUTER_MODULE_NAME}] Could not persist log`, err);
    }
}

function clearEventLog() {
    eventLog.length = 0;
    try {
        localStorage.removeItem(LOG_STORAGE_KEY);
    } catch (err) {
        console.warn(`[${WT_ROUTER_MODULE_NAME}] Could not clear persistent log`, err);
    }
}

function rebuildLogPanel() {
    const panel = document.getElementById('wtr-log-output');
    if (!panel) return;
    loadEventLog();
    panel.innerHTML = '';
    for (const entry of eventLog) appendLogLine(entry);
    panel.scrollTop = panel.scrollHeight;
}

// =========================
// ====== SETTINGS =========
// =========================

function getSettings() {
    if (!extensionSettings[WT_ROUTER_MODULE_NAME]) {
        extensionSettings[WT_ROUTER_MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key in defaultSettings) {
        if (extensionSettings[WT_ROUTER_MODULE_NAME][key] === undefined) {
            extensionSettings[WT_ROUTER_MODULE_NAME][key] = defaultSettings[key];
        }
    }
    settings = extensionSettings[WT_ROUTER_MODULE_NAME];
    if (settings.timeoutMs === 30000) settings.timeoutMs = defaultSettings.timeoutMs;
    // Migrate the old 10-minute default down to the new 5-minute default.
    // Users who set an explicit non-default value keep their setting.
    if (settings.cooldownMs === 10 * 60 * 1000) settings.cooldownMs = defaultSettings.cooldownMs;
    if (!['random', 'priority'].includes(settings.routingMode)) settings.routingMode = defaultSettings.routingMode;
    settings.pool.forEach(model => {
        if (model.profileName === undefined) model.profileName = '';
        if (model.timeoutMs === undefined) model.timeoutMs = null;
        if (model.extendedCooldownUntil === undefined) model.extendedCooldownUntil = null;
        if (!Array.isArray(model.failureHistory)) model.failureHistory = [];
    });
}

// =========================
// === POOL MANAGEMENT =====
// =========================

function getRouteKey(model) {
    return `${model.profileName || ''}::${model.id}`;
}

function getModelLabel(model) {
    return model.profileName ? `${model.id} (${model.profileName})` : model.id;
}

function getConnectionManagerSettings() {
    return extensionSettings.connectionManager || { profiles: [], selectedProfile: null };
}

function getConnectionProfiles() {
    const profiles = getConnectionManagerSettings().profiles;
    return Array.isArray(profiles) ? profiles : [];
}

function getCurrentConnectionProfileName() {
    const settings = getConnectionManagerSettings();
    const profile = getConnectionProfiles().find(p => p.id === settings.selectedProfile);
    return profile?.name || '';
}

function getConnectionProfileByName(profileName) {
    return getConnectionProfiles().find(profile => profile.name === profileName) || null;
}

function getConnectionProfileNames() {
    return getConnectionProfiles().map(profile => profile.name).sort((a, b) => a.localeCompare(b));
}

function addModelToPool(modelId, profileName = getCurrentConnectionProfileName()) {
    modelId = modelId.trim();
    if (!modelId) return false;
    const route = { id: modelId, profileName };
    if (settings.pool.find(m => getRouteKey(m) === getRouteKey(route))) {
        // @ts-ignore
        toastr.warning(`Route "${getModelLabel(route)}" is already in the pool`);
        return false;
    }
    settings.pool.push({ id: modelId, profileName, weight: 0, timeoutMs: null, cooldownUntil: null, extendedCooldownUntil: null, failureHistory: [] });
    const equal = 100 / settings.pool.length;
    settings.pool.forEach(m => m.weight = equal);
    saveSettingsDebounced();
    return true;
}

function removeModelFromPool(routeKey) {
    const idx = settings.pool.findIndex(m => getRouteKey(m) === routeKey);
    if (idx === -1) return;
    settings.pool.splice(idx, 1);
    if (settings.pool.length > 0) {
        const equal = 100 / settings.pool.length;
        settings.pool.forEach(m => m.weight = equal);
    }
    saveSettingsDebounced();
}

function setModelWeight(routeKey, newWeight) {
    newWeight = Math.max(0, Math.min(100, newWeight));
    const target = settings.pool.find(m => getRouteKey(m) === routeKey);
    if (!target) return;
    if (settings.pool.length === 1) { target.weight = 100; saveSettingsDebounced(); return; }
    const otherSum = settings.pool.reduce((sum, m) => getRouteKey(m) === routeKey ? sum : sum + m.weight, 0);
    const remaining = 100 - newWeight;
    target.weight = newWeight;
    if (otherSum > 0) {
        const scale = remaining / otherSum;
        settings.pool.forEach(m => { if (getRouteKey(m) !== routeKey) m.weight = m.weight * scale; });
    } else {
        const others = settings.pool.filter(m => getRouteKey(m) !== routeKey);
        if (others.length > 0) { const each = remaining / others.length; others.forEach(m => m.weight = each); }
    }
    saveSettingsDebounced();
}

function moveModelInPool(routeKey, direction) {
    const idx = settings.pool.findIndex(m => getRouteKey(m) === routeKey);
    const newIdx = idx + direction;
    if (idx === -1 || newIdx < 0 || newIdx >= settings.pool.length) return;
    const [model] = settings.pool.splice(idx, 1);
    settings.pool.splice(newIdx, 0, model);
    saveSettingsDebounced();
}

function setModelTimeout(routeKey, seconds) {
    const target = settings.pool.find(m => getRouteKey(m) === routeKey);
    if (!target) return;
    const parsed = Number(seconds);
    target.timeoutMs = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) : null;
    saveSettingsDebounced();
}

function getModelTimeoutMs(model) {
    return model?.timeoutMs && model.timeoutMs > 0 ? model.timeoutMs : settings.timeoutMs;
}

function clearAllCooldowns(reason = '') {
    // Only clears regular cooldowns. Extended cooldowns can only be cleared
    // per-route via the ↻ button on the row.
    settings.pool.forEach(m => m.cooldownUntil = null);
    saveSettingsDebounced();
    renderPoolList();
    updateStatusBar();
    routerEvent(reason || 'Regular cooldowns cleared (extended cooldowns kept - clear those per-route)', 'info');
}

function clearModelCooldowns(routeKey) {
    const m = settings.pool.find(x => getRouteKey(x) === routeKey);
    if (!m) return;
    const hadExt = isOnExtendedCooldown(m);
    m.cooldownUntil = null;
    m.extendedCooldownUntil = null;
    m.failureHistory = [];
    saveSettingsDebounced();
    renderPoolList();
    updateStatusBar();
    routerEvent(`${getModelLabel(m)} cooldowns cleared manually${hadExt ? ' (including extended)' : ''}`, 'info');
}

// =========================
// ===== SELECTION =========
// =========================

function rollModel() {
    const now = Date.now();
    const available = settings.pool.filter(m =>
        !isOnCooldown(m, now) && !attemptedThisTurn.has(getRouteKey(m)) && (settings.routingMode === 'priority' || m.weight > 0)
    );
    if (available.length === 0) return null;
    if (settings.routingMode === 'priority') return available[0];
    const totalWeight = available.reduce((sum, m) => sum + m.weight, 0);
    if (totalWeight <= 0) return available[0];
    let roll = Math.random() * totalWeight;
    for (const model of available) { roll -= model.weight; if (roll <= 0) return model; }
    return available[available.length - 1];
}

const MODEL_FIELD_BY_SOURCE = {
    openai: 'openai_model',
    claude: 'claude_model',
    openrouter: 'openrouter_model',
    ai21: 'ai21_model',
    google: 'google_model',
    vertexai: 'vertexai_model',
    mistralai: 'mistralai_model',
    cohere: 'cohere_model',
    perplexity: 'perplexity_model',
    groq: 'groq_model',
    nanogpt: 'nanogpt_model',
    deepseek: 'deepseek_model',
    aimlapi: 'aimlapi_model',
    xai: 'xai_model',
    pollinations: 'pollinations_model',
    moonshot: 'moonshot_model',
    fireworks: 'fireworks_model',
    cometapi: 'cometapi_model',
    custom: 'custom_model',
};

const MODEL_INPUT_BY_FIELD = {
    openai_model: '#model_openai_select',
    claude_model: '#model_claude_select',
    openrouter_model: '#model_openrouter_select',
    ai21_model: '#model_ai21_select',
    google_model: '#model_google_select',
    vertexai_model: '#model_vertexai_select',
    mistralai_model: '#model_mistralai_select',
    cohere_model: '#model_cohere_select',
    perplexity_model: '#model_perplexity_select',
    groq_model: '#model_groq_select',
    nanogpt_model: '#model_nanogpt_select',
    deepseek_model: '#model_deepseek_select',
    aimlapi_model: '#model_aimlapi_select',
    xai_model: '#model_xai_select',
    pollinations_model: '#model_pollinations_select',
    moonshot_model: '#model_moonshot_select',
    fireworks_model: '#model_fireworks_select',
    cometapi_model: '#model_cometapi_select',
    custom_model: '#custom_model_id',
};

function getModelFieldForSource(source) {
    return MODEL_FIELD_BY_SOURCE[source] || 'custom_model';
}

async function applyRouterConnectionProfile(model) {
    if (!model.profileName) return;
    const profile = getConnectionProfileByName(model.profileName);
    if (!profile) {
        routerEvent(`Connection profile "${model.profileName}" not found; using current connection`, 'warn');
        return;
    }

    const profileSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('connection_profiles'));
    if (!profileSelect) {
        routerEvent('Connection Profile selector not found; using current connection', 'warn');
        return;
    }

    const loaded = new Promise(resolve => eventSource.once(event_types.CONNECTION_PROFILE_LOADED, resolve));
    profileSelect.value = profile.id;
    profileSelect.dispatchEvent(new Event('change'));
    await loaded;
}

async function applyModel(model) {
    const ctx = SillyTavern.getContext();
    if (originalCustomModel === null) originalCustomModel = ctx.chatCompletionSettings.custom_model;
    currentAttemptSnapshot = captureGenerationSnapshot(ctx);
    await applyRouterConnectionProfile(model);
    const source = oai_settings?.chat_completion_source;
    const modelField = getModelFieldForSource(source);
    oai_settings[modelField] = model.id;
    const selector = MODEL_INPUT_BY_FIELD[modelField];
    if (selector) $(selector).val(model.id).trigger('input', { source: 'weyland-router' }).trigger('change');
    ctx.chatCompletionSettings.custom_model = model.id;
    currentlySelectedModel = model;
    lastSelectedModel = model;
    lastSelectedAt = Date.now();
    currentGenId++;
    watchingGenId = currentGenId;
    routerLog(`Applied model: ${getModelLabel(model)} [genId=${watchingGenId}]`);
    startGenerationTimeout(model, watchingGenId);
    updateStatusBar();
}

function captureGenerationSnapshot(ctx = SillyTavern.getContext()) {
    const lastIndex = ctx.chat.length - 1;
    const lastMessage = ctx.chat[lastIndex] || null;
    const swipes = Array.isArray(lastMessage?.swipes) ? lastMessage.swipes : [];
    const reasoning = getReasoningText(lastMessage);
    return {
        chatLength: ctx.chat.length,
        lastIndex,
        lastMessage,
        lastMes: String(lastMessage?.mes || ''),
        lastReasoning: reasoning,
        lastSwipeCount: swipes.length,
        lastSwipeText: String(swipes[swipes.length - 1] || ''),
    };
}

function getReasoningText(msg) {
    if (!msg) return '';
    return String(msg.extra?.reasoning || msg.extra?.reasoning_content || msg.reasoning || '');
}

function isPlaceholderOutput(content) {
    const normalized = String(content || '').trim().replace(/\s+/g, '');
    return normalized === '' || normalized === '...' || normalized === '…';
}

function getAttemptContent(msg, lastIdx, snapshot) {
    if (!msg || msg.is_user) return null;
    if (!snapshot) return String(msg.mes || '') || getReasoningText(msg);

    const content = String(msg.mes || '');
    const reasoning = getReasoningText(msg);
    const swipes = Array.isArray(msg.swipes) ? msg.swipes : [];
    const latestSwipe = String(swipes[swipes.length - 1] || '');

    if (lastIdx > snapshot.lastIndex || msg !== snapshot.lastMessage) return content || reasoning || latestSwipe;
    if (content !== snapshot.lastMes) return content;
    if (reasoning !== snapshot.lastReasoning) return reasoning;
    if (swipes.length > snapshot.lastSwipeCount && latestSwipe !== snapshot.lastSwipeText) return latestSwipe;

    return null;
}

function claimRouterAttemptLock() {
    const lock = globalThis[ROUTER_ATTEMPT_LOCK_KEY];
    if (lock?.active && lock.owner !== ROUTER_INSTANCE_ID && Date.now() - lock.at < 120000) {
        routerLog(`Another Weyland Router instance already owns this generation: ${lock.owner}`);
        return false;
    }
    globalThis[ROUTER_ATTEMPT_LOCK_KEY] = { active: true, owner: ROUTER_INSTANCE_ID, at: Date.now() };
    return true;
}

function releaseRouterAttemptLock() {
    const lock = globalThis[ROUTER_ATTEMPT_LOCK_KEY];
    if (!lock || lock.owner === ROUTER_INSTANCE_ID || Date.now() - lock.at > 120000) {
        globalThis[ROUTER_ATTEMPT_LOCK_KEY] = { active: false, owner: ROUTER_INSTANCE_ID, at: Date.now() };
    }
}

// =========================
// ===== INTERCEPTOR =======
// =========================

// @ts-ignore
globalThis.weylandRouterInterceptor = async function (chat, contextSize, abort, type) {
    if (!settings) getSettings();
    if (!settings.enabled) return;
    if (settings.pool.length === 0) return;
    if (type === 'quiet' || type === 'impersonate') { routerLog(`Skipping: ${type}`); return; }

    if (!claimRouterAttemptLock()) return;

    if (currentlySelectedModel && watchingGenId !== null) {
        routerLog(`Duplicate generation interceptor ignored while ${getModelLabel(currentlySelectedModel)} is active`);
        return;
    }

    // Consume the one-shot retry token. This is more reliable than isRetrying
    // (which auto-clears on a 1s timer and can flip back to false mid-cascade
    // if /trigger takes its time).
    const isRetryAttempt = pendingRetryAttempt;
    pendingRetryAttempt = false;

    if (!isRetryAttempt) {
        attemptedThisTurn.clear();
        routerEvent('Generation started - rolling model die', 'info');
    } else {
        routerEvent('Rerolling after failure...', 'info');
    }

    let selected = rollModel();
    // Fresh user generations should not get blocked by stale cooldowns from
    // earlier chats/tabs. Retries keep attemptedThisTurn intact so a fully
    // failed pass still ends instead of looping forever.
    if (!selected && !isRetryAttempt) {
        // Only wipe REGULAR cooldowns — extended cooldowns are the safety net for
        // models that have actually proven they're down, and should never be
        // auto-cleared by a fresh generation.
        const now = Date.now();
        const hadRegularCooldowns = settings.pool.some(m =>
            m.cooldownUntil && m.cooldownUntil > now && !isOnExtendedCooldown(m, now)
        );
        if (hadRegularCooldowns) {
            settings.pool.forEach(m => { if (!isOnExtendedCooldown(m, now)) m.cooldownUntil = null; });
            saveSettingsDebounced();
            renderPoolList();
            updateStatusBar();
            routerEvent('All ready routes were cooling down; regular cooldowns cleared for this fresh generation', 'warn');
            selected = rollModel();
        }
    }
    if (!selected) {
        // @ts-ignore
        toastr.error("[Weyland-Router] All models exhausted or on cooldown");
        routerEvent('All models exhausted or on cooldown - generation aborted', 'error');
        releaseRouterAttemptLock();
        abort();
        return;
    }

    attemptedThisTurn.add(getRouteKey(selected));
    routerEvent(`${getModelLabel(selected)} rolled - attempting generation`, 'info');
    await applyModel(selected);
};

// =========================
// === TOASTR / ERROR ======
// =========================

const API_ERROR_PATTERNS = [
    'not included in your plan','model not found','model_not_found','invalid model',
    'rate limit','rate_limit','status 4','status 5','403','404','429',
    '500','502','503','504','overloaded','unavailable','timeout',
    'something went wrong','try again later','chat completion api','api returned an error',
    'internal server error','bad request','invalid_request_error',
];

function getActiveFailureModel() {
    if (currentlySelectedModel) return currentlySelectedModel;
    return Date.now() - lastSelectedAt < 15000 ? lastSelectedModel : null;
}

function looksLikeApiError(message, model = getActiveFailureModel()) {
    if (!model) return false;
    const msg = String(message || '').toLowerCase();
    if (!msg) return false;
    if (msg.includes(model.id.toLowerCase())) return true;
    for (const pat of API_ERROR_PATTERNS) { if (msg.includes(pat.toLowerCase())) return true; }
    return false;
}

function handleRouterApiError(failed, reason, message = '') {
    if (!settings?.enabled || !failed) return false;
    routerLog(`Intercepted API failure for ${failed.id}: ${message}`);
    routerEvent(`${getModelLabel(failed)} - API error: ${String(message || reason).substring(0, 120)}`, 'error');
    clearGenerationTimeout();
    failCurrentAttempt(failed, reason);
    return true;
}

function installToastrSuppression() {
    // @ts-ignore
    if (typeof toastr === 'undefined' || toastr.error?._weylandRouterPatched) return;
    // @ts-ignore Keep the first original toast function so re-patching cannot wrap our wrapper.
    if (originalToastrError === null) originalToastrError = toastr.error.bind(toastr);
    // @ts-ignore
    toastr.error = function (message, title, options) {
        if (settings?.enabled) {
            const failed = getActiveFailureModel();
            const isChatCompletionToast = String(title || '').toLowerCase().includes('chat completion');
            const isApiError = failed && (looksLikeApiError(message, failed) || looksLikeApiError(title, failed) || isChatCompletionToast);
            if (isApiError) {
                handleRouterApiError(failed, 'api-error', `${title || ''} ${message || ''}`.trim());
                return; // always suppress while Router handles the reroll
            }
        }
        return originalToastrError(message, title, options);
    };
    // @ts-ignore
    toastr.error._weylandRouterPatched = true;
    routerLog("Toastr patched");
}

function setupUnhandledRejectionListener() {
    window.addEventListener('unhandledrejection', (event) => {
        if (!settings?.enabled) return;
        const failed = getActiveFailureModel();
        if (!failed) return;
        const reasonStr = String(event.reason?.message || event.reason || '');
        if (looksLikeApiError(reasonStr, failed)) {
            handleRouterApiError(failed, 'unhandled-rejection', reasonStr);
        }
    });
}

// =========================
// === FAILURE HANDLING ====
// =========================

function clearGenerationTimeout() {
    if (generationTimeoutId !== null) { clearTimeout(generationTimeoutId); generationTimeoutId = null; }
}

// Mark the active model failed, clear attempt state, and schedule a retry.
// Use this for every failure path so all branches stay consistent.
function failCurrentAttempt(failed, reason) {
    const now = Date.now();
    // Dedup guard: if the model we're about to fail is already on cooldown, this
    // is a late-arriving error from the same attempt we already counted. ST often
    // fires the end-event before the upstream API actually fails, so the real API
    // error toast arrives seconds AFTER we've already registered a stale-output /
    // no-message strike. Counting both would double-strike the circuit breaker.
    if (isOnCooldown(failed, now)) {
        routerEvent(`${getModelLabel(failed)} - late ${reason} arrived for already-failed attempt, not double-striking`, 'info');
        currentlySelectedModel = null;
        watchingGenId = null;
        currentAttemptSnapshot = null;
        return;
    }
    markModelFailed(failed, reason);
    currentlySelectedModel = null;
    watchingGenId = null;
    currentAttemptSnapshot = null;
    lastSelectedModel = failed;
    lastSelectedAt = now;
    setTimeout(() => triggerRetry(), 200);
}

// Clean exit on success or user-initiated stop. Releases lock, no retry.
function clearAttemptCleanly() {
    releaseRouterAttemptLock();
    currentlySelectedModel = null;
    watchingGenId = null;
    lastSelectedModel = null;
    attemptedThisTurn.clear();
    currentAttemptSnapshot = null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isGenerationLocked() {
    return document.body?.dataset?.generating === 'true' || $('#mes_stop').is(':visible');
}

async function waitForGenerationUnlock(timeoutMs = 5000) {
    const startedAt = Date.now();
    while (isGenerationLocked() && Date.now() - startedAt < timeoutMs) {
        await sleep(100);
    }
    return !isGenerationLocked();
}

async function stopActiveGenerationForRetry() {
    try {
        if (stopGeneration()) {
            routerEvent('Stopped stalled generation before retry', 'warn');
            await sleep(500);
        }
    } catch (err) {
        routerLog('Could not stop active generation before retry', err);
    }
}

function startGenerationTimeout(model, genId) {
    clearGenerationTimeout();
    const timeoutMs = getModelTimeoutMs(model);
    generationTimeoutId = setTimeout(async () => {
        if (!currentlySelectedModel || watchingGenId !== genId) return;
        routerLog(`Timeout for: ${model.id}`);
        await stopActiveGenerationForRetry();
        failCurrentAttempt(model, 'timeout');
    }, timeoutMs);
}

function pruneFailureHistory(model, now = Date.now()) {
    if (!Array.isArray(model.failureHistory)) { model.failureHistory = []; return; }
    const cutoff = now - settings.failureWindowMs;
    model.failureHistory = model.failureHistory.filter(t => t > cutoff);
}

function getEffectiveCooldownUntil(model) {
    const reg = model.cooldownUntil || 0;
    const ext = model.extendedCooldownUntil || 0;
    return Math.max(reg, ext);
}

function isOnCooldown(model, now = Date.now()) {
    return getEffectiveCooldownUntil(model) > now;
}

function isOnExtendedCooldown(model, now = Date.now()) {
    return (model.extendedCooldownUntil || 0) > now;
}

function markModelFailed(model, reason) {
    const now = Date.now();
    pruneFailureHistory(model, now);
    model.failureHistory.push(now);

    const label = { 'timeout': `no response after ${Math.round(getModelTimeoutMs(model)/1000)}s`, 'blank': 'blank response', 'api-error': 'API error', 'unhandled-rejection': 'request failed', 'no-message': 'no message produced', 'stale-output': 'no new output detected', 'stopped': 'generation stopped' }[reason] || reason;
    routerLog(`"${getModelLabel(model)}" failed (${label}) [${model.failureHistory.length}/${settings.failureThreshold} in window]`);

    if (model.failureHistory.length >= settings.failureThreshold) {
        // Circuit breaker trips. Apply extended cooldown and reset the strike count
        // so the breaker doesn't immediately re-trip the moment extended expires.
        model.extendedCooldownUntil = now + settings.extendedCooldownMs;
        model.failureHistory = [];
        const extEnds = new Date(model.extendedCooldownUntil).toLocaleTimeString();
        routerEvent(`${getModelLabel(model)} circuit-broken (${settings.failureThreshold} fails in ${Math.round(settings.failureWindowMs/60000)}m) - EXTENDED cooldown until ${extEnds}`, 'error');
    } else {
        model.cooldownUntil = now + settings.cooldownMs;
        routerEvent(`${getModelLabel(model)} failed (${label}) - cooldown until ${new Date(model.cooldownUntil).toLocaleTimeString()} [${model.failureHistory.length}/${settings.failureThreshold}]`, 'warn');
    }

    saveSettingsDebounced();
    renderPoolList();
    updateStatusBar();
}

async function triggerRetry() {
    const ctx = SillyTavern.getContext();
    isRetrying = true;
    try {
        if (isGenerationLocked()) {
            routerLog('Generation lock still active before retry; stopping stalled request');
            await stopActiveGenerationForRetry();
        }

        const unlocked = await waitForGenerationUnlock();
        if (!unlocked) {
            routerEvent('Retry blocked - generation did not unlock', 'error');
            return;
        }

        // Remove the empty ghost message left by the failed generation before retrying
        const lastMsg = ctx.chat[ctx.chat.length - 1];
        if (lastMsg && !lastMsg.is_user && (lastMsg.mes || '').trim() === '') {
            routerLog('Removing empty ghost message before retry');
            ctx.chat.pop();
            // Also remove from DOM if present
            const msgBlocks = document.querySelectorAll('.mes');
            if (msgBlocks.length > 0) {
                const lastBlock = msgBlocks[msgBlocks.length - 1];
                if (lastBlock && !lastBlock.classList.contains('is_user')) {
                    lastBlock.remove();
                }
            }
        }
        // Use /trigger to generate the next message fresh.
        // Arm the one-shot retry token so the next interceptor invocation knows
        // this is a continuation of the same user turn, no matter how long
        // /trigger takes to actually fire it.
        if (ctx.executeSlashCommandsWithOptions) {
            releaseRouterAttemptLock();
            pendingRetryAttempt = true;
            await ctx.executeSlashCommandsWithOptions('/trigger', { showOutput: false });
        }
    } catch (err) {
        console.error(`[${WT_ROUTER_MODULE_NAME}] Retry failed:`, err);
    } finally {
        setTimeout(() => { isRetrying = false; }, 1000);
    }
}

function onGenerationStarted(type, options, dryRun) {
    if (!settings?.enabled || dryRun || !currentlySelectedModel) return;
    if (generationTimeoutId === null && watchingGenId !== null) {
        startGenerationTimeout(currentlySelectedModel, watchingGenId);
    }
}

function onGenerationEnded(messageId) {
    if (!settings?.enabled) return;
    clearGenerationTimeout();
    if (!currentlySelectedModel) return;

    // Capture and clear the genId immediately so a second GENERATION_ENDED
    // event (e.g. from a retry, or the MESSAGE_RECEIVED safety net) can't re-enter
    // this logic for the same slot.
    const myGenId = watchingGenId;
    if (myGenId !== null && myGenId === lastFinalizedGenId) return;
    if (myGenId !== null) lastFinalizedGenId = myGenId;
    watchingGenId = null;

    const ctx = SillyTavern.getContext();
    const lastIdx = ctx.chat.length - 1;
    const msg = ctx.chat[lastIdx];
    routerLog(`Gen ended [genId=${myGenId}]. lastIdx=${lastIdx}, isUser=${msg?.is_user}, mesLen=${msg?.mes?.length ?? 'n/a'}`);

    // If the last message is still from the user, the attempt ended before producing output.
    if (!msg || msg.is_user) {
        const failed = currentlySelectedModel;
        routerLog(`Gen ended [genId=${myGenId}] with no assistant message`);
        failCurrentAttempt(failed, 'no-message');
        return;
    }

    const rawContent = getAttemptContent(msg, lastIdx, currentAttemptSnapshot);
    const content = (rawContent || '').trim();

    if (rawContent === null) {
        const failed = currentlySelectedModel;
        routerLog(`Stale output detected for ${failed.id}; last message did not change after this roll`);
        failCurrentAttempt(failed, 'stale-output');
        return;
    }

    // KEY FIX: if this message was already tagged by a previous successful generation,
    // we are looking at stale content from before our retry. Don't count it as our success.
    if (msg.extra?.weyland_router_model && (msg.extra.weyland_router_model !== currentlySelectedModel.id || (msg.extra.weyland_router_profile || '') !== (currentlySelectedModel.profileName || ''))) {
        const failed = currentlySelectedModel;
        routerLog(`Stale message detected (tagged by ${msg.extra.weyland_router_model} / ${msg.extra.weyland_router_profile || 'current'}, we are ${getModelLabel(currentlySelectedModel)}) - ignoring`);
        failCurrentAttempt(failed, 'stale-output');
        return;
    }

    if (isPlaceholderOutput(content)) {
        const failed = currentlySelectedModel;
        if (String(msg.extra?.reasoning || '').trim()) {
            routerEvent(`${failed.id} produced reasoning but no visible output`, 'warn');
        }
        failCurrentAttempt(failed, 'blank');
        return;
    }

    // Success
    if (!msg.extra) msg.extra = {};
    msg.extra.weyland_router_model = currentlySelectedModel.id;
    msg.extra.weyland_router_profile = currentlySelectedModel.profileName || '';
    // Clean slate — successful generation wipes the strike count for THIS model
    // so a "2 fails, 1 success, 2 fails" pattern stays out of extended cooldown.
    if (Array.isArray(currentlySelectedModel.failureHistory) && currentlySelectedModel.failureHistory.length > 0) {
        currentlySelectedModel.failureHistory = [];
        saveSettingsDebounced();
    }
    routerEvent(`${getModelLabel(currentlySelectedModel)} succeeded - awaiting next input`, 'success');
    clearAttemptCleanly();
}

function onMessageReceivedForRouter() {
    if (!settings?.enabled || !currentlySelectedModel) return;
    // Some providers/render paths emit MESSAGE_RECEIVED more reliably than GENERATION_ENDED.
    // Use it as a delayed, harmless second chance to tag/log successful output.
    setTimeout(() => {
        if (currentlySelectedModel) onGenerationEnded('message_received');
    }, 150);
}

function onGenerationStopped() {
    if (!settings?.enabled) return;
    clearGenerationTimeout();
    if (isRetrying || !currentlySelectedModel) return;

    const userStopLikely = Date.now() - manualStopRequestedAt < 1500;
    if (userStopLikely) {
        routerEvent(`Generation stopped by user - ${getModelLabel(currentlySelectedModel)} not penalized`, 'info');
        clearAttemptCleanly();
        return;
    }

    const failed = currentlySelectedModel;
    routerLog(`Generation stopped without user stop intent for ${getModelLabel(failed)}`);
    failCurrentAttempt(failed, 'stopped');
}

// =========================
// ========== UI ===========
// =========================

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function formatCooldownDuration(ms) {
    if (ms <= 0) return '0s';
    const totalSec = Math.ceil(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const totalMin = Math.ceil(totalSec / 60);
    if (totalMin < 60) {
        const sec = totalSec % 60;
        return sec > 0 && totalMin < 5 ? `${Math.floor(totalSec/60)}m ${sec}s` : `${totalMin}m`;
    }
    const hours = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    return min > 0 ? `${hours}h ${min}m` : `${hours}h`;
}

function buildPoolHtml() {
    if (!settings.pool || settings.pool.length === 0) {
        return `<div class="wtr-empty">
            <div class="wtr-empty-title">Your routing pool is empty</div>
            <div class="wtr-empty-body">Pick a Connection Profile above, choose a model, and hit <b>+ Add</b>.<br>Add two or more so the router has something to fall back to.</div>
        </div>`;
    }
    const now = Date.now();
    const isPriorityMode = settings.routingMode === 'priority';
    return settings.pool.map((model, index) => {
        const routeKey = getRouteKey(model);
        const label = getModelLabel(model);
        const extended = isOnExtendedCooldown(model, now);
        const effectiveUntil = getEffectiveCooldownUntil(model);
        const onCooldown = effectiveUntil > now;
        const remaining = onCooldown ? formatCooldownDuration(effectiveUntil - now) : '';
        const strikeCount = Array.isArray(model.failureHistory) ? model.failureHistory.length : 0;
        const strikeBadge = (!extended && strikeCount > 0)
            ? ` <span class="wtr-strikes" title="Recent failures in the ${Math.round(settings.failureWindowMs/60000)}-minute window. ${settings.failureThreshold} trips extended cooldown.">${strikeCount}/${settings.failureThreshold}</span>`
            : '';
        const dot = extended
            ? `<span class="wtr-dot wtr-dot-ext" title="Extended cooldown - circuit breaker tripped. This route stays out until cleared manually or the timer expires.">EXT ${remaining}</span>`
            : onCooldown
                ? `<span class="wtr-dot wtr-dot-cd" title="Regular cooldown">CD ${remaining}</span>`
                : `<span class="wtr-dot wtr-dot-ok" title="Ready">OK</span>`;
        const metric = isPriorityMode
            ? `<span class="wtr-priority-label" title="Priority position">#${index + 1}</span>`
            : `<input class="wtr-weight-input" type="number" min="0" max="100" step="0.1" value="${model.weight.toFixed(1)}" data-model="${escapeHtml(routeKey)}">`;
        const timeoutSeconds = model.timeoutMs && model.timeoutMs > 0 ? Math.round(model.timeoutMs / 1000) : '';
        const moveButtons = isPriorityMode
            ? `<button class="wtr-btn-icon wtr-move-up" data-model="${escapeHtml(routeKey)}" title="Move up in priority order" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="wtr-btn-icon wtr-move-down" data-model="${escapeHtml(routeKey)}" title="Move down in priority order" ${index === settings.pool.length - 1 ? 'disabled' : ''}>↓</button>`
            : '';
        const clearTitle = extended
            ? 'Clear EXTENDED cooldown for this route (also clears strike count)'
            : onCooldown
                ? 'Clear cooldown and strike count for this route'
                : strikeCount > 0
                    ? `Clear strike count (${strikeCount}/${settings.failureThreshold}) for this route`
                    : 'Nothing to clear';
        const clearDisabled = !onCooldown && strikeCount === 0;
        return `<div class="wtr-model-row ${isPriorityMode ? 'wtr-priority-mode-row' : 'wtr-random-mode-row'} ${extended ? 'wtr-row-extended' : ''}" data-model="${escapeHtml(routeKey)}">
            <div class="wtr-model-status">${dot}</div>
            <div class="wtr-model-name" title="${escapeHtml(label)}">${escapeHtml(label)}${strikeBadge}</div>
            ${metric}
            <span class="wtr-pct">${isPriorityMode ? '' : '%'}</span>
            <input class="wtr-route-timeout-input" type="number" min="1" max="600" step="1" value="${timeoutSeconds}" placeholder="${Math.round(settings.timeoutMs / 1000)}" data-model="${escapeHtml(routeKey)}" title="Per-route timeout in seconds. Leave blank to use the global Timeout setting.">
            ${moveButtons}
            <button class="wtr-btn-icon wtr-clear-cd ${extended ? 'wtr-clear-cd-ext' : ''}" data-model="${escapeHtml(routeKey)}" title="${clearTitle}" ${clearDisabled ? 'disabled' : ''}>↻</button>
            <button class="wtr-btn-icon wtr-remove" data-model="${escapeHtml(routeKey)}" title="Remove this route from the pool">✕</button>
        </div>`;
    }).join('');
}

function renderPoolList() {
    const el = document.getElementById('wtr-pool-list');
    if (!el) return;
    const metricLabel = document.getElementById('wtr-metric-label');
    if (metricLabel) metricLabel.textContent = settings.routingMode === 'priority' ? 'Order' : 'Pull Chance';
    const header = document.querySelector('.wtr-pool-header');
    if (header) {
        header.classList.toggle('wtr-priority-mode-row', settings.routingMode === 'priority');
        header.classList.toggle('wtr-random-mode-row', settings.routingMode !== 'priority');
        header.innerHTML = `<div></div><div>Model Route</div><div id="wtr-metric-label" title="Random mode uses pull chance. Priority mode uses the list order." style="text-align:right;">${settings.routingMode === 'priority' ? 'Order' : 'Pull Chance'}</div><div></div><div title="Seconds before this route times out. Blank uses the global timeout." style="text-align:right;">Timeout</div>${settings.routingMode === 'priority' ? '<div></div><div></div>' : ''}<div></div><div></div>`;
    }
    el.innerHTML = buildPoolHtml();
    // bind events
    el.querySelectorAll('.wtr-weight-input').forEach(inp => {
        inp.addEventListener('change', e => {
            const t = /** @type {HTMLInputElement} */ (e.currentTarget);
            const v = parseFloat(t.value);
            if (!isNaN(v)) { setModelWeight(t.getAttribute('data-model'), v); renderPoolList(); }
        });
    });
    el.querySelectorAll('.wtr-route-timeout-input').forEach(inp => {
        inp.addEventListener('change', e => {
            const t = /** @type {HTMLInputElement} */ (e.currentTarget);
            setModelTimeout(t.getAttribute('data-model'), t.value);
            renderPoolList();
        });
    });
    el.querySelectorAll('.wtr-remove').forEach(btn => {
        btn.addEventListener('click', e => {
            removeModelFromPool(/** @type {HTMLElement} */ (e.currentTarget).getAttribute('data-model'));
            renderPoolList(); updateStatusBar();
        });
    });
    el.querySelectorAll('.wtr-move-up').forEach(btn => {
        btn.addEventListener('click', e => {
            moveModelInPool(/** @type {HTMLElement} */ (e.currentTarget).getAttribute('data-model'), -1);
            renderPoolList();
        });
    });
    el.querySelectorAll('.wtr-move-down').forEach(btn => {
        btn.addEventListener('click', e => {
            moveModelInPool(/** @type {HTMLElement} */ (e.currentTarget).getAttribute('data-model'), 1);
            renderPoolList();
        });
    });
    el.querySelectorAll('.wtr-clear-cd').forEach(btn => {
        btn.addEventListener('click', e => {
            const routeKey = /** @type {HTMLElement} */ (e.currentTarget).getAttribute('data-model');
            clearModelCooldowns(routeKey);
        });
    });
}

function refreshCooldownDisplays() {
    const list = document.getElementById('wtr-pool-list');
    if (!list) return;
    const now = Date.now();
    settings.pool.forEach(model => {
        const row = list.querySelector(`.wtr-model-row[data-model="${CSS.escape(getRouteKey(model))}"]`);
        if (!row) return;
        const status = row.querySelector('.wtr-model-status');
        const clearBtn = row.querySelector('.wtr-clear-cd');
        const extended = isOnExtendedCooldown(model, now);
        const effectiveUntil = getEffectiveCooldownUntil(model);
        const onCooldown = effectiveUntil > now;
        const remaining = onCooldown ? formatCooldownDuration(effectiveUntil - now) : '';
        const strikeCount = Array.isArray(model.failureHistory) ? model.failureHistory.length : 0;
        if (status) {
            status.innerHTML = extended
                ? `<span class="wtr-dot wtr-dot-ext" title="Extended cooldown - circuit breaker tripped">EXT ${remaining}</span>`
                : onCooldown
                    ? `<span class="wtr-dot wtr-dot-cd" title="Regular cooldown">CD ${remaining}</span>`
                    : `<span class="wtr-dot wtr-dot-ok" title="Ready">OK</span>`;
        }
        row.classList.toggle('wtr-row-extended', extended);
        if (clearBtn) {
            clearBtn.toggleAttribute('disabled', !onCooldown && strikeCount === 0);
            clearBtn.classList.toggle('wtr-clear-cd-ext', extended);
        }
    });
}

function updateStatusBar() {
    const now = Date.now();
    const available = settings.pool.filter(m => !isOnCooldown(m, now)).length;
    const total = settings.pool.length;

    const pill = document.getElementById('wtr-status-pill');
    if (pill) {
        const isActive = settings.enabled && total > 0;
        pill.textContent = settings.enabled ? (total === 0 ? 'NO MODELS' : `${available}/${total} READY`) : 'DISABLED';
        pill.className = 'wtr-status-pill ' + (settings.enabled && available > 0 ? 'wtr-pill-active' : settings.enabled ? 'wtr-pill-warn' : 'wtr-pill-off');
    }

    const routingEl = document.getElementById('wtr-routing-model');
    if (routingEl) {
        routingEl.textContent = currentlySelectedModel ? getModelLabel(currentlySelectedModel) : 'idle — waiting for next message';
        routingEl.classList.toggle('wtr-routing-active', !!currentlySelectedModel);
    }

    const routingBar = document.getElementById('wtr-routing-bar');
    if (routingBar) routingBar.classList.toggle('wtr-routing-bar-active', !!currentlySelectedModel);
}

// =========================
// ==== MODAL WINDOW =======
// =========================

const MODAL_ID = 'wtr-modal-overlay';

function isMobileRouterLayout() {
    return window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
}

function buildModalHtml() {
    return `
<div id="${MODAL_ID}" style="display:none; position:fixed; inset:0; z-index:99990; pointer-events:none;">
  <div id="wtr-modal" style="
    position:absolute; left:100px; top:60px;
    width:min(760px, calc(100vw - 24px)); height:580px;
    background:rgba(10,6,9,0.98);
    border:1px solid rgba(180,38,58,0.35);
    border-radius:10px;
    box-shadow:0 20px 60px rgba(0,0,0,0.8), 0 0 1px rgba(180,38,58,0.4);
    backdrop-filter:blur(20px);
    display:flex; flex-direction:column;
    overflow:hidden;
    font-family:'JetBrains Mono',monospace;
    pointer-events:all;
    animation: wtr-open 0.2s ease;
  ">
    <!-- TITLE BAR (drag handle) -->
    <div id="wtr-titlebar" style="
      height:40px; background:rgba(18,10,16,0.98);
      display:flex; align-items:center; padding:0 14px;
      border-bottom:1px solid rgba(180,38,58,0.2);
      cursor:grab; user-select:none; flex-shrink:0; gap:12px;
    ">
      <div style="color:#e0445c;font-size:16px;letter-spacing:2px;font-weight:900;">WEYLAND ROUTER</div>
      <div style="flex:1;"></div>
      <div id="wtr-status-pill" class="wtr-status-pill wtr-pill-off">DISABLED</div>
      <button id="wtr-help-btn" class="wtr-btn-sm" title="What is Weyland Router?" style="padding:2px 8px;cursor:pointer;">?</button>
      <button id="wtr-toggle-log" class="wtr-btn-sm" title="Show the routing activity log" style="padding:2px 10px;cursor:pointer;">Show Log</button>
      <button id="wtr-close-btn" class="wtr-btn-sm" title="Close Weyland Router" style="padding:2px 10px;cursor:pointer;">x</button>
    </div>

    <!-- BODY -->
    <div id="wtr-modal-body" style="display:flex;flex:1;min-height:0;">

      <!-- LEFT PANEL: pool manager -->
      <div id="wtr-main-panel" style="flex:1;min-width:0;display:flex;flex-direction:column;padding:12px;gap:10px;overflow-y:auto;">

        <div class="wtr-enable-row" style="display:flex;align-items:center;gap:10px;">
          <label class="wtr-toggle-label" title="Turn automatic model routing on or off.">
            <input type="checkbox" id="wtr-enable" ${settings.enabled ? 'checked' : ''}>
            <span class="wtr-toggle-track"><span class="wtr-toggle-thumb"></span></span>
          </label>
          <span style="color:#ccc;font-size:12px;">Enable Router</span>
        </div>

        <div class="wtr-timing-row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <label title="Default wait time before Router decides a model is stuck. Individual routes can override this in the pool." style="color:#888;font-size:11px;display:flex;align-items:center;gap:5px;">
            Timeout <input id="wtr-timeout" title="Seconds to wait before failing over to another model." type="number" min="1" max="300" value="${settings.timeoutMs/1000}" class="wtr-num-input"> s
          </label>
          <label title="How long a failed model is skipped before Router allows it to be rolled again." style="color:#888;font-size:11px;display:flex;align-items:center;gap:5px;">
            Cooldown <input id="wtr-cooldown" title="Minutes a failed model stays out of rotation." type="number" min="0.1" max="60" step="0.1" value="${(settings.cooldownMs/60000).toFixed(1)}" class="wtr-num-input"> min
          </label>
          <button id="wtr-clear-all-cd" class="wtr-btn-sm" title="Clear every model cooldown immediately.">Reset CDs</button>
        </div>

        <div class="wtr-field-label" title="Choose how Router picks from your pool.">Routing Mode</div>
        <div class="wtr-control-row" style="display:flex;gap:8px;align-items:center;min-width:0;">
          <select id="wtr-routing-mode" class="wtr-text-input" title="Random rolls by pull chance. Priority uses the first ready route, then falls back down the list after failures." style="flex:1;min-width:0;cursor:pointer;">
            <option value="random" ${settings.routingMode === 'random' ? 'selected' : ''}>Weighted Random</option>
            <option value="priority" ${settings.routingMode === 'priority' ? 'selected' : ''}>Priority Failover</option>
          </select>
        </div>

        <div id="wtr-routing-bar" title="The model route currently being attempted." style="padding:6px 10px;background:rgba(180,38,58,0.07);border:1px solid rgba(180,38,58,0.15);border-radius:6px;display:flex;align-items:center;gap:8px;">
          <span style="color:#777;font-size:10px;text-transform:uppercase;letter-spacing:1px;white-space:nowrap;">Now Routing</span>
          <span id="wtr-routing-model" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">idle — waiting for next message</span>
        </div>

        <div class="wtr-field-label" title="A SillyTavern Connection Profile. This decides which API/provider/key Router uses for this route.">Connection Profile</div>
        <div class="wtr-control-row" style="display:flex;gap:6px;align-items:center;">
          <select id="wtr-profile-select" class="wtr-text-input" title="Choose which saved Connection Profile this model should use." style="flex:1;cursor:pointer;"></select>
        </div>

        <div class="wtr-field-label" title="Models available from the selected Connection Profile.">Model from Profile</div>
        <div class="wtr-control-row" style="display:flex;gap:8px;align-items:center;min-width:0;">
          <select id="wtr-model-select" class="wtr-text-input" title="Choose a model to add to the routing pool." style="flex:1;min-width:0;cursor:pointer;">
            <option value="">- pick from available models -</option>
          </select>
          <button id="wtr-add-from-select" class="wtr-btn-primary" title="Add the selected profile/model route to the pool." style="flex-shrink:0;">+ Add</button>
        </div>

        <div class="wtr-field-label" title="Use this when the model list does not populate, or when you know the exact model ID.">Manual Model ID</div>
        <div class="wtr-control-row wtr-manual-row" style="display:flex;gap:8px;min-width:0;">
          <input id="wtr-add-input" type="text" placeholder="or type model ID" title="Type a model ID manually." class="wtr-text-input" style="flex:1;min-width:0;">
          <button id="wtr-fill-current" class="wtr-btn-sm" title="Fill this box with the currently selected model." style="flex-shrink:0;">Use</button>
          <button id="wtr-add-btn" class="wtr-btn-primary" title="Add the typed profile/model route to the pool." style="flex-shrink:0;">+ Add</button>
        </div>

        <div class="wtr-field-label" title="These are the routes Router can roll during generation.">Routing Pool</div>
        <div class="wtr-pool-header ${settings.routingMode === 'priority' ? 'wtr-priority-mode-row' : 'wtr-random-mode-row'}" style="display:grid;gap:8px;padding:0 2px;color:#444;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(180,38,58,0.1);padding-bottom:5px;">
          <div></div><div>Model Route</div><div id="wtr-metric-label" title="Random mode uses pull chance. Priority mode uses the list order." style="text-align:right;">${settings.routingMode === 'priority' ? 'Order' : 'Pull Chance'}</div><div></div><div title="Seconds before this route times out. Blank uses the global timeout." style="text-align:right;">Timeout</div>${settings.routingMode === 'priority' ? '<div></div><div></div>' : ''}<div></div><div></div>
        </div>

        <div id="wtr-pool-list" style="display:flex;flex-direction:column;gap:4px;flex:1;overflow-y:auto;min-height:60px;"></div>

      </div>

      <!-- HELP OVERLAY (hidden by default; openable from titlebar ?) -->
      <div id="wtr-help-overlay" style="display:none;">
        <div class="wtr-help-card">
          <div class="wtr-help-header">
            <div class="wtr-help-title">Weyland Router — quick tour</div>
            <button id="wtr-help-close" class="wtr-btn-sm" title="Close this help panel">✕</button>
          </div>
          <div class="wtr-help-body">
            <p><b>What it does:</b> you build a pool of models, and Router auto-picks one whenever you generate. If a pick fails, errors, or stalls, Router benches it for a bit and rolls another — so you don't have to babysit.</p>
            <div class="wtr-help-section">Setting up</div>
            <ul>
              <li><b>Connection Profile</b> — which saved provider/API/key combo this route uses.</li>
              <li><b>Model from Profile</b> — which model from that provider to add.</li>
              <li><b>+ Add</b> — drops the route into the pool. Add at least 2 for the failover to mean anything!</li>
            </ul>
            <div class="wtr-help-section">Routing modes</div>
            <ul>
              <li><b>Weighted Random</b> — rolls from the pool by <b>Pull Chance</b>. Use this when you want a mix.</li>
              <li><b>Priority Failover</b> — always tries the top route first, then walks down the list when something fails.</li>
            </ul>
            <div class="wtr-help-section">Per-route knobs</div>
            <ul>
              <li><b>Pull Chance / Order</b> — how often (or how soon) this route gets picked.</li>
              <li><b>Timeout</b> — wait time before Router gives up on a route. Blank = use the global Timeout.</li>
              <li><b>↻</b> clears a route's cooldown. <b>✕</b> removes it.</li>
            </ul>
            <div class="wtr-help-section">When things go sideways</div>
            <p>If a route errors, blanks, stalls, or times out, Router cools it down for the <b>Cooldown</b> duration and rolls the next eligible route. Open <b>Show Log</b> to watch it work in real time — copy the log if you need to show Lucky what happened.</p>
          </div>
        </div>
      </div>

      <!-- RIGHT PANEL: activity log (NOT a drag target) -->
      <div id="wtr-log-panel" style="flex:1;display:none;flex-direction:column;padding:12px;gap:8px;min-width:0;border-left:1px solid rgba(180,38,58,0.15);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <div style="color:#444;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Activity Log</div>
          <div style="display:flex;gap:6px;align-items:center;">
            <label style="color:#555;font-size:10px;display:flex;align-items:center;gap:4px;">
              <input type="checkbox" id="wtr-debug" ${settings.debug ? 'checked' : ''}> verbose
            </label>
            <button id="wtr-log-copy" class="wtr-btn-sm">Copy</button>
            <button id="wtr-log-clear" class="wtr-btn-sm">Clear</button>
          </div>
        </div>
        <div id="wtr-log-output" style="
          flex:1; background:rgba(0,0,0,0.45); border:1px solid rgba(180,38,58,0.1);
          border-radius:6px; padding:10px; overflow-y:auto; font-size:11px; line-height:1.7;
        "></div>
      </div>

    </div>
  </div>
</div>`;
}

const MODEL_SELECTORS_BY_SOURCE = {
    openai: ['#model_openai_select option'],
    claude: ['#model_claude_select option'],
    openrouter: ['#model_openrouter_select option'],
    ai21: ['#model_ai21_select option'],
    google: ['#model_google_select option'],
    vertexai: ['#model_vertexai_select option'],
    mistralai: ['#model_mistralai_select option'],
    cohere: ['#model_cohere_select option'],
    perplexity: ['#model_perplexity_select option'],
    groq: ['#model_groq_select option'],
    nanogpt: ['#model_nanogpt_select option'],
    deepseek: ['#model_deepseek_select option'],
    aimlapi: ['#model_aimlapi_select option'],
    xai: ['#model_xai_select option'],
    pollinations: ['#model_pollinations_select option'],
    moonshot: ['#model_moonshot_select option'],
    fireworks: ['#model_fireworks_select option'],
    cometapi: ['#model_cometapi_select option'],
    custom: ['#model_custom_select option', '#model_custom_select_fill option'],
};

function collectAvailableModels(profileName = getCurrentConnectionProfileName()) {
    const models = new Set();
    const add = value => {
        const id = String(value || '').trim();
        if (id && id !== 'none' && id !== 'None') models.add(id);
    };
    const addModelRecord = record => add(typeof record === 'string' ? record : (record?.id || record?.name || ''));

    const preset = getConnectionProfileByName(profileName);
    add(preset?.model);

    const isCurrentProfile = !profileName || profileName === getCurrentConnectionProfileName();
    if (isCurrentProfile) {
        const source = oai_settings?.chat_completion_source || 'custom';
        [SillyTavern.getContext().chatCompletionSettings?.['model_ids']]
            .filter(Array.isArray)
            .forEach(list => list.forEach(addModelRecord));

        const selectors = MODEL_SELECTORS_BY_SOURCE[source] || MODEL_SELECTORS_BY_SOURCE.custom;
        document.querySelectorAll(selectors.join(',')).forEach(option => add(/** @type {HTMLOptionElement} */ (option).value));

        if (source === 'custom') {
            const currentCustom = /** @type {HTMLInputElement | null} */ (document.getElementById('custom_model_id'))?.value
                || SillyTavern.getContext().chatCompletionSettings?.custom_model;
            add(currentCustom);
        }
    }

    return Array.from(models).sort((a, b) => a.localeCompare(b));
}

function populateProfileDropdown() {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById('wtr-profile-select'));
    if (!select) return;
    const currentValue = select.value || getCurrentConnectionProfileName();
    const names = getConnectionProfileNames();
    select.innerHTML = '';

    if (names.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Current connection';
        select.appendChild(opt);
        return;
    }

    names.forEach(name => {
        const opt = document.createElement('option');
        const preset = getConnectionProfileByName(name);
        opt.value = name;
        opt.textContent = preset?.api ? `${name} (${preset.api})` : name;
        select.appendChild(opt);
    });

    select.value = names.includes(currentValue) ? currentValue : (names.includes(getCurrentConnectionProfileName()) ? getCurrentConnectionProfileName() : names[0]);
}

function populateModelDropdown() {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById('wtr-model-select'));
    if (!select) return;
    const profileName = /** @type {HTMLSelectElement | null} */ (document.getElementById('wtr-profile-select'))?.value || getCurrentConnectionProfileName();
    let models = [];
    try {
        models = collectAvailableModels(profileName);
    } catch (e) { routerLog('Could not read available models', e); }

    select.innerHTML = '<option value="">- pick from available models -</option>';
    if (models.length === 0) {
        select.innerHTML += '<option value="" disabled>(open Connection Panel and connect to populate)</option>';
        return;
    }
    models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = settings.pool.find(p => getRouteKey(p) === `${profileName}::${m}`) ? `${m} *` : m;
        select.appendChild(opt);
    });
}

function injectModal() {
    if (document.getElementById(MODAL_ID)) return;
    document.body.insertAdjacentHTML('beforeend', buildModalHtml());

    // Desktop: titlebar drags the window, browser-native CSS `resize: both`
    // handles the bottom-right resize corner. Mobile: modal is pinned fullscreen.
    const titlebar = document.getElementById('wtr-titlebar');
    const modal = document.getElementById('wtr-modal');
    let dragState = null;
    const shouldSkipDrag = target => Boolean(/** @type {HTMLElement} */ (target).closest('#wtr-log-panel, button, input, select, textarea, a, label'));

    titlebar.addEventListener('mousedown', e => {
        if (isMobileRouterLayout()) return;
        if (shouldSkipDrag(e.target)) return;
        const rect = modal.getBoundingClientRect();
        dragState = { startX: e.clientX - rect.left, startY: e.clientY - rect.top };
        titlebar.style.cursor = 'grabbing';
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!dragState) return;
        if (isMobileRouterLayout()) { dragState = null; return; }
        const W = modal.offsetWidth;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        // Clamp so enough of the window remains visible to grab again.
        const newLeft = Math.max(-W + 120, Math.min(vw - 120, e.clientX - dragState.startX));
        const newTop  = Math.max(0, Math.min(vh - 80, e.clientY - dragState.startY));
        modal.style.left = newLeft + 'px';
        modal.style.top  = newTop  + 'px';
    });
    document.addEventListener('mouseup', () => {
        if (dragState) { dragState = null; titlebar.style.cursor = 'grab'; }
    });
    window.addEventListener('resize', clampRouterModalToViewport);

    // Close
    document.getElementById('wtr-close-btn').addEventListener('click', closeModal);
    document.getElementById('wtr-help-btn').addEventListener('click', showRouterHelp);
    document.getElementById('wtr-help-close').addEventListener('click', hideRouterHelp);
    document.getElementById('wtr-help-overlay').addEventListener('click', e => {
        // close when the user clicks the dim backdrop, not the card itself
        if (e.target === e.currentTarget) hideRouterHelp();
    });
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        const overlay = document.getElementById('wtr-help-overlay');
        if (overlay && overlay.style.display !== 'none') { hideRouterHelp(); return; }
        const modalEl = document.getElementById(MODAL_ID);
        if (modalEl && modalEl.style.display !== 'none') closeModal();
    });
    document.getElementById('wtr-toggle-log').addEventListener('click', e => {
        const panel = document.getElementById('wtr-log-panel');
        const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
        if (!panel) return;
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'flex' : 'none';
        btn.textContent = isHidden ? 'Hide Log' : 'Show Log';
        rebuildLogPanel();
        clampRouterModalToViewport();
    });

    document.getElementById('wtr-enable').addEventListener('change', e => {
        settings.enabled = /** @type {HTMLInputElement} */ (e.target).checked;
        saveSettingsDebounced();
        if (!settings.enabled && originalCustomModel !== null) {
            SillyTavern.getContext().chatCompletionSettings.custom_model = originalCustomModel;
            originalCustomModel = null;
        }
        routerEvent(settings.enabled ? 'Router enabled' : 'Router disabled', 'info');
        updateStatusBar();
    });

    // debug toggle
    document.getElementById('wtr-debug').addEventListener('change', e => {
        settings.debug = /** @type {HTMLInputElement} */ (e.target).checked;
        saveSettingsDebounced();
    });

    // timeout
    document.getElementById('wtr-timeout').addEventListener('change', e => {
        const v = parseFloat(/** @type {HTMLInputElement} */ (e.target).value);
        if (!isNaN(v) && v >= 1) { settings.timeoutMs = Math.round(v * 1000); saveSettingsDebounced(); }
    });

    document.getElementById('wtr-routing-mode').addEventListener('change', e => {
        settings.routingMode = /** @type {HTMLSelectElement} */ (e.target).value === 'priority' ? 'priority' : 'random';
        saveSettingsDebounced();
        routerEvent(`Routing mode set to ${settings.routingMode === 'priority' ? 'Priority Failover' : 'Weighted Random'}`, 'info');
        renderPoolList();
    });

    // cooldown
    document.getElementById('wtr-cooldown').addEventListener('change', e => {
        const v = parseFloat(/** @type {HTMLInputElement} */ (e.target).value);
        if (!isNaN(v) && v >= 0.1) { settings.cooldownMs = Math.round(v * 60000); saveSettingsDebounced(); }
    });

    // clear all cooldowns
    document.getElementById('wtr-clear-all-cd').addEventListener('click', () => {
        clearAllCooldowns('All cooldowns cleared manually');
    });

    document.getElementById('wtr-profile-select').addEventListener('change', () => {
        populateModelDropdown();
    });

    // add from dropdown
    document.getElementById('wtr-add-from-select').addEventListener('click', () => {
        const select = /** @type {HTMLSelectElement} */ (document.getElementById('wtr-model-select'));
        const profile = /** @type {HTMLSelectElement} */ (document.getElementById('wtr-profile-select')).value;
        const val = select.value.trim();
        if (val && addModelToPool(val, profile)) {
            select.value = '';
            renderPoolList(); updateStatusBar(); populateModelDropdown();
        }
    });

    // fill current model
    document.getElementById('wtr-fill-current').addEventListener('click', () => {
        const current = SillyTavern.getContext().chatCompletionSettings?.custom_model || '';
        /** @type {HTMLInputElement} */ (document.getElementById('wtr-add-input')).value = current;
    });

    // add model manually
    const doAdd = () => {
        const input = /** @type {HTMLInputElement} */ (document.getElementById('wtr-add-input'));
        const profile = /** @type {HTMLSelectElement} */ (document.getElementById('wtr-profile-select')).value;
        if (input.value.trim() && addModelToPool(input.value.trim(), profile)) {
            input.value = ''; renderPoolList(); updateStatusBar(); populateModelDropdown();
        }
    };
    document.getElementById('wtr-add-btn').addEventListener('click', doAdd);
    document.getElementById('wtr-add-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });

    // clear log
    document.getElementById('wtr-log-clear').addEventListener('click', () => {
        clearEventLog();
        const p = document.getElementById('wtr-log-output');
        if (p) p.innerHTML = '';
    });

    // copy log (last 30 entries)
    document.getElementById('wtr-log-copy').addEventListener('click', async () => {
        const last30 = eventLog.slice(-30);
        const text = last30.map(e => `${e.ts}  ${e.msg}`).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            const btn = document.getElementById('wtr-log-copy');
            const orig = btn.textContent;
            btn.textContent = 'Copied!';
            btn.style.color = '#28c840';
            setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
        } catch (err) {
            console.error('[Weyland-Router] Copy failed:', err);
        }
    });

    populateProfileDropdown();
    populateModelDropdown();
    renderPoolList();
    rebuildLogPanel();
    updateStatusBar();
}

function clampRouterModalToViewport() {
    const modal = document.getElementById('wtr-modal');
    if (!modal) return;
    if (isMobileRouterLayout()) {
        modal.style.left = '0px';
        modal.style.top = '0px';
        return;
    }
    const W = modal.offsetWidth;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = modal.getBoundingClientRect();
    modal.style.left = Math.max(-W + 120, Math.min(vw - 120, rect.left)) + 'px';
    modal.style.top = Math.max(0, Math.min(vh - 80, rect.top)) + 'px';
}

function showRouterHelp() {
    const overlay = document.getElementById('wtr-help-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function hideRouterHelp() {
    const overlay = document.getElementById('wtr-help-overlay');
    if (overlay) overlay.style.display = 'none';
}

function openModal() {
    injectModal();
    document.getElementById(MODAL_ID).style.display = 'block';
    clampRouterModalToViewport();
    populateProfileDropdown();
    populateModelDropdown();
    renderPoolList();
    rebuildLogPanel();
    updateStatusBar();
}

function closeModal() {
    const el = document.getElementById(MODAL_ID);
    if (el) el.style.display = 'none';
}

// =========================
// === TOOLBAR BUTTON ======
// =========================

function injectToolbarButton() {
    let attempts = 0;
    const uiCheckInterval = setInterval(() => {
        attempts++;
        const connectionDeleteButton = document.getElementById('delete_connection_profile');
        const oldRosterTarget = document.getElementById('external_import_button');
        const target = connectionDeleteButton || (attempts >= 20 ? oldRosterTarget : null);
        if (target) {
            clearInterval(uiCheckInterval);
            if (!$('#wtr-toolbar-btn').length) {
                const btn = document.createElement('div');
                btn.id = 'wtr-toolbar-btn';
                btn.className = connectionDeleteButton ? 'menu_button fa-solid fa-shuffle' : 'fa-solid fa-shuffle interactable';
                btn.title = 'Open Weyland Router';
                btn.style.cssText = 'color:var(--rb-accent,#b4263a);cursor:pointer;';
                btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openModal(); });
                if (connectionDeleteButton) {
                    connectionDeleteButton.before(btn);
                } else {
                    oldRosterTarget.after(btn);
                }
            }
        }
    }, 500);
    setTimeout(() => clearInterval(uiCheckInterval), 10000);
}

// Cooldown refresh — ticks the displayed countdown for both regular and extended.
setInterval(() => {
    const now = Date.now();
    const hasCooldown = settings?.pool?.some(m => getEffectiveCooldownUntil(m) > now);
    if (hasCooldown && document.getElementById(MODAL_ID)?.style.display !== 'none') {
        refreshCooldownDisplays();
        updateStatusBar();
    }
}, 1000);

// =========================
// ========= BOOT ==========
// =========================

// @ts-ignore
jQuery(async () => {
    console.debug(`[${WT_ROUTER_MODULE_NAME}] Initializing v${extensionVersion}`);
    getSettings();
    loadEventLog();

    injectModal();
    injectToolbarButton();

    eventSource.on(event_types.GENERATION_STARTED, onGenerationStarted);
    eventSource.on(event_types.GENERATION_ENDED, onGenerationEnded);
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceivedForRouter);
    if (event_types.GENERATION_STOPPED) eventSource.on(event_types.GENERATION_STOPPED, onGenerationStopped);

    $(document).on('pointerdown', '#mes_stop, .mes_stop', () => {
        manualStopRequestedAt = Date.now();
    });

    installToastrSuppression();
    setupUnhandledRejectionListener();

    routerLog("Init complete");
});
