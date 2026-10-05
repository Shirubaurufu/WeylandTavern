import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUnifiedRefresh } from '../lib/unifiedParsing.js';
import { WEYLAND_ROSTER } from '../lib/weylandRoster.js';
import { PSA_ACCOUNTS } from '../lib/twitterPrompts.js';
import { parsePhoneAppOutput } from '../lib/phoneAppFormatting.js';
import { parseTwitterPosts } from '../lib/twitterParsing.js';

const CTX = { roster: WEYLAND_ROSTER, psaAccounts: PSA_ACCOUNTS };

const FULL_RESPONSE = `# APP: CHRONICLE
## WEYLAND ALERTS
- [9:14 AM] Light rain expected through the afternoon; bring an umbrella.

## HEADLINES
- **Council Approves Waterfront Rezoning** After a three-hour session Tuesday, the plan cleared.
- **Rustwood Cafe Extends Hours** The cafe will stay open until midnight during finals week.

# APP: FEED
## FEED
- [@codewolf] shipping a new build tonight, do not perceive me {likes:12 retweets:2 views:340}
- [@courtjester] the vending machine in Sterling ate my dollar AGAIN {likes:31 retweets:4 views:520}

# APP: CHAT
## #announcements
- [10:52 PM] **@luckypaww** — the subbot queue is backed up again, working on it

## #dorm-commons
- [11:01 PM] **@siwwykitty** — who left a pizza in the third floor microwave
- [11:02 PM] **@codewolf** — not me but now i want pizza

# APP: BOARD
## BOARD
- to whoever keeps practicing trombone at 2am: you are improving and I hate it +47
- lost a silver ring near the observatory, sentimental value, no questions +12
`;

test('parseUnifiedRefresh splits a well-formed 4-app response', () => {
    const { apps, failures } = parseUnifiedRefresh(FULL_RESPONSE, CTX);
    assert.deepEqual(failures, []);
    assert.deepEqual(Object.keys(apps).sort(), ['board', 'chat', 'chronicle', 'feed']);
    assert.equal(apps.chronicle.sections.length, 2);
    assert.equal(apps.chronicle.sections[0].title, 'WEYLAND ALERTS');
    assert.equal(apps.feed.posts.length, 2);
    assert.equal(apps.chat.sections.length, 2);
    assert.equal(apps.chat.sections[0].title, '#announcements');
    assert.equal(apps.board.sections[0].items.length, 2);
});

test('parseUnifiedRefresh delegation matches direct per-app parser output', () => {
    const { apps } = parseUnifiedRefresh(FULL_RESPONSE, CTX);
    const chronicleChunk = FULL_RESPONSE.split('# APP: FEED')[0].replace('# APP: CHRONICLE', '');
    assert.deepEqual(apps.chronicle, parsePhoneAppOutput(chronicleChunk));
    const feedChunk = FULL_RESPONSE.split('# APP: FEED')[1].split('# APP: CHAT')[0];
    assert.deepEqual(apps.feed, parseTwitterPosts(feedChunk, CTX));
});

test('parseUnifiedRefresh reports missing apps as failures and keeps the rest', () => {
    const partial = FULL_RESPONSE.split('# APP: CHAT')[0]; // only chronicle + feed
    const { apps, failures } = parseUnifiedRefresh(partial, CTX);
    assert.deepEqual(Object.keys(apps).sort(), ['chronicle', 'feed']);
    assert.deepEqual(failures.sort(), ['board', 'chat']);
});

test('parseUnifiedRefresh tolerates marker drift (## APP: name, dash separator, mixed case)', () => {
    const drifted = FULL_RESPONSE
        .replace('# APP: CHRONICLE', '## APP: Chronicle')
        .replace('# APP: FEED', '# APP - FEED')
        .replace('# APP: CHAT', '#APP: chat')
        .replace('# APP: BOARD', '# App: Board');
    const { apps, failures } = parseUnifiedRefresh(drifted, CTX);
    assert.deepEqual(failures, []);
    assert.deepEqual(Object.keys(apps).sort(), ['board', 'chat', 'chronicle', 'feed']);
});

test('parseUnifiedRefresh discards unknown app names', () => {
    const withUnknown = `${FULL_RESPONSE}\n# APP: WEATHER\n## WEATHER\n- sunny tomorrow\n`;
    const { apps, failures } = parseUnifiedRefresh(withUnknown, CTX);
    assert.deepEqual(failures, []);
    assert.equal('weather' in apps, false);
    assert.deepEqual(Object.keys(apps).sort(), ['board', 'chat', 'chronicle', 'feed']);
});

test('parseUnifiedRefresh keeps the first usable chunk when a marker repeats', () => {
    const doubled = `${FULL_RESPONSE}\n# APP: BOARD\n## BOARD\n- a second board chunk that should be ignored +1\n`;
    const { apps } = parseUnifiedRefresh(doubled, CTX);
    assert.equal(apps.board.sections[0].items.length, 2);
    assert.match(apps.board.sections[0].items[0].text, /trombone/);
});

test('parseUnifiedRefresh strips echoed roster/PSA grounding sections from chunks', () => {
    const echoed = FULL_RESPONSE.replace('# APP: FEED', `## WEYLAND ROSTER (grounding)
- Ava [@courtjester] chaotic theater kid

# APP: FEED`);
    const { apps } = parseUnifiedRefresh(echoed, CTX);
    assert.ok(apps.chronicle.sections.every(s => !/WEYLAND ROSTER/i.test(s.title)));
});

test('parseUnifiedRefresh rescue pass classifies sections when no APP markers exist', () => {
    const noMarkers = FULL_RESPONSE.replace(/^# APP: [A-Z]+\n/gm, '');
    const { apps, failures } = parseUnifiedRefresh(noMarkers, CTX);
    assert.ok(apps.chronicle, 'chronicle rescued');
    assert.equal(apps.chronicle.sections.length, 2);
    assert.ok(apps.chat, 'chat rescued via #channel headers');
    assert.ok(apps.board, 'board rescued');
    assert.ok(apps.feed, 'feed rescued via ## FEED slice');
    assert.equal(apps.feed.posts.length, 2);
    assert.deepEqual(failures, []);
});

test('parseUnifiedRefresh returns all-failures on garbage and empty input', () => {
    for (const input of ['', null, undefined, 'total nonsense with no structure at all']) {
        const { apps, failures } = parseUnifiedRefresh(input, CTX);
        assert.deepEqual(apps, {});
        assert.deepEqual(failures.sort(), ['board', 'chat', 'chronicle', 'feed']);
    }
});

test('parseUnifiedRefresh treats an empty chunk under a valid marker as a failure for that app', () => {
    const emptyChat = FULL_RESPONSE.replace(/# APP: CHAT[\s\S]*?# APP: BOARD/, '# APP: CHAT\n\n# APP: BOARD');
    const { apps, failures } = parseUnifiedRefresh(emptyChat, CTX);
    assert.deepEqual(failures, ['chat']);
    assert.ok(apps.chronicle && apps.feed && apps.board);
});
