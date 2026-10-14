import test from 'node:test';
import assert from 'node:assert/strict';
import { formatterHarness } from './helpers/formatterHarness.js';
import { parseReply, parseGroupReply } from '../lib/messageParsing.js';

const secret = 'SECRET: her father is alive.';
const header = '¦¦ Saturday, Oct 18th ~ 9:28 AM ~ Dormitory ~¦¦';
const reply = `${header}\n\n*She waves.*\n\n[Amusement] [RC]`;
const openers = ['SCENE SHEET', '[SCENE SHEET]', '  [scene sheet]  \r', '<analysis>', '<think>'];

for (const opener of openers) {
    test(`${opener.trim()}: cut-off preparation never becomes a reply`, async () => {
        const formatter = formatterHarness();
        for (const suffix of ['', `\n${secret}\nSPARK [1/6]\ncut off`]) {
            const raw = opener + suffix;
            assert.equal(await formatter.format(raw), '');
            assert.equal(formatter.chat[1].extra.reasoning, '');
        }
    });

    test(`${opener.trim()}: missing closer recovers the real reply at its header`, async () => {
        const formatter = formatterHarness();
        const expected = await formatter.format(reply);
        const raw = `${opener}\n${secret}\n${reply}`;
        assert.equal(await formatter.format(raw), expected);
    });
}

test('closed sheets are hidden, including consecutive blocks and CRLF', async () => {
    const formatter = formatterHarness();
    const expected = await formatter.format(reply);
    const raw = `<think>outer notes</think>\r\n[SCENE SHEET]\r\n${secret}\r\n[END OF SCENE SHEET]\r\n${reply}`;
    assert.equal(await formatter.format(raw), expected);
    assert.equal(await formatter.format(`SCENE SHEET\n${secret}\nEND OF SCENE SHEET`), '');
});

test('Muse plain headers recover a reply after an unclosed sheet', async () => {
    const formatter = formatterHarness();
    const raw = `SCENE SHEET\n${secret}\nSaturday, October 18, 2025 - 9:28 AM\n\n*She waves.*`;
    const formatted = await formatter.format(raw);
    assert.match(formatted, /She waves/);
    assert.doesNotMatch(formatted, /SECRET|SCENE SHEET/);
});

test('the Formatter still recovers headers with a stray prefix', async () => {
    const formatter = formatterHarness();
    const expected = await formatter.format(reply);
    const raw = `SCENE SHEET\n${secret}\nHeader: ${reply}`;
    assert.equal(await formatter.format(raw), expected);
});

for (const enabled of [true, false]) {
    for (const experimental of [true, false]) {
        test(`privacy survives enabled=${enabled}, experimental=${experimental}`, async () => {
            const formatter = formatterHarness();
            Object.assign(formatter.context.SillyTavern.getContext().extensionSettings['Weyland-Formatter'], { enabled, experimental });
            assert.equal(await formatter.format(`SCENE SHEET\n${secret}`), '');
            if (experimental) assert.match(formatter.chat[1].extra.reasoning, /SECRET/);
            else assert.equal(formatter.chat[1].extra.reasoning, '');
        });
    }
}

test('Kressa keeps its own header-free replies and closed preparation', async () => {
    const formatter = formatterHarness();
    formatter.chat[1].name = 'Kressa';
    const text = '*Kressa leans on the counter.*\n\n"You came back."\n\n[Amusement] [RC]';
    assert.equal(await formatter.format(text), text);
    assert.equal(await formatter.format(`<analysis>${secret}</analysis>\n${text}`), text);
    assert.equal(await formatter.format(`[SCENE SHEET]\n${secret}\n[END OF SCENE SHEET]\n${text}`), text);
    assert.equal(await formatter.format(`SCENE SHEET\n${secret}`), '');
});

test('header-free phone replies and plain fallback text remain valid', async () => {
    const formatter = formatterHarness();
    const incoming = 'Incoming¦3:47 PM¦Rosa¦hey whats up';
    assert.equal(await formatter.format(incoming), incoming);
    assert.deepEqual(parseReply(incoming), { messages: ['hey whats up'], usedFallback: false });
    assert.deepEqual(parseReply('hey whats up'), { messages: ['hey whats up'], usedFallback: true });
    for (const sheet of ['SCENE SHEET', '[SCENE SHEET]', '[scene sheet]']) {
        const close = sheet.startsWith('[') ? '[END OF SCENE SHEET]' : 'END OF SCENE SHEET';
        const raw = `${sheet}\n${secret}\n${close}\n${incoming}`;
        assert.equal(await formatter.format(raw), incoming);
        assert.deepEqual(parseReply(raw), { messages: ['hey whats up'], usedFallback: false });
        assert.deepEqual(parseGroupReply(raw), { messages: [{ speaker: 'Rosa', content: 'hey whats up' }], usedFallback: false });
        assert.deepEqual(parseReply(`${sheet}\n${secret}`), { messages: [], usedFallback: false });
        assert.deepEqual(parseGroupReply(`${sheet}\n${secret}`), { messages: [], usedFallback: false });
    }
});

