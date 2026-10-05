import { assembleRoleplayShiftItem } from '../../quick-reply-ext/src/roleplayShiftItem.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    cleanCustomFeedback,
    cleanCustomName,
    CUSTOM_FEEDBACK_LIMIT,
    customShiftExample,
    DOSE_OPTIONS,
    readCustomPreset,
    readNarrativeSnapshot,
    SHIFT_OPTIONS,
} from '../lib/narrativeSettings.js';
import { renderCustomShiftScreen } from '../lib/ui/apps/customShift.js';
import { SHIFT_BODIES, SHIFT_FRAME, SHIFT_SCOPES } from '../../quick-reply-ext/src/roleplayShifts.js';

test('Custom Preset is the last shift, can be dosed, and is read back from RoleplayShiftCustom', () => {
    assert.equal(SHIFT_OPTIONS.at(-1).id, 'Custom Preset');
    assert.ok(DOSE_OPTIONS.some(option => option.id === 'Custom Preset'));
    const raw = JSON.stringify({ id: 'cp-1', name: 'Bar fights', text: 'hit harder' });
    assert.deepEqual(readCustomPreset(raw), { id: 'cp-1', name: 'Bar fights', text: 'hit harder' });
    assert.equal(readCustomPreset(''), null);
    assert.equal(readCustomPreset('not json'), null);
    assert.equal(readCustomPreset(JSON.stringify({ name: 'x', text: '   ' })), null);
    const getGlobal = key => (key === 'RoleplayShiftCustom' ? raw : key === 'RoleplayShift' ? 'Custom Preset' : '');
    const snapshot = readNarrativeSnapshot({ getGlobal, getLocal: () => '', hasChat: true });
    assert.equal(snapshot.shift, 'Custom Preset');
    assert.equal(snapshot.customPreset.name, 'Bar fights');
});

test('custom feedback is cleaned to the injected-text rules and capped at 4,000 characters', () => {
    assert.equal(CUSTOM_FEEDBACK_LIMIT, 4000);
    assert.equal(cleanCustomFeedback('  "ok so — this\r\n\r\n\r\n\r\n    indented line   \n\ttabbed"  '), 'ok so - this\n\nindented line\ntabbed');
    assert.equal(cleanCustomFeedback('x'.repeat(5000)).length, 4000);
    assert.equal(cleanCustomFeedback('   \n  '), '');
    assert.equal(cleanCustomName('  Bar    fights  '), 'Bar fights');
    assert.equal(cleanCustomName('n'.repeat(80)).length, 40);
});

