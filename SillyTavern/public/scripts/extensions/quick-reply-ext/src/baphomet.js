// src/baphomet.js
//
// Bap's demon. PromptOS "Baphomet Visibility" (a variant picker, see introContext.js) is per chat:
//   Enabled  (default): Baphomet's vicious commentary is visible, in [CAPITALS] brackets.
//   Disabled:           Baphomet remains sealed inside her, but you won't hear his cries. He can still make her
//                       trip (that is the only evidence anyone could find), so her clumsiness stays.
//
// Why everything below happens on the OUTGOING REQUEST instead of in the card or the chat's variables:
// a card change would need new PNGs through the Downloader and would only reach new chats, and rewriting a
// chat's saved personality text would fight the intro-context modes. Cutting the text as the request goes out
// (OnRequestReady in index.js) works on every existing Bap chat the moment the toggle flips, never edits a
// file, and Enabled sends exactly what was sent before. The same trick OOC Mode uses for a card's own
// post-history (oocMode.js). It keys on the card's own wording, so src tests pin it against the real card.
//
// Baphomet lives in five places:
//   1. Card description: the "internally screaming ... Baffy" paragraph and the "!Mute" paragraph. (The twist
//      paragraph and the "make Bap trip" paragraph stay: Bap's clumsiness is attributed to him in both modes.)
//   2. Personality (chat variable ArchAngel): four labeled lines.
//   3. Post-history (card): everything after {{getvar::postrav}} except the cat-pun reminder.
//   4. Intro start context (chat variables ConstantScenario, and Scenario if it ever carries it): the commentary paragraphs.
//   5. Thoughts (ThoughtSet, built by XXX): Baphomet's own block, or nothing.
//
// "!Mute" is retired: it was one sentence against four always-on instructions, so it only worked sometimes.
// The "!Mute" paragraph is cut from every Bap request (both modes); PromptOS replaces it.
import { THOUGHT_RULES } from "./promptModifiers.js";

export const BAPHOMET_VAR = "BaphometVisibility";

/** The chat variable holds "enabled" / "disabled"; unset means Enabled (how every existing chat behaved). */
export function baphometHidden(value) {
    return String(value ?? "").trim().toLowerCase() === "disabled";
}

// ---------------------------------------------------------------------------------------------
// Thoughts
// ---------------------------------------------------------------------------------------------

// Rule 2 of THOUGHT_RULES ("NEVER speak in 3rd person") is written for a character's own head; Baphomet is not
// Bap and talks about her in the third person, so that one rule is skipped here. The secrets rule stays, and
// so does "NEVER speak as a narrator" (it is what keeps his rants from turning into scene narration).
const RULES_FOR_BAPHOMET = THOUGHT_RULES.filter(line => !line.includes("3rd person"));

const BAPHOMET_THOUGHT_LINES = [
    "- These thoughts belong to Baphomet, the demon sealed inside Bap, and to no one else. Every bracket is him. Bap's own mind never appears in brackets; what she feels comes through her dialogue, actions and narration like any other character.",
    "- Baphomet's thoughts are in [CAPITALS], in his voice, and he speaks about Bap and {{user}} in the third person because he is not Bap.",
];

/**
 * Bap's thoughts-on block: the standard one, with Baphomet as the only speaker. Matches the card's own "1-2 per
 * response" (the standard block rolls 1-4), so the two instructions stop disagreeing.
 * @param {string} thinkYes rav.thinkYes of the active prompt
 */
export function baphometThoughts(thinkYes) {
    let block = String(thinkYes ?? "");
    if (!block) return block;
    block = block
        .replace(/\{\{random::1::2(?:::3)?(?:::4)?\}\}/, "{{random::1::2}}")
        .replace("{{char}}'s thought process as it happens", "Baphomet's commentary as it happens");
    const lines = [...BAPHOMET_THOUGHT_LINES, ...RULES_FOR_BAPHOMET].filter(line => !block.includes(line)).join("\n");
    if (block.includes("</thought directions>")) return block.replace("</thought directions>", () => `${lines}\n</thought directions>`);
    return `${block}\n${lines}`;
}

// ---------------------------------------------------------------------------------------------
// Request-time cuts. Every function takes the SOURCE text (before macros) and returns the replacement.
// ---------------------------------------------------------------------------------------------

const KEEP_CAT_PUNS = "Remember to make Bap make cat sounds and cat puns without being annoying.";
const KEEP_CAT_PUNS_SCENARIO = "Remember to make Bap use cat sounds and cat puns without being annoying.";

// Sits inside [PERSONALITY], right before [END PERSONALITY]. Lucky's wording (2026-10-11): in-world, no meta
// ("he can't be heard"), and the clumsiness is how he still leaks out.
export const SILENT_PERSONALITY_LINE = "No one knows that Baphomet is screaming away inside her, and the only evidence one might find is the occasional moment when she is radically clumsy beyond all reason.";

