import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as capture from '../lib/roleplayCapture.js';
import * as tether from '../lib/roleplayTether.js';
import { isConversationLinkedToChat } from '../lib/roleplayMode.js';
import { appendMessage, createConversation, deleteMessage, setTetheredSettings } from '../lib/storage.js';

const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
function sliceFunction(name) {
    const start = source.search(new RegExp(`^(async )?function ${name}\\(`, 'm'));
    assert.ok(start >= 0, `${name} exists`);
    const end = source.slice(start).search(/\r?\n\}\r?\n/);
    return source.slice(start, start + end + 3);
}

const phone = (lines, name = 'Misaki') => `Phone¦Weynet - Elias¦90%¦Mode=Solo¦Members=Elias;${name}\nTexting¦${name}\n${lines.join('\n')}`;
const sent = text => `Outgoing¦8:30 AM¦Elias¦${text}`;
const received = (text, name = 'Misaki') => `Incoming¦8:33 AM¦${name}¦${text}`;

// Exercise the actual UI capture handler and lifecycle registration with the real parser,
// storage and prompt builder. The host, save operations and visual redraw are the only stubs.
function harness() {
    let stamp = 0;
    let saves = 0;
    const settings = { conversations: {}, captureRoleplayTextsEnabled: true };
    const listeners = new Map();
    const types = ['GENERATION_STARTED', 'MESSAGE_RECEIVED', 'CHARACTER_MESSAGE_RENDERED', 'MESSAGE_SWIPED',
        'MESSAGE_UPDATED', 'MESSAGE_DELETED', 'MESSAGE_SENT', 'GENERATION_ENDED', 'CHAT_CHANGED'];
    const context = {
        chatId: 'main', chat: [], chatMetadata: {}, name1: 'Elias', characters: [], extensionSettings: {},
        saveChat: async () => { saves++; },
        eventTypes: Object.fromEntries(types.map(type => [type, type])),
        eventSource: { on(type, fn) { listeners.set(type, [...(listeners.get(type) ?? []), fn]); } },
    };
    const sandbox = {
        ...capture, ...tether, isConversationLinkedToChat, createConversation, setTetheredSettings,
        SillyTavern: { getContext: () => context }, getSettings: () => settings,
        captureKnownNames: () => ['Misaki', 'Summer'], getCombinedContactEntries: () => [],
        resolveInstalledCharacterName: () => 'Misaki', resolveSubbotBook: () => 'Weyland',
        genTimestamp: () => ++stamp, crypto: { randomUUID: () => `source-${++stamp}` },
        queueWeyPhoneSave: () => { saves++; }, refreshVisibleScreen: () => {},
        recordIncomingDmNotification: () => {}, pushLogLine: () => {}, wpToast: () => {}, console,
        currentConversationId: null, editingMessageIndex: -1, selectedMessageIndices: new Set(),
    };
    // Give the real helper a deterministic ID factory without changing production behavior.
    sandbox.ensureCaptureSource = message => capture.ensureCaptureSource(message, () => `source-${++stamp}`);
    vm.createContext(sandbox);
    vm.runInContext(['findCapturedThread', 'handleRoleplayPhoneCapture', 'reconcileRoleplayPhoneHistory']
        .map(sliceFunction).join('\n'), sandbox);
    capture.installRoleplayCaptureEvents({
        getContext: () => context,
        capture: sandbox.handleRoleplayPhoneCapture,
        reconcileChat: sandbox.reconcileRoleplayPhoneHistory,
    });
    const emit = (type, ...args) => { for (const fn of listeners.get(type) ?? []) fn(...args); };
    const thread = () => Object.values(settings.conversations).find(c => c.roleplayChatId === context.chatId);
    const text = () => Array.from(thread()?.messages ?? [], m => m.content);
    const respond = body => {
        const index = context.chat.push({ is_user: false, mes: body }) - 1;
        emit('MESSAGE_RECEIVED', index);
        emit('CHARACTER_MESSAGE_RENDERED', index);
        return context.chat[index];
    };
    const swipe = body => {
        const index = context.chat.length - 1;
        context.chat[index].mes = body;
        emit('MESSAGE_SWIPED', index);
    };
    const send = body => appendMessage(settings, thread().id, { role: 'user', content: body, mainChatAnchor: context.chat.length });
    const plan = () => tether.buildTetherInjectionPlan({
        conversations: Object.values(settings.conversations), chatId: context.chatId,
        chat: context.chat, chatLength: context.chat.length, userName: 'Elias', formatClockTime: () => '',
    });
    return { settings, context, emit, thread, text, respond, swipe, send, plan, sandbox, saves: () => saves };
}

