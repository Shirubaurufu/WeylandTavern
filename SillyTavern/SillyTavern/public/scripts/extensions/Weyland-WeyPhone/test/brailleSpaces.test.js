// Gemini Bypass braille blanks (quick-reply-ext/src/brailleSpaces.js, 2026-11-19): only the player's latest message, only
// inside the outgoing request, and Gemini's reply cleaned back to normal spaces.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAILLE_BLANK, braillePlayerMessage, cleanReplyBraille } from '../../quick-reply-ext/src/brailleSpaces.js';

const B = BRAILLE_BLANK;
const player = 'I grab her hand and run';

test('only the latest user message changes, and only its spaces', () => {
    const messages = [
        { role: 'system', content: 'System prompt with spaces' },
        { role: 'user', content: 'an older message from me' },
        { role: 'assistant', content: 'a reply with spaces' },
        { role: 'user', content: `${player}\nsecond line` },
        { role: 'system', content: 'post history stays plain' },
    ];
    const n = braillePlayerMessage(messages, [`${player}\nsecond line`]);
    assert.equal(n, 6);
    assert.equal(messages[3].content, `I${B}grab${B}her${B}hand${B}and${B}run\nsecond${B}line`);
    for (const i of [0, 1, 2, 4]) assert.ok(!messages[i].content.includes(B), `message ${i} untouched`);
});

test('post-history merged into the same user message stays plain', () => {
    const post = 'POST HISTORY: keep writing in present tense';
    const messages = [{ role: 'user', content: `Lucky: ${player}\n\n${post}` }];
    braillePlayerMessage(messages, [player]);
    assert.equal(messages[0].content, `Lucky: ${player.replace(/ /g, B)}\n\n${post}`);
});

test('a short message does not match inside a longer line of injected text', () => {
    const messages = [{ role: 'user', content: 'ok sure\n\nRemember: if they say ok sure then move on' }];
    braillePlayerMessage(messages, ['ok sure']);
    assert.equal(messages[0].content, `ok${B}sure\n\nRemember: if they say ok sure then move on`);
});

test('Continue / Impersonate: an assistant message after the player means no change', () => {
    const messages = [{ role: 'user', content: player }, { role: 'assistant', content: 'half a reply' }];
    assert.equal(braillePlayerMessage(messages, [player]), 0);
    assert.equal(messages[0].content, player);
});

test('text not found (a prompt regex changed it) means no change', () => {
    const messages = [{ role: 'user', content: 'something else entirely' }];
    assert.equal(braillePlayerMessage(messages, [player]), 0);
    assert.equal(messages[0].content, 'something else entirely');
});

test('the macro-expanded copy is used when that is what was sent, and content arrays work', () => {
    const messages = [{ role: 'user', content: [{ type: 'image_url' }, { type: 'text', text: 'I wave at Belle' }] }];
    braillePlayerMessage(messages, ['I wave at {{char}}', 'I wave at Belle']);
    assert.equal(messages[0].content[1].text, `I${B}wave${B}at${B}Belle`);
});

test('reply cleanup', () => {
    assert.equal(cleanReplyBraille(`¦¦ Mon${B}~ Room ¦¦\n"Hi${B}there"`), '¦¦ Mon ~ Room ¦¦\n"Hi there"');
    assert.equal(cleanReplyBraille('plain'), 'plain');
});

test('index.js: tied to Gemini Bypass + a Gemini model, runs last, cleanup runs first on MESSAGE_RECEIVED', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, '../../quick-reply-ext/index.js'), 'utf8');
    const hook = src.slice(src.indexOf('function OnRequestReady('), src.indexOf('let brailleRequested'));
    const block = hook.slice(hook.lastIndexOf('try {'));
    assert.ok(block.includes('braillePlayerMessage') && block.includes('isGeminiModel(data.model)') && block.includes('"GeminiBypassToggle"'));
    assert.ok(hook.lastIndexOf('braillePlayerMessage') > hook.lastIndexOf('applyKinsbaneCommand'), 'braille runs after the command check');
    assert.match(src, /eventSource\.makeFirst\(event_types\.MESSAGE_RECEIVED, OnReplyBraille\)/);
});
