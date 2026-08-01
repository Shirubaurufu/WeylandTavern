import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isMainRoleplayActive,
    resolveMainActiveLtmEntries,
    resolveMainHistorySlice,
    formatMainHistoryTranscript,
    buildTetheredViewBlock,
    convertMainChatToMessages,
    buildScanHistoryWithExtraText,
    KRESSA_ROLEPLAY_COMPANION_INSTRUCTIONS,
    KRESSA_POST_CHATLOG_ORIENTATION,
} from '../lib/tetheredContext.js';

test('Kressa shared-roleplay framing establishes friendly fictional commentary without jealousy', () => {
    assert.match(KRESSA_ROLEPLAY_COMPANION_INSTRUCTIONS, /trusted friend/i);
    assert.match(KRESSA_ROLEPLAY_COMPANION_INSTRUCTIONS, /book club/i);
    assert.match(KRESSA_ROLEPLAY_COMPANION_INSTRUCTIONS, /fiction/i);
    assert.match(KRESSA_ROLEPLAY_COMPANION_INSTRUCTIONS, /Never become jealous/i);
    assert.match(KRESSA_ROLEPLAY_COMPANION_INSTRUCTIONS, /at most two paragraphs/i);
    assert.match(KRESSA_ROLEPLAY_COMPANION_INSTRUCTIONS, /any number of messages/i);
});

test('Kressa post-chatlog orientation forbids continuing or impersonating the observed scene', () => {
    assert.match(KRESSA_POST_CHATLOG_ORIENTATION, /Do not continue the roleplay/i);
    assert.match(KRESSA_POST_CHATLOG_ORIENTATION, /Remain Kressa/i);
    assert.match(KRESSA_POST_CHATLOG_ORIENTATION, /friend outside the roleplay/i);
    const block = buildTetheredViewBlock({
        worldInfoText: '',
        ltmEntries: [],
        historyTranscript: 'Nara: hello',
        postTranscriptInstructions: KRESSA_POST_CHATLOG_ORIENTATION,
    });
    assert.ok(block.indexOf('Nara: hello') < block.indexOf('[KRESSA ORIENTATION]'));
});

test('isMainRoleplayActive is true when a solo character is selected', () => {
    assert.equal(isMainRoleplayActive({ characterId: 3, groupId: undefined }), true);
});

test('isMainRoleplayActive is true when a group chat is active', () => {
    assert.equal(isMainRoleplayActive({ characterId: undefined, groupId: 'group-1' }), true);
});

test('isMainRoleplayActive is false when neither a character nor a group is selected', () => {
    assert.equal(isMainRoleplayActive({ characterId: undefined, groupId: undefined }), false);
});

test('isMainRoleplayActive treats characterId 0 as a valid selection, not falsy-absent', () => {
    // this_chid is a real array index and can legitimately be 0 — must not be treated as "unset"
    assert.equal(isMainRoleplayActive({ characterId: 0, groupId: undefined }), true);
});

// NOTE: there is no reachable "never calls loadWorldInfo" path — resolveMainActiveLtmEntries
// always resolves a book name (chatMetadata.world_info or the sanitized "Chat Book <chatId>"
// fallback) and always calls loadWorldInfo with it. With chatMetadata:{} the fallback name still
// resolves, loadWorldInfo IS called, and if it throws the catch returns []. This exercises the
// error/catch path, not a true no-binding path.
test('resolveMainActiveLtmEntries returns [] when the resolved book fails to load', async () => {
    const loadWorldInfo = async () => { throw new Error('simulated loadWorldInfo failure'); };
    const result = await resolveMainActiveLtmEntries({ loadWorldInfo, chatMetadata: {}, chatId: 'chat_1' });
    assert.deepEqual(result, []);
});

test('resolveMainActiveLtmEntries loads the bound book name from chatMetadata.world_info', async () => {
    let requestedName;
    const loadWorldInfo = async (name) => {
        requestedName = name;
        return { entries: {} };
    };
    await resolveMainActiveLtmEntries({
        loadWorldInfo,
        chatMetadata: { world_info: 'Chat Book chat_1' },
        chatId: 'chat_1',
    });
    assert.equal(requestedName, 'Chat Book chat_1');
});

test('resolveMainActiveLtmEntries falls back to the sanitized "Chat Book <chatId>" name when chatMetadata has no binding', async () => {
    let requestedName;
    const loadWorldInfo = async (name) => {
        requestedName = name;
        return { entries: {} };
    };
    await resolveMainActiveLtmEntries({ loadWorldInfo, chatMetadata: {}, chatId: 'My Chat!!.jsonl' });
    assert.equal(requestedName, 'Chat_Book_My_Chat_jsonl');
});

