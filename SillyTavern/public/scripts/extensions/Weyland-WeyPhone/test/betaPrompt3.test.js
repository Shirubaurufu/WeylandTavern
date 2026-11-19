// Beta Prompt 3 (quick-reply-ext/src/betaPrompt3.js, 2026-11-17): Current with a reworked scene sheet. These tests pin the
// four changes Lucky asked for, and that every marker the shared assembly code keys on survived the rewrite, so shifts,
// narrators and Gemini Bypass behave on Beta 3 exactly as on Current.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ravs, registerBetaPrompt3 } from '../../quick-reply-ext/src/promptRegistry.js';
import { assemblePromptLayers, resolvePromptChoice, safePreparePromptBase } from '../../quick-reply-ext/src/promptAssembly.js';
import { BETA3_KEY } from '../../quick-reply-ext/src/betaPrompt3.js';
import { GEMINI_BOX6_EXPLICIT, applyGeminiBypassForModel } from '../../quick-reply-ext/src/promptModifiers.js';
import { assembleRoleplayShiftItem } from '../../quick-reply-ext/src/roleplayShiftItem.js';

const beta = ravs.get('Beta Prompt');
const END = '[END WEYLAND SCENE SHEET]';

function build(key, options = {}) {
    const entry = safePreparePromptBase(key, ravs.get(key), beta);
    return assemblePromptLayers(entry, beta, { analysisOn: true, shift: 'None', shiftItem: '', narrator: '', ...options });
}
const sheetOf = teg => teg.slice(0, teg.indexOf(END) + END.length);

// An all-caps word of 2+ letters with no all-caps word next to it on the same line: the "one capital per sentence" habit.
function loneCaps(text) {
    const hits = [];
    const isCaps = w => /[A-Z]{2,}/.test(w) && !/[a-z]/.test(w);
    for (const line of text.split('\n')) {
        const words = line.split(/\s+/).filter(Boolean);
        words.forEach((w, i) => {
            if (isCaps(w) && !isCaps(words[i - 1] ?? '') && !isCaps(words[i + 1] ?? '')) hits.push(w.replace(/[^A-Z]/g, ''));
        });
    }
    return hits;
}
// Titles, codes the client parses, and acronyms. Anything else left standing alone in caps has to be on purpose.
const ALLOWED_LONE_CAPS = new Set(['GENERAL', 'UI', 'MECHANICS', 'SPARK', 'GOD', 'BOARD', 'CRITICAL', 'SAPHONYXRUBY', 'SAPH', 'PG',
    'ONYX', 'PGR', 'RUBY', 'AO', 'OPAL', 'POV', 'ICEBERG', 'NPC', 'WANT', 'PACING', 'GHOST', 'LLM', 'IF', 'ASLEEP', 'ETC', 'AVAILABLE',
    'NO', // the volume check's own one-word shout example, ("NO!")
    'NEVER', // USER AUTONOMY: You NEVER act as the user
    'STOP', // You are censoring. STOP.
    'ONE', // The footer must be ONE accurate word per slot (the client parses it)
]);

test('Beta 3 is registered outside rav.js and is its own prompt choice', () => {
    assert.ok(ravs.has(BETA3_KEY));
    assert.deepEqual(resolvePromptChoice(ravs, BETA3_KEY), { saved: BETA3_KEY, key: BETA3_KEY });
    // A saved 'Beta Prompt' is still Current, not Beta 3.
    assert.deepEqual(resolvePromptChoice(ravs, 'Beta Prompt'), { saved: 'Current Prompt', key: 'Beta Prompt' });
});

test('a Current that moved its texting line costs only the Beta 3 choice', () => {
    const table = new Map([['Beta Prompt', { teg: 'no texting rule here', body: '', post: '' }]]);
    const error = console.error;
    console.error = () => {};
    try {
        assert.equal(registerBetaPrompt3(table), false);
    } finally {
        console.error = error;
    }
    assert.ok(!table.has(BETA3_KEY));
});

test('system prompt: only the texting rule differs from Current', () => {
    const current = ravs.get('Beta Prompt').teg;
    const beta3 = ravs.get(BETA3_KEY).teg;
    assert.match(beta3, /CRITICAL: NEVER compose NEW text messages on behalf of \{\{user\}\} unless \{\{user\}\} requests so explicitly\./);
    assert.doesNotMatch(beta3, /NEVER text on behalf of/);
    assert.doesNotMatch(beta3, /only the user can text as/);
    const strip = text => text.split('\n').filter(line => !/text/i.test(line) || !/on behalf of/.test(line)).join('\n');
    assert.equal(strip(beta3), strip(current));
    assert.equal(ravs.get(BETA3_KEY).post, ravs.get('Beta Prompt').post);
});

