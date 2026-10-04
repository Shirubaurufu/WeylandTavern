// Old Prompt 2025's own Analysis: a short "scene sheet" in its post-history (plain JS on purpose; rav.js is regenerated upstream).
//
// Why this exists. 2025 originally had three lines ("CRITICAL: THINK BEFORE RESPONDING ... review your guidelines"). That gave
// models no envelope, no end marker and no statement that the message after it is final, so they reasoned, sent the message,
// commented on it, sent another, and ran out of response length. 2026 fixed it with a 14-step <think> block; Beta fixed it better
// with a tag-free sheet plus "the rough draft IS the final draft". This borrows Beta's mechanics, which Lucky has already proven:
//   - Envelope: a line "SCENE SHEET" ... a line "END OF SCENE SHEET". The Weyland-Formatter already hides exactly that
//     (weylandRegex.sceneSheetFull), and it ends the block at the header if the closing line is missing.
//   - No "reasoning"/"think"/"analysis" wording: Anthropic refuses prompts that frame this step as reasoning (see the Formatter note).
//   - Hard cap on boxes, a scripted finishing line, "the sheet is done, do not add to it", and an explicit stop after the footer.
//   - "Rough draft" framing with "the rough draft IS the final draft": the draft is complete and ends the response.
// What it leaves out on purpose: 2026's obscenity ritual, the "there is a bug" story and the wellbeing-protocol denial. 2025 is the
// plain prompt, and those are the parts that read like an injection to frontier models. The checks are 2025's own rules, short form.
// Edit the wording here. It is inserted into 2025's post-history only when Analysis is ON (see preparePromptBase).

export const PREP_SHEET_2025 = `[WEYLAND SCENE SHEET - SHORT FORM]
Before the message, a short scene sheet is filled out so the message arrives right the first time. The sheet is never shown to the user. Follow this format exactly, every response:

1. Your reply opens with this exact line, on its own: SCENE SHEET
2. Four brisk boxes (shorthand and bullets are ideal). HARD CAP: four boxes for the ENTIRE sheet. End each box with its counter: [1/4], [2/4], [3/4], [4/4].
3. Then the finishing lines below, then this exact line, on its own: END OF SCENE SHEET
4. Then your COMPLETE ROUGH DRAFT, and nothing after it.

BOARD [1/4] - the state of play:
- What did {{char}} say or do, and what did {{user}} just say or do? Commands in [brackets] = follow. {{user}}'s thoughts in [brackets] = ignore; you cannot read minds.
- Where is {{user}} physically, and what can they actually see, hear and smell from there?
- What does {{char}} look like RIGHT NOW (outfit, posture, expression, demihuman features)?
- Which mode tag goes in the HEADER (SAPH, ONYX, RUBY, or none)? If it is almost the next mode, it is the next mode.
- Are character thoughts ENABLED or DISABLED?

TRUTH [2/4] - what is under the surface:
- What does {{char}} genuinely feel and WANT right now? Not what is interesting, and not what is kind to {{user}}.
- Is there anything from earlier in the chat or the loaded lore that matters right now? ("No, not really" is a fine answer.) If it is a SECRET, keep it out of the narration: {{user}} reads the narration.
- Any NPCs present? What could they NOT possibly know? They are not omniscient, and they are not watching {{user}}.
- Name two or three things {{char}} might do, with the first words out of their mouth for each. Pick the one that is true to them, even if it is blunt, unhelpful or ends the scene. Do not soften it, hesitate, or hand {{user}} an easy out.

VOICE [3/4] - how it gets written:
- Which narrator is speaking this message, and how does that shape the writing?
- Repetition check: look at your last few replies. Which openings, descriptions, sentence shapes or paragraph counts keep recurring? Break them. Do not repeat the paragraph count of your last message (2-9 paragraphs).
- Dialogue check: do they sound like people (stammers, interruptions, swearing when it fits, a dumb thing said at the wrong moment) or like novelists? Fix it.

FOOTER [4/4] - the expression and outfit code. ONE word each, picked from the provided lists.

Finish the sheet by writing: "Okay. Here is my complete rough draft, starting with the header."
Then write this exact line, on its own: END OF SCENE SHEET
The sheet is done. Do not add to it.

AFTER THE SHEET: send your COMPLETE ROUGH DRAFT immediately after END OF SCENE SHEET. "Rough draft" means functionally complete: header, message, dialogue, formatting and footer, all final-draft ready, so that if generation is cut off the user still receives a whole response. The rough draft IS the final draft.
- Notes, doubts and corrections belong on the sheet BEFORE the draft, never after it.
- Do NOT comment on the draft, grade it, revise it, restart it or write a second version.
- The footer is the last line you write. When it is written, you are DONE: send nothing after it.
CLOSE THE SHEET. SEND HEADER. SEND MESSAGE. STOP.
// Context: some models, left to their own devices, treat their first message as a draft, comment on it, send another, and run out of space. The cap, the finishing line and the stop rule above are a guardrail against that, nothing more.`;
