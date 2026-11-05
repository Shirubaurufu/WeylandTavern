import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
    RETIRED_MODEL_REPLACEMENT, RETIRED_MODEL_SWAP_ID, applyRetiredModelSwapOnce, isRetiredModelId, swapRetiredModels,
} from '../../../weyland-retired-models.js';
import { swapRetiredMainModels } from '../../weyland-network/retiredModels.js';
import { getSettings } from '../lib/config.js';

// HelixMind retired its DeepSeek and MiniMax models (2026-11, "temporarily"). Anything saved on one of them fails every request,
// so each store moves to Gemini 3.8 Flash ONCE. It must not repeat: when HelixMind brings the models back, a player who picks
// one again is left alone.

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('retired ids are recognised in every shape HelixMind and OpenRouter use, and nothing else', () => {
    for (const id of ['minimax-m3', 'MiniMax-M3', 'deepseek-v4-pro', 'deepseek-v4-pro-thinking', 'deepseek-chat', 'minimax/minimax-m3', ' deepseek-v4-pro ']) {
        assert.equal(isRetiredModelId(id), true, id);
    }
    for (const id of ['gemini-3.8-flash', 'gemma-4-31b-it', 'glm-5', 'claude-sonnet-5', '', null, undefined, 42,
        'I like deepseek a lot, said the player']) {
        assert.equal(isRetiredModelId(id), false, String(id));
    }
});

test('only fields that name a model are rewritten, never chat history or free text', () => {
    const settings = {
        modelOverride: 'minimax-m3',
        note: 'deepseek-v4-pro',                       // not a model field
        conversations: { c1: { memoryBackupModel: 'deepseek-v4-pro', messages: [{ role: 'user', content: 'x', model: 'minimax-m3' }] } },
        pawxai: { fallbackModel: 'deepseek-v4-pro-thinking', modelFeedback: 'minimax-m3 was too wordy' },
    };
    assert.equal(swapRetiredModels(settings), 3);
    assert.equal(settings.modelOverride, RETIRED_MODEL_REPLACEMENT);
    assert.equal(settings.note, 'deepseek-v4-pro');
    assert.equal(settings.conversations.c1.memoryBackupModel, RETIRED_MODEL_REPLACEMENT);
    assert.equal(settings.conversations.c1.messages[0].model, 'minimax-m3');
    assert.equal(settings.pawxai.fallbackModel, RETIRED_MODEL_REPLACEMENT);
    assert.equal(settings.pawxai.modelFeedback, 'minimax-m3 was too wordy');
});

test('the swap runs once: a retired model picked afterwards is left alone', () => {
    const settings = { modelOverride: 'deepseek-v4-pro' };
    assert.equal(applyRetiredModelSwapOnce(settings), 1);
    assert.equal(settings.modelOverride, RETIRED_MODEL_REPLACEMENT);
    assert.equal(settings.retiredModelSwap, RETIRED_MODEL_SWAP_ID);

    settings.modelOverride = 'deepseek-v4-pro';      // HelixMind brought it back and the player chose it again
    assert.equal(applyRetiredModelSwapOnce(settings), 0);
    assert.equal(settings.modelOverride, 'deepseek-v4-pro');
});

test('a fresh install is marked too, so its later choices are never swapped', () => {
    const settings = { modelOverride: 'gemini-3.8-flash' };
    assert.equal(applyRetiredModelSwapOnce(settings), 0);
    assert.equal(settings.retiredModelSwap, RETIRED_MODEL_SWAP_ID);
    settings.modelOverride = 'minimax-m3';
    assert.equal(applyRetiredModelSwapOnce(settings), 0);
    assert.equal(settings.modelOverride, 'minimax-m3');
});

