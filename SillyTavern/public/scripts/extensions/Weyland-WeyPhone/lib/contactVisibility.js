const NON_CONTACT_CARDS = new Set([
    'kressa',
    'blake & serra',
    'blake and serra',
    'cerberus sisters',
    'cerb sisters',
    'weybot',
    'mirror weyland',
    'kinsbane',
]);

/** Characters with dedicated app experiences must not also appear as ordinary messaging targets. */
export function isGeneralMessagingContact(entryOrName) {
    const name = typeof entryOrName === 'string' ? entryOrName : entryOrName?.name;
    return !NON_CONTACT_CARDS.has(String(name ?? '').trim().toLowerCase());
}

