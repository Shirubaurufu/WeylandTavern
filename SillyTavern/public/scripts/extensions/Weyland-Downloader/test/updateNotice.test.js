import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { pendingUpdates, reloadMessage, updateSignature, updatedNames } from '../Modules/updateNotice.js';

const summer = (cardSize = 1000, joySize = 500) => ({
    name: 'Summer',
    version: cardSize,
    lorebooks: [{ filename: 'Summer.json', version: 50 }],
    subcharacters: [{ name: 'Summer', costumes: [{ name: 'Regular Outfit', expressions: [{ filename: 'joy.avif', version: joySize }, { filename: 'anger.avif', version: 300 }] }] }],
});

test('the signature is stable for the same server files, whatever order they are listed in', () => {
    const reordered = summer();
    reordered.subcharacters[0].costumes[0].expressions.reverse();
    assert.equal(updateSignature(summer()), updateSignature(reordered));
});

test('the signature changes when the card or any sprite on the server changes', () => {
    const before = updateSignature(summer());
    assert.notEqual(updateSignature(summer(1001)), before, 'new card');
    assert.notEqual(updateSignature(summer(1000, 501)), before, 'new sprite');
    const extra = summer();
    extra.subcharacters[0].costumes[0].expressions.push({ filename: 'grief-4.avif', version: 700 });
    assert.notEqual(updateSignature(extra), before, 'added sprite');
});

test('only installed characters with something pending are listed, under the name players know', () => {
    const manifests = {
        remoteManifest: { characters: [summer(), { name: 'Belle', version: 900 }, { name: 'Vera', version: 800 }] },
        localManifest: { characters: [{ name: 'Summer', version: 990 }, { name: 'Vera', version: 800 }] },
        pendingDiff: { characters: [{ name: 'Summer', version: 1000 }, { name: 'Belle', version: 900 }] },
    };
    const list = pendingUpdates(manifests, sysName => (sysName === 'Summer' ? 'Summer Vortex' : sysName));
    assert.deepEqual(list, [{ sysName: 'Summer', name: 'Summer Vortex', signature: updateSignature(summer()) }]);
});

// The signature comes from the server's files, not from the difference to the player's copy, so a
// half-finished update does not look like a new one.
test('installing part of an update does not change its signature', () => {
    const remote = { characters: [summer()] };
    const local = { characters: [{ name: 'Summer', version: 990 }] };
    const whole = pendingUpdates({ remoteManifest: remote, localManifest: local, pendingDiff: { characters: [summer()] } });
    const part = pendingUpdates({ remoteManifest: remote, localManifest: local, pendingDiff: { characters: [{ name: 'Summer', version: 1000, subcharacters: [] }] } });
    assert.equal(whole[0].signature, part[0].signature);
});

test('missing or broken manifests give an empty list', () => {
    assert.deepEqual(pendingUpdates(null), []);
    assert.deepEqual(pendingUpdates({}), []);
    assert.deepEqual(pendingUpdates({ pendingDiff: { characters: 'no' } }), []);
});

test('only characters that were already installed count as updated', () => {
    const characters = [
        { id: 'summer', name: 'Summer', installed: true },
        { id: 'belle', name: 'Belle', installed: false },
        { id: 'other-0-assistant', name: 'Assistant', installed: true, other: true },
    ];
    assert.deepEqual(updatedNames(['summer', 'belle', 'other-0-assistant', 'nobody'], characters), ['Summer']);
});

test('the reload message names who was updated and never uses a long dash', () => {
    assert.match(reloadMessage(['Summer']), /^Summer was updated\./);
    assert.match(reloadMessage(['Summer', 'Belle']), /^Summer and Belle were updated\./);
    assert.match(reloadMessage(['Summer', 'Belle', 'Loona']), /^Summer, Belle and Loona were updated\./);
    assert.match(reloadMessage(['A', 'B', 'C', 'D']), /^4 characters were updated\./);
    assert.match(reloadMessage(['Summer', 'Summer']), /^Summer was updated\./);
    assert.doesNotMatch(reloadMessage(['Summer']), /—/);
});

test('the Downloader publishes after a roster check and asks for a reload when it closes after an update', async () => {
    const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
    assert.match(source, /renderDownloader\(\);\s*publishPendingUpdates\(manifests\);/);
    assert.match(source, /document\.dispatchEvent\(new CustomEvent\('weyland:character-updates', \{ detail: list \}\)\)/);
    assert.match(source, /if \(!isProcessing\) void closeDownloader\(\);/);
    assert.match(source, /updatedSinceOpen\.clear\(\);[^\n]*\n\s*const result = await Popup\.show\.confirm\(RELOAD_TITLE, reloadMessage\(names\)/);
    assert.match(source, /if \(result === POPUP_RESULT\.AFFIRMATIVE\) location\.reload\(\);/);
    assert.match(source, /if \(!outcome\.requestFailed\) alreadyInstalled\.forEach\(name => updatedSinceOpen\.add\(name\)\);/);
});
