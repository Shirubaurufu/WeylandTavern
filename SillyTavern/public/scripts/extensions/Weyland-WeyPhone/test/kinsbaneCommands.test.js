import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

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
    const once = JSON.stringify(first);
    applyKinsbaneCommand(first, { kinsbane: true });
    assert.equal(JSON.stringify(first), once, 'an existing short Look sheet is not a missing-marker fallback');
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

test('journal instructions require a complete uninterrupted document, then reactions, and the normal scene header', () => {
    for (const instruction of [COMMAND_SHEETS.journal, commandNote('journal')]) {
        assert.match(instruction, /one uninterrupted block/);
        assert.match(instruction, /Do not insert.*Aiko.*between/i);
        assert.match(instruction, /only AFTER the entire document/);
        assert.match(instruction, /punctuation and paragraph breaks/);
        assert.match(instruction, /¦¦ DAY, DATE ~ XX:XX PM\/AM ~ Location ~ \(Message mode if applicable\) ¦¦/);
        assert.doesNotMatch(instruction, /woven into/);
    }
});

test('journal reminder comes after the lorebook and character directions without changing either', () => {
    const messages = kinsbaneRequest('!Ami0601');
    messages[0].content += '\nLITERAL NOTE PAYLOAD $&: keep the words exactly.';
    const originalTail = messages[0].content.slice(messages[0].content.indexOf(KINSBANE_SHEET_END) + KINSBANE_SHEET_END.length);
    applyKinsbaneCommand(messages, { kinsbane: true });
    assert.ok(messages[0].content.endsWith(originalTail));
    assert.ok(messages.at(-1).content.endsWith(commandNote('journal')));
    const once = JSON.stringify(messages);
    applyKinsbaneCommand(messages, { kinsbane: true });
    assert.equal(JSON.stringify(messages), once, 'reprocessing one payload must not repeat its reminder');
});

test('a recognized journal command still gets its reminder if an older prompt lacks sheet markers', () => {
    const messages = [{ role: 'system', content: 'older unmarked prompt\nVERBATIM LETTER' },
        { role: 'user', content: '!Kenji0601' }, { role: 'system', content: 'post-history' }];
    const result = applyKinsbaneCommand(messages, { kinsbane: true });
    assert.equal(result.kind, 'journal');
    assert.ok(result.changed > 0);
    assert.equal(messages[0].content, 'older unmarked prompt\nVERBATIM LETTER');
    assert.ok(messages.at(-1).content.endsWith(commandNote('journal')));
});

test('multipart Aiko command reminders preserve media and remain stable on repeated routing', () => {
    const messages = [{ role: 'user', content: [{ type: 'text', text: '!Ami0601' },
        { type: 'image_url', image_url: { url: 'test-image' } }] }];
    const image = messages[0].content[1];
    applyKinsbaneCommand(messages, { kinsbane: false });
    assert.equal(messages[0].content[1], image);
    const once = JSON.stringify(messages);
    applyKinsbaneCommand(messages, { kinsbane: false });
    assert.equal(JSON.stringify(messages), once);
});

test('the actual request hook recognizes every released journal code with Aiko present and skips unrelated/OOC requests', async () => {
    const index = await readFile(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    const hook = index.slice(index.indexOf('function OnRequestReady(data) {'), index.indexOf('\n/**', index.indexOf('function OnRequestReady(data) {')));
    let cardName = 'Kinsbane Manor';
    let ooc = false;
    const context = vm.createContext({
        applyKinsbaneCommand, getCurrentCharacterName: () => cardName,
        getGlobalVariable: () => ooc ? 'Enabled' : 'Disabled', isOocModeEnabled: () => ooc,
        applyGeminiBypassForModel: () => ({}), stripCardExtrasForOoc: () => 0,
        SillyTavern: { getContext: () => ({ substituteParams: text => text.replaceAll('{{user}}', 'Jin') }) },
        DebugLog: () => {}, console: { error: (...args) => assert.fail(args.join(' ')) },
    });
    vm.runInContext(hook, context);
    for (const code of ['!Ami0601', '!Kenji0601', '!Ami0615', '!Kenji0613', '!Ami0617', '!Kenji0617']) {
        for (const card of ['Kinsbane Manor', 'Aiko']) {
            cardName = card;
            const data = { model: 'example-model', messages: kinsbaneRequest(`Aiko is beside me. ${code}`) };
            context.OnRequestReady(data);
            assert.match(data.messages.at(-1).content, /one uninterrupted block/);
            assert.match(data.messages.at(-1).content, /Jin/);
        }
    }
    for (const [card, mode, input] of [['Weybot', false, '!Ami0601'], ['Kinsbane Manor', true, '!Ami0601'],
        ['Kinsbane Manor', false, 'I read the note'], ['Kinsbane Manor', false, '!Entry']]) {
        cardName = card; ooc = mode;
        const data = { messages: kinsbaneRequest(input) };
        const before = JSON.stringify(data);
        context.OnRequestReady(data);
        assert.equal(JSON.stringify(data), before);
    }
});
