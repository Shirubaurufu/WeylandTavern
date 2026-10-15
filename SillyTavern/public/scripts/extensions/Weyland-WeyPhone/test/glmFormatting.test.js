import test from 'node:test';
import assert from 'node:assert/strict';
import { formatterHarness } from './helpers/formatterHarness.js';

const plain = 'Saturday, Oct 18th ~ 9:28 AM ~ Dormitory ~';
const prose = '*She waves.*\n\n[Amusement] [RC]';
const sheet = '<think>first notes</think>\n[Scene sheet]\nSECRET preparation\n[End scene sheet]\n---\n';

test('GLM headers missing bars render like standard headers, with or without preparation', async () => {
    for (const line of [plain, plain.slice(0, -2), `**${plain}**`, 'Dormitory ~ Saturday, October 18, 2025 ~ 21:28 ~ ONYX ~',
        'Wednesday, Oct 16th (Sophomore) ~ 7:44 PM ~ Sterling Hall, Room 271 ~',
        'Wednesday, Oct 16th (Sophomore) ~ 7:45 PM ~ Sterling Hall, Room 271 ~ (SAPH)',
        'Wednesday, Oct 16th, 2020 (Sophomore) ~ 7:45 PM ~ Sterling Hall, Room 271 ~ (SAPH)',
        'Friday, Dec 18th, 2020 ~ 9:28 AM ~ Dormitory ~',
        'Friday, Jan 8th, 2021 ~ 9:28 AM ~ Dormitory ~']) {
        for (const prefix of ['', sheet, 'SCENE SHEET\nSECRET unfinished preparation\n']) {
            const formatter = formatterHarness();
            formatter.chat[1].name = 'Summer';
            const expected = await formatter.format(`¦¦ ${line.replaceAll('**', '')} ¦¦\n\n${prose}`);
            const actual = await formatter.format(`${prefix}${line}\n\n${prose}`);
            assert.equal(actual, expected);
            assert.match(formatter.render(actual), /class="message-header"/);
            assert.doesNotMatch(actual, /SECRET|SCENE SHEET/i);
        }
    }
});

test('ordinary prose, phone text, Muse headers and quoted header examples are not repaired', async () => {
    for (const text of ['OOC: Saturday ~ sometime ~ Dormitory', '*She smiles ~ then waves ~ goodbye*',
        'Incoming¦9:28 AM¦Summer¦hello', `"${plain}"`, `Here is an example:\n\n${plain}`]) {
        const formatter = formatterHarness();
        formatter.chat[1].name = 'Summer';
        assert.equal(await formatter.format(text), text);
    }
});

test('completed streamed replies redraw using the cleaned message, even with formatting disabled', async () => {
    for (const enabled of [true, false]) {
        const formatter = formatterHarness();
        formatter.context.SillyTavern.getContext().extensionSettings['Weyland-Formatter'].enabled = enabled;
        const redrawn = [];
        formatter.context.updateMessageBlock = (id, message) => redrawn.push({ id, text: message.mes });
        formatter.chat[1].mes = `${sheet}¦¦ ${plain} ¦¦\n\n${prose}`;
        await formatter.context.formatNewMessage(1, 'normal');
        assert.equal(redrawn.length, 1);
        assert.equal(redrawn[0].text, formatter.chat[1].mes);
        assert.doesNotMatch(redrawn[0].text, /SECRET|SCENE SHEET/i);
        assert.match(redrawn[0].text, /She waves/);
    }
});

test('non-streaming cleanup waits for the host to create the message element', async () => {
    const formatter = formatterHarness();
    formatter.context.document = { querySelector: () => null };
    formatter.context.updateMessageBlock = () => { throw new Error('message DOM does not exist yet'); };
    formatter.chat[1].mes = `${sheet}¦¦ ${plain} ¦¦\n\n${prose}`;
    await formatter.context.formatNewMessage(1, 'normal');
    assert.doesNotMatch(formatter.chat[1].mes, /SECRET|SCENE SHEET/i);
    assert.match(formatter.chat[1].mes, /She waves/);
});

