import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
    createConversation,
    getConversation,
    appendMessage,
    editMessage,
    deleteMessage,
    deleteMessages,
    deleteConversation,
    getAllConversationSummaries,
    migrateLegacyConversations,
    discardTrailingReply,
    createMemory,
    editMemory,
    deleteMemory,
    setMemoryPinned,
    getPinnedMemories,
    setMemorySettings,
    countExchangesSince,
    migrateMemoryFields,
    getMemoryWindow,
    getLastGeneratedMemory,
    migrateTetheredFields,
    setTetheredSettings,
    findOrCreateDedicatedAppConversation,
    getThreadsFor,
    findMostRecentThread,
    genTimestamp,
    DEFAULT_MEMORY_PRIMARY_MODEL,
    DEFAULT_MEMORY_BACKUP_MODEL,
    pruneOrphanedChatBuckets,
    migrateStaleModelNames,
} from '../lib/storage.js';

test('genTimestamp returns Date.now() when it is ahead of the last recorded timestamp (normal branch)', () => {
    mock.timers.enable({ apis: ['Date'] });
    try {
        // Comfortably ahead of any real timestamp genTimestamp may have already recorded from
        // earlier (real-clock) calls elsewhere in this file/module.
        const future = Date.now() + 10_000_000;
        mock.timers.setTime(future);
        const result = genTimestamp();
        assert.equal(result, future);
    } finally {
        mock.timers.reset();
    }
});

test('genTimestamp increments by 1 to break ties when two calls land on the same millisecond', () => {
    mock.timers.enable({ apis: ['Date'] });
    try {
        const future = Date.now() + 20_000_000;
        mock.timers.setTime(future);
        const first = genTimestamp(); // now > lastTimestamp -> normal branch, lastTimestamp = future
        const second = genTimestamp(); // Date.now() unchanged (fake clock frozen) -> tie-break branch
        assert.equal(second, first + 1);
        assert.ok(second > first);
    } finally {
        mock.timers.reset();
    }
});

test('createConversation creates a conversation with a generated id and empty messages', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    assert.equal(conversation.charName, 'Rosa');
    assert.deepEqual(conversation.messages, []);
    assert.equal(typeof conversation.id, 'string');
    assert.ok(conversation.id.length > 0);
    assert.equal(typeof conversation.createdAt, 'number');
    assert.equal(conversation.lastActive, conversation.createdAt);
    assert.equal(settings.conversations[conversation.id], conversation);
});

test('createConversation generates distinct ids for successive calls', () => {
    const settings = { conversations: {} };
    const a = createConversation(settings, 'Rosa');
    const b = createConversation(settings, 'Rosa');
    assert.notEqual(a.id, b.id);
});

test('createConversation allows multiple conversations with the same character', () => {
    const settings = { conversations: {} };
    const a = createConversation(settings, 'Rosa');
    const b = createConversation(settings, 'Rosa');
    assert.equal(Object.keys(settings.conversations).length, 2);
    assert.equal(getConversation(settings, a.id).charName, 'Rosa');
    assert.equal(getConversation(settings, b.id).charName, 'Rosa');
});

test('getConversation returns undefined for an unknown id', () => {
    const settings = { conversations: {} };
    assert.equal(getConversation(settings, 'nonexistent'), undefined);
});

test('appendMessage pushes a message and updates lastActive', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    const before = conversation.createdAt;
    const result = appendMessage(settings, conversation.id, { role: 'user', content: 'hi' });
    assert.deepEqual(result.messages, [{ role: 'user', content: 'hi' }]);
    assert.ok(result.lastActive >= before);
});

test('appendMessage returns undefined and is a no-op for an unknown conversation id', () => {
    const settings = { conversations: {} };
    assert.equal(appendMessage(settings, 'nonexistent', { role: 'user', content: 'hi' }), undefined);
});

test('editMessage replaces the content at the given index', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'user', content: 'original' });
    editMessage(settings, conversation.id, 0, 'edited');
    assert.equal(getConversation(settings, conversation.id).messages[0].content, 'edited');
});

