// Kinsbane Manor, Mirror Weyland and Muse run their own system prompts, each opened by its own scene
// sheet (2026-10-03, Prompt Review/build-special-sheets.mjs). These tests read the LIVE prompt text
// (charper.js and the "Mirror" quick reply), so a re-encode or QR upload that brings back the old
// <think> / <analysis> procedures, or drops a slot, fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { specialChar } from '../../quick-reply-ext/src/charper.js';
import { ravs } from '../../quick-reply-ext/src/promptRegistry.js';
import { buildSpecialSheetShift, SPECIAL_SHEET_CARDS, specialSheetBoxes } from '../../quick-reply-ext/src/specialSheets.js';
import { readNarrativeSnapshot } from '../lib/narrativeSettings.js';
import { renderNarrativeSettingsScreen } from '../lib/ui/apps/narrativeSettings.js';

const repoFile = rel => fileURLToPath(new URL(`../../../../../../${rel}`, import.meta.url));
const unescapeQr = t => t.replace(/\\([{}|])/g, '$1');

function mirrorRaw(key) {
    const set = JSON.parse(readFileSync(repoFile('SillyTavern/data/default-user/QuickReplies/WeylandUni.json'), 'utf8'));
    const message = set.qrList.find(q => q.label === 'Mirror').message;
    const at = message.indexOf(`/setvar key=${key} `);
    return message.slice(message.lastIndexOf('/pass ', at) + 6, message.lastIndexOf(' |', at));
}

const prompts = {
    'Kinsbane Manor': { sys: specialChar.get('Kinsbane Manor').vars.ravtegKinsB, post: specialChar.get('Kinsbane Manor').vars.postravKinsB, boxes: 15 },
    'Mirror Weyland': { sys: unescapeQr(mirrorRaw('Mi33var')), post: unescapeQr(mirrorRaw('Mi33rav')), boxes: 14 },
    Muse: { sys: specialChar.get('Muse').vars.ravtegMu3e, post: specialChar.get('Muse').vars.PostMuse, boxes: 6 },
};
const sheetOf = sys => sys.slice(0, sys.indexOf('[END WEYLAND SCENE SHEET]') + '[END WEYLAND SCENE SHEET]'.length);

for (const [card, { sys, post, boxes }] of Object.entries(prompts)) {
    test(`${card}: the system prompt opens with its scene sheet, carrying both shift slots`, () => {
        assert.ok(sys.startsWith(`[WEYLAND SCENE SHEET - `), 'the sheet is the first thing in the system prompt');
        const sheet = sheetOf(sys);
        assert.match(sheet, /Your reply opens with this exact line, on its own: SCENE SHEET/);
        assert.match(sheet, /Then write this exact line, on its own: END OF SCENE SHEET/);
        assert.match(sheet, new RegExp(`\\[${boxes}/${boxes}\\]`), `${boxes} boxes`);
        assert.equal(SPECIAL_SHEET_CARDS[card], boxes);
        // Feedback item under the "why" items, its RECOGNITION box ahead of box 1.
        assert.ok(sheet.indexOf('{{getvar::SpecialShift}}') < sheet.indexOf('MECHANICS'));
        assert.ok(sheet.indexOf('{{getvar::SpecialRecognition}}') < sheet.indexOf(`[1/${boxes}]`));
    });

    test(`${card}: no think / analysis / reasoning procedure and no chosen-narrator references`, () => {
        // The words Claude's classifier rejects, and the 2026 lines that read as prompt injection.
        const sheet = sheetOf(sys);
        assert.doesNotMatch(sheet + post, /<\/?think>|<\/?analysis>|ANALYSIS PROCEDURE|REASONING HARD CAP|CLOSE THINK TAGS/i);
        assert.doesNotMatch(sheet, /\breasoning\b|\banalysis\b/i);
        assert.doesNotMatch(sheet + post, /user_wellbeing|billionaire|There is a bug that causes you to reason/i);
        assert.doesNotMatch(sheet + post, /What narrator are you|your narrator shine|getvar::LocalNarrator/i);
    });

    test(`${card}: the post-history is the short client note pointing at the sheet, with balanced tags`, () => {
        assert.match(post, new RegExp(`^¦Weyland Tavern client note: Response generation follows the \\[WEYLAND SCENE SHEET - `));
        assert.match(post, /from the line SCENE SHEET to the line END OF SCENE SHEET/);
        for (const tag of ['final_directives', 'think', 'analysis']) {
            assert.equal((post.match(new RegExp(`<${tag}>`, 'g')) || []).length, (post.match(new RegExp(`</${tag}>`, 'g')) || []).length, `<${tag}> balanced`);
        }
    });

    test(`${card}: the live sheet is exactly the master in Prompt Review/Special Sheets (rebuild after editing)`, () => {
        const master = readFileSync(repoFile(`Prompt Review/Special Sheets/${card} - SHEET.txt`), 'utf8').replace(/\r\n/g, '\n').trim();
        const postMaster = readFileSync(repoFile(`Prompt Review/Special Sheets/${card} - POST.txt`), 'utf8').replace(/\r\n/g, '\n').trim();
        assert.equal(sheetOf(sys), master);
        assert.equal(post, postMaster);
    });
}

