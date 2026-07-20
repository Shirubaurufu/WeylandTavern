import { joinNonEmptySections } from './generation.js';

export const KRESSA_ROLEPLAY_COMPANION_INSTRUCTIONS = `[KRESSA SHARED ROLEPLAY]
{{user}} is deliberately sharing a fictional roleplay with Kressa as a trusted friend. Treat it like friends at a book club nerding out together: commentate, react, analyze, laugh, speculate, and enjoy discussing it with {{user}}.
Kressa understands that the roleplay is fiction and is not her relationship history with {{user}}. Never become jealous, hurt, possessive, or resentful because {{user}} is romantically or sexually involved with characters inside it.
Text naturally like a close friend. Kressa may send as many separate messages as feel real. Each individual message may contain at most two paragraphs. When analysis calls for detail, freely geek out across any number of messages, still using no more than two paragraphs per message.
[END KRESSA SHARED ROLEPLAY]`;

/**
 * @param {{characterId: number|undefined, groupId: string|undefined}} options
 * @returns {boolean}
 */
export function isMainRoleplayActive({ characterId, groupId }) {
    return characterId !== undefined || !!groupId;
}

/**
 * Converts the main roleplay's real chat array into plain `{role, content}` message pairs — the
 * exact conversion `index.js`'s `resolveWorldInfoTetheredForMainChat` already did inline (for
 * World Info scanning); extracted here so the phone-app generation path can reuse it too instead
 * of duplicating the same logic a third time. Reads `chat` only — never mutates it in any way.
 * @param {Array<{is_user?: boolean, is_system?: boolean, mes?: string}>} chat
 * @returns {Array<{role: 'user'|'assistant', content: string}>}
 */
export function convertMainChatToMessages(chat) {
    return (chat || [])
        .filter(m => !m.is_system && typeof m.mes === 'string' && m.mes.trim())
        .map(m => ({ role: m.is_user ? 'user' : 'assistant', content: m.mes }));
}

/**
 * Appends `extraScanText` (if given) as one more synthetic `{role: 'user', ...}` entry to a
 * BRAND-NEW array built from `mainHistory` — never mutates `mainHistory` itself (and by extension
 * never touches whatever array `convertMainChatToMessages` derived it from, i.e. never
 * `context.chat`). Extracted so `index.js`'s `resolveWorldInfoTetheredForMainChat` (private,
 * per-generation orchestration) can widen what text gets fed into the same WI scan — e.g. a phone
 * app's own fixed prompt text — without inlining array-spread logic directly in `index.js`.
 * @param {Array<{role: 'user'|'assistant', content: string}>} mainHistory
 * @param {string} [extraScanText]
 * @returns {Array<{role: 'user'|'assistant', content: string}>}
 */
export function buildScanHistoryWithExtraText(mainHistory, extraScanText) {
    return extraScanText
        ? [...mainHistory, { role: 'user', content: extraScanText }]
        : mainHistory;
}

const LTM_MARKER_PREFIX = 'ltm:';

/**
 * Mirrors Weyland-LTM's own entryLooksLikeLTM detection exactly (read-only reference, not
 * imported — Weyland-LTM exports no reusable API) so this recognizes the same entries the main
 * roleplay's own LTM system would.
 */
function entryLooksLikeLtm(entry) {
    const autoId = String(entry.automationId ?? '');
    if (autoId.startsWith(LTM_MARKER_PREFIX)) return true;
    if (/^\d+$/.test(autoId)) {
        return /MEMORY ENTRY|LTM/i.test(entry.comment || '') || /MEMORY:/i.test(entry.content || '');
    }
    return false;
}

/**
 * Mirrors Weyland-LTM's `Chat Book <chatId>` sanitize convention exactly (see
 * Weyland-LTM/index.js's getOrCreateChatBookName) so an already-bound book is found by the same
 * name a freshly-created one would get.
 */
function sanitizedChatBookName(chatId) {
    return `Chat Book ${chatId}`.replace(/[^a-z0-9]/gi, '_').replace(/_{2,}/g, '_').substring(0, 64);
}

