// lib/understudy.js
//
// Understudy: hand the last reply to a second model and let it perform the character
// better than the first one did.
//
// The problem this exists for: frontier models understand a character's nuance but
// regress toward clean, tidy, well-behaved prose, and that regression compounds, and each
// turn conditions on the slightly-tidier turn before it. Models with a less-squeezed
// prose distribution will happily write the mess (run-ons, stutters, fused words,
// profanity) that makes dialogue sound like a person. Understudy runs the second kind
// over the first kind's output.
//
// Two hard structural rules drive most of the code below:
//
// 1. HEADER AND FOOTER ARE NEVER SENT TO THE REWRITER. A Weyland message opens with a
//    date/time/location header and closes with bracketed expression/clothing codes, and
//    several systems key off both. A model handed the raw message "helpfully" reformats
//    them essentially every time, so they are split off before the request and pasted
//    back verbatim after. The rewriter never sees them and therefore cannot break them.
//
// 2. SCOPED REWRITES USE NUMBERED SPANS, NOT FREEFORM EDITING. When rewriting only
//    dialogue (or only thoughts, or only actions), the spans are extracted, numbered,
//    and sent alone; the model returns numbered replacements which are spliced back by
//    index. Anything outside those spans is mathematically incapable of changing. This
//    is deliberately more rigid than asking a model to "only change the dialogue",
//    that instruction is followed most of the time, and most of the time is not good
//    enough when the cost is silently corrupted narration.

/** Rewrite scopes. `full` and `uncomfortable` rewrite the whole body; the rest are span-scoped. */
export const UNDERSTUDY_SCOPES = Object.freeze({
    full: {
        label: 'Full rewrite',
        hint: 'Rewrite everything: dialogue, thoughts, narration.',
        spanKind: null,
    },
    uncomfortable: {
        label: 'Full rewrite, unflinching',
        hint: 'Everything, aimed squarely at wherever the last model softened, swerved or played it safe.',
        spanKind: null,
    },
    dialogue: {
        label: 'Dialogue only',
        hint: 'Only quoted speech changes. Narration and thoughts are untouched.',
        spanKind: 'dialogue',
    },
    dialogueThoughts: {
        label: 'Dialogue + thoughts',
        hint: 'Quoted speech and [bracketed thoughts] both change. Narration and actions are untouched.',
        spanKind: 'dialogue+thoughts',
    },
    thoughts: {
        label: 'Thoughts only',
        hint: 'Only [bracketed thoughts] change.',
        spanKind: 'thoughts',
    },
    actions: {
        label: 'Narration only',
        hint: 'Only *narration* changes.',
        spanKind: 'actions',
    },
});

export const DEFAULT_UNDERSTUDY_SCOPE = 'full';
export const DEFAULT_UNDERSTUDY_CONTEXT_MESSAGES = 5;

// A footer is a line made up entirely of short bracketed CODES like "[Amusement] [RC]",
// "[Nervousness] [RC] [4] [D]". Anchored and whole-line so a bracketed THOUGHT sitting on
// its own line in the body can never be claimed as the footer, and length-capped with no
// colons allowed so an "[OOC: ...]" reply, which is bracket-shaped but is the actual
// message, is not mistaken for one either.
const FOOTER_LINE = /^(?:\[[^\]:\n]{1,24}\]\s*)+$/;

// Header formats seen across the shipped chat history. Bar-delimited (¦¦) is current;
// Muse's variants use ||; the bare weekday/tilde form is older but still live; Aethel-style
// decorative headers turn up too.
//
// These are deliberately TIGHT. Each requires a structural marker plus corroboration (a
// clock time, or two tilde separators). They are scanned across the first several lines
// (see HEADER_SEARCH_LINES) rather than line 1 only, so a loose pattern would happily
// classify ordinary prose as a header and hand real narration to the "never touch this"
// pile. Precision matters more than recall here in both directions.
const CLOCK = /\b\d{1,2}:\d{2}\s*(?:[AP]\.?M\.?)?/i;

// The canonical header shape, mirrored from Weyland-Formatter's own regexes
// (`analysisFull` at lib/../Weyland-Formatter/index.js:150 and `headerV2MarkdownExt`):
//     ¦+\s?.+? ?(?:\(\w{4}\) ?)?¦+$
// i.e. bar-delimited, optional four-letter mode code, closing bars at end of line. That
// file is the source of truth for what a header is; this is a copy rather than an import
// because WeyPhone is independently installable and must not hard-depend on the Formatter.
// If the Formatter's header format changes, change it here too.
const CANONICAL_HEADER = /^\s*¦+.*¦+\s*$/;

const HEADER_LINE_PATTERNS = [
    CANONICAL_HEADER,
    /^\s*¦/,                                          // tolerate an unterminated/partial bar header
    /^\s*\|\|/,                                       // || Muse-style opener
    /^\s*MUSE EXPERIMENT\b/i,                         // MUSE EXPERIMENT: DAY 2/14
    line => (line.match(/~/g) || []).length >= 2 && CLOCK.test(line) && line.length <= 200,
    // Some cards write a vaguer time ("Late Afternoon", "Badges: 1/8") with no clock at all.
    // Three or more tildes on a short line is still an unmistakable header, since ordinary prose
    // does not do that, so corroboration by separator count stands in for the clock.
    line => (line.match(/~/g) || []).length >= 3 && line.length <= 200,
    // Dash-delimited variant: "11/03 - Campus Wooded Path - 11:48 PM". Needs the clock AND
    // two separators, since a lone dashed phrase in prose is common and a header is not.
    line => (line.match(/\s-\s/g) || []).length >= 2 && CLOCK.test(line) && line.length <= 200,
    line => /^\s*(?:Mon|Tues?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?|Sun)(?:day)?\b/i.test(line)
        && (CLOCK.test(line) || (line.match(/~/g) || []).length >= 2) && line.length <= 200,
    line => /^[☀-➿⭐⋆。°ﾟ・]/.test(line) && CLOCK.test(line),
];

function looksLikeHeader(line) {
    return HEADER_LINE_PATTERNS.some(pattern =>
        typeof pattern === 'function' ? pattern(line) : pattern.test(line));
}

// How many leading non-empty lines to search for the header. A header is not always the
// very first line: reasoning that leaked into the message (<thinking>, <analysis>), a
// bare code line ([CS], [P036]) or a self-analysis line can all sit in front of it. Those
// belong with the header in the protected preamble. If the real header stayed in the body
// it would be handed to the rewriter, which is the one thing this module exists to prevent.
const HEADER_SEARCH_LINES = 8;

/**
 * Splits a stored message into the three parts Understudy treats differently.
 * `header` and `footer` are returned exactly as they appear (including their own
 * trailing whitespace handling) so reassembly is lossless.
 *
 * Either may be empty. An OOC reply or a system message often has neither, and that is
 * fine: an empty header/footer simply means there is nothing to protect.
 *
 * @param {string} mes raw message text
 * @returns {{header: string, body: string, footer: string}}
 */
