// Gemini Bypass is model-aware at send time (2026-10-03): Claude's classifier blocks the bypass
// text (it talks about reasoning/analysis), so a Claude model never receives it, even with the
// PromptOS toggle on, while Gemini still does. The check runs per request, after Weyland-Router has
// rolled its model, so a mixed Gemini/Sonnet pool gets the right prompt on every roll.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyGeminiBypass, applyGeminiBypassForModel, GEMINI_BYPASS_PROMPT, isClaudeModel, stripGeminiBypassFromMessages, stripGeminiExplicitBox } from '../../quick-reply-ext/src/promptModifiers.js';
import { WEYPHONE_GEMINI_BYPASS, withGeminiBypass } from '../lib/phonePromptPolicy.js';
import { sendMessage } from '../lib/generation.js';
import { sendMemoryRequest } from '../lib/memoryGeneration.js';

test('Claude family is recognised by name across provider id styles', () => {
    for (const id of ['claude-sonnet-5', 'claude-opus-5-5', 'claude-haiku-4-5-20251001', 'claude-fable-5-1',
        'anthropic/claude-3.7-sonnet', 'Sonnet 5', 'OPUS', 'fable']) {
        assert.equal(isClaudeModel(id), true, id);
    }
    for (const id of ['gemini-3.1-pro', 'gemini-3.8-flash', 'google/gemma-3-27b', 'mimo-v2', 'deepseek-chat',
        'glm-5', 'minimax-m3', '', undefined, null]) {
        assert.equal(isClaudeModel(id), false, String(id));
    }
});

test('the roleplay bypass no longer names Claude (Claude never receives it)', () => {
    assert.doesNotMatch(GEMINI_BYPASS_PROMPT, /CLAUDE/);
    assert.match(GEMINI_BYPASS_PROMPT, /GEMINI/);
});

test('stripGeminiBypassFromMessages removes exactly the bypass and its blank line', () => {
    const teg = 'You are the narrator of Weyland.\n\nRules...';
    const messages = [
        { role: 'system', content: applyGeminiBypass(teg, true) },
        { role: 'user', content: 'hi' },
    ];
    assert.equal(stripGeminiBypassFromMessages(messages), 1);
    assert.equal(messages[0].content, teg);
    assert.equal(messages[1].content, 'hi');
    // Nothing to strip is a no-op.
    assert.equal(stripGeminiBypassFromMessages(messages), 0);
    assert.equal(messages[0].content, teg);
});

test('stripGeminiBypassFromMessages finds it inside squashed and multipart content', () => {
    const squashed = { role: 'system', content: `Loona coach text\n${GEMINI_BYPASS_PROMPT}\n\nBody` };
    const multipart = { role: 'system', content: [{ type: 'text', text: `${GEMINI_BYPASS_PROMPT}\n\nBody` }, { type: 'image_url', image_url: { url: 'x' } }] };
    assert.equal(stripGeminiBypassFromMessages([squashed, multipart, null]), 2);
    assert.equal(squashed.content, 'Loona coach text\nBody');
    assert.equal(multipart.content[0].text, 'Body');
    assert.equal(stripGeminiBypassFromMessages(undefined), 0);
});

