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

// ---- Switching start scenarios mid-chat (PromptOS, 2026-11-15) ----
//
// Both starts boil down to two chat variables, so switching one chat between them is just rewriting those:
//   behind the door: ConstantScenario = the post-breakup context from scenarios.js, DrunkCoach empty
//   drunk:           ConstantScenario = strings.redD (turned him down) or strings.redH (almost hooked up),
//                    DrunkCoach = strings.redT for turbo drunk, empty for kinda drunk
// Nothing else differs (both records set StartingYear Junior; Scenario / CharKeys / ConstantContext /
// IntroPostHistory are unused by Loona). The drunk thoughts section rides inside redD / redH, and the
// thoughts-off cut keys on its markers, not on the greeting, so it follows the switch with no extra work.
// The costume follows the posted greeting's own outfit code ([O1] on the drunk one), like any other reply.
//
// Lucky (2026-11-15): switching TO a start must run that start like a fresh chat would (the drunk choice popup,
// then the start's greeting posted as a new message), followed by a one-time time skip note. So the picker only
// offers the three starts; the four drunk versions are chosen in the same popup the greeting setup uses
// (LOONA_DRUNK_CHOICES, shared with Scenarios() so the two can't drift apart).
export const LOONA_DOOR_MARKER = 'POST-BREAKUP DEPRESSION';

export const LOONA_START_OPTIONS = [
    { id: 'door', label: 'Behind the door', description: 'December, two weeks after the breakup. She won\'t come out of her room.' },
    { id: 'drunk', label: 'Drunk night', description: 'March. She stumbles home from a party. You pick how drunk and how the night went.' },
    { id: 'off', label: 'Off', description: 'No starting context at all.' },
];

/** The drunk setup popup's buttons, in the order it shows them (Scenarios() and the PromptOS switch both use this). */
export const LOONA_DRUNK_CHOICES = ['Dismissed Him - Kinda Drunk', 'Nearly Hooked Up - Kinda Drunk', 'Dismissed Him - Turbo Drunk', 'Nearly Hooked Up - Turbo Drunk'];
// What a fresh chat falls back to when the popup is closed without a pick (unchanged from the original setup).
export const LOONA_DRUNK_DEFAULT_CHOICE = 'Dismissed Him - Turbo Drunk';

/** 'turbo-dismissed' etc. for one of the popup's button labels. */
export function loonaDrunkIdFromChoice(choice) {
    const label = String(choice ?? '');
    return `${label.includes('Turbo') ? 'turbo' : 'kinda'}-${label.includes('Dismissed') ? 'dismissed' : 'hooked'}`;
}

/** Plain words for a drunk version, shown under the picker's Drunk button. */
export const LOONA_DRUNK_LABELS = {
    'kinda-dismissed': 'Kinda drunk, turned him down',
    'kinda-hooked': 'Kinda drunk, almost hooked up',
    'turbo-dismissed': 'Turbo drunk, turned him down',
    'turbo-hooked': 'Turbo drunk, almost hooked up',
};

/** The picker's three-way view of a start: 'door', 'drunk', 'off' or 'unknown'. */
export function loonaStartGroup(startId) {
    if (startId === 'door' || startId === 'off' || startId === 'unknown') return startId;
    return startId === 'drunk' || startId in LOONA_DRUNK_LABELS ? 'drunk' : 'unknown';
}

/**
 * Which start a chat is on, read back from its variables (so it is right even when the choice was made in the
 * original setup popup). Texts saved by an older version still count: the door context by its header, the drunk
 * ones by their thoughts section. A drunk text that matches neither current version can't say whether he was
 * turned down, so it reads as plain 'drunk' (no version); text that is neither reads as 'unknown', and then no
 * button lights up rather than a wrong one.
 * @param {{constantScenario?: string, drunkCoach?: string}} vars
 * @param {{redD: string, redH: string, redT: string}} texts
 * @returns {string} 'door', 'off', a drunk version id ('turbo-hooked'...), 'drunk' or 'unknown'
 */
export function loonaStartOf({ constantScenario, drunkCoach } = {}, texts) {
    const scenario = String(constantScenario ?? '');
    if (!scenario.trim()) return 'off';
    if (scenario.includes(LOONA_DOOR_MARKER)) return 'door';
    const turbo = String(drunkCoach ?? '').trim() !== '' ? 'turbo' : 'kinda';
    if (scenario === String(texts.redH)) return `${turbo}-hooked`;
    if (scenario === String(texts.redD)) return `${turbo}-dismissed`;
    if (scenario.includes(DRUNK_THOUGHTS_START)) return 'drunk';
    return 'unknown';
}

/**
 * The two variables a start sets: 'door', 'off' or a drunk version id. `doorContext` is the behind-the-door
 * record's ConstantScenario.
 * @returns {{ConstantScenario: string, DrunkCoach: string}}
 */
export function loonaStartValues(id, { doorContext, redD, redH, redT }) {
    if (!['door', 'off', ...Object.keys(LOONA_DRUNK_LABELS)].includes(id)) throw new Error(`Unknown Loona start "${id}".`);
    if (id === 'off') return { ConstantScenario: '', DrunkCoach: '' };
    if (id === 'door') {
        if (!String(doorContext ?? '').trim()) throw new Error('The behind-the-door context is missing.');
        return { ConstantScenario: String(doorContext), DrunkCoach: '' };
    }
    const [level, outcome] = id.split('-');
    return { ConstantScenario: String(outcome === 'hooked' ? redH : redD), DrunkCoach: level === 'turbo' ? String(redT) : '' };
}

/**
 * The card greeting to post when switching to a start: the drunk one is told apart by [O1], behind the door is the
 * other real greeting (not drunk, not the custom start). By content, never position (see the top of this file).
 * @param {'door'|'drunk'} kind
 * @param {string[]} cardGreetings first_mes followed by alternate_greetings
 * @returns {string|undefined}
 */
export function loonaGreetingText(kind, cardGreetings) {
    const list = (Array.isArray(cardGreetings) ? cardGreetings : []).filter(text => String(text ?? '').trim());
    if (kind === 'drunk') return list.find(isLoonaDrunkStart);
    if (kind === 'door') return list.find(text => !isLoonaDrunkStart(text) && !isCustomStart(text));
    return undefined;
}

/** The "write me a custom scenario" greeting has no start context of its own. */
export function isCustomStart(greetingText) {
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
