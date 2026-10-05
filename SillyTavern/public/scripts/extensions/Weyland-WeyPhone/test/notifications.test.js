import test from 'node:test';
import assert from 'node:assert/strict';
import {
    recordSyncNotifications, recordMessageNotification, getNotifications, getUnreadCounts,
    markNotificationRead, markAppNotificationsRead, clearNotifications,
    MAX_STORED_NOTIFICATIONS,
} from '../lib/notifications.js';

const APP_DEFS = [
    { key: 'chronicle', label: 'The Chronicle' },
    { key: 'feed', label: 'Chitter' },
    { key: 'chat', label: 'Discorgi' },
    { key: 'board', label: 'Yip Yap' },
];

function freshSettings() {
    return { notifications: {} };
}

const PARSED_APPS = {
    chronicle: { sections: [{ title: 'HEADLINES', items: [{ text: 'Council approves rezoning.', boldPrefix: '**Council**' }] }] },
    feed: { posts: [{ authorName: 'Blake', handle: '@codewolf', text: 'shipping tonight' }, { authorName: 'Ava', handle: '@courtjester', text: 'vending machine strikes again' }] },
    chat: { sections: [{ title: '#dorm-commons', items: [{ text: 'who left a pizza in the microwave' }] }] },
};

test('recordSyncNotifications appends unread items per app with resolved labels', () => {
    const settings = freshSettings();
    recordSyncNotifications(settings, 'chat-1', PARSED_APPS, APP_DEFS, 1000);
    const items = settings.notifications['chat-1'].items;
    assert.equal(items.length, 4); // 1 chronicle + 2 feed + 1 chat (board absent)
    assert.ok(items.every(i => i.read === false && i.timestamp === 1000));
    const chatItem = items.find(i => i.appKey === 'chat');
    assert.equal(chatItem.title, 'Discorgi · #dorm-commons');
    const feedItem = items.find(i => i.appKey === 'feed');
    assert.equal(feedItem.title, 'Chitter · Blake');
    assert.equal(settings.notifications['chat-1'].lastRefreshAt, 1000);
});

test('per-app limit caps a single sync at 2 notifications per app', () => {
    const settings = freshSettings();
    const bigFeed = { feed: { posts: Array.from({ length: 8 }, (_, i) => ({ authorName: `P${i}`, text: `post ${i}` })) } };
    recordSyncNotifications(settings, 'c', bigFeed, APP_DEFS);
    assert.equal(settings.notifications['c'].items.length, 2);
});

test('getNotifications returns newest first; store trims to the cap', () => {
    const settings = freshSettings();
    for (let i = 0; i < 25; i++) {
        recordSyncNotifications(settings, 'c', PARSED_APPS, APP_DEFS, 1000 + i);
    }
    const store = settings.notifications['c'];
    assert.equal(store.items.length, MAX_STORED_NOTIFICATIONS);
    const listed = getNotifications(settings, 'c');
    assert.equal(listed[0].timestamp, 1024); // newest sync first
});

test('unread counts drive badges and are per-chat isolated', () => {
    const settings = freshSettings();
    recordSyncNotifications(settings, 'chat-1', PARSED_APPS, APP_DEFS);
    recordSyncNotifications(settings, 'chat-2', { chat: PARSED_APPS.chat }, APP_DEFS);
    assert.deepEqual(getUnreadCounts(settings, 'chat-1'), { chronicle: 1, feed: 2, chat: 1 });
    assert.deepEqual(getUnreadCounts(settings, 'chat-2'), { chat: 1 });
});

test('markNotificationRead and markAppNotificationsRead update state', () => {
    const settings = freshSettings();
    recordSyncNotifications(settings, 'c', PARSED_APPS, APP_DEFS);
    const first = getNotifications(settings, 'c')[0];
    assert.equal(markNotificationRead(settings, 'c', first.id), true);
    assert.equal(markNotificationRead(settings, 'c', 'ntf_nope'), false);
    markAppNotificationsRead(settings, 'c', 'feed');
    assert.equal(getUnreadCounts(settings, 'c').feed, undefined);
    markAppNotificationsRead(settings, 'c');
    assert.deepEqual(getUnreadCounts(settings, 'c'), {});
});

test('clearNotifications empties the list without touching other chats', () => {
    const settings = freshSettings();
    recordSyncNotifications(settings, 'a', PARSED_APPS, APP_DEFS);
    recordSyncNotifications(settings, 'b', PARSED_APPS, APP_DEFS);
    clearNotifications(settings, 'a');
    assert.equal(getNotifications(settings, 'a').length, 0);
    assert.ok(getNotifications(settings, 'b').length > 0);
});

test('incoming DMs create a Messages badge and retain their conversation target', () => {
    const settings = freshSettings();
    const item = recordMessageNotification(settings, 'rp-1', {
        title: 'Summer', text: 'hey, are you still coming over?', conversationId: 'conv-summer', now: 1234,
    });
    assert.equal(item.appKey, 'messages');
    if (false) {
    assert.equal(item.title, 'Messages Â· Summer');
    assert.equal(item.title, `Messages ${String.fromCodePoint(0xB7)} Summer`);
    }
    assert.equal(item.title, `Messages ${String.fromCodePoint(0xB7)} Summer`);
    assert.equal(item.conversationId, 'conv-summer');
    assert.deepEqual(getUnreadCounts(settings, 'rp-1'), { messages: 1 });
    markAppNotificationsRead(settings, 'rp-1', 'messages');
    assert.deepEqual(getUnreadCounts(settings, 'rp-1'), {});
});

test('a dedicated-app DM badges its own app tile, not Messages', () => {
    // Kressa's thread opens from her own home tile, so her notification must carry appKey 'kressa'.
    // Routing it to 'messages' badged the wrong icon and left her tile silent.
    const settings = { notifications: {} };
    recordMessageNotification(settings, 'chat-a', {
        title: 'Kressa', text: 'hey, saw your ticket', conversationId: 'c-kressa',
        appKey: 'kressa', appLabel: 'Kressa',
    });
    const [item] = settings.notifications['chat-a'].items;
    assert.equal(item.appKey, 'kressa');
    assert.match(item.title, /^Kressa · Kressa$/);

    const counts = getUnreadCounts(settings, 'chat-a');
    assert.equal(counts.kressa, 1);
    assert.ok(!counts.messages, 'Messages must not be badged for a dedicated-app DM');

    // Opening the Kressa tile clears only her badge.
    markAppNotificationsRead(settings, 'chat-a', 'kressa');
    assert.equal(getUnreadCounts(settings, 'chat-a').kressa ?? 0, 0);
});

test('an ordinary DM still defaults to the Messages app', () => {
    const settings = { notifications: {} };
    recordMessageNotification(settings, 'chat-a', { title: 'Summer', text: 'you up?' });
    const [item] = settings.notifications['chat-a'].items;
    assert.equal(item.appKey, 'messages');
    assert.match(item.title, /^Messages · Summer$/);
});
