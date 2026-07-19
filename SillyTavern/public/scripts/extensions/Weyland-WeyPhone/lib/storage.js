import { getRoleplayMode, isValidRoleplayMode, ROLEPLAY_MODES } from './roleplayMode.js';

/**
 * @typedef {Object} Conversation
 * @property {string} id
 * @property {string} charName
 * @property {Array<{role: string, content: string}>} messages
 * @property {number} createdAt
 * @property {number} lastActive
 */

// HelixMind exposes both under these exact ids; "-thinking" enables reasoning effort, the plain
// id doesn't. Defaults chosen by the operator: thinking GLM 4.7 as primary, Gemini 3 Pro as the
// fallback if the primary model call fails.
export const DEFAULT_MEMORY_PRIMARY_MODEL = 'glm-4.7-thinking';
export const DEFAULT_MEMORY_BACKUP_MODEL = 'gemini-3-pro-preview';

let lastTimestamp = 0;

export function genTimestamp() {
    const now = Date.now();
    if (now > lastTimestamp) {
        lastTimestamp = now;
        return now;
    } else {
        lastTimestamp++;
        return lastTimestamp;
    }
}

// No collision-dedup guarantee here, unlike genTimestamp's explicit tie-breaking loop below —
// relies on Date.now() + 6 random base36 chars being astronomically unlikely to collide within a
// single settings object. Deliberately not hardened further; see genMemoryId for the same tradeoff.
function genId() {
    return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings WeyPhone settings (see lib/config.js)
 * @param {string} charName
 * @param {{isDedicatedApp?: string, hasHistory?: boolean, lorebookContact?: boolean, lorebookName?: string}} [options] tag this conversation as belonging to a dedicated
 *   Home-grid app rather than a normal user-created conversation — excludes it from
 *   getAllConversationSummaries, see findOrCreateDedicatedAppConversation below.
 * @returns {Conversation}
 */
export function createConversation(settings, charName, options = {}) {
    const id = genId();
    const now = genTimestamp();
    const conversation = {
        id, charName, messages: [], createdAt: now, lastActive: now,
        memories: [], memoryThreshold: 100, memoryConnectionProfileId: '', lastMemoryMessageIndex: 0,
        memoryPrimaryModel: DEFAULT_MEMORY_PRIMARY_MODEL, memoryBackupModel: DEFAULT_MEMORY_BACKUP_MODEL,
        roleplayMode: options.roleplayMode ?? (options.roleplayTether === true ? ROLEPLAY_MODES.LINKED : ROLEPLAY_MODES.UNLINKED),
        tethered: options.roleplayMode === ROLEPLAY_MODES.OBSERVE || options.roleplayMode === ROLEPLAY_MODES.LINKED || options.roleplayTether === true,
        tetheredHistoryCap: null,
        participants: Array.isArray(options.participants) && options.participants.length
            ? [...new Set(options.participants.map(String))].slice(0, 4)
            : [charName],
        displayName: options.displayName ?? null,
        userNickname: options.userNickname ?? null,
        roleplayWireMode: options.roleplayWireMode ?? null,
        roleplayChatId: options.roleplayChatId ?? null,
        roleplayTether: options.roleplayTether === true,
        // Callers pass the knownContacts-derived default; storage itself stays policy-free.
        hasHistory: options.hasHistory ?? true,
    };
    if (options.isDedicatedApp) conversation.isDedicatedApp = options.isDedicatedApp;
    if (options.lorebookContact) conversation.lorebookContact = true;
    if (options.lorebookName) conversation.lorebookName = options.lorebookName;
    settings.conversations[id] = conversation;
    return conversation;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @returns {Conversation | undefined}
 */
export function getConversation(settings, id) {
    return settings.conversations[id];
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {{role: string, content: string}} message
 * @returns {Conversation | undefined}
 */
export function appendMessage(settings, id, message) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    conversation.messages.push(message);
    conversation.lastActive = genTimestamp();
    return conversation;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {number} messageIndex
 * @param {string} newContent
 * @returns {Conversation | undefined}
 */
export function editMessage(settings, id, messageIndex, newContent) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    const message = conversation.messages[messageIndex];
    if (!message) return conversation;
    message.content = newContent;
    return conversation;
}

/**
 * Deletes a single message in place via splice(). Safe as a plain splice (no batch-delete
 * reindexing hazard like deleteMessages below) because there's only ever one index to remove per
 * call — nothing else in this same call is relying on indices computed before the splice. Mutates
 * conversation.messages in place rather than reassigning it (unlike deleteMessages' filter-based
 * approach); no caller in this codebase holds a reference to the old messages array across a
 * delete, so either style is safe here — see getMemoryWindow's doc comment for the one place
 * array-reference stability actually matters, which this doesn't affect.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {number} messageIndex
 * @returns {Conversation | undefined}
 */
export function deleteMessage(settings, id, messageIndex) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    if (messageIndex < 0 || messageIndex >= conversation.messages.length) return conversation;
    conversation.messages.splice(messageIndex, 1);
    return conversation;
}

/**
 * Bulk-deletes messages by index in one pass — a single filter against a Set of the original
 * indices, rather than repeated splice() calls (which would need careful descending-order
 * handling to avoid later indices shifting out from under earlier deletes).
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {Iterable<number>} indices
 * @returns {Conversation | undefined}
 */
export function deleteMessages(settings, id, indices) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    const toDelete = new Set(indices);
    if (toDelete.size === 0) return conversation;
    conversation.messages = conversation.messages.filter((_, index) => !toDelete.has(index));
    return conversation;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 */
export function deleteConversation(settings, id) {
    delete settings.conversations[id];
}

/**
 * Removes every trailing role:'assistant' message from the conversation, leaving it ending on
 * its most recent role:'user' message (left unchanged) — used by Regenerate to discard the last
 * exchange before resending. No-op (returns false) if the conversation doesn't exist, has no
 * trailing assistant messages to discard, or has no user message preceding the trailing run.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @returns {boolean} true if anything was discarded
 */
export function discardTrailingReply(settings, id) {
    const conversation = getConversation(settings, id);
    if (!conversation) return false;
    const messages = conversation.messages;
    let cutIndex = messages.length;
    while (cutIndex > 0 && messages[cutIndex - 1].role === 'assistant') cutIndex--;
    if (cutIndex === messages.length) return false;
    if (cutIndex === 0) return false;
    messages.length = cutIndex;
    return true;
}

// Same collision-dedup tradeoff as genId above.
function genMemoryId() {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @typedef {Object} Memory
 * @property {string} id
 * @property {string} content
 * @property {number} createdAt
 * @property {boolean} pinned
 * @property {{from: number, to: number} | null} sourceRange
 */

/**
 * Creates a new memory on the conversation, pinned (injected) by default.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {string} content
 * @param {{pinned?: boolean, sourceRange?: {from: number, to: number} | null}} [options]
 * @returns {Memory | undefined}
 */
export function createMemory(settings, id, content, { pinned = true, sourceRange = null } = {}) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    if (!Array.isArray(conversation.memories)) conversation.memories = [];
    const memory = { id: genMemoryId(), content, createdAt: genTimestamp(), pinned, sourceRange };
    conversation.memories.push(memory);
    return memory;
}

/**
 * Shared lookup used by editMemory/deleteMemory/setMemoryPinned. Standardized null-handling
 * convention: a missing/malformed (non-array) `conversation.memories` is treated as "no memories",
 * same result as the pre-extraction `(conversation.memories || []).find(...)` callers produced for
 * undefined/null, without risking a runtime error if memories were ever some other truthy non-array
 * value.
 * @param {Conversation} conversation
 * @param {string} memoryId
 * @returns {number} index of the matching memory, or -1 if not found
 */
function findMemoryIndex(conversation, memoryId) {
    if (!Array.isArray(conversation.memories)) return -1;
    return conversation.memories.findIndex(m => m.id === memoryId);
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {string} memoryId
 * @param {string} newContent
 * @returns {Conversation | undefined}
 */
export function editMemory(settings, id, memoryId, newContent) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    const index = findMemoryIndex(conversation, memoryId);
    if (index === -1) return conversation;
    conversation.memories[index].content = newContent;
    return conversation;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {string} memoryId
 * @returns {Conversation | undefined}
 */
export function deleteMemory(settings, id, memoryId) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    const index = findMemoryIndex(conversation, memoryId);
    if (index === -1) return conversation;
    conversation.memories.splice(index, 1);
    return conversation;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {string} memoryId
 * @param {boolean} pinned
 * @returns {Conversation | undefined}
 */
export function setMemoryPinned(settings, id, memoryId, pinned) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    const index = findMemoryIndex(conversation, memoryId);
    if (index === -1) return conversation;
    conversation.memories[index].pinned = pinned;
    return conversation;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @returns {Memory[]}
 */
export function getPinnedMemories(settings, id) {
    const conversation = getConversation(settings, id);
    if (!conversation || !Array.isArray(conversation.memories)) return [];
    return conversation.memories.filter(m => m.pinned);
}

/**
 * Partial update — only the provided keys change.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {{memoryThreshold?: number, memoryConnectionProfileId?: string, memoryPrimaryModel?: string, memoryBackupModel?: string}} [options]
 * @returns {Conversation | undefined}
 */
export function setMemorySettings(settings, id, { memoryThreshold, memoryConnectionProfileId, memoryPrimaryModel, memoryBackupModel } = {}) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    if (typeof memoryThreshold === 'number') conversation.memoryThreshold = memoryThreshold;
    if (typeof memoryConnectionProfileId === 'string') conversation.memoryConnectionProfileId = memoryConnectionProfileId;
    if (typeof memoryPrimaryModel === 'string') conversation.memoryPrimaryModel = memoryPrimaryModel;
    if (typeof memoryBackupModel === 'string') conversation.memoryBackupModel = memoryBackupModel;
    return conversation;
}

/**
 * Partial update — only the provided keys change. `tetheredHistoryCap` may be explicitly set to
 * `null` to clear an override back to the default "since last main-roleplay memory" behavior —
 * unlike the other setters in this file, `null` is a meaningful value here, not "leave unchanged",
 * so this checks `'tetheredHistoryCap' in options` rather than `typeof ... === 'number'`.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {{tethered?: boolean, tetheredHistoryCap?: number|null}} [options]
 * @returns {Conversation | undefined}
 */
export function setTetheredSettings(settings, id, { tethered, roleplayMode, tetheredHistoryCap, roleplayChatId, roleplayTether } = {}) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    if (isValidRoleplayMode(roleplayMode)) {
        conversation.roleplayMode = roleplayMode;
        // Keep the old boolean synchronized for the context-builder and backwards-compatible
        // exports. Observe and Linked can both read the main roleplay; Unlinked cannot.
        conversation.tethered = roleplayMode !== ROLEPLAY_MODES.UNLINKED;
    } else if (typeof tethered === 'boolean') {
        conversation.tethered = tethered;
        conversation.roleplayMode = tethered ? ROLEPLAY_MODES.OBSERVE : ROLEPLAY_MODES.UNLINKED;
    }
    if (typeof tetheredHistoryCap === 'number' || tetheredHistoryCap === null) {
        conversation.tetheredHistoryCap = tetheredHistoryCap;
    }
    if (typeof roleplayChatId === 'string' || roleplayChatId === null) conversation.roleplayChatId = roleplayChatId;
    if (typeof roleplayTether === 'boolean') conversation.roleplayTether = roleplayTether;
    return conversation;
}

