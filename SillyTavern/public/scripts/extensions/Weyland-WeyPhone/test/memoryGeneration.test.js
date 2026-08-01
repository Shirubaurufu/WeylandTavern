// test/memoryGeneration.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemoryGenerationMessages, joinMemoriesForInjection, sendMemoryRequest } from '../lib/memoryGeneration.js';

test('buildMemoryGenerationMessages returns a system+user message pair', () => {
    const windowMessages = [
        { role: 'user', content: 'hey', timestamp: 1000 },
        { role: 'assistant', content: 'hi there', timestamp: 2000 },
    ];
    const fakeFormatClockTime = (ms) => `T${ms}`;
    const messages = buildMemoryGenerationMessages({
        charName: 'Rosa',
        personalityText: 'Rosa is blunt and sarcastic.',
        windowMessages,
        userName: 'Ava',
        formatClockTime: fakeFormatClockTime,
    });
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[1].role, 'user');
});

test('buildMemoryGenerationMessages system message references the character name and personality', () => {
    const messages = buildMemoryGenerationMessages({
        charName: 'Rosa',
        personalityText: 'Rosa is blunt and sarcastic.',
        windowMessages: [],
        userName: 'Ava',
        formatClockTime: () => '',
    });
    assert.match(messages[0].content, /Rosa/);
    assert.match(messages[0].content, /Rosa is blunt and sarcastic\./);
});

test('buildMemoryGenerationMessages omits the personality section when empty', () => {
    const messages = buildMemoryGenerationMessages({
        charName: 'Rosa',
        personalityText: '',
        windowMessages: [],
        userName: 'Ava',
        formatClockTime: () => '',
    });
    // The personality section is joined LAST, with '\n\n'. If an empty personality still leaked
    // in as a third section, the content would end with a trailing separator instead of the
    // instruction sentence. Assert it ends exactly at the instruction section (nothing appended)
    // and that there are exactly two '\n\n'-joined sections (neither of which contains an
    // internal '\n\n'), which together prove no personality content was included.
    assert.ok(
        messages[0].content.endsWith('just plain prose, like a brief diary entry.'),
        'with empty personality, the system prompt must end at the instruction section',
    );
    assert.equal(messages[0].content.split('\n\n').length, 2);
});

test('buildMemoryGenerationMessages appends the personality section verbatim when present', () => {
    // Positive contrast to the "omits when empty" case: a distinctive personality string is the
    // third '\n\n'-joined section and appears verbatim at the end.
    const messages = buildMemoryGenerationMessages({
        charName: 'Rosa',
        personalityText: 'ZZ_DISTINCTIVE_PERSONALITY_ZZ',
        windowMessages: [],
        userName: 'Ava',
        formatClockTime: () => '',
    });
    assert.ok(messages[0].content.endsWith('ZZ_DISTINCTIVE_PERSONALITY_ZZ'));
    assert.equal(messages[0].content.split('\n\n').length, 3);
});

test('buildMemoryGenerationMessages user message contains the phone-format transcript of the window', () => {
    const windowMessages = [
        { role: 'user', content: 'hey', timestamp: 1000 },
        { role: 'assistant', content: 'hi there', timestamp: 2000 },
    ];
    const fakeFormatClockTime = (ms) => `T${ms}`;
    const messages = buildMemoryGenerationMessages({
        charName: 'Rosa',
        personalityText: '',
        windowMessages,
        userName: 'Ava',
        formatClockTime: fakeFormatClockTime,
    });
    assert.match(messages[1].content, /Outgoing¦T1000¦Ava¦hey/);
    assert.match(messages[1].content, /Incoming¦T2000¦Rosa¦hi there/);
});

test('buildMemoryGenerationMessages preserves scene times and suppresses legacy wall-clock fallback in RP mode', () => {
    const messages = buildMemoryGenerationMessages({
        charName: 'Rosa',
        personalityText: '',
        windowMessages: [
            { role: 'user', content: 'scene-authored', timestamp: 1000, displayTime: '9:28 AM' },
            { role: 'assistant', content: 'legacy', timestamp: 2000 },
        ],
        userName: 'Ava',
        formatClockTime: () => { throw new Error('wall-clock formatter must not be called'); },
        suppressTimestampFallback: true,
    });
    assert.match(messages[1].content, /Outgoing¦9:28 AM¦Ava¦scene-authored/);
    assert.match(messages[1].content, /Incoming¦¦Rosa¦legacy/);
});

