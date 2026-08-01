import test from 'node:test';
import assert from 'node:assert/strict';

import {
    scanBookForCandidates,
    addCommunityContacts,
    getCommunityContacts,
    deleteCommunityContacts,
    communityLorebookNames,
    communityContactDirectoryEntry,
    isExcludedFromCommunityPicker,
    isLikelyCommunityContactCandidate,
    communityPickableBookNames,
} from '../lib/communityLorebook.js';

function book(entries) {
    return { entries: Object.fromEntries(entries.map((e, i) => [i, e])) };
}

test('scanBookForCandidates finds named, enabled, non-empty entries', () => {
    const candidates = scanBookForCandidates(book([
        { comment: 'Felonious', content: 'A grumpy dorm cat who steals snacks.' },
        { comment: 'Empty Entry', content: '' },
        { comment: 'Disabled Guy', content: 'text', disable: true },
        { comment: '', key: ['Room 4B', 'dorm'], content: 'Dorm backstory lore.' },
    ]), 'My Book');
    assert.deepEqual(candidates.map(c => c.name), ['Felonious']);
    assert.equal(candidates[0].lorebookName, 'My Book');
    assert.match(candidates[0].preview, /grumpy dorm cat/);
});

test('scanBookForCandidates skips the Registrar directory summary entry', () => {
    const candidates = scanBookForCandidates(book([
        { comment: 'Character Roster', content: 'Felonious: (cat, west dorm)\nVera: (draconid, room 4)' },
        { comment: 'character roster', content: 'lowercase variant should also be skipped' },
        { comment: 'Felonious', content: 'A grumpy dorm cat.' },
    ]), 'Book');
    assert.deepEqual(candidates.map(c => c.name), ['Felonious']);
});

test('scanBookForCandidates keeps only the primary contact from a split Registrar profile', () => {
    const activationKeys = ['!Felonious', '/\\bFelonious\\b/'];
    const candidates = scanBookForCandidates(book([
        { comment: 'Character Roster', content: 'Felonious: professor' },
        { comment: 'Felonious', key: activationKeys, content: '[Felonious INFO] Felonious Gru, Male, Human.' },
        { comment: 'Felonious Backstory/History', key: activationKeys, content: "Felonious's Backstory: Known history." },
        { comment: 'Felonious Dorm room/Housing', key: activationKeys, content: "Felonious's personal space." },
        { comment: 'Felonious End Section', key: activationKeys, content: '[END Felonious INFO] -----' },
    ]), 'Lore Book - Weyland Registrar(1)');
    assert.deepEqual(candidates.map(candidate => candidate.name), ['Felonious']);
});

test('isLikelyCommunityContactCandidate rejects common supporting-lore labels and end markers', () => {
    assert.equal(isLikelyCommunityContactCandidate('Vera', '[Vera INFO] Draconid.'), true);
    assert.equal(isLikelyCommunityContactCandidate('Vera Backstory', 'History.'), false);
    assert.equal(isLikelyCommunityContactCandidate('West Dorm Layout', 'Rooms.'), false);
    assert.equal(isLikelyCommunityContactCandidate('Vera End Section', '[END Vera INFO]'), false);
    assert.equal(isLikelyCommunityContactCandidate('Vera Appendix', '[END Vera INFO]'), false);
});

test('isExcludedFromCommunityPicker flags dorm and history books, case-insensitively', () => {
    assert.equal(isExcludedFromCommunityPicker('Lore Book - Weyland Registrar(1)'), false);
    assert.equal(isExcludedFromCommunityPicker('Dorm Assignments'), true);
    assert.equal(isExcludedFromCommunityPicker('Weyland Dorms'), true);
    assert.equal(isExcludedFromCommunityPicker('Dormitory Layout'), true);
    assert.equal(isExcludedFromCommunityPicker('HISTORY 2026'), true);
    assert.equal(isExcludedFromCommunityPicker('Weyland History Archive'), true);
    assert.equal(isExcludedFromCommunityPicker('Chat_Book_Vera_2026_07_09'), true);
    assert.equal(isExcludedFromCommunityPicker('Chat Book Vera 2026'), true);
    assert.equal(isExcludedFromCommunityPicker('Felonious Backstory'), false);
});

