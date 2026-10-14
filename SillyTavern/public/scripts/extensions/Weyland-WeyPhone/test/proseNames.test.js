import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { buildProseMatcher, findProseMentions } from '../../registrar-expressions/prose-names.js';
import { CHARACTER_ALIASES, CHARACTERS_WITH_EXPRESSIONS } from '../../quick-reply-ext/src/expressionCharacters.js';

// "bob" stands in for a player's imported Registrar character; the rest are real cast names.
const matcher = buildProseMatcher(['bob', 'serra', 'sunny', 'professor akiyama', 'prof akiyama', 'yue-lin', 'mr. wolfy']);
const names = (text) => [...findProseMentions(text, matcher).keys()];

test('a name that starts an action span fires, and dialogue never does', () => {
    const found = findProseMentions('*Bob runs down the street after her.* "Serra, wait!"', matcher);
    assert.deepEqual([...found.keys()], ['bob']);
    // The mood is read from the action AND the line of dialogue that follows it.
    assert.match(found.get('bob'), /runs down the street after her\./);
    assert.match(found.get('bob'), /Serra, wait!/);
});

test('names in dialogue alone, or only mentioned as an object, do not fire', () => {
    assert.deepEqual(names('"Serra, wait! Bob is behind you!"'), []);
    assert.deepEqual(names('*Serra glares at Bob.*'), ['serra']);
    assert.deepEqual(names('*She hands Bob the cup.*'), []);
    assert.deepEqual(names('*Everyone turns toward Serra and Bob.*'), []);
});

test('every sentence of an action can start with a subject, in order of appearance', () => {
    assert.deepEqual(names('*Bob nods. Serra follows him out!*'), ['bob', 'serra']);
    assert.deepEqual(names('*Serra frowns.* "No." *Bob laughs.*'), ['serra', 'bob']);
});

test('only capitalised names count, and only whole words', () => {
    assert.deepEqual(names('*sunny day, she thinks.*'), []);
    assert.deepEqual(names('*Sunny waves.*'), ['sunny']);
    assert.deepEqual(names("*Bob's eyes widen.*"), ['bob']);
    assert.deepEqual(names('*Bobby runs.*'), []);
    assert.deepEqual(names('*Serrano shrugs.*'), []);
});

test('text outside asterisks is never read, and **bold** speaker tags are not action spans', () => {
    assert.deepEqual(names('Bob runs down the street.'), []);
    assert.deepEqual(names('"*Bob runs*" is not how this is written'), ['bob']); // an italic span is an action wherever it sits
    // index.js blanks speaker tags before calling; do the same here.
    const tagged = '**Bob:** "Hello." __Serra:__ *Serra smiles.*'.replace(/__(.+?):?__|\*\*(.+?):\*\*/gi, ' ');
    assert.deepEqual(names(tagged), ['serra']);
});

test('the mood comes from the LAST action where they are the subject', () => {
    const found = findProseMentions('*Bob grins.* "Nice."\n*Bob shoves the door open in a rage.* "Out!"', matcher);
    assert.match(found.get('bob'), /rage/);
    assert.doesNotMatch(found.get('bob'), /grins/);
    assert.deepEqual([...found.keys()], ['bob']);
});

test('the mood reads the WHOLE paragraph, so a he/she beat later in the line decides it', () => {
    const warm = findProseMentions('*Bob goes silent.* "You really.." *He chuckles, shakes his head, a smile blooming* "Fuck man, you really care, dont you?"', matcher).get('bob');
    const cold = findProseMentions('*Bob goes silent.* "You really think I care, dont you?" *he spits on the floor between you.* "Fuck off."', matcher).get('bob');
    // Same first sentence; what differs is exactly what the classifier must now be given.
    assert.match(warm, /smile blooming/); assert.match(warm, /you really care/);
    assert.match(cold, /spits on the floor/); assert.match(cold, /Fuck off\./);
    assert.doesNotMatch(cold, /smile/); assert.doesNotMatch(warm, /spits/);
    assert.doesNotMatch(warm, /\*/); // markdown asterisks are not part of what gets classified
});

test("another character's action in the same line is cut out of their paragraph", () => {
    const line = '*Serra frowns.* "No way." *Bob laughs, delighted.* "Ha!" *He claps once.* *Serra storms off.*';
    const found = findProseMentions(line, matcher);
    assert.equal(found.get('bob'), 'Bob laughs, delighted. "Ha!" He claps once.');
    assert.equal(found.get('serra'), 'Serra frowns. "No way." Serra storms off.');
    // A different name later in the line takes over the text, even inside one span.
    assert.equal(findProseMentions('*Bob nods. Serra follows him out!*', matcher).get('bob'), 'Bob nods.');
});

test('each paragraph is its own unit, and the last one a character appears in is used', () => {
    const text = '*Bob grins.* "Nice."\n*Bob shoves the door open in a rage.* "Out!"\n*Serra sighs.*';
    const found = findProseMentions(text, matcher);
    assert.equal(found.get('bob'), 'Bob shoves the door open in a rage. "Out!"');
    assert.equal(found.get('serra'), 'Serra sighs.');
});

test('a quote that comes before the action still counts as the moment', () => {
    assert.match(findProseMentions('"Wait for me!" *Bob sprints after her.*', matcher).get('bob'), /Wait for me!/);
});

test('aliases and multi-word names resolve to the canonical name', () => {
    const aliases = new Map(Object.entries(CHARACTER_ALIASES).flatMap(([canonical, list]) => list.map((alias) => [alias.toLowerCase(), canonical.toLowerCase()])));
    const resolve = (name) => aliases.get(name.toLowerCase()) ?? name.toLowerCase();
    assert.deepEqual([...findProseMentions('*Prof Akiyama sighs.*', matcher, resolve).keys()], ['professor akiyama']);
    assert.deepEqual([...findProseMentions('*Professor Akiyama sighs.*', matcher, resolve).keys()], ['professor akiyama']);
    assert.deepEqual(names('*Yue-Lin bows.*'), ['yue-lin']);
    assert.deepEqual(names('*Mr. Wolfy bows.*'), ['mr. wolfy']);
});

test('the real cast list builds a working matcher', () => {
    const cast = buildProseMatcher(CHARACTERS_WITH_EXPRESSIONS);
    assert.deepEqual([...findProseMentions('*Vera tilts her head.* "Hm."', cast).keys()], ['vera']);
    assert.deepEqual([...findProseMentions('"Vera, stop!"', cast).keys()], []);
    assert.equal(buildProseMatcher([]), null);
    assert.deepEqual([...findProseMentions('*Vera nods.*', null).keys()], []);
});

test('index.js reads tagged speakers first, then prose, and never lets prose break the tags', async () => {
    const source = await readFile(new URL('../../registrar-expressions/index.js', import.meta.url), 'utf8');
    assert.match(source, /import \{ buildProseMatcher, findProseMentions \} from '\.\/prose-names\.js'/);
    assert.match(source, /const speakers = await getSpeakerNames\(\)/);
    const body = source.slice(source.indexOf('async function getSpeakerNames'), source.indexOf('async function getProseMatcher'));
    assert.ok(body.indexOf('pushUnique(name);') < body.indexOf('getProseMentions(latestAssistant.mes)'), 'tagged speakers are pushed before prose names');
    assert.match(source, /Never let name-spotting in prose cost the tagged speakers/);
    // A tagged speaker keeps the tag's snippet; only an untagged name falls through to prose.
    assert.match(source, /if \(last >= 0\) \{[\s\S]*?\} else \{[\s\S]*?getProseMentions\(mes\)\)\.get\(name\)/);
});
