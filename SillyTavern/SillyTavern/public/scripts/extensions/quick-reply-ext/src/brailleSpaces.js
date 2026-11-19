// Gemini Bypass: braille blanks in the player's latest message (Lucky, 2026-11-19).
//
// Gemini writes noticeably more varied replies when the spaces in the player's latest message are U+2800 (BRAILLE PATTERN
// BLANK) instead of normal spaces; presumably the odd tokens knock it off its most worn paths. Lucky tested it and found it
// only needs to be in the LATEST user message. Each braille blank costs extra tokens, so nothing else gets it.
//
// Done on the outgoing request only (quick-reply-ext OnRequestReady), never in the chat: the player sees their message
// with normal spaces, and every request is rebuilt from the saved chat, so older messages go back to plain spaces on
// their own. Rerolls re-send the same latest message and get it again.
//
// Gemini mirrors its input, so a reply may come back with braille blanks in it. They are not whitespace to a regex, so
// the Formatter's header parsing, the mood/costume tags and word wrapping would all break: cleanReplyBraille turns them
// back into spaces before any other MESSAGE_RECEIVED listener sees the reply.

export const BRAILLE_BLANK = '⠀';

/**
 * Swap the spaces in the player's latest message for braille blanks, inside the request only.
 * Only the stretch that is the player's own text changes: depending on the connection, SillyTavern can merge the
 * post-history or other injected text into the same user message, and brailling that would cost tokens for nothing.
 * Skipped (returns 0) when an assistant message comes after the player's (Continue / Impersonate: there is no new player
 * message) or when the text can't be found exactly (a prompt regex or macro changed it): better no braille than the wrong text.
 * Mutates `messages` in place.
 * @param {Array} messages the request's messages
 * @param {string[]} candidates the player's message as saved, and as macro-expanded (either may be what was sent)
 * @returns {number} spaces replaced
 */
export function braillePlayerMessage(messages, candidates) {
    if (!Array.isArray(messages)) return 0;
    const texts = [...new Set((candidates || []).map(c => String(c ?? '').replace(/\r/g, '').trim()))]
        .filter(t => t.includes(' '))
        .sort((a, b) => b.length - a.length);
    if (!texts.length) return 0;
    // Walk back from the end; stop at the first assistant message, since anything before it is not the latest turn.
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (!message) continue;
        if (message.role === 'assistant') return 0;
        if (message.role !== 'user') continue;
        for (const slot of textSlots(message)) {
            const content = slot.get();
            for (const text of texts) {
                const at = findPlayerText(content, text);
                if (at < 0) continue;
                const swapped = text.replace(/ /g, BRAILLE_BLANK);
                slot.set(content.slice(0, at) + swapped + content.slice(at + text.length));
                return text.split(' ').length - 1;
            }
        }
    }
    return 0;
}

/** Turn braille blanks in a reply back into spaces. @returns {string} */
export function cleanReplyBraille(text) {
    return typeof text === 'string' && text.includes(BRAILLE_BLANK) ? text.split(BRAILLE_BLANK).join(' ') : text;
}

function textSlots(message) {
    if (typeof message.content === 'string') return [{ get: () => message.content, set: v => { message.content = v; } }];
    if (!Array.isArray(message.content)) return [];
    return message.content.filter(p => p?.type === 'text' && typeof p.text === 'string')
        .map(p => ({ get: () => p.text, set: v => { p.text = v; } }));
}

// The player's text as a whole block: it must start a line (or follow a "Name: " prefix) and end a line. Searched from
// the end, because in a merged message the chat comes before the post-history. The line rule keeps a short message like
// "ok sure" from matching inside a longer line of injected text.
function findPlayerText(content, text) {
    let from = content.length;
    while (from >= 0) {
        const at = content.lastIndexOf(text, from);
        if (at < 0) return -1;
        const before = content.slice(Math.max(0, content.lastIndexOf('\n', at - 1) + 1), at);
        const after = content[at + text.length];
        const startsLine = before === '' || /^[^\n]{1,60}: $/.test(before);
        const endsLine = after === undefined || after === '\n' || after === '\r';
        if (startsLine && endsLine) return at;
        from = at - 1;
    }
    return -1;
}
