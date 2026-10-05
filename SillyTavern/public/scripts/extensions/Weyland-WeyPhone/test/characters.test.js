import test from 'node:test';
import assert from 'node:assert/strict';
import { EXCLUDED_CHARACTER_NAMES, getSelectableCharacters } from '../lib/characters.js';

test('EXCLUDED_CHARACTER_NAMES matches the confirmed exclusion list', () => {
    assert.deepEqual(EXCLUDED_CHARACTER_NAMES, ['Weybot', 'Mirror Weyland', 'Kinsbane Manor']);
});

test('getSelectableCharacters filters out excluded names', () => {
    const characters = [
        { name: 'Rosa' },
        { name: 'Weybot' },
        { name: 'Ava' },
        { name: 'Mirror Weyland' },
        { name: 'Kinsbane Manor' },
    ];
    const result = getSelectableCharacters(characters);
    assert.deepEqual(result.map(c => c.name), ['Rosa', 'Ava']);
});

test('getSelectableCharacters accepts a custom exclusion list', () => {
    const characters = [{ name: 'Rosa' }, { name: 'Ava' }];
    const result = getSelectableCharacters(characters, ['Rosa']);
    assert.deepEqual(result.map(c => c.name), ['Ava']);
});

test('getSelectableCharacters returns an empty array for an empty input', () => {
    assert.deepEqual(getSelectableCharacters([]), []);
});