test('editMessage does not change role or lastActive', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'assistant', content: 'original' });
    const lastActiveBefore = getConversation(settings, conversation.id).lastActive;
    editMessage(settings, conversation.id, 0, 'edited');
    const updated = getConversation(settings, conversation.id);
    assert.equal(updated.messages[0].role, 'assistant');
    assert.equal(updated.lastActive, lastActiveBefore);
});

test('editMessage is a no-op for an out-of-range index or unknown conversation', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'user', content: 'only message' });
    editMessage(settings, conversation.id, 5, 'should not apply');
    assert.equal(getConversation(settings, conversation.id).messages[0].content, 'only message');
    assert.equal(editMessage(settings, 'nonexistent', 0, 'x'), undefined);
});

test('deleteMessage removes the message at the given index', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'user', content: 'first' });
    appendMessage(settings, conversation.id, { role: 'assistant', content: 'second' });
    deleteMessage(settings, conversation.id, 0);
    const updated = getConversation(settings, conversation.id);
    assert.deepEqual(updated.messages, [{ role: 'assistant', content: 'second' }]);
});

test('deleteMessage is a no-op for an out-of-range index or unknown conversation', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'user', content: 'only message' });
    deleteMessage(settings, conversation.id, 5);
    assert.equal(getConversation(settings, conversation.id).messages.length, 1);
    assert.equal(deleteMessage(settings, 'nonexistent', 0), undefined);
});

test('deleteMessages removes all given indices in one pass', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'user', content: 'a' });
    appendMessage(settings, conversation.id, { role: 'assistant', content: 'b' });
    appendMessage(settings, conversation.id, { role: 'user', content: 'c' });
    appendMessage(settings, conversation.id, { role: 'assistant', content: 'd' });
    deleteMessages(settings, conversation.id, [0, 2]);
    assert.deepEqual(getConversation(settings, conversation.id).messages, [
        { role: 'assistant', content: 'b' }, { role: 'assistant', content: 'd' },
    ]);
});

test('deleteMessages is order-independent (descending, ascending, unsorted indices all work)', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    for (const c of ['a', 'b', 'c', 'd', 'e']) appendMessage(settings, conversation.id, { role: 'user', content: c });
    deleteMessages(settings, conversation.id, [3, 0, 1]);
    assert.deepEqual(getConversation(settings, conversation.id).messages.map(m => m.content), ['c', 'e']);
});

test('deleteMessages is a no-op for an empty index list or unknown conversation', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'user', content: 'only message' });
    deleteMessages(settings, conversation.id, []);
    assert.equal(getConversation(settings, conversation.id).messages.length, 1);
    assert.equal(deleteMessages(settings, 'nonexistent', [0]), undefined);
});

test('deleteConversation removes the conversation entirely', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    deleteConversation(settings, conversation.id);
    assert.equal(getConversation(settings, conversation.id), undefined);
    assert.equal(Object.keys(settings.conversations).length, 0);
});

test('deleteConversation on an unknown id does not throw', () => {
    const settings = { conversations: {} };
    assert.doesNotThrow(() => deleteConversation(settings, 'nonexistent'));
});

test('getAllConversationSummaries returns summaries sorted by lastActive descending', () => {
    const settings = { conversations: {} };
    const a = createConversation(settings, 'Rosa');
    appendMessage(settings, a.id, { role: 'user', content: 'first conversation' });
    const b = createConversation(settings, 'Ava');
    appendMessage(settings, b.id, { role: 'user', content: 'second conversation' });

    const summaries = getAllConversationSummaries(settings);
    assert.equal(summaries.length, 2);
    assert.equal(summaries[0].id, b.id); // most recently active first
    assert.equal(summaries[0].charName, 'Ava');
    assert.equal(summaries[0].lastMessageSnippet, 'second conversation');
    assert.equal(summaries[1].id, a.id);
});

test('getAllConversationSummaries reports an empty snippet for a conversation with no messages', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    const summaries = getAllConversationSummaries(settings);
    assert.equal(summaries[0].lastMessageSnippet, '');
    assert.equal(summaries[0].id, conversation.id);
});

test('getAllConversationSummaries returns an empty array when there are no conversations', () => {
    const settings = { conversations: {} };
    assert.deepEqual(getAllConversationSummaries(settings), []);
});

