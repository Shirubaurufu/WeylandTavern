import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, buildGroupSystemPrompt, buildMessages, resolveProfileId, sendMessage, reconstructHistoryAsPhoneFormat, resolveStoredMessageTime, applyMacroSubstitution } from '../lib/generation.js';

test('buildSystemPrompt joins non-empty sections in main->WIbefore->description->personality->scenario->WIafter order', () => {
    const result = buildSystemPrompt({
        systemPrompt: 'MAIN',
        worldInfoBefore: 'WIBEFORE',
        descriptionText: 'DESC',
        personalityText: 'PERSONALITY',
        scenarioText: 'SCENARIO',
        worldInfoAfter: 'WIAFTER',
    });
    assert.equal(result, 'MAIN\n\nWIBEFORE\n\nDESC\n\nPERSONALITY\n\nSCENARIO\n\nWIAFTER');
});

test('buildSystemPrompt skips empty/whitespace-only sections', () => {
    const result = buildSystemPrompt({
        systemPrompt: 'MAIN',
        worldInfoBefore: '',
        descriptionText: '   ',
        personalityText: 'PERSONALITY',
        scenarioText: undefined,
        worldInfoAfter: 'WIAFTER',
    });
    assert.equal(result, 'MAIN\n\nPERSONALITY\n\nWIAFTER');
});

test('group prompts place relationship context near the end before the final no-thoughts rule', () => {
    const result = buildGroupSystemPrompt({
        participants: [{ name: 'Miu', personalityText: 'warm' }, { name: 'Bastet', personalityText: 'prickly' }],
        worldInfo: 'WORLD INFO',
        textingInstructions: 'TEXTING RULES',
        relationshipContext: 'RELATIONSHIP CONTEXT',
        finalInstructions: 'THOUGHTS DISABLED',
    });
    assert.ok(result.indexOf('WORLD INFO') < result.indexOf('TEXTING RULES'));
    assert.ok(result.indexOf('TEXTING RULES') < result.indexOf('RELATIONSHIP CONTEXT'));
    assert.ok(result.indexOf('RELATIONSHIP CONTEXT') < result.indexOf('THOUGHTS DISABLED'));
});

test('buildMessages produces a system message, then history, then the new user message', () => {
    const result = buildMessages({
        systemPromptText: 'SYSTEM',
        history: [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'reply' }],
        userMessage: 'new message',
    });
    assert.deepEqual(result, [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'earlier' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'new message' },
    ]);
});

test('buildMessages coalesces 3 consecutive assistant history entries into one newline-joined message', () => {
    const result = buildMessages({
        systemPromptText: 'SYSTEM',
        history: [
            { role: 'user', content: 'hey' },
            { role: 'assistant', content: 'burst 1' },
            { role: 'assistant', content: 'burst 2' },
            { role: 'assistant', content: 'burst 3' },
        ],
        userMessage: 'new message',
    });
    assert.deepEqual(result, [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'hey' },
        { role: 'assistant', content: 'burst 1\nburst 2\nburst 3' },
        { role: 'user', content: 'new message' },
    ]);
});

test('buildMessages coalesces 2 consecutive user history entries (dangling-user-turn scenario)', () => {
    // The trailing userMessage also coalesces into the boundary: since the last (coalesced)
    // history entry is role:'user', userMessage merges into it rather than becoming a fourth,
    // adjacent role:'user' message.
    const result = buildMessages({
        systemPromptText: 'SYSTEM',
        history: [
            { role: 'assistant', content: 'earlier reply' },
            { role: 'user', content: 'first attempt' },
            { role: 'user', content: 'retry after failed generation' },
        ],
        userMessage: 'new message',
    });
    assert.deepEqual(result, [
        { role: 'system', content: 'SYSTEM' },
        { role: 'assistant', content: 'earlier reply' },
        { role: 'user', content: 'first attempt\nretry after failed generation\nnew message' },
    ]);
});

test('buildMessages leaves strictly-alternating history unaffected (one message per entry)', () => {
    const result = buildMessages({
        systemPromptText: 'SYSTEM',
        history: [
            { role: 'user', content: 'a' },
            { role: 'assistant', content: 'b' },
            { role: 'user', content: 'c' },
            { role: 'assistant', content: 'd' },
        ],
        userMessage: 'new message',
    });
    assert.deepEqual(result, [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
        { role: 'assistant', content: 'd' },
        { role: 'user', content: 'new message' },
    ]);
});