test('screenshot: outgoing texts echoed after other messages never become new phone sends', () => {
    const h = harness();
    const c = createConversation(h.settings, 'Misaki', { roleplayMode: 'linked', roleplayChatId: 'main' });
    for (const content of ["I'm planning on hitting up Sakurai if you want fancy coffee.",
        'And it was one glass. No hangover for me. I drink responsibly.', 'I also keep water in my car.']) {
        appendMessage(h.settings, c.id, { role: 'user', content });
    }
    appendMessage(h.settings, c.id, { role: 'assistant', content: 'Morning. Hope the hangover isn’t too bad.' });
    h.respond(phone([
        received('sounds good'), sent('I also keep water in my car.'),
        sent('I’m planning on hitting up Sakurai if you want fancy coffee.'),
        received('see you there'), sent('And it was one glass. No hangover for me. I drink responsibly.'),
    ]));
    assert.equal(c.messages.filter(m => m.role === 'user').length, 3);
    assert.deepEqual(h.text().slice(-2), ['sounds good', 'see you there']);
});

test('unanswered multi-bubble replies follow A / B / no texts / A without accumulating', () => {
    const h = harness();
    const a = phone([received('what up'), received('you home?')]);
    const b = phone([received('hey there')]);
    h.respond(a);
    h.swipe(b);
    assert.deepEqual(h.text(), ['hey there']);
    h.swipe('A reply without a phone screen.');
    assert.deepEqual(h.text(), []);
    h.swipe(a);
    assert.deepEqual(h.text(), ['what up', 'you home?']);
    h.emit('CHARACTER_MESSAGE_RENDERED', 0);
    assert.deepEqual(h.text(), ['what up', 'you home?']);
});

test('the selected rightmost empty swipe removes the old reply before generation', () => {
    const h = harness();
    const a = phone([received('old reply')]);
    const message = h.respond(a);
    message.swipes = [a];
    message.swipe_id = 1;
    h.emit('MESSAGE_SWIPED', 0);
    assert.deepEqual(h.text(), []);
    h.emit('GENERATION_STARTED', 'swipe', {}, false);
    message.mes = phone([received('new reply')]);
    h.emit('MESSAGE_RECEIVED', 0);
    h.emit('CHARACTER_MESSAGE_RENDERED', 0);
    assert.deepEqual(h.text(), ['new reply']);
});

test('replying to what up freezes it, rejects alternate captures, and sends the accepted log to the model', () => {
    const h = harness();
    const c = createConversation(h.settings, 'Misaki', { roleplayMode: 'linked', roleplayChatId: 'main' });
    appendMessage(h.settings, c.id, { role: 'user', content: 'hey' });
    h.respond(phone([sent('hey'), received('what up')]));
    h.send('nothing much, u');
    h.swipe(phone([received('completely different')]));
    assert.deepEqual(h.text(), ['hey', 'what up', 'nothing much, u']);
    assert.match(h.plan().groups[0].content, /Incoming¦8:33 AM¦Misaki¦what up/);
    assert.match(h.plan().groups[0].content, /nothing much, u/);
    assert.doesNotMatch(h.plan().groups[0].content, /completely different/);
    h.swipe(phone([received('a different recipient', 'Summer')], 'Summer'));
    assert.equal(Object.keys(h.settings.conversations).length, 1);
});

test('model-authored user lines do not activate the actual-user reply lock', () => {
    const h = harness();
    h.respond(phone([received('what up'), sent('fictional reply')]));
    h.swipe(phone([received('different reply')]));
    assert.deepEqual(h.text(), ['different reply']);
});

test('the lock survives saved settings and deleting the phone reply that established it', () => {
    const h = harness();
    h.respond(phone([received('what up')]));
    h.send('nothing much');
    const c = h.thread();
    h.settings.conversations[c.id] = JSON.parse(JSON.stringify(c));
    deleteMessage(h.settings, c.id, 1);
    h.swipe(phone([received('new alternative')]));
    assert.deepEqual(h.text(), ['what up']);
});

