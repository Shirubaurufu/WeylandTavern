import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { assemble } from './helpers/promptAssemblyHarness.js';
import { narratorBuildState } from '../../quick-reply-ext/src/narratorSelection.js';

const source = readFileSync(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
const start = source.indexOf('async function OnNarratorCheck(');
const end = source.indexOf('\n/** GENERATION_AFTER_COMMANDS', start);
const hook = source.slice(start, end);

async function harness(card, globals, localExtras = {}) {
    if (!Object.hasOwn(globals, 'NarratorStrength')) globals.NarratorStrength = 'High';
    const dose = localExtras.DoseLive === 'true' ? localExtras.DoseShift : null;
    let locals = (await assemble(card, globals, { Run: 'true', ...localExtras }, dose)).locals;
    let rebuilds = 0;
    const context = {
        narratorSettingsSync: { refresh: async () => {} },
        getGlobalVariable: key => globals[key] ?? '',
        getLocalVariable: key => locals.get(key) ?? '',
        narratorBuildState, console,
        XXX: async () => {
            rebuilds++;
            const activeDose = locals.get('DoseLive') === 'true' ? locals.get('DoseShift') : null;
            locals = (await assemble(card, globals, Object.fromEntries(locals), activeDose)).locals;
        },
    };
    runInNewContext(`${hook}\nthis.check = OnNarratorCheck;`, context);
    return { check: context.check, locals: () => locals, rebuilds: () => rebuilds };
}

for (const card of ['Kinsbane Manor', 'Mirror Weyland', 'Muse', 'Summer']) {
    test(`${card}: a correction changed in another chat refreshes the real cached prompt before generation`, async () => {
        for (const shift of ['Toxicity', 'Intimacy']) for (const type of ['normal', 'swipe', 'regenerate', 'continue']) {
            const globals = { Narrator: '[Core Roleplay Instructions]', RoleplayShift: shift, HardToggle: 'Off' };
            const h = await harness(card, globals);
            const field = card === 'Summer' ? 'ravteg' : 'SpecialShift';
            assert.ok(h.locals().get(field).includes(`FEEDBACK (${shift})`), `${card}: ${shift} starts active`);
            globals.RoleplayShift = 'None';
            await h.check(type, {}, true);
            assert.equal(h.rebuilds(), 0, 'dry runs do not mutate chat prompts');
            await h.check(type, {}, false);
            if (card === 'Summer') assert.doesNotMatch(h.locals().get(field), /FEEDBACK \((?:Toxicity|Intimacy)\)/);
            else {
                assert.equal(h.locals().get('SpecialShift'), '');
                assert.equal(h.locals().get('SpecialRecognition'), '');
            }
            await h.check(type, {}, false);
            assert.equal(h.rebuilds(), 1, 'unchanged settings do not rebuild each turn');
        }
    });
}

test('real active doses remain active under regular None; ending them invalidates the cache', async () => {
    const globals = { Narrator: '[Core Roleplay Instructions]', RoleplayShift: 'None' };
    const h = await harness('Kinsbane Manor', globals, { DoseShift: 'Toxicity', DoseLive: 'true' });
    await h.check('normal', {}, false);
    assert.match(h.locals().get('SpecialShift'), /FEEDBACK \(Toxicity\)/);
    assert.equal(h.rebuilds(), 0);
    h.locals().set('DoseUsed', '2');
    await h.check('normal', {}, false);
    assert.equal(h.rebuilds(), 0, 'counting a live dose does not rebuild an unchanged prompt');
    h.locals().delete('DoseShift'); h.locals().delete('DoseLive');
    await h.check('normal', {}, false);
    assert.equal(h.locals().get('SpecialShift'), '');
    assert.equal(h.locals().get('SpecialRecognition'), '');
    assert.equal(h.rebuilds(), 1);
});

test('Hard Mode and edits to an active custom correction refresh cached prompts too', async () => {
    const globals = { Narrator: '[Core Roleplay Instructions]', RoleplayShift: 'None', HardToggle: 'On' };
    const h = await harness('Kinsbane Manor', globals);
    globals.HardToggle = 'Off';
    await h.check('normal', {}, false);
    assert.equal(h.locals().get('SpecialShift'), '');
    globals.RoleplayShift = 'Custom Preset';
    globals.RoleplayShiftCustom = JSON.stringify({ name: 'Test', text: 'CUSTOM ONE' });
    await h.check('normal', {}, false);
    assert.match(h.locals().get('SpecialShift'), /CUSTOM ONE/);
    globals.RoleplayShiftCustom = JSON.stringify({ name: 'Test', text: 'CUSTOM TWO' });
    await h.check('normal', {}, false);
    assert.match(h.locals().get('SpecialShift'), /CUSTOM TWO/);
    assert.doesNotMatch(h.locals().get('SpecialShift'), /CUSTOM ONE/);
});

test('legacy cached prompts with None displayed migrate once without clearing story variables', async () => {
    const globals = { Narrator: '[Core Roleplay Instructions]', RoleplayShift: 'None', HardToggle: 'Off' };
    const h = await harness('Kinsbane Manor', globals, { StoryEvidence: 'keep this', Run: '' });
    h.locals().set('SpecialShift', 'FEEDBACK (Toxicity): stale saved directions');
    h.locals().set('SpecialRecognition', 'RECOGNITION [0/15] stale');
    h.locals().set('NarratorBuiltFrom', JSON.stringify(['2026-10-09-no-prewritten-lines', globals.Narrator, 'High', 'Default', '', false]));
    await h.check('normal', {}, false);
    assert.equal(h.locals().get('SpecialShift'), '');
    assert.equal(h.locals().get('SpecialRecognition'), '');
    assert.equal(h.locals().get('StoryEvidence'), 'keep this');
    await h.check('normal', {}, false);
    assert.equal(h.rebuilds(), 1);
});
