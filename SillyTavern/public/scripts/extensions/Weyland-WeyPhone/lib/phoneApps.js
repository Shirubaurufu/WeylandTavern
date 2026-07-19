/**
 * @typedef {{content: any, generatedAt: number, chatMessageCountAtGeneration: number}} PhoneAppEntry
 */

/**
 * @param {{phoneApps: Record<string, Record<string, PhoneAppEntry>>}} settings
 * @param {string} chatId real SillyTavern chatId of the main roleplay chat this content belongs to
 * @param {string} appKey e.g. 'chronicle' | 'discord' | 'yikyak'
 * @returns {PhoneAppEntry | undefined}
 */
export function getPhoneAppContent(settings, chatId, appKey) {
    return settings.phoneApps[chatId]?.[appKey];
}

/**
 * @param {{phoneApps: Record<string, Record<string, PhoneAppEntry>>}} settings
 * @param {string} chatId
 * @param {string} appKey e.g. 'chronicle' | 'discord' | 'yikyak'
 * @param {PhoneAppEntry} entry
 */
export function setPhoneAppContent(settings, chatId, appKey, entry) {
    if (!settings.phoneApps[chatId]) settings.phoneApps[chatId] = {};
    settings.phoneApps[chatId][appKey] = entry;
}