test('50-turn chat cut back to 25 preserves replied texts but removes unanswered deleted captures', () => {
    const h = harness();
    for (let index = 0; index < 24; index++) h.context.chat.push({ is_user: true, mes: `turn ${index}` });
    h.respond(phone([received('what up')]));
    h.send('nothing much, u');
    for (let index = 25; index < 49; index++) h.context.chat.push({ is_user: true, mes: `turn ${index}` });
    h.respond(phone([received('unanswered at 50')]));
    h.context.chat.length = 25;
    h.emit('MESSAGE_DELETED', 25);
    h.swipe(phone([received('replacement at 25')]));
    assert.deepEqual(h.text(), ['what up', 'nothing much, u']);
    assert.match(h.plan().groups[0].content, /what up/);
});

test('deleting a source does not confuse a new reply at the same index with the old source', () => {
    const h = harness();
    const old = h.respond(phone([received('first')])).weyphoneCaptureId;
    h.context.chat.pop();
    h.emit('MESSAGE_DELETED', 0);
    const next = h.respond(phone([received('second')])).weyphoneCaptureId;
    assert.notEqual(old, next);
    assert.deepEqual(h.text(), ['second']);
});

for (const replied of [false, true]) {
    test(`destructive Regenerate ${replied ? 'preserves an answered' : 'replaces an unanswered'} exchange`, () => {
        const h = harness();
        const old = h.respond(phone([received('what up')])).weyphoneCaptureId;
        if (replied) h.send('nothing much');
        h.emit('GENERATION_STARTED', 'regenerate', {}, false);
        h.context.chat.pop();
        h.emit('MESSAGE_DELETED', 0);
        assert.deepEqual(h.text(), replied ? ['what up', 'nothing much'] : []);
        h.respond(phone([received('another answer')]));
        assert.equal(h.context.chat[0].weyphoneCaptureId, old);
        assert.deepEqual(h.text(), replied ? ['what up', 'nothing much'] : ['another answer']);
    });
}

test('a failed regenerate cannot lend its identity to a later unrelated reply', () => {
    const h = harness();
    const old = h.respond(phone([received('first')])).weyphoneCaptureId;
    h.send('answer');
    h.emit('GENERATION_STARTED', 'regenerate', {}, false);
    h.context.chat.pop();
    h.emit('MESSAGE_DELETED', 0);
    h.emit('GENERATION_ENDED');
    const next = h.respond(phone([received('new turn')]));
    assert.notEqual(next.weyphoneCaptureId, old);
    assert.deepEqual(h.text(), ['first', 'answer', 'new turn']);
});

test('dry-run prompt previews do not remove unanswered messages', () => {
    const h = harness();
    h.respond(phone([received('first')]));
    h.emit('GENERATION_STARTED', 'regenerate', {}, true);
    assert.deepEqual(h.text(), ['first']);
});

test('multiple phone scopes in the same reply are reconciled as one contribution', () => {
    const h = harness();
    h.respond(`${phone([received('first')])}\n\n${phone([received('second')])}`);
    assert.deepEqual(h.text(), ['first', 'second']);
    h.swipe(phone([received('third')]));
    assert.deepEqual(h.text(), ['third']);
});

test('changing recipients removes the old unanswered contribution from the old thread', () => {
    const h = harness();
    h.respond(phone([received('first')]));
    const original = h.thread();
    h.swipe(phone([received('Summer reply', 'Summer')], 'Summer'));
    assert.deepEqual(Array.from(original.messages), []);
    assert.equal(Object.values(h.settings.conversations).find(c => c.charName === 'Summer').messages[0].content, 'Summer reply');
});

test('a branch inherits independent phone history and the existing reply lock', () => {
    const h = harness();
    h.respond(phone([received('what up')]));
    h.send('nothing much');
    const parent = h.thread();
    h.context.chat = structuredClone(h.context.chat);
    h.context.chatId = 'branch';
    h.context.chatMetadata = { main_chat: 'main' };
    h.emit('CHAT_CHANGED');
    assert.notEqual(h.thread().id, parent.id);
    h.swipe(phone([received('different')]));
    assert.deepEqual(h.text(), ['what up', 'nothing much']);
    h.send('branch only');
    assert.deepEqual(Array.from(parent.messages, m => m.content), ['what up', 'nothing much']);
    assert.match(h.plan().groups[0].content, /what up/);
    h.emit('CHAT_CHANGED');
    assert.equal(Object.keys(h.settings.conversations).length, 2);
});

