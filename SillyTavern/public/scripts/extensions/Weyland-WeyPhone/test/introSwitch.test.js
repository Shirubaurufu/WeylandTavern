// Mid-chat start switches (2026-11-15, Lucky): a switch plays the new start like a fresh chat (setup choices, the
// greeting posted as a new message) and the next reply gets a ONE-TIME time skip note. Covers the pure parts in
// quick-reply-ext/src/introSwitch.js, against Belle's real scenarios.js records and card greetings.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    planIntroSwitch, INTRO_VARS, BELLE_INTROS, belleIntroId, matchIntroRecord, BLAKE_INTROS, blakeIntroId, INTRO_RECORD_VAR,
    TIME_SKIP_VAR, readTimeSkip, timeSkipState, timeSkipNote, addTimeSkipNote, isCustomStartGreeting,
} from '../../quick-reply-ext/src/introSwitch.js';

const { scenarios } = await import('../../quick-reply-ext/src/scenarios.js');
const belle = scenarios.get('Belle').greetings;

// Belle's card greetings, read from her installed card the way the switch reads them (first_mes + alternates).
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

test("Belle's four intros are each recognised from their own record, and line up with her card's greetings", () => {
    // The fifth record belongs to the custom [CS] start and holds nothing, so it isn't an intro to switch to.
    assert.deepEqual(belle.map(belleIntroId), ['party', 'hottub', 'doorway', 'gone', null]);
    for (const id of Object.keys(BELLE_INTROS)) assert.doesNotMatch(`${BELLE_INTROS[id].label} ${BELLE_INTROS[id].description}`, /[–—]/);
    // Record N goes with card greeting N (that's how Scenarios() pairs them), so check the pairing still holds.
    const greetings = cardGreetings('Belle');
    assert.match(greetings[0], /Rivera's House Party ~/);
    assert.match(greetings[1], /Back Porch/);
    assert.match(greetings[2], /\[Sadness\] \[RC\]/, 'the doorway greeting ends on her footer');
    assert.match(greetings[3], /picture of you set as her phone/, '"She\'s gone" is the one that ends on her phone wallpaper');
    assert.match(greetings[4], /\[CS\]/);
});

test('switching to "She\'s gone" brings its thoughts-off and post-history reminder; switching away clears them', () => {
    const gone = planIntroSwitch(belle, belle[3], 40);
    assert.equal(gone.set.CharacterThoughtsToggle, 'Disabled');
    assert.match(gone.set.IntroPostHistory, /missing Belle intro/);
    assert.match(gone.set.ConstantScenario, /SHE'S GONE/);
    for (const key of ['Scenario', 'CharKeys', 'ConstantContext', 'ContextTimer']) assert.ok(gone.clear.includes(key), `clears ${key}`);
    assert.ok(!gone.clear.includes('StartingYear'), 'never re-ages the cast');

    const party = planIntroSwitch(belle, belle[0], 40);
    for (const key of ['ConstantScenario', 'IntroPostHistory', 'CharacterThoughtsToggle', 'ScenarioSticky']) assert.ok(party.clear.includes(key), `clears ${key}`);
    assert.match(party.set.Scenario, /ROLEPLAY START CONTEXT/);
    assert.equal(party.set.ConstantContext, 'Emily, Remy, Kiera');
    // Her party guests drop out 19 messages after the greeting, counted from where the greeting is posted.
    assert.equal(party.set.ContextTimer, String(40 + Number(belle[0].ContextTimer)));
    // Nothing is both set and cleared.
    for (const plan of [gone, party]) for (const key of plan.clear) assert.ok(!(key in plan.set && plan.set[key]), key);
    assert.ok(INTRO_VARS.every(key => planIntroSwitch([], {}, 0).clear.includes(key)), 'a start with no record clears every intro variable');
});

test('a chat can tell which intro it is on from its variables', () => {
    assert.equal(matchIntroRecord(belle, { ConstantScenario: belle[3].ConstantScenario }), 3);
    assert.equal(matchIntroRecord(belle, { Scenario: belle[1].Scenario }), 1);
    assert.equal(matchIntroRecord(belle, { Scenario: 'text from an older build' }), -1);
    assert.equal(matchIntroRecord(belle, {}), -1, 'empty values never match a record with an empty field');
});

// ---- Blake (2026-11-16) ----
const blake = scenarios.get('Blake').greetings;

test("Blake's five intros are each recognised from their own record, and line up with her card's greetings", () => {
    assert.deepEqual(blake.map(blakeIntroId), ['movein', 'drunk', 'movie', 'festival', 'hilltop']);
    for (const id of Object.keys(BLAKE_INTROS)) assert.doesNotMatch(`${BLAKE_INTROS[id].label} ${BLAKE_INTROS[id].description}`, /[–—]/);
    // Record N goes with card greeting N; the sixth greeting is the custom [CS] start and has no record.
    const greetings = cardGreetings('Blake');
    assert.match(greetings[0], /very first day at Weyland/);
    assert.match(greetings[1], /incredibly drunk/);
    assert.match(greetings[2], /movie/);
    assert.match(greetings[3], /Adventure Time/, 'the festival intro starts on the couch');
    assert.match(greetings[4], /Festival Hilltop/);
    assert.match(greetings[5], /\[CS\]/);
    assert.equal(greetings.length, blake.length + 1);
});

test('switching to the drunk night brings its thoughts and drops move-in; switching away clears them', () => {
    const drunk = planIntroSwitch(blake, blake[1], 30);
    assert.equal(drunk.set.SpecialThoughts, 'true');
    assert.match(drunk.set.ThoughtSet, /CHARACTER THOUGHTS: ENABLED/);
    assert.match(drunk.set.Scenario, /three months/);
    for (const key of ['EarlyStart', 'ConstantScenario']) assert.ok(drunk.clear.includes(key), `clears ${key}`);
    assert.ok(!drunk.clear.includes('StartingYear'));

    const movein = planIntroSwitch(blake, blake[0], 30);
    assert.equal(movein.set.EarlyStart, 'true');
    for (const key of ['SpecialThoughts', 'ThoughtSet', 'ConstantScenario']) assert.ok(movein.clear.includes(key), `clears ${key}`);

    const festival = planIntroSwitch(blake, blake[3], 30);
    for (const key of ['EarlyStart', 'SpecialThoughts', 'ThoughtSet', 'Scenario', 'CharKeys']) assert.ok(festival.clear.includes(key), `clears ${key}`);
    assert.match(festival.set.ConstantScenario, /Moonlight Festival/);
    for (const plan of [drunk, movein, festival]) for (const key of plan.clear) assert.ok(!(key in plan.set && plan.set[key]), key);
});

test("a switched Blake chat reads thoughts from the record the switch applied, not the first message's swipe", () => {
    const index = fs.readFileSync(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    const intro = fs.readFileSync(new URL('../../quick-reply-ext/src/introContext.js', import.meta.url), 'utf8');
    assert.equal(INTRO_RECORD_VAR, 'IntroRecordIndex');
    assert.match(index, /getLocalVariable\("IntroRecordIndex"\)/);
    assert.match(index, /greetingThoughtSet\(scenarios\.get\(charName\), thoughtRecord\)/);
    assert.match(intro, /INTRO_CONTEXT_STATE_VARS = \[STASH, MODE, SWITCHED_START, TIME_SKIP_VAR, INTRO_RECORD_VAR\]/);
    assert.match(intro, /setLocalVariable\(INTRO_RECORD_VAR, String\(recordIndex\), true\)/);
    // Blake's picker is generated from src/introTimelines.js now (id "blake-start"); move-in's leftovers are dropped when
    // leaving it, see introTimelines.test.js.
    assert.match(intro, /\.\.\.Object\.keys\(INTRO_TIMELINES\)\.map\(timelineGroup\)/);
    assert.match(intro, /for \(const name of \["NewSchool", "NewPhone"\]\) deleteLocalVariable\(name, true\)/);
});

test('the time skip note covers the next reply and its rerolls, then is spent', () => {
    const raw = JSON.stringify({ anchor: 10, name: 'Belle' });
    assert.equal(TIME_SKIP_VAR, 'IntroTimeSkip');
    assert.equal(timeSkipState(raw, 11), 'active', 'generating straight after the greeting');
    assert.equal(timeSkipState(raw, 12), 'active', 'the player answered the greeting');
    assert.equal(timeSkipState(raw, 13), 'active', 'rerolling or continuing that reply');
    assert.equal(timeSkipState(raw, 14), 'spent', 'the next player message: done');
    assert.equal(timeSkipState(raw, 10), 'spent', 'the greeting was deleted');
    assert.equal(timeSkipState('', 12), 'none');
    assert.equal(timeSkipState('{not json', 12), 'none');
    assert.equal(readTimeSkip(raw).name, 'Belle');
});

test('the note goes in right before the last message, once, and names the character', () => {
    const note = timeSkipNote('Loona');
    assert.match(note, /^\[OOC: TIME SKIP\./);
    assert.match(note, /Loona's most recent greeting message is the new opening scene/);
    assert.match(note, /only for this one reply/);
    assert.doesNotMatch(note, /[–—]|\{\{/);
    const messages = [{ role: 'system', content: 'prompt' }, { role: 'assistant', content: 'greeting' }, { role: 'user', content: 'hi' }];
    assert.equal(addTimeSkipNote(messages, note), true);
    assert.deepEqual(messages.map(m => m.content), ['prompt', 'greeting', note, 'hi']);
    assert.equal(addTimeSkipNote(messages, note), false, 'never twice');
    assert.equal(addTimeSkipNote([], note), false);
    assert.match(timeSkipNote(''), /the character's most recent greeting/);
});

test('the request hook and the setup both use the shared pieces', () => {
    const index = fs.readFileSync(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    const intro = fs.readFileSync(new URL('../../quick-reply-ext/src/introContext.js', import.meta.url), 'utf8');
    assert.match(index, /timeSkipState\(raw, SillyTavern\.getContext\(\)\.chat\?\.length \?\? 0\)/);
    assert.match(index, /addTimeSkipNote\(data\.messages, timeSkipNote\(readTimeSkip\(raw\)\?\.name\)\)/);
    // A fresh greeting setup forgets any earlier switch and its pending note.
    assert.match(intro, /INTRO_CONTEXT_STATE_VARS = \[STASH, MODE, SWITCHED_START, TIME_SKIP_VAR, INTRO_RECORD_VAR\]/);
    // The greeting is posted through SillyTavern's own /sendas, and a switch can't run mid-reply or before setup.
    assert.match(intro, /await sendMessageAs\(\{ name: charName \}, greetingText\)/);
    assert.match(intro, /if \(is_send_press\)/);
    assert.match(intro, /getLocalVariable\("ScenarioSet"\) !== "true"/);
});

test("Muse's custom start is recognised as one, and her scripted start is not", () => {
    // Muse's first-time popup explains the scripted 14-day experiment, so it must not open on her custom [CS] start.
    const [story, custom] = cardGreetings('Muse');
    assert.match(custom, /^\[CS\]/, "Muse's second greeting is still the custom start");
    assert.equal(isCustomStartGreeting(custom), true);
    assert.equal(isCustomStartGreeting(story), false);
    assert.equal(isCustomStartGreeting(undefined), false);
});

test('every [CS] greeting on an installed card is recognised as a custom start', () => {
    // The check keys on the OOC instruction text, so a card whose custom start is reworded would slip past it.
    const dir = new URL('../../../../../data/default-user/characters/', import.meta.url);
    const names = fs.readdirSync(dir).filter(file => file.endsWith('.png')).map(file => file.slice(0, -4));
    let seen = 0;
    for (const name of names) {
        let greetings;
        try { greetings = cardGreetings(name); } catch { continue; }
        for (const greeting of greetings) {
            if (!/^\s*\[CS\]/.test(String(greeting ?? ''))) continue;
            seen++;
            assert.equal(isCustomStartGreeting(greeting), true, `${name}'s [CS] greeting is not recognised`);
        }
    }
    assert.ok(seen > 0, 'expected at least one card with a [CS] greeting');
});

test("Muse's first-time popup is skipped on a custom start, and Scenarios() uses the same check", () => {
    const index = fs.readFileSync(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    const block = index.slice(index.indexOf('// MuseFirst'), index.indexOf('strings.musF'));
    assert.match(block, /characterName === "Muse"/);
    assert.match(block, /!isCustomStartGreeting\(getFirstMessage\("char"\)\?\.mes\)/);
    assert.match(index, /if \(isCustomStartGreeting\(greetingText\)\) \{\s*inject\(/);
});
