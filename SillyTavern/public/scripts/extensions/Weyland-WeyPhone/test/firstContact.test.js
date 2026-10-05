import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_CONTACT_BLOCK } from '../lib/firstContact.js';

test('first-contact block establishes stranger status without forcing hostility', () => {
    assert.match(FIRST_CONTACT_BLOCK, /\[NO PRIOR HISTORY WITH THIS NUMBER\]/);
    assert.match(FIRST_CONTACT_BLOCK, /never spoken to \{\{user\}\}/);
    assert.match(FIRST_CONTACT_BLOCK, /who is this\?/);
    assert.match(FIRST_CONTACT_BLOCK, /Do not treat\nthe first message as automatically hostile/);
    assert.match(FIRST_CONTACT_BLOCK, /\[END NO PRIOR HISTORY\]/);
    // Macros left literal for send-time substitution
    assert.match(FIRST_CONTACT_BLOCK, /\{\{char\}\}/);
});
