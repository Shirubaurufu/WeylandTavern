import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_NAME, defaultSettings, getSettings, resetSettings } from '../lib/config.js';

test('MODULE_NAME is WeyPhone', () => {
    assert.equal(MODULE_NAME, 'WeyPhone');
});

test('getSettings creates the settings object on first call', () => {
    const extensionSettings = {};
    const settings = getSettings(extensionSettings);
    assert.deepEqual(settings, defaultSettings);
    assert.equal(extensionSettings[MODULE_NAME], settings);
    assert.equal(settings.contactRenames.Loona, '[REDACTED]');
});

test('existing phones backfill Loona as redacted without replacing custom contact names', () => {
    const extensionSettings = { [MODULE_NAME]: { conversations: {}, contactRenames: { Gru: 'G' } } };
    const settings = getSettings(extensionSettings);
    assert.equal(settings.contactRenames.Loona, '[REDACTED]');
    assert.equal(settings.contactRenames.Gru, 'G');
});

test('getSettings backfills newly-added default keys without clobbering existing values', () => {
    const extensionSettings = {
        [MODULE_NAME]: { debug: true, conversations: {} },
    };
    const settings = getSettings(extensionSettings);
    assert.equal(settings.debug, true);
    assert.equal(settings.connectionProfileId, '');
    assert.equal(settings.kressaPalette, 'twilight');
    assert.equal(settings.phoneHardModeEnabled, false);
    assert.deepEqual(settings.generationRateLimitEvents, []);
    assert.equal(settings.kressaHardModeEnabled, false);
    assert.equal(settings.pawxai.promptCount, 5);
    assert.equal(settings.pawxai.modelOverride, 'gemini-3.8-flash');
    assert.equal(settings.pawxai.fallbackModel, 'minimax-m3');
    assert.equal(settings.pawxai.palette, 'orchid-night');
    // Primary defaults moved to 3.8-flash; MiniMax M3 is now the retry-once fallback.
    assert.equal(settings.modelOverride, 'gemini-3.8-flash');
    assert.equal(settings.textingModelOverride, 'gemini-3.8-flash');
    assert.equal(settings.fallbackModelOverride, 'minimax-m3');
    assert.equal(settings.textingFallbackModel, 'minimax-m3');
    assert.equal(settings.kressaFallbackModel, 'minimax-m3');
});

test('getSettings migrates PawXai original defaults to five prompts without clobbering later choices', () => {
    const legacy = { [MODULE_NAME]: { conversations: {}, pawxai: { promptCount: 3 } } };
    assert.equal(getSettings(legacy).pawxai.promptCount, 5);

    const customized = { [MODULE_NAME]: { conversations: {}, pawxai: { promptCount: 3, palette: 'bluebell' } } };
    assert.equal(getSettings(customized).pawxai.promptCount, 3);
});

test('getSettings migrates the former shared generation model into the new texting model setting', () => {
    const extensionSettings = {
        [MODULE_NAME]: { modelOverride: 'custom-phone-model', conversations: {}, ui: { wallpaper: 'violet' } },
    };
    const settings = getSettings(extensionSettings);
    assert.equal(settings.modelOverride, 'custom-phone-model');
    assert.equal(settings.textingModelOverride, 'custom-phone-model');
    assert.equal(settings.ui.wallpaper, 'violet');
    assert.equal(settings.ui.wallpaperPositionX, 50);
    assert.equal(settings.ui.wallpaperDim, 20);
    assert.equal(settings.ui.wallpaperLightWash, 0);
});

test('resetSettings erases all WeyPhone data in place and restores first-time defaults', () => {
    const extensionSettings = {};
    const settings = getSettings(extensionSettings);
    settings.conversations.conv = { id: 'conv', messages: [{ role: 'user', content: 'secret' }] };
    settings.phoneApps.chat = { feed: { content: 'cached' } };
    settings.ui.notes = [{ id: 'note', text: 'remember this' }];
    settings.ui.onboarded = true;
    settings.extraLegacyKey = true;

    const reset = resetSettings(extensionSettings);
    assert.equal(reset, settings);
    assert.deepEqual(reset, defaultSettings);
    assert.equal(reset.ui.onboarded, false);
    assert.equal('notes' in reset.ui, false);
    assert.equal('extraLegacyKey' in reset, false);
});

test('getSettings migrates milestone-1-era conversations (keyed by charName, no id) into the current shape', () => {
    const extensionSettings = {
        [MODULE_NAME]: { debug: true, conversations: { Rosa: { messages: ['x'], lastActive: 123 } } },
    };
    const settings = getSettings(extensionSettings);
    assert.equal(settings.conversations.Rosa, undefined);
    const migrated = Object.values(settings.conversations)[0];
    assert.equal(migrated.charName, 'Rosa');
    assert.deepEqual(migrated.messages, ['x']);
    assert.equal(migrated.lastActive, 123);
});

