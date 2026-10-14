import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

import { ravs } from '../../quick-reply-ext/src/promptRegistry.js';
import { charPer } from '../../quick-reply-ext/src/charper.js';
import { scenarios } from '../../quick-reply-ext/src/scenarios.js';
import { THOUGHT_RULES } from '../../quick-reply-ext/src/promptModifiers.js';
import { cardPostHistoryExtras } from '../../quick-reply-ext/src/oocMode.js';
import {
    SILENT_PERSONALITY_LINE,
    applyBaphometToRequest,
    baphometHidden,
    baphometThoughts,
    descriptionParagraphsToCut,
    postHistoryReplacement,
    silentPersonality,
    silentScenario,
} from '../../quick-reply-ext/src/baphomet.js';

// Baphomet Visibility (PromptOS, Bap only). Everything is cut from the outgoing request, keyed on the card's own
// wording, so these tests pin the cuts against the REAL card, personality and intro text.

const stRoot = new URL('../../../../../', import.meta.url);
const cardPath = new URL('data/default-user/characters/Bap.png', stRoot);

function readCard() {
    if (!existsSync(cardPath)) return null;
    const require = createRequire(new URL('package.json', stRoot));
    const extract = require('png-chunks-extract');
    const PNGtext = require('png-chunk-text');
    const chunks = extract(new Uint8Array(readFileSync(cardPath))).filter(c => c.name === 'tEXt').map(c => PNGtext.decode(c.data));
    const chunk = chunks.find(c => c.keyword.toLowerCase() === 'ccv3') ?? chunks.find(c => c.keyword.toLowerCase() === 'chara');
    const json = JSON.parse(Buffer.from(chunk.text, 'base64').toString('utf8'));
    return json.data ?? json;
}

const card = readCard();
const archAngel = charPer.get('Bap').vars.ArchAngel;
const bapScenario = scenarios.get('Bap').greetings[0].ConstantScenario;
const extras = card ? cardPostHistoryExtras(card.post_history_instructions) : '';

test('the picker value: only "disabled" hides him', () => {
    assert.equal(baphometHidden('disabled'), true);
    assert.equal(baphometHidden(' Disabled '), true);
    for (const value of ['enabled', '', undefined, null, 'garbage']) assert.equal(baphometHidden(value), false);
});

