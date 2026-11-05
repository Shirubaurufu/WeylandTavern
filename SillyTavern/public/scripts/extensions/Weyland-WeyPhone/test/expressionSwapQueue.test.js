import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// Reported 2026-11-02 ("expression is set to neutral despite the tag"): stock setExpression let two sprite swaps overlap,
// which left 'expression-animating' on an image for good and made every later swap a silent no-op. Reproduced on :8001 with
// five mood changes 60 ms apart (portrait stayed on the 5th-from-last mood while ExpSave kept moving). Swaps now run one at a
// time, a fade is finished before the next swap, and the queue never waits on a fade a hidden tab cannot tick.

const source = await readFile(new URL('../../expressions/index.js', import.meta.url), 'utf8');

test('setExpression is a queue in front of setExpressionNow', () => {
    assert.match(source, /function setExpression\(spriteFolderName, expression, options\) \{[\s\S]*?expressionSwapQueue\.then\(\(\) => setExpressionNow\(/);
    assert.match(source, /async function setExpressionNow\(/);
    // a failed swap must not break the chain
    assert.match(source, /expressionSwapQueue = run\.catch\(/);
});

test('a leftover animation flag is cleared before the swap decides whether to run', () => {
    const body = source.slice(source.indexOf('async function setExpressionNow('));
    const clear = body.indexOf(".stop(true, true).removeClass('expression-animating')");
    const read = body.indexOf("const img = $('img.expression')");
    assert.ok(clear > 0 && read > clear, 'flag is cleared before img is read');
});

test('the queue waits for the fade but has a timeout for hidden tabs', () => {
    assert.match(source, /await Promise\.race\(\[fadeIn, new Promise\(resolve => setTimeout\(resolve, 1000\)\)\]\)/);
});
