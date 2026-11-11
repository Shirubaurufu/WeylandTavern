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
    // What the page shows. The loader stub draws and clears at once; `page.shown` can also be set by
    // hand to stage "the page and the chat's variables disagree".
    const page = { shown: false };
    const context = vm.createContext({
        getLocalVariable: key => vars.get(key) ?? '',
        setLocalVariable: (key, value) => { vars.set(key, value); },
        isSideCharacterShown: () => page.shown,
        updateSideCharacter: args => {
            draws.push(args);
            page.shown = args.clear !== 'true';
            return Promise.resolve(`Side character set to: ${args.character} - ${args.expression}`);
        },
    });
    const helper = source.match(/function refreshSideCharacter\([\s\S]*?\r?\n\}/);
    assert.ok(helper, 'refreshSideCharacter exists in quick-reply-ext/index.js');
    const clear = source.match(/function clearSideCharacter\([\s\S]*?\r?\n\}/);
    assert.ok(clear, 'clearSideCharacter exists in quick-reply-ext/index.js');
    vm.runInContext(`${helper[0]}\n${clear[0]}\nthis.refreshSideCharacter = refreshSideCharacter;this.clearSideCharacter = clearSideCharacter;`, context);
    return { refresh: context.refreshSideCharacter, clear: context.clearSideCharacter, vars, draws, page };
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

// Reported 2026-11-11: Belle's hot tub greeting shows Dash on the right; swiping on to the next greeting left
// Dash there for the whole chat. The draw for the hot tub greeting finished AFTER the next greeting's clear, so
// the chat's variable said "no side character" while one was on screen, and every later message skipped the clear.
test('a side character on screen is cleared even when the chat variables say there is none', () => {
    const { clear, draws, vars, page } = sideCharacterHarness();
    page.shown = true; // a late draw, or the previous chat's side character
    assert.equal(vars.get('CostmSaveSide') ?? '', '');
    assert.equal(clear(), true);
    assert.deepEqual(draws.map(d => d.clear), ['true']);
    assert.equal(page.shown, false);
});

test('clearing with nothing saved and nothing on screen does nothing', () => {
    const { clear, draws } = sideCharacterHarness();
    assert.equal(clear(), false);
    assert.equal(draws.length, 0);
});

test('clearing forgets the saved side character, so she is drawn again when she returns', async () => {
    const { refresh, clear, draws, vars } = sideCharacterHarness();
    await refresh('Dash/Naked', 'joy');
    assert.equal(clear(), true);
    assert.equal(vars.get('CostmSaveSide'), '');
    await refresh('Dash/Naked', 'joy');
    assert.deepEqual(draws.map(d => d.clear === 'true' ? 'clear' : d.character), ['Dash/Naked', 'clear', 'Dash/Naked']);
});

test('a side character the variables remember but the page lost is drawn again', async () => {
    const { refresh, draws, page } = sideCharacterHarness();
    await refresh('Luna/Regular Outfit', 'joy');
    page.shown = false; // e.g. her draw was overtaken, or another chat cleared the page
    assert.ok(refresh('Luna/Regular Outfit', 'joy'));
    assert.equal(draws.length, 2);
});

test('no place clears the side character on the chat variable alone', () => {
    assert.doesNotMatch(source, /getLocalVariable\("CostmSaveSide"\) !== ""\) \{/);
    assert.equal(source.match(/updateSideCharacter\(\{clear: ["']true["']\}\)/g)?.length, 1, 'only clearSideCharacter clears');
});

test('the side character loader lets only its latest call draw', async () => {
    const loader = await readFile(new URL('../../Side-Character-Loader/index.js', import.meta.url), 'utf8');
    assert.match(loader, /const thisCall = \+\+latestCall;/);
    // checked after each wait: the main portrait loading, and the sprite list
    assert.equal(loader.match(/if \(superseded\(\)\) return/g)?.length, 2);
    assert.match(loader, /export const isSideCharacterShown/);
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
