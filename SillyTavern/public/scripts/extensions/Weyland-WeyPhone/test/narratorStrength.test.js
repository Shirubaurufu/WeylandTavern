import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { appendEarlyNarrator, resolveNarratorStrength } from '../../quick-reply-ext/src/narratorStrength.js';
import { PROMPT_OPTIONS, readNarrativeSnapshot } from '../lib/narrativeSettings.js';
import { renderNarrativeSettingsScreen } from '../lib/ui/apps/narrativeSettings.js';
import { assemble } from './helpers/promptAssemblyHarness.js';

test('strength defaults to Low and preserves an explicit High selection', () => {
    for (const value of [undefined, '', 'Low', 'unknown']) assert.equal(resolveNarratorStrength(value), 'Low');
    assert.equal(resolveNarratorStrength(' high '), 'High');
    assert.equal(resolveNarratorStrength(' low '), 'Low');
    for (const value of [undefined, 'Low', 'High']) {
        const snapshot = readNarrativeSnapshot({ getGlobal: key => key === 'NarratorStrength' ? value : '', getLocal: () => '' });
        assert.equal(snapshot.narratorStrength, value ?? 'Low');
    }
});

test('all supported prompts route exactly one narrator block and clear early placement on High', async () => {
    for (const prompt of PROMPT_OPTIONS.filter(p => !p.disabled)) {
        for (const AnalysisToggle of ['Enabled', 'Disabled']) {
            for (const NarratorStrength of ['Low', 'High', undefined]) {
                const { locals } = await assemble('Rosa', {
                    PromptChoice: prompt.id, NarratorStrength, AnalysisToggle,
                    Narrator: '[CRITICAL - NARRATOR - LAUREN] NARRATOR_PAYLOAD',
                }, { LocalN: 'override', LocalNarrator: '[CRITICAL - NARRATOR - SALEM] LOCAL_PAYLOAD', NarratorEarly: 'STALE_EARLY_BLOCK' });
                const early = locals.get('NarratorEarly');
                const post = locals.get('postrav');
                assert.equal(post.includes('{{getvar::LocalNarrator}}'), NarratorStrength === 'High', `${prompt.id}/${AnalysisToggle}/${NarratorStrength}`);
                assert.equal(early.includes('LOCAL_PAYLOAD'), NarratorStrength !== 'High');
                if (NarratorStrength === 'High') assert.equal(early, '');
                assert.ok(!early.includes('NARRATOR_PAYLOAD'), 'chat-local narrator still wins');
                assert.equal(early.includes('Narrator asides never reveal'), NarratorStrength !== 'High');
                if (NarratorStrength !== 'High' && locals.get('ravteg').includes('NARRATOR GREEN ROOM')) {
                    assert.match(locals.get('ravteg'), /after the character card, before the lorebooks/);
                }
            }
        }
    }
});

test('the Narrators action saves strength and rebuilds once; stale and repeated actions are ignored', async () => {
    const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    const handler = source.slice(source.indexOf('async function handleNarrativeAction(button) {'), source.indexOf('\nfunction showScreen(view)'));
    const globals = new Map();
    const rebuilds = [];
    const context = {
        narrativeActionPending:false, narrativeNarratorPreview:null, narrativeAnchorKey:'', currentView:'narrative',
        SillyTavern:{getContext:()=>({variables:{global:globals,local:new Map()}})},
        narrativeSnapshot:()=>({narratorStrength:resolveNarratorStrength(globals.get('NarratorStrength'))}),
        narrativeQuickReplyScript:()=>'',
        rebuildNarrativePrompts:async name=>rebuilds.push(name),
        renderNarrativeScreenNow:()=>{},
        console:{error:(...args)=>assert.fail(args.join(' '))},wpToast:()=>assert.fail('unexpected toast'),
    };
    runInNewContext(`${handler}\nthis.handle = handleNarrativeAction;`,context);
    const press = value => context.handle({dataset:{narrativeAction:'set-narrator-strength',value},classList:{add:()=>{}},disabled:false});
    await press('Low');
    assert.equal(globals.has('NarratorStrength'),false);
    await press('invalid');
    await press('High');
    assert.equal(globals.get('NarratorStrength'),'High');
    await press('High');
    await press('Low');
    assert.equal(globals.get('NarratorStrength'),'Low');
    assert.deepEqual(rebuilds,['XXX','XXX']);
});

