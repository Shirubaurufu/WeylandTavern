// Copy of Weyland-MuseStoryMachine/test/storyCore.test.mjs, run against Foxfire's own copy of storyCore.js (2026-11-18).
// node --test test/storyCore.test.mjs  (from the extension folder)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseStory, buildInjection, readChapterFlag, nextChapterState, afterDelete, buildGenerationMessages, clampChapters,
    hasFork, forkChapter, totalFor, chapterAt, chapterLabel, FLAVORS, findNamedCast, findNamedPlaces,
} from '../storyCore.js';

const SLOPPY = `Sure! Here's your storyline:

**TITLE:** "Blackout at the Dorm"
**PREMISE:** A storm kills the power.
It keeps going on a second line.
**MUSE:** Ooo, a sleepover~

## CHAPTER 1: The Lights Die
GOAL: Get them stuck together.
BEATS:
1. The power cuts out mid-sentence.
- Her phone dies too.
* Someone pounds on the door
  and keeps pounding.
ENDS WHEN: She admits she can't light a candle.

CHAPTER 2 - No Signal
**GOAL:** Things get close.
**BEATS:**
- Beat A
- Beat B
**ENDS WHEN:** The PR team calls the dorm phone.

FINALE: The lights come back on.`;

test('parses sloppy tagged output', () => {
    const s = parseStory(SLOPPY);
    assert.equal(s.title, 'Blackout at the Dorm');
    assert.equal(s.premise, 'A storm kills the power. It keeps going on a second line.');
    assert.equal(s.muse, 'Ooo, a sleepover~');
    assert.equal(s.chapters.length, 2);
    assert.equal(s.chapters[0].name, 'The Lights Die');
    assert.deepEqual(s.chapters[0].beats, ['The power cuts out mid-sentence.', 'Her phone dies too.', 'Someone pounds on the door and keeps pounding.']);
    assert.equal(s.chapters[0].ends, "She admits she can't light a candle.");
    assert.equal(s.chapters[1].name, 'No Signal');
    assert.equal(s.chapters[1].ends, 'The PR team calls the dorm phone.');
    assert.equal(s.finale, 'The lights come back on.');
});

test('strips numbered chapter names (seen live on Gemini 3.8 Flash)', () => {
    const s = parseStory('TITLE: X\nMUSE: playing with fire—and ears!\nCHAPTER: 1. Lab Partner Roulette\nBEATS:\n- a\nCHAPTER: 2) Next\n- b\nCHAPTER: Chapter 3: The Morning After\n- c');
    assert.equal(s.chapters[2].name, 'The Morning After');
    assert.equal(s.chapters[0].name, 'Lab Partner Roulette');
    assert.equal(s.chapters[1].name, 'Next');
});

test('returns null when there are no chapters', () => {
    assert.equal(parseStory("I can't help with that."), null);
    assert.equal(parseStory(''), null);
});

test('injection carries only the current chapter in full', () => {
    const s = parseStory(SLOPPY);
    const one = buildInjection(s, 1);
    assert.match(one, /Chapter 1 of 2 - "The Lights Die"/);
    assert.match(one, /- Her phone dies too\./);
    assert.doesNotMatch(one, /Beat A/);
    // Chapters still to come are listed by name only (2026-11-14): their content is what the model rushes toward.
    assert.match(one, /- Chapter 2: No Signal\n/);
    assert.doesNotMatch(one, /Things get close/);
    assert.match(one, /\(Ch 1\)/);
    assert.match(one, /use \(Ch 2\) from the next response/);
    assert.match(one, /DO NOT ACT AS \{\{user\}\}/);
    assert.doesNotMatch(one, /—/, 'no em dashes');
    const two = buildInjection(s, 2);
    assert.match(two, /LAST chapter/);
    assert.match(two, /\(Fin\)/);
    assert.match(two, /Where it can end: The lights come back on\./);
    assert.doesNotMatch(two, /\n\n\n/);
});

