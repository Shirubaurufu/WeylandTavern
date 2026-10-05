import test from 'node:test';
import assert from 'node:assert/strict';
import { DISCORGI_CHANNELS, allowedDiscorgiChannels, selectDiscorgiChannels } from '../lib/discorgiChannels.js';

test('Discorgi directory contains the nine approved real channels with literal hashes', () => {
    assert.deepEqual(DISCORGI_CHANNELS.map(channel => channel.name), [
        '#student-art-guild',
        '#nsfw-lounge',
        '#dorm-commons',
        '#black-barrel-bar',
        '#weyland-lore-chat',
        '#paw-patrol-chat',
        '#cairos-esports-cafe',
        '#mikas-music-studio',
        '#fur-hall',
    ]);
    for (const channel of DISCORGI_CHANNELS) {
        assert.match(channel.name, /^#[a-z0-9-]+$/);
        assert.ok(channel.description.length > 20);
    }
});

test('Discorgi channel selection returns one or two distinct allowlisted channels', () => {
    const one = selectDiscorgiChannels(() => 0);
    const two = selectDiscorgiChannels(() => 0.9);
    assert.equal(one.length, 1);
    assert.equal(two.length, 2);
    assert.equal(new Set(two.map(channel => channel.name)).size, 2);
    for (const channel of [...one, ...two]) assert.ok(DISCORGI_CHANNELS.includes(channel));
});

test('every Discorgi channel has a short user-facing blurb for the settings screen', () => {
    for (const channel of DISCORGI_CHANNELS) {
        assert.equal(typeof channel.blurb, 'string');
        assert.ok(channel.blurb.length > 10 && channel.blurb.length < 80, `${channel.name} blurb length`);
    }
});

test('allowed Discorgi pool drops excluded channels, ignores unknown names, and never goes empty', () => {
    const allowed = allowedDiscorgiChannels(['#nsfw-lounge', '#not-a-channel']).map(channel => channel.name);
    assert.equal(allowed.length, DISCORGI_CHANNELS.length - 1);
    assert.ok(!allowed.includes('#nsfw-lounge'));
    assert.equal(allowedDiscorgiChannels(DISCORGI_CHANNELS.map(channel => channel.name)).length, DISCORGI_CHANNELS.length);
    assert.equal(allowedDiscorgiChannels(undefined).length, DISCORGI_CHANNELS.length);
});

test('Discorgi selection only rolls from the allowed pool, and a pool of one yields that one', () => {
    const excluded = DISCORGI_CHANNELS.map(channel => channel.name).filter(name => name !== '#fur-hall');
    for (const random of [() => 0, () => 0.5, () => 0.99]) {
        assert.deepEqual(selectDiscorgiChannels(random, excluded).map(channel => channel.name), ['#fur-hall']);
    }
    const pair = ['#dorm-commons', '#paw-patrol-chat'];
    const onlyPair = DISCORGI_CHANNELS.map(channel => channel.name).filter(name => !pair.includes(name));
    for (let i = 0; i < 25; i += 1) {
        for (const channel of selectDiscorgiChannels(Math.random, onlyPair)) assert.ok(pair.includes(channel.name));
    }
});

test('Discorgi channel selection is deterministic when random is injected', () => {
    const first = selectDiscorgiChannels(() => 0.42).map(channel => channel.name);
    const second = selectDiscorgiChannels(() => 0.42).map(channel => channel.name);
    assert.deepEqual(first, second);
});
