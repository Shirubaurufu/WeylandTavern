// lib/battery.js

// Pure theater: the phone "battery" starts at a plausible level when the panel first opens and
// drains slowly over the session, clamping at a floor so it never dies. Resets on page reload.
// Pure functions of (startLevel, elapsedMs) so the whole model is trivially unit-testable.

export const BATTERY_DRAIN_PER_HOUR = 6; // percent
export const BATTERY_FLOOR = 12; // the phone never actually dies on the user

/**
 * A plausible session-start battery level derived from the real clock: fuller in the morning,
 * lower late at night, with a little deterministic per-day jitter so it doesn't feel canned.
 * @param {Date} [now]
 * @returns {number} integer percent 55-98
 */
export function initialBatteryLevel(now = new Date()) {
    const hour = now.getHours() + now.getMinutes() / 60;
    // Peaks near 8am (fresh off the charger), lowest around midnight.
    const dayCurve = Math.cos(((hour - 8) / 24) * 2 * Math.PI) * 0.5 + 0.5; // 0..1
    const jitter = (now.getDate() * 7 + now.getMonth() * 3) % 10; // 0..9, stable within a day
    return Math.round(58 + dayCurve * 30 + jitter);
}

/**
 * @param {number} startLevel percent at session start
 * @param {number} elapsedMs since session start
 * @returns {number} integer percent, clamped to [BATTERY_FLOOR, 100]
 */
export function batteryLevel(startLevel, elapsedMs) {
    const drained = startLevel - (elapsedMs / 3_600_000) * BATTERY_DRAIN_PER_HOUR;
    return Math.max(BATTERY_FLOOR, Math.min(100, Math.round(drained)));
}

/**
 * Meta battery mode (Settings -> "Messages-left battery"): the displayed charge is the percentage
 * of the user's available message allowance that remains. For example, 367 of 500 reads as 73%.
 * There is no floor because an empty allowance is real information worth showing.
 * @param {unknown} remaining remaining messages, from the HelixMind quota endpoint
 * @param {unknown} limit total messages in the current allowance window
 * @returns {number|null} integer percent 0-100, or null when the value is unusable
 *   (no key, fetch failed, unlimited plan); callers fall back to the theatrical model.
 */
export function trackerBatteryLevel(remaining, limit) {
    if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return null;
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return null;
    return Math.max(0, Math.min(100, Math.round((remaining / limit) * 100)));
}

export function describeBatteryMode({ enabled = false, status = 'idle', remaining = null, limit = null } = {}) {
    if (!enabled) {
        return 'Current mode: Theatrical. It starts at a plausible charge, drains 6% per hour, and never falls below 12%.';
    }
    if (status === 'no-key') {
        return 'Current mode: Messages-left requested, but no HelixMind tracker key was found. Showing the theatrical battery instead.';
    }
    if (status === 'ready' && typeof remaining === 'number' && typeof limit === 'number') {
        return `Current mode: Messages-left. ${remaining} of ${limit} messages available, shown as ${trackerBatteryLevel(remaining, limit)}%.`;
    }
    if (status === 'unavailable') {
        return 'Current mode: Messages-left, but usage could not be read. Showing the theatrical battery until the tracker is available.';
    }
    return 'Current mode: Messages-left. Checking HelixMind usage now; the theatrical battery is shown until it loads.';
}
