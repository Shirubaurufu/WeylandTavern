import test from 'node:test';
import assert from 'node:assert/strict';

import {
    fetchRemainingMessages,
    fetchMessageQuota,
    getCachedRemaining,
    getHelixKey,
    getQuotaSnapshot,
    QUOTA_ENDPOINT,
    refreshRemainingMessages,
    resetQuotaCache,
} from '../lib/helixQuota.js';
import { trackerBatteryLevel } from '../lib/battery.js';

// Match the local proxy's normalized response, not either retired provider response.
// The proxy clamps over-limit usage and leaves remaining null if usage is unknown.
function quotaPayload(used, limit) {
    return { used, limit, remaining: typeof used === 'number' && typeof limit === 'number' ? Math.max(0, limit - used) : null };
}

function fakeFetch(payload, ok = true) {
    return async (url, options) => {
        fakeFetch.lastUrl = url;
        fakeFetch.lastKey = options?.headers?.['X-Helix-Key'];
        fakeFetch.lastCache = options?.cache;
        return { ok, json: async () => payload };
    };
}

test('fetchRemainingMessages reads the normalized local proxy response', async () => {
    const remaining = await fetchRemainingMessages('helix-abc', fakeFetch(quotaPayload(37, 100)));
    assert.equal(remaining, 63);
    assert.equal(fakeFetch.lastUrl, QUOTA_ENDPOINT);
    assert.equal(fakeFetch.lastKey, 'helix-abc');
    assert.equal(fakeFetch.lastCache, 'no-store');
});

test('fetchRemainingMessages never goes negative when usage exceeds the limit', async () => {
    assert.equal(await fetchRemainingMessages('k', fakeFetch(quotaPayload(120, 100))), 0);
});

test('fetchRemainingMessages returns null for missing quota, HTTP errors, throws, or invalid limits', async () => {
    assert.equal(await fetchRemainingMessages('k', fakeFetch({})), null);
    assert.equal(await fetchRemainingMessages('k', fakeFetch(quotaPayload(5, 0))), null);
    assert.equal(await fetchRemainingMessages('k', fakeFetch(quotaPayload(5, null))), null);
    assert.equal(await fetchRemainingMessages('k', fakeFetch({}, false)), null);
    assert.equal(await fetchRemainingMessages('k', async () => { throw new Error('offline'); }), null);
});

test('unknown and malformed quota fields stay unavailable while numeric zero remains valid', async () => {
    for (const value of [null, undefined, '', false, NaN, Infinity, '5']) {
        assert.equal(await fetchMessageQuota('k', fakeFetch({ limit: 100, remaining: value })), null);
        assert.equal(await fetchMessageQuota('k', fakeFetch({ limit: value, remaining: 5 })), null);
    }
    assert.deepEqual(await fetchMessageQuota('k', fakeFetch({ limit: 100, remaining: 0 })), { limit: 100, remaining: 0 });
    assert.equal(await fetchRemainingMessages('k', fakeFetch({ limit: 100, remaining: -20 })), 0);
});

test('a quota completion repaint sees ready or unavailable, never a finished request as loading', async () => {
    for (const [payload, expected] of [[quotaPayload(85, 100), 'ready'], [{}, 'unavailable']]) {
        resetQuotaCache();
        const context = { variables: { global: { get: () => 'k' } } };
        let duringRepaint;
        await refreshRemainingMessages(context, () => { duringRepaint = getQuotaSnapshot(context); }, {
            fetchFn: fakeFetch(payload), now: () => 1000,
        });
        assert.equal(duringRepaint.status, expected);
    }
});

test('old quota requests cannot replace a newer result after switching away and back to a key', async () => {
    for (const replacement of ['other-key', '']) {
        resetQuotaCache();
        let key = 'first-key', updates = 0;
        const context = { variables: { global: { get: () => key } } };
        const pending = [];
        const options = {
            fetchFn: async () => new Promise(resolve => pending.push(resolve)), now: () => 1000,
        };
        const notify = () => updates++;
        const old = refreshRemainingMessages(context, notify, options);
        key = replacement;
        const other = refreshRemainingMessages(context, notify, options);
        key = 'first-key';
        const current = refreshRemainingMessages(context, notify, options);
        const calls = pending.length;
        // Resolve newest first. Drain every request even if the assertion will fail.
        pending.at(-1)({ ok: true, json: async () => quotaPayload(40, 100) });
        await current;
        for (const finish of pending.slice(0, -1)) finish({ ok: true, json: async () => quotaPayload(95, 100) });
        await Promise.all([old, other]);
        assert.equal(calls, replacement ? 3 : 2, 'returning to a key must start a fresh lookup');
        assert.equal(getCachedRemaining(), 60);
        assert.equal(updates, 1, 'only the newest lookup repaints');
        assert.deepEqual(getQuotaSnapshot(context), { status: 'ready', remaining: 60, limit: 100 });
    }
});

test('quota refreshes coalesce while pending and remain throttled after completion', async () => {
    resetQuotaCache();
    const context = { variables: { global: { get: () => 'k' } } };
    let finish, calls = 0;
    const options = { now: () => 1000, fetchFn: async () => { calls++; return new Promise(resolve => { finish = resolve; }); } };
    const first = refreshRemainingMessages(context, undefined, options);
    refreshRemainingMessages(context, undefined, options);
    assert.equal(getQuotaSnapshot(context).status, 'loading');
    finish({ ok: true, json: async () => quotaPayload(15, 100) });
    await first;
    refreshRemainingMessages(context, undefined, options);
    assert.equal(calls, 1);
    assert.equal(getQuotaSnapshot(context).status, 'ready');
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
