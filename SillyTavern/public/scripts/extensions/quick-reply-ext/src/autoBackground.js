/**
 * Auto-background picker (rewritten 2026-11-04; replaces the 550-line if-ladder that lived in BG()).
 *
 * Pure logic, no SillyTavern imports: index.js feeds it a reply and gets back a file name, and the Node
 * tests / tools/bg-replay.mjs run the exact same code against saved chats.
 *
 * Pipeline:
 *   1. findHeaderLines / parseHeader: read the reply header ("¦¦ date ~ time ~ location ~ (MODE) ¦¦") into
 *      fields, with the same field rules as the Formatter's header renderer, so what the player sees as
 *      the location is what we match.
 *   2. readScene: location segments plus everything else that can pick a variant: the clock (day /
 *      evening / night), the date (month: Christmas, Halloween), weather and crowd words in the reply text,
 *      and inside/outside words in the location.
 *   3. chooseBackground: score every place in backgroundCatalog.js against the location, pick the best,
 *      then pick one of its variants for the scene. Returns null when nothing matched, and the caller
 *      keeps the current background (the old code did the same, but by accident).
 *
 * Why scoring instead of an ordered ladder: in the ladder the FIRST substring that hit won, so "Trail"
 * caught every "Trailer", the user's name caught "Lucky's Apartment" (-> Blake's dorm), and "Sterling"
 * caught "Sterling Hall Laundry Room" before Laundry was ever checked. Here words only match whole
 * words, specific names beat generic nouns, rooms beat the building they're in, and the order of the
 * catalog only breaks exact ties.
 */
import { AREAS, PLACES, HOME_ROOMS } from './backgroundCatalog.js';

// ── Text helpers ─────────────────────────────────────────────────────────────

const SYNONYMS = [
    [/\btree house\b/g, 'treehouse'],
    [/\btheatre\b/g, 'theater'],
    [/\bneighbourhood\b/g, 'neighborhood'],
    [/\bcafeteria\b/g, 'cafeteria'],
];

/**
 * Lowercase, strip accents and punctuation, drop possessives ("Serra's Room" -> "serra room"), and turn
 * the player's own name into the word "player" so catalog entries can say "player dorm".
 * @param {string} text
 * @param {string} [userName]
 */
