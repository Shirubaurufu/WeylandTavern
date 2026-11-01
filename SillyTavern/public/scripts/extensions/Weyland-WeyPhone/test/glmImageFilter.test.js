import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { omitGlmImages } from '../../../glm-image-filter.js';

const image = () => ({ type: 'image_url', image_url: { url: 'data:image/png;base64,OLD_IMAGE_PAYLOAD', detail: 'high' } });
const text = value => ({ type: 'text', text: value });
const freeze = value => {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};

test('a switch from Sonnet to GLM omits old and current images while keeping text, history order and saved objects', () => {
    const messages = freeze([
        { role: 'system', content: 'System' },
        { role: 'user', content: [text('look at this old photo'), image()], name: 'Lucky' },
        ...Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', content: `turn ${i}` })),
        { role: 'user', content: [image(), text('Keep this\ntext exactly.'), image(), text('And this.')] },
    ]);
    const request = freeze({ model: 'glm-5', stream: false, max_tokens: 4000, messages });
    const stripped = omitGlmImages(request);
    assert.notEqual(stripped, request);
    assert.equal(stripped.messages[1].content, 'look at this old photo');
    assert.equal(stripped.messages[1].name, 'Lucky');
    assert.equal(stripped.messages.at(-1).content, 'Keep this\ntext exactly.\nAnd this.');
    assert.equal(stripped.messages.length, messages.length);
    assert.equal(stripped.messages[0], messages[0]);
    assert.equal(stripped.messages[10], messages[10]);
    assert.equal(stripped.stream, false);
    assert.equal(stripped.max_tokens, 4000);
    assert.doesNotMatch(JSON.stringify(stripped), /OLD_IMAGE_PAYLOAD|image_url/);
    assert.equal(omitGlmImages(stripped), stripped, 'idempotent');
    const sonnet = { ...request, model: 'claude-sonnet-4-5' };
    assert.equal(omitGlmImages(sonnet), sonnet);
    assert.equal(sonnet.messages, messages, 'switching back to Sonnet retains the original images');
});

test('GLM version and namespace aliases are detected; unrelated and unknown models never inspect messages', () => {
    for (const model of ['glm-4.7', 'glm-4.7-thinking', 'glm-5', 'glm-5.1', 'GLM-5-THINKING', 'z-ai/glm-5', 'zhipuai/GLM-4.7', 'GLM 5', 'glm5', 'glm']) {
        assert.equal(omitGlmImages({ model, messages: [{ role: 'user', content: [image(), text('hello')] }] }).messages[0].content, 'hello', model);
    }
    for (const model of ['claude-sonnet-4.5-rp2', 'gemini-3.8-flash', 'gpt-5', 'not-glm-5', 'myglm-5', 'glmish', '', undefined]) {
        const payload = { model, get messages() { throw new Error('must not inspect non-GLM history'); } };
        assert.equal(omitGlmImages(payload), payload, model);
    }
});

test('text-only GLM requests are returned by identity, including multipart text and tools', () => {
    for (const messages of [[], [{ role: 'user', content: 'hello' }], [{ role: 'user', content: [text('hello')] }],
        [{ role: 'assistant', content: null, tool_calls: [{ id: 'call-1' }] }, { role: 'tool', tool_call_id: 'call-1', content: 'done' }]]) {
        const payload = freeze({ model: 'glm-5', messages });
        assert.equal(omitGlmImages(payload), payload);
    }
    for (const payload of [undefined, null, {}, { model: 'glm-5', messages: 'legacy prompt' }]) assert.equal(omitGlmImages(payload), payload);
});

test('image-only turns are omitted, tool IDs survive, and other media or ordinary image links are kept', () => {
    const audio = { type: 'input_audio', input_audio: { data: 'keep audio', format: 'wav' } };
    const payload = freeze({ model: 'glm-5', messages: [
        { role: 'user', content: [image()] },
        { role: 'assistant', content: [{ type: 'image', source: { data: 'drop this too' } }], tool_calls: [{ id: 'call-1' }] },
        { role: 'tool', tool_call_id: 'call-1', content: [{ type: 'input_image', image_url: 'https://example.test/photo.png' }] },
        { role: 'user', content: [audio, image(), text('listen')] },
        { role: 'user', content: '![caption](https://example.test/photo.png)' },
        { role: 'user', content: [text('  '), image()] },
    ] });
    const stripped = omitGlmImages(payload);
    assert.equal(stripped.messages.length, 4);
    assert.equal(stripped.messages[0].content, '');
    assert.deepEqual(stripped.messages[0].tool_calls, [{ id: 'call-1' }]);
    assert.equal(stripped.messages[1].tool_call_id, 'call-1');
    assert.equal(stripped.messages[1].content, '');
    assert.equal(stripped.messages[2].content[0], audio);
    assert.equal(stripped.messages[2].content[1].text, 'listen');
    assert.equal(stripped.messages[3], payload.messages[4]);
});

