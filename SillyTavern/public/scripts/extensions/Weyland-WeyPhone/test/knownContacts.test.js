import test from 'node:test';
import assert from 'node:assert/strict';
import { isKnownByDefault, STRANGERS_BY_DEFAULT } from '../lib/knownContacts.js';

test('everyone is known by default until Lucky itemizes strangers', () => {
    assert.equal(STRANGERS_BY_DEFAULT.size, 0);
    assert.equal(isKnownByDefault({}, 'Belle'), true);
    assert.equal(isKnownByDefault({}, 'Dr Loren Montenegro'), true);
});

test('per-character settings override beats the curated default in both directions', () => {
    const settings = { contactHistoryDefaults: { Belle: false, Derek: true } };
    assert.equal(isKnownByDefault(settings, 'Belle'), false);
    assert.equal(isKnownByDefault(settings, 'Derek'), true);
    assert.equal(isKnownByDefault(settings, 'Rosa'), true); // untouched
});