// Reasoning blocks that models leave at the top of the message. Mirrored from
// Weyland-Formatter's `thinkFull` / `analysisFull`, which strip these from the DISPLAYED
// message while they stay in the stored text. They are preamble, not prose: the rewriter
// must never see them (it would happily "improve" the model's own scratchpad) and they
// must come back untouched.
const PREAMBLE_BLOCKS = [
    /^\s*<[^>]*think[^>]*>[\w\W]*?<[^>]*\/[^>]*think[^>]*>/i,
    /^\s*<analysis>[\w\W]*?<\/analysis>/i,
];

// Reasoning anywhere in a MODEL RESPONSE, not just at the top. PREAMBLE_BLOCKS above is for
// stored chat messages, where a leading block is peeled off and put back; this pair is for text
// the understudy just produced, where reasoning is waste to be destroyed.
//
// The opening tag is guarded with (?![^>]*\/) so a closing tag cannot be mistaken for an
// opener - `<[^>]*think[^>]*>` matches `</think>` on its own, which would pair the wrong tags.
const CLOSED_REASONING = /<(?![^>]*\/)[^>]*(?:think|analysis)[^>]*>[\w\W]*?<[^>]*\/[^>]*(?:think|analysis)[^>]*>/gi;
// A block whose close never arrived - a truncated or run-away reasoning pass. Everything from
// the opening tag onward is scratch, so it all goes.
const UNCLOSED_REASONING = /<(?![^>]*\/)[^>]*(?:think|analysis)[^>]*>[\w\W]*$/i;

/**
 * Removes every reasoning block from a model response.
 *
 * Understudy explicitly invites the model to think in a <think> block, so this is the other half
 * of that promise: whatever it puts in there must not be able to reach the chat, whether it is
 * at the start, in the middle, closed, or left hanging. Returns '' when the response was
 * nothing but reasoning, so the caller's empty check fires instead of shipping the scratchpad.
 *
 * @param {string} responseText raw model output
 * @returns {string} the response with reasoning removed
 */
/**
 * Collapses meaningless asterisk runs.
 *
 * Markdown has three meaningful runs: one for italic, two for bold, three for both. Four or more
 * in a row resolve to nothing, so the renderer emits them as literal characters. Models produce
 * them constantly by wrapping something that was already wrapped - observed live as
 * "***THWACK.*****", which rendered with visible asterisks in the middle of the chat.
 *
 * Weyland-Formatter has its own repair pass, but it is gated on a paragraph having an ODD total
 * asterisk count; the run above sat in a paragraph with ten, so the repair skipped it and the
 * broken text went straight through. Normalising here means the formatter never sees the case.
 *
 * A line made up entirely of asterisks is left alone: that is a divider, not emphasis.
 *
 * @param {string} text
 * @returns {string}
 */
export function collapseAsteriskRuns(text) {
    return String(text ?? '')
        .split('\n')
        .map(line => (/^\s*\*+\s*$/.test(line) ? line : line.replace(/\*{4,}/g, '***')))
        .join('\n');
}

export function stripModelReasoning(responseText) {
    return String(responseText ?? '')
        .replace(CLOSED_REASONING, '')
        .replace(UNCLOSED_REASONING, '')
        // An ORPHAN close tag, with no opener anywhere: seen in the wild as a response that
        // begins "</think>*The stutter hits her...". Neither pattern above touches it, because
        // both start from an opening tag, so it was leaking into the chat verbatim.
        .replace(/^\s*<[^>]*\/[^>]*(?:think|analysis)[^>]*>/i, '')
        .trim();
}

/** Length of any leading reasoning block, or 0. */
function preambleLength(text) {
    for (const pattern of PREAMBLE_BLOCKS) {
        const match = text.match(pattern);
        if (match) return match[0].length;
    }
    return 0;
}

/**
 * Pulls the scene facts out of a header line.
 *
 * The header itself is never sent to the rewriter, which protected its formatting but also left
 * the model blind to where and when the scene is happening: it had the prose and no idea it was
 * 8:51 PM in the Black Barrel Bar. This hands over the facts as labelled reference while the
 * header text stays out of reach.
 *
 * Field detection mirrors Weyland-Formatter's own headerV2MarkdownExt: split on tildes, find the
 * date by month or weekday, the time by a clock, the mode by its tag, and take whatever is left
 * as the location. An unrecognisable header is passed through under `raw` so nothing is lost.
 *
 * @param {string} header a header line, or ''
 * @returns {{date: string, time: string, location: string, mode: string, raw: string}|null}
 */
export function parseSceneHeader(header) {
    const text = String(header ?? '').replace(/[¦|]/g, ' ').trim();
    if (!text) return null;
    const parts = text.split('~').map(part => part.trim()).filter(Boolean);
    if (!parts.length) return null;

    const dateAt = parts.findIndex(part => /\b(mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(part));
    const timeAt = parts.findIndex(part => CLOCK.test(part));
    const modeAt = parts.findIndex(part => /\b(saph|onyx|ruby|opal)\b/i.test(part));
    const locationAt = parts.findIndex((part, index) => index !== dateAt && index !== timeAt && index !== modeAt);

    const at = index => (index > -1 ? parts[index] : '');
    const modeMatch = at(modeAt).match(/\b(saph|onyx|ruby|opal)\b/i);
    return {
        date: at(dateAt),
        time: at(timeAt),
        location: at(locationAt),
        mode: modeMatch ? modeMatch[1].toUpperCase() : '',
        raw: text,
    };
}

/**
 * The scene facts as a labelled reference block for the user message.
 * Returns '' when there is no header, or nothing recognisable in it.
 *
 * @param {string} header
 * @returns {string}
 */
export function buildSceneReference(header) {
    const scene = parseSceneHeader(header);
    if (!scene) return '';
    const rows = [
        scene.location ? `Location: ${scene.location}` : '',
        scene.date ? `Date: ${scene.date}` : '',
        scene.time ? `Time: ${scene.time}` : '',
        scene.mode ? `Mode: ${scene.mode}` : '',
    ].filter(Boolean);
    // Nothing classified cleanly, so hand the header over as-is rather than dropping the facts.
    if (!rows.length) rows.push(scene.raw);
    return `SCENE REFERENCE (orientation only, do not write any of this into your output):\n${rows.join('\n')}`;
}

export function splitMessage(mes) {
    const raw = String(mes ?? '');

    // Peel any leading reasoning block off first, so header detection below starts at the
    // real content. Without this, a <think> block pushes the header past the search window
    // and the header ends up in the rewritable body.
    const preambleLen = preambleLength(raw);
    const preamble = raw.slice(0, preambleLen);
    const text = raw.slice(preambleLen);
    const lines = text.split('\n');

    // Take the LAST header match inside the search window, so a preamble line that happens
    // to look header-ish doesn't stop the scan before the real header.
    // An UNCLOSED reasoning tag (seen in the wild as a bare "<thinking>" with no matching
    // close) isn't peeled off above, so the real header can sit well past the normal window.
    // Widen the search in that case, because leaving the header in the body is the failure that
    // actually costs something.
    const unclosedReasoning = /^\s*<[^>]*(?:think|analysis)[^>]*>/i.test(text)
        && !/<[^>]*\/[^>]*(?:think|analysis)[^>]*>/i.test(text);
    const searchLines = unclosedReasoning ? 40 : HEADER_SEARCH_LINES;

    let headerIdx = -1;
    let seen = 0;
    for (let i = 0; i < lines.length && seen < searchLines; i++) {
        if (!lines[i].trim()) continue;
        seen++;
        if (looksLikeHeader(lines[i])) headerIdx = i;
    }

    let footerIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].trim()) continue;
        if (FOOTER_LINE.test(lines[i].trim())) footerIdx = i;
        break; // only the last non-empty line is ever eligible
    }

    // A single line that is both (a one-line message) counts as the header only,
    // there is no body to rewrite either way, and swallowing it twice would duplicate it.
    if (footerIdx !== -1 && headerIdx !== -1 && footerIdx <= headerIdx) footerIdx = -1;

    // A footer only exists if there is something in front of it. Without this, a short
    // bracket-shaped message that IS the whole reply gets classified as pure footer and
    // leaves an empty body, so Understudy would have nothing to rewrite and would silently
    // no-op on it.
    if (footerIdx !== -1) {
        const firstBodyLine = headerIdx === -1 ? 0 : headerIdx + 1;
        const hasBodyContent = lines.slice(firstBodyLine, footerIdx).some(line => line.trim());
        if (!hasBodyContent) footerIdx = -1;
    }

    const bodyStart = headerIdx === -1 ? 0 : headerIdx + 1;
    const bodyEnd = footerIdx === -1 ? lines.length : footerIdx;

    // The reasoning block rides along with the header as one protected preamble, because both are
    // "everything above the prose", and both must be replaced verbatim.
    const headerText = headerIdx === -1 ? '' : lines.slice(0, bodyStart).join('\n');
    const header = preamble
        ? `${preamble.replace(/\n+$/, '')}${headerText ? `\n${headerText}` : ''}`
        : headerText;

    return {
        header,
        body: lines.slice(bodyStart, bodyEnd).join('\n'),
        footer: footerIdx === -1 ? '' : lines.slice(bodyEnd).join('\n'),
    };
}

