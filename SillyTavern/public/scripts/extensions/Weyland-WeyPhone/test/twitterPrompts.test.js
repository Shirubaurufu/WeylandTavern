// test/twitterPrompts.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTwitterPrompt, PSA_ACCOUNTS } from '../lib/twitterPrompts.js';

test('PSA_ACCOUNTS includes Mama\'s Den while excluding Red Lantern and Black Barrel', () => {
    assert.equal(PSA_ACCOUNTS.length, 12);
    const names = PSA_ACCOUNTS.map(a => a.name);
    assert.ok(names.includes('Weyland Alert'));
    assert.ok(names.includes('Kodo Bowl'));
    assert.ok(names.includes('Weyland Dining Services'));
    assert.ok(names.includes('Weyland Research Center'));
    assert.ok(names.includes('Weyland Tavern'));
    assert.ok(!names.includes('Red Lantern'));
    assert.ok(!names.includes('Black Barrel'));
    assert.ok(names.includes("Mama's Den"));
});

test('Mama\'s Den is grounded as Zora\'s badly managed and profane social account', () => {
    const mamas = PSA_ACCOUNTS.find(a => a.name === "Mama's Den");
    assert.equal(mamas.handle, '@MamasDen');
    assert.match(mamas.context, /Zora Adeyemi/i);
    assert.match(mamas.context, /crude|profane/i);
});

test('every PSA account has a unique, non-empty portraitKey', () => {
    const keys = PSA_ACCOUNTS.map(a => a.portraitKey);
    assert.ok(keys.every(k => typeof k === 'string' && k.length > 0));
    assert.equal(new Set(keys).size, keys.length, 'portraitKeys must be unique — collisions would mix up profile pictures');
});

test('Weyland Dining Services carries an explicit grounding context (no standalone World Info entry of its own)', () => {
    const dining = PSA_ACCOUNTS.find(a => a.name === 'Weyland Dining Services');
    assert.ok(dining.context);
    assert.match(dining.context, /Brodlak/);
    assert.match(dining.context, /Kyomi/);
});

test('Weyland Research Center and Weyland Tavern have no hardcoded context (rely on their own real World Info entries)', () => {
    const research = PSA_ACCOUNTS.find(a => a.name === 'Weyland Research Center');
    const tavern = PSA_ACCOUNTS.find(a => a.name === 'Weyland Tavern');
    assert.equal(research.context, undefined);
    assert.equal(tavern.context, undefined);
});

