import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { ravs } from '../../quick-reply-ext/src/promptRegistry.js';
import { THOUGHT_RULES, withThoughtRules } from '../../quick-reply-ext/src/promptModifiers.js';
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
            assert.ok(out.indexOf(line) < out.indexOf('</thought directions>'), `${name}: inside the block`);
        }
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
