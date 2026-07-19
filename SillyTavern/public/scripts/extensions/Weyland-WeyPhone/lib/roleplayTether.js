import { isConversationLinkedToChat } from './roleplayMode.js';

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

function parseTitle(line) {
    const match = line.match(new RegExp(`^Texting${DELIMITER}(.*)$`));
    return match?.[1]?.trim() || null;
}

export function locatePhoneScopes(rawText) {
    if (typeof rawText !== 'string' || !rawText) return [];
    const lines = rawText.replace(/\r\n?/g, '\n').split('\n');
    const scopes = [];
    let current = null;
    const start = (owner, title, index) => {
        current = { owner, title, lines: [], lineIndices: index === null ? [] : [index] };
        scopes.push(current);
    };
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const phoneHeader = PHONE_HEADER_RE.test(line);
        const textingHeader = TEXTING_HEADER_RE.test(line);
        if (phoneHeader || textingHeader) {
            const owner = phoneHeader ? parsePhoneOwner(line) : null;
            const title = textingHeader ? parseTitle(line) : null;
            if (current && current.lines.length === 0
                && ((phoneHeader && current.owner === null) || (textingHeader && current.title === null))) {
                if (phoneHeader) current.owner = owner;
                if (textingHeader) current.title = title;
                current.lineIndices.push(index);
            } else {
                start(owner, title, index);
            }
            continue;
        }
        const match = line.match(PHONE_LINE_RE);
        if (!match) continue;
        if (!current) start(null, null, null);
        current.lines.push({ direction: match[1], sender: match[3].trim(), text: match[4].trim() });
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
    const owner = isUser(scope.owner) ? null : resolveKnownName(scope.owner, knownNames);
    const messages = [];
    const participants = [];
    let inferredUserNickname = null;
    for (const line of scope.lines) {
        if (!line.text) continue;
        if (isUser(line.sender)) {
            messages.push({ role: 'user', content: line.text });
            continue;
        }
        let speaker = resolveKnownName(line.sender, knownNames);
        // On a known character's phone, an otherwise-unknown Incoming sender is the user saved
        // under a nickname ("juicebox", etc.). Preserve it for future captures and route it as
        // the user; never make this inference on a user-owned/headerless phone.
        if (!speaker && line.direction === 'Incoming' && owner) {
            inferredUserNickname = line.sender || inferredUserNickname;
            messages.push({ role: 'user', content: line.text });
            continue;
        }
        // Character-owned phone blocks often label an Outgoing line with a nickname or omit a
        // clean roster name. The established owner is authoritative for those lines.
        if (!speaker && line.direction === 'Outgoing') speaker = owner;
        if (!speaker) return null;
        if (!participants.includes(speaker)) participants.push(speaker);
        messages.push({ role: 'assistant', speaker, content: line.text });
    }
    if (owner && !participants.includes(owner)) participants.unshift(owner);
    if (participants.length === 0 || participants.length > 4 || messages.length === 0) return null;
    return { participants, messages, title: scope.title, userNickname: inferredUserNickname };
}

export function sameParticipants(left, right) {
    const a = [...new Set(left.map(normalizeName))].sort();
    const b = [...new Set(right.map(normalizeName))].sort();
    return a.length === b.length && a.every((name, index) => name === b[index]);
}

export function dedupeCapturedMessages(incoming, stored) {
    const same = (a, b) => a.role === b.role && normalizeName(a.speaker) === normalizeName(b.speaker)
        && String(a.content).trim() === String(b.content).trim();
    const max = Math.min(incoming.length, stored.length);
    for (let count = max; count > 0; count--) {
        const tail = stored.slice(-count);
        if (incoming.slice(0, count).every((message, index) => same(message, tail[index]))) {
            return incoming.slice(count);
        }
    }
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

export function buildTetherInjectionPlan({ conversations, chatId, chatLength, userName, formatClockTime }) {
    const groups = [];
    for (const conversation of conversations) {
        if (!isConversationLinkedToChat(conversation, chatId)) continue;
        const participants = conversation.participants?.length ? conversation.participants : [conversation.charName];
        // Captured messages already remain verbatim in the main roleplay. Only messages created
        // later inside WeyPhone need to round-trip back, otherwise the prompt would duplicate the
        // model's own original phone block and waste main-chat context. A user can also scrub an
        // already-visible phone bubble from future injections without deleting it from WeyPhone.
        const recent = conversation.messages
            .slice(Math.max(conversation.lastMemoryMessageIndex ?? 0, conversation.messages.length - 20))
            .filter(message => !message.capturedFromRoleplay && !message.suppressedFromRoleplay);
        const memories = (conversation.memories ?? []).filter(memory => memory.pinned);
        if (!recent.length && !memories.length) continue;
        const anchorCandidates = [...recent, ...memories]
            .map(item => item.mainChatAnchor).filter(Number.isFinite);
        const anchor = anchorCandidates.length ? Math.min(...anchorCandidates) : chatLength;
        const label = participantLabel(participants);
        const lines = ['*The texting chatlog is updated*'];
        for (const memory of memories) lines.push(`[MEMORY ENTRY]\n${memory.content}\n[END MEMORY ENTRY]`);
        for (const message of recent) {
            const time = Number.isFinite(message.timestamp) ? formatClockTime(message.timestamp) : '';
            if (message.role === 'user') lines.push(`Outgoing¦${time}¦${userName}¦${message.content}`);
            else lines.push(`Incoming¦${time}¦${message.speaker || label}¦${message.content}`);
        }
        groups.push({
            key: `weyphone_tether_${conversation.id}`,
            depth: Math.max(0, chatLength - anchor),
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
        ops.push({ ...group, position: 1, role: 1 });
        nextKeys.add(group.key);
    }
    for (const key of previousKeys) {
        if (!nextKeys.has(key)) ops.push({ key, content: '', position: -1, depth: 0, role: 0 });
    }
    return { ops, nextKeys };
}
