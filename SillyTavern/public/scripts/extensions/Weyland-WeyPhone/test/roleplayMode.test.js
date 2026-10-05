import assert from 'node:assert/strict';
import test from 'node:test';
import { getRoleplayMode, isConversationLinkedToChat, ROLEPLAY_MODES } from '../lib/roleplayMode.js';

test('legacy tether states migrate conceptually to the three roleplay modes', () => {
    assert.equal(getRoleplayMode({ tethered: false }), ROLEPLAY_MODES.UNLINKED);
    assert.equal(getRoleplayMode({ tethered: true }), ROLEPLAY_MODES.OBSERVE);
    assert.equal(getRoleplayMode({ tethered: true, roleplayTether: true }), ROLEPLAY_MODES.LINKED);
});

test('Linked write access is scoped to its original roleplay chat', () => {
    const conversation = { roleplayMode: ROLEPLAY_MODES.LINKED, roleplayChatId: 'chat-a' };
    assert.equal(isConversationLinkedToChat(conversation, 'chat-a'), true);
    assert.equal(isConversationLinkedToChat(conversation, 'chat-b'), false);
    assert.equal(isConversationLinkedToChat(conversation, null), false);
});
