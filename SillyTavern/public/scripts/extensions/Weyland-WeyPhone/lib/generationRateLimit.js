const MINUTE_MS = 60_000;
const MAX_EVENT_AGE_MS = 24 * 60 * MINUTE_MS;

export const GENERATION_RATE_LIMITS = Object.freeze({
    standard: Object.freeze({ key: 'standard', label: 'Standard', maxRequests: 2, windowMs: 15 * MINUTE_MS }),
    plus: Object.freeze({ key: 'plus', label: 'Paw Patrol Plus', maxRequests: 2, windowMs: 10 * MINUTE_MS }),
    platinum: Object.freeze({ key: 'platinum', label: 'Paw Patrol Platinum', maxRequests: 2, windowMs: 5 * MINUTE_MS }),
    // Display-only Platinum-window counter for testing. Admin generations are never blocked and
    // remaining may intentionally become negative so repeated successful outputs stay visible.
    admin: Object.freeze({ key: 'admin', label: 'Admin test counter', maxRequests: 2, windowMs: 5 * MINUTE_MS, enforced: false }),
});

function truthy(value) {
    return value === true || value === 'true';
}

export function generationRateTier(context) {
    const get = key => context?.variables?.global?.get?.(key);
    if (truthy(get('LuckyAdminKey'))) return 'admin';
    if (truthy(get('PPP1'))) return 'platinum';
    if (truthy(get('PP1'))) return 'plus';
    return 'standard';
}

export function normalizeGenerationRateLimitEvents(events, now = Date.now()) {
    if (!Array.isArray(events)) return [];
    const oldest = now - MAX_EVENT_AGE_MS;
    const seen = new Set();
    return events
        .filter(event => event && typeof event.id === 'string' && event.id
            && Number.isFinite(event.timestamp) && event.timestamp > oldest && event.timestamp <= now + MINUTE_MS)
        .sort((left, right) => left.timestamp - right.timestamp)
        .filter(event => {
            if (seen.has(event.id)) return false;
            seen.add(event.id);
            return true;
        })
        .map(event => ({ id: event.id, timestamp: event.timestamp }));
}

export function generationAllowance(events, tierKey, now = Date.now()) {
    const policy = GENERATION_RATE_LIMITS[tierKey] ?? GENERATION_RATE_LIMITS.standard;
    const active = normalizeGenerationRateLimitEvents(events, now)
        .filter(event => event.timestamp > now - policy.windowMs);
    const enforced = policy.enforced !== false;
    const allowed = !enforced || active.length < policy.maxRequests;
    const retryAt = allowed ? null : active[active.length - policy.maxRequests].timestamp + policy.windowMs;
    const nextRestoreAt = active.length ? active[0].timestamp + policy.windowMs : null;
    return {
        allowed,
        remaining: enforced ? Math.max(0, policy.maxRequests - active.length) : policy.maxRequests - active.length,
        enforced,
        retryAt,
        retryAfterMs: retryAt ? Math.max(0, retryAt - now) : 0,
        nextRestoreAt,
        nextRestoreAfterMs: nextRestoreAt ? Math.max(0, nextRestoreAt - now) : 0,
        ...policy,
    };
}

export function recordGenerationRequest(settings, now = Date.now(), id = null) {
    const eventId = id || globalThis.crypto?.randomUUID?.() || `${now}-${Math.random().toString(36).slice(2)}`;
    settings.generationRateLimitEvents = normalizeGenerationRateLimitEvents([
        ...(settings.generationRateLimitEvents ?? []),
        { id: eventId, timestamp: now },
    ], now);
    return eventId;
}

export function mergeGenerationRateLimitEvents(...eventLists) {
    return normalizeGenerationRateLimitEvents(eventLists.flat());
}

export function formatGenerationCooldown(milliseconds) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}