export function normalize(text, userName) {
    let s = String(text ?? '')
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[‘’ʼ`´]/g, "'")
        .replace(/'s\b/g, '')
        .replace(/s'(?=\s|$)/g, 's')
        .replace(/'/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9*]+/g, ' ')
        .trim();
    for (const [re, to] of SYNONYMS) s = s.replace(re, to);
    const user = userName ? normalize(userName) : '';
    if (user && user !== 'player') {
        s = ` ${s} `.split(` ${user} `).join(' player ').trim();
    }
    return s;
}

/** Plural-insensitive token ("trails" = "trail", but "trailer" stays its own word). */
function stem(token) {
    if (token === '*') return token;
    if (token.length > 3 && token.endsWith('s') && !/(?:ss|us|is)$/.test(token)) return token.slice(0, -1);
    return token;
}

const tokensOf = (s) => (s ? s.split(' ').filter(Boolean).map(stem) : []);

// ── Header parsing ───────────────────────────────────────────────────────────

const MODE_FIELD = /^\s*(?:\((?:SAPH|ONYX|RUBY)\)|\[(?:SAPH|ONYX|RUBY)\]|(?:SAPH|ONYX|RUBY))\s*$/i;
const TIME_FIELD = /\d\s?[ap]\.?m\b|\d{1,2}\s?[:h]\s?\d{2}|\d\s?(?:h|uhr)\b|\d\s?[時点]/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE_FIELD = /\b(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
/** Fields that are never the location: "(CODE: 4402)", "MUSE EXPERIMENT: DAY 2/14", "Collar Status [...]". */
const NOT_LOCATION = /^\(.*\)$|^\[.*\]$|^\([A-Z]{2}\)|^code\b|experiment\s*:|collar status|evening scene\s*:|enrichment\s*:|^badges?\s*:|^danger level|explicit content|^x\/x$|\bbpm$/i;

/**
 * Drop a scene sheet / thinking block if one is still in the text: the sheet itself contains "¦" and
 * "~" (it talks about the header), so the real header is the first one AFTER it.
 * @param {string} text
 */
function afterPreparation(text) {
    let s = String(text ?? '');
    for (const end of ['END OF SCENE SHEET', '[END WEYLAND SCENE SHEET]', '</think>', '</analysis>', '</thinking>']) {
        const i = s.lastIndexOf(end);
        if (i >= 0) s = s.slice(i + end.length);
    }
    return s;
}

/**
 * The reply header: the first line holding "¦" plus the "¦" lines right after it (Muse's two-line header),
 * or, for old-style replies, a first line shaped "a ~ b ~ c".
 * @param {string} text
 * @returns {string[]} header lines, empty when there is none
 */
export function findHeaderLines(text) {
    const lines = afterPreparation(text).split(/\r?\n/);
    const clean = (l) => l.replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim();
    const first = lines.findIndex(l => l.includes('¦'));
    if (first >= 0) {
        const out = [clean(lines[first])];
        for (let i = first + 1; i < lines.length && clean(lines[i]).startsWith('¦'); i++) out.push(clean(lines[i]));
        return out;
    }
    const legacy = lines.slice(0, 5).find(l => /^.+?~.+?~/.test(clean(l)));
    return legacy ? [clean(legacy)] : [];
}

/**
 * @param {string[]} headerLines
 * @returns {{ date: string, time: string, location: string, mode: string, extras: string[] } | null}
 */
export function parseHeader(headerLines) {
    if (!headerLines?.length) return null;
    const fields = headerLines.join(' ~ ')
        .replace(/¦+/g, '~')
        .split('~')
        .map(f => f.trim())
        .filter(Boolean);
    if (!fields.length) return null;
    const used = new Set();
    const take = (pred) => {
        const i = fields.findIndex((f, idx) => !used.has(idx) && pred(f));
        if (i >= 0) used.add(i);
        return i >= 0 ? fields[i] : '';
    };
    const mode = take(f => MODE_FIELD.test(f));
    const time = take(f => TIME_FIELD.test(f) && f.length < 40);
    let date = take(f => DATE_FIELD.test(f) && f.length < 40);
    const rest = fields.map((f, i) => ({ f, i })).filter(x => !used.has(x.i) && !NOT_LOCATION.test(x.f));
    // Non-English or odd date: same fallback as the Formatter, canonical order date ~ time ~ location.
    if (!date && rest.length >= 2 && rest[0].f.length < 40) {
        date = rest.shift().f;
    }
    let location = rest.length ? rest[0].f : '';
    // "Kitchen / Backyard (SAPH)": a mode glued onto the location (same fix as the Formatter's)
    location = location.replace(/\s*[(\[](?:SAPH|ONYX|RUBY)[)\]]\s*$/i, '').trim();
    const extras = fields.filter((f, i) => i !== rest[0]?.i && f !== date && f !== time && f !== mode);
    return { date, time, location, mode, extras };
}

/** "7:41 PM" -> 19, "15:09" -> 15, "3h09" -> 3; null when unreadable. */
export function parseHour(time) {
    const s = String(time ?? '');
    let m = s.match(/(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?\s*([ap])\.?\s*m\b/i);
    if (m) {
        let h = Number(m[1]) % 12;
        if (m[3].toLowerCase() === 'p') h += 12;
        return h;
    }
    m = s.match(/(\d{1,2})\s*[:h]\s*(\d{2})/);
    if (m && Number(m[1]) < 24) return Number(m[1]);
    return null;
}

/** "Sunday, Oct 10" -> { month: 10, day: 10 }; nulls when there is no English month name. */
export function parseDate(date) {
    const s = String(date ?? '').toLowerCase();
    const m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
    const month = m ? MONTHS.indexOf(m[1]) + 1 : null;
    const d = s.replace(/\b\d{4}\b/g, '').match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
    const day = d && Number(d[1]) >= 1 && Number(d[1]) <= 31 ? Number(d[1]) : null;
    return { month, day };
}

/** Clock bands. Night starts at 8 PM; 5-7 PM is "evening" (sunset art), falling back to day/night art. */
export function timeBand(hour) {
    if (hour == null) return null;
    if (hour >= 6 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20) return 'evening';
    return 'night';
}

// Weather and crowd words. Kept narrow on purpose: the old check counted "wet", "soaked" and "drenched"
// as rain, which in this setting fired on half the sex scenes.
const RAIN = /\b(?:rain(?:ing|fall|drops?|y|storm|water|coat)?|drizzl(?:e|ing)|downpour|thunderstorm|monsoon|pouring outside)\b/i;
const SNOW = /\b(?:snow(?:ing|fall|flakes?|y|drifts?|storm|man|ed)?|blizzard|flurries|sleet|frost-covered)\b/i;
const EMPTY = /\b(?:deserted|empty|abandoned|nobody else|no one else|all alone|alone|closed for the night|after hours)\b/i;
const BUSY = /\b(?:crowd(?:ed|s)?|packed|bustling|busy|throngs?|full of people|lively)\b/i;
const CHRISTMAS = /\b(?:christmas|xmas|yule(?:tide)?|santa)\b/i;
const HALLOWEEN = /\b(?:halloween|trick or treat(?:ing|ers)?|jack o lanterns?|jack-o-lanterns?)\b/i;
const OUTSIDE = ['outside', 'exterior', 'outdoor', 'outdoors', 'outer', 'out front', 'front of', 'in front', 'front steps', 'front yard', 'front porch', 'courtyard', 'lawn', 'sidewalk', 'parking lot', 'parking'];
const INSIDE = ['inside', 'interior', 'indoor', 'indoors', 'within'];
// Tokenized once on first use instead of on every reply (low-end phones)
let outsideCache, insideCache;
const outsideTokens = () => (outsideCache ??= OUTSIDE.map(p => tokensOf(normalize(p))));
const insideTokens = () => (insideCache ??= INSIDE.map(p => tokensOf(normalize(p))));

/**
 * Everything the picker needs from one reply.
 * @param {string} text the reply (header + body)
 * @param {{ userName?: string }} [opts]
 * @returns {null | {
 *   location: string, segments: string[][], extras: string[][], hour: number|null, band: string|null,
 *   month: number|null, day: number|null, side: 'in'|'out'|null, rain: boolean, snow: boolean,
 *   empty: boolean, busy: boolean, christmas: boolean, halloween: boolean }}
 */
export function readScene(text, opts = {}) {
    const lines = findHeaderLines(text);
    const header = parseHeader(lines);
    if (!header || !header.location) return null;
    // Only lines holding "¦" can be header lines, so only those get cleaned and compared (perf: replies are ~3k chars)
    const headerSet = new Set(lines);
    const body = afterPreparation(text).split(/\r?\n/)
        .filter(l => !(l.includes('¦') || l.includes('~')) || !headerSet.has(l.replace(/<[^>]*>/g, '').replace(/[*_`]/g, '').trim()))
        .join('\n');
    const plainBody = body.replace(/snow[- ]white/gi, '');
    // Segment breaks; a slash between digits is part of a name ("7/11"), not a break. "Clearing Near the
    // Greenhouse" is a clearing: what follows near/behind/beside is only a landmark, unless it opens the segment.
    const landmark = (t) => {
        const i = t.findIndex((x, idx) => idx > 0 && (x === 'near' || x === 'behind' || x === 'beside' || (x === 'next' && t[idx + 1] === 'to') || (x === 'across' && t[idx + 1] === 'from')));
        return i > 0 ? t.slice(0, i) : t;
    };
    const segs = (s) => s.split(/[,;|()[\]:–—]|\s-\s|(?<!\d)\/|\/(?!\d)/).map(x => landmark(tokensOf(normalize(x, opts.userName)))).filter(t => t.length);
    const segments = segs(header.location);
    const flat = segments.flat();
    const has = (list) => list.some(p => containsPhrase(segments, p));
    const hour = parseHour(header.time);
    const { month, day } = parseDate(header.date);
    const side = has(outsideTokens()) ? 'out' : has(insideTokens()) ? 'in' : null;
    const locText = flat.join(' ');
    return {
        location: header.location,
        segments,
        extras: header.extras.flatMap(segs),
        hour,
        band: timeBand(hour),
        month,
        day,
        side,
        rain: RAIN.test(plainBody) || /\brain/.test(locText),
        snow: SNOW.test(plainBody) || /\bsnow/.test(locText),
        empty: EMPTY.test(plainBody) || /\b(?:empty|deserted|closed|abandoned)\b/.test(locText),
        busy: BUSY.test(plainBody) || /\b(?:crowded|busy|packed)\b/.test(locText),
        christmas: month === 12 || CHRISTMAS.test(plainBody) || CHRISTMAS.test(header.location),
        halloween: month === 10 || HALLOWEEN.test(plainBody) || HALLOWEEN.test(header.location),
    };
}

