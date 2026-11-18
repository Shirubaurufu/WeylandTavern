// Content-filter refusals are answered by Ellie (Lucky, 2026-11-18), so isFilterRefusal decides which errors
// she shrugs off and which still get the "fire went out" box. Run: node --test test/fortuneFilter.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { isFilterRefusal } from '../fortuneCore.js';

test('Gemini word filter, as reply text and as an error', () => {
    const gemini = 'The prompt could not be submitted. The prompt contains sensitive words that violate Google’s [Generative AI Prohibited Use policy](https://policies.google.com/terms/generative-ai/use-policy).';
    assert.equal(isFilterRefusal(gemini, { reply: true }), true);
    assert.equal(isFilterRefusal(gemini), true);
});

test('provider blocks passed on by the server', () => {
    assert.equal(isFilterRefusal('Google AI Studio API returned no candidate\nPrompt was blocked due to : PROHIBITED_CONTENT'), true);
    assert.equal(isFilterRefusal('Google AI Studio Candidate text empty'), true);
    assert.equal(isFilterRefusal('{"finish_reason":"content_filter"}'), true);
    assert.equal(isFilterRefusal('The response was filtered due to the prompt triggering Azure OpenAI\'s content management policy.'), true);
});

test('ordinary failures are not filter refusals', () => {
    assert.equal(isFilterRefusal('Failed to fetch'), false);
    assert.equal(isFilterRefusal('The model answered, but not in the fortune format.'), false);
    assert.equal(isFilterRefusal('429 Too Many Requests'), false);
    assert.equal(isFilterRefusal(''), false);
    assert.equal(isFilterRefusal(undefined), false);
});

test('a story that mentions safety is not a refusal', () => {
    const story = 'CHAPTER I: Dash drags you to safety behind the dumpster. The SAFETY of the crew comes first.';
    assert.equal(isFilterRefusal(story, { reply: true }), false);
});
