import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ravs } from '../../quick-reply-ext/src/promptRegistry.js';
import { registerMiniPrompt } from '../../quick-reply-ext/src/promptRegistry.js';
import { assemblePromptLayers, preparePromptBase, resolvePromptChoice, safePreparePromptBase, usesSceneSheet } from '../../quick-reply-ext/src/promptAssembly.js';
import { PROMPT_OPTIONS } from '../lib/narrativeSettings.js';
import { assemble } from './helpers/promptAssemblyHarness.js';

const beta = ravs.get('Beta Prompt');

test('Current is the Beta prompt: saved Beta, saved Current, nothing and junk all land on it', () => {
    for (const saved of ['Beta Prompt', 'Current Prompt', '', undefined, null, 'Nonexistent Prompt']) {
        assert.deepEqual(resolvePromptChoice(ravs, saved), { saved: 'Current Prompt', key: 'Beta Prompt' }, String(saved));
    }
    for (const kept of ['Old Prompt 2026', 'Old Prompt 2025', 'Mini Prompt']) {
        assert.deepEqual(resolvePromptChoice(ravs, kept), { saved: kept, key: kept });
    }
});

test('a saved Beta Prompt is corrected to Current Prompt when the prompt is built', async () => {
    const { globals, locals } = await assemble('Rosa', { PromptChoice: 'Beta Prompt', AnalysisToggle: 'Enabled' });
    assert.equal(globals.get('PromptChoice'), 'Current Prompt');
    assert.ok(locals.get('ravteg').includes('[WEYLAND SCENE SHEET'), 'Current builds from Beta, so it carries the scene sheet');
});

test('the Beta slot is held: listed, disabled, and the only disabled option', () => {
    const beta = PROMPT_OPTIONS.find(option => option.id === 'Beta Prompt');
    assert.equal(beta.disabled, true);
    assert.deepEqual(PROMPT_OPTIONS.filter(option => option.disabled).map(option => option.id), ['Beta Prompt']);
    assert.match(PROMPT_OPTIONS.find(option => option.id === 'Current Prompt').description, /default and recommended/i);
});

test('Mini is registered outside rav.js, and a failed build only costs the Mini choice', () => {
    assert.ok(ravs.has('Mini Prompt'));
    const table = new Map([['Beta Prompt', { body: 'no section markers here', teg: '', post: '' }]]);
    const realError = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args.join(' '));
    try {
        assert.equal(registerMiniPrompt(table), false);
    } finally {
        console.error = realError;
    }
    assert.equal(table.has('Mini Prompt'), false);
    assert.match(logged.join('\n'), /Mini Prompt could not be built/);
    // With no Mini in the table, a saved Mini is sent back to Current instead of breaking generation.
    assert.deepEqual(resolvePromptChoice(table, 'Mini Prompt'), { saved: 'Current Prompt', key: 'Beta Prompt' });
});

test('safePreparePromptBase degrades to the stored prompt instead of throwing when Beta markers move', () => {
    const entry = ravs.get('Old Prompt 2025');
    // preparePromptBase reads its formatting blocks out of Beta's teg by marker; rename one and it throws.
    const broken = { ...beta, teg: beta.teg.replaceAll('[END Proper Weyland Tavern formatting]', '[END RENAMED]') };
    assert.throws(() => preparePromptBase('Old Prompt 2025', entry, broken), /missing/);
    const realError = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args.join(' '));
    try {
        assert.equal(safePreparePromptBase('Old Prompt 2025', entry, broken), entry, 'uses the prompt exactly as stored');
    } finally {
        console.error = realError;
    }
    assert.match(logged.join('\n'), /Prompt compatibility failed/);
});