// ── Phrase matching ──────────────────────────────────────────────────────────

/** Words that make "<word> room" a kind of room, not somebody's room ("Living Room" is not Living's). */
const NOT_A_NAME = new Set(['living', 'dining', 'sitting', 'throne', 'common', 'laundry', 'locker', 'waiting', 'class', 'rec',
    'study', 'observation', 'hotel', 'spare', 'guest', 'front', 'back', 'break', 'control', 'server', 'training', 'changing',
    'boiler', 'music', 'game', 'gaming', 'family', 'dorm', 'bed', 'bath', 'shower', 'rest', 'powder', 'storage', 'store', 'stock',
    'war', 'meeting', 'conference', 'interrogation', 'exam', 'examination', 'treatment', 'hospital', 'operating', 'recovery',
    'emergency', 'motel', 'karaoke', 'escape', 'panic', 'throne', 'drawing', 'reading', 'tea', 'green', 'dressing', 'fitting',
    'utility', 'mud', 'engine', 'chart', 'ball', 'banquet', 'living', 'shared', 'empty', 'dark', 'small', 'big', 'my', 'our',
    'the', 'a', 'their', 'his', 'her', 'same', 'next', 'other', 'single', 'double', 'private', 'vip', 'pool', 'billiard',
    'school', 'art', 'computer', 'media', 'mail', 'copy', 'print', 'lunch', 'staff', 'teacher', 'nurse', 'stream', 'streaming',
    'party', 'sex', 'play', 'red', 'white', 'black', 'blue', 'quiet', 'study', 'hall', 'student', 'hostel', 'cabin', 'tent']);