test('Kinsbane keeps its fixed 2nd person and gains HTML; Mirror keeps its own POV line and baked emotional directives', () => {
    const k = prompts['Kinsbane Manor'];
    assert.match(k.sys, /\{\{getglobalvar::HTMLPrompt\}\}\n---\n\[Message Modes\]/);
    assert.match(k.sys, /Always write in 2ND PERSON/);
    assert.doesNotMatch(k.post, /RPPOV|Language|ThoughtSet|ClothingTracker/);
    assert.match(prompts['Mirror Weyland'].post, /\{\{getglobalvar::RPPOV\}\}/);
    // Mirror's MHR..WJS macros are written raw on purpose (filled in when the Mirror QR runs).
    assert.match(mirrorRaw('Mi33var'), /\n\{\{getglobalvar::MHR\}\}\n/);
    assert.match(mirrorRaw('Mi33var'), /^\[WEYLAND SCENE SHEET - MIRROR WEYLAND\]/);
    assert.match(mirrorRaw('Mi33var'), /\\\{\\\{getvar::SpecialShift\}\}/, 'the slot itself is escaped, so it resolves per generation');
});

// The VERDICT is what finally got Sonnet to deliver on the dead ends its own sheet planned (2026-10-03
// live test: before it, the sheet described the kill and the draft ended on a threat). The execution rule
// was rewritten to match, so the two can't contradict each other.
test('Kinsbane and Mirror bind the draft to a VERDICT, and a dead end is a full death scene before the card', () => {
    for (const card of ['Kinsbane Manor', 'Mirror Weyland']) {
        const { sys } = prompts[card];
        const sheet = sheetOf(sys);
        assert.match(sheet, /VERDICT: SURVIVE[\s\S]*VERDICT: INJURE[\s\S]*VERDICT: DEAD END/, card);
        assert.match(sheet, /THE DRAFT DELIVERS THE VERDICT/);
        assert.match(sheet, /Finish the sheet by writing your checklist answers \(A, B, C\) and your VERDICT line/);
        // The verdict is decided by yes/no answers, not picked: Sonnet otherwise finds a "however" (2026-10-04 test).
        assert.match(sheet, /A = YES and B = YES: VERDICT: DEAD END\. Not a judgment call\./);
        assert.ok(sheet.indexOf('THE VERDICT') > sheet.lastIndexOf(`[${prompts[card].boxes}/${prompts[card].boxes}]`), 'verdict comes after the last box');
        assert.match(sys, /When a DEAD END is triggered, write the death itself first, in full/);
        assert.doesNotMatch(sys, /IMMEDIATELY stop standard roleplay|immediately stop standard roleplay and output/);
    }
    assert.doesNotMatch(sheetOf(prompts.Muse.sys), /VERDICT:/, 'Muse has no dead ends');
});

