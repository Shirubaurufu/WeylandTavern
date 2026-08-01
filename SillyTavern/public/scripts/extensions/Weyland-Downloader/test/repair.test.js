import test from 'node:test';
import assert from 'node:assert/strict';

import {
    REPAIR_CONFIRMATION_MESSAGE,
    isRepairAction,
    downloadOutcomeLabel,
} from '../Modules/repair.js';

test('repair is available only for installed, up-to-date characters still present on the server', () => {
    assert.equal(isRepairAction({ installed: true, updateAvailable: false, unavailableOnServer: false }), true);
    assert.equal(isRepairAction({ installed: true, updateAvailable: true, unavailableOnServer: false }), false);
    assert.equal(isRepairAction({ installed: false, updateAvailable: false, unavailableOnServer: false }), false);
    assert.equal(isRepairAction({ installed: true, updateAvailable: false, unavailableOnServer: true }), false);
});

test('repair confirmation explains replaced assets, preserved user data, and greeting refresh', () => {
    assert.match(REPAIR_CONFIRMATION_MESSAGE, /character card/i);
    assert.match(REPAIR_CONFIRMATION_MESSAGE, /full expression set/i);
    assert.match(REPAIR_CONFIRMATION_MESSAGE, /bundled character lorebooks/i);
    assert.match(REPAIR_CONFIRMATION_MESSAGE, /existing chats.+preserved/i);
    assert.match(REPAIR_CONFIRMATION_MESSAGE, /WeyPhone texts.+preserved/i);
    assert.match(REPAIR_CONFIRMATION_MESSAGE, /per-chat LTM books.+preserved/i);
    assert.match(REPAIR_CONFIRMATION_MESSAGE, /bundled lorebook and expression files.+overwritten/i);
    assert.match(REPAIR_CONFIRMATION_MESSAGE, /Reload Weyland Tavern.+updated card greetings/i);
});

test('repair terminal outcomes distinguish complete, partial, failed, and aborted runs', () => {
    assert.equal(downloadOutcomeLabel({ repair: true }), 'REPAIR COMPLETE.');
    assert.match(downloadOutcomeLabel({ repair: true, failedCount: 1 }), /PARTIALLY COMPLETE/);
    assert.equal(downloadOutcomeLabel({ repair: true, requestFailed: true }), 'REPAIR FAILED.');
    assert.equal(downloadOutcomeLabel({ repair: true, aborted: true }), 'REPAIR ABORTED.');
});
