import test from 'node:test';
import assert from 'node:assert/strict';

import {
    estimatePhoneRequestTokens,
    limitPhoneRequestMessages,
    PHONE_REQUEST_MAX_INPUT_TOKENS,
    limitRecentHistory,
} from '../lib/requestBudget.js';

test('history window stops at the first oversized recent entry rather than skipping to older messages', () => {
    const messages = [{ content: 'old' }, { content: 'x'.repeat(1000) }, { content: 'new' }];
    assert.deepEqual(limitRecentHistory(messages, 100), [{ content: 'new' }]);
});

test('one oversized newest message stays bounded and does not mutate stored text', () => {
    const message = { role: 'user', content: 'START-' + '😀'.repeat(40000) + '-END' };
    const result = limitRecentHistory([message], 10000);
    assert.ok(estimatePhoneRequestTokens(result) <= 10000);
    assert.match(result[0].content, /^START-/);
    assert.match(result[0].content, /-END$/);
    assert.ok(message.content.length > result[0].content.length);
});

test('phone request budget leaves ordinary requests unchanged', () => {
    const messages = [
        { role: 'system', content: 'Reply as Summer.' },
        { role: 'user', content: 'Hey, did you see Sam?' },
    ];
    assert.deepEqual(limitPhoneRequestMessages(messages), messages);
});

test('phone request budget keeps a long chat below the 35K-token ceiling', () => {
    const messages = [
        { role: 'system', content: 'Phone system instructions and character context.' },
        ...Array.from({ length: 1_800 }, (_, index) => ({
            role: index % 2 ? 'assistant' : 'user',
            content: `Roleplay message ${index}: ${'scene context '.repeat(36)}`,
        })),
        { role: 'user', content: 'Generate the WeyPhone sync now.' },
    ];
    const bounded = limitPhoneRequestMessages(messages);
    assert.ok(bounded.length < messages.length);
    assert.ok(estimatePhoneRequestTokens(bounded) <= PHONE_REQUEST_MAX_INPUT_TOKENS);
    assert.equal(bounded[0].content, messages[0].content);
    assert.equal(bounded.at(-1).content, messages.at(-1).content);
});

test('phone request budget drops oldest history before newer history', () => {
    const messages = [
        { role: 'system', content: 'system' },
        { role: 'user', content: `oldest-${'x'.repeat(2_000)}` },
        { role: 'assistant', content: `newer-${'y'.repeat(2_000)}` },
        { role: 'user', content: 'final' },
    ];
    const bounded = limitPhoneRequestMessages(messages, 700);
    assert.equal(bounded[0].content, 'system');
    assert.equal(bounded.at(-1).content, 'final');
    assert.ok(bounded.some(message => message.content.startsWith('newer-')));
    assert.ok(!bounded.some(message => message.content.startsWith('oldest-')));
    assert.ok(estimatePhoneRequestTokens(bounded) <= 700);
});

test('phone request budget truncates oversized required edge messages', () => {
    const messages = [
        { role: 'system', content: `SYSTEM-${'a'.repeat(20_000)}` },
        { role: 'user', content: `FINAL-${'b'.repeat(20_000)}` },
    ];
    const bounded = limitPhoneRequestMessages(messages, 1_000);
    assert.equal(bounded.length, 2);
    assert.match(bounded[0].content, /^SYSTEM-/);
    assert.match(bounded[1].content, /^FINAL-/);
    assert.ok(estimatePhoneRequestTokens(bounded) <= 1_000);
});

test('phone request budget safely handles a single oversized message', () => {
    const bounded = limitPhoneRequestMessages([{ role: 'system', content: 'z'.repeat(20_000) }], 500);
    assert.equal(bounded.length, 1);
    assert.ok(estimatePhoneRequestTokens(bounded) <= 500);
});