test('migrateLegacyConversations converts a charName-keyed entry with no id into the new shape', () => {
    const settings = { conversations: { Rosa: { messages: [{ role: 'user', content: 'hi' }], lastActive: 123 } } };
    migrateLegacyConversations(settings);
    assert.equal(settings.conversations.Rosa, undefined);
    const migrated = Object.values(settings.conversations)[0];
    assert.equal(migrated.charName, 'Rosa');
    assert.equal(typeof migrated.id, 'string');
    assert.deepEqual(migrated.messages, [{ role: 'user', content: 'hi' }]);
    assert.equal(migrated.lastActive, 123);
    assert.equal(migrated.createdAt, 123);
});

test('createConversation sets default memory fields on a new conversation', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    assert.deepEqual(conversation.memories, []);
    assert.equal(conversation.memoryThreshold, 100);
    assert.equal(conversation.memoryConnectionProfileId, '');
    assert.equal(conversation.lastMemoryMessageIndex, 0);
    assert.equal(conversation.memoryPrimaryModel, DEFAULT_MEMORY_PRIMARY_MODEL);
    assert.equal(conversation.memoryBackupModel, DEFAULT_MEMORY_BACKUP_MODEL);
});

test('createMemory adds a pinned-by-default memory and returns it', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    const memory = createMemory(settings, conversation.id, 'They met at a party.');
    assert.equal(memory.content, 'They met at a party.');
    assert.equal(memory.pinned, true);
    assert.equal(memory.sourceRange, null);
    assert.equal(typeof memory.id, 'string');
    assert.equal(typeof memory.createdAt, 'number');
    assert.deepEqual(conversation.memories, [memory]);
});

test('createMemory accepts pinned:false and a sourceRange override', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    const memory = createMemory(settings, conversation.id, 'text', { pinned: false, sourceRange: { from: 0, to: 5 } });
    assert.equal(memory.pinned, false);
    assert.deepEqual(memory.sourceRange, { from: 0, to: 5 });
});

test('createMemory returns undefined for an unknown conversation id', () => {
    const settings = { conversations: {} };
    assert.equal(createMemory(settings, 'nonexistent', 'text'), undefined);
});

test('editMemory updates a memory\'s content in place', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    const memory = createMemory(settings, conversation.id, 'original');
    editMemory(settings, conversation.id, memory.id, 'edited');
    assert.equal(conversation.memories[0].content, 'edited');
});

test('editMemory is a no-op for an unknown memory id', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    createMemory(settings, conversation.id, 'original');
    editMemory(settings, conversation.id, 'nonexistent', 'edited');
    assert.equal(conversation.memories[0].content, 'original');
});

test('deleteMemory removes the memory by id', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    const memory = createMemory(settings, conversation.id, 'text');
    deleteMemory(settings, conversation.id, memory.id);
    assert.deepEqual(conversation.memories, []);
});

test('deleteMemory is a no-op for an unknown memory id', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    createMemory(settings, conversation.id, 'text');
    deleteMemory(settings, conversation.id, 'nonexistent');
    assert.equal(conversation.memories.length, 1);
});

test('setMemoryPinned toggles a memory\'s pinned state', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    const memory = createMemory(settings, conversation.id, 'text');
    setMemoryPinned(settings, conversation.id, memory.id, false);
    assert.equal(conversation.memories[0].pinned, false);
    setMemoryPinned(settings, conversation.id, memory.id, true);
    assert.equal(conversation.memories[0].pinned, true);
});

test('getPinnedMemories returns only pinned memories', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    const a = createMemory(settings, conversation.id, 'pinned one');
    const b = createMemory(settings, conversation.id, 'unpinned one', { pinned: false });
    const result = getPinnedMemories(settings, conversation.id);
    assert.deepEqual(result, [a]);
});

test('getPinnedMemories returns an empty array for an unknown conversation id', () => {
    const settings = { conversations: {} };
    assert.deepEqual(getPinnedMemories(settings, 'nonexistent'), []);
});

