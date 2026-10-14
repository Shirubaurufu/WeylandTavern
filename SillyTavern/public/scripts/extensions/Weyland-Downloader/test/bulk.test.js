import test from 'node:test';
import assert from 'node:assert/strict';

import { admitIds, diffEntryBytes, formatBytes, queueDelayMs, summarizeBulk } from '../Modules/bulk.js';

const diff = {
    characters: [
        { name: 'Vera', updatePng: true, version: 1000, subcharacters: [{ name: 'Vera', costumes: [{ name: 'Regular', expressions: [{ version: 500 }, { version: 250 }] }] }], lorebooks: [{ version: 50 }] },
        { name: 'Blake', updatePng: false, version: 900, subcharacters: [{ name: 'Blake', costumes: [{ name: 'Regular', expressions: [{ version: 300 }] }] }] },
    ],
};

test('a diff entry costs its card (only if it changes), its sprites and its lorebooks', () => {
    assert.equal(diffEntryBytes(diff.characters[0]), 1800);
    assert.equal(diffEntryBytes(diff.characters[1]), 300, 'unchanged card is not re-downloaded');
    assert.equal(diffEntryBytes(undefined), 0);
});

test('sizes read like a person wrote them', () => {
    assert.equal(formatBytes(0), '0 bytes');
    assert.equal(formatBytes(999), '999 bytes');
    assert.equal(formatBytes(12 * 1024), '12 KB');
    assert.equal(formatBytes(1.5 * 1024 * 1024), '1.5 MB');
    assert.equal(formatBytes(820 * 1024 * 1024), '820 MB');
    assert.equal(formatBytes(1.4 * 1024 ** 3), '1.4 GB');
});

test('a bulk summary splits new characters from updates and totals the download', () => {
    const summary = summarizeBulk([
        { sysName: 'Vera', name: 'Vera Oribasa', installed: false },
        { sysName: 'Blake', name: 'Blake Fuyuki', installed: true, updateAvailable: true },
    ], diff);
    assert.deepEqual(summary.fresh, ['Vera Oribasa']);
    assert.deepEqual(summary.updates, ['Blake Fuyuki']);
    assert.equal(summary.total, 2);
    assert.equal(summary.bytes, 2100);
    assert.equal(summary.sizeKnown, true);
    assert.equal(summarizeBulk([{ sysName: 'Nobody', name: 'Nobody', installed: false }], diff).sizeKnown, false);
});

test('the queue never takes a character twice', () => {
    const queued = [{ ids: ['b', 'c'] }];
    assert.deepEqual(admitIds(['a', 'b', 'd', 'a'], ['x'], queued), ['a', 'd']);
    assert.deepEqual(admitIds(['x'], ['x'], []), [], 'already downloading');
    assert.deepEqual(admitIds(['e'], null, null), ['e']);
});

test('a queued job waits out the server cooldown, and only what is left of it', () => {
    assert.equal(queueDelayMs(0, 10_000), 0);
    assert.equal(queueDelayMs(10_000, 11_000), 4300);
    assert.equal(queueDelayMs(10_000, 20_000), 0);
});
