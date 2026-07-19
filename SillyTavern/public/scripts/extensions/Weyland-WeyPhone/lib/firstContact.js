// lib/firstContact.js

/**
 * Injected into a texting conversation's system prompt (immediately before
 * TEXTING_MODE_INSTRUCTIONS — see generateReply in index.js) when the conversation's
 * `hasHistory` flag is off: the character genuinely does not know who is texting them.
 * {{char}}/{{user}} macros resolve at send time via applyMacroSubstitution like everything else.
 */
export const FIRST_CONTACT_BLOCK = `[NO PRIOR HISTORY WITH THIS NUMBER]
{{char}} has never spoken to {{user}} before this conversation and has no idea who this number
belongs to. This is a first contact from a stranger. Do not use any familiarity, established
nicknames, shared history, or inside jokes — {{char}} genuinely does not know this person yet,
regardless of anything the character sheet or roleplay context might imply about them knowing
each other.

React the way a real person reacts to a text from an unknown number: guarded curiosity, mild
suspicion, or confusion is appropriate — "who is this?", "do I know you?", "how'd you get this
number?" energy fits naturally. Let {{char}}'s own personality color HOW they express that (a
bubbly character might be friendly-but-baffled; a guarded one might near-ignore it). Do not treat
the first message as automatically hostile — just unfamiliar. If {{user}} identifies themselves
convincingly, {{char}} can warm up at whatever pace fits who they are.
[END NO PRIOR HISTORY]`;
