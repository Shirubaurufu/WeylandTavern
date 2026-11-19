// Foxfire's chapter flag sits at the end of the header ("~ (ONYX) (Ch 2)"). It must not cost the header its mode
// (Discord, 2026-11-19: Zisa's Bastet header lost ONYX once "(Ch 2)" followed it).
import assert from 'node:assert/strict';
import test from 'node:test';
import { formatterHarness } from './helpers/formatterHarness.js';
import { repairReplyHeader } from '../../Weyland-Formatter/private-preparation.js';

const body = '*She waves.*\n\n[Joy] [RC] [1]';

for (const [label, header, mode] of [
    ['mode then chapter', '¦¦ Friday, April 26th ~ 12:02 PM ~ The Sunstone Pavilion, Kemetic Caravan ~ (ONYX) (Ch 2) ¦¦', 'ONYX'],
    ['chapter in its own field', '¦¦ Friday, April 26th ~ 12:02 PM ~ The Sunstone Pavilion ~ (RUBY) ~ (Ch 4B) ¦¦', 'RUBY'],
    ['finished story', '¦¦ Friday, April 26th ~ 12:02 PM ~ The Sunstone Pavilion ~ (SAPH) (Fin)¦¦', 'SAPH'],
    ['no mode', '¦¦ Friday, April 26th ~ 12:02 PM ~ The Sunstone Pavilion ~ (Ch 1) ¦¦', null],
]) {
    test(`chapter flag in the header: ${label}`, async () => {
        const h = formatterHarness();
        const html = h.render(await h.format(`${header}\n\n${body}`));
        assert.match(html, /message-location">The Sunstone Pavilion/);
        assert.match(html, /<span>Friday, April 26th<\/span>/);
        assert.match(html, /<span>12:02 PM<\/span>/);
        if (mode) assert.match(html, new RegExp(`data-mode="${mode}"`));
        else assert.doesNotMatch(html, /message-mode/);
        assert.doesNotMatch(html, /\(Ch \d|\(Fin\)|darkred/);
    });
}

test('a barless header with a chapter flag is still repaired', () => {
    assert.equal(repairReplyHeader('Friday, April 26 ~ 12:02 PM ~ Pavilion ~ (ONYX) (Ch 2)\n\nText'),
        '¦¦ Friday, April 26 ~ 12:02 PM ~ Pavilion ~ (ONYX) (Ch 2) ¦¦\n\nText');
});
