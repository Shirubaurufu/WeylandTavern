import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCopycatReading } from '../lib/ui/apps/understudy.js';

test('Copycat distinguishes actions and dialogue, including speech inside an action', () => {
    const html = formatCopycatReading('*She waves.* "Hello." *She says “Welcome” and smiles.*');
    assert.match(html, /class="wp-copycat-actions">\*She waves\.\*<\/span>/);
    assert.match(html, /class="wp-copycat-dialogue">&quot;Hello\.&quot;<\/span>/);
    assert.match(html, /class="wp-copycat-dialogue">“Welcome”<\/span>/);
});

test('Copycat preview escapes HTML and preserves original text and punctuation', () => {
    const text = '*<img src=x onerror=alert(1)>* "A & B"\nUnmarked narration.';
    const html = formatCopycatReading(text);
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;img'));
    assert.equal(html.replace(/<\/?span[^>]*>/g, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&'), text);
});

test('Copycat applies underline and strong emphasis inside actions and speech', () => {
    const html = formatCopycatReading('*She **really** smiles.* "That is ***wonderful***!"');
    assert.match(html, /class="wp-copycat-actions"><u>really<\/u>/);
    assert.match(html, /class="wp-copycat-dialogue"><strong><em>wonderful<\/em><\/strong>/);
    assert.ok(!html.includes('**'));
});

test('emphasis can enclose quoted speech and keeps emoji offsets and HTML escaping intact', () => {
    const html = formatCopycatReading('💙 ***“Hello <friend>”*** and **a & b**');
    assert.match(html, /class="wp-copycat-dialogue"><strong><em>“Hello &lt;friend&gt;”<\/em><\/strong>/);
    assert.match(html, /<u>a &amp; b<\/u>/);
    assert.ok(html.startsWith('💙 '));
    assert.ok(!html.includes('**'));
    assert.equal(formatCopycatReading('Unclosed ** stays literal'), 'Unclosed ** stays literal');
});