test('setMemorySettings partially updates only the provided fields', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    setMemorySettings(settings, conversation.id, { memoryThreshold: 50 });
    assert.equal(conversation.memoryThreshold, 50);
    assert.equal(conversation.memoryConnectionProfileId, '');
    setMemorySettings(settings, conversation.id, { memoryConnectionProfileId: 'profile-1' });
    assert.equal(conversation.memoryThreshold, 50);
    assert.equal(conversation.memoryConnectionProfileId, 'profile-1');
    setMemorySettings(settings, conversation.id, { memoryPrimaryModel: 'model-a', memoryBackupModel: 'model-b' });
    assert.equal(conversation.memoryPrimaryModel, 'model-a');
    assert.equal(conversation.memoryBackupModel, 'model-b');
    assert.equal(conversation.memoryThreshold, 50);
});

test('countExchangesSince counts only role:user entries from the given index onward', () => {
    const messages = [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'assistant', content: 'c' },
        { role: 'user', content: 'd' },
        { role: 'assistant', content: 'e' },
    ];
    assert.equal(countExchangesSince(messages, 0), 2);
    assert.equal(countExchangesSince(messages, 3), 1);
    assert.equal(countExchangesSince(messages, 5), 0);
});

test('migrateMemoryFields backfills missing memory fields on a pre-milestone-5 conversation', () => {
    const settings = { conversations: { conv_1: { id: 'conv_1', charName: 'Rosa', messages: [], createdAt: 1, lastActive: 1 } } };
    migrateMemoryFields(settings);
    const conversation = settings.conversations.conv_1;
    assert.deepEqual(conversation.memories, []);
    assert.equal(conversation.memoryThreshold, 100);
    assert.equal(conversation.memoryConnectionProfileId, '');
    assert.equal(conversation.lastMemoryMessageIndex, 0);
    assert.equal(conversation.memoryPrimaryModel, DEFAULT_MEMORY_PRIMARY_MODEL);
    assert.equal(conversation.memoryBackupModel, DEFAULT_MEMORY_BACKUP_MODEL);
});

test('migrateStaleModelNames rewrites a renamed model id everywhere it can be stored', () => {
    const settings = {
        modelOverride: 'gemini-3-pro-preview',
        textingModelOverride: 'gemini-3-pro-preview',
        kressaModel: 'gemini-3-pro-preview',
        pawxai: { modelOverride: 'gemini-3-pro-preview' },
        conversations: {
            conv_1: { id: 'conv_1', charName: 'Rosa', memoryPrimaryModel: 'gemini-3-pro-preview', memoryBackupModel: 'gemini-3-pro-preview' },
        },
    };
    migrateStaleModelNames(settings);
    assert.equal(settings.modelOverride, 'gemini-3.1-pro-preview');
    assert.equal(settings.textingModelOverride, 'gemini-3.1-pro-preview');
    assert.equal(settings.kressaModel, 'gemini-3.1-pro-preview');
    assert.equal(settings.pawxai.modelOverride, 'gemini-3.1-pro-preview');
    assert.equal(settings.conversations.conv_1.memoryPrimaryModel, 'gemini-3.1-pro-preview');
    assert.equal(settings.conversations.conv_1.memoryBackupModel, 'gemini-3.1-pro-preview');
});

test('migrateStaleModelNames leaves unrelated model ids untouched and is idempotent', () => {
    const settings = {
        modelOverride: 'minimax-m3',
        conversations: { conv_1: { id: 'conv_1', memoryPrimaryModel: 'glm-4.7-thinking', memoryBackupModel: 'gemini-3.1-pro-preview' } },
    };
    migrateStaleModelNames(settings);
    migrateStaleModelNames(settings);
    assert.equal(settings.modelOverride, 'minimax-m3');
    assert.equal(settings.conversations.conv_1.memoryPrimaryModel, 'glm-4.7-thinking');
    assert.equal(settings.conversations.conv_1.memoryBackupModel, 'gemini-3.1-pro-preview');
});

test('migrateMemoryFields does not overwrite existing memory data', () => {
    const settings = { conversations: { conv_1: { id: 'conv_1', charName: 'Rosa', messages: [], createdAt: 1, lastActive: 1, memories: [{ id: 'mem_1', content: 'x', createdAt: 1, pinned: true, sourceRange: null }], memoryThreshold: 25, memoryConnectionProfileId: 'p', lastMemoryMessageIndex: 3 } } };
    migrateMemoryFields(settings);
    const conversation = settings.conversations.conv_1;
    assert.equal(conversation.memories.length, 1);
    assert.equal(conversation.memoryThreshold, 25);
    assert.equal(conversation.memoryConnectionProfileId, 'p');
    assert.equal(conversation.lastMemoryMessageIndex, 3);
});