test('reads the chapter flag from the header only', () => {
    assert.deepEqual(readChapterFlag('¦¦ Sat, Apr 3 ~ 9 PM ~ Dorm ~ (Ch 2)¦¦\nText'), { n: 2, route: null });
    assert.deepEqual(readChapterFlag('¦¦ x ~ (ch.3) ¦¦'), { n: 3, route: null });
    assert.deepEqual(readChapterFlag('¦¦ x ~ (Ch 4B)¦¦'), { n: 4, route: 'B' });
    assert.deepEqual(readChapterFlag('¦¦ x ~ (ch 4 a)¦¦'), { n: 4, route: 'A' });
    assert.equal(readChapterFlag('¦¦ x ~ (Fin)¦¦'), 'fin');
    assert.equal(readChapterFlag('¦¦ x ¦¦ nothing'), null);
    assert.equal(readChapterFlag('x'.repeat(500) + '(Ch 4)'), null);
    // Leaked planning prose before the header must not count, the header must.
    const leaked = '# Plan\nI should not use (Ch 4A) yet.\n' + 'y'.repeat(900) + '\n---\n¦¦ Wed ~ 7 PM ~ Apt ~ (Ch 3B) ¦¦\n*text*';
    assert.deepEqual(readChapterFlag(leaked), { n: 3, route: 'B' });
    assert.equal(readChapterFlag('# Plan\nuse (Ch 4A) later\n¦¦ Wed ~ 7 PM ~ Apt ¦¦\ntext'), null, 'a header without a flag means no flag');
});

const flag = (n, route = null) => ({ n, route });
const THREE = { chapters: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] };

test('advances one step, and the advance sticks through a reroll', () => {
    const st = { chapter: 1, done: false, advance: null };
    assert.equal(nextChapterState(st, flag(1), 5, THREE).changed, false);
    assert.equal(nextChapterState(st, flag(3), 5, THREE).chapter, 1, 'never skips ahead');
    const r = nextChapterState(st, flag(2), 5, THREE);
    assert.deepEqual([r.chapter, r.changed, r.advance], [2, true, { index: 5, from: 1, fromRoute: null }]);
    // Live case: the reroll of index 5 copied the old (Ch 1). The ending already happened, so stay on 2.
    const reroll = nextChapterState(r, flag(1), 5, THREE);
    assert.deepEqual([reroll.chapter, reroll.changed], [2, false]);
    assert.equal(nextChapterState(r, flag(3), 5, THREE).changed, false, 'a reroll of the moving reply cannot move it again');
    assert.equal(nextChapterState(r, null, 7, THREE).chapter, 2);
    assert.equal(nextChapterState(r, flag(3), 7, THREE).chapter, 3);
});

test('deleting back past the advance steps back once', () => {
    const st = { chapter: 2, done: false, advance: { index: 5, from: 1 }, story: {} };
    assert.equal(afterDelete(st, 6), null);
    const back = afterDelete(st, 5);
    assert.deepEqual([back.chapter, back.advance], [1, null]);
    assert.equal(afterDelete({ chapter: 1 }, 0), null);
});

test('finishes on (Fin) only in the last chapter', () => {
    assert.equal(nextChapterState({ chapter: 2 }, 'fin', 4, THREE).done, false);
    const r = nextChapterState({ chapter: 3 }, 'fin', 4, THREE);
    assert.equal(r.done, true);
    assert.equal(afterDelete({ ...r }, 4).done, false, 'deleting the (Fin) reply reopens the last chapter');
});

test('chapter 2+ injection says the old flag is over', () => {
    const s = parseStory(SLOPPY);
    assert.doesNotMatch(buildInjection(s, 1), /Those chapters are OVER/);
    assert.match(buildInjection(s, 2), /Earlier messages show older flags\. Those chapters are OVER/);
});

// ---------- 2026-11-14: scenes instead of step lists, the player's lines, Betrayal, forks ----------

const FORKED = `TITLE: Second Chances
PREMISE: She broke it off. Now she wants back in.
MUSE: Drama!~
CHAPTER: The Breakup
SCENE: Loona ends it on the dorm steps, cold and rehearsed, because she's sure he'd leave first anyway.
ENDS WHEN: She walks away without looking back.
CHAPTER: Knock Knock
SCENE: Weeks later she turns up at the door, soaked, asking to talk.
ENDS WHEN: She asks him straight out to take her back.
FORK: Does Lucky take her back?
ROUTE A: He takes her back
CHAPTER: Careful Again
SCENE: They try again and she overdoes every little thing to prove herself.
ENDS WHEN: She falls asleep on his shoulder.
CHAPTER: Old Habits
SCENE: Her old fear creeps back in when he's late one night.
ENDS WHEN: She says she's scared out loud.
FINALE: Together, a little more honest.
ROUTE B: He says no
CHAPTER: The Long Way Home
SCENE: Loona pretends she's fine and throws herself into partying.
ENDS WHEN: Someone has to carry her home.
CHAPTER: Last Call
SCENE: She leaves a voicemail she'll regret.
ENDS WHEN: The voicemail is sent.
FINALE: Apart, but finally honest.`;