/**
 * Flips whether this conversation assumes {{user}} and the character already know each other.
 * When false, generateReply injects the first-contact block ("who is this?" energy) — see
 * lib/firstContact.js. Same partial-setter shape as setTetheredSettings.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {{hasHistory?: boolean}} fields
 */
export function setContactHistorySettings(settings, id, { hasHistory } = {}) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    if (typeof hasHistory === 'boolean') conversation.hasHistory = hasHistory;
    return conversation;
}

/**
 * Backfills tethered-mode fields on conversations created before this milestone. Idempotent —
 * safe to call on every settings load, matches migrateMemoryFields's convention exactly.
 * @param {{conversations: Record<string, Conversation>}} settings
 */
export function migrateTetheredFields(settings) {
    for (const conversation of Object.values(settings.conversations)) {
        conversation.roleplayMode = getRoleplayMode(conversation);
        conversation.tethered = conversation.roleplayMode !== ROLEPLAY_MODES.UNLINKED;
        if (typeof conversation.tetheredHistoryCap !== 'number' && conversation.tetheredHistoryCap !== null) {
            conversation.tetheredHistoryCap = null;
        }
        if (!Array.isArray(conversation.participants) || conversation.participants.length === 0) {
            conversation.participants = [conversation.charName];
        }
        conversation.participants = [...new Set(conversation.participants.map(String))].slice(0, 4);
        if (!Object.prototype.hasOwnProperty.call(conversation, 'displayName')) conversation.displayName = null;
        if (!Object.prototype.hasOwnProperty.call(conversation, 'userNickname')) conversation.userNickname = null;
        if (!Object.prototype.hasOwnProperty.call(conversation, 'roleplayChatId')) conversation.roleplayChatId = null;
        if (typeof conversation.roleplayTether !== 'boolean') conversation.roleplayTether = false;
    }
}