test('resolveMainActiveLtmEntries filters to entries that look like LTM AND are currently constant', async () => {
    const loadWorldInfo = async () => ({
        entries: {
            0: { automationId: 'ltm:abc', content: 'active memory', constant: true },
            1: { automationId: 'ltm:def', content: 'dormant memory', constant: false },
            2: { automationId: '', content: 'unrelated WI entry', constant: true },
        },
    });
    const result = await resolveMainActiveLtmEntries({ loadWorldInfo, chatMetadata: { world_info: 'Chat Book chat_1' }, chatId: 'chat_1' });
    assert.deepEqual(result.map(e => e.content), ['active memory']);
});

test('resolveMainActiveLtmEntries recognizes legacy numeric automationId entries via comment/content pattern', async () => {
    const loadWorldInfo = async () => ({
        entries: {
            0: { automationId: '42', comment: 'MEMORY ENTRY', content: 'legacy active memory', constant: true },
            1: { automationId: '43', comment: 'unrelated', content: 'not a memory', constant: true },
        },
    });
    const result = await resolveMainActiveLtmEntries({ loadWorldInfo, chatMetadata: { world_info: 'Chat Book chat_1' }, chatId: 'chat_1' });
    assert.deepEqual(result.map(e => e.content), ['legacy active memory']);
});

test('resolveMainHistorySlice defaults to everything since lastLtmMessageId + 1', () => {
    const chat = [
        { name: 'A', mes: 'm0', is_user: true }, { name: 'B', mes: 'm1', is_user: false },
        { name: 'A', mes: 'm2', is_user: true }, { name: 'B', mes: 'm3', is_user: false },
    ];
    const result = resolveMainHistorySlice({ chat, lastLtmMessageId: 1, historyCap: null });
    assert.deepEqual(result.map(m => m.mes), ['m2', 'm3']);
});

test('resolveMainHistorySlice treats an absent lastLtmMessageId (-1) as "the whole chat"', () => {
    const chat = [{ name: 'A', mes: 'm0', is_user: true }, { name: 'B', mes: 'm1', is_user: false }];
    const result = resolveMainHistorySlice({ chat, lastLtmMessageId: -1, historyCap: null });
    assert.deepEqual(result.map(m => m.mes), ['m0', 'm1']);
});

test('resolveMainHistorySlice uses a fixed last-N cap when historyCap is a number, overriding lastLtmMessageId', () => {
    const chat = [
        { name: 'A', mes: 'm0', is_user: true }, { name: 'B', mes: 'm1', is_user: false },
        { name: 'A', mes: 'm2', is_user: true }, { name: 'B', mes: 'm3', is_user: false },
    ];
    const result = resolveMainHistorySlice({ chat, lastLtmMessageId: -1, historyCap: 2 });
    assert.deepEqual(result.map(m => m.mes), ['m2', 'm3']);
});

test('resolveMainHistorySlice returns [] when lastLtmMessageId already covers the whole chat', () => {
    const chat = [{ name: 'A', mes: 'm0', is_user: true }];
    const result = resolveMainHistorySlice({ chat, lastLtmMessageId: 0, historyCap: null });
    assert.deepEqual(result, []);
});

test('formatMainHistoryTranscript formats each message as "Name: text" per line', () => {
    const messages = [{ name: 'Alice', mes: 'hello there' }, { name: 'Bob', mes: 'hi Alice' }];
    assert.equal(formatMainHistoryTranscript(messages), 'Alice: hello there\nBob: hi Alice');
});

test('formatMainHistoryTranscript skips is_system messages', () => {
    const messages = [
        { name: 'System', mes: 'a system note', is_system: true },
        { name: 'Alice', mes: 'real line', is_system: false },
    ];
    assert.equal(formatMainHistoryTranscript(messages), 'Alice: real line');
});

test('formatMainHistoryTranscript skips empty/whitespace-only messages', () => {
    const messages = [{ name: 'Alice', mes: '   ' }, { name: 'Bob', mes: 'real line' }];
    assert.equal(formatMainHistoryTranscript(messages), 'Bob: real line');
});

