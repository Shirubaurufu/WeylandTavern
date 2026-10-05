import test from 'node:test';
import assert from 'node:assert/strict';
import {
    formatGenerationCooldown,
    generationAllowance,
    generationRateTier,
    mergeGenerationRateLimitEvents,
    normalizeGenerationRateLimitEvents,
    recordGenerationRequest,
} from '../lib/generationRateLimit.js';

const NOW = 2_000_000;
const event = (id, ageMs) => ({ id, timestamp: NOW - ageMs });

test('tiers select the intended rolling windows and admin bypass', () => {
    const context = values => ({ variables: { global: { get: key => values[key] } } });
    assert.equal(generationRateTier(context({})), 'standard');
    assert.equal(generationRateTier(context({ PP1: 'true' })), 'plus');
    assert.equal(generationRateTier(context({ PP1: 'true', PPP1: true })), 'platinum');
    assert.equal(generationRateTier(context({ LuckyAdminKey: true, PPP1: true })), 'admin');
});

test('standard allows two requests in fifteen minutes and blocks the third', () => {
    const events = [event('one', 4 * 60_000), event('two', 2 * 60_000)];
    const allowance = generationAllowance(events, 'standard', NOW);
    assert.equal(allowance.allowed, false);
    assert.equal(allowance.remaining, 0);
    assert.equal(allowance.retryAfterMs, 11 * 60_000);
});

test('Plus and Platinum have progressively shorter windows', () => {
    const events = [event('one', 11 * 60_000), event('two', 2 * 60_000)];
    assert.equal(generationAllowance(events, 'standard', NOW).allowed, false);
    assert.equal(generationAllowance(events, 'plus', NOW).allowed, true);
    assert.equal(generationAllowance(events, 'platinum', NOW).allowed, true);
});

test('expired events fall out of a rolling window', () => {
    const events = [event('old', 16 * 60_000), event('recent', 60_000)];
    const allowance = generationAllowance(events, 'standard', NOW);
    assert.equal(allowance.allowed, true);
    assert.equal(allowance.remaining, 1);
});

test('admin allowance is never enforced but keeps a display counter that may go negative', () => {
    const events = Array.from({ length: 20 }, (_, index) => event(String(index), 1000));
    const allowance = generationAllowance(events, 'admin', NOW);
    assert.equal(allowance.allowed, true);
    assert.equal(allowance.enforced, false);
    assert.equal(allowance.remaining, -18);
});

test('recording and merging deduplicates device event ledgers', () => {
    const actualNow = Date.now();
    const settings = { generationRateLimitEvents: [{ id: 'desktop', timestamp: actualNow - 2000 }] };
    recordGenerationRequest(settings, actualNow, 'phone');
    assert.deepEqual(settings.generationRateLimitEvents.map(item => item.id), ['desktop', 'phone']);
    const merged = mergeGenerationRateLimitEvents(
        settings.generationRateLimitEvents,
        [{ id: 'desktop', timestamp: actualNow - 2000 }, { id: 'tablet', timestamp: actualNow - 1000 }],
    );
    assert.deepEqual(merged.map(item => item.id), ['desktop', 'tablet', 'phone']);
});

test('malformed, ancient, and implausibly future events are discarded', () => {
    const normalized = normalizeGenerationRateLimitEvents([
        null,
        { id: '', timestamp: NOW },
        { id: 'ancient', timestamp: NOW - 25 * 60 * 60_000 },
        { id: 'future', timestamp: NOW + 2 * 60_000 },
        event('valid', 1000),
    ], NOW);
    assert.deepEqual(normalized, [event('valid', 1000)]);
});

test('cooldown formatter stays compact', () => {
    assert.equal(formatGenerationCooldown(500), '1s');
    assert.equal(formatGenerationCooldown(60_000), '1m');
    assert.equal(formatGenerationCooldown(61_000), '1m 1s');
});