test('a branch can change an unanswered reply without changing the parent phone log', () => {
    const h = harness();
    h.respond(phone([received('original')]));
    const parent = h.thread();
    h.context.chat = structuredClone(h.context.chat);
    h.context.chatId = 'branch';
    h.context.chatMetadata = { main_chat: 'main' };
    h.emit('CHAT_CHANGED');
    h.swipe(phone([received('branch reply')]));
    assert.deepEqual(h.text(), ['branch reply']);
    assert.deepEqual(Array.from(parent.messages, m => m.content), ['original']);
});

test('unrelated chat switches neither inherit nor prune another chat’s phone history', () => {
    const h = harness();
    h.respond(phone([received('original')]));
    const parent = h.thread();
    h.context.chatId = 'other';
    h.context.chat = [];
    h.emit('CHAT_CHANGED');
    assert.equal(h.thread(), undefined);
    assert.deepEqual(Array.from(parent.messages, m => m.content), ['original']);
});

test('automatic capture off and explicitly unlinked threads remain respected', () => {
    const h = harness();
    h.respond(phone([received('original')]));
    h.settings.captureRoleplayTextsEnabled = false;
    h.swipe(phone([received('second')]));
    assert.deepEqual(h.text(), ['original']);
    h.settings.captureRoleplayTextsEnabled = true;
    h.thread().roleplayMode = 'unlinked';
    h.swipe(phone([received('third')]));
    assert.deepEqual(h.text(), ['original']);
});

test('legacy captures adopt only matching source turns and honor subsequent real phone replies', () => {
    const h = harness();
    const c = createConversation(h.settings, 'Misaki', { roleplayMode: 'linked', roleplayChatId: 'main' });
    c.messages.push({ role: 'assistant', speaker: 'Misaki', content: 'what up', capturedFromRoleplay: true, mainChatAnchor: 1 });
    c.messages.push({ role: 'user', content: 'nothing much' });
    h.context.chat.push({ is_user: false, mes: phone([received('what up')]) });
    h.emit('CHAT_CHANGED');
    assert.ok(c.messages[0].roleplaySourceId);
    h.swipe(phone([received('different')]));
    assert.deepEqual(h.text(), ['what up', 'nothing much']);
    assert.match(h.plan().groups[0].content, /what up/);
});

test('ambiguous old captures are preserved rather than matched using a reused index alone', () => {
    const c = { messages: [{ role: 'assistant', content: 'unknown old text', capturedFromRoleplay: true, mainChatAnchor: 1 }] };
    assert.equal(capture.adoptLegacyRoleplayCapture(c, 'source', [{ role: 'assistant', content: 'different' }], 1), false);
    assert.equal(c.messages[0].roleplaySourceId, undefined);
});

test('a summarized capture keeps its text and memory boundary on swipes', () => {
    const h = harness();
    h.respond(phone([received('already summarized')]));
    h.thread().lastMemoryMessageIndex = 1;
    h.swipe(phone([received('different')]));
    assert.deepEqual(h.text(), ['already summarized']);
    assert.equal(h.thread().lastMemoryMessageIndex, 1);
});

test('a manually removed bubble is not recreated by repeated render events for the same swipe', () => {
    const h = harness();
    h.respond(phone([received('first'), received('second')]));
    deleteMessage(h.settings, h.thread().id, 0);
    h.emit('CHARACTER_MESSAGE_RENDERED', 0);
    assert.deepEqual(h.text(), ['second']);
});

test('sending the same outgoing text twice remains possible; only model echoes are discarded', () => {
    const h = harness();
    h.respond(phone([received('hello')]));
    h.send('hey');
    h.send('hey');
    h.respond(phone([sent('hey'), received('I heard you')]));
    assert.deepEqual(h.text(), ['hello', 'hey', 'hey', 'I heard you']);
});

