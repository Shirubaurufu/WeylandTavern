import { migrateLegacyConversations, migrateMemoryFields, migrateTetheredFields, migrateContactHistoryFields, migrateStaleModelNames } from './storage.js';

export const MODULE_NAME = 'WeyPhone';

export const defaultSettings = Object.freeze({
    debug: false,
    connectionProfileId: '',
    conversations: {},
    phoneApps: {},
    // Per-chatId notification state written by the unified sync:
    // { [chatId]: { items: [{id, appKey, title, text, timestamp, read}], lastRefreshAt } }
    notifications: {},
    // Shared rolling allowance for social Sync/profile generations and PawXai prompt sets.
    // Event IDs make this union-mergeable across stale tabs and separate devices.
    generationRateLimitEvents: [],
    // Cached cast.weybooru.com directory: { fetchedAt, entries } | null
    castDirectory: null,
    // Optional per-appKey display-name overrides (owner renames without a code change)
    appLabels: {},
    // Per-character override for whether NEW threads start assuming prior history — set from the
    // contact page's "Prior history?" toggle. Existing threads carry their own hasHistory flag.
    contactHistoryDefaults: {},
    // User-authored relationship/background notes keyed by stable contact identity. These are
    // injected into texting prompts but never written into the main roleplay or lorebooks.
    contactContexts: {},
    // Model every WeyPhone generation runs on (texting + sync). Deliberately defaults to
    // minimax-m3 — Lucky discourages spending Sonnet on what amounts to a small text.
    // Empty string = follow the live main-chat model. Kressa has her own setting (kressaModel).
    modelOverride: 'minimax-m3',
    // Texting is deliberately independent from the social-app Sync model. Existing installs are
    // migrated to their prior modelOverride below so this split does not silently change DMs.
    textingModelOverride: 'minimax-m3',
    kressaModel: '', // '' = live main-chat model (default per Lucky)
    // Weyland's global Hard Mode is deliberately isolated from WeyPhone. These independent
    // opt-ins only take effect while the global HardToggle is actually On.
    phoneHardModeEnabled: false,
    kressaHardModeEnabled: false,
    kressaPalette: 'twilight',
    calculatorPalette: 'graphite',
    pawxai: {
        promptCount: 5,
        modelOverride: 'minimax-m3',
        palette: 'orchid-night',
        focus: 'balanced',
        framing: 'auto',
        variation: 'balanced',
        customFragments: '',
        modelFeedback: '',
        qualityTags: '(masterpiece:1.1), (best quality), (ultra detailed)',
        includeCharacterDescription: true,
        lastRun: null,
        savedPrompts: [],
    },
    // Display-name overrides for contacts/threads: { 'Rivera': 'Riv <3' }. Real names stay the
    // storage/generation keys; renames are presentation-only.
    contactRenames: { Loona: '[REDACTED]' },
    // Housing map: also show community characters from registrar.weybooru.com (?registrar=true).
    housingRegistrarEnabled: false,
    // Experimental round-trip roleplay texting. Both switches default off so updating never
    // changes an existing user's roleplay transcript or prompt without explicit opt-in.
    bidirectionalTetheringEnabled: false,
    captureRoleplayTextsEnabled: false,
    // How many recent Linked-thread texts ride along as roleplay context. Discrete slider stops:
    // 15 / 30 / 45 / 60, or 0 meaning "all un-summarized messages" (the pre-cap behavior). Bounds
    // the size of a mandatory injection that could otherwise blow the context limit. Default 30.
    tetherContextMessages: 30,
    // Bookmarked posts, per appKey — global (not per-chat) and never touched by sync, so a
    // re-sync overwriting the content caches can't take a saved post with it.
    savedPosts: {},
    // Contacts the user picked from their own lorebooks via Settings -> Community Contacts (see
    // lib/communityLorebook.js). { name, lorebookName, addedAt }[]. Messaging one is resolved
    // live against lorebookName every time, the same as a Registrar contact — no separate
    // "is this still valid" bookkeeping needed here.
    communityContacts: [],
    // onboarded flips to true when the first-open intro cards are completed ("Let's go").
    // batteryTracker maps the battery icon to remaining HelixMind daily messages. Defaults on —
    // the real percentage is the expected out-of-the-box behavior; the toggle exists for anyone
    // without a HelixMind key (it falls back to the theatrical drain automatically anyway) or
    // who prefers the drain animation.
    ui: {
        wallpaper: 'default',
        wallpaperPositionX: 50,
        wallpaperPositionY: 50,
        wallpaperDim: 20,
        wallpaperLightWash: 0,
        onboarded: false,
        batteryTracker: true,
    },
});

/**
 * The Aethel dedicated app shipped in the original fan build was removed when WeyPhone became
 * first-party (Aethel is an unreleased character). Deletes any conversations that belonged to it.
 * Idempotent — a settings object with no Aethel conversations passes through untouched.
 * @param {{conversations: Record<string, {charName?: string, isDedicatedApp?: string}>}} settings
 */
