// src/introSwitch.js
//
// Switching a running chat to a different start (PromptOS "Starting scenario", 2026-11-15, Loona and Belle).
// Lucky's rule: a switch plays the new start the way a fresh chat would (its setup choices, then its greeting
// posted as a new message), and the reply after it gets a ONE-TIME time skip note so the model jumps to the new
// start instead of carrying on the old timeline.
//
// This file is the pure part (no SillyTavern imports, so the WeyPhone tests load it directly):
//   - planIntroSwitch: which chat variables a start sets and which leftovers from the other starts get cleared
//   - the time skip note: when it applies, its text, and where it goes in the outgoing request
// The part that talks to SillyTavern (popups, posting the greeting, saving variables) is in src/introContext.js.

// Keys a greeting record can carry that only describe how the chat STARTED, not its setup. StartingYear is left as
// it is: every record of a character carries the same year, and changing it mid-chat would re-age the cast.
const NOT_CLEARED = new Set(['StartingYear']);

// Always cleared on a switch, whether or not the old start used them, so nothing of the old start's context survives.
export const INTRO_VARS = ['Scenario', 'CharKeys', 'ConstantScenario', 'ConstantContext', 'ContextTimer', 'IntroPostHistory', 'ScenarioSticky'];

/**
 * The variables to set and clear for switching to one greeting record, the way Scenarios() would set them on a fresh
 * chat. Two differences from a fresh chat, both because the chat is already running:
 *  - ContextTimer is a message NUMBER ("drop ConstantContext once the chat reaches message N"), counted from the
 *    greeting. Here the greeting is posted at `anchor`, so the timer moves with it (Belle's party: 19 -> anchor + 19).
 *  - Keys any OTHER record of the character sets are cleared first, so a start's extras don't leak into the next
 *    one (Belle's "She's gone" turns her thoughts off and adds a post-history reminder; the other intros don't).
 * @param {Array<object>} records the character's scenarios.js greeting records
 * @param {object} record the record being switched to (may be {} for a start with no record values)
 * @param {number} anchor index the new greeting will have in the chat
 * @returns {{set: Record<string,string>, clear: string[]}}
 */
export function planIntroSwitch(records, record, anchor) {
    const set = {};
    for (const [key, value] of Object.entries(record ?? {})) {
        if (key === 'ContextTimer' && String(value).trim() !== '' && Number.isFinite(Number(value))) {
            set[key] = String(Number(anchor) + Number(value));
        } else {
            set[key] = String(value ?? '');
        }
    }
    const others = new Set(INTRO_VARS);
    for (const other of Array.isArray(records) ? records : []) for (const key of Object.keys(other ?? {})) others.add(key);
    const clear = [...others].filter(key => !NOT_CLEARED.has(key) && !(key in set && set[key] !== ''));
    return { set, clear };
}

// ---- Belle's intros ----
//
// Belle's scenarios.js records line up with her card greetings BY POSITION (that is how Scenarios() picks one), so the
// switch posts card greeting N with record N. Each intro is named by what its record holds, not by its position, so a
// reordered card still gets the right label. The doorway and "She's gone" greetings open with the same lines; only
// their records tell them apart.
export const BELLE_INTROS = {
    party: { label: "Rivera's party", description: "Rivera's house party. Belle is already buzzed." },
    hottub: { label: 'The hot tub', description: 'Same party, out on the back porch, in the hot tub.' },
    doorway: { label: 'The doorway', description: 'Five weeks into a complicated relationship. Your dorm room, 2 AM.' },
    gone: { label: "She's gone", description: 'Five weeks in, and Belle has gone missing. You have to find her.' },
};

/** 'party' | 'hottub' | 'doorway' | 'gone' | null for one of Belle's greeting records. */
export function belleIntroId(record) {
    const constant = String(record?.ConstantScenario ?? '');
    if (/SHE'S GONE/i.test(constant)) return 'gone';
    if (/THE DOORWAY/i.test(constant)) return 'doorway';
    if (/hot ?tub/i.test(String(record?.CharKeys ?? ''))) return 'hottub';
    if (String(record?.Scenario ?? '').trim()) return 'party';
    return null;
}

/**
 * Which record a chat is on, from the intro variables it holds (pass the PromptOS stash when there is one, since
 * the generic Off empties the live ones). -1 when nothing matches, e.g. text saved by an older build.
 */
export function matchIntroRecord(records, values) {
    const list = Array.isArray(records) ? records : [];
    const same = (a, b) => String(a ?? '').trim() !== '' && String(a) === String(b ?? '');
    return list.findIndex(record => same(record?.ConstantScenario, values?.ConstantScenario) || same(record?.Scenario, values?.Scenario));
}

// ---- the one-time time skip note ----
//
// Stored as one chat variable holding { anchor, name }: anchor = the index of the posted greeting. The note goes into
// the request for the reply right after it and that reply's rerolls / continues, then never again:
//   anchor     = the new greeting
//   anchor + 1 = the player's next message (optional: generating straight after the greeting also counts)
//   anchor + 2 = the reply that gets the note (rerolling it keeps the chat this long, so rerolls get it too)
// Once the chat grows past anchor + 3 the note is spent. A chat SHORTER than the anchor means the greeting was deleted,
// which also ends it. Not SillyTavern's ephemeral /inject: that is saved into the chat and only removed by a listener
// that a page reload loses, so a reload before the next reply would have left the note on for good.
export const TIME_SKIP_VAR = 'IntroTimeSkip';

/** @returns {{anchor: number, name: string}|null} */
export function readTimeSkip(raw) {
    try {
        const value = typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : null) : raw;
        if (!value || !Number.isInteger(value.anchor) || value.anchor < 0) return null;
        return { anchor: value.anchor, name: String(value.name ?? '') };
    } catch {
        return null;
    }
}

/** 'active' (send the note), 'spent' (clear the variable) or 'none'. */
export function timeSkipState(raw, chatLength) {
    const skip = readTimeSkip(raw);
    if (!skip) return 'none';
    if (chatLength <= skip.anchor || chatLength > skip.anchor + 3) return 'spent';
    return 'active';
}

/** The note itself. Written for the model; the name is filled in because the request's macros are already expanded. */
export function timeSkipNote(name) {
    const who = String(name ?? '').trim() || 'the character';
    return `[OOC: TIME SKIP. This roleplay was just switched to a different starting scenario. ${who}'s most recent greeting message is the new opening scene, so pick the story up from there. Messages earlier in this chat come from a different point in the story and are not the current situation; the starting context and the new opening scene are. Don't continue the old scene or bring its events up unless the new scenario says they happened. This note is only for this one reply.]`;
}

/**
 * Puts the note into an outgoing chat-completion request, as a system message right before the last message (the
 * same spot a depth-0 injection lands). Mutates `messages`.
 * @returns {boolean} whether it was added
 */
export function addTimeSkipNote(messages, note) {
    if (!Array.isArray(messages) || !messages.length || !note) return false;
    if (messages.some(message => typeof message?.content === 'string' && message.content === note)) return false;
    messages.splice(messages.length - 1, 0, { role: 'system', content: note });
    return true;
}
