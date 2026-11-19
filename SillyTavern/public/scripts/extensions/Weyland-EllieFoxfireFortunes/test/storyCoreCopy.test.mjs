// Foxfire ships without Muse's Story Machine (Lucky, 2026-11-18), so it carries copies of Muse's storyCore.js and
// of the chat helpers from Muse's index.js. While both folders exist (the admin tree), the copies must match.
// On an install without Muse the comparisons are skipped; the "no Muse imports" check always runs.
// Run: node --test test/storyCoreCopy.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FOX = path.resolve(HERE, '..');
const MUSE = path.resolve(FOX, '..', 'Weyland-MuseStoryMachine');
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const hasMuse = fs.existsSync(path.join(MUSE, 'storyCore.js'));

test('nothing in Foxfire imports from Muse (it is not on players\' installs)', () => {
    for (const file of ['index.js', 'fortuneCore.js', 'chatContext.js', 'storyCore.js']) {
        const imports = read(path.join(FOX, file)).match(/^\s*(?:import|\}\s*from)[^\n]*$/gm) ?? [];
        assert.ok(!imports.some(line => line.includes('MuseStoryMachine')), `${file} imports from Muse`);
    }
});

// SillyTavern refuses to load an extension whose manifest names a missing one ("Missing required extensions"),
// and the manifest still listed Muse after the code stopped needing it (Fox caught it on 2026-11-18).
test('the manifest does not require Muse (or anything a player may not have)', () => {
    const manifest = JSON.parse(read(path.join(FOX, 'manifest.json')));
    for (const key of ['dependencies', 'requires']) {
        assert.ok(!(manifest[key] ?? []).some(x => /Muse/i.test(x)), `${key} names Muse`);
    }
    assert.deepEqual(manifest.dependencies, ['Weyland-WeyPhone']);
});

test('storyCore.js is Muse\'s, byte for byte, under its header note', { skip: !hasMuse && 'Muse is not installed' }, () => {
    const copy = read(path.join(FOX, 'storyCore.js'));
    const body = copy.slice(copy.indexOf('\n//\n') + 4);
    assert.equal(body, read(path.join(MUSE, 'storyCore.js')));
});

test('the chat helpers match Muse\'s', { skip: !hasMuse && 'Muse is not installed' }, () => {
    const muse = read(path.join(MUSE, 'index.js'));
    const mine = read(path.join(FOX, 'chatContext.js'));
    // Each function body, from its name to the closing brace at column 0. loreText differs only in where the
    // character's name comes from (status().charName in Muse, charName() here).
    const fn = (src, name) => src.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n\\}\\n`))?.[0];
    for (const name of ['hasOpenChat', 'oocModeOn', 'currentCharacter', 'cardText', 'personalityText', 'recentChat', 'rosterPairs', 'subbotText', 'currentHeader']) {
        assert.ok(fn(muse, name), `Muse has ${name}`);
        assert.equal(fn(mine, name), fn(muse, name), name);
    }
    const lore = s => fn(s, 'loreText').replaceAll('status().charName', 'charName()').replace('[Muse Story Machine]', '[Foxfire Fortunes]');
    assert.equal(lore(mine), lore(muse));
});