test('migrateLegacyConversations leaves already-migrated (id-bearing) entries untouched', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Ava');
    migrateLegacyConversations(settings);
    assert.equal(Object.keys(settings.conversations).length, 1);
    assert.equal(settings.conversations[conversation.id], conversation);
});

test('migrateLegacyConversations defaults missing lastActive/createdAt to a generated timestamp', () => {
    const settings = { conversations: { Aiko: { messages: [] } } };
    migrateLegacyConversations(settings);
    const migrated = Object.values(settings.conversations)[0];
    assert.equal(typeof migrated.lastActive, 'number');
    assert.equal(migrated.createdAt, migrated.lastActive);
});

test('migrateLegacyConversations handles multiple legacy entries independently', () => {
    const settings = {
        conversations: {
            Rosa: { messages: [], lastActive: 100 },
            Kai: { messages: [], lastActive: 200 },
        },
    };
    migrateLegacyConversations(settings);
    const names = Object.values(settings.conversations).map(c => c.charName).sort();
    assert.deepEqual(names, ['Kai', 'Rosa']);
});

test('migrateLegacyConversations leaves a modern entry untouched while migrating a legacy one alongside it', () => {
    const settings = { conversations: {} };
    const modern = createConversation(settings, 'Ava');
    settings.conversations.Rosa = { messages: [], lastActive: 100 };
    migrateLegacyConversations(settings);
    assert.equal(settings.conversations[modern.id], modern);
    assert.equal(settings.conversations.Rosa, undefined);
    const migratedNames = Object.values(settings.conversations).map(c => c.charName).sort();
    assert.deepEqual(migratedNames, ['Ava', 'Rosa']);
});

test('migrateLegacyConversations is idempotent across repeated calls', () => {
    const settings = { conversations: { Rosa: { messages: [{ role: 'user', content: 'hi' }], lastActive: 100 } } };
    migrateLegacyConversations(settings);
    const afterFirst = JSON.stringify(settings.conversations);
    migrateLegacyConversations(settings);
    const afterSecond = JSON.stringify(settings.conversations);
    assert.equal(afterSecond, afterFirst);
});

test('discardTrailingReply removes trailing assistant messages back to the last user message', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'user', content: 'hi' });
    appendMessage(settings, conversation.id, { role: 'assistant', content: 'reply 1' });
    appendMessage(settings, conversation.id, { role: 'assistant', content: 'reply 2' });
    const result = discardTrailingReply(settings, conversation.id);
    assert.equal(result, true);
    assert.deepEqual(conversation.messages.map(m => m.content), ['hi']);
});

test('discardTrailingReply is a no-op and returns false when there is no trailing assistant run', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'user', content: 'hi' });
    const result = discardTrailingReply(settings, conversation.id);
    assert.equal(result, false);
    assert.equal(conversation.messages.length, 1);
});

test('discardTrailingReply returns false for an empty conversation', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    assert.equal(discardTrailingReply(settings, conversation.id), false);
});

test('discardTrailingReply returns false when there is no user message before the trailing assistant run', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'assistant', content: 'unsolicited' });
    const result = discardTrailingReply(settings, conversation.id);
    assert.equal(result, false);
    assert.equal(conversation.messages.length, 1);
});

test('discardTrailingReply returns false for an unknown conversation id', () => {
    const settings = { conversations: {} };
    assert.equal(discardTrailingReply(settings, 'nonexistent'), false);
});

test('getMemoryWindow returns the full message range when lastMemoryMessageIndex is unset', () => {
    const conversation = { messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] };
    const window = getMemoryWindow(conversation);
    assert.equal(window.start, 0);
    assert.equal(window.end, 2);
    assert.deepEqual(window.messages, conversation.messages);
});

test('getMemoryWindow returns only messages after lastMemoryMessageIndex', () => {
    const conversation = {
        messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'd' }],
        lastMemoryMessageIndex: 2,
    };
    const window = getMemoryWindow(conversation);
    assert.equal(window.start, 2);
    assert.equal(window.end, 4);
    assert.deepEqual(window.messages, [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'd' }]);
});

