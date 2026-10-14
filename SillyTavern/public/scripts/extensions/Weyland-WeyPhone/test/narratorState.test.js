import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { narratorBuildState, narratorSelection } from '../../quick-reply-ext/src/narratorSelection.js';
import { createNarratorSettingsSync, mergeNarratorSettings, narratorSettingsValues } from '../../../narrator-settings-sync.js';
import { readNarrativeSnapshot } from '../lib/narrativeSettings.js';
import { renderNarrativeSettingsScreen } from '../lib/ui/apps/narrativeSettings.js';
import { assemble } from './helpers/promptAssemblyHarness.js';

const DEFAULT = '[Core Roleplay Instructions]';
const SALEM = '---\n[CRITICAL - NARRATOR - SALEM]\nCurrent Salem text';
const OLD_SALEM = '---\r\n[CRITICAL - NARRATOR - SALEM]\r\nOlder Salem text';
const LAUREN = '[CRITICAL - NARRATOR - LAUREN]\nLauren text';
const defaults = { Default: DEFAULT, Salem: SALEM, Lauren: LAUREN, Narrator: DEFAULT, NarratorStrength: 'Low' };
const snapshot = (globals, locals = {}) => readNarrativeSnapshot({ getGlobal: key => globals[key], getLocal: key => locals[key], hasChat: true });

test('older narrator prose and classic local macros never masquerade as Default', () => {
    assert.equal(snapshot({ ...defaults, Narrator: OLD_SALEM }).globalNarrator, 'Salem');
    for (const text of [OLD_SALEM, '{{getglobalvar::Salem}}', '\\{\\{getglobalvar::Salem}}']) {
        const data = snapshot(defaults, { LocalN: '- Set to Salem', LocalNarrator: text });
        assert.equal(data.localNarrator, 'Salem');
        assert.equal(data.localNarratorOverride, true);
    }
    const custom = snapshot({ ...defaults, Narrator: 'A custom narrator voice' });
    assert.equal(custom.globalNarrator, 'Custom');
    const container = { innerHTML: '' };
    renderNarrativeSettingsScreen(container, { snapshot: custom, tab: 'style' });
    assert.match(container.innerHTML, /A saved narrator prompt is active/);
    assert.doesNotMatch(container.innerHTML, /No narrator set/);
});

test('a chat override is visible next to the global picker and can be cleared', () => {
    const container = { innerHTML: '' };
    renderNarrativeSettingsScreen(container, { snapshot: snapshot(defaults, { LocalN: '- Set to Salem', LocalNarrator: OLD_SALEM }), tab: 'style' });
    assert.match(container.innerHTML, /Salem is selected for this chat/);
    assert.match(container.innerHTML, /data-narrative-action="reset-local-narrator"/);
});

function tab(globals, fetchValues) {
    const sync = createNarratorSettingsSync({ getGlobals: () => globals, fetchValues });
    sync.initialize(globals);
    return { globals, sync };
}

test('OOC mode syncs both ways, survives stale saves and protects a pending explicit toggle', async () => {
    let stored = { extension_settings: { variables: { global: { ...defaults, OOCMode: 'Disabled' } } } };
    const fetchValues = async () => ({ ...narratorSettingsValues(stored.extension_settings.variables.global), revision: stored.weylandNarratorRevision ?? 0 });
    const a = tab({ ...stored.extension_settings.variables.global }, fetchValues);
    const b = tab({ ...a.globals }, fetchValues);
    function save(client) {
        const sent = client.sync.prepareSave();
        const payload = { extension_settings: { variables: { global: { ...client.globals } } }, weylandNarratorBaseline: sent.baseline };
        mergeNarratorSettings(payload, stored);
        stored = payload;
        client.sync.acceptSave(sent, narratorSettingsValues(stored.extension_settings.variables.global), stored.weylandNarratorRevision);
    }
    for (const mode of ['Enabled', 'Disabled']) {
        a.sync.markChanged('OOCMode');
        a.globals.OOCMode = mode;
        save(a);
        save(b); // The other tab saves unrelated settings with its old mode.
        assert.equal(stored.extension_settings.variables.global.OOCMode, mode);
        assert.equal(b.globals.OOCMode, mode);
    }
    a.sync.markChanged('OOCMode');
    a.globals.OOCMode = 'Enabled';
    save(a);
    await b.sync.refresh();
    assert.equal(b.globals.OOCMode, 'Enabled');
    // On, then off before the save: the final choice equals the old baseline but is deliberate.
    a.sync.markChanged('OOCMode');
    a.globals.OOCMode = 'Disabled';
    save(a);
    b.sync.markChanged('OOCMode');
    b.globals.OOCMode = 'Disabled';
    b.sync.markChanged('OOCMode');
    b.globals.OOCMode = 'Enabled';
    await b.sync.refresh();
    assert.equal(b.globals.OOCMode, 'Enabled');
    save(b);
    assert.equal(stored.extension_settings.variables.global.OOCMode, 'Enabled');
    await a.sync.refresh();
    assert.equal(a.globals.OOCMode, 'Enabled');
});

