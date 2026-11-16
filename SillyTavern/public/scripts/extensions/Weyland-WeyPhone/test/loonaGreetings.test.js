// Loona's greetings are recognised by what they are, so the card's greeting order can be flipped
// (behind-the-door first) without the drunk setup landing on the wrong one. See
// quick-reply-ext/src/loonaGreetings.js for why position is not used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    isLoonaDrunkStart, loonaGreetingRecord, withoutDrunkThoughts, stripDrunkThoughtsFromRequest, DRUNK_THOUGHTS_START, DRUNK_THOUGHTS_END,
    isCustomStart, LOONA_DOOR_MARKER, LOONA_START_OPTIONS, loonaStartOf, loonaStartValues,
    LOONA_DRUNK_CHOICES, LOONA_DRUNK_DEFAULT_CHOICE, loonaDrunkIdFromChoice, loonaStartGroup, loonaGreetingText,
} from '../../quick-reply-ext/src/loonaGreetings.js';
import { supportsCharacterThoughtsToggle, characterThoughtsEnabled } from '../../quick-reply-ext/src/characterThoughts.js';

const drunk = '*The door bursts open.*\n\n"Heyyyy *hiccup* fucker!"\n\n[Excitement] [O1]';
const door = '*You close the distance to her door.*\n\n*Time to be okay again.*\n\n[Grief] [RC]';
const custom = '[CS]\n\n[OOC: Following your character information and personality as a basis, create a new scenario]';
const drunkRecord = { StartingYear: 'Junior' };
const doorRecord = { ConstantScenario: '[ROLEPLAY INTRO CONTEXT: POST-BREAKUP DEPRESSION]', StartingYear: 'Junior' };

test('the drunk greeting is told apart by its Drunk outfit code', () => {
    assert.equal(isLoonaDrunkStart(drunk), true);
    assert.equal(isLoonaDrunkStart(door), false);
    assert.equal(isLoonaDrunkStart(custom), false);
    assert.equal(isLoonaDrunkStart(undefined), false);
});

test('each greeting gets its own record in either card order and either record order', () => {
    for (const records of [[drunkRecord, doorRecord], [doorRecord, drunkRecord]]) {
        for (const swipe of [0, 1]) {
            assert.equal(loonaGreetingRecord(records, drunk, swipe), drunkRecord, 'drunk never takes the breakup context');
            assert.equal(loonaGreetingRecord(records, door, swipe), doorRecord, 'behind the door always gets its context');
        }
        assert.equal(loonaGreetingRecord(records, custom, 2), undefined, 'the custom start has no context of its own');
    }
    assert.equal(loonaGreetingRecord(undefined, door, 0), undefined);
});