test('getMemoryWindow returns an empty window when lastMemoryMessageIndex is already at the end', () => {
    const conversation = { messages: [{ role: 'user', content: 'a' }], lastMemoryMessageIndex: 1 };
    const window = getMemoryWindow(conversation);
    assert.equal(window.start, 1);
    assert.equal(window.end, 1);
    assert.deepEqual(window.messages, []);
});

test('getMemoryWindow computed end is stable even if the conversation grows afterward (proves the fix this was extracted for)', () => {
    const conversation = { messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], lastMemoryMessageIndex: 0 };
    const window = getMemoryWindow(conversation);
    // Simulate a Send/Regenerate landing on the conversation while a caller is still holding
    // onto `window` (e.g. awaiting an LLM call) — window.end must NOT reflect this later growth.
    conversation.messages.push({ role: 'user', content: 'c' }, { role: 'assistant', content: 'd' });
    assert.equal(window.end, 2);
});

test('getLastGeneratedMemory returns the most recent memory that has a sourceRange', () => {
    const conversation = {
        memories: [
            { id: 'mem_1', content: 'first', createdAt: 1, pinned: true, sourceRange: { from: 0, to: 2 } },
            { id: 'mem_2', content: 'manual', createdAt: 3, pinned: true, sourceRange: null },
            { id: 'mem_3', content: 'second', createdAt: 2, pinned: true, sourceRange: { from: 2, to: 4 } },
        ],
    };
    const result = getLastGeneratedMemory(conversation);
    assert.equal(result.id, 'mem_3');
});

test('getLastGeneratedMemory returns null when there are no auto-generated memories', () => {
    const conversation = { memories: [{ id: 'mem_1', content: 'manual', createdAt: 1, pinned: true, sourceRange: null }] };
    assert.equal(getLastGeneratedMemory(conversation), null);
});

test('getLastGeneratedMemory returns null for a conversation with no memories', () => {
    assert.equal(getLastGeneratedMemory({ memories: [] }), null);
});

test('createConversation sets default tethered fields on a new conversation', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    assert.equal(conversation.tethered, false);
    assert.equal(conversation.tetheredHistoryCap, null);
});

test('setTetheredSettings partially updates only the provided fields', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    setTetheredSettings(settings, conversation.id, { tethered: true });
    assert.equal(conversation.tethered, true);
    assert.equal(conversation.tetheredHistoryCap, null);
    setTetheredSettings(settings, conversation.id, { tetheredHistoryCap: 25 });
    assert.equal(conversation.tethered, true);
    assert.equal(conversation.tetheredHistoryCap, 25);
});

test('setTetheredSettings can explicitly clear tetheredHistoryCap back to null', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    setTetheredSettings(settings, conversation.id, { tetheredHistoryCap: 25 });
    setTetheredSettings(settings, conversation.id, { tetheredHistoryCap: null });
    assert.equal(conversation.tetheredHistoryCap, null);
});

test('setTetheredSettings returns undefined for an unknown conversation id', () => {
    const settings = { conversations: {} };
    assert.equal(setTetheredSettings(settings, 'nonexistent', { tethered: true }), undefined);
});

test('migrateTetheredFields backfills missing tethered fields on a pre-milestone-6 conversation', () => {
    const settings = { conversations: { conv_1: { id: 'conv_1', charName: 'Rosa', messages: [], createdAt: 1, lastActive: 1 } } };
    migrateTetheredFields(settings);
    const conversation = settings.conversations.conv_1;
    assert.equal(conversation.tethered, false);
    assert.equal(conversation.tetheredHistoryCap, null);
});

test('migrateTetheredFields does not overwrite existing tethered data', () => {
    const settings = { conversations: { conv_1: { id: 'conv_1', charName: 'Rosa', messages: [], createdAt: 1, lastActive: 1, tethered: true, tetheredHistoryCap: 40 } } };
    migrateTetheredFields(settings);
    const conversation = settings.conversations.conv_1;
    assert.equal(conversation.tethered, true);
    assert.equal(conversation.tetheredHistoryCap, 40);
});

