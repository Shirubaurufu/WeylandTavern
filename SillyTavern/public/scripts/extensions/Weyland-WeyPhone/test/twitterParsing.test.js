// test/twitterParsing.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTwitterPosts } from '../lib/twitterParsing.js';

const ROSTER = [
    { name: 'Blake', handle: '@codewolf', bio: '' },
    { name: 'Hannah', handle: '@breadmakerhannah', bio: '' },
    { name: 'Ava', handle: '@AvasArcticFox', bio: '' },
];
const PSA_ACCOUNTS = [{ name: 'Weyland Alert', handle: '@WeylandAlert' }];

test('parseTwitterPosts extracts a profile-mode "## BIO" section as bio, separate from posts', () => {
    const raw = `## BIO
Professional bug-fixer, amateur chaos-generator.

## POSTS
- [@codewolf] just shipped a bug fix at 3am {likes:12 retweets:2 views:340}`;
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.bio, 'Professional bug-fixer, amateur chaos-generator.');
    assert.equal(result.posts.length, 1);
});

test('parseTwitterPosts strips markdown emphasis from the bio and returns null when no "## BIO" section is present', () => {
    const withBoldBio = parseTwitterPosts('## BIO\n**official** account, do not @ me\n\n## POSTS\n', { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(withBoldBio.bio, 'official account, do not @ me');

    const feedModeOutput = parseTwitterPosts('## FEED\n- [@codewolf] hi {likes:1 retweets:0 views:5}', { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(feedModeOutput.bio, null);
});

test('parseTwitterPosts extracts a normal post with real stats', () => {
    const raw = '- [@codewolf] just shipped a bug fix at 3am {likes:12 retweets:2 views:340}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts.length, 1);
    assert.deepEqual(result.posts[0], {
        authorName: 'Blake', handle: '@codewolf', text: 'just shipped a bug fix at 3am',
        likes: 12, retweets: 2, views: 340, isRetweet: false,
    });
});

test('parseTwitterPosts resolves a PSA account by handle', () => {
    const raw = '- [@WeylandAlert] Water main repair on Elm St, expect delays {likes:3 retweets:5 views:900}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts[0].authorName, 'Weyland Alert');
});

test('parseTwitterPosts resolves roster handles case-insensitively and restores canonical spelling', () => {
    const raw = '- [@BreadMakerHannah] shift 3 of 4 {likes:34 retweets:2 views:601}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts[0].authorName, 'Hannah');
    assert.equal(result.posts[0].handle, '@breadmakerhannah');
});

test('parseTwitterPosts case-folds handles whose canonical roster spelling contains capitals', () => {
    const raw = '- [@avasarcticfox] the snow is finally sticking {likes:8 retweets:1 views:90}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts[0].authorName, 'Ava');
    assert.equal(result.posts[0].handle, '@AvasArcticFox');
});

test('parseTwitterPosts resolves PSA handles case-insensitively', () => {
    const raw = '- [@weylandalert] Campus closed for weather {likes:3 retweets:5 views:900}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts[0].authorName, 'Weyland Alert');
    assert.equal(result.posts[0].handle, '@WeylandAlert');
});

test('parseTwitterPosts falls back to the bare handle for an unrecognized poster', () => {
    const raw = '- [@randomstudent99] first day jitters {likes:4 retweets:0 views:60}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts[0].authorName, 'randomstudent99');
});

test('parseTwitterPosts extracts a retweet with the original poster and text separated out', () => {
    const raw = '- [@codewolf] 🔁 Retweeted from @courtjester: volleyball practice was brutal today {likes:6 retweets:1 views:200}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    const post = result.posts[0];
    assert.equal(post.isRetweet, true);
    assert.equal(post.retweetedFrom, '@courtjester');
    assert.equal(post.retweetedText, 'volleyball practice was brutal today');
    assert.equal(post.text, '');
    assert.equal(post.likes, 6);
});

test('parseTwitterPosts skips unparseable lines gracefully, never throws', () => {
    const raw = 'not a real post line\n## FEED\n- [@codewolf] real post {likes:1 retweets:0 views:10}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts.length, 1);
});

test('parseTwitterPosts returns empty posts (and a null bio) for empty/garbage/non-string input', () => {
    assert.deepEqual(parseTwitterPosts('', { roster: ROSTER, psaAccounts: PSA_ACCOUNTS }), { posts: [], bio: null });
    assert.deepEqual(parseTwitterPosts(null, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS }), { posts: [], bio: null });
    assert.deepEqual(parseTwitterPosts('garbage text with no structure', { roster: ROSTER, psaAccounts: PSA_ACCOUNTS }), { posts: [], bio: null });
});

// Regression tests for POST_LINE_RE being too strict: the original regex required the stat block
// to be exactly "{likes:N retweets:N views:N}" with nothing but trailing whitespace, so any
// plausible model deviation (comma-formatted numbers, a stream-truncated stat block) caused the
// WHOLE post to silently vanish instead of just its stats defaulting.
test('parseTwitterPosts handles comma-formatted stat numbers', () => {
    const raw = '- [@codewolf] this one went viral somehow {likes:1,204 retweets:87 views:15,600}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts.length, 1);
    assert.deepEqual(
        { likes: result.posts[0].likes, retweets: result.posts[0].retweets, views: result.posts[0].views },
        { likes: 1204, retweets: 87, views: 15600 },
    );
    assert.equal(result.posts[0].text, 'this one went viral somehow');
});

test('parseTwitterPosts still parses the post when the stat block is truncated (missing closing brace/fields), defaulting missing stats to 0', () => {
    const raw = '- [@codewolf] stream got cut off right here {likes:12 retweets:3';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts.length, 1);
    assert.deepEqual(
        { likes: result.posts[0].likes, retweets: result.posts[0].retweets, views: result.posts[0].views },
        { likes: 12, retweets: 3, views: 0 },
    );
    assert.equal(result.posts[0].text, 'stream got cut off right here');
});

test('parseTwitterPosts still parses the post when the stat block is entirely missing, defaulting all stats to 0', () => {
    const raw = '- [@codewolf] no stat block at all on this one';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts.length, 1);
    assert.deepEqual(
        { likes: result.posts[0].likes, retweets: result.posts[0].retweets, views: result.posts[0].views },
        { likes: 0, retweets: 0, views: 0 },
    );
    assert.equal(result.posts[0].text, 'no stat block at all on this one');
});

test('parseTwitterPosts still parses a well-formed post with an exact stat block (no regression)', () => {
    const raw = '- [@codewolf] just shipped a bug fix at 3am {likes:12 retweets:2 views:340}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.deepEqual(result.posts[0], {
        authorName: 'Blake', handle: '@codewolf', text: 'just shipped a bug fix at 3am',
        likes: 12, retweets: 2, views: 340, isRetweet: false,
    });
});

// Regression test: real captured Discord output shows the model wrapping usernames in
// "**bold**" despite the "plain markdown only" instruction (see phoneAppFormatting.js's
// stripMarkdownEmphasis) — twitterPrompts.js issues the identical instruction, so the same
// deviation is plausible here and previously leaked raw "**" straight into parsed post text.
test('parseTwitterPosts strips markdown emphasis markers from post text', () => {
    const raw = '- [@codewolf] **huge** announcement about the new dorm wifi {likes:5 retweets:1 views:88}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts[0].text, 'huge announcement about the new dorm wifi');
    assert.doesNotMatch(result.posts[0].text, /\*\*/);
});

test('parseTwitterPosts strips markdown emphasis markers from retweeted text', () => {
    const raw = '- [@codewolf] 🔁 Retweeted from @courtjester: **volleyball** practice was brutal today {likes:6 retweets:1 views:200}';
    const result = parseTwitterPosts(raw, { roster: ROSTER, psaAccounts: PSA_ACCOUNTS });
    assert.equal(result.posts[0].retweetedText, 'volleyball practice was brutal today');
    assert.doesNotMatch(result.posts[0].retweetedText, /\*\*/);
});
