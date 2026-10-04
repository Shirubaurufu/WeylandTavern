// src/dose.js
//
// PromptOS "A dose of..." (Lucky, 2026-10-02): a Roleplay Shift the player can't switch off on cue.
// The player picks a shift, and it takes over this chat for a secret, random number of character
// replies (2-10), then wears off on its own. The point is that the player isn't in control: if
// the character spirals mid-fight and then catches themselves ("fuck, what am i doing"), it lands
// because nobody flipped a switch. So the count is never shown, and the model is never told the
// shift is temporary (it would plan the turnaround). When it ends, the text simply stops being
// sent; the chat history carries the behavior for a reply or two, which is the natural comedown.
//
// What counts: each NEW character reply uses one dose. A reroll, regenerate or continue redoes the
// reply in front of you, so it keeps that reply's state and uses nothing up (otherwise spamming
// reroll would burn through the dose and hand control back). One exception: rerolling right after
// starting a dose doses the reply in front of you, and that counts as the first one.
// Quiet generations (WeyPhone texting etc.), impersonation and dry runs never touch it.
//
// Everything is chat-local, so a dose stays with the chat it started in. While it's live it takes
// the place of the global RoleplayShift (and of Hard Mode); afterwards the regular shift is back.
// XXX() reads activeDoseShift(); the GENERATION_AFTER_COMMANDS hook in index.js calls
// applyDoseForGeneration() and rebuilds XXX only when the dose turns on or off.
import { getLocalVariable } from "../../../variables.js";
import { deleteLocalVariable, setLocalVariable } from "./variables.js";
import { nextDoseState, rollDoseLength } from "./doseRules.js";

const SHIFT = "DoseShift";   // which shift is dosed
const TOTAL = "DoseTotal";   // how many replies it lasts (never shown to the player)
const USED = "DoseUsed";     // how many have been used
const LIVE = "DoseLive";     // "true" while the dose is in the prompt XXX last built
export const DOSE_STATE_VARS = [SHIFT, TOTAL, USED, LIVE];

/** The shift XXX should send instead of the regular one, or null when no dose is live. */
export function activeDoseShift() {
    const shift = String(getLocalVariable(SHIFT) || "");
    return shift && getLocalVariable(LIVE) === "true" ? shift : null;
}

/** What PromptOS may show: which shift, never how long it has left. */
export function describeDose() {
    const shift = String(getLocalVariable(SHIFT) || "");
    return shift ? { shift } : null;
}

/** Live from the very next generation, whether that's a new reply or a reroll. */
export function startDose(shift, random = Math.random) {
    setLocalVariable(SHIFT, shift);
    setLocalVariable(TOTAL, String(rollDoseLength(random)));
    setLocalVariable(USED, "0");
    setLocalVariable(LIVE, "true");
}

export function endDose() {
    for (const name of DOSE_STATE_VARS) deleteLocalVariable(name);
}

/**
 * Runs before every generation's prompt is built. Returns true when the dose turned on or off,
 * meaning XXX must rebuild ravteg before this generation.
 */
export function applyDoseForGeneration(type, dryRun) {
    if (dryRun) return false;
    const shift = String(getLocalVariable(SHIFT) || "");
    if (!shift) return false;
    const wasLive = getLocalVariable(LIVE) === "true";
    const next = nextDoseState({ used: Number(getLocalVariable(USED)) || 0, total: Number(getLocalVariable(TOTAL)) || 0 }, type);
    if (!next) return false;
    if (next.ended) {
        endDose();
        return wasLive;
    }
    setLocalVariable(USED, String(next.used));
    setLocalVariable(LIVE, "true");
    return !wasLive;
}