test('createConversation with isDedicatedApp tags the conversation record', () => {
    const settings = { conversations: {} };
    const conv = createConversation(settings, 'Demo', { isDedicatedApp: 'demoapp' });
    assert.equal(conv.isDedicatedApp, 'demoapp');
});

test('createConversation without options has no isDedicatedApp tag', () => {
    const settings = { conversations: {} };
    const conv = createConversation(settings, 'Blake');
    assert.equal(conv.isDedicatedApp, undefined);
});

test('createConversation records lorebook-only contact identity when requested', () => {
    const settings = { conversations: {} };
    const conv = createConversation(settings, 'Hye-jun', { lorebookContact: true, lorebookName: 'Weyland Registrar' });
    assert.equal(conv.lorebookContact, true);
    assert.equal(conv.lorebookName, 'Weyland Registrar');
    assert.equal(createConversation(settings, 'Blake').lorebookContact, undefined);
});

test('getAllConversationSummaries excludes conversations tagged with isDedicatedApp', () => {
    const settings = { conversations: {} };
    createConversation(settings, 'Blake');
    createConversation(settings, 'Demo', { isDedicatedApp: 'demoapp' });
    const summaries = getAllConversationSummaries(settings);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].charName, 'Blake');
});

test('findOrCreateDedicatedAppConversation creates one on first call, reuses it on subsequent calls', () => {
    const settings = { conversations: {} };
    const first = findOrCreateDedicatedAppConversation(settings, 'Demo', 'demoapp');
    const second = findOrCreateDedicatedAppConversation(settings, 'Demo', 'demoapp');
    assert.equal(first.id, second.id);
    assert.equal(Object.keys(settings.conversations).length, 1);
});

test('findOrCreateDedicatedAppConversation upgrades and reuses an existing untagged conversation', () => {
    const settings = { conversations: {} };
    const existing = createConversation(settings, 'Demo'); // untagged, e.g. a pre-existing regular thread
    const found = findOrCreateDedicatedAppConversation(settings, 'Demo', 'demoapp');
    assert.equal(found.id, existing.id);
    assert.equal(found.isDedicatedApp, 'demoapp');
    assert.equal(Object.keys(settings.conversations).length, 1);
});

test('findOrCreateDedicatedAppConversation upgrades every existing character thread for consistent app routing', () => {
    const settings = { conversations: {} };
    const older = createConversation(settings, 'Demo');
    const newer = createConversation(settings, 'Demo');
    newer.lastActive = older.lastActive + 1000;
    const found = findOrCreateDedicatedAppConversation(settings, 'Demo', 'demoapp');
    assert.equal(found.id, newer.id);
    assert.equal(older.isDedicatedApp, 'demoapp');
    assert.equal(newer.isDedicatedApp, 'demoapp');
    assert.deepEqual(getAllConversationSummaries(settings), []);
});

test('getThreadsFor returns ALL threads for a character, including isDedicatedApp-tagged ones', () => {
    const settings = { conversations: {} };
    createConversation(settings, 'Demo', { isDedicatedApp: 'demoapp' });
    createConversation(settings, 'Demo', { isDedicatedApp: 'demoapp' });
    createConversation(settings, 'Blake');
    const threads = getThreadsFor(settings, 'Demo');
    assert.equal(threads.length, 2);
    assert.ok(threads.every(t => t.charName === 'Demo'));
});

test('getThreadsFor sorts most-recent-first', () => {
    const settings = { conversations: {} };
    const older = createConversation(settings, 'Blake');
    const newer = createConversation(settings, 'Blake');
    newer.lastActive = older.lastActive + 1000;
    const threads = getThreadsFor(settings, 'Blake');
    assert.equal(threads[0].id, newer.id);
    assert.equal(threads[1].id, older.id);
});

test('findMostRecentThread returns the most recently active match regardless of isDedicatedApp tagging', () => {
    const settings = { conversations: {} };
    const first = createConversation(settings, 'Demo', { isDedicatedApp: 'demoapp' });
    const second = createConversation(settings, 'Demo', { isDedicatedApp: 'demoapp' });
    first.lastActive = second.lastActive + 1000;
    const found = findMostRecentThread(settings, 'Demo');
    assert.equal(found.id, first.id);
});

