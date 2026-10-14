// The Dorm Layouts directory (public/scripts/dorm-directory*.js) reads the Character Info site's data
// and Weylandpedia's dorm.md. These pin the parsing and search players rely on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    ROOM_POSITIONS, firstName, matchesQuery, ordinal, parseDormMarkdown, parseResidents, parseSterlingRoom, plainText,
} from '../../../dorm-directory-data.js';

const cast = {
    values: [
        ['bot', {}],
        ['character', {
            vera: { name: 'Vera Oribasa', home: '[[Sterling Hall]], Room 292', image: 'vera', summary: 'Draconid Princess' },
            fasti: { name: 'Fasti', home: '[[Sterling Hall]], Room 292', image: 'fasti' },
            dash: { name: 'Dakota Ash (Dash)', home: '[[Sterling Hall]], Room 281', image: 'dash' },
            sam: { name: 'Sam Gentry', home: '[[Sterling Hall]], Room 277 1/2', image: '' },
            ellie: { name: 'Ellie Tomoryu', home: { name: '[[Sterling Hall]], Room 109' }, image: 'ellie' },
            bastet: { name: 'Bastet', home: '[[Kemetic Caravan]]; Sunstone Pavilion', image: 'bastet' },
            gem: { name: 'Gemini Kovács', home: 'Gemini’s Apartment (above the [[BBB:Black Barrel Bar]])', image: 'gemini' },
            nobody: { name: 'Nameless', home: '' },
        }],
    ],
};

test('Sterling Hall rooms parse to room, floor and plan key; other homes do not', () => {
    assert.deepEqual(parseSterlingRoom('[[Sterling Hall]], Room 292'), { room: '292', floor: 2, key: '92' });
    assert.deepEqual(parseSterlingRoom('[[Sterling Hall]], Room 277 1/2'), { room: '277½', floor: 2, key: '77' });
    assert.deepEqual(parseSterlingRoom({ name: 'Sterling Hall, Room 109' }), { room: '109', floor: 1, key: '09' });
    assert.equal(parseSterlingRoom('[[Kemetic Caravan]]; Sunstone Pavilion'), null);
    assert.equal(plainText('above the [[BBB:Black Barrel Bar]]'), 'above the Black Barrel Bar');
});

test('residents get roommates, nicknames and photos; everyone else lives elsewhere', () => {
    const { residents, elsewhere } = parseResidents(cast);
    assert.deepEqual(residents.map(r => r.room), ['109', '277½', '281', '292', '292']);
    const vera = residents.find(r => r.name === 'Vera Oribasa');
    assert.deepEqual(vera.roommates, ['Fasti']);
    assert.equal(vera.image, 'https://cast.weybooru.com/images/photos/vera.webp');
    assert.equal(residents.find(r => r.room === '281').first, 'Dash', 'the nickname is the name people use');
    assert.equal(residents.find(r => r.name === 'Sam Gentry').image, '', 'no photo yet: drawn as an initial');
    assert.deepEqual(elsewhere.map(p => p.name), ['Bastet', 'Gemini Kovács'], 'a character with no home is left out');
    assert.equal(elsewhere[1].home, 'Gemini’s Apartment (above the Black Barrel Bar)');
});

test('search finds names, nicknames, rooms, roommates and where people live', () => {
    const { residents, elsewhere } = parseResidents(cast);
    const find = q => residents.filter(r => matchesQuery(r, q)).map(r => r.first);
    assert.deepEqual(find('vera'), ['Fasti', 'Vera'], 'Fasti shares Vera\'s room');
    assert.deepEqual(find('dash'), ['Dash']);
    assert.deepEqual(find('292'), ['Fasti', 'Vera']);
    assert.deepEqual(find('ORIBASA'), ['Vera']);
    assert.deepEqual(find('vera fasti'), ['Fasti', 'Vera'], 'every word must match');
    assert.equal(find('').length, residents.length);
    assert.deepEqual(elsewhere.filter(p => matchesQuery(p, 'caravan')).map(p => p.name), ['Bastet']);
});

test('dorm.md becomes one entry per floor, in order', () => {
    const md = `# Sterling Hall Dormitory 1st Floor
<div class="dorm-layout">
    <img src="https://x/floor-1.png" alt="Floor 1">
</div>

# Sterling Hall Dormitory 2nd Floor

<img src='https://x/floor-2.png'>

# Notes without an image

# Rooftop
![roof](https://x/roof.png)`;
    assert.deepEqual(parseDormMarkdown(md), [
        { floor: 1, title: 'Sterling Hall Dormitory 1st Floor', image: 'https://x/floor-1.png' },
        { floor: 2, title: 'Sterling Hall Dormitory 2nd Floor', image: 'https://x/floor-2.png' },
        { floor: 3, title: 'Rooftop', image: 'https://x/roof.png' },
    ]);
    assert.deepEqual(parseDormMarkdown(''), []);
});

test('every room on the plan has a pin position inside the image', () => {
    // 67-83 west, 02-17 east, 18/16/14 courtyard, 19-29 and 84-94 the south corridors.
    const expected = ['02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '23', '25', '27', '29',
        '67', '68', '69', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '80', '81', '82', '83', '84', '86', '88', '90', '92', '94'];
    assert.deepEqual(Object.keys(ROOM_POSITIONS).sort(), expected.sort());
    for (const [room, [x, y]] of Object.entries(ROOM_POSITIONS)) {
        assert.ok(x > 0 && x < 100 && y > 0 && y < 100, `room ${room} off the plan`);
    }
});

test('the home screen opens the directory, and keeps the old page as its fallback', () => {
    const welcome = readFileSync(new URL('../../../welcomeinfo.js', import.meta.url), 'utf8');
    assert.match(welcome, /renderDormDirectory\(dormSection\)\.catch/);
    assert.match(welcome, /fetchAndRenderMarkdown\('dorm'\)/);
    const panel = readFileSync(new URL('../../../templates/welcomePanel.html', import.meta.url), 'utf8');
    assert.equal((panel.match(/Chat Help/g) || []).length, 0, 'buttons and heading both say Chat Commands');
    assert.equal((panel.match(/Chat Commands/g) || []).length, 3);
});

test('small helpers', () => {
    assert.equal(firstName('Vera Oribasa'), 'Vera');
    assert.equal(firstName('Dakota Ash (Dash)'), 'Dash');
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st']);
});
