import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// 2026-11-02: an official side character (Luna beside Bastet) is drawn by quick-reply-ext with the MAIN character's footer
// mood, and the overlay only ran its per-speaker reading (Registrar's "last block of text that starts with Their Name:")
// for open slots, so her own furious line still showed Bastet's excitement. refineBaseSideExpression reads her block too,
// and keeps the footer mood whenever there is nothing better. Live-checked on :8001 (furious -> anger, crying -> sadness).

const source = await readFile(new URL('../../registrar-expressions/index.js', import.meta.url), 'utf8');

test('the base right slot gets its own per-speaker mood, behind the side-character switch', () => {
    assert.match(source, /async function refineBaseSideExpression\(side\)/);
    assert.match(source, /if \(sideExpressionsEnabled && right\.path && right\.path === rightBasePath && right\.isOfficial && right\.name\) \{\s*right = await refineBaseSideExpression\(right\);/);
});

test('it reads the same last block of text the Registrar characters use', () => {
    const body = source.slice(source.indexOf('async function refineBaseSideExpression'));
    assert.match(body.slice(0, 1500), /await getSpeakerEmotion\(side\.name\)/);
});

test('the footer mood stays when there is nothing better (same mood, no sprite, or an error)', () => {
    const body = source.slice(source.indexOf('async function refineBaseSideExpression'), source.indexOf('let activeOutfit'));
    assert.match(body, /emotion === side\.emotion\) return side/);
    assert.match(body, /if \(!path\) return side/);
    assert.match(body, /catch \(e\) \{[\s\S]*return side;/);
    // keeps the costume quick-reply-ext chose instead of the overlay's own guess
    assert.match(body, /characters\\\/\[\^\/\]\+\\\/\(\[\^\/\]\+\)\\\//);
});