test('WeyPhone: loading saved settings moves every phone model off the retired ones, once', () => {
    const extensionSettings = {
        WeyPhone: {
            conversations: { c1: { id: 'c1', charName: 'Bastet', messages: [], memoryPrimaryModel: 'minimax-m3', memoryBackupModel: 'deepseek-v4-pro' } },
            modelOverride: 'minimax-m3', textingModelOverride: 'deepseek-v4-pro', kressaModel: 'minimax-m3',
            fallbackModelOverride: 'minimax-m3', textingFallbackModel: 'deepseek-v4-pro', kressaFallbackModel: '',
            understudy: { modelOverride: 'deepseek-v4-pro-thinking', fallbackModel: 'deepseek-v4-pro-thinking' },
            pawxai: { modelOverride: 'minimax-m3', fallbackModel: 'minimax-m3' },
        },
    };
    const settings = getSettings(extensionSettings);
    const fields = [
        settings.modelOverride, settings.textingModelOverride, settings.kressaModel, settings.fallbackModelOverride,
        settings.textingFallbackModel, settings.understudy.modelOverride, settings.understudy.fallbackModel,
        settings.pawxai.modelOverride, settings.pawxai.fallbackModel,
        settings.conversations.c1.memoryPrimaryModel, settings.conversations.c1.memoryBackupModel,
    ];
    assert.deepEqual(fields, Array(fields.length).fill(RETIRED_MODEL_REPLACEMENT));
    assert.equal(settings.kressaFallbackModel, '', 'a blank (no fallback) stays blank');

    // load again after the player picked DeepSeek once HelixMind restored it
    settings.modelOverride = 'deepseek-v4-pro';
    assert.equal(getSettings(extensionSettings).modelOverride, 'deepseek-v4-pro');
});

test('WeyPhone: a brand-new phone defaults to Gemini 3.8 Flash everywhere, with no retired model left in the defaults', () => {
    const settings = getSettings({});
    for (const [name, value] of Object.entries({
        fallbackModelOverride: settings.fallbackModelOverride, textingFallbackModel: settings.textingFallbackModel,
        kressaFallbackModel: settings.kressaFallbackModel, pawxai: settings.pawxai.fallbackModel,
    })) {
        assert.equal(value, RETIRED_MODEL_REPLACEMENT, name);
    }
    delete settings.retiredModelSwap; // the once-only marker's own name mentions the retired families
    assert.equal(JSON.stringify(settings).match(/deepseek|minimax/i), null);
});

