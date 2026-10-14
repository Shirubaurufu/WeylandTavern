import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

import { splitMessage, joinMessage } from '../lib/understudy.js';

// Runs the REAL commit function from index.js (sliced out, like narratorStrength.test.js does for its handler)
// against a chat shaped like the Loona one that lost its header and footer on 2026-10-10.
const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const sliceFunction = (name) => {
    const start = source.search(new RegExp(`^(async )?function ${name}\\(`, 'm'));
    assert.ok(start >= 0, `${name} not found in index.js`);
    // index.js is CRLF on disk, so the closing brace is found with an EOL-agnostic search.
    const end = source.slice(start).search(/\r?\n\}\r?\n/);
    assert.ok(end >= 0, `${name} end not found`);
    return source.slice(start, start + end + 3);
};

const HEADER = '---\n\n¦¦ Friday, Oct 14th ~ 11:51 PM ~ Shared Apartment ~ (ONYX) ¦¦';
const FOOTER = '[Amusement] [CC] [10]';
const SONNET = `${HEADER}\n\n*She doesn’t bother closing the door.* "Sooo—" *hiccup* "—whatcha playin', hm?~"\n\n${FOOTER}`;
const FILTER_ERROR = '\n\nThe prompt could not be submitted. The prompt contains sensitive words that violate Google\'s policy.';
const TAKE_BODY = '*The door kicks shut behind her.* "And what the fuck are you playing, nerd?"';

function makeContext(message) {
    const events = [];
    const chat = [{ name: 'User', is_user: true, mes: 'hi' }, message];
    const context = {
        chat,
        chatId: 'test',
        eventTypes: { MESSAGE_EDITED: 'message_edited' },
        eventSource: { emit: async (type, index) => { events.push([type, index]); } },
        updateMessageBlock: () => {},
        saveChat: async () => {},
        extensionSettings: { WeyPhone: {} },
        getChatCompletionModel: () => 'live-model',
    };
    const sandbox = {
        SillyTavern: { getContext: () => context },
        understudySplitMessage: splitMessage,
        understudyJoinMessage: joinMessage,
        understudyIdentity: () => 'key',
        understudyDraftModel: 'gemini-3.8-flash',
        understudySourceSwipe: null,
        understudyLastRun: null,
        getSettings: () => ({ understudy: {} }),
        resolveModelOverride: () => 'gemini-3.8-flash',
        pushLogLine: () => {},
        showSwipeButtons: () => {},
        structuredClone,
        console,
    };
    vm.createContext(sandbox);
    vm.runInContext(['understudyReadings', 'understudyPickedReading', 'copycatNeutralExtra', 'appendUnderstudyTakeAsSwipe'].map(sliceFunction).join('\n'), sandbox);
    return { sandbox, chat, message, events };
}

// The chat as it was: 3 swipes. #1 the Sonnet reply, #2 a Gemini filter error, #3 the first Copycat take.
const chatWithErrorOnScreen = () => makeContext({
    name: 'Loona',
    mes: FILTER_ERROR,
    swipes: [SONNET, FILTER_ERROR, `${HEADER}\n\n*First take.*\n\n${FOOTER}`],
    swipe_id: 1,
    swipe_info: [
        { extra: { model: 'claude-sonnet-5', reasoning: 'SCENE SHEET ...', time_to_first_token: 14545 } },
        { extra: { model: 'gemini-3.8-flash', reasoning: '', time_to_first_token: 1804 } },
        { extra: { model: 'claude-sonnet-5', weyland_understudy: true } },
    ],
    extra: { model: 'gemini-3.8-flash', reasoning: '', time_to_first_token: 1804 },
});

test('a take performed from the Sonnet reply keeps ITS header and footer, even with a filter-error swipe on screen', async () => {
    const { sandbox, message } = chatWithErrorOnScreen();
    sandbox.understudySourceSwipe = 0; // Copycat is pinned to the Sonnet reading after an apply
    assert.equal(await sandbox.appendUnderstudyTakeAsSwipe(TAKE_BODY, 1), true);
    const landed = message.swipes.at(-1);
    assert.equal(landed, `${HEADER}\n\n${TAKE_BODY}\n\n${FOOTER}`);
    assert.equal(message.mes, landed);
    assert.equal(message.swipe_id, message.swipes.length - 1);
});

test("the take's bookkeeping comes from the reading it was performed from, not the swipe on screen", async () => {
    const { sandbox, message } = chatWithErrorOnScreen();
    sandbox.understudySourceSwipe = 0;
    await sandbox.appendUnderstudyTakeAsSwipe(TAKE_BODY, 1);
    const extra = message.swipe_info.at(-1).extra;
    assert.equal(extra.model, 'claude-sonnet-5');
    assert.equal(extra.time_to_first_token, 14545);
    assert.equal(extra.weyland_understudy, true);
    assert.equal(extra.weyland_understudy_model, 'gemini-3.8-flash');
    assert.equal(message.extra.model, 'claude-sonnet-5');
});

test('the normal case is unchanged: source on screen, header and footer from it', async () => {
    const { sandbox, message } = makeContext({
        name: 'Loona', mes: SONNET, swipes: [SONNET], swipe_id: 0,
        swipe_info: [{ extra: { model: 'claude-sonnet-5' } }], extra: { model: 'claude-sonnet-5', live: true },
    });
    assert.equal(await sandbox.appendUnderstudyTakeAsSwipe(TAKE_BODY, 1), true);
    assert.equal(message.swipes.at(-1), `${HEADER}\n\n${TAKE_BODY}\n\n${FOOTER}`);
    assert.equal(message.swipe_info.at(-1).extra.live, true, 'message.extra is still the base when the source is displayed');
});

test('a never-swiped message still seeds its swipes and keeps its header and footer', async () => {
    const { sandbox, message } = makeContext({ name: 'Loona', mes: SONNET, extra: { model: 'claude-sonnet-5' } });
    assert.equal(await sandbox.appendUnderstudyTakeAsSwipe(TAKE_BODY, 1), true);
    assert.equal(message.swipes.length, 2);
    assert.equal(message.swipes[0], SONNET);
    assert.equal(message.swipes[1], `${HEADER}\n\n${TAKE_BODY}\n\n${FOOTER}`);
});

test('the commit no longer reads the header off the displayed message', () => {
    const body = sliceFunction('appendUnderstudyTakeAsSwipe');
    assert.doesNotMatch(body, /understudySplitMessage\(message\.mes\)/);
    assert.match(body, /understudySplitMessage\(understudyReadings\(message\)\[sourcePick\]/);
});
