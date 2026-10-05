import test from 'node:test';
import assert from 'node:assert/strict';
import { initialBatteryLevel, batteryLevel, BATTERY_FLOOR, BATTERY_DRAIN_PER_HOUR, describeBatteryMode, trackerBatteryLevel } from '../lib/battery.js';

test('initialBatteryLevel stays in a plausible range at any hour', () => {
    for (let h = 0; h < 24; h++) {
        const level = initialBatteryLevel(new Date(2026, 6, 17, h, 30));
        assert.ok(level >= 50 && level <= 100, `hour ${h} → ${level}`);
    }
});

test('initialBatteryLevel is deterministic within a day', () => {
    const a = initialBatteryLevel(new Date(2026, 6, 17, 14, 0));
    const b = initialBatteryLevel(new Date(2026, 6, 17, 14, 0));
    assert.equal(a, b);
});

test('batteryLevel drains at the documented rate and clamps at the floor', () => {
    assert.equal(batteryLevel(80, 0), 80);
    assert.equal(batteryLevel(80, 3_600_000), 80 - BATTERY_DRAIN_PER_HOUR);
    assert.equal(batteryLevel(80, 1000 * 3_600_000), BATTERY_FLOOR);
    assert.equal(batteryLevel(150, 0), 100); // clamped high
});

test('battery settings status explains both theatrical and messages-left behavior', () => {
    assert.match(describeBatteryMode({ enabled: false }), /Theatrical.*drains 6% per hour.*12%/);
    assert.match(describeBatteryMode({ enabled: true, status: 'ready', remaining: 367, limit: 500 }), /367 of 500 messages available, shown as 73%/);
    assert.match(describeBatteryMode({ enabled: true, status: 'no-key' }), /no HelixMind tracker key/i);
    assert.match(describeBatteryMode({ enabled: true, status: 'unavailable' }), /theatrical battery/i);
});

test('messages-left battery uses the fraction remaining instead of capping the raw count', () => {
    assert.equal(trackerBatteryLevel(367, 500), 73);
    assert.equal(trackerBatteryLevel(500, 500), 100);
    assert.equal(trackerBatteryLevel(0, 500), 0);
    assert.equal(trackerBatteryLevel(650, 500), 100);
    assert.equal(trackerBatteryLevel(15, null), null);
});
