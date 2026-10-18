import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyHelixMindDefaults, isHelixMindRequest, stripForbiddenKeys } from '../../weyland-network/helixRequestDefaults.js';

// Shaped like the request Wolfwood sent on 2026-10-17 (GLM-5 garbled / internal server error).
const wolfRequest = () => ({
    chat_completion_source: 'custom',
    custom_url: 'https://helixmind.online/v1',
    model: 'glm-5',
    frequency_penalty: 1,
    presence_penalty: 0,
    logprobs: 5,
    temperature: 1,
    top_p: 0.95,
    custom_include_body: '- stop: \n  - "<user>"\n  - "</user>"\n- temperature: 0.9',
});

// HelixMind's backend asked for temperature only (2026-10-18), so everything else a strict upstream could reject goes.
const STRIPPED = ['frequency_penalty', 'presence_penalty', 'top_p', 'top_k', 'stop', 'logit_bias', 'seed', 'logprobs', 'top_logprobs'];

test('HelixMind requests keep temperature and the essentials, and lose every other sampler field', () => {
    const data = { ...wolfRequest(), stop: ['</think>'], max_tokens: 4000, stream: false, messages: [{ role: 'user', content: 'hi' }], logit_bias: {}, seed: 5, top_k: 40 };
    assert.deepEqual(applyHelixMindDefaults(data), ['frequency_penalty', 'stop', 'logprobs', 'custom_include_body']);
    for (const key of STRIPPED) assert.equal(key in data, false, key);
    assert.equal(data.temperature, 1);
    assert.equal(data.max_tokens, 4000);
    assert.equal(data.stream, false);
    assert.equal(data.model, 'glm-5');
    assert.equal(data.messages.length, 1);
    // Additional Parameters lose Wolf's stop-string list (key and items together) and keep their other content.
    assert.equal(data.custom_include_body, '- temperature: 0.9');
});

test('a request that carries none of those fields reports nothing', () => {
    const data = { chat_completion_source: 'custom', custom_url: 'https://helixmind.online/v1', model: 'glm-5', temperature: 1, max_tokens: 100 };
    assert.deepEqual(applyHelixMindDefaults(data), []);
    assert.equal(data.temperature, 1);
});

test('penalties or logprobs written into Additional Parameters are removed too (the server merges it last)', () => {
    const data = { ...wolfRequest(), custom_include_body: '- stop: \r\n  - "user:"\r\n- frequency_penalty: 1.2\r\n- temperature: 0.9\r\npresence_penalty: 0.8\r\n"logprobs": true\r\n' };
    delete data.logprobs;
    assert.deepEqual(applyHelixMindDefaults(data), ['frequency_penalty', 'custom_include_body']);
    assert.equal(data.custom_include_body, '- temperature: 0.9\r\n');
});

test('the exclude list makes the server cut stop strings that live inside Additional Parameters', () => {
    // Empty box: every stripped field is listed.
    const empty = wolfRequest();
    applyHelixMindDefaults(empty);
    assert.deepEqual(empty.custom_exclude_body.split('\n'), STRIPPED.map(key => `- ${key}`));
    // A player's own plain list is kept and extended, never duplicated.
    const own = { ...wolfRequest(), custom_exclude_body: '- reasoning_effort\r\n- top_p' };
    applyHelixMindDefaults(own);
    const lines = own.custom_exclude_body.split('\n');
    assert.equal(lines[0], '- reasoning_effort');
    assert.equal(lines.filter(line => line.trim() === '- top_p').length, 1);
    assert.ok(lines.includes('- stop'));
    // Every other shape the server accepts gets the keys in its own syntax (found by Codex's smoke test, 2026-10-18).
    const map = { ...wolfRequest(), custom_exclude_body: 'reasoning_effort: x' };
    applyHelixMindDefaults(map);
    assert.deepEqual(map.custom_exclude_body.split('\n'), ['reasoning_effort: x', ...STRIPPED.map(key => `${key}: null`)]);
    const flow = { ...wolfRequest(), custom_exclude_body: '[reasoning_effort, "top_p"]' };
    applyHelixMindDefaults(flow);
    assert.deepEqual(flow.custom_exclude_body.slice(1, -1).split(', '), ['reasoning_effort', '"top_p"', ...STRIPPED.filter(key => key !== 'top_p')]);
    const single = { ...wolfRequest(), custom_exclude_body: 'reasoning_effort' };
    applyHelixMindDefaults(single);
    assert.deepEqual(single.custom_exclude_body.split('\n'), ['- reasoning_effort', ...STRIPPED.map(key => `- ${key}`)]);
    const commented = { ...wolfRequest(), custom_exclude_body: '# mine\n- reasoning_effort' };
    applyHelixMindDefaults(commented);
    assert.equal(commented.custom_exclude_body.split('\n')[0], '# mine');
    assert.ok(commented.custom_exclude_body.split('\n').includes('- stop'));
    // Something it cannot read stays exactly as typed.
    const odd = { ...wolfRequest(), custom_exclude_body: 'a:\n  b: 1\n- c' };
    applyHelixMindDefaults(odd);
    assert.equal(odd.custom_exclude_body, 'a:\n  b: 1\n- c');
});

