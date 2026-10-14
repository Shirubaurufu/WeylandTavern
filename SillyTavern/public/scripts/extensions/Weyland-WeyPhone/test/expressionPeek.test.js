import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

// peek.js is the mobile "look at the expression" mode. These tests run the REAL module against a tiny fake DOM:
// the contract is "state lives in one body attribute, a tap closes it, nothing can get stuck".

function makeDom({ portrait = true } = {}) {
    const attrs = new Map();
    const observers = [];
    const listeners = { document: new Map(), window: new Map() };
    const reg = (bucket) => (type, fn) => { (bucket.get(type) ?? bucket.set(type, new Set()).get(type)).add(fn); };
    const unreg = (bucket) => (type, fn) => { bucket.get(type)?.delete(fn); };
    const body = {
        getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
        setAttribute: (k, v) => { attrs.set(k, String(v)); observers.forEach((o) => o()); },
        removeAttribute: (k) => { attrs.delete(k); observers.forEach((o) => o()); },
    };
    const document = {
        body,
        hidden: false,
        querySelector: () => (portrait ? {} : null),
        addEventListener: reg(listeners.document),
        removeEventListener: unreg(listeners.document),
    };
    const window = { addEventListener: reg(listeners.window), removeEventListener: unreg(listeners.window) };
    const toasts = [];
    Object.assign(globalThis, {
        document, window,
        MutationObserver: class { constructor(cb) { this.cb = cb; } observe() { observers.push(this.cb); } },
        toastr: { info: (m) => toasts.push(m) },
    });
    const fire = (where, type, event = {}) => {
        const e = { preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...event };
        for (const fn of [...(listeners[where].get(type) ?? [])]) fn(e);
        return e;
    };
    return { attrs, body, document, fire, toasts, listeners };
}

let instance = 0;
async function setup(options) {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const dom = makeDom(options);
    // A fresh module per test: peek.js keeps its state at module level.
    const { initExpressionPeek } = await import(`../../registrar-expressions/peek.js?t=${++instance}`);
    initExpressionPeek();
    return dom;
}
const press = (dom) => dom.body.setAttribute('expression-peek', 'start');
const finish = () => mock.timers.reset();

test('the quick reply sets "start": the UI is hidden for 3 seconds, then everything returns', async () => {
    const dom = await setup();
    press(dom);
    assert.equal(dom.attrs.get('expression-peek'), 'true');
    assert.equal(dom.attrs.get('expression-zoom'), 'true');
    mock.timers.tick(2999);
    assert.equal(dom.attrs.get('expression-peek'), 'true');
    mock.timers.tick(1);
    assert.equal(dom.attrs.has('expression-peek'), false);
    assert.equal(dom.attrs.has('expression-zoom'), false, 'zoom was absent before, so it is absent after');
    finish();
});

test('a zoom flag that was already set is put back, not removed', async () => {
    const dom = await setup();
    dom.body.setAttribute('expression-zoom', 'false');
    press(dom);
    assert.equal(dom.attrs.get('expression-zoom'), 'true');
    mock.timers.tick(3000);
    assert.equal(dom.attrs.get('expression-zoom'), 'false');
    finish();
});

test('a tap closes the peek immediately, and the click that belongs to that tap never reaches the UI', async () => {
    const dom = await setup();
    press(dom);
    mock.timers.tick(1); // the listener is attached on the next tick, so the starting tap cannot close it
    const down = dom.fire('document', 'pointerdown');
    assert.equal(down.stopped, true);
    assert.equal(dom.attrs.has('expression-peek'), false);
    const click = dom.fire('document', 'click');
    assert.equal(click.prevented && click.stopped, true, 'the stray click is swallowed');
    const later = dom.fire('document', 'click');
    assert.equal(later.stopped, undefined, 'only that one click is swallowed');
    finish();
});

test('a stale tap is not swallowed once the window has passed', async () => {
    const dom = await setup();
    press(dom);
    mock.timers.tick(1);
    dom.fire('document', 'pointerdown');
    mock.timers.tick(500);
    const click = dom.fire('document', 'click');
    assert.equal(click.stopped, undefined);
    finish();
});

test('pressing the button again during a peek neither restarts nor extends it', async () => {
    const dom = await setup();
    press(dom);
    mock.timers.tick(2000);
    press(dom);
    assert.equal(dom.attrs.get('expression-peek'), 'true', 'back to "true", never stuck on "start"');
    mock.timers.tick(1000);
    assert.equal(dom.attrs.has('expression-peek'), false, 'ends at the ORIGINAL 3 seconds');
    finish();
});

test('switching apps or locking the phone ends it without waiting for a timer', async () => {
    const dom = await setup();
    press(dom);
    dom.document.hidden = true;
    dom.fire('document', 'visibilitychange');
    assert.equal(dom.attrs.has('expression-peek'), false);
    press(dom);
    dom.fire('window', 'pagehide');
    assert.equal(dom.attrs.has('expression-peek'), false);
    finish();
});

test('with no portrait on screen there is no peek, just a note', async () => {
    const dom = await setup({ portrait: false });
    press(dom);
    assert.equal(dom.attrs.has('expression-peek'), false);
    assert.equal(dom.attrs.has('expression-zoom'), false);
    assert.equal(dom.toasts.length, 1);
    finish();
});

test('it can be used again straight after, and finished peeks leave no listeners behind', async () => {
    const dom = await setup();
    for (let n = 0; n < 3; n++) {
        press(dom);
        mock.timers.tick(1);
        mock.timers.tick(3000);
        assert.equal(dom.attrs.has('expression-peek'), false);
    }
    assert.equal(dom.listeners.document.get('pointerdown')?.size ?? 0, 0);
    assert.equal(dom.listeners.document.get('visibilitychange')?.size ?? 0, 0);
    assert.equal(dom.listeners.window.get('pagehide')?.size ?? 0, 0);
    finish();
});

test('the stylesheet hides the chat UI for the peek attribute but never the portraits', async () => {
    const { readFile } = await import('node:fs/promises');
    const css = await readFile(new URL('../../registrar-expressions/style.css', import.meta.url), 'utf8');
    const block = css.slice(css.indexOf('body[expression-peek=true] #top-bar'));
    for (const sel of ['#sheld', '#chat', '#send_form', '#top-bar']) assert.ok(block.includes(`body[expression-peek=true] ${sel}`), sel);
    assert.doesNotMatch(block.slice(0, block.indexOf('{')), /registrar-expression/);
    assert.match(block, /opacity: 0 !important/);
});

test('the quick reply only sets the attribute: no /vn, no Custom CSS rewrite', async () => {
    const { readFile } = await import('node:fs/promises');
    const raw = JSON.parse(await readFile(new URL('../../../../../data/default-user/QuickReplies/Weyland.json', import.meta.url), 'utf8'));
    let script = null;
    const walk = (o) => {
        if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === 'object') {
            if (o.label === 'CharacterViewer' && typeof o.message === 'string') script = o.message;
            Object.values(o).forEach(walk);
        }
    };
    walk(raw);
    assert.ok(script, 'CharacterViewer quick reply exists');
    assert.match(script, /attribute=expression-peek/);
    assert.doesNotMatch(script, /\/vn\b|customCSS|TempChecked/);
});
