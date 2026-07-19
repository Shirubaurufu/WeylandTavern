// lib/helixQuota.js
//
// Remaining-daily-messages lookup for the meta battery mode, using the same HelixMind quota
// endpoint and HMKey global variable as WT-HelixUsage's tracker. Results are cached for a
// couple of minutes — the status bar re-renders every 30s and must never turn that cadence
// into API hammering.

export const QUOTA_ENDPOINT = 'https://helix.kenshere.com/v1/usage/quota';
export const QUOTA_CACHE_MS = 2 * 60_000;
export const QUOTA_FETCH_TIMEOUT_MS = 8_000;

let cachedRemaining = null;
let cachedAt = 0;
let cachedKey = null;
let inFlight = null; // { key, promise }

/** The HelixMind API key WT-HelixUsage stores as a global variable. */
export function getHelixKey(context) {
    const key = context?.variables?.global?.get?.('HMKey');
    return (typeof key === 'string' && key.trim() !== '') ? key.trim() : null;
}

/**
 * @param {string} apiKey
 * @param {typeof fetch} [fetchFn] injectable for tests
 * @returns {Promise<number|null>} remaining daily messages, or null when unknowable
 *   (request failed, or the account has no finite limit)
 */
export async function fetchRemainingMessages(apiKey, fetchFn = fetch, { timeoutMs = QUOTA_FETCH_TIMEOUT_MS } = {}) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const response = await fetchFn(QUOTA_ENDPOINT, {
            headers: { Authorization: `Bearer ${apiKey}` },
            ...(controller ? { signal: controller.signal } : {}),
        });
        if (!response.ok) return null;
        const quota = (await response.json())?.global_rpd;
        if (typeof quota?.limit !== 'number' || !Number.isFinite(quota.limit)) return null;
        return quota.limit - (quota.used ?? 0);
    } catch {
        return null;
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

/** The last fetched remaining-message count (may be stale up to QUOTA_CACHE_MS; null = unknown). */
export function getCachedRemaining() {
    return cachedRemaining;
}

/**
 * Throttled background refresh. Safe to call from every status-bar render: within the cache
 * window (or with a fetch already in flight, or no key set) it's a no-op. `onUpdate` fires
 * only when a fetch actually completes with a changed value — the caller re-renders then.
 * @param {object} context SillyTavern context (for the HMKey global)
 * @param {() => void} [onUpdate]
 */
export function refreshRemainingMessages(context, onUpdate, { fetchFn = fetch, now = Date.now } = {}) {
    const apiKey = getHelixKey(context);
    if (!apiKey) {
        cachedKey = null;
        cachedRemaining = null;
        cachedAt = 0;
        return;
    }
    if (apiKey !== cachedKey) {
        cachedKey = apiKey;
        cachedRemaining = null;
        cachedAt = 0;
    }
    if (inFlight?.key === apiKey || (cachedAt > 0 && (now() - cachedAt) < QUOTA_CACHE_MS)) return;

    const promise = fetchRemainingMessages(apiKey, fetchFn).then(remaining => {
        // Ignore a response for a key that was removed/replaced while this request was running.
        if (cachedKey !== apiKey) return;
        cachedAt = now();
        const changed = remaining !== cachedRemaining;
        cachedRemaining = remaining;
        if (changed) onUpdate?.();
    }).finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
    });
    inFlight = { key: apiKey, promise };
    return promise;
}

/** Reset module state; useful for deterministic tests and future account-switch hooks. */
export function resetQuotaCache() {
    cachedRemaining = null;
    cachedAt = 0;
    cachedKey = null;
    inFlight = null;
}