test('findMostRecentThread returns undefined for a character with no threads at all', () => {
    const settings = { conversations: {} };
    assert.equal(findMostRecentThread(settings, 'NoSuchCharacter'), undefined);
});

test('findOrCreateDedicatedAppConversation resumes the most recently active thread via the unified lookup, not just the first one found', () => {
    const settings = { conversations: {} };
    const first = createConversation(settings, 'Demo', { isDedicatedApp: 'demoapp' });
    const second = createConversation(settings, 'Demo', { isDedicatedApp: 'demoapp' });
    first.lastActive = second.lastActive + 1000;
    const found = findOrCreateDedicatedAppConversation(settings, 'Demo', 'demoapp');
    assert.equal(found.id, first.id);
});

test('createConversation seeds hasHistory from options with a true default', async () => {
    const { createConversation: cc } = await import('../lib/storage.js');
    const settings = { conversations: {} };
    assert.equal(cc(settings, 'Rosa').hasHistory, true);
    assert.equal(cc(settings, 'Stranger', { hasHistory: false }).hasHistory, false);
});

test('setContactHistorySettings flips the flag and ignores junk', async () => {
    const { createConversation: cc, setContactHistorySettings: set } = await import('../lib/storage.js');
    const settings = { conversations: {} };
    const conv = cc(settings, 'Rosa');
    set(settings, conv.id, { hasHistory: false });
    assert.equal(settings.conversations[conv.id].hasHistory, false);
    set(settings, conv.id, { hasHistory: 'yes' });
    assert.equal(settings.conversations[conv.id].hasHistory, false);
    assert.equal(set(settings, 'conv_missing', { hasHistory: true }), undefined);
});

test('migrateContactHistoryFields backfills true on pre-feature conversations, idempotently', async () => {
    const { migrateContactHistoryFields: mig } = await import('../lib/storage.js');
    const settings = { conversations: {
        a: { id: 'a', charName: 'Rosa', messages: [] },
        b: { id: 'b', charName: 'Belle', messages: [], hasHistory: false },
    } };
    mig(settings);
    mig(settings);
    assert.equal(settings.conversations.a.hasHistory, true);
    assert.equal(settings.conversations.b.hasHistory, false); // explicit value preserved
});

test('appendMessage round-trips an image field', async () => {
    const { createConversation: cc, appendMessage: am } = await import('../lib/storage.js');
    const settings = { conversations: {} };
    const conv = cc(settings, 'Rosa');
    am(settings, conv.id, { role: 'user', content: '(image)', timestamp: 1, image: '/user/images/WeyPhone/wp_1.jpeg' });
    assert.equal(settings.conversations[conv.id].messages[0].image, '/user/images/WeyPhone/wp_1.jpeg');
});

test('pruneOrphanedChatBuckets drops only stale per-chat caches', () => {
    const now = 1_000_000_000_000;
    const day = 24 * 60 * 60 * 1000;
    const settings = {
        notifications: {
            fresh: { items: [], lastRefreshAt: now - 5 * day },
            stale: { items: [], lastRefreshAt: now - 200 * day },
            undated: { items: [] },
        },
        phoneApps: {
            fresh: { feed: { content: {}, generatedAt: now - day } },
            stale: { feed: { content: {}, generatedAt: now - 300 * day } },
            // Freshest app wins — this bucket stays because one app is recent.
            mixed: { feed: { generatedAt: now - 300 * day }, chat: { generatedAt: now - 2 * day } },
        },
    };
    const removed = pruneOrphanedChatBuckets(settings, { now });
    assert.equal(removed, 2);
    assert.deepEqual(Object.keys(settings.notifications).sort(), ['fresh', 'undated']);
    assert.deepEqual(Object.keys(settings.phoneApps).sort(), ['fresh', 'mixed']);
});

test('pruneOrphanedChatBuckets leaves undated buckets and conversations alone', () => {
    const settings = {
        notifications: { a: { items: [] } },
        phoneApps: { a: { feed: { content: {} } } },
        conversations: { c1: { id: 'c1', messages: [] } },
    };
    assert.equal(pruneOrphanedChatBuckets(settings, { now: Date.now() }), 0);
    assert.deepEqual(Object.keys(settings.conversations), ['c1']);
});
