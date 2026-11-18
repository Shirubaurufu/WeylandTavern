// Mid-chat start switches for every character with several intros (2026-11-16), forward only (Fox's rule).
// Covers the pure data in quick-reply-ext/src/introTimelines.js against the real scenarios.js records and the real
// card greetings, so a renamed record or a reordered card fails here instead of mislabelling a button.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FORWARD_CONFIRM_TITLE, INTRO_TIMELINES, LOCKED_NOTE, forwardConfirmText, lockedStarts, needsForwardConfirm, timelineGroupId, timelineOptions } from '../../quick-reply-ext/src/introTimelines.js';
import { planIntroSwitch } from '../../quick-reply-ext/src/introSwitch.js';

const { scenarios } = await import('../../quick-reply-ext/src/scenarios.js');

function cardGreetings(name) {
    const buf = fs.readFileSync(new URL(`../../../../../data/default-user/characters/${name}.png`, import.meta.url));
    const texts = {};
    for (let off = 8; off < buf.length;) {
        const len = buf.readUInt32BE(off);
        if (buf.toString('ascii', off + 4, off + 8) === 'tEXt') {
            const chunk = buf.subarray(off + 8, off + 8 + len);
            const nul = chunk.indexOf(0);
            texts[chunk.toString('latin1', 0, nul)] = chunk.toString('latin1', nul + 1);
        }
        off += 12 + len;
    }
    const data = JSON.parse(Buffer.from(texts.ccv3 || texts.chara, 'base64').toString('utf8')).data;
    return [data.first_mes, ...(data.alternate_greetings ?? [])];
}

