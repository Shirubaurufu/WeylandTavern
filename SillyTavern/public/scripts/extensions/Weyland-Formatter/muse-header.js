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

const RE_ANY_MUSE = /MUSE EXPERIMENT|Collar Status|Evening Scene|\(Code:? ?\d{3,5}\)/i;
const RE_DAY = /^MUSE EXPERIMENT:? ?DAY (\d{1,2}) ?\/ ?(\d{1,2})$/i;
const RE_COLLAR = /^Collar Status:? ?\[?(Active|Inactive|Monitoring Only|Malfunctioning)\]?(.*)$/i;
// after the breach the model sometimes still writes the line with nothing in it ("Collar Status: N/A"): it is dropped
const RE_COLLAR_OFF = /^Collar Status:? ?\[?(?:N\/A|None|Removed|Off|Disabled|Offline|-)\]?$/i;
const RE_TIMER = /(\d{1,2}:\d{2})/;
// 3-5 digit codes: the model has typed "(CODE: 402)"; better to show it than to leave the whole block as raw text
const RE_EVENING = /^Evening Scene:? ?ACTIVE(?: ?\(Day (\d{1,2})\))?(?: ?\(Code:? ?(\d{3,5})\))?$/i;
const RE_CODE = /^(?:(.{1,80}?) ?[~-] ?)?\(Code:? ?(\d{3,5})\)(?: ?\([A-Za-z]{2,5}\))*$/i;
const RE_TIME = /(\d{1,2}):(\d{2}) ?([AP])M/i;
// the same tests headerV2MarkdownExt uses to find date / time / mode / location in the first line
const RE_DATE_PART = /mon|tue|thu|wed|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i;
const RE_TIME_PART = /(?: |\d)[ap]m/i;
const RE_MODE_PART = /saph|onyx|ruby/i;

const clean = line => line.replace(/[*_¦#]/g, '').replace(/\s+/g, ' ').trim();

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
            // the standard first line: ¦¦ date ~ time ~ location ¦¦
            if (!/^\s*\*{0,3}¦+.*¦+\s*\*{0,3}\s*$/.test(raw) || !RE_TIME.test(line) || line.length > MAX_LINE) return null;
            first = { raw, line, start: pos };
            end = next;
            pos = next;
            continue;
        }
        if (!line) { pos = next; continue; }    // blank lines between header lines
        if (line.length > MAX_LINE) break;

        let m;
        if ((m = line.match(RE_DAY))) {
            seen.day = +m[1];
            seen.total = +m[2];
        } else if (RE_COLLAR_OFF.test(line)) {
            seen.collarOff = true;
        } else if ((m = line.match(RE_COLLAR))) {
            seen.collar = COLLAR_STATES[m[1].toLowerCase()];
            const t = m[2].match(RE_TIMER);
            if (t) seen.timer = t[1];
        } else if ((m = line.match(RE_EVENING))) {
            seen.eveningTag = true;
            if (m[2]) seen.code = seen.code || m[2];
        } else if ((m = line.match(RE_CODE))) {
            seen.code = m[2];
            if (m[1]) seen.location = m[1].trim();
        } else {
            break;   // first line that is not a header line: prose starts here
        }
        end = next;
        pos = next;
    }
    if (!first) return null;

    // Not Muse's unless it has a Muse-only line. A bare code line counts only when it is one of her scripted codes.
    const isMuse = seen.day !== undefined || seen.collar !== undefined || seen.eveningTag || (seen.code && KNOWN_CODES.has(seen.code));
    if (!isMuse) return null;

    // morning or evening: the written tag, then the scripted code, then the clock in the first line
    let evening = false;
    if (seen.eveningTag) evening = true;
    else if (seen.code && EVENING_CODES.has(seen.code)) evening = true;
    else if (seen.code && MORNING_CODES.has(seen.code)) evening = false;
    else {
        const t = first.line.match(RE_TIME);
        if (t) {
            const hour = (Number(t[1]) % 12) + (/p/i.test(t[3]) ? 12 : 0);
            evening = hour >= 16 || hour < 4;
        }
    }

    const total = seen.total >= 1 && seen.total <= 30 ? seen.total : 14;
    const day = seen.day === undefined ? null : Math.min(Math.max(seen.day, 1), total);
    return { first, end, day, total, code: seen.code ?? null, location: seen.location ?? null, collar: seen.collar ?? null, timer: seen.timer ?? null, evening };
}

/**
 * Post-breach headers keep the location on the code line ("Weyland Research Center ~ (Code: 4997)") and leave the
 * first line without one, which headerV2MarkdownExt cannot draw (it needs date, time AND location). Move the
 * location up so the standard header renders normally. First lines that already have a location are left as written.
 */
function firstLineFor(p) {
    const parts = p.first.line.split('~').map(s => s.trim()).filter(Boolean);
    // Lorebook examples put date and time in the same segment. The standard header renderer
    // needs separate segments; split that segment here without changing stored message text.
    const combined = parts.findIndex(part => RE_DATE_PART.test(part) && RE_TIME.test(part));
    if (combined >= 0) {
        const time = parts[combined].match(RE_TIME);
        const date = parts[combined].slice(0, time.index).trim();
        const tail = parts[combined].slice(time.index + time[0].length).trim();
        parts.splice(combined, 1, date, time[0], ...(tail ? [tail] : []));
    }
    const hasLocation = parts.some(part => !RE_DATE_PART.test(part) && !RE_TIME_PART.test(part) && !RE_MODE_PART.test(part));
    if (!hasLocation && p.location) parts.push(p.location);
    if (combined < 0 && (hasLocation || !p.location)) return p.first.raw;
    return `¦¦ ${parts.join(' ~ ')} ¦¦`;
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
