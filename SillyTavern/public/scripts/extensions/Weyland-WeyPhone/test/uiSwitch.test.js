// "Weyland UI Switch" (extensions/weyland-ui-switch) adds one button to each side of the Streamlined / full UI
// split. It finds its place by DOM id and flips the extension named below, so these tests pin the names it
// depends on: a Streamlined UI rename or a template change that would leave the button nowhere fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scripts = rel => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const read = rel => readFileSync(scripts(rel), 'utf8');

test('the switch extension is a complete, always-on extension', () => {
    const manifest = JSON.parse(read('extensions/weyland-ui-switch/manifest.json'));
    assert.equal(manifest.js, 'index.js');
    assert.equal(manifest.css, 'style.css');
    assert.ok(existsSync(scripts('extensions/weyland-ui-switch/index.js')));
    assert.ok(existsSync(scripts('extensions/weyland-ui-switch/style.css')));
    // Must load after Streamlined UI (999) has moved its DOM around.
    assert.ok(manifest.loading_order > JSON.parse(read('extensions/streamlined-ui/manifest.json')).loading_order);
});

test('it flips the extension that really exists under that folder name', () => {
    const source = read('extensions/weyland-ui-switch/index.js');
    const name = source.match(/const STREAMLINED = '([^']+)'/)?.[1];
    assert.equal(name, 'streamlined-ui');
    assert.ok(existsSync(scripts(`extensions/${name}/manifest.json`)), 'folder name is the extension id used by disabledExtensions');
});

test('both placements exist in the page template', () => {
    const html = readFileSync(fileURLToPath(new URL('../../../../index.html', import.meta.url)), 'utf8');
    const source = read('extensions/weyland-ui-switch/index.js');
    // Full UI: header row of the Extensions menu.
    assert.match(source, /#rm_extensions_block \.extensions_block > \.alignitemscenter/);
    assert.match(html, /id="rm_extensions_block"/);
    assert.match(html, /<div class="extensions_block flex-container">\s*<div class="alignitemscenter flex-container wide100p">\s*<h3/);
    // Streamlined UI: top of the merged Settings panel.
    assert.match(source, /#rm_api_block/);
    assert.match(html, /id="rm_api_block"/);
});

test('Streamlined UI still folds the Extensions menu into the Settings panel (why the placements differ)', () => {
    const patches = JSON.parse(read('extensions/streamlined-ui/patches.json'));
    const merge = patches.find(p => p.target === '#rm_extensions_block');
    assert.ok(merge?.actions.some(a => a.type === 'MOVE'), 'if this stops moving, the full-UI placement may suffice for both modes');
});