test('ordinary header-free content, user messages and greetings are preserved', async () => {
    const formatter = formatterHarness();
    assert.equal(await formatter.format('OOC: One moment.'), 'OOC: One moment.');
    formatter.chat[1].is_user = true;
    const raw = `SCENE SHEET\n${secret}`;
    assert.equal(await formatter.format(raw), raw);
    formatter.chat[1].is_user = false;
    formatter.chat[1].is_system = true;
    assert.equal(await formatter.format(raw), raw);
    formatter.chat[0].mes = raw;
    await formatter.context.formatMessage(0);
    assert.equal(formatter.chat[0].mes, raw);
});

test('OOC generation ignores cached roleplay thinking, including with a prompt bias', async () => {
    for (const Thinking of ['<think>old roleplay preparation', '<analysis>old preparation', '[SCENE SHEET]\nold preparation']) {
        for (const bias of ['', 'Custom prefix']) {
            const formatter = formatterHarness();
            formatter.chat[1].name = 'Rosa';
            formatter.context.getGlobalVariable = key => ({ OOCMode: 'Enabled', Thinking })[key] ?? '';
            formatter.context.power_user.user_prompt_bias = bias;
            const text = 'Sure, we can talk about how that scene went.';
            formatter.chat[1].mes = text;
            await formatter.context.formatNewMessage(1, 'normal');
            assert.equal(formatter.chat[1].mes, text);
            assert.match(formatter.render(text), /Sure, we can talk/);
            assert.deepEqual(formatter.interruptionNotices, []);
        }
    }
});

test('OOC still hides actual unfinished analysis and preserves replies after closed analysis', async () => {
    for (const [open, close] of [['<think>', '</think>'], ['<analysis>', '</analysis>'], ['[SCENE SHEET]\n', '\n[END OF SCENE SHEET]']]) {
        const formatter = formatterHarness();
        formatter.context.getGlobalVariable = key => ({ OOCMode: 'Enabled', Thinking: '<think>old preparation' })[key] ?? '';
        formatter.chat[1].mes = `${open}${secret}`;
        await formatter.context.formatNewMessage(1, 'normal');
        assert.equal(formatter.chat[1].mes, '');
        assert.deepEqual(formatter.interruptionNotices, ['interrupted']);
        formatter.chat[1].mes = `${open}${secret}${close}\nLet's talk about the scene.`;
        await formatter.context.formatNewMessage(1, 'normal');
        assert.equal(formatter.chat[1].mes, "Let's talk about the scene.");
        assert.deepEqual(formatter.interruptionNotices, ['interrupted']);
    }
});

test('turning OOC off restores roleplay preparation handling', async () => {
    const formatter = formatterHarness();
    let mode = 'Enabled';
    formatter.context.getGlobalVariable = key => ({ OOCMode: mode, Thinking: '<think>roleplay preparation' })[key] ?? '';
    formatter.chat[1].mes = 'We can discuss the scene.';
    await formatter.context.formatNewMessage(1, 'normal');
    assert.equal(formatter.chat[1].mes, 'We can discuss the scene.');
    mode = 'Disabled';
    formatter.chat[1].mes = 'unfinished analysis without a closing marker';
    await formatter.context.formatNewMessage(1, 'normal');
    assert.equal(formatter.chat[1].mes, '');
    assert.deepEqual(formatter.interruptionNotices, ['interrupted']);
    formatter.chat[1].mes = reply;
    await formatter.context.formatNewMessage(1, 'normal');
    assert.match(formatter.chat[1].mes, /She waves/);
});

test('an image inside cut-off preparation cannot rescue the message', async () => {
    const formatter = formatterHarness();
    const raw = `SCENE SHEET\n${secret}\n<div class="weygen-rp-image"><img src="/test.png"></div>`;
    assert.equal(await formatter.format(raw), '');
});

test('phone parsing hides a second unfinished scratch block after a closed first block', () => {
    const raw = `<analysis>first block</analysis>\n[SCENE SHEET]\n${secret}`;
    assert.deepEqual(parseReply(raw), { messages: [], usedFallback: false });
    assert.deepEqual(parseGroupReply(raw), { messages: [], usedFallback: false });
});

test('rendering never hides the sheet: streaming is a debug view and the backend team needs to see the analysis', () => {
    const formatter = formatterHarness();
    for (const raw of [`SCENE SHEET\n${secret}`, `[SCENE SHEET]\n${secret}\n[END OF SCENE SHEET]\n${reply}`]) {
        // A reply still being written (or a raw one just loaded) shows everything the model wrote.
        for (const options of [{}, { isUser: true }, { isSystem: true }, { isReasoning: true }, { messageId: 0 }]) {
            assert.match(formatter.render(raw, options), /SECRET/);
        }
    }
    assert.match(formatter.html(`SCENE SHEET\n${secret}`), /SECRET/, 'the shared converter must still render prompts');
});

test('the completed message is the one that gets cleaned: the stored text loses the sheet, the reasoning panel keeps it only in experimental mode', async () => {
    for (const experimental of [false, true]) {
        const formatter = formatterHarness();
        Object.assign(formatter.context.SillyTavern.getContext().extensionSettings['Weyland-Formatter'], { experimental });
        const raw = `[SCENE SHEET]\n${secret}\n[END OF SCENE SHEET]\n${reply}`;
        const done = await formatter.format(raw);
        assert.doesNotMatch(done, /SECRET|SCENE SHEET/);
        assert.match(done, /She waves/);
        if (experimental) assert.match(formatter.chat[1].extra.reasoning, /SECRET/);
        else assert.equal(formatter.chat[1].extra.reasoning, '');
    }
});
