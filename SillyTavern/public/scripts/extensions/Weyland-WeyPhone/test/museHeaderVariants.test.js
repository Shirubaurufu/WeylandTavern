import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseMuseHeader, museHeaderFilter } from '../../Weyland-Formatter/muse-header.js';
import { formatterHarness } from './helpers/formatterHarness.js';

const variants = JSON.parse(readFileSync(new URL('./helpers/museHeaderVariants.json', import.meta.url), 'utf8'));
for (const example of variants) {
    test(`Muse header variation: ${example.label}`, async () => {
        const h = formatterHarness();
        const formatted = await h.format(example.text);
        for (const html of [h.render(example.text), h.render(formatted)]) {
            assert.equal((html.match(/class="message-header"/g) || []).length, 1, html);
            assert.equal((html.match(/class="muse-strip/g) || []).length, 1, html);
            assert.ok(html.includes(`<div class="message-location">${example.location}</div>`), html);
            assert.ok(html.includes(`<span>${example.time}</span>`), html);
            assert.match(html, /data-mode="SAPH"/);
            assert.match(html, /class="muse-code">7717</);
            assert.match(html, /Prose here/);
            assert.doesNotMatch(html, /darkred|¦|│|\|\||CODE:|muse-day|muse-rail/i);
        }
        assert.doesNotMatch(formatted, /message-header|muse-strip/);
    });
}

test('expanded Muse syntax leaves code examples, quoted dialogue, unknown codes and conflicting fields alone', () => {
    const first = '¦¦ Wednesday, October 13, 2025 ~ 2:43 PM ¦¦';
    const location = '¦¦ Sterling Hall Dormitory, Room 271 ~ (SAPH) ¦¦';
    const code = '¦¦ (CODE: 7717) ¦¦';
    for (const raw of [
        '```\n' + variants[0].text + '\n```',
        '> ' + variants[0].text.replaceAll('\n', '\n> '),
        '"Wednesday, October 13, 2025 ~ 2:43 PM"\n' + location + '\n' + code,
        first + '\n*She checks her phone.*\n' + location + '\n' + code,
        first + '\n' + location + '\n[CODE: 9999]',
        first + '\n' + location + '\n' + code + '\n(CODE: 4997)',
        first + '\n' + location + '\n' + code + '\n¦¦ Sakurai Cafe ¦¦',
        first + '\n' + location + '\n' + code + '\n¦¦ (RUBY) ¦¦',
        first.replace('2:43 PM', '25:77') + '\n' + location + '\n' + code,
    ]) assert.equal(museHeaderFilter(raw), raw, raw);
    const duplicate = first + '\n' + location + '\n' + code + '\n' + code;
    assert.equal(parseMuseHeader(duplicate)?.code, '7717');
});

test('mode words in ordinary locations do not become badges, while explicit mode fields still do', () => {
    const h = formatterHarness();
    for (const location of ['Ruby Hall', 'Onyx Lounge', 'Saphira House', 'Sunset Marketplace']) {
        for (const mode of ['', 'SAPH', 'ONYX', 'RUBY']) {
            const html = h.html(`¦¦ Wednesday, October 13, 2025 ~ 2:43 PM ~ ${location}${mode ? ` ~ (${mode})` : ''} ¦¦`);
            assert.ok(html.includes(`<div class="message-location">${location}</div>`), html);
            if (mode) assert.ok(html.includes(`data-mode="${mode}"`), html);
            else assert.doesNotMatch(html, /message-mode/);
        }
    }
});
