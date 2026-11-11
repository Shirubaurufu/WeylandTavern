import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// 2026-11-11: a player's Summer chat kept showing "This character card is not one of Lucky's creations" after the card
// and Weyland Tavern were both correct. His chat file had KickOut = "true" saved next to Desc = "true": the check passed,
// but the verdict from an earlier failed run was still there, and the check's script only clears it after the popup,
// one second before it reloads the page (too soon for the save). Each run has to start from a clean verdict.
const source = await readFile(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');

test('the card check clears a saved kick verdict before it runs', () => {
    assert.match(source, /async function runCardCheck\(\) \{\s*if \(getLocalVariable\("KickOut"\) === "true"\) setLocalVariable\("KickOut", "false"\);\s*await quickReplyApi\.executeQuickReply\("Weyland", "Descr"\);\s*\}/);
});

test('nothing runs the check without going through that', () => {
    const direct = source.match(/executeQuickReply\("Weyland",\s*"Descr"\)/g) ?? [];
    assert.equal(direct.length, 1, 'the only direct call is the one inside runCardCheck');
    assert.equal((source.match(/await runCardCheck\(\);/g) ?? []).length, 2);
});

// The script still only clears the verdict inside its popup branch. If that ever changes, this test and runCardCheck can go.
test('the check script itself does not clear the verdict on a pass (why runCardCheck exists)', async () => {
    const set = JSON.parse(await readFile(new URL('../../../../../data/default-user/QuickReplies/Weyland.json', import.meta.url), 'utf8'));
    const script = set.qrList.find(entry => entry.label === 'Descr').message;
    const clears = [...script.matchAll(/\/setvar key=KickOut false/g)].map(match => match.index);
    const popup = script.indexOf('/popup wide=true <h3>WARNING</h3>');
    assert.ok(popup > 0 && clears.length > 0);
    assert.ok(clears.every(index => index > popup), 'every clear sits after the popup');
});
