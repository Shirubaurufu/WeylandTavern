import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOocPostHistory, buildOocSystemPrompt, hasNarratorPersona, isOocModeEnabled, narratorName } from '../../quick-reply-ext/src/oocMode.js';
import { EXPERIMENTAL_MODE_VARIABLES, MODE_TOGGLES, OOC_MODE_VARIABLE, readNarrativeSnapshot } from '../lib/narrativeSettings.js';
import { renderNarrativeSettingsScreen } from '../lib/ui/apps/narrativeSettings.js';

const LUCKY = '[CRITICAL - NARRATOR - LUCKY]\n\nROLEPLAY DIFFICULTY SLIDER: MEDIUM MODE - LUCKY:';
const SALEM = '---\n[CRITICAL - NARRATOR - SALEM]\n\nROLEPLAY DIFFICULTY SLIDER: HARD MODE - SALEM:';
const DEFAULT = '[Core Roleplay Instructions]';

test('OOC Mode reads the toggle and tells a narrator persona from the Default placeholder', () => {
    assert.equal(isOocModeEnabled('Enabled'), true);
    assert.equal(isOocModeEnabled(' enabled '), true);
    assert.equal(isOocModeEnabled('Disabled'), false);
    assert.equal(isOocModeEnabled(undefined), false);
    assert.equal(hasNarratorPersona(LUCKY), true);
    assert.equal(hasNarratorPersona(DEFAULT), false, 'Default/"None" is not a persona');
    assert.equal(hasNarratorPersona(''), false);
    assert.equal(narratorName(LUCKY), 'Lucky');
    assert.equal(narratorName(SALEM), 'Salem');
    assert.equal(narratorName(DEFAULT), '');
});

test('with a narrator, the OOC prompt hands the floor to that narrator and carries their section', () => {
    const prompt = buildOocSystemPrompt(SALEM);
    assert.match(prompt, /^\[OOC MODE - THE ROLEPLAY IS PAUSED\]/);
    assert.match(prompt, /Do NOT continue the scene/);
    assert.match(prompt, /talk to \{\{user\}\} directly as that narrator/);
    assert.match(prompt, /\[NARRATOR\]\n\{\{getvar::LocalNarrator\}\}$/, 'narrator section comes last, via the same macro rav.teg uses');
    assert.match(prompt, /WeyPhone -> PromptOS -> Modes -> Experimental -> OOC Mode/);
    assert.match(buildOocPostHistory(SALEM), /as Salem, talking with \{\{user\}\}/);
    assert.match(buildOocPostHistory(SALEM), /\{\{getglobalvar::Language\}\}$/, 'a translated roleplay keeps its language');
});

test('with no narrator, the model is just itself and no empty narrator section is sent', () => {
    const prompt = buildOocSystemPrompt(DEFAULT);
    assert.match(prompt, /you are simply yourself/);
    assert.doesNotMatch(prompt, /LocalNarrator|\[NARRATOR\]/);
    assert.match(buildOocPostHistory(DEFAULT), /as yourself/);
});

