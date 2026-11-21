// Kinsbane Manor and Muse on their base greetings tell their own story, so Foxfire stays out (Lucky, 2026-11-19).
// Their custom start is allowed. The custom-start sentence must match quick-reply-ext's isCustomStartGreeting.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tellsOwnStory } from '../fortuneCore.js';

const CS = '[OOC: Following your character information and personality as a basis, build a new scenario...]';

test('base greetings of Kinsbane Manor and Muse are blocked', () => {
    assert.equal(tellsOwnStory({ cardName: 'Kinsbane Manor', firstMessage: 'The gates of the manor...' }), true);
    assert.equal(tellsOwnStory({ cardName: 'Muse', firstMessage: 'Day 1...' }), true);
    assert.equal(tellsOwnStory({ cardName: 'Muse', firstMessage: '' }), true);
});

test('their custom start is allowed', () => {
    assert.equal(tellsOwnStory({ cardName: 'Kinsbane Manor', firstMessage: CS }), false);
    assert.equal(tellsOwnStory({ cardName: 'Muse', firstMessage: CS }), false);
});

test('every other card, and group chats, are allowed', () => {
    for (const cardName of ['Belle', 'Weybot', 'Mirror Weyland', 'Aiko', 'Muse (private assistant)', '']) {
        assert.equal(tellsOwnStory({ cardName, firstMessage: 'hi' }), false, cardName);
    }
    assert.equal(tellsOwnStory({ cardName: 'Muse', firstMessage: 'Day 1', inGroup: true }), false);
});

test('the custom-start sentence matches quick-reply-ext', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const qr = path.join(here, '..', '..', 'quick-reply-ext', 'src', 'introSwitch.js');
    if (!fs.existsSync(qr)) return;   // a stripped test tree without quick-reply-ext
    assert.ok(fs.readFileSync(qr, 'utf8').includes('Following your character information and personality as a basis'));
});