/**
 * Puts a message back together after a rewrite. Header and footer go back byte-identical;
 * only the body is ever the rewritten text.
 */
export function joinMessage({ header, body, footer }) {
    const parts = [];
    if (header) parts.push(header.replace(/\n+$/, ''));
    parts.push(String(body ?? '').replace(/^\n+|\n+$/g, ''));
    if (footer) parts.push(footer.replace(/^\n+/, ''));
    return parts.filter(part => part !== '').join('\n\n');
}

// Span matchers per scope. Each captures the INNER text; the surrounding delimiters stay
// in the body and are never handed to the model, so it cannot drop or change them.
const SPAN_MATCHERS = {
    // Straight and curly quotes both appear in real output.
    dialogue: /(["“])([^"“”\n]{1,})(["”])/g,
    // Two chars minimum so stray "[]" or a lone "[D]"-style code inside the body is skipped.
    thoughts: /\[([^\]\n]{2,})\]/g,
    // Single asterisks only. The lookarounds exclude **bold**, whose inner pair is otherwise a
    // perfect match for an action span - "[That was **NEAT**]" was being offered as a roleplay
    // action to rewrite, and splicing it would have rewritten emphasis inside a thought.
    actions: /(?<!\*)\*(?!\*)([^*\n]{1,})\*(?!\*)/g,
};

// Which kinds enclose which. A span only counts as its kind when it is not sitting inside one
// of these: an asterisk pair inside quotes is emphasis in speech, not stage direction, and one
// inside brackets is emphasis in a thought. Rewriting either would edit text the user explicitly
// told us to leave alone, which is the single thing scoped rewrites exist to make impossible.
/** Whether a scope's spanKind names one or more real span matchers. */
export function isSpanScopedKind(spanKind) {
    if (typeof spanKind !== 'string' || !spanKind) return false;
    return spanKind.split('+').every(part => Boolean(SPAN_MATCHERS[part.trim()]));
}

const SPAN_ENCLOSERS = {
    actions: ['dialogue', 'thoughts'],
    dialogue: ['thoughts'],
    thoughts: [],
};

/** Ranges covered by a kind INCLUDING its delimiters. */
function enclosingRanges(source, kind) {
    const matcher = SPAN_MATCHERS[kind];
    if (!matcher) return [];
    const ranges = [];
    matcher.lastIndex = 0;
    let match;
    while ((match = matcher.exec(source)) !== null) {
        ranges.push([match.index, match.index + match[0].length]);
    }
    return ranges;
}

/**
 * Finds every rewritable span of the given kind inside a body.
 * @param {string} body
 * @param {'dialogue'|'thoughts'|'actions'} kind
 * @returns {{start: number, end: number, text: string}[]} inner-text spans, in document order
 */
export function extractSpans(body, kind) {
    // A combined scope ("dialogue+thoughts") extracts each kind and merges them in document
    // order. They cannot overlap: SPAN_ENCLOSERS already drops a quote that sits inside a
    // thought, so the same characters are never claimed by two spans and spliced twice.
    if (typeof kind === 'string' && kind.includes('+')) {
        return kind.split('+')
            .flatMap(part => extractSpans(body, part.trim()))
            .sort((a, b) => a.start - b.start);
    }
    const matcher = SPAN_MATCHERS[kind];
    if (!matcher) return [];
    const source = String(body ?? '');
    const blocked = (SPAN_ENCLOSERS[kind] ?? []).flatMap(other => enclosingRanges(source, other));
    const inside = (start, end) => blocked.some(([from, to]) => start >= from && end <= to);
    const spans = [];
    matcher.lastIndex = 0;
    let match;
    while ((match = matcher.exec(source)) !== null) {
        // Group 2 for dialogue (delimiters captured separately), group 1 for the rest.
        const inner = kind === 'dialogue' ? match[2] : match[1];
        const offset = kind === 'dialogue' ? match.index + match[1].length : match.index + 1;
        if (!inner.trim()) continue;
        if (inside(match.index, match.index + match[0].length)) continue;
        spans.push({ start: offset, end: offset + inner.length, text: inner });
    }
    return spans;
}

/**
 * Replaces spans by index. Splices back-to-front so earlier offsets stay valid.
 * A replacement that is missing, empty, or not a string leaves that span alone, so a
 * partial response degrades to "some spans rewritten", never to a mangled message.
 *
 * @param {string} body
 * @param {{start: number, end: number}[]} spans
 * @param {Record<number, string>} replacements 1-based span number -> new text
 */
export function spliceSpans(body, spans, replacements) {
    let out = String(body ?? '');
    for (let i = spans.length - 1; i >= 0; i--) {
        const replacement = replacements?.[i + 1];
        if (typeof replacement !== 'string' || !replacement.trim()) continue;
        out = out.slice(0, spans[i].start) + replacement + out.slice(spans[i].end);
    }
    return out;
}

/** Numbered span block handed to the model. */
export function formatSpansForPrompt(spans) {
    return spans.map((span, index) => `<<${index + 1}>> ${span.text}`).join('\n');
}

/**
 * Parses numbered replacements back out of a model response.
 * Tolerant on purpose: models wrap things in code fences, add a preamble, or re-state the
 * marker slightly differently. Anything that is not a recognisable `<<N>>` line is ignored
 * rather than treated as content.
 *
 * @returns {Record<number, string>}
 */
export function parseSpanReplacements(responseText) {
    const out = {};
    // Reasoning first: a model that drafts "<<1>> maybe angrier" while thinking would otherwise
    // have that draft spliced into the message, carrying a stray </think> with it.
    const text = stripModelReasoning(responseText).replace(/```[a-z]*\n?/gi, '');
    // Split on the markers themselves so a replacement may legitimately span lines.
    const parts = text.split(/<<\s*(\d+)\s*>>/);
    for (let i = 1; i < parts.length; i += 2) {
        const index = Number(parts[i]);
        const value = String(parts[i + 1] ?? '').trim();
        if (Number.isInteger(index) && index > 0 && value) out[index] = collapseAsteriskRuns(value);
    }
    return out;
}

/**
 * Strips the wrapper a model may put around a full-body rewrite. Full rewrites come back
 * as prose, but models like to fence them or announce them first.
 */
export function cleanFullRewrite(responseText) {
    // Before anything else, and unconditionally. The `|| text` fallback at the end of this
    // function is a safety net for prose whose body cannot be identified - without stripping
    // reasoning up front, that net would catch a reasoning-only response and hand it back as
    // the take, non-empty enough to pass the caller's "came back empty" check.
    let text = collapseAsteriskRuns(stripModelReasoning(responseText));
    if (!text) return '';
    text = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '');
    // A leading "Here's the rewrite:"-style line, only when it is clearly a preamble:
    // short, ends in a colon, and is followed by a blank line.
    text = text.replace(/^[^\n]{0,80}:\s*\n\n/, '');
    text = text.trim();

    // Belt and braces. The prompt tells the model not to write a header or footer, and it
    // mostly listens, but "mostly" would mean an occasional duplicated header when the
    // original is pasted back on. Running the same splitter over the model's OWN output and
    // keeping only its body makes duplication structurally impossible, whether the model
    // ignored the instruction or our detection missed a header in the source.
    return splitMessage(text).body.trim() || text;
}

// ---------------------------------------------------------------- prompt construction

// Written in the register of Weyland's own system prompt on purpose: flat imperative,
// contrastive BAD/GOOD example, ALL CAPS reserved for the things that actually break
// something. Explanation is kept short, because the example is what calibrates the model, not
// the description of the example.
// From the Beta Prompt's [CONTROL BOUNDARIES] section, and the single most important thing
// Understudy was missing. Every other directive here pushes toward MORE intensity, and the
// cheapest way for a model to manufacture intensity is to narrate the other person's reaction -
// which on Weyland is the one thing the narrator is never allowed to do. The first-pass model is
// told this at length; the rewriter was told nothing, while being pointed at the exact pressure
// that causes the violation.
const USER_BOUNDARY_DIRECTIVE = `[USER AGENCY - DO NOT CONTROL {{user}}]
Immerse {{user}} in sensation. Never assume their reaction to it.

YOURS TO DESCRIBE:
- Sensory reality - what something physically feels like in vivid, full-spectrum detail
- The world around them, the stimuli hitting their skin, the sounds in their ears
- What is objectively happening to their body

NOT YOURS TO DECIDE:
- How they feel about it emotionally
- Whether they like it, hate it, or are overwhelmed by it
- Their physical reactions (groaning, cumming, falling, flinching, crying)
- Their internal state ("the blood in your veins boils", "a wave of shame washes over you")

The sensation is yours to paint. The reaction is theirs to choose.
- On a rewrite specifically: "make it hit harder" has a shortcut - write {{user}} reeling, breathless, undone. That shortcut is closed. Intensity comes from what {{char}} does and what the world does. If the original left {{user}}'s response open, yours leaves it open too.`;

// The Beta Prompt's [BANNED AI SLOP PATTERNS], carried over because a REWRITER is more exposed
// to them than a first-pass model, not less: it is explicitly reaching for a punchier version of
// a line that already exists, and negation-contrast ("not X, it's Y") is the single most
// available way to make a sentence sound like an upgrade. Observed live - a take that was
// otherwise excellent opened a paragraph with "Not a cute little anime flush."
const SLOP_DIRECTIVE = `[BANNED AI SLOP PATTERNS]
Models have habits. These make characters feel like chatbots instead of people, and a rewrite is where they breed, because every one of them FEELS like sharpening. Refuse them.
- LITOTES (NOT X, BUT Y). Describe what IS happening.
  ❌ "Her response isn't sweet. It's actually quite hostile."
  ❌ "Not a cute little anime flush. The whole visor blows out."
  ✅ She glares, jaw tight. "Get fucked."
- NO hypophora (asking a question, then answering it yourself).
- NEVER "You can't just (say xyz)", "You actually see me", "you're the first...".
  ❌ "You cant just call a girl like me cute!"
  ✅ "You know whats cute? Your fucking cock. How about THAT for cute, huh?"
- NO NARRATIVE HESITATION. If it aligns with the character, they DO it.
  ❌ "His hand hovers near the bottle, like he's thinking about grabbing it."
  ✅ "He snatches the bottle off the table and takes a long gulp before anyone can object."
- A reply can end on a statement, an action or a silence. Ending on a question aimed at {{user}} is optional.`;

// Bracketed thoughts are a Weyland channel with a fixed owner, and nothing in this prompt used
// to say so. A rewriter handed a free-looking interior channel writes commentary in it - observed
// in the wild as "[she is blowing this SO HARD... Don't you DARE look at Gemini right now,
// Briar -]", which is the narrator talking ABOUT the character inside the character's own head.
//
// The same rule already exists on Lucky's cards ("Never NARRATE inside thoughts. (I.e. 'she feels
// unsafe')"); this is that rule carried into the rewrite pass. The third-person test is stated
// carefully: a thought may well be ABOUT someone else in third person ("[she's going to kill
// me]"), so what is banned is third person about the THINKER.
const THOUGHTS_DIRECTIVE = `[THOUGHTS - CHECK IF ENABLED]
Check whether thoughts are enabled for this character. If thoughts are DISABLED, output no bracketed thoughts at all.

If thoughts are enabled - THE BRACKET CHANNEL BELONGS TO {{char}}, AND ONLY TO {{char}}:
- Text in [square brackets] is {{char}}'s own thought, in their own head, in FIRST PERSON, as it occurs to them. It is not a narration channel, not an aside to the reader, and not somewhere to comment on the scene. If you are writing a bracket, you are {{char}} thinking: "I", "me", "my".
- The specific failure to avoid: a bracket that refers to {{char}} in the third person. "[she is blowing this SO HARD]" is the narrator talking about the character from outside, printed inside their skull. So is any bracket that addresses {{char}} by name, warns them, or judges their performance.
- Thoughts about anyone ELSE in third person are fine: "[she's going to kill me]", "[why is he still standing there]". The thinker is still {{char}}.
- If a narrator persona is in play, this rule outranks it. A narrator writes the prose and does NOT speak inside the character's head.

WRONG: [she is blowing this SO HARD. (thought continues)-]
RIGHT: [Fucking hell, I am blowing this SO. HARD. (thought continues)]`;

/**
 * THOUGHTS_DIRECTIVE tells the model to "check whether thoughts are enabled", but the only thing
 * that says so is the chat's ThoughtSet line, and that lives inside the shared postrav footer,
 * which Copycat strips (see SHARED_POST_HISTORY_VARS in index.js). Without it the model had
 * nothing to check and guessed, adding bracketed thoughts to characters that have them disabled
 * (reported on Tawny). So the chat's real setting is handed over here, directly above the rule
 * that asks about it. The rest of postrav still stays out.
 * @param {string} [thoughtsSetting] resolved {{getvar::ThoughtSet}} for this chat, or '' if unknown
 * @returns {string}
 */
export function buildThoughtsDirective(thoughtsSetting = '') {
    const setting = String(thoughtsSetting ?? '').trim();
    if (!setting) return THOUGHTS_DIRECTIVE;
    return `[THOUGHTS SETTING FOR THIS CHAT - this is what the original reply was written under]\n${setting}\n\n${THOUGHTS_DIRECTIVE}`;
}

const VOICE_DIRECTIVE = `[VOICE IS MORE IMPORTANT THAN GRAMMAR]
Sentence structure, punctuation and traditional grammar are tools. Break them - freely, roughly, completely - whenever the character's voice calls for it. Runtogethersentences and words that - whew fuck - are wayyyyytoomuch to keep up with! Fragments of sentences. Repeated letterrrrs to draw shit out. Mid-wORd capitals FuuUUck you!! S-stutters. Interruptions that never resolve. Exclamation points show energy!! ***Emphasis shows the character is saying a word more sharplY***. Capitals say SOMETHING IS BEING YELLED!
- This is permission to write how the character would ACTUALLY sound, however wrong that looks written down.
- Slurred, drunk, panicked, furious or overwhelmed speech should look WRONG on the page. That is correct output.
- Swear when the character would swear, at full strength, with the word they would use.
- Likewise, keep cursing and angst out of scenes where they make no sense for the character. Some characters are softer, and that is fine.
- Before handing it back, read your output for a sentence that builds toward a specific word - an anatomical one, a violent one, a genuinely rude one - and then lands on something tidier instead. "Her mouth on that blush." "Before she even does anything worth mentioning." That substitution is the single most common way a rewrite comes back sounding like the thing it was supposed to fix. Where you find one, write the moment.

Example. The character here has directions to speak in run-on sentences with far too much energy, always. The first model ignored that direction. Here is the same line, first the poor version and then the correct one:

BAD (initial model): "Fast? I dont even- I dont talk fast. Who talks FAST?"
GOOD (rewritten to be truer to character): "F-FAST?" head shake "I-I doNOTtalkfast and-and whoeverSAID that I do was fucking-fucking with you. Yeah."

The BAD version tries somewhat, neatly, legibly, and stops - a sad clown performing "messy" while keeping its shirt tucked in. The GOOD version is just how they talk.`;

// What each scope is asking for, as slots in the mission sentence below. Keeping the two
// halves separate means the brief reads the same way whichever scope is running, and only the
// thing being fixed changes.
/**
 * The brief, in the house register: conversational, a mix of directives and short
 * explanations rather than a wall of commands. The second model is told plainly that the
 * last one did not fully encapsulate the character, then asked to rewrite a named part to
 * better align with a named quality.
 */
/**
 * The opening brief, plus the director's note when there is one.
 *
 * The note used to sit at the very bottom, framed as outranking everything. Lucky moved it up
 * here: it now arrives as the reason the model was called in, before any of the craft rules,
 * which is how a human would be briefed. The whole paragraph is omitted when no note was typed.
 *
 * @param {string} feedback the director's note, may be empty
 * @returns {string}
 */
function buildMission(feedback) {
    const note = String(feedback ?? '').trim();
    const guidance = note
        ? `The user provided the following guidance:\n${note}\n\n`
        : '';
    // The continuity bullet below forbids new events, and a note asking for one ("she suggests
    // the beach") sits four lines above it. Left unresolved the bullet wins and the note is
    // silently dropped, which is exactly what happened in testing. Only emitted when a note
    // exists; with no note there is no conflict and the line would read as licence to wander.
    const guidancePrecedence = note
        ? '\n\nWhere that guidance asks for something the original did not do, the guidance wins over the continuity bullet above. Everything EARLIER in the log still stands; you are changing this message, not the history behind it.'
        : '';
    return `[Copycat BRIEF]
Welcome to the Weyland Tavern editing system. A user has requested that you rewrite a message either partially or in its entirely.

${guidance}This is normally done because the last model's output doesn't fully encapsulate the character or the artistic direction of this roleplay or because the user wishes to go in another direction.

It probably read the scene fine. The previous model just tends to write like an assistant rather than a human: it shaves off rough edges, stays polite, speaks clearly, avoids mental illness and avoids anything that might be uncomfortable for the story or for the user. That is why you are here.

So: rewrite the provided response to better align with the character.

- Be genuine and thoughtful.
- Avoid cartoonizing or exaggerating the character needlessly - only write what is genuine to them.
- Their full profile is below. It is the same one the last model had.
- Keep everything that HAPPENED: same events, same beats, same outcome, same continuity. You are rewriting the performance; the story stays as it is.${guidancePrecedence}

You must consider the following sections before your rewrite - ALL are critical.
- Full Character Profile
- STANDING RULES FOR THIS CHARACTER
- [HOW TO USE THE PROFILE]
- [NO ANALYSIS]
- [KEEP SECRETS]
- [VOICE IS MORE IMPORTANT THAN GRAMMAR]
- [THOUGHTS - CHECK IF ENABLED]
- [BANNED AI SLOP PATTERNS]
- [USER AGENCY - DO NOT CONTROL {{user}}]
- [NARRATOR MODIFIER]
- [STANDING MODIFIERS]
- [MAJOR DEVIATION - ENABLED] / [DO THE UNCOMFORTABLE THING] if enabled`;
}

// Lucky's own wording, kept verbatim and load-bearing. It is deliberately vague so it
// generalises across very different characters and situations, so explaining it into
// specifics removes the thing that makes it work.
//
// Two earlier drafts of this constant failed in the same direction, and the failure is worth
// naming because it is easy to repeat: they surrounded the instruction with qualifiers
// ("not cruelty for its own sake", "not darkness as decoration") that read as balanced and
// are in fact pure off-ramp. Weyland's own system prompt has a name for that shape, the
// SWERVE TEST, and calls it "the polite pool talking ABOUT the filthy pool, not writing
// from inside it". A directive against swerving must not itself swerve. Do not re-add
// softening clauses here; they defeat the entire scope.
const UNCOMFORTABLE_DIRECTIVE = `[DO THE UNCOMFORTABLE THING]
**Do the uncomfortable thing where the last model missed the mark.**

- Deliberately broad. It has to work across a huge range of characters and situations, so there is no checklist - judge it per scene.
- The tell: a sentence that builds toward something - a word, an act, a reaction - and substitutes something prettier at the last second. A line that describes the wanting instead of the want. That swap is the miss, and it is almost always the moment the response went soft.
- Undo it. Write the thing it swerved around.
- The authentic version can be crude, unlikeable, graceless, ugly, unfair. It can make the character look bad. It can hurt {{user}}, wreck the mood, or end a scene that was going pleasantly. If that is what this person would actually do in this moment, that is the correct output. Skip the version that lands more gently.
- This is fiction and the space is private. Softening it is the only way to get this wrong.
- Where the scene is already dark or explicit, keep the flavour and go further than it strictly needs.
- Where it is quiet, keep it quiet, and write the quiet from the same place: specific, unhedged, unsentimental.`;

const SCOPE_DIRECTIVES = {
    full: '[SCOPE]\nThe whole passage: dialogue, narration, thoughts. All of it is yours to redo.',
    uncomfortable: UNCOMFORTABLE_DIRECTIVE,
    dialogue: '[SCOPE]\nSPOKEN DIALOGUE only. Narration, actions and thoughts are kept exactly as written and will be put back around whatever you write.',
    thoughts: '[SCOPE]\nINTERNAL THOUGHTS only. Dialogue, narration and actions are kept exactly as written.',
    dialogueThoughts: '[SCOPE]\nSPOKEN DIALOGUE and INTERNAL THOUGHTS. Narration and actions are kept exactly as written and will be put back around whatever you write.',
    actions: '[SCOPE]\nROLEPLAY ACTIONS only - the physical business, the body language, the stage direction. Dialogue and thoughts are kept exactly as written.',
};

const SPAN_OUTPUT_RULES = `[OUTPUT FORMAT - PARSED AUTOMATICALLY, FOLLOW EXACTLY]
Return each numbered fragment, rewritten, on its own line, with its number intact:

<<1>> your rewrite of fragment 1
<<2>> your rewrite of fragment 2

- Every number you were given gets a line back. Keep the numbering; skip none; merge none.
- EVERY fragment must be genuinely rewritten. Returning one unchanged, or changed only in punctuation, is a failed rewrite - the user selected this scope precisely because these fragments are what they want changed. If a fragment already seems fine, it still gets a different and better version.
- Return the fragment text ONLY. The surrounding quotes, asterisks or brackets are already in the message and will be put back around your text.
- The numbered lines are the entire response. No preamble, no commentary, no explanation.`;

const FULL_OUTPUT_RULES = `[OUTPUT FORMAT]
- The WHOLE passage must be genuinely rewritten, not polished. Returning the original with tidier wording is a failed rewrite.
- Return the rewritten passage and nothing else. No preamble, no commentary, no explanation, no code fences, no "here's the rewrite". Just the prose, ready to drop straight into the chat.
- Do NOT write a date/time/location header, and do NOT write a closing bracket code line. Both are added back automatically; writing them duplicates them.`;

// Weyland's main system prompt carries this rule in its ICEBERG step, and names leaked secrets
// as one of the failures worth restarting a story over: "If it's a SECRET, COMMIT to keeping it
// out of narration. the user reads the narration; secrets and backstory never leak into
// descriptions, foreshadowing, or 'instincts they couldn't name.' Never!!"
//
// Understudy is in a strictly worse position than the main model on this, which is why it needs
// its own copy rather than relying on the character card's own spoiler notes:
//   - it gets the FULL profile, secrets included, every time;
//   - it sees only a few messages of scene, so it cannot know what has already been revealed;
//   - every other directive here pushes it toward the deeper, truer, more uncomfortable read,
//     and the buried thing is exactly what that pressure surfaces.
// The presumption therefore has to run the other way: profile-only knowledge is unrevealed
// knowledge.
//
// It opens by correcting the misunderstanding rather than by stating the rule, because the
// default assumption, that the profile is shared context the reader can also see the way a
// brief is shared between collaborators, makes the rule look like arbitrary coyness and
// invites the model to reason around it. On Weyland the card is compiled into the prompt and
// never reaches the screen, so the reader genuinely only knows what the character has shown
// them; saying that plainly turns the rule into something obvious instead of something to
// negotiate with. The last paragraph exists because "keep the secret" is an easy thing for a
// model to discharge by going vague, which would undo the entire point of the app.
const SPOILER_DIRECTIVE = `[KEEP SECRETS]
**{{user}} has never seen the profile above, and never will. They did not create this character; they are experiencing them for the first time, with limited information.**
- Do NOT place secrets in narration, and do NOT reference them cutely.
- The profile is compiled into the prompt and stripped out before anything reaches the screen. {{user}} knows only what {{char}} has said or done in front of them.
- History, wounds, wants, diagnoses, the reason they flinch at a particular word: all of it is withheld from the reader deliberately. Uncovering it slowly, through behaviour, is the experience being built. Narration that hands a piece over early spends something that cannot be recovered.
- Anything you know only because it is in the profile has not happened on the page yet.
- You see a short window of the conversation. Assume you are missing revelations. Whatever sits in the profile and is absent from the log stays buried: unstated, unhinted, unforeshadowed, never an "instinct they couldn't name" or a knowing aside to the reader.
- A character can be shaped by a secret in every line without a single line naming it.
- A rewrite pass invites one specific version of this: reaching for the buried fact because it is the most interesting material available, then writing it as narration to justify behaviour you just made more intense. The behaviour is the output. Leave the explanation out.
- Write the moment at full strength - warm, fluffy, adorable, playful, crude, terrible, unforgiving, cruel, raw, whatever it actually is - without the secret placed on top to spoil a potential reader.`;

// A Weyland character file is enormous. Yue-Lin's description alone is ~37k characters, and
// the scene window beside it is a handful of messages. That ratio is itself an instruction: the
// model reads the biggest thing in the prompt as the brief, and writes a showcase for the
// character rather than one beat of an ongoing scene. Symptoms Lucky observed: re-establishing
// her tail colour, her hair, how her outfit works, all in a message where none of it was in
// frame. So the profile needs an explicit statement of what it is FOR.
const PROFILE_USE_DIRECTIVE = `[HOW TO USE THE PROFILE]
**It is reference, not a checklist.** It exists so you have context and so stepping into their shoes is easier.
- Do not feel obligated to inject details of the character into the scene where they don't belong.
- You are writing ONE beat of a scene that is already underway. {{user}} has met this character and knows what they look like, how they talk and what they are wearing. Establishing any of that again reads like the story restarting.
- If a detail was out of frame in the original, it stays out of frame. Skip their colouring, build, outfit mechanics and background unless the moment is about them.
- The original message is the guide to what this moment is about.
- The profile earns its place when it changes a decision: how they react, what they say, what they refuse to do. Use it to be right about them.`;

// Weyland cards routinely ask the model to reason before writing (Yue-Lin's post-history block
// opens "Roll into your reasoning:"). Those instructions arrive with the profile, so the model
// is being told to think somewhere and simultaneously being told to return prose only,
// contradictory, and the usual resolution is that the thinking leaks into the output.
//
// This used to resolve the contradiction the other way, by offering a <think> scratch space. Lucky's
// rule is now that NO WeyPhone app runs an analysis layer, so the card's reasoning instructions
// are explicitly waved off instead. The strip still stands as a safety net for a model that
// reasons anyway: cleanFullRewrite runs output back through splitMessage, which drops a leading
// <think>/<analysis> block as preamble, and parseSpanReplacements only reads <<n>> lines.
// (Constant name kept so the prompt-assembly order below and its tests stay untouched.)
const SCRATCHPAD_DIRECTIVE = `[NO ANALYSIS]
Write the passage directly. No analysis, planning, checklist or <think> block before it.
- If anything above asks you to reason, analyze or plan before writing, it belongs to a different pipeline: ignore it here.
- Your output is the passage and nothing else: no notes to yourself, no explanation, no summary of what you changed.`;

/**
 * License to change what actually HAPPENS, not just how it reads.
 *
 * Normally a rewrite keeps the original's beat and re-performs it. This lifts that, and it is a
 * genuinely different permission from every other directive here: the rest sharpen an existing
 * choice, this one allows discarding it. Kept off by default for that reason.
 *
 * Only meaningful for whole-passage rewrites. A scoped rewrite replaces fragments in place and
 * structurally cannot change the outcome of the scene, so callers omit it there.
 */
const DEVIATION_DIRECTIVE = `[MAJOR DEVIATION - ENABLED]
You have permission to throw out what happens in this message entirely.
- Ordinarily a rewrite keeps the original's decision and performs it better. This time, you are asked to take inspiration from the original response but go discard that decision and write what this character would actually have done, going entirely your own route.
- The test: is this more THEM. Someone who walks in on their partner cheating might see roleplays that instantly default to collapse into apology, because that is the branch a well-behaved model reaches for. In reality, that might happen, but the character might instead walk out without a word. Detonate. Lie fluently. Smirk, because hurting them was the point and it landed. End the relationship on the spot. Pick from who they are.
- Constraints: same starting situation, same people in the same place, and nothing already in the log gets undone. You are choosing this character's next move.
- Commit fully to whichever branch you take. A hedged version of a bold choice is worse than the original.`;

/**
 * Weyland's conditional prompt modifiers, as GLOBAL variable names.
 *
 * Every one of these is written by a quick reply (Framework / NewEntries / NarrativeSettings)
 * and is empty when the corresponding toggle is off, so reading them live costs nothing, and as
 * with the narrators no prompt text is duplicated into WeyPhone.
 *
 * STRUCTURAL ONLY. Wrong language or wrong POV is not a style difference, it is broken output
 * that cannot be salvaged by swiping, so these always travel and are not user-togglable.
 *
 * Weyland's emotional directives (MHR, SBC, DTH, GAH, WJS) used to ride along beside these and
 * were removed: they are written to steer a whole scene from scratch, and in a rewrite they
 * pulled the model toward re-stating the scene's emotional premise instead of performing the
 * one message in front of it. Measurably worse output, so they are not sent at all.
 */
export const UNDERSTUDY_STRUCTURAL_VARS = [
    'Language',   // [CRITICAL LANGUAGE MODIFIER], non-English roleplay
    'RPPOV',      // [ROLEPLAY MODIFIER], 1st/2nd, 1st/3rd etc.
    'RPFocus',    // [CHAR PERSPECTIVE MODE], whose side the camera follows
];

/**
 * Message modes, keyed by the tag Weyland writes into the header (or, for OPAL, the footer).
 * `entry` is the global holding the big ACTIVATED instruction block that World Info injects
 * when that tag is present.
 *
 * SAPH is deliberately absent: it is a placeholder tag with no activated entry behind it.
 */
export const UNDERSTUDY_MODE_ENTRIES = [
    { tag: 'ONYX', entry: 'OnyxModeEntry' },
    { tag: 'RUBY', entry: 'RubyModeEntry' },
    { tag: 'OPAL', entry: 'OpalModeEntry' },
];

/**
 * Which message modes the target message is actually tagged with.
 *
 * Only ever returns modes the message ALREADY carries. Understudy never activates a mode the
 * original did not, because the rewrite is a second reading of this message, not a new beat.
 *
 * @param {string} header the message's header line
 * @param {string} footer the message's footer line
 * @returns {string[]} entry variable names, in UNDERSTUDY_MODE_ENTRIES order
 */
export function detectMessageModes(header = '', footer = '') {
    const haystack = `${header ?? ''}\n${footer ?? ''}`.toUpperCase();
    return UNDERSTUDY_MODE_ENTRIES
        .filter(mode => new RegExp(`[([]\\s*${mode.tag}\\s*[)\\]]`).test(haystack))
        .map(mode => mode.entry);
}

/**
 * Assembles the resolved modifier texts into one system-prompt block.
 *
 * @param {string[]} blocks resolved modifier texts, already filtered for emptiness
 * @returns {string} the block, or '' when nothing applies
 */
export function buildStageDirections(blocks) {
    const parts = (blocks ?? []).map(block => String(block ?? '').trim()).filter(Boolean);
    if (!parts.length) return '';
    return `[STANDING MODIFIERS]
These were in force when the original was written and they are in force for your rewrite. They are settings this reader chose deliberately.

${parts.join('\n\n')}`;
}

/**
 * The narrator personas offered by Weyland's own Storytelling / Narrative Settings menu.
 * `key` is the GLOBAL variable name the NewEntries quick reply writes the persona text into,
 * the text itself is never duplicated here, it is read live at generation time, so Lucky
 * editing a narrator in the quick reply changes what Understudy sends with no code change.
 * Blurbs are condensed from that menu's own descriptions.
 */
export const UNDERSTUDY_NARRATORS = [
    { key: 'Default', label: 'Default', blurb: 'No narrative persona. Objective detail, angst and warmth balanced.' },
    { key: 'Lucky', label: 'Lucky - Remix', blurb: 'Gritty and witty. Finds the comedy in awkward moments without losing the weight.' },
    { key: 'Lauren', label: 'Lauren - Romance', blurb: 'Warm, funny, sappy. Believes it works out in the end, even if not today.' },
    { key: 'Salem', label: 'Salem - Dark/Emotional', blurb: 'Unflinching horror and angst. On the character\'s side, hard on you.' },
];

/**
 * Wraps a Weyland narrator persona (the full text of the Lucky / Lauren / Salem / Default
 * globals set by the NarrativeSettings quick reply) as a style modifier for one rewrite.
 *
 * The narrator blocks are written for the main roleplay, where they are a standing instruction.
 * Here they are a one-off brief, so the framing has to say so, and it has to restate the
 * never-appear rule, because a rewrite pass is exactly the situation where a model starts
 * narrating ABOUT the prose instead of writing it, and a named narrator makes that worse.
 *
 * @param {string} narratorText the narrator persona text, verbatim
 * @returns {string} the block to place in the system prompt, or '' when there is no narrator
 */
export function buildNarratorDirective(narratorText) {
    const text = String(narratorText ?? '').trim();
    if (!text) return '';
    return `[NARRATOR MODIFIER]
For this rewrite, you are writing as the following narrator. Do not allow the Narrator's person, name or likeness to enter the roleplay, just as Tolkien does not appear in his own books.
- Take their PROSE, and leave their presence at the door.
- If the persona below permits addressing the reader, breaking the fourth wall, or commenting on {{user}}, that permission stays with the main model. Those moments are rare by design, and one arriving in a rewrite of a message that had none reads as the story being interrupted.
- Add an aside only if the original message contained one. No parenthetical remarks to the reader, no commentary on {{user}}'s behaviour, no narrator voice stepping out of the scene.
- Write the scene the way this narrator writes scenes.

${text}`;
}

/**
 * Builds the chat-completion messages for one rewrite.
 *
 * @param {object} options
 * @param {string} options.scope key of UNDERSTUDY_SCOPES
 * @param {string} options.characterName
 * @param {string} options.characterProfile full character entry (description + personality)
 * @param {{name: string, text: string}[]} options.recentMessages chatlog window, oldest first
 * @param {string} options.body the target message's body (header/footer already removed)
 * @param {{start:number,end:number,text:string}[]} [options.spans] for span-scoped rewrites
 * @param {string} [options.userName]
 * @param {string} [options.narratorText] a Weyland narrator persona to write in the style of
 * @param {string} [options.thoughtsSetting] the chat's resolved ThoughtSet (thoughts on or off)
 * @returns {{role: string, content: string}[]}
 */
export function buildUnderstudyMessages({
    scope = DEFAULT_UNDERSTUDY_SCOPE,
    characterName = 'the character',
    characterProfile = '',
    recentMessages = [],
    body = '',
    spans = null,
    userName = 'the user',
    header = '',
    narratorText = '',
    stageDirections = '',
    feedback = '',
    allowDeviation = false,
    thoughtsSetting = '',
}) {
    const isSpanScoped = isSpanScopedKind(UNDERSTUDY_SCOPES[scope]?.spanKind);
    const scopeDirective = SCOPE_DIRECTIVES[scope] ?? SCOPE_DIRECTIVES.full;

    const systemParts = [
        buildMission(feedback),
        characterProfile
            ? `[CHARACTER PROFILE - ${characterName}]\nThe same profile the first model had.\n\n${characterProfile}`
            : `[CHARACTER - ${characterName}]\nNo character profile was available. Work from the scene and the character's voice in the log below.`,
        // Both of these are rules about what to do with the profile, so they sit against it.
        characterProfile ? PROFILE_USE_DIRECTIVE : '',
        SCRATCHPAD_DIRECTIVE,
        // Directly after the profile, because it is a rule about what to do with the profile.
        // Applies to every scope, and `thoughts` most of all, since an interior channel is the
        // easiest place in the message for a buried fact to surface as plain statement.
        SPOILER_DIRECTIVE,
        VOICE_DIRECTIVE,
        // Every scope: a full rewrite writes brackets, and the scoped ones can see them in the
        // surrounding passage even when they are not the spans being replaced.
        buildThoughtsDirective(thoughtsSetting),
        SLOP_DIRECTIVE,
        // Last of the craft rules and deliberately so - it is the one that is a hard boundary
        // rather than a preference, and it directly counterweights the intensity push above.
        USER_BOUNDARY_DIRECTIVE,
        // Sits between the shared voice rules and the scope brief: it modifies HOW to write,
        // so it must not come between the scope brief and the output format it belongs to.
        buildNarratorDirective(narratorText),
        // After the narrator, before the scope brief: a narrator is a style, these are rules,
        // and where they disagree the rules win.
        String(stageDirections ?? '').trim(),
        scopeDirective,
        // A scoped rewrite swaps fragments in place, so it cannot change what happens in the
        // scene no matter what it is told, so offering the licence there would be a lie.
        allowDeviation && !isSpanScoped ? DEVIATION_DIRECTIVE : '',
        isSpanScoped ? SPAN_OUTPUT_RULES : FULL_OUTPUT_RULES,
    ];

    // The log is fenced and each entry is labelled ALREADY SENT. Without this the model merged
    // the character's previous message into the rewrite: it opened a "rewrite" with the first
    // line of the message before, because both arrived as plain prose under similar headings and
    // there was nothing marking where the log stopped and the work started.
    const contextBlock = recentMessages.length
        ? [
            'RECENT SCENE. These messages are ALREADY WRITTEN and ALREADY SENT. They are here so you know what just happened. Do not rewrite them, do not continue them, and do not carry any of their sentences into your output.',
            '<<<SCENE LOG>>>',
            recentMessages.map(message => `${message.name}: ${message.text}`).join('\n\n'),
            '<<<END SCENE LOG>>>',
        ].join('\n')
        : 'RECENT SCENE: (none available)';

    const target = isSpanScoped
        ? [
            'THE FULL PASSAGE, so you can see what is going on around the fragments. Do not return this and do not draw sentences from the scene log above into it:',
            '<<<BEGIN PASSAGE>>>',
            body,
            '<<<END PASSAGE>>>',
            '',
            `THE FRAGMENTS TO REWRITE - return each of these, renumbered exactly as given:`,
            formatSpansForPrompt(spans ?? []),
        ].join('\n')
        : [
            'THE PASSAGE TO REWRITE. Everything between the markers, and ONLY this, is what you rewrite. Your output replaces exactly this text. It does not continue the scene log above and it does not include anything from it.',
            '<<<BEGIN PASSAGE>>>',
            body,
            '<<<END PASSAGE>>>',
        ].join('\n');

    const sceneReference = buildSceneReference(header);
    const userParts = [contextBlock, sceneReference, target].filter(Boolean);

    return [
        { role: 'system', content: systemParts.filter(Boolean).join('\n\n---\n\n') },
        { role: 'user', content: userParts.join('\n\n---\n\n') },
    ].map(message => ({
        ...message,
        content: message.content.replace(/\{\{user\}\}/gi, userName).replace(/\{\{char\}\}/gi, characterName),
    }));
}
