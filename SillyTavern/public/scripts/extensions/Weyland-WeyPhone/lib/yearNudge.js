// lib/yearNudge.js
//
// PromptOS "Add Year to RP". Scene headers only carry month and day ("¦¦ Friday, Dec 18th ~ ..."),
// so with this on, the outgoing RP prompt gets a short note asking the model to add the calendar
// year. The note is only sent while the latest AI header lacks a year: once the model writes one
// the note drops out, and it only comes back if a later reply loses the year again.
//
// The year comes from the chat's SchoolYear variable ("2020-2021", set by quick-reply-ext's
// SetSchoolYear): July-December falls in the first year, January-June in the second. Weyland-LTM
// has the same month rule for memory dates; WeyPhone is independently installable, so this is a
// copy rather than an import.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_DAY_RE = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/g;
const HAS_YEAR_RE = /\b(?:19|20)\d{2}\b/;
const WRAPPED_HEADER_RE = /¦¦\s*([^¦\n]+?)\s*¦¦/;
const BARE_HEADER_RE = /^\**([^\n"*~]+~[^\n]+?)\**\s*$/m;

/** @returns {{start: number, end: number} | null} */
export function parseSchoolYear(value) {
    const m = String(value ?? '').match(/^\s*(\d{4})\s*-\s*(\d{4})\s*$/);
    return m ? { start: Number(m[1]), end: Number(m[2]) } : null;
}

/** "Friday, Dec 18th" -> "Friday, Dec 18th, 2020". Unchanged when it already has a year or no month. */
export function withCalendarYear(date, schoolYear) {
    if (!date || !schoolYear || HAS_YEAR_RE.test(date)) return date;
    for (const m of date.matchAll(MONTH_DAY_RE)) {
        const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
        if (month === -1) continue;
        const year = month >= 6 ? schoolYear.start : schoolYear.end;
        return date.slice(0, m.index + m[0].length) + `, ${year}` + date.slice(m.index + m[0].length);
    }
    return date;
}

/** Date part of the most recent AI message's header, or null when that message has no header. */
export function latestAiHeaderDate(chat) {
    if (!Array.isArray(chat)) return null;
    for (let i = chat.length - 1; i >= 0; i--) {
        const m = chat[i];
        if (!m || m.is_user || m.is_system) continue;
        const text = String(m.mes ?? '');
        const raw = text.match(WRAPPED_HEADER_RE)?.[1] ?? text.match(BARE_HEADER_RE)?.[1];
        return raw ? raw.split('~')[0].trim() : null;
    }
    return null;
}

/** The note to send, or null when none is needed. */
export function buildYearNudge(chat, schoolYearValue) {
    const schoolYear = parseSchoolYear(schoolYearValue);
    if (!schoolYear) return null;
    const date = latestAiHeaderDate(chat);
    if (!date || HAS_YEAR_RE.test(date)) return null;
    // No readable month means this isn't a dated scene header (e.g. a "Heyyyo!~" opener).
    const example = withCalendarYear(date, schoolYear);
    if (example === date) return null;
    return `[Header year: the scene header date is missing the calendar year. In your reply's header, write the year right after the month and day — e.g. "${example}". This story is in the ${schoolYear.start}-${schoolYear.end} school year, so July through December dates are ${schoolYear.start} and January through June dates are ${schoolYear.end}. Write only the single year, never the school-year range. Do not mention this note.]`;
}

/**
 * Hooks the note into outgoing chat-completion prompts.
 * @param {{ getContext: () => any, isEnabled: () => boolean, getSchoolYear: () => string }} deps
 */
export function installYearNudge({ getContext, isEnabled, getSchoolYear }) {
    const context = getContext();
    let generationType = '';
    context.eventSource.on(context.eventTypes.GENERATION_STARTED, (type) => { generationType = String(type ?? ''); });
    context.eventSource.on(context.eventTypes.CHAT_COMPLETION_PROMPT_READY, (data) => {
        // Quiet generations (phone texts, summaries) are not RP replies and have no header to fix.
        if (data?.dryRun || !Array.isArray(data?.chat) || generationType === 'quiet' || !isEnabled()) return;
        const nudge = buildYearNudge(getContext().chat, getSchoolYear());
        if (!nudge) return;
        // Keep an assistant prefill as the final message.
        const at = data.chat.at(-1)?.role === 'assistant' ? data.chat.length - 1 : data.chat.length;
        data.chat.splice(at, 0, { role: 'system', content: nudge });
    });
}
