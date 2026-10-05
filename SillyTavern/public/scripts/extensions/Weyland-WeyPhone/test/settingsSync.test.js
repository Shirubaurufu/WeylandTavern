import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applySettingsPatch,
    createSettingsPatch,
    mergeWeyPhoneSettings,
    replaceSettingsInPlace,
    settingsChangedDuringRefresh,
} from '../lib/settingsSync.js';

test('a stale tab wallpaper change preserves conversations added by another device', () => {
    const base = { conversations: {}, ui: { wallpaper: 'default', wallpaperDim: 20 } };
    const local = { conversations: {}, ui: { wallpaper: 'violet', wallpaperDim: 20 } };
    const remote = {
        conversations: { miu: { id: 'miu', messages: [{ role: 'user', content: 'hi' }] } },
        ui: { wallpaper: 'default', wallpaperDim: 20 },
    };
    const merged = mergeWeyPhoneSettings(base, local, remote);
    assert.equal(merged.ui.wallpaper, 'violet');
    assert.equal(merged.conversations.miu.messages[0].content, 'hi');
});

test('patches carry deletions without removing unrelated remote and future fields', () => {
    const base = { contactRenames: { Gru: 'G' }, ui: { wallpaper: 'default' } };
    const local = { contactRenames: {}, ui: { wallpaper: 'default' } };
    const remote = { contactRenames: { Gru: 'G' }, ui: { wallpaper: 'default' }, future: { enabled: true } };
    const operations = createSettingsPatch(base, local);
    const merged = applySettingsPatch(remote, operations);
    assert.deepEqual(merged.contactRenames, {});
    assert.deepEqual(merged.future, { enabled: true });
});

test('arrays are atomic so message editing, deletion, and ordering stay deterministic', () => {
    const base = { messages: [{ content: 'one' }, { content: 'two' }] };
    const local = { messages: [{ content: 'edited' }] };
    const patch = createSettingsPatch(base, local);
    assert.deepEqual(patch, [{ type: 'set', path: ['messages'], value: [{ content: 'edited' }] }]);
});

test('replaceSettingsInPlace preserves the live object identity', () => {
    const target = { old: true, nested: { value: 1 } };
    const identity = target;
    const result = replaceSettingsInPlace(target, { fresh: true });
    assert.equal(result, identity);
    assert.deepEqual(target, { fresh: true });
});

test('a refresh response is rejected when a generated reply arrives while its server read is in flight', () => {
    const baselineAtStart = {
        conversations: { lucy: { roleplayMode: 'linked', messages: [{ role: 'user', content: 'where is Jenn?' }] } },
    };
    const currentBaseline = structuredClone(baselineAtStart);
    const live = structuredClone(baselineAtStart);
    live.conversations.lucy.messages.push({ role: 'assistant', content: 'she is at the dining hall' });
    live.conversations.lucy.roleplayMode = 'observe';

    assert.equal(settingsChangedDuringRefresh(baselineAtStart, currentBaseline, live), true);
});

test('a refresh response is rejected when a save advances the baseline before the older read returns', () => {
    const baselineAtStart = { conversations: { lucy: { roleplayMode: 'linked', messages: [] } } };
    const currentBaseline = { conversations: { lucy: { roleplayMode: 'observe', messages: [] } } };
    const live = structuredClone(currentBaseline);

    assert.equal(settingsChangedDuringRefresh(baselineAtStart, currentBaseline, live), true);
});

test('an unchanged tab may safely apply a completed settings refresh', () => {
    const baselineAtStart = { conversations: { lucy: { roleplayMode: 'observe', messages: [] } } };
    const currentBaseline = structuredClone(baselineAtStart);
    const live = structuredClone(baselineAtStart);

    assert.equal(settingsChangedDuringRefresh(baselineAtStart, currentBaseline, live), false);
});

test('generation cooldown events union across stale devices instead of resetting', () => {
    const base = { generationRateLimitEvents: [] };
    const local = { generationRateLimitEvents: [{ id: 'desktop', timestamp: Date.now() - 2000 }] };
    const remote = { generationRateLimitEvents: [{ id: 'phone', timestamp: Date.now() - 1000 }] };
    const merged = mergeWeyPhoneSettings(base, local, remote);
    assert.deepEqual(new Set(merged.generationRateLimitEvents.map(event => event.id)), new Set(['desktop', 'phone']));
});
