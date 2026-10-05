// test/promptResolution.real.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ravs } from '../../../../../public/scripts/extensions/quick-reply-ext/src/promptRegistry.js';
import { charPer } from '../../../../../public/scripts/extensions/quick-reply-ext/src/charper.js';
import { resolveMasterPrompt, resolvePostHistoryInstructions, resolvePersonalityText } from '../lib/promptResolution.js';

test('ravs has a "Current Prompt" entry with non-empty decoded content', () => {
    const entry = resolveMasterPrompt(ravs, 'Current Prompt');
    assert.equal(typeof entry.teg, 'string');
    assert.ok(entry.teg.length > 100, 'teg should be a substantial decoded prompt, not empty/short');
    assert.equal(typeof entry.post, 'string');
    assert.ok(entry.post.length > 10, 'post should be non-trivial decoded content');
});

test('resolvePostHistoryInstructions works against the real Current Prompt entry', () => {
    const entry = resolveMasterPrompt(ravs, 'Current Prompt');
    const result = resolvePostHistoryInstructions(entry, { htmlEnabled: false, rpFocus: 'test-focus' });
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('test-focus'), 'rpFocus should appear in the resolved text');
    assert.ok(!result.includes('{{pipe}}'), 'the {{pipe}} placeholder should be fully substituted');
});

test('charPer has a Rosa entry with non-empty decoded personality text', () => {
    const config = charPer.get('Rosa');
    assert.ok(config, 'charPer should have a Rosa entry');
    const text = resolvePersonalityText(config);
    assert.equal(typeof text, 'string');
    assert.ok(text.length > 50, 'Rosa personality text should be substantial, not empty/short');
});

test('charPer has an Ava entry with non-empty decoded personality text', () => {
    const config = charPer.get('Ava');
    assert.ok(config, 'charPer should have an Ava entry');
    const text = resolvePersonalityText(config);
    assert.equal(typeof text, 'string');
    assert.ok(text.length > 50, 'Ava personality text should be substantial, not empty/short');
});
