import assert from 'node:assert/strict';
import test from 'node:test';

import { isGeneralMessagingContact } from '../lib/contactVisibility.js';

test('Kressa is reserved for her dedicated app', () => {
    assert.equal(isGeneralMessagingContact('Kressa'), false);
    assert.equal(isGeneralMessagingContact({ name: ' kReSsA ' }), false);
});

test('ordinary contacts remain available to Messages', () => {
    assert.equal(isGeneralMessagingContact('Summer'), true);
    assert.equal(isGeneralMessagingContact({ name: 'Nara' }), true);
});

test('combo and system cards never appear as ordinary contacts', () => {
    for (const name of ['Blake & Serra', 'Cerberus Sisters', 'Weybot', 'Mirror Weyland', 'Kinsbane']) {
        assert.equal(isGeneralMessagingContact(name), false, name);
    }
});
