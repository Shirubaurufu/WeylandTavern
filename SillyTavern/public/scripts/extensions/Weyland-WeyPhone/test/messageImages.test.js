import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessageImages, renderMessageImages, safeImageUrl } from '../lib/messageImages.js';

test('screenshot-style attachment preserves surrounding text and resolves Markdown', () => {
    const source = '[Image Attached] ![3.jpg](https://i.postimg.cc/6q3f39Vg/07B-Anima-00707.png)';
    assert.deepEqual(parseMessageImages(source), [
        { type: 'text', text: '[Image Attached] ' },
        { type: 'image', url: 'https://i.postimg.cc/6q3f39Vg/07B-Anima-00707.png', alt: '3.jpg' },
    ]);
});

test('greeting shortcuts use numeric global keys and retain unresolved codes', () => {
    const keys = [];
    const parts = parseMessageImages('[I001] hi [ P002 ] [I003] [S01]', code => {
        keys.push(code);
        return code === '003' ? undefined : `https://example.com/${code}.png`;
    });
    assert.deepEqual(keys, ['001', '002', '003']);
    assert.equal(parts.filter(p => p.type === 'image').length, 2);
    assert.equal(parts.at(-1).text, ' [I003] [S01]');
});

test('URL parentheses, angle destinations, titles, query strings and multiple images', () => {
    const parts = parseMessageImages('![a](https://example.com/a(1).png?x=1&y=2 "title") ![b](<https://example.com/b.png>)');
    assert.equal(parts[0].url, 'https://example.com/a(1).png?x=1&y=2');
    assert.equal(parts[2].url, 'https://example.com/b.png');
});

test('unsafe URLs and raw HTML remain inert text, and failed lookups preserve codes', () => {
    for (const value of ['javascript:alert(1)', 'data:image/svg+xml,test', '//example.com/x', 'https://u:p@example.com/x']) {
        assert.equal(safeImageUrl(value), null);
    }
    const text = '<img src=x onerror=alert(1)> ![x](javascript:alert(1)) [I001]';
    assert.deepEqual(parseMessageImages(text, () => { throw Error('unavailable'); }), [{ type: 'text', text }]);
});

// Minimal DOM fixture exercises element/text construction and event behavior without
// loading SillyTavern or requesting any remote images.
function element(tag, doc) {
    return {
        tag, ownerDocument: doc, children: [], listeners: {},
        appendChild(child) { this.children.push(child); },
        addEventListener(type, fn) { this.listeners[type] = fn; },
    };
}
function target() {
    const doc = {
        createElement(tag) { return element(tag, doc); },
        createTextNode(text) { return { text }; },
    };
    return element('span', doc);
}

test('images open separately and a failed preview retains its usable link', () => {
    const root = target();
    renderMessageImages(root, '<b>hello</b> ![photo](https://example.com/a.png)');
    assert.deepEqual(root.children[0], { text: '<b>hello</b> ' });
    const link = root.children[1];
    assert.equal(link.tag, 'a');
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
    assert.equal(link.children[0].loading, 'lazy');
    link.children[0].listeners.error();
    assert.match(link.textContent, /Image unavailable/);
    assert.equal(link.href, 'https://example.com/a.png');
});

test('bulk selection renders previews without links or click interception', () => {
    const root = target();
    renderMessageImages(root, '[I001]', { selectable: true, resolveShortcut: () => 'https://example.com/a.png' });
    assert.equal(root.children[0].tag, 'span');
    assert.equal(root.children[0].href, undefined);
    assert.equal(root.children[0].listeners.click, undefined);
});
