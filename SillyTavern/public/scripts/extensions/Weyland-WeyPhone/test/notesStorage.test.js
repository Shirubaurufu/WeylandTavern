import test from 'node:test';
import assert from 'node:assert/strict';
import { createNote, getNotes, getNote, updateNote, deleteNote, noteTitle } from '../lib/notesStorage.js';

test('create/read/update/delete round-trip', () => {
    const settings = {};
    const note = createNote(settings, { text: 'hello' }, 100);
    assert.equal(getNote(settings, note.id).text, 'hello');
    updateNote(settings, note.id, { text: 'changed' }, 200);
    assert.equal(getNote(settings, note.id).text, 'changed');
    assert.equal(getNote(settings, note.id).updatedAt, 200);
    assert.equal(deleteNote(settings, note.id), true);
    assert.equal(deleteNote(settings, note.id), false);
    assert.equal(getNotes(settings).length, 0);
});

test('getNotes sorts newest-updated first', () => {
    const settings = {};
    const a = createNote(settings, { text: 'a' }, 100);
    createNote(settings, { text: 'b' }, 200);
    updateNote(settings, a.id, { text: 'a2' }, 300);
    assert.deepEqual(getNotes(settings).map(n => n.text), ['a2', 'b']);
});

test('updateNote on a missing id returns undefined; junk text ignored', () => {
    const settings = {};
    assert.equal(updateNote(settings, 'nope', { text: 'x' }), undefined);
    const note = createNote(settings, { text: 'keep' }, 100);
    updateNote(settings, note.id, { text: 42 }, 200);
    assert.equal(getNote(settings, note.id).text, 'keep');
    assert.equal(getNote(settings, note.id).updatedAt, 100);
});

test('noteTitle uses the first non-empty line, clipped, with a fallback', () => {
    assert.equal(noteTitle({ text: '\n\nShopping list\nmilk' }), 'Shopping list');
    assert.equal(noteTitle({ text: '' }), 'New note');
    assert.equal(noteTitle({ text: 'x'.repeat(60) }).length, 40);
});
