import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { ravs } from '../../quick-reply-ext/src/promptRegistry.js';
import { THOUGHT_RULES, withThoughtRules } from '../../quick-reply-ext/src/promptModifiers.js';
import { CHARACTER_THOUGHTS_AVAILABLE, CHARACTER_THOUGHTS_DEFAULT, CHARACTER_THOUGHTS_VARIABLE, NO_THOUGHTS, thoughtsSwitchOn } from '../../quick-reply-ext/src/characterThoughts.js';
import { assemble } from './helpers/promptAssemblyHarness.js';

// Rules that ride inside every thoughts-ON block: secrets may appear in thoughts (narration still hides them),
// and thoughts are the character's own first-person head (no 3rd person, no narrator commentary).

test('every prompt choice has a thoughts-on block, and it gets all three rules inside it', () => {
    for (const name of ['Current Prompt', 'Old Prompt 2026', 'Old Prompt 2025', 'Mini Prompt']) {
        const thinkYes = ravs.get(name)?.thinkYes;
        assert.ok(thinkYes, `${name} carries character thoughts`);
        const out = withThoughtRules(thinkYes);
        for (const line of THOUGHT_RULES) {
            assert.ok(out.includes(line), `${name}: ${line}`);
            assert.ok(out.indexOf(line) < out.indexOf('[END THOUGHT DIRECTIONS]'), `${name}: inside the block`);
        }
        // The rav.js tag "<thought directions>" goes out in the house bracket form instead.
        assert.ok(out.startsWith('[THOUGHT DIRECTIONS]') || out.includes('\n[THOUGHT DIRECTIONS]'), `${name}: opens with [THOUGHT DIRECTIONS]`);
        assert.ok(!/thought directions>/i.test(out), `${name}: no leftover <thought directions> tag`);
    }
});

test('the rules are the agreed wording', () => {
    assert.match(THOUGHT_RULES[0], /not to thoughts/);
    assert.match(THOUGHT_RULES[0], /never add one just to reveal it/);
    assert.ok(THOUGHT_RULES.includes("- NEVER speak in 3rd person in {{char}}'s thoughts."));
    assert.ok(THOUGHT_RULES.includes("- NEVER speak as a narrator in {{char}}'s thoughts."));
});

test('adding them twice changes nothing, and empty input stays empty', () => {
    const once = withThoughtRules(ravs.get('Current Prompt').thinkYes);
    assert.equal(withThoughtRules(once), once);
    assert.equal(withThoughtRules(''), '');
    assert.equal(withThoughtRules(undefined), '');
});

