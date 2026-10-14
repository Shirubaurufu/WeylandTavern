import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { buildOocPostHistory, cardPostHistoryExtras, cardSystemPromptExtras, stripFromMessages } from '../../quick-reply-ext/src/oocMode.js';

// Shaped like Yue-Lin's real card field (CRLF line endings, the slot first, her block after it).
const YUE = '{{getvar::postrav}}\r\n\r\n[YUE LIN REASONING MODIFIER]\r\n Roll into your reasoning:\r\n- READ THE INTRO CONTEXT, ITS CRITICAL INFO\r\n- Chinese characters: ONLY displayed on her screen (exposed thoughts, incomplete sentences).\r\n- If characters flash on the screen, they MUST be shown to the user on a separate line.';
const OOC = buildOocPostHistory('[CRITICAL - NARRATOR - SALEM]\nSalem is...');

test('a card that keeps the postrav slot and adds its own post-history reports exactly that extra text', () => {
    const extras = cardPostHistoryExtras(YUE);
    assert.ok(extras.startsWith('[YUE LIN REASONING MODIFIER]'));
    assert.ok(extras.endsWith('on a separate line.'));
    assert.doesNotMatch(extras, /postrav/);
    assert.equal(cardPostHistoryExtras('{{getvar::postrav}}\r\n\r\n{{getvar::VeraPost}}'), '{{getvar::VeraPost}}');
    assert.equal(cardPostHistoryExtras('Before.\n{{ getvar :: PostRav }}\nAfter.'), 'Before.\n\nAfter.');
});

test('cards with nothing extra, or whose post-history is some other variable, are left alone', () => {
    assert.equal(cardPostHistoryExtras('{{getvar::postrav}}'), '');
    assert.equal(cardPostHistoryExtras('  {{getvar::postrav}}\r\n'), '');
    // These never use the slot OOC replaces, so there is nothing to strip (Kris, Muse, Cerberus Sisters).
    assert.equal(cardPostHistoryExtras('{{getvar::Krisrav}}'), '');
    assert.equal(cardPostHistoryExtras('{{getvar::PostMuse}}\r\n\r\n{{getvar::Mu3ePost}}'), '');
    assert.equal(cardPostHistoryExtras(''), '');
    assert.equal(cardPostHistoryExtras(undefined), '');
});

test('the card text is cut from the outgoing post-history and the OOC line stays', () => {
    const extras = cardPostHistoryExtras(YUE);
    // What ST sends: the macros expanded, and CRLF turned into LF somewhere along the way.
    const sent = `${OOC}\n\n${extras.replace(/\r\n/g, '\n')}`;
    const messages = [{ role: 'system', content: 'system prompt' }, { role: 'user', content: 'hi' }, { role: 'system', content: sent }];
    assert.equal(stripFromMessages(messages, extras), 1);
    assert.equal(messages[2].content, OOC.trim());
    assert.doesNotMatch(messages[2].content, /YUE LIN|Chinese characters|flash on the screen/);
    assert.equal(messages[0].content, 'system prompt'); // nothing else is touched
});

test('only the last message that contains the text is edited: chat history that quotes it stays', () => {
    const extras = cardPostHistoryExtras(YUE);
    const quoted = { role: 'assistant', content: `She said: ${extras.replace(/\r\n/g, '\n')}` };
    const post = { role: 'system', content: `${OOC}\n\n${extras}` };
    const messages = [quoted, { role: 'user', content: 'ok' }, post];
    assert.equal(stripFromMessages(messages, extras), 1);
    assert.match(messages[0].content, /YUE LIN REASONING MODIFIER/);
    assert.doesNotMatch(messages[2].content, /YUE LIN REASONING MODIFIER/);
});

test('text parts (Claude-style content arrays) and merged system messages are handled', () => {
    const extras = cardPostHistoryExtras(YUE);
    const parts = [{ role: 'system', content: [{ type: 'text', text: `${OOC}\n\n${extras}` }] }];
    assert.equal(stripFromMessages(parts, extras), 1);
    assert.equal(parts[0].content[0].text, OOC.trim());
    // Merged with another system message after it: the gap left behind is closed up.
    const merged = [{ role: 'system', content: `${OOC}\n\n${extras}\n\n\n\nClient note.` }];
    assert.equal(stripFromMessages(merged, extras), 1);
    assert.equal(merged[0].content, `${OOC}\n\nClient note.`);
});

