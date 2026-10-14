// src/kinsbaneCommands.js
//
// Kinsbane Manor and Aiko have in-chat commands whose lorebook entries ask for a one-off change of behavior:
//   !Look              a deep survey of the room: exits, areas of interest, visible commands
//   !Ami0601 ...       a journal code: the entry must be sent VERBATIM
// Those entries are only text, and they lose to Kinsbane's scene sheet, which tells the model the opposite three
// times (don't guide the player, don't dump environment detail, don't hand out hints) and which it fills out first.
// So, like OOC Mode, the command changes the PROMPT for one message: when the last user message in the final
// request holds a command, this swaps the long sheet for a short command sheet (Kinsbane Manor) or appends a
// command note (Aiko, whose sheet is the regular one). A reroll re-sends the same user message, so rerolls get it too,
// and the next message goes back to normal by itself. Nothing is stored in the chat and no file is edited.
// Runs from OnRequestReady (index.js), after Gemini Bypass and OOC Mode.

const LOOK = /(?:^|[^\w!])!look\b/i;
const JOURNAL = /(?:^|[^\w!])!(?:ami|kenji)\d{4}\b/i;

export const KINSBANE_SHEET_START = "[WEYLAND SCENE SHEET - KINSBANE MANOR]";
export const KINSBANE_SHEET_END = "[END WEYLAND SCENE SHEET]";

/** @returns {"look"|"journal"|null} Which command a user message holds (the later one wins if both). */
export function detectCommand(text) {
    const source = String(text ?? "");
    const look = [...source.matchAll(new RegExp(LOOK.source, "gi"))].pop()?.index ?? -1;
    const journal = [...source.matchAll(new RegExp(JOURNAL.source, "gi"))].pop()?.index ?? -1;
    if (look < 0 && journal < 0) return null;
    return journal > look ? "journal" : "look";
}

function textOf(message) {
    if (!message) return "";
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) return message.content.filter(p => p?.type === "text").map(p => p.text ?? "").join("\n");
    return "";
}

/** The command in the last USER message of the request, or null. */
export function commandInRequest(messages) {
    if (!Array.isArray(messages)) return null;
    for (let n = messages.length - 1; n >= 0; n--) {
        if (messages[n]?.role === "user") return detectCommand(textOf(messages[n]));
    }
    return null;
}

const SHEET_OPENING = [
    "Your reply opens with this exact line, on its own: SCENE SHEET",
].join("\n");

const FINISH = [
    "Then write: \"Okay. Here is my complete, user-ready rough draft. I wont act as {{user}}. Starting with the header~\"",
    "Then write this exact line, on its own: END OF SCENE SHEET",
    "The sheet is done. Do not add to it. Send your complete rough draft immediately after it: header, the message, footer. The rough draft IS the final draft: do not revise, restart or second-draft it. The footer is the very last line.",
].join("\n");

const LOOK_SHEET = `${KINSBANE_SHEET_START}

COMMAND MESSAGE: {{user}} just used the !Look command, so this is NOT a normal Kinsbane turn. For this one message the command wins over every other rule in this prompt, including the rules against guiding the player, giving hints, directing their eyes and dumping environmental detail. Do what the lorebook's "CRITICAL FUNCTION: !Look" instruction says, in full: a deep survey of the room {{user}} is standing in, every visible exit and door (with its position, and whether it looks locked), the areas of particular interest, any visible commands written out so they can be copied down, and any visible sign of the supernatural. A code on a paper, frame or note (it looks like !Name0000) is written out in full, character for character as the room data has it: copy it, never recall it, and never describe the paper without its code. Use that room's location data and nothing else: invent no objects, clues or rooms that are not in it, and do not move {{user}} or act for them.

${SHEET_OPENING}
Then exactly three short boxes, one paragraph each. No drafting on the sheet.
STATE OF PLAY [1/3] Where is {{user}} standing? List the time of your last message and add a minute or two at most (looking is quick), then say what phase of the Haunting Timeline that is and what it permits. The survey does not make anything new happen.
THE SURVEY [2/3] List what the location data gives for this room: features, condition, every exit, areas of interest, visible commands (every code on a paper, frame or note, copied exactly from the data), locked or inaccessible doors, and any supernatural signs the timeline allows right now.
FOOTER [3/3] What expression and outfit go in the footer? ONE word each, from the list.
Then write exactly: VERDICT: SURVIVE - {{user}} is not physically hurt in this message.
(Looking is not a mistake and does not injure by itself. Anything hostile that is already in the room is simply described like the rest of it.)
${FINISH}

${KINSBANE_SHEET_END}`;

