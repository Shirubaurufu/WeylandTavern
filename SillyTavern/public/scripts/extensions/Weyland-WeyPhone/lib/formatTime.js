const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats an epoch-millisecond timestamp the way iOS Messages does: "Just now" / "5m" / "3h" for
 * today, "Yesterday" for the previous calendar day, "Jul 1" for an older date this year, and
 * "Dec 25, 2025" for a date in a different year. Uses fixed English month abbreviations (not
 * Intl/locale-dependent formatting) so results are deterministic regardless of the running
 * environment's locale settings.
 * @param {number} epochMs
 * @param {number} [now] defaults to Date.now() — injectable for testing
 */
export function formatRelativeTime(epochMs, now = Date.now()) {
    if (!epochMs) return '';

    const diffMs = Math.max(0, now - epochMs);
    const diffMin = Math.floor(diffMs / 60000);
    const msgDate = new Date(epochMs);
    const nowDate = new Date(now);

    const isSameCalendarDay = msgDate.getFullYear() === nowDate.getFullYear()
        && msgDate.getMonth() === nowDate.getMonth()
        && msgDate.getDate() === nowDate.getDate();

    if (isSameCalendarDay) {
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m`;
        return `${Math.floor(diffMin / 60)}h`;
    }

    const yesterday = new Date(nowDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = msgDate.getFullYear() === yesterday.getFullYear()
        && msgDate.getMonth() === yesterday.getMonth()
        && msgDate.getDate() === yesterday.getDate();
    if (isYesterday) return 'Yesterday';

    const monthLabel = `${MONTH_NAMES[msgDate.getMonth()]} ${msgDate.getDate()}`;
    return msgDate.getFullYear() !== nowDate.getFullYear()
        ? `${monthLabel}, ${msgDate.getFullYear()}`
        : monthLabel;
}

/**
 * @param {number} epochMs
 * @returns {string} e.g. "3:47 PM"
 */
export function formatClockTime(epochMs) {
    const date = new Date(epochMs);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const paddedMinutes = String(minutes).padStart(2, '0');
    return `${hours}:${paddedMinutes} ${period}`;
}
