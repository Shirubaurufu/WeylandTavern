// Preparation is private even when generation stops before its closing marker.
// A closed block can precede any reply format; only an unclosed block needs a
// recognised reply header to recover a response. Never require headers of bare replies.
const SCENE_OPEN = /^\s*(?:SCENE SHEET|\[SCENE SHEET\])[ \t]*\r?(?:\n|$)/i;
const SCENE_CLOSE = /^[ \t]*(?:END OF SCENE SHEET|\[END OF SCENE SHEET\])[ \t]*\r?$/im;
const TAG_OPEN = /^\s*<(analysis|think)>/i;

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
    const headers = [text.match(REPLY_HEADER), bad];
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
    let rest = text;
    while (rest) {
        const scene = rest.match(SCENE_OPEN);
        const tag = scene ? null : rest.match(TAG_OPEN);
        const opening = scene ?? tag;
        if (!opening) break;

        const body = rest.slice(opening[0].length);
        const closing = body.match(scene ? SCENE_CLOSE : new RegExp(`</${tag[1]}>`, 'i'));
        const header = closing ? null : findReplyHeader(body);
        const boundary = closing ?? header;
        const end = boundary?.index ?? body.length;
        reasoning.push((scene ? opening[0] + body.slice(0, end) : body.slice(0, end)).trim());
        // No closing marker or header means the entire remainder is unfinished preparation.
        rest = boundary ? body.slice(end + (closing ? closing[0].length : 0)).trim() : '';
    }
    return { text: rest, reasoning: reasoning.filter(Boolean).join('\n\n---\n\n') };
}
