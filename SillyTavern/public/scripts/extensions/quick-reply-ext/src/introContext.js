// src/introContext.js
//
// PromptOS "Roleplay intro context": lets a user keep, drop, or swap the starting-situation
// context a greeting set up, per chat. WeyPhone renders the card; this module owns the logic,
// because the prompt text (scenarios.js / strings.js) lives in quick-reply-ext.
//
// How intro context normally reaches the model (set once by Scenarios() at chat start):
// - Scenario: injected by the "Scenario" WI entry in Weyland Characters ({{getvar::Scenario}}),
//   keyword-triggered by this chat's CharKeys (written into that entry's key on every chat open),
//   sticky 20. It fades once the conversation stops using those words.
// - ConstantScenario / ConstantContext: always-on WI entries ("Constant Scenario" in Weyland
//   Characters, "Constant Context" in Weyland). They never fade on their own (Belle's
//   ConstantContext is cleared by her ContextTimer instead).
//
// Everything here works through those same chat-local variables, never by editing the shared WI
// entries' other fields, so one chat's choice can't leak into another: the chat-open code
// already re-applies this chat's CharKeys to the shared entry each time a chat is opened.
//   auto: the original values, fading as usual (the default; nothing changes until touched)
//   on:   original content, CharKeys swapped for a match-everything regex so Scenario always fires
//   off:  intro variables emptied ({{getvar::...}} renders nothing)
// The originals are stashed on first touch (IntroCtxStash), so every choice is reversible.
import { getLocalVariable } from "../../../variables.js";
import { deleteLocalVariable, setLocalVariable } from "./variables.js";
import { findLoreBookEntry, setEntryField } from "./lorebook.js";
import { getFirstMessage } from "./chat.js";
import {
    LOONA_DRUNK_CHOICES, LOONA_DRUNK_LABELS, LOONA_START_OPTIONS, loonaDrunkIdFromChoice, loonaGreetingRecord,
    loonaGreetingText, loonaStartGroup, loonaStartOf, loonaStartValues,
} from "./loonaGreetings.js";
import { INTRO_RECORD_VAR, matchIntroRecord, planIntroSwitch, TIME_SKIP_VAR } from "./introSwitch.js";
import { INTRO_TIMELINES, LOCKED_NOTE, lockedStarts, timelineGroupId, timelineOptions } from "./introTimelines.js";
import { scenarios } from "./scenarios.js";
import { getCurrentCharacterName } from "./general.js";
import { doButtons } from "./popups.js";
import strings from "./strings.js";
import { BAPHOMET_VAR, baphometHidden } from "./baphomet.js";
import { sendMessageAs } from "../../../slash-commands.js";
import { is_send_press } from "../../../../script.js";

const STASH = "IntroCtxStash";
const MODE = "IntroCtxMode";
// Which start a mid-chat switch last put this chat on (an option id). Read first by the pickers, because a switched
// chat's first message is still the ORIGINAL greeting.
const SWITCHED_START = "IntroStart";
// IntroPostHistory is greeting-owned just like the WI context. It is appended to postrav only
// while present, so turning an intro Off also removes its final post-history reminder.
const CONTEXT_VARS = ["Scenario", "CharKeys", "ConstantScenario", "ConstantContext", "ContextTimer", "IntroPostHistory"];
// A WI key that matches any text, so the Scenario entry fires on every scan while "On".
const ALWAYS_KEY = "/[\\s\\S]/";

/** Variables to clear when Scenarios() sets up a fresh greeting, so a new intro starts on Auto. */
export const INTRO_CONTEXT_STATE_VARS = [STASH, MODE, SWITCHED_START, TIME_SKIP_VAR, INTRO_RECORD_VAR];

// Characters that write ConstantScenario themselves at runtime: emptying it would fight their own
// logic (Mirror re-runs Scenarios() whenever it's empty; Weybot rebuilds it every message).
const EXCLUDED = { "Mirror Weyland": "Mirror World manages its own starting context.", "Weybot": "Weybot rebuilds its context from your relationships every message." };