test('OOC and built-in prompts never gain an extra early roleplay narrator', async () => {
    for (const character of ['Kinsbane Manor', 'Mirror Weyland', 'Muse']) {
        const { locals } = await assemble(character, { NarratorStrength: 'Low' });
        assert.equal(locals.get('NarratorEarly'), '');
    }
    const { locals } = await assemble('Rosa', { NarratorStrength: 'Low', OOCMode: 'Enabled' });
    assert.equal(locals.get('NarratorEarly'), '');
});

test('chat-completion assembly places Low after the card and before after-card lore, including custom scenario formats', async () => {
    const source = readFileSync(new URL('../../../openai.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function preparePromptsForChatCompletion(');
    const end = source.indexOf('\n/**', start);
    const prepareSource = source.slice(start, end);
    for (const strength of ['Low', 'High']) {
        const { locals } = await assemble('Rosa', { NarratorStrength: strength, Narrator: 'NARRATOR_PAYLOAD' });
        const identifiers = ['main','charDescription','charPersonality','scenario','worldInfoAfter','chatHistory','jailbreak'];
        const collection = {
            collection: identifiers.map(identifier => ({identifier,content:''})),
            get(id) { return this.collection.find(p => p.identifier === id); },
            index(id) { return this.collection.findIndex(p => p.identifier === id); },
            add(prompt) { this.collection.push(prompt); },
        };
        const context = {
            appendEarlyNarrator,
            oai_settings: {scenario_format:'SCENARIO WRAPPER: {{scenario}}',personality_format:'',group_nudge_prompt:'',impersonation_prompt:''},
            substituteParams: text => text.replace('{{scenario}}', 'CARD_SCENARIO').replace('{{getvar::NarratorEarly}}', locals.get('NarratorEarly')),
            formatWorldInfo: text => text,
            power_user: {},
            promptManager: { getPromptCollection: () => collection, preparePrompt: p => p, isPromptDisabledForActiveCharacter: () => false },
        };
        runInNewContext(`${prepareSource}\nthis.prepare = preparePromptsForChatCompletion;`, context);
        await context.prepare({scenario:'CARD_SCENARIO',charDescription:'CARD_DESCRIPTION',charPersonality:'CARD_PERSONALITY',worldInfoAfter:'LORE',extensionPrompts:{}});
        const scenario = collection.get('scenario').content;
        assert.equal(scenario.includes('NARRATOR_PAYLOAD'), strength === 'Low');
        assert.ok(scenario.startsWith('SCENARIO WRAPPER: CARD_SCENARIO'));
        const prompt = collection.collection.map(p => p.content).join('\n');
        if (strength === 'Low') {
            assert.ok(prompt.indexOf('CARD_PERSONALITY') < prompt.indexOf('NARRATOR_PAYLOAD'));
            assert.ok(prompt.indexOf('NARRATOR_PAYLOAD') < prompt.indexOf('LORE'));
        }
    }
    assert.equal(appendEarlyNarrator('CARD_SCENARIO',''), 'CARD_SCENARIO');
    assert.equal(appendEarlyNarrator('', 'NARRATOR'), 'NARRATOR');
});

test('Narrators shows the selected toggle without placement details or a duplicate status box', () => {
    for (const strength of ['Low', 'High']) {
        const target = {innerHTML:''};
        renderNarrativeSettingsScreen(target, {tab:'style',snapshot:{globalNarrator:'Lucky',narratorStrength:strength}});
        const strengthHtml = target.innerHTML.slice(target.innerHTML.indexOf('<section class="wp-narrative-strength"'));
        assert.match(strengthHtml, /Narrator Strength/);
        assert.match(strengthHtml, /Narrator Voice/);
        assert.match(strengthHtml, new RegExp(`data-value="${strength}" aria-pressed="true"`));
        assert.doesNotMatch(strengthHtml, /STORY BALANCE|<output|post-history|lorebook|Narration focus/);
    }
});
