/**
 * Auto-background catalog: every file in data/default-user/backgrounds, grouped into PLACES.
 * Read by src/autoBackground.js. Plain data, no imports, so the Node tests and tools/bg-replay.mjs
 * can load it too.
 *
 * Built 2026-11-04 by looking at every image (not from the filenames, which are often wrong: "lecture
 * hall.avif" is a brick building's exterior, "Mama Den.avif" is the bar's outside, "Soft Pike Day" is dusk).
 *
 * HOW A PLACE MATCHES the location field of the reply header (see autoBackground.js for the scoring):
 *   names   - specific phrases ("black barrel", "sakurai cafe"). Strongest. An inner array means
 *             "all of these words, anywhere in the location" (["apartment", "kitchen"]).
 *   words   - generic nouns for the kind of place ("bar", "pub", "tavern"). Weaker than names.
 *   owners  - a character's name on its own ("Hannah" -> her apartment). Weakest; anything else wins.
 *   area    - the place only exists inside that area (Kinsbane Manor, Karaveia Dun...), see AREAS.
 *   scope   - "building" = an outside view of a whole building ("Sterling Hall"). Only used when the
 *             location says outside/exterior, or nothing more specific matched.
 *   rank    - 0 = a whole dwelling ("apartment", "house"), so a room inside it ("kitchen") beats it.
 *   needs   - at least one of these phrases must ALSO appear, or the place can't match at all.
 *   side    - "in"/"out": what the place's images mostly show (used when the header doesn't say).
 *
 * VARIANTS (one picked per place, see pickVariant in autoBackground.js):
 *   time    - "day" | "evening" | "night"            (from the header clock)
 *   side    - "in" | "out"                            (outside/exterior words in the location)
 *   weather - "rain" | "snow"                         (weather words in the reply text)
 *   season  - "christmas" | "halloween" | "winter"    (header date, or the word in the text)
 *   crowd   - "empty" | "busy"
 *   prefer  - phrases in the location that pull toward this variant ("=bar" = a whole segment that is
 *             exactly "bar"); when - same, but REQUIRED; text - phrases required in the reply body.
 * Variants that tie are ALTS (Lucky, 2026-11-04: "2 party pics depicting the same party, it could hit either
 * of them"): one is rolled each time the scene arrives at the place, then it holds while the scene stays
 * there, so the picture doesn't flicker every message but a return visit can show the other shot.
 *
 * Adding a background: drop the file in, then add it as a variant of an existing place or as a new
 * place. test/autoBackground.test.js fails if a file on disk is neither in here nor in RETIRED.
 */

const v = (file, cond = {}) => ({ file, ...cond });

/** Dorm rooms the art belongs to. Room numbers are the ones the old ladder used (Sterling Hall). */
function dormRoom(id, people, rooms, variants) {
    const names = [];
    for (const p of people) names.push(`${p} room`, `${p} dorm`, `${p} dorm room`, `${p} bedroom`);
    for (const r of rooms) names.push(`room ${r}`, `${r}`);
    // "player" stays out of owners: "Lucky's Apartment" alone must not mean the dorm room
    return { id, names, owners: people.filter(p => p !== 'player'), variants: variants.map(f => (typeof f === 'string' ? v(f) : f)), side: 'in' };
}

/** Apartment + bedroom pair for side characters who live off campus. */
function apartmentPair(id, people, apartment, bedroom) {
    const keys = people.map(p => p.toLowerCase());
    return [
        { id: `${id}-bedroom`, names: keys.flatMap(k => [`${k} bedroom`, `${k} room`, [k, 'bedroom'], [k, 'bed']]), variants: [v(bedroom)], side: 'in' },
        { id: `${id}-apartment`, names: keys.flatMap(k => [`${k} apartment`, `${k} place`, `${k} home`, `${k} house`, `${k} living room`, [k, 'apartment']]), owners: keys, rank: 0, variants: [v(apartment)], side: 'in' },
    ];
}

/**
 * Areas: groups of places that only make sense together. A place with `area` is only eligible
 * when its area is active:
 *   - its name is in the location ("Kinsbane Manor, Kitchen"), or
 *   - the chat's card lives there (`homeCards`: every Kinsbane scene is in the manor), or
 *   - `cardNames`: for these cards, these extra words also count (Ellie + "estate"; old rule).
 * Active areas also boost their places over generic ones ("Kitchen" in a Kinsbane chat = kb kitchen).
 * `fallback` = the place to show when the area is named but nothing inside it matched.
 */
export const AREAS = [
    { id: 'kinsbane', names: ['kinsbane', 'kinsbane manor', 'manor', 'fort aiko'], homeCards: ['Kinsbane Manor', 'Aiko'], fallback: 'kb-front' },
    { id: 'karaveia', names: ['karaveia', 'karaveia dun'], fallback: 'karaveia-communal' },
    { id: 'somnia', names: ['somnia'], fallback: 'somnia-lounge' },
    { id: 'caravan', names: ['caravan'], fallback: 'caravan-ring' },
    { id: 'japan', names: ['japan', 'japanese', 'tokyo', 'kyoto', 'osaka'], fallback: 'japanese-city' },
    { id: 'tomoryu', names: ['tomoryu', 'tomoryu estate'], cardNames: { cards: ['Ellie'], names: ['estate', 'castle', 'ellie'] }, fallback: 'estate-bedroom' },
    { id: 'research', names: ['muse experiment', 'habitat'], homeCards: ['Muse'], fallback: 'observation-room' },
    { id: 'soft-pike', names: ['soft pike', 'trailer park', 'pike trailer park'], cardNames: { cards: ['Cerberus Sisters'], names: ['trailer'] }, fallback: 'soft-pike' },
];

