
/**
 * Decorates each conversation summary with an `isTyping` flag based on whether its id is
 * currently in the generating-conversations set. Does not mutate the input summaries.
 * @param {Array<{id: string, charName: string, lastMessageSnippet: string, lastActive: number}>} summaries
 * @param {Set<string>} generatingConversationIds
 * @returns {Array<{id: string, charName: string, lastMessageSnippet: string, lastActive: number, isTyping: boolean}>}
 */
export function withTypingState(summaries, generatingConversationIds) {
    return summaries.map(summary => ({
        ...summary,
        isTyping: generatingConversationIds.has(summary.id),
    }));
}
