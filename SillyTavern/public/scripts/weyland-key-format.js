// What a HelixMind API key looks like, and what to tell a player whose paste is not one.
// Pure (no DOM, no imports) so the rules can be tested in Node; weyland-access-keys.js does the real work.

/** Where players get a HelixMind key: a ticket in Nara's Message Shop (every Paw Patrol and Nara subscription includes one). */
export const NARA_SHOP_INVITE = 'https://discord.gg/xP6UDEZu7y';

/**
 * Cleans what a player pasted and says whether it can be a HelixMind key. Keys start with "helix" (the server's KeyGuard
 * uses the same test), and copy-paste often drags along quotes, a trailing space or a "Bearer " prefix.
 * Anything else (a Paw Patrol password pasted into the wrong box is the usual one) is rejected here instead of being
 * stored as the active API key, where it would only ever produce 401 errors.
 * @param {unknown} raw
 * @returns {{ ok: true, key: string } | { ok: false, reason: 'empty' | 'format' }}
 */
export function normalizeHelixKey(raw) {
    let text = typeof raw === 'string' ? raw.trim() : '';
    if (!text) return { ok: false, reason: 'empty' };
    text = text.replace(/^bearer\s+/i, '').replace(/^["'`]+|["'`]+$/g, '').trim();
    if (!/^helix/i.test(text) || /\s/.test(text)) return { ok: false, reason: 'format' };
    return { ok: true, key: text };
}

/**
 * Plain-language text for each way saving a key can go. `where` picks the wording: a toast is one line, a popup can hold the
 * longer explanation.
 * @param {'format' | 'invalid' | 'unreachable' | 'unchecked' | 'failed'} status
 * @param {{ hadKey?: boolean }} [options] hadKey: the player already has a key, which is kept when the new one fails
 */
export function describeKeyProblem(status, { hadKey = false } = {}) {
    const keptNote = hadKey ? ' Your current key was kept.' : '';
    const shop = `The API key comes from opening a ticket in Nara's Message Shop (${NARA_SHOP_INVITE}). Every Paw Patrol and Nara subscription includes one.`;
    switch (status) {
        case 'format':
            return `That does not look like a HelixMind API key. It starts with "helix-" and you need to copy the whole thing. ${shop}${keptNote}`;
        case 'invalid':
            return `HelixMind did not accept that key. Check that you copied all of it, or open a ticket in Nara's Message Shop (${NARA_SHOP_INVITE}) if it should be working.${keptNote}`;
        case 'unreachable':
            return `Could not reach HelixMind to check that key, so nothing was changed.${keptNote} Try again in a minute.`;
        case 'unchecked':
            return 'Key saved, but HelixMind could not be reached to check it. If messages fail with an authentication error, re-enter it later.';
        default:
            return `The key could not be saved.${keptNote}`;
    }
}
