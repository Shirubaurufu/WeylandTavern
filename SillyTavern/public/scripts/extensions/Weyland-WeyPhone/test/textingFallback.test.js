import test from 'node:test';
import assert from 'node:assert/strict';
import { sendMessageWithFallback } from '../lib/generation.js';

const messages = [{ role: 'system', content: 'Texting instructions' }, { role: 'user', content: 'Hello' }];

test('texting retries once on the backup without replacing the primary or mutating messages', async () => {
    const calls = [];
    const original = structuredClone(messages);
    const options = {
        profileId: 'profile', messages, model: 'glm-4.7-thinking', fallbackModel: 'claude-sonnet-4-6',
        sendRequest: async (profile, requestMessages, model) => {
            calls.push({ profile, requestMessages, model });
            if (calls.length === 1) throw new Error('Unavailable');
            return 'Reply';
        },
    };
    assert.equal(await sendMessageWithFallback(options), 'Reply');
    assert.deepEqual(calls.map(call => call.model), ['glm-4.7-thinking', 'claude-sonnet-4-6']);
    assert.ok(calls.every(call => call.profile === 'profile'));
    assert.deepEqual(calls[1].requestMessages, original);
    assert.deepEqual(messages, original);
    assert.equal(options.model, 'glm-4.7-thinking');
});

test('a successful primary never calls the backup', async () => {
    let calls = 0;
    assert.equal(await sendMessageWithFallback({ profileId: 'profile', messages, model: 'primary', fallbackModel: 'backup',
        sendRequest: async () => { calls++; return 'Reply'; },
    }), 'Reply');
    assert.equal(calls, 1);
});

test('disabled, duplicate and cancelled backups do not retry', async () => {
    for (const [fallbackModel, error] of [['', new Error('Failed')], ['primary', new Error('Failed')],
        ['backup', Object.assign(new Error('Cancelled'), { name: 'AbortError' })]]) {
        let calls = 0;
        await assert.rejects(sendMessageWithFallback({ profileId: 'profile', messages, model: 'primary', fallbackModel,
            sendRequest: async () => { calls++; throw error; },
        }), error);
        assert.equal(calls, 1);
    }
});

test('backup failure propagates after exactly two attempts', async () => {
    let calls = 0;
    const error = new Error('Backup unavailable');
    await assert.rejects(sendMessageWithFallback({ profileId: 'profile', messages, model: 'primary', fallbackModel: 'backup',
        sendRequest: async () => { calls++; throw error; },
    }), error);
    assert.equal(calls, 2);
});
