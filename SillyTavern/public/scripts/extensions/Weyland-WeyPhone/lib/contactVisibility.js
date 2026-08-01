const NON_CONTACT_CARDS = new Set([
    'kressa',
    'blake & serra',
    'blake and serra',
    'cerberus sisters',
    'cerb sisters',
    'weybot',
    'mirror weyland',
    'kinsbane',
    'kinsbane manor', // exact name distinct from bare "kinsbane" above — the filter is exact-match, not substring
    'assistant', // SillyTavern's own built-in Assistant character/persona, not a Weyland cast member
    'tom', // not a real contact
    'weyland station', // pre-emptive block: a future bot release, not ready to be a contact yet — remove this line once it actually ships
]);

/**
 * Characters/cards that must never appear as an ordinary messaging target — either because they
 * have a dedicated app experience elsewhere (Kressa, Weybot), aren't a person (Kinsbane Manor),
 * or are explicitly excluded (SillyTavern's built-in Assistant, "Tom", the not-yet-released
 * "Weyland Station").
 */
export function isGeneralMessagingContact(entryOrName) {
    const name = typeof entryOrName === 'string' ? entryOrName : entryOrName?.name;
    return !NON_CONTACT_CARDS.has(String(name ?? '').trim().toLowerCase());
}