test('XXX adds them only where thoughts are switched on', async () => {
    const source = await readFile(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    // The three thoughts-on paths (always-on characters, Vera, Fawne) build the block first; the Character Thoughts
    // switch decides afterwards whether it goes into ThoughtSet.
    assert.equal((source.match(/thoughts = withThoughtRules\(rav\.thinkYes\);/g) ?? []).length, 3);
    assert.doesNotMatch(source, /setLocalVariable\("ThoughtSet", rav\.thinkYes\)/, 'no thoughts-on path left without them');
    assert.doesNotMatch(source, /withThoughtRules\(rav\.thinkSpec\)/, 'the thoughts-off text is not touched');
});

test('assembled chats: a thoughts card gets the rules on every prompt choice, a card without thoughts gets none', async () => {
    for (const choice of ['Current Prompt', 'Old Prompt 2026', 'Old Prompt 2025', 'Mini Prompt']) {
        const { locals: summer } = await assemble('Summer', { PromptChoice: choice });
        for (const line of THOUGHT_RULES) assert.ok(summer.get('ThoughtSet').includes(line), `${choice}: Summer`);
        const { locals: rosa } = await assemble('Rosa', { PromptChoice: choice });
        for (const line of THOUGHT_RULES) assert.ok(!rosa.get('ThoughtSet').includes(line), `${choice}: Rosa has thoughts off`);
    }
});

// Since 2026-11-19 the per-chat switch covers every intro that turns thoughts on, not just Summer, Belle and Loona.
const disabledLine = /CHARACTER THOUGHTS: DISABLED BY DEFAULT/;
const THOUGHT_INTROS = [
    // [card, greeting swipe, chat variables the intro sets, who PromptOS names]
    ['Summer', 0, {}, 'Summer'], ['Belle', 0, {}, 'Belle'], ['Loona', 0, {}, 'Loona'], ['Hannah', 0, {}, 'Hannah'],
    ['Seth', 0, {}, 'Seth'], ['Lentyl', 0, {}, 'Lentyl'], ['Briar', 0, {}, 'Briar'], ['Dash', 0, {}, 'Dash'],
    ['Vera', 0, {}, 'Vera'],
    ['Cerberus Sisters', 0, { CerberusSister: 'Fawne', SpecialThoughts: 'true' }, 'Fawne'],
    ['Jenn', 1, { SpecialThoughts: 'true' }, 'Jenn'],
    ['Blake', 1, { SpecialThoughts: 'true' }, 'Blake'],
];

test('every thought-enabled intro can turn its thoughts off for one chat, and records who thinks', async () => {
    for (const choice of ['Current Prompt', 'Old Prompt 2026', 'Old Prompt 2025', 'Mini Prompt']) {
        for (const [card, swipe, vars, thinker] of THOUGHT_INTROS) {
            const on = (await assemble(card, { PromptChoice: choice }, { ...vars }, null, swipe)).locals;
            assert.doesNotMatch(on.get('ThoughtSet'), disabledLine, `${choice}: ${card} thoughts are on by default`);
            for (const line of THOUGHT_RULES) assert.ok(on.get('ThoughtSet').includes(line), `${choice}: ${card} gets the rules`);
            assert.equal(on.get(CHARACTER_THOUGHTS_AVAILABLE), thinker, `${choice}: ${card} names ${thinker}`);

            const off = (await assemble(card, { PromptChoice: choice }, { ...vars, [CHARACTER_THOUGHTS_VARIABLE]: 'Disabled' }, null, swipe)).locals;
            assert.match(off.get('ThoughtSet'), disabledLine, `${choice}: ${card} thoughts are off`);
            for (const line of THOUGHT_RULES) assert.ok(!off.get('ThoughtSet').includes(line), `${choice}: ${card} gets no thought rules`);
            assert.equal(off.get(CHARACTER_THOUGHTS_AVAILABLE), thinker, `${choice}: ${card} keeps its switch while off`);
        }
    }
});

test('chats without thoughts get no switch; Bap keeps her own Baphomet switch instead', async () => {
    // Cerberus's custom start (greeting 4, sister "3rd") has no switch (Lucky, 2026-11-19).
    // Willow: thoughts off and no switch on every intro (Lucky, 2026-11-19).
    for (const [card, swipe, vars] of [['Rosa', 0, {}], ['Willow', 0, {}], ['Willow', 1, {}], ['Willow', 2, {}], ['Jenn', 0, {}], ['Cerberus Sisters', 0, { CerberusSister: 'Fern' }],
        ['Cerberus Sisters', 3, { CerberusSister: '3rd' }], ['Cerberus Sisters', 3, { CerberusSister: '3rd', SpecialThoughts: 'true' }], ['Bap', 0, {}]]) {
        const { locals } = await assemble(card, {}, { ...vars }, null, swipe);
        assert.equal(locals.get(CHARACTER_THOUGHTS_AVAILABLE), NO_THOUGHTS, `${card} greeting ${swipe + 1} has no Character Thoughts switch`);
    }
    // A saved Disabled does not reach Bap: Baphomet's own visibility switch decides.
    const { locals: bap } = await assemble('Bap', {}, { [CHARACTER_THOUGHTS_VARIABLE]: 'Disabled' });
    assert.doesNotMatch(bap.get('ThoughtSet'), disabledLine);
});

// Lucky, 2026-11-19: every thought-enabled character has the switch on every intro, custom start included, and Vera on all
// three. Card greeting counts are read from the shipped cards' layout: index = greeting, the last one is the [CS] start.
const ALWAYS_ON_GREETINGS = { Summer: 4, Belle: 5, Loona: 3, Hannah: 3, Seth: 2, Lentyl: 2, Briar: 2, Dash: 2 };
test('always-on characters have the switch on every intro, custom start included', async () => {
    for (const [card, count] of Object.entries(ALWAYS_ON_GREETINGS)) {
        for (let swipe = 0; swipe < count; swipe++) {
            const { locals } = await assemble(card, {}, {}, null, swipe);
            assert.equal(locals.get(CHARACTER_THOUGHTS_AVAILABLE), card, `${card} greeting ${swipe + 1}`);
            assert.doesNotMatch(locals.get('ThoughtSet'), disabledLine, `${card} greeting ${swipe + 1}: on by default`);
        }
    }
});

test('Vera has the switch on all three intros; it defaults on only where thoughts always were on', async () => {
    for (const [swipe, vars, on] of [[0, {}, true], [1, {}, false], [2, {}, false], [2, { Scenario: 'x' }, true]]) {
        const { locals } = await assemble('Vera', {}, { ...vars }, null, swipe);
        assert.equal(locals.get(CHARACTER_THOUGHTS_AVAILABLE), 'Vera', `Vera greeting ${swipe + 1} has the switch`);
        assert.equal(locals.get(CHARACTER_THOUGHTS_DEFAULT), on ? 'on' : 'off');
        (on ? assert.doesNotMatch : assert.match)(locals.get('ThoughtSet'), disabledLine, `Vera greeting ${swipe + 1} default`);
        const flipped = (await assemble('Vera', {}, { ...vars, [CHARACTER_THOUGHTS_VARIABLE]: on ? 'Disabled' : 'Enabled' }, null, swipe)).locals;
        (on ? assert.match : assert.doesNotMatch)(flipped.get('ThoughtSet'), disabledLine, `Vera greeting ${swipe + 1} flipped`);
    }
});

test('the switch: explicit choice wins, unset follows the default', () => {
    assert.equal(thoughtsSwitchOn(undefined), true);
    assert.equal(thoughtsSwitchOn('', 'off'), false);
    assert.equal(thoughtsSwitchOn('Enabled', 'off'), true);
    assert.equal(thoughtsSwitchOn('Disabled', 'on'), false);
});

test('Vera original greeting enables thoughts before its scenario state is applied', async () => {
    for (const choice of ['Current Prompt', 'Old Prompt 2026', 'Old Prompt 2025', 'Mini Prompt']) {
        const { locals } = await assemble('Vera', { PromptChoice: choice }, {}, null, 0);
        const set = String(locals.get('ThoughtSet'));
        assert.doesNotMatch(set, /DISABLED BY DEFAULT/, `${choice}: Vera original greeting keeps thoughts on`);
        for (const line of THOUGHT_RULES) assert.ok(set.includes(line), `${choice}: Vera original greeting gets the rules`);
    }
});

// Greetings that turn thoughts on themselves (SpecialThoughts + their own ThoughtSet in scenarios.js) used to end up with the
// "thoughts disabled" line, because XXX swapped in rav.thinkSpec. Drunk Jenn (greeting 2) is the one Lucky caught.
test('greetings with their own thoughts block keep it, on every prompt choice', async () => {
    const { scenarios } = await import('../../quick-reply-ext/src/scenarios.js');
    const cases = [];
    for (const [name, cfg] of scenarios) {
        (cfg.greetings ?? []).forEach((g, swipe) => {
            if (String(g.SpecialThoughts ?? '') === 'true' && g.ThoughtSet) cases.push({ name, swipe, own: String(g.ThoughtSet) });
        });
    }
    assert.ok(cases.some(c => c.name === 'Jenn' && c.swipe === 1), 'drunk Jenn is one of them');
    for (const choice of ['Current Prompt', 'Old Prompt 2026', 'Old Prompt 2025', 'Mini Prompt']) {
        for (const { name, swipe, own } of cases) {
            const { locals } = await assemble(name, { PromptChoice: choice }, { SpecialThoughts: 'true' }, null, swipe);
            const set = locals.get('ThoughtSet');
            if (name === 'Cerberus Sisters' && swipe === 0) continue;   // Fawne's greeting has its own branch above this one
            assert.equal(set, withThoughtRules(own), `${choice}: ${name} greeting ${swipe + 1} keeps its own thoughts block`);
            assert.doesNotMatch(set, /DISABLED BY DEFAULT/, `${choice}: ${name} greeting ${swipe + 1} is not switched off`);
            for (const line of THOUGHT_RULES) assert.ok(set.includes(line), `${choice}: ${name} greeting ${swipe + 1} gets the rules`);
        }
    }
});

test('a SpecialThoughts greeting with no block of its own still falls back to the old text', async () => {
    const { locals } = await assemble('Rosa', {}, { SpecialThoughts: 'true' }, null, 0);
    assert.equal(locals.get('ThoughtSet'), ravs.get('Mini Prompt').thinkSpec);
});
