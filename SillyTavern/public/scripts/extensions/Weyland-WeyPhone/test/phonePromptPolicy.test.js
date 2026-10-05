import assert from 'node:assert/strict';
import test from 'node:test';

import { applyPhoneHardModePolicy, stripAnalysisProcedure } from '../lib/phonePromptPolicy.js';
import { ravs } from '../../quick-reply-ext/src/promptRegistry.js';
import { resolveMasterPrompt } from '../lib/promptResolution.js';

const PROMPT = 'Before\n{{getglobalvar::Coach}}\nAfter {{user}}';

test('phone prompts strip Coach by default', () => {
    assert.equal(applyPhoneHardModePolicy(PROMPT), 'Before\n\nAfter {{user}}');
});

test('phone prompts strip Coach while the phone opt-in is off', () => {
    assert.equal(applyPhoneHardModePolicy(PROMPT, { hardModeEnabled: true }), 'Before\n\nAfter {{user}}');
});

test('phone prompts strip Coach while global Hard Mode is off', () => {
    assert.equal(applyPhoneHardModePolicy(PROMPT, { allowHardMode: true }), 'Before\n\nAfter {{user}}');
});

test('phone prompts preserve Coach only when both switches are on', () => {
    assert.equal(applyPhoneHardModePolicy(PROMPT, { allowHardMode: true, hardModeEnabled: true }), PROMPT);
});

test('Coach macro matching tolerates whitespace and case without touching other macros', () => {
    const input = '{{ GETGLOBALVAR :: coach }} {{getglobalvar::Other}}';
    assert.equal(applyPhoneHardModePolicy(input), ' {{getglobalvar::Other}}');
});

// Mirrors resolveCharacterPrompt: every compatible base gets the phone's optional Coach slot.
function phoneHalves(name, entry) {
    const base = resolveMasterPrompt(ravs, name);
    const teg = `{{getglobalvar::Coach}}\n\n${base.teg}`;
    return { teg: stripAnalysisProcedure(teg), post: stripAnalysisProcedure(base.post) };
}

for (const [name, entry] of ravs) {
    test(`${name}: phone prompt carries no analysis/reasoning procedure`, () => {
        const { teg, post } = phoneHalves(name, entry);
        for (const text of [teg, post]) {
            assert.doesNotMatch(text, /ANALYSIS PROCEDURE/);
            assert.doesNotMatch(text, /<analysis>|<think>/);
            assert.doesNotMatch(text, /six-section analysis/);
            assert.doesNotMatch(text, /REASONING HARD CAP/);
        }
    });

    test(`${name}: stripping keeps the Hard Mode slot and the rest of the prompt`, () => {
        const { teg, post } = phoneHalves(name, entry);
        assert.match(teg, /\{\{getglobalvar::Coach\}\}/);
        assert.ok(teg.length > 10000, 'system prompt body should survive');
        if (entry.post.includes('{{getvar::ThoughtSet}}')) assert.match(post, /\{\{getvar::ThoughtSet\}\}/);
        if (entry.post.includes('{{pipe}}')) assert.match(post, /\{\{pipe\}\}/);
    });
}

// The Gemini Bypass is injected at sendMessage / sendMemoryRequest, so it only reaches every app
// (Chronicle, Chitter, Discorgi, Yip Yap, PawXai, Kressa, Copycat, texting) if every model request
// in index.js goes through one of them. A new direct sendRequest call would silently skip it.
test('every WeyPhone model request goes through a bypass-injecting send helper', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
    const lines = source.split(/\r?\n/);
    const calls = lines.map((line, index) => ({ line, index }))
        .filter(({ line }) => /ConnectionManagerRequestService\.sendRequest\(/.test(line) && !/^\s*\/\//.test(line));
    assert.ok(calls.length >= 6, 'expected the known request sites');
    for (const { index } of calls) {
        const window = lines.slice(Math.max(0, index - 4), index + 1).join('\n');
        assert.match(window, /send(?:Message|MemoryRequest)\(\{/, `index.js:${index + 1} sends without the bypass helper`);
    }
});

test('the WeyPhone bypass forbids analysis and drops the other-models line', async () => {
    const { WEYPHONE_GEMINI_BYPASS, withGeminiBypass } = await import('../lib/phonePromptPolicy.js');
    assert.match(WEYPHONE_GEMINI_BYPASS, /Do NOT perform any analysis/);
    assert.doesNotMatch(WEYPHONE_GEMINI_BYPASS, /CLAUDE|Weyland Analysis|pre-analysis/);
    assert.equal(withGeminiBypass([{ role: 'user', content: 'hi' }])[0].content, WEYPHONE_GEMINI_BYPASS);
});

test('Current Prompt: the system prompt now opens on the Hard Mode slot', () => {
    const { teg } = phoneHalves('Current Prompt', ravs.get('Current Prompt'));
    assert.match(teg, /^\{\{getglobalvar::Coach\}\}/);
});
