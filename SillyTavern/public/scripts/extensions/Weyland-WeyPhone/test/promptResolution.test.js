import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMasterPrompt, resolvePostHistoryInstructions, resolvePersonalityText, applySpecialCase } from '../lib/promptResolution.js';

function fakeRavs() {
    const ravs = new Map();
    ravs.set('Current Prompt', { teg: 'SYSTEM TEXT', post: 'POST {{pipe}} END', whtml: 'HTML BLOCK' });
    ravs.set('Beta Prompt', { teg: 'BETA SYSTEM TEXT', post: 'BETA POST {{pipe}} END', whtml: 'BETA HTML' });
    return ravs;
}

test('resolveMasterPrompt returns the entry for a known prompt choice', () => {
    const entry = resolveMasterPrompt(fakeRavs(), 'Beta Prompt');
    assert.equal(entry.teg, 'BETA SYSTEM TEXT');
});

test('resolveMasterPrompt falls back to Current Prompt (which is the Beta entry) for an unknown choice', () => {
    const entry = resolveMasterPrompt(fakeRavs(), 'Nonexistent Prompt');
    assert.equal(entry.teg, 'BETA SYSTEM TEXT');
});

test('resolveMasterPrompt treats a saved Current Prompt and a saved Beta Prompt as the same prompt', () => {
    assert.equal(resolveMasterPrompt(fakeRavs(), 'Current Prompt').teg, 'BETA SYSTEM TEXT');
    assert.equal(resolveMasterPrompt(fakeRavs(), 'Beta Prompt').teg, 'BETA SYSTEM TEXT');
});

test('resolveMasterPrompt throws if even Current Prompt is missing', () => {
    assert.throws(() => resolveMasterPrompt(new Map(), 'Nonexistent Prompt'), /No rav.js entry found/);
});

test('resolvePostHistoryInstructions substitutes rpFocus and the HTML default when htmlEnabled is false', () => {
    const entry = fakeRavs().get('Current Prompt');
    const result = resolvePostHistoryInstructions(entry, { htmlEnabled: false, rpFocus: 'FOCUS TEXT' });
    assert.equal(result, 'POST FOCUS TEXT\n===== END');
});

test('resolvePostHistoryInstructions uses rav.whtml when htmlEnabled is true', () => {
    const entry = fakeRavs().get('Current Prompt');
    const result = resolvePostHistoryInstructions(entry, { htmlEnabled: true, rpFocus: 'FOCUS TEXT' });
    assert.equal(result, 'POST FOCUS TEXT\nHTML BLOCK END');
});

test('resolvePostHistoryInstructions treats a missing rpFocus as an empty string', () => {
    const entry = fakeRavs().get('Current Prompt');
    const result = resolvePostHistoryInstructions(entry, { htmlEnabled: false, rpFocus: undefined });
    assert.equal(result, 'POST \n===== END');
});

test('resolvePersonalityText returns the first (only) var value in config.vars', () => {
    const config = { vars: { RosesRed: 'Rosa personality text' } };
    assert.equal(resolvePersonalityText(config), 'Rosa personality text');
});

test('resolvePersonalityText returns an empty string when config has no vars', () => {
    assert.equal(resolvePersonalityText({ vars: {} }), '');
});

test('resolvePersonalityText returns an empty string for a null/undefined config', () => {
    assert.equal(resolvePersonalityText(null), '');
    assert.equal(resolvePersonalityText(undefined), '');
});

test('applySpecialCase passes through unchanged for characters with no special case', () => {
    assert.equal(applySpecialCase('Rosa', 'base text', {}), 'base text');
});

test('applySpecialCase adds Aiko attendance text when mcyYear is not Freshman/Sophomore', () => {
    const result = applySpecialCase('Aiko', 'base text', { mcyYear: 'Junior', mcyMinusTwoYear: 'third' });
    assert.equal(result, 'Aiko attends Weyland University Monday-Friday. Aiko is now starting her third year of Demonology at Weyland.\nbase text');
});

test('applySpecialCase leaves Aiko unchanged when mcyYear is Freshman', () => {
    assert.equal(applySpecialCase('Aiko', 'base text', { mcyYear: 'Freshman' }), 'base text');
});

test('applySpecialCase renders the Aiko sentence without a double space when mcyMinusTwoYear is undefined', () => {
    // Regression: `starting her ${undefined ?? ''} year` used to produce "starting her  year".
    const result = applySpecialCase('Aiko', 'base text', { mcyYear: 'Junior' });
    assert.equal(result, 'Aiko attends Weyland University Monday-Friday. Aiko is now starting her year of Demonology at Weyland.\nbase text');
    assert.doesNotMatch(result, /  /, 'no double space anywhere in the assembled sentence');
});

test('applySpecialCase adds Willow expressive text only when weepingWillow is true', () => {
    assert.equal(applySpecialCase('Willow', 'base', { weepingWillow: true, expressWillowText: 'extra' }), 'base\nextra');
    assert.equal(applySpecialCase('Willow', 'base', { weepingWillow: false }), 'base');
});

test('applySpecialCase adds Hannah restriction text only when isRestricted is true', () => {
    assert.equal(applySpecialCase('Hannah', 'base', { isRestricted: true }), 'base\nShe is still a virgin.');
    assert.equal(applySpecialCase('Hannah', 'base', { isRestricted: false }), 'base');
});
