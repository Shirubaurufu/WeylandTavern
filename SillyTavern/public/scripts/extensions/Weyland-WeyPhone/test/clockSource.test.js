import test from 'node:test';
import assert from 'node:assert/strict';
import { getSettings, reconcileClockSource } from '../lib/config.js';

// The phone's displayed time (ui.rpClockEnabled) and the Clock app's Time source
// (ui.clockDefaultTimeMode) are one switch in the UI. These pin down which side wins when old
// saves disagree, so the status bar and the Clock app can never show different times again.

test('an explicit status-bar choice wins and the Clock default follows it', () => {
    const off = { rpClockEnabled: false, clockDefaultTimeMode: 'rp' };
    reconcileClockSource(off);
    assert.deepEqual(off, { rpClockEnabled: false, clockDefaultTimeMode: 'real' });

    const on = { rpClockEnabled: true, clockDefaultTimeMode: 'real' };
    reconcileClockSource(on);
    assert.deepEqual(on, { rpClockEnabled: true, clockDefaultTimeMode: 'rp' });
});

test('with no status-bar choice saved, the Clock default decides', () => {
    const real = { clockDefaultTimeMode: 'real' };
    reconcileClockSource(real);
    assert.deepEqual(real, { rpClockEnabled: false, clockDefaultTimeMode: 'real' });
});

test('a fresh phone defaults to roleplay time on both', () => {
    const ui = {};
    reconcileClockSource(ui);
    assert.deepEqual(ui, { rpClockEnabled: true, clockDefaultTimeMode: 'rp' });
});

test('getSettings reconciles an old save on load', () => {
    const extensionSettings = { WeyPhone: { conversations: {}, ui: { rpClockEnabled: false, clockDefaultTimeMode: 'rp' } } };
    const settings = getSettings(extensionSettings);
    assert.equal(settings.ui.rpClockEnabled, false);
    assert.equal(settings.ui.clockDefaultTimeMode, 'real');
});

test('reconcileClockSource ignores a missing ui object', () => {
    assert.doesNotThrow(() => reconcileClockSource(undefined));
    assert.doesNotThrow(() => reconcileClockSource(null));
});