test('the actual PromptOS OOC toggle claims its edit before saving and rebuilds the prompt', async () => {
    const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function handleNarrativeAction(');
    const end = source.indexOf('/** One readable Settings-log', start);
    const globals = { ...defaults, OOCMode: 'Disabled' };
    const client = tab(globals, async () => null);
    const rebuilds = [];
    const context = {
        narrativeActionPending: false, narrativeAnchorKey: '', narrativeNarratorPreview: null,
        currentView: 'narrative', OOC_MODE_VARIABLE: 'OOCMode', narratorSettingsSync: client.sync,
        SillyTavern: { getContext: () => ({ variables: { global: { set: (key, value) => {
            assert.equal(Object.hasOwn(client.sync.prepareSave().baseline, key), false, 'mark before the setter queues a save');
            globals[key] = value;
        } } } }) },
        narrativeSnapshot: () => snapshot(globals), narrativeQuickReplyScript: () => '',
        rebuildNarrativePrompts: async (...commands) => rebuilds.push(commands),
        describeNarrativeChange: () => '', renderNarrativeScreenNow: () => {},
        wpToast: (_kind, message) => assert.fail(message), console,
    };
    runInNewContext(`${source.slice(start, end)}\nthis.toggle = handleNarrativeAction;`, context);
    for (const mode of ['Enabled', 'Disabled']) {
        const button = { dataset: { narrativeAction: 'toggle-mode', variable: 'OOCMode' }, classList: { add: () => {} } };
        await context.toggle(button);
        assert.equal(globals.OOCMode, mode);
        assert.equal(context.narrativeActionPending, false);
        const sent = client.sync.prepareSave();
        client.sync.acceptSave(sent, narratorSettingsValues(globals));
    }
    assert.deepEqual(rebuilds, [['XXX'], ['XXX']]);
});

test('a remote OOC change rebuilds the actual prompt before sends, rerolls and continues', async () => {
    const source = readFileSync(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function OnNarratorCheck(');
    const end = source.indexOf('\n/** GENERATION_AFTER_COMMANDS', start);
    for (const type of ['normal', 'swipe', 'regenerate', 'continue']) {
        for (const override of [false, true]) {
            const globals = { ...defaults, OOCMode: 'Disabled' };
            let remoteMode = 'Disabled', revision = 0;
            const client = tab(globals, async () => ({ ...narratorSettingsValues(globals), OOCMode: remoteMode, revision }));
            let { locals } = await assemble('Rosa', globals, override ? { LocalN: '- Set to Salem', LocalNarrator: SALEM } : {});
            let rebuilds = 0;
            const context = {
                narratorSettingsSync: client.sync, narratorBuildState, console,
                getGlobalVariable: key => globals[key] ?? '', getLocalVariable: key => locals.get(key) ?? '',
                XXX: async () => { rebuilds++; locals = (await assemble('Rosa', globals, Object.fromEntries(locals))).locals; },
            };
            runInNewContext(`${source.slice(start, end)}\nthis.check = OnNarratorCheck;`, context);
            for (const mode of ['Enabled', 'Disabled']) {
                remoteMode = mode;
                revision++;
                const before = rebuilds;
                await context.check(type, {}, false);
                assert.equal(globals.OOCMode, mode);
                assert.equal(rebuilds, before + 1);
                assert.equal(locals.get('ravteg').startsWith('[OOC MODE - THE ROLEPLAY IS PAUSED]'), mode === 'Enabled');
                assert.equal(locals.get('LocalNarrator'), override ? SALEM : DEFAULT);
                if (mode === 'Enabled') assert.equal(locals.get('NarratorEarly'), '');
                await context.check(type, {}, false);
                assert.equal(rebuilds, before + 1, 'unchanged mode does not rebuild every message');
            }
        }
    }
});

test('two independent sessions: a stale tab cannot undo a pick through an unrelated settings save', async () => {
    let stored = { extension_settings: { variables: { global: { ...defaults, Narrator: SALEM } } } };
    const a = tab({ ...stored.extension_settings.variables.global }, async () => narratorSettingsValues(stored.extension_settings.variables.global));
    const b = tab({ ...a.globals }, async () => narratorSettingsValues(stored.extension_settings.variables.global));
    function save(client) {
        const sent = client.sync.prepareSave();
        const payload = { username: 'unrelated change', extension_settings: { variables: { global: { ...client.globals } } }, weylandNarratorBaseline: sent.baseline };
        mergeNarratorSettings(payload, stored);
        stored = payload;
        client.sync.acceptSave(sent, narratorSettingsValues(stored.extension_settings.variables.global));
        assert.equal('weylandNarratorBaseline' in stored, false);
    }
    a.sync.markChanged('Narrator');
    a.globals.Narrator = DEFAULT;
    save(a);
    save(b);
    assert.equal(stored.extension_settings.variables.global.Narrator, DEFAULT);
    assert.equal(b.globals.Narrator, DEFAULT);
    a.sync.markChanged('Narrator');
    a.globals.Narrator = LAUREN;
    save(a);
    assert.equal(await b.sync.refresh(), true);
    assert.equal(b.globals.Narrator, LAUREN);
});

test('explicitly reselecting Default wins even when the stale tab already shows Default', () => {
    const client = tab({ ...defaults }, async () => ({ Narrator: SALEM, NarratorStrength: 'Low' }));
    client.sync.markChanged('Narrator');
    const sent = client.sync.prepareSave();
    const payload = { extension_settings: { variables: { global: { ...client.globals } } }, weylandNarratorBaseline: sent.baseline };
    mergeNarratorSettings(payload, { extension_settings: { variables: { global: { Narrator: SALEM } } } });
    assert.equal(payload.extension_settings.variables.global.Narrator, DEFAULT);
});

function classicVariableCommands(client, saveSettingsDebounced = () => {}) {
    // Run the real variable setters and registered callbacks with browser dependencies stubbed.
    // This catches a missing link between the classic menu and the settings merge protocol.
    const source = readFileSync(new URL('../../../variables.js', import.meta.url), 'utf8');
    const commands = new Map();
    class Argument {
        constructor(name) { this.name = name; }
        static fromProps(props) { return props; }
    }
    const context = {
        extension_settings: { variables: { global: client.globals } }, chat_metadata: {},
        narratorSettingsSync: client.sync, saveSettingsDebounced, saveMetadataDebounced: () => {},
        isTrueBoolean: value => ['true', 'on', 'yes', '1'].includes(String(value).toLowerCase()),
        convertValueType: value => value,
        SlashCommand: Argument, SlashCommandArgument: Argument, SlashCommandNamedArgument: Argument,
        SlashCommandEnumValue: Argument, ARGUMENT_TYPE: {}, enumTypes: {}, enumIcons: {},
        commonEnumProviders: { variables: () => () => [], boolean: () => () => [], types: () => [], numbersAndVariables: () => [] },
        slashCommandReturnHelper: { enumList: () => [] },
        SlashCommandParser: { addCommandObject: command => commands.set(command.name, command) },
    };
    runInNewContext(source.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '') + '\nregisterVariableCommands();', context);
    return commands;
}

test('classic menu selections override a stale baseline, including reselecting Default and strength', async () => {
    const book = JSON.parse(readFileSync(new URL('../../../../../data/default-user/QuickReplies/Weyland.json', import.meta.url), 'utf8'));
    const menu = book.qrList.find(row => row.label === 'NarrativeSettings').message;
    const picks = [...menu.matchAll(/\/if left=\{\{getvar::OptionChoice2}} right="(Default|Salem - Dark\/Emotional|Lucky - Remix|Lauren - Romance)" rule=eq \{:\/pass \{\{getglobalvar::(\w+)}} \|\n(\/setglobalvar[^\n]+) \|/g)];
    assert.equal(picks.length, 4, 'exercise every global narrator branch of the actual menu');
    for (const [, label, template, command] of picks) {
        let stored = { extension_settings: { variables: { global: { ...defaults, Lucky: '[CRITICAL - NARRATOR - LUCKY]' } } } };
        const a = tab({ ...stored.extension_settings.variables.global }, async () => narratorSettingsValues(stored.extension_settings.variables.global));
        const b = tab({ ...a.globals }, async () => narratorSettingsValues(stored.extension_settings.variables.global));
        function save(client) {
            const sent = client.sync.prepareSave();
            const payload = { extension_settings: { variables: { global: { ...client.globals } } }, weylandNarratorBaseline: sent.baseline };
            mergeNarratorSettings(payload, stored);
            stored = payload;
            client.sync.acceptSave(sent, narratorSettingsValues(stored.extension_settings.variables.global), stored.weylandNarratorRevision);
        }
        b.sync.markChanged('Narrator');
        b.globals.Narrator = SALEM;
        b.sync.markChanged('NarratorStrength');
        b.globals.NarratorStrength = 'High';
        save(b);
        const setter = classicVariableCommands(a).get('setglobalvar');
        const args = Object.fromEntries([...command.matchAll(/(\w+)=(\w+)/g)].map(([, key, value]) => [key, value]));
        assert.equal(setter.callback(args, a.globals[template]), a.globals[template]);
        // A pre-generation refresh must not erase an explicit pick awaiting its debounced save.
        await a.sync.refresh();
        assert.equal(a.globals.Narrator, a.globals[template], label);
        save(a);
        assert.equal(stored.extension_settings.variables.global.Narrator, a.globals[template], label);
        assert.ok(setter.namedArgumentList.some(argument => argument.name === 'narratorPick'), 'the parser exposes the menu intent flag');
        assert.equal(stored.extension_settings.variables.global.NarratorStrength, 'High', 'a narrator pick does not overwrite the other tab\'s strength');
        setter.callback({ key: 'NarratorStrength', narratorPick: 'true' }, 'High');
        stored.extension_settings.variables.global.NarratorStrength = 'Low';
        save(a);
        assert.equal(stored.extension_settings.variables.global.NarratorStrength, 'High', 'an explicit repeated strength choice also wins');
    }
});

test('automatic slash-command template refreshes and ordinary variable writes do not claim a narrator pick', () => {
    const client = tab({ ...defaults, Narrator: OLD_SALEM }, async () => null);
    let saves = 0;
    const setter = classicVariableCommands(client, () => saves++).get('setglobalvar');
    setter.callback({ key: 'Narrator' }, SALEM);
    setter.callback({ key: 'NarratorStrength', narratorPick: 'false' }, 'Low');
    setter.callback({ key: 'unrelated', narratorPick: 'true' }, 'some value');
    const sent = client.sync.prepareSave();
    assert.equal(sent.baseline.Narrator, OLD_SALEM);
    assert.equal(sent.baseline.NarratorStrength, 'Low');
    const payload = { extension_settings: { variables: { global: { ...client.globals } } }, weylandNarratorBaseline: sent.baseline };
    mergeNarratorSettings(payload, { extension_settings: { variables: { global: { Narrator: DEFAULT, NarratorStrength: 'High' } } } });
    assert.equal(payload.extension_settings.variables.global.Narrator, DEFAULT);
    assert.equal(payload.extension_settings.variables.global.NarratorStrength, 'High');
    assert.equal(payload.extension_settings.variables.global.unrelated, 'some value');
    assert.equal(saves, 3);
});

test('template refreshes do not undo another session selecting Default', () => {
    const payload = { extension_settings: { variables: { global: { ...defaults, Narrator: SALEM } } }, weylandNarratorBaseline: { Narrator: OLD_SALEM } };
    mergeNarratorSettings(payload, { extension_settings: { variables: { global: { Narrator: DEFAULT } } } });
    assert.equal(payload.extension_settings.variables.global.Narrator, DEFAULT);
});

test('server refresh and save responses cannot erase a newer unsaved click', async () => {
    let respond;
    const client = tab({ ...defaults }, () => new Promise(resolve => { respond = resolve; }));
    const read = client.sync.refresh();
    await Promise.resolve();
    client.sync.markChanged('Narrator');
    client.globals.Narrator = LAUREN;
    respond({ Narrator: SALEM, NarratorStrength: 'High' });
    await read;
    assert.equal(client.globals.Narrator, LAUREN);
    assert.equal(client.globals.NarratorStrength, 'High');
    const sent = client.sync.prepareSave();
    // A repeated pick has the same bytes but represents a newer user decision.
    client.sync.markChanged('Narrator');
    client.sync.acceptSave(sent, { Narrator: SALEM, NarratorStrength: 'High' });
    assert.equal(client.globals.Narrator, LAUREN);
});

test('legacy saves remain compatible and do not persist the protocol envelope', () => {
    const payload = { extension_settings: { variables: { global: { Narrator: SALEM } } } };
    mergeNarratorSettings(payload, {});
    assert.equal(payload.extension_settings.variables.global.Narrator, SALEM);
});

test('settings routes preserve the other session\'s pick and return only narrator fields on refresh', () => {
    const source = readFileSync(new URL('../../../../../src/endpoints/settings.js', import.meta.url), 'utf8');
    const start = source.indexOf("router.post('/save'");
    const end = source.indexOf('// Wintermute', start);
    assert.ok(start >= 0 && end > start);
    let stored = { username: 'old name', extension_settings: { variables: { global: { Narrator: DEFAULT, NarratorStrength: 'High', unrelated: 'private' } } } };
    const handlers = new Map();
    const context = {
        router: { post: (route, handler) => handlers.set(route, handler) },
        fs: { existsSync: () => true, readFileSync: () => JSON.stringify(stored) },
        path: { join: (...parts) => parts.join('/') }, SETTINGS_FILE: 'settings.json',
        writeFileAtomicSync: (_path, text) => { stored = JSON.parse(text); }, triggerAutoSave: () => {},
        mergeNarratorSettings, narratorSettingsValues,
    };
    runInNewContext(source.slice(start, end), context);
    const user = { directories: { root: 'fixture-user' }, profile: { handle: 'fixture-user' } };
    const payload = { username: 'new name', extension_settings: { variables: { global: { Narrator: OLD_SALEM, NarratorStrength: 'Low' } } }, weylandNarratorBaseline: { Narrator: OLD_SALEM, NarratorStrength: 'Low' } };
    let result;
    const response = { send: value => { result = value; }, sendStatus: code => assert.fail(`Unexpected status ${code}`) };
    handlers.get('/save')({ user, body: payload }, response);
    assert.equal(result.result, 'ok');
    assert.equal(result.narrator.Narrator, DEFAULT);
    assert.equal(stored.extension_settings.variables.global.NarratorStrength, 'High');
    assert.equal(stored.username, 'new name');
    assert.equal('weylandNarratorBaseline' in stored, false);
    handlers.get('/narrator')({ user }, response);
    assert.deepEqual(Object.keys(result).sort(), ['Narrator', 'NarratorStrength', 'OOCMode', 'revision']);
});

test('delayed read and save responses do not restore an older narrator revision', async () => {
    const client = tab({ ...defaults }, async () => ({ Narrator: LAUREN, NarratorStrength: 'Low', revision: 2 }));
    const sent = client.sync.prepareSave();
    await client.sync.refresh();
    assert.equal(client.globals.Narrator, LAUREN);
    client.sync.acceptSave(sent, { Narrator: SALEM, NarratorStrength: 'Low' }, 1);
    assert.equal(client.globals.Narrator, LAUREN);
    // A stale read can also arrive after a newer save response has been applied.
    const latest = client.sync.prepareSave();
    client.sync.acceptSave(latest, { Narrator: DEFAULT, NarratorStrength: 'Low' }, 3);
    await client.sync.refresh();
    assert.equal(client.globals.Narrator, DEFAULT);
});

test('before generation: repair stale baked Salem text once, including rerolls, continues and OOC', async () => {
    const source = readFileSync(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function OnNarratorCheck(');
    const end = source.indexOf('\n/** GENERATION_AFTER_COMMANDS', start);
    assert.ok(start >= 0 && end > start);
    assert.match(source, /eventSource\.on\(event_types\.GENERATION_AFTER_COMMANDS, OnNarratorCheck\)/);
    for (const type of ['normal', 'swipe', 'regenerate', 'continue']) {
        for (const ooc of ['Disabled', 'Enabled']) {
            const globals = { ...defaults, OOCMode: ooc };
            // Imported chats may carry a full cached prompt without the modern Run flag.
            let locals = new Map([['Run', type === 'continue' ? '' : 'true'], ['ravteg', 'CACHED SALEM PROMPT'], ['LocalNarrator', OLD_SALEM], ['NarratorEarly', OLD_SALEM]]);
            if (type === 'regenerate') locals.set('NarratorBuiltFrom', narratorBuildState(key => globals[key], key => locals.get(key)));
            let rebuilds = 0, reads = 0;
            const context = {
                narratorSettingsSync: { refresh: async () => { reads++; } },
                getGlobalVariable: key => globals[key] ?? '', getLocalVariable: key => locals.get(key) ?? '',
                narratorBuildState,
                XXX: async () => { rebuilds++; locals = (await assemble('Rosa', globals, Object.fromEntries(locals))).locals; },
                console,
            };
            runInNewContext(`${source.slice(start, end)}\nthis.check = OnNarratorCheck;`, context);
            await context.check(type, {}, false);
            const prompt = ['ravteg', 'postrav', 'NarratorEarly'].map(key => locals.get(key)).join('\n');
            assert.doesNotMatch(prompt, /Salem|SALEM|NARRATOR GREEN ROOM/);
            assert.equal(locals.get('LocalNarrator'), DEFAULT);
            await context.check(type, {}, false);
            assert.equal(rebuilds, 1, 'an unchanged narrator does not rerun Clear or prompt assembly');
            await context.check(type, {}, true);
            assert.equal(reads, 2, 'dry runs do not fetch or repair');
        }
    }
});

test('intentional chat overrides survive repair, and classic macros select the matching green room', async () => {
    for (const LocalNarrator of [OLD_SALEM, '{{getglobalvar::Salem}}']) {
        const { locals } = await assemble('Rosa', defaults, { LocalN: '- Set to Salem', LocalNarrator });
        assert.equal(locals.get('LocalNarrator'), LocalNarrator);
        assert.match(locals.get('ravteg'), /Salem/);
        assert.equal(narratorSelection(LocalNarrator), 'Salem');
    }
});

test('cached mandatory narrator lines rebuild once without changing the selected voice or strength', async () => {
    const source = readFileSync(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function OnNarratorCheck(');
    const end = source.indexOf('\n/** GENERATION_AFTER_COMMANDS', start);
    for (const name of ['Lauren', 'Salem', 'Lucky']) {
        for (const NarratorStrength of ['Low', 'High']) {
            const Narrator = `[CRITICAL - NARRATOR - ${name.toUpperCase()}]\n${name}'s voice`;
            const globals = { ...defaults, Narrator, NarratorStrength };
            // This is the actual pre-fix signature, with the same selection as the current chat.
            const oldSignature = JSON.stringify([Narrator, NarratorStrength, name, '']);
            let locals = new Map([['Run', 'true'], ['LocalNarrator', Narrator],
                ['NarratorBuiltFrom', oldSignature], ['ravteg', 'Write one sentence. It goes in the draft, word for word.']]);
            let rebuilds = 0;
            const context = {
                narratorSettingsSync: { refresh: async () => {} },
                getGlobalVariable: key => globals[key] ?? '', getLocalVariable: key => locals.get(key) ?? '',
                narratorBuildState,
                XXX: async () => { rebuilds++; locals = (await assemble('Rosa', globals, Object.fromEntries(locals))).locals; },
                console,
            };
            runInNewContext(`${source.slice(start, end)}\nthis.check = OnNarratorCheck;`, context);
            await context.check('normal', {}, true);
            assert.equal(rebuilds, 0, 'dry runs do not migrate cached prompts');
            await context.check('normal', {}, false);
            assert.doesNotMatch(locals.get('ravteg'), /Write one sentence|word for word|green-room sentence|your two techniques/);
            assert.ok(locals.get('ravteg').includes(`[CRITICAL - NARRATOR - ${name.toUpperCase()}]`));
            assert.equal(locals.get('LocalNarrator'), Narrator);
            assert.equal(globals.NarratorStrength, NarratorStrength);
            await context.check('continue', {}, false);
            assert.equal(rebuilds, 1, 'the migrated prompt is not rebuilt on every message');
        }
    }
});
