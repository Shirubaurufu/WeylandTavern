import test from 'node:test';
import assert from 'node:assert/strict';

import { findRegistrarBookNames, loadRegistrarLorebooks, parseRegistrarLorebook, REGISTRAR_APP_BOOK_NAME, registrarRosterEntry, sampleRegistrarRoster, syncRegistrarAutoContacts } from '../lib/registrarLorebook.js';
import { buildPortraitMap } from '../lib/portraits.js';

const sampleBook = {
    entries: {
        5000: {
            comment: 'Character Roster',
            constant: true,
            content: `[CHARACTER ROSTER - FRESHMAN YEAR]
Hye-jun: (Draconid, Black and Blonde, Aloof and Distant, Male, Username: @SandyDunes, {{getvar:MCY1}}, Major: Business Administration, Hyejun's Student Apartment)
Ann: (Kitsune, red, angry, Female, Username: @BurningRed, {{getvar:NonStudent}}, Angye Estate)
[END CHARACTER ROSTER]`,
        },
        5241: { comment: 'Hye-jun', key: ['!Hye-jun'], content: '[Hye-jun INFO]\nFull Hye-jun profile' },
        5242: { comment: 'Hye-jun Backstory/History', key: ['!Hye-jun'], content: 'Supporting history' },
        5271: { comment: 'Ann', key: ['!Ann'], content: '[Ann INFO]\nFull Ann profile' },
    },
};

test('Registrar book detection only selects imported books whose names identify the Registrar', () => {
    assert.deepEqual(findRegistrarBookNames(['Weyland', 'Lore Book - Weyland Registrar', 'Personal Notes', 'Registrar Friends']), [
        'Lore Book - Weyland Registrar',
        'Registrar Friends',
    ]);
});

test('Registrar roster parsing creates contact records backed by exact subbot profiles', () => {
    const contacts = parseRegistrarLorebook(sampleBook, 'Weyland Registrar');
    assert.equal(contacts.length, 2);
    assert.deepEqual(contacts[0], {
        name: 'Hye-jun', gender: 'Male', age: '', birthday: '', height: '', species: 'Draconid',
        summary: 'Aloof and Distant', occupation: 'Business Administration', home: "Hyejun's Student Apartment",
        association: 'Weyland Registrar', handle: '@SandyDunes', tag: ['Registrar'], description: 'Aloof and Distant',
        image: '', registrar: true, lorebookName: 'Weyland Registrar', profileText: '[Hye-jun INFO]\nFull Hye-jun profile',
    });
    assert.equal(contacts[1].profileText, '[Ann INFO]\nFull Ann profile');
});

test('loading Registrar lorebooks aggregates only the locally imported selections', async () => {
    const calls = [];
    const result = await loadRegistrarLorebooks({
        worldNames: ['Weyland', 'Weyland Registrar'],
        loadWorldInfo: async name => { calls.push(name); return sampleBook; },
    });
    assert.deepEqual(calls, ['Weyland Registrar']);
    assert.equal(result.books.size, 1);
    assert.equal(result.contacts.length, 2);
});

test('multiple imported Registrar books load concurrently', async () => {
    let active = 0;
    let maxActive = 0;
    await loadRegistrarLorebooks({
        worldNames: ['Registrar One', 'Registrar Two', 'Registrar Three'],
        loadWorldInfo: async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise(resolve => setTimeout(resolve, 5));
            active--;
            return sampleBook;
        },
    });
    assert.ok(maxActive >= 2);
});

test('Registrar social roster sampling is bounded, non-mutating, and carries profile grounding', () => {
    const roster = parseRegistrarLorebook(sampleBook).map(registrarRosterEntry);
    const sampled = sampleRegistrarRoster(roster, 1, () => 0);
    assert.equal(sampled.length, 1);
    assert.equal(roster.length, 2);
    assert.equal(sampled[0].handle, '@SandyDunes');
    assert.match(sampled[0].profileText, /Full Hye-jun profile/);
});

test('in-app Registrar imports carry their Registrar portrait (AKA after the comma is ignored)', () => {
    const book = { ...sampleBook, registrar: { records: [
        { name: 'Hye-jun, Hyejun', portrait: 'https://imagedelivery.net/x/hyejun/public' },
        { name: 'Ann', portrait: 'https://imagedelivery.net/x/ann/public', deletedAt: '2026-01-01' },
    ] } };
    const contacts = parseRegistrarLorebook(book, REGISTRAR_APP_BOOK_NAME);
    assert.equal(contacts.find(c => c.name === 'Hye-jun').image, 'https://imagedelivery.net/x/hyejun/public');
    assert.equal(contacts.find(c => c.name === 'Ann').image, '', 'a deleted record contributes no portrait');
    // Manually downloaded books have no records, so nothing changes for them.
    assert.equal(parseRegistrarLorebook(sampleBook, 'Lore Book - Weyland Registrar')[0].image, '');
});

test('in-app Registrar imports become contacts once, stay deleted, and leave when unloaded', () => {
    const imported = name => ({ name, lorebookName: REGISTRAR_APP_BOOK_NAME, profileText: `[${name} INFO]` });
    const settings = { communityContacts: [] };

    assert.equal(syncRegistrarAutoContacts(settings, [imported('Patsy'), imported('Callie')]), true);
    assert.deepEqual(settings.communityContacts.map(c => c.name), ['Patsy', 'Callie']);
    assert.equal(syncRegistrarAutoContacts(settings, [imported('Patsy'), imported('Callie')]), false, 'no-op when nothing changed');

    // The user deletes Callie from Contacts: she must not come back while still imported.
    settings.communityContacts = settings.communityContacts.filter(c => c.name !== 'Callie');
    syncRegistrarAutoContacts(settings, [imported('Patsy'), imported('Callie')]);
    assert.deepEqual(settings.communityContacts.map(c => c.name), ['Patsy']);

    // Patsy is unloaded/removed in the Registrar app: her contact goes, and re-loading re-adds her.
    syncRegistrarAutoContacts(settings, [imported('Callie')]);
    assert.deepEqual(settings.communityContacts.map(c => c.name), []);
    syncRegistrarAutoContacts(settings, [imported('Patsy'), imported('Callie')]);
    assert.deepEqual(settings.communityContacts.map(c => c.name), ['Patsy']);

    // Manually downloaded Registrar books and profile-less entries are never auto-added.
    syncRegistrarAutoContacts(settings, [{ name: 'Ann', lorebookName: 'Lore Book - Weyland Registrar', profileText: 'x' }, { name: 'Ghost', lorebookName: REGISTRAR_APP_BOOK_NAME, profileText: '' }]);
    assert.ok(!settings.communityContacts.some(c => c.name === 'Ann' || c.name === 'Ghost'));
});

test('a Registrar portrait override replaces only the weybooru guess, keeping the fallbacks', () => {
    const map = buildPortraitMap([], ['Patsy', 'Lucy'], () => 'local.png', { Patsy: 'https://imagedelivery.net/x/patsy/public' });
    assert.equal(map.Patsy.primaryUrl, 'https://imagedelivery.net/x/patsy/public');
    assert.ok(map.Patsy.placeholderUrl);
    assert.match(map.Lucy.primaryUrl, /cast\.weybooru\.com\/images\/portraits\/lucy\.jpg$/);
});
