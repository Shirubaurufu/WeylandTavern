import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMuseHeader, museHeaderFilter, renderMuseStrip } from '../../Weyland-Formatter/muse-header.js';
import { formatterHarness } from './helpers/formatterHarness.js';

// Headers only, with generic prose: these fixtures carry no chat dialogue or user settings.
const shapes = JSON.parse(readFileSync(new URL('./helpers/museHeaderShapes.json', import.meta.url), 'utf8'));
const header = (lines, first = '¦¦ Sunday, Oct 10th ~ 9:41 AM ~ Observation Room ¦¦') => `${first}\n${lines}\n\n*Prose here.*`;
const morning = header('¦¦ MUSE EXPERIMENT: DAY 4/14 ¦¦\n¦¦ (CODE: 5814) ¦¦\n¦¦ Collar Status: [Active] ¦¦');

test('76 modern real header variants render once, preserve prose, and consume all extra header lines', () => {
    let accepted = 0;
    for (const shape of shapes) {
        const parsed = parseMuseHeader(shape);
        const result = museHeaderFilter(shape);
        if (!parsed) {
            assert.equal(result, shape, 'legacy and single-line formats keep their existing renderer');
            continue;
        }
        accepted++;
        assert.equal((result.match(/class="muse-strip/g) || []).length, 1);
        const outsideStrip = result.replace(/<div class="muse-strip[^\n]*\n/g, '');
        assert.doesNotMatch(outsideStrip, /MUSE EXPERIMENT|Collar Status|Evening Scene|\(Code:? ?\d{3,5}\)/i);
        assert.ok(result.includes('*Prose here.*'));
    }
    assert.equal(accepted, 76);
    assert.equal(shapes.length - accepted, 5);
});

test('real Formatter paragraph pass, converter, and dialogue formatting preserve every accepted header', async () => {
    const harness = formatterHarness();
    for (const shape of shapes.filter(s => parseMuseHeader(s))) {
        const formatted = await harness.format(shape + '\n\n[Smile] [NK] [1]');
        const html = harness.html(formatted);
        assert.equal((html.match(/class="muse-strip/g) || []).length, 1, shape);
        assert.equal((html.match(/class="message-header/g) || []).length, 1, shape);
        assert.match(html, /Prose here/);
        assert.doesNotMatch(html.replace(/<div class="muse-strip[^\n]*\n/g, ''), /MUSE EXPERIMENT|Collar Status|Evening Scene:/i);
        assert.doesNotMatch(html, /class=<q>/i);
        assert.doesNotMatch(formatted, /muse-strip|muse-rail/, 'HTML stays out of stored messages and prompts');
    }
});

test('day, collar status and code are rendered in the requested order with 28 progress ticks', () => {
    const rendered = renderMuseStrip(parseMuseHeader(morning));
    assert.ok(rendered.indexOf('muse-day') < rendered.indexOf('muse-collar'));
    assert.ok(rendered.indexOf('muse-collar') < rendered.indexOf('muse-code'));
    assert.match(rendered, /class="muse-lbl">Collar status:<\/span>/);
    assert.equal((rendered.match(/class="muse-cell"/g) || []).length, 14);
    assert.equal((rendered.match(/class="muse-done"/g) || []).length, 3);
    assert.equal((rendered.match(/class="muse-done-eve"/g) || []).length, 3);
    assert.equal((rendered.match(/class="muse-now"/g) || []).length, 1);
    assert.doesNotMatch(rendered, /muse-pin/);
});

test('evening tag takes priority over morning code and clock; evening tick and crescent are active', () => {
    const text = morning.replace('Collar Status: [Active]', 'Evening Scene: ACTIVE (Day 4)');
    const p = parseMuseHeader(text);
    assert.equal(p.evening, true);
    const rendered = renderMuseStrip(p);
    assert.match(rendered, /Evening scene/);
    assert.doesNotMatch(rendered, /muse-lbl|muse-tm/);
    assert.match(rendered, /<i class="muse-done"><\/i><i class="muse-now"><\/i><i class="muse-pin"/);
});

test('scripted evening/morning codes take priority over the clock; clock is the last fallback', () => {
    for (const code of ['6182', '3273', '7494', '9505', '6836']) {
        assert.equal(parseMuseHeader(morning.replace('5814', code)).evening, true);
    }
    for (const code of ['4402', '9033', '5814', '2265', '1752']) {
        assert.equal(parseMuseHeader(morning.replace('5814', code).replace('9:41 AM', '7:41 PM')).evening, false);
    }
    for (const [time, evening] of [['7:41 PM', true], ['12:00 AM', true], ['12:00 PM', false], ['9:41 AM', false]]) {
        assert.equal(parseMuseHeader(morning.replace('¦¦ (CODE: 5814) ¦¦\n', '').replace('9:41 AM', time)).evening, evening);
    }
});

test('missing day line collapses tracker without guessing the story day or showing removed collar state', () => {
    const text = header('¦¦ Dorm Room (271) ~ (Code: 7718) ¦¦\n¦¦ Collar Status: N/A ¦¦', '¦¦ Thursday, Oct 14 ~ 08:17 AM ~ (SAPH) ¦¦');
    const p = parseMuseHeader(text);
    assert.equal(p.day, null);
    const result = museHeaderFilter(text);
    assert.match(result, /muse-collapsed/);
    assert.doesNotMatch(result, /muse-day|muse-rail|muse-collar|N\/A/);
    assert.match(result, /08:17 AM ~ Dorm Room \(271\) ~ \(SAPH\)/);
    assert.match(museHeaderFilter(morning.replace('DAY 4/14', 'DAY 7/14')), /muse-rail/, 'a model-written day remains authoritative');
});

test('lorebook date/time combined line renders standard header during evenings and after the breach', () => {
    const harness = formatterHarness();
    const text = header("¦¦ MUSE EXPERIMENT: DAY 4/14 ¦¦\n¦¦ Muse's Habitat ~ (Code: 7494) ¦¦\n¦¦ Evening Scene: ACTIVE (Day 4) ¦¦", "¦¦ Sunday, Oct 10 7:41 PM ~ Muse's Habitat ¦¦");
    const html = harness.html(text);
    assert.match(html, /class="message-header"/);
    assert.match(html, /<span>Sunday, Oct 10<\/span>/);
    assert.match(html, /<span>7:41 PM<\/span>/);
});

test('all supported collar states and countdown remain available, including typo code and empty state', () => {
    for (const state of ['Active', 'Inactive', 'Monitoring Only', 'Malfunctioning']) {
        const p = parseMuseHeader(morning.replace('5814', '402').replace('[Active]', `[${state}] ~ ENRICHMENT: 09:33`));
        assert.equal(p.collar, state);
        assert.equal(p.timer, '09:33');
        assert.equal(p.code, '402');
    }
    assert.equal(parseMuseHeader(morning.replace('[Active]', 'N/A')).collar, null);
});

test('non-Muse prose, unknown codes, code blocks, and long lore pages pass through unchanged', () => {
    const normal = '¦¦ Friday, Oct 8 ~ 9:00 AM ~ Campus ¦¦\n\n*She mentions Collar Status in conversation.*';
    for (const text of [normal, header('¦¦ (Code: 9999) ¦¦'), `\`\`\`\n${morning}\n\`\`\``, '*Prose.*\n\n' + morning, 'x'.repeat(200000) + morning]) {
        assert.equal(museHeaderFilter(text), text);
    }
    assert.equal(parseMuseHeader(undefined), null);
});

test('bounded parser clamps day numbers and never allocates an unbounded rail', () => {
    assert.equal(parseMuseHeader(morning.replace('DAY 4/14', 'DAY 0/14')).day, 1);
    assert.equal(parseMuseHeader(morning.replace('DAY 4/14', 'DAY 99/14')).day, 14);
    const p = parseMuseHeader(morning.replace('DAY 4/14', 'DAY 99/99'));
    assert.equal(p.total, 14);
    assert.equal(p.day, 14);
});


const splitHeaders = JSON.parse(readFileSync(new URL('./helpers/museSplitHeaders.json', import.meta.url), 'utf8'));
for (const [index, example] of splitHeaders.entries()) {
    test(`reported split Muse header ${index + 1} renders one complete header and code strip`, async () => {
        const raw = example.header + '\n\n*Prose here.*\n\n[Smile] [RC] [1]';
        const parsed = parseMuseHeader(raw);
        assert.ok(parsed);
        assert.equal(parsed.day, null, 'do not infer a story day from the code');
        assert.equal(parsed.code, example.code);
        const h = formatterHarness();
        const formatted = await h.format(raw);
        for (const html of [h.html(raw), h.render(raw), h.render(formatted)]) {
            assert.equal((html.match(/class="message-header"/g) || []).length, 1, html);
            assert.equal((html.match(/class="muse-strip/g) || []).length, 1, html);
            assert.ok(html.includes(`<div class="message-location">${example.location}</div>`));
            assert.ok(html.includes(`<span>${example.time}</span>`));
            assert.match(html, /<span>Wednesday, (?:October|Oct) 13, 2025<\/span>/);
            assert.ok(html.includes(`<span class="muse-code">${example.code}</span>`));
            if (example.mode) assert.ok(html.includes(`data-mode="${example.mode}"`));
            assert.doesNotMatch(html, /darkred|¦|\(CODE:|muse-day|muse-rail/i);
            assert.match(html, /Prose here/);
        }
        assert.doesNotMatch(formatted, /message-header|muse-strip/, 'rendered HTML stays out of stored text');
        assert.equal(h.render(await h.format(formatted)), h.render(formatted), 'rendered header is stable after reformatting');
    });
}

test('split locations without Muse metadata cannot consume ordinary headers, prose, or code examples', () => {
    const first = '¦¦ Wednesday, October 13, 2025 ~ 2:43 PM ¦¦';
    const location = '*¦¦ Sterling Hall Dormitory, Room 271 ~ (SAPH) ¦¦*';
    for (const text of [
        `${first}\n${location}\n\n*Prose here.*`,
        `${first}\n${location}\n(CODE: 9999)\n\n*Prose here.*`,
        `${first}\n*She walks to her room.*\n${location}\n(CODE: 7717)`,
        `\`\`\`\n${splitHeaders[0].header}\n\`\`\``,
    ]) assert.equal(museHeaderFilter(text), text);
});
