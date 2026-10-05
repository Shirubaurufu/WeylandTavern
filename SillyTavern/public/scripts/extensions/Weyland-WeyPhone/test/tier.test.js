import test from 'node:test';
import assert from 'node:assert/strict';
import { getTier, appVisibleForTier } from '../lib/tier.js';

function ctx(globals) {
    return { variables: { global: { get: key => globals[key] } } };
}

test('getTier reads PP1/PPP1 globals, string or boolean true', () => {
    assert.deepEqual(getTier(ctx({ PP1: 'true' })), { plus: true, platinum: false });
    assert.deepEqual(getTier(ctx({ PPP1: true })), { plus: false, platinum: true });
    assert.deepEqual(getTier(ctx({ PP1: 'false', PPP1: 'nope' })), { plus: false, platinum: false });
    assert.deepEqual(getTier({}), { plus: false, platinum: false });
    assert.deepEqual(getTier(null), { plus: false, platinum: false });
});

test('appVisibleForTier gating matrix', () => {
    const none = { plus: false, platinum: false };
    const plus = { plus: true, platinum: false };
    const plat = { plus: false, platinum: true };
    assert.equal(appVisibleForTier({ key: 'messages' }, none), true);
    assert.equal(appVisibleForTier({ tierGated: 'any' }, none), false);
    assert.equal(appVisibleForTier({ tierGated: 'any' }, plus), true);
    assert.equal(appVisibleForTier({ tierGated: 'any' }, plat), true);
    assert.equal(appVisibleForTier({ tierGated: 'platinum' }, plus), false);
    assert.equal(appVisibleForTier({ tierGated: 'platinum' }, plat), true);
});
