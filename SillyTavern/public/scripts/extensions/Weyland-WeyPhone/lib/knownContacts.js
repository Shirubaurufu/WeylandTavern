// lib/knownContacts.js

/**
 * Characters who should default to "has never spoken to {{user}}" when a new texting thread is
 * created. Per Lucky's direction: EVERYONE defaults to knowing the user for now — this set stays
 * empty until he itemizes who should start as a stranger (e.g. Dr Loren Montenegro, Derek Adler
 * were his examples). Names here are SillyTavern character names (the ones threads store in
 * conversation.charName), not cast-page display names.
 * @type {Set<string>}
 */
export const STRANGERS_BY_DEFAULT = new Set([
    // (empty until Lucky provides the list — add names like 'Dr Loren Montenegro' here)
]);

/**
 * Whether a brand-new conversation with this character should assume prior history.
 * Precedence: per-character user override (set from the contact page) > the curated
 * STRANGERS_BY_DEFAULT list > known-by-default.
 * @param {{contactHistoryDefaults?: Record<string, boolean>}} settings
 * @param {string} charName
 * @returns {boolean}
 */
export function isKnownByDefault(settings, charName) {
    const override = settings?.contactHistoryDefaults?.[charName];
    if (typeof override === 'boolean') return override;
    return !STRANGERS_BY_DEFAULT.has(charName);
}
