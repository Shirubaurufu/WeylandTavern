import { getRoleplayMode, isConversationLinkedToChat, ROLEPLAY_MODES } from './roleplayMode.js';
import { canonicalCharacterName, characterNamesEquivalent } from './characterIdentity.js';
import { withMessageDate } from './messageTime.js';

const DELIMITER = '[¦|│]';
const PHONE_LINE_RE = new RegExp(`^(Incoming|Outgoing)${DELIMITER}([^¦|│]*)${DELIMITER}([^¦|│]*)${DELIMITER}(.*)$`);
const PHONE_HEADER_RE = new RegExp(`^Phone${DELIMITER}`);
const TEXTING_HEADER_RE = new RegExp(`^Texting${DELIMITER}`);

function normalizeName(value) {
    // Presentation wrappers belong to generated labels, never to the stored contact identity.
    // Keep token boundaries: removing punctuation inside a name could join unrelated people.
    const plain = String(value ?? '').trim()
        .replace(/^(?:\*\*|__)(.*)(?:\*\*|__)$/, '$1')
        .replace(/(?:\s*[\p{Extended_Pictographic}\uFE0F\u200D])+$/gu, '')
        .trim().replace(/:$/, '').replace(/[‘’]/g, "'");
    return canonicalCharacterName(plain);
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

function matchingPhoneNames(rawName, knownNames) {
    const target = normalizeName(rawName);
    if (!target) return [];
    const matches = [];
    const withoutTitle = name => name.replace(/^(?:doctor|professor|mr\.?|mrs\.?|ms\.?)\s+/, '');
    for (const name of knownNames) {
        const candidate = normalizeName(name);
        const stem = withoutTitle(target);
        const shortMatch = !stem.includes(' ') && withoutTitle(candidate).startsWith(`${stem} `);
        const matchesName = candidate === target || characterNamesEquivalent(candidate, target) || shortMatch;
        if (matchesName && !matches.some(previous => normalizeName(previous) === candidate
            || characterNamesEquivalent(normalizeName(previous), candidate))) matches.push(name);
    }
    return matches;
}

/** Resolve shortened phone labels only within this capture's known identities. Never teach the
 * global alias table that every future George is George Smith, or guess from a shared surname. */
export function resolvePhoneParticipantName(rawName, knownNames) {
    const target = normalizeName(rawName);
    if (!target) return null;
    // A fully specified name/known title wins even when another person shares the first name.
    if (target.includes(' ')) {
        const identified = knownNames.find(name => normalizeName(name) === target
            || characterNamesEquivalent(normalizeName(name), target));
        // Preserve the caller's preferred directory label when an exact card title is an alias.
        if (identified) return identified;
    }
    const matches = matchingPhoneNames(rawName, knownNames);
    return matches.length === 1 ? matches[0] : null;
}

/** Route a whole scope atomically. Unknown speakers leave the original roleplay block untouched. */
export function routePhoneScope(scope, { userName, userNicknames = [], knownNames = [] }) {
    // A saved nickname is only ignored on a screen that contradicts it: one whose declared Members list the
    // user's real name AND a separate member matching the nickname. That member is somebody else, so the
    // nickname is wrong for this screen (the bug described in the wire branch below). Deliberately narrow:
    // a real nickname that happens to match some unrelated contact ("Angel") keeps working everywhere else,
    // and headerless legacy screens behave exactly as before.
    const userNorm = normalizeName(userName);
    const memberNorms = (scope.wireMetadata ? scope.members ?? [] : []).map(normalizeName);
    const contradicted = nickname => memberNorms.includes(userNorm) && memberNorms.includes(normalizeName(nickname))
        && normalizeName(nickname) !== userNorm;
    const userAliases = [userName, ...userNicknames.filter(nickname => !contradicted(nickname))].map(normalizeName).filter(Boolean);
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
            const resolved = resolvePhoneParticipantName(member, knownNames);
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
        // Fully declared Members can disambiguate an abbreviated owner/sender even when a
        // second George exists elsewhere in Contacts. Short ambiguous Members cannot.
        const owner = ownerIsUser ? userName : resolvePhoneParticipantName(scope.owner, participants);
        if (!owner || (!ownerIsUser && !participants.includes(owner))) return null;

        const messages = [];
        for (const line of scope.lines) {
            if (!line.text) continue;
            if (isUser(line.sender)) {
                // A user and a character may share a first name. An abbreviated sender that
                // could identify either must not silently turn a character reply into a send.
                if (resolvePhoneParticipantName(line.sender, participants)) return null;
                messages.push({ role: 'user', content: line.text, displayTime: line.displayTime });
                continue;
            }
            const speaker = resolvePhoneParticipantName(line.sender, participants);
            if (!speaker || !participants.includes(speaker)) return null;
            messages.push({ role: 'assistant', speaker, content: line.text, displayTime: line.displayTime });
        }
        if (!messages.length) return null;

        const direct = scope.mode === 'solo' || (scope.mode === 'nochar' && participants.length === 1);
        // Models often label a character-owned screen with the character's OWN name ("Phone¦Weynet - Mika"
        // then "Texting¦Mika"). That title is not a nickname for the user. Saving it as one made every later
        // block treat Mika as the user, so Mika's next phone screen routed to nothing and stopped being
        // captured (Sunny's Blake chat, 2026-10-18). A title naming a participant of this very screen is never
        // a nickname. Only this screen's participants are checked, so a pet name that collides with some
        // unrelated contact is still learned.
        const titleIsCharacter = Boolean(scope.title) && Boolean(resolvePhoneParticipantName(scope.title, participants));
        return {
            mode: scope.mode,
            participants,
            messages,
            // On a character-owned solo screen, Texting is that character's saved name for the
            // user. Locally, the thread must still be titled with the actual character identity.
            title: direct && !ownerIsUser ? participants[0] : (scope.title || participants.join(', ')),
            userNickname: direct && !ownerIsUser && scope.title && !isUser(scope.title) && !titleIsCharacter ? scope.title : null,
        };
    }

    const owner = isUser(scope.owner) ? null : resolvePhoneParticipantName(scope.owner, knownNames);
    const messages = [];
    const participants = [];
    let inferredUserNickname = null;
    for (const line of scope.lines) {
        if (!line.text) continue;
        if (isUser(line.sender)) {
            messages.push({ role: 'user', content: line.text, displayTime: line.displayTime });
            continue;
        }
        let speaker = resolvePhoneParticipantName(line.sender, knownNames);
        // An ambiguous known character is not an unknown nickname for the user or phone owner.
        if (!speaker && matchingPhoneNames(line.sender, knownNames).length) return null;
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

export function sameParticipants(left, right, knownNames = []) {
    const resolve = name => knownNames.length ? resolvePhoneParticipantName(name, knownNames) : name;
    const resolvedLeft = left.map(resolve);
    const resolvedRight = right.map(resolve);
    if (resolvedLeft.some(name => !name) || resolvedRight.some(name => !name)) return false;
    const a = [...new Set(resolvedLeft.map(normalizeName))];
    const b = [...new Set(resolvedRight.map(normalizeName))];
    return a.length === b.length
        && a.every(name => b.some(other => characterNamesEquivalent(name, other)));
}

function normalizeCapturedContent(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .trim()
        .replace(/\s+/g, ' ')
        // Models commonly repair or introduce a space after punctuation when replaying the
        // injected transcript. That is formatting drift, not a new text message.
        .replace(/\s*([.,!?;:])\s*/g, '$1')
        .toLowerCase();
}

export function dedupeCapturedMessages(incoming, stored, knownNames = []) {
    // Outgoing phone texts are often redisplayed on the character's screen, interspersed with
    // other lines rather than as a contiguous transcript prefix. Their position and displayed
    // time don't make them new sends. Keep prefix matching below for character transcript echoes.
    const outgoing = new Set(stored.filter(message => message.role === 'user')
        .map(message => normalizeCapturedContent(message.content)));
    return dedupeCapturedPrefix(incoming, stored, knownNames)
        .filter(message => message.role !== 'user' || !outgoing.has(normalizeCapturedContent(message.content)));
}

function dedupeCapturedPrefix(incoming, stored, knownNames) {
    // Older phone logs can store George while new capture resolves George Smith. Compare
    // speakers through the same scoped identity resolver without rewriting saved history.
    const sameSpeaker = (a, b) => normalizeName(a.speaker) === normalizeName(b.speaker)
        || (knownNames.length && a.speaker && b.speaker && sameParticipants([a.speaker], [b.speaker], knownNames));
    const same = (a, b) => a.role === b.role && sameSpeaker(a, b)
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

// Default ceiling on how many transcript messages ride along in the injected block. Without a cap
// the backlog is bounded only by the WeyPhone memory checkpoint (default ~100 outgoing texts) — a
// mandatory injection that large can push the prompt past the context limit and truncate the
// system prompt. Only the most recent messages are kept; older ones are covered by memory anyway.
// This is just the default; the live value comes from settings.tetherContextMessages via the slider
// in WeyPhone system settings (15/30/45/60, or 0 = keep all un-summarized messages).
export const TETHER_MAX_MESSAGES = 30;

// The discrete slider stops surfaced in system settings. 0 means "no cap" (keep everything).
export const TETHER_CONTEXT_MESSAGE_OPTIONS = [15, 30, 45, 60, 0];

// Normalize whatever is stored in settings into a usable cap. Anything not on the allowed list
// falls back to the default, so a corrupt/legacy value can never silently mean "unbounded".
export function resolveTetherMessageCap(value) {
    const n = Math.floor(Number(value));
    if (n === 0) return 0; // 0 = keep all
    return TETHER_CONTEXT_MESSAGE_OPTIONS.includes(n) ? n : TETHER_MAX_MESSAGES;
}

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

export function buildTetherInjectionPlan({ conversations, chatId, chatLength, chat, userName, formatClockTime, maxMessages = TETHER_MAX_MESSAGES }) {
    const cap = resolveTetherMessageCap(maxMessages);
    const groups = [];
    for (const conversation of conversations) {
        if (!isConversationLinkedToChat(conversation, chatId)) continue;
        const participants = conversation.participants?.length ? conversation.participants : [conversation.charName];
        // Unanswered captures still live in the selected roleplay reply. Once the user replies,
        // keep that accepted exchange in the injected log: a later swipe/delete may remove its
        // original roleplay text, but must not erase the message the user actually answered.
        const withinWindow = conversation.messages
            .slice(Math.max(conversation.lastMemoryMessageIndex ?? 0, 0))
            .filter(message => (!message.capturedFromRoleplay || message.roleplayReplyLocked)
                && !message.suppressedFromRoleplay);
        // Keep only the most recent `cap` messages so the injected block can't balloon. cap === 0
        // means the user chose "all" — keep the full un-summarized window.
        const recent = cap > 0 ? withinWindow.slice(-cap) : withinWindow;
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
        // The live transcript block. This is the ONLY part that participates in the World Info scan
        // (see reconcileTetherPrompts): the participant names + the actual message text are what
        // should legitimately activate lore — e.g. a text to Zora about Mama's Bar should fire that
        // lore. Pinned memories are deliberately kept OUT of this block (see memoryLines below):
        // they are keyword-dense historical summaries that were over-activating unrelated lorebooks
        // and blowing the context budget, which truncated the system prompt in Linked mode.
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
        for (const message of recent) {
            // Captured roleplay phone blocks already carry the scene's displayed clock time.
            // Preserve that exact value instead of replacing 7:06 PM with the browser's noon
            // wall clock. New messages authored inside WeyPhone also carry displayTime while the
            // RP clock is enabled. Legacy entries without it use the caller's clock policy, which
            // deliberately returns an empty time in RP mode instead of leaking browser wall time.
            const time = withMessageDate(message, String(message.displayTime ?? '').trim()
                || (Number.isFinite(message.timestamp) ? formatClockTime(message.timestamp) : ''));
            if (message.role === 'user') lines.push(`Outgoing¦${time}¦${userName}¦${message.content}`);
            else lines.push(`Incoming¦${time}¦${message.speaker || label}¦${message.content}`);
        }
        lines.push('[END CURRENT TEXTING CHATLOG]');

        // Pinned memories ride along as context but are injected separately with scanning OFF, so
        // they inform the model without triggering World Info. They carry their own framing header
        // because they no longer sit inside the [CURRENT TEXTING CHATLOG] block that explained what
        // the surrounding material was. Empty string when there are none.
        const memoryContent = memories.length
            ? [
                `[EARLIER TEXTING HISTORY — ${userName} and ${label}]`,
                'Summarized background from this same texting thread, provided for continuity only.',
                'These are past events, not new texts — do not respond to them or treat them as unread.',
                ...memories.map(memory => `[MEMORY ENTRY]\n${memory.content}\n[END MEMORY ENTRY]`),
                '[END EARLIER TEXTING HISTORY]',
            ].join('\n')
            : '';

        groups.push({
            key: `weyphone_tether_${conversation.id}`,
            // Depth zero places this one consolidated block beside the newest user-side message.
            // It must not be distributed back across the historical turns where texts originated.
            depth: 0,
            content: lines.join('\n'),
            memoryContent,
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
        // Only the transcript block (participant names + message text) participates in the World
        // Info scan. That preserves the intended behavior — a text to Zora can still activate
        // Zora/Mama's Bar lore for the main model.
        ops.push({ key: group.key, content: group.content, position: 1, depth: group.depth, role: 1, scan: true });
        nextKeys.add(group.key);
        // Pinned memories are injected as context but with scanning OFF. Their keyword-dense
        // summaries were over-activating unrelated lorebooks and blowing the context budget in
        // Linked mode (truncating the system prompt); as plain context they still inform the model
        // without triggering World Info.
        if (group.memoryContent) {
            const memoryKey = `${group.key}_mem`;
            ops.push({ key: memoryKey, content: group.memoryContent, position: 1, depth: group.depth, role: 1, scan: false });
            nextKeys.add(memoryKey);
        }
    }
    for (const key of previousKeys) {
        if (!nextKeys.has(key)) ops.push({ key, content: '', position: -1, depth: 0, role: 0 });
    }
    return { ops, nextKeys };
}
