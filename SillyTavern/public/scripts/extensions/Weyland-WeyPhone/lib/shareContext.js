// lib/shareContext.js
//
// The share/inject feature: turns the tail of a texting conversation into the context block
// Lucky field-tested — a "(CONTEXT: TEXT CONVERSATION BETWEEN LUCKY AND YUE:)" header followed
// by "(name) message" lines — so the main roleplay's character knows what was arranged over
// text. Injection is via a Weyland-LTM-compatible lorebook entry (see lib/ltmShare.js), which
// gives the user an on/off toggle for free in the LTM panel.

// Only the tail of the thread gets shared — field testing showed the whole history bloats the
// context without helping, and the recent exchange is what the RP actually needs.
export const SHARE_MESSAGE_LIMIT = 12;

/** Find the LTM entry belonging to a WeyPhone thread, adopting one legacy title match. */
export function findSharedLtmEntry(entries, { title, shareId = '' }) {
    return Object.values(entries ?? {}).find(entry => {
        if (!String(entry.automationId ?? '').startsWith('ltm:')) return false;
        if (shareId && entry.weyphoneShareId === shareId) return true;
        return !entry.weyphoneShareId && entry.comment === title;
    });
}

/**
 * @param {{userName: string, charName: string, messages: Array<{role: string, content: string}>, limit?: number}} args
 *   `messages` is a WeyPhone conversation's message array ({role: 'user'|'assistant', content}).
 * @returns {string} the injection block, or '' when there's nothing shareable
 */
export function buildShareBlock({ userName, charName, messages, limit = SHARE_MESSAGE_LIMIT }) {
    const lines = messages
        .filter(message => typeof message.content === 'string' && message.content.trim() !== '')
        .slice(-limit)
        .map(message => `(${message.role === 'user' ? userName : charName}) ${message.content.trim()}`);
    if (lines.length === 0) return '';
    return `(CONTEXT: TEXT CONVERSATION BETWEEN ${userName.toUpperCase()} AND ${charName.toUpperCase()}:)\n${lines.join('\n')}`;
}

/**
 * Lorebook-entry title for a shared conversation — the 📱 makes WeyPhone shares easy to spot
 * (and re-share: a newer share of the same thread on the same day updates in place upstream).
 * @param {string} charName
 * @param {Date} [now]
 */
export function buildShareTitle(charName, now = new Date()) {
    const month = now.toLocaleString('en-US', { month: 'short' });
    return `📱 Texts with ${charName} (${month} ${now.getDate()})`;
}
