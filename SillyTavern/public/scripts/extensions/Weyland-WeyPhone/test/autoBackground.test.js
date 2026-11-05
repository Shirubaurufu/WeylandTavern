import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLACES, AREAS, RETIRED, HOME_ROOMS } from '../../quick-reply-ext/src/backgroundCatalog.js';
import { pickBackgroundForReply, parseHeader, findHeaderLines, parseHour } from '../../quick-reply-ext/src/autoBackground.js';

// The auto-background picker (quick-reply-ext/src/autoBackground.js + backgroundCatalog.js, 2026-11-04).
// Cases below are real location lines from saved roster chats unless marked otherwise.

const BG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../data/default-user/backgrounds');

/** Build a reply the way the models write it. */
const reply = (location, { date = 'Monday, Sep 8', time = '2:00 PM', body = '' } = {}) => `¦¦ ${date} ~ ${time} ~ ${location} ¦¦\n\n${body}`;
const pick = (location, opts = {}) => pickBackgroundForReply(reply(location, opts), { userName: 'Lucky', chatId: 't', rng: () => 0, ...opts }).pick;

test('catalog: every background on disk is either used by a place or listed as retired, and nothing else', () => {
    const disk = fs.readdirSync(BG_DIR).filter(f => /\.(avif|png|jpe?g|webp|gif)$/i.test(f));
    const used = new Set(PLACES.flatMap(p => p.variants.map(v => v.file)));
    for (const f of disk) assert.ok(used.has(f) || RETIRED[f], `background not in the catalog: ${f} (add it to a place, or to RETIRED)`);
    for (const f of used) assert.ok(disk.includes(f), `catalog names a file that is not on disk: ${f}`);
    for (const f of Object.keys(RETIRED)) {
        assert.ok(disk.includes(f), `retired file is not on disk: ${f}`);
        assert.ok(!used.has(f), `file is both retired and used: ${f}`);
    }
});

