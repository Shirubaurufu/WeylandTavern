import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { ravs } from '../../quick-reply-ext/src/promptRegistry.js';
import { THOUGHT_RULES, withThoughtRules } from '../../quick-reply-ext/src/promptModifiers.js';
import { CHARACTER_THOUGHTS_VARIABLE } from '../../quick-reply-ext/src/characterThoughts.js';
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
    assert.equal((source.match(/setLocalVariable\("ThoughtSet", withThoughtRules\(rav\.thinkYes\)\)/g) ?? []).length, 3);
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

test('Summer, Belle and Loona can disable thoughts per chat without affecting any other thoughts character', async () => {
    const disabledLine = /CHARACTER THOUGHTS: DISABLED BY DEFAULT/;
    for (const choice of ['Current Prompt', 'Old Prompt 2026', 'Old Prompt 2025', 'Mini Prompt']) {
        for (const characterName of ['Summer', 'Belle', 'Loona']) {
            const { locals } = await assemble(characterName, { PromptChoice: choice }, { [CHARACTER_THOUGHTS_VARIABLE]: 'Disabled' });
            assert.match(locals.get('ThoughtSet'), disabledLine, `${choice}: ${characterName} thoughts are off`);
            for (const line of THOUGHT_RULES) assert.ok(!locals.get('ThoughtSet').includes(line), `${choice}: ${characterName} gets no thought rules`);
        }

        // The saved variable is deliberately ignored for cards that do not expose this control.
        const { locals: hannah } = await assemble('Hannah', { PromptChoice: choice }, { [CHARACTER_THOUGHTS_VARIABLE]: 'Disabled' });
        assert.doesNotMatch(hannah.get('ThoughtSet'), disabledLine, `${choice}: Hannah is unaffected`);
        for (const line of THOUGHT_RULES) assert.ok(hannah.get('ThoughtSet').includes(line), `${choice}: Hannah keeps thought rules`);
    }
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