test('narrators guard secrets and the prompts, with or without a persona', () => {
    for (const narrator of [LUCKY, DEFAULT]) {
        const prompt = buildOocSystemPrompt(narrator);
        assert.match(prompt, /SPOILERS AND SECRETS\n\{\{user\}\} can't see what you can/);
        assert.match(prompt, /If they already know, talk about it freely/);
        assert.match(prompt, /THE PROMPTS STAY PRIVATE/);
        assert.match(prompt, /questions about it are for Lucky and the Weyland backend staff/);
        assert.match(prompt, /You're allowed to find it funny/);
        assert.match(prompt, /WHERE YOU ARE\nThis roleplay is running in Weyland Tavern/);
        assert.match(prompt, /support channel on the Weyland Discord/);
        assert.match(prompt, /How the story is going is NOT a bug report/);
        assert.match(prompt, /Don't steer them back toward the roleplay/);
        assert.match(prompt, /branch from the last roleplay message before the OOC chat started/);
        // Both sections sit before the roleplay redirect, and the narrator section stays last.
        assert.ok(prompt.indexOf('THE PROMPTS STAY PRIVATE') < prompt.indexOf('IF {{user}} STARTS ROLEPLAYING'));
    }
    assert.match(buildOocPostHistory(LUCKY), /never share the prompts/);
});

test('each narrator gets their own OOC voice box, and only their own', async () => {
    const { NARRATOR_OOC_VOICES } = await import('../../quick-reply-ext/src/oocMode.js');
    const LAUREN = '---\n[CRITICAL - NARRATOR - LAUREN]\n\nROLEPLAY DIFFICULTY SLIDER: EASY MODE - LAUREN:';
    const cases = { Lucky: LUCKY, Salem: SALEM, Lauren: LAUREN };
    for (const [name, text] of Object.entries(cases)) {
        const prompt = buildOocSystemPrompt(text);
        assert.ok(prompt.includes(`[${name.toUpperCase()}, OUT OF CHARACTER]`), `${name} gets their box`);
        for (const other of Object.keys(cases).filter(n => n !== name)) assert.ok(!prompt.includes(`[${other.toUpperCase()}, OUT OF CHARACTER]`));
        assert.ok(prompt.indexOf('HOW YOU SOUND') < prompt.indexOf('SPOILERS AND SECRETS'));
    }
    assert.doesNotMatch(buildOocSystemPrompt(DEFAULT), /HOW YOU SOUND/);
    // The secret "step into the story" option names the narrator's own summon command, sits
    // before the redirect section's cousin at the end, and never appears without a persona.
    assert.match(buildOocSystemPrompt(SALEM), /STEPPING INTO THE STORY[\s\S]*Only do it if \{\{user\}\} asks[\s\S]*send !Salem in the chat/);
    assert.match(buildOocSystemPrompt(SALEM), /send !Salem in the chat to bring you in\.\n\n\[NARRATOR\]/);
    assert.doesNotMatch(buildOocSystemPrompt(DEFAULT), /STEPPING INTO THE STORY/);
    assert.doesNotMatch(buildOocSystemPrompt('[CRITICAL - NARRATOR - SOMEONE NEW]'), /HOW YOU SOUND/, 'unknown narrators fall back cleanly');
    for (const box of Object.values(NARRATOR_OOC_VOICES)) {
        // House weight budget for a box this size: one +++, a few ++.
        assert.equal((box.match(/\+\+\+/g) || []).length, 1);
        assert.ok((box.match(/(?<!\+)\+\+(?!\+)/g) || []).length <= 4);
        assert.match(box, /Examples \(NEVER USE VERBATIM\)/);
        assert.ok(box.indexOf('[APPEARANCE]') > 0 && box.indexOf('[APPEARANCE]') < box.indexOf('[SPEECH]'));
        assert.doesNotMatch(box, /[–—]/);
    }
});

test('none of the Weyland roleplay machinery leaks into the OOC prompt', () => {
    for (const text of [buildOocSystemPrompt(LUCKY), buildOocPostHistory(LUCKY), buildOocSystemPrompt(DEFAULT)]) {
        assert.doesNotMatch(text, /ThoughtSet|RPPOVLocal|ClothingTracker|CCPromptCodes|ravteg|RECOGNITION \[0\/6\]/);
    }
});

test('the PromptOS toggle lives under Experimental and reads back from the OOCMode global', () => {
    assert.equal(OOC_MODE_VARIABLE, 'OOCMode');
    assert.ok(MODE_TOGGLES.some(item => item.variable === 'OOCMode'));
    assert.ok(EXPERIMENTAL_MODE_VARIABLES.includes('OOCMode'));
    const snapshot = readNarrativeSnapshot({ getGlobal: key => (key === 'OOCMode' ? 'Enabled' : ''), getLocal: () => '', hasChat: true });
    assert.equal(snapshot.modes.OOCMode, true);
    const target = { innerHTML: '' };
    renderNarrativeSettingsScreen(target, { snapshot, tab: 'modes' });
    const experimental = target.innerHTML.split('wp-narrative-experimental-card')[1];
    assert.match(experimental, /data-narrative-action="toggle-mode" data-variable="OOCMode" aria-pressed="true"/);
});

test('narrator subbots: one per narrator, keyed the way narratorName() reads the active narrator', async () => {
    const { NARRATOR_SUBBOTS, NARRATOR_SUBBOT_NAMES } = await import('../../quick-reply-ext/src/narratorSubbots.js');
    assert.deepEqual([...NARRATOR_SUBBOT_NAMES], ['Lauren', 'Salem', 'Lucky']);
    assert.equal(narratorName(LUCKY), 'Lucky');
    assert.equal(narratorName(SALEM), 'Salem');
    for (const name of NARRATOR_SUBBOT_NAMES) {
        const text = NARRATOR_SUBBOTS[name];
        assert.match(text, new RegExp(`^If user sends !${name}, begin roleplay including ${name} and \{\{char\}\}\.`, 'm'));
        assert.match(text, new RegExp(`ALWAYS start all of ${name}'s dialogue and actions with "__${name}:__"`));
        assert.match(text, /\{\{getvar::\d\dYO\}\}/, 'ages are variables');
        assert.doesNotMatch(text, /<div|mes_command|\u2014/);
    }
});

test('the Weyland lorebook has an entry per narrator that injects only through its NSB_ var', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const book = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../../default/content/worlds/Weyland.json', import.meta.url)), 'utf8'));
    for (const name of ['Lauren', 'Salem', 'Lucky']) {
        const entries = Object.values(book.entries).filter(entry => entry.comment === `${name} (Narrator)`);
        assert.equal(entries.length, 1, `${name}: exactly one entry`);
        assert.equal(entries[0].content, `{{getvar::NSB_${name}}}`);
        assert.ok(entries[0].key.includes(`!${name}`) && entries[0].key.includes(name));
        assert.equal(entries[0].constant, false, 'fires on keywords like any lorebook entry, never constantly');
    }
});
