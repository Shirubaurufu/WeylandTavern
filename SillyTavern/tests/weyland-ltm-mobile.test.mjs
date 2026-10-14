import test from 'node:test';
import assert from 'node:assert/strict';
import { bindMobileViewport } from '../public/scripts/extensions/Weyland-LTM/mobile-ui.js';

function fixture(t, { hasViewport = true, mobile = true } = {}) {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
    const media = Object.assign(new EventTarget(), { matches: mobile });
    const phoneWindow = Object.assign(new EventTarget(), {
        visualViewport: hasViewport ? viewport : undefined,
        innerHeight: 844,
        matchMedia: () => media,
    });
    const field = { value: 'Unsaved memory', selectionStart: 7, matches: () => true };
    const properties = new Map();
    const classes = new Set();
    const modal = Object.assign(new EventTarget(), {
        querySelector: () => ({ contains: element => element === field }),
        style: {
            setProperty: (key, value) => properties.set(key, value),
            removeProperty: key => properties.delete(key),
        },
        classList: {
            toggle: (key, on) => on ? classes.add(key) : classes.delete(key),
            remove: key => classes.delete(key),
            contains: key => classes.has(key),
        },
    });
    globalThis.window = phoneWindow;
    globalThis.document = { activeElement: field };
    const dispose = bindMobileViewport(modal);
    t.after(() => {
        dispose();
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    });
    return { viewport, media, phoneWindow, modal, properties, classes, field, dispose };
}

test('keyboard shrink and input panning fit the panel without touching unsaved text or selection', t => {
    const f = fixture(t);
    f.viewport.height = 390;
    f.viewport.offsetTop = 35;
    f.viewport.dispatchEvent(new Event('resize'));
    assert.equal(f.properties.get('--wlm-viewport-height'), '390px');
    assert.equal(f.properties.get('--wlm-viewport-top'), '35px');
    assert.ok(f.classes.has('wlm-mobile-editing'));
    assert.equal(f.field.value, 'Unsaved memory');
    assert.equal(f.field.selectionStart, 7);
    f.viewport.offsetTop = 60;
    f.viewport.dispatchEvent(new Event('scroll'));
    assert.equal(f.properties.get('--wlm-viewport-top'), '60px');

    f.viewport.height = 844;
    f.viewport.offsetTop = 0;
    f.viewport.dispatchEvent(new Event('resize'));
    assert.equal(f.properties.get('--wlm-viewport-height'), '844px');
    assert.ok(!f.classes.has('wlm-mobile-editing'));
});

test('moving between editor fields keeps compact mode; leaving the editor restores controls', async t => {
    const f = fixture(t);
    f.viewport.height = 400;
    f.viewport.dispatchEvent(new Event('resize'));
    f.modal.dispatchEvent(new Event('focusout'));
    await Promise.resolve();
    assert.ok(f.classes.has('wlm-mobile-editing'));
    document.activeElement = null;
    f.modal.dispatchEvent(new Event('focusout'));
    await Promise.resolve();
    assert.ok(!f.classes.has('wlm-mobile-editing'));
});

test('Memories keeps its position between focus and click, then allows the list to return', async t => {
    const f = fixture(t);
    f.viewport.height = 400;
    f.viewport.dispatchEvent(new Event('resize'));
    document.activeElement = { id: 'wlm-mobile-expand-btn', matches: () => false };
    f.modal.dispatchEvent(new Event('focusout'));
    await Promise.resolve();
    assert.ok(f.classes.has('wlm-mobile-editing'));
    // The toggle's click removes editing mode after it has received the tap.
    f.classes.delete('wlm-mobile-editing');
    f.viewport.dispatchEvent(new Event('resize'));
    assert.ok(!f.classes.has('wlm-mobile-editing'));
});

test('a direct Memories tap keeps focus until click, without changing normal button focus', t => {
    const f = fixture(t);
    const pointerDown = () => {
        const event = new Event('pointerdown', { cancelable: true });
        Object.defineProperty(event, 'target', { value: { closest: () => ({ id: 'wlm-mobile-expand-btn' }) } });
        f.modal.dispatchEvent(event);
        return event;
    };
    assert.equal(pointerDown().defaultPrevented, false);
    f.viewport.height = 400;
    f.viewport.dispatchEvent(new Event('resize'));
    assert.equal(pointerDown().defaultPrevented, true);
});

test('desktop and pinch zoom drop mobile sizing, and returning to phone width restores it', t => {
    const f = fixture(t, { mobile: false });
    assert.equal(f.properties.size, 0);
    f.media.matches = true;
    f.media.dispatchEvent(new Event('change'));
    assert.equal(f.properties.get('--wlm-viewport-height'), '844px');
    f.viewport.scale = 1.5;
    f.viewport.dispatchEvent(new Event('resize'));
    assert.equal(f.properties.size, 0);
    f.viewport.scale = 1;
    f.viewport.dispatchEvent(new Event('resize'));
    assert.equal(f.properties.get('--wlm-viewport-height'), '844px');
    f.media.matches = false;
    f.media.dispatchEvent(new Event('change'));
    assert.equal(f.properties.size, 0);
});

test('WebViews without visualViewport can use their resized window height', t => {
    const f = fixture(t, { hasViewport: false });
    f.phoneWindow.innerHeight = 360;
    f.phoneWindow.dispatchEvent(new Event('resize'));
    assert.equal(f.properties.get('--wlm-viewport-height'), '360px');
    assert.ok(f.classes.has('wlm-mobile-editing'));
});

test('disposing an old panel removes its viewport and focus listeners', t => {
    const f = fixture(t);
    f.dispose();
    f.viewport.height = 350;
    f.viewport.dispatchEvent(new Event('resize'));
    f.modal.dispatchEvent(new Event('focusin'));
    assert.equal(f.properties.get('--wlm-viewport-height'), '844px');
    assert.ok(!f.classes.has('wlm-mobile-editing'));
});