export const PLACES = [
    // ── Kinsbane Manor (Kinsbane Manor and Aiko cards, or "Kinsbane"/"Manor" in the header) ──
    { id: 'kb-inside-treehouse', area: 'kinsbane', names: [['inside', 'treehouse'], ['treehouse', 'interior'], ['inside', 'fort aiko'], ['fort aiko', 'interior'], ['in', 'treehouse']], rank: 2, variants: [v('kb inside treehouse.avif')] },
    { id: 'kb-treehouse', area: 'kinsbane', names: ['treehouse', 'fort aiko'], variants: [v('kb treehouse.avif')], side: 'out' },
    { id: 'kb-aiko-room', area: 'kinsbane', names: ['aiko room', 'aiko bedroom', 'locked room', 'locked door'], owners: ['aiko'], variants: [v('kb aiko room.avif')] },
    { id: 'kb-garden', area: 'kinsbane', words: ['garden', 'well', 'backyard', 'back yard', 'grounds'], variants: [v('kb garden.avif')], side: 'out' },
    { id: 'kb-driveway', area: 'kinsbane', words: ['driveway', 'gate', 'road', 'car'], variants: [v('kb driveway.avif')], side: 'out' },
    { id: 'kb-entry', area: 'kinsbane', names: ['entrance hall', 'entry hall', 'manor entry', 'front hall', 'foyer', 'entryway', 'front door'], words: ['entry', 'entrance'], variants: [v('kb entry.avif')] },
    { id: 'kb-upstairs', area: 'kinsbane', words: ['upstairs', 'landing', 'second floor', '2nd floor', 'hall', 'hallway', 'corridor', 'stairs', 'staircase', 'stairwell'], variants: [v('kb upstairs.avif')] },
    { id: 'kb-study', area: 'kinsbane', words: ['study', 'office', 'library', 'desk'], variants: [v('kb study.avif')] },
    { id: 'kb-living-room', area: 'kinsbane', words: ['living room', 'sitting room', 'parlor', 'parlour', 'lounge', 'living', 'den', 'fireplace'], variants: [v('kb living room.avif')] },
    { id: 'kb-kitchen', area: 'kinsbane', words: ['kitchen', 'pantry', 'dining', 'dining room', 'dining hall'], variants: [v('kb kitchen.avif')] },
    { id: 'kb-greenhouse', area: 'kinsbane', words: ['greenhouse', 'conservatory'], variants: [v('kb greenhouse.avif')] },
    { id: 'kb-basement', area: 'kinsbane', words: ['basement', 'cellar'], variants: [v('kb basement.avif')] },
    { id: 'kb-master-bath', area: 'kinsbane', words: ['bath', 'bathroom', 'master bath', 'bathtub', 'shower'], variants: [v('kb master bath.avif')] },
    { id: 'kb-master-bed', area: 'kinsbane', words: ['bedroom', 'master bedroom', 'master', 'parent', 'parents', 'bed'], variants: [v('kb master bed.avif')] },
    { id: 'kb-front', area: 'kinsbane', names: [['manor', 'exterior'], ['outside', 'manor'], ['kinsbane', 'exterior'], ['outside', 'kinsbane']], words: ['porch', 'front porch', 'front yard', 'front steps', 'front'], variants: [v('kb front.avif')], side: 'out' },

    // ── Karaveia Dun ──
    { id: 'karaveia-dining', area: 'karaveia', words: ['dining', 'dining area', 'dining hall', 'kitchen', 'mess hall', 'feast'], variants: [v('Karaveia Dun Dining Area.avif')] },
    { id: 'karaveia-greenhouse', area: 'karaveia', words: ['greenhouse', 'garden', 'farm'], variants: [v('Karaveia Dun Greenhouse.avif')] },
    { id: 'karaveia-entrance', area: 'karaveia', words: ['entrance', 'gate', 'outside', 'exterior', 'mountainside'], variants: [v('Karaveia Dun Entrance.avif')], side: 'out' },
    { id: 'karaveia-springs', area: 'karaveia', words: ['hot springs', 'hot spring', 'onsen', 'bathhouse', 'bath', 'baths', 'springs'], variants: [v('Karaveia Dun Hot Springs.avif')] },
    { id: 'karaveia-residence', area: 'karaveia', words: ['residence', 'bedroom', 'quarters', 'room', 'home', 'house'], variants: [v('Karaveia Dun Residence.avif')] },
    { id: 'karaveia-halls', area: 'karaveia', words: ['hall', 'halls', 'hallway', 'corridor', 'tunnel', 'tunnels'], variants: [v('Karaveia Dun Halls.avif')] },
    { id: 'karaveia-communal', area: 'karaveia', words: ['communal', 'communal area', 'great hall', 'common area', 'common room'], variants: [v('Karaveia Dun Communal Area.avif')] },

    // ── Somnia ──
    { id: 'somnia-exterior', area: 'somnia', words: ['entrance', 'front door', 'outside', 'exterior', 'street'], variants: [v('somnia 1.avif', { time: 'day' }), v('Beach_Night.avif', { time: 'night' })], side: 'out' },
    { id: 'somnia-desk', area: 'somnia', words: ['front desk', 'reception', 'lobby', 'check in'], variants: [v('somnia 2.avif')] },
    { id: 'somnia-bar', area: 'somnia', words: ['bar', 'drinks'], variants: [v('somnia 3.avif')] },
    { id: 'somnia-kiosk', area: 'somnia', words: ['kiosk', 'kiosks', 'terminal', 'terminals', 'booking'], variants: [v('somnia 5.avif')] },
    { id: 'somnia-lounge', area: 'somnia', words: ['lounge', 'booth', 'booths', 'seating'], variants: [v('somnia 4.avif')] },

    // ── Bastet's caravan ──
    { id: 'caravan-inner-kitchen', area: 'caravan', names: ['inner ring kitchen'], words: ['kitchen', 'cookhouse', 'cook tent'], variants: [v('Inner Ring Kitchen.avif')] },
    { id: 'caravan-outer', area: 'caravan', words: ['outer', 'outer ring', 'outskirts', 'edge', 'camp'], variants: [v('caravan outer day.avif', { time: 'day' }), v('caravan outer night.avif', { time: 'night' })], side: 'out' },
    { id: 'caravan-ring', area: 'caravan', words: ['ring', 'inner ring', 'center', 'centre', 'market'], variants: [v('caravan ring day.avif', { time: 'day' }), v('caravan ring night.avif', { time: 'night' })], side: 'out' },
    { id: 'sunstone-pavilion', names: ['sunstone', 'sunstone pavilion', 'throne room'], variants: [v('Sunstone Pavilion Throne Room.avif')] },
    { id: 'moonstone-pavilion', names: ['moonstone', 'moonstone pavilion'], variants: [v('Moonstone Pavilion Sitting Area.avif')] },
    { id: 'temple-anubis', names: ['anubis', 'temple of anubis'], variants: [v('Temple of Anubis.avif')] },
    { id: 'temple-bastet', names: ['temple of bast', 'temple of bastet', 'bastet temple', 'bast temple'], variants: [v('Temple of Bastet.avif')] },
    { id: 'ahset-room', names: ['ahset room', 'ahset tent', 'ahset bedroom', 'ahset quarters'], owners: ['ahset'], variants: [v('Ahset_s Room.avif')] },
    { id: 'khepri-room', names: ['khepri room', 'khepri tent', 'khepri bedroom', 'khepri quarters'], owners: ['khepri'], variants: [v('Khepri_s Room.avif')] },
    { id: 'miu-room', names: ['miu room', 'miu tent', 'miu bedroom', 'miu den', 'miu nest'], owners: ['miu'], variants: [v('Miu_s Room.avif')] },
    { id: 'nefara-room', names: ['nefara room', 'nefara tent', 'nefara bedroom', 'nefara chambers'], owners: ['nefara'], variants: [v('Nefara_s Room.avif')] },
    { id: 'shani-room', names: ['shani room', 'shani tent', 'shani bedroom', 'shani quarters'], owners: ['shani'], variants: [v('Shani_s Room.avif')] },
    { id: 'sobek-room', names: ['sobek room', 'sobek tent', 'sobek bedroom', 'sobek quarters'], owners: ['sobek'], variants: [v('Sobek_s Room.avif')] },
    { id: 'bastet-gaming-room', names: ['gaming room', 'streaming room', 'stream room', 'bastet room', 'bastet bedroom', 'streaming setup', 'stream setup'], variants: [v('Bastet_s Gaming Room.avif')] },

    // ── Japan / Ellie's estate ──
    { id: 'japanese-countryside', area: 'japan', words: ['countryside', 'rural', 'rice field', 'rice fields', 'farm', 'village road'], variants: [v('Japanese Countryside.avif')], side: 'out' },
    { id: 'japanese-town', area: 'japan', words: ['town', 'village', 'old town'], variants: [v('Small Japanese Town.avif')], side: 'out' },
    { id: 'japanese-forest', area: 'japan', words: ['forest', 'woods', 'cedar'], variants: [v('Japanese Forest.avif')], side: 'out' },
    { id: 'japanese-mountain', area: 'japan', words: ['mountain', 'mount', 'trail', 'hike', 'hiking', 'summit', 'ridge'], variants: [v('Japanese Mountain Trail.avif')], side: 'out' },
    { id: 'japanese-city', area: 'japan', words: ['city', 'downtown', 'shibuya', 'shinjuku', 'akihabara', 'street'], variants: [v('Japanese City.avif')], side: 'out' },
    { id: 'torii-gates', names: ['torii', 'torii gate', 'torii gates', 'tori gate', 'tori gates', 'shrine path', 'shrine stairs', 'mountain shrine'], variants: [v('Mountain Tori Gates.avif')], side: 'out' },
    { id: 'estate-garden', area: 'tomoryu', words: ['garden', 'pond', 'koi', 'koi pond'], variants: [v('Japanese Estate Garden.avif')], side: 'out' },
    { id: 'estate-shrines-out', area: 'tomoryu', words: ['shrine', 'shrines', 'grave', 'graves', 'family shrine'], variants: [v('Japanese Estate Exterior Shrines.avif')], side: 'out' },
    { id: 'estate-shrine-room', area: 'tomoryu', names: ['shrine room', 'butsudan', 'altar', 'family altar', 'home shrine', ['inside', 'shrine'], ['interior', 'shrine']], rank: 2, variants: [v('Japanese Estate Interior Shrines.avif')] },
    { id: 'estate-engawa', area: 'tomoryu', words: ['engawa', 'veranda', 'verandah', 'porch'], variants: [v('Japanese Estate Engawa.avif')] },
    { id: 'estate-dining', area: 'tomoryu', words: ['dining', 'dining room', 'eating', 'meal', 'food', 'dinner', 'breakfast', 'lunch', 'kitchen'], variants: [v('Japanese Estate Dining Room.avif')] },
    { id: 'estate-ellie-room', area: 'tomoryu', names: ['ellie room', 'ellie bedroom'], owners: ['ellie'], variants: [v('Japanese Estate Ellie Bedroom.avif')] },
    { id: 'estate-bedroom', area: 'tomoryu', words: ['bedroom', 'guest room', 'tatami', 'room'], variants: [v('Japanese Estate Bedroom.avif')] },
    { id: 'japanese-garden-bench', names: ['blossom tree', 'cherry tree', 'cherry blossom', 'sakura tree', 'garden bench', 'japanese garden'], variants: [v('Japanese Garden Tree Bench.avif')], side: 'out' },

    // ── Muse / the Research Center ──
    { id: 'observation-room', area: 'research', names: ['observation room', 'observation window', 'observation deck', 'test chamber', 'containment'], words: ['habitat', 'observation', 'enclosure', 'chamber', 'monitoring', 'cell', 'bay', 'recovery', 'recovery wing', 'lab', 'testing'], variants: [v('observe.avif')] },
    { id: 'research-center', names: ['weyland research center', 'research center', 'research facility', 'wrc', 'weyland research'], rank: 0, variants: [
        v('Weyland Research Center.avif'),
        v('observe.avif', { when: ['bay', 'wing', 'recovery', 'annex', 'corridor', 'chamber', 'observation', 'containment', 'checkpoint', 'ward', 'habitat', 'cell'] }),
        v('Lab.avif', { when: ['lab', 'laboratory'] }),
    ], side: 'out' },

    // ── Soft Pike trailer park ──
    { id: 'trailer-interior', names: ['cerberus trailer', 'trailer 13', ['inside', 'trailer'], ['trailer', 'interior'], ['trailer', 'living room'], ['trailer', 'kitchen'], ['trailer', 'bedroom'], 'cerberus place', 'cerberus apartment'], words: ['trailer', 'mobile home', 'camper'], variants: [v('cerberus.avif')] },
    { id: 'trailer-exterior', names: [['outside', 'trailer'], ['trailer', 'exterior'], ['trailer', 'yard'], ['trailer', 'porch'], ['trailer', 'steps']], variants: [v('Soft Pike Day.avif', { time: 'day' }), v('Soft Pike Night.avif', { time: 'night' })], side: 'out' },
    { id: 'soft-pike-entrance', area: 'soft-pike', words: ['entrance', 'gate', 'sign'], variants: [v('Soft-Pike-Entrance.avif')], side: 'out' },
    { id: 'soft-pike', area: 'soft-pike', words: ['street', 'road', 'lot', 'outside', 'yard'], variants: [v('Soft Pike Day.avif', { time: 'day' }), v('Soft Pike Night.avif', { time: 'night' }), v('soft pike.avif', { prefer: ['abandoned', 'empty', 'rundown', 'run down', 'derelict'], weather: 'overcast' })], side: 'out' },

    // ── Named Weyland venues ──
    { id: 'black-barrel', names: ['black barrel', 'bbb', 'black barrel bar'], variants: [v('BBB.avif'), v('BBB Backroom.avif', { when: ['backroom', 'back room', 'storeroom', 'stockroom', 'storage', 'staff room', 'office', 'vip'] })], side: 'in' },
    { id: 'sakurai-cafe', names: ['sakurai', 'sakurai cafe'], variants: [
        v('Sakurai Cafe Day.avif', { time: 'day' }),
        v('Sakurai Cafe Night.avif', { time: 'night' }),
        v('sakurai cafe outside.avif', { side: 'out' }),
        v('sakurai cafe.avif', { when: ['=bar', 'bar counter', 'bar area', 'at the bar', 'behind the bar', 'sakurai bar', 'bartop'] }),
    ], side: 'in' },
    { id: 'rustwood-cafe', names: ['rustwood', 'rustwood cafe', 'rustwood coffee'], variants: [v('Rustwood Cafe 2.avif'), v('rustwood cafe.avif')], side: 'in' },
    { id: 'mamas-den', names: ['mama den', 'mamas den', 'mama', 'mamas'], variants: [v('Mamas Den.avif'), v('Mama Den.avif', { side: 'out' })], side: 'in' },
    { id: 'weyland-tavern', names: ['weyland tavern'], words: ['tavern', 'inn', 'taproom'], variants: [v('weyland tavern.avif', { crowd: 'busy' }), v('tavern day.avif', { crowd: 'empty', time: 'day' })], side: 'in' },
    { id: 'exchange-club', names: ['the exchange', 'exchange'], words: ['nightclub', 'night club', 'club', 'dance floor', 'rave', 'disco'], variants: [v('exchange.avif'), v('exchange 2.avif', { text: ['mika'], prefer: ['dj', 'dj booth', 'booth', 'stage'] })], side: 'in' },
    { id: 'kodo-bowl', names: ['kodo bowl', 'kodo'], words: ['amphitheater', 'amphitheatre', 'concert', 'outdoor stage'], variants: [v('Kodo_Bowl.avif')], side: 'out' },
    { id: 'brodlak', names: ['brodlak'], words: ['canteen', 'mess hall', 'cafeteria', 'dining hall'], variants: [v('Brodlak.avif')], side: 'in' },
    { id: 'kyomi', names: ['kyomi'], words: ['buffet'], variants: [v('Kyomi.avif')], side: 'in' },
    { id: 'tetsuya', names: ['tetsuya'], words: ['grocery', 'grocery store', 'supermarket', 'aisle', 'market'], variants: [v('Tetsuya_Aisle_FIn-1.avif', { crowd: 'busy' }), v('tetsuya.avif', { crowd: 'empty' })], side: 'in' },
    { id: 'red-lantern-ramen', names: ['red lantern'], words: ['ramen', 'ramen bar', 'ramen shop', 'noodle', 'noodles', 'noodle bar'], variants: [v('ramen.avif')], side: 'in' },
    { id: 'seneka-boulevard', names: ['seneka boulevard', 'seneka', 'senaka boulevard', 'senaka'], words: ['boulevard', 'shopping district', 'downtown'], variants: [v('Seneka_Boulevard.avif')], side: 'out' },
    { id: 'old-side-street', names: ['side street', 'old side street'], variants: [v('Old Side Street.avif')], side: 'out' },
    { id: 'the-old-oak', names: ['old oak', 'the old oak', 'oak tree', 'the oak'], variants: [v('The Old Oak.avif')], side: 'out' },
    { id: 'bellucci', names: ['bellucci', 'belluci', 'bellucci restaurant'], variants: [v('Fancy Restaurant.avif')], side: 'in' },
    { id: 'greasy-spoon', names: ['greasy spoon'], words: ['diner'], variants: [v('Diner-Interior.avif'), v('Diner Exterior.avif', { side: 'out' })], side: 'in' },
    { id: 'weymart', names: ['walmart', 'weymart', 'wal mart', 'superstore'], variants: [v('Walmart.avif')], side: 'in' },
    { id: 'costco', names: ['costco', 'weyco', 'wholesale', 'warehouse club', 'bulk store'], variants: [v('Costco.avif')], side: 'in' },
    { id: 'seven-eleven', names: ['7 eleven', 'seven eleven', '711', '7 11'], words: ['convenience store', 'corner store', 'konbini', 'gas station', 'minimart', 'mini mart', 'bodega', 'liquor store', 'deli'], variants: [
        v('seven eleven.avif', { side: 'in' }),
        v('711 Day.avif', { side: 'out', time: 'day' }),
        v('711 Night.avif', { side: 'out', time: 'night' }),
    ], side: 'in' },

    // ── Sterling Hall and dorm life ──
    dormRoom('blake-room', ['blake', 'player'], ['271'], ['blake room 3.avif']),
    dormRoom('serra-room', ['serra'], [], ['serra room 2.avif']),
    dormRoom('vera-room', ['vera', 'fasti'], ['292'], ['vera room 1.avif']),
    dormRoom('kai-room', ['kai', 'kiera'], ['273'], ['kai room.avif']),
    dormRoom('summer-room', ['summer'], ['279'], ['summer room 3.avif', v('summer room 2.avif', { time: 'night' })]),
    dormRoom('briar-room', ['briar'], ['309'], ['briar room.avif']),
    dormRoom('willow-room', ['willow'], ['383'], ['willow room.avif']),
    dormRoom('koshizu-room', ['koshizu'], ['280'], ['koshizu room.avif']),
    dormRoom('indigo-room', ['indigo'], ['284'], ['indigo room 2.avif']),
    dormRoom('belle-room', ['belle'], ['281'], ['belle room 2.avif']),
    dormRoom('nix-room', ['nix'], ['283'], ['nix room 4.avif', 'nix room 2.avif', 'nix room 3.avif']),
    dormRoom('mika-room', ['mika'], ['269'], ['mika room.avif']),
    dormRoom('cairo-room', ['cairo'], ['275'], ['cairo room.avif']),
    dormRoom('bianca-room', ['bianca'], ['290'], ['bianca room 3.avif', 'bianca room.avif']),
    dormRoom('lucy-room', ['lucy', 'jenn'], ['268'], ['lucy room 3.avif', 'lucy room 2.avif']),
    { id: 'dorm-room', names: ['dorm room', 'dormitory room', [{ num: true }, 'sterling'], 'residence hall room', ['* room', 'sterling'], ['* room', 'dorm'], ['* dorm', 'sterling']], words: ['dorm', 'dorms'], variants: [
        v('dorms 2.avif', { time: 'evening' }),
        v('dorms 3.avif', { time: 'night' }),
        v('dorms.avif', { time: 'day' }),
    ], side: 'in' },
    { id: 'sterling-hall', names: ['sterling hall', 'sterling', 'sterling dorm', 'sterling dormitory'], words: ['dormitory building', 'residence hall', 'dormitory'], scope: 'building', variants: [
        v('sterling.avif'),
        v('Sterling_Hall_Outside_1.avif', { prefer: ['entrance', 'front', 'door', 'steps'] }),
        v('Sterling_Hall_Outside_2.avif', { prefer: ['courtyard', 'quad', 'lawn'] }),
        v('Sterling_Hall_Outside_3.avif', { prefer: ['side', 'walkway', 'path', 'pathway', 'grounds'] }),
    ], side: 'out' },
    { id: 'common-room', names: ['common room', 'common area', 'commons', 'student union', 'student center', 'student centre', 'dorm lounge', 'student lounge', 'floor lounge', 'rec room', 'recreation room', ['sterling', 'lounge']], variants: [
        v('Common_Room.avif', { time: 'evening' }),
        v('Sterling_Hall_Inside_1.avif', { time: 'night' }),
        v('Sterling_Hall_Inside_2.avif', { time: 'day' }),
        v('Sterling_Hall_Christmas_1.avif', { season: 'christmas' }),
    ], side: 'in' },
    { id: 'dorm-hallway', words: ['hallway', 'hall way', 'corridor', 'lobby', 'elevator', 'floor'], needs: ['hallway', 'hall way', 'corridor', 'dorm', 'dormitory', 'sterling', 'apartment', 'door'], variants: [
        v('hallway.avif'), v('Sterling_Hall_Hallway_1.avif'), v('Sterling_Hall_Hallway_2.avif'),
    ], side: 'in' },
    { id: 'shared-bathroom', words: ['bathroom', 'restroom', 'toilet', 'washroom', 'showers', 'shower', 'shower room', 'stall', 'bathroom stall', 'lavatory'], variants: [v('shared bathroom 2.avif'), v('shared bathroom.avif')], side: 'in' },
    { id: 'laundry-room', names: ['laundry room', 'dorm laundry', ['sterling', 'laundry']], words: ['laundry'], variants: [v('laundry.avif')], side: 'in' },
    { id: 'laundromat', names: ['laundromat', 'coin laundry', 'laundrette'], variants: [v('Laundromat.avif')], side: 'in' },
    { id: 'kitchen', names: ['dorm kitchen', 'floor kitchen', 'communal kitchen', 'shared kitchen', 'culinary', 'cooking class', ['sterling', 'kitchen']], words: ['kitchen', 'kitchenette', 'cook', 'cooking'], variants: [v('Sterling_Hall_Inside_3.avif')], side: 'in' },
    { id: 'lounge', names: ['fireside lounge', 'fireplace lounge'], words: ['lounge', 'sitting room', 'parlor', 'parlour', 'fireplace'], variants: [v('lounge.avif')], side: 'in' },
    { id: 'stairwell', words: ['stairwell', 'staircase', 'stairs', 'stairway', 'landing', 'steps'], variants: [v('Stairwell.avif')], side: 'in' },

    // ── Campus ──
    { id: 'quad', names: ['quad', 'campus quad', 'main quad', 'clock tower'], words: ['campus', 'walkway', 'university', 'weyland university', 'campus green'], variants: [
        v('Quad.avif'),
        v('campus grounds.avif', { prefer: ['grounds', 'path', 'pathway', 'dormitory pathway'] }),
        v('weyland uni rain.avif', { weather: 'rain' }),
        v('weyland uni rain 2.avif', { weather: 'rain' }),
    ], scope: 'building', side: 'out' },
    { id: 'campus-building', names: ['lecture building', 'academic building', 'campus building', 'science building', 'hartley hall', 'kennedy hall'], scope: 'building', variants: [v('lecture hall.avif')], side: 'out' },
    { id: 'lecture-hall', names: ['lecture hall', 'auditorium', 'lecture room'], words: ['class', 'classroom', 'lecture', 'seminar', 'biology', 'calculus', 'chemistry', 'microbiology', 'ecology', 'psychology', 'history', 'english class', 'math'], variants: [
        v('Lecture Hall 2.avif', { prefer: ['lecture', 'auditorium', 'hall'] }),
        v('classroom.avif', { prefer: ['classroom', 'class', 'seminar', 'room'] }),
        v('lecture hall.avif', { side: 'out' }),
    ], side: 'in' },
    { id: 'art-class', names: ['art class', 'art room', 'art studio', 'art building', 'painting class', 'drawing class'], variants: [v('Art Class.avif')], side: 'in' },
    { id: 'workshop', words: ['workshop', 'crafts', 'craft room', 'maker space', 'makerspace', 'woodshop'], variants: [v('workshop.avif')], side: 'in' },
    { id: 'library', names: ['library nook', 'reading nook', 'study nook'], words: ['library', 'reading room', 'study hall', 'stacks', 'nook'], variants: [
        v('library.avif'), v('library nook.avif', { when: ['nook', 'corner', 'tower'] }),
    ], side: 'in' },
    { id: 'office', words: ['office', 'professor office', 'faculty office', 'admin office', 'dean office'], variants: [v('Office.avif')], side: 'in' },
    { id: 'lab', words: ['lab', 'laboratory', 'research lab', 'science lab', 'biology lab', 'chemistry lab'], variants: [v('Lab.avif')], side: 'in' },
    { id: 'observatory', words: ['observatory', 'telescope', 'planetarium'], variants: [v('Observatory.avif')], side: 'in' },
    { id: 'treatment', names: ['treatment facility', 'treatment room', 'clinic', 'medical center', 'medical wing'], words: ['treatment', 'medical', 'doctor', 'nurse', 'patient'], variants: [v('Treatment Facility.avif')], side: 'in' },
    { id: 'hospital', words: ['hospital', 'infirmary', 'hospital room', 'ward', 'er', 'emergency room', 'icu'], variants: [v('hospital.avif')], side: 'in' },
    { id: 'gym', words: ['gym', 'fitness center', 'weight room', 'workout room', 'weights', 'treadmill', 'cardio'], variants: [
        v('Gym 2.avif', { prefer: ['weight', 'weights', 'lifting', 'bench'] }),
        v('Gym.avif', { prefer: ['treadmill', 'cardio', 'running'] }),
    ], side: 'in' },
    { id: 'locker-room', words: ['locker room', 'locker', 'lockers', 'changing room'], variants: [v('Locker Room.avif')], side: 'in' },
    { id: 'rooftop', words: ['roof', 'rooftop', 'roof access'], variants: [v('Rooftop.avif')], side: 'out' },
    { id: 'rooftop-greenhouse', names: ['rooftop greenhouse', 'rooftop garden', ['roof', 'garden'], ['roof', 'greenhouse'], ['roof', 'sanctuary']], words: ['greenhouse', 'glasshouse'], variants: [v('Rooftop Greenhouse.avif')], side: 'in' },
    { id: 'arboretum', words: ['arboretum', 'botanical garden', 'botanical gardens', 'garden', 'gardens', 'flower garden'], variants: [v('Arboretum Day.avif', { time: 'day' }), v('Arboretum Night.avif', { time: 'night' })], side: 'out' },
    { id: 'construction', words: ['construction', 'construction site', 'jobsite', 'job site', 'worksite', 'building site'], variants: [v('construction.avif')], side: 'out' },

    // ── Homes ──
    ...apartmentPair('hannah', ['Hannah'], 'Hannah_s Apartment.avif', 'Hannah_s Bedroom.avif'),
    ...apartmentPair('warren', ['Warren'], 'Warren_s Apartment.avif', 'Warren_s Bedroom.avif'),
    ...apartmentPair('akiyama', ['Akiyama', 'Sayori'], 'Akiyama_s Apartment.avif', 'Akiyama_s Bedroom.avif'),
    ...apartmentPair('seth', ['Seth'], 'Seth_s Apartment.avif', 'Seth_s Bedroom.avif'),
    ...apartmentPair('rein-mark', ['Rein', 'Mark'], 'Rein and Mark Apartment.avif', 'Rein and Mark Bedroom.avif'),
    ...apartmentPair('gemini', ['Gemini'], 'Gemini_Apartment.avif', 'Gemini_Bedroom.avif'),
    ...apartmentPair('jericho', ['Jericho'], 'Jericho Apartment.avif', 'Jericho Bedroom.avif'),
    { id: 'apartment-complex', names: ['apartment complex', 'apartment building', 'apartments', 'hillenburg apartments', 'student housing', ['apartment', 'parking'], ['outside', 'apartment']], scope: 'building', variants: [
        v('Apartment Complex.avif', { time: 'evening' }), v('Apartment Complex 2.avif', { time: 'night' }),
    ], side: 'out' },
    { id: 'apartment', names: [['apartment', 'kitchen'], ['apartment', 'living room'], ['apartment', 'lounge'], ['apartment', 'couch']], words: ['apartment', 'flat', 'condo', 'unit', 'studio apartment', 'living room', 'family room', 'den', 'home', 'house'], rank: 0, variants: [v('Generic Apartment.avif')], side: 'in' },
    { id: 'bedroom', words: ['bedroom', 'bed', 'guest room'], owners: ['* room', '* bedroom'], variants: [v('Generic Bedroom.avif')], side: 'in' },
    { id: 'house-exterior', names: ['cul de sac', 'neighborhood', 'neighbourhood', 'suburb', 'suburbs', 'residential street', 'residential sidestreet', 'residential side street'], variants: [
        v('Residential Sidestreet.avif'),
        v('Middle-class Neighborhood.avif', { prefer: ['middle class', 'suburb', 'suburbs', 'cul de sac', 'suburban'] }),
        v('Upper-class Neighborhood.avif', { when: ['rich', 'wealthy', 'upper class', 'mansion', 'mansions', 'gated', 'nice'] }),
        v('Lower-class Neighborhood.avif', { when: ['poor', 'run down', 'rundown', 'lower class', 'bad part', 'slum', 'projects', 'ghetto'] }),
        v('Christmas Neighborhood.avif', { season: 'christmas' }),
        v('Halloween Neighborhood.avif', { season: 'halloween' }),
    ], side: 'out' },
    { id: 'backyard', names: ['backyard cookout', 'backyard bbq', 'backyard bonfire', 'fire pit'], words: ['backyard', 'back yard', 'patio', 'yard', 'cookout', 'bbq', 'barbecue'], variants: [
        v('Empty Backyard.avif'),
        v('Backyard Cookout.avif', { when: ['cookout', 'bbq', 'barbecue', 'grill'] }),
        v('Backyard Bonfire.avif', { when: ['bonfire', 'fire pit', 'firepit', 'campfire'] }),
    ], side: 'out' },
    { id: 'cabin', names: ['cabin in the woods', ['cabin', 'bedroom'], ['cabin', 'loft']], words: ['cabin', 'lodge', 'log cabin'], variants: [
        v('Cabin Interior.avif', { side: 'in' }),
        v('Cabin in the Woods.avif', { side: 'out' }),
        v('Cabin Bedroom Interior.avif', { when: ['bedroom', 'loft', 'bed'] }),
    ], side: 'in' },
    { id: 'haunted-house', names: ['haunted house', 'haunted mansion', 'spooky house'], variants: [v('Haunted-House-Interior.avif', { side: 'in' }), v('Haunted House.avif', { side: 'out' })], side: 'in' },

    // ── Parties ──
    { id: 'pool-party', names: ['pool party', 'poolside party'], variants: [v('pool party.avif')], side: 'out' },
    { id: 'party-kitchen', names: ['kitchen party', ['party', 'kitchen']], rank: 2, variants: [v('Kitchen House Party.avif', { crowd: 'busy' }), v('kitchen party.avif', { when: ['after', 'aftermath', 'cleanup', 'clean up', 'morning after', 'empty'] })], side: 'in' },
    { id: 'house-party', names: ['house party', 'frat party', 'frat house', 'kegger', 'halloween party', 'christmas party', 'holiday party'], words: ['party', 'afterparty', 'after party'], variants: [
        v('House_Party.avif'),
        v('House Party 2.avif', { prefer: ['basement'] }),
        v('house party.avif', { when: ['bedroom', 'upstairs', 'afterparty', 'after party'] }),
        v('Halloween Party.avif', { season: 'halloween' }),
        v('Christmas Party.avif', { season: 'christmas' }),
    ], side: 'in' },
    { id: 'wedding-reception', names: ['wedding reception', 'reception venue', 'wedding venue'], variants: [v('Wedding Reception.avif')], side: 'out' },
    { id: 'church', words: ['church', 'chapel', 'wedding', 'altar', 'cathedral', 'ceremony'], variants: [v('Church Wedding.avif')], side: 'in' },
    { id: 'yacht', names: ['yacht party', 'boat party', 'party yacht', 'party boat', 'on the yacht'], words: ['yacht', 'boat', 'ship', 'cruise', 'deck'], variants: [v('Yacht Party.avif'), v('Yacht Party 2.avif')], side: 'out' },

    // ── Food and drink ──
    { id: 'dive-bar', names: ['dive bar'], words: ['bar', 'pub', 'saloon', 'dive', 'watering hole', 'speakeasy'], variants: [v('Dive Bar.avif')], side: 'in' },
    { id: 'barcade', names: ['barcade', 'arcade bar'], variants: [v('Barcade.avif')], side: 'in' },
    { id: 'karaoke', words: ['karaoke', 'karaoke bar', 'karaoke room', 'karaoke box'], variants: [v('Karaoke Bar.avif')], side: 'in' },
    { id: 'pool-hall', names: ['pool hall', 'billiards', 'billiard room', 'billiards hall', 'pool table'], variants: [v('Pool Hall.avif')], side: 'in' },
    { id: 'strip-club', names: ['strip club', 'gentlemen club', 'gentlemens club'], words: ['strip', 'stripper', 'pole'], variants: [v('Strip Club.avif')], side: 'in' },
    { id: 'meadery', words: ['meadery', 'winery', 'mead hall', 'tasting room', 'brewery'], variants: [v('Meadery.avif')], side: 'in' },
    { id: 'vineyard', words: ['vineyard', 'vineyards', 'wine estate', 'grape'], variants: [v('Vineyard.avif')], side: 'out' },
    { id: 'restaurant', names: ['fancy restaurant', 'fine dining', 'upscale restaurant', ['restaurant', 'fancy'], ['restaurant', 'upscale']], words: ['restaurant', 'bistro', 'eatery', 'steakhouse', 'roadhouse', 'grill', 'dining room'], variants: [
        v('Restaurant.avif'), v('Fancy Restaurant.avif', { when: ['fancy', 'upscale', 'fine dining', 'expensive', 'five star', 'michelin', 'date night'] }),
    ], side: 'in' },
    { id: 'sushi', words: ['sushi', 'sushi bar', 'sushi restaurant'], variants: [v('Sushi Bar.avif')], side: 'in' },
    { id: 'bakery', words: ['bakery', 'pastry', 'patisserie', 'bread shop'], variants: [v('Bakery.avif')], side: 'in' },
    { id: 'boba', words: ['boba', 'bubble tea', 'tea shop', 'boba shop'], variants: [v('Boba Shop.avif')], side: 'in' },
    { id: 'icecream', words: ['icecream', 'ice cream', 'gelato', 'creamery', 'dessert shop'], variants: [v('Icecream Shop.avif')], side: 'in' },
    { id: 'food-truck', words: ['food truck', 'food cart', 'taco truck', 'food stand', 'street food'], variants: [v('Food Truck.avif')], side: 'out' },
    { id: 'farmers-market', names: ['farmers market', 'farmer market'], words: ['market stalls', 'outdoor market', 'open air market'], variants: [v('Farmers Market.avif')], side: 'out' },
    { id: 'coffee-shop', names: ['espresso bar', 'coffee bar', 'tea house', 'teahouse', 'tea room', 'tearoom'], words: ['cafe', 'coffee shop', 'coffeehouse', 'coffee house', 'coffee', 'espresso', 'starbucks'], variants: [v('Rustwood Cafe 2.avif')], side: 'in' },

    // ── Shops ──
    { id: 'mall', words: ['mall', 'shopping mall', 'shopping center', 'food court', 'plaza'], variants: [
        v('Mall Day.avif', { time: 'day' }),
        v('Mall Night.avif', { time: 'night', prefer: ['closed', 'empty', 'after hours'] }),
        v('mall 2.avif', { when: ['food court'] }),
        v('mall.avif', { when: ['food court'] }),
        v('Christmas Mall.avif', { season: 'christmas' }),
    ], side: 'in' },
    { id: 'record-store', words: ['record store', 'record shop', 'vinyl', 'music store', 'records'], variants: [v('Record Store.avif')], side: 'in' },
    { id: 'game-store', names: ['game store', 'game shop', 'gamestop', 'hobby store', 'comic shop', 'comic store', 'card shop'], variants: [v('Game Store.avif')], side: 'in' },
    { id: 'tattoo', words: ['tattoo', 'tattoo parlor', 'tattoo shop', 'tattoo studio', 'ink parlor'], variants: [v('Tattoo Parlor.avif')], side: 'in' },
    { id: 'bookstore', words: ['bookstore', 'book store', 'bookshop', 'book shop', 'books'], variants: [v('Bookstore.avif')], side: 'in' },
    { id: 'pet-store', words: ['pet store', 'pet shop', 'animal shelter', 'pet', 'animal'], variants: [v('Pet Store.avif')], side: 'in' },
    { id: 'adult-store', names: ['adult store', 'sex shop', 'adult shop', 'sex store', 'toy store'], words: ['adult'], variants: [v('Adult Store.avif')], side: 'in' },
    { id: 'auto-shop', names: ['auto shop', 'car shop', 'mechanic', 'repair shop', 'body shop', 'auto repair'], words: ['garage'], variants: [v('Auto Shop.avif')], side: 'in' },
    { id: 'warehouse', words: ['warehouse', 'loading bay', 'loading dock', 'storage unit'], variants: [v('Warehouse.avif')], side: 'in' },
    { id: 'massage', words: ['massage', 'masseuse', 'massage parlor', 'spa', 'day spa'], variants: [v('Massage Parlor.avif')], side: 'in' },

    // ── Entertainment ──
    { id: 'arcade', words: ['arcade', 'game center', 'gaming arcade'], variants: [v('Arcade.avif')], side: 'in' },
    { id: 'bowling', words: ['bowling', 'bowling alley', 'lanes'], variants: [v('Bowling Alley.avif')], side: 'in' },
    { id: 'theater', words: ['movie', 'movies', 'theater', 'cinema', 'movie theater', 'film'], variants: [v('Theater.avif'), v('movies.avif')], side: 'in' },
    { id: 'casino', words: ['casino', 'gambling', 'poker room'], variants: [v('Casino.avif')], side: 'in' },
    { id: 'aquarium', words: ['aquarium', 'underwater tunnel', 'ocean exhibit'], variants: [v('Aquarium.avif')], side: 'in' },
    { id: 'trampoline', words: ['trampoline', 'trampoline park', 'bounce', 'foam pit'], variants: [v('Indoor Trampoline.avif')], side: 'in' },
    { id: 'roller-rink', names: ['roller rink', 'roller skating', 'roller skate', 'roller disco', 'skating rink'], variants: [v('Roller Skating Rink.avif')], side: 'in' },
    { id: 'ice-rink', names: ['ice rink', 'ice skating', 'hockey rink', 'ice arena'], variants: [v('Ice Rink.avif')], side: 'in' },
    { id: 'amusement-park', names: ['amusement park', 'theme park', 'roller coaster', 'ferris wheel', 'fairground'], words: ['carnival', 'fair'], variants: [v('Amusement Park Day.avif', { time: 'day' }), v('Amusement Park Night.avif', { time: 'night' })], side: 'out' },
    { id: 'skatepark', words: ['skatepark', 'skate park', 'skate', 'skate ramp', 'half pipe'], variants: [v('Empty Skatepark.avif'), v('Skatepark.avif')], side: 'out' },
    { id: 'ski-resort', words: ['ski', 'ski resort', 'ski lodge', 'slopes', 'ski slope'], variants: [v('Ski Resort.avif')], side: 'out' },

    // ── Sports ──
    { id: 'baseball', words: ['baseball', 'ballpark', 'baseball field', 'baseball diamond', 'batting cage'], variants: [v('Baseball Field.avif')], side: 'out' },
    { id: 'basketball', words: ['basketball', 'basketball court', 'hoops'], variants: [v('Basketball Court.avif')], side: 'out' },
    { id: 'volleyball', words: ['volleyball', 'volleyball court'], variants: [v('Volleyball Court.avif')], side: 'out' },
    { id: 'football', names: ['pep rally', 'game day'], words: ['football', 'football field', 'stadium', 'gridiron', 'bleachers'], variants: [v('Football Field.avif'), v('rally.avif', { when: ['rally', 'pep', 'game', 'cheer', 'cheerleading', 'homecoming'] })], side: 'out' },
    { id: 'sports-complex', words: ['sports complex', 'sports', 'tennis', 'tennis court', 'track', 'athletic', 'athletics', 'field house'], variants: [v('Sports Complex.avif')], side: 'out' },

    // ── Pools, water, hot springs ──
    { id: 'hot-tub', names: ['hot tub', 'jacuzzi', 'whirlpool'], variants: [v('Hot tub.avif'), v('Luxury Hot tub.avif', { when: ['luxury', 'hotel', 'penthouse', 'suite', 'resort'] })], side: 'in' },
    { id: 'onsen', names: ['hot spring', 'hot springs', 'wolf spring', 'onsen', 'bathhouse', 'rotenburo'], variants: [v('onsen 2.avif', { side: 'in' }), v('onsen.avif', { side: 'out' })], side: 'in' },
    { id: 'swimming-pool', words: ['pool', 'swimming pool', 'pool deck', 'poolside', 'lap pool', 'natatorium'], variants: [v('Swimming Pool.avif', { time: 'day' }), v('pool.avif', { time: 'evening' })], side: 'out' },
    { id: 'luxury-resort', names: ['luxury resort', 'resort pool', 'resort'], variants: [v('Luxury Resort.avif')], side: 'out' },
    { id: 'swimming-hole', names: ['swimming hole', 'waterfall', 'forest pond', 'hidden pool'], variants: [v('Swimming Hole.avif')], side: 'out' },
    { id: 'beach', names: ['beach bonfire', 'beach party'], words: ['beach', 'shore', 'shoreline', 'seaside', 'coast', 'ocean', 'sand'], variants: [
        v('Beach_1.avif', { time: 'day', crowd: 'busy' }), v('Beach_2.avif', { time: 'day', crowd: 'busy' }),
        v('Beach_Day.avif', { time: 'day', crowd: 'empty' }),
        v('beach.avif', { time: 'evening' }),
        v('Beach_Night.avif', { time: 'night' }),
        v('Beach Bonfire.avif', { when: ['bonfire', 'campfire', 'fire'] }),
    ], side: 'out' },
    { id: 'beach-cove', names: ['hidden cove', 'secret beach', 'secluded beach', 'beach cove', 'hidden beach', 'sea arch'], words: ['cove'], variants: [v('Hidden Beach Cove.avif')], side: 'out' },
    { id: 'sea-cove', names: ['sea cove', 'sea cave'], variants: [v('Sea Cove.avif')], side: 'out' },
    { id: 'boardwalk', words: ['boardwalk', 'promenade'], variants: [v('Boardwalk_Pop.avif', { crowd: 'busy' }), v('Boardwalk_Empty.avif', { crowd: 'empty' })], side: 'out' },
    { id: 'pier', words: ['pier', 'jetty', 'wharf'], variants: [v('Pier_Day.avif', { time: 'day' }), v('Pier_Night.avif', { time: 'night' }), v('Fishing Pier.avif', { when: ['fishing'] })], side: 'out' },
    { id: 'marina', words: ['marina', 'harbor', 'harbour', 'yacht club', 'boat dock', 'docks'], variants: [v('Marina.avif')], side: 'out' },
    { id: 'shipyard', words: ['shipyard', 'container port', 'port', 'dockyard'], variants: [v('Shipyard.avif')], side: 'out' },
    { id: 'lighthouse', words: ['lighthouse'], variants: [v('Lighthouse.avif')], side: 'out' },
    { id: 'lake', words: ['lake', 'lakeside', 'lakeshore', 'lake shore', 'pond', 'dock'], variants: [
        v('Lake.avif'),
        v('Mountain Lake.avif', { when: ['mountain', 'alpine'] }),
        v('Fishing Dock.avif', { when: ['fishing', 'dock'] }),
    ], side: 'out' },
    { id: 'river-walk', words: ['river', 'riverside', 'river walk', 'riverwalk', 'canal', 'creek', 'stream'], variants: [v('River Walk.avif')], side: 'out' },

    // ── Parks and outdoors ──
    { id: 'park', words: ['park', 'city park', 'campus park', 'fountain', 'park bench', 'park path'], variants: [
        v('Park.avif', { time: 'day', crowd: 'busy' }),
        v('Parc_2.avif', { time: 'day' }),
        v('Parc_3.avif', { time: 'day', prefer: ['lake', 'pond', 'lakeside'] }),
        v('Parc_5_Evening.avif', { time: 'evening' }),
        v('Parc_7_Evening.avif', { time: 'evening' }),
        v('Parc_8_Night.avif', { time: 'night' }),
        v('Parc_10_Night.avif', { time: 'night', prefer: ['pond', 'lake'] }),
        v('Parc_11_Rain.avif', { weather: 'rain' }),
        v('Parc_13_Rain.avif', { weather: 'rain' }),
    ], side: 'out' },
    { id: 'playground', words: ['playground', 'swing set', 'swings', 'jungle gym'], variants: [v('Empty Playground.avif')], side: 'out' },
    { id: 'graveyard', words: ['graveyard', 'cemetery', 'grave', 'tomb', 'burial ground', 'memorial park'], variants: [v('Graveyard.avif')], side: 'out' },
    { id: 'forest-trail', words: ['trail', 'trailhead', 'path', 'pathway', 'hiking', 'hike', 'nature trail', 'wooded path'], variants: [
        v('Forest Trails 1.avif', { time: 'day' }), v('Forest Trails 2.avif', { time: 'day' }),
        v('Forest Trails 3.avif', { time: 'day' }), v('Forest Trails 4.avif', { time: 'evening' }),
        v('Forest Night.avif', { time: 'night' }),
        v('Snowy Forest.avif', { season: 'winter' }),
    ], side: 'out' },
    { id: 'forest', names: ['deep forest'], words: ['forest', 'woods', 'woodland', 'wilderness', 'nature', 'jungle', 'thicket'], variants: [
        v('Forest Day.avif', { time: 'day' }),
        v('Deep Forest.avif', { time: 'day', prefer: ['deep', 'dense', 'heart of', 'jungle'] }),
        v('Forest.avif', { time: 'day', season: 'autumn' }),
        v('Forest Night.avif', { time: 'night' }),
        v('Snowy Forest.avif', { season: 'winter' }),
    ], side: 'out' },
    { id: 'forest-clearing', words: ['clearing', 'glade', 'meadow'], variants: [v('Forest Clearing.avif', { time: 'day' }), v('Field-of-Fireflies.avif', { time: 'night' })], side: 'out' },
    { id: 'fireflies', names: ['firefly', 'fireflies', 'field of fireflies'], variants: [v('Field-of-Fireflies.avif')], side: 'out' },
    { id: 'starry-hill', names: ['starry hill', 'meteor shower', 'stargazing', 'star gazing', 'night sky', 'shooting stars'], words: ['hill', 'hilltop'], variants: [
        v('Starry Hill.avif'), v('Starry Hill 2.avif'),
        v('Meteor Shower.avif', { when: ['meteor', 'meteors', 'shooting star', 'shooting stars'] }),
    ], side: 'out' },
    { id: 'campground', names: ['solo campground', 'campsite', 'campground', 'campgrounds'], words: ['camp', 'camping', 'tent', 'campfire'], variants: [
        v('Campground.avif', { crowd: 'busy' }),
        v('Solo Campground day.avif', { time: 'day', crowd: 'empty' }),
        v('Solo Campground night.avif', { time: 'night', crowd: 'empty' }),
    ], side: 'out' },
    { id: 'farm', words: ['farm', 'farmhouse', 'ranch', 'barn', 'wheat field', 'countryside'], variants: [v('farm.avif'), v('Snowy Farm.avif', { season: 'winter' })], side: 'out' },
    { id: 'field', words: ['field', 'fields', 'open field', 'prairie', 'grassland'], variants: [v('Snowy Field.avif', { season: 'winter' }), v('Meteor Shower.avif', { time: 'night' }), v('farm.avif', { time: 'day' })], side: 'out' },
    { id: 'mountain', words: ['mountain', 'mountains', 'mountain pass', 'peak', 'peaks', 'summit'], variants: [v('Mountain Road.avif'), v('Snowy Mountains.avif', { season: 'winter' })], side: 'out' },
    { id: 'cliffside', names: ['cliffside parking', 'lookout point', 'scenic overlook'], words: ['overlook', 'cliffside', 'cliff', 'outlook', 'lookout'], variants: [v('Cliffside Parking Lot 2.avif'), v('Cliffside Parking Lot.avif')], side: 'out' },
    { id: 'desert', words: ['desert', 'dunes', 'wasteland', 'badlands'], variants: [v('Desert.avif')], side: 'out' },
    { id: 'slab-city', names: ['slab city', 'the slabs'], variants: [v('Slab City.avif')], side: 'out' },
    { id: 'cave', words: ['cave', 'cavern', 'grotto'], variants: [v('Cave.avif')], side: 'in' },

    // ── Roads, streets, cities ──
    { id: 'road', words: ['road', 'highway', 'freeway', 'interstate', 'route', 'country road', 'back road', 'drive', 'road trip'], variants: [
        v('Grassy Road.avif'),
        v('Forest Road.avif', { when: ['forest', 'woods', 'trees'] }),
        v('Mountain Road.avif', { when: ['mountain', 'pass', 'cliff'] }),
        v('Desert Road.avif', { when: ['desert', 'dunes', 'nevada', 'arizona'] }),
        v('Snowy Road.avif', { season: 'winter' }),
    ], side: 'out' },
    { id: 'street', names: ['dark street', 'empty street', 'back street', 'main street'], words: ['street', 'sidewalk', 'avenue', 'downtown', 'block', 'crosswalk', 'intersection'], variants: [
        v('American City.avif', { time: 'day' }),
        v('Dark Street.avif', { time: 'night' }),
        v('Christmas Neighborhood.avif', { season: 'christmas' }),
    ], side: 'out' },
    { id: 'american-town', names: ['small town', 'hometown', 'home town', 'town square', 'town center'], words: ['town'], variants: [v('American Town.avif')], side: 'out' },
    { id: 'american-city', names: ['city center', 'city street', 'big city'], words: ['city', 'skyline'], variants: [v('American City.avif')], side: 'out' },
    { id: 'alley', words: ['alley', 'alleyway', 'back alley', 'behind the building'], variants: [v('Alley.avif')], side: 'out' },
    { id: 'europe', names: ['europe', 'european', 'paris', 'rome', 'london', 'prague', 'vienna', 'italy', 'france', 'germany'], variants: [
        v('Small European Town.avif'), v('Large European City.avif', { when: ['city', 'paris', 'rome', 'london', 'prague', 'vienna', 'capital'] }),
    ], side: 'out' },
    { id: 'russia', names: ['russia', 'russian', 'moscow', 'siberia', 'st petersburg', 'saint petersburg'], variants: [
        v('Russian Town.avif'), v('Russian City.avif', { when: ['city', 'moscow', 'petersburg'] }),
    ], side: 'out' },
    { id: 'egypt', names: ['egypt', 'egyptian', 'cairo city', 'giza', 'alexandria', 'luxor'], variants: [
        v('Egyptian City.avif'), v('Egyptian Town.avif', { when: ['town', 'village', 'old town'] }),
    ], side: 'out' },

    // ── Hotels ──
    { id: 'love-hotel', names: ['love hotel', ['hotel', 'love'], ['hotel', 'sex']], variants: [v('Love Hotel Interior.avif', { side: 'in' }), v('Love Hotel Exterior.avif', { side: 'out' })], side: 'in' },
    { id: 'luxury-hotel', names: ['luxury hotel', 'grand hotel', 'penthouse', 'five star hotel', ['hotel', 'luxury'], ['hotel', 'expensive'], ['hotel', 'suite']], variants: [v('Luxury Hotel Interior.avif', { side: 'in' }), v('Luxury Hotel Exterior.avif', { side: 'out' })], side: 'in' },
    { id: 'cheap-motel', names: ['motel', ['hotel', 'cheap'], ['hotel', 'rundown'], ['hotel', 'dirty'], 'roadside motel'], variants: [v('Cheap Motel Interior.avif', { side: 'in' }), v('Cheap Motel Exterior.avif', { side: 'out' })], side: 'in' },
    { id: 'hotel', words: ['hotel', 'hotel room', 'inn room', 'suite'], variants: [
        v('Hotel Interior.avif', { side: 'in' }),
        v('Hotel Exterior.avif', { side: 'out' }),
        v('Hotel Pool.avif', { when: ['pool'] }),
    ], side: 'in' },

    // ── Transit ──
    { id: 'car', words: ['car', 'van', 'minivan', 'truck', 'vehicle', 'suv', 'jeep', 'sedan', 'pickup', 'backseat', 'back seat', 'passenger seat', 'driver seat'], variants: [v('Car Interior 2.avif'), v('car interior.avif', { time: 'night' }), v('car interior.avif', { weather: 'rain' })], side: 'in' },
    { id: 'bus', words: ['bus'], variants: [v('Bus Interior.avif'), v('Bus-Stop.avif', { when: ['stop', 'shelter', 'station'] })], side: 'in' },
    { id: 'bus-stop', names: ['bus stop', 'bus shelter', 'bus station'], variants: [v('Bus-Stop.avif')], side: 'out' },
    { id: 'airplane', words: ['plane', 'airplane', 'aeroplane', 'flight', 'jet', 'cabin seat'], variants: [v('Airplane Interior.avif'), v('Airplane Interior Window View.avif', { when: ['window'] })], side: 'in' },
    { id: 'trainyard', words: ['train', 'trainyard', 'train yard', 'rail yard', 'railway', 'train tracks', 'tracks'], variants: [v('Trainyard.avif')], side: 'out' },
    { id: 'jail', words: ['jail', 'prison', 'holding cell', 'cell', 'lockup', 'police station'], variants: [v('cell.avif')], side: 'in' },
    { id: 'space', names: ['outer space', 'space station', 'orbit', 'the cosmos'], variants: [v('Space.avif')], side: 'out' },

    // ── Festivals and holidays ──
    { id: 'moonlight-festival', names: ['moonlight festival', 'moonlight'], variants: [v('festival.avif'), v('festival 3.avif')], side: 'out' },
    { id: 'sunstone-festival', names: ['sunstone festival', 'sunrise festival', 'sunrise'], variants: [v('sunrise.avif')], side: 'out' },
    { id: 'music-festival', names: ['music festival', 'concert grounds', 'festival stage', 'main stage'], words: ['concert', 'rave', 'festival grounds'], variants: [
        v('Forest Music Festival.avif'),
        v('Beach Music Festival.avif', { when: ['beach', 'shore', 'ocean'] }),
        v('Desert Music Festival.avif', { when: ['desert', 'dunes', 'burning'] }),
    ], side: 'out' },
    { id: 'autumn-festival', names: ['harvest festival', 'autumn festival', 'fall festival', 'fall fair', 'pumpkin patch'], words: ['harvest', 'autumn', 'fall'], needs: ['festival', 'fair', 'harvest', 'pumpkin', 'patch', 'market'], variants: [v('Autumn Festival.avif')], side: 'out' },
    { id: 'lantern-festival', names: ['lantern festival', 'summer festival', 'night festival', 'night market', 'matsuri'], words: ['festival', 'lantern', 'lanterns'], variants: [
        v('Lantern Festival.avif'), v('festival 2.avif', { crowd: 'busy' }),
    ], side: 'out' },
];