test('catalog: ids are unique and every reference points somewhere real', () => {
    const ids = PLACES.map(p => p.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate place id');
    for (const a of AREAS) if (a.fallback) assert.ok(ids.includes(a.fallback), `area ${a.id} falls back to unknown place ${a.fallback}`);
    for (const p of PLACES) if (p.area) assert.ok(AREAS.some(a => a.id === p.area), `place ${p.id} has unknown area ${p.area}`);
    for (const id of HOME_ROOMS) assert.ok(ids.includes(id), `HOME_ROOMS names unknown place ${id}`);
});

test('the old ladder\'s worst misfires are fixed', () => {
    // "Trail" no longer matches inside "Trailer"
    assert.equal(pick('Cerberus Trailer').file, 'cerberus.avif');
    assert.equal(pick('Abandoned Trailer #14').file, 'cerberus.avif');
    // the player's name alone is not Blake's dorm room
    assert.equal(pick('Lucky’s Apartment').file, 'Generic Apartment.avif');
    assert.equal(pick('Lucky & Chaska’s Apartment, Kitchen').file, 'Generic Apartment.avif');
    // rooms beat the building they are in
    assert.equal(pick('Sterling Hall Laundry Room').file, 'laundry.avif');
    assert.equal(pick('Sterling Hall, Room 277').placeId, 'dorm-room');
    assert.equal(pick('Dorm Hallway').placeId, 'dorm-hallway');
    // "Sterling Hall - <anything inside>" used to show the brick exterior unless the room number was on the list
    assert.equal(pick('Sterling Hall - Room 268').placeId, 'lucy-room');
    assert.equal(pick('Sterling Hall - Room 277').placeId, 'dorm-room');
    assert.equal(pick('Sterling Hall - Hallway').placeId, 'dorm-hallway');
    assert.equal(pick('Sterling Hall - Lucky\'s Room').placeId, 'dorm-room');
    assert.equal(pick('Outside Sterling Hall').placeId, 'sterling-hall');
    // "Wet" and "soaked" are not weather
    assert.equal(pick('In the Car', { body: 'She is soaked and wet, panting.' }).file, 'Car Interior 2.avif');
    assert.equal(pick('In the Car', { body: 'Rain hammers the windshield.' }).file, 'car interior.avif');
});

test('real locations land on the right picture', () => {
    const cases = [
        ['Black Barrel Bar', 'BBB.avif'],
        ['Black Barrel Bar, Backroom', 'BBB Backroom.avif'],
        ['Lucky’s Dorm Room 271', 'blake room 3.avif'],
        ['Sterling Hall, Room 309', 'briar room.avif'],
        ['Briar’s Dorm Room (Sterling Hall, #309)', 'briar room.avif'],
        ['Room 273', 'kai room.avif'],
        ['Muse’s Habitat', 'observe.avif'],
        ['Weyland Research Center, Bay 3', 'observe.avif'],
        ['WRC - Lab 3', 'Lab.avif'],
        ['Weyland Research Center — Lobby', 'Weyland Research Center.avif'],
        ['Senaka Boulevard', 'Seneka_Boulevard.avif'],
        ['Red Lantern Ramen', 'ramen.avif'],
        ['Bellucci’s', 'Fancy Restaurant.avif'],
        ['Mama’s Den', 'Mamas Den.avif'],
        ['Outside Mama’s Den', 'Mama Den.avif'],
        ['Kinsbane Manor - Living Room', 'kb living room.avif'],
        ['Kinsbane Manor (Parents’ Bedroom)', 'kb master bed.avif'],
        ['Kinsbane Manor', 'kb front.avif'],
        ['Inside Fort Aiko', 'kb inside treehouse.avif'],
        ['Fort Aiko', 'kb treehouse.avif'],
        ['Karaveia Dun, Dining Area', 'Karaveia Dun Dining Area.avif'],
        ['Karaveia Dun', 'Karaveia Dun Communal Area.avif'],
        ['Kemetic Caravan (Outer Ring)', 'caravan outer day.avif'],
        ['Moonstone Pavilion (Shani’s Room)', 'Moonstone Pavilion Sitting Area.avif'],
        ['Outside Hartley Hall (Lecture Building)', 'lecture hall.avif'],
        ['Outside Lecture Hall', 'lecture hall.avif'],
        ['Calculus Lecture Hall', 'Lecture Hall 2.avif'],
        ['Biology Classroom', 'classroom.avif'],
        ['Sterling Hall', 'sterling.avif'],
        ['Sterling Hall Quad', 'Sterling_Hall_Outside_2.avif'],
        ['Outside Sakurai Cafe', 'sakurai cafe outside.avif'],
        ['Sakurai Cafe, Bar', 'sakurai cafe.avif'],
        ['7/11 Parking Lot', '711 Day.avif'],
        ['Inside 7-Eleven', 'seven eleven.avif'],
        ['Flight JL062, Tokyo-Bound', 'Airplane Interior.avif'],
        ['Rivera’s House - Living Room', 'Generic Apartment.avif'],
        ['Rivera’s House Party (Kitchen)', 'Kitchen House Party.avif'],
        ['Titans Tower - Starfire’s Room', 'Generic Bedroom.avif'],
        ['Outside the Diner', 'Diner Exterior.avif'],
        ['A Clearing Near the Greenhouse', 'Forest Clearing.avif'],
        ['Outside the Marie Trailer', 'Soft Pike Day.avif'],
    ];
    for (const [loc, file] of cases) assert.equal(pick(loc)?.file, file, loc);
});

test('like-words: generic names for the same kind of place', () => {
    const cases = [
        ['Cafe', 'coffee-shop'], ['The Café', 'coffee-shop'], ['Coffeehouse', 'coffee-shop'], ['Espresso Bar', 'coffee-shop'], ['Tea House', 'coffee-shop'],
        ['Living Room', 'apartment'], ['Family Room', 'apartment'], ['Den', 'apartment'],
        ['Student Commons', 'common-room'], ['The Commons', 'common-room'], ['Student Union', 'common-room'], ['Rec Room', 'common-room'],
        ['Serra\'s Room', 'serra-room'], ['Serra’s Bedroom', 'serra-room'], ['Serra\'s Dorm', 'serra-room'], ['Serra\'s Place', 'serra-room'],
        ['Lucky\'s Dorm', 'blake-room'], ['Cafeteria', 'brodlak'], ['Canteen', 'brodlak'], ['Pub', 'dive-bar'], ['Nightclub', 'exchange-club'],
        ['Bodega', 'seven-eleven'], ['Restroom', 'shared-bathroom'], ['Jacuzzi', 'hot-tub'], ['Woods', 'forest'], ['Hiking Trail', 'forest-trail'],
        ['Seaside', 'beach'], ['Highway', 'road'],
    ];
    for (const [loc, placeId] of cases) assert.equal(pick(loc)?.placeId, placeId, loc);
    // an unmarked store is its inside, whatever the clock says
    assert.equal(pick('Corner Store').file, 'seven eleven.avif');
    assert.equal(pick('Outside the Gas Station').file, '711 Day.avif');
});

test('nothing matched = no pick, so the current background stays', () => {
    assert.equal(pick('The Terraces, Oribasaka'), null);
    assert.equal(pickBackgroundForReply('No header in this reply at all.', {}).pick, null);
});

test('cards that live somewhere pull generic rooms into their home', () => {
    assert.equal(pick('Kitchen', { card: 'Kinsbane Manor' }).file, 'kb kitchen.avif');
    assert.equal(pick('Kitchen', { card: 'Serra' }).file, 'Sterling_Hall_Inside_3.avif');
    assert.equal(pick('Estate Garden', { card: 'Ellie' }).file, 'Japanese Estate Garden.avif');
    assert.equal(pick('Estate Garden', { card: 'Serra' }).placeId, 'arboretum');
    // "Kitchen" right after an apartment stays in the apartment; a named building does not
    assert.equal(pick('Kitchen', { previousPlace: 'hannah-apartment' }).file, 'Hannah_s Apartment.avif');
    assert.equal(pick('Sterling Hall, 3rd Floor Hallway', { previousPlace: 'apartment' }).placeId, 'dorm-hallway');
});

test('time, season and weather pick the variant', () => {
    assert.equal(pick('Sakurai Cafe', { time: '9:30 PM' }).file, 'Sakurai Cafe Night.avif');
    assert.equal(pick('Sakurai Cafe', { time: '10:15 AM' }).file, 'Sakurai Cafe Day.avif');
    assert.equal(pick('Weyland Forest', { time: '11:00 PM' }).file, 'Forest Night.avif');
    assert.equal(pick('Weyland Forest', { body: 'Snow falls between the pines.' }).file, 'Snowy Forest.avif');
    assert.equal(pick('Sterling Hall, Common Room', { date: 'Friday, Dec 19' }).file, 'Sterling_Hall_Christmas_1.avif');
    assert.equal(pick('Sterling Hall, Common Room', { date: 'Friday, Mar 6' }).file, 'Sterling_Hall_Inside_2.avif');
    assert.equal(pick('House Party', { date: 'Friday, Oct 31' }).file, 'Halloween Party.avif');
    assert.equal(pick('Weyland Park', { body: 'Rain patters on the path.' }).placeId, 'park');
    assert.match(pick('Weyland Park', { body: 'Rain patters on the path.' }).file, /Rain/);
    assert.equal(pick('Beach', { body: 'The beach is deserted.' }).file, 'Beach_Day.avif');
});

test('alts: one is rolled on arrival and held while the scene stays', () => {
    const first = pick('Yacht Party', { rng: () => 0 }).file;
    const other = pick('Yacht Party', { rng: () => 0.99 }).file;
    assert.notEqual(first, other, 'both yacht shots are reachable');
    // already there: keep what is on screen, whatever the roll says
    assert.equal(pick('Yacht Party', { rng: () => 0.99, previousPlace: 'yacht', previousFile: first }).file, first);
    // arriving from somewhere else: roll again
    assert.equal(pick('Yacht Party', { rng: () => 0.99, previousPlace: 'beach', previousFile: first }).file, other);
});

test('header parsing matches what the Formatter shows', () => {
    assert.deepEqual(
        parseHeader(['¦¦ Sunday, Oct 10 ~ 7:41 PM ~ Muse’s Habitat ~ (SAPH) ¦¦', '¦¦ MUSE EXPERIMENT: DAY 2/14 ~ (CODE: 4402) ¦¦']).location,
        'Muse’s Habitat');
    assert.equal(parseHeader(['¦¦ Tue, Sep 9 ~ 3:00 PM ~ Kitchen / Backyard (SAPH) ¦¦']).location, 'Kitchen / Backyard');
    assert.equal(parseHeader(['¦¦ Weyland Research Center ~ (Code: 4997) ¦¦']).location, 'Weyland Research Center');
    assert.equal(parseHeader(['¦¦ date ~ 9:00 PM ~ Black Barrel Bar ¦¦ (ONYX) ¦¦']).location, 'Black Barrel Bar');
    assert.equal(parseHour('7:41 PM'), 19);
    assert.equal(parseHour('12:05 AM'), 0);
    assert.equal(parseHour('15:09'), 15);
    // a scene sheet left in the text talks about the header; the real one comes after it
    const withSheet = 'SCENE SHEET\nwrite the ¦¦ date ~ time ~ place ¦¦ header\nEND OF SCENE SHEET\n¦¦ Mon, Sep 8 ~ 1:00 PM ~ Boba Shop ¦¦\n\nText';
    assert.deepEqual(findHeaderLines(withSheet), ['¦¦ Mon, Sep 8 ~ 1:00 PM ~ Boba Shop ¦¦']);
});

test('fast enough to run on every reply on a phone', () => {
    const t = performance.now();
    for (let i = 0; i < 500; i++) pick('Sterling Hall, Room 309');
    const perCall = (performance.now() - t) / 500;
    assert.ok(perCall < 2, `picker took ${perCall.toFixed(3)} ms per reply`);
});
