// lib/notifications.js

// Cap per chatId — oldest trimmed on write, keeps extensionSettings lean.
export const MAX_STORED_NOTIFICATIONS = 40;

// How many notification entries a single app may surface from one sync.
const PER_APP_NOTIFICATION_LIMIT = 2;

let notificationCounter = 0;
function genNotificationId() {
    notificationCounter++;
    return `ntf_${Date.now()}_${notificationCounter}`;
}

function truncate(text, max = 120) {
    const value = String(text ?? '').trim();
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function ensureNotificationStore(settings, chatId, now) {
    settings.notifications ??= {};
    if (!settings.notifications[chatId]) {
        settings.notifications[chatId] = { items: [], lastRefreshAt: 0 };
    }
    const store = settings.notifications[chatId];
    if (!Array.isArray(store.items)) store.items = [];
    if (!Number.isFinite(store.lastRefreshAt)) store.lastRefreshAt = 0;
    if (now !== undefined) store.lastRefreshAt = Math.max(store.lastRefreshAt, now);
    return store;
}

function trimNotificationStore(store) {
    if (store.items.length > MAX_STORED_NOTIFICATIONS) {
        store.items = store.items.slice(store.items.length - MAX_STORED_NOTIFICATIONS);
    }
}

/** Records one unread Messages notification for an incoming DM batch. */
export function recordMessageNotification(settings, chatId, { title, text, conversationId, now = Date.now() }) {
    const preview = truncate(text);
    if (!preview) return null;
    const store = ensureNotificationStore(settings, chatId, now);
    const item = {
        id: genNotificationId(),
        appKey: 'messages',
        title: `Messages · ${String(title || 'New message').trim()}`,
        text: preview,
        timestamp: now,
        read: false,
        ...(conversationId ? { conversationId } : {}),
    };
    store.items.push(item);
    trimNotificationStore(store);
    return item;
}

/**
 * Flattens one app's parsed sync content into notification-worthy {title, text} pairs, newest
 * first as generated. Shapes: section apps ({sections:[{title, items:[{text, boldPrefix?}]}]})
 * and the feed ({posts:[{authorName?, handle?, text}]}).
 * @param {{key: string, label: string}} app registry entry (label already override-resolved)
 * @param {object} content
 * @returns {Array<{title: string, text: string}>}
 */
function flattenAppContent(app, content) {
    if (Array.isArray(content?.posts)) {
        return content.posts.map(post => ({
            title: post.authorName ? `${app.label} · ${post.authorName}` : app.label,
            text: truncate(post.text),
        }));
    }
    const out = [];
    for (const section of content?.sections ?? []) {
        for (const item of section.items ?? []) {
            const channelish = section.title?.startsWith('#');
            out.push({
                title: channelish ? `${app.label} · ${section.title}` : app.label,
                text: truncate(item.boldPrefix && !item.text.startsWith(item.boldPrefix) ? `${item.boldPrefix} ${item.text}` : item.text),
            });
        }
    }
    return out;
}

/**
 * Derives notification records from one unified sync's parsed apps and appends them (unread) to
 * the per-chat notification store. Mutates and returns the store entry for chatId.
 * @param {{notifications: Record<string, {items: Array, lastRefreshAt: number}>}} settings
 * @param {string} chatId
 * @param {Record<string, object>} parsedApps appKey → cache-ready content (parseUnifiedRefresh output)
 * @param {Array<{key: string, label: string}>} appDefs registry entries with resolved labels
 * @param {number} [now] injectable clock for tests
 */
export function recordSyncNotifications(settings, chatId, parsedApps, appDefs, now = Date.now()) {
    const store = ensureNotificationStore(settings, chatId, now);
    store.lastRefreshAt = now;

    for (const app of appDefs) {
        const content = parsedApps[app.key];
        if (!content) continue;
        const flattened = flattenAppContent(app, content).slice(0, PER_APP_NOTIFICATION_LIMIT);
        for (const { title, text } of flattened) {
            if (!text) continue;
            store.items.push({ id: genNotificationId(), appKey: app.key, title, text, timestamp: now, read: false });
        }
    }

    trimNotificationStore(store);
    return store;
}

/**
 * @param {{notifications: Record<string, {items: Array}>}} settings
 * @param {string} chatId
 * @returns {Array} newest first
 */
export function getNotifications(settings, chatId) {
    const items = settings.notifications?.[chatId]?.items ?? [];
    return [...items].reverse();
}

/** Unread count per appKey — drives home-grid badges. */
export function getUnreadCounts(settings, chatId) {
    const counts = {};
    for (const item of settings.notifications?.[chatId]?.items ?? []) {
        if (!item.read) counts[item.appKey] = (counts[item.appKey] ?? 0) + 1;
    }
    return counts;
}

/** Marks a single notification read. Returns true if found. */
export function markNotificationRead(settings, chatId, notificationId) {
    const item = settings.notifications?.[chatId]?.items?.find(i => i.id === notificationId);
    if (!item) return false;
    item.read = true;
    return true;
}

/** Marks every notification for an app (or all apps if appKey omitted) read. */
export function markAppNotificationsRead(settings, chatId, appKey) {
    for (const item of settings.notifications?.[chatId]?.items ?? []) {
        if (!appKey || item.appKey === appKey) item.read = true;
    }
}

/** Clears the whole notification list for a chat. */
export function clearNotifications(settings, chatId) {
    if (settings.notifications?.[chatId]) {
        settings.notifications[chatId].items = [];
    }
}