test('getSettings returns the same live object on repeated calls', () => {
    const extensionSettings = {};
    const first = getSettings(extensionSettings);
    first.debug = true;
    const second = getSettings(extensionSettings);
    assert.equal(second.debug, true);
});

test('getSettings backfills memory fields on a pre-milestone-5 conversation', () => {
    const extensionSettings = {
        [MODULE_NAME]: { conversations: { conv_1: { id: 'conv_1', charName: 'Rosa', messages: [], createdAt: 1, lastActive: 1 } } },
    };
    const settings = getSettings(extensionSettings);
    const conversation = settings.conversations.conv_1;
    assert.deepEqual(conversation.memories, []);
    assert.equal(conversation.memoryThreshold, 100);
});

test('getSettings backfills tethered fields on a pre-milestone-6 conversation', () => {
    const extensionSettings = {
        [MODULE_NAME]: { conversations: { conv_1: { id: 'conv_1', charName: 'Rosa', messages: [], createdAt: 1, lastActive: 1 } } },
    };
    const settings = getSettings(extensionSettings);
    const conversation = settings.conversations.conv_1;
    assert.equal(conversation.tethered, false);
    assert.equal(conversation.tetheredHistoryCap, null);
});

test('getSettings backfills the new phoneApps cache on pre-milestone-7 settings', () => {
    const extensionSettings = { [MODULE_NAME]: { conversations: {} } };
    const settings = getSettings(extensionSettings);
    assert.deepEqual(settings.phoneApps, {});
});

test('migrateRemoveAethel deletes aethel dedicated-app conversations and Aethel-named threads', async () => {
    const { migrateRemoveAethel } = await import('../lib/config.js');
    const settings = {
        conversations: {
            conv_1: { id: 'conv_1', charName: 'Aethel', isDedicatedApp: 'aethel', messages: [] },
            conv_2: { id: 'conv_2', charName: 'Aethel', messages: [] },
            conv_3: { id: 'conv_3', charName: 'Rosa', messages: [] },
        },
    };
    migrateRemoveAethel(settings);
    assert.deepEqual(Object.keys(settings.conversations), ['conv_3']);
});

test('migrateRemoveAethel scrubs Aethel from a pre-filter cast-directory cache', async () => {
    const { migrateRemoveAethel } = await import('../lib/config.js');
    const settings = {
        conversations: {},
        castDirectory: { fetchedAt: 123, entries: [{ name: 'Aethel' }, { name: 'Rosa' }] },
    };
    migrateRemoveAethel(settings);
    assert.deepEqual(settings.castDirectory.entries.map(e => e.name), ['Rosa']);
    assert.equal(settings.castDirectory.fetchedAt, 123);
});

test('migrateRemoveAethel is idempotent and safe on empty settings', async () => {
    const { migrateRemoveAethel } = await import('../lib/config.js');
    const settings = { conversations: {} };
    migrateRemoveAethel(settings);
    migrateRemoveAethel(settings);
    assert.deepEqual(settings.conversations, {});
});

test('getSettings purges Aethel conversations from migrated legacy settings', () => {
    const extensionSettings = {
        [MODULE_NAME]: { conversations: {
            conv_1: { id: 'conv_1', charName: 'Aethel', isDedicatedApp: 'aethel', messages: [], createdAt: 1, lastActive: 1 },
            conv_2: { id: 'conv_2', charName: 'Rosa', messages: [], createdAt: 1, lastActive: 1 },
        } },
    };
    const settings = getSettings(extensionSettings);
    assert.deepEqual(Object.keys(settings.conversations), ['conv_2']);
});

test('migratePhoneAppKeys renames twitter/discord/yikyak caches to feed/chat/board without clobbering', async () => {
    const { migratePhoneAppKeys } = await import('../lib/config.js');
    const settings = { phoneApps: {
        chat1: { twitter: { content: 't' }, discord: { content: 'd' }, yikyak: { content: 'y' } },
        chat2: { feed: { content: 'existing' }, twitter: { content: 'old' } },
    } };
    migratePhoneAppKeys(settings);
    assert.deepEqual(settings.phoneApps.chat1, { feed: { content: 't' }, chat: { content: 'd' }, board: { content: 'y' } });
    assert.deepEqual(settings.phoneApps.chat2, { feed: { content: 'existing' } });
});

test('an upgrading install backfills tetherContextMessages to the safe 30 default, not "All"', () => {
    // Settings saved before the Linked-context slider existed have no tetherContextMessages key.
    // 0 means "no cap" in the slider, so an un-backfilled/undefined value must never be read as 0 —
    // that would silently restore the unbounded injection the cap exists to prevent.
    const extensionSettings = { WeyPhone: { conversations: {}, modelOverride: 'minimax-m3' } };
    const settings = getSettings(extensionSettings);
    assert.equal(settings.tetherContextMessages, 30);
});
