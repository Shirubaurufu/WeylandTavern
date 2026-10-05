import { SHIFT_BODIES, SHIFT_FRAME, SHIFT_SCOPES } from './roleplayShifts.js';

// Shared by the roleplay assembler and Copycat; prompt prose stays in its canonical source.
export function assembleRoleplayShiftItem(shift, rav, analysisOn, scope = SHIFT_SCOPES[shift], customPreset = null) {
    if (shift === "Hard Mode") {
        return analysisOn ? `2. FEEDBACK: User feedback may appear below:\n\n${rav.directive}` : rav.directive;
    }
    // General-Use (called "Temporary" while it was only kept for testing) is the pre-split
    // reason2Empirical, the original built-in Beta feedback. It's written around the scene sheet
    // ("do box 6, every message"), so it only means anything with Analysis on.
    if (shift === "General-Use" || shift === "Temporary") return analysisOn ? rav.reason2Empirical : "";
    // Custom Preset: the player's own text (WeyPhone -> PromptOS -> Custom Preset), cleaned and capped
    // at 4,000 characters there, goes in exactly where a built-in shift's player quote goes.
    const custom = shift === "Custom Preset" ? customPreset : null;
    if (shift === "Custom Preset" && !custom) return "";
    const body = custom ? `> "${custom.text}"` : SHIFT_BODIES[shift];
    if (!body) return "";
    // "Branched" shifts are framed as "I just branched back, fix this stretch" instead of "my last
    // roleplay", so the wrapper around them says the same (see SHIFT_SCOPES in roleplayShifts.js).
    const branched = scope === "branched";
    let head = (branched ? SHIFT_FRAME.headBranched : SHIFT_FRAME.head).replace("{{MODIFIER_NAME}}", custom ? custom.name : shift);
    let tail = branched ? SHIFT_FRAME.tailBranched : SHIFT_FRAME.tail;
    // A preset is just the player's words, with no calibration examples for this line to refer to.
    if (custom) tail = tail.replace(/\n*The examples above[^\n]*/, "").trim();
    if (!analysisOn) {
        // No scene sheet: drop the list number and the pointer to the RECOGNITION box.
        head = head.replace(/^2\. /, "");
        tail = tail.replace(" Talk it through in your RECOGNITION box instead.", "");
    }
    return `${head}\n\n${body}\n\n${tail}`;
}

