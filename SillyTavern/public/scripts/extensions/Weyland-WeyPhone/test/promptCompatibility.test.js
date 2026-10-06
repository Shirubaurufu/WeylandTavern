import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ravs } from '../../quick-reply-ext/src/promptRegistry.js';
import { preparePromptBase } from '../../quick-reply-ext/src/promptAssembly.js';
import { GEMINI_BYPASS_PROMPT } from '../../quick-reply-ext/src/promptModifiers.js';
import { PROMPT_OPTIONS, SHIFT_OPTIONS } from '../lib/narrativeSettings.js';
import { resolveMasterPrompt, resolvePostHistoryInstructions } from '../lib/promptResolution.js';
import { renderNarrativeSettingsScreen } from '../lib/ui/apps/narrativeSettings.js';
import { assemble } from './helpers/promptAssemblyHarness.js';

const beta = ravs.get('Beta Prompt');
// Beta is a held slot (greyed out in PromptOS) and "Current" IS the Beta prompt since 2026-10-03, so only enabled choices are real.
const names = PROMPT_OPTIONS.filter(option => !option.disabled).map(option => option.id);
const keyFor = name => (name === 'Current Prompt' ? 'Beta Prompt' : name);
const entryFor = name => ravs.get(keyFor(name));
const block = (text, start, end) => {
    const from = text.indexOf(start), to = text.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, start);
    return text.slice(from, to + end.length);
};
const expand = (text, locals, globals) => text.replace(/\{\{get(var|globalvar)::([^}]+)\}\}/g,
    (_, kind, name) => (kind === 'var' ? locals : globals).get(name) ?? '');

test('every choice receives byte-identical shared analysis / feedback / Gemini layers', async () => {
    for (const analysis of ['Enabled', 'Disabled']) {
        for (const bypass of ['Enabled', 'Disabled']) {
            for (const option of SHIFT_OPTIONS) {
                const settings = {
                    AnalysisToggle: analysis, GeminiBypassToggle: bypass, RoleplayShift: option.id,
                    HardToggle: option.id === 'Hard Mode' ? 'On' : 'Off',
                    RoleplayShiftCustom: JSON.stringify({ name: 'TEST CUSTOM', text: 'TEST FEEDBACK' }),
                };
                const reference = (await assemble('Rosa', { ...settings, PromptChoice: 'Beta Prompt' })).locals;
                const prefix = reference.get('ravteg').slice(0, -beta.teg.replaceAll('{{getvar::LocalNarrator}}', '').length);
                for (const name of names) {
                    const { locals, globals } = await assemble('Rosa', { ...settings, PromptChoice: name });
                    const base = preparePromptBase(keyFor(name), entryFor(name), beta);
                    assert.equal(globals.get('PromptChoice'), name);
                    assert.equal(locals.get('ravteg').startsWith(GEMINI_BYPASS_PROMPT), bypass === 'Enabled');
                    // The two old prompts with Analysis on keep their OWN post-history reasoning (2026's 14 steps, 2025's short
                    // think-before-responding check) instead of the shared scene sheet (see promptChoice.test.js); every other
                    // combination gets the byte-identical shared layers.
                    if ((name === 'Old Prompt 2026' || name === 'Old Prompt 2025') && analysis === 'Enabled') continue;
                    assert.equal(locals.get('ravteg'), prefix + base.teg.replaceAll('{{getvar::LocalNarrator}}', ''), `${name}: ${analysis}/${bypass}/${option.id}`);
                    assert.doesNotMatch(locals.get('ravteg') + locals.get('postrav'), /WEYLAND RESPONSE ANALYSIS PROCEDURE|REASONING HARD CAP|THINK BEFORE RESPONDING/);
                    assert.equal(locals.get('ravteg').includes('[WEYLAND SCENE SHEET'), analysis === 'Enabled');
                    assert.equal(locals.get('postrav').includes('¦Weyland Tavern client note:'), analysis === 'Enabled');
                }
            }
        }
    }
});