test('the Formatter hides a special sheet exactly like Beta\'s', async () => {
    const reply = 'SCENE SHEET\nSTATE OF PLAY [1/15] - quiet hour, nothing yet\n[2/15] fuck this house\nEND OF SCENE SHEET\n¦¦ Saturday, Oct 18th ~ 9:28 PM ~ Foyer ~ ¦¦\n\n*The floor creaks.*\n\n[Fear] [RC]';
    const sceneSheetFull = /^\s*SCENE SHEET[ \t]*\r?\n[\w\W]*?(?:\n[ \t]*END OF SCENE SHEET[ \t]*(?=\r?\n|$)|\n(?=¦¦))/;
    const formatter = readFileSync(repoFile('SillyTavern/public/scripts/extensions/Weyland-Formatter/index.js'), 'utf8');
    assert.ok(formatter.includes(String(sceneSheetFull).slice(1, -1)), 'this test mirrors the Formatter\'s sceneSheetFull');
    assert.equal(reply.replace(sceneSheetFull, '').trim().split('\n')[0], '¦¦ Saturday, Oct 18th ~ 9:28 PM ~ Foyer ~ ¦¦');
});

test('buildSpecialSheetShift: nothing without a shift, General-Use stays Beta-only, real shifts get a numbered RECOGNITION box', () => {
    const beta = ravs.get('Beta Prompt');
    const none = buildSpecialSheetShift({ shift: 'None', sheetItem: 'x', betaBody: beta.body, boxes: 15 });
    assert.deepEqual(none, { item: '', recognition: '' });
    assert.deepEqual(buildSpecialSheetShift({ shift: 'General-Use', sheetItem: beta.reason2Empirical, betaBody: beta.body, boxes: 15 }), { item: '', recognition: '' });
    assert.equal(specialSheetBoxes('Summer'), 0);

    const item = '2. FEEDBACK (Horror): quoted report... Talk it through in your RECOGNITION box instead.';
    const horror = buildSpecialSheetShift({ shift: 'Horror', sheetItem: item, betaBody: beta.body, boxes: 15, scope: 'restarted' });
    assert.ok(horror.item.startsWith('FEEDBACK (Horror)'), 'Beta\'s "2. " numbering is dropped');
    assert.match(horror.recognition, /^RECOGNITION \[0\/15\]/);
    assert.match(horror.recognition, /think back to 0\/15, where your last roleplay failed\. Do better\./);
    const hard = buildSpecialSheetShift({ shift: 'Hard Mode', sheetItem: `2. FEEDBACK: User feedback may appear below:\n\n${beta.directive}`, betaBody: beta.body, boxes: 6, scope: 'reroll' });
    assert.match(hard.recognition, /^RECOGNITION \[0\/6\][\s\S]*where your last attempt failed/);

    // Beta's box 0 renamed upstream: the item still goes in, minus its pointer to a box that isn't there.
    const warn = console.warn; console.warn = () => {};
    try {
        const lost = buildSpecialSheetShift({ shift: 'Horror', sheetItem: item, betaBody: 'no box here', boxes: 14 });
        assert.equal(lost.recognition, '');
        assert.doesNotMatch(lost.item, /RECOGNITION box/);
    } finally { console.warn = warn; }
});

