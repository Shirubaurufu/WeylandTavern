import test from 'node:test';
import assert from 'node:assert/strict';
import { copyTextToClipboard } from '../lib/clipboard.js';

function fakeDocument(copyResult) {
    let removed = false;
    const textarea = {
        style: {},
        setAttribute() {}, focus() {}, select() {}, setSelectionRange() {},
        remove() { removed = true; },
    };
    return {
        documentApi: {
            body: { appendChild() {} }, activeElement: { focus() {} },
            createElement: () => textarea,
            execCommand: command => command === 'copy' && copyResult,
        },
        textarea,
        wasRemoved: () => removed,
    };
}

test('copyTextToClipboard prefers the synchronous textarea path', async () => {
    const fake = fakeDocument(true);
    let modernCalled = false;
    const copied = await copyTextToClipboard('prompt', {
        documentApi: fake.documentApi,
        navigatorApi: { clipboard: { writeText: async () => { modernCalled = true; } } },
    });
    assert.equal(copied, true);
    assert.equal(fake.textarea.value, 'prompt');
    assert.equal(fake.wasRemoved(), true);
    assert.equal(modernCalled, false);
});

test('copyTextToClipboard falls back to the modern API', async () => {
    const fake = fakeDocument(false);
    let value = '';
    assert.equal(await copyTextToClipboard('prompt', {
        documentApi: fake.documentApi,
        navigatorApi: { clipboard: { writeText: async text => { value = text; } } },
    }), true);
    assert.equal(value, 'prompt');
});

test('copyTextToClipboard reports failure when no copy route exists', async () => {
    assert.equal(await copyTextToClipboard('prompt', { documentApi: {}, navigatorApi: {} }), false);
});
