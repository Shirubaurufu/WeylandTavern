// Observe in group text threads (2026-11-15, Discord: Elven Badger). Jenn and Lucy could each observe Weybot's chat
// one-on-one, but a group thread with both of them acted confused, because generateGroupReply never built the
// [TETHERED VIEW]. These tests run the REAL generateGroupReply and buildTetheredContext, cut out of index.js
// (it can't be imported outside the app), with the network and storage stubbed, and read the prompt it sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildGroupSystemPrompt, buildMessages, resolveStoredMessageTime, joinNonEmptySections } from '../lib/generation.js';
import {
    isMainRoleplayActive, resolveMainHistorySlice, formatMainHistoryTranscript, buildTetheredViewBlock,
    KRESSA_POST_CHATLOG_ORIENTATION, GROUP_OBSERVER_ORIENTATION,
} from '../lib/tetheredContext.js';
import { getRoleplayMode, ROLEPLAY_MODES } from '../lib/roleplayMode.js';

const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
function cut(name) {
    const start = source.indexOf(`async function ${name}(`);
    assert.ok(start > 0, `${name} is in index.js`);
    // index.js is CRLF on disk: find the closing brace at the start of a line without assuming the ending.
    return source.slice(start, start + source.slice(start).search(/\n\}/) + 2);
}
const body = `${cut('buildTetheredContext')}\n${cut('generateGroupReply')}\nreturn generateGroupReply;`;

const MAIN_CHAT = [
    { name: 'Weybot', mes: 'Weybot greets you from the lab.', is_user: false },
    { name: 'Me', mes: 'I ask Weybot to fix the coffee machine.', is_user: true },
    { name: 'Weybot', mes: 'Weybot sets the coffee machine on fire.', is_user: false },
];

function makeGroupReply(sent) {
    const deps = {
        generatingConversationIds: new Set(), refreshVisibleScreen() {}, wpToast(kind, text) { sent.toasts.push(text); },
        isConversationLinkedToChat: () => false,
        resolveLorebookContactProfile: async ({ charName }) => ({ personalityText: `${charName} subbot.` }),
        applyMacroSubstitution: ({ content }) => content,
        buildPhoneWorldInfoScanHistory: messages => messages,
        resolveWorldInfo: async () => { sent.phoneScans += 1; return { worldInfoBefore: 'PHONE LORE BEFORE', worldInfoAfter: 'PHONE LORE AFTER' }; },
        resolveWorldInfoTetheredForMainChat: async () => 'MAIN ROLEPLAY LORE',
        resolveMainActiveLtmEntries: async () => [],
        getRoleplayMode, ROLEPLAY_MODES, isMainRoleplayActive, resolveMainHistorySlice, formatMainHistoryTranscript,
        buildTetheredViewBlock, KRESSA_POST_CHATLOG_ORIENTATION, GROUP_OBSERVER_ORIENTATION, joinNonEmptySections,
        buildPersonaContextBlock: () => '', buildGroupSystemPrompt, joinMemoriesForInjection: () => '', getPinnedMemories: () => [],
        TEXTING_MODE_INSTRUCTIONS: 'TEXTING RULES', buildGroupContactContextBlock: () => '', TEXTING_THOUGHTS_DISABLED: '',
        resolveStoredMessageTime, formatClockTime: () => '9:00 AM', buildMessages, PHONE_THREAD_MAX_TOKENS: 10_000,
        resolveProfileId: () => 'profile', resolveModelOverride: () => 'model', DEFAULT_MAX_TOKENS: 1000,
        sendMessageWithFallback: async ({ messages }) => { sent.messages = messages; return 'reply'; },
        extractResponseText: () => 'Incoming¦9:01 AM¦Jenn¦lol\nIncoming¦9:01 AM¦Lucy¦oh no',
        parseGroupReply: () => ({ messages: [{ speaker: 'Jenn', content: 'lol' }, { speaker: 'Lucy', content: 'oh no' }] }),
        appendMessage() {}, genTimestamp: () => 0, resolveRpTime: () => null, recordIncomingDmNotification() {},
        queueWeyPhoneSave() {}, rerenderIfStillViewing() {},
    };
    return new Function(...Object.keys(deps), body)(...Object.values(deps));
}

