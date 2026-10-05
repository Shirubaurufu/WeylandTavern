import test from 'node:test';
import assert from 'node:assert/strict';
import { withTypingState } from '../lib/generationTracking.js';

test('withTypingState marks summaries whose id is in the set as typing', () => {
    const summaries = [
        { id: 'a', charName: 'Rosa', lastMessageSnippet: 'hi', lastActive: 100 },
        { id: 'b', charName: 'Ava', lastMessageSnippet: 'hey', lastActive: 200 },
    ];
    const generating = new Set(['b']);
    const result = withTypingState(summaries, generating);
    assert.equal(result[0].isTyping, false);
    assert.equal(result[1].isTyping, true);
});

test('withTypingState marks every summary as not typing when the set is empty', () => {
    const summaries = [{ id: 'a', charName: 'Rosa', lastMessageSnippet: 'hi', lastActive: 100 }];
    const result = withTypingState(summaries, new Set());
    assert.equal(result[0].isTyping, false);
});

test('withTypingState does not mutate the original summary objects', () => {
    const original = { id: 'a', charName: 'Rosa', lastMessageSnippet: 'hi', lastActive: 100 };
    const summaries = [original];
    withTypingState(summaries, new Set(['a']));
    assert.equal('isTyping' in original, false);
});

test('withTypingState preserves all original fields on each summary', () => {
    const summaries = [{ id: 'a', charName: 'Rosa', lastMessageSnippet: 'hi', lastActive: 100 }];
    const result = withTypingState(summaries, new Set(['a']));
    assert.equal(result[0].id, 'a');
    assert.equal(result[0].charName, 'Rosa');
    assert.equal(result[0].lastMessageSnippet, 'hi');
    assert.equal(result[0].lastActive, 100);
});

test('withTypingState returns an empty array for an empty summaries list', () => {
    assert.deepEqual(withTypingState([], new Set(['a'])), []);
});