test('buildTwitterPrompt feed mode includes the full roster and PSA accounts, including the new Dining Services context sentence', () => {
    const prompt = buildTwitterPrompt({ mode: 'feed' });
    assert.match(prompt, /## FEED/);
    assert.ok(prompt.includes('Blake [@codewolf]'));
    assert.ok(prompt.includes('Weyland Alert [@WeylandAlert]'));
    assert.ok(prompt.includes('Weyland Dining Services [@WeylandDining] — the university office that runs the Brodlak and Kyomi dining halls'));
});

// Regression test: {{random::2::3::4}} must appear exactly once in the feed prompt. ST's macro
// engine resolves each occurrence of {{random::...}} independently — writing it a second time
// (e.g. in a header restating the count) would risk two DIFFERENT numbers in one prompt, an
// internally contradictory instruction.
test('buildTwitterPrompt feed mode uses the {{random::2::3::4}} macro for the PSA post count exactly once', () => {
    const prompt = buildTwitterPrompt({ mode: 'feed' });
    const occurrences = prompt.match(/\{\{random::2::3::4\}\}/g) ?? [];
    assert.equal(occurrences.length, 1);
    assert.match(prompt, /Exactly \{\{random::2::3::4\}\} of the posts.*MUST be from PSA\/business accounts/s);
});

test('buildTwitterPrompt profile mode scopes to exactly one character', () => {
    const character = { name: 'Blake', handle: '@codewolf', bio: '- Punk wolfgirl, computer science major' };
    const prompt = buildTwitterPrompt({ mode: 'profile', character });
    assert.match(prompt, /## POSTS/);
    assert.ok(prompt.includes('Blake [@codewolf]'));
    assert.ok(prompt.includes('- Punk wolfgirl, computer science major'));
    assert.doesNotMatch(prompt, /Kai \[@breakingthecycle\]/);
    assert.doesNotMatch(prompt, /Weyland Alert/);
});

test('buildTwitterPrompt profile mode requests a "## BIO" section for a roster character', () => {
    const character = { name: 'Blake', handle: '@codewolf', bio: '- test bio' };
    const prompt = buildTwitterPrompt({ mode: 'profile', character });
    assert.match(prompt, /## BIO/);
    assert.match(prompt, /under 100 characters/i);
});

test('buildTwitterPrompt profile mode works for a PSA account with an explicit context sentence (Dining Services)', () => {
    const dining = PSA_ACCOUNTS.find(a => a.name === 'Weyland Dining Services');
    const prompt = buildTwitterPrompt({ mode: 'profile', character: dining });
    assert.match(prompt, /## BIO/);
    assert.match(prompt, /## POSTS/);
    assert.ok(prompt.includes('Weyland Dining Services [@WeylandDining] — the university office that runs the Brodlak and Kyomi dining halls'));
    assert.doesNotMatch(prompt, /Blake \[@codewolf\]/);
});

test('buildTwitterPrompt profile mode works for a PSA account with no context (relies on name/handle alone)', () => {
    const tavern = PSA_ACCOUNTS.find(a => a.name === 'Weyland Tavern');
    const prompt = buildTwitterPrompt({ mode: 'profile', character: tavern });
    assert.ok(prompt.includes('Weyland Tavern [@WeylandTavern]'));
    assert.match(prompt, /## POSTS/);
});

test('buildTwitterPrompt profile mode mentions retweets are acceptable', () => {
    const character = { name: 'Blake', handle: '@codewolf', bio: '- test bio' };
    const prompt = buildTwitterPrompt({ mode: 'profile', character });
    assert.match(prompt, /retweet/i);
});

test('buildTwitterPrompt feed mode instructs the stat-block format', () => {
    const prompt = buildTwitterPrompt({ mode: 'feed' });
    assert.match(prompt, /\{likes:N retweets:N views:N\}/);
    assert.match(prompt, /standalone posts/i);
});

test('buildTwitterPrompt profile mode instructs the stat-block format and standalone-posts flavor', () => {
    const character = { name: 'Blake', handle: '@codewolf', bio: '- test bio' };
    const prompt = buildTwitterPrompt({ mode: 'profile', character });
    assert.match(prompt, /\{likes:N retweets:N views:N\}/);
    assert.match(prompt, /standalone posts/i);
});

test('buildTwitterPrompt does not contain the old contradicting retweet-format instruction, in either mode', () => {
    const feedPrompt = buildTwitterPrompt({ mode: 'feed' });
    const character = { name: 'Blake', handle: '@codewolf', bio: '- test bio' };
    const profilePrompt = buildTwitterPrompt({ mode: 'profile', character });
    assert.doesNotMatch(feedPrompt, /no special formatting needed/i);
    assert.doesNotMatch(profilePrompt, /no special formatting needed/i);
});

// Regression coverage for cross-app subject-matter bleed: each of Discord/Yik Yak/Twitter now
// discourages the OTHER two's dominant subject matter, described by content type rather than app
// name (prompts aren't aware of each other or of other social apps, so no app is ever named here).
test('buildTwitterPrompt feed and profile modes discourage live-chat-thread and anonymous-confession subject matter, without naming another app', () => {
    const feedPrompt = buildTwitterPrompt({ mode: 'feed' });
    const character = { name: 'Blake', handle: '@codewolf', bio: '- test bio' };
    const profilePrompt = buildTwitterPrompt({ mode: 'profile', character });
    for (const prompt of [feedPrompt, profilePrompt]) {
        assert.match(prompt, /avoid writing these like a live group-chat reply thread/i);
        assert.match(prompt, /anonymous-sounding confession or explicit rant/i);
        assert.doesNotMatch(prompt, /Yik Yak|Discord|Chronicle/);
    }
});