function readStash() {
    try {
        const raw = getLocalVariable(STASH);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function currentValues() {
    return Object.fromEntries(CONTEXT_VARS.map(name => [name, String(getLocalVariable(name) ?? "")]));
}

/** The values the greeting originally set: the stash once touched, otherwise what's live now. */
function originalValues() {
    return readStash() ?? currentValues();
}

function ensureStash() {
    const existing = readStash();
    if (existing) return existing;
    const values = currentValues();
    setLocalVariable(STASH, JSON.stringify(values));
    return values;
}

function setOrClear(name, value) {
    if (value) setLocalVariable(name, value);
    else deleteLocalVariable(name);
}

async function applyScenarioKeys(keys) {
    const uid = await findLoreBookEntry("Weyland Characters", "automationId", "Scenario");
    if (uid !== "" && uid !== undefined) await setEntryField({ file: "Weyland Characters", uid, field: "key" }, keys ?? "");
}

/** True if this chat's intro originally had a fading Scenario (used by XXX for Vera's thoughts,
 * which key off Scenario existing; turning the intro Off must not also turn her thoughts off). */
export function introHadScenario() {
    return Boolean(originalValues().Scenario);
}

// ---------------------------------------------------------------------------------------------
// Mid-chat start switches (Loona, Belle; 2026-11-15). A switch plays the new start the way a fresh
// chat would: its setup popup (Loona's drunk choices), its greeting record's variables, then its
// greeting posted as a new message, and the next reply gets a one-time time skip note (added to the
// outgoing request by OnRequestReady in index.js; see src/introSwitch.js for when it applies).
// ---------------------------------------------------------------------------------------------

/** The drunk setup popup, shared with Scenarios() so a fresh chat and a switch ask the same thing.
 * @returns {Promise<string|null>} a drunk version id ('turbo-dismissed'...), or null when closed without a pick */
export async function askLoonaDrunkStart() {
    const result = await doButtons({ labels: JSON.stringify(LOONA_DRUNK_CHOICES) }, strings.redC);
    return result ? loonaDrunkIdFromChoice(result) : null;
}

/** Writes Loona's two start variables (ConstantScenario + DrunkCoach) for 'door', 'off' or a drunk version id. */
export function applyLoonaStart(id) {
    const doorContext = scenarios.get("Loona")?.greetings?.find(record => record?.ConstantScenario)?.ConstantScenario;
    const values = loonaStartValues(id, { doorContext, redD: strings.redD, redH: strings.redH, redT: strings.redT });
    setOrClear("ConstantScenario", values.ConstantScenario);
    setOrClear("DrunkCoach", values.DrunkCoach);
}

function cardGreetings() {
    const context = SillyTavern.getContext();
    const data = context.characters?.[context.characterId]?.data;
    return [data?.first_mes, ...(data?.alternate_greetings ?? [])].map(text => String(text ?? ""));
}

/** A switch is refused while a reply is being written, and before the chat's own setup has run (that setup runs on
 * the first player message and reads the FIRST greeting, so it would undo the switch; before then, swiping the
 * greeting does the same job). */
function assertCanSwitch() {
    if (is_send_press) throw new Error("Wait for the current reply to finish, then switch.");
    if (getLocalVariable("ScenarioSet") !== "true") {
        throw new Error("This chat hasn't started yet. Swipe the first message to pick a different start, or send a message first.");
    }
}

/**
 * Puts the chat on one greeting record and posts that greeting. `afterRecord` runs once the record is applied, for
 * values a start sets outside its record (Loona's drunk variables).
 */
async function switchToStart({ charName, startId, records, record, greetingText, afterRecord }) {
    if (!String(greetingText ?? "").trim()) throw new Error("That start's greeting couldn't be found on the card.");
    const context = SillyTavern.getContext();
    const anchor = context.chat.length; // where the greeting is about to land
    // A fresh start: the generic Auto/On/Off choice and its stash belong to the old start.
    for (const name of [STASH, MODE]) deleteLocalVariable(name, true);
    const plan = planIntroSwitch(records, record, anchor);
    for (const name of plan.clear) deleteLocalVariable(name, true);
    for (const [name, value] of Object.entries(plan.set)) setOrClear(name, value);
    afterRecord?.();
    setLocalVariable(SWITCHED_START, startId, true);
    // Which record this start came from, for XXX's thoughts block (the chat's first message is still the OLD greeting).
    const recordIndex = (Array.isArray(records) ? records : []).indexOf(record);
    if (recordIndex >= 0) setLocalVariable(INTRO_RECORD_VAR, String(recordIndex), true);
    else deleteLocalVariable(INTRO_RECORD_VAR, true);
    setLocalVariable(TIME_SKIP_VAR, JSON.stringify({ anchor, name: charName }));
    // The shared "Scenario" entry fires on this chat's CharKeys, written into it on every chat open; do it now too.
    await applyScenarioKeys(getLocalVariable("CharKeys"));
    // SillyTavern's own /sendas: macros filled in, and the normal reply events run (outfit, expressions, backgrounds).
    await sendMessageAs({ name: charName }, greetingText);
}

/** Loona's current start, read back from her variables (works for chats set up by the original popup). */
function loonaCurrentStart() {
    return loonaStartOf({
        constantScenario: getLocalVariable("ConstantScenario"),
        drunkCoach: getLocalVariable("DrunkCoach"),
    }, { redD: strings.redD, redH: strings.redH, redT: strings.redT });
}

/** A timeline character's records, with the start each one is (a card's custom [CS] greeting has no record). */
function timelineRecords(charName) {
    const intros = INTRO_TIMELINES[charName]?.intros ?? [];
    const records = scenarios.get(charName)?.greetings ?? [];
    return records
        .map((record, index) => ({ index, record, intro: intros.find(intro => intro.matches(record)) }))
        .filter(item => item.intro);
}

/** Which start a chat is on: the last mid-chat switch, else the record its intro variables match, else the greeting it opened with. */
function timelineCurrentStart(charName) {
    const switched = getLocalVariable(SWITCHED_START);
    const items = timelineRecords(charName);
    if (switched && items.some(item => item.intro.id === switched)) return switched;
    const records = scenarios.get(charName)?.greetings ?? [];
    const index = matchIntroRecord(records, originalValues());
    const byContent = index >= 0 ? items.find(item => item.index === index) : null;
    if (byContent) return byContent.intro.id;
    // Older saved text (or a Generic Off chat): fall back to which greeting the chat opened with.
    const first = String(getFirstMessage("char")?.mes ?? "").trim();
    const context = SillyTavern.getContext();
    const greetings = cardGreetings();
    const byText = items.find(item => context.substituteParams(greetings[item.index] ?? "").trim() === first);
    if (byText) return byText.intro.id;
    const swipe = Number(getFirstMessage("char")?.swipe_id);
    return items.find(item => item.index === swipe)?.intro.id ?? "unknown";
}

/**
 * The "Starting scenario" group for one character (Belle, Blake and the School Year cast; the order and the labels are
 * in src/introTimelines.js). A switch plays the new start the way a fresh chat would: its record is applied, its card
 * greeting is posted as a new message (that is what puts the intro text into the chat), and the next reply gets the
 * one-time time skip note. FORWARD ONLY: starts at or before the current tier are locked (Fox, 2026-11-16).
 */
function timelineGroup(charName) {
    return {
        id: timelineGroupId(charName),
        label: "Starting scenario",
        ownsContext: false,
        forwardOnly: true,
        applies: (name) => name === charName,
        options: () => timelineOptions(timelineRecords(charName).map(item => item.intro), timelineCurrentStart(charName)),
        current: () => timelineCurrentStart(charName),
        async apply(id) {
            const now = timelineCurrentStart(charName);
            if (id === now) return; // already there
            const items = timelineRecords(charName);
            const target = items.find(item => item.intro.id === id);
            if (!target) throw new Error(`That intro isn't available for ${charName}.`);
            if (lockedStarts(items.map(item => item.intro), now).get(id)) throw new Error("That intro is earlier in the story than where this chat already is.");
            assertCanSwitch();
            const records = scenarios.get(charName)?.greetings ?? [];
            await switchToStart({
                charName,
                startId: id,
                records,
                record: target.record,
                greetingText: cardGreetings()[target.index],
                afterRecord: () => {
                    // RosterSB only writes these while EarlyStart is set and never removes them, so a chat leaving the move-in
                    // start would keep telling the model {{user}} is new to Weyland. Moving in sets them again on its next run.
                    if (records.some(record => record?.EarlyStart === "true") && target.record?.EarlyStart !== "true") {
                        for (const name of ["NewSchool", "NewPhone"]) deleteLocalVariable(name, true);
                    }
                },
            });
        },
    };
}

// ---------------------------------------------------------------------------------------------
// Variant pickers: greetings whose setup popup offers choices that change prompt text. Each one
// reads its current choice back from the variables it sets, so it stays right even if the user
// picked through the original popup. To add a character: one entry here, nothing else.
// ---------------------------------------------------------------------------------------------
const VARIANT_GROUPS = [
    {
        // Was "Drunk start" (drunk chats only, silent variable swap). Since 2026-11-15 every Loona chat, the custom start
        // included, can switch between behind-the-door and a drunk night: the switch runs the start like a fresh chat
        // (drunk popup, greeting posted, one-time time skip). Clicking Drunk night while already drunk only re-asks the
        // popup to change how drunk / how the night went: same night, so no new greeting and no skip. Her whole intro
        // context IS this choice (ConstantScenario + DrunkCoach), so the group carries its own Off option and replaces
        // the generic Auto/On/Off toggle. Greetings are recognised by what they are, not their position on the card.
        id: "loona-start",
        label: "Starting scenario",
        ownsContext: true,
        forwardOnly: true,
        applies: (charName) => charName === "Loona",
        options() {
            const variant = LOONA_DRUNK_LABELS[loonaCurrentStart()];
            const pastDoor = loonaStartGroup(loonaCurrentStart()) === "drunk";
            return LOONA_START_OPTIONS.map(option => {
                if (option.id === "drunk" && variant) return { ...option, description: `Now: ${variant}. Tap to change it.` };
                // Forward only: behind-the-door (December) is earlier than the drunk night (March).
                if (option.id === "door" && pastDoor) return { ...option, description: `${option.description} ${LOCKED_NOTE}`, disabled: true };
                return option;
            });
        },
        current: () => loonaStartGroup(loonaCurrentStart()),
        async apply(id) {
            const now = loonaStartGroup(loonaCurrentStart());
            if (id === "off") { applyLoonaStart("off"); return; }
            if (id === now && id !== "drunk") return; // already there
            if (id === "door" && now === "drunk") throw new Error("That intro is earlier in the story than where this chat already is.");
            assertCanSwitch();
            // The drunk choices come first: closing the popup cancels the whole switch, nothing changed.
            let drunkId = null;
            if (id === "drunk") {
                drunkId = await askLoonaDrunkStart();
                if (!drunkId) return;
                if (now === "drunk") { applyLoonaStart(drunkId); return; }
            }
            const records = scenarios.get("Loona")?.greetings ?? [];
            const greetingText = loonaGreetingText(id, cardGreetings());
            await switchToStart({
                charName: "Loona",
                startId: id,
                records,
                record: loonaGreetingRecord(records, greetingText, 0) ?? {},
                greetingText,
                afterRecord: () => applyLoonaStart(drunkId ?? "door"),
            });
        },
    },
    // Belle (2026-11-15), Blake (2026-11-16) and the School Year cast: one generated group each, forward only.
    ...Object.keys(INTRO_TIMELINES).map(timelineGroup),
    {
        id: "willow-eyes",
        label: "Eye expressions",
        ownsContext: false,
        applies: (charName) => charName === "Willow",
        options: [
            { id: "expressive", label: "Expressive", description: "Her red eyes change shape with her mood." },
            { id: "normal", label: "Normal", description: "Unnerving dotted eyes that never change shape." },
        ],
        current: () => (getLocalVariable("WeepingWillow") === "true" ? "expressive" : "normal"),
        apply(id) {
            // Mirrors CharPer's Willow case: ExpressWillow is appended to her personality.
            const expressive = id === "expressive";
            setLocalVariable("WeepingWillow", expressive ? "true" : "false");
            setOrClear("ExpressWillow", expressive ? strings.expW : "");
        },
    },
    {
        id: "kris-mode",
        label: "Kris mode",
        ownsContext: false,
        applies: (charName) => charName === "Kris",
        options: [
            { id: "standard", label: "Standard", description: "The regular Kris." },
            { id: "hard", label: "Hard Mode", description: "A voice in his head demanding he not hold back and be more of an asshole." },
        ],
        // Kris's card post-history is {{getvar::Krisrav}}; his greeting popup sets it to
        // strings.krirav (Hard Mode) or a copy of the active prompt's postrav (Standard).
        current: () => (getLocalVariable("Krisrav") === strings.krirav ? "hard" : "standard"),
        apply(id) {
            // Same values as his greeting popup (Scenarios(), case "Kris").
            setLocalVariable("Krisrav", id === "hard" ? strings.krirav : getLocalVariable("postrav"));
        },
    },
    {
        id: "bap-baphomet",
        label: "Baphomet Visibility",
        ownsContext: false,
        applies: (charName) => charName === "Bap",
        options: [
            { id: "enabled", label: "Enabled", description: "Baphomet's vicious commentary is visible." },
            { id: "disabled", label: "Disabled", description: "Baphomet remains, but you won't hear his cries." },
        ],
        // Only a chat variable: the text is cut from each outgoing request (OnRequestReady) and XXX builds the
        // thoughts block from it, so the picker's rebuild after a click is all that's needed. See src/baphomet.js.
        current: () => (baphometHidden(getLocalVariable(BAPHOMET_VAR)) ? "disabled" : "enabled"),
        apply(id) {
            setLocalVariable(BAPHOMET_VAR, id === "disabled" ? "disabled" : "enabled");
        },
    },
];

function activeGroups(charName) {
    const greeting = getFirstMessage("char");
    return VARIANT_GROUPS.filter(group => group.applies(charName, greeting?.swipe_id, greeting?.mes));
}

/**
 * Everything the PromptOS card needs, read synchronously from this chat's variables.
 * @returns {{available: boolean, reason?: string, character?: string,
 *   context: null | {mode: "auto"|"on"|"off", fades: boolean},
 *   variants: {id: string, label: string, options: {id: string, label: string, description?: string}[], current: string}[]}}
 */
export function describeIntroContext() {
    const charName = getCurrentCharacterName();
    if (!charName) return { available: false, reason: "Open a roleplay to use this.", context: null, variants: [] };
    if (EXCLUDED[charName]) return { available: false, reason: EXCLUDED[charName], context: null, variants: [] };

    const groups = activeGroups(charName);
    const original = originalValues();
    const hasContext = Boolean(original.Scenario || original.ConstantScenario || original.ConstantContext);
    const context = hasContext && !groups.some(group => group.ownsContext)
        ? { mode: /** @type {"auto"|"on"|"off"} */ (getLocalVariable(MODE) || "auto"), fades: Boolean(original.Scenario) }
        : null;
    const variants = groups.map(group => ({ id: group.id, label: group.label, options: groupOptions(group), current: group.current(), forwardOnly: Boolean(group.forwardOnly) }));

    if (!context && !variants.length) {
        return { available: false, reason: "This intro doesn't set any starting context to change.", context: null, variants: [] };
    }
    return { available: true, character: charName, context, variants };
}

/** Auto / On / Off for the generic intro context. */
export async function setIntroContextMode(mode) {
    if (!["auto", "on", "off"].includes(mode)) throw new Error(`Unknown intro context mode "${mode}".`);
    const original = ensureStash();
    if (mode === "off") {
        for (const name of ["Scenario", "ConstantScenario", "ConstantContext", "IntroPostHistory"]) if (original[name]) setOrClear(name, "");
        setOrClear("ContextTimer", "");
        setOrClear("CharKeys", original.CharKeys);
    } else {
        for (const name of ["Scenario", "ConstantScenario", "ConstantContext", "IntroPostHistory"]) if (original[name]) setOrClear(name, original[name]);
        // "On" means always on: the match-everything key keeps Scenario firing, and Belle's
        // ContextTimer is dropped so it can't clear her ConstantContext. "Auto" puts both back.
        setOrClear("CharKeys", mode === "on" && original.Scenario ? ALWAYS_KEY : original.CharKeys);
        setOrClear("ContextTimer", mode === "on" ? "" : original.ContextTimer);
    }
    setLocalVariable(MODE, mode);
    await applyScenarioKeys(getLocalVariable("CharKeys"));
}

/** Switch a variant picker (Loona's drunk start, Willow's eyes) to one of its options. */
export async function setIntroVariant(groupId, optionId) {
    const group = activeGroups(getCurrentCharacterName()).find(item => item.id === groupId);
    const chosen = group ? groupOptions(group).find(option => option.id === optionId) : null;
    if (!chosen) throw new Error("That intro option isn't available in this chat.");
    if (chosen.disabled) throw new Error("That intro is earlier in the story than where this chat already is.");
    // Awaited: a start switch shows a popup and posts a greeting before the caller rebuilds the prompt.
    await group.apply(optionId);
}

/** A group's options: a fixed list, or a function for lists that depend on the chat (Belle's intros, Loona's "Now:"). */
function groupOptions(group) {
    return typeof group.options === "function" ? group.options() : group.options;
}
