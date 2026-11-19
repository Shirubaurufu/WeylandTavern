// The workbench store (app/bench.js): progress that has to survive WeyPhone closing the app's iframe
// (Lucky, 2026-11-18: a failed request plus "close the phone to change the model" lost a whole spread).
// bench.js is a plain script that puts EFFBench on globalThis; it is loaded here against an in-memory localStorage.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: k => { mem.delete(k); },
};
await import('../app/bench.js');
const B = globalThis.EFFBench;

const story = title => ({ title, premise: 'p', chapters: [{ name: 'a', scene: 's', ends: 'e' }] });

test('a spread round-trips and is stamped', () => {
    mem.clear();
    assert.equal(B.getSpread(), null);
    B.saveSpread({ n: 5, slots: [{ id: 3, rev: true }, null, null, null, null], question: 'hi', spice: 2, screen: 'draw' });
    const sp = B.getSpread();
    assert.equal(sp.n, 5);
    assert.deepEqual(sp.slots[0], { id: 3, rev: true });
    assert.equal(sp.question, 'hi');
    assert.ok(sp.at > 0);
});

test('readings are kept per chat and never leak into another chat', () => {
    mem.clear();
    B.saveReading('chat-a', story('A'));
    B.storePendingReading('chat-b', story('B'), { cards: [{ id: 1, rev: false }], darkness: 1, spice: 1 });
    assert.equal(B.getReading('chat-a').story.title, 'A');
    assert.equal(B.getReading('chat-a').dressed, true);
    assert.equal(B.getReading('chat-b').dressed, false);
    assert.deepEqual(B.getReading('chat-b').opts.cards, [{ id: 1, rev: false }]);
    assert.equal(B.getReading('chat-c'), null);
    B.dropReading('chat-a');
    assert.equal(B.getReading('chat-a'), null);
    assert.equal(B.getReading('chat-b').story.title, 'B', 'dropping one chat leaves the others');
});

test('saving the spread does not touch saved readings (and the other way round)', () => {
    mem.clear();
    B.storePendingReading('c', story('kept'), { cards: [{ id: 2 }] });
    B.saveSpread({ n: 3 });
    assert.equal(B.getReading('c').story.title, 'kept');
    B.saveReading('c', story('edited'));
    assert.equal(B.getSpread().n, 3);
});

test('only the newest few readings are kept', () => {
    mem.clear();
    for (let i = 0; i < B.READINGS_MAX + 3; i++) B.saveReading(`chat-${i}`, story(String(i)));
    const kept = Object.keys(B.read().readings);
    assert.equal(kept.length, B.READINGS_MAX);
    assert.ok(kept.includes(`chat-${B.READINGS_MAX + 2}`), 'the newest survives');
});

test('broken or foreign storage reads as empty instead of throwing', () => {
    mem.clear();
    mem.set(B.KEY, '{not json');
    assert.deepEqual(B.read(), { spread: null, readings: {} });
    mem.set(B.KEY, JSON.stringify({ spread: 'x', readings: [1, 2] }));
    assert.deepEqual(B.read(), { spread: null, readings: {} });
});
