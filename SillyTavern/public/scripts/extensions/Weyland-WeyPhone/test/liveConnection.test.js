// Phone and app requests follow the player's LIVE connection, like LTM (Lucky, 2026-11-18). Every install ships with
// the HelixMind profile selected, so a player who switched the API panel to OpenRouter kept getting every phone app
// sent to HelixMind. These pin the routing rule and the payload, without a SillyTavern page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolvePhoneProfileId, buildLiveRequestPayload, phoneSendRequest, sendMessageWithFallback, LIVE_CONNECTION } from '../lib/generation.js';

const helixSelected = { selectedProfile: 'helix', profiles: [{ id: 'helix' }, { id: 'other' }] };

test('on Chat Completion the live connection wins over the shipped HelixMind profile', () => {
    assert.equal(resolvePhoneProfileId({ mainApi: 'openai', extensionSettings: { connectionManager: helixSelected } }), LIVE_CONNECTION);
});

test('a profile picked for the phone itself still wins', () => {
    assert.equal(resolvePhoneProfileId({ mainApi: 'openai', extensionSettings: { connectionManager: helixSelected } }, 'other'), 'other');
});

test('Text Completion keeps the old profile lookup (live text settings cannot be posted as chat)', () => {
    assert.equal(resolvePhoneProfileId({ mainApi: 'textgenerationwebui', extensionSettings: { connectionManager: helixSelected } }), 'helix');
    assert.equal(resolvePhoneProfileId({ mainApi: 'kobold', extensionSettings: { connectionManager: { profiles: [] } } }), '');
});

test('the live payload carries the source, custom URL and proxy, and the caller model wins', () => {
    const oai = { chat_completion_source: 'custom', custom_url: 'https://x.test/v1', reverse_proxy: 'https://p.test', proxy_password: 'pw' };
    const p = buildLiveRequestPayload({ oai, messages: [{ role: 'user', content: 'hi' }], maxTokens: 50, liveModel: 'live-model', overridePayload: { model: 'picked' } });
    assert.equal(p.chat_completion_source, 'custom');
    assert.equal(p.custom_url, 'https://x.test/v1');
    assert.equal(p.reverse_proxy, 'https://p.test');
    assert.equal(p.proxy_password, 'pw');
    assert.equal(p.model, 'picked');
    assert.equal(p.max_tokens, 50);
});

test('OpenRouter gets no custom URL, and no model means the live one', () => {
    const p = buildLiveRequestPayload({ oai: { chat_completion_source: 'openrouter', custom_url: 'https://stale.test' }, messages: [], maxTokens: 10, liveModel: 'anthropic/claude-sonnet-4.5' });
    assert.equal(p.chat_completion_source, 'openrouter');
    assert.equal(p.custom_url, undefined);
    assert.equal(p.model, 'anthropic/claude-sonnet-4.5');
});

function fakeContext(calls, fail = false) {
    return {
        mainApi: 'openai',
        chatCompletionSettings: { chat_completion_source: 'openrouter', preset_settings_openai: 'Weyland' },
        getChatCompletionModel: () => 'anthropic/claude-sonnet-4.5',
        ChatCompletionService: {
            async processRequest(payload, options, extract, signal) {
                calls.push({ payload, options, extract, signal });
                if (fail && calls.length === 1) throw new Error('400 bad model');
                return { content: `ok:${payload.model}` };
            },
        },
        ConnectionManagerRequestService: { async sendRequest() { throw new Error('profile path must not be used'); } },
    };
}

test('a live request goes to ChatCompletionService with the chat preset and the abort signal', async () => {
    const calls = [];
    const signal = new AbortController().signal;
    const r = await phoneSendRequest(fakeContext(calls), LIVE_CONNECTION, [{ role: 'user', content: 'hi' }], 99, { signal }, { model: 'm' });
    assert.equal(r.content, 'ok:m');
    assert.equal(calls[0].options.presetName, 'Weyland');
    assert.equal(calls[0].signal, signal);
    assert.equal(calls[0].payload.chat_completion_source, 'openrouter');
});

test('the backup model retries on the live connection too', async () => {
    const calls = [];
    const c = fakeContext(calls, true);
    const r = await sendMessageWithFallback({
        sendRequest: (id, msgs, model) => phoneSendRequest(c, id, msgs, 50, undefined, model ? { model } : {}),
        profileId: LIVE_CONNECTION, messages: [{ role: 'user', content: 'hi' }], model: 'first', fallbackModel: 'second',
    });
    assert.equal(r.content, 'ok:second');
    assert.equal(calls.length, 2);
});

test('a failed live request is wrapped like the profile path, with the real error as the cause', async () => {
    const c = fakeContext([], true);
    await assert.rejects(phoneSendRequest(c, LIVE_CONNECTION, [], 5), e => e.message === 'API request failed' && /400 bad model/.test(e.cause?.message));
});

test('no phone request in index.js goes around phoneSendRequest', () => {
    const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    assert.equal(/ConnectionManagerRequestService\.sendRequest\(/.test(src), false);
    assert.equal(/\bresolveProfileId\(/.test(src), false);
});