test('joinMemoriesForInjection returns an empty string for no memories', () => {
    assert.equal(joinMemoriesForInjection([]), '');
});

test('joinMemoriesForInjection wraps memory content in a LONG TERM MEMORY block', () => {
    const result = joinMemoriesForInjection([{ content: 'They met at a party.' }, { content: 'She shared her real name.' }]);
    assert.match(result, /^\[LONG TERM MEMORY\]/);
    assert.match(result, /- They met at a party\./);
    assert.match(result, /- She shared her real name\./);
    assert.match(result, /\[END LONG TERM MEMORY\]$/);
});

test('joinMemoriesForInjection preserves memory order', () => {
    const result = joinMemoriesForInjection([{ content: 'first' }, { content: 'second' }]);
    assert.ok(result.indexOf('first') < result.indexOf('second'));
});

test('joinMemoriesForInjection clarifies that a memory resembling the current scene already happened', () => {
    const result = joinMemoriesForInjection([{ content: 'x' }]);
    assert.match(result, /ALREADY HAPPENED/);
    assert.match(result, /source of truth/);
    assert.match(result, /not instructions for what should happen next/);
});

test('joinMemoriesForInjection does not claim keyword-similarity retrieval (WeyPhone injects every pinned memory unconditionally, unlike LTM)', () => {
    const result = joinMemoriesForInjection([{ content: 'x' }]);
    assert.doesNotMatch(result, /keyword similarity/i);
});

test('sendMemoryRequest calls sendRequest with the primary model and returns its result on success', async () => {
    const calls = [];
    const sendRequest = async (profileId, messages, model) => {
        calls.push({ profileId, messages, model });
        return 'primary result';
    };
    const result = await sendMemoryRequest({
        sendRequest, profileId: 'profile-1', messages: [{ role: 'user', content: 'x' }],
        primaryModel: 'gemini-3-pro-preview', backupModel: 'glm-4.7',
    });
    assert.equal(result, 'primary result');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, 'gemini-3-pro-preview');
});

test('sendMemoryRequest falls back to the backup model if the primary call throws', async () => {
    const calls = [];
    const sendRequest = async (profileId, messages, model) => {
        calls.push(model);
        if (model === 'gemini-3-pro-preview') throw new Error('primary failed');
        return 'backup result';
    };
    const result = await sendMemoryRequest({
        sendRequest, profileId: 'profile-1', messages: [],
        primaryModel: 'gemini-3-pro-preview', backupModel: 'glm-4.7',
    });
    assert.equal(result, 'backup result');
    assert.deepEqual(calls, ['gemini-3-pro-preview', 'glm-4.7']);
});

test('sendMemoryRequest throws the primary error if there is no backup model configured', async () => {
    const sendRequest = async () => { throw new Error('primary failed'); };
    await assert.rejects(
        sendMemoryRequest({ sendRequest, profileId: 'profile-1', messages: [], primaryModel: 'gemini-3-pro-preview', backupModel: '' }),
        /primary failed/,
    );
});

test('sendMemoryRequest throws if both primary and backup calls fail', async () => {
    const sendRequest = async (profileId, messages, model) => { throw new Error(`${model} failed`); };
    await assert.rejects(
        sendMemoryRequest({ sendRequest, profileId: 'profile-1', messages: [], primaryModel: 'gemini-3-pro-preview', backupModel: 'glm-4.7' }),
        /glm-4\.7 failed/,
    );
});

test('sendMemoryRequest throws without calling sendRequest when there is no Connection Profile', async () => {
    let called = false;
    const sendRequest = async () => { called = true; };
    await assert.rejects(
        sendMemoryRequest({ sendRequest, profileId: '', messages: [], primaryModel: 'gemini-3-pro-preview' }),
        /No Connection Profile/,
    );
    assert.equal(called, false);
});

test('sendMemoryRequest throws without calling sendRequest when there is no primary model configured', async () => {
    let called = false;
    const sendRequest = async () => { called = true; };
    await assert.rejects(
        sendMemoryRequest({ sendRequest, profileId: 'profile-1', messages: [], primaryModel: '' }),
        /No primary model/,
    );
    assert.equal(called, false);
});
