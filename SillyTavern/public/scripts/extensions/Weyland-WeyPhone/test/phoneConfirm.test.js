// The "Move forward in the story?" check must be asked inside the phone (#wp-app-help over PromptOS),
// not with SillyTavern's page-wide popup (Lucky, 2026-11-18). Also pins renderConfirmDialog's answers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderConfirmDialog } from '../lib/ui/appHelp.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('the forward-only start switch asks inside the phone', () => {
    const src = fs.readFileSync(path.join(here, '..', 'index.js'), 'utf8');
    const start = src.indexOf("action === 'set-intro-variant'");
    assert.ok(start > 0, 'set-intro-variant handler found');
    const block = src.slice(start, src.indexOf('setVariant(group, option)', start));
    assert.ok(block.includes('renderConfirmDialog('), 'uses the phone confirm');
    assert.equal(block.includes('Popup.show.confirm'), false, 'no page-wide popup');
});

// A tiny stand-in for the dialog container: enough for renderConfirmDialog to draw into and be clicked.
function fakeContainer() {
    const listeners = [];
    const container = {
        hidden: true,
        innerHTML: '',
        querySelector: () => null,
        addEventListener: (type, fn) => listeners.push(fn),
        removeEventListener: (type, fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
        click(attrs) { for (const fn of [...listeners]) fn({ target: fakeTarget(container, attrs) }); },
        listenerCount: () => listeners.length,
    };
    return container;
}
// `attrs` says what the clicked element sits inside: its own box id, data-help-close, data-confirm value.
function fakeTarget(container, { box, close = true, confirm = null }) {
    return {
        closest(selector) {
            if (selector.startsWith('[data-confirm-id=') || selector.startsWith('[data-confirm-for=')) {
                return box && selector.includes(`"${box}"`) ? {} : null;
            }
            if (selector === '[data-help-close]') return close ? {} : null;
            if (selector === '[data-confirm]') return confirm ? { dataset: { confirm } } : null;
            return null;
        },
    };
}
const boxId = html => /data-confirm-id="([^"]+)"/.exec(html)[1];

test('renderConfirmDialog: OK answers true, cancel/X/backdrop answer false', async () => {
    for (const [attrs, want] of [[{ confirm: 'ok' }, true], [{ confirm: 'cancel' }, false], [{}, false]]) {
        const c = fakeContainer();
        const answer = renderConfirmDialog(c, { title: 'T', body: 'B', okLabel: 'Move forward', cancelLabel: 'Stay here' });
        assert.equal(c.hidden, false);
        assert.ok(c.innerHTML.includes('Move forward') && c.innerHTML.includes('Stay here'));
        c.click({ box: boxId(c.innerHTML), ...attrs });
        assert.equal(await answer, want);
        assert.equal(c.listenerCount(), 0, 'listener removed after answering');
    }
});

test('renderConfirmDialog: clicks inside the box that are not buttons do nothing, an old box cannot answer a new one', async () => {
    const c = fakeContainer();
    const first = renderConfirmDialog(c, { title: 'One', body: '' });
    const firstId = boxId(c.innerHTML);
    const second = renderConfirmDialog(c, { title: 'Two', body: '' });
    const secondId = boxId(c.innerHTML);
    assert.notEqual(firstId, secondId);
    c.click({ box: secondId, close: false });            // tap on the text
    c.click({ box: secondId, confirm: 'ok' });
    assert.equal(await second, true);
    let settled = false;
    first.then(() => { settled = true; });
    await new Promise(r => setTimeout(r, 0));
    assert.equal(settled, false, 'the wiped first box never answers');
});

test('renderConfirmDialog escapes its text', () => {
    const c = fakeContainer();
    renderConfirmDialog(c, { title: '<b>x</b>', body: '<script>', okLabel: '<i>', cancelLabel: '<u>' });
    assert.equal(/<b>x<\/b>|<script>|<i>|<u>/.test(c.innerHTML), false);
});

test('renderConfirmDialog keeps bodyHtml as markup (forwardConfirmText is already HTML)', () => {
    const c = fakeContainer();
    renderConfirmDialog(c, { title: 'T', bodyHtml: '<p>Switching to <b>X</b></p>' });
    assert.ok(c.innerHTML.includes('<p>Switching to <b>X</b></p>'));
});