// What each record must be, in record order (= card greeting order), and a bit of the greeting it pairs with.
const EXPECTED = {
    Belle: [['party', /Rivera's House Party ~/], ['hottub', /Back Porch/], ['doorway', /Your Dorm Room/], ['gone', /Your Dorm Room/]],
    Blake: [['movein', /Aug 24th/], ['drunk', /Nov 25th/], ['movie', /Feb 4th/], ['festival', /7:57 PM/], ['hilltop', /Festival Hilltop/]],
    Summer: [['selfie', /Biology Classroom/], ['cheer', /Outside Lecture Hall/], ['festival', /Sterling Dorm Hallway/]],
    Jenn: [['movein', /Aug 24th/], ['drunk', /Dec 18th/], ['festival', /Sept 17th/]],
    Nix: [['stood-up', /Shopping Mall Cafeteria/], ['winter', /Senaka Boulevard Sidewalk/]],
    Willow: [['ant-hill', /Campus Wooded Path/], ['pastries', /Rustwood Cafe/]],
    Hannah: [['nurse', /Weyland Medical Room 125/], ['breaking', /Black Barrel Bar/]],
    Indigo: [['lecture', /Calculus Lecture Hall/], ['library', /Library/]],
    Ellie: [['storm', /Room 271/], ['japan', /Flight JL062/]],
    'Yue-Lin': [['rustwood', /Rustwood Cafe/], ['infusion', /Senaka Boulevard/], ['breaking', /Shared Apartment/]],
    Vera: [['lecture', /Kennedy Lecture Hall/], ['dinner', /Senaka Boulevard/]],
    Serra: [['prequel', /Oct 6th/], ['junior', /Oct 1st/], ['moving-in', /May 21st/]],
    'Lyris & Vesper': [['construction', /Apr 7th/], ['halloween', /Oct 31st/]],
};

// Where the story order differs from the card's record order. Belle: she goes missing, then comes home the same night.
const TIMELINE_ORDER = { Belle: ['party', 'hottub', 'gone', 'doorway'] };

test('every timeline character is listed, and nobody outside the list sneaks in', () => {
    assert.deepEqual(Object.keys(INTRO_TIMELINES).sort(), Object.keys(EXPECTED).sort());
});

for (const [name, expected] of Object.entries(EXPECTED)) {
    test(`${name}: each record is recognised from its own text and pairs with its card greeting`, () => {
        const records = scenarios.get(name).greetings;
        const { intros } = INTRO_TIMELINES[name];
        const greetings = cardGreetings(name);
        expected.forEach(([id, greeting], index) => {
            const matching = intros.filter(intro => intro.matches(records[index])).map(intro => intro.id);
            assert.deepEqual(matching, [id], `${name} record ${index} should be exactly "${id}"`);
            assert.match(greetings[index], greeting, `${name} card greeting ${index} goes with "${id}"`);
        });
        // Anything past the real intros (a [CS] custom start, an empty record) is never offered.
        for (let index = expected.length; index < records.length; index++) {
            assert.deepEqual(intros.filter(intro => intro.matches(records[index])), [], `${name} record ${index} is not an intro`);
        }
        assert.deepEqual(intros.map(intro => intro.id), TIMELINE_ORDER[name] ?? expected.map(([id]) => id), 'config order is timeline order');
    });

    test(`${name}: tiers never run backwards, labels are plain, nothing is both set and cleared`, () => {
        const { intros } = INTRO_TIMELINES[name];
        const records = scenarios.get(name).greetings;
        for (let i = 1; i < intros.length; i++) assert.ok(intros[i].tier >= intros[i - 1].tier, `${name}: ${intros[i].id} comes after ${intros[i - 1].id}`);
        assert.equal(new Set(intros.map(intro => intro.id)).size, intros.length, 'ids are unique');
        for (const intro of intros) {
            assert.ok(intro.label && intro.description, `${intro.id} has a label and a description`);
            assert.doesNotMatch(`${intro.label} ${intro.description}`, /[–—]|\{\{/, `${intro.id}: no em dashes, no macros`);
        }
        intros.forEach((intro, index) => {
            const plan = planIntroSwitch(records, records[expected_index(name, intro.id)], 20);
            for (const key of plan.clear) assert.ok(!(key in plan.set && plan.set[key]), `${intro.id}: ${key}`);
            assert.ok(!plan.clear.includes('StartingYear'), 'never re-ages the cast');
            assert.ok(index >= 0);
        });
    });
}

function expected_index(name, id) {
    return EXPECTED[name].findIndex(([expectedId]) => expectedId === id);
}

test('forward only: earlier and same-tier starts are locked, later ones open (Fox, 2026-11-16)', () => {
    const { intros } = INTRO_TIMELINES.Belle;
    // Party and hot tub are exclusive alternates of the same first meeting.
    let locked = lockedStarts(intros, 'party');
    assert.equal(locked.get('party'), false, 'the current start stays selectable (it is a no-op)');
    assert.equal(locked.get('hottub'), true, 'its alternate is locked');
    assert.equal(locked.get('doorway'), false);
    assert.equal(locked.get('gone'), false);
    // Missing comes before "missing - came home" (Lucky): from missing the doorway is open, from the doorway missing is locked.
    locked = lockedStarts(intros, 'gone');
    assert.deepEqual([...locked].filter(([, value]) => value).map(([id]) => id).sort(), ['hottub', 'party']);
    assert.equal(locked.get('doorway'), false);
    locked = lockedStarts(intros, 'doorway');
    assert.deepEqual([...locked].filter(([, value]) => !value).map(([id]) => id), ['doorway'], 'the last start has nothing after it');
    // Blake's festival leads straight into the hilltop (Lucky), so the hilltop can follow it but not the other way round.
    const blake = INTRO_TIMELINES.Blake.intros;
    assert.equal(lockedStarts(blake, 'festival').get('hilltop'), false);
    assert.equal(lockedStarts(blake, 'hilltop').get('festival'), true);
    assert.deepEqual([...lockedStarts(blake, 'hilltop')].filter(([, value]) => !value).map(([id]) => id), ['hilltop']);
    // A chat whose start can't be told locks nothing.
    assert.ok([...lockedStarts(blake, 'unknown').values()].every(value => value === false));
});

test('options come out in timeline order with the locked ones greyed and explained', () => {
    const options = timelineOptions(INTRO_TIMELINES.Jenn.intros, 'drunk');
    assert.deepEqual(options.map(option => option.id), ['movein', 'drunk', 'festival']);
    assert.deepEqual(options.map(option => option.disabled), [true, false, false]);
    assert.ok(options[0].description.endsWith(LOCKED_NOTE));
    assert.ok(!options[2].description.includes(LOCKED_NOTE));
    assert.doesNotMatch(LOCKED_NOTE, /[–—]/);
});

test('group ids are stable ("belle-start" is what PromptOS already knows)', () => {
    assert.equal(timelineGroupId('Belle'), 'belle-start');
    assert.equal(timelineGroupId('Yue-Lin'), 'yue-lin-start');
    assert.equal(timelineGroupId('Blake'), 'blake-start');
});

test('PromptOS asks before a forward-only move, never for Off, the current start or a free-choice group', () => {
    const belle = { forwardOnly: true, current: 'party' };
    assert.equal(needsForwardConfirm(belle, 'gone'), true);
    assert.equal(needsForwardConfirm(belle, 'party'), false, 'the current start is a no-op');
    assert.equal(needsForwardConfirm({ forwardOnly: true, current: 'door' }, 'off'), false, 'Loona\'s Off moves nothing');
    assert.equal(needsForwardConfirm({ forwardOnly: false, current: 'normal' }, 'expressive'), false, 'Willow\'s eyes can flip freely');
    assert.equal(needsForwardConfirm(undefined, 'x'), false);
    const text = forwardConfirmText('Missing - came home');
    assert.match(text, /<b>Missing - came home<\/b>/);
    assert.match(text, /can't move back/);
    assert.equal(forwardConfirmText('<script>').includes('<script>'), false, 'labels are escaped');
    assert.doesNotMatch(`${FORWARD_CONFIRM_TITLE} ${text}`, /[–—]/);
    const index = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    assert.match(index, /needsForwardConfirm\(variant, option\)[\s\S]*renderConfirmDialog\([\s\S]*title: FORWARD_CONFIRM_TITLE[\s\S]*if \(!confirmed\) return;[\s\S]*setVariant\(group, option\)/);
    const intro = fs.readFileSync(new URL('../../quick-reply-ext/src/introContext.js', import.meta.url), 'utf8');
    assert.match(intro, /forwardOnly: Boolean\(group\.forwardOnly\)/);
});

test('the switch refuses a locked start and the buttons draw it disabled', () => {
    const intro = fs.readFileSync(new URL('../../quick-reply-ext/src/introContext.js', import.meta.url), 'utf8');
    assert.match(intro, /lockedStarts\(items\.map\(item => item\.intro\), now\)\.get\(id\)\) throw new Error\("That intro is earlier in the story/);
    assert.match(intro, /if \(chosen\.disabled\) throw new Error\("That intro is earlier in the story/);
    assert.match(intro, /\.\.\.Object\.keys\(INTRO_TIMELINES\)\.map\(timelineGroup\)/);
    // Loona: behind-the-door (December) is locked once she is on the drunk night.
    assert.match(intro, /option\.id === "door" && pastDoor/);
    assert.match(intro, /if \(id === "door" && now === "drunk"\) throw new Error/);
    const ui = fs.readFileSync(new URL('../lib/ui/apps/narrativeSettings.js', import.meta.url), 'utf8');
    assert.match(ui, /disabled \|\| item\.disabled \? 'disabled' : ''/);
    // Leaving a move-in start drops the "new to Weyland" text RosterSB wrote (Blake and Jenn both have one).
    assert.match(intro, /records\.some\(record => record\?\.EarlyStart === "true"\) && target\.record\?\.EarlyStart !== "true"/);
    assert.match(intro, /for \(const name of \["NewSchool", "NewPhone"\]\) deleteLocalVariable\(name, true\)/);
});
