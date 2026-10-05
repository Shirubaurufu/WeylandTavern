import assert from 'node:assert/strict';
import test from 'node:test';

import { NARRATOR_OPTIONS } from '../lib/narrativeSettings.js';
import { narratorPickerHtml, playNarratorMotion } from '../lib/ui/apps/narratorPicker.js';
import { renderNarrativeSettingsScreen } from '../lib/ui/apps/narrativeSettings.js';

// the name plate section only (the slats above it also mention landscape-free narrators)
const plateOf = html => html.slice(html.indexOf('<div class="wp-np-plate'));
const pressed = (html, id) => new RegExp(`data-value="${id}" aria-pressed="true"`).test(html);

test('every narrator gets a slat wired to the existing set-global-narrator action', () => {
    const html = narratorPickerHtml({ options: NARRATOR_OPTIONS, selected: 'Default', blurb: 'x' });
    for (const option of NARRATOR_OPTIONS) {
        // index.js routes on exactly these two attributes, so the picker needs no new click handling
        assert.match(html, new RegExp(`data-narrative-action="set-global-narrator" data-value="${option.id}"`));
    }
    assert.ok(html.includes(NARRATOR_OPTIONS[0].description), 'the selected narrator\'s description comes from NARRATOR_OPTIONS');
    assert.equal((html.match(/class="wp-np-slat"/g) || []).length, NARRATOR_OPTIONS.length);
});

test('Default shows no character art; a chosen narrator shows theirs', () => {
    const none = narratorPickerHtml({ options: NARRATOR_OPTIONS, selected: 'Default' });
    assert.match(none, /No<br>persona/);
    // portraits live inside the slats of the three art narrators; the Default plate itself has no landscape
    assert.doesNotMatch(plateOf(none), /landscape\.webp/);
    assert.ok(pressed(none, 'Default'));

    const salem = narratorPickerHtml({ options: NARRATOR_OPTIONS, selected: 'Salem' });
    assert.ok(pressed(salem, 'Salem') && !pressed(salem, 'Default'));
    assert.match(plateOf(salem), /salem-landscape\.webp/);
    assert.match(salem, /Harsh, cynical and ready to do the wrong thing\./);
});

test('the animated draw paints the PREVIOUS narrator first, the settled draw paints the new one', () => {
    const animating = narratorPickerHtml({ options: NARRATOR_OPTIONS, selected: 'Lauren', from: 'Default', busy: true });
    assert.ok(pressed(animating, 'Default') && !pressed(animating, 'Lauren'), 'slats start in the from-state so transitions have a start');
    assert.match(animating, /wp-np-swap/);
    assert.match(animating, /Applying…/);
    assert.match(animating, /data-busy="true"/);

    const settled = narratorPickerHtml({ options: NARRATOR_OPTIONS, selected: 'Lauren' });
    assert.ok(pressed(settled, 'Lauren'));
    assert.doesNotMatch(settled, /wp-np-swap/, 'the final redraw must not replay the entrance');
    assert.match(settled, /Lauren is narrating/);
    assert.doesNotMatch(settled, /Applying/);
});

test('picking the narrator that is already selected is not an animation', () => {
    const html = narratorPickerHtml({ options: NARRATOR_OPTIONS, selected: 'Lucky', from: 'Lucky' });
    assert.doesNotMatch(html, /wp-np-swap/);
    assert.ok(pressed(html, 'Lucky'));
});

test('a narrator without a look defined still renders (no crash, no art)', () => {
    const options = [...NARRATOR_OPTIONS, { id: 'Newcomer', label: 'Newcomer', description: 'Someone new.' }];
    const html = narratorPickerHtml({ options, selected: 'Newcomer' });
    assert.match(html, /data-value="Newcomer"/);
    assert.match(html, /Newcomer is narrating/);
});