test('buildTetheredViewBlock wraps all three sections in the exact [TETHERED VIEW] framing', () => {
    const result = buildTetheredViewBlock({
        worldInfoText: 'Some lore.',
        ltmEntries: [{ content: 'They met at the docks.' }],
        historyTranscript: 'Alice: hi\nBob: hey',
    });
    assert.match(result, /^\[TETHERED VIEW\]/);
    assert.match(result, /you CAN see it\nand ARE aware of what's happening in it/);
    assert.match(result, /NOT\na character in that story and cannot act within it, and it is NOT your own conversation history/);
    assert.match(result, /don't confuse anything below with things that actually happened between you two\./);
    assert.match(result, /Some lore\./);
    assert.match(result, /They met at the docks\./);
    assert.match(result, /Alice: hi/);
    assert.match(result, /\[END TETHERED VIEW\]$/);
});

test('buildTetheredViewBlock affirmatively states awareness rather than a defensive "ignore it" framing', () => {
    const result = buildTetheredViewBlock({ worldInfoText: '', ltmEntries: [], historyTranscript: 'Alice: hi' });
    assert.doesNotMatch(result, /otherwise ignore it/);
    assert.match(result, /you CAN see it/);
});

test('buildTetheredViewBlock omits a section entirely when its input is empty', () => {
    const result = buildTetheredViewBlock({ worldInfoText: '', ltmEntries: [], historyTranscript: 'Alice: hi' });
    assert.doesNotMatch(result, /Some lore/);
    assert.match(result, /Alice: hi/);
});

test('buildTetheredViewBlock returns an empty string when all three sections are empty', () => {
    const result = buildTetheredViewBlock({ worldInfoText: '', ltmEntries: [], historyTranscript: '' });
    assert.equal(result, '');
});

test('convertMainChatToMessages converts is_user/mes pairs to role/content pairs', () => {
    const chat = [
        { is_user: true, mes: 'hello', name: 'Ava' },
        { is_user: false, mes: 'hi there', name: 'Rosa' },
    ];
    assert.deepEqual(convertMainChatToMessages(chat), [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
    ]);
});

test('convertMainChatToMessages skips is_system messages', () => {
    const chat = [
        { is_user: false, is_system: true, mes: 'a system note', name: 'System' },
        { is_user: true, mes: 'real message', name: 'Ava' },
    ];
    assert.deepEqual(convertMainChatToMessages(chat), [{ role: 'user', content: 'real message' }]);
});

test('convertMainChatToMessages skips empty/whitespace-only messages', () => {
    const chat = [
        { is_user: true, mes: '   ', name: 'Ava' },
        { is_user: false, mes: 'real reply', name: 'Rosa' },
    ];
    assert.deepEqual(convertMainChatToMessages(chat), [{ role: 'assistant', content: 'real reply' }]);
});

test('convertMainChatToMessages returns [] for an empty or missing chat', () => {
    assert.deepEqual(convertMainChatToMessages([]), []);
    assert.deepEqual(convertMainChatToMessages(undefined), []);
});

test('convertMainChatToMessages never mutates the input array', () => {
    const chat = [{ is_user: true, mes: 'hello', name: 'Ava' }];
    const original = [...chat];
    convertMainChatToMessages(chat);
    assert.deepEqual(chat, original);
    assert.equal(chat.length, 1);
});

test('buildScanHistoryWithExtraText appends extraScanText as a trailing user entry', () => {
    const mainHistory = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }];
    const result = buildScanHistoryWithExtraText(mainHistory, 'extra prompt text');
    assert.deepEqual(result, [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'user', content: 'extra prompt text' },
    ]);
});

test('buildScanHistoryWithExtraText returns the same array reference when extraScanText is omitted', () => {
    const mainHistory = [{ role: 'user', content: 'hi' }];
    const result = buildScanHistoryWithExtraText(mainHistory, undefined);
    assert.equal(result, mainHistory);
});

test('buildScanHistoryWithExtraText returns the same array reference when extraScanText is an empty string', () => {
    const mainHistory = [{ role: 'user', content: 'hi' }];
    const result = buildScanHistoryWithExtraText(mainHistory, '');
    assert.equal(result, mainHistory);
});

test('buildScanHistoryWithExtraText never mutates mainHistory', () => {
    const mainHistory = [{ role: 'user', content: 'hi' }];
    const original = [...mainHistory];
    buildScanHistoryWithExtraText(mainHistory, 'extra');
    assert.deepEqual(mainHistory, original);
    assert.equal(mainHistory.length, 1);
});

test('buildScanHistoryWithExtraText works from an empty mainHistory', () => {
    const result = buildScanHistoryWithExtraText([], 'extra prompt text');
    assert.deepEqual(result, [{ role: 'user', content: 'extra prompt text' }]);
});