test('a new preset starts with the Slow Burn player quote, and nothing else', () => {
    const example = customShiftExample(SHIFT_BODIES);
    assert.match(example, /^ok i need to vent about the last roleplay/);
    assert.match(example, /Ill be patient if you are\.$/);
    assert.doesNotMatch(example, /NARRATOR NOTES|CALIBRATION|^> "/);
    assert.ok(example.length > 2000 && example.length <= CUSTOM_FEEDBACK_LIMIT, `${example.length}`);
});

test('the Custom Preset screen: empty list, presets with the one in use, editor, two-tap delete', () => {
    const target = { innerHTML: '' };
    renderCustomShiftScreen(target, { presets: [] });
    assert.match(target.innerHTML, /No presets yet/);
    assert.doesNotMatch(target.innerHTML, /<textarea/, 'the list comes first, even with no presets');
    assert.match(target.innerHTML, /data-narrative-action="custom-new"/);
    assert.match(target.innerHTML, /data-narrative-action="custom-back"/);

    const presets = [
        { id: 'a', name: 'Bar fights', text: 'first line\nsecond line' },
        { id: 'b', name: 'Clingy <ex>', text: 'other' },
    ];
    renderCustomShiftScreen(target, { presets, activeId: 'a', shiftIsCustom: true });
    assert.match(target.innerHTML, /Bar fights <em>In use<\/em>/);
    assert.match(target.innerHTML, /data-narrative-action="custom-use" data-value="a" disabled>Using/);
    assert.match(target.innerHTML, /data-narrative-action="custom-use" data-value="b" >Use/);
    assert.match(target.innerHTML, /Clingy &lt;ex&gt;/, 'names are escaped');
    assert.match(target.innerHTML, /<small>first line<\/small>/, 'the preview is the first line only');

    // Not the regular shift right now (e.g. picked Horror since): nothing reads as in use.
    renderCustomShiftScreen(target, { presets, activeId: 'a', shiftIsCustom: false });
    assert.doesNotMatch(target.innerHTML, /In use/);

    renderCustomShiftScreen(target, { presets, deletePendingId: 'b' });
    assert.match(target.innerHTML, /wp-custom-delete is-confirming" data-narrative-action="custom-delete" data-value="b">Tap again/);

    // New preset: an empty box with the example as grey placeholder text, not as typed text.
    renderCustomShiftScreen(target, { presets, editing: { name: '', text: '' }, example: 'ok i need to "vent"' });
    assert.match(target.innerHTML, /New preset/);
    assert.match(target.innerHTML, /maxlength="4000"/);
    assert.match(target.innerHTML, /placeholder="EXAMPLE::: ok i need to &quot;vent&quot;"><\/textarea>/);
    assert.match(target.innerHTML, /<details class="wp-custom-help"><summary[^>]*aria-label="How your feedback is used"/);
    assert.match(target.innerHTML, /wraps it in a custom shell/);
    assert.match(target.innerHTML, /<span id="wp-custom-count">0<\/span> \/ 4000/);
    renderCustomShiftScreen(target, { presets, editing: { name: '', text: 'hello "there"' }, example: 'x' });
    assert.match(target.innerHTML, /hello &quot;there&quot;<\/textarea>/);
    assert.match(target.innerHTML, /<span id="wp-custom-count">13<\/span> \/ 4000/);
    renderCustomShiftScreen(target, { presets, editing: { id: 'a', name: 'Bar fights', text: 'x' }, example: 'should not show' });
    assert.match(target.innerHTML, /Edit preset/);
    assert.doesNotMatch(target.innerHTML, /EXAMPLE:::|should not show/);
    assert.match(target.innerHTML, /wp-custom-help/, 'the ? is on the edit screen too');
});

// Runs the real buildRoleplayShiftItem + customShiftPreset out of quick-reply-ext/index.js (which
// can't be imported in Node) with stubbed globals, so the assembled prompt section is checked.
function loadShiftBuilder(globals) {
    const source = readFileSync(fileURLToPath(new URL('../../quick-reply-ext/index.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
    const grab = (start) => {
        const from = source.indexOf(start);
        assert.ok(from >= 0, `${start} not found`);
        let depth = 0;
        for (let i = source.indexOf('{', from); i < source.length; i++) {
            if (source[i] === '{') depth++;
            if (source[i] === '}' && --depth === 0) return source.slice(from, i + 1);
        }
        throw new Error(`unbalanced ${start}`);
    };
    const code = `${grab('function customShiftPreset()')}\n${grab('function buildRoleplayShiftItem(')}\nreturn buildRoleplayShiftItem;`;
    return new Function('getGlobalVariable', 'SHIFT_BODIES', 'SHIFT_FRAME', 'SHIFT_SCOPES', 'assembleRoleplayShiftItem', code)(
        key => globals[key] ?? '', SHIFT_BODIES, SHIFT_FRAME, SHIFT_SCOPES, assembleRoleplayShiftItem);
}

test('a Custom Preset is sent where a shift quote goes, inside the shared wrapper, named after the preset', () => {
    const preset = { id: 'cp-1', name: 'Bar fights', text: 'every fight ended with a hug\n\nlet it get ugly' };
    const build = loadShiftBuilder({ RoleplayShiftCustom: JSON.stringify(preset) });
    const item = build('Custom Preset', {}, true, 'restarted');
    assert.match(item, /^2\. FEEDBACK \(Bar fights\): The player chose this feedback themselves\./);
    assert.ok(item.includes('> "every fight ended with a hug\n\nlet it get ugly"'));
    assert.match(item, /SESSION AUDIT, LAST ROLEPLAY/);
    assert.doesNotMatch(item, /The examples above/, 'no calibration examples to point at');
    assert.match(build('Toxicity', {}, true, 'branched'), /The examples above/, 'built-in shifts keep the line');

    const noAnalysis = build('Custom Preset', {}, false, 'restarted');
    assert.match(noAnalysis, /^FEEDBACK \(Bar fights\)/);

    assert.equal(loadShiftBuilder({})('Custom Preset', {}, true, 'restarted'), '', 'no preset in use sends nothing');
});