test('main chat: a HelixMind connection and its profiles move once; other providers keep their model', () => {
    let saved = 0;
    const context = {
        saveSettingsDebounced: () => { saved++; },
        chatCompletionSettings: { custom_url: 'https://helixmind.online/v1', custom_model: 'minimax-m3' },
        extensionSettings: {
            connectionManager: {
                profiles: [
                    { name: "HelixMind (Ratchet's API)", 'api-url': 'https://helixmind.online/v1', model: 'deepseek-v4-pro' },
                    { name: 'My copy', 'api-url': 'https://api.helixmind.online/v1', model: 'minimax-m3' },
                    { name: 'OpenRouter', 'api-url': 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat' },
                    { name: 'Already fine', 'api-url': 'https://helixmind.online/v1', model: 'gemini-3.8-flash' },
                ],
            },
        },
    };
    assert.deepEqual(swapRetiredMainModels(context), { connection: true, profiles: 2 });
    const [helix, copy, openrouter, fine] = context.extensionSettings.connectionManager.profiles;
    assert.equal(context.chatCompletionSettings.custom_model, RETIRED_MODEL_REPLACEMENT);
    assert.equal(helix.model, RETIRED_MODEL_REPLACEMENT);
    assert.equal(copy.model, RETIRED_MODEL_REPLACEMENT);
    assert.equal(openrouter.model, 'deepseek/deepseek-chat');
    assert.equal(fine.model, 'gemini-3.8-flash');
    assert.equal(saved, 1);

    // second run, and a later deliberate pick, change nothing
    context.chatCompletionSettings.custom_model = 'deepseek-v4-pro';
    assert.deepEqual(swapRetiredMainModels(context), { connection: false, profiles: 0 });
    assert.equal(context.chatCompletionSettings.custom_model, 'deepseek-v4-pro');
});

test('main chat: a non-HelixMind live connection is left alone', () => {
    const context = {
        chatCompletionSettings: { custom_url: 'https://api.deepseek.com/v1', custom_model: 'deepseek-chat' },
        extensionSettings: {},
    };
    assert.deepEqual(swapRetiredMainModels(context), { connection: false, profiles: 0 });
    assert.equal(context.chatCompletionSettings.custom_model, 'deepseek-chat');
});

test('LTM and Router run the same once-only swap, and neither keeps a retired default', async () => {
    const ltm = await read('../../Weyland-LTM/index.js');
    assert.match(ltm, /import \{ applyRetiredModelSwapOnce \} from '\.\.\/\.\.\/weyland-retired-models\.js';/);
    assert.match(ltm, /applyRetiredModelSwapOnce\(settings\)/);
    assert.match(ltm, /const FALLBACK_LTM_MODEL = 'gemini-3\.8-flash';/);
    assert.match(ltm, /const ALTERNATE_LTM_MODELS = \[\];/);

    // Router lives under data/default-user/extensions; the route's id is not a "model" key, so it has its own walk
    const router = await readFile(new URL('../../../../../data/default-user/extensions/Weyland-Router/index.js', import.meta.url), 'utf8');
    assert.match(router, /import \{ RETIRED_MODEL_SWAP_ID, RETIRED_MODEL_REPLACEMENT, isRetiredModelId \} from '\.\.\/\.\.\/\.\.\/weyland-retired-models\.js';/);
    assert.match(router, /if \(settings\.retiredModelSwap !== RETIRED_MODEL_SWAP_ID\)/);
    assert.match(router, /twin\.weight = \(twin\.weight \|\| 0\) \+ \(model\.weight \|\| 0\)/);
});

test('WeyPhone startup saves the swap: the sync baseline is the stored copy, so the marker reaches the data file', async () => {
    // Found on a live test: getSettings (which runs the swap) ran BEFORE initializeSettingsSync took its baseline, so the swap
    // looked like "no local change", nothing was written, and it re-ran on every load, overriding a model picked later.
    const src = await read('../index.js');
    assert.match(src, /storedBaseline = structuredClone\(stored\);/);
    assert.match(src, /storedBaseline\.retiredModelSwap !== settings\.retiredModelSwap/);
    assert.match(src, /settingsSyncBaseline = storedBaseline;\s*queueWeyPhoneSave\(context\);/);
});

test('no Weyland extension still defaults to, recommends or lists DeepSeek or MiniMax', async () => {
    const files = [
        '../lib/config.js', '../lib/storage.js', '../lib/panel.js', '../lib/pawxai.js',
        '../lib/ui/apps/settings.js', '../lib/ui/apps/understudy.js', '../lib/ui/apps/narrativeSettings.js',
        '../sandbox/copycat/index.html', '../../Weyland-LTM/index.js',
    ];
    // sandbox/ is a local dev area that never ships, so a release install doesn't have it; scan it only when present.
    const optional = new Set(['../sandbox/copycat/index.html']);
    for (const file of files) {
        const text = await read(file).catch(error => {
            if (error.code === 'ENOENT' && optional.has(file)) return '';
            throw error;
        });
        // the DeepSeek source mapping for stock SillyTavern's own provider list is not a Weyland recommendation
        const lines = text.split(/\r?\n/).filter(line => /deepseek|minimax/i.test(line) && !/#model_deepseek_select|deepseek: *'deepseek_model'|deepseek: *\[/i.test(line));
        // comments that explain the retirement are fine; any other mention is a leftover
        const leftovers = lines.filter(line => !/retired|HelixMind retired/i.test(line));
        assert.deepEqual(leftovers, [], file);
    }
});
