// lib/debugLog.js

// Session ring buffer behind the Settings app's log viewer. index.js's log() pushes every line
// here regardless of whether debug console output is enabled, so the viewer always has recent
// history without the user having had debug mode on in advance.

export const MAX_LOG_LINES = 200;

const lines = [];

/**
 * @param {string} message already-formatted line (no timestamps added here — caller's choice)
 * @param {number} [now] injectable for tests
 */
export function pushLogLine(message, now = Date.now()) {
    lines.push({ timestamp: now, message: String(message) });
    if (lines.length > MAX_LOG_LINES) lines.splice(0, lines.length - MAX_LOG_LINES);
}

/** @returns {Array<{timestamp: number, message: string}>} newest last */
export function getLogLines() {
    return [...lines];
}

export function clearLogLines() {
    lines.length = 0;
}
