import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { filterNewMessageContacts } from '../lib/panel.js';

// Minimal stand-in for the screen body: only what filterNewMessageContacts touches.
function fakeBody(names) {
    const rows = names.map(name => ({ dataset: { name }, hidden: false }));
    const none = { hidden: true };
    const clear = { hidden: true };
    return {
        rows, none, clear,
        querySelectorAll: () => rows,
        querySelector: selector => (selector === '.wp-newmsg-none' ? none : selector === '#wp-newmsg-search-clear' ? clear : null),
    };
}
const visible = body => body.rows.filter(row => !row.hidden).map(row => row.dataset.name);

test('New Message search matches every typed word, ignoring case, accents and punctuation', () => {
    const body = fakeBody(['Yue-Lin', 'Serra Fuyuki', 'Zoë', 'Summer', 'Sunny']);
    filterNewMessageContacts(body, 'yue lin');
    assert.deepEqual(visible(body), ['Yue-Lin']);
    filterNewMessageContacts(body, 'fuyuki SERRA');
    assert.deepEqual(visible(body), ['Serra Fuyuki']);
    filterNewMessageContacts(body, 'zoe');
    assert.deepEqual(visible(body), ['Zoë']);
    filterNewMessageContacts(body, 'su');
    assert.deepEqual(visible(body), ['Summer', 'Sunny']);
});

test('no match shows the empty note, an empty query restores everything and hides the clear button', () => {
    const body = fakeBody(['Jade', 'Alex']);
    filterNewMessageContacts(body, 'qqq');
    assert.deepEqual(visible(body), []);
    assert.equal(body.none.hidden, false);
    assert.equal(body.clear.hidden, false);
    filterNewMessageContacts(body, '  ');
    assert.deepEqual(visible(body), ['Jade', 'Alex']);
    assert.equal(body.none.hidden, true);
    filterNewMessageContacts(body, '');
    assert.equal(body.clear.hidden, true);
});

test('the phone wires the search input and its clear button', () => {
    const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    assert.match(index, /event\.target\.id !== 'wp-newmsg-search'[\s\S]{0,120}filterNewMessageContacts\(screenBody/);
    assert.match(index, /closest\('#wp-newmsg-search-clear'\)/);
});
