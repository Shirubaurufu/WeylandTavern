import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as tally from '../public/scripts/extensions/WT-HelixUsage/usageTally.js';

const now = 1800000000000;
const store = (used, count, ts = now - 1000) => ({ version: tally.TALLY_VERSION, lastUsed: used, tallies: Array(count).fill(ts) });

test('legacy phantom 178 is discarded when backend reports 11', () => {
    const fixed = tally.reconcileTally({ lastUsed: 11, tallies: Array(178).fill(now) }, 11, now);
    assert.equal(fixed.tallies.length, 0);
    assert.equal(fixed.changed, true);
});
test('inconsistent new-format history is also cleared', () => {
    assert.equal(tally.reconcileTally(store(11, 178), 11, now).tallies.length, 0);
});
test('expiry cannot manufacture another day of requests', () => {
    const fixed = tally.reconcileTally(store(178, 178), 11, now);
    assert.equal(tally.reconcileTally(fixed, 11, now + tally.WINDOW_MS).tallies.length, 0);
    // `used` is a rolling 24h count: if all 11 known requests aged out and it still reads 11, then
    // 11 new ones were sent. Counting them (capped at `used`) is correct; the 2026-09-23 rule
    // that recorded nothing here is what left daily users permanently "unknown".
    const rolled = tally.reconcileTally(store(11, 11, now - tally.WINDOW_MS), 11, now);
    assert.equal(rolled.tallies.length, 11);
    assert.ok(rolled.tallies.every(ts => ts === now));
});

// A steady user: one message an hour, HelixMind's count rolling over 24h, observed after each.
function simulate(hours, usedAt, observeEvery = 1) {
    const H = tally.HOUR_MS; const sent = []; let s = tally.emptyTally(); const out = [];
    for (let h = 0; h < hours; h++) {
        sent.push(h * H + 60000);
        if (h % observeEvery) continue;
        const t = h * H + 61000;
        s = tally.reconcileTally(s, usedAt(sent, t), t);
        out.push({ h, used: usedAt(sent, t), known: s.tallies.length });
    }
    return out;
}
const rolling = (sent, t) => sent.filter(x => x > t - tally.WINDOW_MS).length;

test('a daily user keeps their timings across age-outs instead of going blind', () => {
    const run = simulate(96, rolling);
    const end = run[run.length - 1];
    assert.equal(end.used, 24);
    assert.ok(end.known >= 23, `expected 23+ of 24 timed, got ${end.known}`);   // only the first-ever message predates the baseline
    for (const r of run) assert.ok(r.known <= r.used);
});

test('a skewed or lagging count never runs away (the old "1AM - 57" bug)', () => {
    const lag = (sent, t) => sent.filter(x => x > t - tally.WINDOW_MS - 10 * 60000).length;    // HelixMind drops 10 min late
    const long = (sent, t) => sent.filter(x => x > t - 25 * tally.HOUR_MS).length;              // or counts 25h
    const daily = (sent, t) => sent.filter(x => Math.floor(x / tally.WINDOW_MS) === Math.floor(t / tally.WINDOW_MS)).length;
    for (const model of [lag, long, daily]) {
        for (const r of simulate(96, model)) assert.ok(r.known <= r.used, `${r.known} timed > ${r.used} used at h${r.h}`);
    }
});

test('a count flipping between two keys stays capped at the real count', () => {
    let s = tally.emptyTally(); let most = 0;
    for (let i = 0; i < 48; i++) {
        s = tally.reconcileTally(s, i % 2 ? 45 : 20, now + i * tally.HOUR_MS);
        most = Math.max(most, s.tallies.length);
    }
    assert.ok(most <= 45, `showed ${most} returning`);
});

