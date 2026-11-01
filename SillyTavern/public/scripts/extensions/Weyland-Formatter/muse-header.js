// Muse's multi-line header, drawn as a tracker strip: experiment day, collar status (or "Evening scene"),
// scene code, and a rail of 14 days with a morning tick and an evening tick each.
//
// Pure functions with no browser APIs, so Node can test them (Weyland-WeyPhone/test/museHeader.test.js).
//
// WHY A 'lang' EXTENSION (it runs on the markdown text, before conversion), not another 'output' one:
// the existing header extensions in index.js work on the finished HTML, where Muse's lines arrive in about
// 45 different wrappers (<p>, <em>, <strong style="color: darkred;">, <br>-joined text, in any mix) depending on
// how the model wrapped each line in * or ¦¦. Matching all of those is fragile. Here we read the plain lines
// instead, replace the whole header block with ONE html block, and the standard header (first line) is left to
// headerV2MarkdownExt exactly as before. It is display-only: chat[].mes and the prompt never see this HTML.
//
// WHAT THE STORY DOES (Muse's lorebook + system prompt, read in full 2026-10-04):
//   Days 2-6 morning:  date ~ time ~ location / MUSE EXPERIMENT: DAY N/14 / (CODE: N) / Collar Status [..] ~ timer
//   Days 2-6 evening:  the Collar Status line is REPLACED by "Evening Scene: ACTIVE (Day N)" and the code moves
//                      onto the location line ("Muse's Habitat ~ (Code: 7494)"). The player is never in an evening scene.
//   Day 7 onward:      no day line and no collar line ("Weyland Research Center ~ (Code: 4997)"), so the rail simply
//                      is not drawn. Nothing here knows which day the story collapses on; it follows what is written.

const SCAN_CHARS = 1600;   // the header is at the very top; never look further (keeps long messages and lore pages free)
const MAX_LINE = 200;      // a header line is short; anything longer is prose

// Scripted scene codes (system prompt master list). Morning/evening only matter as a fallback: the model writes
// the explicit Evening Scene line in every evening scene (60 of 60 in real chats), which is checked first.
const EVENING_CODES = new Set(['6182', '3273', '7494', '9505', '6836']);
const MORNING_CODES = new Set(['4402', '9033', '5814', '2265', '1752']);
const AFTERMATH_CODES = new Set(['4997', '1138', '1139', '1140', '1141', '1142', '7717', '7718']);
const KNOWN_CODES = new Set([...EVENING_CODES, ...MORNING_CODES, ...AFTERMATH_CODES]);

const COLLAR_STATES = { active: 'Active', inactive: 'Inactive', 'monitoring only': 'Monitoring Only', malfunctioning: 'Malfunctioning' };

