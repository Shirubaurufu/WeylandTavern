import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    executeCharacterRemoval, forgetInRecord, isPlainName, listOtherCards, planCharacterRemoval,
} from '../src/weyland-character-removal.js';

// A tiny roster shaped like the real manifests: "Blake & Serra" shares both sprite folders with the
// solo cards, which is exactly the case a removal must not get wrong.
const sprite = (sub, costume, ...files) => ({ name: sub, costumes: [{ name: costume, expressions: files.map(filename => ({ filename, version: 10 })) }] });
const remote = {
    characters: [
        { name: 'Blake', version: 100, subcharacters: [sprite('Blake', 'Regular', 'joy.avif', 'anger.avif')], lorebooks: [{ filename: 'Blake.json', version: 5 }] },
        { name: 'Serra', version: 100, subcharacters: [sprite('Serra', 'Regular', 'joy.avif')] },
        { name: 'Blake & Serra', version: 100, subcharacters: [sprite('Blake', 'Regular', 'joy.avif'), sprite('Serra', 'Regular', 'joy.avif')], lorebooks: [{ filename: 'Blake.json', version: 5 }] },
        { name: 'Vera', version: 100, subcharacters: [sprite('Vera', 'Regular', 'joy.avif'), sprite('Vera', 'Swimsuit', 'joy.avif')], lorebooks: [{ filename: 'Vera Lore.json', version: 5 }] },
    ],
};
const installed = (...names) => ({ characters: remote.characters.filter(c => names.includes(c.name)).map(c => structuredClone(c)) });

test('removing a solo character takes its card, sprites and lorebook', () => {
    const plan = planCharacterRemoval({ name: 'vera', remoteManifest: remote, localManifest: installed('Vera', 'Blake') });
    assert.equal(plan.card, 'Vera.png', 'uses the manifest spelling, not the request casing');
    assert.deepEqual(plan.expressions.map(e => `${e.sub}/${e.costume}/${e.filename}`).sort(), ['Vera/Regular/joy.avif', 'Vera/Swimsuit/joy.avif']);
    assert.deepEqual(plan.lorebooks, ['Vera Lore.json']);
    assert.deepEqual(plan.sharedSubs, []);
    // Costume folders are pruned before the subcharacter folder that holds them.
    assert.ok(plan.folders.findIndex(f => f.costume) < plan.folders.findIndex(f => !f.costume));
});

test('a pair card never strips sprites or lore an installed solo card still uses', () => {
    const plan = planCharacterRemoval({ name: 'Blake & Serra', remoteManifest: remote, localManifest: installed('Blake', 'Blake & Serra') });
    assert.deepEqual(plan.expressions.map(e => e.sub), ['Serra'], 'Blake is installed on its own, Serra is not');
    assert.deepEqual(plan.sharedSubs, ['Blake']);
    assert.deepEqual(plan.lorebooks, []);
    assert.deepEqual(plan.sharedLorebooks, ['Blake.json']);
});

test('a character listed in the record but no longer installed does not protect shared files', () => {
    const local = installed('Blake', 'Blake & Serra');
    local.characters.find(c => c.name === 'Blake').version = null; // card deleted earlier
    const plan = planCharacterRemoval({ name: 'Blake & Serra', remoteManifest: remote, localManifest: local });
    assert.deepEqual(plan.sharedSubs, []);
    assert.deepEqual(plan.lorebooks, ['Blake.json']);
});

test('names that could escape the characters folder are refused', () => {
    for (const bad of ['', '.', '..', '../settings', 'a/b', 'a\\b']) assert.equal(isPlainName(bad), false, bad);
    assert.equal(isPlainName('Blake & Serra'), true);
    assert.throws(() => planCharacterRemoval({ name: '../x', remoteManifest: remote, localManifest: installed() }));
    const evil = { characters: [{ name: 'Evil', version: 1, subcharacters: [sprite('..', 'Regular', 'joy.avif'), sprite('Evil', '..', 'x.avif')], lorebooks: [{ filename: '../settings.json' }] }] };
    const plan = planCharacterRemoval({ name: 'Evil', remoteManifest: evil, localManifest: evil });
    assert.deepEqual(plan.expressions, []);
    assert.deepEqual(plan.lorebooks, []);
});

test('cards outside the roster are listed for removal; roster and record cards are not', () => {
    const files = ['Blake.png', 'default_Assistant.png', 'Old Friend.png', 'Vera', 'notes.txt', 'Serra.PNG'];
    const record = { characters: [{ name: 'Old Friend', version: 3, subcharacters: [] }] };
    assert.deepEqual(listOtherCards(files, remote, record), ['default_Assistant']);
});

test('forgetting a character drops it from the record (case-insensitive)', () => {
    const local = installed('Vera', 'Blake');
    assert.equal(forgetInRecord(local, 'VERA'), true);
    assert.deepEqual(local.characters.map(c => c.name), ['Blake']);
    assert.equal(forgetInRecord(local, 'Nobody'), false);
});

test('executing a plan deletes exactly the planned files and keeps hand-added ones', async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'weyland-removal-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const characters = path.join(root, 'characters');
    const worlds = path.join(root, 'worlds');
    const put = (file) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'x'); };
    put(path.join(characters, 'Vera.png'));
    put(path.join(characters, 'Vera', 'Regular', 'joy.avif'));
    put(path.join(characters, 'Vera', 'Swimsuit', 'joy.avif'));
    put(path.join(characters, 'Vera', 'Swimsuit', 'my-own-edit.avif')); // added by the player
    put(path.join(worlds, 'Vera Lore.json'));
    put(path.join(characters, 'Blake.png'));

    const invalidated = [];
    const plan = planCharacterRemoval({ name: 'Vera', remoteManifest: remote, localManifest: installed('Vera', 'Blake') });
    const result = await executeCharacterRemoval(plan, { charactersPath: characters, worldsPath: worlds, invalidateThumbnail: f => invalidated.push(f) });

    assert.equal(result.removed, 4);
    assert.deepEqual(result.problems, []);
    assert.deepEqual(invalidated, ['Vera.png']);
    assert.equal(fs.existsSync(path.join(characters, 'Vera.png')), false);
    assert.equal(fs.existsSync(path.join(characters, 'Vera', 'Regular')), false, 'emptied costume folder is pruned');
    assert.equal(fs.existsSync(path.join(characters, 'Vera', 'Swimsuit', 'my-own-edit.avif')), true, 'hand-added file survives');
    assert.equal(fs.existsSync(path.join(worlds, 'Vera Lore.json')), false);
    assert.equal(fs.existsSync(path.join(characters, 'Blake.png')), true, 'other characters untouched');

    // Running it again is harmless: missing files are not problems.
    const again = await executeCharacterRemoval(plan, { charactersPath: characters, worldsPath: worlds });
    assert.deepEqual(again, { removed: 0, problems: [] });
});

test('the endpoint is wired: rate-limited route, record update and roster listing', () => {
    const source = fs.readFileSync(new URL('../src/endpoints/weyland.js', import.meta.url), 'utf8');
    assert.match(source, /router\.post\('\/remove-character'/);
    assert.match(source, /'remove-character': \{ lastCall: 0, cooldown: \d+ \}/);
    assert.match(source, /forgetInRecord\(localManifest, plan\.name\)/);
    assert.match(source, /otherCards \}\);/);
    // A deleted card no longer reads as installed after a normal "Check for Updates".
    assert.match(source, /localChar\?\.version != null && await sizeOnDisk\(pngPath\) === null/);
});