test('every shape of Additional Parameters loses the forbidden keys and keeps the rest', () => {
    const strip = text => stripForbiddenKeys(text);
    // Block list under a plain key, at the same indent, then another key.
    assert.equal(strip('stop:\n- "</think>"\n- "<user>"\ntemperature: 0.9\n'), 'temperature: 0.9\n');
    // List-item key with deeper items, then a following list item.
    assert.equal(strip('- stop:\n    - a\n    - b\n- top_k: 40\n- temperature: 1\n'), '- temperature: 1\n');
    // Flow list on one line, a comment, and a quoted key.
    assert.equal(strip('stop: ["a", "b"]\n# keep me\n"top_p": 0.9\nmax_tokens: 5\n'), '# keep me\nmax_tokens: 5\n');
    // Whole-box JSON map.
    assert.deepEqual(JSON.parse(strip('{"stop": ["x"], "temperature": 0.7, "top_k": 3}')), { temperature: 0.7 });
    // Nothing forbidden: byte-for-byte untouched, including line endings.
    const clean = '- temperature: 0.9\r\n- reasoning: {effort: low}\r\n';
    assert.equal(strip(clean), clean);
    // A key that merely contains a forbidden word is not removed.
    assert.equal(strip('stop_sequences_note: hi\n'), 'stop_sequences_note: hi\n');
});

test('other providers are left exactly as configured', () => {
    for (const data of [
        { ...wolfRequest(), custom_url: 'https://openrouter.ai/api/v1' },
        { ...wolfRequest(), chat_completion_source: 'openrouter' },
        { ...wolfRequest(), custom_url: '' },
    ]) {
        const before = JSON.stringify(data);
        assert.equal(isHelixMindRequest(data), false);
        assert.deepEqual(applyHelixMindDefaults(data), []);
        assert.equal(JSON.stringify(data), before);
    }
    assert.deepEqual(applyHelixMindDefaults(null), []);
});

test('the defaults match what WeyTav ships', () => {
    const settings = JSON.parse(readFileSync(new URL('../../../../../default/content/settings.json', import.meta.url), 'utf8'));
    const oai = settings.oai_settings ?? settings;
    const find = (object, key) => {
        if (!object || typeof object !== 'object') return undefined;
        if (key in object) return object[key];
        for (const value of Object.values(object)) {
            const found = find(value, key);
            if (found !== undefined) return found;
        }
        return undefined;
    };
    assert.equal(find(oai, 'freq_pen_openai'), 0);
    assert.equal(find(oai, 'pres_pen_openai'), 0);
    assert.equal(find(settings, 'request_token_probabilities'), false);
});

test('the extension wires the guard to the final request and hides the token probabilities checkbox', () => {
    const index = readFileSync(new URL('../../weyland-network/index.js', import.meta.url), 'utf8');
    assert.match(index, /eventSource\.on\(event_types\.CHAT_COMPLETION_SETTINGS_READY,[\s\S]*applyHelixMindDefaults\(data\)/);
    const css = readFileSync(new URL('../../weyland-network/style.css', import.meta.url), 'utf8');
    assert.match(css, /label\.checkbox_label\[for="request_token_probabilities"\]\s*\{\s*display:\s*none !important;/);
});
