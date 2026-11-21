// Gemini Bypass on = Gemini models get the prompt as if Analysis were off (Lucky, 2026-11-14). XXX keeps that build in
// ravtegGemini / postravGemini; quick-reply-ext's OnRequestReady swaps it in for Gemini requests only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisDelta, isGeminiModel, isClaudeModel, swapPromptTexts } from '../../quick-reply-ext/src/promptModifiers.js';
import { assemble } from './helpers/promptAssemblyHarness.js';

test('Gemini family: 3.8 Flash, Argon and OpenRouter ids; Claude and others are not', () => {
    for (const id of ['gemini-3.8-flash', 'google/gemini-3.8-flash', 'gemini-4-argon', 'argon', 'Gemini 4 Argon', 'gemma-argon-preview']) {
        assert.equal(isGeminiModel(id), true, id);
    }
    for (const id of ['claude-sonnet-4-5', 'glm-5', 'deepseek-v4.1-flash', 'gemma-4-31b-it', 'Targon', '', undefined]) {
        assert.equal(isGeminiModel(id), false, String(id));
    }
    assert.equal(isClaudeModel('gemini-4-argon'), false);
});

test('swapPromptTexts replaces inside plain, squashed and multipart messages', () => {
    const messages = [
        { role: 'system', content: 'CARD\nANALYSIS PROMPT\nmore' },
        { role: 'user', content: [{ type: 'text', text: 'x POST WITH SHEET y' }] },
        { role: 'assistant', content: 'unrelated, quoting ANALYSIS PROMPT' },
    ];
    const n = swapPromptTexts(messages, [
        { from: 'ANALYSIS PROMPT', to: 'PLAIN PROMPT' },
        { from: 'POST WITH SHEET', to: 'PLAIN POST' },
        { from: '', to: 'never' },
    ]);
    assert.equal(n, 2);
    assert.equal(messages[0].content, 'CARD\nPLAIN PROMPT\nmore');
    assert.equal(messages[1].content[0].text, 'x PLAIN POST y');
    assert.equal(messages[2].content, 'unrelated, quoting ANALYSIS PROMPT', 'only the first match, the system prompt');
});

test('analysisDelta cuts only the changed lines, so random macros elsewhere stay out of the match', () => {
    const shared = 'THOUGHTS: EXACTLY {{random::1,2,3,4}} sections\nfooter {{getvar::x}}';
    assert.deepEqual(analysisDelta(`NOTE line\n${shared}`, shared), { from: 'NOTE line\n', to: '' });
    assert.deepEqual(analysisDelta(`top\nSHEET a\nSHEET b\n${shared}`, `top\nplain\n${shared}`), { from: 'SHEET a\nSHEET b\n', to: 'plain\n' });
    // A difference in the middle of a line takes the whole line, never half a macro.
    assert.deepEqual(analysisDelta('a\nx {{getvar::one}} y\nz', 'a\nx {{getvar::two}} y\nz'), { from: 'x {{getvar::one}} y\n', to: 'x {{getvar::two}} y\n' });
    assert.equal(analysisDelta('same', 'same'), null);
});

test('analysisDelta round-trips the real builds', async () => {
    for (const choice of ['Current Prompt', 'Old Prompt 2026', 'Old Prompt 2025']) {
        for (const hard of [false, true]) {
            const extra = { PromptChoice: choice, NarratorStrength: undefined, GeminiBypassToggle: 'Enabled', ...(hard ? { HardToggle: 'On' } : {}) };
            const on = (await assemble('Rosa', { ...extra, AnalysisToggle: 'Enabled' })).locals;
            for (const [a, b] of [['ravteg', 'ravtegGemini'], ['postrav', 'postravGemini']]) {
                const d = analysisDelta(on.get(a), on.get(b));
                if (!d) continue;
                assert.ok(d.from, `${choice}/${a}: something to find`);
                assert.equal(on.get(a).replace(d.from, () => d.to), on.get(b), `${choice}/${hard}/${a}`);
            }
        }
    }
});