test('narrator text is escaped', () => {
    const options = [{ id: 'Default', label: '<b>Hi</b>', description: 'a "quote" & more' }];
    const html = narratorPickerHtml({ options, selected: 'Default', blurb: '<script>x</script>' });
    assert.doesNotMatch(html, /<b>Hi<\/b>/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;b&gt;Hi&lt;\/b&gt;/);
});

test('Style tab renders the picker, and only animates when told to', () => {
    const target = { innerHTML: '' };
    const snapshot = { globalNarrator: 'Salem', localNarrator: 'Salem', localNarratorOverride: false, language: 'English', modes: {}, mental: {} };
    renderNarrativeSettingsScreen(target, { snapshot, tab: 'style' });
    assert.match(target.innerHTML, /class="wp-np"/);
    assert.match(target.innerHTML, /Narrators give the bot a specific voice/, 'the explainer is kept, behind the ? chip');
    assert.doesNotMatch(target.innerHTML, /wp-np-swap/);

    renderNarrativeSettingsScreen(target, { snapshot, tab: 'style', narratorFrom: 'Default', narratorBusy: true });
    assert.match(target.innerHTML, /wp-np-swap/);

    // other tabs never contain the picker
    renderNarrativeSettingsScreen(target, { snapshot, tab: 'modes' });
    assert.doesNotMatch(target.innerHTML, /wp-np/);
});

test('playNarratorMotion flips the slats to the new narrator, and tolerates a container with no DOM', () => {
    assert.doesNotThrow(() => playNarratorMotion({ innerHTML: '' }, 'Lucky'));
    const slats = ['Default', 'Lucky'].map(value => {
        const attrs = { 'aria-pressed': value === 'Default' ? 'true' : 'false' };
        const classes = new Set();
        return { dataset: { value }, attrs, classes, setAttribute: (k, v) => { attrs[k] = v; }, classList: { add: c => classes.add(c) } };
    });
    const stage = { offsetWidth: 1, querySelectorAll: () => slats };
    playNarratorMotion({ querySelector: () => stage }, 'Lucky');
    assert.equal(slats[0].attrs['aria-pressed'], 'false');
    assert.equal(slats[1].attrs['aria-pressed'], 'true');
    assert.ok(slats[1].classes.has('wp-np-just') && !slats[0].classes.has('wp-np-just'));
});

// A tiny stand-in for the scrolling screen body: controls have a layout top, the redraw swaps them for a new set
// (the readout above them grew by 84px), and the scroll container reports positions relative to its own top.
function fakeScreen({ before, after }) {
    const make = list => list.map(c => ({
        dataset: { narrativeAction: c.action, value: c.value },
        getBoundingClientRect: () => ({ top: c.top }),
        parentElement: { getBoundingClientRect: () => ({ top: c.parentTop ?? c.top }) },
        focus() { screen.focused = c.value; },
    }));
    let controls = make(before);
    const screen = {
        scrollTop: 1365,
        focused: null,
        getBoundingClientRect: () => ({ top: 0, bottom: 661 }),
        querySelectorAll: () => controls,
        querySelector: sel => (sel === '.wp-narrative' && screen.hasScreen ? {} : null),
        hasScreen: true,
        set innerHTML(html) { screen.html = html; controls = make(after); },
        get innerHTML() { return screen.html; },
    };
    return screen;
}
const baseSnapshot = { globalNarrator: 'Default', localNarrator: 'Default', localNarratorOverride: false, language: 'English', modes: {}, mental: {} };

test('a redraw over an already-showing PromptOS screen skips the navigation slide-in; arriving keeps it', () => {
    const screen = fakeScreen({ before: [], after: [] });
    renderNarrativeSettingsScreen(screen, { snapshot: baseSnapshot, tab: 'style' });
    assert.match(screen.innerHTML, /<div class="wp-narrative wp-narrative-still">/, 'in place: no slide, no 40% opacity dip');

    screen.hasScreen = false; // coming from another app: the container does not hold a PromptOS screen yet
    renderNarrativeSettingsScreen(screen, { snapshot: baseSnapshot, tab: 'style' });
    assert.match(screen.innerHTML, /<div class="wp-narrative">/, 'navigation keeps its entrance');
});