test('scene sheet: texting line removed, NPC name tags and the volume check added', () => {
    const sheet = sheetOf(build(BETA3_KEY).teg);
    assert.doesNotMatch(sheet, /texting/i);
    // ...replaced by BOARD's texting check, which points at the system prompt's real section title.
    assert.match(sheet, /- Is there a text message you need to render\? If so, have you found the \[TEXT MESSAGE FORMATTING\] section\?[^\n]*If there are no texts to render, you may skip this step\.\n- CHAPTER CHECK \(custom storyline\)[^\n]*\n\nICEBERG \[3\/6\]/);
    assert.ok(ravs.get(BETA3_KEY).teg.includes('[TEXT MESSAGE FORMATTING]'));
    assert.match(sheet, /Any NPCs in the scene\? What would they realistically not know\? \(No omniscience!\) If an NPC is present, their focus blocks begin with __NPC Name:__/);
    // The volume check sits after the route is picked and before the footer question.
    const picked = sheet.indexOf('- Picked one? Good.');
    const volume = sheet.indexOf('- VOLUME CHECK:');
    const footer = sheet.indexOf('- Finally: What expression and outfit go in the footer?');
    assert.ok(picked > 0 && picked < volume && volume < footer);
    assert.match(sheet, /Caps mean volume, not emphasis\./);
    assert.match(sheet, /YOU \*\*\*DONT\*\*\* FUCKING OWN ME!"/);
    // SPARK no longer asks for capitals through the whole response.
    assert.doesNotMatch(sheet, /OH AND {1,2}CAPITALS/);
    // Current's sheet is untouched.
    assert.match(sheetOf(build('Beta Prompt').teg), /If anyone is texting someone, USE THE PROVIDED TEXTING INSTRUCTIONS VERBATIM/);
});

test('scene sheet: lone mid-sentence capitals are gone, except titles, codes and a few essential words', () => {
    const current = loneCaps(sheetOf(build('Beta Prompt').teg));
    const beta3 = loneCaps(sheetOf(build(BETA3_KEY).teg));
    assert.ok(beta3.length * 2 < current.length, `Beta 3 ${beta3.length} vs Current ${current.length}`);
    const unexpected = beta3.filter(word => !ALLOWED_LONE_CAPS.has(word));
    assert.deepEqual(unexpected, []);
    assert.doesNotMatch(sheetOf(build(BETA3_KEY).teg), /—/, 'no em dashes in the Beta 3 sheet');
});

test('the shared layers still work on Beta 3: no box 0 without a shift, POV/latest lines once each, green room', () => {
    const plain = build(BETA3_KEY).teg;
    assert.doesNotMatch(plain, /RECOGNITION \[0\/6\]/);
    assert.doesNotMatch(plain, /\(Technically Seven\)/);
    assert.equal(plain.split('- POV + TENSE CHECK:').length, 2);
    assert.equal(plain.split('- Remember to respond to the latest user message in the chatlog.').length, 2);
    const narrated = build(BETA3_KEY, { narrator: 'Salem' }).teg;
    assert.match(narrated, /NARRATOR GREEN ROOM \[1\/6\]/);
    assert.doesNotMatch(narrated, /SPARK \[1\/6\]/);
});

test('a Roleplay Shift on Beta 3 keeps box 0 and adds the box 6 route line', () => {
    const shiftItem = assembleRoleplayShiftItem('Horror', beta, true, 'restarted');
    assert.ok(shiftItem);
    const teg = build(BETA3_KEY, { shift: 'Horror', shiftItem }).teg;
    assert.match(teg, /RECOGNITION \[0\/6\] - The player talked\. Listen\./);
    assert.match(teg, /Think back to 0\/6, where your last roleplay failed\.[\s\S]*IF \{\{char\}\} IS GONE \/ ASLEEP/);
    assert.ok(teg.indexOf(shiftItem) < teg.indexOf('OBJECTION VALVE'));
});

test('Gemini Bypass cuts Beta 3 box 6 warm-up and its pointer back to the cursing', () => {
    const teg = build(BETA3_KEY, { geminiBypassEnabled: true }).teg;
    assert.match(teg, GEMINI_BOX6_EXPLICIT);
    const messages = [{ role: 'system', content: teg }];
    const result = applyGeminiBypassForModel(messages, 'gemini-3.8-flash');
    assert.equal(result.box6Cut, 1);
    assert.doesNotMatch(messages[0].content, /VULGARITY IS AUTHENTICITY/);
    assert.doesNotMatch(messages[0].content, /we are still cussing/i);
    assert.match(messages[0].content, /- THREE PATHS - Be explicit, vulgar and specific\./);
    assert.match(messages[0].content, /- VOLUME CHECK:/);
});
