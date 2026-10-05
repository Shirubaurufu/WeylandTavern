import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPortraitMap, buildPsaPortraitMap } from '../lib/portraits.js';
import { DEFAULT_PLACEHOLDER_PORTRAITS, placeholderPortraitUrl } from '../lib/placeholderPortraits.js';

function fakeGetThumbnailUrl(type, file) {
    return `/thumbnail?type=${type}&file=${file}`;
}

test('buildPortraitMap resolves both a weybooru primary URL and a local fallback for a known character', () => {
    const characters = [{ name: 'Blake', avatar: 'blake.png' }];
    const getThumbnailUrl = (type, file) => `/thumbnail/${type}/${file}`;
    const map = buildPortraitMap(characters, ['Blake'], getThumbnailUrl);
    assert.equal(map.Blake.primaryUrl, 'https://cast.weybooru.com/images/portraits/blake.jpg');
    assert.equal(map.Blake.fallbackUrl, '/thumbnail/avatar/blake.png');
    assert.ok(DEFAULT_PLACEHOLDER_PORTRAITS.includes(map.Blake.placeholderUrl));
    assert.equal(map.Blake.initial, null);
});

test('buildPortraitMap lowercases a single-word name correctly for the weybooru URL', () => {
    const characters = [{ name: 'Kris', avatar: 'kris.png' }];
    const getThumbnailUrl = (type, file) => `/thumbnail/${type}/${file}`;
    const map = buildPortraitMap(characters, ['Kris'], getThumbnailUrl);
    assert.equal(map.Kris.primaryUrl, 'https://cast.weybooru.com/images/portraits/kris.jpg');
});

test('buildPortraitMap still attempts a weybooru URL for a name with no local character match and carries a bundled placeholder', () => {
    const map = buildPortraitMap([], ['Ghost'], () => '/x');
    assert.equal(map.Ghost.primaryUrl, 'https://cast.weybooru.com/images/portraits/ghost.jpg');
    assert.equal(map.Ghost.fallbackUrl, null);
    assert.equal(map.Ghost.placeholderUrl, placeholderPortraitUrl('Ghost'));
    assert.equal(map.Ghost.initial, null);
});

test('buildPortraitMap resolves a weybooru URL for a real platform roster name even with no matching local character card installed', () => {
    // Regression test: Fasti/Gem/Lyris are real Weyland roster characters whose weybooru portraits
    // load fine, but none has a standalone local SillyTavern character card under that exact name
    // (Gem's local card is filed as "Gemini"; Fasti and Lyris have no standalone card at all,
    // Lyris only exists inside a combined "Lyris & Vesper" card) — previously this meant no
    // portrait was ever attempted for them at all, a real bug fixed by decoupling the weybooru
    // attempt from local-character-lookup success.
    const characters = [{ name: 'Rosa', avatar: 'rosa.png' }];
    const map = buildPortraitMap(characters, ['Fasti', 'Gem', 'Lyris'], fakeGetThumbnailUrl);
    assert.equal(map.Fasti.primaryUrl, 'https://cast.weybooru.com/images/portraits/fasti.jpg');
    assert.equal(map.Fasti.fallbackUrl, null);
    assert.equal(map.Gem.primaryUrl, 'https://cast.weybooru.com/images/portraits/gem.jpg');
    assert.equal(map.Lyris.primaryUrl, 'https://cast.weybooru.com/images/portraits/lyris.jpg');
});

test('buildPortraitMap carries a deterministic placeholder when the character cannot be found locally', () => {
    const characters = [{ name: 'Rosa', avatar: 'rosa.png' }];
    const map = buildPortraitMap(characters, ['Deleted Character'], fakeGetThumbnailUrl);
    assert.deepEqual(map['Deleted Character'], {
        primaryUrl: 'https://cast.weybooru.com/images/portraits/deleted.jpg',
        fallbackUrl: null,
        placeholderUrl: placeholderPortraitUrl('Deleted Character'),
        initial: null,
    });
});

test('buildPortraitMap uses only the first word of a multi-word name for the weybooru URL, lowercased', () => {
    // Weybooru portrait filenames are lowercase first names only — a multi-word character like
    // "Kinsbane Manor" has its portrait filed under "kinsbane.jpg", not the full name.
    const map = buildPortraitMap([], ['Kinsbane Manor', 'Mirror Weyland'], fakeGetThumbnailUrl);
    assert.equal(map['Kinsbane Manor'].primaryUrl, 'https://cast.weybooru.com/images/portraits/kinsbane.jpg');
    assert.equal(map['Mirror Weyland'].primaryUrl, 'https://cast.weybooru.com/images/portraits/mirror.jpg');
});

