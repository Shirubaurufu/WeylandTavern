import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleLike } from '../lib/twitterLikes.js';

const CONTENT = { posts: [
    { text: 'a', likes: 5 },
    { text: 'b', likes: 0 },
] };

test('first tap likes (+1, liked flag), second tap unlikes (-1)', () => {
    const liked = toggleLike(CONTENT, 0);
    assert.equal(liked.posts[0].likes, 6);
    assert.equal(liked.posts[0].liked, true);
    const unliked = toggleLike(liked, 0);
    assert.equal(unliked.posts[0].likes, 5);
    assert.equal(unliked.posts[0].liked, false);
});

test('never mutates input and leaves other posts untouched', () => {
    const result = toggleLike(CONTENT, 0);
    assert.equal(CONTENT.posts[0].likes, 5);
    assert.equal(CONTENT.posts[0].liked, undefined);
    assert.equal(result.posts[1], CONTENT.posts[1]);
});

test('likes never go negative and bad indices are no-ops', () => {
    const zero = toggleLike(toggleLike({ posts: [{ text: 'x', likes: 0, liked: true }] }, 0), -1);
    assert.equal(zero.posts[0].likes, 0);
    assert.equal(toggleLike(CONTENT, 99), CONTENT);
    assert.equal(toggleLike({ }, 0).posts, undefined);
});
