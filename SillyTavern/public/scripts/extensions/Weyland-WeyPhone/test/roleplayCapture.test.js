import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as capture from '../lib/roleplayCapture.js';
import * as tether from '../lib/roleplayTether.js';
import { isConversationLinkedToChat } from '../lib/roleplayMode.js';
import { appendMessage, createConversation, deleteMessage, setTetheredSettings } from '../lib/storage.js';
import { getSettings } from '../lib/config.js';
import { getCastEntries } from '../lib/castDirectory.js';
import { WEYLAND_ROSTER } from '../lib/weylandRoster.js';
import { characterNamesEquivalent } from '../lib/characterIdentity.js';
import { CAST_SNAPSHOT } from '../lib/castSnapshot.js';
import { getCommunityContacts } from '../lib/communityLorebook.js';

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

// Reported fresh-install exchange: character-owned screen, short sender name, saved user
// nickname, and three real outgoing phone texts echoed before three new character replies.
const serraUserTexts = [
    'hey baby butt, i just got back to the apartment',
    'i brought you chipotle, idk if you ate lunch lol',
    'things busy? need me to bring it to you? ❤️',
];
const serraReplyTexts = [
    'youre upstairs right now??? (⁄ ⁄•⁄ω⁄•⁄ ⁄)',
    'um. emergency. a really really bad one',
    'my heat just started at the counter and im hiding in the storage room with jenn and i think im gonna die (╥﹏╥) can you come down to the back hallway please??',
];
const serraReply = [
    '¦¦ Wednesday, November 4th ~ 2:18 PM ~ Sakurai Cafe - Storage Room ~ (SAPH) ¦¦',
    'Phone¦Weynet - Serra¦64%¦Mode=Solo¦Members=Serra;Lucky',
    'Texting¦Lucky ❤️',
    ...serraUserTexts.map(text => `Incoming¦2:14 PM¦Lucky¦${text}`),
    ...serraReplyTexts.map((text, index) => `Outgoing¦${index < 2 ? '2:18' : '2:19'} PM¦Serra¦${text}`),
    '[Embarrassment] [RC] [11]',
].join('\n');

function officialCaptureHarness(shortName, fullName, { automatic = true, shortThread = false } = {}) {
    const h = harness();
    h.context.name1 = 'Lucky';
    h.context.characters = [{ name: shortName }];
    h.settings.captureRoleplayTextsEnabled = automatic;
    // A fresh cache keeps this regression entirely offline and fixes the audited directory.
    h.settings.castDirectory = { fetchedAt: Date.now(), entries: CAST_SNAPSHOT };
    // Use the production directory/card/roster combination, rather than a parser-only list
    // containing just the long name. Both short and full labels exist in a fresh install.
    Object.assign(h.sandbox, { getCastEntries, getCommunityContacts, WEYLAND_ROSTER, characterNamesEquivalent,
        contactLorebookState: { registrarContacts: [] } });
    vm.runInContext(sliceFunction('captureKnownNames'), h.sandbox);
    const conversation = createConversation(h.settings, shortThread ? shortName : fullName, {
        roleplayMode: 'linked', roleplayChatId: 'main',
    });
    for (const content of serraUserTexts) appendMessage(h.settings, conversation.id, { role: 'user', content });
    return { ...h, conversation };
}

const serraHarness = options => officialCaptureHarness('Serra', 'Serra Fuyuki', options);

test('Serra short-name replies enter her existing full-name Linked thread without duplicating Lucky’s echoes', () => {
    const h = serraHarness();
    h.respond(serraReply);
    assert.equal(Object.keys(h.settings.conversations).length, 1, 'no duplicate Serra thread');
    assert.deepEqual(Array.from(h.conversation.messages, m => m.content), [...serraUserTexts, ...serraReplyTexts]);
    assert.deepEqual(Array.from(h.conversation.messages, m => m.role), ['user', 'user', 'user', 'assistant', 'assistant', 'assistant']);
    assert.equal(h.conversation.messages.at(-1).speaker, 'Serra Fuyuki');
    assert.equal(h.conversation.messages.at(-1).displayTime, '2:19 PM');
    h.emit('CHARACTER_MESSAGE_RENDERED', 0);
    assert.equal(h.conversation.messages.length, 6, 'repeated rendering is idempotent');
});

test('fresh installs automatically import Serra’s replies into the existing Linked thread', () => {
    const fresh = getSettings({});
    assert.equal(fresh.captureRoleplayTextsEnabled, true);
    const h = serraHarness({ automatic: fresh.captureRoleplayTextsEnabled });
    h.respond(serraReply);
    assert.equal(Object.keys(h.settings.conversations).length, 1);
    assert.deepEqual(Array.from(h.conversation.messages, m => m.content), [...serraUserTexts, ...serraReplyTexts]);
});

test('explicitly disabling automatic capture still allows Capture last reply to import Serra’s replies', () => {
    const h = serraHarness({ automatic: false });
    h.respond(serraReply);
    assert.deepEqual(Array.from(h.conversation.messages, m => m.content), serraUserTexts);
    assert.equal(h.sandbox.handleRoleplayPhoneCapture(0, { manual: true, silent: true }), 3);
    assert.equal(Object.keys(h.settings.conversations).length, 1);
    assert.deepEqual(Array.from(h.conversation.messages, m => m.content), [...serraUserTexts, ...serraReplyTexts]);
});