test('buildMessages coalescing does not touch the leading system message, but does coalesce into the trailing userMessage when the boundary role matches', () => {
    // Leading system message must never merge with a same-role-looking history entry. The
    // trailing userMessage DOES merge into the last history message when that message is also
    // role:'user' (the history/userMessage boundary is coalesced too, not just within history).
    const result = buildMessages({
        systemPromptText: 'SYSTEM',
        history: [
            { role: 'assistant', content: 'x' },
            { role: 'user', content: 'y' },
        ],
        userMessage: 'z',
    });
    assert.deepEqual(result, [
        { role: 'system', content: 'SYSTEM' },
        { role: 'assistant', content: 'x' },
        { role: 'user', content: 'y\nz' },
    ]);
    assert.equal(result[0].role, 'system');
    assert.equal(result.length, 3);
});

test('buildMessages does not merge the trailing userMessage when history ends on role:assistant', () => {
    // Guards against an overly-aggressive fix: alternating history ending in 'assistant' should
    // still produce a separate final 'user' message, not merge into the assistant entry.
    const result = buildMessages({
        systemPromptText: 'SYSTEM',
        history: [
            { role: 'user', content: 'a' },
            { role: 'assistant', content: 'b' },
        ],
        userMessage: 'c',
    });
    assert.deepEqual(result, [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
    ]);
});

test('resolveProfileId prefers the WeyPhone override when set', () => {
    assert.equal(resolveProfileId({ connectionProfileId: 'override-id' }, 'active-id'), 'override-id');
});

test('resolveProfileId falls back to the active profile when no override is set', () => {
    assert.equal(resolveProfileId({ connectionProfileId: '' }, 'active-id'), 'active-id');
});

test('resolveProfileId returns an empty string when neither is set', () => {
    assert.equal(resolveProfileId({ connectionProfileId: '' }, ''), '');
});

test('sendMessage throws when no profileId is available', async () => {
    await assert.rejects(
        () => sendMessage({ sendRequest: async () => 'unused', profileId: '', messages: [] }),
        /No Connection Profile available/,
    );
});

