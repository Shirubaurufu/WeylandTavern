import { getRoleplayMode, isConversationLinkedToChat, ROLEPLAY_MODES } from './roleplayMode.js';

const DELIMITER = '[¦|│]';
const PHONE_LINE_RE = new RegExp(`^(Incoming|Outgoing)${DELIMITER}([^¦|│]*)${DELIMITER}([^¦|│]*)${DELIMITER}(.*)$`);
const PHONE_HEADER_RE = new RegExp(`^Phone${DELIMITER}`);
const TEXTING_HEADER_RE = new RegExp(`^Texting${DELIMITER}`);

function normalizeName(value) {
    return String(value ?? '')
        .normalize('NFKD')
        // Character-card display names can be decorated with stacked combining marks (Ṇ̶͘ara),
        // while generated phone blocks sensibly use the plain name. Treat those as one identity.
        .replace(/\p{M}/gu, '')
        .trim()
        .replace(/^[!@]+/, '')
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function parsePhoneOwner(line) {
    const match = line.match(new RegExp(`^Phone${DELIMITER}([^¦|│]*)`));
    if (!match) return null;
    const parts = match[1].split(/\s+-\s+/);
    return parts.length > 1 ? parts.slice(1).join(' - ').trim() || null : null;
}

function parsePhoneMetadata(line) {
    const fields = String(line ?? '').split(new RegExp(`${DELIMITER}+`)).map(field => field.trim());
    const metadata = {};
    for (const field of fields.slice(3)) {
        const separator = field.indexOf('=');
        if (separator < 1) continue;
        metadata[field.slice(0, separator).trim().toLowerCase()] = field.slice(separator + 1).trim();
    }
    const mode = /^(solo|alt|group|groupalt|nochar)$/i.test(metadata.mode ?? '')
        ? metadata.mode.toLowerCase()
        : null;
    const members = String(metadata.members ?? '')
        .split(';')
        .map(member => member.trim())
        .filter(Boolean);
    return {
        mode,
        members,
        declared: Object.hasOwn(metadata, 'mode') || Object.hasOwn(metadata, 'members'),
    };
}

function parseTitle(line) {
    const match = line.match(new RegExp(`^Texting${DELIMITER}(.*)$`));
    return match?.[1]?.trim() || null;
}

export function locatePhoneScopes(rawText) {
    if (typeof rawText !== 'string' || !rawText) return [];
    const lines = rawText.replace(/\r\n?/g, '\n').split('\n');
    const scopes = [];
    let current = null;
    const start = (owner, title, index, metadata = {}) => {
        current = {
            owner,
            title,
            mode: metadata.mode ?? null,
            members: metadata.members ?? [],
            wireMetadata: metadata.declared === true,
            lines: [],
            lineIndices: index === null ? [] : [index],
        };
        scopes.push(current);
    };
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const phoneHeader = PHONE_HEADER_RE.test(line);
        const textingHeader = TEXTING_HEADER_RE.test(line);
        if (phoneHeader || textingHeader) {
            const owner = phoneHeader ? parsePhoneOwner(line) : null;
            const title = textingHeader ? parseTitle(line) : null;
            const metadata = phoneHeader ? parsePhoneMetadata(line) : {};
            if (current && current.lines.length === 0
                && ((phoneHeader && current.owner === null) || (textingHeader && current.title === null))) {
                if (phoneHeader) {
                    current.owner = owner;
                    current.mode = metadata.mode ?? null;
                    current.members = metadata.members ?? [];
                    current.wireMetadata = metadata.declared === true;
                }
                if (textingHeader) current.title = title;
                current.lineIndices.push(index);
            } else {
                start(owner, title, index, metadata);
            }
            continue;
        }
        const match = line.match(PHONE_LINE_RE);
        if (!match) continue;
        if (!current) start(null, null, null);
        current.lines.push({
            direction: match[1],
            displayTime: match[2].trim(),
            sender: match[3].trim(),
            text: match[4].trim(),
        });
        current.lineIndices.push(index);
    }
    return scopes.filter(scope => scope.lines.length > 0);
}

function resolveKnownName(rawName, knownNames) {
    const target = normalizeName(rawName);
    if (!target) return null;
    const exact = knownNames.find(name => normalizeName(name) === target);
    if (exact) return exact;
    const matches = knownNames.filter(name => {
        const candidate = normalizeName(name);
        return candidate.includes(target) || target.includes(candidate);
    });
    return matches.length === 1 ? matches[0] : null;
}

