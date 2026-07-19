/**
 * Drops non-string / empty / whitespace-only sections and joins the rest with `sep`. The single
 * canonical home for the filter-then-join idiom every WeyPhone prompt-assembly site shares
 * (buildSystemPrompt here, buildTetheredViewBlock, buildMemoryGenerationMessages). Pure/read-only.
 * @param {Array<unknown>} sections
 * @param {string} [sep]
 * @returns {string}
 */
export function joinNonEmptySections(sections, sep = '\n\n') {
    return sections
        .filter(section => typeof section === 'string' && section.trim().length > 0)
        .join(sep);
}

/**
 * Assembles WeyPhone's system prompt in the same section order the real chat-completion
 * pipeline uses (see preparePromptsForChatCompletion in openai.js): main, worldInfoBefore,
 * charDescription, charPersonality, scenario, worldInfoAfter. (dialogueExamples/chatHistory
 * are not part of the system prompt itself and are handled separately in buildMessages.)
 */
export function buildSystemPrompt({ systemPrompt, worldInfoBefore, descriptionText, personalityText, scenarioText, worldInfoAfter }) {
    return joinNonEmptySections([systemPrompt, worldInfoBefore, descriptionText, personalityText, scenarioText, worldInfoAfter]);
}

export function buildGroupSystemPrompt({ participants, worldInfo = '', textingInstructions = '' }) {
    const profiles = participants.map(participant => `## ${participant.name}\n${participant.personalityText}`).join('\n\n');
    const names = participants.map(participant => participant.name).join(', ');
    return joinNonEmptySections([
        `[GROUP TEXT THREAD]\nThis is a private group chat between {{user}} and ${names}.\n` +
        'Write only messages from these named participants. Each may send zero or multiple short, natural texts.\n' +
        'Every reply line must be exactly: Incoming¦time¦speaker name¦message\n' +
        "Never write {{user}}'s messages and never merge speakers.",
        profiles,
        worldInfo,
        textingInstructions,
    ]);
}

/**
 * Reformats stored conversation turns into bare Incoming¦/Outgoing¦ lines (no Phone¦/Texting¦
 * header — those only matter for initializing a fresh live reply's visual interface, not for
 * conditioning past turns) using each message's own real stored timestamp, never anything the
 * model itself emitted (which is discarded during parsing and would be untrustworthy free text
 * to re-parse anyway). Reinforces the phone-format style across a long conversation.
 * @param {Array<{role: 'user'|'assistant', content: string, timestamp?: number}>} history
 * @param {{charName: string, userName: string}} names
 * @param {(epochMs: number) => string} formatClockTime
 * @returns {Array<{role: 'user'|'assistant', content: string}>}
 */
export function reconstructHistoryAsPhoneFormat(history, { charName, userName }, formatClockTime) {
    return history.map(entry => {
        const time = typeof entry.timestamp === 'number' ? formatClockTime(entry.timestamp) : '';
        if (entry.role === 'user') {
            return { role: 'user', content: `Outgoing¦${time}¦${userName}¦${entry.content}` };
        }
        return { role: 'assistant', content: `Incoming¦${time}¦${charName}¦${entry.content}` };
    });
}

/**
 * @param {{systemPromptText: string, history: Array<{role: string, content: string}>, userMessage: string}} options
 */
export function buildMessages({ systemPromptText, history, userMessage }) {
    const messages = [{ role: 'system', content: systemPromptText }];
    // Coalesce consecutive same-role entries in `history` into a single message each, so the
    // final messages array always strictly alternates user/assistant. Multi-message bursts
    // (e.g. several "Incoming¦" lines parsed out of one reply) are stored as separate
    // same-role history entries upstream, which would otherwise produce non-alternating
    // sequences that some chat-completion backends reject or mishandle.
    for (const entry of history) {
        const last = messages[messages.length - 1];
        if (last && last.role === entry.role) {
            last.content = `${last.content}\n${entry.content}`;
        } else {
            messages.push({ role: entry.role, content: entry.content });
        }
    }
    // Same coalescing applies at the history/userMessage boundary: if the last (coalesced)
    // history entry is also role:'user' (e.g. a dangling user turn left over from a failed
    // generation, or discardTrailingReply leaving the conversation ending on 'user'), merge
    // the trailing userMessage into it instead of pushing a second adjacent user message.
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
        lastMessage.content = `${lastMessage.content}\n${userMessage}`;
    } else {
        messages.push({ role: 'user', content: userMessage });
    }
    return messages;
}