function run({ roleplayMode, noRoleplay = false }) {
    const sent = { toasts: [], phoneScans: 0, messages: null };
    const conversation = {
        id: 'g1', participants: ['Jenn', 'Lucy'], roleplayMode, tethered: roleplayMode !== ROLEPLAY_MODES.UNLINKED,
        messages: [{ role: 'user', content: "did you see what weybot just did??", timestamp: 0 }],
    };
    const context = {
        chat: MAIN_CHAT, chatId: 'weybot-chat', characterId: noRoleplay ? undefined : 3, groupId: undefined, chatMetadata: {},
        extensionSettings: { connectionManager: {} }, name1: 'Me', powerUserSettings: {},
    };
    return makeGroupReply(sent)('g1', conversation, context, { ui: {} }).then(() => ({
        sent, system: sent.messages?.[0]?.content ?? '',
    }));
}

test('an Observe group thread sees the open roleplay, like a one-on-one thread does', async () => {
    const { sent, system } = await run({ roleplayMode: ROLEPLAY_MODES.OBSERVE });
    assert.deepEqual(sent.toasts, []);
    assert.match(system, /\[WEYPHONE SECTION: SHARED ROLEPLAY CONTEXT\]/);
    assert.match(system, /\[TETHERED VIEW\]/);
    assert.match(system, /Weybot sets the coffee machine on fire\./);
    assert.match(system, /MAIN ROLEPLAY LORE/);
    // Every participant can see it, and the group framing comes after the transcript.
    assert.match(system, /Everyone in this group text thread can see the roleplay above/);
    assert.ok(system.indexOf('coffee machine on fire') < system.indexOf('[GROUP THREAD ORIENTATION]'));
    assert.doesNotMatch(system, /KRESSA ORIENTATION/);
    // Same rule as one-on-one: the roleplay's lore replaces the phone thread's own scan, never both.
    assert.equal(sent.phoneScans, 0);
    assert.doesNotMatch(system, /PHONE LORE/);
    // Both participants' profiles are still there.
    assert.match(system, /## Jenn\nJenn subbot\./);
    assert.match(system, /## Lucy\nLucy subbot\./);
});

test('Unlinked group threads, and Observe with no roleplay open, stay exactly as before', async () => {
    for (const options of [{ roleplayMode: ROLEPLAY_MODES.UNLINKED }, { roleplayMode: ROLEPLAY_MODES.OBSERVE, noRoleplay: true }]) {
        const { sent, system } = await run(options);
        assert.equal(sent.phoneScans, 1, JSON.stringify(options));
        assert.match(system, /PHONE LORE BEFORE/);
        assert.doesNotMatch(system, /TETHERED VIEW|coffee machine|GROUP THREAD ORIENTATION/);
    }
});

test('buildGroupSystemPrompt puts the tethered view in the same slot as a one-on-one thread', () => {
    const prompt = buildGroupSystemPrompt({
        participants: [{ name: 'Jenn', personalityText: 'J' }, { name: 'Lucy', personalityText: 'L' }],
        memoryBlock: 'MEMORIES', tetheredBlock: 'TETHER', finalInstructions: 'FINAL',
    });
    const order = ['PHONE MEMORIES', 'SHARED ROLEPLAY CONTEXT', 'FINAL REPLY INSTRUCTIONS'].map(name => prompt.indexOf(`[WEYPHONE SECTION: ${name}]`));
    assert.ok(order.every(index => index > 0) && order[0] < order[1] && order[1] < order[2], order.join());
    assert.doesNotMatch(buildGroupSystemPrompt({ participants: [{ name: 'Jenn', personalityText: 'J' }] }), /SHARED ROLEPLAY/);
});
