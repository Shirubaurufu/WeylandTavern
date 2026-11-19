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

// Story chapters (Lucky, 2026-11-19): Foxfire Fortunes and Muse's Story Machine give a chat explicit chapters, and the
// model kept the old chapter number in its header after finishing one. Current's sheet lives in rav.js, which Fox
// regenerates from his masters, so the line is added here at assembly time (like the POV / latest-message lines in
// assemblePromptLayers) and covers Beta 3's own sheet the same way. It goes last in BOARD [2/6], right before ICEBERG
// [3/6]; if those headers move it warns and changes nothing. Skipped if the master ever gains the line itself.
// The line is only SENT while a storyline is injected (dropChapterCheckUnlessStory, at request time), so it can speak
// to that story directly. Its wording matches the flag rules in Foxfire's storyCore.js: the flag moves on the response
// AFTER the one where the ending happened, and the old flag in the headers above must not be copied (models stuck on Ch 1).
export const CHAPTER_CHECK_LINE = '- CHAPTER CHECK (custom storyline): Did the current chapter\'s ending already happen on the page in an earlier response? Tell me here. If yes, this response\'s header carries the next chapter flag from the storyline, never the old one copied from the headers above.';
const BOARD_END = /(BOARD \[2\/6\][\s\S]*?)(\s*)(?=ICEBERG \[3\/6\])/;
// The opening line of the storyline Foxfire Fortunes (and Muse's Story Machine) injects; present only while a story runs.
export const STORYLINE_MARKER = '[READ FIRST: ROLEPLAY CONTEXT - CUSTOM STORYLINE';

/**
 * Request time: cut the chapter check from the outgoing messages unless a storyline is in them. XXX builds the sheet
 * once, but a story can be loaded, finished or ejected between generations, so the payload decides. Returns true if cut.
 */
export function dropChapterCheckUnlessStory(messages) {
    if (!Array.isArray(messages)) return false;
    const text = message => (typeof message?.content === 'string' ? message.content : '');
    if (messages.some(message => text(message).includes(STORYLINE_MARKER))) return false;
    let cut = false;
    for (const message of messages) {
        if (!text(message).includes(CHAPTER_CHECK_LINE)) continue;
        message.content = message.content.split(`\n${CHAPTER_CHECK_LINE}`).join('').split(CHAPTER_CHECK_LINE).join('');
        cut = true;
    }
    return cut;
}

