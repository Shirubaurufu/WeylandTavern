// The shared community daily limit ("rpd limit"): the rewritten toast, the PromptOS card, and the two
// places that must keep recognizing it (openai.js's error toasts and Weyland-Router's failover).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    ERROR_HELP_EVENT, COMMUNITY_MODEL_LIMIT_TITLE, COMMUNITY_MODEL_LIMIT_BODY, COMMUNITY_MODEL_LIMIT_ARTICLE,
    showChatCompletionError,
} from '../../../weyland-error-notice.js';
import { getErrorHelpCard, searchErrorHelp } from '../lib/errorHelpCatalog.js';
import { renderErrorHelpScreen } from '../lib/ui/apps/errorHelp.js';

// The real toast a player got on 2026-10-17 (Sonnet 4.5's 2,000 a day ran out).
const RAW = 'rate limit exceeded: key=rl:usr:245aa5fa-c307-4f05-9d31-36492fb97d0a:grp:beta:rpd limit=2000';
// HelixMind's rewording of the same limit (2026-10-18).
const RAW_V2 = 'model group "beta" daily request limit exceeded (2000 requests per 24 hours). Try again in 2 seconds.';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');

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

test('the daily limit toast uses Lucky\'s wording, hides the raw code and opens its help card', () => {
    withStubs((calls, events) => {
        for (const message of [RAW, RAW_V2, 'Model group "alpha" daily request limit exceeded (500 requests per 24 hours)', 'RPD LIMIT=500', 'rpd\nlimit = 0', 'rpd limit']) {
            showChatCompletionError(message);
            const shown = calls.at(-1);
            assert.equal(shown.title, 'Community Model Maxed Out');
            assert.equal(shown.body, 'This model is shared across the community and has reached its maximum usage for the day.<br><br>Please swap to another model. You may try this model again in a few hours.<br><br>Tap this message for more information.');
            assert.doesNotMatch(shown.body, /rl:usr|grp:|limit=/);
            assert.equal(shown.options.preventDuplicates, true);
        }
        calls[0].options.onclick();
        assert.equal(events[0].type, ERROR_HELP_EVENT);
        assert.deepEqual(events[0].detail, { articleId: COMMUNITY_MODEL_LIMIT_ARTICLE });
    });
});

test('every other API error keeps its own words and title', () => {
    withStubs(calls => {
        for (const message of ['rate limit exceeded: rpm limit=20', '429 Too Many Requests', 'insufficient_quota', 'not_rpd limit=2000', 'rpd limitless', 'daily request limit exceeded for your key', null]) {
            showChatCompletionError(message, 'API returned an error');
            assert.equal(calls.at(-1).body, message);
            assert.equal(calls.at(-1).title, 'API returned an error');
            assert.equal(calls.at(-1).options, undefined);
        }
        showChatCompletionError('Bad Gateway');
        assert.equal(calls.at(-1).title, 'Chat Completion API');
    });
});

test('openai.js sends every chat-completion error toast through the notice', () => {
    const source = read('../../../openai.js');
    assert.match(source, /import \{ showChatCompletionError \} from '\.\/weyland-error-notice\.js';/);
    assert.doesNotMatch(source, /toastr\.error\([^\n]*'Chat Completion API'\)/, 'a raw Chat Completion API toast would skip the rewrite');
    assert.doesNotMatch(source, /toastr\.error\(message, t`API returned an error`\)/);
    assert.equal(source.match(/showChatCompletionError\(/g)?.length, 3);
});

test('Weyland-Router still treats the rewritten toast as an API failure and rolls the next model', () => {
    const source = read('../../../../../data/default-user/extensions/Weyland-Router/index.js');
    const patterns = source.slice(source.indexOf('const API_ERROR_PATTERNS = ['), source.indexOf('];', source.indexOf('const API_ERROR_PATTERNS = [')));
    assert.ok(patterns.includes(`'${COMMUNITY_MODEL_LIMIT_TITLE.toLowerCase()}'`), 'the Router would wait for its timeout instead of failing over');
});

test('PromptOS finds the card from the raw error or the new toast, ahead of the generic 429 card', () => {
    for (const query of [RAW, RAW_V2, `429 Too Many Requests: ${RAW}`, COMMUNITY_MODEL_LIMIT_TITLE, `${COMMUNITY_MODEL_LIMIT_TITLE}\n${COMMUNITY_MODEL_LIMIT_BODY}`]) {
        assert.equal(searchErrorHelp(query)[0]?.id, COMMUNITY_MODEL_LIMIT_ARTICLE, query);
    }
    assert.deepEqual(searchErrorHelp('429 Too Many Requests').map(card => card.id), ['rate']);
    const card = getErrorHelpCard(COMMUNITY_MODEL_LIMIT_ARTICLE);
    assert.equal(card.title, COMMUNITY_MODEL_LIMIT_TITLE);
    assert.ok(getErrorHelpCard('rate').related.includes(COMMUNITY_MODEL_LIMIT_ARTICLE));
    // Lucky's call: the card must never read as "keep trying".
    const copy = JSON.stringify(card).toLowerCase();
    assert.doesNotMatch(copy, /reroll (?:once|again)|try again (?:in a minute|right away)/);
    const target = { innerHTML: '' };
    renderErrorHelpScreen(target, { articleId: card.id });
    assert.ok(target.innerHTML.includes('rolling 24 hours'));
});
