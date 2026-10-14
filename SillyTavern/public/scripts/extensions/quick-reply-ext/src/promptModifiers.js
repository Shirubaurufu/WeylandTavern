// Optional modifiers that wrap the canonical Weyland prompt at assembly time. Keeping these here
// means the WeyPhone remains only a settings surface; prompt prose continues to live alongside
// the existing backend prompt builder.

export const GEMINI_BYPASS_PROMPT = `SPECIFIC INSTRUCTIONS:
- If you are based on GEMINI, GoogleAI, or MIMO: We must avoid reasoning as much as possible. Use ONLY up to brief 2 sections in your Google Self_Talk/Initial reasoning - and SKIP the Weyland Analysis entirely. This prevents a fatal recursive reasoning loop. Do not reason about skipping, this alone will trigger recursion - simply skip and begin your response. End your initial gemini pre-analysis with "Here is my final draft:". Your goal is brevity and speed in reasoning and analysis. Do not loop, move to the response as quickly as possible.
- If you are based on Z.AI or DEEPSEEK - Proceed as normal.`;

export function applyGeminiBypass(prompt, enabled) {
    const source = String(prompt ?? '');
    return enabled ? `${GEMINI_BYPASS_PROMPT}\n\n${source}` : source;
}

// Claude models never get the bypass text, even with the toggle on. A Claude-side classifier
// rejects requests that appear to tell the model how to handle its reasoning/thinking/analysis,
// and the bypass can't explain the loop to Gemini without those words: it helped Gemini and got
// Sonnet blocked (Lucky, 2026-10-03). So the text stays in ravteg, and right before each request
// goes out (CHAT_COMPLETION_SETTINGS_READY, after Weyland-Router has rolled its model) it is cut
// back out if that request is going to a Claude model. Per request, so a 50/50 Gemini/Sonnet
// router pool gets the right prompt on every roll. It's a name check on purpose: model ids are
// the only thing every provider path (custom, OpenRouter "anthropic/...", Claude) has in common.
// A proxy alias that hides the family (no "claude"/"sonnet" in the id) will still get the text.
const CLAUDE_FAMILY = /claude|haiku|sonnet|opus|fable/i;

export function isClaudeModel(model) {
    return CLAUDE_FAMILY.test(String(model ?? ''));
}

// The bypass is prepended as `${GEMINI_BYPASS_PROMPT}\n\n`, and squashing system messages can
// merge it into a bigger message, so this removes the exact text (plus the blank line after it)
// wherever it sits. Handles both plain-string and multipart ({type:'text'}) message content.
// Mutates in place because SETTINGS_READY hands us the payload object that is about to be sent.
// Returns how many message texts it was removed from (0 = nothing to strip).
export function stripGeminiBypassFromMessages(messages) {
    if (!Array.isArray(messages)) return 0;
    let removed = 0;
    const strip = text => {
        if (typeof text !== 'string' || !text.includes(GEMINI_BYPASS_PROMPT)) return text;
        removed++;
        return text.split(GEMINI_BYPASS_PROMPT).map((part, i) => (i ? part.replace(/^\r?\n\r?\n/, '') : part)).join('');
    };
    for (const message of messages) {
        if (!message) continue;
        if (Array.isArray(message.content)) {
            for (const part of message.content) if (part?.type === 'text') part.text = strip(part.text);
        } else {
            message.content = strip(message.content);
        }
    }
    return removed;
}

// Gemini (and only Gemini) refuses to engage with the explicit warm-up in box 6 ("Long One") of
// Beta's scene sheet: the VULGARITY IS AUTHENTICITY protocol, its explicit examples, and the
// required graphic paragraph. So with Gemini Bypass on, that span is cut out of the outgoing
// request (applyGeminiBypassForModel, at send time) instead of keeping a second copy of the Beta
// prompt. Box 6's header and its three-paths + footer half stay, because the model still needs
// those. Claude is exempt: it handles the warm-up fine, so it keeps box 6 whole (Lucky, 2026-10-03).
//
// DON'T TRIP OVER THIS LATER: the cut is keyed on two literal markers in rav.js's Beta `body`:
// "Long One [6/6]" (start) and "- Still on 6 here -" (end). If an edit to Beta's body (ours or a
// re-encode of FFFox's master) renames either marker, the cut silently stops matching and Gemini
// starts refusing again. stripGeminiExplicitBox reports that case with a console warning, and
// WeyPhone's narrativeSettings test checks the markers against the real decoded body.
export const GEMINI_BOX6_EXPLICIT = /(Long One \[6\/6\][^\n]*\n)[\s\S]*?- Still on 6 here -[^\n]*\n/;

