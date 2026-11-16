// "provider circuit breaker is open" (2026-11-15): the model tripped too many errors or limits in a short window and
// the provider benched it for a cooldown. PromptOS's error guide has a card for it, and the Chat Completion toast
// keeps the provider's words and title but taps through to that card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_HELP_EVENT, showChatCompletionError, whenErrorGuideReady, findGuideArticle } from '../../../weyland-error-notice.js';
import { getErrorHelpCard, searchErrorHelp } from '../lib/errorHelpCatalog.js';
import { renderErrorHelpScreen } from '../lib/ui/apps/errorHelp.js';

const RAW = 'provider circuit breaker is open';

test('the raw text, with or without a status code in front, finds only the circuit breaker card', () => {
    for (const query of [RAW, 'Provider Circuit Breaker Is Open', `503 ${RAW}`, `429 Too Many Requests: ${RAW}`,
        `Chat Completion API: ${RAW} for model claude-sonnet-5-5`, 'circuit_breaker_open', 'circuit breaker']) {
        assert.deepEqual(searchErrorHelp(query).map(card => card.id), ['circuit-breaker'], query);
    }
    // Looser search words still reach it, next to whatever else matches.
    assert.ok(searchErrorHelp('cooldown').some(card => card.id === 'circuit-breaker'));
});

test('the card tells players to wait or switch models, in plain words', () => {
    const card = getErrorHelpCard('circuit-breaker');
    assert.equal(card.group, 'API key and account');
    assert.deepEqual(card.steps.map(step => step.title), ['Give it a few minutes', 'Or switch to another model for now', "Check WeyPhone's model too"]);
    const text = JSON.stringify(card);
    assert.match(text, /cooldown/);
    assert.match(text, /errors, or hit its usage limits/);
    assert.match(text, /isn't your key/);
    assert.doesNotMatch(text, /[–—]/, 'no em dashes');
    for (const id of card.related) assert.ok(getErrorHelpCard(id), `related card ${id} exists`);
    const target = { innerHTML: '' };
    renderErrorHelpScreen(target, { articleId: 'circuit-breaker' });
    assert.match(target.innerHTML, /Provider Circuit Breaker Is Open/);
    assert.match(target.innerHTML, /provider circuit breaker is open/);
});

test('the Chat Completion toast keeps its words and title and opens the card', async () => {
    await whenErrorGuideReady();
    assert.equal(findGuideArticle(`503 ${RAW}`), 'circuit-breaker', 'beats the generic 503 card');
    const saved = { toastr: globalThis.toastr, document: globalThis.document, CustomEvent: globalThis.CustomEvent };
    const calls = [], events = [];
    try {
        globalThis.document = { dispatchEvent: event => events.push(event) };
        globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
        globalThis.toastr = { error: (body, title, options) => { calls.push({ body, title, options }); return {}; } };
        showChatCompletionError(RAW);
        // The title is what Weyland-Router keys on ('chat completion api'), so Router users still fail over at once.
        assert.equal(calls[0].title, 'Chat Completion API');
        assert.equal(calls[0].body, `${RAW}<br><br>Tap for more info.`);
        calls[0].options.onclick();
        assert.equal(events[0].type, ERROR_HELP_EVENT);
        assert.deepEqual(events[0].detail, { articleId: 'circuit-breaker' });
    } finally {
        for (const [name, value] of Object.entries(saved)) {
            if (value === undefined) delete globalThis[name];
            else globalThis[name] = value;
        }
    }
});