/**
 * Backfills the hasHistory flag on conversations created before the prior-history feature.
 * Existing threads default to true — they were all conducted as if the pair knew each other,
 * so retroactively marking them strangers would contradict their own transcripts. Idempotent.
 * @param {{conversations: Record<string, Conversation>}} settings
 */
export function migrateContactHistoryFields(settings) {
    for (const conversation of Object.values(settings.conversations)) {
        if (typeof conversation.hasHistory !== 'boolean') conversation.hasHistory = true;
    }
}

/**
 * Most recently created memory that came from an LLM summarization pass (has a sourceRange) —
 * i.e. excludes manually user-authored memories, which have nothing to regenerate from. Used by
 * "Regenerate last memory" to find its target.
 * @param {Conversation} conversation
 * @returns {Memory | null}
 */
export function getLastGeneratedMemory(conversation) {
    const generated = (conversation.memories || []).filter(m => m.sourceRange);
    if (generated.length === 0) return null;
    return generated.reduce((latest, m) => (m.createdAt > latest.createdAt ? m : latest));
}

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {number} sinceIndex
 * @returns {number}
 */
export function countExchangesSince(messages, sinceIndex) {
    return messages.slice(sinceIndex).filter(m => m.role === 'user').length;
}

/**
 * Backfills memory-related fields on conversations created before this milestone. Idempotent —
 * safe to call on every settings load, matches migrateLegacyConversations's convention exactly.
 * @param {{conversations: Record<string, Conversation>}} settings
 */