/**
 * Plain room words that usually mean "a room of the home we're already in". When the last background
 * was a whole dwelling (rank 0: an apartment or house) and the new location only says one of these
 * generically ("Kitchen", "Bathroom"), the apartment picture stays instead of jumping to the dorm's
 * shared kitchen or bathroom stalls.
 */
export const HOME_ROOMS = ['kitchen', 'shared-bathroom', 'lounge', 'stairwell', 'dorm-hallway'];

/**
 * On disk but never picked (Lucky, 2026-11-04: "retired dupes are unused, otherwise all backgrounds are
 * used"). Only two kinds land here: the very same picture under another name, and an old version whose
 * room was REDRAWN (different decor or layout), so showing both would make the place change looks between
 * messages. Another angle or render of the same scene is an alt, not a retiree: it goes in the place's
 * variants and rotates. Each one here was compared side by side with its replacement. Moving a file from
 * here into a place's variants is all it takes to bring it back.
 */
export const RETIRED = {
    'Senaka_Boulevard.avif': 'byte-for-byte the same picture as Seneka_Boulevard.avif (misspelled name)',
    'Gemini_s Apartment.avif': 'same picture as Gemini_Apartment.avif',
    'Gemini_s Bedroom.avif': 'same picture as Gemini_Bedroom.avif',
    'black barrel.avif': 'older Black Barrel render with a bartender baked in; BBB.avif replaced it',
    'lucy room.avif': 'older render of Lucy\'s room; lucy room 3.avif is current',
    'serra room.avif': 'older render of Serra\'s room (different bed); serra room 2.avif is current',
    'Belle room.avif': 'older layout of Belle\'s room; belle room 2.avif is current',
    'vera room 2.avif': 'older layout of Vera\'s room; vera room 1.avif is current',
    'hannah room 2.avif': 'older render of Hannah\'s bedroom; Hannah_s Bedroom.avif is current',
    'chapel.avif': 'older wedding chapel; Church Wedding.avif replaced it',
    'moonstone.avif': 'older pavilion render; Moonstone Pavilion Sitting Area.avif replaced it',
    'sunstone.avif': 'older pavilion render; Sunstone Pavilion Throne Room.avif replaced it',
    'sakurai cafe 2.avif': 'older look of Sakurai Cafe; Sakurai Cafe Day/Night replaced it',
};
