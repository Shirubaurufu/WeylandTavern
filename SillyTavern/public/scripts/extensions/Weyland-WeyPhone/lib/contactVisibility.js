const DEDICATED_APP_ONLY_CONTACTS = new Set(['kressa']);

/** Characters with dedicated app experiences must not also appear as ordinary messaging targets. */
export function isGeneralMessagingContact(entryOrName) {
    const name = typeof entryOrName === 'string' ? entryOrName : entryOrName?.name;
    return !DEDICATED_APP_ONLY_CONTACTS.has(String(name ?? '').trim().toLowerCase());
}