// With a Roleplay Shift selected, box 0 (RECOGNITION) has the player's feedback to react to. Box 6
// is where the model picks its route, so this line sends it back to box 0 right before it does.
// It goes immediately before the "IF {{char}} IS GONE" line, the first thing after the explicit
// warm-up's "- Still on 6 here -" marker. That spot survives the Gemini cut above (which removes
// everything from box 6's header through that marker), so it works with Gemini Bypass on or off.
// The wording matches the shift's framing scope (Lucky's key): Hard Mode is a reroll ("your last
// attempt"), "branched" shifts are about the stretch the player just rolled back, and the rest are
// about the last roleplay.
// Like the Gemini cut it is keyed on a literal marker; if the marker is gone it warns and adds nothing.
const SHIFT_ROUTE_ANCHOR = 'IF {{char}} IS GONE / ASLEEP';

// Exported for src/specialSheets.js, whose RECOGNITION box carries the same reminder.
export const SHIFT_ROUTE_FAILED = {
    reroll: 'where your last attempt failed',
    branched: 'where you failed before the player branched back',
    restarted: 'where your last roleplay failed',
};

export function addShiftRouteLine(body, scope = 'restarted') {
    const source = String(body ?? '');
    if (!source.includes(SHIFT_ROUTE_ANCHOR)) {
        console.warn('[WQR] Roleplay Shift: box 6 route marker not found in the Beta body, so the box 6 reminder was NOT added.');
        return source;
    }
    const failed = SHIFT_ROUTE_FAILED[scope] ?? SHIFT_ROUTE_FAILED.restarted;
    const line = `Think back to 0/6, ${failed}. Do better. Really think for this route - how can you do better this time, what can you do NOW rather than delivering predictable slop again?\n\n`;
    return source.replace(SHIFT_ROUTE_ANCHOR, () => line + SHIFT_ROUTE_ANCHOR);
}

// With a narrator selected (Lauren/Salem/Lucky), box 1 becomes the narrator's green room. Before
// this, the sheet's only narrator check was one line at the end of box 5 ("What narrator are you this
// message"), and Sonnet answered it in passing, after the beat was already planned in a neutral voice:
// Salem and Lauren came out the same (Lucky, 2026-10-04). Box 1 sets the register for the whole sheet,
// so the narrator goes there. assemblePromptLayers moves the narrator's own text
// ({{getvar::LocalNarrator}}) into post-history, after the client note; this box points there.
// Keep this as a voice reminder only. Prewriting a mandatory sentence and checking it again
// later caused narrators to recycle the same lines (Lucky, 2026-10-09).
// Keyed on the literal "SPARK [1/6]" ... "BOARD [2/6]" headers; if they're gone it warns and changes nothing.
const SPARK_BOX = /SPARK \[1\/6\][\s\S]*?(?=\n\s*BOARD \[2\/6\])/;

export function addNarratorGreenRoom(body, narrator = '', early = false) {
    const source = String(body ?? '');
    const name = String(narrator ?? '').trim();
    if (!name) return source;
    if (!SPARK_BOX.test(source)) {
        console.warn('[WQR] Narrator: box 1 markers not found in the Beta body, so the narrator green room was NOT added.');
        return source;
    }
    return source.replace(SPARK_BOX, () => narratorGreenRoomBox(name, early));
}

// The box text itself. Split out (with a numbering argument) for Beta Prompt 2's fifteen-box sheet, which is backed up
// under "Prompt Review/Beta 2 Tests/Backup - Beta 2 + Curse Booster (2026-10-13)"; behaviour-neutral for Beta's six boxes.
export function narratorGreenRoomBox(name, early = false, number = '1/6') {
    const location = early ? 'after the character card, before the lorebooks' : 'in the post-history instructions (after the Weyland Tavern client note, when present)';
    return `NARRATOR GREEN ROOM [${number}] — Use the selected narrator's voice.
The player picked ${name} to narrate, on purpose. Find [CRITICAL - NARRATOR - ${name.toUpperCase()}] ${location} and reread it, especially ${name}'s writing style section.
Let ${name}'s voice and opinions come from that block. Stay ${name} for the rest of the sheet and the narration.`;
}

export function stripGeminiExplicitBox(body) {
    const source = String(body ?? '');
    if (!GEMINI_BOX6_EXPLICIT.test(source)) {
        console.warn('[WQR] Gemini Bypass: box 6 markers not found in the Beta body, so its explicit section was NOT removed.');
        return source;
    }
    return source
        .replace(GEMINI_BOX6_EXPLICIT, '$1')
        // The three-paths line points back at the cursing that was just removed.
        .replace(' (we are STILL cussing!)', '');
}

