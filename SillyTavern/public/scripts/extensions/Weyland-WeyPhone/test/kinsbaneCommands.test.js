import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { specialChar } from '../../quick-reply-ext/src/charper.js';
import {
    COMMAND_SHEETS,
    KINSBANE_SHEET_END,
    KINSBANE_SHEET_START,
    applyKinsbaneCommand,
    commandInRequest,
    commandNote,
    detectCommand,
} from '../../quick-reply-ext/src/kinsbaneCommands.js';

// !Look and journal codes change the prompt for ONE message (and its rerolls), like OOC Mode does for a chat.

const sys = specialChar.get('Kinsbane Manor').vars.ravtegKinsB;
const post = specialChar.get('Kinsbane Manor').vars.postravKinsB;

test('commands are detected, in any case, but only as real commands', () => {
    assert.equal(detectCommand('!Look'), 'look');
    assert.equal(detectCommand('i step inside and !look around'), 'look');
    assert.equal(detectCommand('!Kenji0613'), 'journal');
    assert.equal(detectCommand('here goes: !ami0601 !'), 'journal');
    for (const text of ['I look around', 'what a lookout', 'the !Looking glass', 'Ami0601', '!Kenji061', '', null, undefined]) {
        assert.equal(detectCommand(text), null, String(text));
    }
});

test('only the LAST user message counts (so the next message goes back to normal)', () => {
    const base = [{ role: 'system', content: 'x' }, { role: 'user', content: '!Look' }, { role: 'assistant', content: 'room' }];
    assert.equal(commandInRequest([...base, { role: 'user', content: 'I open the door' }]), null);
    assert.equal(commandInRequest([...base, { role: 'user', content: '!Ami0601' }, { role: 'system', content: 'post' }]), 'journal');
    assert.equal(commandInRequest([{ role: 'user', content: [{ type: 'text', text: '!Look' }] }]), 'look');
});

function kinsbaneRequest(userText) {
    return [
        { role: 'system', content: `${sys}\n\n[World]\nlorebook text` },
        { role: 'assistant', content: 'earlier reply' },
        { role: 'user', content: userText },
        { role: 'system', content: post },
    ];
}

test('Kinsbane: the long sheet is swapped for the command sheet, the rest of the prompt is untouched', () => {
    for (const [text, kind] of [['!Look', 'look'], ['!Ami0617', 'journal']]) {
        const messages = kinsbaneRequest(text);
        const before = messages[0].content;
        const result = applyKinsbaneCommand(messages, { kinsbane: true });
        assert.equal(result.kind, kind);
        const after = messages[0].content;
        assert.ok(after.startsWith(COMMAND_SHEETS[kind]), kind);
        assert.ok(after.endsWith(before.slice(before.indexOf(KINSBANE_SHEET_END) + KINSBANE_SHEET_END.length)), 'everything after the sheet is kept');
        assert.ok(!after.includes('THE FIFTEEN BOXES') && !after.includes('Dont give hints'), 'the rules against guiding are gone for this message');
        assert.match(after, /END OF SCENE SHEET/);
        assert.match(after, /VERDICT: SURVIVE/);
        assert.match(messages[3].content, /the short command sheet is filled out first/);
        assert.doesNotMatch(messages[3].content, /fifteen-box/);
    }
});

test('Kinsbane: a normal message changes nothing at all', () => {
    const messages = kinsbaneRequest('I walk into the kitchen and look around');
    const before = JSON.stringify(messages);
    assert.deepEqual(applyKinsbaneCommand(messages, { kinsbane: true }), { kind: null, changed: 0 });
    assert.equal(JSON.stringify(messages), before);
});

test('a reroll re-sends the same request, so it gets the same change', () => {
    const first = kinsbaneRequest('!Look');
    const second = kinsbaneRequest('!Look');
    applyKinsbaneCommand(first, { kinsbane: true });
    applyKinsbaneCommand(second, { kinsbane: true });
    assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('Aiko (regular sheet): the command note is appended to the end of the request, nothing is replaced', () => {
    const messages = [{ role: 'system', content: 'regular sheet text' }, { role: 'user', content: '!Kenji0613' }, { role: 'system', content: 'client note' }];
    const result = applyKinsbaneCommand(messages, { kinsbane: false });
    assert.equal(result.kind, 'journal');
    assert.equal(messages[0].content, 'regular sheet text');
    assert.ok(messages[2].content.startsWith('client note\n\n[COMMAND MESSAGE - THIS MESSAGE ONLY]'));
    assert.match(messages[2].content, /VERBATIM/);
    assert.match(commandNote('look'), /!Look/);
});

test('the sheet markers still exist in the live Kinsbane prompt, and the sheet text is plain', () => {
    assert.ok(sys.includes(KINSBANE_SHEET_START) && sys.includes(KINSBANE_SHEET_END));
    assert.ok(post.includes('the fifteen-box scene sheet is filled out first'), 'the client note wording the swap relies on');
    for (const sheet of Object.values(COMMAND_SHEETS)) {
        assert.ok(!sheet.includes('—'), 'no em dashes');
        assert.ok(!/reason|think|analysis/i.test(sheet), 'never the reasoning vocabulary providers refuse');
    }
});

test('wired in: OnRequestReady runs it for Kinsbane Manor and Aiko only', async () => {
    const index = await readFile(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    assert.match(index, /applyKinsbaneCommand\(data\.messages/);
    assert.match(index, /name === "Kinsbane Manor" \|\| name === "Aiko"/);
});
