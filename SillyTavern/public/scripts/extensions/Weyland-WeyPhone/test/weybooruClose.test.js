import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2026-10-13 (Lucky): opening Weybooru puts the phone away. Every way into the viewer (the phone's tile, the chat-bar frame
// button, /weybooru, the menu) ends in openOverlay(), so that is where the viewer announces itself; WeyPhone closes its panel.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const viewer = read('../../weybooru-viewer/index.js');
const phone = read('../index.js');

test('the viewer announces itself once the overlay is up, from openOverlay only', () => {
    const open = viewer.slice(viewer.indexOf('async function openOverlay('), viewer.indexOf('function closeOverlay('));
    assert.match(open, /css\('display', 'flex'\);\s*state\.open = true;[\s\S]*?document\.dispatchEvent\(new CustomEvent\('wbv:opened'\)\)/);
    assert.equal(viewer.split("'wbv:opened'").length - 1, 1, 'one announcement, not one per entry point');
});

test('WeyPhone puts the phone away on that event, and does nothing when it is already closed', () => {
    const listener = phone.slice(phone.indexOf("document.addEventListener('wbv:opened'"));
    assert.match(listener.slice(0, 260), /if \(panel\.classList\.contains\('wp-open'\)\) setPanelOpen\(false\);/);
    // Same function the panel's own close button uses, defined before the listener so it is in scope.
    assert.ok(phone.indexOf('function setPanelOpen(open)') < phone.indexOf("document.addEventListener('wbv:opened'"));
    assert.match(phone, /closeButton\.addEventListener\('click', \(event\) => \{\s*event\.stopPropagation\(\);\s*setPanelOpen\(false\);/);
});

test('the phone tile still toggles the viewer shut (the close button is the viewer\'s own)', () => {
    assert.match(phone, /if \(isWeybooruViewerOpen\(\)\) \{\s*document\.getElementById\(WEYBOORU_CLOSE_BUTTON_ID\)\?\.click\(\);/);
});
