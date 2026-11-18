import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { characterNamesEquivalent, preferredContactDisplayName } from '../lib/characterIdentity.js';
import { findLorebookCharacterEntry } from '../lib/worldInfo.js';

// The group-chat picker lists a directory contact only when its subbot resolves in the Weyland
// book (getGroupContacts in index.js: preferredContactDisplayName, then findLorebookCharacterEntry).
// These run the real shipped book, so a renamed entry fails here instead of silently dropping a
// character from the picker.
const book = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../../default/content/worlds/Weyland.json', import.meta.url)), 'utf8'));
const subbotFor = directoryName => findLorebookCharacterEntry(book, preferredContactDisplayName(directoryName));

test('directory names that once missed the group picker resolve to their subbots', () => {
    assert.equal(subbotFor('Belle Calloway')?.content, '{{getvar::BE}}');
    assert.equal(subbotFor('Baphrodel Puddyfoot')?.content, '{{getvar::BP}}');
    assert.equal(subbotFor('Garret Sullivan')?.content, '{{getvar::GT}}');
});

test('the directory\'s "Garret" spelling collapses onto "Garrett Sullivan"', () => {
    assert.equal(preferredContactDisplayName('Garret Sullivan'), 'Garrett Sullivan');
    assert.equal(preferredContactDisplayName('Garrett'), 'Garrett Sullivan');
    assert.ok(characterNamesEquivalent('Garret Sullivan', 'Garrett'));
    // His relatives keep their own names.
    assert.equal(preferredContactDisplayName('Margaret Sullivan'), 'Margaret Sullivan');
    assert.ok(!characterNamesEquivalent('Garrett', 'Margaret Sullivan'));
});
