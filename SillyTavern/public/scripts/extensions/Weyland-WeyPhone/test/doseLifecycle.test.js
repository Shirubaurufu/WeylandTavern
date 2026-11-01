import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { nextDoseState, rollDoseLength } from '../../quick-reply-ext/src/doseRules.js';
import { PROMPT_OPTIONS, resolveShift } from '../lib/narrativeSettings.js';
import { copycatCourseCorrection } from '../lib/copycatInstructions.js';
import { ravs } from '../../quick-reply-ext/src/rav.js';
import { assemble } from './helpers/promptAssemblyHarness.js';

// Execute the production lifecycle with only SillyTavern's variable persistence stubbed.
const source = readFileSync(new URL('../../quick-reply-ext/src/dose.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');

function harness(shift = 'Initiative', hard = 'Off') {
    const local = new Map();
    const global = new Map([
        ['RoleplayShift', shift], ['HardToggle', hard], ['Coach', 'previous coaching'],
        ['RoleplayShiftCustom', JSON.stringify({ name: 'My preset', text: 'My custom correction' })],
    ]);
    const sandbox = {
        getLocalVariable: key => local.get(key) ?? '',
        setLocalVariable: (key, value) => local.set(key, value),
        deleteLocalVariable: key => local.delete(key),
        setGlobalVariable: (key, value) => global.set(key, value),
        nextDoseState, rollDoseLength,
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    const context = { substituteParams: text => text.replace(/\{\{(getvar|getglobalvar)::([^}]+)\}\}/g,
        (_, scope, key) => (scope === 'getvar' ? local : global).get(key) ?? '') };
    return { ...sandbox, local, global, context };
}

for (const [previous, hard] of [['Initiative', 'Off'], ['Toxicity', 'Off'], ['Custom Preset', 'Off'], ['Hard Mode', 'On']]) {
    for (const ending of ['expiry', 'manual']) {
        test(`a dose ends on None after ${ending}, replacing ${previous}`, () => {
            const h = harness(previous, hard);
            const custom = h.global.get('RoleplayShiftCustom');
            h.startDose('Intimacy', () => 0); // deterministic two-reply dose
            assert.equal(h.activeDoseShift(), 'Intimacy');
            assert.ok(copycatCourseCorrection(h.context, ravs.get('Beta Prompt')));
            if (ending === 'expiry') {
                assert.equal(h.applyDoseForGeneration('normal', false), false);
                assert.equal(h.applyDoseForGeneration('normal', false), false);
                assert.equal(h.activeDoseShift(), 'Intimacy');
                assert.equal(h.applyDoseForGeneration('normal', false), true, 'expiry requests a prompt rebuild');
            } else {
                h.endDose();
            }
            assert.equal(h.activeDoseShift(), null);
            assert.equal(h.describeDose(), null);
            assert.equal(h.local.size, 0);
            assert.equal(h.global.get('RoleplayShift'), 'None');
            assert.equal(h.global.get('HardToggle'), 'Off');
            assert.equal(h.global.get('Coach'), '', 'legacy coaching cannot keep Hard Mode active');
            assert.equal(resolveShift(h.global.get('RoleplayShift'), h.global.get('HardToggle')), 'None');
            assert.equal(copycatCourseCorrection(h.context, ravs.get('Beta Prompt')), '');
            assert.equal(h.global.get('RoleplayShiftCustom'), custom, 'saved preset is retained');
        });
    }
}

test('ending no active dose leaves an explicitly chosen correction alone', () => {
    const h = harness();
    h.endDose();
    assert.equal(h.global.get('RoleplayShift'), 'Initiative');
    h.startDose('Intimacy', () => 0);
    h.endDose();
    h.global.set('RoleplayShift', 'Horror');
    h.endDose();
    assert.equal(h.global.get('RoleplayShift'), 'Horror');
});

test('rerolls, previews and phone requests cannot expire a live dose or reset its regular correction', () => {
    const h = harness();
    h.startDose('Toxicity', () => 0);
    h.applyDoseForGeneration('normal', false);
    const used = h.local.get('DoseUsed');
    for (const type of ['quiet', 'impersonate', 'swipe', 'regenerate', 'continue']) {
        assert.equal(h.applyDoseForGeneration(type, false), false);
        assert.equal(h.local.get('DoseUsed'), used);
    }
    assert.equal(h.applyDoseForGeneration('normal', true), false);
    assert.equal(h.local.get('DoseUsed'), used);
    assert.equal(h.global.get('RoleplayShift'), 'Initiative');
    assert.equal(h.activeDoseShift(), 'Toxicity');
});

test('the rebuilt main prompt matches None after a dose expires, on every enabled prompt', async () => {
    const h = harness('Hard Mode', 'On');
    h.startDose('Horror', () => 0);
    for (let i = 0; i < 3; i++) h.applyDoseForGeneration('normal', false);
    for (const option of PROMPT_OPTIONS.filter(option => !option.disabled)) {
        const actual = await assemble('Rosa', { ...Object.fromEntries(h.global), PromptChoice: option.id }, {}, h.activeDoseShift());
        const none = await assemble('Rosa', { RoleplayShift: 'None', HardToggle: 'Off', Coach: '', PromptChoice: option.id });
        assert.equal(actual.locals.get('ravteg'), none.locals.get('ravteg'), option.id);
        assert.equal(actual.locals.get('postrav'), none.locals.get('postrav'), option.id);
    }
});
