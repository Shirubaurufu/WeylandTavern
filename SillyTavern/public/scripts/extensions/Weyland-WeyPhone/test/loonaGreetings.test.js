// Loona's greetings are recognised by what they are, so the card's greeting order can be flipped
// (behind-the-door first) without the drunk setup landing on the wrong one. See
// quick-reply-ext/src/loonaGreetings.js for why position is not used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isLoonaDrunkStart, loonaGreetingRecord, withoutDrunkThoughts, stripDrunkThoughtsFromRequest, DRUNK_THOUGHTS_START, DRUNK_THOUGHTS_END } from '../../quick-reply-ext/src/loonaGreetings.js';
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
    assert.match(intro, /charName === "Loona" && isLoonaDrunkStart\(greetingText\)/);
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