test('sendMessage calls sendRequest with the profileId and messages', async () => {
    let capturedArgs = null;
    const fakeSendRequest = async (profileId, messages) => {
        capturedArgs = { profileId, messages };
        return 'the reply';
    };
    const result = await sendMessage({ sendRequest: fakeSendRequest, profileId: 'p1', messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(result, 'the reply');
    assert.deepEqual(capturedArgs, { profileId: 'p1', messages: [{ role: 'user', content: 'hi' }] });
});

test('reconstructHistoryAsPhoneFormat wraps user turns as Outgoing lines and assistant turns as Incoming lines', () => {
    const history = [
        { role: 'user', content: 'hey', timestamp: 1000 },
        { role: 'assistant', content: 'hi there', timestamp: 2000 },
    ];
    const fakeFormatClockTime = (ms) => `T${ms}`;
    const result = reconstructHistoryAsPhoneFormat(history, { charName: 'Rosa', userName: 'Ava' }, fakeFormatClockTime);
    assert.deepEqual(result, [
        { role: 'user', content: 'Outgoing¦T1000¦Ava¦hey' },
        { role: 'assistant', content: 'Incoming¦T2000¦Rosa¦hi there' },
    ]);
});

test('reconstructHistoryAsPhoneFormat leaves the time field empty when a message has no timestamp', () => {
    const history = [{ role: 'user', content: 'hey' }];
    const fakeFormatClockTime = () => { throw new Error('should not be called'); };
    const result = reconstructHistoryAsPhoneFormat(history, { charName: 'Rosa', userName: 'Ava' }, fakeFormatClockTime);
    assert.deepEqual(result, [{ role: 'user', content: 'Outgoing¦¦Ava¦hey' }]);
});

test('resolveStoredMessageTime prefers the scene displayTime over the storage timestamp', () => {
    const fakeFormatClockTime = () => { throw new Error('wall-clock formatter must not be called'); };
    assert.equal(resolveStoredMessageTime({ displayTime: '9:28 AM', timestamp: 1000 }, fakeFormatClockTime), '9:28 AM');
});

test('reconstructHistoryAsPhoneFormat omits legacy wall-clock time while RP-clock mode is active', () => {
    const history = [{ role: 'user', content: 'legacy message', timestamp: 1000 }];
    const fakeFormatClockTime = () => { throw new Error('wall-clock formatter must not be called'); };
    const result = reconstructHistoryAsPhoneFormat(
        history,
        { charName: 'Rosa', userName: 'Ava' },
        fakeFormatClockTime,
        { suppressTimestampFallback: true },
    );
    assert.deepEqual(result, [{ role: 'user', content: 'Outgoing¦¦Ava¦legacy message' }]);
});

test('reconstructHistoryAsPhoneFormat returns an empty array for empty history', () => {
    assert.deepEqual(reconstructHistoryAsPhoneFormat([], { charName: 'Rosa', userName: 'Ava' }, () => ''), []);
});

test('reconstructHistoryAsPhoneFormat preserves turn order', () => {
    const history = [
        { role: 'user', content: 'a', timestamp: 1 },
        { role: 'assistant', content: 'b', timestamp: 2 },
        { role: 'user', content: 'c', timestamp: 3 },
    ];
    const result = reconstructHistoryAsPhoneFormat(history, { charName: 'Rosa', userName: 'Ava' }, (t) => String(t));
    assert.deepEqual(result.map(r => r.content), ['Outgoing¦1¦Ava¦a', 'Incoming¦2¦Rosa¦b', 'Outgoing¦3¦Ava¦c']);
});

test('applyMacroSubstitution calls substituteParams with replaceCharacterCard forced to false', () => {
    let capturedArgs = null;
    const fakeSubstituteParams = (content, name1, name2, original, group, replaceCharacterCard, additionalMacro) => {
        capturedArgs = { content, name1, name2, original, group, replaceCharacterCard, additionalMacro };
        return 'SUBSTITUTED';
    };
    const result = applyMacroSubstitution({
        substituteParams: fakeSubstituteParams,
        content: 'Hi {{user}}, this is {{char}}.',
        userName: 'Ava',
        charName: 'Rosa',
    });
    assert.equal(result, 'SUBSTITUTED');
    assert.deepEqual(capturedArgs, {
        content: 'Hi {{user}}, this is {{char}}.',
        name1: 'Ava',
        name2: 'Rosa',
        original: undefined,
        group: undefined,
        replaceCharacterCard: false,
        additionalMacro: {},
    });
});

test('applyMacroSubstitution returns an empty string for empty/undefined content without calling substituteParams', () => {
    let called = false;
    const fakeSubstituteParams = () => { called = true; return 'unused'; };
    assert.equal(applyMacroSubstitution({ substituteParams: fakeSubstituteParams, content: '', userName: 'Ava', charName: 'Rosa' }), '');
    assert.equal(applyMacroSubstitution({ substituteParams: fakeSubstituteParams, content: undefined, userName: 'Ava', charName: 'Rosa' }), '');
    assert.equal(called, false);
});

// Mirrors runPhoneAppGeneration's own call sequence in index.js: buildMessages() first, then
// applyMacroSubstitution() is applied to messages[0] (system prompt) and messages[messages.length
// - 1] (the trailing user message, which is where PHONE_APP_PROMPTS[appKey]'s embedded
// {{user}}/{{getvar::...}} roster tokens actually live). index.js's runPhoneAppGeneration itself
// isn't exported/unit-testable (same constraint as generateReply/generateMemory elsewhere in this
// file), so this test locks in the composed buildMessages + applyMacroSubstitution behavior the
// fix depends on rather than exercising runPhoneAppGeneration directly.
test('buildMessages + applyMacroSubstitution resolves real macros in both the system prompt and the trailing user message, matching runPhoneAppGeneration', () => {
    const fakeSubstituteParams = (content, name1, name2) => content
        .replaceAll('{{user}}', name1)
        .replaceAll('{{char}}', name2)
        .replaceAll('{{getvar::MCY-2}}', 'Karmen bio text');

    const messages = buildMessages({
        systemPromptText: 'System prompt for {{char}}, greeting {{user}}.',
        history: [],
        userMessage: 'Roster: {{user}} met Karmen. Bio: {{getvar::MCY-2}}.',
    });

    const userName = 'Ava';
    const charName = 'Rosa';
    messages[0].content = applyMacroSubstitution({
        substituteParams: fakeSubstituteParams,
        content: messages[0].content,
        userName,
        charName,
    });
    if (messages.length > 1) {
        const lastMessage = messages[messages.length - 1];
        lastMessage.content = applyMacroSubstitution({
            substituteParams: fakeSubstituteParams,
            content: lastMessage.content,
            userName,
            charName,
        });
    }

    assert.equal(messages[0].content, 'System prompt for Rosa, greeting Ava.');
    assert.equal(messages[messages.length - 1].content, 'Roster: Ava met Karmen. Bio: Karmen bio text.');
    assert.ok(!messages.some(m => m.content.includes('{{user}}') || m.content.includes('{{getvar::')));
});

test('resolveModelOverride: explicit setting wins, then live model, then empty', async () => {
    const { resolveModelOverride } = await import('../lib/generation.js');
    assert.equal(resolveModelOverride({ settingsModel: 'deepseek-v4-pro', liveModel: 'sonnet' }), 'deepseek-v4-pro');
    assert.equal(resolveModelOverride({ settingsModel: '  ', liveModel: 'sonnet' }), 'sonnet');
    assert.equal(resolveModelOverride({ settingsModel: '', liveModel: '' }), '');
    assert.equal(resolveModelOverride({}), '');
    assert.equal(resolveModelOverride({ settingsModel: ' glm-4.7-thinking ' }), 'glm-4.7-thinking');
});