test('Old Prompt 2026 with Analysis on keeps its own post-history analysis, not the scene sheet', async () => {
    const base = preparePromptBase('Old Prompt 2026', ravs.get('Old Prompt 2026'), beta);
    assert.ok(base.ownAnalysis, '2026 carries its own reasoning block');
    assert.equal(usesSceneSheet(base, true), false);
    assert.equal(usesSceneSheet(base, false), false);
    assert.equal(usesSceneSheet(preparePromptBase('Beta Prompt', beta, beta), true), true);

    const on = assemblePromptLayers(base, beta, { analysisOn: true });
    assert.ok(on.post.includes('[FINAL ROLEPLAY DIRECTIVES]'), 'the original reasoning block is back in the post-history');
    assert.ok(!on.post.includes('Weyland Tavern client note'), 'no scene-sheet client note');
    assert.ok(!on.teg.includes('SPARK [1/6]'), 'no scene sheet in the system prompt');

    const off = assemblePromptLayers(base, beta, { analysisOn: false });
    assert.ok(!off.post.includes('[FINAL ROLEPLAY DIRECTIVES]'), 'Analysis off drops it again, as for every prompt');

    // Course correction layers on as usual, minus the bridge line that talks about a scene sheet.
    const hard = assemblePromptLayers(base, beta, { analysisOn: true, shift: 'Hard Mode', shiftItem: 'SHIFT ITEM' });
    assert.ok(hard.teg.startsWith('SHIFT ITEM') && !hard.teg.includes(beta.bridgeLine));
    const hardOff = assemblePromptLayers(base, beta, { analysisOn: false, shift: 'Hard Mode', shiftItem: 'SHIFT ITEM' });
    assert.ok(hardOff.teg.includes(beta.bridgeLine), 'Analysis off behaves like every other prompt');
});

test('Old Prompt 2025 with Analysis on gets its own short scene sheet in the post-history, not Beta\'s', () => {
    const base = preparePromptBase('Old Prompt 2025', ravs.get('Old Prompt 2025'), beta);
    assert.ok(base.ownAnalysis, '2025 carries its own analysis');
    assert.equal(usesSceneSheet(base, true), false, 'Beta\'s six-box sheet is not added');

    const on = assemblePromptLayers(base, beta, { analysisOn: true });
    // the envelope the client hides, the cap, the scripted finish and the stop rules that fix draft/critique/re-send loops
    for (const needle of ['SCENE SHEET', 'END OF SCENE SHEET', 'HARD CAP: four boxes', '[4/4]',
        'The sheet is done. Do not add to it.', 'The rough draft IS the final draft.', 'send nothing after it', 'SEND MESSAGE. STOP.']) {
        assert.ok(on.post.includes(needle), needle);
    }
    const sheetText = on.post.slice(on.post.indexOf('[WEYLAND SCENE SHEET - SHORT FORM]'), on.post.indexOf('<execution_check>'));
    assert.ok(!/\b(reasoning|think|analysis)\b/i.test(sheetText), 'the sheet never frames itself as reasoning (providers refuse that)');
    assert.ok(!on.post.includes('THINK BEFORE RESPONDING'), 'the old three-line check is replaced, not kept beside it');
    assert.ok(!on.post.includes('Weyland Tavern client note') && !on.teg.includes('SPARK [1/6]'), 'no Beta scene sheet or client note');
    assert.ok(on.post.includes('<final_directives>'), 'the repeated rules block is sent as always');

    const off = assemblePromptLayers(base, beta, { analysisOn: false });
    assert.ok(!off.post.includes('SCENE SHEET') && !off.post.includes('THINK BEFORE RESPONDING'), 'Analysis off sends neither');
    assert.ok(off.post.includes('<final_directives>'), 'the repeated rules block is still sent');
    assert.ok(off.post.includes('Do not break character. Never speak out of character'), 'persona/dialogue reminder survives');

    // The phone's texting reads the plain version, never the sheet.
    assert.ok(!base.post.includes('SCENE SHEET') && !base.post.includes('THINK BEFORE RESPONDING'));
});

test('2025\'s sheet envelope is exactly what the Formatter hides, even when the closing line is missing', () => {
    const src = readFileSync(new URL('../../Weyland-Formatter/index.js', import.meta.url), 'utf8');
    const literal = /sceneSheetFull: \/(.*)\/,/.exec(src)[1];
    const re = new RegExp(literal);
    const header = '¦¦ Saturday, Oct 18th ~ 9:28 AM ~ Dormitory ~¦¦';
    const sheet = 'SCENE SHEET\nBOARD [1/4]\n- notes\nTRUTH [2/4]\n- more\nVOICE [3/4]\nFOOTER [4/4]\nOkay. Here is my complete rough draft, starting with the header.\nEND OF SCENE SHEET';
    assert.equal(`${sheet}\n${header}\n*She waves.*`.replace(re, '').trim(), `${header}\n*She waves.*`);
    assert.equal(`SCENE SHEET\nBOARD [1/4]\n- notes\n${header}\n*She waves.*`.replace(re, '').trim(), `${header}\n*She waves.*`);
});