/** Consecutive tokens inside one segment ("room 271" does not span "Kitchen, Room"). */
function containsPhrase(segments, phrase) {
    if (!phrase.length) return false;
    for (const seg of segments) {
        outer: for (let i = 0; i + phrase.length <= seg.length; i++) {
            for (let j = 0; j < phrase.length; j++) {
                const want = phrase[j];
                const got = seg[i + j];
                if (want === '*') { if (NOT_A_NAME.has(got)) continue outer; continue; } // "* room" = "Starfire's Room"
                if (want === '#num' ? !/^\d{3}$/.test(got) : want !== got) continue outer;
            }
            return true;
        }
    }
    return false;
}

const compiled = new WeakMap();
const compileMemo = new Map();
/** Catalog phrase -> matcher: "a b" (consecutive), "=bar" (a whole segment), [..] (all, anywhere), {num}. */
function compile(phrase) {
    const key = typeof phrase === 'string' ? phrase : JSON.stringify(phrase);
    let m = compileMemo.get(key);
    if (!m) { m = compileUncached(phrase); compileMemo.set(key, m); }
    return m;
}
function compileUncached(phrase) {
    if (typeof phrase === 'object' && phrase !== null && !Array.isArray(phrase)) return { kind: 'seq', tokens: ['#num'], size: 1 };
    if (Array.isArray(phrase)) {
        const parts = phrase.map(compile);
        return { kind: 'all', parts, size: parts.reduce((n, p) => n + p.size, 0) };
    }
    if (phrase.startsWith('=')) {
        const tokens = tokensOf(normalize(phrase.slice(1)));
        return { kind: 'segment', tokens, size: tokens.length };
    }
    const tokens = tokensOf(normalize(phrase));
    return { kind: 'seq', tokens, size: tokens.length };
}
function matches(m, segments) {
    if (m.kind === 'seq') return containsPhrase(segments, m.tokens);
    if (m.kind === 'segment') return segments.some(s => s.join(' ') === m.tokens.join(' '));
    return m.parts.every(p => matches(p, segments));
}
function matchers(place, key) {
    let cache = compiled.get(place);
    if (!cache) { cache = {}; compiled.set(place, cache); }
    if (!cache[key]) cache[key] = (place[key] || []).map(p => ({ phrase: p, m: compile(p) }));
    return cache[key];
}
/**
 * Perf index: the words a place's phrases START with. A place none of whose first words appear in the
 * location can't match, so chooseBackground skips it without running the phrase matcher (most of the
 * ~230 places, on most replies). Places with a phrase starting on "*" or a room number are always checked.
 */
