
const ANALYSIS_BLOCK_RE = /<analysis>[\s\S]*?<\/analysis>/i;
// Beta's tag-free replacement for the analysis block (see phonePromptPolicy.js): a "SCENE SHEET"
// line through an "END OF SCENE SHEET" line. Phone requests strip the procedure, but a model can
// still echo one, so it is treated exactly like an analysis block.
const SCENE_SHEET_BLOCK_RE = /^[ \t]*(?:SCENE SHEET|\[SCENE SHEET\])[ \t]*$[\s\S]*?^[ \t]*(?:END OF SCENE SHEET|\[END OF SCENE SHEET\])[ \t]*$/im;
const SCENE_SHEET_OPEN_RE = /^[ \t]*(?:SCENE SHEET|\[SCENE SHEET\])[ \t]*$/im;

/** Drops a leading scratch block. Returns null when one was opened but never closed. */
function stripScratchBlock(text) {
    let rest = text;
    while (rest) {
        let removed = false;
        for (const [block, open] of [[ANALYSIS_BLOCK_RE, /<analysis>/i], [SCENE_SHEET_BLOCK_RE, SCENE_SHEET_OPEN_RE]]) {
            const match = rest.match(block);
            if (match) {
                rest = rest.slice(match.index + match[0].length);
                removed = true;
                break;
            }
            // Opened but never closed (e.g. generation cut off mid-block): nothing usable survives.
            if (open.test(rest)) return null;
        }
        if (!removed) break;
    }
    return rest;
}
const INCOMING_LINE_RE = /^Incoming¦[^¦]*¦[^¦]*¦(.*)$/;
const GROUP_INCOMING_LINE_RE = /^Incoming[¦|│][^¦|│]*[¦|│]([^¦|│]*)[¦|│](.*)$/;
const FOOTER_LINE_RE = /^(\[[^\[\]]+\]\s*)+$/;

// A real text bubble may be wordy, but it should never contain a dumped system prompt. Keep up to
// three paragraphs in one bubble (per Lucky's requested boundary), plus a generous hard length
// ceiling for malformed one-paragraph dumps. Separate Incoming lines are evaluated independently,
// so a character can still send any number of normal consecutive bubbles.
export const MAX_INBOUND_MESSAGE_PARAGRAPHS = 3;
export const MAX_INBOUND_MESSAGE_CHARS = 2000;

export function isAcceptableInboundMessage(content) {
    const value = String(content ?? '').trim();
    if (!value || value.length > MAX_INBOUND_MESSAGE_CHARS) return false;
    // Count both real line breaks and the literal "\\n" sequences some models emit in JSON-ish
    // text. Paragraphs require a blank line; ordinary wrapped lines remain one paragraph.
    const measurable = value.replace(/\\r\\n|\\n|\\r/g, '\n');
    const paragraphCount = measurable.split(/\n\s*\n+/).filter(paragraph => paragraph.trim()).length;
    return paragraphCount <= MAX_INBOUND_MESSAGE_PARAGRAPHS;
}

/**
 * Cleans up a raw model reply for storage/display: strips the <analysis>...</analysis>
 * reasoning-scaffold block (or its SCENE SHEET ... END OF SCENE SHEET equivalent), defensively strips a trailing [Word] [Word]-style footer line, then
 * extracts each Incoming¦[Time]¦[Sender]¦[Message] line's message text as its own standalone
 * entry. Phone¦/Texting¦/Outgoing¦ lines and any other non-matching lines (including narration
 * that slipped through) are discarded. Falls back to the cleaned remainder as a single message if
 * no Incoming¦ lines are found — signals a format-following failure without silently losing the
 * reply. Returns an empty messages array (usedFallback: false) only when nothing usable survives
 * at all (e.g. the analysis block was never closed) — callers must treat that as an error.
 * @param {string} rawText
 * @returns {{ messages: string[], usedFallback: boolean }}
 */
export function parseReply(rawText) {
    if (!rawText || typeof rawText !== 'string') return { messages: [], usedFallback: false };

    let text = rawText.replace(/\r\n?/g, '\n');

    const stripped = stripScratchBlock(text);
    // Opening marker present but never closed (e.g. generation cut off mid-analysis) — no
    // usable reply content survives past an unterminated analysis block or scene sheet.
    if (stripped === null) return { messages: [], usedFallback: false };
    text = stripped;

    const lines = text.split('\n');
    let lastContentIdx = lines.length - 1;
    while (lastContentIdx >= 0 && lines[lastContentIdx].trim() === '') lastContentIdx--;
    if (lastContentIdx >= 0 && FOOTER_LINE_RE.test(lines[lastContentIdx].trim())) {
        lines.splice(lastContentIdx, 1);
    }

    const messages = [];
    for (const line of lines) {
        const match = line.match(INCOMING_LINE_RE);
        if (match) {
            const content = match[1].trim();
            if (isAcceptableInboundMessage(content)) messages.push(content);
        }
    }

    if (messages.length > 0) {
        return { messages, usedFallback: false };
    }

    const fallbackText = lines.join('\n').trim();
    if (!fallbackText) {
        return { messages: [], usedFallback: false };
    }
    return {
        messages: isAcceptableInboundMessage(fallbackText) ? [fallbackText] : [],
        usedFallback: true,
    };
}

export function parseGroupReply(rawText) {
    if (!rawText || typeof rawText !== 'string') return { messages: [], usedFallback: false };
    let text = rawText.replace(/\r\n?/g, '\n');
    const stripped = stripScratchBlock(text);
    if (stripped === null) return { messages: [], usedFallback: false };
    text = stripped;
    const messages = [];
    for (const line of text.split('\n')) {
        const match = line.match(GROUP_INCOMING_LINE_RE);
        if (!match) continue;
        const content = match[2].trim();
        if (isAcceptableInboundMessage(content)) messages.push({ speaker: match[1].trim() || null, content });
    }
    if (messages.length) return { messages, usedFallback: false };
    const fallback = text.trim();
    return {
        messages: fallback && isAcceptableInboundMessage(fallback) ? [{ speaker: null, content: fallback }] : [],
        usedFallback: Boolean(fallback),
    };
}
