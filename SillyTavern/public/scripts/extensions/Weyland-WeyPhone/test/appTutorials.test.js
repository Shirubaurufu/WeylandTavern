import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowAppTutorial, createAppTutorial, APP_TUTORIALS } from '../lib/ui/appTutorials.js';
import { tutorialText, TUTORIAL_CONTROLS } from '../lib/ui/appTutorialContent.js';

test('seen flags are independent and existing completion stays respected', () => {
    assert.equal(shouldShowAppTutorial({}, 'understudy'), true);
    const settings = { ui: { appTutorials: { understudy: 1 } } };
    assert.equal(shouldShowAppTutorial(settings, 'understudy'), false);
    assert.equal(shouldShowAppTutorial(settings, 'registrar'), true);
    assert.equal(shouldShowAppTutorial(settings, 'toString'), false);
});

test('inline references are escaped, accessible text rather than active app controls', () => {
    const rendered = tutorialText('<script> [[world]] & [[load]]');
    assert.ok(rendered.includes('&lt;script&gt;'));
    assert.ok(rendered.includes('>My world</span>'));
    assert.ok(rendered.includes('>Load</span>'));
    assert.ok(!rendered.includes('<button'));
    assert.ok(!rendered.includes('data-rg-tab'));
    for (const tour of Object.values(APP_TUTORIALS)) for (const step of tour.steps) {
        for (const text of [step.body, step.missing, ...(step.bullets || [])].filter(Boolean)) {
            for (const match of text.matchAll(/\[\[([a-z-]+)\]\]/g)) assert.ok(TUTORIAL_CONTROLS[match[1]], match[1]);
        }
    }
});

function fixture(t) {
    let observer;
    t.mock.method(globalThis, 'queueMicrotask', fn => fn());
    const prior = globalThis.MutationObserver;
    globalThis.MutationObserver = class { constructor(callback) { this.callback = callback; observer = this; } observe() {} disconnect() { this.disconnected = true; } };
    t.after(() => { if (prior) globalThis.MutationObserver = prior; else delete globalThis.MutationObserver; });
    const classes = new Set();
    const classList = { add: key => classes.add(key), remove: key => classes.delete(key) };
    const focus = { isConnected: true, focus() { this.restored = true; } };
    const copy = { dataset: {}, innerHTML: '' }, warning = { hidden: true };
    let guide;
    const screen = { querySelector: () => null, querySelectorAll: () => [], after() {} };
    const panel = {
        classList, handlers: {}, querySelector: () => screen,
        addEventListener(type, handler) { this.handlers[type] = handler; },
        removeEventListener(type) { delete this.handlers[type]; },
        ownerDocument: { activeElement: focus, createElement() {
            guide = { classList: { toggle() {} }, handlers: {}, contains: () => false, querySelectorAll: () => [],
                querySelector(selector) { return selector === '#wp-tour-body' ? copy : selector === '.wp-tour-warning' ? warning : selector === '#wp-tour-title' ? { focus() {} } : null; },
                addEventListener(type, handler) { this.handlers[type] = handler; },
                remove() { this.removed = true; } };
            return guide;
        } },
    };
    const finished = [], prepared = [], closed = [];
    const tour = createAppTutorial({ panel, onFinish: key => finished.push(key), prepareStep: (key, step) => prepared.push([key, step]), onClose: key => closed.push(key) });
    return { tour, panel, classes, focus, finished, prepared, closed, copy, warning, observer: () => observer, guide: () => guide,
        click: action => guide.handlers.click({ target: { closest: () => ({ dataset: { tour: action } }) } }) };
}

test('skip cleans up navigation listeners, highlights, and observer; replay starts over', t => {
    const f = fixture(t);
    f.tour.open('understudy');
    f.click('next');
    f.tour.open('understudy');
    assert.equal(f.prepared.at(-1)[1], 'reply');
    assert.match(f.copy.innerHTML, /character reply/);
    f.click('skip');
    assert.deepEqual(f.finished, ['understudy']);
    assert.equal(f.observer().disconnected, true);
    assert.equal(f.classes.has('wp-tour-active'), false);
    assert.equal(f.panel.handlers.click, undefined);
    assert.equal(f.focus.restored, true);
    f.tour.open('understudy');
    assert.equal(f.prepared.at(-1)[1], 'welcome');
});

test('Back, completion, and leaving the app have distinct outcomes', t => {
    const f = fixture(t);
    f.tour.open('understudy');
    f.click('next'); f.click('back');
    assert.equal(f.prepared.at(-1)[1], 'welcome');
    f.tour.navigate('understudy-settings');
    assert.equal(f.guide().removed, undefined);
    f.tour.navigate('home');
    assert.deepEqual(f.finished, []);
    assert.equal(f.guide().removed, true);
    f.tour.open('understudy');
    for (let i = 0; i < APP_TUTORIALS.understudy.steps.length; i++) f.click('next');
    assert.deepEqual(f.finished, ['understudy']);
});

test('generation/import actions are blocked while browsing remains available', t => {
    const f = fixture(t); f.tour.open('understudy');
    let stopped = false;
    f.panel.handlers.click({ target: { closest: () => ({}) }, preventDefault() {}, stopImmediatePropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.equal(f.warning.hidden, false);
    f.panel.handlers.click({ target: { closest: () => null } });
    assert.deepEqual(f.finished, []);
});

test('Escape dismisses without leaving stale listeners', t => {
    const f = fixture(t); f.tour.open('registrar');
    let stopped = false;
    f.panel.handlers.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.deepEqual(f.finished, ['registrar']);
});

test('every app begins with a purpose-first welcome', () => {
    for (const tour of Object.values(APP_TUTORIALS)) {
        assert.equal(tour.steps[0].id, 'welcome');
        assert.equal(tour.steps[0].welcome, true);
        assert.ok(tour.steps[0].body.length);
    }
});

test('Mien walkthrough completes independently and explains temporary expression changes', t => {
    const f = fixture(t);
    f.tour.open('mien');
    assert.match(f.copy.innerHTML, /expressions and outfits/);
    for (let i = 0; i < APP_TUTORIALS.mien.steps.length; i++) f.click('next');
    assert.deepEqual(f.finished, ['mien']);
    assert.deepEqual(f.prepared.map(([, step]) => step), APP_TUTORIALS.mien.steps.map(step => step.id));
    assert.equal(shouldShowAppTutorial({ ui: { appTutorials: { mien: 1 } } }, 'mien'), false);
    assert.match(APP_TUTORIALS.mien.steps.find(step => step.id === 'apply').bullets.join(' '), /until the next character message/);
});

test('PawXai completes independently and navigates the correct app sections', t => {
    const f = fixture(t);
    f.tour.open('pawxai');
    assert.match(f.copy.innerHTML, /SDXL-style/);
    for (let i = 0; i < APP_TUTORIALS.pawxai.steps.length; i++) f.click('next');
    assert.deepEqual(f.prepared.map(([, step]) => step), APP_TUTORIALS.pawxai.steps.map(step => step.id));
    assert.deepEqual(f.finished, ['pawxai']);
    assert.equal(shouldShowAppTutorial({ ui: { appTutorials: { pawxai: 1 } } }, 'pawxai'), false);
    assert.equal(shouldShowAppTutorial({ ui: { appTutorials: { pawxai: 1 } } }, 'registrar'), true);
});
