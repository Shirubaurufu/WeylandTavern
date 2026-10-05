import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ravs } from '../../quick-reply-ext/src/promptRegistry.js';
import { assemble } from './helpers/promptAssemblyHarness.js';
import { resolveMasterPrompt, resolvePostHistoryInstructions } from '../lib/promptResolution.js';
import { stripAnalysisProcedure } from '../lib/phonePromptPolicy.js';
import { readNarrativeSnapshot } from '../lib/narrativeSettings.js';
import { renderNarrativeSettingsScreen } from '../lib/ui/apps/narrativeSettings.js';

const mini = ravs.get('Mini Prompt');
const beta = ravs.get('Beta Prompt');
function block(text, start, end) {
    const from = text.indexOf(start);
    const to = text.indexOf(end, from);
    assert.ok(from >= 0 && to > from);
    return text.slice(from, to + end.length);
}

test('Mini carries the exact live Beta UI contracts and all 28 supported expressions', () => {
    for (const [start, end] of [
        ['[HEADER FORMATTING]\n', '[END Proper Weyland Tavern formatting]'],
        ['[TEXT MESSAGE FORMATTING]', '[END TEXT MESSAGE FORMATTING]'],
        ['[Message Modes]', '[END Message Modes]'],
    ]) assert.equal(block(mini.teg, start, end), block(beta.teg, start, end));
    const expressions = [...mini.teg.matchAll(/^\[([A-Za-z]+)\] - /gm)].map(match => match[1]);
    assert.equal(new Set(expressions).size, 28);
    const formatter = readFileSync(new URL('../../Weyland-Formatter/index.js', import.meta.url), 'utf8');
    const regex = name => runInNewContext(formatter.match(new RegExp(`${name}: (.+),\\r?\\n`))[1]);
    const header = regex('detectHeader');
    const footer = regex('expressionClothingParagraph');
    assert.ok(header.test('¦¦ Saturday, Oct 18th ~ 9:28 AM ~ Dormitory ~ (ONYX) ¦¦'));
    for (const expression of expressions) {
        assert.ok(footer.test(`[${expression}] [RC]`));
        assert.ok(footer.test(`[${expression}] [RC] [OPAL] [4]`));
    }
});

test('normal Mini assembly keeps settings, resolves pipe, and adds no scene sheet when Analysis is off', async () => {
    const { locals, globals } = await assemble('Rosa', { AnalysisToggle: 'Disabled' });
    assert.equal(locals.get('ravteg'), mini.teg.replaceAll('{{getvar::LocalNarrator}}', ''));
    assert.ok(locals.get('postrav').startsWith('{{getvar::LocalNarrator}}\n\n'));
    assert.equal(locals.get('LocalNarrator'), 'NARRATOR');
    assert.equal(locals.get('RPPOVLocal'), 'POV');
    assert.equal(locals.get('CCPromptCodes'), beta.CCPC);
    assert.match(locals.get('postrav'), /\{\{getglobalvar::RPFocus\}\}/);
    assert.doesNotMatch(locals.get('postrav'), /\{\{pipe\}\}|Weyland Tavern client note|SCENE SHEET/);
    assert.equal(globals.get('AnalysisToggle'), 'Disabled');
    assert.doesNotMatch(locals.get('ravteg'), /WEYLAND SCENE SHEET|WEYLAND RESPONSE ANALYSIS PROCEDURE|\{\{getglobalvar::Coach\}\}/);
});

test('Mini supports alternate expression view, HTML, character thoughts and Kris post-history', async () => {
    const { locals: weybot } = await assemble('Weybot', { 'HTML!': 'Enabled' });
    assert.equal(weybot.get('CCPromptCodes'), beta.CCPCA);
    assert.ok(weybot.get('postrav').includes(beta.expaltshow));
    assert.match(weybot.get('postrav'), /HTML INSTRUCTIONS/);
    const { locals: summer } = await assemble('Summer');
    assert.equal(summer.get('ThoughtSet'), beta.thinkYes);
    const { locals: kris } = await assemble('Kris');
    assert.equal(kris.get('Krisrav'), kris.get('postrav'));
});

test('WeyPhone resolves Mini without fallback or preparation stripping damage', () => {
    assert.equal(resolveMasterPrompt(ravs, 'Mini Prompt'), mini);
    const post = resolvePostHistoryInstructions(mini, { htmlEnabled: false, rpFocus: 'PHONE FOCUS' });
    assert.match(post, /PHONE FOCUS/);
    assert.doesNotMatch(post, /\{\{pipe\}\}/);
    assert.equal(stripAnalysisProcedure(mini.teg), mini.teg);
    assert.equal(stripAnalysisProcedure(post), post);
});

test('PromptOS selects Mini and exposes the shared Analysis toggle', () => {
    const globals = new Map([['PromptChoice', 'Mini Prompt'], ['AnalysisToggle', 'Enabled']]);
    const snapshot = readNarrativeSnapshot({ getGlobal: key => globals.get(key), getLocal: () => '', hasChat: false });
    assert.equal(snapshot.prompt, 'Mini Prompt');
    assert.equal(snapshot.analysisEnabled, true);
    const target = { innerHTML: '' };
    renderNarrativeSettingsScreen(target, { snapshot, tab: 'essentials' });
    assert.match(target.innerHTML, /wp-narrative-cart is-in" data-narrative-action="set-prompt" data-value="Mini Prompt"/);
    assert.match(target.innerHTML, /Analysis · Recommended/);
    assert.match(target.innerHTML, /data-narrative-action="toggle-analysis"/);
    assert.match(target.innerHTML, /4 Promptcarts/);
});