test('no match, empty text and bad input are harmless', () => {
    const messages = [{ role: 'system', content: 'nothing relevant' }];
    assert.equal(stripFromMessages(messages, 'absent text'), 0);
    assert.equal(stripFromMessages(messages, ''), 0);
    assert.equal(stripFromMessages(messages, '   '), 0);
    assert.equal(stripFromMessages(null, 'x'), 0);
    assert.equal(stripFromMessages([null, { role: 'user' }], 'x'), 0);
    assert.deepEqual(messages, [{ role: 'system', content: 'nothing relevant' }]);
    // Regex characters in the card text are matched literally.
    const odd = [{ role: 'system', content: 'keep (this) [tag]* now' }];
    assert.equal(stripFromMessages(odd, '(this) [tag]*'), 1);
    assert.equal(odd[0].content, 'keep  now');
});

test("a card's own SYSTEM-prompt text after the ravteg slot (Loona's drunk coaching) is reported too", () => {
    assert.equal(cardSystemPromptExtras('{{getvar::ravteg}}\r\n{{getvar::DrunkCoach}}'), '{{getvar::DrunkCoach}}');
    assert.equal(cardSystemPromptExtras('{{getvar::ravteg}}'), '');
    // Cards whose system prompt is another variable (Kinsbane, Muse, Kressa...) never use the slot.
    assert.equal(cardSystemPromptExtras('{{getvar::ravtegKinsB}}'), '');
    assert.equal(cardSystemPromptExtras('{{getvar::Kravteg}}'), '');
    // The two fields use different slots: a post-history slot is not a system-prompt slot.
    assert.equal(cardSystemPromptExtras('{{getvar::postrav}}\nextra'), '');
    assert.equal(cardPostHistoryExtras('{{getvar::ravteg}}\nextra'), '');
});

test('the system-prompt extra is cut from the FIRST message that has it, not a later chat message', () => {
    const coaching = 'DRUNK SPEECH: slur every s, lose the thread of sentences.';
    const messages = [
        { role: 'system', content: `[OOC SYSTEM PROMPT]\n${coaching}` },
        { role: 'assistant', content: `Loona: ${coaching}` }, // she quoted it in an earlier reply
        { role: 'system', content: '[OOC MODE IS ON]' },
    ];
    assert.equal(stripFromMessages(messages, coaching, { fromStart: true }), 1);
    assert.equal(messages[0].content, '[OOC SYSTEM PROMPT]');
    assert.match(messages[1].content, /DRUNK SPEECH/);
    // Default direction (post-history) takes the last match instead.
    const again = [{ role: 'system', content: `A ${coaching}` }, { role: 'system', content: `B ${coaching}` }];
    assert.equal(stripFromMessages(again, coaching), 1);
    assert.match(again[0].content, /DRUNK SPEECH/);
    assert.equal(again[1].content, 'B');
});

test('index.js cuts both fields only while OOC Mode is on, in its own try block', async () => {
    const source = await readFile(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    assert.match(source, /cardPostHistoryExtras, cardSystemPromptExtras, isOocModeEnabled, stripFromMessages/);
    const handler = source.slice(source.indexOf('function OnRequestReady'), source.indexOf('function stripCardExtrasForOoc'));
    assert.match(handler, /isOocModeEnabled\(getGlobalVariable\("OOCMode"\)\)\) \{\s*const cut = stripCardExtrasForOoc\(data\.messages\)/);
    assert.ok(handler.indexOf('applyGeminiBypassForModel') < handler.indexOf('stripCardExtrasForOoc'), 'a failed Gemini step must not skip the OOC cut');
    assert.match(handler.slice(handler.indexOf('Its own try')), /try \{/);
    const cutter = source.slice(source.indexOf('function stripCardExtrasForOoc'));
    assert.match(cutter, /substituteParams\(post\)/);
    assert.match(cutter, /substituteParams\(system\), \{ fromStart: true \}/);
});
