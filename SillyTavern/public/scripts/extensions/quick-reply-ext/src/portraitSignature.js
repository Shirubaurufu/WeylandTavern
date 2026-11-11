// What a reply says about the portraits: its mood tag, its costume tag, who else speaks in it.
// Pure (no SillyTavern imports) so it can be tested on its own.
//
// Why this exists (2026-11-11): the portrait code only looked at a reply ONCE, keyed on message id +
// swipe id. A reply that was cut off mid-sentence and then finished with Continue keeps the same id
// and swipe, so its footer ("[Nervousness] [O1]") arrived after the one look and was never read:
// the face stayed on the previous reply's mood. Editing a reply, or deleting the last one, did not
// trigger a look either. The signature lets the caller ask "does this text say something different
// about the portraits than the text I last drew from?" and look again only when it does, so an
// unchanged footer never re-rolls the sprite variant for nothing.

/** The moods the expression sprites exist for (the same list Expressions() in index.js accepts). */
export const PORTRAIT_MOODS = Object.freeze([
    "admiration", "amusement", "anger", "annoyance", "approval",
    "caring", "confusion", "curiosity",
    "desire", "disappointment", "disapproval", "disgust",
    "embarrassment", "excitement",
    "fear",
    "gratitude", "grief",
    "joy",
    "love",
    "nervousness", "neutral",
    "optimism",
    "pride",
    "realization", "relief", "remorse",
    "sadness", "surprise",
]);
const MOODS = new Set(PORTRAIT_MOODS);

/** The mood Expressions() would pick: the LAST single-word [Bracket] that is a known mood, or "". */
export function moodTagOf(text) {
    const words = String(text ?? "").match(/(?<=\[)[a-zA-Z]+(?=\])/g) ?? [];
    for (let i = words.length - 1; i >= 0; i--) {
        const word = words[i].toLowerCase();
        if (MOODS.has(word)) return word;
    }
    return "";
}

/**
 * The costume code the reply carries ("RC", "NK", "LG", "O1"...), or "" when it has none.
 * Same window and pattern as getCharacterCostumeFromText in general.js: the last 35% of the text,
 * a [Tag] that directly follows another bracket (the mood tag).
 */
export function costumeTagOf(text) {
    let tail = String(text ?? "");
    if (tail.length > 50) tail = tail.slice(Math.floor(tail.length * 0.65));
    const tags = [...tail.matchAll(/\] ?\[(\w+?)\]/g)].map(match => match[1]);
    return tags.length ? tags[tags.length - 1] : "";
}

/**
 * True when the reply gives no outfit to draw: it has no costume tag, or its tag is [XX], which the
 * clothing-code list defines as "none of the codes apply". The caller keeps the current costume then.
 * Any other unknown code still means the regular outfit, as before.
 */
export function saysNothingAboutCostume(text) {
    const tag = costumeTagOf(text);
    return tag === "" || tag.toUpperCase() === "XX";
}

/** Everyone tagged as a speaker ("__Summer:__"), in order, as the side-character code reads them. */
export function speakerTagsOf(text) {
    return [...String(text ?? "").matchAll(/_{0,2}(?:Mirror )?(.+?):_{1,2}/g)].map(match => match[1]);
}

/**
 * The text SillyTavern puts in a message while its reply is still on the way: "..." (or nothing).
 * A streamed reroll fires MESSAGE_RECEIVED with this before the real reply exists.
 */
export function isReplyPlaceholder(text) {
    const value = String(text ?? "").trim();
    return value === "" || value === "..." || value === "…";
}

/** Two texts with the same signature draw the same portraits. */
export function portraitSignature(text) {
    const value = String(text ?? "");
    return [
        moodTagOf(value),
        costumeTagOf(value),
        /Phone Status/.test(value) ? "phone" : "",
        speakerTagsOf(value).join(","),
    ].join("|");
}