/** Route a whole scope atomically. Unknown speakers leave the original roleplay block untouched. */
export function routePhoneScope(scope, { userName, userNicknames = [], knownNames = [] }) {
    const userAliases = [userName, ...userNicknames].map(normalizeName).filter(Boolean);
    const isUser = name => userAliases.includes(normalizeName(name));

    // V2.1's declared mode/member metadata is authoritative. It prevents a character's saved
    // nickname for the user from becoming the local DM title, and prevents third-party phone
    // scenes from being mistaken for conversations in which the user participates.
    if (scope.wireMetadata) {
        // A partially emitted V2.1 header must not fall through to the nickname-based legacy
        // guesser. Either both declarations are valid, or the scope is left safely uncaptured.
        if (!scope.mode || !scope.members?.length) return null;
        const memberHasUser = scope.members.some(isUser);
        const expectsUser = scope.mode === 'solo' || scope.mode === 'group' || scope.mode === 'nochar';
        if (memberHasUser !== expectsUser) return null;

        const participants = [];
        for (const member of scope.members) {
            if (isUser(member)) continue;
            const resolved = resolveKnownName(member, knownNames);
            if (!resolved) return null;
            if (!participants.includes(resolved)) participants.push(resolved);
        }
        const validCount = scope.mode === 'solo' ? participants.length === 1
            : scope.mode === 'alt' ? participants.length === 2
                : scope.mode === 'nochar' ? participants.length >= 1 && participants.length <= 4
                : participants.length >= 2 && participants.length <= 4;
        if (!validCount) return null;

        // Alt and GroupAlt remain visible in the roleplay via Weyland-Formatter, but are not the
        // user's conversations and therefore must not be copied into their WeyPhone.
        if (!expectsUser) return null;

        const ownerIsUser = isUser(scope.owner);
        const owner = ownerIsUser ? userName : resolveKnownName(scope.owner, knownNames);
        if (!owner || (!ownerIsUser && !participants.includes(owner))) return null;

        const messages = [];
        for (const line of scope.lines) {
            if (!line.text) continue;
            if (isUser(line.sender)) {
                messages.push({ role: 'user', content: line.text, displayTime: line.displayTime });
                continue;
            }
            const speaker = resolveKnownName(line.sender, knownNames);
            if (!speaker || !participants.includes(speaker)) return null;
            messages.push({ role: 'assistant', speaker, content: line.text, displayTime: line.displayTime });
        }
        if (!messages.length) return null;

        const direct = scope.mode === 'solo' || (scope.mode === 'nochar' && participants.length === 1);
        return {
            mode: scope.mode,
            participants,
            messages,
            // On a character-owned solo screen, Texting is that character's saved name for the
            // user. Locally, the thread must still be titled with the actual character identity.
            title: direct && !ownerIsUser ? participants[0] : (scope.title || participants.join(', ')),
            userNickname: direct && !ownerIsUser && scope.title && !isUser(scope.title) ? scope.title : null,
        };
    }

    const owner = isUser(scope.owner) ? null : resolveKnownName(scope.owner, knownNames);
    const messages = [];
    const participants = [];
    let inferredUserNickname = null;
    for (const line of scope.lines) {
        if (!line.text) continue;
        if (isUser(line.sender)) {
            messages.push({ role: 'user', content: line.text, displayTime: line.displayTime });
            continue;
        }
        let speaker = resolveKnownName(line.sender, knownNames);
        // On a known character's phone, an otherwise-unknown Incoming sender is the user saved
        // under a nickname ("juicebox", etc.). Preserve it for future captures and route it as
        // the user; never make this inference on a user-owned/headerless phone.
        if (!speaker && line.direction === 'Incoming' && owner) {
            inferredUserNickname = line.sender || inferredUserNickname;
            messages.push({ role: 'user', content: line.text, displayTime: line.displayTime });
            continue;
        }
        // Character-owned phone blocks often label an Outgoing line with a nickname or omit a
        // clean roster name. The established owner is authoritative for those lines.
        if (!speaker && line.direction === 'Outgoing') speaker = owner;
        if (!speaker) return null;
        if (!participants.includes(speaker)) participants.push(speaker);
        messages.push({ role: 'assistant', speaker, content: line.text, displayTime: line.displayTime });
    }
    if (owner && !participants.includes(owner)) participants.unshift(owner);
    if (participants.length === 0 || participants.length > 4 || messages.length === 0) return null;
    return { participants, messages, title: scope.title, userNickname: inferredUserNickname };
}

