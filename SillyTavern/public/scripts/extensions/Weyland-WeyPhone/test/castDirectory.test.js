import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCastWikiMarkup, parseCastData, getCastEntries, refreshCastDirectory, linkCastToRoster, searchCast, castPortraitUrl, CAST_CACHE_TTL_MS } from '../lib/castDirectory.js';
import { CAST_SNAPSHOT } from '../lib/castSnapshot.js';

const SAMPLE_JSON = {
    values: [
        ['meta', 'verified'],
        ['character', {
            'Rivera Stark': {
                name: 'Rivera Stark', gender: 'Female', age: 23, birthday: 'August 29th',
                height: "5' 7\"", species: 'Kitsune', summary: 'Queen Bee', occupation: 'Business Major',
                home: '[[Sterling Hall]], Room 282', association: '', handle: '',
                tag: 'Student, Antagonist', description: 'Starting at [[Weyland:Weyland University]] and visiting [[Sakurai Cafe]].', image: 'rivera',
            },
            'Blake Fuyuki': {
                name: 'Blake Fuyuki', gender: 'Male', age: 21, birthday: '', height: '',
                species: 'Human', summary: 'Resident hacker', occupation: 'CS Major',
                home: '', association: '', handle: '@codewolf', tag: 'Student',
                description: '', image: '',
            },
        }],
        ['tag', {}],
    ],
};

test('parseCastData normalizes entries, splits tags, strips wiki brackets', () => {
    const entries = parseCastData(SAMPLE_JSON);
    assert.equal(entries.length, 2);
    const rivera = entries.find(e => e.name === 'Rivera Stark');
    assert.deepEqual(rivera.tag, ['Student', 'Antagonist']);
    assert.equal(rivera.home, 'Sterling Hall, Room 282');
    assert.equal(rivera.description, 'Starting at Weyland University and visiting Sakurai Cafe.');
    assert.equal(castPortraitUrl(rivera), 'https://cast.weybooru.com/images/portraits/rivera.jpg');
    const blake = entries.find(e => e.name === 'Blake Fuyuki');
    assert.equal(castPortraitUrl(blake), null); // no image slug
});

test('cleanCastWikiMarkup uses a namespaced link label and unwraps plain links', () => {
    assert.equal(cleanCastWikiMarkup("The [[hellhound:Hellhound]] at [[Sakurai Cafe]]."), 'The Hellhound at Sakurai Cafe.');
    assert.equal(cleanCastWikiMarkup('Visit [[BBB|Black Barrel Bar]].'), 'Visit Black Barrel Bar.');
});

test('parseCastData is tolerant of malformed payloads', () => {
    for (const bad of [null, {}, { values: 'nope' }, { values: [['character', null]] }, { values: [] }]) {
        assert.deepEqual(parseCastData(bad), []);
    }
});

test('the committed snapshot is a real, populated directory', () => {
    assert.ok(CAST_SNAPSHOT.length >= 80, `snapshot has ${CAST_SNAPSHOT.length} entries`);
    const rivera = CAST_SNAPSHOT.find(e => /rivera/i.test(e.name));
    assert.ok(rivera, 'Rivera present');
    assert.ok(Array.isArray(rivera.tag));
});

test('getCastEntries serves fresh cache without fetching', () => {
    let fetched = false;
    const settings = { castDirectory: { fetchedAt: Date.now(), entries: [{ name: 'Cached', tag: [], image: '' }] } };
    const entries = getCastEntries(settings, { fetchImpl: () => { fetched = true; return Promise.reject(new Error('x')); } });
    assert.equal(entries[0].name, 'Cached');
    assert.equal(fetched, false);
});

test('getCastEntries serves stale cache immediately but kicks off a refresh', async () => {
    let fetched = false;
    const settings = {
        castDirectory: { fetchedAt: Date.now() - CAST_CACHE_TTL_MS - 1000, entries: [{ name: 'Stale', tag: [], image: '' }] },
    };
    const fetchImpl = async () => { fetched = true; return { ok: true, json: async () => SAMPLE_JSON }; };
    const entries = getCastEntries(settings, { fetchImpl });
    assert.equal(entries[0].name, 'Stale'); // synchronous render from stale copy
    await new Promise(r => setTimeout(r, 10));
    assert.equal(fetched, true);
    assert.equal(settings.castDirectory.entries.length, 2); // refresh landed
});

test('getCastEntries falls back to the snapshot when there is no cache at all', () => {
    const settings = { castDirectory: null };
    const entries = getCastEntries(settings, { fetchImpl: () => Promise.reject(new Error('offline')) });
    assert.notEqual(entries, CAST_SNAPSHOT);
    assert.equal(entries.length, CAST_SNAPSHOT.length);
    assert.equal(entries.find(entry => entry.name === 'Aiko')?.description.includes('[['), false);
});

test('refreshCastDirectory swallows failures and leaves the cache untouched', async () => {
    const settings = { castDirectory: null };
    const updated = await refreshCastDirectory(settings, async () => ({ ok: false, status: 500 }));
    assert.equal(updated, false);
    assert.equal(settings.castDirectory, null);
});

test('refreshCastDirectory aborts a stalled network request', async () => {
    const settings = { castDirectory: null };
    const stalledFetch = (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    const updated = await refreshCastDirectory(settings, stalledFetch, { timeoutMs: 5 });
    assert.equal(updated, false);
    assert.equal(settings.castDirectory, null);
});

test('linkCastToRoster matches by full name, unique first name, and handle', () => {
    const cast = parseCastData(SAMPLE_JSON);
    const roster = [
        { name: 'Rivera', handle: '@rivstark' },       // first-name match
        { name: 'Blake Fuyuki', handle: '@codewolf' }, // full-name match
        { name: 'Nobody', handle: '@ghost' },          // no match
    ];
    const map = linkCastToRoster(cast, roster);
    assert.equal(map.get('Rivera').name, 'Rivera Stark');
    assert.equal(map.get('Blake Fuyuki').name, 'Blake Fuyuki');
    assert.equal(map.has('Nobody'), false);
});

test('searchCast filters across name, species, occupation, tags', () => {
    const cast = parseCastData(SAMPLE_JSON);
    assert.equal(searchCast(cast, 'kitsune').length, 1);
    assert.equal(searchCast(cast, 'ANTAGONIST')[0].name, 'Rivera Stark');
    assert.equal(searchCast(cast, 'cs major')[0].name, 'Blake Fuyuki');
    assert.equal(searchCast(cast, '').length, 2);
    assert.equal(searchCast(cast, 'zzz').length, 0);
});

test('Aethel is excluded from parsed cast data and the snapshot', () => {
    const withAethel = {
        values: [['character', {
            'Aethel': { name: 'Aethel', tag: '', image: 'aethel' },
            'Rosa': { name: 'Rosa', tag: '', image: 'rosa' },
        }]],
    };
    const entries = parseCastData(withAethel);
    assert.deepEqual(entries.map(e => e.name), ['Rosa']);
    assert.ok(!CAST_SNAPSHOT.some(e => e.name === 'Aethel'), 'snapshot is Aethel-free');
});