// Explicit title/nickname exceptions; ordinary short labels come from the committed directory.
// Check both saved full-name threads and older short-name threads against real capture events.
const shortLabel = name => ({
    'Dakota Ash (Dash)': 'Dash', 'Baphrodel Puddyfoot': 'Bap',
    'Sayori Akiyama': 'Professor Akiyama', 'Dr Loren Montenegro': 'Loren', 'Mr. Wolfy': 'Mr. Wolfy',
}[name] ?? name.split(' ')[0]);

for (const entry of CAST_SNAPSHOT) {
    test(`official capture aliases: ${shortLabel(entry.name)} / ${entry.name}`, () => {
        for (const shortThread of [false, true]) {
            const short = shortLabel(entry.name);
            const h = officialCaptureHarness(short, entry.name, { shortThread });
            h.respond(`Phone¦Weynet - ${short}¦90%¦Mode=Solo¦Members=${short};Lucky\nTexting¦Lucky ❤️\nIncoming¦2:14 PM¦Lucky¦${serraUserTexts[0]}\nOutgoing¦2:18 PM¦${short}¦New reply`);
            assert.equal(Object.keys(h.settings.conversations).length, 1, 'capture reuses the Linked thread');
            assert.deepEqual(Array.from(h.conversation.messages, m => m.content), [...serraUserTexts, 'New reply']);
            // Full-name output on a later swipe must still replace the same contribution.
            h.swipe(`Phone¦Weynet - ${entry.name}¦90%¦Mode=Solo¦Members=${entry.name};Lucky\nTexting¦Lucky\nOutgoing¦2:19 PM¦${entry.name}¦Alternate reply`);
            assert.equal(Object.keys(h.settings.conversations).length, 1);
            assert.deepEqual(Array.from(h.conversation.messages, m => m.content), [...serraUserTexts, 'Alternate reply']);
        }
    });
}

test('canonical sibling aliases stay separate in a captured group conversation', () => {
    const h = officialCaptureHarness('Serra', 'Serra Fuyuki');
    const group = createConversation(h.settings, 'Siblings', {
        participants: ['Serra Fuyuki', 'Blake Fuyuki'], roleplayMode: 'linked', roleplayChatId: 'main',
    });
    h.respond('Phone¦Weynet - Lucky¦90%¦Mode=Group¦Members=Lucky;Serra;Blake\nTexting¦Siblings\nIncoming¦2:18 PM¦Serra¦Hello\nIncoming¦2:18 PM¦Blake¦Hi');
    assert.equal(Object.keys(h.settings.conversations).length, 2);
    assert.equal(h.conversation.messages.length, 3, 'the solo thread remains separate');
    assert.deepEqual(Array.from(group.messages, m => m.speaker), ['Serra Fuyuki', 'Blake Fuyuki']);
});

function communityCaptureHarness({ secondGeorge = false, shortThread = false, community = false } = {}) {
    const h = officialCaptureHarness('George', 'George Smith', { shortThread });
    const contacts = [{ name: 'George Smith', lorebookName: 'Registrar characters' }];
    if (secondGeorge) contacts.push({ name: 'George Jones', lorebookName: 'Registrar characters' });
    if (community) h.settings.communityContacts = contacts;
    else h.sandbox.contactLorebookState.registrarContacts = contacts;
    return h;
}

const georgePhone = 'Phone¦Weynet - George¦90%¦Mode=Solo¦Members=George;Lucky\nTexting¦Lucky\nIncoming¦2:14 PM¦Lucky¦hey\nOutgoing¦2:18 PM¦__George:__¦Hello from George';

for (const community of [false, true]) {
    test(`${community ? 'user-picked community' : 'Registrar'} contact George Smith receives short-name phone captures`, () => {
        for (const shortThread of [false, true]) {
            const h = communityCaptureHarness({ community, shortThread });
            h.respond(`__George:__ *He checks his phone.*\n${georgePhone}`);
            assert.equal(Object.keys(h.settings.conversations).length, 1);
            assert.equal(h.conversation.messages.at(-1).content, 'Hello from George');
            assert.equal(h.conversation.messages.at(-1).speaker, 'George Smith');
        }
    });
}

test('ambiguous George does not modify either thread or create a third one', () => {
    const h = communityCaptureHarness({ secondGeorge: true });
    const other = createConversation(h.settings, 'George Jones', { roleplayMode: 'linked', roleplayChatId: 'main' });
    h.respond(georgePhone);
    assert.equal(Object.keys(h.settings.conversations).length, 2);
    assert.equal(h.conversation.messages.length, 3);
    assert.equal(other.messages.length, 0);
});

test('a full declared member disambiguates shortened phone owner and sender names', () => {
    const h = communityCaptureHarness({ secondGeorge: true });
    h.respond(georgePhone.replace('Members=George;Lucky', 'Members=George Smith;Lucky'));
    assert.equal(Object.keys(h.settings.conversations).length, 1);
    assert.equal(h.conversation.messages.at(-1).content, 'Hello from George');
});

