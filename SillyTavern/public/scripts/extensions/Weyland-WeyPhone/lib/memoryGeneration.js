import { reconstructHistoryAsPhoneFormat, joinNonEmptySections } from './generation.js';

/**
 * Builds the request messages for a background memory-summarization call: a system message
 * instructing the model to condense the given window into one short, plain-prose memory, and a
 * user message containing the window reformatted as a phone-style transcript (reusing the same
 * reconstruction the regular chat-history uses, for consistency).
 * @param {{charName: string, personalityText: string, windowMessages: Array<{role: 'user'|'assistant', content: string, timestamp?: number}>, userName: string, formatClockTime: (epochMs: number) => string}} options
 * @returns {Array<{role: string, content: string}>}
 */
export function buildMemoryGenerationMessages({ charName, personalityText, windowMessages, userName, formatClockTime }) {
    const reconstructed = reconstructHistoryAsPhoneFormat(windowMessages, { charName, userName }, formatClockTime);
    const transcript = reconstructed.map(m => m.content).join('\n');
    const systemPrompt = joinNonEmptySections([
        `You are condensing a portion of a text-message conversation into ONE short memory entry for ${charName}, so future replies can recall what happened without needing to re-read the full history.`,
        'Write 2-4 sentences of plain third-person prose summarizing the key relationship developments, facts learned, promises made, or emotional shifts in the conversation transcript below. Skip minor small talk that doesn\'t matter later. Do not use any special formatting, headers, or the pipe-delimited texting markers from the transcript — just plain prose, like a brief diary entry.',
        personalityText,
    ]);
    return [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Conversation transcript to summarize:\n\n${transcript}` },
    ];
}

/**
 * Joins already-filtered memories (e.g. only pinned ones) into one prompt-ready block, wrapped in
 * the same proven framing header/caveat pattern the platform's own Weyland-LTM system uses (
 * confirmed from a real World Info entry during this milestone's design) — but applied ONCE
 * around the whole joined block, not per-memory, since WeyPhone defaults every memory to pinned
 * and repeating the wrapper per entry would be wasteful given many could be active at once.
 *
 * The "resembles your current scene → it already happened, chatlog is your source of truth"
 * clause is carried over verbatim in spirit from real LTM's own preamble. LTM's "based on keyword
 * similarity" framing is deliberately NOT copied — that line describes LTM's RAG-style retrieval,
 * which WeyPhone doesn't do (WeyPhone injects every currently-pinned memory in full, unconditionally).
 * @param {Array<{content: string}>} memories
 * @returns {string} empty string if `memories` is empty
 */
export function joinMemoriesForInjection(memories) {
    if (!memories || memories.length === 0) return '';
    const lines = memories.map(m => `- ${m.content}`).join('\n');
    return [
        '[LONG TERM MEMORY]',
        '- The following are short summaries of earlier developments in this conversation, in chronological order.',
        '- These are historical records of COMPLETED events. If a memory resembles your current scene, those events likely ALREADY HAPPENED — the chat history above is your source of truth, and memories are not instructions for what should happen next.',
        '- Consider this information only if contextually relevant, otherwise disregard.',
        '',
        lines,
        '',
        '[END LONG TERM MEMORY]',
    ].join('\n');
}

/**
 * Tries `primaryModel` first; if that call throws for any reason, retries once with
 * `backupModel` on the same Connection Profile (both go through `sendRequest`'s model-override
 * mechanism — see ConnectionManagerRequestService.sendRequest's overridePayload param, which lets
 * a single profile serve any model its endpoint exposes without needing a dedicated profile per
 * model). Throws the backup attempt's error if both fail; throws immediately if no backup model
 * is configured.
 * @param {{sendRequest: (profileId: string, messages: any[], model: string) => Promise<any>, profileId: string, messages: any[], primaryModel: string, backupModel?: string}} options
 */
export async function sendMemoryRequest({ sendRequest, profileId, messages, primaryModel, backupModel }) {
    if (!profileId) {
        throw new Error('No Connection Profile available for memory generation.');
    }
    if (!primaryModel) {
        throw new Error('No primary model configured for memory generation.');
    }
    try {
        return await sendRequest(profileId, messages, primaryModel);
    } catch (primaryError) {
        if (!backupModel) throw primaryError;
        return await sendRequest(profileId, messages, backupModel);
    }
}