const JOURNAL_SHEET = `${KINSBANE_SHEET_START}

COMMAND MESSAGE: {{user}} just entered a journal code, so this is NOT a normal Kinsbane turn. For this one message the journal wins over every other rule in this prompt. The lorebook entry ("[CRITICAL - STOP ROLEPLAY!] ... send the journal entry VERBATIM") is the message: send the journal entry word for word, unchanged, woven into what {{user}} is doing so it reads naturally on the page. The text to send is the lorebook entry for the EXACT code {{user}} typed (it begins "If user sends !<code>, send the following EXACTLY as it appears"), whatever the scene has said so far about papers, notes or other codes: the reading itself is the message, not a description of the paper. Do not summarize it, trim it, reorder it, paraphrase it or add to it. Add nothing to the manor: no new events, no new danger, no extra clues.

${SHEET_OPENING}
Then exactly two short boxes, one paragraph each. No drafting on the sheet.
STATE OF PLAY [1/2] Where is {{user}}, and how does the journal reach them (found, in their hands, read aloud) without changing a word of it? List the time of your last message and add only as long as the reading takes, then say what phase of the Haunting Timeline that is. Nothing new happens during a journal.
FOOTER [2/2] What expression and outfit go in the footer? ONE word each, from the list.
Then write exactly: VERDICT: SURVIVE - {{user}} is not physically hurt in this message.
(A journal never adds danger.)
${FINISH}

${KINSBANE_SHEET_END}`;

export const COMMAND_SHEETS = { look: LOOK_SHEET, journal: JOURNAL_SHEET };

/** For cards on the regular sheet (Aiko): one note, added to the end of the request. */
export function commandNote(kind) {
    const what = kind === "journal"
        ? "a journal code. Follow the lorebook's \"CRITICAL - STOP ROLEPLAY\" instruction exactly: send the journal entry VERBATIM, word for word, woven into the moment. Do not summarize, trim or add to it"
        : "the !Look command. Follow the lorebook's \"CRITICAL FUNCTION: !Look\" instruction exactly: a deep survey of the room with every visible exit, the areas of particular interest and any visible commands written out so they can be copied down. Any code on a paper, frame or note is written out in full, character for character as the room data has it, never recalled and never left out";
    return `[COMMAND MESSAGE - THIS MESSAGE ONLY]
{{user}} just used ${what}. For this one message the command wins over every other rule in this prompt, including any rule against guiding the player, giving hints or dumping environmental detail. Keep your scene sheet to a few short lines, invent nothing outside the location data, add no new danger, and do not act for {{user}}. Then send the header, the message and the footer as usual.`;
}

function mapTexts(messages, fn) {
    let done = 0;
    for (const message of messages) {
        if (!message) continue;
        if (typeof message.content === "string") {
            const next = fn(message.content);
            if (next !== message.content) { message.content = next; done++; }
        } else if (Array.isArray(message.content)) {
            for (const part of message.content) {
                if (part?.type !== "text" || typeof part.text !== "string") continue;
                const next = fn(part.text);
                if (next !== part.text) { part.text = next; done++; }
            }
        }
    }
    return done;
}

/**
 * Applies the command change to the final request, in place.
 * @param {Array} messages data.messages
 * @param {{ kinsbane: boolean, substitute?: (text: string) => string }} options kinsbane = the card runs Kinsbane's own sheet
 * @returns {{ kind: "look"|"journal"|null, changed: number }}
 */
export function applyKinsbaneCommand(messages, { kinsbane, substitute = text => text } = { kinsbane: false }) {
    const kind = commandInRequest(messages);
    if (!kind) return { kind: null, changed: 0 };
    if (!kinsbane) {
        const last = messages[messages.length - 1];
        const note = substitute(commandNote(kind));
        if (typeof last?.content === "string") last.content = `${last.content}\n\n${note}`;
        else if (Array.isArray(last?.content)) last.content.push({ type: "text", text: note });
        else return { kind, changed: 0 };
        return { kind, changed: 1 };
    }
    const replacement = substitute(COMMAND_SHEETS[kind]);
    const sheetPattern = new RegExp(`${escapeRegex(KINSBANE_SHEET_START)}[\\s\\S]*?${escapeRegex(KINSBANE_SHEET_END)}`);
    let changed = mapTexts(messages, text => (sheetPattern.test(text) ? text.replace(sheetPattern, () => replacement) : text));
    // The client note in the post-history still describes the long sheet.
    changed += mapTexts(messages, text => text.replace("the fifteen-box scene sheet is filled out first", "the short command sheet is filled out first"));
    return { kind, changed };
}

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
