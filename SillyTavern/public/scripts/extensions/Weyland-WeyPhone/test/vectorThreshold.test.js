import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { moveVectorThresholdOnce, VECTOR_THRESHOLD_DEFAULT, VECTOR_THRESHOLD_OLD_DEFAULT } from '../../weyland-network/vectorThreshold.js';

// Weyland's Vector Storage threshold went from 0.5 to 0.45 (2026-11). Existing installs move once, and only from the old
// shipped value; a player's own number is never touched, and nothing repeats after the first run.

const context = vectors => {
    let saves = 0;
    return { extensionSettings: vectors === undefined ? {} : { vectors }, saveSettingsDebounced: () => { saves++; }, saves: () => saves };
};

test('an install still on the old shipped 0.5 moves to 0.45, once', () => {
    const ctx = context({ score_threshold: VECTOR_THRESHOLD_OLD_DEFAULT, max_entries: 7 });
    assert.equal(moveVectorThresholdOnce(ctx), true);
    assert.equal(ctx.extensionSettings.vectors.score_threshold, VECTOR_THRESHOLD_DEFAULT);
    assert.equal(ctx.extensionSettings.vectors.max_entries, 7);
    assert.equal(ctx.saves(), 1);
    // A player who sets 0.5 again afterwards keeps it
    ctx.extensionSettings.vectors.score_threshold = 0.5;
    assert.equal(moveVectorThresholdOnce(ctx), false);
    assert.equal(ctx.extensionSettings.vectors.score_threshold, 0.5);
});

test('a threshold the player picked is left alone, and the marker still sticks', () => {
    for (const own of [0.4, 0.25, 0.6, 0.45]) {
        const ctx = context({ score_threshold: own });
        assert.equal(moveVectorThresholdOnce(ctx), false, String(own));
        assert.equal(ctx.extensionSettings.vectors.score_threshold, own);
        assert.equal(ctx.saves(), 1, 'marker saved so it never runs again');
        assert.equal(moveVectorThresholdOnce(ctx), false);
    }
});

test('no Vector Storage settings yet: nothing to move, no crash', () => {
    const ctx = context(undefined);
    assert.equal(moveVectorThresholdOnce(ctx), false);
    assert.equal(ctx.extensionSettings.vectors, undefined);
});

test('new installs are seeded with 0.45', async () => {
    const shipped = JSON.parse(await readFile(new URL('../../../../../default/content/settings.json', import.meta.url), 'utf8'));
    assert.equal(shipped.extension_settings.vectors.score_threshold, VECTOR_THRESHOLD_DEFAULT);
});