/** A NoChar phone scene belongs beside the active story but must not write into it by default. */
export function initialRoleplayModeForPhoneScope(wireMode) {
    return wireMode === 'nochar' ? ROLEPLAY_MODES.OBSERVE : ROLEPLAY_MODES.LINKED;
}

/** Continue auto-capturing a NoChar side conversation while it remains Observe. Unlinked is a
 * hard stop, while an explicit user change to Linked opts the conversation into round-tripping. */
export function canCapturePhoneScopeIntoConversation(conversation, wireMode, chatId) {
    if (isConversationLinkedToChat(conversation, chatId)) return true;
    return wireMode === 'nochar'
        && conversation?.roleplayWireMode === 'nochar'
        && conversation?.roleplayChatId === chatId
        && getRoleplayMode(conversation) === ROLEPLAY_MODES.OBSERVE;
}

export function sameParticipants(left, right) {
    const a = [...new Set(left.map(normalizeName))].sort();
    const b = [...new Set(right.map(normalizeName))].sort();
    return a.length === b.length && a.every((name, index) => name === b[index]);
}

function normalizeCapturedContent(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        // Models commonly repair or introduce a space after punctuation when replaying the
        // injected transcript. That is formatting drift, not a new text message.
        .replace(/\s*([.,!?;:])\s*/g, '$1')
        .toLowerCase();
}

export function dedupeCapturedMessages(incoming, stored) {
    const same = (a, b) => a.role === b.role && normalizeName(a.speaker) === normalizeName(b.speaker)
        && normalizeCapturedContent(a.content) === normalizeCapturedContent(b.content);
    const max = Math.min(incoming.length, stored.length);

    // Fast/common path: the model repeats the exact current tail and then continues.
    for (let count = max; count > 0; count--) {
        const tail = stored.slice(-count);
        if (incoming.slice(0, count).every((message, index) => same(message, tail[index]))) {
            return incoming.slice(count);
        }
    }

    // A full transcript replay does not necessarily begin at the stored tail: the user may have
    // queued another phone text after the replayed portion. Find a strong contiguous alignment in
    // the recent log and remove only that incoming prefix. Two exact messages are required so an
    // ordinary repeated "hey" cannot erase a legitimate new text.
    const recentStart = Math.max(0, stored.length - 40);
    let best = { consumed: 0, exact: 0 };
    for (let start = recentStart; start < stored.length; start++) {
        let incomingIndex = 0;
        let storedIndex = start;
        let exact = 0;
        let paraphrasedUserLines = 0;
        while (incomingIndex < incoming.length && storedIndex < stored.length) {
            if (same(incoming[incomingIndex], stored[storedIndex])) {
                exact++;
                incomingIndex++;
                storedIndex++;
                continue;
            }
            // Models sometimes replace an injected emoji-heavy user text with a description such
            // as "[multiple heart emojis]". Treat one same-position user/user mismatch as replay
            // drift only after two exact anchors; never apply this forgiveness to character lines.
            if (exact >= 2 && paraphrasedUserLines === 0
                && incoming[incomingIndex]?.role === 'user' && stored[storedIndex]?.role === 'user') {
                paraphrasedUserLines++;
                incomingIndex++;
                storedIndex++;
                continue;
            }
            break;
        }
        if (exact >= 2 && (exact > best.exact || (exact === best.exact && incomingIndex > best.consumed))) {
            best = { consumed: incomingIndex, exact };
        }
    }
    if (best.consumed > 0) return incoming.slice(best.consumed);
    return incoming;
}

export const TETHER_CAUTION = `[TETHERED TEXTS — INFO-BLEED CAUTION]
Some hidden user-role context below contains texting chatlog updates. Only {{user}}
and the specifically named participants know that exchange. Uninvolved characters must not know,
reference, or react to it unless somebody tells them in the roleplay.
[END TETHERED TEXTS CAUTION]`;

function participantLabel(participants) {
    if (participants.length < 2) return participants[0] || 'someone';
    if (participants.length === 2) return participants.join(' & ');
    return `${participants.slice(0, -1).join(', ')} & ${participants.at(-1)}`;
}

export const TETHER_INACTIVE_AFTER_ROLEPLAY_RESPONSES = 10;

function countRoleplayResponsesSince(chat, anchor, chatLength) {
    if (Array.isArray(chat)) {
        return chat
            .slice(Math.max(0, anchor))
            .filter(message => message?.is_user === false || message?.role === 'assistant')
            .length;
    }
    // Compatibility fallback for callers that only know the current chat length. This may count
    // user turns too, but still prevents a stale transcript from remaining active indefinitely.
    return Math.max(0, chatLength - anchor);
}