const PERSONALITY_BAPHOMET_LINE = /^(?:INTERNAL BAPHOMET PERSONALITY|BAPHOMET'S INTERNAL COMMENTARY|BAPHOMET LIKES|BAPHOMET DISLIKES):.*$/;

/**
 * Personality (ArchAngel) with Baphomet's four labeled lines removed and the silent line added.
 * @returns {string} the new text, or the input unchanged when it holds no Baphomet lines (already cut / other text)
 */
export function silentPersonality(text) {
    const source = String(text ?? "");
    const eol = source.includes("\r\n") ? "\r\n" : "\n";
    const lines = source.split(/\r?\n/);
    const kept = lines.filter(line => !PERSONALITY_BAPHOMET_LINE.test(line.trim()));
    if (kept.length === lines.length) return source;
    const end = kept.findIndex(line => line.trim() === "[END PERSONALITY]");
    if (end < 0) kept.push(SILENT_PERSONALITY_LINE);
    else kept.splice(end, 0, SILENT_PERSONALITY_LINE);
    return kept.join(eol);
}

/** Paragraphs of the card description to cut: the Baffy/screaming one (Disabled only) and !Mute (always). */
export function descriptionParagraphsToCut(description, hidden) {
    return String(description ?? "")
        .split(/\r?\n\s*\r?\n/)
        .map(paragraph => paragraph.trim())
        .filter(paragraph => /["'“”]?!Mute["'“”]?/i.test(paragraph) || (hidden && /Baphomet can be observed internally screaming/i.test(paragraph)));
}

/** The card's post-history after {{getvar::postrav}}: everything is Baphomet's except the cat-pun sentence. */
export function postHistoryReplacement(extras) {
    return String(extras ?? "").includes(KEEP_CAT_PUNS) ? KEEP_CAT_PUNS : "";
}

/**
 * The Bap intro context without Baphomet's commentary paragraphs. Her backstory paragraph keeps "Baphomet's
 * interference making her clumsy" on purpose: the clumsiness is still his doing.
 * @returns {string} the new text, or the input unchanged when the commentary isn't there
 */
export function silentScenario(text) {
    const source = String(text ?? "");
    const start = source.search(/^ALWAYS include Baphomet's hateful and threatening commentary/m);
    if (start < 0) return source;
    const keepsCatPuns = /Remember to make Bap use cat sounds and cat puns without being annoying\./.test(source.slice(start));
    return source.slice(0, start).replace(/\s+$/, "") + (keepsCatPuns ? `\n${KEEP_CAT_PUNS_SCENARIO}` : "");
}

// ---------------------------------------------------------------------------------------------
// Applying to the outgoing messages
// ---------------------------------------------------------------------------------------------

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Whitespace-tolerant: the text was macro-expanded and may have had its line breaks squashed by the proxy.
const patternFor = text => new RegExp(String(text).trim().split(/\s+/).map(escapeRegex).join("\\s+"));

/**
 * Replace the first match of `from` (searching from the system prompt down) with `to`, in place.
 * @returns {number} 1 if something was replaced
 */
export function replaceInMessages(messages, from, to) {
    const wanted = String(from ?? "").trim();
    if (!wanted || !Array.isArray(messages)) return 0;
    const pattern = patternFor(wanted);
    const swap = value => value.replace(pattern, () => to).replace(/(?:\r?\n){3,}/g, "\n\n");
    for (const message of messages) {
        if (!message) continue;
        if (typeof message.content === "string") {
            if (!pattern.test(message.content)) continue;
            message.content = swap(message.content);
            return 1;
        }
        if (Array.isArray(message.content)) {
            const part = message.content.find(p => p?.type === "text" && typeof p.text === "string" && pattern.test(p.text));
            if (!part) continue;
            part.text = swap(part.text);
            return 1;
        }
    }
    return 0;
}

/**
 * Everything Baphomet Visibility does to one outgoing Bap request. No-op for other cards (the caller checks).
 * @param {Array} messages data.messages of the final request, mutated in place
 * @param {{ hidden: boolean, description?: string, postHistoryExtras?: string, personality?: string,
 *   scenarios?: string[], substitute: (text: string) => string }} source texts and the macro expander
 * @returns {{ muteCut: number, cuts: number }} how many pieces were cut
 */
export function applyBaphometToRequest(messages, { hidden, description, postHistoryExtras, personality, scenarios = [], substitute }) {
    const sub = typeof substitute === "function" ? substitute : text => text;
    let muteCut = 0;
    let cuts = 0;
    for (const paragraph of descriptionParagraphsToCut(description, hidden)) {
        const done = replaceInMessages(messages, sub(paragraph), "");
        if (/!Mute/i.test(paragraph)) muteCut += done;
        else cuts += done;
    }
    if (!hidden) return { muteCut, cuts };
    const personalityCut = silentPersonality(personality);
    if (personality && personalityCut !== personality) cuts += replaceInMessages(messages, sub(personality), sub(personalityCut));
    if (postHistoryExtras) cuts += replaceInMessages(messages, sub(postHistoryExtras), postHistoryReplacement(postHistoryExtras));
    for (const scenario of scenarios) {
        const scenarioCut = silentScenario(scenario);
        if (scenario && scenarioCut !== scenario) cuts += replaceInMessages(messages, sub(scenario), sub(scenarioCut));
    }
    return { muteCut, cuts };
}