test('quick-reply-ext applies the bypass per model at CHAT_COMPLETION_SETTINGS_READY', () => {
    const source = fs.readFileSync(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    assert.match(source, /eventSource\.on\(event_types\.CHAT_COMPLETION_SETTINGS_READY, OnRequestReady\)/);
    const handler = source.slice(source.indexOf('function OnRequestReady'), source.indexOf('function OnRequestReady') + 600);
    assert.match(handler, /applyGeminiBypassForModel\(data\.messages, data\.model\)/);
});

// Real Beta box 6, with the toggle on: assembly keeps it whole, send time decides per model.
test('box 6: Claude keeps the warm-up, Gemini loses it, toggle off touches nothing', async () => {
    const { ravs } = await import('../../quick-reply-ext/src/promptRegistry.js');
    const { assemblePromptLayers, preparePromptBase } = await import('../../quick-reply-ext/src/promptAssembly.js');
    const beta = ravs.get('Beta Prompt');
    const base = preparePromptBase('Beta Prompt', beta, beta);
    const on = assemblePromptLayers(base, beta, { analysisOn: true, geminiBypassEnabled: true }).teg;
    assert.match(on, /VULGARITY IS AUTHENTICITY/, 'assembly no longer cuts box 6');
    assert.ok(on.startsWith(GEMINI_BYPASS_PROMPT));
    const payload = () => [{ role: 'system', content: on }, { role: 'user', content: 'hi' }];

    const claude = payload();
    assert.deepEqual(applyGeminiBypassForModel(claude, 'claude-sonnet-5'), { bypassRemoved: 1, box6Cut: 0 });
    assert.equal(claude[0].content, on.slice(GEMINI_BYPASS_PROMPT.length + 2));
    assert.match(claude[0].content, /VULGARITY IS AUTHENTICITY/);
    assert.match(claude[0].content, /STILL cussing/);

    const gemini = payload();
    assert.deepEqual(applyGeminiBypassForModel(gemini, 'gemini-3.1-pro'), { bypassRemoved: 0, box6Cut: 1 });
    assert.equal(gemini[0].content, stripGeminiExplicitBox(on));
    assert.ok(gemini[0].content.startsWith(GEMINI_BYPASS_PROMPT));
    assert.doesNotMatch(gemini[0].content, /VULGARITY IS AUTHENTICITY|STILL cussing/);
    assert.match(gemini[0].content, /Long One \[6\/6\]/);

    const off = assemblePromptLayers(base, beta, { analysisOn: true, geminiBypassEnabled: false }).teg;
    const offPayload = [{ role: 'system', content: off }];
    assert.deepEqual(applyGeminiBypassForModel(offPayload, 'gemini-3.1-pro'), { bypassRemoved: 0, box6Cut: 0 });
    assert.equal(offPayload[0].content, off);
});

test('WeyPhone keeps its bypass for Gemini or an unknown model, drops it for Claude', () => {
    const messages = [{ role: 'system', content: 'Phone prompt' }, { role: 'user', content: 'hey' }];
    assert.ok(withGeminiBypass(messages, 'gemini-3.8-flash')[0].content.startsWith(WEYPHONE_GEMINI_BYPASS));
    assert.ok(withGeminiBypass(messages)[0].content.startsWith(WEYPHONE_GEMINI_BYPASS));
    const forClaude = withGeminiBypass(messages, 'claude-sonnet-5');
    assert.equal(forClaude[0].content, 'Phone prompt');
    // Already-wrapped messages get the text taken back out, and a bypass-only system message goes.
    const wrapped = withGeminiBypass([{ role: 'user', content: 'hey' }], 'gemini-3.8-flash');
    assert.deepEqual(withGeminiBypass(wrapped, 'claude-sonnet-5'), [{ role: 'user', content: 'hey' }]);
    assert.equal(messages[0].content, 'Phone prompt', 'caller array untouched');
});

// Plain text join, not JSON.stringify: the bypass contains a newline, which JSON would escape.
const hasBypass = msgs => msgs.map(message => String(message.content ?? '')).join('\n').includes(WEYPHONE_GEMINI_BYPASS);

test('WeyPhone send helpers pass the request model through to the bypass check', async () => {
    let sent;
    await sendMessage({ sendRequest: (_id, msgs) => { sent = msgs; }, profileId: 'p', messages: [{ role: 'system', content: 'S' }], model: 'claude-sonnet-5' });
    assert.equal(hasBypass(sent), false);
    assert.equal(sent[0].content, 'S');
    await sendMessage({ sendRequest: (_id, msgs) => { sent = msgs; }, profileId: 'p', messages: [{ role: 'system', content: 'S' }], model: 'gemini-3.8-flash' });
    assert.equal(hasBypass(sent), true);

    // Memory: Gemini primary fails, Claude backup must not carry the bypass.
    const calls = [];
    await sendMemoryRequest({
        sendRequest: (_id, msgs, model) => { calls.push({ model, msgs }); if (model.startsWith('gemini')) throw new Error('down'); return 'ok'; },
        profileId: 'p', messages: [{ role: 'system', content: 'S' }], primaryModel: 'gemini-3.8-flash', backupModel: 'claude-haiku-4-5',
    });
    assert.equal(hasBypass(calls[0].msgs), true);
    assert.equal(hasBypass(calls[1].msgs), false);
});

test('every WeyPhone sendMessage call site tells the helper its model', () => {
    const source = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    const calls = source.split('sendMessage({').slice(1);
    assert.ok(calls.length >= 5);
    for (const call of calls) {
        // The call's own closing "});" comes after a "model," / "model: x," line.
        assert.match(call.slice(0, 900), /\n\s+model(: \w+)?,\r?\n\s+\}\);/, `call site missing model: ${call.slice(0, 120)}`);
    }
});
