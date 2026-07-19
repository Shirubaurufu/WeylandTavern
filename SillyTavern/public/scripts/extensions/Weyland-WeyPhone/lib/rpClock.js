// lib/rpClock.js

// Weyland characters format scene headers as:
//   ¦¦ Saturday, Oct 18th ~ 9:28 AM ~ Dormitory ~ (ONYX) ¦¦
// When the RP-clock setting is on, the status bar / lock screen show the roleplay's own time
// instead of the real clock. Designed to FAIL CLOSED: any parse miss returns null and the caller
// falls back to real time — a partial match must never produce garbage in the status bar.

// Tolerant of: optional comma after the weekday, spacing drift, case, a missing location or
// speaker tag, and both "9:28 AM" and "9:28AM". The two ¦¦ fences anchor everything.
const HEADER_RE = /¦¦\s*([A-Za-z]+),?\s+([A-Za-z]+\.?\s*\d{1,2}(?:st|nd|rd|th)?)\s*~\s*(\d{1,2}:\d{2})\s*([AaPp])\.?[Mm]\.?\s*~?([^¦]*)¦¦/;

/**
 * @param {string} text one message's content
 * @returns {{weekday: string, date: string, time: string, location: string|null} | null}
 */
export function parseRpHeader(text) {
    if (typeof text !== 'string') return null;
    // Scan for the LAST header in the message — a long reply can contain several scene shifts.
    let match = null;
    const globalRe = new RegExp(HEADER_RE.source, 'g');
    for (const m of text.matchAll(globalRe)) match = m;
    if (!match) return null;
    const [, weekday, date, clock, meridiemLetter, tail] = match;
    const time = `${clock} ${meridiemLetter.toUpperCase()}M`;
    // The tail holds "~ Location ~ (SPEAKER)" fragments; the location is the first ~-delimited
    // piece that isn't a parenthesized speaker tag.
    const location = tail
        .split('~')
        .map(part => part.trim())
        .find(part => part && !/^\(.*\)$/.test(part)) ?? null;
    return { weekday, date, time, location };
}

/**
 * Most recent RP time across the chat — scans from the newest message backwards and returns the
 * first (i.e. latest) header found.
 * @param {Array<{mes?: string}>} chat SillyTavern's context.chat
 * @returns {{weekday: string, date: string, time: string, location: string|null} | null}
 */
export function findMostRecentRpTime(chat) {
    if (!Array.isArray(chat)) return null;
    for (let i = chat.length - 1; i >= 0; i--) {
        const parsed = parseRpHeader(chat[i]?.mes);
        if (parsed) return parsed;
    }
    return null;
}