export function buildTetherInjectionPlan({ conversations, chatId, chatLength, chat, userName, formatClockTime }) {
    const groups = [];
    for (const conversation of conversations) {
        if (!isConversationLinkedToChat(conversation, chatId)) continue;
        const participants = conversation.participants?.length ? conversation.participants : [conversation.charName];
        // Captured messages already remain verbatim in the main roleplay. Only messages created
        // later inside WeyPhone need to round-trip back, otherwise the prompt would duplicate the
        // model's own original phone block and waste main-chat context. A user can also scrub an
        // already-visible phone bubble from future injections without deleting it from WeyPhone.
        const recent = conversation.messages
            .slice(Math.max(conversation.lastMemoryMessageIndex ?? 0, 0))
            .filter(message => !message.capturedFromRoleplay && !message.suppressedFromRoleplay);
        const memories = (conversation.memories ?? []).filter(memory => memory.pinned);
        if (!recent.length && !memories.length) continue;

        // Any unsuppressed phone activity resets the lifetime of the Linked transcript, including
        // an incoming text captured from the roleplay. Once ten later character responses have
        // passed without another sent or received text, the transcript drops out of the prompt.
        const activityAnchors = conversation.messages
            .filter(message => !message.suppressedFromRoleplay)
            .map(message => message.mainChatAnchor)
            .filter(Number.isFinite);
        const latestActivityAnchor = activityAnchors.length ? Math.max(...activityAnchors) : chatLength;
        if (countRoleplayResponsesSince(chat, latestActivityAnchor, chatLength) >= TETHER_INACTIVE_AFTER_ROLEPLAY_RESPONSES) {
            continue;
        }

        const label = participantLabel(participants);
        const lines = [
            '[CURRENT TEXTING CHATLOG]',
            `Active conversation: ${userName} and ${label}.`,
            'The current WeyPhone transcript is provided as context alongside the latest roleplay message.',
            'Treat current plans, invitations, destinations, meetings, and other arrangements in this transcript as factual roleplay context when deciding what happens next.',
            'Check for genuinely new texts. Depending on roleplay continuity, some lines may be older messages the character has already seen or answered.',
            '- Respond only to texts that are new to the character.',
            '- Do not reread, rediscover, or answer messages the character already handled.',
            '- If nothing is new, continue the roleplay naturally. Mention an older text only when it is currently relevant.',
        ];
        for (const memory of memories) lines.push(`[MEMORY ENTRY]\n${memory.content}\n[END MEMORY ENTRY]`);
        for (const message of recent) {
            // Captured roleplay phone blocks already carry the scene's displayed clock time.
            // Preserve that exact value instead of replacing 7:06 PM with the browser's noon
            // wall clock. Messages authored inside WeyPhone have no displayTime and use the
            // caller's clock resolver (RP clock when enabled, real time otherwise).
            const time = String(message.displayTime ?? '').trim()
                || (Number.isFinite(message.timestamp) ? formatClockTime(message.timestamp) : '');
            if (message.role === 'user') lines.push(`Outgoing¦${time}¦${userName}¦${message.content}`);
            else lines.push(`Incoming¦${time}¦${message.speaker || label}¦${message.content}`);
        }
        lines.push('[END CURRENT TEXTING CHATLOG]');
        groups.push({
            key: `weyphone_tether_${conversation.id}`,
            // Depth zero places this one consolidated block beside the newest user-side message.
            // It must not be distributed back across the historical turns where texts originated.
            depth: 0,
            content: lines.join('\n'),
        });
    }
    return { caution: groups.length ? TETHER_CAUTION : null, groups };
}

export function reconcileTetherPrompts(plan, previousKeys) {
    const ops = [];
    const nextKeys = new Set();
    if (plan.caution) {
        ops.push({ key: 'weyphone_tether_caution', content: plan.caution, position: 0, depth: 0, role: 0 });
        nextKeys.add('weyphone_tether_caution');
    }
    for (const group of plan.groups) {
        // Linked transcript names and message contents must participate in the normal World Info
        // scan. Otherwise a text to Zora cannot activate Zora/Mama's Bar lore for the main model.
        ops.push({ ...group, position: 1, role: 1, scan: true });
        nextKeys.add(group.key);
    }
    for (const key of previousKeys) {
        if (!nextKeys.has(key)) ops.push({ key, content: '', position: -1, depth: 0, role: 0 });
    }
    return { ops, nextKeys };
}