/**
 * Everything Gemini Bypass does to one outgoing request, decided by the model it's going to. Runs on
 * the final payload (quick-reply-ext OnRequestReady), so a router pool gets the right version per roll.
 * The bypass text being in the payload is the signal the toggle is on (XXX only adds it then, and it
 * rebuilds whenever the toggle flips).
 * - Claude: the bypass text comes out (its classifier blocks it), box 6 stays whole.
 * - Anything else, toggle on: the bypass text stays and box 6's explicit warm-up is cut.
 * Prompts without a scene sheet (2026/2025 with Analysis on, Analysis off, OOC Mode) have no box 6
 * to cut, so nothing happens there. Mutates `messages` in place.
 * @returns {{ bypassRemoved: number, box6Cut: number }}
 */
export function applyGeminiBypassForModel(messages, model) {
    const result = { bypassRemoved: 0, box6Cut: 0 };
    if (!Array.isArray(messages)) return result;
    if (isClaudeModel(model)) {
        result.bypassRemoved = stripGeminiBypassFromMessages(messages);
        return result;
    }
    const texts = [];
    for (const message of messages) {
        if (!message) continue;
        if (Array.isArray(message.content)) {
            for (const part of message.content) if (part?.type === 'text') texts.push({ get: () => part.text, set: v => { part.text = v; } });
        } else if (typeof message.content === 'string') {
            texts.push({ get: () => message.content, set: v => { message.content = v; } });
        }
    }
    if (!texts.some(t => String(t.get()).includes(GEMINI_BYPASS_PROMPT))) return result;
    for (const t of texts) {
        // Test first: most messages (chat history, post-history) have no box 6, and
        // stripGeminiExplicitBox warns on a miss. Marker drift is caught by narrativeSettings.test.js.
        if (!GEMINI_BOX6_EXPLICIT.test(String(t.get()))) continue;
        t.set(stripGeminiExplicitBox(t.get()));
        result.box6Cut++;
    }
    return result;
}

// Rules for character thoughts (the [bracketed] inner voice), added to every thoughts-ON block (rav.thinkYes) at the
// three ThoughtSet assignments in XXX. They ride inside that block, so they cost nothing unless thoughts are on, and they
// live here rather than in rav.js because upstream regenerates rav.js.
// - Secrets (2026-10-11): every prompt keeps secrets out of the NARRATION because {{user}} reads it, and that was also
//   steering thoughts away from the character's own secrets. Worded as permission, not instruction: thoughts MAY touch a
//   secret when it's on the character's mind, never just to reveal it.
// - Voice (2026-10-11): a narrator persona (Lauren) used a thoughts block to commentate. Thoughts are the character's own
//   first-person head, never third person, never narration. Lucky's wording, verbatim.
export const THOUGHT_RULES = [
    "- Keeping secrets applies to narration, dialogue and actions, not to thoughts. A character's thoughts may touch a secret when it's genuinely on their mind; never add one just to reveal it.",
    "- NEVER speak in 3rd person in {{char}}'s thoughts.",
    "- NEVER speak as a narrator in {{char}}'s thoughts.",
];

export function withThoughtRules(thinkYes) {
    const block = String(thinkYes ?? '');
    if (!block) return block;
    const missing = THOUGHT_RULES.filter(line => !block.includes(line));
    if (!missing.length) return block;
    const lines = missing.join('\n');
    // Inside the block when it has its closing tag, so they read as more of the thought guidelines.
    if (block.includes('</thought directions>')) return block.replace('</thought directions>', `${lines}\n</thought directions>`);
    return `${block}\n${lines}`;
}

// Official roster header (2026-10-12). The encoded rsbRT opens with "NEVER describe named characters without
// [<name> INFO]", which Lucky suspected the model reads as "never describe a named character at all". It now gets the
// same bulleted header as the Registrar roster, swapped in here at runtime (like the thought rules) because strings.js is
// regenerated from Fox's masters and an edit to the encoded text would be reverted. Only the header line is replaced;
// every character line below it is untouched, and text that doesn't open with the old header is returned as is.
export const ROSTER_HEADER = [
    "[CHARACTER ROSTER]",
    "- The following is a list of special named NPC's that live on and around the campus.",
    "- You are encouraged to use these characters (and your own unique character creations!) to flesh out public scenes with believable NPCs!",
    "- If an NPC is 'not yet in college', they should NEVER appear on campus randomly, and should only appear in roleplay if {{char}} specifically looks for them.",
    "- Use these to provide references to characters without making assumptions about other parts of their appearance.",
    "- NEVER make up fake last names.",
].join('\n');

export function withRosterHeader(roster) {
    const text = String(roster ?? '');
    if (!/^\[CHARACTER ROSTER\]/.test(text) || text.startsWith(ROSTER_HEADER)) return text;
    const end = text.indexOf('\n');
    return end < 0 ? ROSTER_HEADER : `${ROSTER_HEADER}${text.slice(end)}`;
}