test('a small clock-skew excess is trimmed (oldest first), not wiped', () => {
    const s = { version: tally.TALLY_VERSION, lastUsed: 11, tallies: [now - 5000, now - 4000, now - 3000, ...Array(9).fill(now - 1000)] };
    const r = tally.reconcileTally(s, 11, now);
    assert.equal(r.tallies.length, 11);
    assert.ok(!r.tallies.includes(now - 5000), 'the oldest timestamp is the one trimmed');
    assert.equal(r.changed, true);
});
test('counts grow only by observed increases and steady polls are idempotent', () => {
    const a = tally.reconcileTally(store(10, 2), 11, now);
    assert.equal(a.tallies.length, 3);
    assert.equal(tally.reconcileTally(a, 11, now).changed, false);
    assert.equal(tally.reconcileTally(a, 0, now).tallies.length, 0);
});
test('invalid counts, future dates, and exact 24-hour boundary are not attributed', () => {
    for (const used of [null, NaN, -1, 1.5, Infinity]) {
        assert.equal(tally.reconcileTally(store(11, 11), used, now).tallies.length, 0);
    }
    const dates = [now + 1, now - tally.WINDOW_MS, NaN, now];
    assert.equal(tally.bucketByHour(dates, now)[0].count, 1);
    assert.equal(tally.oldestTallyMs(dates, now), now);
});
test('arbitrary usage sequences never promise more returns than used', () => {
    let s = tally.emptyTally();
    for (let i = 0; i < 2000; i++) {
        const used = (i * 173) % 501;
        s = tally.reconcileTally(s, used, now + i * 100000);
        assert.ok(s.tallies.length <= used);
    }
});

function harness() {
    const elements = new Map();
    const el = id => {
        if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', style: {} });
        return elements.get(id);
    };
    const pending = [];
    const settings = {};
    let key = 'helix-test';
    const source = readFileSync(new URL('../public/scripts/extensions/WT-HelixUsage/helix_usage.js', import.meta.url), 'utf8')
        .replace(/^import .*;\r?\n/gm, '');
    const context = vm.createContext({
        ...tally, Date, console: { error() {} }, jQuery() {},
        saveSettingsDebounced() {}, clearInterval() {}, setInterval() { return 1; },
        SillyTavern: { getContext: () => ({ variables: { global: { get: () => key } }, extensionSettings: settings }) },
        fetch: () => new Promise(resolve => pending.push(data => resolve({ ok: true, json: async () => data }))),
    });
    vm.runInContext(source + '\nglobalThis.run = refreshUsage; globalThis.attach = el => { trackerEl = el; };', context);
    context.attach({ querySelector: el });
    return { context, pending, settings, el, changeKey: value => { key = value; } };
}
test('UI rejects failed lookup instead of recording zero; effective key changes reset history', async () => {
    const h = harness();
    const poll = async data => { const p = h.context.run(); h.pending.shift()(data); await p; };
    await poll({ used: 10, limit: 500, usageKeyId: 'a' });
    await poll({ used: 11, limit: 500, usageKeyId: 'a' });
    assert.equal(h.settings['WT-HelixUsage'].tally.tallies.length, 1);
    await poll({ used: null, limit: 500, usageKeyId: 'a' });
    assert.equal(h.settings['WT-HelixUsage'].tally.lastUsed, 11);
    assert.equal(h.el('#hm-api-breakdown').style.display, 'none');
    await poll({ used: 11, limit: 500, usageKeyId: 'b' });
    assert.equal(h.settings['WT-HelixUsage'].tally.tallies.length, 0);
    assert.match(h.el('#hm-api-breakdown-list').innerHTML, /unknown for 11 messages/);
});
test('out-of-order responses cannot roll usage backward', async () => {
    const h = harness();
    const first = h.context.run();
    const second = h.context.run();
    h.pending[1]({ used: 11, limit: 500, usageKeyId: 'a' });
    await second;
    h.pending[0]({ used: 178, limit: 500, usageKeyId: 'a' });
    await first;
    assert.equal(h.el('#hm-api-messages-used-text').textContent, '489 / 500');
    assert.equal(h.settings['WT-HelixUsage'].tally.lastUsed, 11);
});
test('at cap without known timestamps, display unknown rather than ready', async () => {
    const h = harness();
    const p = h.context.run();
    h.pending.shift()({ used: 500, limit: 500, usageKeyId: 'a' });
    await p;
    assert.equal(h.el('#hm-api-next-message-time-text').textContent, 'Return time unknown');
});