const CURRENT ={ PromptChoice: 'Current Prompt', NarratorStrength: undefined };

test('bypass + Analysis on: the Gemini copy is exactly the Analysis-off build', async () => {
    for (const choice of ['Current Prompt', 'Old Prompt 2026', 'Old Prompt 2025']) {
        for (const shift of ['None', 'Hard Mode']) {
            const extra = { ...CURRENT, PromptChoice: choice, GeminiBypassToggle: 'Enabled', ...(shift === 'Hard Mode' ? { HardToggle: 'On' } : {}) };
            const on = (await assemble('Rosa', { ...extra, AnalysisToggle: 'Enabled' })).locals;
            const off = (await assemble('Rosa', { ...extra, AnalysisToggle: 'Disabled' })).locals;
            assert.ok(on.get('ravtegGemini'), `${choice}/${shift}: Gemini copy built`);
            assert.equal(on.get('ravtegGemini'), off.get('ravteg'), `${choice}/${shift}: system prompt`);
            assert.equal(on.get('postravGemini'), off.get('postrav'), `${choice}/${shift}: post-history`);
            // 2025/2026 keep their analysis in the post-history, so only that side differs for them.
            assert.ok(on.get('ravteg') !== on.get('ravtegGemini') || on.get('postrav') !== on.get('postravGemini'), `${choice}/${shift}: the normal prompt keeps its analysis`);
            assert.equal(off.get('ravtegGemini'), '', `${choice}/${shift}: Analysis off has nothing to swap`);
        }
    }
    const current = (await assemble('Rosa', { ...CURRENT, GeminiBypassToggle: 'Enabled' })).locals;
    assert.match(current.get('ravteg'), /SCENE SHEET/);
    assert.doesNotMatch(current.get('ravtegGemini'), /SCENE SHEET/);
});

test('no Gemini copy with the bypass off or in OOC Mode', async () => {
    const off = (await assemble('Rosa', { ...CURRENT, GeminiBypassToggle: 'Disabled' })).locals;
    assert.equal(off.get('ravtegGemini'), '');
    assert.equal(off.get('postravGemini'), '');
    const ooc = (await assemble('Rosa', { ...CURRENT, GeminiBypassToggle: 'Enabled', OOCMode: 'Enabled' })).locals;
    assert.equal(ooc.get('ravtegGemini'), '');
});

test('OnRequestReady only swaps for Gemini with the bypass on', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    assert.match(source, /isGeminiModel\(data\.model\) && String\(getGlobalVariable\("GeminiBypassToggle"\)/);
});

// Lucky, 2026-11-20: skipping the analysis is its own switch under Gemini Bypass (global GeminiSkipAnalysis).
test('Skip analysis on Gemini: unset or Enabled skips, Disabled keeps the analysis for Gemini', async () => {
    const { geminiSkipsAnalysis } = await import('../../quick-reply-ext/src/promptModifiers.js');
    for (const v of [undefined, '', 'Enabled', 'enabled']) assert.equal(geminiSkipsAnalysis(v), true, String(v));
    assert.equal(geminiSkipsAnalysis('Disabled'), false);
    const unset = (await assemble('Rosa', { ...CURRENT, GeminiBypassToggle: 'Enabled' })).locals;
    assert.ok(unset.get('ravtegGemini'), 'unset keeps the old skip');
    const kept = (await assemble('Rosa', { ...CURRENT, GeminiBypassToggle: 'Enabled', GeminiSkipAnalysis: 'Disabled' })).locals;
    assert.equal(kept.get('ravtegGemini'), '', 'nothing to swap, Gemini gets the analysis');
    assert.equal(kept.get('postravGemini'), '');
    assert.equal(kept.get('ravteg'), unset.get('ravteg'), 'the normal prompt (box 6 cut happens at send time) is unchanged');
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    assert.match(source, /geminiSkipsAnalysis\(getGlobalVariable\("GeminiSkipAnalysis"\)\)\) \{\s*const swapped = swapGeminiNoAnalysis/);
});