test('a redraw re-anchors the scroll on the tapped control when content above it changes height', () => {
    // the readout above the grid grows by 84px, so every control below moves down by 84
    const screen = fakeScreen({
        before: [{ action: 'set-shift', value: 'None', top: 70 }, { action: 'set-shift', value: 'Self-Destruction', top: 200 }],
        after: [{ action: 'set-shift', value: 'None', top: 154 }, { action: 'set-shift', value: 'Self-Destruction', top: 284 }],
    });
    renderNarrativeSettingsScreen(screen, { snapshot: baseSnapshot, tab: 'essentials', anchorKey: 'set-shift|Self-Destruction|' });
    assert.equal(screen.scrollTop, 1365 + 84, 'scrolled by exactly how far the tapped control moved, so it stays under the finger');
});

test('with no tapped control, the topmost visible control is the anchor', () => {
    const screen = fakeScreen({
        before: [{ action: 'x', value: 'above', top: -50 }, { action: 'x', value: 'first-visible', top: 30 }, { action: 'x', value: 'below', top: 300 }],
        after: [{ action: 'x', value: 'above', top: -10 }, { action: 'x', value: 'first-visible', top: 70 }, { action: 'x', value: 'below', top: 340 }],
    });
    renderNarrativeSettingsScreen(screen, { snapshot: baseSnapshot, tab: 'essentials' });
    assert.equal(screen.scrollTop, 1365 + 40);
});

test('if the anchor control no longer exists after the redraw, scroll is left alone', () => {
    const screen = fakeScreen({ before: [{ action: 'a', value: '1', top: 20 }], after: [{ action: 'b', value: '2', top: 500 }] });
    renderNarrativeSettingsScreen(screen, { snapshot: baseSnapshot, tab: 'essentials', anchorKey: 'a|1|' });
    assert.equal(screen.scrollTop, 1365);
});

test('a control that moves itself when selected does not drag the page with it (seated cartridges sit 6px lower)', () => {
    // the cartridge bay's top never moves, but the tapped cartridge sits 6px lower once it is the selected one.
    // Anchoring on the cartridge itself scrolled 6px on every tap, forever.
    const screen = fakeScreen({
        before: [{ action: 'set-prompt', value: 'Beta Prompt', top: 400, parentTop: 380 }],
        after: [{ action: 'set-prompt', value: 'Beta Prompt', top: 406, parentTop: 380 }],
    });
    renderNarrativeSettingsScreen(screen, { snapshot: baseSnapshot, tab: 'essentials', anchorKey: 'set-prompt|Beta Prompt|' });
    assert.equal(screen.scrollTop, 1365, 'no drift');
});

test('narrators run Default, Lauren, Lucky, Salem', () => {
    assert.deepEqual(NARRATOR_OPTIONS.map(option => option.id), ['Default', 'Lauren', 'Lucky', 'Salem']);
    const html = narratorPickerHtml({ options: NARRATOR_OPTIONS, selected: 'Default' });
    const order = [...html.matchAll(/class="wp-np-slat" data-narrative-action="set-global-narrator" data-value="(\w+)"/g)].map(m => m[1]);
    assert.deepEqual(order, ['Default', 'Lauren', 'Lucky', 'Salem']);
});

test('each narrator has a subtitle under the name, before the description; Default has none', () => {
    const subtitles = { Lauren: 'The Sunset Romantic', Lucky: 'The Glowing Ember', Salem: 'The Midnight Hour' };
    for (const [id, subtitle] of Object.entries(subtitles)) {
        const plate = plateOf(narratorPickerHtml({ options: NARRATOR_OPTIONS, selected: id }));
        assert.match(plate, new RegExp(`wp-np-name">${id}</h3>\\s*<p class="wp-np-subtitle">${subtitle}</p>\\s*<p class="wp-np-desc">`));
    }
    assert.doesNotMatch(plateOf(narratorPickerHtml({ options: NARRATOR_OPTIONS, selected: 'Default' })), /wp-np-subtitle/);
});