test('Baphomet thoughts: one voice, 1-2 per response, no third-person rule, narrator + secrets rules kept', () => {
    for (const name of ['Current Prompt', 'Old Prompt 2026', 'Old Prompt 2025', 'Mini Prompt']) {
        const out = baphometThoughts(ravs.get(name).thinkYes);
        assert.ok(!/\{\{random::1::2::3/.test(out), `${name}: no 3-4 thought rolls`);
        assert.match(out, /\{\{random::1::2\}\}/, name);
        assert.match(out, /These thoughts belong to Baphomet/, name);
        assert.match(out, /in \[CAPITALS\]/, name);
        assert.ok(out.includes(THOUGHT_RULES[0]), `${name}: secrets rule`);
        assert.ok(out.includes("- NEVER speak as a narrator in {{char}}'s thoughts."), `${name}: narrator rule`);
        assert.ok(!out.includes('3rd person in {{char}}'), `${name}: Baphomet is not Bap, so no third-person ban`);
        assert.ok(out.indexOf('Every bracket is him') < out.indexOf('</thought directions>'), `${name}: inside the block`);
        assert.ok(!out.includes('never narrates the scene'), `${name}: that line was dropped, the narrator rule covers it`);
    }
    assert.equal(baphometThoughts(''), '');
});

test('silent personality: his four lines go, her clumsiness stays, the closing line sits inside [PERSONALITY]', () => {
    const out = silentPersonality(archAngel);
    for (const label of ['INTERNAL BAPHOMET PERSONALITY', "BAPHOMET'S INTERNAL COMMENTARY", 'BAPHOMET LIKES', 'BAPHOMET DISLIKES']) {
        assert.ok(archAngel.includes(label), `real text has ${label}`);
        assert.ok(!out.includes(label), `${label} is gone`);
    }
    assert.ok(out.includes('occasionally adorably clumsy'));
    assert.ok(out.includes('BAP LIKES') && out.includes('BAP DISLIKES') && out.includes("BAP'S SPEECH"));
    assert.ok(out.indexOf(SILENT_PERSONALITY_LINE) < out.indexOf('[END PERSONALITY]'));
    assert.ok(out.indexOf(SILENT_PERSONALITY_LINE) > out.indexOf('[PERSONALITY]'));
    assert.equal((out.match(/Baphomet/gi) ?? []).length, 1, 'the closing line is the only mention left');
    assert.equal(silentPersonality(out), out, 'running it twice changes nothing');
    assert.doesNotMatch(SILENT_PERSONALITY_LINE, /can't make her trip|doesn't mean|isn't visible/i, 'in-world wording, no meta');
});

test('intro context: commentary paragraphs go, the backstory keeps his clumsiness, cat puns stay', () => {
    const out = silentScenario(bapScenario);
    assert.ok(bapScenario.includes("ALWAYS include Baphomet's hateful"));
    assert.ok(!/hateful|threatening|CAPITALS|brutally/i.test(out));
    assert.match(out, /Baphomet's interference making her clumsy/);
    assert.match(out, /Bap has never met \{\{user\}\}/);
    assert.match(out, /Remember to make Bap use cat sounds and cat puns without being annoying\./);
    assert.equal(silentScenario(out), out);
    assert.equal(silentScenario('something else entirely'), 'something else entirely');
});

test('post-history: everything after the slot is his except the cat-pun reminder', { skip: !card }, () => {
    assert.ok(extras.includes('ALWAYS include Baphomet'));
    assert.equal(postHistoryReplacement(extras), 'Remember to make Bap make cat sounds and cat puns without being annoying.');
    assert.equal(postHistoryReplacement(''), '');
});

test('description: !Mute is always cut, the screaming/Baffy paragraph only while hidden, the trip paragraph never', { skip: !card }, () => {
    const shown = descriptionParagraphsToCut(card.description, false);
    const hidden = descriptionParagraphsToCut(card.description, true);
    assert.equal(shown.length, 1);
    assert.match(shown[0], /!Mute/);
    assert.equal(hidden.length, 2);
    assert.ok(hidden.some(p => /internally screaming/.test(p) && /Baffy/.test(p)));
    assert.ok(![...shown, ...hidden].some(p => /make Bap trip/.test(p)), 'she is still clumsy because of him');
    assert.ok(![...shown, ...hidden].some(p => /twist/.test(p)));
});

// The real request carries macro-EXPANDED text, so this stand-in expander runs over the messages too.
const substitute = text => text.replaceAll('{{user}}', 'Sam').replaceAll('{{getvar::20YO}}', '20').replaceAll('{{getvar::MCY}}', 'Sophomore');

function requestFor() {
    // Roughly the shape of the real request: description + personality in the system prompt, the intro context as a
    // lorebook block, the card's post-history at the end. Macros are already expanded by the substitute below.
    return [
        { role: 'system', content: substitute(`[Card]\n${card.description}\n\n${archAngel}\n\n[World]\n${bapScenario}`) },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'nya~' },
        { role: 'system', content: substitute(`RULES OF THE GAME\n\n${extras}`) },
    ];
}

test('Enabled sends everything except the retired !Mute paragraph', { skip: !card }, () => {
    const messages = requestFor();
    const before = JSON.stringify(messages);
    const result = applyBaphometToRequest(messages, {
        hidden: false, description: card.description, postHistoryExtras: extras, personality: archAngel, scenarios: [bapScenario], substitute,
    });
    assert.equal(result.muteCut, 1);
    assert.equal(result.cuts, 0);
    const after = messages.map(m => m.content).join('\n');
    assert.ok(!after.includes('!Mute'));
    for (const keep of ['INTERNAL BAPHOMET PERSONALITY', 'internally screaming', "ALWAYS include Baphomet's commentary", "ALWAYS include Baphomet's hateful"]) {
        assert.ok(after.includes(keep), keep);
    }
    assert.notEqual(before, JSON.stringify(messages));
});

test('Disabled: no commentary instructions anywhere, but he is still in there and still makes her clumsy', { skip: !card }, () => {
    const messages = requestFor();
    const result = applyBaphometToRequest(messages, {
        hidden: true, description: card.description, postHistoryExtras: extras, personality: archAngel, scenarios: [bapScenario], substitute,
    });
    assert.equal(result.muteCut, 1);
    assert.equal(result.cuts, 4, 'screaming paragraph, personality, post-history, intro context');
    const after = messages.map(m => m.content).join('\n');
    for (const gone of ['!Mute', 'internally screaming', 'Baffy', 'INTERNAL BAPHOMET PERSONALITY', 'BAPHOMET DISLIKES', "ALWAYS include Baphomet's", 'CAPITALS', 'Fuck off and die', 'hateful']) {
        assert.ok(!after.includes(gone), `${gone} should be gone`);
    }
    for (const stay of ['antichrist', 'make Bap trip', SILENT_PERSONALITY_LINE, "Baphomet's interference making her clumsy", 'Remember to make Bap make cat sounds and cat puns', 'BAP LIKES']) {
        assert.ok(after.includes(stay), `${stay} should stay`);
    }
    assert.ok(!/\n{3,}/.test(after), 'no big gaps left behind');
});

test('wired in: XXX gives Bap her own thoughts block, the picker group exists, OnRequestReady runs the cut', async () => {
    const index = await readFile(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    assert.match(index, /charName === "Bap" && rav\.thinkYes/);
    assert.doesNotMatch(index, /"Willow","Bap"/, 'Bap is out of the generic thoughts list');
    assert.match(index, /applyBaphometToRequest\(data\.messages/);
    const intro = await readFile(new URL('../../quick-reply-ext/src/introContext.js', import.meta.url), 'utf8');
    assert.match(intro, /id: "bap-baphomet"/);
    assert.match(intro, /label: "Baphomet Visibility"/);
    assert.match(intro, /Baphomet's vicious commentary is visible\./);
    assert.match(intro, /Baphomet remains, but you won't hear his cries\./);
});