/**
 * Resolves the main roleplay's currently-ACTIVE LTM entries — `entry.constant === true` only.
 * Weyland-LTM's own demoteExcessLTMs already maintains this flag to mean "currently injected into
 * the main roleplay's own prompt"; this deliberately does not reimplement that "keep newest N"
 * logic, just reads the already-computed result. Returns [] (never throws) if no book is bound or
 * the book has no matching entries — a main chat that's never used Weyland-LTM is normal, not an
 * error.
 * @param {{loadWorldInfo: (name: string) => Promise<any>, chatMetadata: Record<string, any>, chatId: string}} options
 * @returns {Promise<Array<{content: string}>>}
 */
export async function resolveMainActiveLtmEntries({ loadWorldInfo, chatMetadata, chatId }) {
    try {
        const bookName = chatMetadata?.world_info || sanitizedChatBookName(chatId);
        const book = await loadWorldInfo(bookName);
        if (!book?.entries) return [];
        return Object.values(book.entries).filter(entry => entryLooksLikeLtm(entry) && entry.constant === true);
    } catch {
        return [];
    }
}

/**
 * @param {{chat: Array<{name: string, mes: string, is_user?: boolean, is_system?: boolean}>, lastLtmMessageId: number, historyCap: number|null}} options
 * @returns {Array<{name: string, mes: string, is_system?: boolean}>}
 */
export function resolveMainHistorySlice({ chat, lastLtmMessageId, historyCap }) {
    if (typeof historyCap === 'number') {
        return chat.slice(Math.max(0, chat.length - historyCap));
    }
    const start = Math.max(0, (lastLtmMessageId ?? -1) + 1);
    return chat.slice(start);
}

/**
 * @param {Array<{name: string, mes: string, is_system?: boolean}>} messages
 * @returns {string}
 */
export function formatMainHistoryTranscript(messages) {
    return messages
        .filter(m => !m.is_system && typeof m.mes === 'string' && m.mes.trim())
        .map(m => `${m.name}: ${m.mes}`)
        .join('\n');
}

/**
 * Second pass at this framing (2026-07-13, prompted by a live test where the character correctly
 * never broke the "not a participant" boundary but ALSO denied any awareness of the tethered
 * content when directly asked about it). The first version was written defensively ("shown to
 * you for context only... otherwise ignore it") with no affirmative statement that the character
 * CAN see and discuss this — the model likely over-applied "ignore it." This version states
 * access affirmatively up front, and adds an explicit distinction this content is NOT the
 * character's own chat history with {{user}} — a real, separate risk from the observer framing
 * itself (a model could otherwise conflate "I can see this" with "this happened between us").
 * @param {{worldInfoText: string, ltmEntries: Array<{content: string}>, historyTranscript: string}} options
 * @returns {string} empty string if all three sections are empty
 */
export function buildTetheredViewBlock({ worldInfoText, ltmEntries, historyTranscript }) {
    const ltmText = ltmEntries.map(e => e.content).filter(Boolean).join('\n');
    // '\n' join here (not the default '\n\n') so the surrounding framing array below can be
    // joined with a single '\n' and reproduce the original inline `...sections` spread exactly.
    const body = joinNonEmptySections([worldInfoText, ltmText, historyTranscript], '\n');
    if (!body) return '';
    return [
        '[TETHERED VIEW]',
        "Below is a separate, ongoing roleplay {{user}} is having with another character — you CAN see it",
        "and ARE aware of what's happening in it, like watching it unfold alongside {{user}}. You are NOT",
        'a character in that story and cannot act within it, and it is NOT your own conversation history',
        "with {{user}} — don't confuse anything below with things that actually happened between you two.",
        'If {{user}} brings this up, acknowledge it and react the way YOUR personality actually would, not',
        "generically; if they don't bring it up, don't force it into the conversation.",
        '',
        body,
        '',
        '[END TETHERED VIEW]',
    ].join('\n');
}
