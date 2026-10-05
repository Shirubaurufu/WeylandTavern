import test from 'node:test';
import assert from 'node:assert/strict';
import {
    WEYPHONE_BACKUP_FORMAT,
    createWeyPhoneBackup,
    parseWeyPhoneBackup,
    restoreWeyPhoneBackup,
} from '../lib/settingsBackup.js';

test('WeyPhone backup round-trips chats, notes, prompts, posts, and wallpaper', () => {
    const settings = {
        conversations: { summer: { messages: [{ role: 'user', content: 'hey' }] } },
        notes: [{ id: 'n1', text: 'Cafe order' }],
        pawxai: { savedPrompts: [{ characterName: 'Jenn', prompt: 'coffee shop' }] },
        savedPosts: { feed: ['post-1'] },
        ui: { wallpaper: 'https://example.test/my-wallpaper.png', wallpaperPositionX: 72 },
    };
    const backup = createWeyPhoneBackup(settings, new Date('2026-07-18T12:00:00Z'));
    assert.equal(backup.format, WEYPHONE_BACKUP_FORMAT);
    const parsed = parseWeyPhoneBackup(JSON.stringify(backup));
    assert.deepEqual(parsed.settings, settings);
    assert.notEqual(parsed.settings, settings);
});

test('restore replaces a live settings object in place', () => {
    const live = { WeyPhone: { old: true } };
    const original = live.WeyPhone;
    restoreWeyPhoneBackup(live, { conversations: {}, ui: { wallpaper: 'sakura' } });
    assert.equal(live.WeyPhone, original);
    assert.deepEqual(live.WeyPhone, { conversations: {}, ui: { wallpaper: 'sakura' } });
});

test('parser rejects invalid formats, versions, and prototype-pollution keys', () => {
    assert.throws(() => parseWeyPhoneBackup('{}'), /not a WeyPhone backup/);
    assert.throws(() => parseWeyPhoneBackup(JSON.stringify({ format: WEYPHONE_BACKUP_FORMAT, version: 2, settings: {} })), /Unsupported/);
    assert.throws(
        () => parseWeyPhoneBackup('{"format":"weyphone-backup","version":1,"settings":{"__proto__":{"polluted":true}}}'),
        /blocked key/,
    );
    assert.equal({}.polluted, undefined);
});
