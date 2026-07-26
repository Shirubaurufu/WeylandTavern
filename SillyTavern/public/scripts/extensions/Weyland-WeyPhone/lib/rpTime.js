// lib/rpTime.js
//
// Turns Weyland scene-header time into something the Clock app can do arithmetic on. Roleplay time
// has no ticking clock — it only exists as headers like
//   ¦¦ Saturday, Oct 18th ~ 9:28 AM ~ Dormitory ~ (ONYX) ¦¦
// which rpClock.js parses into { weekday, date, time, location }. This module converts one of those
// into a comparable "moment" and measures the minutes between two moments, tolerating the awkward
// bits: 12h AM/PM (incl. the 12am/12pm edges), day and month rollover, and headers that omit the
// year.
//
// Forward-progression assumption: RP timers/alarms only ever move the story clock forward, so when
// two yearless moments would compare as "b before a" (e.g. Dec 31 -> Jan 1) we roll b into the next
// year rather than reporting negative time. A genuine backwards jump (flashback) with yearless
// headers is ambiguous and treated as forward; headers that carry an explicit year are used as-is.

import { findMostRecentRpTime } from './rpClock.js';

const MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const BASE_YEAR = 2000; // arbitrary anchor for yearless moments; only relative distance matters
// A yearless "b earlier than a" is only treated as a forward year-end wrap (Dec 31 -> Jan 1) when
// rolling b forward a year lands within this window. A larger apparent-backward gap is a genuine
// backward move — a flashback, or a re-gen with an earlier header — and is kept negative so RP
// alarms/timers wait rather than misfiring. 90 days comfortably covers real forward time-skips while
// rejecting any plausible flashback (which would have to be >9 months back to be mistaken for a wrap).
const FORWARD_WRAP_MAX_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Parse a parsed RP header into a moment. Returns null if the date or time can't be read.
 * @param {{date?: string, time?: string} | null} parsed output of rpClock.parseRpHeader
 * @returns {{year: number|null, month: number, day: number, hour: number, minute: number} | null}
 */
export function parseRpMoment(parsed) {
    if (!parsed) return null;

    const dateStr = String(parsed.date ?? '');
    const monthToken = dateStr.match(/[A-Za-z]{3}/);            // "Oct", "March" -> "Mar"
    const dayToken = dateStr.match(/\d{1,2}/);                  // first 1-2 digit run = day
    const yearToken = dateStr.match(/\b(\d{4})\b/);             // optional 4-digit year
    if (!monthToken || !dayToken) return null;

    const month = MONTHS[monthToken[0].toLowerCase()];
    if (month === undefined) return null;
    const day = Number(dayToken[0]);
    const year = yearToken ? Number(yearToken[1]) : null;

    const timeToken = String(parsed.time ?? '').match(/(\d{1,2}):(\d{2})\s*([AaPp])/);
    if (!timeToken) return null;
    let hour = Number(timeToken[1]) % 12;                       // 12 -> 0, so 12am -> 0
    if (timeToken[3].toLowerCase() === 'p') hour += 12;         // ...and 12pm -> 12
    const minute = Number(timeToken[2]);

    return { year, month, day, hour, minute };
}

/** Convenience: the most recent RP moment in a chat, or null if no header is present. */
export function currentRpMoment(chat) {
    return parseRpMoment(findMostRecentRpTime(chat));
}

/**
 * Whole minutes from moment `a` to moment `b`, assuming `b` is at or after `a` (see the
 * forward-progression note above). Returns null if either moment is missing. Can be negative only
 * when both moments carry explicit years and `b` really is earlier.
 * @param {ReturnType<typeof parseRpMoment>} a
 * @param {ReturnType<typeof parseRpMoment>} b
 * @returns {number|null}
 */
export function rpMinutesBetween(a, b) {
    if (!a || !b) return null;
    const aYear = a.year ?? BASE_YEAR;
    // A yearless b inherits a's year so same-year distances are exact; a's own year if it had one.
    const bYear = b.year ?? (a.year ?? BASE_YEAR);
    const aMs = Date.UTC(aYear, a.month, a.day, a.hour, a.minute);
    const bMs = Date.UTC(bYear, b.month, b.day, b.hour, b.minute);
    let diff = bMs - aMs;
    // Both years inferred and b looks earlier: could be a year-end wrap OR a backward move. Only roll
    // b forward a year when doing so gives a SMALL forward gap (a genuine crossing). Never override
    // real years, and never turn a plain backward jump into a huge fake forward distance.
    if (diff < 0 && a.year == null && b.year == null) {
        const rolledDiff = Date.UTC(bYear + 1, b.month, b.day, b.hour, b.minute) - aMs;
        if (rolledDiff >= 0 && rolledDiff <= FORWARD_WRAP_MAX_MS) diff = rolledDiff;
    }
    return Math.round(diff / 60000);
}
