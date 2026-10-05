import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('host World Info keeps budgeting active while honoring WeyPhone toast suppression', async () => {
    const source = await readFile(new URL('../../../world-info.js', import.meta.url), 'utf8');
    assert.match(source, /world_info_overflow_alert\s*&&\s*!globalScanData\?\.suppressWeyPhoneOverflowAlert/);
    assert.match(source, /textToScanTokens\s*\+\s*\(await getTokenCountAsync\(newContent\)\)\)\s*>=\s*budget/);
});