export function migrateMemoryFields(settings) {
    for (const conversation of Object.values(settings.conversations)) {
        if (!Array.isArray(conversation.memories)) conversation.memories = [];
        if (typeof conversation.memoryThreshold !== 'number') conversation.memoryThreshold = 100;
        if (typeof conversation.memoryConnectionProfileId !== 'string') conversation.memoryConnectionProfileId = '';
        if (typeof conversation.lastMemoryMessageIndex !== 'number') conversation.lastMemoryMessageIndex = 0;
        if (typeof conversation.memoryPrimaryModel !== 'string') conversation.memoryPrimaryModel = DEFAULT_MEMORY_PRIMARY_MODEL;
        if (typeof conversation.memoryBackupModel !== 'string') conversation.memoryBackupModel = DEFAULT_MEMORY_BACKUP_MODEL;
    }
}

/**
 * Migrates milestone-1-era conversations (keyed directly by character name, no `id`/`charName`
 * fields) into the current ID-keyed shape, in place. Idempotent — entries that already have an
 * `id` are left untouched, so this is safe to call on every settings load.
 * @param {{conversations: Record<string, Conversation>}} settings
 */
export function migrateLegacyConversations(settings) {
    for (const [key, value] of Object.entries(settings.conversations)) {
        if (!value || typeof value !== 'object' || value.id) continue;
        delete settings.conversations[key];
        const id = genId();
        const lastActive = value.lastActive ?? genTimestamp();
        settings.conversations[id] = {
            id,
            charName: key,
            messages: value.messages ?? [],
            createdAt: value.createdAt ?? lastActive,
            lastActive,
        };
    }
}

/**
 * Computes the [start, end) boundary of the next memory-summarization window for a conversation —
 * everything from its last-summarized point to its current end. Pure function: does not mutate
 * anything or read `Date.now()`, so the same conversation.messages/lastMemoryMessageIndex always
 * produces the same result regardless of what happens to the conversation later (this is exactly
 * the property that matters: index.js must capture this BEFORE an LLM call starts, not re-derive
 * it after, since messages.length can grow while a background memory-generation call is in flight
 * — see the fix this was extracted for).
 * @param {{messages: Array<{role: string, content: string}>, lastMemoryMessageIndex?: number}} conversation
 * @returns {{start: number, end: number, messages: Array<{role: string, content: string}>}}
 */
