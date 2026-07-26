// lib/appRegistry.js

import { ASSET_BASE_URL } from './assetPaths.js';

/**
 * Single source of truth for every app on the phone. UI (home grid, notification shade, screen
 * titles), the unified sync, and notification derivation all read from here — renaming an app or
 * changing its accent is a one-line edit. `label` may additionally be overridden at runtime via
 * settings.appLabels[key] (see resolveAppLabel below) so the owner can rename apps without a code
 * change at all.
 *
 * `syncSection`: the `# APP: NAME` marker this app's content arrives under in the unified sync
 * response (null for apps that aren't part of the sync).
 *
 * @typedef {Object} AppDefinition
 * @property {string} key            internal id — also the phoneApps cache key
 * @property {string} label          display name
 * @property {string} icon           home-grid / notification icon URL
 * @property {string} accent         per-app accent color (drives --wp-app-accent)
 * @property {string|null} syncSection
 * @property {string} screenView     the data-view value that shows this app
 * @property {boolean} inGrid        appears on the home screen grid
 */
export const APP_REGISTRY = [
    {
        key: 'chronicle',
        requiresRoleplay: true,
        label: 'The Chronicle',
        icon: `${ASSET_BASE_URL}/weyphone_chronicle.webp`,
        accent: '#C67412',
        syncSection: 'CHRONICLE',
        screenView: 'phone-app',
        inGrid: true,
    },
    {
        key: 'feed',
        requiresRoleplay: true,
        label: 'Chitter',
        icon: `${ASSET_BASE_URL}/weyphone_twitter.webp`,
        accent: '#4A9ECD',
        syncSection: 'FEED',
        screenView: 'twitter-feed',
        inGrid: true,
    },
    {
        key: 'chat',
        requiresRoleplay: true,
        label: 'Discorgi',
        icon: `${ASSET_BASE_URL}/weyphone_discord.webp`,
        accent: '#7A82C2',
        syncSection: 'CHAT',
        screenView: 'phone-app',
        inGrid: true,
    },
    {
        key: 'board',
        requiresRoleplay: true,
        label: 'Yip Yap',
        icon: `${ASSET_BASE_URL}/weyphone_yikyak.webp`,
        accent: '#5FA86A',
        syncSection: 'BOARD',
        screenView: 'phone-app',
        inGrid: true,
    },
    {
        key: 'messages',
        requiresRoleplay: false,
        label: 'Messages',
        icon: `${ASSET_BASE_URL}/weyphone_messages.webp`,
        accent: '#AA3F3F',
        syncSection: null,
        screenView: 'messages',
        inGrid: true,
    },
    {
        key: 'contacts',
        requiresRoleplay: false,
        label: 'Contacts',
        icon: null,
        iconFa: 'fa-solid fa-address-book', // no bundled PNG — rendered as a Font Awesome tile
        accent: '#8A8A8A',
        syncSection: null,
        screenView: 'contacts-app',
        inGrid: true,
    },
    {
        key: 'calculator',
        requiresRoleplay: false,
        label: 'Calculator',
        icon: null,
        iconFa: 'fa-solid fa-calculator',
        accent: '#4F9E8F',
        syncSection: null,
        screenView: 'calculator',
        inGrid: true,
    },
    {
        key: 'notes',
        requiresRoleplay: false,
        label: 'Notes',
        icon: null,
        iconFa: 'fa-solid fa-note-sticky',
        accent: '#D4A73C',
        syncSection: null,
        screenView: 'notes',
        inGrid: true,
    },
    {
        key: 'clock',
        requiresRoleplay: false,
        label: 'Clock',
        icon: null,
        iconFa: 'fa-solid fa-clock', // simple "factory app" tile, not a bespoke asset
        accent: '#C9CED6',           // soft white — reads as a plain white clock icon on the grey tile
        syncSection: null,
        screenView: 'clock',
        inGrid: true,
    },
    {
        key: 'housing',
        requiresRoleplay: false,
        label: 'Housing',
        icon: `${ASSET_BASE_URL}/weyphone_housing.webp`,
        accent: '#C67412',
        syncSection: null,
        screenView: 'housing',
        inGrid: true,
    },
    {
        key: 'kressa',
        requiresRoleplay: false,
        label: 'Kressa',
        icon: `${ASSET_BASE_URL}/weyphone_kressa.webp`,
        accent: '#8B7BB8',
        syncSection: null,
        screenView: 'kressa', // routed specially in index.js — opens her dedicated conversation
        inGrid: true,
        tierGated: 'any', // Paw Patrol Plus or Platinum (PP1/PPP1 monthly codes)
    },
    {
        key: 'pawxai',
        requiresRoleplay: true,
        label: 'PawXai',
        icon: `${ASSET_BASE_URL}/weyphone_pawxai.webp`,
        accent: '#B86CE0',
        syncSection: null,
        screenView: 'pawxai',
        inGrid: true,
    },
    {
        key: 'mien',
        requiresRoleplay: true,
        label: 'Mien',
        icon: `${ASSET_BASE_URL}/weyphone_mien_2.webp`,
        accent: '#E28BA8',
        syncSection: null,
        screenView: 'mien',
        inGrid: true,
    },
    {
        key: 'settings',
        requiresRoleplay: false,
        label: 'Settings',
        icon: null,
        iconFa: 'fa-solid fa-gear',
        accent: '#9A9A9A',
        syncSection: null,
        screenView: 'settings-app',
        inGrid: true,
    },
];

// Diegetic empty-state copy per app — the phone pretends the problem is connectivity, not an
// ungenerated cache. Shown with the sync prompt beneath it.
export const EMPTY_STATE_COPY = {
    chronicle: 'No content available.\nAre you sure you\'re online?',
    feed: 'Your feed is out of signal range.',
    chat: 'Connection to the server lost.',
    board: 'The herd is quiet.',
};
export const EMPTY_STATE_FALLBACK = 'No connection. Content will load after a sync.';

/** @param {string} appKey */
export function emptyStateCopy(appKey) {
    return EMPTY_STATE_COPY[appKey] ?? EMPTY_STATE_FALLBACK;
}

const byKey = new Map(APP_REGISTRY.map(app => [app.key, app]));
const bySyncSection = new Map(APP_REGISTRY.filter(a => a.syncSection).map(app => [app.syncSection, app]));

/** @param {string} key */
export function getApp(key) {
    return byKey.get(key);
}

/** Apps that participate in the unified sync, in prompt order. */
export function getSyncApps() {
    return APP_REGISTRY.filter(app => app.syncSection !== null);
}

/**
 * Maps a `# APP: NAME` marker (already uppercased/trimmed by the parser) back to its app.
 * @param {string} sectionName
 */
export function getAppBySyncSection(sectionName) {
    return bySyncSection.get(sectionName);
}

/**
 * Display label with the optional settings-level override applied.
 * @param {{appLabels?: Record<string, string>}} settings
 * @param {string} key
 */
export function resolveAppLabel(settings, key) {
    return settings?.appLabels?.[key] || byKey.get(key)?.label || key;
}
