import test from 'node:test';
import assert from 'node:assert/strict';
import { canGroupMessageTimes, getMessageTime, parseMessageClock, setMessageTime, validMessageDate } from '../lib/messageTime.js';
import { resolveStoredMessageTime, reconstructHistoryAsPhoneFormat } from '../lib/generation.js';
import { formatClockTime } from '../lib/formatTime.js';
import { initMessageTimeGestures, showMessageTimeEditor } from '../lib/ui/messageTimeEditor.js';
import { deleteMessage } from '../lib/storage.js';

const scene = (time, overrides = {}) => ({ role: 'user', displayTime: time, ...overrides });

test('groups consecutive burst messages by their individual scene clocks, including a five-minute gap', () => {
    assert.equal(canGroupMessageTimes(scene('3:01 AM'), scene('3:02 AM')), true);
    assert.equal(canGroupMessageTimes(scene('3:02 AM'), scene('3:04 AM')), true);
    assert.equal(canGroupMessageTimes(scene('3:04 AM'), scene('3:09 AM')), true);
    assert.equal(canGroupMessageTimes(scene('3:04 AM'), scene('3:10 AM')), false);
});

function editorFixture(message, callbacks = {}, options = {}) {
    const controls = new Map();
    const control = selector => {
        if (!controls.has(selector)) controls.set(selector, { value: '', textContent: '', handlers: {}, focus() {}, reportValidity() { return true; }, addEventListener(type, fn) { this.handlers[type] = fn; } });
        return controls.get(selector);
    };
    const overlay = { handlers: {}, querySelector: control, addEventListener(type, fn) { this.handlers[type] = fn; }, remove() { this.removed = true; } };
    const panel = { querySelector() { return null; }, appendChild() {} };
    const originalDocument = globalThis.document;
    globalThis.document = { activeElement: null, createElement: () => overlay };
    try { showMessageTimeEditor(panel, message, callbacks.save ?? (() => {}), { ...options, onDelete: callbacks.delete }); }
    finally { globalThis.document = originalDocument; }
    return { control, overlay };
}

test('unified editor saves character text and time together without changing send identity', () => {
    const message = { role: 'assistant', content: 'original', timestamp: 123, displayTime: '8:00 AM', speaker: 'Callie' };
    let saves = 0;
    const { control, overlay } = editorFixture(message, { save: () => saves++ });
    control('.wp-message-content-input').value = 'edited reply';
    control('.wp-time-input').value = '08:01';
    control('.wp-time-date').value = '2026-10-05';
    control('.wp-time-save').handlers.click();
    assert.equal(message.content, 'edited reply');
    assert.equal(message.displayTime, '8:01 AM');
    assert.equal(message.timestamp, 123);
    assert.equal(message.speaker, 'Callie');
    assert.equal(saves, 1);
    assert.equal(overlay.removed, true);
});

test('content-only edits preserve legacy unknown times; Cancel discards all fields', () => {
    const message = { role: 'user', content: 'original', timestamp: 123 };
    let fixture = editorFixture(message, {}, { suppressTimestampFallback: true });
    fixture.control('.wp-message-content-input').value = 'edited';
    fixture.control('.wp-time-save').handlers.click();
    assert.equal(message.content, 'edited');
    assert.equal(message.displayTime, undefined);
    fixture = editorFixture(message);
    fixture.control('.wp-message-content-input').value = 'discarded';
    fixture.control('.wp-time-input').value = '03:08';
    fixture.control('.wp-time-cancel').handlers.click();
    assert.equal(message.content, 'edited');
    assert.equal(message.displayTime, undefined);
});

test('editor Delete removes only its selected message, independent of grouping or new replies', () => {
    const a = scene('3:01 AM', { content: 'first' }), b = scene('3:02 AM', { content: 'selected' }), c = scene('3:04 AM', { content: 'third' });
    const settings = { conversations: { qa: { messages: [a, b, c] } } };
    const fixture = editorFixture(b, { delete: () => deleteMessage(settings, 'qa', settings.conversations.qa.messages.indexOf(b)) });
    settings.conversations.qa.messages.unshift(scene('3:00 AM', { content: 'inserted' }));
    fixture.control('.wp-message-delete').handlers.click();
    assert.deepEqual(settings.conversations.qa.messages.map(m => m.content), ['inserted', 'first', 'third']);
    assert.equal(fixture.overlay.removed, true);
});

test('separates senders, characters, dates, backwards clocks and midnight', () => {
    const a = scene('3:01 AM', { role: 'assistant', speaker: 'Callie', displayDate: '2026-10-05' });
    assert.equal(canGroupMessageTimes(a, { ...a, displayTime: '3:02 AM' }), true);
    for (const changes of [{ role: 'user' }, { speaker: 'Patsy' }, { displayDate: '2026-10-06' }, { displayTime: '3:00 AM' }]) {
        assert.equal(canGroupMessageTimes(a, { ...a, ...changes }), false);
    }
    assert.equal(canGroupMessageTimes(scene('11:59 PM'), scene('12:01 AM')), false);
    assert.equal(canGroupMessageTimes(scene('Morning'), scene('Morning')), false);
});