const firstWords = new WeakMap();
function placeFirstWords(place) {
    let entry = firstWords.get(place);
    if (entry) return entry;
    const words = new Set();
    let always = false;
    const first = (m) => (m.kind === 'all' ? first(m.parts[0]) : m.tokens[0]);
    for (const key of ['names', 'words', 'owners']) {
        for (const x of matchers(place, key)) {
            const w = first(x.m);
            if (w === undefined || w === '*' || w === '#num') always = true;
            else words.add(w);
        }
    }
    entry = { words, always };
    firstWords.set(place, entry);
    return entry;
}

/** Best (largest) matching phrase of one list, or null. */
function bestMatch(place, key, segments) {
    let best = null;
    for (const x of matchers(place, key)) {
        if (matches(x.m, segments) && (!best || x.m.size > best.m.size)) best = x;
    }
    return best;
}

// ── Picking ──────────────────────────────────────────────────────────────────

const TIER = { names: 100, words: 40, owners: 20 };
const AREA_BONUS = { explicit: 300, home: 300, memory: 60 };
const AREA_FALLBACK_SCORE = 95; // beats a generic noun match, loses to any specific name
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'our', 'my', 'his', 'her', 'their', 'player']);

/**
 * @param {ReturnType<typeof readScene>} scene
 * @param {{ card?: string, chatId?: string, previousPlace?: string, previousFile?: string,
 *           places?: any[], areas?: any[] }} [opts]
 * @returns {null | { file: string, placeId: string, area: string|null, score: number, why: string }}
 */