test('filtering never reads image bytes or searches ordinary message text', () => {
    const part = { type: 'image_url', get image_url() { throw new Error('must not read image data'); } };
    const plain = { role: 'assistant', get content() { return 'data:image/png;base64,ordinary text'; } };
    const payload = { model: 'glm-5', messages: [plain, { role: 'user', content: [part, text('hello')] }] };
    assert.equal(omitGlmImages(payload).messages[1].content, 'hello');
    assert.equal(omitGlmImages(payload).messages[0], plain);
});

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const captureStop = new Error('captured before network');

function mainSender(initialModel, finalModel, messages, stream = false) {
    const source = read('../../../openai.js');
    const start = source.indexOf('async function sendOpenAIRequest(');
    const sender = source.slice(start, source.indexOf('\n}', start) + 2);
    let sent;
    const context = {
        omitGlmImages, AbortController, lastRequestModel: null,
        oai_settings: { chat_completion_source: 'custom', stream_openai: stream, n: 1, custom_url: 'https://example.test/v1', openai_max_tokens: 100 },
        chat_completion_sources: { CUSTOM: 'custom' }, power_user: {},
        ToolManager: { canPerformToolCalls: () => false, isToolCallingSupported: () => false },
        getChatCompletionModel: () => initialModel, getReasoningEffort: () => '',
        getCustomStoppingStrings: () => [], openai_max_stop_strings: 4,
        getGroupNames: () => [], name1: 'Lucky', name2: 'Summer',
        event_types: { CHAT_COMPLETION_SETTINGS_READY: 'ready' },
        eventSource: { emit: async (_event, data) => { data.model = finalModel; } },
        getRequestHeaders: () => ({}),
        fetch: async (_url, options) => { sent = JSON.parse(options.body); throw captureStop; },
    };
    vm.createContext(context);
    vm.runInContext(sender + '\nthis.send = sendOpenAIRequest;', context);
    return { run: () => context.send('normal', messages), sent: () => sent };
}

test('main send path filters the actual routed model before serialization for streaming and non-streaming', async () => {
    const messages = freeze([{ role: 'user', content: [text('hello'), image()] }]);
    for (const stream of [true, false]) {
        const glm = mainSender('claude-sonnet-4-5', 'glm-5', messages, stream);
        await assert.rejects(glm.run(), error => error === captureStop);
        assert.equal(glm.sent().model, 'glm-5');
        assert.equal(glm.sent().messages[0].content, 'hello');
        assert.equal(glm.sent().stream, stream);
        const claude = mainSender('glm-5', 'claude-sonnet-4-5', messages, stream);
        await assert.rejects(claude.run(), error => error === captureStop);
        assert.equal(claude.sent().messages[0].content[1].type, 'image_url');
    }
});

test('connection-profile send path also filters before serialization, keeping its original request reusable', async () => {
    const source = read('../../../custom-request.js');
    const start = source.indexOf('export class ChatCompletionService');
    const service = source.slice(start, source.indexOf('\n}', start) + 2).replace('export ', '');
    let sent;
    const context = { omitGlmImages, AbortController, getRequestHeaders: () => ({}),
        fetch: async (_url, options) => { sent = JSON.parse(options.body); throw captureStop; } };
    vm.createContext(context);
    vm.runInContext(service + '\nthis.service = ChatCompletionService;', context);
    for (const stream of [false, true]) {
        const request = freeze({ model: 'glm-4.7-thinking', stream, messages: [{ role: 'user', content: [image(), text('hello')] }] });
        await assert.rejects(context.service.sendRequest(request), error => error === captureStop);
        assert.equal(sent.messages[0].content, 'hello');
        assert.equal(request.messages[0].content[0].type, 'image_url');
    }
});
