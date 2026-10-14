import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeDuplicateWeylandLtm } from '../src/weyland-ltm-cleanup.js';

test('startup cleanup runs after legacy migration and before the server listens', () => {
    const source = fs.readFileSync(new URL('../src/server-main.js', import.meta.url), 'utf8');
    const migration = source.indexOf('.then(migrateUserData)');
    const cleanup = source.indexOf('.then(() => removeDuplicateWeylandLtm(');
    const listening = source.indexOf('.then(() => new ServerStartup(');
    assert.ok(migration >= 0 && cleanup > migration && listening > cleanup);
});

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'weyland-ltm-cleanup-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const serverRoot = path.join(root, 'Tavern');
    const dataRoot = path.join(root, 'custom-data');
    const bundled = path.join(serverRoot, 'public/scripts/extensions/Weyland-LTM');
    const duplicate = path.join(dataRoot, 'default-user/extensions/Weyland-LTM');
    for (const dir of [bundled, duplicate]) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ display_name: 'Weyland-LTM', js: 'index.js' }));
        fs.writeFileSync(path.join(dir, 'index.js'), '// extension');
        fs.writeFileSync(path.join(dir, 'style.css'), '/* styles */');
    }
    const warnings = [];
    const options = { serverRoot, dataRoot, logger: { info() {}, warn(...args) { warnings.push(args); } } };
    return { root, bundled, duplicate, dataRoot, options, warnings };
}

test('removes only the retired extension in a custom data root, preserving the bundle and user data', t => {
    const { bundled, duplicate, dataRoot, options } = fixture(t);
    const preserved = ['default-user/settings.json', 'default-user/worlds/Chat Book.json',
        'default-user/chats/Summer/chat.jsonl', 'default-user/extensions/Weyland-Router/index.js'];
    for (const relative of preserved) {
        const file = path.join(dataRoot, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'keep exactly');
    }
    assert.equal(removeDuplicateWeylandLtm(options), 'removed');
    assert.equal(fs.existsSync(duplicate), false);
    assert.equal(fs.readFileSync(path.join(bundled, 'index.js'), 'utf8'), '// extension');
    for (const relative of preserved) assert.equal(fs.readFileSync(path.join(dataRoot, relative), 'utf8'), 'keep exactly');
    assert.equal(removeDuplicateWeylandLtm(options), 'completed');
    // A later restored duplicate must not make a completed migration run again.
    fs.mkdirSync(duplicate, { recursive: true });
    fs.writeFileSync(path.join(duplicate, 'keep.txt'), 'restored later');
    assert.equal(removeDuplicateWeylandLtm(options), 'completed');
    assert.equal(fs.readFileSync(path.join(duplicate, 'keep.txt'), 'utf8'), 'restored later');
});

test('an install without a duplicate is marked complete too', t => {
    const { duplicate, options } = fixture(t);
    fs.rmSync(duplicate, { recursive: true });
    assert.equal(removeDuplicateWeylandLtm(options), 'absent');
    assert.equal(removeDuplicateWeylandLtm(options), 'completed');
});

test('a failed cleanup is not marked complete and succeeds after the replacement is repaired', t => {
    const { bundled, duplicate, options } = fixture(t);
    const file = path.join(bundled, 'style.css');
    fs.unlinkSync(file);
    assert.equal(removeDuplicateWeylandLtm(options), 'skipped');
    assert.ok(fs.existsSync(duplicate));
    fs.writeFileSync(file, '/* restored */');
    assert.equal(removeDuplicateWeylandLtm(options), 'removed');
    assert.equal(removeDuplicateWeylandLtm(options), 'completed');
});

test('keeps duplicate if the bundled replacement is missing', t => {
    const { bundled, duplicate, options, warnings } = fixture(t);
    fs.rmSync(bundled, { recursive: true });
    assert.equal(removeDuplicateWeylandLtm(options), 'skipped');
    assert.ok(fs.existsSync(duplicate));
    assert.equal(warnings.length, 1);
});

for (const location of ['bundled', 'duplicate']) {
    test(`keeps duplicate if ${location} manifest is unrelated or malformed`, t => {
        const f = fixture(t);
        fs.writeFileSync(path.join(f[location], 'manifest.json'), '{broken');
        assert.equal(removeDuplicateWeylandLtm(f.options), 'skipped');
        assert.ok(fs.existsSync(f.duplicate));
        fs.writeFileSync(path.join(f[location], 'manifest.json'), JSON.stringify({ display_name: 'Other', js: 'index.js' }));
        assert.equal(removeDuplicateWeylandLtm(f.options), 'skipped');
        assert.ok(fs.existsSync(f.duplicate));
    });
}

test('refuses a redirected extension directory and preserves its target', t => {
    const { root, duplicate, options } = fixture(t);
    const elsewhere = path.join(root, 'elsewhere');
    fs.renameSync(duplicate, elsewhere);
    fs.symlinkSync(elsewhere, duplicate, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(removeDuplicateWeylandLtm(options), 'skipped');
    assert.ok(fs.existsSync(path.join(elsewhere, 'index.js')));
});

test('refuses a redirected parent extensions directory', t => {
    const { root, duplicate, options } = fixture(t);
    const parent = path.dirname(duplicate);
    const elsewhere = path.join(root, 'elsewhere');
    fs.renameSync(parent, elsewhere);
    fs.symlinkSync(elsewhere, parent, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(removeDuplicateWeylandLtm(options), 'skipped');
    assert.ok(fs.existsSync(path.join(elsewhere, 'Weyland-LTM/index.js')));
});