test('Beta analysis adds the POV/tense check and otherwise preserves the scene sheet and client note', async () => {
    const { locals } = await assemble('Rosa', { PromptChoice: 'Beta Prompt' });
    const body = beta.body.replace(/RECOGNITION \[0\/6\][\s\S]*?(?=SPARK \[1\/6\])/, '').replace(' (Technically Seven)', '');
    const checkedBody = body.replace('- Are character thoughts ENABLED or DISABLED?', line => `${line}\n${"- POV + TENSE CHECK: Confirm the active character/player POV (e.g. 3rd/2nd = she/you). Narrate in present tense unless explicitly overridden or describing a requested time skip; don’t inherit POV or tense errors from previous replies."}\n- Remember to respond to the latest user message in the chatlog.`);
    assert.equal(locals.get('ravteg'), [beta.frameTop, beta.objectionValve, beta.bridgeLine, checkedBody, beta.teg.replaceAll('{{getvar::LocalNarrator}}', '')].filter(Boolean).join('\n\n'));
    const note = beta.post.match(/¦Weyland Tavern client note:[^¦]*¦\s*\n*/)[0];
    assert.equal(locals.get('postrav'), (note + '{{getvar::LocalNarrator}}\n\n' + beta.post.slice(note.length)).replace('{{pipe}}', '{{getglobalvar::RPFocus}}\n====='));
});

test('all choices preserve global and chat-local narrators/POV, language, focus, clothing and mental modifiers', async () => {
    const slots = ['MHR', 'DTH', 'SBC', 'GAH', 'WJS', 'OPALMode', 'SAPHMode', 'ONYXMode', 'RUBYMode', 'Language', 'ClothingTracker', 'RPFocus'];
    const settings = Object.fromEntries(slots.map(name => [name, `TEST_${name}`]));
    for (const name of names) {
        const { locals, globals } = await assemble('Summer', { ...settings, PromptChoice: name }, {
            LocalN: 'chat override', LocalNarrator: 'CHAT_NARRATOR', RPPOVLocalSet: 'override', RPPOVLocal: 'CHAT_POV',
        });
        const expanded = expand(locals.get('ravteg') + locals.get('postrav'), locals, globals);
        for (const slot of slots) assert.ok(expanded.includes(`TEST_${slot}`), `${name}: ${slot}`);
        assert.ok(expanded.includes('CHAT_NARRATOR') && expanded.includes('CHAT_POV'));
        assert.ok(expanded.includes(entryFor(name).thinkYes), `${name}: character thoughts`);
        const inherited = await assemble('Rosa', { PromptChoice: name });
        const text = expand(inherited.locals.get('ravteg') + inherited.locals.get('postrav'), inherited.locals, inherited.globals);
        assert.ok(text.includes('NARRATOR') && text.includes('POV'), `${name}: inherited narrator/POV`);
    }
});

test('legacy prose and original HTML instructions survive outside the compatibility edits', () => {
    for (const name of ['Old Prompt 2025', 'Old Prompt 2026']) {
        const original = ravs.get(name), base = preparePromptBase(name, original, beta);
        for (const tag of ['writing_guidelines', 'character_behavior', 'dialogue_priority', 'environmental_detail', 'pacing_reminder', 'character_growth', 'user_context']) {
            // The hiccup example is an action and must use the current parser's asterisks.
            const expected = block(original.teg, `<${tag}>`, `</${tag}>`).replaceAll('_hiccup_', '*hiccup*');
            assert.ok(base.teg.includes(expected), `${name}: ${tag}`);
        }
        assert.equal(base.whtml, block(original.teg, '<html_guidelines>', '</html_guidelines>'));
        assert.ok(base.teg.includes('Most Weyland locations close at 9PM, with some exceptions.'));
        assert.ok(original.teg.includes('HEADER FORMAT: DAY, DATE'), 'raw source remains untouched');
        for (const [start, end] of [
            ['[HEADER FORMATTING]\n', '[END Proper Weyland Tavern formatting]'],
            ['[TEXT MESSAGE FORMATTING]', '[END TEXT MESSAGE FORMATTING]'],
        ]) assert.equal(block(base.teg, start, end), block(beta.teg, start, end));
        assert.doesNotMatch(base.teg, /\{\{pipe\}\}|\*\*NPC Name:\*\*|_\*\*\*doing/);
    }
});

