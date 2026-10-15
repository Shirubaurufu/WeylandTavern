// Preparation is private even when generation stops before its closing marker.
// A closed block can precede any reply format; only an unclosed block needs a
// recognised reply header to recover a response. Never require headers of bare replies.
// Recognise decorated titles explicitly: a draft header inside a known sheet must
// never be mistaken for the real reply boundary, and a cut-off sheet stays private.
const SCENE_OPEN = /^\s*(?:\*{1,2})?(?:SCENE SHEET(?:[ \t]+\[[^\]\r\n]+\])?|\[SCENE SHEET\]):?(?:\*{1,2})?[ \t]*\r?(?:\n|$)/i;
// "END OF SCENE SHEET" is what the prompts ask for; models also write "[End scene sheet]", "END SCENE SHEET" or add a full stop.
const SCENE_CLOSE = /^[ \t]*(?:\*{1,2})?(?:END (?:OF )?SCENE SHEET|\[END (?:OF )?SCENE SHEET\])[ \t]*[.!~]?(?:\*{1,2})?[ \t]*\r?$/im;
const TAG_OPEN = /^\s*<(analysis|think)>/i;

// Missing bars are safe to repair only for a complete, standalone header. Requiring
// separate date, clock and location fields avoids treating ordinary tilde prose as a header.
const PLAIN_DATE = /^(?:(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?),?\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?(?:\s+\((?:Freshman|Sophomore|Junior|Senior)(?: Year)?\))?$/i;
const PLAIN_TIME = /^(?:\d{1,2}:\d{2}(?:\s*[AP]M)?|\d{1,2}\s*[AP]M)$/i;
// GLM custom starts sometimes close the bars before writing the mode. This is
// still a reply boundary, including when the provider leaves all content in reasoning.
const OUTSIDE_MODE_HEADER = /^[ \t]*¦+[ \t]*([^¦\r\n]+?)[ \t]*¦+[ \t]*(\((?:SAPH|ONYX|RUBY)\))[ \t]*\r?$/im;

function findPlainReplyHeader(text) {
    for (const match of text.matchAll(/^[ \t]*[^\r\n]+/gm)) {
        const line = match[0].trim().replace(/^(\*{1,3})(.*?)\1$/, '$2');
        if (line.length > 300 || /[¦*"`<>]/.test(line)) continue;
        const parts = line.replace(/~\s*$/, '').split('~').map(part => part.trim());
        if (parts.length < 3 || parts.length > 4 || parts.some(part => !part)) continue;
        const date = parts.findIndex(part => PLAIN_DATE.test(part) || /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(part));
        const time = parts.findIndex(part => PLAIN_TIME.test(part));
        if (date < 0 || time < 0 || date === time) continue;
        const remaining = parts.filter((_, index) => index !== date && index !== time);
        if (remaining.length === 2 && !remaining.some(part => /^(?:(?:SAPH|ONYX|RUBY)|\((?:SAPH|ONYX|RUBY)\))(?:\s*\(\w{4}\))?$/i.test(part))) continue;
        match[1] = line;
        return match;
    }
    return null;
}

export function repairReplyHeader(text) {
    const outside = text.match(OUTSIDE_MODE_HEADER);
    if (outside && !text.slice(0, outside.index).trim()) {
        const body = outside[1].trim().replace(/~\s*$/, '').trim();
        return `¦¦ ${body} ~ ${outside[2]} ¦¦${text.slice(outside.index + outside[0].length)}`;
    }
    const header = findPlainReplyHeader(text);
    // Only repair the start of a cleaned reply, never an example embedded in its prose.
    if (!header || text.slice(0, header.index).trim()) return text;
    return `¦¦ ${header[1]} ¦¦${text.slice(header.index + header[0].length)}`;
}

// Shared with the Formatter so recovery and visible rendering use the same headers.
export const REPLY_HEADER = /^¦+\s?(.+? ?(?:\(\w{4}\) ?)?)¦+$/m;
export const BAD_REPLY_HEADER = /^[^\n¦]+(¦+\s?(.+? ?(?:\(\w{4}\) ?)?)¦+$)/m;
export const MUSE_REPLY_HEADER = /^(?:(?:MUSE EXPERIMENT:.+)|(?:(?:(?:Mon|Tue(?:s)?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?|Sun)(?:day)?),.+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|(Nov|Dec)(?:ember)?) \d{1,2}, \d+ - \d{1,2}:\d{1,2} [AP]M(?:\s.+)?)|(?:.+ \(CODE: ?\d+\))|(?:Collar Status: (?:(?:In)?Active|Monitoring Only.+))|(?:Evening Scene:.+))$/im;

export function findPreparationReplyHeader(text, characterName = 'Muse') {
    const bad = text.match(BAD_REPLY_HEADER);
    if (bad) {
        bad.index += bad[0].length - bad[1].length;
        bad[0] = bad[1];
    }
    const headers = [text.match(REPLY_HEADER), bad, findPlainReplyHeader(text), text.match(OUTSIDE_MODE_HEADER)];
    if (characterName === 'Muse') headers.push(text.match(MUSE_REPLY_HEADER));
    return headers.filter(Boolean).sort((a, b) => a.index - b.index)[0] ?? null;
}

/**
 * @param {string} text Raw reply or markdown
 * @param {(text: string) => RegExpMatchArray|null} findReplyHeader Optional recovery boundary
 * @returns {{ text: string, reasoning: string }}
 */
export function extractPrivatePreparation(text, findReplyHeader = () => null) {
    const reasoning = [];
    let rest = text ?? '';
    while (rest) {
        const scene = rest.match(SCENE_OPEN);
        const tag = scene ? null : rest.match(TAG_OPEN);
        const opening = scene ?? tag;
        if (!opening) {
            // Providers can split reasoning mid-word, leaving its tail and closing
            // tag in content. Accept only a closer immediately followed by a reply
            // header, and never consume a closer inside an already-started reply.
            const orphan = rest.match(/<\/(?:analysis|think)>/i);
            if (orphan) {
                const after = rest.slice(orphan.index + orphan[0].length).trimStart();
                if (findReplyHeader(after)?.index === 0 && !findReplyHeader(rest.slice(0, orphan.index))) {
                    reasoning.push(rest.slice(0, orphan.index).trim());
                    rest = after;
                    continue;
                }
            }
            // A sheet whose opening line was not recognised (GLM writes a second copy after its own <think> block, sometimes with a
            // lead-in line, "SCENE SHEET [Rob]", bold, or no title at all) used to leak whole: only the closing marker was certain,
            // and the cleaner never looked at it. A lone "END OF SCENE SHEET" line exists only as the end of a sheet, so everything
            // up to it is preparation, as long as the real reply has not started yet. If a reply header comes first, the marker
            // belongs to the body of a finished reply and is left alone.
            const stray = rest.match(SCENE_CLOSE);
            if (!stray) break;
            const header = findReplyHeader(rest);
            if (header && header.index < stray.index) break;
            reasoning.push(rest.slice(0, stray.index).trim());
            rest = rest.slice(stray.index + stray[0].length).trim();
            continue;
        }

        const body = rest.slice(opening[0].length);
        const closing = body.match(scene ? SCENE_CLOSE : new RegExp(`</${tag[1]}>`, 'i'));
        const header = closing ? null : findReplyHeader(body);
        const boundary = closing ?? header;
        const end = boundary?.index ?? body.length;
        reasoning.push((scene ? opening[0] + body.slice(0, end) : body.slice(0, end)).trim());
        // No closing marker or header means the entire remainder is unfinished preparation.
        rest = boundary ? body.slice(end + (closing ? closing[0].length : 0)).trim() : '';
    }
    // GLM writes a "---" rule between "END OF SCENE SHEET" and the reply header (live test 2026-10-14: 3 of 3 replies that arrived
    // in content started with it). Only drop it when a sheet was actually removed, so a reply that opens with a rule on its own is kept.
    if (reasoning.length) rest = rest.replace(/^(?:[-*_]{3,}[ \t]*\r?\n\s*)+/, '');
    return { text: rest, reasoning: reasoning.filter(Boolean).join('\n\n---\n\n') };
}

/**
 * Some providers (GLM through HM, 2026-10-14) stream the whole answer as reasoning and leave content empty, so the message is blank
 * and the reply sits in extra.reasoning after the sheet. If the reasoning holds a closed sheet followed by a real reply header, the
 * part after the sheet is the reply. Returns null when it is not that shape (no header = nothing is guessed).
 * @param {string} reasoning Provider reasoning text
 * @param {(text: string) => RegExpMatchArray|null} findReplyHeader Same header finder the cleaner uses
 * @returns {{ text: string, reasoning: string } | null}
 */
export function recoverReplyFromReasoning(reasoning, findReplyHeader = () => null) {
    if (typeof reasoning !== 'string' || !SCENE_CLOSE.test(reasoning)) return null;
    const split = extractPrivatePreparation(reasoning, findReplyHeader);
    const header = split.text && findReplyHeader(split.text);
    if (!header || !split.reasoning) return null;
    // A closed sheet may still be followed by planning. Promote only from the header,
    // including when cosmetic formatting (which otherwise removes that prefix) is off.
    const prefix = split.text.slice(0, header.index).trim();
    return {
        text: split.text.slice(header.index),
        reasoning: [split.reasoning, prefix].filter(Boolean).join('\n\n---\n\n'),
    };
}
