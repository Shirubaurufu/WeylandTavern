import { canCapturePhoneScopeIntoConversation, dedupeCapturedMessages } from './roleplayTether.js';

export function createCaptureId() {
    // Plain HTTP access over a LAN/Tailscale IP may not expose randomUUID (secure contexts only).
    return globalThis.crypto?.randomUUID?.()
        ?? `capture_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

/** This lives on the message itself: SillyTavern replaces `extra` when changing swipes. */
export function ensureCaptureSource(message, makeId = createCaptureId) {
    return message.weyphoneCaptureId ||= makeId();
}

/** A real phone reply commits the visible exchange, even if that reply is later deleted. */
export function protectRepliedCaptures(conversation) {
    for (const message of conversation.messages) {
        if (!message.capturedFromRoleplay) continue;
        message.roleplayReplyLocked = true;
        const record = conversation.roleplayCaptures?.[message.roleplaySourceId];
        if (record) record.locked = true;
    }
}

function protectExistingReplies(conversation) {
    // Also handles saved logs from before reply protection existed. Only an actual phone send
    // counts; a user line printed by the model is not evidence that the user replied.
    let replied = false;
    for (let index = conversation.messages.length - 1; index >= 0; index--) {
        const message = conversation.messages[index];
        if (message.role === 'user' && !message.capturedFromRoleplay) replied = true;
        if (!replied || !message.capturedFromRoleplay) continue;
        message.roleplayReplyLocked = true;
        const record = conversation.roleplayCaptures?.[message.roleplaySourceId];
        if (record) record.locked = true;
    }
}

/** Conservatively attach old captures only when both their original turn and actual text match.
 * Older versions saved the chat length as the anchor. Never guess using that number alone. */
export function adoptLegacyRoleplayCapture(conversation, sourceId, incoming, anchor) {
    if (conversation.roleplayCaptures?.[sourceId]) return false;
    const matches = conversation.messages.filter(message => message.capturedFromRoleplay
        && !message.roleplaySourceId && message.mainChatAnchor === anchor
        && incoming.some(candidate => candidate.role === message.role && candidate.content === message.content
            && candidate.speaker === message.speaker));
    if (!matches.length) return false;
    conversation.roleplayCaptures ??= {};
    conversation.roleplayCaptures[sourceId] = { signature: JSON.stringify(incoming), locked: false };
    for (const message of matches) message.roleplaySourceId = sourceId;
    protectExistingReplies(conversation);
    return true;
}

/** Reconcile one roleplay reply's contribution to one thread. Never use a chat array index as
 * identity: deleting turns reuses indices, and branching copies the message's stable identity. */
export function reconcileRoleplayCapture(conversation, sourceId, incoming, { timestamp, anchor }) {
    conversation.roleplayCaptures ??= {};
    protectExistingReplies(conversation);
    const previous = conversation.roleplayCaptures[sourceId];
    const signature = JSON.stringify(incoming);
    if (previous?.locked || previous?.signature === signature) return { changed: false, added: [] };

    const belongs = message => message.roleplaySourceId === sourceId;
    // A generated memory already describes these messages. Preserve its source instead of
    // silently invalidating a saved summary and its message boundaries on a later swipe.
    if (conversation.messages.some((message, index) => belongs(message)
        && (message.roleplayReplyLocked || index < (conversation.lastMemoryMessageIndex ?? 0)))) {
        conversation.roleplayCaptures[sourceId] = { ...previous, signature, locked: true };
        for (const message of conversation.messages.filter(belongs)) message.roleplayReplyLocked = true;
        return { changed: true, added: [] };
    }

    const firstIndex = conversation.messages.findIndex(belongs);
    const remaining = conversation.messages.filter(message => !belongs(message));
    const added = dedupeCapturedMessages(incoming, remaining).map(message => ({
        ...message, timestamp: timestamp(), mainChatAnchor: anchor,
        capturedFromRoleplay: true, roleplaySourceId: sourceId,
    }));
    // Replacing an older contribution keeps its place among later phone activity.
    const insertAt = firstIndex < 0 ? Math.min(previous?.position ?? remaining.length, remaining.length) : firstIndex;
    remaining.splice(insertAt, 0, ...added);
    conversation.messages = remaining;
    conversation.roleplayCaptures[sourceId] = { signature, locked: false, position: insertAt };
    if (added.length || firstIndex >= 0) conversation.lastActive = timestamp();
    return { changed: true, added };
}

/** Deleted roleplay replies lose only their unanswered captures. Locked records remain as
 * tombstones so a restored reply cannot append another version of an answered exchange. */
export function pruneMissingRoleplayCaptures(conversations, chatId, chat, timestamp) {
    const present = new Set(chat.map(message => message?.weyphoneCaptureId).filter(Boolean));
    let changed = false;
    for (const conversation of conversations) {
        if (!canCapturePhoneScopeIntoConversation(conversation, conversation.roleplayWireMode, chatId)) continue;
        for (const sourceId of Object.keys(conversation.roleplayCaptures ?? {})) {
            if (present.has(sourceId)) continue;
            changed = reconcileRoleplayCapture(conversation, sourceId, [], { timestamp, anchor: chat.length }).changed || changed;
        }
    }
    return changed;
}

/** Branches inherit a separate copy of their parent's phone history. Texting is not rewound:
 * answered exchanges stay intact, while each branch can independently swipe unanswered ones. */
export function inheritRoleplayThreads(settings, chatId, parentChatId, chat, createConversation) {
    if (!chatId || !parentChatId || chatId === parentChatId) return false;
    const sources = new Set(chat.map(message => message?.weyphoneCaptureId).filter(Boolean));
    let changed = false;
    for (const parent of Object.values(settings.conversations)) {
        if (parent.roleplayChatId !== parentChatId) continue;
        if (!Object.keys(parent.roleplayCaptures ?? {}).some(source => sources.has(source))) continue;
        // A user may delete the inherited thread later. Remember the import independently so
        // revisiting this branch doesn't silently recreate something they removed.
        if (settings.roleplayBranchImports?.[chatId]?.includes(parent.id)) continue;
        if (Object.values(settings.conversations).some(thread => thread.roleplayChatId === chatId
            && thread.roleplayParentThreadId === parent.id)) continue;
        const copy = structuredClone(parent);
        const created = createConversation(settings, parent.charName);
        Object.assign(created, copy, {
            id: created.id, roleplayChatId: chatId, roleplayParentThreadId: parent.id,
        });
        settings.roleplayBranchImports ??= {};
        (settings.roleplayBranchImports[chatId] ??= []).push(parent.id);
        changed = true;
    }
    return changed;
}

/** Register synchronously: swipe/deletion handling must finish before prompt assembly starts.
 * Destructive Regenerate replaces the whole message object, so carry its identity to that one
 * replacement only. Ordinary new turns must never inherit an old reply's protection. */
export function installRoleplayCaptureEvents({ getContext, capture, reconcileChat }) {
    const { eventSource, eventTypes } = getContext();
    let replacement = null;
    let cleared = null;
    const on = (name, listener) => {
        if (eventTypes[name]) eventSource.on(eventTypes[name], listener);
    };
    on('GENERATION_STARTED', (type, _options, dryRun) => {
        if (dryRun || !['regenerate', 'swipe'].includes(type)) return;
        const context = getContext();
        const index = context.chat.length - 1;
        const message = context.chat[index];
        if (!message || message.is_user) return;
        cleared = { chatId: context.chatId, message, text: message.mes, index };
        replacement = type === 'regenerate' && message.weyphoneCaptureId
            ? { chatId: context.chatId, index, sourceId: message.weyphoneCaptureId } : null;
        capture(index, { clear: true, silent: true });
    });
    on('MESSAGE_RECEIVED', (index) => {
        const context = getContext();
        if (replacement && context.chatId === replacement.chatId && Number(index) === replacement.index
            && context.chat[index] && !context.chat[index].is_user) {
            context.chat[index].weyphoneCaptureId = replacement.sourceId;
            replacement = null;
        }
    });
    // Rendering follows the formatter's privacy cleanup and precedes the host's chat save.
    on('CHARACTER_MESSAGE_RENDERED', index => capture(index));
    on('MESSAGE_SWIPED', index => capture(index, { swiping: true, silent: true }));
    on('MESSAGE_UPDATED', index => capture(index, { silent: true }));
    on('MESSAGE_DELETED', () => reconcileChat());
    on('MESSAGE_SENT', () => { replacement = null; cleared = null; });
    on('GENERATION_ENDED', () => {
        const context = getContext();
        // A streaming error ends generation before its final receive/render events. The
        // replacement bubble already exists, so give it the same protection before clearing.
        if (replacement && context.chatId === replacement.chatId) {
            const message = context.chat[replacement.index];
            if (message && !message.is_user) message.weyphoneCaptureId = replacement.sourceId;
        }
        replacement = null;
        // A generation may be rejected before the host changes anything. In that case the
        // original reply is still selected, so restore its unanswered texts as well.
        if (cleared && context.chatId === cleared.chatId && context.chat[cleared.index] === cleared.message
            && cleared.message.mes === cleared.text) capture(cleared.index, { swiping: true, silent: true });
        cleared = null;
    });
    on('CHAT_CHANGED', () => {
        replacement = null;
        cleared = null;
        reconcileChat();
    });
}