test('group members change together on a swipe and are protected together by a phone reply', () => {
    const h = harness();
    const group = lines => `Phone¦Weynet - Elias¦90%¦Mode=Group¦Members=Elias;Misaki;Summer\nTexting¦Friends\n${lines.join('\n')}`;
    h.respond(group([received('hello'), received('hi', 'Summer')]));
    h.swipe(group([received('different', 'Summer')]));
    assert.deepEqual(h.text(), ['different']);
    h.send('hey both');
    h.swipe(group([received('should not appear')]));
    assert.deepEqual(h.text(), ['different', 'hey both']);
});

test('NoChar Observe captures follow swipes while remaining absent from the main prompt', () => {
    const h = harness();
    h.respond(phone([received('side conversation')]).replace('Mode=Solo', 'Mode=NoChar'));
    assert.equal(h.thread().roleplayMode, 'observe');
    h.swipe(phone([received('another side reply')]).replace('Mode=Solo', 'Mode=NoChar'));
    assert.deepEqual(h.text(), ['another side reply']);
    assert.equal(h.plan().groups.length, 0);
    h.context.chat.pop();
    h.emit('MESSAGE_DELETED', 0);
    assert.deepEqual(h.text(), []);
});

test('capture runs after formatting, so a discarded interrupted reply never enters the phone', () => {
    const h = harness();
    h.context.chat.push({ is_user: false, mes: `[SCENE SHEET]\n${phone([received('private draft')])}` });
    h.emit('MESSAGE_RECEIVED', 0);
    h.context.chat[0].mes = ''; // Formatter's interrupted-analysis cleanup.
    h.emit('CHARACTER_MESSAGE_RENDERED', 0);
    assert.equal(Object.keys(h.settings.conversations).length, 0);
});

test('streaming failure ends generation before receive but still preserves a replied-to source', () => {
    const h = harness();
    const sourceId = h.respond(phone([received('what up')])).weyphoneCaptureId;
    h.send('nothing much');
    h.emit('GENERATION_STARTED', 'regenerate', {}, false);
    h.context.chat[0] = { is_user: false, mes: phone([received('partial alternative')]) };
    h.emit('GENERATION_ENDED');
    h.emit('MESSAGE_RECEIVED', 0);
    h.emit('CHARACTER_MESSAGE_RENDERED', 0);
    assert.equal(h.context.chat[0].weyphoneCaptureId, sourceId);
    assert.deepEqual(h.text(), ['what up', 'nothing much']);
});

test('a regenerate rejected before touching the selected reply restores its unanswered texts', () => {
    const h = harness();
    h.respond(phone([received('original')]));
    h.emit('GENERATION_STARTED', 'regenerate', {}, false);
    assert.deepEqual(h.text(), []);
    h.emit('GENERATION_ENDED');
    assert.deepEqual(h.text(), ['original']);
});

test('reopening a chat reconciles known sources to their saved selected swipe', () => {
    const h = harness();
    h.respond(phone([received('original')]));
    h.context.chat[0].mes = phone([received('saved alternative')]);
    h.emit('CHAT_CHANGED');
    assert.deepEqual(h.text(), ['saved alternative']);
});

test('editing a roleplay phone block updates only its own unanswered contribution', () => {
    const h = harness();
    h.respond(phone([received('first turn')]));
    h.respond(phone([received('second turn')]));
    h.context.chat[0].mes = phone([received('edited first')]);
    h.emit('MESSAGE_UPDATED', 0);
    assert.deepEqual(h.text(), ['edited first', 'second turn']);
});

test('removing and restoring an older source retains its order among later phone messages', () => {
    const h = harness();
    h.respond(phone([received('first turn')]));
    h.respond(phone([received('second turn')]));
    h.context.chat[0].mes = 'No phone.';
    h.emit('MESSAGE_UPDATED', 0);
    assert.deepEqual(h.text(), ['second turn']);
    h.context.chat[0].mes = phone([received('first turn')]);
    h.emit('MESSAGE_UPDATED', 0);
    assert.deepEqual(h.text(), ['first turn', 'second turn']);
});

test('deleting a branch’s inherited phone thread does not recreate it on reopening', () => {
    const h = harness();
    h.respond(phone([received('original')]));
    h.context.chatId = 'branch';
    h.context.chatMetadata = { main_chat: 'main' };
    h.emit('CHAT_CHANGED');
    delete h.settings.conversations[h.thread().id];
    h.emit('CHAT_CHANGED');
    assert.equal(h.thread(), undefined);
});