export function chooseBackground(scene, opts = {}) {
    if (!scene) return null;
    const places = opts.places || PLACES;
    const areas = opts.areas || AREAS;
    const segs = scene.segments;
    const any = (list) => (list || []).some(p => matches(compile(p), segs) || matches(compile(p), scene.extras));
    const previous = opts.previousPlace ? places.find(p => p.id === opts.previousPlace) : null;

    /** @type {Record<string, 'explicit'|'home'|'memory'>} */
    const active = {};
    for (const a of areas) {
        if (any(a.names)) active[a.id] = 'explicit';
        else if (a.cardNames && a.cardNames.cards.includes(opts.card) && any(a.cardNames.names)) active[a.id] = 'home';
        else if (a.homeCards?.includes(opts.card)) active[a.id] = 'home';
        else if (previous?.area === a.id) active[a.id] = 'memory';
    }

    const candidates = [];
    const locWords = new Set(segs.flat());
    places.forEach((place, index) => {
        if (place.area && !active[place.area]) return;
        const fw = placeFirstWords(place);
        if (!fw.always && ![...fw.words].some(w => locWords.has(w))) return;
        let hit = null;
        for (const key of ['names', 'words', 'owners']) {
            const m = bestMatch(place, key, segs);
            if (m) { hit = { key, ...m }; break; }
        }
        if (!hit) return;
        if (place.needs && !any(place.needs)) return;
        let score = TIER[hit.key] + 10 * hit.m.size;
        // English puts the head noun last: "Dorm Hallway" is a hallway, "Shared Dorm" is a dorm.
        if (hit.m.kind === 'seq' && segs.some(seg => seg.length >= hit.m.size && seg.slice(-hit.m.size).every((t, i) => hit.m.tokens[i] === '*' || hit.m.tokens[i] === t))) score += 5;
        if (place.rank === 0) score -= 15; // a room named inside a dwelling beats the dwelling
        if (place.rank === 2) score += 15;
        if (place.area) score += AREA_BONUS[active[place.area]];
        if (place.scope === 'building' && scene.side !== 'out') score -= 1000;
        if (scene.side === 'out' && place.side === 'in' && !(place.variants || []).some(x => x.side === 'out')) score -= 20;
        candidates.push({ place, index, score, hit });
    });

    // An area named on its own ("Karaveia Dun", "Kinsbane Manor") shows that area's main picture. Only when
    // nothing else matched by name or noun: "Flight JL062, Tokyo-Bound" is a plane, not a Tokyo street.
    const realMatch = candidates.some(c => c.hit.key === 'names' || c.hit.key === 'words');
    for (const a of areas) {
        if (active[a.id] !== 'explicit' || !a.fallback || realMatch) continue;
        if (candidates.some(c => c.place.area === a.id)) continue;
        const place = places.find(p => p.id === a.fallback);
        if (place) candidates.push({ place, index: places.indexOf(place), score: AREA_FALLBACK_SCORE, hit: { key: 'area', phrase: a.id } });
    }

    if (!candidates.length) return null;
    candidates.sort((x, y) => y.score - x.score || x.index - y.index);
    let best = candidates[0];

    // "Kitchen" right after "Hannah's Apartment": still Hannah's apartment, not the dorm kitchen. Only when
    // the location is JUST the room word; "Sterling Hall, 3rd Floor Hallway" names somewhere else.
    const meaningful = segs.flat().filter(t => !STOPWORDS.has(t)).length;
    if (previous && previous.rank === 0 && best.hit.key === 'words' && HOME_ROOMS.includes(best.place.id) && meaningful <= best.hit.m.size) {
        best = { place: previous, index: places.indexOf(previous), score: best.score, hit: { key: 'home', phrase: best.hit.phrase } };
    }

    const variant = pickVariant(best.place, scene, opts);
    if (!variant) return null;
    const label = Array.isArray(best.hit.phrase) ? best.hit.phrase.map(p => (typeof p === 'string' ? p : '#')).join('+') : String(best.hit.phrase);
    return {
        file: variant.file,
        placeId: best.place.id,
        area: best.place.area || null,
        score: best.score,
        why: `"${scene.location}" -> ${best.place.id} (${best.hit.key}: ${label}) -> ${variant.file} [${variant.why}]`,
    };
}

/**
 * Score each variant against the scene and pick the best. Variants that tie are alts of one scene: the one
 * on screen is kept while the scene stays at this place, otherwise one is rolled (opts.rng, for tests).
 * @returns {{ file: string, why: string } | null}
 */
