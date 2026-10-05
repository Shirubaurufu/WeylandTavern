import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_REGISTRY, getApp, getSyncApps, getAppBySyncSection, resolveAppLabel } from '../lib/appRegistry.js';

test('registry keys are unique and neutral (no real-world brand keys)', () => {
    const keys = APP_REGISTRY.map(a => a.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const legacy of ['twitter', 'discord', 'yikyak', 'aethel']) {
        assert.ok(!keys.includes(legacy), `${legacy} not in registry`);
    }
});

test('sync apps are exactly the four content apps, in prompt order', () => {
    assert.deepEqual(getSyncApps().map(a => a.key), ['chronicle', 'feed', 'chat', 'board']);
});

test('getAppBySyncSection maps response markers back to apps', () => {
    assert.equal(getAppBySyncSection('CHRONICLE').key, 'chronicle');
    assert.equal(getAppBySyncSection('FEED').key, 'feed');
    assert.equal(getAppBySyncSection('CHAT').key, 'chat');
    assert.equal(getAppBySyncSection('BOARD').key, 'board');
    assert.equal(getAppBySyncSection('NOPE'), undefined);
});

test('resolveAppLabel prefers the settings override, falls back to registry, then key', () => {
    assert.equal(resolveAppLabel({}, 'feed'), 'Chitter');
    assert.equal(resolveAppLabel({ appLabels: { feed: 'Pawstragram' } }, 'feed'), 'Pawstragram');
    assert.equal(resolveAppLabel({}, 'not-an-app'), 'not-an-app');
});

test('getApp returns full definitions with icon and accent', () => {
    const chat = getApp('chat');
    assert.equal(chat.label, 'Discorgi');
    assert.match(chat.icon, /weyphone_discord\.webp$/);
    assert.match(chat.accent, /^#[0-9A-Fa-f]{6}$/);
});

test('the rewrite app is presented as Copycat with its cat icon', () => {
    const copycat = getApp('understudy');
    assert.equal(copycat.label, 'Copycat');
    assert.match(copycat.icon, /weyphone_copycat\.webp$/);
    assert.doesNotMatch(JSON.stringify(copycat), /encore/i);
});

test('the storytelling settings app is presented as PromptOS', () => {
    const promptOs = getApp('narrative');
    assert.equal(promptOs.label, 'PromptOS');
    assert.equal(promptOs.screenView, 'narrative');
    assert.match(promptOs.icon, /weyphone_promptos_control-core\.webp$/);
});

test('emptyStateCopy gives each sync app distinct diegetic copy with a fallback', async () => {
    const { emptyStateCopy, EMPTY_STATE_FALLBACK } = await import('../lib/appRegistry.js');
    const texts = ['chronicle', 'feed', 'chat', 'board'].map(emptyStateCopy);
    assert.equal(new Set(texts).size, 4);
    for (const text of texts) assert.notEqual(text, EMPTY_STATE_FALLBACK);
    assert.equal(emptyStateCopy('unknown-app'), EMPTY_STATE_FALLBACK);
});
