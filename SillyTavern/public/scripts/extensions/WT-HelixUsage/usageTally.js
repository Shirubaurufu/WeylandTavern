// usageTally.js — the "Estimated Hour Breakdown" bookkeeping (pure, no DOM, no network).
//
// We can't get a per-hour usage history from the provider without paging the whole records
// list, so instead we reconstruct it locally from the authoritative per-key `used` count the
// tracker already fetches. Each observation, we reconcile our local tally to that count. The
// tally is a plain list of timestamps (one per request we've attributed), kept in a rolling
// 24h window. Stored server-side in extensionSettings so it's shared across a user's devices.
//
// Design notes:
// - No backfill: the first observation only snapshots `used` as the baseline; it does not
//   invent tallies for history it never saw. Observations remain estimates, not a request log.
// - Age-outs are handled by our own clock: any tally older than 24h is dropped.
// - `used` is a ROLLING 24h count (the proxy asks HelixMind for requests since now-24h), so it
//   goes down every time an old request ages out. New requests between two observations are
//   therefore (increase in used) + (tallies we just aged out): a request sent while another
//   aged out leaves `used` flat and would otherwise be invisible.
// - Hard invariant: never more tallies than `used`. The excess is trimmed, oldest first.
//
// History (2026-09-24): the first version counted increases + expiries with no cap, so any
// mismatch (the tracker's key drifting between two keys, clock skew at the 24h edge) invented
// requests that never went away: "1AM - 57" on a 50-message key, climbing forever. The
// 2026-09-23 rewrite stopped that by trusting only increases and wiping history on any
// decrease, but on a rolling count every age-out is a decrease, so a daily user's history was
// wiped and then never rebuilt ("Return time unknown for 49 messages", permanently). This
// version restores the expiry accounting and makes the cap do the protecting instead.

export const HOUR_MS = 60 * 60 * 1000;
export const WINDOW_MS = 24 * HOUR_MS;
// Unchanged on purpose: stores written by the 2026-09-23 version carry the same fields and
// stay valid, so bumping this would wipe everyone's history a second time for nothing.
export const TALLY_VERSION = 2;

// If `used` leaps by more than this in a single observation (e.g. the user switched to a
// different key), we treat it as a re-baseline rather than spraying a huge fake spike into
// the current hour.
export const REBASELINE_JUMP = 200;

// How far the surviving tallies may exceed `used` before the history is treated as corrupt and
// wiped rather than trimmed. A small excess is normal: HelixMind's clock and the browser's
// clock disagree by seconds, so a request can age out on one side a moment before the other.
// A large one (178 tallies against a used of 11) means the history itself is wrong.
export const CORRUPT_EXCESS = 5;

/**
 * @typedef {{ version: number, lastUsed: number|null, tallies: number[] }} TallyStore
 */

/** A fresh, empty store. */
export function emptyTally() {
    return { version: TALLY_VERSION, lastUsed: null, tallies: [] };
}

/**
 * Reconcile the local tally to the authoritative server `used` count.
 * @param {TallyStore} store previous store (safe to pass a partial/loaded object)
 * @param {number} serverUsed the key's current used-requests count
 * @param {number} [now] epoch ms
 * @returns {TallyStore} the new store (never mutates the input)
 */
export function reconcileTally(store, serverUsed, now = Date.now()) {
    const compatible = store?.version === TALLY_VERSION;
    const lastUsed = compatible && Number.isSafeInteger(store.lastUsed) && store.lastUsed >= 0 ? store.lastUsed : null;
    const windowStart = now - WINDOW_MS;

    const prior = compatible && Array.isArray(store?.tallies) ? store.tallies : [];
    const tallies = prior.filter(ts => Number.isFinite(ts) && ts > windowStart && ts <= now);
    const expired = prior.length - tallies.length;

    if (!Number.isSafeInteger(serverUsed) || serverUsed < 0) {
        // Do not persist or render an estimate based on an unavailable count.
        return { ...emptyTally(), changed: false };
    }

    // `changed` lets callers skip persisting a no-op reconcile. That matters because saving
    // re-emits SETTINGS_UPDATED, which re-triggers a refresh — so saving on every steady-state
    // refresh would loop. A changed count or any age-out is worth persisting; nothing else is.
    const changed = !compatible || serverUsed !== lastUsed || expired > 0;

    if (lastUsed === null) {
        // First observation: baseline only, no backfilled tallies.
        return { version: TALLY_VERSION, lastUsed: serverUsed, tallies: [], changed: true };
    }

    // Grossly more surviving timestamps than requests: the history is wrong, not just skewed.
    if (tallies.length - serverUsed > CORRUPT_EXCESS) {
        return { version: TALLY_VERSION, lastUsed: serverUsed, tallies: [], changed: true };
    }

    // A drop in `used` is NOT an error on a rolling window (an old request aged out, whether we
    // had a timestamp for it or not). Adding back our own expiries recovers a request that was
    // sent while another aged out, which leaves `used` unchanged.
    const newUses = (serverUsed - lastUsed) + expired;

    if (newUses > REBASELINE_JUMP) {
        // Implausible single-step jump (likely a key switch): re-baseline, don't spike.
        return { version: TALLY_VERSION, lastUsed: serverUsed, tallies: [], changed: true };
    }
    for (let i = 0; i < newUses; i++) {
        tallies.push(now);
    }
    // The cap. Whatever the cause (a request aging out on HelixMind's clock a moment before
    // ours, a lagging count), we never show more returning than were actually used, and the
    // oldest are the likeliest to already be gone upstream.
    const trimmed = Math.max(0, tallies.length - serverUsed);
    if (trimmed) tallies.sort((a, b) => a - b).splice(0, trimmed);
    return { version: TALLY_VERSION, lastUsed: serverUsed, tallies, changed: changed || trimmed > 0 };
}

/**
 * Group the in-window tallies into per-hour buckets, oldest first.
 * @param {number[]} tallies
 * @param {number} [now]
 * @returns {{ hourStart: number, count: number }[]}
 */
export function bucketByHour(tallies, now = Date.now()) {
    const windowStart = now - WINDOW_MS;
    const counts = new Map();
    for (const ts of tallies) {
        if (!Number.isFinite(ts) || ts <= windowStart || ts > now) continue;
        const hourStart = Math.floor(ts / HOUR_MS) * HOUR_MS;
        counts.set(hourStart, (counts.get(hourStart) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([hourStart, count]) => ({ hourStart, count }))
        .sort((a, b) => a.hourStart - b.hourStart);
}

/**
 * Oldest in-window tally, in ms, or null. Its + 24h is when the next slot frees up — the
 * "next message in" countdown at cap, with no records call.
 * @param {number[]} tallies
 * @param {number} [now]
 * @returns {number|null}
 */
export function oldestTallyMs(tallies, now = Date.now()) {
    const windowStart = now - WINDOW_MS;
    let oldest = null;
    for (const ts of tallies) {
        if (!Number.isFinite(ts) || ts <= windowStart || ts > now) continue;
        if (oldest === null || ts < oldest) oldest = ts;
    }
    return oldest;
}
