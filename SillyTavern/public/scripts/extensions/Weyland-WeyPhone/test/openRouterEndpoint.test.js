import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { isLocalOllamaEndpoint } from '../../adj/localOllama.js';
import { applyHelixMindDefaults } from '../../weyland-network/helixRequestDefaults.js';
import { mergeObjectWithYaml } from '../../../../../src/util.js';

const source = readFileSync(new URL('../../adj/index.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '');

function harness() {
    let sent;
    const originalFetch = async (url, request) => {
        sent = { url, body: request.body ? JSON.parse(request.body) : undefined };
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    };
    const context = {
        window: { fetch: originalFetch }, isLocalOllamaEndpoint,
        getGlobalVariable: () => '', substituteParams: text => text,
        power_user: { user_prompt_bias: '' }, Response, Headers, console,
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return {
        async send(endpoint, overrides = {}) {
            await context.window.fetch('/api/backends/chat-completions/generate', {
                method: 'POST',
                body: JSON.stringify({ chat_completion_source: 'custom', custom_url: endpoint,
                    model: 'openai/gpt-5:floor', stream: false, messages: [{ role: 'user', content: 'hello' }], ...overrides }),
            });
            return sent;
        },
    };
}

test('OpenRouter custom endpoints pass the real request gate with model variants and service tiers intact', async () => {
    const h = harness();
    for (const endpoint of ['https://openrouter.ai/api/v1', 'https://openrouter.ai/api/v1/']) {
        for (const stream of [false, true]) {
            const { body } = await h.send(endpoint, { stream, custom_include_body: 'service_tier: flex\nprovider:\n  sort: price' });
            assert.ok(body, endpoint);
            assert.equal(body.custom_url, endpoint);
            assert.equal(body.model, 'openai/gpt-5:floor');
            assert.equal(body.stream, stream);
            assert.deepEqual(body.messages, [{ role: 'user', content: 'hello' }]);
            assert.equal(body.custom_include_body, 'service_tier: flex\nprovider:\n  sort: price');
            assert.deepEqual(applyHelixMindDefaults(body), [], 'HelixMind-specific defaults do not apply');
            const upstreamExtras = {};
            mergeObjectWithYaml(upstreamExtras, body.custom_include_body);
            assert.equal(upstreamExtras.service_tier, 'flex');
            assert.equal(upstreamExtras.provider.sort, 'price');
        }
    }
});

test('provider gate still accepts existing custom endpoints and local Ollama', async () => {
    const h = harness();
    for (const endpoint of ['https://helixmind.online/v1', 'https://api.electronhub.ai/v1',
        'https://api.z.ai/api/coding/paas/v4', 'https://llm.chutes.ai/v1', 'http://localhost:11434/v1']) {
        assert.ok((await h.send(endpoint)).body, endpoint);
    }
});

test('adding OpenRouter does not admit unrelated hosts or lookalike URLs', async () => {
    const h = harness();
    for (const endpoint of ['https://example.test/api/v1', 'http://openrouter.ai/api/v1',
        'https://openrouter.ai.evil.test/api/v1', 'https://openrouter.ai@evil.test/api/v1',
        'https://evil.test/path/https://openrouter.ai/api/v1']) {
        assert.equal((await h.send(endpoint)).body, undefined, endpoint);
    }
});

test('native OpenRouter connection requests continue to bypass the custom endpoint gate', async () => {
    const h = harness();
    assert.ok((await h.send(undefined, { chat_completion_source: 'openrouter' })).body);
});