test('empty provider content recovers through the real Formatter and redraws', async () => {
    for (const experimental of [true, false]) {
        const formatter = formatterHarness();
        formatter.chat[1].name = 'Summer';
        formatter.context.SillyTavern.getContext().extensionSettings['Weyland-Formatter'].experimental = experimental;
        formatter.context.updateMessageBlock = () => {};
        formatter.chat[1].mes = '';
        formatter.chat[1].extra.reasoning = `${sheet}${plain}\n\n${prose}`;
        await formatter.context.formatNewMessage(1, 'normal');
        assert.match(formatter.chat[1].mes, /She waves/);
        assert.doesNotMatch(formatter.chat[1].mes, /SECRET|SCENE SHEET/i);
        assert.doesNotMatch(formatter.chat[1].extra.reasoning, /She waves/);
        if (experimental) assert.match(formatter.chat[1].extra.reasoning, /SECRET/);
        else assert.equal(formatter.chat[1].extra.reasoning, '');
    }
});

test('custom-start replies stranded in reasoning recover when the mode is outside the header bars', async () => {
    for (const mode of ['SAPH', 'ONYX', 'RUBY']) {
        for (const experimental of [true, false]) {
            const formatter = formatterHarness();
            formatter.chat[1].name = 'Summer';
            formatter.context.SillyTavern.getContext().extensionSettings['Weyland-Formatter'].experimental = experimental;
            formatter.chat[1].extra.reasoning = `${sheet}¦¦ Saturday, Oct 17th ~ 8:40 PM ~ Library Entrance ¦¦ (${mode})\n\n${prose}`;
            const result = await formatter.format('');
            assert.match(result, /She waves/);
            assert.doesNotMatch(result, /SECRET|SCENE SHEET/i);
            assert.match(formatter.render(result), /class="message-header"/);
            assert.match(result.split('\n')[0], new RegExp(`~ \\(${mode}\\) ¦¦$`));
            assert.doesNotMatch(formatter.chat[1].extra.reasoning, /She waves/);
        }
    }
});

test('a draft marker and trailing rule never turn the metadata footer into a visible heading', async () => {
    for (const footer of ['[Annoyance] [CC] [D]\n\n---', '[Annoyance] [CC]\n---']) {
        const formatter = formatterHarness();
        formatter.chat[1].name = 'Summer';
        const result = await formatter.format(`¦¦ ${plain} ¦¦\n\n*She waves.*\n\n${footer}`);
        const html = formatter.render(result);
        assert.match(html, /She waves/);
        assert.doesNotMatch(html, /<h2|Annoyance|\[CC\]/);
        assert.match(result, /\[Annoyance\] \[CC\] \[1\]$/);
    }
});

test('a split provider reasoning tail before a closing tag and reply header stays private', async () => {
    for (const experimental of [true, false]) {
        for (const tag of ['think', 'analysis']) {
            const formatter = formatterHarness();
            formatter.chat[1].name = 'Briar';
            formatter.context.SillyTavern.getContext().extensionSettings['Weyland-Formatter'].experimental = experimental;
            const result = await formatter.format(`rgy!</${tag}>¦¦ ${plain} ¦¦\n\n${prose}`);
            assert.match(result, /^¦¦/);
            assert.doesNotMatch(result, /rgy!|<\/think>|<\/analysis>/);
            assert.match(result, /She waves/);
            // An explicit closer inside an already-started reply is not a boundary.
            const inBody = await formatter.format(`¦¦ ${plain} ¦¦\n\n*She waves.*\n\nrgy!</${tag}>\n\n${prose}`);
            assert.match(inBody, /rgy!/);
        }
    }
});

test('reasoning recovery never promotes notes before the reply header when formatting is disabled', async () => {
    const formatter = formatterHarness();
    formatter.context.SillyTavern.getContext().extensionSettings['Weyland-Formatter'].enabled = false;
    formatter.chat[1].extra.reasoning = `SCENE SHEET\nSECRET\nEND OF SCENE SHEET\nSECRET final planning\n¦¦ ${plain} ¦¦\n\n${prose}`;
    const result = await formatter.format('');
    assert.doesNotMatch(result, /SECRET/);
    assert.match(result, /She waves/);
});

test('decorated second sheets hide draft headers inside them and stay private if cut off', async () => {
    for (const opening of ['Scene Sheet:', '**SCENE SHEET**', 'SCENE SHEET [Rob]']) {
        const formatter = formatterHarness();
        const raw = `<think>notes</think>\n${opening}\nSECRET preparation`;
        assert.equal(await formatter.format(raw), '');
        const result = await formatter.format(`${raw}\n¦¦ ${plain} ¦¦\nSECRET draft\n**END OF SCENE SHEET**\n¦¦ ${plain} ¦¦\n\n${prose}`);
        assert.doesNotMatch(result, /SECRET/);
        assert.match(result, /She waves/);
    }
});
