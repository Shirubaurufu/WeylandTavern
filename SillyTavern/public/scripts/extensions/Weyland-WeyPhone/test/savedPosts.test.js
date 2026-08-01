import test from 'node:test';
import assert from 'node:assert/strict';

import { postIdFor, getSaved, isSaved, toggleSaved, unsave, savedIdSet } from '../lib/savedPosts.js';

const chitterPost = { authorName: 'Rosa', handle: '@rosa_thorn', text: 'espresso machine won again', likes: 12, retweets: 2, views: 300 };
const boardItem = { text: 'someone left a whole rotisserie chicken in the 3rd floor study room +47' };

test('postIdFor is stable for identical content and distinct across apps', () => {
    assert.equal(postIdFor('feed', chitterPost), postIdFor('feed', { ...chitterPost, likes: 99 }));
    assert.notEqual(postIdFor('feed', { handle: '@a', text: 'x' }), postIdFor('feed', { handle: '@b', text: 'x' }));
    assert.notEqual(postIdFor('board', boardItem), postIdFor('chat', boardItem));
});

test('postIdFor distinguishes a retweet from the original post', () => {
    const original = { handle: '@rosa_thorn', text: 'espresso' };
    const retweet = { handle: '@rosa_thorn', text: 'espresso', retweetedText: 'the original' };
    assert.notEqual(postIdFor('feed', original), postIdFor('feed', retweet));
});

test('toggleSaved saves then unsaves, newest first', () => {
    const settings = { savedPosts: {} };
    const first = toggleSaved(settings, 'feed', chitterPost, 1000);
    assert.equal(first.saved, true);
    toggleSaved(settings, 'feed', { ...chitterPost, text: 'second post' }, 2000);
    assert.equal(getSaved(settings, 'feed').length, 2);
    assert.equal(getSaved(settings, 'feed')[0].data.text, 'second post');
    const again = toggleSaved(settings, 'feed', chitterPost);
    assert.equal(again.saved, false);
    assert.equal(getSaved(settings, 'feed').length, 1);
});

test('toggleSaved stores a clone — later cache mutation cannot reach the saved copy', () => {
    const settings = { savedPosts: {} };
    const live = { ...chitterPost };
    toggleSaved(settings, 'feed', live);
    live.text = 'mutated';
    assert.equal(getSaved(settings, 'feed')[0].data.text, 'espresso machine won again');
});

test('toggleSaved backfills the savedPosts container on pre-feature settings', () => {
    const settings = {};
    toggleSaved(settings, 'board', boardItem);
    assert.equal(isSaved(settings, 'board', postIdFor('board', boardItem)), true);
});

test('unsave removes by id and reports whether anything was removed', () => {
    const settings = { savedPosts: {} };
    const { id } = toggleSaved(settings, 'chronicle', { text: 'HEADLINE — something happened' });
    assert.equal(unsave(settings, 'chronicle', id), true);
    assert.equal(unsave(settings, 'chronicle', id), false);
    assert.equal(getSaved(settings, 'chronicle').length, 0);
});

test('savedIdSet reflects current saves and is empty on untouched settings', () => {
    const settings = { savedPosts: {} };
    assert.equal(savedIdSet(settings, 'feed').size, 0);
    const { id } = toggleSaved(settings, 'feed', chitterPost);
    assert.deepEqual([...savedIdSet(settings, 'feed')], [id]);
});