const RE_ANY_MUSE = /MUSE EXPERIMENT|Collar Status|Evening Scene|\bCode:?\s*\d{3,5}\b/i;
const RE_DAY = /^MUSE EXPERIMENT:? ?DAY (\d{1,2}) ?\/ ?(\d{1,2})$/i;
const RE_COLLAR = /^Collar Status:? ?\[?(Active|Inactive|Monitoring Only|Malfunctioning)\]?(.*)$/i;
// after the breach the model sometimes still writes the line with nothing in it ("Collar Status: N/A"): it is dropped
const RE_COLLAR_OFF = /^Collar Status:? ?\[?(?:N\/A|None|Removed|Off|Disabled|Offline|-)\]?$/i;
const RE_TIMER = /(\d{1,2}:\d{2})/;
// 3-5 digit codes: the model has typed "(CODE: 402)"; better to show it than to leave the whole block as raw text
const RE_EVENING = /^Evening Scene:? ?ACTIVE(?: ?\(Day (\d{1,2})\))?(?: ?\(Code:? ?(\d{3,5})\))?$/i;
const RE_CODE = /^(?:(.{1,100}?)\s*-\s*)?(?:\(\s*Code:?\s*(\d{3,5})\s*\)|\[\s*Code:?\s*(\d{3,5})\s*\]|Code:\s*(\d{3,5}))$/i;
const RE_TIME = /\b(\d{1,2}):(\d{2})(?:[ \t]*([AP])M)?\b/i;
const RE_DATE_PART = /^(?:(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?),?\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?$/i;
const RE_MODE_PART = /^(?:\((SAPH|ONYX|RUBY)\)|\[(SAPH|ONYX|RUBY)\]|(SAPH|ONYX|RUBY))$/i;

const clean = line => line.replace(/[*_¦|│#]/g, '').replace(/\s+/g, ' ').trim();
function unwrapped(raw) {
    let value = raw.trim().replace(/^#{1,6}\s+/, '');
    for (let i = 0; i < 3; i++) value = value.replace(/^(\*{1,3}|_{1,3})(.*?)\1$/, '$2').trim();
    return value;
}
const isBarLine = raw => /^[¦|│]+[^`<>\r\n]+[¦|│]+$/.test(unwrapped(raw));
const datePart = part => RE_DATE_PART.test(part) || /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(part);
const clockPart = part => {
    const match = part.match(RE_TIME);
    return match?.[0] === part && +match[2] < 60
        && (match[3] ? +match[1] >= 1 && +match[1] <= 12 : +match[1] < 24);
};

// Read explicit tokens, never substrings of a location: Ruby Hall is a place, not RUBY mode.
// Keep only a single value for each field; conflicting metadata must not be silently corrected.
function assignField(fields, key, value) {
    if (value === undefined || value === null || value === '') return;
    if (fields[key] !== undefined && fields[key] !== value) fields.conflict = true;
    else fields[key] = value;
}

function headerFields(line) {
    const fields = { parts: [] };
    for (let part of line.split('~').map(part => part.trim()).filter(Boolean)) {
        const suffix = part.match(/\s+(\((?:SAPH|ONYX|RUBY)\)|\[(?:SAPH|ONYX|RUBY)\])$/i);
        if (suffix) {
            assignField(fields, 'mode', suffix[1].match(/SAPH|ONYX|RUBY/i)[0].toUpperCase());
            part = part.slice(0, suffix.index).trim();
        }
        const mode = part.match(RE_MODE_PART);
        const code = part.match(RE_CODE);
        if (mode) assignField(fields, 'mode', (mode[1] || mode[2] || mode[3]).toUpperCase());
        else if (code) {
            assignField(fields, 'code', code[2] || code[3] || code[4]);
            if (code[1]) fields.parts.push(code[1].trim());
        } else if (part) fields.parts.push(part);
    }
    return fields;
}

function firstHeader(raw, line, start) {
    if (/[`<>"“”]/.test(raw) || line.length > MAX_LINE) return null;
    const fields = headerFields(line);
    // Lorebook examples combine date and time in one field. Split only after a complete date.
    fields.parts = fields.parts.flatMap(part => {
        const time = part.match(RE_TIME);
        if (!time || !datePart(part.slice(0, time.index).trim())) return [part];
        const tail = part.slice(time.index + time[0].length).trim();
        return [part.slice(0, time.index).trim(), time[0], ...(tail ? [tail] : [])];
    });
    const dates = fields.parts.filter(datePart), clocks = fields.parts.filter(clockPart);
    const locations = fields.parts.filter(part => !datePart(part) && !clockPart(part));
    if (fields.conflict || dates.length !== 1 || clocks.length !== 1 || locations.length > 3) return null;
    // Without bars require a full date/time line; arbitrary quoted prose cannot open a header.
    if (!isBarLine(raw) && /[¦|│]/.test(raw)) return null;
    return { raw, line, start, parts: fields.parts, date: dates[0], time: clocks[0],
        location: locations.join(' ~ ') || undefined, code: fields.code, mode: fields.mode };
}

/**
 * Finds and reads Muse's header block at the top of a message.
 * Returns null unless the message starts with the standard first line AND is recognisably Muse's.
 * @param {string} text markdown text as showdown hands it to a 'lang' extension
 */
export function parseMuseHeader(text) {
    if (typeof text !== 'string') return null;
    const zone = text.length > SCAN_CHARS ? text.slice(0, SCAN_CHARS) : text;
    if (!RE_ANY_MUSE.test(zone)) return null;

    const seen = {};
    let first = null;
    let end = 0;
    let pos = 0;
    while (pos < zone.length) {
        let nl = zone.indexOf('\n', pos);
        const hasNl = nl >= 0;
        if (!hasNl) nl = zone.length;
        const raw = zone.slice(pos, nl);
        const line = clean(raw);
        const next = hasNl ? nl + 1 : nl;

        if (!first) {
            if (!line || /^-{3,}$/.test(line)) { pos = next; continue; }   // blank lines and an hr before the header
            first = firstHeader(raw, line, pos);
            if (!first) return null;
            for (const key of ['location', 'code', 'mode']) assignField(seen, key, first[key]);
            end = next;
            pos = next;
            continue;
        }
        if (!line) { pos = next; continue; }    // blank lines between header lines
        if (line.length > MAX_LINE) break;

        let m;
        if ((m = line.match(RE_DAY))) {
            assignField(seen, 'day', +m[1]);
            assignField(seen, 'total', +m[2]);
        } else if (RE_COLLAR_OFF.test(line)) {
            seen.collarOff = true;
        } else if ((m = line.match(RE_COLLAR))) {
            assignField(seen, 'collar', COLLAR_STATES[m[1].toLowerCase()]);
            const t = m[2].match(RE_TIMER);
            if (t) seen.timer = t[1];
        } else if ((m = line.match(RE_EVENING))) {
            seen.eveningTag = true;
            if (m[2]) assignField(seen, 'code', m[2]);
        } else {
            const fields = headerFields(line);
            // A location must be bar-wrapped. Standalone code labels are explicit enough
            // without bars; a bare mode needs parentheses/brackets to avoid eating prose.
            if (fields.parts.length > 3 || /[<>`]/.test(line)
                || (fields.parts.length && !isBarLine(raw))
                || (!fields.parts.length && !fields.code && !(fields.mode && (isBarLine(raw) || /^[([]/.test(line))))) break;
            if (fields.conflict) seen.conflict = true;
            for (const key of ['code', 'mode']) assignField(seen, key, fields[key]);
            assignField(seen, 'location', fields.parts.join(' ~ '));
        }
        end = next;
        pos = next;
    }
    if (!first || seen.conflict) return null;

    // Not Muse's unless it has a Muse-only line. A bare code line counts only when it is one of her scripted codes.
    const isMuse = seen.day !== undefined || seen.collar !== undefined || seen.eveningTag || (seen.code && KNOWN_CODES.has(seen.code));
    if (!isMuse) return null;

    // morning or evening: the written tag, then the scripted code, then the clock in the first line
    let evening = false;
    if (seen.eveningTag) evening = true;
    else if (seen.code && EVENING_CODES.has(seen.code)) evening = true;
    else if (seen.code && MORNING_CODES.has(seen.code)) evening = false;
    else {
        const t = first.time.match(RE_TIME);
        if (t) {
            const hour = t[3] ? (Number(t[1]) % 12) + (/p/i.test(t[3]) ? 12 : 0) : Number(t[1]);
            evening = hour >= 16 || hour < 4;
        }
    }

    const total = seen.total >= 1 && seen.total <= 30 ? seen.total : 14;
    const day = seen.day === undefined ? null : Math.min(Math.max(seen.day, 1), total);
    return { first, end, day, total, code: seen.code ?? null, location: seen.location ?? null, mode: seen.mode ?? null, collar: seen.collar ?? null, timer: seen.timer ?? null, evening };
}

/**
 * Muse can put location on the code line or on a separate location/mode line, leaving the first line
 * without one. headerV2MarkdownExt needs date, time AND location, so assemble those display fields here.
 * Preserve a mode from the split line too. First lines that already have a location are left as written.
 */
function firstLineFor(p) {
    const parts = [p.first.date, p.first.time];
    if (p.location) parts.push(p.location);
    if (p.mode) parts.push(`(${p.mode})`);
    return `¦¦ ${parts.join(' ~ ')} ¦¦`;
}

/** Normalize a validated Muse block before the generic paragraph pass. It can discard an
 * unbarred date or a code sharing a paragraph with an alternate-bar location. Keep the explicit
 * field text, with canonical bars and paragraph boundaries; no story values are inferred. */
export function repairMuseHeader(text) {
    const p = parseMuseHeader(text);
    if (!p) return text;
    const first = firstLineFor(p) + (p.first.code ? `\n\n¦¦ (CODE: ${p.first.code}) ¦¦` : '');
    const remaining = text.slice(p.first.start + p.first.raw.length, p.end)
        .split('\n').map(clean).filter(Boolean).map(line => `¦¦ ${line} ¦¦`);
    return text.slice(0, p.first.start) + [first, ...remaining, text.slice(p.end).trimStart()].join('\n\n');
}

/**
 * The strip as ONE line of block-level html (showdown passes a single-line block div through untouched).
 * Everything interpolated is a number or one of a fixed set of words, so there is nothing to escape.
 * Class names here get ST's "custom-" prefix when the message is sanitised, so style.css targets .custom-muse-*.
 */
export function renderMuseStrip(p) {
    const mid = p.evening
        ? '<span class="muse-collar" data-c="Evening"><span class="muse-st">Evening scene</span></span>'
        : p.collar
            ? `<span class="muse-collar" data-c="${p.collar}"><span class="muse-lbl">Collar status:</span><span class="muse-st">${p.collar}</span>${p.timer ? `<span class="muse-tm">&middot; ${p.timer}</span>` : ''}</span>`
            : '';
    const day = p.day
        ? `<span class="muse-day"><span class="muse-long">Experiment day <b>${p.day}</b> of ${p.total}</span><span class="muse-short">Day <b>${p.day}</b>/${p.total}</span></span>`
        : '';
    const code = p.code ? `<span class="muse-code">${p.code}</span>` : '';

    let rail = '';
    if (p.day) {
        let cells = '';
        for (let d = 1; d <= p.total; d++) {
            // morning tick: done once the day is past (or once the evening has begun); evening tick: a darker red once past
            const am = d < p.day || (d === p.day && p.evening) ? 'muse-done' : d === p.day ? 'muse-now' : '';
            const pm = d < p.day ? 'muse-done-eve' : d === p.day && p.evening ? 'muse-now' : '';
            const pin = d === p.day && p.evening ? '<i class="muse-pin" title="Evening scene" aria-label="Evening scene"></i>' : '';
            cells += `<span class="muse-cell"><i class="${am}"></i><i class="${pm}"></i>${pin}</span>`;
        }
        rail = `<div class="muse-lane"></div><div class="muse-rail" style="--muse-days:${p.total}" role="img" aria-label="Experiment day ${p.day} of ${p.total}, ${p.evening ? 'evening' : 'morning'}">${cells}</div>`;
    }
    const state = `${p.day ? '' : ' muse-collapsed'}`;
    return `<div class="muse-strip${state}" data-session="${p.evening ? 'evening' : 'morning'}"><div class="muse-row">${day}${mid}${code}</div>${rail}</div>`;
}

/** showdown 'lang' filter: replaces Muse's header lines (all but the standard first line) with the strip. */
export function museHeaderFilter(text) {
    try {
        if (typeof text !== 'string' || text.length < 60) return text;
        const p = parseMuseHeader(text);
        if (!p) return text;
        return `${text.slice(0, p.first.start)}${firstLineFor(p)}\n\n${renderMuseStrip(p)}\n\n${text.slice(p.end)}`;
    } catch (e) {
        console.error('[Weyland-Formatter] Error in museHeaderFilter:', e);
        return text;
    }
}

/** @returns {Array<{type: 'lang', filter: (text: string) => string}>} */
export function headerMuseStripExt() {
    return [{ type: 'lang', filter: museHeaderFilter }];
}
