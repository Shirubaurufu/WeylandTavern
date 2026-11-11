import { getRoleplayMode, ROLEPLAY_MODES } from './roleplayMode.js';
import { setTetheredSettings } from './storage.js';

// Two threads with the same contact (or the same group) are "the same conversation" for this rule.
function threadPeopleKey(conversation) {
    const people = conversation?.participants?.length ? conversation.participants : [conversation?.charName];
    return [...new Set(people.map(name => String(name ?? '').trim().toLowerCase()).filter(Boolean))].sort().join('|');
}

/**
 * Linked is a per-thread flag and the prompt builder injects EVERY thread that carries it, so opening
 * a second thread with the same contact used to leave the first one live (Kressa then saw both
 * "waddup" and "hows it goin"). The rule players expect: only the thread you are in can be Linked.
 * When one is opened, every OTHER thread with the same people that is still Linked drops to Unlinked,
 * and stays there until the player reopens it and picks Linked again.
 *
 * Other contacts are untouched on purpose: a Blake thread must keep working while a Kressa thread is
 * open. Closing the panel never reaches this (only opening a thread does), so a Linked thread keeps
 * working while the player is back in the roleplay.
 * @returns {string[]} ids of the threads that were unlinked
 */
export function unlinkOtherThreadsWithSamePeople(settings, openedId) {
    const opened = settings?.conversations?.[openedId];
    if (!opened) return [];
    const key = threadPeopleKey(opened);
    if (!key) return [];
    const unlinked = [];
    for (const conversation of Object.values(settings.conversations)) {
        if (conversation.id === openedId || getRoleplayMode(conversation) !== ROLEPLAY_MODES.LINKED) continue;
        if (threadPeopleKey(conversation) !== key) continue;
        // Same bookkeeping as the Unlinked button in the picker: a captured in-roleplay thread keeps its
        // chat id (capture matching needs it), a thread the player made loses it.
        setTetheredSettings(settings, conversation.id, {
            roleplayMode: ROLEPLAY_MODES.UNLINKED,
            roleplayChatId: conversation.roleplayTether ? conversation.roleplayChatId : null,
        });
        unlinked.push(conversation.id);
    }
    return unlinked;
}