test('communityPickableBookNames filters out excluded books and keeps the rest', () => {
    const names = ['Lore Book - Weyland Registrar(1)', 'Dorm Assignments', 'Roleplay History', 'Chat_Book_Vera_2026', 'Kris Backstory'];
    assert.deepEqual(communityPickableBookNames(names), ['Lore Book - Weyland Registrar(1)', 'Kris Backstory']);
});

test('scanBookForCandidates falls back to the first non-empty key when comment is blank', () => {
    const candidates = scanBookForCandidates(book([
        { comment: '', key: ['', 'Vera'], content: 'Draconid.' },
    ]), 'Book');
    assert.equal(candidates[0].name, 'Vera');
});

test('scanBookForCandidates truncates long previews and dedupes by name', () => {
    const long = 'x'.repeat(200);
    const candidates = scanBookForCandidates(book([
        { comment: 'Dup', content: 'first' },
        { comment: 'Dup', content: 'second, should be skipped' },
        { comment: 'Long', content: long },
    ]), 'Book');
    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].preview, 'first');
    assert.ok(candidates[1].preview.length <= 140);
    assert.ok(candidates[1].preview.endsWith('…'));
});

test('addCommunityContacts adds new ones and skips existing (case-insensitive) duplicates', () => {
    const settings = {};
    const added1 = addCommunityContacts(settings, [
        { name: 'Felonious', lorebookName: 'Book A' },
        { name: 'Vera', lorebookName: 'Book A' },
    ], 1000);
    assert.equal(added1, 2);
    assert.equal(getCommunityContacts(settings).length, 2);

    const added2 = addCommunityContacts(settings, [
        { name: 'felonious', lorebookName: 'book a' }, // same person, different case
        { name: 'Felonious', lorebookName: 'Book B' },  // same name, different book -> distinct
    ], 2000);
    assert.equal(added2, 1);
    assert.equal(getCommunityContacts(settings).length, 3);
    assert.equal(getCommunityContacts(settings)[0].addedAt, 1000);
});

test('deleteCommunityContacts removes only selected name/book pairs', () => {
    const settings = { communityContacts: [
        { name: 'Felonious', lorebookName: 'Book A', addedAt: 1 },
        { name: 'Vera', lorebookName: 'Book A', addedAt: 2 },
        { name: 'Felonious', lorebookName: 'Book B', addedAt: 3 },
    ] };
    assert.equal(deleteCommunityContacts(settings, new Set(['felonious|book a', 'missing|book'])), 1);
    assert.deepEqual(getCommunityContacts(settings).map(contact => `${contact.name}|${contact.lorebookName}`), [
        'Vera|Book A',
        'Felonious|Book B',
    ]);
    assert.equal(deleteCommunityContacts(settings, new Set()), 0);
});

test('communityLorebookNames lists unique source books', () => {
    const settings = { communityContacts: [
        { name: 'A', lorebookName: 'Book A' },
        { name: 'B', lorebookName: 'Book A' },
        { name: 'C', lorebookName: 'Book B' },
    ] };
    assert.deepEqual(communityLorebookNames(settings), ['Book A', 'Book B']);
});

test('communityContactDirectoryEntry shapes a contact for the Contacts app', () => {
    const entry = communityContactDirectoryEntry({ name: 'Felonious', lorebookName: 'My Book' });
    assert.equal(entry.name, 'Felonious');
    assert.equal(entry.community, true);
    assert.equal(entry.lorebookName, 'My Book');
    assert.deepEqual(entry.tag, ['Community']);
    assert.match(entry.association, /My Book/);
});
