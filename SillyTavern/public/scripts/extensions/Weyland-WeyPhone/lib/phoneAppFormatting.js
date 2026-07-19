/**
 * @typedef {{text: string, timestamp?: string, boldPrefix?: string}} PhoneAppItem
 * @typedef {{title: string, items: Array<PhoneAppItem>}} PhoneAppSection
 * @typedef {{sections: Array<PhoneAppSection>}} PhoneAppParseResult
 */

// Matches a markdown h2 section header, e.g. "## WEYLAND ALERTS" — WeyPhone's own prompts
// (lib/phoneAppPrompts.js) explicitly request this exact convention, unlike the prior milestone
// attempt's real !Phone command, which had no consistent machine-parseable marker at all.
const SECTION_HEADER_RE = /^##\s+(.+)$/gm;

// Matches a markdown bullet item, e.g. "- [10:52 PM] some text" or "- some text with no timestamp".
const BULLET_ITEM_RE = /^-\s+(.+)$/gm;

// A bare time-of-day in square brackets at the start of an item's text, e.g. "[10:52 PM]" or
// "[9:14 AM]" — the AM/PM suffix is optional so a 24-hour timestamp like "[22:52]" also matches
// rather than being left embedded in item.text (phoneAppPrompts.js's SHARED_FRAMING only actually
// asks for "[10:52 PM]"-style 12-hour timestamps, but real model output can still drift to 24-hour
// notation, so this stays tolerant of both). `\s*` (rather than `\s?`) between the time and AM/PM
// also tolerates a stray double space some captured output has shown.
const TIMESTAMP_RE = /^\[(\d{1,2}:\d{2}(?:\s*[AaPp]\.?[Mm]\.?)?)\]\s*/;

// Real captured Discord output wraps usernames in markdown bold (e.g. "**@luckypaww** — ...")
// even though the shared prompt framing explicitly says "plain markdown only" with no inline
// styling — matches this codebase's established pattern of the model not perfectly following its
// own formatting instructions (see the prior HTML-based parser's header/nesting deviations).
// Unwraps `**bold**`/`__bold__` (and the rarer `***bold-italic***`/`___bold-italic___`) down to
// their inner text so no emphasis markers ever reach the rendered UI. Applied to both item text
// and section titles.
//
// Deliberately does NOT match single `*`/`_` (would-be italic markers): real captured output has
// only ever been observed to use double/triple wrapping (e.g. bold-wrapped Discord/Yik Yak
// usernames like "**@luckypaww**"), and single-char alternatives are unsafe here — usernames in
// this parser's real fixtures routinely contain bare underscores (e.g. "@belle_281"), so two
// unrelated single `_`/`*` tokens in the same line/section body would cross-word false-pair and
// the regex would splice everything between them together, corrupting real text (e.g.
// "shoutout to under_score and also foo_bar" would wrongly become "underscore and foobar").
const MARKDOWN_EMPHASIS_RE = /(\*\*\*|___|\*\*|__)(.+?)\1/g;

/**
 * Strips markdown emphasis markers (bold/italic) from a string, unwrapping the marked text rather
 * than deleting it, then collapses whitespace. Never throws.
 * @param {string} text
 * @returns {string}
 */
export function stripMarkdownEmphasis(text) {
    if (!text) return '';
    return text.replace(MARKDOWN_EMPHASIS_RE, '$2').replace(/\s+/g, ' ').trim();
}

// Matches ONLY a bold/italic span at the very start of an item's text (e.g. Chronicle's own
// "**Short Headline** rest of the sentence" convention, or Discord's "**@luckypaww** — ..."). Used
// to capture which portion of an item's text was originally bold-marked before
// stripMarkdownEmphasis unwraps ALL emphasis markers indiscriminately — the shared parser stays
// app-agnostic (it doesn't know "Chronicle" or "Discord" as concepts), so it just records this as
// an optional boldPrefix field; deciding whether to actually render it distinctly is the
// renderer's job (see lib/panel.js's Chronicle-specific branch in renderPhoneAppScreen).
const LEADING_EMPHASIS_RE = /^(\*\*\*|___|\*\*|__)(.+?)\1/;

/**
 * Parses WeyPhone's own markdown-formatted phone-app output (see lib/phoneAppPrompts.js for the
 * format this is built against) into a structured `{ sections }` shape for the phone-app UI to
 * render. Built against real live-captured output (see this milestone's Task 7 report), not an
 * idealized reading of the prompt — real output can still deviate from the requested convention:
 * captured Discord output wraps usernames in `**bold**` despite the prompt saying "plain markdown
 * only" (handled by stripping emphasis markers below), and the model doesn't always follow the
 * discord prompt's explicit per-channel-header instruction — it can still emit a leading empty
 * "## DISCORD" wrapper header before the real "## #channel" sub-headers, or (if it ignores the
 * per-channel instruction entirely) one single flat "## DISCORD" section with every message as a
 * direct bullet. Sections with zero items (the empty wrapper case) are dropped here; a flat
 * section with real items still survives as one section — see renderPhoneAppScreen in
 * lib/panel.js for how a section title that's redundant with the app's own panel header (e.g. a
 * literal "DISCORD" section under the "Discord" screen) gets suppressed at render time instead.
 *
 * Degrades gracefully rather than throwing on unparseable/empty input.
 * @param {string} rawText
 * @returns {PhoneAppParseResult}
 */
export function parsePhoneAppOutput(rawText) {
    if (!rawText || typeof rawText !== 'string') return { sections: [] };

    try {
        const headers = [...rawText.matchAll(SECTION_HEADER_RE)];
        if (headers.length === 0) return { sections: [] };

        const sections = [];
        for (let i = 0; i < headers.length; i++) {
            const title = stripMarkdownEmphasis(headers[i][1]);
            if (!title) continue;

            const bodyStart = headers[i].index + headers[i][0].length;
            const bodyEnd = i + 1 < headers.length ? headers[i + 1].index : rawText.length;
            const body = rawText.slice(bodyStart, bodyEnd);

            const items = [];
            for (const match of body.matchAll(BULLET_ITEM_RE)) {
                let text = match[1].trim();
                if (!text) continue;
                const timestampMatch = text.match(TIMESTAMP_RE);
                const item = {};
                if (timestampMatch) {
                    // Collapse a tolerated double-space between the time and AM/PM (e.g.
                    // "10:52  PM") down to a single space rather than preserving it verbatim.
                    item.timestamp = timestampMatch[1].replace(/\s+/g, ' ');
                    text = text.slice(timestampMatch[0].length).trim();
                }
                const leadingMatch = text.match(LEADING_EMPHASIS_RE);
                if (leadingMatch) {
                    const boldPrefix = stripMarkdownEmphasis(leadingMatch[2]);
                    if (boldPrefix) item.boldPrefix = boldPrefix;
                }
                item.text = stripMarkdownEmphasis(text);
                if (item.text) items.push(item);
            }

            // Real captured output sometimes emits a leading section header with no bullets
            // under it before the actual content starts (e.g. a bare "## DISCORD" followed by
            // per-channel "## #announcements" sub-headers) — drop these rather than rendering an
            // empty section header with nothing under it.
            if (items.length === 0) continue;

            sections.push({ title, items });
        }

        return { sections };
    } catch {
        return { sections: [] };
    }
}
