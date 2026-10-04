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
import { getCurrentCharacterName } from "./general.js";
import strings from "./strings.js";

const STASH = "IntroCtxStash";
const MODE = "IntroCtxMode";
const CONTEXT_VARS = ["Scenario", "CharKeys", "ConstantScenario", "ConstantContext", "ContextTimer"];
// A WI key that matches any text, so the Scenario entry fires on every scan while "On".
const ALWAYS_KEY = "/[\\s\\S]/";

/** Variables to clear when Scenarios() sets up a fresh greeting, so a new intro starts on Auto. */
export const INTRO_CONTEXT_STATE_VARS = [STASH, MODE];

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
// Variant pickers: greetings whose setup popup offers choices that change prompt text. Each one
// reads its current choice back from the variables it sets, so it stays right even if the user
// picked through the original popup. To add a character: one entry here, nothing else.
// ---------------------------------------------------------------------------------------------
const VARIANT_GROUPS = [
    {
        id: "loona-drunk",
        label: "Drunk start",
        // Loona's whole intro context IS this choice (ConstantScenario + DrunkCoach), so the group
        // carries its own Off option and replaces the generic Auto/On/Off toggle.
        ownsContext: true,
        applies: (charName, greetingSwipe) => charName === "Loona" && greetingSwipe === 0,
        options: [
            { id: "kinda-dismissed", label: "Kinda drunk, turned him down" },
            { id: "kinda-hooked", label: "Kinda drunk, almost hooked up" },
            { id: "turbo-dismissed", label: "Turbo drunk, turned him down" },
            { id: "turbo-hooked", label: "Turbo drunk, almost hooked up" },
            { id: "off", label: "Off" },
        ],
        current() {
            const scenario = String(getLocalVariable("ConstantScenario") ?? "");
            if (!scenario) return "off";
            const turbo = String(getLocalVariable("DrunkCoach") ?? "") === strings.redT;
            const hooked = scenario === strings.redH;
            return `${turbo ? "turbo" : "kinda"}-${hooked ? "hooked" : "dismissed"}`;
        },
        apply(id) {
            // Same variables the original setup popup writes (Scenarios(), case "Loona").
            if (id === "off") {
                setOrClear("ConstantScenario", "");
                setOrClear("DrunkCoach", "");
                return;
            }
            const [level, outcome] = id.split("-");
            setOrClear("ConstantScenario", outcome === "hooked" ? strings.redH : strings.redD);
            setOrClear("DrunkCoach", level === "turbo" ? strings.redT : "");
        },
    },
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
];

function activeGroups(charName) {
    const greetingSwipe = getFirstMessage("char")?.swipe_id;
    return VARIANT_GROUPS.filter(group => group.applies(charName, greetingSwipe));
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
    const variants = groups.map(group => ({ id: group.id, label: group.label, options: group.options, current: group.current() }));

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
        for (const name of ["Scenario", "ConstantScenario", "ConstantContext"]) if (original[name]) setOrClear(name, "");
        setOrClear("ContextTimer", "");
        setOrClear("CharKeys", original.CharKeys);
    } else {
        for (const name of ["Scenario", "ConstantScenario", "ConstantContext"]) if (original[name]) setOrClear(name, original[name]);
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
    if (!group || !group.options.some(option => option.id === optionId)) throw new Error("That intro option isn't available in this chat.");
    group.apply(optionId);
}