test('parses a scene-style chapter with no beats', () => {
    const s = parseStory('TITLE: X\nCHAPTER: Enthusiastic\nSCENE: Loona is thrilled he got home from class.\nIt carries on.\nENDS WHEN: He finishes.');
    assert.equal(s.chapters[0].scene, 'Loona is thrilled he got home from class. It carries on.');
    assert.equal(s.chapters[0].beats, undefined);
    const inj = buildInjection(s, 1);
    assert.match(inj, /What this chapter is about: Loona is thrilled/);
    assert.match(inj, /direction, not a script/);
    assert.match(inj, /There is no order of steps to protect/);
    assert.doesNotMatch(inj, /Moments that could happen/);
});

test('old storylines with beats still inject, but as optional moments', () => {
    const inj = buildInjection(parseStory(SLOPPY), 1);
    assert.match(inj, /Moments that could happen \(optional, any order/);
    assert.match(inj, /- Her phone dies too\./);
});

test('parses a fork with two routes', () => {
    const s = parseStory(FORKED);
    assert.equal(s.chapters.length, 2);
    assert.ok(hasFork(s));
    assert.equal(forkChapter(s), 2);
    assert.equal(s.fork.choice, 'Does Lucky take her back?');
    assert.equal(s.fork.routes.A.label, 'He takes her back');
    assert.equal(s.fork.routes.B.chapters[1].name, 'Last Call');
    assert.equal(s.fork.routes.A.finale, 'Together, a little more honest.');
    assert.equal(s.finale, '');
    assert.equal(totalFor(s, 'A'), 4);
    assert.equal(chapterAt(s, 3, 'B').name, 'The Long Way Home');
    assert.equal(chapterLabel(s, 3, 'B'), '3B');
    assert.equal(chapterLabel(s, 2, 'B'), '2');
});

test('markdown dividers are skipped, not glued onto the field above', () => {
    const s = parseStory('TITLE: X\nMUSE: hi~\n---\nCHAPTER: A\nSCENE: s\nENDS WHEN: e\n\n***\n* * *\nCHAPTER: B\nSCENE: t\nENDS WHEN: f\n___\nFINALE: end');
    assert.equal(s.muse, 'hi~');
    assert.equal(s.chapters[0].ends, 'e');
    assert.equal(s.chapters[1].ends, 'f');
    assert.equal(s.finale, 'end');
});

test('half a fork becomes a straight story', () => {
    const s = parseStory(FORKED.split('ROUTE B:')[0]);
    assert.equal(hasFork(s), false);
    assert.equal(s.chapters.length, 4);
    assert.equal(s.finale, 'Together, a little more honest.');
});

test('"ROUTE 2" and "## CHAPTER 3B:" headings parse too', () => {
    const s = parseStory(FORKED.replace('ROUTE B:', '## ROUTE 2 -').replace('CHAPTER: The Long Way Home', '**CHAPTER 3B:** The Long Way Home'));
    assert.ok(hasFork(s));
    assert.equal(s.fork.routes.B.chapters[0].name, 'The Long Way Home');
});

test('the fork chapter hands the choice to the player and names both flags', () => {
    const s = parseStory(FORKED);
    const one = buildInjection(s, 1);
    assert.match(one, /Then a choice that belongs to \{\{user\}\}/);
    assert.doesNotMatch(one, /He takes her back/, 'routes are not revealed before the fork');
    const two = buildInjection(s, 2);
    assert.match(two, /choice that belongs to \{\{user\}\} alone: Does Lucky take her back\?/);
    assert.match(two, /use \(Ch 3A\) from the next response on if they chose: He takes her back/);
    assert.match(two, /Use \(Ch 3B\) if they chose: He says no/);
    assert.match(two, /Until they have chosen, keep \(Ch 2\)/);
});

test('a route chapter knows the road taken and how to cross back', () => {
    const s = parseStory(FORKED);
    const b3 = buildInjection(s, 3, 'B');
    assert.match(b3, /Chapter 3B of 4 - "The Long Way Home"/);
    assert.match(b3, /\{\{user\}\} chose: He says no/);
    assert.match(b3, /\(Ch 3B\)/);
    assert.match(b3, /use \(Ch 4B\) from the next response/);
    assert.match(b3, /reverse their choice \(He takes her back\).*use \(Ch 3A\)/);
    assert.match(b3, /Chapter 4B: Last Call/);
    assert.doesNotMatch(b3, /Careful Again/);
    const b4 = buildInjection(s, 4, 'B');
    assert.match(b4, /LAST chapter/);
    assert.match(b4, /Where it can end: Apart, but finally honest\./);
});

test('moving through a fork: route needed at the fork, kept after, crossover at the same chapter', () => {
    const s = parseStory(FORKED);
    const at2 = { chapter: 2, route: null };
    assert.equal(nextChapterState(at2, flag(3), 10, s).changed, false, 'no letter at the fork = not decided');
    const b = nextChapterState(at2, flag(3, 'B'), 10, s);
    assert.deepEqual([b.chapter, b.route], [3, 'B']);
    // Next chapter written without a letter stays on the road taken.
    const b4 = nextChapterState({ ...b }, flag(4), 14, s);
    assert.deepEqual([b4.chapter, b4.route], [4, 'B']);
    // Change of heart on chapter 4: same number, other letter.
    const cross = nextChapterState(b4, flag(4, 'A'), 20, s);
    assert.deepEqual([cross.chapter, cross.route, cross.changed], [4, 'A', true]);
    assert.deepEqual(cross.advance, { index: 20, from: 4, fromRoute: 'B' });
    // A reroll of the crossing reply copying (Ch 4B) must not cross straight back.
    assert.equal(nextChapterState(cross, flag(4, 'B'), 20, s).changed, false);
    // Deleting the crossing reply undoes it.
    const undone = afterDelete(cross, 20);
    assert.deepEqual([undone.chapter, undone.route], [4, 'B']);
    // (Fin) only on a route's last chapter.
    assert.equal(nextChapterState(cross, 'fin', 22, s).done, true);
    assert.equal(nextChapterState(at2, 'fin', 22, s).done, false);
    // The trunk ignores letters.
    assert.deepEqual(nextChapterState({ chapter: 1 }, flag(2, 'A'), 3, s).route, null);
});

test('generation request: scenes, the player-scripting rule, Betrayal and the fork format', () => {
    assert.ok(FLAVORS.includes('Betrayal'));
    const [sys, user] = buildGenerationMessages({ userName: 'Lucky', chapters: 4 });
    assert.match(user.content, /SCENE: </);
    assert.doesNotMatch(user.content, /BEATS:/);
    assert.match(sys.content, /never "first\.\.\. then\.\.\. then\.\.\."/);
    assert.match(sys.content, /never write what Lucky says, asks, feels, notices or does/);
    assert.match(sys.content, /an action Lucky wrote into their own idea below is theirs/);
    assert.match(sys.content, /Never add anything to it: no new actions, details, words or reactions for Lucky/);
    assert.doesNotMatch(user.content, /FORK:/);
    const [fsys, fuser] = buildGenerationMessages({ userName: 'Lucky', chapters: 5, fork: true });
    assert.match(fsys.content, /This story FORKS/);
    assert.match(fuser.content, /every path through the story is exactly 5 chapters long/);
    assert.match(fuser.content, /FORK: <the choice/);
    assert.match(fuser.content, /ROUTE A: /);
    assert.match(fuser.content, /ROUTE B: /);
});

test('generation request has the format and the player name', () => {
    const [sys, user] = buildGenerationMessages({ charName: 'Bastet', userName: 'Lucky', idea: 'blackout', flavors: ['Cozy'], chapters: 9 });
    assert.match(sys.content, /The player character is Lucky/);
    assert.match(user.content, /Chapters: exactly 7/);
    assert.match(user.content, /Flavors: Cozy/);
    assert.match(user.content, /ENDS WHEN:/);
    assert.equal(clampChapters('x'), 4);
});

test('finds cast members named in the idea, then the scene, by whole word and case', () => {
    const e = (comment, key, varName, extra = {}) => ({ comment, key, content: `{{getvar::${varName}}}`, ...extra });
    const entries = [
        e('Summer', ['!Summer', '!summer', 'Summer'], 'SU'),
        e('Kellen', ['!Kellen', 'Kellen', "Jenn's dad"], 'KL'),
        e('Belle', ['!Belle', 'Belle'], 'BE'),
        e('Gem', ['!Gem', 'Gem', "Gem's"], 'GE'),
        e('Off', ['Offy'], 'OF', { disable: true }),
        { comment: 'Roster', key: [], content: '{{getvar::RT}}' },
        { comment: 'Lore', key: ['Belle'], content: 'Belle lore, not a subbot' },
        e('Roommates', ['roommate', 'Roommate'], 'Roommates'),
        e('[REDACTED]', ['!Vortex', 'Vortex', 'Tex'], 'VORTEX'),
    ];
    assert.deepEqual(findNamedCast(entries, ['my Roommate'], {}), [], 'no "!" summon key = not a character subbot');
    assert.deepEqual(findNamedCast(entries, ['Tex is here'], {}), [{ name: 'Vortex', varName: 'VORTEX' }], 'named by key, not by comment');
    const got = findNamedCast(entries, ["Belle catches me with Jenn's dad this summer", 'Gem waves. Offy too. Summer laughs.'], { exclude: 'Loona' });
    assert.deepEqual(got.map(c => c.varName), ['BE', 'KL', 'GE', 'SU']);
    assert.deepEqual(findNamedCast(entries, ['Belle and Summer'], { exclude: 'belle' }).map(c => c.name), ['Summer'], 'the open character is skipped');
    assert.deepEqual(findNamedCast(entries, ['Bellerophon, Gemstone'], {}), [], 'whole words only');
    assert.equal(findNamedCast(entries, ['Belle Summer Gem Kellen'], { max: 2 }).length, 2);
    const [, user] = buildGenerationMessages({ castText: '[Belle]\nBubbly.' });
    assert.match(user.content, /\[OTHER CHARACTERS NAMED IN THE IDEA OR THE SCENE\][\s\S]*\[Belle\]\nBubbly\./);
    assert.doesNotMatch(buildGenerationMessages({})[1].content, /OTHER CHARACTERS/);
});

test('finds places named in the idea or the scene header', () => {
    const p = (comment, key, content, extra = {}) => ({ comment, key, content, ...extra });
    const entries = [
        p('Kodo Bowl', ['Kodo Bowl', 'Kodo', 'amphitheater'], '[KODO BOWL AMPHITHEATER] Potential location: Kodo Bowl. Big stage.'),
        p('Belle & Dash Room', ['/Belle.?s room/', '(#281)', '281'], 'Potential Location: Belle & Dash\'s Dorm Room', { group: 'Dorm' }),
        p('Red Lantern Ramen', ['ramen', 'Red Lantern'], '[RED LANTERN RAMEN] Potential Location: Red Lantern Ramen'),
        p('Vampire Lore', ['vampire'], '[VAMPIRE CONTEXT] not a place'),
        p('Atrisuka History', ['atrisuka'], '[ATRISUKA] Potential Location? CRITICAL: IF THIS MISFIRES, DO NOT MENTION IT!'),
        p("Jericho's Apartment (Summer's chat)", ['/(dad|father).?s (apartment|place)/i'], 'Potential Location: Jericho\'s apartment', { characterFilter: { isExclude: false, names: ['Summer'], tags: [] } }),
        p('Old', ['old'], 'Potential Location: old', { disable: true }),
    ];
    const got = findNamedPlaces(entries, ['We grab RAMEN after the show at the kodo bowl, then back to Belle\'s room', '¦¦ Wed ~ 7 PM ~ Room 281 ~ (Ch 1) ¦¦'], { charName: 'Loona' });
    assert.deepEqual(got.map(x => x.name), ['Red Lantern Ramen', 'Kodo Bowl', 'Belle & Dash Room']);
    assert.deepEqual(findNamedPlaces(entries, ['a vampire at atrisuka'], {}), [], 'not places, or suppressed');
    assert.deepEqual(findNamedPlaces(entries, ["my dad's place"], { charName: 'Loona' }), [], 'limited to Summer by name');
    assert.equal(findNamedPlaces(entries, ["my dad's place"], { charName: 'Summer' }).length, 1);
    assert.deepEqual(findNamedPlaces(entries, ['', '¦¦ Wed ~ Room 281 ¦¦'], {}).map(x => x.name), ['Belle & Dash Room'], 'the scene header counts');
    const [, user] = buildGenerationMessages({ placesText: '[Kodo Bowl]\nBig stage.' });
    assert.match(user.content, /\[PLACES NAMED IN THE IDEA OR WHERE THE SCENE IS\][\s\S]*Big stage\./);
});
