import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

// Reported 2026-11-02: message 1 mood [Excitement] -> main character and side character (Luna) both excited;
// message 2 mood [Annoyance] -> the main character changed but Luna stayed excited for the rest of the chat.
// SideCharacters only redrew her when her FOLDER changed. refreshSideCharacter also redraws when the mood changes.

const source = await readFile(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');

/** Runs the real helper from index.js with the chat variables and the loader stubbed out. */
function sideCharacterHarness() {
    const vars = new Map();
    const draws = [];
    const context = vm.createContext({
        getLocalVariable: key => vars.get(key) ?? '',
        setLocalVariable: (key, value) => { vars.set(key, value); },
        updateSideCharacter: async args => { draws.push(args); return `Side character set to: ${args.character} - ${args.expression}`; },
    });
    const helper = source.match(/function refreshSideCharacter\([\s\S]*?\r?\n\}/);
    assert.ok(helper, 'refreshSideCharacter exists in quick-reply-ext/index.js');
    vm.runInContext(`${helper[0]}\nthis.refreshSideCharacter = refreshSideCharacter;`, context);
    return { refresh: context.refreshSideCharacter, vars, draws };
}

test('a side character who stays in the scene follows the mood of each new message', async () => {
    const { refresh, draws } = sideCharacterHarness();
    await refresh('Luna/Regular Outfit', 'excitement');
    await refresh('Luna/Regular Outfit', 'annoyance');
    assert.deepEqual(draws.map(d => d.expression), ['excitement', 'annoyance']);
    assert.ok(draws.every(d => d.character === 'Luna/Regular Outfit'));
});

test('nothing is redrawn while folder and mood are both unchanged', async () => {
    const { refresh, draws } = sideCharacterHarness();
    assert.ok(refresh('Luna/Regular Outfit', 'annoyance'));
    assert.equal(refresh('Luna/Regular Outfit', 'annoyance'), null);
    assert.equal(draws.length, 1);
});

test('a new person or costume is drawn even when the mood is the same', async () => {
    const { refresh, draws } = sideCharacterHarness();
    await refresh('Luna/Regular Outfit', 'joy');
    await refresh('Luna/Hoodie', 'joy');
    await refresh('Kiera/Regular Outfit', 'joy');
    assert.deepEqual(draws.map(d => d.character), ['Luna/Regular Outfit', 'Luna/Hoodie', 'Kiera/Regular Outfit']);
});

test('no saved mood draws neutral, like /sidecharacter does, and is not redrawn every message', async () => {
    const { refresh, draws, vars } = sideCharacterHarness();
    await refresh('Luna/Regular Outfit', '');
    assert.equal(draws[0].expression, 'neutral');
    assert.equal(vars.get('SideExpSave'), 'neutral');
    assert.equal(refresh('Luna/Regular Outfit', undefined), null);
});

test('a chat saved before this fix (no SideExpSave) is corrected on the next message', async () => {
    const { refresh, draws, vars } = sideCharacterHarness();
    vars.set('CostmSaveSide', 'Luna/Regular Outfit');
    await refresh('Luna/Regular Outfit', 'sadness');
    assert.deepEqual(draws.map(d => d.expression), ['sadness']);
});

test('every place that draws the side character passes the mood', () => {
    // SideCharacters and OpenWorldCostumes go through the helper
    assert.match(source, /refreshSideCharacter\(spriteFolder, getLocalVariable\("ExpSave"\)\)/);
    assert.match(source, /refreshSideCharacter\(sideFolder, expression\)/);
    // the old folder-only checks are gone
    assert.doesNotMatch(source, /getLocalVariable\("CostmSaveSide"\) !== spriteFolder/);
    assert.doesNotMatch(source, /getLocalVariable\("CostmSaveSide"\) !== sideFolder/);
    // reopening a chat used to redraw her with no expression, i.e. neutral
    assert.match(source, /updateSideCharacter\(\{character: costumeSaveSide, expression: getLocalVariable\("ExpSave"\)\}\)/);
    assert.doesNotMatch(source, /updateSideCharacter\(\{character: costumeSaveSide\}\)/);
});
