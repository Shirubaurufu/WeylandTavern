// lib/savedPosts.js
//
// Saved/bookmarked posts. Sync overwrites each app's content cache wholesale, so anything the
// user wants to keep gets copied here — settings.savedPosts is global (not per-chat) and never
// touched by the sync pipeline. Identity is a content hash, so re-tapping the bookmark on the
// same post after a re-sync that happened to regenerate identical text still resolves to the
// same saved entry instead of duplicating it.

/** djb2 — tiny, stable, good enough for content identity (not security). */
function hashString(value) {
    let hash = 5381;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
}

/**
 * Stable identity for a saveable piece of content.
 * Chitter posts hash author+text (and the retweeted text, so a retweet and the original post
 * are distinct saves); phone-app items hash their text.
 * @param {string} appKey 'feed' | 'chronicle' | 'chat' | 'board'
 * @param {object} data a Chitter post object or a phone-app item ({text, timestamp?, boldPrefix?})
 */
export function postIdFor(appKey, data) {
    const basis = appKey === 'feed'
        ? `${data.handle ?? ''}|${data.text ?? ''}|${data.retweetedText ?? ''}`
        : `${data.text ?? ''}`;
    return `${appKey}:${hashString(basis)}`;
}

/**
 * @param {{savedPosts?: Record<string, Array>}} settings
 * @param {string} appKey
 * @returns {Array<{id: string, savedAt: number, data: object}>} newest-first
 */
export function getSaved(settings, appKey) {
    return settings.savedPosts?.[appKey] ?? [];
}

/**
 * @param {{savedPosts?: Record<string, Array>}} settings
 * @param {string} appKey
 * @param {string} id
 */
export function isSaved(settings, appKey, id) {
    return getSaved(settings, appKey).some(entry => entry.id === id);
}

/**
 * Save if unsaved, unsave if saved. Saves a structuredClone of `data` so later cache mutations
 * (like tapping the like button on the live post) can't reach into the saved copy.
 * @param {{savedPosts?: Record<string, Array>}} settings
 * @param {string} appKey
 * @param {object} data
 * @param {number} [now]
 * @returns {{saved: boolean, id: string}} saved = the state AFTER the toggle
 */
export function toggleSaved(settings, appKey, data, now = Date.now()) {
    if (!settings.savedPosts) settings.savedPosts = {};
    if (!settings.savedPosts[appKey]) settings.savedPosts[appKey] = [];
    const id = postIdFor(appKey, data);
    const list = settings.savedPosts[appKey];
    const existingIndex = list.findIndex(entry => entry.id === id);
    if (existingIndex !== -1) {
        list.splice(existingIndex, 1);
        return { saved: false, id };
    }
    list.unshift({ id, savedAt: now, data: structuredClone(data) });
    return { saved: true, id };
}

/**
 * @param {{savedPosts?: Record<string, Array>}} settings
 * @param {string} appKey
 * @param {string} id
 * @returns {boolean} whether anything was removed
 */
export function unsave(settings, appKey, id) {
    const list = settings.savedPosts?.[appKey];
    if (!list) return false;
    const index = list.findIndex(entry => entry.id === id);
    if (index === -1) return false;
    list.splice(index, 1);
    return true;
}

/**
 * The saved-state Set the render layer needs to paint bookmark icons.
 * @param {{savedPosts?: Record<string, Array>}} settings
 * @param {string} appKey
 * @returns {Set<string>}
 */
export function savedIdSet(settings, appKey) {
    return new Set(getSaved(settings, appKey).map(entry => entry.id));
}
