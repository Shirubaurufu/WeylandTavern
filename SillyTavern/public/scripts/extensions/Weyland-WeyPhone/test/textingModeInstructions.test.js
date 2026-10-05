// test/textingModeInstructions.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEXTING_MODE_INSTRUCTIONS, TEXTING_THOUGHTS_DISABLED } from '../lib/textingModeInstructions.js';

test('TEXTING_MODE_INSTRUCTIONS is a non-empty string', () => {
    assert.equal(typeof TEXTING_MODE_INSTRUCTIONS, 'string');
    assert.ok(TEXTING_MODE_INSTRUCTIONS.trim().length > 0);
});

test('TEXTING_MODE_INSTRUCTIONS establishes the always-texting framing', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /entire conversation/i);
    assert.match(TEXTING_MODE_INSTRUCTIONS, /Date\/Time\/Location|scene header/i);
});

test('TEXTING_MODE_INSTRUCTIONS references the Incoming line format', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /Incoming¦/);
});

test('TEXTING_MODE_INSTRUCTIONS explicitly omits the Expression/ClothingCode footer', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /\[Expression\]/);
    assert.match(TEXTING_MODE_INSTRUCTIONS, /omit/i);
});

test('TEXTING_MODE_INSTRUCTIONS explicitly omits HTML formatting regardless of the platform setting', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /HTML/);
});

test('TEXTING_MODE_INSTRUCTIONS instructs the model to infer voice from personality rather than a hardcoded style', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /personality/i);
});

test('TEXTING_MODE_INSTRUCTIONS discourages narration in this context', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /narration/i);
});

test('text replies explicitly disable thoughts and internal monologue', () => {
    assert.match(TEXTING_THOUGHTS_DISABLED, /^\[THOUGHTS: ALWAYS DISABLED IN TEXTS\]/);
    assert.match(TEXTING_THOUGHTS_DISABLED, /internal monologue/i);
});
