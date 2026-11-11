// HelixMind's generic "provider rejected the request" error (2026-10-18): the rewritten toast, its PromptOS card,
// and the tap-through that every other guide-covered Chat Completion error now gets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ERROR_HELP_EVENT, REQUEST_REJECTED_ARTICLE, REQUEST_REJECTED_BODY, showChatCompletionError, whenErrorGuideReady, findGuideArticle,
} from '../../../weyland-error-notice.js';
import { ERROR_HELP_CARDS, getErrorHelpCard, searchErrorHelp } from '../lib/errorHelpCatalog.js';

const RAW = 'provider rejected the request; contact support with the request id';
const TAP = '<br><br>Tap for more info.';

function withStubs(run) {
    const saved = { toastr: globalThis.toastr, document: globalThis.document, CustomEvent: globalThis.CustomEvent };
    const calls = [], events = [];
    try {
        globalThis.document = { dispatchEvent: event => events.push(event) };
        globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
        globalThis.toastr = { error: (body, title, options) => { calls.push({ body, title, options }); return {}; } };
        run(calls, events);
    } finally {
        for (const [name, value] of Object.entries(saved)) {
            if (value === undefined) delete globalThis[name];
            else globalThis[name] = value;
        }
    }
}

test('the generic rejection shows Lucky\'s wording, keeps the Chat Completion title and hides the request id text', () => {
    withStubs((calls, events) => {
        for (const message of [RAW, `Provider rejected the request; contact support with the request id: req_9f3a`]) {
            showChatCompletionError(message);
            const shown = calls.at(-1);
            assert.equal(shown.title, 'Chat Completion API');
            assert.equal(shown.body, `Request rejected:<br>Provider is down or a filter rejected your content.${TAP}`);
            assert.doesNotMatch(shown.body, /support|request id|req_/i);
        }
        // The title is what Weyland-Router keys on, so it must survive the other call site's wording too.
        showChatCompletionError(RAW, 'API returned an error');
        assert.equal(calls.at(-1).title, 'API returned an error');
        calls[0].options.onclick();
        assert.equal(events[0].type, ERROR_HELP_EVENT);
        assert.deepEqual(events[0].detail, { articleId: REQUEST_REJECTED_ARTICLE });
    });
    assert.equal(REQUEST_REJECTED_BODY, 'Request rejected:<br>Provider is down or a filter rejected your content.');
});

test('PromptOS finds the card from the raw message or the toast, ahead of the generic 500 and filter cards', () => {
    for (const query of [RAW, 'Request rejected: Provider is down or a filter rejected your content.', `500 ${RAW}`]) {
        assert.equal(searchErrorHelp(query)[0]?.id, REQUEST_REJECTED_ARTICLE, query);
    }
    const card = getErrorHelpCard(REQUEST_REJECTED_ARTICLE);
    assert.equal(card.group, 'Replies');
    // Lucky's steps, in his order.
    assert.deepEqual(card.steps.map(step => step.title), [
        'Reroll once',
        'Still rejected? Switch models',
        'Try the original model again in an hour or two',
        'Think the content itself is tripping a filter? Test it',
    ]);
    const text = JSON.stringify(card);
    assert.match(text, /Rerolling more won't help/);
    assert.match(text, /10 to 15 minutes/);
    assert.match(text, /swap chats/);
    assert.doesNotMatch(text, /—/, 'no em dashes in guide copy');
    for (const id of card.related) assert.ok(getErrorHelpCard(id), `related card ${id} exists`);
});

test('other guide-covered Chat Completion errors keep their words and title, escaped, and open their card', async () => {
    await whenErrorGuideReady();
    withStubs((calls, events) => {
        showChatCompletionError('429 Too Many Requests', 'API returned an error');
        let shown = calls.at(-1);
        assert.equal(shown.title, 'API returned an error');
        assert.equal(shown.body, `429 Too Many Requests${TAP}`);
        shown.options.onclick();
        assert.deepEqual(events.at(-1).detail, { articleId: 'rate' });

        // Provider text is shown as text, never as markup.
        showChatCompletionError('insufficient_quota <img src=x onerror=alert(1)>');
        shown = calls.at(-1);
        assert.match(shown.body, /^insufficient_quota &lt;img src=x onerror=alert\(1\)&gt;<br><br>Tap for more info\.$/);
        assert.equal(shown.title, 'Chat Completion API');
        shown.options.onclick();
        assert.deepEqual(events.at(-1).detail, { articleId: 'credits' });
    });
});

test('only the guide groups for Chat Completion errors link out, and unknown errors stay plain toasts', async () => {
    await whenErrorGuideReady();
    assert.equal(findGuideArticle('WeyPhone could not save'), null, 'a WeyPhone card is not a Chat Completion error');
    assert.equal(findGuideArticle('The upstream said hmm'), null);
    assert.equal(findGuideArticle(null), null);
    assert.equal(findGuideArticle('see https://example.com:500/path'), null, 'a number inside a URL is not an error code');
    withStubs(calls => {
        showChatCompletionError('The upstream said hmm', 'API returned an error');
        assert.deepEqual(calls.at(-1), { body: 'The upstream said hmm', title: 'API returned an error', options: undefined });
    });
    // Every card a toast can link to really exists, so a tap never opens nothing.
    for (const card of ERROR_HELP_CARDS) assert.ok(card.id && card.title, card.id);
});
