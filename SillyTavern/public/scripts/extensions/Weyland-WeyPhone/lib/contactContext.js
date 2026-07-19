function normalizeName(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Resolve a contact context by exact key first, then by a unique first-name alias. This bridges
 * installed-card names such as "Jenn" with directory/group names such as "Jenn Morrison".
 */
export function resolveContactContext(contexts, contactName) {
    if (!contexts || typeof contexts !== 'object') return '';
    const target = normalizeName(contactName);
    if (!target) return '';
    const exact = Object.entries(contexts).find(([key]) => normalizeName(key) === target);
    if (exact) return String(exact[1] ?? '').trim();
    const first = target.split(' ')[0];
    const matches = Object.entries(contexts).filter(([key]) => normalizeName(key).split(' ')[0] === first);
    return matches.length === 1 ? String(matches[0][1] ?? '').trim() : '';
}

export function buildContactContextBlock(contactName, contextText) {
    const text = String(contextText ?? '').trim();
    if (!text) return '';
    return `[HIGH-PRIORITY USER-PROVIDED RELATIONSHIP CONTEXT: ${contactName}]
The following describes the established relationship and history between {{user}} and ${contactName}.
Treat this as true and immediately relevant. It must influence the character's tone, familiarity,
affection, hostility, boundaries, and assumptions throughout the exchange. It overrides generic
relationship assumptions elsewhere in the prompt. Do not quote or summarize the note unless it
would arise naturally in the conversation.
${text}
[END HIGH-PRIORITY USER-PROVIDED RELATIONSHIP CONTEXT]`;
}

/**
 * Give WeyPhone conversations the active SillyTavern persona without encouraging the model to
 * shoehorn every biographical or appearance detail into ordinary small talk.
 */
export function buildPersonaContextBlock(userName, personaDescription) {
    const text = String(personaDescription ?? '').trim();
    if (!text) return '';
    return `[ACTIVE USER PERSONA: ${userName || '{{user}}'}]
The following persona description is optional background about {{user}}. Use only the details that
are relevant to the current conversation or a direct question. Most details will usually be unnecessary.
Do not mention, summarize, or draw attention to this description merely because it was provided.
${text}
[END ACTIVE USER PERSONA]`;
}

export function buildGroupContactContextBlock(participants, contexts) {
    return participants
        .map(name => buildContactContextBlock(name, resolveContactContext(contexts, name)))
        .filter(Boolean)
        .join('\n\n');
}