test('real timestamps respect the exact five-minute boundary and calendar day', () => {
    const start = new Date(2026, 9, 5, 3, 1).getTime();
    const a = { role: 'user', timestamp: start };
    assert.equal(canGroupMessageTimes(a, { ...a, timestamp: start + 300000 }), true);
    assert.equal(canGroupMessageTimes(a, { ...a, timestamp: start + 300001 }), false);
    assert.equal(canGroupMessageTimes(a, { ...a, timestamp: start + 86400000 }), false);
    assert.equal(canGroupMessageTimes(a, { ...a, timestamp: start - 1 }), false);
});

test('RP-clock mode leaves historical unknown times blank instead of inventing real times', () => {
    const a = { role: 'user', timestamp: Date.now() };
    assert.equal(getMessageTime(a, { suppressTimestampFallback: true }).clock, '');
    assert.equal(canGroupMessageTimes(a, a, { suppressTimestampFallback: true }), false);
    assert.equal(getMessageTime(scene('8:00 AM'), { suppressTimestampFallback: true }).clock, '8:00 AM');
});

test('editing either role changes the scene clock, preserves original timestamps, and rejects invalid input', () => {
    for (const role of ['user', 'assistant']) {
        const message = { role, timestamp: 12345, content: 'unchanged', speaker: 'Callie' };
        assert.equal(setMessageTime(message, '03:04', '2026-10-05'), true);
        assert.deepEqual(message, { role, timestamp: 12345, content: 'unchanged', speaker: 'Callie', displayTime: '3:04 AM', displayDate: '2026-10-05' });
        const snapshot = structuredClone(message);
        for (const [time, date] of [['24:00', ''], ['12:60', ''], ['03:04', '2026-02-30'], ['', '']]) {
            assert.equal(setMessageTime(message, time, date), false);
            assert.deepEqual(message, snapshot);
        }
        assert.equal(setMessageTime(message, '08:00'), true);
        assert.equal(message.displayDate, undefined);
        assert.equal(message.timestamp, 12345);
    }
});

test('validates AM/PM, 24-hour clocks and real calendar dates', () => {
    assert.equal(parseMessageClock('12:00 AM'), 0);
    assert.equal(parseMessageClock('12:00PM'), 720);
    assert.equal(parseMessageClock('23:59'), 1439);
    assert.equal(parseMessageClock('00:01 PM'), null);
    assert.equal(validMessageDate('2024-02-29'), true);
    assert.equal(validMessageDate('2026-02-29'), false);
});

test('edited dates/times reach the model transcript even while timestamp fallback is suppressed', () => {
    const message = { role: 'user', content: 'hello', timestamp: Date.now() };
    setMessageTime(message, '03:01', '2026-10-05');
    assert.equal(resolveStoredMessageTime(message, formatClockTime, { suppressTimestampFallback: true }), '2026-10-05 3:01 AM');
    const history = reconstructHistoryAsPhoneFormat([message], { charName: 'Callie', userName: 'You' }, formatClockTime);
    assert.equal(history[0].content, 'Outgoing¦2026-10-05 3:01 AM¦You¦hello');
});

test('a real-time message and an edited neighbor group when their displayed date/time still match', () => {
    const first = { role: 'user', timestamp: new Date(2026, 9, 5, 3, 1).getTime() };
    const second = { role: 'user', timestamp: first.timestamp + 60000 };
    setMessageTime(second, '03:02', '2026-10-05');
    assert.equal(canGroupMessageTimes(first, second), true);
});

test('long hold opens either sender, movement and scrolling cancel it, and selects/controls stay untouched', () => {
    const listeners = {}, opened = [];
    const container = { addEventListener: (type, fn) => { listeners[type] = fn; } };
    const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
    let pending;
    globalThis.setTimeout = fn => { pending = fn; return 1; };
    globalThis.clearTimeout = () => { pending = null; };
    try {
        initMessageTimeGestures(container, index => opened.push(index));
        const bubble = { isConnected: true, dataset: { index: '2' } };
        const event = { button: 0, pointerId: 1, clientX: 0, clientY: 0, target: { closest: selector => selector.startsWith('.wp-message[') ? bubble : null } };
        listeners.pointerdown(event); pending();
        assert.deepEqual(opened, [2]);
        // The release click belongs to the held bubble, not the first editor action.
        const click = { target: { closest: () => bubble }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
        listeners.click(click);
        assert.equal(click.prevented, true);
        assert.equal(click.stopped, true);
        const menuEvent = { ...event, preventDefault() { this.prevented = true; } };
        listeners.contextmenu(menuEvent);
        assert.equal(menuEvent.prevented, true);
        assert.deepEqual(opened, [2, 2]);
        const keyboardEvent = { ...event, key: 'F10', shiftKey: true, preventDefault() {} };
        listeners.keydown(keyboardEvent);
        assert.deepEqual(opened, [2, 2, 2]);
        listeners.pointerdown(event); listeners.pointermove({ ...event, clientX: 20 }); assert.equal(pending, null);
        listeners.pointerdown(event); listeners.scroll(); assert.equal(pending, null);
        listeners.pointerdown({ ...event, target: { closest: () => null } }); assert.equal(pending, null);
    } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; }
});
