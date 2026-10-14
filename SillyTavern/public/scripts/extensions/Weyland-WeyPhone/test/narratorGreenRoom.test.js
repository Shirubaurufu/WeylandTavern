// With a narrator selected, Beta's box 1 (SPARK) becomes that narrator's green room (2026-10-04):
// the sheet's only narrator check used to be one line in box 5, and Salem came out the same as Lauren.
// The swap is keyed on the literal "SPARK [1/6]" and "BOARD [2/6]" headers in Beta's body, so these
// tests run against the real decoded body: a re-encode that renames either header fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ravs } from '../../quick-reply-ext/src/promptRegistry.js';
import { addNarratorGreenRoom } from '../../quick-reply-ext/src/promptModifiers.js';
import { assemblePromptLayers, safePreparePromptBase } from '../../quick-reply-ext/src/promptAssembly.js';
import { assemble } from './helpers/promptAssemblyHarness.js';

const beta = ravs.get('Beta Prompt');

test('each narrator gets a voice reminder without mandatory planned wording or follow-through', () => {
    for (const name of ['Lauren', 'Salem', 'Lucky']) {
        for (const early of [false, true]) {
            const body = addNarratorGreenRoom(beta.body, name, early);
            assert.ok(!body.includes('SPARK [1/6]'));
            assert.match(body, /NARRATOR GREEN ROOM \[1\/6\]/);
            assert.ok(body.includes(`[CRITICAL - NARRATOR - ${name.toUpperCase()}]`));
            assert.ok(body.includes(early ? 'after the character card, before the lorebooks' : 'post-history instructions (after the Weyland Tavern client note'));
            assert.equal(body.split('BOARD [2/6]').length, 2, 'keeps the next box intact');
            assert.ok(body.includes('What narrator are you this message'), 'keeps the ordinary narrator check');
            assert.doesNotMatch(body, /Quote two techniques|Write one sentence|word for word|One line of energy|green-room sentence|your two techniques/);
        }
    }
});

test('all prompt choices put each narrator once in post-history, after any client note', async () => {
    const slot = '{{getvar::LocalNarrator}}';
    for (const PromptChoice of ['Current Prompt', 'Beta Prompt', 'Mini Prompt', 'Old Prompt 2025', 'Old Prompt 2026']) {
        for (const AnalysisToggle of ['Enabled', 'Disabled']) {
            for (const name of ['Lauren', 'Salem', 'Lucky']) {
                const Narrator = `[CRITICAL - NARRATOR - ${name.toUpperCase()}]\n${name}'s voice`;
                const { locals } = await assemble('Rosa', { PromptChoice, AnalysisToggle, Narrator });
                const teg = locals.get('ravteg'), post = locals.get('postrav');
                assert.ok(!teg.includes(slot), `${PromptChoice}: removed from system prompt`);
                assert.equal(post.split(slot).length - 1, 1);
                const note = post.match(/¦Weyland Tavern client note:[^¦]*¦\s*\n*/)?.[0] ?? '';
                assert.ok(post.startsWith(note + slot), `${PromptChoice}/${AnalysisToggle}: after note or first when absent`);
                assert.match(post, /Narrator asides never reveal hidden character or lorebook information/);
            }
        }
    }
});

test('per-chat narrator wins over the global narrator after relocation', async () => {
    const { locals } = await assemble('Rosa', { Narrator: '[CRITICAL - NARRATOR - LAUREN]' }, {
        LocalN: 'set', LocalNarrator: '[CRITICAL - NARRATOR - SALEM]',
    });
    assert.equal(locals.get('LocalNarrator'), '[CRITICAL - NARRATOR - SALEM]');
    assert.match(locals.get('ravteg'), /NARRATOR - SALEM/);
    assert.ok(!locals.get('ravteg').includes('NARRATOR - LAUREN'));
    assert.ok(locals.get('postrav').startsWith('¦Weyland Tavern client note:'));
});

test('Default and prompts without narrator slots gain no persona instructions', () => {
    const def = assemblePromptLayers(beta, beta, { narrator: '' });
    assert.ok(!def.teg.includes('{{getvar::LocalNarrator}}'));
    assert.ok(def.narratorEarly.includes('{{getvar::LocalNarrator}}'));
    assert.ok(!def.post.includes('Narrator asides'));
    const plain = assemblePromptLayers({ teg: 'plain system', post: 'plain post' }, beta, { analysisOn: false, narrator: 'Salem' });
    assert.equal(plain.teg, 'plain system');
    assert.equal(plain.post, 'plain post');
});

test('OOC continues to carry the narrator in its own prompt without the roleplay client note', async () => {
    const { locals } = await assemble('Rosa', { OOCMode: 'Enabled', Narrator: '[CRITICAL - NARRATOR - SALEM]' });
    assert.ok(locals.get('ravteg').includes('{{getvar::LocalNarrator}}'));
    assert.ok(!locals.get('postrav').includes('¦Weyland Tavern client note:'));
    assert.ok(!locals.get('postrav').includes('Narrator asides'));
});

test('Default (no narrator) leaves box 1 untouched', () => {
    assert.equal(addNarratorGreenRoom(beta.body, ''), String(beta.body));
    assert.equal(addNarratorGreenRoom(beta.body), String(beta.body));
});

test('assembly passes the narrator through only when the scene sheet is on', () => {
    const base = safePreparePromptBase('Beta Prompt', beta, beta);
    const on = assemblePromptLayers(base, beta, { analysisOn: true, narrator: 'Lauren' }).teg;
    assert.ok(on.includes('[CRITICAL - NARRATOR - LAUREN]'));
    assert.ok(!on.includes('SPARK [1/6]'));
    const def = assemblePromptLayers(base, beta, { analysisOn: true }).teg;
    assert.ok(def.includes('SPARK [1/6]') && !def.includes('GREEN ROOM'));
    const off = assemblePromptLayers(base, beta, { analysisOn: false, narrator: 'Lauren' }).teg;
    assert.ok(!off.includes('GREEN ROOM'));
});