test('narrator descriptions and tags are the agreed copy', () => {
    const byId = Object.fromEntries(NARRATOR_OPTIONS.map(option => [option.id, option.description]));
    assert.equal(byId.Lauren, 'Gooey, warm, adoring\u2026 and utterly willing to break your heart.');
    assert.equal(byId.Lucky, 'Prioritizes objective detail, quiet humor and authenticity.');
    assert.equal(byId.Salem, 'Harsh, cynical and ready to do the wrong thing.');
    const tags = id => [...plateOf(narratorPickerHtml({ options: NARRATOR_OPTIONS, selected: id })).matchAll(/<li>([^<]*)<\/li>/g)].map(m => m[1]);
    assert.deepEqual(tags('Lauren'), ['Hopeful', 'Romantic', 'Unapologetic']);
    assert.deepEqual(tags('Salem'), ['Dark', 'Emotional', 'Horror &amp; angst'], 'Opinionated is gone');
    assert.deepEqual(tags('Lucky'), ['Gritty', 'Witty', 'Balanced']);
});

test('the ? explainer renders paragraph by paragraph, with line breaks and a punchline', () => {
    const html = narratorPickerHtml({ options: NARRATOR_OPTIONS, selected: 'Default', blurb: ['First.', 'Line one\nline two', 'Punchline.'] });
    assert.match(html, /<div class="wp-np-blurb"><p>First\.<\/p><p>Line one<br>line two<\/p><p>Punchline\.<\/p><\/div>/);
    const target = { innerHTML: '' };
    const snapshot = { globalNarrator: 'Default', localNarrator: 'Default', localNarratorOverride: false, language: 'English', modes: {}, mental: {} };
    renderNarrativeSettingsScreen(target, { snapshot, tab: 'style' });
    assert.match(target.innerHTML, /Narrators give the bot a specific voice and artistic belief/);
    assert.match(target.innerHTML, /what directions they go in\./, 'no doubled "scenes"');
    assert.match(target.innerHTML, /rough emotional scenes\u2026<br>\u2026nor does a harsh narrator/);
    assert.match(target.innerHTML, /<p>They are all balanced, so try each out\.<\/p>/);
});

test('the translation card lives on Modes now, and the tab is called Narrator', () => {
    const target = { innerHTML: '' };
    const snapshot = { globalNarrator: 'Default', localNarrator: 'Default', localNarratorOverride: false, language: 'Spanish', modes: {}, mental: {} };
    renderNarrativeSettingsScreen(target, { snapshot, tab: 'style' });
    assert.doesNotMatch(target.innerHTML, /wp-narrative-language|Roleplay Language/, 'nothing but the picker on the Narrator tab');
    assert.match(target.innerHTML, /data-narrative-tab="style"[^>]*>(?:(?!<\/button>)[\s\S])*<span>Narrator<\/span>/);
    assert.doesNotMatch(target.innerHTML, /<span>Style<\/span>/);

    renderNarrativeSettingsScreen(target, { snapshot, tab: 'modes' });
    assert.match(target.innerHTML, /Roleplay Language/);
    assert.match(target.innerHTML, /id="wp-narrative-language" type="text" value="Spanish"/);
    assert.match(target.innerHTML, /data-narrative-action="save-language"/);
    assert.match(target.innerHTML, /data-narrative-action="reset-language"/, 'Reset to English shows when a language is set');
});

test('no tab carries the classic-menu button any more', () => {
    const target = { innerHTML: '' };
    const snapshot = { globalNarrator: 'Default', localNarrator: 'Default', localNarratorOverride: false, language: 'English', modes: {}, mental: {} };
    for (const tab of ['style', 'modes']) {
        renderNarrativeSettingsScreen(target, { snapshot, tab });
        assert.doesNotMatch(target.innerHTML, /legacy-menu|Open classic/);
    }
});