export function migrateRemoveAethel(settings) {
    for (const [id, conversation] of Object.entries(settings.conversations)) {
        if (conversation?.isDedicatedApp === 'aethel' || conversation?.charName === 'Aethel') {
            delete settings.conversations[id];
        }
    }
    // A cast-directory cache fetched before parseCastData learned to filter her can still
    // carry an Aethel entry for up to 24h — scrub it here too.
    const entries = settings.castDirectory?.entries;
    if (Array.isArray(entries) && entries.some(e => e?.name === 'Aethel')) {
        settings.castDirectory.entries = entries.filter(e => e?.name !== 'Aethel');
    }
}

/**
 * Renames cached flavor-app keys from the original fan build's real-world app names to the
 * first-party in-world keys, preserving users' last-generated content across the rebrand.
 * Idempotent; never clobbers an existing new-key entry.
 * @param {{phoneApps: Record<string, Record<string, unknown>>}} settings
 */
export function migratePhoneAppKeys(settings) {
    const renames = { twitter: 'feed', discord: 'chat', yikyak: 'board' };
    for (const perChat of Object.values(settings.phoneApps)) {
        if (!perChat || typeof perChat !== 'object') continue;
        for (const [oldKey, newKey] of Object.entries(renames)) {
            if (oldKey in perChat) {
                if (!(newKey in perChat)) perChat[newKey] = perChat[oldKey];
                delete perChat[oldKey];
            }
        }
        // Composite per-character profile caches: 'twitter:profile:<Name>' → 'feed:profile:<Name>'
        for (const key of Object.keys(perChat)) {
            if (key.startsWith('twitter:profile:')) {
                const newKey = `feed:profile:${key.slice('twitter:profile:'.length)}`;
                if (!(newKey in perChat)) perChat[newKey] = perChat[key];
                delete perChat[key];
            }
        }
    }
}

/**
 * Returns the live WeyPhone settings object embedded in `extensionSettings`,
 * creating it (and backfilling any keys added to defaultSettings later) as needed.
 * Also migrates any milestone-1-era conversations (keyed by character name, no `id`) into the
 * current ID-keyed shape — see storage.js's migrateLegacyConversations for details.
 * @param {Record<string, any>} extensionSettings SillyTavern's context.extensionSettings
 */
export function getSettings(extensionSettings) {
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    const settings = extensionSettings[MODULE_NAME];
    // PawXai originally shipped with three prompts and no palette key. That precise legacy shape
    // can safely take the new five-prompt default without overriding a later user choice.
    const needsPawXaiFivePromptMigration = settings.pawxai && typeof settings.pawxai === 'object'
        && !('palette' in settings.pawxai) && settings.pawxai.promptCount === 3;
    // Before the model controls were split, modelOverride drove both Sync and texting. Preserve
    // that choice for existing installs instead of unexpectedly moving their DMs to a new model.
    const needsTextingModelMigration = !('textingModelOverride' in settings);
    for (const key of Object.keys(defaultSettings)) {
        if (!(key in settings)) {
            settings[key] = structuredClone(defaultSettings[key]);
        }
    }
    if (needsTextingModelMigration && typeof settings.modelOverride === 'string') {
        settings.textingModelOverride = settings.modelOverride;
    }
    // The top-level backfill cannot see fields added inside `ui`. Fill those individually so old
    // installs keep their wallpaper, onboarding flag, notes, and clock preferences.
    if (!settings.ui || typeof settings.ui !== 'object' || Array.isArray(settings.ui)) settings.ui = {};
    for (const [key, value] of Object.entries(defaultSettings.ui)) {
        if (!(key in settings.ui)) settings.ui[key] = structuredClone(value);
    }
    if (!settings.pawxai || typeof settings.pawxai !== 'object' || Array.isArray(settings.pawxai)) settings.pawxai = {};
    for (const [key, value] of Object.entries(defaultSettings.pawxai)) {
        if (!(key in settings.pawxai)) settings.pawxai[key] = structuredClone(value);
    }
    if (needsPawXaiFivePromptMigration) settings.pawxai.promptCount = 5;
    if (!settings.contactRenames || typeof settings.contactRenames !== 'object' || Array.isArray(settings.contactRenames)) {
        settings.contactRenames = {};
    }
    for (const [key, value] of Object.entries(defaultSettings.contactRenames)) {
        if (!(key in settings.contactRenames)) settings.contactRenames[key] = value;
    }
    migrateLegacyConversations(settings);
    migrateMemoryFields(settings);
    migrateTetheredFields(settings);
    migrateContactHistoryFields(settings);
    migrateStaleModelNames(settings);
    migrateRemoveAethel(settings);
    migratePhoneAppKeys(settings);
    return settings;
}

/**
 * Restores WeyPhone to a factory-fresh settings clone. Mutating the live object in place keeps
 * every UI holder of that object on the reset data rather than leaving detached stale references.
 * Callers must prevent formatting while a generation is active.
 * @param {Record<string, any>} extensionSettings SillyTavern's context.extensionSettings
 */
export function resetSettings(extensionSettings) {
    const fresh = structuredClone(defaultSettings);
    const current = extensionSettings[MODULE_NAME];
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
        extensionSettings[MODULE_NAME] = fresh;
        return fresh;
    }
    for (const key of Object.keys(current)) delete current[key];
    Object.assign(current, fresh);
    return current;
}
