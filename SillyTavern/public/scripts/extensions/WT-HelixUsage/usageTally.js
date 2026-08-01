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
//   invent tallies for history it never saw. The breakdown builds forward and is fully
//   accurate once 24h have elapsed (by then all pre-baseline usage has aged out anyway).
// - Age-outs are handled by our own clock: any tally older than 24h is dropped.
// - Reliable use+age-out: a new request that coincides with an age-out leaves the server's
//   `used` unchanged (net zero). We recover it by adding back the count of tallies we just
//   expired: newUses = (used - lastUsed) + expiredThisRound. So the age-out (which we removed
//   by timestamp) doesn't hide the new use.

export const HOUR_MS = 60 * 60 * 1000;
export const WINDOW_MS = 24 * HOUR_MS;

// If `used` leaps by more than this in a single observation (e.g. the user switched to a
// different key), we treat it as a re-baseline rather than spraying a huge fake spike into
// the current hour.
export const REBASELINE_JUMP = 200;

/**
 * @typedef {{ lastUsed: number|null, tallies: number[] }} TallyStore
 */

/** A fresh, empty store. */
export function emptyTally() {
    return { lastUsed: null, tallies: [] };
}

/**
 * Reconcile the local tally to the authoritative server `used` count.
 * @param {TallyStore} store previous store (safe to pass a partial/loaded object)
 * @param {number} serverUsed the key's current used-requests count
 * @param {number} [now] epoch ms
 * @returns {TallyStore} the new store (never mutates the input)
 */
export function reconcileTally(store, serverUsed, now = Date.now()) {
    const lastUsed = (store && typeof store.lastUsed === 'number') ? store.lastUsed : null;
    const windowStart = now - WINDOW_MS;

    const prior = Array.isArray(store?.tallies) ? store.tallies.filter(ts => Number.isFinite(ts)) : [];
    const tallies = prior.filter(ts => ts >= windowStart); // drop aged-out
    const expired = prior.length - tallies.length;

    if (!Number.isFinite(serverUsed) || serverUsed < 0) {
        // Nothing trustworthy to reconcile to; just keep the expired-pruned list.
        return { lastUsed, tallies, changed: expired > 0 };
    }

    // `changed` lets callers skip persisting a no-op reconcile. That matters because saving
    // re-emits SETTINGS_UPDATED, which re-triggers a refresh — so saving on every steady-state
    // refresh would loop. A changed count or any age-out is worth persisting; nothing else is.
    const changed = serverUsed !== lastUsed || expired > 0;

    if (lastUsed === null) {
        // First observation: baseline only, no backfilled tallies.
        return { lastUsed: serverUsed, tallies, changed };
    }

    const newUses = (serverUsed - lastUsed) + expired;

    if (newUses > REBASELINE_JUMP) {
        // Implausible single-step jump (likely a key switch) — re-baseline, don't spike.
        return { lastUsed: serverUsed, tallies, changed };
    }
    for (let i = 0; i < newUses; i++) {
        tallies.push(now);
    }
    // newUses <= 0 means an age-out we didn't have a tally for (pre-baseline usage) — nothing
    // to add; the updated lastUsed simply tracks the server down.
    return { lastUsed: serverUsed, tallies, changed };
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
        if (!Number.isFinite(ts) || ts < windowStart) continue;
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
        if (!Number.isFinite(ts) || ts < windowStart) continue;
        if (oldest === null || ts < oldest) oldest = ts;
    }
    return oldest;
}
