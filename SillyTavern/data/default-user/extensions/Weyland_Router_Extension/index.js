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
 * @property {number | null} cooldownUntil
 */

/**
 * @typedef {Object} WeylandRouterSettings
 * @property {boolean} enabled
 * @property {boolean} debug
 * @property {ModelEntry[]} pool
 * @property {number} timeoutMs
 * @property {number} cooldownMs
 * @property {boolean} suppressApiErrors
 */

/** @type {WeylandRouterSettings} */
const defaultSettings = {
    enabled: false,
    debug: false,
    pool: [],
    timeoutMs: 60000,
    cooldownMs: 10 * 60 * 1000,
    suppressApiErrors: true
};

/** @type {WeylandRouterSettings} */
let settings = undefined;

// Runtime state
let currentlySelectedModel = null;
let attemptedThisTurn = new Set();
let generationTimeoutId = null;
let isRetrying = false;
let originalCustomModel = null;
let originalToastrError = null;
let currentGenId = 0;       // increments each time we roll a model
let watchingGenId = null;   // the genId we expect onGenerationEnded to validate against
let currentAttemptSnapshot = null;

// =========================
// ======== LOGGING ========
// =========================

const MAX_LOG_LINES = 200;
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

function rebuildLogPanel() {
    const panel = document.getElementById('wtr-log-output');
    if (!panel) return;
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
    if (settings.cooldownMs === 5 * 60 * 1000) settings.cooldownMs = defaultSettings.cooldownMs;
    settings.pool.forEach(model => {
        if (model.profileName === undefined) model.profileName = '';
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

function getCurrentPresetName() {
    return getCurrentConnectionProfileName();
}

function getPresetNames() {
    return getConnectionProfiles().map(profile => profile.name).sort((a, b) => a.localeCompare(b));
}

function getPresetByName(profileName) {
    return getConnectionProfiles().find(profile => profile.name === profileName) || null;
}

function addModelToPool(modelId, profileName = getCurrentPresetName()) {
    modelId = modelId.trim();
    if (!modelId) return false;
    const route = { id: modelId, profileName };
    if (settings.pool.find(m => getRouteKey(m) === getRouteKey(route))) {
        // @ts-ignore
        toastr.warning(`Route "${getModelLabel(route)}" is already in the pool`);
        return false;
    }
    settings.pool.push({ id: modelId, profileName, weight: 0, cooldownUntil: null });
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

// =========================
// ===== SELECTION =========
// =========================

function rollModel() {
    const now = Date.now();
    const available = settings.pool.filter(m =>
        (!m.cooldownUntil || m.cooldownUntil < now) && !attemptedThisTurn.has(getRouteKey(m)) && m.weight > 0
    );
    if (available.length === 0) return null;
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

// =========================
// ===== INTERCEPTOR =======
// =========================

// @ts-ignore
globalThis.weylandRouterInterceptor = async function (chat, contextSize, abort, type) {
    if (!settings) getSettings();
    if (!settings.enabled) return;
    if (settings.pool.length === 0) return;
    if (type === 'quiet' || type === 'impersonate') { routerLog(`Skipping: ${type}`); return; }

    if (!isRetrying) {
        attemptedThisTurn.clear();
        routerEvent('Generation started - rolling model die', 'info');
    } else {
        routerEvent('Rerolling after failure...', 'info');
    }

    const selected = rollModel();
    if (!selected) {
        // @ts-ignore
        toastr.error("[Weyland-Router] All models exhausted or on cooldown");
        routerEvent('All models exhausted or on cooldown - generation aborted', 'error');
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
];

function looksLikeApiError(message) {
    if (!currentlySelectedModel) return false;
    const msg = String(message || '').toLowerCase();
    if (!msg) return false;
    if (msg.includes(currentlySelectedModel.id.toLowerCase())) return true;
    for (const pat of API_ERROR_PATTERNS) { if (msg.includes(pat.toLowerCase())) return true; }
    return false;
}

function installToastrSuppression() {
    // @ts-ignore
    if (typeof toastr === 'undefined' || originalToastrError !== null) return;
    // @ts-ignore
    originalToastrError = toastr.error.bind(toastr);
    // @ts-ignore
    toastr.error = function (message, title, options) {
        if (settings?.enabled && currentlySelectedModel) {
            const isApiError = looksLikeApiError(message) || looksLikeApiError(title) || String(title || '').toLowerCase().includes('chat completion');
            if (isApiError) {
                const failed = currentlySelectedModel;
                routerLog(`Intercepted API error toast for ${failed.id}: ${title} ${message}`);
                markModelFailed(failed, 'api-error');
                routerEvent(`${failed.id} - API error: ${String(message || title || '').substring(0, 80)}`, 'error');
                clearGenerationTimeout();
                currentlySelectedModel = null;
                currentAttemptSnapshot = null;
                // attempt reroll on next tick
                setTimeout(() => triggerRetry(), 200);
                return; // always suppress - no toast shown
            }
        }
        return originalToastrError(message, title, options);
    };
    routerLog("Toastr patched");
}

function setupUnhandledRejectionListener() {
    window.addEventListener('unhandledrejection', (event) => {
        if (!settings?.enabled || !currentlySelectedModel) return;
        const reasonStr = String(event.reason?.message || event.reason || '');
        if (looksLikeApiError(reasonStr)) {
            const failed = currentlySelectedModel;
            routerLog(`Unhandled rejection for ${failed.id}: ${reasonStr}`);
            markModelFailed(failed, 'unhandled-rejection');
            routerEvent(`${failed.id} - request failed: ${reasonStr.substring(0, 80)}`, 'error');
            clearGenerationTimeout();
            currentlySelectedModel = null;
            currentAttemptSnapshot = null;
            setTimeout(() => triggerRetry(), 200);
        }
    });
}

// =========================
// === FAILURE HANDLING ====
// =========================

function clearGenerationTimeout() {
    if (generationTimeoutId !== null) { clearTimeout(generationTimeoutId); generationTimeoutId = null; }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    generationTimeoutId = setTimeout(async () => {
        if (!currentlySelectedModel || watchingGenId !== genId) return;
        routerLog(`Timeout for: ${model.id}`);
        markModelFailed(model, 'timeout');
        currentlySelectedModel = null;
        watchingGenId = null;
        currentAttemptSnapshot = null;
        await stopActiveGenerationForRetry();
        setTimeout(() => triggerRetry(), 200);
    }, settings.timeoutMs);
}

function markModelFailed(model, reason) {
    model.cooldownUntil = Date.now() + settings.cooldownMs;
    const label = { 'timeout': `no response after ${Math.round(settings.timeoutMs/1000)}s`, 'blank': 'blank response', 'api-error': 'API error', 'unhandled-rejection': 'request failed', 'no-message': 'no message produced', 'stale-output': 'no new output detected' }[reason] || reason;
    routerLog(`"${getModelLabel(model)}" failed (${label})`);
    routerEvent(`${getModelLabel(model)} failed (${label}) - cooldown until ${new Date(model.cooldownUntil).toLocaleTimeString()}`, 'warn');
    saveSettingsDebounced();
    renderPoolList();
    updateStatusBar();
}

async function triggerRetry() {
    const ctx = SillyTavern.getContext();
    isRetrying = true;
    try {
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
        // Use /trigger to generate the next message fresh
        if (ctx.executeSlashCommandsWithOptions) {
            await ctx.executeSlashCommandsWithOptions('/trigger', { showOutput: false });
        }
    } catch (err) {
        console.error(`[${WT_ROUTER_MODULE_NAME}] Retry failed:`, err);
    } finally {
        setTimeout(() => { isRetrying = false; }, 100);
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
    // event (e.g. from a retry) can't re-enter this logic for the same slot
    const myGenId = watchingGenId;
    watchingGenId = null;

    const ctx = SillyTavern.getContext();
    const lastIdx = ctx.chat.length - 1;
    const msg = ctx.chat[lastIdx];
    routerLog(`Gen ended [genId=${myGenId}]. lastIdx=${lastIdx}, isUser=${msg?.is_user}, mesLen=${msg?.mes?.length ?? 'n/a'}`);

    // If the last message is from the user, nothing was generated - clean up silently
    if (!msg || msg.is_user) { currentlySelectedModel = null; attemptedThisTurn.clear(); currentAttemptSnapshot = null; return; }

    const rawContent = getAttemptContent(msg, lastIdx, currentAttemptSnapshot);
    const content = (rawContent || '').trim();

    if (rawContent === null) {
        const failed = currentlySelectedModel;
        routerLog(`Stale output detected for ${failed.id}; last message did not change after this roll`);
        markModelFailed(failed, 'stale-output');
        currentlySelectedModel = null;
        currentAttemptSnapshot = null;
        setTimeout(() => triggerRetry(), 200);
        return;
    }

    // KEY FIX: if this message was already tagged by a previous successful generation,
    // we are looking at stale content from before our retry. Don't count it as our success.
    if (msg.extra?.weyland_router_model && (msg.extra.weyland_router_model !== currentlySelectedModel.id || (msg.extra.weyland_router_profile || '') !== (currentlySelectedModel.profileName || ''))) {
        routerLog(`Stale message detected (tagged by ${msg.extra.weyland_router_model} / ${msg.extra.weyland_router_profile || 'current'}, we are ${getModelLabel(currentlySelectedModel)}) - ignoring`);
        currentlySelectedModel = null;
        currentAttemptSnapshot = null;
        return;
    }

    if (content === '') {
        const failed = currentlySelectedModel;
        if (String(msg.extra?.reasoning || '').trim()) {
            routerEvent(`${failed.id} produced reasoning but no visible output`, 'warn');
        }
        markModelFailed(failed, 'blank');
        currentlySelectedModel = null;
        currentAttemptSnapshot = null;
        setTimeout(() => triggerRetry(), 200);
        return;
    }

    // Success
    if (!msg.extra) msg.extra = {};
    msg.extra.weyland_router_model = currentlySelectedModel.id;
    msg.extra.weyland_router_profile = currentlySelectedModel.profileName || '';
    routerEvent(`${getModelLabel(currentlySelectedModel)} succeeded - awaiting next input`, 'success');
    currentlySelectedModel = null; attemptedThisTurn.clear(); currentAttemptSnapshot = null;
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
    if (!isRetrying) {
        if (currentlySelectedModel) routerEvent(`Generation stopped by user - ${getModelLabel(currentlySelectedModel)} not penalized`, 'info');
        currentlySelectedModel = null; attemptedThisTurn.clear(); currentAttemptSnapshot = null;
    }
}

// =========================
// ========== UI ===========
// =========================

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function buildPoolHtml() {
    if (!settings.pool || settings.pool.length === 0) {
        return `<div class="wtr-empty">No models in pool.<br>Add one above to get started.</div>`;
    }
    const now = Date.now();
    return settings.pool.map(model => {
        const routeKey = getRouteKey(model);
        const label = getModelLabel(model);
        const onCooldown = model.cooldownUntil && model.cooldownUntil > now;
        const secondsLeft = onCooldown ? Math.ceil((model.cooldownUntil - now) / 1000) : 0;
        const dot = onCooldown
            ? `<span class="wtr-dot wtr-dot-cd" title="On cooldown">CD ${secondsLeft}s</span>`
            : `<span class="wtr-dot wtr-dot-ok" title="Ready">OK</span>`;
        return `<div class="wtr-model-row" data-model="${escapeHtml(routeKey)}">
            <div class="wtr-model-status">${dot}</div>
            <div class="wtr-model-name" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
            <input class="wtr-weight-input" type="number" min="0" max="100" step="0.1" value="${model.weight.toFixed(1)}" data-model="${escapeHtml(routeKey)}">
            <span class="wtr-pct">%</span>
            <button class="wtr-btn-icon wtr-clear-cd" data-model="${escapeHtml(routeKey)}" title="Clear cooldown" ${onCooldown ? '' : 'disabled'}>R</button>
            <button class="wtr-btn-icon wtr-remove" data-model="${escapeHtml(routeKey)}" title="Remove">x</button>
        </div>`;
    }).join('');
}

function renderPoolList() {
    const el = document.getElementById('wtr-pool-list');
    if (!el) return;
    el.innerHTML = buildPoolHtml();
    // bind events
    el.querySelectorAll('.wtr-weight-input').forEach(inp => {
        inp.addEventListener('change', e => {
            const t = /** @type {HTMLInputElement} */ (e.currentTarget);
            const v = parseFloat(t.value);
            if (!isNaN(v)) { setModelWeight(t.getAttribute('data-model'), v); renderPoolList(); }
        });
    });
    el.querySelectorAll('.wtr-remove').forEach(btn => {
        btn.addEventListener('click', e => {
            removeModelFromPool(/** @type {HTMLElement} */ (e.currentTarget).getAttribute('data-model'));
            renderPoolList(); updateStatusBar();
        });
    });
    el.querySelectorAll('.wtr-clear-cd').forEach(btn => {
        btn.addEventListener('click', e => {
            const m = settings.pool.find(x => getRouteKey(x) === /** @type {HTMLElement} */ (e.currentTarget).getAttribute('data-model'));
            if (m) { m.cooldownUntil = null; saveSettingsDebounced(); renderPoolList(); updateStatusBar(); }
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
        const onCooldown = model.cooldownUntil && model.cooldownUntil > now;
        const secondsLeft = onCooldown ? Math.ceil((model.cooldownUntil - now) / 1000) : 0;
        if (status) {
            status.innerHTML = onCooldown
                ? `<span class="wtr-dot wtr-dot-cd" title="On cooldown">CD ${secondsLeft}s</span>`
                : `<span class="wtr-dot wtr-dot-ok" title="Ready">OK</span>`;
        }
        if (clearBtn) clearBtn.toggleAttribute('disabled', !onCooldown);
    });
}

function updateStatusBar() {
    const now = Date.now();
    const available = settings.pool.filter(m => !m.cooldownUntil || m.cooldownUntil < now).length;
    const total = settings.pool.length;

    const pill = document.getElementById('wtr-status-pill');
    if (pill) {
        const isActive = settings.enabled && total > 0;
        pill.textContent = settings.enabled ? (total === 0 ? 'NO MODELS' : `${available}/${total} READY`) : 'DISABLED';
        pill.className = 'wtr-status-pill ' + (settings.enabled && available > 0 ? 'wtr-pill-active' : settings.enabled ? 'wtr-pill-warn' : 'wtr-pill-off');
    }

    const routingEl = document.getElementById('wtr-routing-model');
    if (routingEl) {
        routingEl.textContent = currentlySelectedModel ? getModelLabel(currentlySelectedModel) : '-';
        routingEl.style.color = currentlySelectedModel ? '#b4263a' : '#555';
    }
}

// =========================
// ==== MODAL WINDOW =======
// =========================

const MODAL_ID = 'wtr-modal-overlay';

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
          <label title="How long Router waits before deciding the selected model is stuck and trying another route." style="color:#888;font-size:11px;display:flex;align-items:center;gap:5px;">
            Timeout <input id="wtr-timeout" title="Seconds to wait before failing over to another model." type="number" min="1" max="300" value="${settings.timeoutMs/1000}" class="wtr-num-input"> s
          </label>
          <label title="How long a failed model is skipped before Router allows it to be rolled again." style="color:#888;font-size:11px;display:flex;align-items:center;gap:5px;">
            Cooldown <input id="wtr-cooldown" title="Minutes a failed model stays out of rotation." type="number" min="0.1" max="60" step="0.1" value="${(settings.cooldownMs/60000).toFixed(1)}" class="wtr-num-input"> min
          </label>
          <button id="wtr-clear-all-cd" class="wtr-btn-sm" title="Clear every model cooldown immediately.">Reset CDs</button>
        </div>

        <div title="The model route currently being attempted." style="padding:6px 10px;background:rgba(180,38,58,0.07);border:1px solid rgba(180,38,58,0.15);border-radius:6px;display:flex;align-items:center;gap:8px;">
          <span style="color:#555;font-size:10px;text-transform:uppercase;letter-spacing:1px;white-space:nowrap;">Routing</span>
          <span id="wtr-routing-model" style="font-size:11px;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">-</span>
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
        <div class="wtr-pool-header" style="display:grid;grid-template-columns:42px minmax(0,1fr) 88px 20px 32px 32px;gap:8px;padding:0 2px;color:#444;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(180,38,58,0.1);padding-bottom:5px;">
          <div></div><div>Model Route</div><div title="The percentage chance this route has to be selected." style="text-align:right;">Pull Chance</div><div></div><div></div><div></div>
        </div>

        <div id="wtr-pool-list" style="display:flex;flex-direction:column;gap:4px;flex:1;overflow-y:auto;min-height:60px;"></div>

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

function collectAvailableModels(profileName = getCurrentPresetName()) {
    const models = new Set();
    const add = value => {
        const id = String(value || '').trim();
        if (id && id !== 'none' && id !== 'None') models.add(id);
    };
    const addModelRecord = record => add(typeof record === 'string' ? record : (record?.id || record?.name || ''));

    const preset = getPresetByName(profileName);
    add(preset?.model);

    const isCurrentProfile = !profileName || profileName === getCurrentPresetName();
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
    const currentValue = select.value || getCurrentPresetName();
    const names = getPresetNames();
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
        const preset = getPresetByName(name);
        opt.value = name;
        opt.textContent = preset?.api ? `${name} (${preset.api})` : name;
        select.appendChild(opt);
    });

    select.value = names.includes(currentValue) ? currentValue : (names.includes(getCurrentPresetName()) ? getCurrentPresetName() : names[0]);
}

function populateModelDropdown() {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById('wtr-model-select'));
    if (!select) return;
    const profileName = /** @type {HTMLSelectElement | null} */ (document.getElementById('wtr-profile-select'))?.value || getCurrentPresetName();
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

    // Dragging is desktop-only. On mobile the modal is pinned into the viewport
    // so users always have the close/help buttons available.
    const titlebar = document.getElementById('wtr-titlebar');
    const modal = document.getElementById('wtr-modal');
    let dragState = null;
    const shouldSkipDrag = target => Boolean(/** @type {HTMLElement} */ (target).closest('#wtr-log-panel, button, input, select, textarea, a, label'));
    const isMobileRouterLayout = () => window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
    const clampModal = () => {
        if (isMobileRouterLayout()) {
            dragState = null;
            modal.style.left = '0px';
            modal.style.top = '0px';
            titlebar.style.cursor = 'default';
            return;
        }
        const W = modal.offsetWidth;
        const H = modal.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rect = modal.getBoundingClientRect();
        modal.style.left = Math.max(-W + 120, Math.min(vw - 120, rect.left)) + 'px';
        modal.style.top = Math.max(0, Math.min(vh - 80, rect.top)) + 'px';
    };
    modal.addEventListener('mousedown', e => {
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
        const H = modal.offsetHeight;
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
    window.addEventListener('resize', clampModal);

    // Close
    document.getElementById('wtr-close-btn').addEventListener('click', closeModal);
    document.getElementById('wtr-help-btn').addEventListener('click', showRouterHelp);
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

    // cooldown
    document.getElementById('wtr-cooldown').addEventListener('change', e => {
        const v = parseFloat(/** @type {HTMLInputElement} */ (e.target).value);
        if (!isNaN(v) && v >= 0.1) { settings.cooldownMs = Math.round(v * 60000); saveSettingsDebounced(); }
    });

    // clear all cooldowns
    document.getElementById('wtr-clear-all-cd').addEventListener('click', () => {
        settings.pool.forEach(m => m.cooldownUntil = null);
        saveSettingsDebounced(); renderPoolList(); updateStatusBar();
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
        eventLog.length = 0;
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
    if (window.matchMedia('(max-width: 700px), (pointer: coarse)').matches) {
        modal.style.left = '0px';
        modal.style.top = '0px';
        return;
    }
    const W = modal.offsetWidth;
    const H = modal.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = modal.getBoundingClientRect();
    modal.style.left = Math.max(-W + 120, Math.min(vw - 120, rect.left)) + 'px';
    modal.style.top = Math.max(0, Math.min(vh - 80, rect.top)) + 'px';
}

function showRouterHelp() {
    // This copy is intentionally written in Kressa's support voice:
    // warm, plain-language, and non-scary for users who freeze at API terminology.
    window.alert([
        'Umm, hi! This is Weyland Router.',
        '',
        'It lets you build a little pool of models and providers, then automatically picks one whenever you generate.',
        'You do not need to babysit it once it is set up.',
        '',
        'Connection Profile: which saved provider/API setup to use.',
        'Model from Profile: which model from that provider to add.',
        'Pull Chance: how likely this route is to be picked compared to the others.',
        '',
        'If a route gets stuck, errors, or returns nothing useful, Router puts it on cooldown and rolls another route.',
        'Timeout is how long Router waits before deciding a route is stuck.',
        'Cooldown is how long a failed route sits out before it can be tried again.',
        '',
        'Show Log opens a small report window so you can see what happened and tell Lucky if something acts weird.',
        '',
        'Basically: mix models, mix providers, let the router handle bad rolls. Tiny chaos machine, supervised.'
    ].join('\n'));
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

// Cooldown refresh
setInterval(() => {
    const now = Date.now();
    const hasCooldown = settings?.pool?.some(m => m.cooldownUntil && m.cooldownUntil > now);
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

    injectToolbarButton();

    eventSource.on(event_types.GENERATION_STARTED, onGenerationStarted);
    eventSource.on(event_types.GENERATION_ENDED, onGenerationEnded);
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceivedForRouter);
    if (event_types.GENERATION_STOPPED) eventSource.on(event_types.GENERATION_STOPPED, onGenerationStopped);

    installToastrSuppression();
    setupUnhandledRejectionListener();

    routerLog("Init complete");
});