export function getMemoryWindow(conversation) {
    const start = conversation.lastMemoryMessageIndex ?? 0;
    const messages = conversation.messages.slice(start);
    const end = start + messages.length;
    return { start, end, messages };
}

/**
 * Shared summary-shape mapper used by getAllConversationSummaries/getThreadsFor — same fields,
 * same last-message-snippet derivation, same most-recent-first sort; callers differ only in which
 * conversations they include.
 * @param {Conversation[]} conversations
 * @param {(conversation: Conversation) => boolean} predicate
 * @returns {Array<{id: string, charName: string, lastMessageSnippet: string, lastActive: number}>}
 */
function summarizeConversations(conversations, predicate) {
    return conversations
        .filter(predicate)
        .map(conversation => ({
            id: conversation.id,
            charName: conversation.charName,
            participants: conversation.participants,
            displayName: conversation.displayName,
            roleplayMode: getRoleplayMode(conversation),
            roleplayChatId: conversation.roleplayChatId,
            roleplayTether: conversation.roleplayTether,
            lastMessageSnippet: conversation.messages.length
                ? conversation.messages[conversation.messages.length - 1].content
                : '',
            lastActive: conversation.lastActive,
        }))
        .sort((a, b) => b.lastActive - a.lastActive);
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @returns {Array<{id: string, charName: string, lastMessageSnippet: string, lastActive: number}>}
 */
export function getAllConversationSummaries(settings) {
    return summarizeConversations(Object.values(settings.conversations), conversation => !conversation.isDedicatedApp);
}

/**
 * Finds the most-recently-active conversation for a given character, regardless of whether it's
 * tagged isDedicatedApp or not — thread identity is purely charName-based, the SAME mechanism for
 * every character. isDedicatedApp only controls Messages-list visibility (see
 * getAllConversationSummaries), a separate, unrelated concern from thread identity/lookup.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} charName
 * @returns {Conversation | undefined}
 */
export function findMostRecentThread(settings, charName) {
    const matches = Object.values(settings.conversations).filter(c => c.charName === charName);
    if (!matches.length) return undefined;
    return matches.reduce((latest, c) => c.lastActive > latest.lastActive ? c : latest);
}

/**
 * Lists ALL threads for a single character, sorted most-recent-first — same summary shape as
 * getAllConversationSummaries, so the same renderMessagesScreen/click-handler pipeline can render
 * and interact with either list without any new UI code. Unlike getAllConversationSummaries, this
 * does NOT filter out isDedicatedApp-tagged conversations — a character's own thread list should
 * show ALL of their threads, dedicated-app or not (for a dedicated-app character, EVERY one of their
 * threads is isDedicatedApp-tagged, so excluding them here would make Switch Threads useless for
 * her).
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} charName
 * @returns {Array<{id: string, charName: string, lastMessageSnippet: string, lastActive: number}>}
 */
export function getThreadsFor(settings, charName) {
    return summarizeConversations(Object.values(settings.conversations), conversation => conversation.charName === charName);
}

/**
 * A dedicated app's Home-tile entry point: resumes its most recently active thread (via the same
 * charName-based lookup every character uses — see findMostRecentThread), or creates a new one
 * tagged isDedicatedApp if she has no threads yet. Existing untagged threads are upgraded in place,
 * preserving their history while activating the app skin/model/lore path. Every existing thread
 * for the character is upgraded together so Switch Threads remains inside the dedicated app.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} charName
 * @param {string} appKey
 * @returns {Conversation}
 */
export function findOrCreateDedicatedAppConversation(settings, charName, appKey) {
    const matchingThreads = Object.values(settings.conversations).filter(conversation => conversation.charName === charName);
    for (const conversation of matchingThreads) {
        // Opening a dedicated tile is also the migration path for people who already texted this
        // character before the app existed. Tag every existing thread so switching to an older
        // one cannot silently fall back to the generic DM skin/model/lore behavior.
        conversation.isDedicatedApp = appKey;
    }
    const existing = findMostRecentThread(settings, charName);
    if (existing) return existing;
    return createConversation(settings, charName, { isDedicatedApp: appKey });
}