test('a disconnected short-name community thread is not silently reconnected under a full name', () => {
    const h = communityCaptureHarness({ shortThread: true });
    h.conversation.roleplayTether = true;
    h.conversation.roleplayMode = 'unlinked';
    h.respond(georgePhone);
    assert.equal(Object.keys(h.settings.conversations).length, 1);
    assert.equal(h.conversation.messages.length, 3);
});

test('ordinary George dialogue without a phone block never becomes a text message', () => {
    const h = communityCaptureHarness();
    h.respond('__George:__ "Hello from George."');
    assert.equal(h.conversation.messages.length, 3);
});

test('replayed community messages stored under a short speaker name do not duplicate after full-name routing', () => {
    const h = communityCaptureHarness({ shortThread: true });
    appendMessage(h.settings, h.conversation.id, { role: 'assistant', speaker: 'George', content: 'Older reply' });
    h.respond('Phone¦Weynet - George¦90%¦Mode=Solo¦Members=George;Lucky\nTexting¦Lucky\nOutgoing¦2:17 PM¦George¦Older reply\nOutgoing¦2:18 PM¦George¦New reply');
    assert.equal(Object.keys(h.settings.conversations).length, 1);
    assert.deepEqual(Array.from(h.conversation.messages, m => m.content), [...serraUserTexts, 'Older reply', 'New reply']);
});

test('loading new Registrar contacts automatically changes short-name routing without a source-code alias', () => {
    const h = communityCaptureHarness();
    h.sandbox.contactLorebookState.registrarContacts.push({ name: 'Rowan Vale', lorebookName: 'Registrar characters' });
    const rowan = createConversation(h.settings, 'Rowan Vale', { roleplayMode: 'linked', roleplayChatId: 'main' });
    h.respond('Phone¦Weynet - Rowan¦90%¦Mode=Solo¦Members=Rowan;Lucky\nTexting¦Lucky\nOutgoing¦now¦Rowan¦Newly imported');
    assert.equal(rowan.messages[0].speaker, 'Rowan Vale');
    assert.equal(Object.keys(h.settings.conversations).length, 2);

    h.sandbox.contactLorebookState.registrarContacts.push({ name: 'George Jones', lorebookName: 'Registrar characters' });
    h.respond(georgePhone);
    assert.equal(h.conversation.messages.length, 3, 'a new collision invalidates the earlier unique George alias');
    h.sandbox.contactLorebookState.registrarContacts.pop();
    h.respond(georgePhone);
    assert.equal(h.conversation.messages.at(-1).speaker, 'George Smith', 'unloading the collision restores unique routing');
    assert.equal(Object.keys(h.settings.conversations).length, 2);
});

// Codex's reroll repro (2026-10-18): the roleplay reply first has Mika texting; a reroll of that same reply
// has Summer texting instead; the player sends Mika a new phone text; then rerolls back to the Mika version
// and on to Summer again. The restored Mika texts used to land BEFORE the new text, read as answered, lock,
// and survive every later reroll.
test('a rerolled-back reply lands after a newer phone text and can still be rerolled away', () => {
    const settings = getSettings({});
    const mika = createConversation(settings, 'Mika');
    const opts = { timestamp: () => 1, anchor: 5 };
    const mikaReply = [{ role: 'assistant', speaker: 'Mika', content: 'is she okay?' }];

    capture.reconcileRoleplayCapture(mika, 'src', mikaReply, opts);   // 1. Mika texts arrive
    capture.reconcileRoleplayCapture(mika, 'src', [], opts);          // 2. reroll: Summer texts instead
    assert.equal(mika.messages.length, 0);
    appendMessage(settings, mika.id, { role: 'user', content: 'she is asleep' }); // 3. new phone text
    capture.reconcileRoleplayCapture(mika, 'src', mikaReply, opts);   // 4a. back to the Mika version
    assert.deepEqual(mika.messages.map(m => m.content), ['she is asleep', 'is she okay?']);
    assert.notEqual(mika.messages[1].roleplayReplyLocked, true);
    capture.reconcileRoleplayCapture(mika, 'src', [], opts);          // 4b. and the Summer version again
    assert.deepEqual(mika.messages.map(m => m.content), ['she is asleep']);
});

test('without a new phone text, a rerolled-back reply still returns to its original slot', () => {
    const settings = getSettings({});
    const mika = createConversation(settings, 'Mika');
    const opts = { timestamp: () => 1, anchor: 5 };
    capture.reconcileRoleplayCapture(mika, 'old', [{ role: 'assistant', speaker: 'Mika', content: 'first' }], opts);
    capture.reconcileRoleplayCapture(mika, 'new', [{ role: 'assistant', speaker: 'Mika', content: 'second' }], opts);
    capture.reconcileRoleplayCapture(mika, 'old', [], opts);
    capture.reconcileRoleplayCapture(mika, 'old', [{ role: 'assistant', speaker: 'Mika', content: 'first again' }], opts);
    assert.deepEqual(mika.messages.map(m => m.content), ['first again', 'second']);
});
