import test from 'node:test';
import assert from 'node:assert/strict';
import { getPhoneAppContent, setPhoneAppContent } from '../lib/phoneApps.js';

test('getPhoneAppContent returns undefined when nothing has been cached for that chatId', () => {
    const settings = { phoneApps: {} };
    assert.equal(getPhoneAppContent(settings, 'chat_1', 'chronicle'), undefined);
});

test('getPhoneAppContent returns undefined when the chatId exists but not that app', () => {
    const settings = { phoneApps: { chat_1: { chronicle: { content: 'x', generatedAt: 1 } } } };
    assert.equal(getPhoneAppContent(settings, 'chat_1', 'twitter'), undefined);
});

test('setPhoneAppContent stores content, retrievable via getPhoneAppContent', () => {
    const settings = { phoneApps: {} };
    setPhoneAppContent(settings, 'chat_1', 'chronicle', { content: 'headline text', generatedAt: 12345 });
    assert.deepEqual(getPhoneAppContent(settings, 'chat_1', 'chronicle'), { content: 'headline text', generatedAt: 12345 });
});

test('setPhoneAppContent keeps separate apps under the same chatId independent', () => {
    const settings = { phoneApps: {} };
    setPhoneAppContent(settings, 'chat_1', 'chronicle', { content: 'chronicle content', generatedAt: 1 });
    setPhoneAppContent(settings, 'chat_1', 'twitter', { content: 'twitter content', generatedAt: 2 });
    assert.equal(getPhoneAppContent(settings, 'chat_1', 'chronicle').content, 'chronicle content');
    assert.equal(getPhoneAppContent(settings, 'chat_1', 'twitter').content, 'twitter content');
});

test('setPhoneAppContent keeps separate chatIds independent', () => {
    const settings = { phoneApps: {} };
    setPhoneAppContent(settings, 'chat_1', 'chronicle', { content: 'A', generatedAt: 1 });
    setPhoneAppContent(settings, 'chat_2', 'chronicle', { content: 'B', generatedAt: 2 });
    assert.equal(getPhoneAppContent(settings, 'chat_1', 'chronicle').content, 'A');
    assert.equal(getPhoneAppContent(settings, 'chat_2', 'chronicle').content, 'B');
});

test('setPhoneAppContent overwrites a previous cache entry for the same chatId/app', () => {
    const settings = { phoneApps: {} };
    setPhoneAppContent(settings, 'chat_1', 'chronicle', { content: 'old', generatedAt: 1 });
    setPhoneAppContent(settings, 'chat_1', 'chronicle', { content: 'new', generatedAt: 2 });
    assert.deepEqual(getPhoneAppContent(settings, 'chat_1', 'chronicle'), { content: 'new', generatedAt: 2 });
});

test('setPhoneAppContent/getPhoneAppContent round-trip chatMessageCountAtGeneration', () => {
    const settings = { phoneApps: {} };
    setPhoneAppContent(settings, 'chat_1', 'chronicle', { content: 'x', generatedAt: 1, chatMessageCountAtGeneration: 42 });
    assert.equal(getPhoneAppContent(settings, 'chat_1', 'chronicle').chatMessageCountAtGeneration, 42);
});