export function addChapterCheck(body) {
    const source = String(body ?? '');
    if (source.includes(CHAPTER_CHECK_LINE)) return source;
    if (!BOARD_END.test(source)) {
        console.warn('[WQR] Chapter check: BOARD [2/6] ... ICEBERG [3/6] not found in the sheet, so the chapter line was NOT added.');
        return source;
    }
    // Keep the blank lines that separated BOARD from ICEBERG; the new line goes right after BOARD's last item.
    return source.replace(BOARD_END, (_, board, gap) => `${board}\n${CHAPTER_CHECK_LINE}${gap}`);
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
        // Case-insensitive: Beta 3's sheet writes it "(we are still cussing!)" (src/betaPrompt3.js trims mid-sentence caps).
        .replace(/ \(we are still cussing!\)/i, '');
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

// With Gemini Bypass on, Gemini gets NO analysis at all (Lucky, 2026-11-14): the bypass text alone still let it loop on
// the scene sheet. The model is only known on the final payload (Weyland-Router rolls it AFTER the card's
// {{getvar::ravteg}} / post-history were already expanded), so XXX keeps an Analysis-off build of both slots in chat vars
// and OnRequestReady swaps the expanded text. Other models (Sonnet, GLM, DeepSeek...) are untouched. "Argon" is Gemini 4
// Argon, whose id may not say "gemini"; matched as its own word so "Targon" doesn't count.
const GEMINI_FAMILY = /gemini|(^|[^a-z])argon/i;

export function isGeminiModel(model) {
    return GEMINI_FAMILY.test(String(model ?? ''));
}

/**
 * The part of an Analysis-on prompt that the Analysis-off build replaces, cut at whole lines: everything before the first
 * line that differs and after the last one is shared. Swapping only this chunk (expanded on its own) matters because the
 * rest of a prompt can hold random macros (the post-history's "EXACTLY {{random}} thought sections"): expanding the whole
 * prompt again rolls a different number and the text no longer matches the request (live test, 2026-11-14).
 * Line cuts also keep a {{macro}} from being split in half.
 * @returns {{from: string, to: string}|null} null when the two are identical
 */
export function analysisDelta(onText, offText) {
    const on = String(onText ?? ''), off = String(offText ?? '');
    if (on === off) return null;
    let start = 0;
    const max = Math.min(on.length, off.length);
    while (start < max && on[start] === off[start]) start++;
    start = on.lastIndexOf('\n', start - 1) + 1; // back to the start of that line (0 when none)
    let end = 0;
    while (end < max - start && on[on.length - 1 - end] === off[off.length - 1 - end]) end++;
    // `end` shared characters at the tail; move the cut forward to the next line start inside them.
    const tailFrom = on.length - end;
    const lineStart = on.indexOf('\n', tailFrom - 1);
    let onEnd = lineStart < 0 || lineStart + 1 > on.length ? on.length : Math.max(tailFrom, lineStart + 1);
    // A pure insertion (2026 + Hard Mode: Analysis off ADDS Beta's bridge line) leaves nothing to search for, so take the
    // line before it along as the anchor, or the line after it at the very top.
    if (onEnd <= start && start === 0) {
        const next = on.indexOf('\n', onEnd);
        onEnd = next < 0 ? on.length : next + 1;
    }
    // The swap replaces the FIRST match, so grow the chunk upward a line at a time until its first match is this spot
    // (a lone blank line or a common sentence would otherwise land somewhere earlier in the prompt).
    while (start > 0 && (onEnd <= start || on.indexOf(on.slice(start, onEnd)) !== start)) {
        start = on.lastIndexOf('\n', start - 2) + 1;
    }
    const shared = on.length - onEnd;
    return { from: on.slice(start, onEnd), to: off.slice(start, off.length - shared) };
}

/**
 * Replaces the FIRST match of each `from` text with its `to` text in a chat-completion payload, in place, searching the
 * messages in order (system prompt first, chat history after), so a copy quoted later in the chat is never touched.
 * Only exact, non-empty matches change; squashed system messages still contain the text as a substring.
 * @param {Array} messages
 * @param {Array<{from: string, to: string}>} pairs
 * @returns {number} how many replacements were made
 */
export function swapPromptTexts(messages, pairs) {
    if (!Array.isArray(messages)) return 0;
    const pending = (pairs || []).filter(p => p && p.from && typeof p.to === 'string' && p.from !== p.to);
    if (!pending.length) return 0;
    let swapped = 0;
    const swap = text => {
        if (typeof text !== 'string') return text;
        for (let i = 0; i < pending.length; i++) {
            const { from, to } = pending[i];
            const at = text.indexOf(from);
            if (at < 0) continue;
            text = text.slice(0, at) + to + text.slice(at + from.length);
            pending.splice(i--, 1);
            swapped++;
        }
        return text;
    };
    for (const message of messages) {
        if (!message) continue;
        if (Array.isArray(message.content)) {
            for (const part of message.content) if (part?.type === 'text') part.text = swap(part.text);
        } else {
            message.content = swap(message.content);
        }
    }
    return swapped;
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

// rav.js (every prompt's thinkYes) and Blake's second greeting wrap the thoughts block in "<thought directions>" ...
// "</thought directions>": an XML-style tag with a space in its name, which is not a valid tag and matches nothing else in
// Weyland's prompts. Lucky (2026-10-14): use the house bracket form, like [WINDIGO LORE] ... [END WINDIGO LORE]. Converted
// here at send time, like the rules, because rav.js and scenarios.js are regenerated from Fox's masters and an edit there
// would be reverted. Every thoughts-on path goes through withThoughtRules or baphometThoughts, which both call this.
export const THOUGHT_BLOCK_OPEN = '[THOUGHT DIRECTIONS]';
export const THOUGHT_BLOCK_CLOSE = '[END THOUGHT DIRECTIONS]';
export function withThoughtBrackets(text) {
    return String(text ?? '')
        .replace(/<thought directions>/gi, THOUGHT_BLOCK_OPEN)
        .replace(/<\/thought directions>/gi, THOUGHT_BLOCK_CLOSE);
}

export function withThoughtRules(thinkYes) {
    const block = withThoughtBrackets(thinkYes);
    if (!block) return block;
    const missing = THOUGHT_RULES.filter(line => !block.includes(line));
    if (!missing.length) return block;
    const lines = missing.join('\n');
    // Inside the block when it has its closing marker, so they read as more of the thought guidelines.
    if (block.includes(THOUGHT_BLOCK_CLOSE)) return block.replace(THOUGHT_BLOCK_CLOSE, `${lines}\n${THOUGHT_BLOCK_CLOSE}`);
    return `${block}\n${lines}`;
}

// Greetings that switch thoughts on by themselves: scenarios.js gives them SpecialThoughts plus their own ThoughtSet (Jenn's
// drunk intro, Blake's second; Fawne's Cerberus greeting has its own branch first). XXX rewrites ThoughtSet on every run, and for SpecialThoughts it
// used to load rav.thinkSpec, which is only the "thoughts disabled" line, so those greetings never had thoughts (found
// 2026-10-14 in Lucky's drunk-Jenn chats). The text is read from the scenarios map, not the chat variable, because every chat
// started before this fix already had its copy overwritten. Returns '' when the greeting has no thoughts block of its own.
export function greetingThoughtSet(charScenarios, greetingSwipe) {
    const text = charScenarios?.greetings?.[greetingSwipe]?.ThoughtSet;
    return text ? withThoughtRules(String(text)) : '';
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