/**
 * Runs a fully-assembled prompt string through SillyTavern's own real macro engine
 * (`context.substituteParams`) — {{user}}, {{char}}, {{time}}, {{date}}, {{weekday}}, dice
 * rolls, and every other registered macro, not just {{user}}. WeyPhone previously did NO macro
 * substitution anywhere in its send path, so any macro embedded in a character's rav.js prompt,
 * their charper.js personality text, scanned World Info content, a stored memory, or the
 * `[TETHERED VIEW]` framing text itself reached the model as a literal unresolved `{{...}}`
 * string.
 *
 * `replaceCharacterCard` is always passed as `false` — ST's real `substituteParams` only supports
 * pulling `{{description}}`/`{{personality}}`/`{{scenario}}`/etc. from whichever character is
 * CURRENTLY ACTIVE in the main ST window (`characters[this_chid]`), with no way to point it at an
 * arbitrary character by name. WeyPhone's own conversation character is very often NOT the main
 * window's active character (that's the whole point of tethered mode), so enabling this would
 * silently inject the wrong character's card fields. `{{user}}`/`{{char}}` still resolve
 * correctly regardless, via the explicit `userName`/`charName` overrides below — those don't
 * depend on `replaceCharacterCard` at all. A handful of rarer macros
 * (`{{description}}`/`{{personality}}`/`{{persona}}`/`{{mesExamples}}`) go unresolved as a
 * result — accepted, since WeyPhone already assembles those fields itself via
 * `resolveCharacterPrompt`/`charper.js`, not via this macro.
 * @param {{substituteParams: Function, content: string, userName: string, charName: string}} options
 * @returns {string}
 */
export function applyMacroSubstitution({ substituteParams, content, userName, charName }) {
    if (!content) return '';
    return substituteParams(content, userName, charName, undefined, undefined, false, {});
}

/**
 * Extracts the raw text from a ConnectionManagerRequestService.sendRequest result — the provider
 * response shape varies (plain string vs. an object with a `content` field), so every call site
 * that sends a message needs this same normalization.
 * @param {string | {content?: string} | null | undefined} result
 * @returns {string}
 */
export function extractResponseText(result) {
    return typeof result === 'string' ? result : (result?.content ?? '');
}

/**
 * @param {{connectionProfileId: string}} settings WeyPhone settings
 * @param {string} activeProfileId extensionSettings.connectionManager.selectedProfile
 */
export function resolveProfileId(settings, activeProfileId) {
    return settings.connectionProfileId || activeProfileId || '';
}

/**
 * Which model a WeyPhone generation should run on. The caller supplies the appropriate explicit
 * setting (social-app sync, texting, or Kressa); it wins over the live main-chat model. An empty
 * result means "no override, let the connection profile decide".
 * @param {{settingsModel?: string, liveModel?: string}} options
 * @returns {string}
 */
export function resolveModelOverride({ settingsModel, liveModel } = {}) {
    const explicit = String(settingsModel ?? '').trim();
    if (explicit) return explicit;
    return String(liveModel ?? '').trim();
}

/**
 * @param {{sendRequest: (profileId: string, messages: any[]) => Promise<any>, profileId: string, messages: any[]}} options
 */
export async function sendMessage({ sendRequest, profileId, messages }) {
    if (!profileId) {
        throw new Error('No Connection Profile available (none selected in WeyPhone settings and none active in SillyTavern)');
    }
    return sendRequest(profileId, messages);
}
