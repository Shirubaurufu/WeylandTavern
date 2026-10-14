// Data side of the Dorm Layouts directory (dorm-directory.js draws it). Pure functions only, so the
// parsing and searching are unit-tested (Weyland-WeyPhone/test/dormDirectory.test.js).
//
// Sources, both owned by the team and edited without touching this code:
//   - who lives where: cast.weybooru.com/data/data.json (the Character Info site). Each character's
//     "home" reads like "[[Sterling Hall]], Room 292"; anything else is "lives elsewhere".
//   - the floor plans: Weylandpedia's dorm.md, one "# Title" + <img> per floor.
// Only the room positions are fixed here, because they are the building itself: every floor of
// Sterling Hall has the same layout, so one map (by the room number's last two digits) pins any
// room on any floor. Measured against the real plans, 2026-10-09.

/** Room label centres, as % of the floor plan image (3908 x 2546). */
export const ROOM_POSITIONS = Object.freeze({
    // West wing, outer column
    '68': [7.81, 9.50], '70': [7.81, 14.68], '72': [7.81, 19.96], '74': [7.81, 25.14],
    '76': [7.81, 40.50], '78': [7.81, 45.87], '80': [7.81, 50.96], '82': [7.81, 56.14],
    // West wing, inner column
    '67': [20.19, 9.50], '69': [20.19, 14.68], '71': [20.19, 19.96], '73': [20.19, 25.14],
    '75': [20.19, 40.50], '77': [20.19, 45.87],
    // West courtyard row and the long south-west corridor
    '79': [27.00, 52.69], '81': [30.38, 52.69], '83': [43.94, 52.69],
    '84': [27.00, 73.51], '86': [30.44, 73.51], '88': [33.81, 73.51], '90': [37.13, 73.51], '92': [40.50, 73.51], '94': [43.94, 73.51],
    // East wing, inner column
    '02': [79.88, 9.50], '04': [79.88, 14.68], '06': [79.88, 19.96], '08': [79.88, 25.14],
    '10': [79.88, 40.50], '12': [79.88, 45.87],
    // East wing, outer column
    '03': [92.13, 9.50], '05': [92.13, 14.68], '07': [92.13, 19.96], '09': [92.13, 25.14],
    '11': [92.13, 40.50], '13': [92.13, 45.87], '15': [92.13, 50.96], '17': [92.13, 56.14],
    // East courtyard row and the long south-east corridor
    '18': [56.06, 52.69], '16': [69.56, 52.69], '14': [73.00, 52.69],
    '29': [56.06, 73.51], '27': [59.44, 73.51], '25': [62.81, 73.51], '23': [66.19, 73.51], '21': [69.56, 73.51], '19': [73.00, 73.51],
});

/** Size of one room label box, as % of the plan (for the highlight ring). */
export const ROOM_BOX = Object.freeze({ width: 3.6, height: 3.4 });

const CAST_PHOTO = 'https://cast.weybooru.com/images/photos/';

/**
 * Homes that differ from the cast site until it is updated, by the character's full name there.
 * Jenn moves in with Lucy after the first day of classes (Lucky, 2026-10-09); the cast site still
 * lists her starting room (276, Kris's). Delete an entry once data.json says the same thing.
 * The Residence Directory (Weyland-WeyPhone/maps/weyland_dorms.html) keeps the same list.
 */
export const HOME_OVERRIDES = Object.freeze({
    'Jenn Morrison': 'Sterling Hall, Room 268',
});

/** "[[Sterling Hall]]" / "[[BBB:Black Barrel Bar]]" -> plain text (the cast site's link syntax). */
export function plainText(value) {
    const text = typeof value === 'string' ? value : (value?.name ?? '');
    return String(text).replace(/\[\[([^\]:]+)(?::([^\]]+))?\]\]/g, (_, a, b) => b || a).trim();
}

/** "Room 277 1/2" -> { room: '277½', floor: 2, key: '77' }; null when it is not a Sterling Hall room. */
export function parseSterlingRoom(home) {
    const match = plainText(home).match(/Sterling Hall\s*,?\s*Room\s*(\d)(\d{2})(\s*1\/2)?/i);
    if (!match) return null;
    return { room: `${match[1]}${match[2]}${match[3] ? '½' : ''}`, floor: Number(match[1]), key: match[2] };
}

/**
 * Residents of Sterling Hall and everyone who lives elsewhere, from the cast site's data.json.
 * @param {any} castData parsed data.json ({ values: [['character', {...}], ...] })
 */
export function parseResidents(castData) {
    const characters = Array.isArray(castData?.values)
        ? castData.values.find(v => Array.isArray(v) && v[0] === 'character')?.[1] ?? {}
        : {};
    const residents = [];
    const elsewhere = [];
    for (const raw of Object.values(characters)) {
        const name = plainText(raw?.name);
        if (!name) continue;
        const image = typeof raw.image === 'string' && raw.image.trim() ? `${CAST_PHOTO}${raw.image.trim()}.webp` : '';
        const rawHome = HOME_OVERRIDES[name] ?? raw.home;
        const home = plainText(rawHome);
        const summary = plainText(raw.summary);
        const room = parseSterlingRoom(rawHome);
        if (room) residents.push({ name, first: firstName(name), image, summary, ...room, roommates: [] });
        else if (home) elsewhere.push({ name, first: firstName(name), image, summary, home });
    }
    // Roommates: everyone sharing the exact room (Vera and Fasti, Kai and Kiera...).
    for (const resident of residents) {
        resident.roommates = residents.filter(other => other !== resident && other.room === resident.room).map(other => other.first);
    }
    const byRoom = (a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }) || a.name.localeCompare(b.name);
    residents.sort(byRoom);
    elsewhere.sort((a, b) => a.name.localeCompare(b.name));
    return { residents, elsewhere };
}

/** "Dakota Ash (Dash)" -> "Dash"; "Vera Oribasa" -> "Vera". The name people actually use. */
export function firstName(name) {
    const nick = String(name).match(/\(([^)]+)\)/);
    if (nick) return nick[1].trim();
    return String(name).split(/\s+/)[0];
}

/**
 * The floors from Weylandpedia's dorm.md: each "# Title" followed by an <img src>.
 * @param {string} markdown
 * @returns {{ floor: number, title: string, image: string }[]}
 */
export function parseDormMarkdown(markdown) {
    const floors = [];
    const sections = String(markdown ?? '').split(/^#\s+/m).slice(1);
    for (const section of sections) {
        const title = section.split('\n')[0].trim();
        const image = section.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? section.match(/!\[[^\]]*\]\(([^)\s]+)/)?.[1];
        if (!image) continue;
        const ordinal = title.match(/(\d+)(?:st|nd|rd|th)\s+floor/i)?.[1];
        floors.push({ floor: ordinal ? Number(ordinal) : floors.length + 1, title, image });
    }
    return floors;
}

/**
 * Search across names, nicknames, rooms ("292", "29"), roommates and, for people who live
 * elsewhere, where they live ("caravan"). Empty query = everyone.
 */
export function matchesQuery(person, query) {
    const q = String(query ?? '').trim().toLowerCase();
    if (!q) return true;
    const haystack = [person.name, person.first, person.room, person.home, person.summary, ...(person.roommates ?? [])]
        .filter(Boolean).join(' ').toLowerCase();
    return q.split(/\s+/).every(word => haystack.includes(word));
}

/** How a floor is written in the UI: 1 -> "1st". */
export function ordinal(n) {
    const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
    return `${n}${suffix}`;
}
