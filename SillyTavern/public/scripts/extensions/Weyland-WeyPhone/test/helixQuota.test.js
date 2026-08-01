import test from 'node:test';
import assert from 'node:assert/strict';

import {
    fetchRemainingMessages,
    getCachedRemaining,
    getHelixKey,
    getQuotaSnapshot,
    QUOTA_ENDPOINT,
    refreshRemainingMessages,
    resetQuotaCache,
} from '../lib/helixQuota.js';
import { trackerBatteryLevel } from '../lib/battery.js';

// FFFox's backend-migration fix (integrated as delivered — see lib/helixQuota.js) replaced the
// old raw-log /v1/usage response ({ data: [...], limit: "N" }) with the quota endpoint's
// { global_rpd: { used, limit } } shape.
function quotaPayload(used, limit) {
    return { global_rpd: { used, limit } };
}

function fakeFetch(payload, ok = true) {
    return async (url, options) => {
        fakeFetch.lastUrl = url;
        fakeFetch.lastAuth = options?.headers?.Authorization;
        return { ok, json: async () => payload };
    };
}

test('fetchRemainingMessages reads used/limit from global_rpd', async () => {
    const remaining = await fetchRemainingMessages('helix-abc', fakeFetch(quotaPayload(37, 100)));
    assert.equal(remaining, 63);
    assert.equal(fakeFetch.lastUrl, QUOTA_ENDPOINT);
    assert.equal(fakeFetch.lastAuth, 'Bearer helix-abc');
});

test('fetchRemainingMessages never goes negative when usage exceeds the limit', async () => {
    assert.equal(await fetchRemainingMessages('k', fakeFetch(quotaPayload(120, 100))), 0);
});

test('fetchRemainingMessages returns null when global_rpd is missing, HTTP errors, throws, or the limit is not finite/positive', async () => {
    assert.equal(await fetchRemainingMessages('k', fakeFetch({})), null);
    assert.equal(await fetchRemainingMessages('k', fakeFetch(quotaPayload(5, 0))), null);
    assert.equal(await fetchRemainingMessages('k', fakeFetch(quotaPayload(5, null))), null);
    assert.equal(await fetchRemainingMessages('k', fakeFetch({}, false)), null);
    assert.equal(await fetchRemainingMessages('k', async () => { throw new Error('offline'); }), null);
});

test('fetchRemainingMessages aborts a stalled quota request', async () => {
    const stalledFetch = (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    assert.equal(await fetchRemainingMessages('k', stalledFetch, { timeoutMs: 5 }), null);
});

test('getHelixKey reads the HMKey global variable and rejects blanks', () => {
    const context = { variables: { global: { get: (name) => (name === 'HMKey' ? 'helix-xyz' : null) } } };
    assert.equal(getHelixKey(context), 'helix-xyz');
    assert.equal(getHelixKey({ variables: { global: { get: () => '   ' } } }), null);
    assert.equal(getHelixKey(undefined), null);
});

test('quota cache follows key changes, reports state, and clears when the key is removed', async () => {
    resetQuotaCache();
    let key = ' helix-first ';
    const context = { variables: { global: { get: () => key } } };
    let updates = 0;
    assert.deepEqual(getQuotaSnapshot(context), { status: 'idle', remaining: null, limit: null });
    await refreshRemainingMessages(context, () => updates++, {
        fetchFn: fakeFetch(quotaPayload(85, 100)),
        now: () => 1_750_000_000_000,
    });
    assert.equal(getCachedRemaining(), 15);
    assert.deepEqual(getQuotaSnapshot(context), { status: 'ready', remaining: 15, limit: 100 });

    key = 'helix-second';
    await refreshRemainingMessages(context, () => updates++, {
        fetchFn: fakeFetch(quotaPayload(3, 40)),
        now: () => 1_750_000_001_000,
    });
    assert.equal(getCachedRemaining(), 37);
    assert.equal(updates, 2);

    key = '';
    refreshRemainingMessages(context);
    assert.equal(getCachedRemaining(), null);
    assert.deepEqual(getQuotaSnapshot(context), { status: 'no-key', remaining: null, limit: null });
});

test('quota cache reports unavailable and repaints Settings after a failed lookup', async () => {
    resetQuotaCache();
    const context = { variables: { global: { get: () => 'helix-offline' } } };
    let updates = 0;
    await refreshRemainingMessages(context, () => updates++, {
        fetchFn: fakeFetch({}, false),
        now: () => 1_750_000_000_000,
    });
    assert.equal(updates, 1);
    assert.deepEqual(getQuotaSnapshot(context), { status: 'unavailable', remaining: null, limit: null });
});

test('trackerBatteryLevel maps remaining over limit to percent, capped 0-100', () => {
    assert.equal(trackerBatteryLevel(15, 100), 15);
    assert.equal(trackerBatteryLevel(250, 500), 50);
    assert.equal(trackerBatteryLevel(-3, 100), 0);
    assert.equal(trackerBatteryLevel(null, 100), null);
    assert.equal(trackerBatteryLevel(Infinity, 100), null);
});
