// The model-side wording of card meanings (BEAT_WORDING in fortuneCore.js). It is keyed by the exact text of a
// card's meaning in app/cards.js, so a reworded card would silently fall back to its old wording in the request.
// This fails instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BEAT_WORDING, fortuneIdea } from '../fortuneCore.js';

const here = path.dirname(fileURLToPath(import.meta.url));
globalThis.window = globalThis.window || {};
await import(pathToFileURL(path.join(here, '..', 'app', 'cards.js')).href);
const keys = new Set(window.EFF.ARCANA.flatMap(c => [c.up.key, c.rev.key]));

test('every reworded beat is a real card meaning', () => {
    for (const k of Object.keys(BEAT_WORDING)) assert.ok(keys.has(k), `"${k}" is not a card meaning in cards.js`);
});

test('the request carries the model wording, on both routes', () => {
    const text = fortuneIdea({ cards: [{ key: 'a race, a rival', otherKey: 'a race, a rival' }], fork: true });
    assert.match(text, /Beat 1: a race, a challenge or a rival \(on route B instead: a race, a challenge or a rival\)/);
    assert.ok(!/Beat 1: a race, a rival\b/.test(text));
});

test('unlisted meanings go through unchanged', () => {
    assert.match(fortuneIdea({ cards: [{ key: 'slow and even' }] }), /Beat 1: slow and even$/m);
});
