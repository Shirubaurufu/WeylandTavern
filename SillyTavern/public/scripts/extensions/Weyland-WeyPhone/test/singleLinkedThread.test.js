import assert from 'node:assert/strict';
import test from 'node:test';
import { createConversation, setTetheredSettings } from '../lib/storage.js';
import { buildTetherInjectionPlan } from '../lib/roleplayTether.js';
import { getRoleplayMode, isConversationLinkedToChat } from '../lib/roleplayMode.js';
import { unlinkOtherThreadsWithSamePeople } from '../lib/singleLinkedThread.js';

const CHAT = 'Kressa - 2026-11-06';
const chat = Array.from({ length: 4 }, (_, i) => ({ is_user: i % 2 === 0, mes: `m${i}` }));

function linkedThread(settings, charName, text, options = {}) {
    const thread = createConversation(settings, charName, options);
    thread.messages.push({ role: 'user', content: text, timestamp: Date.now() + settings.counter++, mainChatAnchor: chat.length });
    setTetheredSettings(settings, thread.id, { roleplayMode: 'linked', roleplayChatId: CHAT });
    return thread;
}

const injected = settings => buildTetherInjectionPlan({
    conversations: Object.values(settings.conversations), chatId: CHAT, chatLength: chat.length, chat,
    userName: 'Gal', formatClockTime: () => '3:40 PM', maxMessages: 15,
}).groups.map(group => group.content).join('\n');

test('opening a second thread with the same contact unlinks the first, so only the open one is injected', () => {
    const settings = { conversations: {}, counter: 0 };
    const first = linkedThread(settings, 'Kressa', 'waddup');
    const second = linkedThread(settings, 'Kressa', 'hows it goin');
    assert.match(injected(settings), /waddup/, 'precondition: both were live before the fix');

    assert.deepEqual(unlinkOtherThreadsWithSamePeople(settings, second.id), [first.id]);
    assert.equal(getRoleplayMode(first), 'unlinked');
    assert.equal(isConversationLinkedToChat(first, CHAT), false);
    assert.equal(first.roleplayChatId, null);
    assert.doesNotMatch(injected(settings), /waddup/);
    assert.match(injected(settings), /hows it goin/);
});

test('reopening the old thread does not relink it; the player has to pick Linked again', () => {
    const settings = { conversations: {}, counter: 0 };
    const first = linkedThread(settings, 'Kressa', 'waddup');
    const second = linkedThread(settings, 'Kressa', 'hows it goin');
    unlinkOtherThreadsWithSamePeople(settings, second.id);
    // Player swaps back to thread #1: it stays Unlinked, and #2 (still Linked) is the one that drops.
    assert.deepEqual(unlinkOtherThreadsWithSamePeople(settings, first.id), [second.id]);
    assert.equal(getRoleplayMode(first), 'unlinked');
    assert.equal(injected(settings), '', 'nothing is live until the player selects Linked');
    setTetheredSettings(settings, first.id, { roleplayMode: 'linked', roleplayChatId: CHAT });
    assert.match(injected(settings), /waddup/);
});

test('threads with other contacts, and Observe threads, are left alone', () => {
    const settings = { conversations: {}, counter: 0 };
    const blake = linkedThread(settings, 'Blake', 'hey blake');
    const observer = createConversation(settings, 'Kressa');
    setTetheredSettings(settings, observer.id, { roleplayMode: 'observe' });
    const kressa = linkedThread(settings, 'Kressa', 'hi');
    assert.deepEqual(unlinkOtherThreadsWithSamePeople(settings, kressa.id), []);
    assert.equal(getRoleplayMode(blake), 'linked');
    assert.equal(getRoleplayMode(observer), 'observe');
});

test('a group thread only matches threads with the same members, in any order', () => {
    const settings = { conversations: {}, counter: 0 };
    const a = linkedThread(settings, 'Blake & Serra', 'one', { participants: ['Blake', 'Serra'] });
    const other = linkedThread(settings, 'Blake & Zora', 'two', { participants: ['Blake', 'Zora'] });
    const same = createConversation(settings, 'Serra & Blake', { participants: ['Serra', 'Blake'] });
    assert.deepEqual(unlinkOtherThreadsWithSamePeople(settings, same.id), [a.id]);
    assert.equal(getRoleplayMode(other), 'linked');
});

test('a captured in-roleplay thread keeps its chat id so capture matching still finds it', () => {
    const settings = { conversations: {}, counter: 0 };
    const captured = linkedThread(settings, 'Rivera', 'captured', { roleplayTether: true });
    const mine = createConversation(settings, 'Rivera');
    unlinkOtherThreadsWithSamePeople(settings, mine.id);
    assert.equal(getRoleplayMode(captured), 'unlinked');
    assert.equal(captured.roleplayChatId, CHAT);
});

test('an unknown id, or a lone thread, changes nothing', () => {
    const settings = { conversations: {}, counter: 0 };
    const only = linkedThread(settings, 'Kressa', 'hi');
    assert.deepEqual(unlinkOtherThreadsWithSamePeople(settings, 'nope'), []);
    assert.deepEqual(unlinkOtherThreadsWithSamePeople(settings, only.id), []);
    assert.equal(getRoleplayMode(only), 'linked');
});
