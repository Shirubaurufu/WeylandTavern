// Loona has two real greetings: the drunk one (she stumbles in from a party) and the one where she is
// shut behind her bedroom door after the breakup. Their setup differs (the drunk one asks four questions
// and fills ConstantScenario / DrunkCoach itself; the other takes its context from scenarios.js), and it
// used to be chosen by POSITION on the card: swipe 0 = drunk.
//
// The card's order is being flipped (behind-the-door becomes the first greeting), and a card reaches
// players through the Downloader at a different moment than this code does. Position would then be wrong
// for whoever has the new code with the old card, the old code's chats with the new card, and every chat
// saved before the flip (its first message keeps its old swipe number forever). So the greeting is
// recognised by what it IS: the drunk greeting ends on the Drunk outfit code [O1], which the outfit-code
// lore entry requires whenever she is drunk, and which stays in the saved message. Pure, no imports, so
// the tests can load it directly.

/** True when this greeting text is Loona's drunk start. */
export function isLoonaDrunkStart(greetingText) {
    return /\[O1\]/.test(String(greetingText ?? ''));
}

// ---- Character Thoughts off (PromptOS) on the drunk start ----
//
// The switch replaces ThoughtSet with the "thoughts disabled" line, but the drunk start context (strings.redD /
// strings.redH, held in this chat's ConstantScenario) carries its own section telling the model how her drunk
// thoughts sound, with bracketed examples. Left in, the model keeps writing thoughts whatever the switch says.
// So that section is cut from the OUTGOING REQUEST while the switch is off. Nothing saved is edited: the chat
// keeps the full context, and switching thoughts back on needs no undo.
export const DRUNK_THOUGHTS_START = '[SEXUAL THOUGHTS - DRUNK LOONA]';
export const DRUNK_THOUGHTS_END = '[END SEXUAL THOUGHTS]';

/** One text with the drunk-thoughts section removed (and the blank lines it leaves closed up). */
export function withoutDrunkThoughts(text) {
    let out = String(text ?? '');
    // A loop, in case the context is in the request more than once.
    for (let guard = 0; guard < 8; guard++) {
        const start = out.indexOf(DRUNK_THOUGHTS_START);
        if (start < 0) break;
        const end = out.indexOf(DRUNK_THOUGHTS_END, start);
        if (end < 0) break; // an unclosed section is left alone rather than cutting to the end of the prompt
        out = out.slice(0, start).replace(/\s+$/, '') + '\n\n' + out.slice(end + DRUNK_THOUGHTS_END.length).replace(/^\s+/, '');
    }
    return out;
}

/**
 * Cuts the drunk-thoughts section from every message of a request. Mutates `messages`.
 * @param {Array<{content?: string|Array<{type?: string, text?: string}>}>} messages
 * @returns {number} How many message parts were changed
 */
export function stripDrunkThoughtsFromRequest(messages) {
    let changed = 0;
    for (const message of Array.isArray(messages) ? messages : []) {
        if (typeof message?.content === 'string') {
            const next = withoutDrunkThoughts(message.content);
            if (next !== message.content) { message.content = next; changed += 1; }
        } else if (Array.isArray(message?.content)) {
            for (const part of message.content) {
                if (typeof part?.text !== 'string') continue;
                const next = withoutDrunkThoughts(part.text);
                if (next !== part.text) { part.text = next; changed += 1; }
            }
        }
    }
    return changed;
}

/** The "write me a custom scenario" greeting has no start context of its own. */
function isCustomStart(greetingText) {
    return /\[CS\]|Following your character information and personality as a basis/.test(String(greetingText ?? ''));
}

/**
 * Which scenarios.js greeting record belongs to this greeting, whatever order the card and the record
 * list are in. The behind-the-door record is the one carrying a ConstantScenario; the drunk record does
 * not (the drunk setup writes it after asking the player).
 * @param {Array<object>|undefined} greetings scenarios.get("Loona").greetings
 * @param {string} greetingText The first message as shown
 * @param {number} greetingSwipe Fallback for a greeting this file does not recognise
 * @returns {object|undefined}
 */
export function loonaGreetingRecord(greetings, greetingText, greetingSwipe) {
    const list = Array.isArray(greetings) ? greetings : [];
    if (isCustomStart(greetingText)) return undefined;
    const withContext = list.find(record => record && record.ConstantScenario);
    const without = list.find(record => record && !record.ConstantScenario);
    if (isLoonaDrunkStart(greetingText)) return without ?? list[greetingSwipe];
    return withContext ?? list[greetingSwipe];
}
