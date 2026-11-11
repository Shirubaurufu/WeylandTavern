import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    CHARACTER_UPDATES_KEY, characterUpdateNotification, dismissUpdates, markUpdatesAnnounced,
    pruneUpdateMemory, unannouncedUpdates, undismissedUpdates, updateNames, updateSentence,
} from '../lib/characterUpdates.js';

const summer = { sysName: 'Summer', name: 'Summer', signature: 'aaaa1111' };
const belle = { sysName: 'Belle', name: 'Belle', signature: 'bbbb2222' };
const loona = { sysName: 'Loona', name: 'Loona', signature: 'cccc3333' };

test('a pending update shows as one notification that can be dismissed', () => {
    const settings = {};
    const item = characterUpdateNotification(settings, [summer, belle], 123);
    assert.equal(item.appKey, CHARACTER_UPDATES_KEY);
    assert.equal(item.title, 'Character Downloader · 2 updates');
    assert.equal(item.text, 'Summer and Belle have updates in the Character Downloader. Tap to open it.');
    assert.equal(item.read, false);
    assert.equal(item.dismissible, true);
    assert.equal(item.timestamp, 123);
    assert.equal(characterUpdateNotification(settings, [], 123), null);
});

// Lucky's case: "I don't want to update Summer, so I dismiss it. I don't want another 'Summer has an
// update' every time I launch, unless she genuinely gets a new one."
test('a dismissed update stays gone across launches, and comes back only when the update itself is new', () => {
    const settings = {};
    assert.equal(dismissUpdates(settings, [summer]), true);
    assert.equal(dismissUpdates(settings, [summer]), false, 'dismissing twice changes nothing');

    // next launch, same update on the server
    assert.deepEqual(undismissedUpdates(settings, [summer]), []);
    assert.equal(characterUpdateNotification(settings, [summer]), null);

    // a later launch: the server has a different Summer update
    const newer = { ...summer, signature: 'dddd4444' };
    assert.deepEqual(undismissedUpdates(settings, [newer]), [newer]);
    assert.match(characterUpdateNotification(settings, [newer]).text, /^Summer has an update/);
});

test('dismissing one character does not hide another character\'s update', () => {
    const settings = {};
    dismissUpdates(settings, [summer]);
    assert.deepEqual(undismissedUpdates(settings, [summer, belle]), [belle]);
    assert.equal(characterUpdateNotification(settings, [summer, belle]).title, 'Character Downloader · 1 update');
});

test('the pop-up is shown once per update; the notification waits until it is dismissed', () => {
    const settings = {};
    assert.deepEqual(unannouncedUpdates(settings, [summer]), [summer]);
    assert.equal(markUpdatesAnnounced(settings, [summer]), true);
    // next launch: no pop-up, but the notification is still there
    assert.deepEqual(unannouncedUpdates(settings, [summer]), []);
    assert.ok(characterUpdateNotification(settings, [summer]));
    // a new update for her pops up again
    assert.equal(unannouncedUpdates(settings, [{ ...summer, signature: 'eeee5555' }]).length, 1);
    // a dismissed update never pops up
    dismissUpdates(settings, [belle]);
    assert.deepEqual(unannouncedUpdates(settings, [belle]), []);
});

test('memory of characters with nothing pending is dropped; the rest is kept', () => {
    const settings = {};
    dismissUpdates(settings, [summer, belle]);
    markUpdatesAnnounced(settings, [summer, belle]);
    assert.equal(pruneUpdateMemory(settings, [summer]), true);
    assert.deepEqual(settings.characterUpdates, { dismissed: { Summer: 'aaaa1111' }, announced: { Summer: 'aaaa1111' } });
    assert.equal(pruneUpdateMemory(settings, [summer]), false);
});

test('the memory is kept as maps so settings sync merges it per character', () => {
    const settings = { characterUpdates: { dismissed: ['oops'], announced: null } };
    dismissUpdates(settings, [summer]);
    assert.equal(Array.isArray(settings.characterUpdates.dismissed), false);
    assert.deepEqual(settings.characterUpdates.dismissed, { Summer: 'aaaa1111' });
    assert.deepEqual(settings.characterUpdates.announced, {});
});

test('bad entries from the Downloader are ignored', () => {
    const settings = {};
    assert.deepEqual(undismissedUpdates(settings, [null, {}, { sysName: 'X' }, { signature: 'y' }, summer]), [summer]);
    assert.deepEqual(undismissedUpdates(settings, 'nope'), []);
});

test('names read naturally and never use a long dash', () => {
    assert.equal(updateNames([summer]), 'Summer');
    assert.equal(updateNames([summer, belle]), 'Summer and Belle');
    assert.equal(updateNames([summer, belle, loona]), 'Summer, Belle and Loona');
    assert.equal(updateNames([summer, belle, loona, { ...summer, name: 'Vera' }, { ...summer, name: 'Kai' }]), 'Summer, Belle and 3 more');
    assert.equal(updateSentence([summer]), 'Summer has an update in the Character Downloader.');
    assert.equal(updateSentence([]), '');
    assert.doesNotMatch(updateSentence([summer, belle]), /—/);
});

test('the phone wires the notice into the shade, the lock screen and Clear all', async () => {
    const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
    assert.match(source, /document\.addEventListener\('weyland:character-updates', event => onCharacterUpdates\(event\.detail\)\);/);
    assert.match(source, /notifications: notificationsWithUpdates\(settings, context\),/);
    assert.match(source, /const unread = notificationsWithUpdates\(settings, context\)\.filter\(n => !n\.read\)\.slice\(0, 4\);/);
    assert.match(source, /clearNotifications\(settings, context\.chatId\);\s*dismissUpdates\(settings, pendingCharacterUpdates\);/);
    assert.match(source, /if \(notification\?\.dataset\.app === CHARACTER_UPDATES_KEY\) \{/);
    // The pop-up is marked as shown before it is raised, so it cannot repeat on the next launch.
    assert.match(source, /changed = markUpdatesAnnounced\(settings, fresh\) \|\| changed;/);
    const shade = await readFile(new URL('../lib/ui/shade.js', import.meta.url), 'utf8');
    assert.match(shade, /item\.dismissible \? '<button type="button" class="wp-shade-notification-dismiss"/);
});