test('HTML can be turned off again, and WeyPhone has the same updated legacy base', async () => {
    for (const name of names) {
        const base = resolveMasterPrompt(ravs, name);
        for (const enabled of [false, true]) {
            const { locals } = await assemble('Rosa', { PromptChoice: name, 'HTML!': enabled ? 'Enabled' : 'Disabled' });
            const html = base.whtml ?? 'HTML INSTRUCTIONS';
            assert.equal(locals.get('postrav').includes(html), enabled, name);
            if (base.whtml) {
                const phone = resolvePostHistoryInstructions(base, { htmlEnabled: enabled, rpFocus: 'FOCUS' });
                assert.equal(phone.includes(base.whtml), enabled);
                assert.match(phone, /FOCUS/);
            }
            assert.doesNotMatch(locals.get('postrav'), /\{\{pipe\}\}/);
        }
    }
});

test('doses override and then restore regular shifts, on every prompt', async () => {
    for (const name of names) {
        const settings = { PromptChoice: name, RoleplayShift: 'Custom Preset', RoleplayShiftCustom: JSON.stringify({ name: 'MY FEEDBACK', text: 'CUSTOM SENTINEL' }) };
        const normal = await assemble('Rosa', settings);
        assert.match(normal.locals.get('ravteg'), /CUSTOM SENTINEL/);
        const dose = await assemble('Rosa', settings, {}, 'Horror');
        assert.doesNotMatch(dose.locals.get('ravteg'), /CUSTOM SENTINEL/);
        assert.match(dose.locals.get('ravteg'), /FEEDBACK \(Horror\)/);
        const restored = await assemble('Rosa', settings);
        assert.equal(restored.locals.get('ravteg'), normal.locals.get('ravteg'));
    }
});

test('special characters and OOC retain their existing exceptions', async () => {
    for (const name of names) {
        const { locals } = await assemble('Weybot', { PromptChoice: name });
        assert.equal(locals.get('CCPromptCodes'), beta.CCPCA);
        assert.ok(locals.get('postrav').includes(beta.expaltshow));
        const ooc = await assemble('Rosa', { PromptChoice: name, OOCMode: 'Enabled', RoleplayShift: 'Horror' });
        assert.doesNotMatch(ooc.locals.get('ravteg'), /WEYLAND SCENE SHEET|FEEDBACK \(Horror\)/);
        assert.match(ooc.locals.get('postrav'), /OOC MODE IS ON/);
    }
    const memory = await assemble('Rosa', { PromptChoice: 'Old Prompt 2025' }, { LTMRav: 'true' });
    assert.match(memory.locals.get('ravteg'), /Do not use the roleplay header or footer in your memory creation/);
    const muse = await assemble('Muse', { PromptChoice: 'Old Prompt 2025' });
    assert.doesNotMatch(muse.locals.get('ravteg'), /\[FOOTER FORMATTING\]/);
});

test('PromptOS exposes working Analysis and feedback controls for every prompt', () => {
    for (const name of names) {
        const target = { innerHTML: '' };
        renderNarrativeSettingsScreen(target, { snapshot: {
            prompt: name, analysisEnabled: true, shift: 'Horror', dose: { shift: 'Horror' }, hasChat: true, modes: {}, mental: {},
        }, tab: 'essentials' });
        assert.match(target.innerHTML, /data-narrative-action="toggle-analysis" aria-pressed="true"/);
        assert.doesNotMatch(target.innerHTML, /Only the Beta prompt|only take effect on the Beta|Mini writes directly/);
        assert.match(target.innerHTML, /<dt>Analysis<\/dt><dd>On<\/dd>/);
    }
    const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    const start = source.indexOf('function applyRegularShift('), end = source.indexOf('\n/** Always opens', start);
    const context = { extractHardModeDirective: () => 'HARD', extractHardModeOffDirective: () => 'OFF' };
    runInNewContext(source.slice(start, end) + '\nthis.apply = applyRegularShift;', context);
    for (const name of names) {
        const global = new Map([['PromptChoice', name]]);
        context.apply(global, { prompt: name, hardMode: false }, '', 'Hard Mode');
        assert.equal(global.get('PromptChoice'), name, 'Hard Mode must not switch prompts');
        assert.equal(global.get('HardToggle'), 'On');
    }
    assert.match(source, /variable === 'HTML!'[\s\S]{0,160}rebuildNarrativePrompts\('Framework', 'XXX'\)/);
});
