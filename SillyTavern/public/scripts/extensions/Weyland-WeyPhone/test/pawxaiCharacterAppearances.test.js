import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getPawXaiAppearanceCatalog,
    PAWXAI_CURATED_CHARACTER_NAMES,
    formatPawXaiAppearanceReferences,
    resolvePawXaiAppearanceReferences,
} from '../lib/pawxaiCharacterAppearances.js';

test('portable catalog export is detached and includes aliases and variants', () => {
    const catalog = getPawXaiAppearanceCatalog();
    assert.equal(catalog.length, PAWXAI_CURATED_CHARACTER_NAMES.length);
    assert.deepEqual(catalog.find(entry => entry.name === 'Yue-Lin')?.aliases, ['Yue']);
    assert.match(catalog.find(entry => entry.name === 'Vera')?.variants?.[0]?.tags ?? '', /red curled horns/);
    catalog[0].tags = 'changed outside the library';
    assert.notEqual(getPawXaiAppearanceCatalog()[0].tags, 'changed outside the library');
});

test('curated PawXai references include the supplied major-character library', () => {
    for (const name of ['Kressa', 'Vera', 'Summer', 'Miu', 'Shani', 'Professor Akiyama']) {
        assert.ok(PAWXAI_CURATED_CHARACTER_NAMES.includes(name), `${name} should have a curated reference`);
    }
    assert.ok(PAWXAI_CURATED_CHARACTER_NAMES.length >= 50);
});

test('Yue-Lin and Yue resolve to her required protogen identity tags', () => {
    for (const characterName of ['Yue-Lin', 'Yue']) {
        const reference = formatPawXaiAppearanceReferences({ characterName, message: `${characterName} looks over.` });
        assert.match(reference, /\[Yue-Lin\]/);
        assert.match(reference, /protogenv2/);
        assert.match(reference, /maroon_red_fur/);
        assert.match(reference, /grey chest_plate/);
        assert.match(reference, /no pupils/);
        assert.match(reference, /digitigrade legs/);
        assert.match(reference, /paws/);
    }
});

test('Loona resolves to her required Helluva Boss hellhound identity tags', () => {
    const reference = formatPawXaiAppearanceReferences({
        characterName: 'Loona',
        message: 'Loona looks over her shoulder.',
    });
    assert.match(reference, /\[Loona\]/);
    assert.match(reference, /loona_\(helluva_boss\)/);
    assert.match(reference, /hellhound/);
    assert.match(reference, /silver hair/);
    assert.match(reference, /white fur/);
    assert.match(reference, /long snout/);
    assert.match(reference, /red sclera/);
    assert.match(reference, /digitigrade legs/);
    assert.match(reference, /paws/);
    assert.match(reference, /adult NSFW anatomy; use only when visibly exposed in the shot/);
    assert.match(reference, /grey nipples, grey pussy/);
});

test('appearance resolver injects only characters matched in the current scene', () => {
    const matches = resolvePawXaiAppearanceReferences({
        characterName: 'Kressa',
        message: 'Kressa adjusts her glasses while Summer waves from the doorway.',
        contextMessages: [
            { role: 'user', name: 'Lucky', message: 'Is Summer here?' },
            { role: 'character', name: 'Kressa', message: 'She just arrived.' },
        ],
    });
    assert.deepEqual(matches.map(match => match.name), ['Kressa', 'Summer']);
    assert.doesNotMatch(formatPawXaiAppearanceReferences({
        characterName: 'Kressa',
        message: 'She adjusts her glasses.',
    }), /\[Vera\]|\[Summer\]|\[Miu\]/);
});

test('weighted difficult traits survive while the retired age tag does not', () => {
    const vera = formatPawXaiAppearanceReferences({ characterName: 'Vera', message: 'Vera smiles.' });
    assert.match(vera, /\(red inner hair:1\.5\)/);
    assert.match(vera, /\(red curled horns:1\.5\)/);
    assert.match(vera, /\(messy hair:1\.5\)/);
    assert.doesNotMatch(vera, /aged up/i);
});

test('a partial name does not accidentally match a longer character name', () => {
    assert.deepEqual(
        resolvePawXaiAppearanceReferences({ characterName: 'Gemini', message: 'Gemini looks over.' })
            .map(match => match.name),
        ['Gemini'],
    );
});