export function pickVariant(place, scene, opts = {}) {
    const vars = place.variants || [];
    if (!vars.length) return null;
    const segs = scene.segments;
    const phraseHit = (list) => (list || []).some(p => matches(compile(p), segs));
    const wantSide = scene.side || place.side || null;
    // When a place has inside AND outside shots, an unmarked variant counts as the place's usual side, so
    // "Outside Lecture Hall" can't land on the auditorium just because the word "lecture" is preferred.
    const mixed = vars.some(x => x.side && x.side !== place.side);
    const scored = vars.map(vr => {
        const side = vr.side || (mixed ? place.side : undefined);
        let s = 0;
        const notes = [];
        if (vr.when) { if (phraseHit(vr.when)) { s += 100; notes.push('when'); } else s -= 100; }
        if (vr.text) { s += scene.textHits?.(vr.text) ? 60 : -60; }
        if (vr.prefer && phraseHit(vr.prefer)) { s += 50; notes.push('prefer'); }
        if (vr.time) {
            const band = scene.band;
            if (!band) { if (vr.time === 'night') s -= 10; }
            else if (vr.time === band) { s += 20; notes.push(band); }
            else if (band === 'evening') s += (vr.time === 'night' ? (scene.hour >= 19 ? 5 : -5) : (scene.hour < 19 ? 5 : -5));
            else if (vr.time === 'evening') s -= 10;
            else s -= 40;
        }
        if (side) {
            if (side === wantSide) { s += scene.side ? 60 : 5; if (scene.side) notes.push(side === 'out' ? 'outside' : 'inside'); }
            // unmarked header: the wrong side must cost more than a matching clock earns ("Corner Store" at
            // 2 PM is the store's inside, not its daytime parking lot)
            else s -= scene.side ? 60 : 30;
        }
        if (vr.weather === 'rain') { s += scene.rain ? 40 : -25; if (scene.rain) notes.push('rain'); }
        if (vr.weather === 'overcast') s -= 2;
        if (vr.season === 'christmas') { s += scene.christmas ? 60 : -80; if (scene.christmas) notes.push('christmas'); }
        if (vr.season === 'halloween') { s += scene.halloween ? 60 : -80; if (scene.halloween) notes.push('halloween'); }
        if (vr.season === 'winter') { s += scene.snow ? 45 : -60; if (scene.snow) notes.push('snow'); }
        if (vr.season === 'autumn') { if (scene.month >= 9 && scene.month <= 11) { s += 15; notes.push('autumn'); } else s -= 5; }
        if (vr.crowd === 'empty') s += scene.empty ? 15 : (scene.busy ? -10 : 0);
        if (vr.crowd === 'busy') s += scene.busy ? 15 : (scene.empty ? -10 : 0);
        return { vr, s, notes };
    });
    const top = Math.max(...scored.map(x => x.s));
    const tied = scored.filter(x => x.s === top);
    // Alts: hold the shot already on screen while the scene stays here; roll a fresh one on arrival.
    let pick = opts.previousPlace === place.id ? tied.find(x => x.vr.file === opts.previousFile) : undefined;
    if (!pick) pick = tied[Math.min(tied.length - 1, Math.floor((opts.rng || Math.random)() * tied.length))];
    const notes = pick.notes.join(', ');
    const alts = tied.length > 1 ? `${notes ? '; ' : ''}1 of ${tied.length} alts` : '';
    return { file: pick.vr.file, why: (notes + alts) || 'only picture' };
}

/**
 * One call for index.js: reply text in, decision out.
 * @param {string} text
 * @param {{ userName?: string, card?: string, chatId?: string, previousPlace?: string, previousFile?: string }} [opts]
 */
export function pickBackgroundForReply(text, opts = {}) {
    const scene = readScene(text, opts);
    if (!scene) return { scene: null, pick: null };
    // Normalizing the whole reply costs more than everything else here, and only a "text:" variant needs it
    // (the Exchange's DJ-Mika shot), so it happens on first use.
    let lowered = null;
    scene.textHits = (list) => {
        if (lowered === null) lowered = ` ${normalize(text)} `;
        return list.some(p => lowered.includes(` ${normalize(p)} `));
    };
    return { scene, pick: chooseBackground(scene, opts) };
}
