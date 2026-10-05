import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatnipFeedback, catnipRecipes, copycatAuthorsNotes, copycatCourseCorrection, copycatOptionalDirections } from '../lib/copycatInstructions.js';
import { defaultSettings, getSettings } from '../lib/config.js';
import { buildUnderstudyMessages } from '../lib/understudy.js';
import { assembleRoleplayShiftItem } from '../../quick-reply-ext/src/roleplayShiftItem.js';
import { renderUnderstudyScreen, renderUnderstudySettingsScreen } from '../lib/ui/apps/understudy.js';

const beta = { directive: 'Hard directive', reason2Empirical: 'General feedback' };
const context = (global = {}, local = {}) => ({
    substituteParams: text => text.replace(/\{\{getglobalvar::([^}]+)}}/g, (_, key) => global[key] ?? '').replace(/\{\{getvar::([^}]+)}}/g, (_, key) => local[key] ?? '').replaceAll('{{user}}', 'Test player'),
    chatMetadata: { note_prompt: 'Speak gently to {{user}}.', note_interval: 1 },
    extensionSettings: { note: { chara: [] } },
    characters: [{ avatar: 'Callie.png' }], characterId: 0,
});
const recipes = [
    { id: 'auto', name: 'Standing', instructions: 'Always instruction', auto: true },
    { id: 'once', name: 'One use', instructions: 'Once instruction', auto: false },
    { id: 'off', name: 'Unused', instructions: 'Must not appear', auto: false },
];

test('existing installations receive opt-ins off and an empty jar without losing settings', () => {
    const extensionSettings = { WeyPhone: { understudy: { scope: 'dialogue', narrator: 'Salem' } } };
    const config = getSettings(extensionSettings).understudy;
    assert.equal(config.scope, 'dialogue'); assert.equal(config.narrator, 'Salem');
    assert.equal(config.sendAuthorsNotes, false); assert.equal(config.sendCourseCorrections, false);
    assert.deepEqual(config.catnipRecipes, []);
});
test('recipes are selected once, automatic recipes apply without one-use selection, and note is last', () => {
    const config = { catnipRecipes: recipes };
    const feedback = buildCatnipFeedback(config, 'Current note', ['once', 'auto']);
    assert.equal((feedback.match(/Always instruction/g) || []).length, 1);
    assert.match(feedback, /Once instruction/); assert.doesNotMatch(feedback, /Must not appear/);
    assert.ok(feedback.endsWith('Current note'));
    assert.doesNotMatch(buildCatnipFeedback(config), /Once instruction/);
    assert.deepEqual(config.catnipRecipes, recipes);
});
test('malformed and duplicate stored recipes do not enter the prompt', () => {
    assert.deepEqual(catnipRecipes({ catnipRecipes: 'bad' }), []);
    assert.equal(catnipRecipes({ catnipRecipes: [null, {}, ...recipes, recipes[0]] }).length, 3);
});
test('both instruction opt-ins default to sending nothing', () => {
    assert.equal(copycatOptionalDirections(context({ HardToggle: 'On' }), {}, beta), '');
    const notes = copycatOptionalDirections(context({ HardToggle: 'On' }), { sendAuthorsNotes: true }, beta);
    assert.match(notes, /Test player/); assert.doesNotMatch(notes, /Hard directive/);
    const course = copycatOptionalDirections(context({ HardToggle: 'On' }), { sendCourseCorrections: true }, beta);
    assert.match(course, /Hard directive/); assert.doesNotMatch(course, /Speak gently/);
});
test('author notes use current chat and character replacement/order, and respect disabled notes', () => {
    const ctx = context(); ctx.extensionSettings.note.chara = [{ name: 'Callie', useChara: true, position: 1, prompt: 'Character note' }];
    assert.equal(copycatAuthorsNotes(ctx), 'Character note\nSpeak gently to Test player.');
    ctx.extensionSettings.note.chara[0].position = 2;
    assert.equal(copycatAuthorsNotes(ctx), 'Speak gently to Test player.\nCharacter note');
    ctx.extensionSettings.note.chara[0].position = 0;
    assert.equal(copycatAuthorsNotes(ctx), 'Character note');
    ctx.chatMetadata.note_interval = 0;
    assert.equal(copycatAuthorsNotes(ctx), '');
});
test('course corrections resolve hard mode, ordinary shifts, custom text, and live doses without mutating them', () => {
    assert.equal(copycatCourseCorrection(context({ RoleplayShift: 'Hard Mode', HardToggle: 'Off' }), beta), '');
    assert.equal(copycatCourseCorrection(context({ RoleplayShift: 'General-Use', AnalysisToggle: 'Disabled' }), beta), '');
    assert.equal(copycatCourseCorrection(context({ RoleplayShift: 'General-Use' }), beta), 'General feedback');
    const ctx = context({ RoleplayShift: 'None', HardToggle: 'On', RoleplayShiftCustom: JSON.stringify({ name: 'My recipe', text: 'Custom direction' }) }, { DoseLive: 'true', DoseShift: 'Custom Preset' });
    const output = copycatCourseCorrection(ctx, beta);
    assert.match(output, /Custom direction/); assert.doesNotMatch(output, /Hard directive/);
    assert.equal(copycatCourseCorrection(ctx, beta), output);
    assert.equal(copycatCourseCorrection(context({ RoleplayShift: 'Slow Burn' }), beta), assembleRoleplayShiftItem('Slow Burn', beta, false));
});
test('new instructions reach the real rewrite prompt while scope/output rules remain present', () => {
    const messages = buildUnderstudyMessages({ scope: 'full', characterName: 'Callie', body: 'Original body',
        stageDirections: copycatOptionalDirections(context({ HardToggle: 'On' }), { sendAuthorsNotes: true, sendCourseCorrections: true }, beta),
        feedback: buildCatnipFeedback({ catnipRecipes: recipes }, 'Current note', ['once']),
    });
    const all = messages.map(message => message.content).join('\n');
    for (const text of ['Hard directive', 'Speak gently', 'Always instruction', 'Once instruction', 'Current note', 'Original body']) assert.ok(all.includes(text), text);
    assert.doesNotMatch(all, /Must not appear/);
});
test('release renderer preserves existing controls and exposes only the new jar/toggles', () => {
    const container = { innerHTML: '' }; const settings = structuredClone(defaultSettings.understudy);
    renderUnderstudyScreen(container, { settings, target: { characterName: 'Callie', body: 'Original', header: '', footer: '' }, draft: '', feedback: '', section: 'stage' });
    assert.match(container.innerHTML, /wp-catnip-open/); assert.match(container.innerHTML, /wp-understudy-refresh/);
    assert.match(container.innerHTML, /Rewrite Message/); assert.doesNotMatch(container.innerHTML, /Optional · strongest instruction|Preview rewrite brief/);
    renderUnderstudyScreen(container, { settings, section: 'edits' });
    assert.match(container.innerHTML, /wp-understudy-authors-notes/); assert.match(container.innerHTML, /wp-understudy-course-corrections/);
    assert.match(container.innerHTML, /wp-copycat-edit-block/);
    renderUnderstudySettingsScreen(container, { settings, currentLiveModel: 'test-model' });
    assert.match(container.innerHTML, /Automatic rewrites/); assert.match(container.innerHTML, /wp-understudy-fallback/);
    assert.doesNotMatch(container.innerHTML, /Title font|Sandbox storage/);
});
