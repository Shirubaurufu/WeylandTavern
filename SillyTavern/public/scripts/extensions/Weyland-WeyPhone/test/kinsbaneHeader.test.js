import assert from 'node:assert/strict';
import test from 'node:test';
import { formatterHarness } from './helpers/formatterHarness.js';
import { repairReplyHeader } from '../../Weyland-Formatter/private-preparation.js';
import { applyKinsbaneCommand } from '../../quick-reply-ext/src/kinsbaneCommands.js';
import { specialChar } from '../../quick-reply-ext/src/charper.js';

const header = 'Monday, Oct 31st ~ 2:02 AM ~ Kitchen / Backyard (SAPH)';
const body = '*She enters the kitchen.*\n\n[Neutral] [CC] [1]';

test('the journal-command prompt keeps the normal header rules and note-reading output is preserved', async () => {
    const vars = specialChar.get('Kinsbane Manor').vars;
    const messages = [{ role: 'system', content: vars.ravtegKinsB }, { role: 'user', content: '!Ami0601' },
        { role: 'system', content: vars.postravKinsB }];
    assert.equal(applyKinsbaneCommand(messages, { kinsbane: true }).kind, 'journal');
    assert.match(messages[0].content, /HEADER FORMAT: ¦¦ DAY, DATE ~ XX:XX PM\/AM ~ Location ~ \(Message mode if applicable\) ¦¦/);
    assert.match(messages[0].content, /send the journal entry word for word, unchanged/);
    const h = formatterHarness();
    h.chat[1].name = 'Kinsbane Manor';
    const note = '"A short test note. Its wording stays intact."';
    const output = await h.format(`SCENE SHEET\nSTATE OF PLAY [1/2] SECRET notes\nFOOTER [2/2] Neutral CC\nEND OF SCENE SHEET\n### **${header}**\n\n${note}\n\n[Neutral] [CC] [1]`);
    assert.match(output, /"A short test note\. Its wording stays intact\."/);
    assert.doesNotMatch(output, /SECRET|SCENE SHEET/);
    assert.match(h.render(output), /data-mode="SAPH"/);
});

// Screenshot report: the mode is attached to the location instead of its own ~ field.
// Missing bars and Markdown wrappers are plausible raw forms, not supplied raw evidence.
for (const [label, line] of [
    ['plain', header], ['bold', `**${header}**`], ['underlined', `__${header}__`],
    ['heading', `### **${header}**`], ['barred', `¦¦ ${header} ¦¦`],
    ['wrapped bars', `**¦¦ ${header} ¦¦**`], ['missing closing bars', `¦¦ ${header}`],
    ['missing opening bars', `${header} ¦¦`], ['pipe bars', `|| ${header} ||`],
]) {
    test(`Kinsbane header: ${label}`, async () => {
        for (const prefix of ['', '<think>private notes</think>\n', 'SCENE SHEET\nSECRET notes\nEND OF SCENE SHEET\n',
            'SCENE SHEET\nSECRET unfinished notes\n']) {
            const h = formatterHarness();
            h.chat[1].name = 'Kinsbane Manor';
            const formatted = await h.format(`${prefix}${line}\n\n${body}`);
            const html = h.render(formatted);
            assert.equal((html.match(/class="message-header"/g) ?? []).length, 1, html);
            assert.match(html, /message-location">Kitchen \/ Backyard</);
            assert.match(html, /data-mode="SAPH"/);
            assert.match(html, /<span>Monday, Oct 31st<\/span>/);
            assert.match(html, /<span>2:02 AM<\/span>/);
            assert.match(html, /She enters the kitchen/);
            assert.doesNotMatch(html, /SECRET|private notes|darkred|<h[1-6]|¦|\[CC\]/i);
            assert.equal(await h.format(formatted), formatted, 'formatting twice is stable');
        }
    });
}

test('saved barred headers and split POV headers render suffix modes without rewriting prose', async () => {
    const h = formatterHarness();
    h.chat[1].name = 'Kinsbane Manor';
    const raw = `¦¦ ${header} ¦¦\n\n*First perspective.*\n\n¦¦ Monday, Oct 31st ~ 2:03 AM ~ Upstairs (ONYX) ¦¦\n\n*Second perspective.*`;
    for (const text of [raw, await h.format(raw)]) {
        const html = h.render(text);
        assert.equal((html.match(/class="message-header"/g) ?? []).length, 2);
        assert.match(html, /message-location">Kitchen \/ Backyard</);
        assert.match(html, /message-location">Upstairs</);
        assert.match(html, /data-mode="SAPH"/);
        assert.match(html, /data-mode="ONYX"/);
        assert.match(html, /First perspective/);
        assert.match(html, /Second perspective/);
    }
});

test('header repairs require complete metadata and leave quotes, examples and ordinary parentheses alone', () => {
    for (const text of [
        `"${header}"`, `> ${header}`, `\`\`\`\n${header}\n\`\`\``, `An example:\n\n${header}`,
        '### Monday ~ sometime ~ Kitchen (SAPH)', '*She goes ~ into the kitchen ~ then outside.*',
        'Incoming¦2:02 AM¦Aiko¦Monday, Oct 31st ~ 2:02 AM ~ Kitchen (SAPH)',
    ]) assert.equal(repairReplyHeader(text), text, text);
    const h = formatterHarness();
    for (const location of ['Kitchen (North)', 'Ruby Hall', 'Onyx Lounge', 'Kitchen / Backyard']) {
        const html = h.html(`¦¦ Monday, Oct 31st ~ 2:02 AM ~ ${location} ¦¦`);
        assert.ok(html.includes(`message-location">${location}</div>`), html);
        assert.doesNotMatch(html, /message-mode/);
    }
});