test('buildPortraitMap resolves multiple char names independently', () => {
    const characters = [{ name: 'Rosa', avatar: 'rosa.png' }, { name: 'Ava', avatar: 'ava.png' }];
    const map = buildPortraitMap(characters, ['Rosa', 'Ava'], fakeGetThumbnailUrl);
    assert.equal(map.Rosa.primaryUrl, 'https://cast.weybooru.com/images/portraits/rosa.jpg');
    assert.equal(map.Rosa.fallbackUrl, '/thumbnail?type=avatar&file=rosa.png');
    assert.equal(map.Ava.primaryUrl, 'https://cast.weybooru.com/images/portraits/ava.jpg');
    assert.equal(map.Ava.fallbackUrl, '/thumbnail?type=avatar&file=ava.png');
});

test('buildPortraitMap deduplicates repeated char names without extra work', () => {
    const characters = [{ name: 'Rosa', avatar: 'rosa.png' }];
    const map = buildPortraitMap(characters, ['Rosa', 'Rosa', 'Rosa'], fakeGetThumbnailUrl);
    assert.equal(Object.keys(map).length, 1);
});

test('buildPortraitMap returns an empty map for an empty charNames list', () => {
    assert.deepEqual(buildPortraitMap([{ name: 'Rosa', avatar: 'rosa.png' }], [], fakeGetThumbnailUrl), {});
});

test('buildPortraitMap does not throw on an undefined charName and falls back to an empty initial', () => {
    const map = buildPortraitMap([{ name: 'Rosa', avatar: 'rosa.png' }], [undefined], fakeGetThumbnailUrl);
    assert.deepEqual(map[undefined], { primaryUrl: null, fallbackUrl: null, placeholderUrl: null, initial: '' });
});

test('placeholderPortraitUrl uses only the three selected demi-human portraits and remains stable', () => {
    assert.equal(DEFAULT_PLACEHOLDER_PORTRAITS.length, 3);
    assert.deepEqual(DEFAULT_PLACEHOLDER_PORTRAITS.map(url => url.split('/').pop()), [
        'generic-wolfgirl.webp',
        'generic-bunnygirl.webp',
        'generic-foxgirl.webp',
    ]);
    assert.equal(placeholderPortraitUrl('Zora Adeyemi'), placeholderPortraitUrl('Zora Adeyemi'));
    assert.ok(DEFAULT_PLACEHOLDER_PORTRAITS.includes(placeholderPortraitUrl('Chaska')));
});

test('buildPsaPortraitMap resolves a bundled local asset keyed by portraitKey, not a derived slug', () => {
    const accounts = [
        { name: 'Weyland Alert', portraitKey: 'alert' },
        { name: 'Weyland Research Center', portraitKey: 'research' },
    ];
    const map = buildPsaPortraitMap(accounts);
    assert.equal(map['Weyland Alert'].primaryUrl, '/scripts/extensions/Weyland-WeyPhone/assets/profiles/profile_alert.webp');
    assert.equal(map['Weyland Research Center'].primaryUrl, '/scripts/extensions/Weyland-WeyPhone/assets/profiles/profile_research.webp');
});

test('buildPsaPortraitMap never sets a fallbackUrl (local assets don\'t need a CDN-failure fallback) and derives initial from the account name', () => {
    const map = buildPsaPortraitMap([{ name: 'Kodo Bowl', portraitKey: 'kodo' }]);
    assert.equal(map['Kodo Bowl'].fallbackUrl, null);
    assert.ok(DEFAULT_PLACEHOLDER_PORTRAITS.includes(map['Kodo Bowl'].placeholderUrl));
    assert.equal(map['Kodo Bowl'].initial, 'K');
});

test('buildPsaPortraitMap accepts an explicit portrait URL for a character-operated business account', () => {
    const portraitUrl = 'https://cast.weybooru.com/images/portraits/zora.jpg';
    const map = buildPsaPortraitMap([{ name: "Mama's Den", portraitKey: 'mamas-den', portraitUrl }]);
    assert.equal(map["Mama's Den"].primaryUrl, portraitUrl);
    assert.ok(DEFAULT_PLACEHOLDER_PORTRAITS.includes(map["Mama's Den"].placeholderUrl));
});