test('the setup code and the PromptOS picker both use the greeting text, not swipe 0', () => {
    const index = fs.readFileSync(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    const intro = fs.readFileSync(new URL('../../quick-reply-ext/src/introContext.js', import.meta.url), 'utf8');
    const loonaCase = index.slice(index.indexOf('case "Loona": {'), index.indexOf('case "Willow": {'));
    assert.match(loonaCase, /isLoonaDrunkStart\(greetingText\)/);
    assert.doesNotMatch(loonaCase, /greetingSwipe === 0/);
    assert.match(index, /loonaGreetingRecord\(charScenarios\.greetings, greetingText, greetingSwipe\)/);
    // The picker is on every Loona chat now (the custom start can switch to a real start too).
    assert.match(intro, /applies: \(charName\) => charName === "Loona"/);
    // The fresh-chat setup and the switch share ONE popup and ONE variable writer (Lucky: reuse, don't copy).
    assert.match(loonaCase, /applyLoonaStart\(\(await askLoonaDrunkStart\(\)\) \?\? loonaDrunkIdFromChoice\(LOONA_DRUNK_DEFAULT_CHOICE\)\)/);
    assert.doesNotMatch(loonaCase, /doButtons/);
    assert.match(intro, /doButtons\(\{ labels: JSON\.stringify\(LOONA_DRUNK_CHOICES\) \}, strings\.redC\)/);
});

test('the drunk popup labels map to the same versions the original setup chose', () => {
    // The labels are what players see in the popup, unchanged from the original setup.
    assert.deepEqual(LOONA_DRUNK_CHOICES, ['Dismissed Him - Kinda Drunk', 'Nearly Hooked Up - Kinda Drunk', 'Dismissed Him - Turbo Drunk', 'Nearly Hooked Up - Turbo Drunk']);
    assert.deepEqual(LOONA_DRUNK_CHOICES.map(loonaDrunkIdFromChoice), ['kinda-dismissed', 'kinda-hooked', 'turbo-dismissed', 'turbo-hooked']);
    assert.equal(loonaDrunkIdFromChoice(LOONA_DRUNK_DEFAULT_CHOICE), 'turbo-dismissed', 'closing the popup on a fresh chat is still turbo, turned down');
    assert.deepEqual(LOONA_START_OPTIONS.map(option => option.id), ['door', 'drunk', 'off']);
    for (const id of ['kinda-dismissed', 'turbo-hooked', 'drunk']) assert.equal(loonaStartGroup(id), 'drunk');
    for (const id of ['door', 'off', 'unknown']) assert.equal(loonaStartGroup(id), id);
});

test('the greeting a switch posts is found by what it is, in either card order', () => {
    for (const card of [[door, drunk, custom], [drunk, door, custom], [custom, drunk, door]]) {
        assert.equal(loonaGreetingText('drunk', card), drunk);
        assert.equal(loonaGreetingText('door', card), door);
    }
    assert.equal(loonaGreetingText('drunk', [door, custom]), undefined);
    assert.equal(loonaGreetingText('off', [door, drunk]), undefined);
});

// Switching starts mid-chat (2026-11-15): the PromptOS "Starting scenario" picker rewrites the same two variables
// the greeting setup writes, and reads the current start back from them.
test('every start maps to the variables the greeting setup would write, and reads back as itself', async () => {
    const strings = (await import('../../quick-reply-ext/src/strings.js')).default;
    const { scenarios } = await import('../../quick-reply-ext/src/scenarios.js');
    const texts = { redD: String(strings.redD), redH: String(strings.redH), redT: String(strings.redT) };
    // The real behind-the-door record, found the same way the picker finds it.
    const doorContext = scenarios.get('Loona').greetings.find(record => record?.ConstantScenario)?.ConstantScenario;
    assert.ok(doorContext?.includes(LOONA_DOOR_MARKER), 'the door context still carries the marker the picker reads');
    assert.ok(!texts.redD.includes(LOONA_DOOR_MARKER) && !texts.redH.includes(LOONA_DOOR_MARKER));
    assert.notEqual(texts.redD, texts.redH);

    const expected = {
        'door': { ConstantScenario: doorContext, DrunkCoach: '' },
        'kinda-dismissed': { ConstantScenario: texts.redD, DrunkCoach: '' },
        'kinda-hooked': { ConstantScenario: texts.redH, DrunkCoach: '' },
        'turbo-dismissed': { ConstantScenario: texts.redD, DrunkCoach: texts.redT },
        'turbo-hooked': { ConstantScenario: texts.redH, DrunkCoach: texts.redT },
        'off': { ConstantScenario: '', DrunkCoach: '' },
    };
    for (const [id, values] of Object.entries(expected)) {
        assert.deepEqual(loonaStartValues(id, { doorContext, ...texts }), values, id);
        // Round trip: switching to a start and reading it back gives the same start.
        assert.equal(loonaStartOf({ constantScenario: values.ConstantScenario, drunkCoach: values.DrunkCoach }, texts), id, id);
    }
    // Door -> drunk -> door leaves nothing of the other start behind.
    assert.equal(loonaStartValues('door', { doorContext, ...texts }).DrunkCoach, '', 'turbo coaching never sticks to the door start');
    assert.throws(() => loonaStartValues('sober', { doorContext, ...texts }), /Unknown Loona start/);
    assert.throws(() => loonaStartValues('door', { doorContext: '', ...texts }), /behind-the-door context is missing/);
    // Copy rule: no em dashes in what players read.
    for (const option of LOONA_START_OPTIONS) assert.doesNotMatch(`${option.label} ${option.description}`, /[–—]/);
});

test('older saved texts still read as the right start, and an unrecognisable drunk text lights nothing', () => {
    const texts = { redD: 'DRUNK D', redH: 'DRUNK H', redT: 'TURBO' };
    // A chat set up by an older build keeps that build's door text, which still has its header.
    assert.equal(loonaStartOf({ constantScenario: '[ROLEPLAY INTRO CONTEXT: POST-BREAKUP DEPRESSION - TWO WEEKS IN] older words' }, texts), 'door');
    assert.equal(loonaStartOf({ constantScenario: 'DRUNK H', drunkCoach: 'an older turbo coach' }, texts), 'turbo-hooked');
    assert.equal(loonaStartOf({ constantScenario: 'DRUNK D', drunkCoach: '  ' }, texts), 'kinda-dismissed');
    assert.equal(loonaStartOf({ constantScenario: 'an older text that is neither' }, texts), 'unknown');
    // An older drunk text still reads as drunk (the version is unknown, but it IS a drunk night).
    assert.equal(loonaStartOf({ constantScenario: `older drunk words\n${DRUNK_THOUGHTS_START}\n...` }, texts), 'drunk');
    assert.equal(loonaStartOf({ constantScenario: '' }, texts), 'off');
    assert.equal(loonaStartOf(undefined, texts), 'off');
    assert.equal(isCustomStart(custom), true);
    assert.equal(isCustomStart(door), false);
    assert.equal(isCustomStart(drunk), false);
});

test('with thoughts off, the drunk context loses its thoughts section and nothing else', async () => {
    const strings = (await import('../../quick-reply-ext/src/strings.js')).default;
    for (const key of ['redD', 'redH']) {
        // Against the real text, so a renamed marker fails here instead of silently un-cutting.
        const full = String(strings[key]);
        assert.ok(full.includes(DRUNK_THOUGHTS_START) && full.includes(DRUNK_THOUGHTS_END), `${key} still has both markers`);
        const cut = withoutDrunkThoughts(full);
        assert.ok(!cut.includes('SEXUAL THOUGHTS'), `${key}: section gone`);
        assert.ok(!cut.includes('INTERNAL THOUGHT EXAMPLES') && !cut.includes('FUCK OFF SOBER BRAIN'), `${key}: examples gone`);
        assert.ok(cut.includes('After Sex (Drunk State):') && cut.includes('NEXT MORNING: CRITICAL') && cut.includes('[END DRUNK LOONA CONTEXT]'), `${key}: neighbours kept`);
        const before = full.slice(0, full.indexOf(DRUNK_THOUGHTS_START)).trimEnd();
        const after = full.slice(full.indexOf(DRUNK_THOUGHTS_END) + DRUNK_THOUGHTS_END.length).trimStart();
        assert.equal(cut, `${before}\n\n${after}`);
    }
    const messages = [
        { role: 'system', content: `rules\n\n${strings.redD}` },
        { role: 'user', content: [{ type: 'text', text: String(strings.redH) }, { type: 'image_url' }] },
        { role: 'assistant', content: 'untouched [SEXUAL THOUGHTS - DRUNK LOONA] with no end marker' },
    ];
    assert.equal(stripDrunkThoughtsFromRequest(messages), 2);
    assert.ok(!messages[0].content.includes('SEXUAL THOUGHTS') && !messages[1].content[0].text.includes('SEXUAL THOUGHTS'));
    assert.match(messages[2].content, /no end marker$/);
    assert.equal(stripDrunkThoughtsFromRequest(undefined), 0);

    const index = fs.readFileSync(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    assert.match(index, /getCurrentCharacterName\(\) === "Loona" && !characterThoughtsEnabled\("Loona", getLocalVariable\(CHARACTER_THOUGHTS_VARIABLE\)\)\) \{\s+const cut = stripDrunkThoughtsFromRequest\(data\.messages\)/);
});

test('Loona has the per-chat thoughts switch, on unless turned off', () => {
    assert.equal(supportsCharacterThoughtsToggle('Loona'), true);
    assert.equal(characterThoughtsEnabled('Loona', undefined), true);
    assert.equal(characterThoughtsEnabled('Loona', 'Disabled'), false);
});
