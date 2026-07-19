export const ROLEPLAY_MODES = Object.freeze({
    UNLINKED: 'unlinked',
    OBSERVE: 'observe',
    LINKED: 'linked',
});

const VALID_MODES = new Set(Object.values(ROLEPLAY_MODES));

/**
 * Reads the new three-state mode while remaining compatible with conversations saved before it
 * existed. `roleplayTether` meant a captured, bidirectional thread; the older `tethered` boolean
 * meant read-only access to the active roleplay.
 */
export function getRoleplayMode(conversation) {
    if (VALID_MODES.has(conversation?.roleplayMode)) return conversation.roleplayMode;
    if (conversation?.roleplayTether === true) return ROLEPLAY_MODES.LINKED;
    if (conversation?.tethered === true) return ROLEPLAY_MODES.OBSERVE;
    return ROLEPLAY_MODES.UNLINKED;
}

export function isValidRoleplayMode(mode) {
    return VALID_MODES.has(mode);
}

/** Linked is deliberately scoped to one main-chat id. Switching roleplays never carries a
 * writable phone thread into the newly-opened story by accident. */
export function isConversationLinkedToChat(conversation, chatId) {
    return Boolean(chatId)
        && getRoleplayMode(conversation) === ROLEPLAY_MODES.LINKED
        && conversation?.roleplayChatId === chatId;
}
