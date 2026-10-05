import { resetMentalDirectivesOnce } from '../../../quick-reply-ext/src/mentalDirectives.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ravs } from '../../../quick-reply-ext/src/promptRegistry.js';
import { assemblePromptLayers, preparePromptBase, resolvePromptChoice, resolvePromptPost, safePreparePromptBase, usesSceneSheet } from '../../../quick-reply-ext/src/promptAssembly.js';
import { SHIFT_BODIES, SHIFT_FRAME, SHIFT_SCOPES } from '../../../quick-reply-ext/src/roleplayShifts.js';
import { assembleRoleplayShiftItem } from '../../../quick-reply-ext/src/roleplayShiftItem.js';
import { buildOocPostHistory, buildOocSystemPrompt, isOocModeEnabled, narratorName } from '../../../quick-reply-ext/src/oocMode.js';
import { buildSpecialSheetShift, specialSheetBoxes } from '../../../quick-reply-ext/src/specialSheets.js';

const source = readFileSync(new URL('../../../quick-reply-ext/index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function between(start, end) {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, start);
    return source.slice(from, to);
}
const assembler = between('async function XXX(charName) {', '\n/**\n * @param {import("./src/chat.js").ChatMessage}');
const shiftBuilder = between('function buildRoleplayShiftItem(', '\n/** GENERATION_AFTER_COMMANDS');
const custom = between('function customShiftPreset()', '\n// Every shift can be dosed');

export async function assemble(charName = 'Rosa', globalExtras = {}, localExtras = {}, dose = null) {
    // Compatibility fixtures exercise the original High placement. Default tests override it with undefined.
    const globals = new Map(Object.entries({ PromptChoice: 'Mini Prompt', Narrator: 'NARRATOR', NarratorStrength: 'High', MentalDirectivesReset20261005: '1', RPPOV: 'POV', AnalysisToggle: 'Enabled', ...globalExtras }));
    const locals = new Map(Object.entries(localExtras));
    const context = {
        resetMentalDirectivesOnce, performance, ravs, assemblePromptLayers, preparePromptBase, resolvePromptChoice, resolvePromptPost, safePreparePromptBase, usesSceneSheet,
        SHIFT_BODIES, SHIFT_FRAME, SHIFT_SCOPES, assembleRoleplayShiftItem, activeDoseShift: () => dose, buildSpecialSheetShift, specialSheetBoxes,
        getGlobalVariable: key => globals.get(key) ?? '',
        setGlobalVariable: (key, value) => globals.set(key, value),
        getLocalVariable: key => locals.get(key) ?? '',
        setLocalVariable: (key, value) => locals.set(key, value),
        getCurrentCharacterName: () => charName,
        introHadScenario: () => false,
        SpecialChar: async () => {}, Clear: async () => {}, DebugLog: () => {},
        strings: { whtml: 'HTML INSTRUCTIONS', krirav: 'KRIS HARD MODE' },
        buildOocPostHistory, buildOocSystemPrompt, isOocModeEnabled, narratorName, NARRATOR_SUBBOT_NAMES: [],
        console: { error: (...args) => { throw new Error(args.join(' ')); } },
    };
    runInNewContext(`${custom}\n${shiftBuilder}\n${assembler}\nthis.assemble = XXX;`, context);
    await context.assemble();
    return { locals, globals };
}
