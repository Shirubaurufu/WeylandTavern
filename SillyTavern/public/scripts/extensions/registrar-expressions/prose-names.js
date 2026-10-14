// Recognises character names written in ACTION prose, so a scene that never tags its speaker still
// shows them:
//
//     *Bob runs down the street after her.* "Serra, wait!"      -> Bob's sprite, NOT Serra's
//
// Why this is deliberately narrow (the old TODO in index.js warned it would "produce false positives
// if non-present names are mentioned"):
//   - Only `*action*` spans are read for names. Quoted dialogue is never scanned, so a name someone
//     SHOUTS ("Serra, wait!") never summons that person.
//   - The name must be the SUBJECT: the first words of the span, or the first words of a sentence in
//     it. "*Serra glares at Bob.*" shows Serra only; "*She hands Bob the cup.*" shows nobody.
//   - It must be capitalised as a name ("*sunny day*" is weather, "*Sunny waves*" is Sunny).
//   - Only names we already know locally are matched (official cast, installed cards, the player's
//     imported Registrar characters, plus aliases). Anything else would need a live Registrar lookup
//     per capitalised word, which is exactly the traffic the manifest cache exists to avoid.
// A `__Name:__` tag still wins: index.js reads tagged speakers first and only uses prose for names
// that have no tag.
//
// THE MOOD comes from the whole paragraph (see findProseMentions), not just the sentence that names
// the character: the beat that decides it is usually written with "he"/"she" or in a quote.
//     *Bob goes silent.* "You really.." *He chuckles, a smile blooming.* "Fuck man, you care, huh?"
//     *Bob goes silent.* "You really think I care?" *He spits on the floor.* "Fuck off."
// share their first sentence and mean opposite things.

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One `*action*` span. The lookarounds keep `**bold**` (including `**Name:**` tags) from counting.
const ACTION_SPAN = /(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)/g;

/**
 * @param {string[]} surfaces Every written form that may name a character (lowercase or not).
 * @returns {RegExp|null} Matches a known name at the start of a span or sentence; the name is group 1.
 */
export function buildProseMatcher(surfaces) {
    // Longest first, so "Professor Akiyama" wins over a shorter name sharing its start.
    const forms = [...new Set(surfaces.map((s) => String(s ?? '').trim().toLowerCase()).filter((s) => s.length >= 2))]
        .sort((a, b) => b.length - a.length);
    if (!forms.length) return null;
    // `(?![\p{L}\p{N}])` ends the name at a word edge: "Bob's" and "Bob," match, "Bobby" does not.
    return new RegExp(`(?:^|[.!?…]\\s+)(${forms.map(escapeRegex).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

/** The text the classifier reads: the paragraph piece without markdown asterisks. */
const plain = (piece) => piece.replace(/\*/g, '').replace(/\s+/g, ' ').trim();

/**
 * @param {string} text Message text with speaker tags already removed.
 * @param {RegExp|null} matcher From buildProseMatcher.
 * @param {(name: string) => string} resolve Alias resolver; returns the normalized lowercase name.
 * @returns {Map<string, string>} name -> the paragraph text for the mood classifier. Names are in
 *   order of first appearance. The text comes from the LAST paragraph where they are a subject (same
 *   rule as tagged speakers: the pose that matches how the message ends).
 *
 * A paragraph is one line. Inside it, every subject name starts a new piece that runs until the next
 * subject (of anyone). A character's text is all of THEIR pieces, so their own "he spits on the
 * floor" and their quotes are read, but another character's action in the same line is not. The
 * first piece also takes whatever precedes it on the line, for `"Wait!" *Bob runs.*`.
 */
export function findProseMentions(text, matcher, resolve = (name) => name.toLowerCase()) {
    const found = new Map();
    if (!matcher || !text) return found;
    for (const line of String(text).split('\n')) {
        // Where each subject name starts on this line, in order.
        const subjects = [];
        for (const span of line.matchAll(ACTION_SPAN)) {
            for (const match of span[1].matchAll(matcher)) {
                if (!/^\p{Lu}/u.test(match[1])) continue;
                const name = resolve(match[1]);
                // span.index + 1 skips the opening asterisk; the match may begin with the ". " before the name.
                if (name) subjects.push({ name, at: span.index + 1 + match.index + match[0].length - match[1].length });
            }
        }
        if (!subjects.length) continue;

        const pieces = new Map(); // name -> text pieces of this line
        subjects.forEach((subject, i) => {
            const start = i === 0 ? 0 : subject.at;
            const end = subjects[i + 1]?.at ?? line.length;
            if (!pieces.has(subject.name)) pieces.set(subject.name, []);
            pieces.get(subject.name).push(line.slice(start, end));
        });
        // set() on a known key keeps its first-seen position, so later paragraphs only replace the text.
        for (const [name, parts] of pieces) found.set(name, plain(parts.join(' ')));
    }
    return found;
}
