// lib/characterUpdates.js
//
// The "your characters have updates" notification. The Character Downloader publishes the list of
// installed characters with an update waiting (window.weylandCharacterUpdates + the
// "weyland:character-updates" document event); each entry carries a signature, a fingerprint of the
// update the server is offering.
//
// Two things are remembered, per character, by signature:
//   dismissed  the player waved this update away (or opened the Downloader from the notification).
//              It is not shown again. A genuinely new update has a new signature, so it shows.
//   announced  the pop-up for this update was already shown once. The notification stays in the phone
//              until it is dismissed, but the pop-up does not come back on every launch.
// Both are maps (never arrays): settingsSync merges objects key by key but replaces arrays whole.

export const CHARACTER_UPDATES_KEY = 'character-updates';

function store(settings) {
    if (!settings.characterUpdates || typeof settings.characterUpdates !== 'object' || Array.isArray(settings.characterUpdates)) {
        settings.characterUpdates = {};
    }
    for (const key of ['dismissed', 'announced']) {
        const value = settings.characterUpdates[key];
        if (!value || typeof value !== 'object' || Array.isArray(value)) settings.characterUpdates[key] = {};
    }
    return settings.characterUpdates;
}

function clean(pending) {
    return (Array.isArray(pending) ? pending : [])
        .filter(item => item && typeof item.sysName === 'string' && item.sysName && typeof item.signature === 'string' && item.signature)
        .map(item => ({ sysName: item.sysName, name: String(item.name || item.sysName), signature: item.signature }));
}

/** The pending updates the player has not dismissed. */
export function undismissedUpdates(settings, pending) {
    const dismissed = settings?.characterUpdates?.dismissed ?? {};
    return clean(pending).filter(item => dismissed[item.sysName] !== item.signature);
}

/** Of those, the ones whose pop-up has not been shown yet. */
export function unannouncedUpdates(settings, pending) {
    const announced = settings?.characterUpdates?.announced ?? {};
    return undismissedUpdates(settings, pending).filter(item => announced[item.sysName] !== item.signature);
}

function remember(settings, field, pending) {
    const map = store(settings)[field];
    let changed = false;
    for (const item of clean(pending)) {
        if (map[item.sysName] === item.signature) continue;
        map[item.sysName] = item.signature;
        changed = true;
    }
    return changed;
}

/** Dismisses every update in `pending`. @returns {boolean} whether anything changed. */
export function dismissUpdates(settings, pending) {
    return remember(settings, 'dismissed', pending);
}

/** Notes that the pop-up for every update in `pending` was shown. @returns {boolean} whether anything changed. */
export function markUpdatesAnnounced(settings, pending) {
    return remember(settings, 'announced', pending);
}

/**
 * Forgets what is remembered about characters with no update waiting any more (they were updated, or
 * removed), so the two maps do not grow forever. Only call this with a list the Downloader actually
 * delivered: an unreachable server delivers nothing, and must not wipe the player's dismissals.
 * @returns {boolean} whether anything changed.
 */
export function pruneUpdateMemory(settings, pending) {
    const waiting = new Set(clean(pending).map(item => item.sysName));
    const memory = store(settings);
    let changed = false;
    for (const field of ['dismissed', 'announced']) {
        for (const sysName of Object.keys(memory[field])) {
            if (waiting.has(sysName)) continue;
            delete memory[field][sysName];
            changed = true;
        }
    }
    return changed;
}

/** "Summer", "Summer and Belle", "Summer, Belle and Loona", "Summer, Belle and 3 more". */
export function updateNames(list) {
    const names = list.map(item => item.name);
    if (names.length <= 1) return names[0] ?? '';
    if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/** One sentence saying who has an update. */
export function updateSentence(list) {
    if (!list.length) return '';
    return `${updateNames(list)} ${list.length === 1 ? 'has an update' : 'have updates'} in the Character Downloader.`;
}

/**
 * The notification shown in the shade and on the lock screen, or null when there is nothing to show.
 * It is not stored with a chat's notifications: it belongs to the install, not to a roleplay.
 */
export function characterUpdateNotification(settings, pending, timestamp = Date.now()) {
    const list = undismissedUpdates(settings, pending);
    if (!list.length) return null;
    return {
        id: CHARACTER_UPDATES_KEY,
        appKey: CHARACTER_UPDATES_KEY,
        title: `Character Downloader · ${list.length} ${list.length === 1 ? 'update' : 'updates'}`,
        text: `${updateSentence(list)} Tap to open it.`,
        timestamp,
        read: false,
        faIcon: 'fa-solid fa-cloud-arrow-down',
        dismissible: true,
    };
}