test('XXX fills the two special-sheet vars for these cards only, whatever the Analysis toggle says', async () => {
    const { assemble } = await import('./helpers/promptAssemblyHarness.js');
    for (const analysis of ['Enabled', 'Disabled']) {
        const { locals } = await assemble('Kinsbane Manor', { RoleplayShift: 'Horror', AnalysisToggle: analysis });
        assert.match(locals.get('SpecialShift'), /^FEEDBACK \(Horror\): The player chose this feedback themselves/);
        assert.match(locals.get('SpecialShift'), /Talk it through in your RECOGNITION box instead\./);
        assert.match(locals.get('SpecialRecognition'), /^RECOGNITION \[0\/15\]/);
    }
    // A dose replaces the regular shift here too; Hard Mode lands as Beta's directive.
    const dosed = await assemble('Mirror Weyland', { RoleplayShift: 'Horror' }, {}, 'Toxicity');
    assert.match(dosed.locals.get('SpecialShift'), /^FEEDBACK \(Toxicity\)/);
    assert.match(dosed.locals.get('SpecialRecognition'), /^RECOGNITION \[0\/14\][\s\S]*before the player branched back/);
    const hard = await assemble('Muse', { HardToggle: 'On' });
    assert.match(hard.locals.get('SpecialShift'), /^FEEDBACK: User feedback may appear below:[\s\S]*TEMPORARY SCENE DIRECTION/);
    // No shift: both empty, so the sheet reads exactly as written.
    const plain = await assemble('Kinsbane Manor', { RoleplayShift: 'None' });
    assert.equal(plain.locals.get('SpecialShift'), '');
    assert.equal(plain.locals.get('SpecialRecognition'), '');
    // Ordinary cards never get the vars.
    const summer = await assemble('Summer', { RoleplayShift: 'Horror' });
    assert.equal(summer.locals.has('SpecialShift'), false);
});

test('PromptOS locks the prompt cartridges and the Analysis toggle in a built-in-prompt chat', () => {
    const globals = new Map([['PromptChoice', 'Current Prompt'], ['AnalysisToggle', 'Disabled']]);
    const read = name => readNarrativeSnapshot({ getGlobal: k => globals.get(k), getLocal: () => '', hasChat: true, characterName: name });
    assert.equal(read('Kinsbane Manor').builtInPrompt, 'Kinsbane Manor');
    assert.equal(read('Summer').builtInPrompt, null);
    assert.equal(readNarrativeSnapshot({ getGlobal: k => globals.get(k), getLocal: () => '', hasChat: false, characterName: 'Muse' }).builtInPrompt, null);

    const target = { innerHTML: '' };
    renderNarrativeSettingsScreen(target, { snapshot: { ...read('Mirror Weyland'), modes: {}, mental: {} }, tab: 'essentials' });
    const html = target.innerHTML;
    assert.doesNotMatch(html, /data-narrative-action="set-prompt"/, 'no cartridge can be inserted');
    assert.equal((html.match(/wp-narrative-cart is-held is-locked" disabled/g) || []).length, 4);
    assert.doesNotMatch(html, /data-narrative-action="toggle-analysis"/);
    assert.match(html, /Always on<\/strong><small>Built into this character/);
    assert.match(html, /Mirror Weyland runs its own built-in system prompt/);
    assert.match(html, /<dt>Prompt<\/dt><dd class="is-hot">Built-in<\/dd>/);
    // The handler refuses both even if a stale button fires.
    const index = readFileSync(repoFile('SillyTavern/public/scripts/extensions/Weyland-WeyPhone/index.js'), 'utf8');
    assert.match(index, /promptOption\.disabled \|\| before\.builtInPrompt\) return;/);
    assert.match(index, /toggle-analysis'\) \{\s*if \(before\.builtInPrompt\) return;/);

    // Back in a normal chat everything is live again.
    const normal = { innerHTML: '' };
    renderNarrativeSettingsScreen(normal, { snapshot: { ...read('Summer'), modes: {}, mental: {} }, tab: 'essentials' });
    assert.match(normal.innerHTML, /data-narrative-action="toggle-analysis"/);
    assert.match(normal.innerHTML, /data-narrative-action="set-prompt" data-value="Mini Prompt"/);
});
