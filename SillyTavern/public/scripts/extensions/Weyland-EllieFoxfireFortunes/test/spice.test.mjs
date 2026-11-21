// The Spice dial (Lucky, 2026-11-19): None (0) leaves the spice line out of the request entirely, Sweet (1) is the
// default, Filthy is 4. The app's labels (parlor.js SPICE) and the request's lines must have the same number of steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFortuneMessages } from '../fortuneCore.js';

const text = spice => JSON.stringify(buildFortuneMessages({ charName: 'Belle', userName: 'Lucky', cards: [{ key: 'slow and even' }], spice }));

test('None sends no spice line', () => {
    assert.ok(!text(0).includes('Spice:'));
});

test('Sweet is the default and the steps line up', () => {
    assert.match(text(1), /Spice: sweet:/);
    assert.match(JSON.stringify(buildFortuneMessages({ charName: 'Belle', userName: 'Lucky', cards: [{ key: 'x' }] })), /Spice: sweet:/);
    assert.match(text(2), /Spice: flirty:/);
    assert.match(text(3), /Spice: steamy:/);
    assert.match(text(4), /Spice: filthy:/);
});

test('the app has five spice steps', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const app = fs.readFileSync(path.join(here, '..', 'app', 'parlor.js'), 'utf8');
    assert.match(app, /const SPICE = \['None', 'Sweet', 'Flirty', 'Steamy', 'Filthy'\]/);
});
