import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeInstalledContacts } from '../lib/installedContacts.js';
import { canonicalCharacterName, characterNamesEquivalent, displayCharacterName, findInstalledCharacterName } from '../lib/characterIdentity.js';

const directoryEntry = name => ({
    name, gender: '', age: '', birthday: '', height: '', species: '', summary: '', occupation: '',
    home: '', association: '', handle: '', tag: [], description: '', image: '',
});

test('installed-only character cards appear as local contacts without changing the shared directory', () => {
    const directory = [directoryEntry('Summer Rose')];
    const cards = [
        { name: 'Summer', avatar: 'summer.png' },
        { name: 'Chaska', avatar: 'chaska.png' },
    ];
    const result = mergeInstalledContacts(
        directory,
        cards,
        (_type, avatar) => `/thumb/${avatar}`,
        name => name === 'Summer Rose' ? 'Summer' : null,
    );

    assert.deepEqual(directory, [directoryEntry('Summer Rose')]);
    assert.equal(result.length, 2);
    assert.equal(result[0].name, 'Summer Rose');
    assert.equal(result[0].localPortraitUrl, '/thumb/summer.png');
    assert.deepEqual(result[1], {
        ...directoryEntry('Chaska'),
        summary: 'Installed character card',
        tag: ['Installed'],
        localPortraitUrl: '/thumb/chaska.png',
        installedOnly: true,
    });
});

test('installed contacts are deduplicated case-insensitively and tolerate missing avatars', () => {
    const result = mergeInstalledContacts([], [
        { name: 'Chaska', avatar: '' },
        { name: 'chaska', avatar: 'duplicate.png' },
    ], () => '/unused', () => null);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Chaska');
    assert.equal(result[0].localPortraitUrl, null);
});

test('decorated Unicode card names resolve and display as their plain identity', () => {
    const decorated = 'Ṇ̶̰̼͘a̶͍̅́̒r̵̓̏̉̈́ā̸͒̔̄';
    assert.equal(canonicalCharacterName(decorated), 'nara');
    assert.equal(displayCharacterName(decorated), 'Nara');
    assert.equal(findInstalledCharacterName([{ name: decorated }], 'Nara'), decorated);

    const result = mergeInstalledContacts([], [{ name: decorated, avatar: `${decorated}.png` }], () => '/nara', () => null);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Nara');
    assert.equal(result[0].localPortraitUrl, '/nara');
});

test('Dash and Dakota Ash (Dash) resolve as one installed contact', () => {
    assert.equal(characterNamesEquivalent('Dash', 'Dakota Ash (Dash)'), true);
    assert.equal(findInstalledCharacterName([{ name: 'Dash', avatar: 'dash.png' }], 'Dakota Ash (Dash)'), 'Dash');

    const result = mergeInstalledContacts(
        [directoryEntry('Dakota Ash (Dash)')],
        [{ name: 'Dash', avatar: 'dash.png' }],
        (_type, avatar) => `/thumb/${avatar}`,
        name => findInstalledCharacterName([{ name: 'Dash', avatar: 'dash.png' }], name),
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Dakota Ash (Dash)');
    assert.equal(result[0].localPortraitUrl, '/thumb/dash.png');
});

test('Professor Akiyama and Sayori Akiyama resolve as one installed contact', () => {
    const cards = [{ name: 'Professor Akiyama', avatar: 'akiyama.png' }];
    assert.equal(characterNamesEquivalent('Professor Akiyama', 'Sayori Akiyama'), true);
    assert.equal(findInstalledCharacterName(cards, 'Sayori Akiyama'), 'Professor Akiyama');

    const result = mergeInstalledContacts(
        [directoryEntry('Sayori Akiyama')],
        cards,
        (_type, avatar) => `/thumb/${avatar}`,
        name => findInstalledCharacterName(cards, name),
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Sayori Akiyama');
    assert.equal(result[0].localPortraitUrl, '/thumb/akiyama.png');
});

test('Cerberus Sisters supplies shared personality without becoming a contact or replacing sister portraits', () => {
    const cards = [{ name: 'Cerberus Sisters', avatar: 'cerberus.png' }];
    for (const sister of ['Astrid', 'Fawne', 'Neshe']) {
        assert.equal(findInstalledCharacterName(cards, sister), 'Cerberus Sisters');
    }

    const directory = ['Astrid', 'Fawne', 'Neshe'].map(directoryEntry);
    const result = mergeInstalledContacts(
        directory,
        cards,
        (_type, avatar) => `/thumb/${avatar}`,
        name => findInstalledCharacterName(cards, name),
    );
    assert.deepEqual(result.map(entry => entry.name), ['Astrid', 'Fawne', 'Neshe']);
    assert.equal(result.every(entry => entry.localPortraitUrl === undefined), true);
});

test('combo and system cards are not appended as installed-only contacts', () => {
    const cards = ['Blake & Serra', 'Cerberus Sisters', 'Weybot', 'Mirror Weyland', 'Kinsbane']
        .map(name => ({ name, avatar: `${name}.png` }));
    assert.deepEqual(mergeInstalledContacts([], cards, () => '/thumb', () => null), []);
});
