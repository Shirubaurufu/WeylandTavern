import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { getSettings } from '../lib/config.js';
import { createConversation } from '../lib/storage.js';
import { WEYLAND_MODEL_DEFAULTS as MODELS } from '../../../weyland-model-defaults.js';
import { ALTERNATE_PHONE_MODELS, RECOMMENDED_PHONE_MODEL } from '../lib/ui/apps/settings.js';

const pairs = settings => [
    [settings.modelOverride, settings.fallbackModelOverride],
    [settings.textingModelOverride, settings.textingFallbackModel],
    [settings.kressaModel, settings.kressaFallbackModel],
    [settings.pawxai.modelOverride, settings.pawxai.fallbackModel],
    [settings.understudy.modelOverride, settings.understudy.fallbackModel],
];
// 2026-11-14 (Lucky): Gemini 3.8 Flash came back, so it leads everywhere and each app's previous
// first pick became its backup.
const expected = [
    ['gemini-3.8-flash', 'gemma-4-31b-it'],
    ['gemini-3.8-flash', 'deepseek-v4.1-flash'],
    ['gemini-3.8-flash', 'deepseek-v4.1-flash'],
    ['gemini-3.8-flash', 'glm-4.7-thinking'],
    ['gemini-3.8-flash', 'glm-5'],
];

test('fresh and partial installs get 3.8 Flash first, the old first pick as backup, including phone memories', () => {
    for (const initial of [{}, { WeyPhone: { conversations: {} } }]) {
        const settings = getSettings(initial);
        assert.deepEqual(pairs(settings), expected);
        assert.equal(settings.pawxai.promptCount, 4);
        const memory = createConversation(settings, 'Example');
        assert.equal(memory.memoryPrimaryModel, 'gemini-3.8-flash');
        assert.equal(memory.memoryBackupModel, 'glm-4.7-thinking');
    }
});

test('a saved gemini-3.8-flash is kept everywhere and survives JSON reloads', () => {
    const old = 'gemini-3.8-flash';
    const store = {
        WeyPhone: {
            modelOverride: old, fallbackModelOverride: old, textingModelOverride: old, textingFallbackModel: old,
            kressaModel: old, kressaFallbackModel: old,
            pawxai: { modelOverride: old, fallbackModel: old, promptCount: 7 },
            understudy: { modelOverride: old, fallbackModel: old },
            conversations: { c: { id: 'c', charName: 'Example', messages: [], memoryPrimaryModel: old, memoryBackupModel: old } },
        },
    };
    for (let i = 0; i < 3; i++) {
        const settings = getSettings(store);
        assert.deepEqual(pairs(settings), Array.from({ length: 5 }, () => [old, old]));
        assert.equal(settings.pawxai.promptCount, 7);
        assert.equal(settings.conversations.c.memoryPrimaryModel, old);
        assert.equal(settings.conversations.c.memoryBackupModel, old);
        store.WeyPhone = JSON.parse(JSON.stringify(settings));
    }
});

test('saved choices, empty overrides and disabled backups are never replaced', () => {
    for (const choice of ['', 'glm-4.7', 'glm-4.7-thinking', 'deepseek-v4.1-flash', 'minimax-m3', 'custom-model', 'gemini-3.7-flash', 'gemini-3.8-flash']) {
        const store = { WeyPhone: {
            modelOverride: choice, fallbackModelOverride: choice, textingModelOverride: choice, textingFallbackModel: choice,
            kressaModel: choice, kressaFallbackModel: choice,
            pawxai: { modelOverride: choice, fallbackModel: choice, promptCount: 3 },
            understudy: { modelOverride: choice, fallbackModel: choice },
            conversations: {},
        } };
        assert.deepEqual(pairs(getSettings(store)), Array.from({ length: 5 }, () => [choice, choice]));
        assert.equal(store.WeyPhone.pawxai.promptCount, 3);
    }
});

test('the quick-fill buttons list each backup once and never repeat the recommendation', () => {
    assert.equal(RECOMMENDED_PHONE_MODEL, 'gemini-3.8-flash');
    assert.deepEqual(ALTERNATE_PHONE_MODELS, ['deepseek-v4.1-flash', 'gemma-4-31b-it', 'glm-4.7-thinking', 'glm-5']);
});

test('the real LTM loader keeps every saved model, 3.8 Flash included, and saves nothing', async () => {
    const source = await readFile(new URL('../../Weyland-LTM/index.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /migrateGeminiFlashModels/);
    const loader = source.slice(source.indexOf('function loadSettings()'), source.indexOf('\nfunction persistSettings()'));
    for (const value of ['gemini-3.8-flash', '', 'glm-4.7', 'deepseek-v4.1-flash']) {
        let saves = 0;
        const settings = { modelOverride: value, fallbackModel: value };
        const context = { extensionSettings: { LTM: settings }, WLM_MODULE_NAME: 'LTM', defaultSettings: {},
            persistSettings: () => { saves++; }, structuredClone };
        vm.runInNewContext(`let settings; ${loader}; loadSettings(); loadSettings();`, context);
        assert.equal(settings.modelOverride, value);
        assert.equal(settings.fallbackModel, value);
        assert.equal(saves, 0);
    }
    assert.match(source, /Recommended: Gemini 3\.8 Flash for memories, with GLM 4\.7 Thinking as backup\./);
    assert.equal(MODELS.ltm.primary, 'gemini-3.8-flash');
});
