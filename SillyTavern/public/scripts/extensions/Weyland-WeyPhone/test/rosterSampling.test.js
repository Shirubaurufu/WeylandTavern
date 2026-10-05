import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleRoster } from '../lib/rosterSampling.js';

const ROSTER = Array.from({ length: 10 }, (_, i) => ({ name: `Char${i}` }));

test('returns exactly count members, all from the source, no duplicates', () => {
    const sample = sampleRoster(ROSTER, 4);
    assert.equal(sample.length, 4);
    assert.equal(new Set(sample.map(m => m.name)).size, 4);
    for (const member of sample) assert.ok(ROSTER.includes(member));
});

test('count >= length returns a copy of the whole roster', () => {
    const all = sampleRoster(ROSTER, 10);
    assert.equal(all.length, 10);
    assert.notEqual(all, ROSTER); // new array
    const more = sampleRoster(ROSTER, 99);
    assert.equal(more.length, 10);
});

test('never mutates the input', () => {
    const before = [...ROSTER];
    sampleRoster(ROSTER, 3);
    assert.deepEqual(ROSTER, before);
});

test('deterministic with a fixed randomFn', () => {
    const a = sampleRoster(ROSTER, 5, { randomFn: () => 0.5 });
    const b = sampleRoster(ROSTER, 5, { randomFn: () => 0.5 });
    assert.deepEqual(a, b);
});

test('different randomFns produce different samples (statistically certain here)', () => {
    let x = 0;
    const a = sampleRoster(ROSTER, 5, { randomFn: () => 0.01 });
    const b = sampleRoster(ROSTER, 5, { randomFn: () => { x = (x + 0.61) % 1; return x; } });
    assert.notDeepEqual(a, b);
});
