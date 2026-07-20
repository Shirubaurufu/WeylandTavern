import { MODULE_NAME, getSettings, resetSettings } from './lib/config.js';
import { getRequestHeaders } from '../../../script.js';
import { resolveMasterPrompt, resolvePostHistoryInstructions, resolvePersonalityText, applySpecialCase } from './lib/promptResolution.js';
import { buildPhoneWorldInfoScanHistory, findLorebookCharacterEntry, resolveLorebookContactProfile, resolveWorldInfoTethered, resolveWorldInfoUntethered } from './lib/worldInfo.js';
import { createConversation, getConversation, appendMessage, editMessage, deleteMessage, deleteMessages, deleteConversation, getAllConversationSummaries, genTimestamp, discardTrailingReply, createMemory, editMemory, deleteMemory, setMemoryPinned, getPinnedMemories, setMemorySettings, countExchangesSince, getMemoryWindow, getLastGeneratedMemory, setTetheredSettings, setContactHistorySettings, findOrCreateDedicatedAppConversation, getThreadsFor } from './lib/storage.js';
import { buildSystemPrompt, buildGroupSystemPrompt, buildMessages, resolveProfileId, resolveModelOverride, sendMessage, reconstructHistoryAsPhoneFormat, applyMacroSubstitution, joinNonEmptySections, extractResponseText } from './lib/generation.js';
import { createPanelMarkup, renderHousingScreen, renderMessagesScreen, renderContactsScreen, renderGroupComposeScreen, renderConversationScreen, renderThreadDetailsScreen, renderMessages, renderPanelAvatar, setRegenerateMenuItemsEnabled, renderMemoryScreen, populateConnectionProfileOptions, setRoleplayModePickerState, renderPhoneAppScreen, renderTwitterFollowingScreen, renderTwitterProfileScreen, renderTwitterFeedScreen, renderSavedPostsScreen } from './lib/panel.js';
import { formatRelativeTime, formatClockTime } from './lib/formatTime.js';
import { withTypingState } from './lib/generationTracking.js';
import { buildPortraitMap, buildPsaPortraitMap } from './lib/portraits.js';
import { mergeInstalledContacts } from './lib/installedContacts.js';
import { characterNamesEquivalent, displayCharacterName, findInstalledCharacterName } from './lib/characterIdentity.js';
import { parseReply, parseGroupReply } from './lib/messageParsing.js';
import { TEXTING_MODE_INSTRUCTIONS, TEXTING_THOUGHTS_DISABLED } from './lib/textingModeInstructions.js';
import { FIRST_CONTACT_BLOCK } from './lib/firstContact.js';
import { isKnownByDefault } from './lib/knownContacts.js';
import { buildMemoryGenerationMessages, joinMemoriesForInjection, sendMemoryRequest } from './lib/memoryGeneration.js';
import { isMainRoleplayActive, resolveMainActiveLtmEntries, resolveMainHistorySlice, formatMainHistoryTranscript, buildTetheredViewBlock, convertMainChatToMessages, buildScanHistoryWithExtraText, KRESSA_ROLEPLAY_COMPANION_INSTRUCTIONS } from './lib/tetheredContext.js';
import { getPhoneAppContent, setPhoneAppContent } from './lib/phoneApps.js';
import { toggleLike } from './lib/twitterLikes.js';
import { parseTwitterPosts } from './lib/twitterParsing.js';
import { PSA_ACCOUNTS } from './lib/twitterPrompts.js';
import { WEYLAND_ROSTER } from './lib/weylandRoster.js';
import { buildTwitterPrompt } from './lib/twitterPrompts.js';
import { buildUnifiedPrompt, UNIFIED_REFRESH_MAX_TOKENS } from './lib/unifiedPrompt.js';
import { parseUnifiedRefresh } from './lib/unifiedParsing.js';
import { APP_REGISTRY, getApp, getSyncApps, resolveAppLabel, emptyStateCopy } from './lib/appRegistry.js';
import { recordSyncNotifications, recordMessageNotification, getNotifications, getUnreadCounts, markNotificationRead, markAppNotificationsRead, clearNotifications } from './lib/notifications.js';
import { copyTextToClipboard } from './lib/clipboard.js';
import { initialBatteryLevel, batteryLevel, trackerBatteryLevel, describeBatteryMode } from './lib/battery.js';
import { refreshRemainingMessages, getQuotaSnapshot } from './lib/helixQuota.js';
import { PHONE_REQUEST_MAX_INPUT_TOKENS, limitPhoneRequestMessages } from './lib/requestBudget.js';
import { renderStatusBar } from './lib/ui/statusBar.js';
import { renderLockScreen } from './lib/ui/lockScreen.js';
import { renderShade } from './lib/ui/shade.js';
import { renderHomeScreen } from './lib/ui/homeScreen.js';
import { getCastEntries, searchCast } from './lib/castDirectory.js';
import { renderContactsAppScreen, renderContactDetailScreen } from './lib/ui/apps/contacts.js';
import { initialState as calcInitialState, reduceKeypress } from './lib/calculatorEngine.js';
import { renderCalculatorScreen, renderCalculatorSettingsScreen, updateCalculatorDisplay } from './lib/ui/apps/calculator.js';
import { createNote, getNotes, getNote, updateNote, deleteNote } from './lib/notesStorage.js';
import { renderNotesScreen, renderNoteEditorScreen } from './lib/ui/apps/notes.js';
import { renderAppNamesScreen, renderCharacterWallpapersScreen, renderSettingsScreen, WALLPAPER_PRESETS } from './lib/ui/apps/settings.js';
import { pushLogLine, getLogLines, clearLogLines } from './lib/debugLog.js';
import { createWeyPhoneBackup, parseWeyPhoneBackup, restoreWeyPhoneBackup } from './lib/settingsBackup.js';
import { findMostRecentRpTime } from './lib/rpClock.js';
import { getTier, appVisibleForTier } from './lib/tier.js';
import { KRESSA_PALETTES, renderKressaSettingsScreen } from './lib/ui/apps/kressaSettings.js';
import { renderPawXaiScreen } from './lib/ui/apps/pawxai.js';
import { PAWXAI_PALETTES, buildPawXaiMessages, deletePawXaiPrompt, findPawXaiSceneContext, normalizePawXaiSettings, parsePawXaiResponse, pawXaiSuffixEnabled, savePawXaiPrompt, togglePawXaiSuffix } from './lib/pawxai.js';
import { renderOnboarding, clampOnboardingPage, ONBOARDING_PAGES } from './lib/ui/onboarding.js';
import { renderAppHelpDialog, renderNoticeDialog } from './lib/ui/appHelp.js';
import { findRegistrarBookNames, loadRegistrarLorebooks, registrarRosterEntry, sampleRegistrarRoster } from './lib/registrarLorebook.js';
import { toggleSaved, unsave, getSaved, savedIdSet } from './lib/savedPosts.js';
import { buildShareBlock, buildShareTitle } from './lib/shareContext.js';
import { saveShareAsLtmEntry } from './lib/ltmShare.js';
import { applyMienExpression, loadMienGallery, resolveMienCharacter, selectMienOutfit } from './lib/mien.js';
import { renderMienScreen } from './lib/ui/apps/mien.js';
import { buildTetherInjectionPlan, canCapturePhoneScopeIntoConversation, dedupeCapturedMessages, initialRoleplayModeForPhoneScope, locatePhoneScopes, reconcileTetherPrompts, routePhoneScope, sameParticipants } from './lib/roleplayTether.js';
import { getRoleplayMode, isConversationLinkedToChat, ROLEPLAY_MODES } from './lib/roleplayMode.js';
import { buildContactContextBlock, buildGroupContactContextBlock, buildPersonaContextBlock, resolveContactContext } from './lib/contactContext.js';
import { applySettingsPatch, createSettingsPatch, mergeWeyPhoneSettings, replaceSettingsInPlace, settingsChangedDuringRefresh } from './lib/settingsSync.js';
import { ravs } from '../quick-reply-ext/src/rav.js';
import { charPer } from '../quick-reply-ext/src/charper.js';
import { world_names } from '../../world-info.js';
import { applyPhoneHardModePolicy } from './lib/phonePromptPolicy.js';
import { isGeneralMessagingContact } from './lib/contactVisibility.js';
import { formatGenerationCooldown, generationAllowance, generationRateTier, recordGenerationRequest } from './lib/generationRateLimit.js';

// One of the 10 data-view values showScreen() sets on #wp-panel:
// 'home' | 'contacts' | 'conversation' | 'memory' | 'messages' | 'threads' | 'phone-app' |
// 'twitter-feed' | 'twitter-following' | 'twitter-profile'
let currentView = 'home';
let currentConversationId = null;
let currentPhoneApp = null; // 'chronicle' | 'chat' | 'board' | null
let currentSavedAppKey = null; // which app's saved-posts screen is open: 'feed' | 'chronicle' | 'chat' | 'board'
let currentTwitterProfileCharacter = null;
let currentThreadsFilter = null; // charName string — set when entering the 'threads' view
let currentThreadsAppKey = null; // dedicated-app identity retained while its thread picker is open
let contactsQuery = ''; // live search text in the Contacts app
let groupSelectionNames = [];
let groupDraftTitle = '';
let currentContactName = null; // cast entry name — set when entering 'contact-detail'
let calcState = calcInitialState(); // session-only, like a real calculator
let currentNoteId = null; // set when entering 'note-editor'
let currentPawXaiTab = 'generate';
let currentPawXaiSavedCharacter = null;
let pawxaiGenerating = false;
let currentMienGallery = null;
let currentMienIndex = 0;
let mienLoading = false;
let mienApplying = false;
let mienError = '';
let mienAppliedLabel = '';
let mienLoadToken = 0;
let mienFullscreen = false;
let tetherPromptKeys = new Set();
const phoneAppGeneratingIds = new Set(); // tracks which app keys currently have a generation in flight
// Per-profile drill-down generations only (the unified sync has its own 4096 budget).
const DEFAULT_PHONE_APP_MAX_TOKENS = 1024;
const DEFAULT_PAWXAI_MAX_TOKENS = 4096;

// Phone-shell UI state — pure theater plus a couple of real switches. Session-scoped, resets on
// reload. `locked` starts true so opening the phone always lands on the lock screen.
const phoneState = {
    locked: true,
    dimmed: false,
    shadeOpen: false,
    airplane: false, // real: disables every generation entry point
    dnd: false,      // real: mutes WeyPhone's info/warning toasts (errors still surface)
    sessionStart: Date.now(),
    batteryStart: initialBatteryLevel(),
};

// dnd-aware toast helper for WeyPhone's own chatter. Errors always get through.
function wpToast(kind, message, title = 'WeyPhone') {
    if (phoneState.dnd && kind !== 'error') return;
    toastr[kind](message, title);
}

function currentGenerationAllowance(context, settings, now = Date.now()) {
    return generationAllowance(settings.generationRateLimitEvents, generationRateTier(context), now);
}

function updateHeaderGenerationCounter(context, settings, visible = false) {
    const counter = document.getElementById('wp-header-rate-counter');
    if (!counter) return;
    const allowance = currentGenerationAllowance(context, settings);
    const show = visible && Number.isFinite(allowance.remaining);
    counter.textContent = show ? `${allowance.remaining}/${allowance.maxRequests}` : '';
    counter.classList.toggle('wp-visible', show);
}

function showGenerationCooldown(allowance) {
    wpToast(
        'info',
        `Try again in ${formatGenerationCooldown(allowance.retryAfterMs)}. ${allowance.label} allows ${allowance.maxRequests} generations every ${Math.round(allowance.windowMs / 60_000)} minutes.`,
        'Generation cooldown',
    );
}
let editingMessageIndex = -1;
let editingMemoryId = null;
let selectMode = false;
const selectedMessageIndices = new Set();
const generatingConversationIds = new Set();
// Separate, deliberately invisible tracking for the background memory-summarization job — never
// touches generatingConversationIds, never shows a typing indicator, never disables Regenerate.
const memoryGeneratingConversationIds = new Set();
let onboardingPage = 0;

// SillyTavern persists one complete settings snapshot. When the same account is open on a phone
// and desktop at once, a stale tab can therefore overwrite newer WeyPhone state. Keep a baseline
// for this tab, fetch the newest server snapshot before each write, and replay only the paths this
// tab changed. Notes/context typing still feels instant because writes are coalesced for 650 ms.
const WEYPHONE_SAVE_DELAY_MS = 650;
const SETTINGS_API_TIMEOUT_MS = 10_000;
let settingsSyncBaseline = null;
let settingsSaveTimer = null;
let settingsSaveChain = Promise.resolve();
let settingsSaveRetryCount = 0;
let settingsRefreshInFlight = null;

function initializeSettingsSync(settings) {
    settingsSyncBaseline = structuredClone(settings);
}

async function fetchSettingsApi(url, options) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), SETTINGS_API_TIMEOUT_MS) : null;
    try {
        return await fetch(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

async function readServerSettings() {
    const response = await fetchSettingsApi('/api/settings/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
        cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`Could not read current settings (${response.status}).`);
    const payload = await response.json();
    if (typeof payload?.settings !== 'string') throw new Error('The server returned an unfamiliar settings payload.');
    const settings = JSON.parse(payload.settings);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        throw new Error('The server settings payload is invalid.');
    }
    return settings;
}

async function writeServerSettings(settings) {
    const response = await fetchSettingsApi('/api/settings/save', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(settings),
        cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`Could not save WeyPhone settings (${response.status}).`);
}

function queueWeyPhoneSave(context = SillyTavern.getContext(), { delay = WEYPHONE_SAVE_DELAY_MS, retry = false } = {}) {
    if (!retry) settingsSaveRetryCount = 0;
    if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
    settingsSaveTimer = setTimeout(() => {
        settingsSaveTimer = null;
        settingsSaveChain = settingsSaveChain
            .catch(error => console.warn('[WeyPhone] Recovered from an interrupted save chain:', error))
            .then(() => flushWeyPhoneSettings(context));
    }, delay);
}

async function flushWeyPhoneSettings(context = SillyTavern.getContext()) {
    const live = getSettings(context.extensionSettings);
    if (!settingsSyncBaseline) initializeSettingsSync(live);
    const base = structuredClone(settingsSyncBaseline);
    const localSnapshot = structuredClone(live);
    const localPatch = createSettingsPatch(base, localSnapshot);
    if (!localPatch.length) return true;

    try {
        const serverSettings = await readServerSettings();
        if (!serverSettings.extension_settings || typeof serverSettings.extension_settings !== 'object') {
            serverSettings.extension_settings = {};
        }
        const remote = serverSettings.extension_settings[MODULE_NAME];
        const merged = mergeWeyPhoneSettings(base, localSnapshot,
            remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : base);
        serverSettings.extension_settings[MODULE_NAME] = merged;
        await writeServerSettings(serverSettings);

        // User input may have arrived while the two network requests were in flight. Preserve it
        // locally, mark the just-written merge as the new baseline, and schedule one more save.
        const latePatch = createSettingsPatch(localSnapshot, structuredClone(live));
        const liveAfterMerge = applySettingsPatch(merged, latePatch);
        replaceSettingsInPlace(live, liveAfterMerge);
        settingsSyncBaseline = structuredClone(merged);
        settingsSaveRetryCount = 0;
        if (latePatch.length) queueWeyPhoneSave(context, { delay: WEYPHONE_SAVE_DELAY_MS });
        return true;
    } catch (error) {
        console.warn('[WeyPhone] Merge-safe settings save failed:', error);
        settingsSaveRetryCount++;
        if (settingsSaveRetryCount <= 3) {
            queueWeyPhoneSave(context, { delay: settingsSaveRetryCount * 1500, retry: true });
        } else {
            toastr.error('WeyPhone could not save. Keep this tab open and check the server connection.', 'WeyPhone');
        }
        return false;
    }
}

async function refreshWeyPhoneSettings(context = SillyTavern.getContext()) {
    if (settingsRefreshInFlight) return settingsRefreshInFlight;
    settingsRefreshInFlight = (async () => {
        const live = getSettings(context.extensionSettings);
        if (!settingsSyncBaseline) initializeSettingsSync(live);
        const baselineAtRequestStart = structuredClone(settingsSyncBaseline);
        // Never pull over unsaved local work. Its merge-safe flush will read the same newest copy.
        if (createSettingsPatch(settingsSyncBaseline, live).length) {
            queueWeyPhoneSave(context, { delay: 0 });
            return false;
        }
        try {
            const serverSettings = await readServerSettings();
            const remote = serverSettings.extension_settings?.[MODULE_NAME];
            if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return false;
            // Lucy can finish generating, a mode can change, or a queued save can complete while
            // readServerSettings is awaiting the network. Applying the response captured before
            // that event would erase the reply and snap the mode back. Discard that stale read;
            // the normal merge-safe writer will reconcile the newer local state instead.
            if (settingsChangedDuringRefresh(baselineAtRequestStart, settingsSyncBaseline, live)) {
                if (createSettingsPatch(settingsSyncBaseline, live).length) {
                    queueWeyPhoneSave(context, { delay: 0 });
                }
                return false;
            }
            const changed = createSettingsPatch(live, remote).length > 0;
            if (!changed) return false;
            replaceSettingsInPlace(live, remote);
            // Apply migrations/default backfills after accepting the newer remote snapshot. Treat
            // those normalizations as local changes so older backups are upgraded on the server.
            settingsSyncBaseline = structuredClone(remote);
            const normalized = getSettings(context.extensionSettings);
            if (createSettingsPatch(settingsSyncBaseline, normalized).length) queueWeyPhoneSave(context);
            return true;
        } catch (error) {
            console.warn('[WeyPhone] Could not refresh settings from the server:', error);
            return false;
        }
    })().finally(() => { settingsRefreshInFlight = null; });
    return settingsRefreshInFlight;
}

const contactLorebookState = {
    signature: '',
    ready: false,
    loading: null,
    officialBook: null,
    registrarBooks: new Map(),
    registrarContacts: [],
};

function contactLorebookSignature() {
    return ['Weyland', ...findRegistrarBookNames(world_names)].join('|');
}

function contactLorebooksAreReady() {
    return contactLorebookState.ready && contactLorebookState.signature === contactLorebookSignature();
}

async function ensureContactLorebooks(context) {
    const signature = contactLorebookSignature();
    if (contactLorebookState.ready && contactLorebookState.signature === signature) return contactLorebookState;
    if (contactLorebookState.loading && contactLorebookState.signature === signature) return contactLorebookState.loading;

    contactLorebookState.signature = signature;
    contactLorebookState.ready = false;
    contactLorebookState.loading = (async () => {
        let officialBook = null;
        try {
            officialBook = await context.loadWorldInfo('Weyland');
        } catch (error) {
            console.warn('[WeyPhone] Could not read the Weyland lorebook for Contacts:', error);
        }
        const registrar = await loadRegistrarLorebooks({ worldNames: world_names, loadWorldInfo: context.loadWorldInfo });
        if (contactLorebookState.signature === signature) {
            contactLorebookState.officialBook = officialBook;
            contactLorebookState.registrarBooks = registrar.books;
            contactLorebookState.registrarContacts = registrar.contacts;
            contactLorebookState.ready = true;
        }
        return contactLorebookState;
    })().finally(() => {
        if (contactLorebookState.signature === signature) contactLorebookState.loading = null;
    });
    return contactLorebookState.loading;
}

function showOnboardingFromStart() {
    const onboardingEl = document.getElementById('wp-onboarding');
    if (!onboardingEl) return;
    onboardingPage = 0;
    renderOnboarding(onboardingEl, { pageIndex: onboardingPage });
    onboardingEl.style.display = 'flex';
}

function maybeShowOnboarding() {
    const settings = getSettings(SillyTavern.getContext().extensionSettings);
    if (!settings.ui?.onboarded) showOnboardingFromStart();
}

// WeyPhone has no user-facing max-tokens setting yet (milestone 1), so this is a fixed default
// passed to ConnectionManagerRequestService.sendRequest's required maxTokens argument. 1024 is
// still just a placeholder chosen to avoid visibly truncating conversational replies mid-
// sentence — not a final tuned value; replace once a real user-facing setting exists.
const DEFAULT_MAX_TOKENS = 1024;
// Memory entries are meant to be short (2-4 sentences) — a much smaller cap than regular replies.
const DEFAULT_MEMORY_MAX_TOKENS = 256;

/**
 * Resolves the character record generateReply/generateMemory need for a WeyPhone conversation —
 * a plain context.characters lookup by name.
 * @param {{characters: Array<{name: string}>}} context
 * @param {string} charName
 * @returns {{name: string, avatar: string|null} | undefined}
 */
function resolveConversationCharacter(context, charName) {
    const installedName = findInstalledCharacterName(context.characters, charName);
    return installedName ? context.characters.find(character => character.name === installedName) : undefined;
}

function log(...args) {
    // The Settings app's log viewer always gets the line (session ring buffer); the console only
    // sees it when debug is on.
    pushLogLine(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    if (settings.debug) {
        console.debug(`[${MODULE_NAME}]`, ...args);
    }
}

/**
 * Presentation-only contact rename (Settings app): how this character's name displays on the
 * user's phone. Storage keys, generation, and the character's own identity are untouched.
 * @param {{contactRenames?: Record<string, string>}} settings
 * @param {string} charName
 */
function resolveContactName(settings, charName) {
    return settings.contactRenames?.[charName] || displayCharacterName(charName);
}

function setHeaderContactTarget(panel, contactName = '') {
    panel.dataset.headerContact = contactName;
    for (const element of [document.getElementById('wp-panel-avatar'), document.getElementById('wp-panel-title')]) {
        if (!element) continue;
        element.classList.toggle('wp-header-contact-link', Boolean(contactName));
        if (contactName) {
            element.setAttribute('role', 'button');
            element.setAttribute('tabindex', '0');
            element.setAttribute('title', 'Open contact');
        } else {
            element.removeAttribute('role');
            element.removeAttribute('tabindex');
            element.removeAttribute('title');
        }
    }
}

function resolveKressaPaletteId(settings) {
    return KRESSA_PALETTES.some(palette => palette.id === settings.kressaPalette)
        ? settings.kressaPalette
        : 'twilight';
}

function applyKressaPalette(panel, settings) {
    panel.dataset.kressaPalette = resolveKressaPaletteId(settings);
}

function resolvePawXaiPaletteId(settings) {
    return PAWXAI_PALETTES.some(palette => palette.id === settings.pawxai?.palette)
        ? settings.pawxai.palette
        : 'orchid-night';
}

function applyPawXaiPalette(panel, settings) {
    panel.dataset.pawxaiPalette = resolvePawXaiPaletteId(settings);
}

async function resolveCharacterPrompt(context, character, { lorebookContact = false, lorebookName = 'Weyland' } = {}) {
    const promptChoice = context.variables.global.get('PromptChoice') || 'Current Prompt';
    const ravEntry = resolveMasterPrompt(ravs, promptChoice);
    const htmlEnabled = context.variables.global.get('HTML!') === 'Enabled';
    const rpFocus = context.variables.global.get('RPFocus') || '';
    const postHistory = resolvePostHistoryInstructions(ravEntry, { htmlEnabled, rpFocus });

    let personalityText;
    if (lorebookContact) {
        const profile = await resolveLorebookContactProfile({
            loadWorldInfo: context.loadWorldInfo,
            charName: character.name,
            lorebookName,
        });
        if (!profile?.personalityText) {
            throw new Error(`No ${lorebookName} lorebook subbot entry found for "${character.name}".`);
        }
        personalityText = profile.personalityText;
    } else {
        const personalityConfig = charPer.get(character.name);
        if (!personalityConfig) {
            throw new Error(`No personality data found for "${character.name}" in charper.js`);
        }
        const basePersonality = resolvePersonalityText(personalityConfig);
        personalityText = applySpecialCase(character.name, basePersonality, {});
    }

    return {
        systemPrompt: ravEntry.teg,
        postHistory,
        personalityText,
        descriptionText: character.description ?? '',
    };
}

async function resolveWorldInfo(context, history, additionalBookNames = [], characterNames = [], characterContext = '') {
    const personaLorebookName = context.powerUserSettings?.persona_description_lorebook || '';
    return resolveWorldInfoUntethered({
        loadWorldInfo: context.loadWorldInfo,
        history,
        personaLorebookName,
        additionalBookNames,
        characterNames,
        characterContext,
    });
}

// Assembles the [TETHERED VIEW] block from the CURRENTLY active main roleplay, read live at
// generation time (no caching, no snapshot-on-toggle) — if the user switches which main chat is
// open between two WeyPhone sends, the next tethered reply reflects whatever is active NOW.
// Returns '' (not an error) whenever there's nothing to tether to, mirroring
// resolveMainActiveLtmEntries's own "no book bound yet" behavior — this function must never throw,
// since generateReply has no separate error path for "tethered assembly failed" vs "the whole
// reply failed."
async function buildTetheredContext(context, conversation) {
    if (getRoleplayMode(conversation) !== ROLEPLAY_MODES.OBSERVE) return '';
    if (!isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId })) return '';

    const worldInfo = await resolveWorldInfoTetheredForMainChat(context);

    const ltmSettings = context.extensionSettings['Weyland-LTM'];
    const lastLtmMessageId = ltmSettings?.__chatState?.[context.chatId]?.lastLtmMessageId ?? -1;
    const ltmEntries = await resolveMainActiveLtmEntries({
        loadWorldInfo: context.loadWorldInfo,
        chatMetadata: context.chatMetadata,
        chatId: context.chatId,
    });

    const historySlice = resolveMainHistorySlice({
        chat: context.chat,
        lastLtmMessageId,
        historyCap: conversation.tetheredHistoryCap,
    });
    const historyTranscript = formatMainHistoryTranscript(historySlice);

    return buildTetheredViewBlock({ worldInfoText: worldInfo, ltmEntries, historyTranscript });
}

// Scans World Info against the MAIN chat's own history (not WeyPhone's texting history) — this is
// the one-line fix to what tethered mode has actually meant since milestone 1: it already used
// the real getWorldInfoPrompt engine, but scanned it against the wrong conversation.
//
// Passes context.chatMetadata through to resolveWorldInfoTethered so it can snapshot/restore
// chatMetadata.timedWorldInfo tightly around the scan — see lib/worldInfo.js for why this is
// needed: a real (non-dry-run) WI scan against a synthetic history still writes real sticky/
// cooldown bookkeeping onto the shared main-chat chatMetadata object.
//
// `extraScanText` (Task 9) is optional extra text — e.g. a phone app's own fixed prompt text —
// appended as one more synthetic entry to a brand-new scan array via
// buildScanHistoryWithExtraText, so it gets a chance to trigger real WI retrieval alongside the
// real chat history, exactly mirroring how the real !Phone command's own fixed prompt text
// already does this. Never mutates mainHistory or context.chat — see buildScanHistoryWithExtraText.
async function resolveWorldInfoTetheredForMainChat(context, extraScanText) {
    try {
        const mainHistory = convertMainChatToMessages(context.chat);
        const scanHistory = limitPhoneRequestMessages(buildScanHistoryWithExtraText(mainHistory, extraScanText));
        const result = await resolveWorldInfoTethered({
            getWorldInfoPrompt: context.getWorldInfoPrompt,
            history: scanHistory,
            maxContext: Math.min(context.maxContext ?? PHONE_REQUEST_MAX_INPUT_TOKENS, PHONE_REQUEST_MAX_INPUT_TOKENS),
            chatMetadata: context.chatMetadata,
        });
        return [result.worldInfoBefore, result.worldInfoAfter].filter(Boolean).join('\n\n');
    } catch {
        return '';
    }
}

function updateRegenerateEnabled(conversation) {
    const menu = document.getElementById('wp-regenerate-menu');
    if (!menu) return;
    const isGenerating = generatingConversationIds.has(currentConversationId);
    const messages = conversation.messages;
    // A conversation ending on an unanswered user message (e.g. the last generation attempt
    // failed before any reply was ever appended) has nothing for discardTrailingReply to trim,
    // but there's still a real, unanswered attempt worth retrying — handleRegenerate below
    // special-cases this same condition to skip straight to generateReply.
    const endsOnPendingUserMessage = messages.length > 0 && messages[messages.length - 1].role === 'user';
    let cutIndex = messages.length;
    while (cutIndex > 0 && messages[cutIndex - 1].role === 'assistant') cutIndex--;
    const hasTrailingReplyToDiscard = cutIndex > 0 && cutIndex < messages.length;
    const context = SillyTavern.getContext();
    const linkedToCurrentRoleplay = isConversationLinkedToChat(conversation, context.chatId);
    const hasRegeneratable = endsOnPendingUserMessage || hasTrailingReplyToDiscard;
    const canScrub = messages.some(message => !message.capturedFromRoleplay && !message.suppressedFromRoleplay);
    setRegenerateMenuItemsEnabled(menu, {
        canRegenerate: hasRegeneratable && !isGenerating && !linkedToCurrentRoleplay,
        hasMessages: messages.length > 0,
        linked: linkedToCurrentRoleplay,
        canScrub,
    });

    // Queuing and requesting are separate operations. The arrow remains the local "add this
    // bubble" action, while refresh becomes available only when a trailing user burst is waiting
    // for a reply. Both lock during generation to keep the request snapshot deterministic.
    const requestButton = document.getElementById('wp-request-reply-button');
    if (requestButton) {
        requestButton.disabled = linkedToCurrentRoleplay || isGenerating || !endsOnPendingUserMessage;
        requestButton.title = linkedToCurrentRoleplay
            ? 'Replies arrive through the main roleplay'
            : (isGenerating ? 'Waiting for reply…' : 'Request a WeyPhone-model reply');
        requestButton.innerHTML = linkedToCurrentRoleplay
            ? '<i class="fa-solid fa-link"></i>'
            : `<i class="fa-solid fa-rotate${isGenerating ? ' fa-spin' : ''}"></i>`;
    }
    const queueButton = document.getElementById('wp-send-button');
    if (queueButton) queueButton.disabled = isGenerating;
}

function getSelectState() {
    return { active: selectMode, selectedIndices: selectedMessageIndices };
}

function rerenderConversationMessages() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, currentConversationId);
    if (!conversation) return;
    const isTyping = generatingConversationIds.has(currentConversationId);
    renderMessages(document.getElementById('wp-messages'), conversation.messages, editingMessageIndex, isTyping, getSelectState(), (conversation.participants?.length ?? 1) > 1);
    updateRegenerateEnabled(conversation);
}

// Re-renders the conversation view for `conversationId` only if the panel is still showing that
// exact conversation. Callers invoke this after an await (e.g. generateReply's own generation
// wait), by which point the user may have navigated away or deleted the conversation — so
// #wp-messages may no longer exist, or may belong to a different conversation entirely. Both cases
// are guarded here, making this a no-op rather than rendering into the wrong screen.
function rerenderIfStillViewing(conversationId, messages) {
    if (currentView !== 'conversation' || currentConversationId !== conversationId) return;
    const messagesEl = document.getElementById('wp-messages');
    if (!messagesEl) return;
    const isTyping = generatingConversationIds.has(conversationId);
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, conversationId);
    renderMessages(messagesEl, messages, editingMessageIndex, isTyping, getSelectState(), (conversation?.participants?.length ?? 1) > 1);
    if (conversation) updateRegenerateEnabled(conversation);
}

function isGlobalHardModeEnabled(context) {
    return String(context.variables.global.get('HardToggle') ?? '').trim().toLowerCase() === 'on';
}

function recordIncomingDmNotification(context, settings, conversationId, conversation, incomingMessages) {
    if (currentView === 'conversation' && currentConversationId === conversationId) return false;
    const latest = [...incomingMessages].reverse().find(message => message?.role === 'assistant' && message.content);
    if (!latest) return false;
    const title = conversation.displayName
        || ((conversation.participants?.length ?? 1) > 1
            ? conversation.participants.join(', ')
            : (latest.speaker || conversation.charName || 'New message'));
    recordMessageNotification(settings, context.chatId, { title, text: latest.content, conversationId });
    if (currentView === 'home') showScreen('home');
    renderShadeNow();
    renderLockScreenNow();
    return true;
}

// Toggles between the normal #wp-input-row and the #wp-select-actions bar, and (while active)
// keeps the selected-count label and Delete button's disabled state in sync. Called after every
// selection change and on entering/exiting select mode.
function updateSelectModeUI() {
    const inputRow = document.getElementById('wp-input-row');
    const selectActions = document.getElementById('wp-select-actions');
    if (inputRow) inputRow.hidden = selectMode;
    if (selectActions) selectActions.hidden = !selectMode;
    if (selectMode) {
        const countEl = document.getElementById('wp-select-count');
        const deleteBtn = document.getElementById('wp-select-delete');
        if (countEl) countEl.textContent = `${selectedMessageIndices.size} selected`;
        if (deleteBtn) deleteBtn.disabled = selectedMessageIndices.size === 0;
    }
    rerenderConversationMessages();
}

// Shared by showScreen('messages') and refreshVisibleScreen()'s messages branch — builds the
// conversation list's typing-decorated summaries and charName->portrait map, then renders.
function renderMessagesScreenNow(context, settings) {
    const screenBody = document.getElementById('wp-screen-body');
    if (!screenBody) return;
    const summaries = withTypingState(getAllConversationSummaries(settings)
        .filter(summary => !summary.roleplayTether || summary.roleplayChatId === context.chatId), generatingConversationIds)
        .map(summary => ({
            ...summary,
            displayName: summary.displayName || (summary.participants?.length > 1
                ? summary.participants.join(', ')
                : resolveContactName(settings, summary.charName)),
        }));
    const charNames = summaries.map(summary => summary.charName);
    const portraitMap = buildPortraitMap(context.characters, charNames, context.getThumbnailUrl);
    for (const summary of summaries) {
        if ((summary.participants?.length ?? 1) > 1) portraitMap[summary.charName] = { group: true };
    }
    renderMessagesScreen(screenBody, summaries, formatRelativeTime, portraitMap);
}

// Shared by showScreen('threads') and refreshVisibleScreen()'s threads branch — builds the filtered
// thread list's typing-decorated summaries and charName->portrait map, then renders. Returns the
// portraitMap (unlike renderMessagesScreenNow) so showScreen can reuse it for the panel avatar.
function renderThreadsScreenNow(context, settings) {
    const screenBody = document.getElementById('wp-screen-body');
    if (!screenBody) return null;
    const summaries = withTypingState(getThreadsFor(settings, currentThreadsFilter ?? ''), generatingConversationIds)
        .map(summary => ({ ...summary, displayName: resolveContactName(settings, summary.charName) }));
    const portraitMap = buildPortraitMap(context.characters, [currentThreadsFilter ?? ''], context.getThumbnailUrl);
    renderMessagesScreen(screenBody, summaries, formatRelativeTime, portraitMap);
    return portraitMap;
}

// Shared core of runUnifiedRefresh/runTwitterProfileGeneration — both run a flavor-content
// generation entirely read-only against the main roleplay's real context: no mutation of
// context.chat anywhere in this function or anything it calls (every context.chat access below is
// a READ). It builds a request from data it reads (character fields, World Info text, a NEW array
// from convertMainChatToMessages) and sends it via ConnectionManagerRequestService, the same path
// WeyPhone's own texting Messages app already uses.
//
// This read-only design deliberately replaces a prior milestone's push/quiet-generate/pop
// mechanism, which caused a real incident: a synthetic message got permanently saved to a user's
// real chat file when SillyTavern's own autosave fired mid-generation, before the pop could run.
// There is no live-array window to race here at all — context.chat itself is never touched.
//
// trackingSet.add()/rerender() MUST stay inside this try block — this project's established
// stuck-lock bug class (a tracking-Set mutation placed before try, leaking a stuck entry if
// anything before try throws) applies here exactly the same way it does to
// generatingConversationIds/memoryGeneratingConversationIds elsewhere in this file.
//
// Callers parameterize only what actually differs between the variants:
//   - trackingSet / trackingKey: the in-flight Set and its key.
//   - rerender(): re-renders the currently-visible screen this generation is for.
//   - buildPromptText(): returns the user-message/WI-scan prompt string, or null to abort silently
//     after the caller has already surfaced its own error toast (a profile's missing-roster case).
//   - commit(rawText, {context, settings}): parses the raw response and writes whatever caches /
//     notification records it produced. Returns true if anything usable was committed (triggers
//     the save), false to surface the generic "no usable content" warning.
//   - maxTokens: per-variant response budget.
//   - errorLabel: console.error label for the catch block.
async function runFlavorAppGeneration({ trackingSet, trackingKey, rerender, buildPromptText, commit, maxTokens, errorLabel }) {
    if (trackingSet.has(trackingKey)) return;
    if (phoneState.airplane) {
        wpToast('info', 'Airplane mode is on — no data connection.');
        return;
    }
    const context = SillyTavern.getContext();
    if (!isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId })) {
        wpToast('info', 'No active roleplay to pull content from right now.');
        return;
    }

    try {
        trackingSet.add(trackingKey);
        rerender();

        const settings = getSettings(context.extensionSettings);
        let allowance = currentGenerationAllowance(context, settings);
        if (!allowance.allowed) {
            showGenerationCooldown(allowance);
            return;
        }
        const mainCharacter = context.characters[context.characterId];
        if (!mainCharacter) {
            toastr.info('No active roleplay to pull content from right now.', 'WeyPhone');
            return;
        }

        const promptText = await buildPromptText({ context, settings });
        if (promptText === null) return; // buildPromptText already surfaced its own error toast

        const resolved = await resolveCharacterPrompt(context, mainCharacter);
        const worldInfoAfter = await resolveWorldInfoTetheredForMainChat(context, promptText);
        const mainHistory = convertMainChatToMessages(context.chat);

        const systemPromptText = buildSystemPrompt({
            systemPrompt: applyPhoneHardModePolicy(resolved.systemPrompt, {
                allowHardMode: Boolean(settings.phoneHardModeEnabled),
                hardModeEnabled: isGlobalHardModeEnabled(context),
            }),
            worldInfoBefore: '',
            descriptionText: resolved.descriptionText,
            personalityText: resolved.personalityText,
            scenarioText: '',
            worldInfoAfter,
        });

        const messages = buildMessages({
            systemPromptText,
            history: mainHistory,
            userMessage: promptText,
        });

        // Same real-macro resolution as generateReply's system prompt and generateMemory's
        // opening message — resolves {{user}}, {{getvar::...}}, etc. in both the system prompt
        // (which may carry macros via resolved.systemPrompt/personalityText) and the final user
        // message (promptText, which can embed real {{user}}/{{getvar::MCY-2}} tokens in its roster
        // content). Guarded against double-substituting the same string in the (not normally
        // reachable) case where buildMessages produced only one message total.
        const userName = context.name1 || 'User';
        messages[0].content = applyMacroSubstitution({
            substituteParams: context.substituteParams,
            content: messages[0].content,
            userName,
            charName: mainCharacter.name,
        });
        const lastMessage = messages[messages.length - 1];
        if (lastMessage !== messages[0]) {
            lastMessage.content = applyMacroSubstitution({
                substituteParams: context.substituteParams,
                content: lastMessage.content,
                userName,
                charName: mainCharacter.name,
            });
        }

        const activeProfileId = context.extensionSettings.connectionManager?.selectedProfile ?? '';
        const profileId = resolveProfileId(settings, activeProfileId);
        // Same model precedence as texting: explicit Settings-app model (default minimax-m3)
        // > live main-chat model > the profile's own snapshot.
        const flavorModel = resolveModelOverride({
            settingsModel: settings.modelOverride,
            liveModel: context.getChatCompletionModel?.(),
        });
        const flavorOverridePayload = flavorModel ? { model: flavorModel } : undefined;
        allowance = currentGenerationAllowance(context, settings);
        if (!allowance.allowed) {
            showGenerationCooldown(allowance);
            return;
        }
        const result = await sendMessage({
            sendRequest: (id, msgs) => context.ConnectionManagerRequestService.sendRequest(id, msgs, maxTokens, undefined, flavorOverridePayload),
            profileId,
            messages,
        });

        const rawText = extractResponseText(result);
        if (!commit(rawText, { context, settings })) {
            toastr.warning('The model did not return usable content this time.', 'WeyPhone');
            return;
        }
        // The cooldown counts usable output, not attempts. Provider failures, empty responses,
        // and responses the parser cannot commit therefore leave the allowance untouched.
        recordGenerationRequest(settings);
        queueWeyPhoneSave(context);
    } catch (error) {
        console.error(`[${MODULE_NAME}] ${errorLabel}:`, error);
        toastr.error(error.message, 'WeyPhone');
    } finally {
        trackingSet.delete(trackingKey);
        rerender();
    }
}

// The tracking key for the one-call sync — it fills every sync app at once, so the in-flight
// guard is a single shared key rather than per-app.
const UNIFIED_SYNC_KEY = 'unified-sync';

/**
 * The one-button, one-API-call refresh: a single generation produces content for every sync app
 * (Chronicle, Chitter, Discorgi, Yip Yap), split by parseUnifiedRefresh and written into the same
 * per-app caches the old per-app generations used. Users have a limited daily message budget —
 * this is deliberately the ONLY way flavor content regenerates (no per-app calls, no automatic
 * staleness regeneration).
 */
function runUnifiedRefresh() {
    let syncRoster = WEYLAND_ROSTER;
    return runFlavorAppGeneration({
        trackingSet: phoneAppGeneratingIds,
        trackingKey: UNIFIED_SYNC_KEY,
        rerender: () => rerenderAfterSync(),
        buildPromptText: async ({ context }) => {
            const directory = await ensureContactLorebooks(context);
            const importedRoster = directory.registrarContacts
                .filter(contact => contact.profileText)
                .map(registrarRosterEntry);
            const registrarGuests = sampleRegistrarRoster(importedRoster, 2);
            syncRoster = [...WEYLAND_ROSTER, ...registrarGuests];
            return buildUnifiedPrompt({ registrarRoster: registrarGuests });
        },
        maxTokens: UNIFIED_REFRESH_MAX_TOKENS,
        commit: (rawText, { context, settings }) => {
            const { apps, failures } = parseUnifiedRefresh(rawText, { roster: syncRoster, psaAccounts: PSA_ACCOUNTS });
            const appKeys = Object.keys(apps);
            if (appKeys.length === 0) return false;
            for (const appKey of appKeys) {
                setPhoneAppContent(settings, context.chatId, appKey, {
                    content: apps[appKey],
                    generatedAt: Date.now(),
                    chatMessageCountAtGeneration: context.chat.length,
                });
            }
            const appDefs = getSyncApps().map(app => ({ key: app.key, label: resolveAppLabel(settings, app.key) }));
            recordSyncNotifications(settings, context.chatId, apps, appDefs);
            if (failures.length > 0) {
                const failedLabels = failures.map(key => resolveAppLabel(settings, key)).join(', ');
                toastr.warning(`Sync partially succeeded — no usable content for: ${failedLabels}. Their previous content is untouched.`, 'WeyPhone');
            }
            return true;
        },
        errorLabel: 'Unified sync failed',
    });
}

function isSyncInFlight() {
    return phoneAppGeneratingIds.has(UNIFIED_SYNC_KEY);
}

// After a sync lands (or its in-flight state flips), whatever screen the user is looking at may
// display sync-app content — re-render the visible one, plus every always-on shell surface that
// shows notification state (shade list, home badges, lock-screen previews).
function rerenderAfterSync() {
    if (currentView === 'phone-app' && currentPhoneApp) {
        rerenderPhoneAppScreenIfVisible(currentPhoneApp);
    } else if (currentView === 'twitter-feed') {
        rerenderTwitterScreenIfVisible('feed');
    } else if (currentView === 'home') {
        showScreen('home');
    }
    renderShadeNow();
    renderLockScreenNow();
    if (currentView === 'home') return; // already re-rendered with fresh badges above
    // Home isn't visible; badges will be fresh next time it renders.
}

// Re-renders the currently-visible phone-app screen if the user is actually looking at the app
// this generation was for — mirrors rerenderIfStillViewing's guard for the same reason (the user
// may have navigated away during the generation wait).
function rerenderPhoneAppScreenIfVisible(appKey) {
    if (currentView !== 'phone-app' || currentPhoneApp !== appKey) return;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const screenBody = document.getElementById('wp-screen-body');
    if (!screenBody) return;
    const entry = getPhoneAppContent(settings, context.chatId, appKey);
    renderPhoneAppScreen(screenBody, {
        appKey,
        appLabel: resolveAppLabel(settings, appKey),
        emptyCopy: emptyStateCopy(appKey),
        entry,
        isGenerating: isSyncInFlight(),
        formatRelativeTime,
        savedIds: savedIdSet(settings, appKey),
        generationAllowance: currentGenerationAllowance(context, settings),
        formatCooldown: formatGenerationCooldown,
    });
}

// Composite cache keys — lib/phoneApps.js's getPhoneAppContent/setPhoneAppContent already take an
// opaque appKey string, so 'feed' (the main feed, written by the unified sync) and
// 'feed:profile:<Name>' (one per character, still its own on-demand generation) work with zero
// changes to that module. Each caches/goes-stale independently.
function twitterCacheKey(mode, characterName) {
    return mode === 'feed' ? 'feed' : `feed:profile:${characterName}`;
}

const twitterGeneratingKeys = new Set();

function getTwitterRoster() {
    const community = contactLorebookState.registrarContacts
        .filter(contact => contact.profileText)
        .map(registrarRosterEntry);
    const officialNames = new Set(WEYLAND_ROSTER.map(character => character.name.toLowerCase()));
    return [...WEYLAND_ROSTER, ...community.filter(character => !officialNames.has(character.name.toLowerCase()))];
}

// A Twitter profile's subject is either a roster character (Following list) or a PSA/business
// account (also on the Following list, as of the PSA-profile feature) — both are just {name,
// handle, ...} objects, so one name-keyed lookup across both lists covers either case.
function findTwitterProfileSubject(name) {
    return getTwitterRoster().find(c => c.name === name) ?? PSA_ACCOUNTS.find(a => a.name === name);
}

// Every PSA/business account portrait is a fixed local asset (see lib/portraits.js's
// buildPsaPortraitMap) — cheap to build in full every time rather than filtering to just the
// names actually in view, and this guarantees a PSA account's local asset always wins over any
// (wrong) weybooru-CDN guess buildPortraitMap would otherwise attempt for that same name.
function buildTwitterPortraitMap(context, charNames) {
    return { ...buildPortraitMap(context.characters, charNames, context.getThumbnailUrl), ...buildPsaPortraitMap(PSA_ACCOUNTS) };
}

/**
 * A single account's profile page — still its own on-demand generation (the unified sync only
 * fills the main feed; a profile drill-down is a deliberate user action on one subject, a roster
 * character or a PSA/business account). Shares runFlavorAppGeneration's read-only mechanism and
 * never-mutates-context.chat guarantee.
 * @param {string} subjectName
 */
function runTwitterProfileGeneration(subjectName) {
    const cacheKey = twitterCacheKey('profile', subjectName);
    return runFlavorAppGeneration({
        trackingSet: twitterGeneratingKeys,
        trackingKey: cacheKey,
        rerender: () => rerenderTwitterScreenIfVisible('profile', subjectName),
        buildPromptText: () => {
            const subject = findTwitterProfileSubject(subjectName);
            if (!subject) {
                toastr.error(`No account found for "${subjectName}".`, 'WeyPhone');
                return null;
            }
            const promptSubject = subject.registrar
                ? { ...subject, bio: [subject.bio, subject.profileText].filter(Boolean).join('\n\n') }
                : subject;
            return buildTwitterPrompt({ mode: 'profile', character: promptSubject });
        },
        maxTokens: DEFAULT_PHONE_APP_MAX_TOKENS,
        commit: (rawText, { context, settings }) => {
            const parsed = parseTwitterPosts(rawText, { roster: getTwitterRoster(), psaAccounts: PSA_ACCOUNTS });
            if (parsed.posts.length === 0) return false;
            setPhoneAppContent(settings, context.chatId, cacheKey, {
                content: parsed,
                generatedAt: Date.now(),
                chatMessageCountAtGeneration: context.chat.length,
            });
            return true;
        },
        errorLabel: 'Profile generation failed',
    });
}

function rerenderTwitterScreenIfVisible(mode, subjectName) {
    const expectedView = mode === 'feed' ? 'twitter-feed' : 'twitter-profile';
    if (currentView !== expectedView) return;
    if (mode === 'profile' && currentTwitterProfileCharacter !== subjectName) return;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const screenBody = document.getElementById('wp-screen-body');
    if (!screenBody) return;
    const cacheKey = twitterCacheKey(mode, subjectName);
    const entry = getPhoneAppContent(settings, context.chatId, cacheKey);
    // The main feed regenerates via the unified sync; profiles via their own on-demand call.
    const isGenerating = mode === 'feed' ? isSyncInFlight() : twitterGeneratingKeys.has(cacheKey);
    if (mode === 'feed') {
        const authorNames = (entry?.content?.posts ?? []).map(p => p.authorName);
        const portraitMap = buildTwitterPortraitMap(context, authorNames);
        renderTwitterFeedScreen(screenBody, {
            entry,
            isGenerating,
            formatRelativeTime,
            portraitMap,
            savedIds: savedIdSet(settings, 'feed'),
            generationAllowance: currentGenerationAllowance(context, settings),
            formatCooldown: formatGenerationCooldown,
        });
    } else {
        renderTwitterProfileScreen(screenBody, {
            character: findTwitterProfileSubject(subjectName),
            portraitMap: buildTwitterPortraitMap(context, [subjectName]),
            entry,
            isGenerating,
            formatRelativeTime,
            savedIds: savedIdSet(settings, 'feed'),
            generationAllowance: currentGenerationAllowance(context, settings),
            formatCooldown: formatGenerationCooldown,
        });
    }
}

// Re-renders whichever screen is currently visible, reflecting the latest generatingConversationIds
// state — called whenever that set changes (a generation starts, finishes, or errors). This is how
// a conversation's typing state updates live on the Home list even when a DIFFERENT conversation's
// generation is the one that just started/finished, and how the Conversation view picks up its own
// typing bubble without a full showScreen() reload.
function refreshVisibleScreen() {
    if (currentView === 'messages') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        renderMessagesScreenNow(context, settings);
        return;
    }
    if (currentView === 'threads') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        renderThreadsScreenNow(context, settings);
        return;
    }
    if (currentView === 'conversation' && currentConversationId) {
        rerenderConversationMessages();
    }
}

// Re-renders the Memory view (list + settings shell, repopulated) if it's currently visible —
// called after any memory CRUD action or settings change.
function rerenderMemoryScreen() {
    if (currentView !== 'memory' || !currentConversationId) return;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, currentConversationId);
    if (!conversation) return;
    const screenBody = document.getElementById('wp-screen-body');
    if (!screenBody) return;
    const isGenerating = memoryGeneratingConversationIds.has(currentConversationId);
    const hasPendingExchanges = getMemoryWindow(conversation).messages.length > 0;
    const hasGeneratedMemory = !!getLastGeneratedMemory(conversation);
    renderMemoryScreen(screenBody, conversation.memories || [], editingMemoryId, {
        isGenerating,
        canGenerateNow: hasPendingExchanges,
        canRegenerateLast: hasGeneratedMemory,
        tethered: conversation.tethered,
        tetheredHistoryCap: conversation.tetheredHistoryCap,
    });
    const profiles = context.ConnectionManagerRequestService.getSupportedProfiles();
    populateConnectionProfileOptions(document.getElementById('wp-memory-profile-select'), profiles, conversation.memoryConnectionProfileId || '');
    document.getElementById('wp-memory-threshold-input').value = conversation.memoryThreshold || 100;
    document.getElementById('wp-memory-primary-model-input').value = conversation.memoryPrimaryModel || '';
    document.getElementById('wp-memory-backup-model-input').value = conversation.memoryBackupModel || '';
}

// Background memory-summarization job. Silent (no toastr) when auto-triggered by generateReply's
// threshold check, per the design spec's original "no UI indicator" requirement — but a manual
// trigger (Generate Now / Regenerate Last, both user-initiated clicks) passes `silent: false` to
// get explicit success/failure feedback, since a user who just clicked a button expects to see
// something happen. Never participates in the typing indicator or Regenerate's disabled state
// either way — those stay tied exclusively to generatingConversationIds.
//
// `forcedWindow`/`replaceMemoryId` support "Regenerate last memory": re-run generation over an
// EXISTING memory's original sourceRange and overwrite its content in place, rather than
// summarizing new territory. This deliberately does not touch lastMemoryMessageIndex — the
// window being regenerated was already summarized once, so the next-memory trigger boundary
// shouldn't move just because a past memory got redone.
//
// generatingConversationIds.add()/refreshVisibleScreen()-style pattern applies here too: the
// memoryGeneratingConversationIds.add() call MUST stay inside this try block — this bug class
// (a tracking-set mutation placed before try, leaking a stuck entry if anything before try
// throws) has already recurred three times in this project via a plan's own example code
// (milestones 2, 3, 4's final/task reviews). Keep it as the first statement inside try.
async function generateMemory(conversationId, conversation, context, settings, options = {}) {
    const { silent = true, forcedWindow = null, replaceMemoryId = null } = options;
    if (memoryGeneratingConversationIds.has(conversationId)) return;
    const installedCharacter = resolveConversationCharacter(context, conversation.charName);
    const lorebookContact = conversation.lorebookContact === true;
    if (!installedCharacter && !lorebookContact) return;
    const character = installedCharacter ?? { name: conversation.charName, description: '' };

    try {
        memoryGeneratingConversationIds.add(conversationId);
        rerenderMemoryScreen();
        const window = forcedWindow ?? getMemoryWindow(conversation);
        if (window.messages.length === 0) {
            if (!silent) toastr.info('Nothing new to summarize since the last memory.', 'WeyPhone');
            return;
        }

        const resolved = await resolveCharacterPrompt(context, character, {
            lorebookContact,
            lorebookName: conversation.lorebookName || 'Weyland',
        });
        const personalityText = resolved.personalityText;
        const userName = context.name1 || 'User';
        const messages = buildMemoryGenerationMessages({
            charName: character.name,
            personalityText,
            windowMessages: window.messages,
            userName,
            formatClockTime,
        });
        // Same real-macro resolution as generateReply's system prompt — personalityText can
        // itself contain macros (it comes from the same charper.js source as the main prompt).
        messages[0].content = applyMacroSubstitution({
            substituteParams: context.substituteParams,
            content: messages[0].content,
            userName,
            charName: character.name,
        });

        const activeProfileId = context.extensionSettings.connectionManager?.selectedProfile ?? '';
        const profileId = resolveProfileId({ connectionProfileId: conversation.memoryConnectionProfileId }, activeProfileId);
        const result = await sendMemoryRequest({
            sendRequest: (id, msgs, model) => context.ConnectionManagerRequestService.sendRequest(
                id, msgs, DEFAULT_MEMORY_MAX_TOKENS, undefined, model ? { model } : {},
            ),
            profileId,
            messages,
            primaryModel: conversation.memoryPrimaryModel,
            backupModel: conversation.memoryBackupModel,
        });

        const memoryText = extractResponseText(result);
        if (memoryText.trim()) {
            if (replaceMemoryId) {
                editMemory(settings, conversationId, replaceMemoryId, memoryText.trim());
            } else {
                createMemory(settings, conversationId, memoryText.trim(), {
                    sourceRange: { from: window.start, to: window.end },
                });
                conversation.lastMemoryMessageIndex = window.end;
            }
            queueWeyPhoneSave(context);
            if (!silent) toastr.success(replaceMemoryId ? 'Memory regenerated.' : 'Memory created.', 'WeyPhone');
        } else if (!silent) {
            toastr.warning('The model returned an empty memory.', 'WeyPhone');
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] Memory generation failed:`, error);
        if (!silent) toastr.error(error.message, 'WeyPhone');
    } finally {
        memoryGeneratingConversationIds.delete(conversationId);
        rerenderMemoryScreen();
    }
}

// Shared by handleRequestReply (after one or more user messages are queued) and handleRegenerate
// (after discardTrailingReply leaves the conversation ending on the message to resend) — resolves the
// prompt, builds the request (including the always-texting instructions, phone-format history,
// and any pinned memories), sends it, and stores each extracted message from the reply.
async function generateGroupReply(conversationId, conversation, context, settings) {
    const participants = conversation.participants ?? [];
    if (participants.length < 2 || participants.length > 4) return;
    if (isConversationLinkedToChat(conversation, context.chatId)) {
        wpToast('info', 'This chat waits for the main roleplay model. Send your next roleplay message to receive the reply.');
        return;
    }
    try {
        generatingConversationIds.add(conversationId);
        refreshVisibleScreen();
        const profiles = [];
        for (const name of participants) {
            const bookName = conversation.participantBooks?.[name] || 'Weyland';
            const profile = await resolveLorebookContactProfile({ loadWorldInfo: context.loadWorldInfo, charName: name, lorebookName: bookName });
            if (!profile) throw new Error(`No subbot profile was found for ${name}. Group chats never fall back to full character cards.`);
            profiles.push({ name, personalityText: profile.personalityText });
        }
        const groupProfileContext = profiles.map(profile => applyMacroSubstitution({
            substituteParams: context.substituteParams,
            content: profile.personalityText,
            userName: context.name1 || 'User',
            charName: profile.name,
        })).join('\n');
        const worldInfo = await resolveWorldInfo(
            context,
            buildPhoneWorldInfoScanHistory(conversation.messages),
            Object.values(conversation.participantBooks ?? {}).filter(name => name !== 'Weyland'),
            participants,
            groupProfileContext,
        );
        const userName = context.name1 || 'User';
        const personaContext = buildPersonaContextBlock(userName, context.powerUserSettings?.persona_description);
        const systemPrompt = buildGroupSystemPrompt({
            participants: profiles,
            worldInfo: joinNonEmptySections([
                worldInfo.worldInfoBefore,
                worldInfo.worldInfoAfter,
                personaContext,
                joinMemoriesForInjection(getPinnedMemories(settings, conversationId)),
            ]),
            textingInstructions: TEXTING_MODE_INSTRUCTIONS,
            relationshipContext: buildGroupContactContextBlock(participants, settings.contactContexts),
            finalInstructions: TEXTING_THOUGHTS_DISABLED,
        });
        const substituted = applyMacroSubstitution({ substituteParams: context.substituteParams, content: systemPrompt, userName, charName: participants.join(', ') });
        const wire = message => {
            const time = Number.isFinite(message.timestamp) ? formatClockTime(message.timestamp) : '';
            return message.role === 'user'
                ? `Outgoing¦${time}¦${userName}¦${message.content}`
                : `Incoming¦${time}¦${message.speaker || participants[0]}¦${message.content}`;
        };
        const history = conversation.messages.slice(0, -1).map(message => ({ role: message.role, content: wire(message) }));
        const messages = buildMessages({ systemPromptText: substituted, history, userMessage: wire(conversation.messages.at(-1)) });
        const profileId = resolveProfileId(settings, context.extensionSettings.connectionManager?.selectedProfile ?? '');
        const modelOverride = resolveModelOverride({ settingsModel: settings.textingModelOverride, liveModel: context.getChatCompletionModel?.() });
        const result = await sendMessage({
            sendRequest: (id, requestMessages) => context.ConnectionManagerRequestService.sendRequest(id, requestMessages, DEFAULT_MAX_TOKENS, undefined, modelOverride ? { model: modelOverride } : undefined),
            profileId,
            messages,
        });
        const parsed = parseGroupReply(extractResponseText(result));
        if (!parsed.messages.length) throw new Error('The group did not return any usable messages.');
        const addedReplies = [];
        for (const reply of parsed.messages) {
            const speaker = participants.find(name => name.toLowerCase() === String(reply.speaker ?? '').toLowerCase())
                || reply.speaker || 'Group';
            const added = {
                role: 'assistant', speaker, content: reply.content, timestamp: genTimestamp(),
                mainChatAnchor: isConversationLinkedToChat(conversation, context.chatId) ? context.chat.length : undefined,
            };
            appendMessage(settings, conversationId, added);
            addedReplies.push(added);
        }
        recordIncomingDmNotification(context, settings, conversationId, conversation, addedReplies);
        queueWeyPhoneSave(context);
        rerenderIfStillViewing(conversationId, conversation.messages);
    } catch (error) {
        console.error('[WeyPhone] Group generation failed:', error);
        wpToast('error', error.message || 'The group could not reply.');
    } finally {
        generatingConversationIds.delete(conversationId);
        refreshVisibleScreen();
    }
}

async function generateReply(conversationId, conversation, context, settings) {
    if (isConversationLinkedToChat(conversation, context.chatId)) {
        wpToast('info', 'This chat waits for the main roleplay model. Send your next roleplay message to receive the reply.');
        return;
    }
    if ((conversation.participants?.length ?? 1) > 1) {
        await generateGroupReply(conversationId, conversation, context, settings);
        return;
    }
    const installedCharacter = resolveConversationCharacter(context, conversation.charName);
    const lorebookContact = conversation.lorebookContact === true;
    if (!installedCharacter && !lorebookContact) {
        toastr.error(`Could not find character "${conversation.charName}" for this conversation.`, 'WeyPhone');
        return;
    }
    const character = installedCharacter ?? { name: conversation.charName, description: '' };

    // generatingConversationIds.add()/refreshVisibleScreen() MUST stay inside this try block —
    // placing them before `try` has leaked a permanently-stuck "generating" conversation twice
    // before (milestone 2's final review, milestone 3's Task 4) whenever the pre-try code threw,
    // since the finally below would never run to clean up the set. Keep the add/refresh as the
    // first statements inside try, not above it.
    try {
        generatingConversationIds.add(conversationId);
        refreshVisibleScreen();
        const resolved = await resolveCharacterPrompt(context, character, {
            lorebookContact,
            lorebookName: conversation.lorebookName || 'Weyland',
        });
        const isKressa = conversation.charName === 'Kressa' && conversation.isDedicatedApp === 'kressa';
        // Memories are purely additive, matching the real platform's own Weyland-LTM behavior
        // (confirmed by reading its demoteExcessLTMs: pin/unpin only toggles a World Info entry's
        // constant/vectorized flags, it never touches the chat array) — raw history is never
        // trimmed just because a memory now also covers that ground.
        const historyBeforeLast = conversation.messages.slice(0, -1);
        const worldInfoScanHistory = buildPhoneWorldInfoScanHistory(conversation.messages);
        // Tethered mode REPLACES WeyPhone's own untethered world info with the active main
        // roleplay's world info (resolved inside buildTetheredContext below, as part of its own
        // [TETHERED VIEW] block) — it does not add to it. Running both scans unconditionally (as
        // this used to do) fed the model two separate, overlapping passes over the same shared
        // "Weyland" lorebook in one prompt — once scanned against this texting conversation, once
        // against the main chat's real history — duplicating instructional content in a way that
        // reads as exactly the kind of repeated override attempt a stricter model is trained to
        // refuse. Falls back to the untethered scan when tethered but nothing is actually active
        // to tether to (mirrors buildTetheredContext's own isMainRoleplayActive guard), so a
        // conversation never silently ends up with zero world info.
        const effectivelyTethered = !isKressa && getRoleplayMode(conversation) === ROLEPLAY_MODES.OBSERVE &&
            isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId });
        const worldInfo = effectivelyTethered
            ? { worldInfoBefore: '', worldInfoAfter: '' }
            : await resolveWorldInfo(
                context,
                worldInfoScanHistory,
                conversation.lorebookName && conversation.lorebookName !== 'Weyland' ? [conversation.lorebookName] : [],
                [character.name],
                applyMacroSubstitution({
                    substituteParams: context.substituteParams,
                    content: joinNonEmptySections([resolved.descriptionText, resolved.personalityText]),
                    userName: context.name1 || 'User',
                    charName: character.name,
                }),
            );
        const pinnedMemories = getPinnedMemories(settings, conversationId);
        const memoryBlock = joinMemoriesForInjection(pinnedMemories);
        // Kressa keeps her normal fixed-Weyland retrieval, but Observe must still append the
        // active story as a read-only [TETHERED VIEW] — that is the entire "show Kressa my Nara
        // roleplay" use case. Other observing DMs swap their own scan for the active roleplay's
        // scan above; Kressa's assistant identity/lore remains additive and intact.
        const tetheredBlock = await buildTetheredContext(context, conversation);
        const kressaObserverInstructions = isKressa && tetheredBlock
            ? KRESSA_ROLEPLAY_COMPANION_INSTRUCTIONS
            : '';
        const worldInfoAfterWithMemory = joinNonEmptySections([worldInfo.worldInfoAfter, memoryBlock, tetheredBlock]);
        const systemPromptText = buildSystemPrompt({
            systemPrompt: applyPhoneHardModePolicy(resolved.systemPrompt, {
                allowHardMode: Boolean(isKressa ? settings.kressaHardModeEnabled : settings.phoneHardModeEnabled),
                hardModeEnabled: isGlobalHardModeEnabled(context),
            }),
            worldInfoBefore: worldInfo.worldInfoBefore,
            descriptionText: resolved.descriptionText,
            personalityText: resolved.personalityText,
            scenarioText: '',
            worldInfoAfter: worldInfoAfterWithMemory,
        });
        // When this thread is marked "no prior history", the first-contact block sits with the
        // texting framing (but TEXTING_MODE_INSTRUCTIONS stays last for positional weight).
        // Kressa always knows the user. Old threads may still carry hasHistory:false from when she
        // could be opened as a generic DM, but that stale flag must never inject stranger framing.
        const firstContactBlock = !isKressa && conversation.hasHistory === false ? FIRST_CONTACT_BLOCK : '';
        const relationshipContext = buildContactContextBlock(
            character.name,
            resolveContactContext(settings.contactContexts, conversation.charName),
        );
        const userName = context.name1 || 'User';
        const personaContext = buildPersonaContextBlock(userName, context.powerUserSettings?.persona_description);
        const fullSystemPromptText = joinNonEmptySections([
            systemPromptText,
            resolved.postHistory,
            personaContext,
            firstContactBlock,
            TEXTING_MODE_INSTRUCTIONS,
            relationshipContext,
            kressaObserverInstructions,
            TEXTING_THOUGHTS_DISABLED,
        ]);

        // Resolves every macro in the fully-assembled prompt — {{user}}, {{char}}, {{time}},
        // {{date}}, dice rolls, etc. — via SillyTavern's own real macro engine. This covers the
        // character's base prompt, World Info, memories, and the [TETHERED VIEW] block all at
        // once, since they're already joined into one string by this point.
        const substitutedSystemPromptText = applyMacroSubstitution({
            substituteParams: context.substituteParams,
            content: fullSystemPromptText,
            userName,
            charName: character.name,
        });
        const lastMessage = conversation.messages[conversation.messages.length - 1];
        const reconstructedHistory = reconstructHistoryAsPhoneFormat(historyBeforeLast, { charName: character.name, userName }, formatClockTime);
        const wrappedUserMessage = reconstructHistoryAsPhoneFormat([lastMessage], { charName: character.name, userName }, formatClockTime)[0].content;

        const messages = buildMessages({
            systemPromptText: substitutedSystemPromptText,
            history: reconstructedHistory,
            userMessage: wrappedUserMessage,
        });

        const activeProfileId = context.extensionSettings.connectionManager?.selectedProfile ?? '';
        const profileId = resolveProfileId(settings, activeProfileId);
        // Model precedence (see resolveModelOverride): the user's explicit Settings-app model
        // (default minimax-m3 — texting is a small generation, don't spend Sonnet on it)
        // beats the live main-chat model, which beats the profile's stale snapshot. Kressa is
        // the exception: her dedicated assistant app runs on its OWN setting
        // (settings.kressaModel), whose empty default means the live main-chat model.
        const liveModel = context.getChatCompletionModel?.();
        const modelOverride = isKressa
            ? resolveModelOverride({ settingsModel: settings.kressaModel, liveModel })
            : resolveModelOverride({ settingsModel: settings.textingModelOverride, liveModel });
        const overridePayload = modelOverride ? { model: modelOverride } : undefined;
        const result = await sendMessage({
            sendRequest: (id, msgs) => context.ConnectionManagerRequestService.sendRequest(id, msgs, DEFAULT_MAX_TOKENS, undefined, overridePayload),
            profileId,
            messages,
        });

        const replyText = extractResponseText(result);
        const parsed = parseReply(replyText);
        if (parsed.messages.length === 0) {
            throw new Error('The model did not return any usable content.');
        }
        const addedReplies = [];
        for (const messageText of parsed.messages) {
            const added = { role: 'assistant', content: messageText, timestamp: genTimestamp() };
            appendMessage(settings, conversationId, added);
            addedReplies.push(added);
        }
        recordIncomingDmNotification(context, settings, conversationId, conversation, addedReplies);
        rerenderIfStillViewing(conversationId, conversation.messages);
        queueWeyPhoneSave(context);

        const exchangeCount = countExchangesSince(conversation.messages, conversation.lastMemoryMessageIndex ?? 0);
        if (exchangeCount >= (conversation.memoryThreshold ?? 100)) {
            // Fire-and-forget — must not delay this function's own finally cleanup below.
            generateMemory(conversationId, conversation, context, settings);
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] Generation failed:`, error);
        toastr.error(error.message, 'WeyPhone');
    } finally {
        generatingConversationIds.delete(conversationId);
        refreshVisibleScreen();
    }
}

// The arrow queues a user bubble locally and persists it immediately. It intentionally performs
// no API work, allowing a realistic burst of consecutive texts before a reply is requested.
function handleQueueMessage() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const input = document.getElementById('wp-input');
    const userMessage = input.value.trim();
    if (!userMessage || !currentConversationId) return;
    const conversationId = currentConversationId;
    if (generatingConversationIds.has(conversationId)) return;

    const conversation = getConversation(settings, conversationId);
    if (!conversation) return;

    input.value = '';
    const linkedToCurrentRoleplay = isConversationLinkedToChat(conversation, context.chatId);
    appendMessage(settings, conversationId, {
        role: 'user', content: userMessage, timestamp: genTimestamp(),
        // Store the scene clock at authorship time. This keeps several queued texts at the time
        // the user actually sent them even if the roleplay header advances before injection.
        displayTime: linkedToCurrentRoleplay ? resolveRpTime()?.time : undefined,
        mainChatAnchor: linkedToCurrentRoleplay ? context.chat.length : undefined,
    });
    queueWeyPhoneSave(context);
    editingMessageIndex = -1;
    rerenderIfStillViewing(conversationId, conversation.messages);
    input.focus();
}

// Refresh sends the complete trailing user-message burst in one request. The prompt builder
// coalesces consecutive same-role turns for strict providers, while the local log keeps each
// bubble exactly as the user composed it.
async function handleRequestReply() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    if (!currentConversationId) return;
    const conversationId = currentConversationId;
    if (generatingConversationIds.has(conversationId)) return;
    const conversation = getConversation(settings, conversationId);
    if (!conversation || conversation.messages.at(-1)?.role !== 'user') return;
    if (isConversationLinkedToChat(conversation, context.chatId)) {
        wpToast('info', 'Queued for the main roleplay. Send your next roleplay message when you want the character to answer.');
        return;
    }
    await generateReply(conversationId, conversation, context, settings);
}

// Share/inject: pushes the tail of the open texting thread into the main roleplay as a
// Weyland-LTM-compatible lorebook entry (toggleable in the LTM panel), so the RP character
// knows what was arranged over text. One press = one entry; re-sharing the same WeyPhone thread
// updates that entry in place.
let shareInFlight = false;
async function handleShareConversation() {
    if (shareInFlight) return;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversationId = currentConversationId;
    const conversation = conversationId ? getConversation(settings, conversationId) : null;
    if (!conversation || conversation.messages.length === 0) {
        wpToast('info', 'Nothing to share yet — this thread has no messages.');
        return;
    }
    const userName = context.name1 || 'You';
    const block = buildShareBlock({ userName, charName: conversation.charName, messages: conversation.messages });
    if (!block) {
        wpToast('info', 'Nothing to share yet — this thread has no messages.');
        return;
    }
    shareInFlight = true;
    const shareButton = document.getElementById('wp-share-button');
    if (shareButton) {
        shareButton.disabled = true;
        shareButton.setAttribute('aria-busy', 'true');
    }
    try {
        const { updated } = await saveShareAsLtmEntry({
            title: buildShareTitle(conversation.charName),
            content: block,
            shareId: conversationId,
        });
        pushLogLine(`Shared texts with ${conversation.charName} to the roleplay (${updated ? 'updated' : 'new'} memory entry)`);
        wpToast('success', `${updated ? 'Updated the shared' : 'Shared this'} conversation with the roleplay — toggle it anytime in the LTM panel.`);
    } catch (error) {
        console.error('[WeyPhone] share failed', error);
        wpToast('error', error.message || 'Could not share this conversation.');
    } finally {
        shareInFlight = false;
        if (shareButton?.isConnected) {
            shareButton.disabled = false;
            shareButton.removeAttribute('aria-busy');
        }
    }
}

async function handleRegenerate() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    if (!currentConversationId) return;
    const conversationId = currentConversationId;
    if (generatingConversationIds.has(conversationId)) return;

    const conversation = getConversation(settings, conversationId);
    if (!conversation) return;
    if (isConversationLinkedToChat(conversation, context.chatId)) {
        wpToast('info', 'Linked replies are written by the main roleplay model and cannot be regenerated inside WeyPhone.');
        return;
    }

    const discarded = discardTrailingReply(settings, conversationId);
    // discardTrailingReply only trims a TRAILING ASSISTANT run — it deliberately returns false
    // and does nothing when the conversation already ends on a user message (nothing to trim),
    // which is exactly the shape a failed generation leaves behind (the user's message got
    // appended, but no reply ever did). That's still a real, retriable attempt, not a no-op: fall
    // through to generateReply as-is rather than bailing, since generateReply already treats
    // conversation.messages' last entry as "the message to reply to" and never appends anything
    // itself.
    const endsOnPendingUserMessage = conversation.messages.length > 0 &&
        conversation.messages[conversation.messages.length - 1].role === 'user';
    if (!discarded && !endsOnPendingUserMessage) return;
    editingMessageIndex = -1;
    rerenderIfStillViewing(conversationId, conversation.messages);

    await generateReply(conversationId, conversation, context, settings);
}

function toggleRegenerateMenu() {
    const menu = document.getElementById('wp-regenerate-menu');
    if (!menu) return;
    if (menu.hidden) {
        // Reflect the live prior-history state in the menu item label each time the menu opens
        // (the menu markup itself is rendered once per conversation entry, stateless).
        const item = menu.querySelector('[data-action="prior-history"]');
        if (item) {
            const context = SillyTavern.getContext();
            const settings = getSettings(context.extensionSettings);
            const conversation = getConversation(settings, currentConversationId);
            item.textContent = conversation?.hasHistory === false
                ? 'Prior History: Off (stranger)'
                : 'Prior History: On';
        }
    }
    menu.hidden = !menu.hidden;
}

function closeRegenerateMenu() {
    const menu = document.getElementById('wp-regenerate-menu');
    if (menu) menu.hidden = true;
}

function handleEnterSelectMode() {
    selectMode = true;
    selectedMessageIndices.clear();
    editingMessageIndex = -1;
    updateSelectModeUI();
}

function handleExitSelectMode() {
    selectMode = false;
    selectedMessageIndices.clear();
    updateSelectModeUI();
}

// Matches stock SillyTavern's own bulk-delete selection model exactly (see script.js's delegated
// `.mes` click handler under is_delete_mode): clicking a message is not an independent toggle —
// it clears any prior selection and selects that message plus everything after it, through the
// end of the conversation. There is no way to select an out-of-order/discontiguous set of
// messages, and no way to select anything before the clicked message; only a fresh anchor click
// (or Cancel) changes the selection.
function handleSelectFromIndex(index) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, currentConversationId);
    if (!conversation) return;
    selectedMessageIndices.clear();
    for (let i = index; i < conversation.messages.length; i++) {
        selectedMessageIndices.add(i);
    }
    updateSelectModeUI();
}

function handleBulkDeleteMessages() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    if (!currentConversationId || selectedMessageIndices.size === 0) return;
    deleteMessages(settings, currentConversationId, selectedMessageIndices);
    queueWeyPhoneSave(context);
    selectMode = false;
    selectedMessageIndices.clear();
    updateSelectModeUI();
}

function handleAddMemory() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const textarea = document.getElementById('wp-memory-add-input');
    if (!textarea || !currentConversationId) return;
    const content = textarea.value.trim();
    if (!content) return;
    createMemory(settings, currentConversationId, content, { pinned: true, sourceRange: null });
    queueWeyPhoneSave(context);
    rerenderMemoryScreen();
}

function handleToggleMemoryPin(memoryId, pinned) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    setMemoryPinned(settings, currentConversationId, memoryId, pinned);
    queueWeyPhoneSave(context);
    rerenderMemoryScreen();
}

function handleConfirmMemoryEdit(memoryId) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const textarea = document.querySelector('.wp-memory-edit-textarea');
    if (!textarea) return;
    editMemory(settings, currentConversationId, memoryId, textarea.value);
    queueWeyPhoneSave(context);
    editingMemoryId = null;
    rerenderMemoryScreen();
}

async function handleGenerateMemoryNow() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    if (!currentConversationId) return;
    const conversationId = currentConversationId;
    const conversation = getConversation(settings, conversationId);
    if (!conversation) return;
    await generateMemory(conversationId, conversation, context, settings, { silent: false });
}

async function handleRegenerateLastMemory() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    if (!currentConversationId) return;
    const conversationId = currentConversationId;
    const conversation = getConversation(settings, conversationId);
    if (!conversation) return;
    const lastMemory = getLastGeneratedMemory(conversation);
    if (!lastMemory) {
        toastr.info('No auto-generated memory to regenerate yet.', 'WeyPhone');
        return;
    }
    const { from, to } = lastMemory.sourceRange;
    const forcedWindow = { start: from, end: to, messages: conversation.messages.slice(from, to) };
    await generateMemory(conversationId, conversation, context, settings, {
        silent: false,
        forcedWindow,
        replaceMemoryId: lastMemory.id,
    });
}

function handleDeleteMemory(memoryId) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    deleteMemory(settings, currentConversationId, memoryId);
    queueWeyPhoneSave(context);
    editingMemoryId = null;
    rerenderMemoryScreen();
}

/**
 * Maps a cast-directory display name (often "First Last") to an installed SillyTavern character
 * name (often just "First"): exact match first, then a unique first-name match. Returns null when
 * nothing resolves — the contact renders as "Not reachable".
 * @param {{characters: Array<{name: string}>}} context
 * @param {string} castName
 * @returns {string|null}
 */
function resolveInstalledCharacterName(context, castName) {
    return findInstalledCharacterName(context.characters, castName);
}

function getCombinedContactEntries(settings, refreshOptions = {}) {
    const context = SillyTavern.getContext();
    const official = getCastEntries(settings, refreshOptions);
    const seen = new Set(official.map(entry => entry.name.toLowerCase()));
    const directoryEntries = [...official, ...contactLorebookState.registrarContacts.filter(entry => {
        const key = entry.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    })];
    return mergeInstalledContacts(
        directoryEntries,
        context.characters,
        context.getThumbnailUrl,
        castName => resolveInstalledCharacterName(context, castName),
    );
}

function resolveContactCapability(context, entry) {
    const installedName = resolveInstalledCharacterName(context, entry.name);
    if (installedName) {
        return { messageable: true, resolvedName: installedName, lorebookContact: false, lorebookName: '', sourceLabel: 'installed character card' };
    }

    const preferredBookName = entry.lorebookName || 'Weyland';
    const preferredBook = preferredBookName === 'Weyland'
        ? contactLorebookState.officialBook
        : contactLorebookState.registrarBooks.get(preferredBookName);
    if (findLorebookCharacterEntry(preferredBook, entry.name)) {
        return {
            messageable: true,
            resolvedName: entry.name,
            lorebookContact: true,
            lorebookName: preferredBookName,
            sourceLabel: preferredBookName === 'Weyland' ? 'the Weyland lorebook' : `the ${preferredBookName} lorebook`,
        };
    }

    // A community profile may share an official-directory name. If the official book has no
    // subbot, a uniquely matching imported Registrar profile still makes that person reachable.
    for (const [bookName, book] of contactLorebookState.registrarBooks) {
        if (!findLorebookCharacterEntry(book, entry.name)) continue;
        return {
            messageable: true,
            resolvedName: entry.name,
            lorebookContact: true,
            lorebookName: bookName,
            sourceLabel: `the ${bookName} lorebook`,
        };
    }

    return { messageable: false, resolvedName: entry.name, lorebookContact: false, lorebookName: '', sourceLabel: '' };
}

function handleStartConversation(charName, { lorebookContact = false, lorebookName = '' } = {}) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = createConversation(settings, charName, {
        hasHistory: isKnownByDefault(settings, charName),
        lorebookContact,
        lorebookName,
    });
    queueWeyPhoneSave(context);
    currentConversationId = conversation.id;
    showScreen('conversation');
}

// The Kressa app tile: her dedicated conversation, reusing the whole texting engine (threads,
// memories, tethering) with her own warm, techy assistant identity (see the [data-app="kressa"]
// CSS). Tier-gated at the home grid; this is just the entry point.
function openKressaConversation() {
    const context = SillyTavern.getContext();
    if (!context.characters.some(c => c.name === 'Kressa')) {
        wpToast('error', 'Kressa isn\'t installed in this SillyTavern instance.');
        return;
    }
    const settings = getSettings(context.extensionSettings);
    const conversation = findOrCreateDedicatedAppConversation(settings, 'Kressa', 'kressa');
    // The Kressa app is an established assistant relationship, including for threads that existed
    // before the dedicated app. Preserve their messages while permanently removing stranger mode.
    for (const thread of Object.values(settings.conversations)) {
        if (thread.charName === 'Kressa' && thread.isDedicatedApp === 'kressa') thread.hasHistory = true;
    }
    queueWeyPhoneSave(context);
    currentConversationId = conversation.id;
    showScreen('conversation');
}

// "Start New Thread" — creates a fresh conversation with the SAME character (and, if the current
// thread happens to be isDedicatedApp-tagged, the same tag — so it stays hidden from the general
// Messages list, matching its sibling threads) as the one currently open,
// WITHOUT touching the existing thread's messages at all (createConversation always makes a
// brand-new record; nothing here deletes or modifies the current conversation).
function handleStartNewThread() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, currentConversationId);
    if (!conversation) return;
    const options = {
        ...(conversation.isDedicatedApp ? { isDedicatedApp: conversation.isDedicatedApp } : {}),
        ...(conversation.lorebookContact ? { lorebookContact: true } : {}),
        ...(conversation.lorebookName ? { lorebookName: conversation.lorebookName } : {}),
        participants: conversation.participants,
        displayName: conversation.displayName,
    };
    const newConversation = createConversation(settings, conversation.charName, options);
    if (conversation.participantBooks) newConversation.participantBooks = { ...conversation.participantBooks };
    queueWeyPhoneSave(context);
    currentConversationId = newConversation.id;
    showScreen('conversation');
}

// "Switch Threads" — navigates to a filtered thread list (via the SAME renderMessagesScreen used
// by the Messages screen, just fed a differently-filtered summaries array) for whichever character
// the currently open conversation belongs to. Purely charName-based — works identically for
// every character, no isDedicatedApp branching here at all.
function handleSwitchThreads() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, currentConversationId);
    if (!conversation) return;
    currentThreadsFilter = conversation.charName;
    currentThreadsAppKey = conversation.isDedicatedApp ?? null;
    showScreen('threads');
}

function handleDeleteConversation(id) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    // Capture whether the conversation being deleted was itself isDedicatedApp-tagged BEFORE
    // deleting it — needed below to pick a sensible fallback screen if this was this character's
    // very last thread, since deleteConversation removes the record this info lives on.
    const deletedConversation = getConversation(settings, id);
    const wasDedicatedApp = !!deletedConversation?.isDedicatedApp;
    deleteConversation(settings, id);
    queueWeyPhoneSave(context);
    if (currentConversationId === id) {
        currentConversationId = null;
    }
    if (currentView === 'threads') {
        const remaining = getThreadsFor(settings, currentThreadsFilter ?? '');
        if (remaining.length === 0) {
            showScreen(wasDedicatedApp ? 'home' : 'messages');
        } else {
            showScreen('threads');
        }
        return;
    }
    showScreen('messages');
}

function handleConfirmEdit(bubbleEl) {
    const index = Number(bubbleEl.dataset.index);
    const textarea = bubbleEl.querySelector('.wp-message-edit-textarea');
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    editMessage(settings, currentConversationId, index, textarea.value);
    queueWeyPhoneSave(context);
    editingMessageIndex = -1;
    rerenderConversationMessages();
}

function handleDeleteMessage(bubbleEl) {
    const index = Number(bubbleEl.dataset.index);
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    deleteMessage(settings, currentConversationId, index);
    queueWeyPhoneSave(context);
    editingMessageIndex = -1;
    rerenderConversationMessages();
}

function currentPawXaiSource(context) {
    return findPawXaiSceneContext(context.chat, context.name2 || 'Character');
}

function renderPawXaiScreenNow() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    settings.pawxai = normalizePawXaiSettings(settings.pawxai);
    renderPawXaiScreen(document.getElementById('wp-screen-body'), {
        settings: settings.pawxai,
        activeTab: currentPawXaiTab,
        selectedSavedCharacter: currentPawXaiSavedCharacter,
        source: currentPawXaiSource(context),
        generating: pawxaiGenerating,
        currentLiveModel: context.getChatCompletionModel?.() ?? '',
        formatRelativeTime,
        generationAllowance: currentGenerationAllowance(context, settings),
        formatCooldown: formatGenerationCooldown,
    });
}

async function copyPawXaiText(text) {
    const copied = await copyTextToClipboard(text);
    wpToast(copied ? 'success' : 'error', copied ? 'Prompt copied.' : 'Could not copy this prompt.', 'PawXai');
}

async function runPawXaiGeneration() {
    if (pawxaiGenerating) return;
    if (phoneState.airplane) {
        wpToast('warning', 'Turn off airplane mode before generating.', 'PawXai');
        return;
    }
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    // PawXai owns its in-app allowance display; the shared header counter belongs to Chronicle.
    // Keep this explicit so a copied app-local variable cannot crash before the generation try.
    updateHeaderGenerationCounter(context, settings, false);
    settings.pawxai = normalizePawXaiSettings(settings.pawxai);
    let allowance = currentGenerationAllowance(context, settings);
    if (!allowance.allowed) {
        showGenerationCooldown(allowance);
        return;
    }
    const source = currentPawXaiSource(context);
    if (!source) {
        wpToast('info', 'Open a roleplay chat with a character message first.', 'PawXai');
        return;
    }

    const character = context.characters.find(candidate => candidate.name === source.characterName)
        ?? context.characters.find(candidate => candidate.name === context.name2);
    const messages = buildPawXaiMessages({
        source,
        characterDescription: character?.description ?? '',
        settings: settings.pawxai,
    });
    const activeProfileId = context.extensionSettings.connectionManager?.selectedProfile ?? '';
    const profileId = resolveProfileId(settings, activeProfileId);
    const model = resolveModelOverride({
        settingsModel: settings.pawxai.modelOverride,
        liveModel: context.getChatCompletionModel?.() ?? '',
    });

    pawxaiGenerating = true;
    if (currentView === 'pawxai') renderPawXaiScreenNow();
    try {
        allowance = currentGenerationAllowance(context, settings);
        if (!allowance.allowed) {
            showGenerationCooldown(allowance);
            return;
        }
        const response = await sendMessage({
            sendRequest: (id, requestMessages) => context.ConnectionManagerRequestService.sendRequest(
                id,
                requestMessages,
                DEFAULT_PAWXAI_MAX_TOKENS,
                undefined,
                model ? { model } : {},
            ),
            profileId,
            messages,
        });
        const prompts = parsePawXaiResponse(extractResponseText(response), settings.pawxai.promptCount);
        if (!prompts.length) throw new Error('The model did not return any usable prompts.');
        recordGenerationRequest(settings);
        settings.pawxai.lastRun = {
            characterName: source.characterName,
            sourceExcerpt: source.message.slice(0, 280),
            prompts,
            generatedAt: Date.now(),
        };
        queueWeyPhoneSave(context);
        pushLogLine(`PawXai generated ${prompts.length} prompt${prompts.length === 1 ? '' : 's'} for ${source.characterName}`);
        wpToast('success', `${prompts.length} prompt${prompts.length === 1 ? '' : 's'} ready.`, 'PawXai');
    } catch (error) {
        console.error('[WeyPhone] PawXai generation failed', error);
        wpToast('error', error.message || 'Could not generate prompts.', 'PawXai');
    } finally {
        pawxaiGenerating = false;
        if (currentView === 'pawxai') renderPawXaiScreenNow();
    }
}

function renderMienScreenNow() {
    const panel = document.getElementById('wp-panel');
    if (panel) panel.dataset.mienFullscreen = String(mienFullscreen);
    renderMienScreen(document.getElementById('wp-screen-body'), {
        gallery: currentMienGallery,
        selectedIndex: currentMienIndex,
        loading: mienLoading,
        applying: mienApplying,
        error: mienError,
        appliedLabel: mienAppliedLabel,
        fullscreen: mienFullscreen,
    });
}

function resolveSubbotBook(entry) {
    const preferredName = entry.lorebookName || 'Weyland';
    const preferredBook = preferredName === 'Weyland'
        ? contactLorebookState.officialBook
        : contactLorebookState.registrarBooks.get(preferredName);
    if (findLorebookCharacterEntry(preferredBook, entry.name)) return preferredName;
    if (findLorebookCharacterEntry(contactLorebookState.officialBook, entry.name)) return 'Weyland';
    for (const [bookName, book] of contactLorebookState.registrarBooks) {
        if (findLorebookCharacterEntry(book, entry.name)) return bookName;
    }
    return null;
}

function getGroupContacts(settings) {
    return getCombinedContactEntries(settings)
        .filter(isGeneralMessagingContact)
        .map(entry => ({ name: entry.name, bookName: resolveSubbotBook(entry) }))
        .filter(entry => entry.bookName)
        .sort((a, b) => a.name.localeCompare(b.name));
}

function createSelectedGroup() {
    if (groupSelectionNames.length < 2 || groupSelectionNames.length > 4) return;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const contacts = getGroupContacts(settings);
    const participantBooks = {};
    for (const name of groupSelectionNames) {
        const contact = contacts.find(item => item.name === name);
        if (!contact) return;
        participantBooks[name] = contact.bookName;
    }
    const displayName = groupDraftTitle.trim() || groupSelectionNames.join(', ');
    const conversation = createConversation(settings, displayName, {
        participants: groupSelectionNames,
        displayName,
        lorebookContact: true,
        hasHistory: true,
    });
    conversation.participantBooks = participantBooks;
    queueWeyPhoneSave(context);
    currentConversationId = conversation.id;
    groupSelectionNames = [];
    groupDraftTitle = '';
    showScreen('conversation');
}

async function refreshMienGallery() {
    const token = ++mienLoadToken;
    const context = SillyTavern.getContext();
    mienLoading = true;
    mienError = '';
    mienAppliedLabel = '';
    if (currentView === 'mien') renderMienScreenNow();
    try {
        const gallery = await loadMienGallery(context, { outfitId: currentMienGallery?.selectedOutfitId ?? '' });
        if (token !== mienLoadToken) return;
        currentMienGallery = gallery;
        currentMienIndex = Math.min(currentMienIndex, Math.max(0, gallery.expressions.length - 1));
    } catch (error) {
        if (token !== mienLoadToken) return;
        console.error('[WeyPhone] Mien gallery failed', error);
        mienError = error?.message || 'Mien could not open this expression gallery.';
        currentMienGallery = null;
    } finally {
        if (token !== mienLoadToken) return;
        mienLoading = false;
        if (currentView === 'mien') renderMienScreenNow();
    }
}

function stepMienSelection(delta) {
    const count = currentMienGallery?.expressions?.length ?? 0;
    if (!count) return;
    currentMienIndex = (currentMienIndex + delta + count) % count;
    mienAppliedLabel = '';
    renderMienScreenNow();
}

async function applyCurrentMienExpression() {
    if (mienApplying) return;
    const selection = currentMienGallery?.expressions?.[currentMienIndex];
    const characterName = currentMienGallery?.character?.name;
    if (!selection || !characterName) return;
    mienApplying = true;
    renderMienScreenNow();
    try {
        await applyMienExpression(selection, characterName);
        mienAppliedLabel = selection.label;
        wpToast('success', `${selection.label} is now active until the next character message.`, 'Mien');
    } catch (error) {
        console.error('[WeyPhone] Mien expression apply failed', error);
        wpToast('error', error?.message || 'Could not set that expression.', 'Mien');
    } finally {
        mienApplying = false;
        if (currentView === 'mien') renderMienScreenNow();
    }
}

function isWeyPhoneGenerationBusy() {
    return generatingConversationIds.size > 0 || memoryGeneratingConversationIds.size > 0 ||
        phoneAppGeneratingIds.size > 0 || twitterGeneratingKeys.size > 0 || pawxaiGenerating;
}

function exportWeyPhone() {
    const context = SillyTavern.getContext();
    const backup = createWeyPhoneBackup(getSettings(context.extensionSettings));
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `weyphone-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    wpToast('success', 'WeyPhone backup exported.');
}

async function importWeyPhone(file) {
    if (!file) return;
    if (isWeyPhoneGenerationBusy()) {
        wpToast('warning', 'Wait for the current generation to finish before importing.');
        return;
    }
    try {
        const backup = parseWeyPhoneBackup(await file.text());
        if (!window.confirm('Replace everything currently stored in WeyPhone with this backup?')) return;

        const context = SillyTavern.getContext();
        restoreWeyPhoneBackup(context.extensionSettings, backup.settings, MODULE_NAME);
        const settings = getSettings(context.extensionSettings);
        queueWeyPhoneSave(context);

        currentConversationId = null;
        currentPhoneApp = null;
        currentSavedAppKey = null;
        currentTwitterProfileCharacter = null;
        currentThreadsFilter = null;
        currentThreadsAppKey = null;
        currentContactName = null;
        currentNoteId = null;
        currentPawXaiTab = 'generate';
        currentPawXaiSavedCharacter = null;
        applyWallpaper();
        applyKressaPalette(document.getElementById('wp-panel'), settings);
        applyPawXaiPalette(document.getElementById('wp-panel'), settings);
        refreshHomeScreenAvailability();
        showScreen('settings-app');
        wpToast('success', 'Backup restored — chats, notes, prompts, posts, and preferences are back.');
    } catch (error) {
        wpToast('error', error?.message || 'Could not import this backup.');
    }
}

function handleFormatWeyPhone() {
    // Resetting the live object while a request is still capable of committing into it would let
    // that late result partially repopulate a freshly formatted phone. Make the destructive action
    // wait until every WeyPhone-owned generation is idle instead.
    if (isWeyPhoneGenerationBusy()) {
        wpToast('warning', 'Wait for the current generation to finish before formatting.');
        return;
    }

    const context = SillyTavern.getContext();
    resetSettings(context.extensionSettings);
    clearLogLines();
    queueWeyPhoneSave(context);

    currentConversationId = null;
    currentPhoneApp = null;
    currentSavedAppKey = null;
    currentTwitterProfileCharacter = null;
    currentThreadsFilter = null;
    currentThreadsAppKey = null;
    currentContactName = null;
    currentNoteId = null;
    currentPawXaiTab = 'generate';
    contactsQuery = '';
    editingMessageIndex = -1;
    editingMemoryId = null;
    selectMode = false;
    selectedMessageIndices.clear();
    calcState = calcInitialState();
    Object.assign(phoneState, {
        locked: true,
        dimmed: false,
        shadeOpen: false,
        airplane: false,
        dnd: false,
        sessionStart: Date.now(),
        batteryStart: initialBatteryLevel(),
    });

    applyWallpaper();
    setShadeOpen(false);
    showScreen('home');
    setLocked(true);
    renderStatusBarNow();
    showOnboardingFromStart();
    wpToast('success', 'WeyPhone formatted. First-time setup is ready.');
}

function handleScreenBodyClick(event) {
    // While bulk-deleting, this delegated listener handles exactly three things — cancel, delete,
    // and toggling a bubble's selection — and nothing else (no edit, no regenerate, no nav) should
    // be reachable, so this returns unconditionally rather than falling through to the branches below.
    if (selectMode) {
        const selectCancelBtn = event.target.closest('#wp-select-cancel');
        if (selectCancelBtn) {
            handleExitSelectMode();
            return;
        }
        const selectDeleteBtn = event.target.closest('#wp-select-delete');
        if (selectDeleteBtn) {
            if (!selectDeleteBtn.disabled) handleBulkDeleteMessages();
            return;
        }
        const selectableBubble = event.target.closest('.wp-message');
        if (selectableBubble && selectableBubble.dataset.index !== undefined) {
            handleSelectFromIndex(Number(selectableBubble.dataset.index));
        }
        return;
    }
    const inlineHelp = event.target.closest('.wp-inline-help');
    if (inlineHelp) {
        const appKey = inlineHelp.dataset.appKey;
        const settings = getSettings(SillyTavern.getContext().extensionSettings);
        renderAppHelpDialog(document.getElementById('wp-app-help'), {
            appKey,
            appLabel: resolveAppLabel(settings, appKey),
        });
        return;
    }
    // --- Settings app controls ---
    const wallpaperSwatch = event.target.closest('.wp-wallpaper-swatch');
    if (wallpaperSwatch) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.ui.wallpaper = wallpaperSwatch.dataset.wallpaper;
        queueWeyPhoneSave(context);
        applyWallpaper();
        if (currentView === 'settings-app') showScreen('settings-app');
        return;
    }
    const useCurrentModelBtn = event.target.closest('.wp-settings-use-current-model');
    if (useCurrentModelBtn) {
        const input = document.getElementById(useCurrentModelBtn.dataset.inputId);
        if (input) {
            input.value = SillyTavern.getContext().getChatCompletionModel?.() ?? '';
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
    }
    const quickfillBtn = event.target.closest('.wp-model-quickfill');
    if (quickfillBtn) {
        // Each quick-fill names its target explicitly because the main Settings screen now has
        // independent Sync and texting inputs alongside Kressa's separate model input.
        const input = document.getElementById(quickfillBtn.dataset.inputId);
        if (input) {
            input.value = quickfillBtn.dataset.model;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
    }
    const logCopyBtn = event.target.closest('#wp-settings-log-copy');
    if (logCopyBtn) {
        const text = getLogLines().map(l => `[${formatClockTime(l.timestamp)}] ${l.message}`).join('\n');
        navigator.clipboard?.writeText(text).then(
            () => wpToast('success', 'Logs copied.'),
            () => wpToast('error', 'Could not copy logs.'),
        );
        return;
    }
    const shareBtn = event.target.closest('#wp-share-button');
    if (shareBtn) {
        handleShareConversation();
        return;
    }
    const calcKey = event.target.closest('.wp-calc-key');
    if (calcKey) {
        calcState = reduceKeypress(calcState, calcKey.dataset.calcKey);
        updateCalculatorDisplay(calcState);
        return;
    }
    if (event.target.closest('#wp-calc-settings-button')) {
        showScreen('calculator-settings');
        return;
    }
    if (event.target.closest('#wp-calc-settings-back')) {
        showScreen('calculator');
        return;
    }
    const calcPalette = event.target.closest('.wp-calc-palette-button');
    if (calcPalette) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.calculatorPalette = calcPalette.dataset.calcPalette;
        queueWeyPhoneSave(context);
        showScreen('calculator-settings');
        return;
    }
    if (event.target.closest('#wp-mien-refresh, #wp-mien-retry')) {
        refreshMienGallery();
        return;
    }
    if (event.target.closest('#wp-create-group-button')) {
        createSelectedGroup();
        return;
    }
    if (event.target.closest('#wp-capture-last-roleplay')) {
        void captureExistingRoleplay({ all: false });
        return;
    }
    if (event.target.closest('#wp-import-roleplay-texts')) {
        if (window.confirm('Scan the active roleplay and copy every compatible phone block into chat-scoped WeyPhone threads? The original text remains in the roleplay.')) {
            void captureExistingRoleplay({ all: true });
        }
        return;
    }
    if (event.target.closest('#wp-mien-fullscreen')) {
        mienFullscreen = true;
        renderMienScreenNow();
        return;
    }
    if (event.target.closest('#wp-mien-fullscreen-exit')) {
        mienFullscreen = false;
        renderMienScreenNow();
        return;
    }
    if (event.target.closest('#wp-mien-prev')) {
        stepMienSelection(-1);
        return;
    }
    if (event.target.closest('#wp-mien-next')) {
        stepMienSelection(1);
        return;
    }
    const mienThumb = event.target.closest('.wp-mien-thumb');
    if (mienThumb) {
        currentMienIndex = Number(mienThumb.dataset.mienIndex) || 0;
        mienAppliedLabel = '';
        renderMienScreenNow();
        return;
    }
    if (event.target.closest('#wp-mien-apply')) {
        applyCurrentMienExpression();
        return;
    }
    const noteRow = event.target.closest('.wp-note-row');
    if (noteRow) {
        currentNoteId = noteRow.dataset.noteId;
        showScreen('note-editor');
        return;
    }
    const noteAddBtn = event.target.closest('#wp-note-add');
    if (noteAddBtn) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const note = createNote(settings);
        queueWeyPhoneSave(context);
        currentNoteId = note.id;
        showScreen('note-editor');
        const textarea = document.getElementById('wp-note-text');
        if (textarea) textarea.focus();
        return;
    }
    const noteDeleteBtn = event.target.closest('#wp-note-delete');
    if (noteDeleteBtn) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        deleteNote(settings, noteDeleteBtn.dataset.noteId);
        queueWeyPhoneSave(context);
        showScreen('notes');
        return;
    }
    if (event.target.closest('#wp-app-names-button')) {
        showScreen('app-names');
        return;
    }
    if (event.target.closest('#wp-character-wallpapers-button')) {
        showScreen('character-wallpapers');
        return;
    }
    const characterWallpaper = event.target.closest('.wp-character-wallpaper-card');
    if (characterWallpaper) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.ui.wallpaper = characterWallpaper.dataset.wallpaperUrl;
        queueWeyPhoneSave(context);
        applyWallpaper();
        showScreen('character-wallpapers');
        return;
    }
    const pawxaiTab = event.target.closest('.wp-pawxai-tab');
    if (pawxaiTab) {
        if (pawxaiTab.dataset.pawxaiTab === 'saved' && currentPawXaiTab !== 'saved') currentPawXaiSavedCharacter = null;
        currentPawXaiTab = pawxaiTab.dataset.pawxaiTab;
        renderPawXaiScreenNow();
        return;
    }
    if (event.target.closest('#wp-pawxai-refresh-source')) {
        renderPawXaiScreenNow();
        wpToast('success', 'Latest character message checked.', 'PawXai');
        return;
    }
    if (event.target.closest('#wp-pawxai-generate')) {
        runPawXaiGeneration();
        return;
    }
    const pawxaiCharacterRow = event.target.closest('.wp-pawxai-character-row');
    if (pawxaiCharacterRow) {
        currentPawXaiSavedCharacter = pawxaiCharacterRow.dataset.pawxaiCharacter;
        renderPawXaiScreenNow();
        return;
    }
    if (event.target.closest('.wp-pawxai-library-back')) {
        currentPawXaiSavedCharacter = null;
        renderPawXaiScreenNow();
        return;
    }
    const pawxaiCopyResult = event.target.closest('.wp-pawxai-copy');
    if (pawxaiCopyResult) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const result = settings.pawxai?.lastRun?.prompts?.[Number(pawxaiCopyResult.dataset.pawxaiResultIndex)];
        if (result?.prompt) copyPawXaiText(result.prompt);
        return;
    }
    const pawxaiSaveResult = event.target.closest('.wp-pawxai-save');
    if (pawxaiSaveResult) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const lastRun = settings.pawxai?.lastRun;
        const result = lastRun?.prompts?.[Number(pawxaiSaveResult.dataset.pawxaiResultIndex)];
        if (!result?.prompt) return;
        savePawXaiPrompt(settings, {
            characterName: lastRun.characterName,
            title: result.title,
            prompt: result.prompt,
            sourceExcerpt: lastRun.sourceExcerpt,
        });
        queueWeyPhoneSave(context);
        wpToast('success', `Saved under ${lastRun.characterName}.`, 'PawXai');
        return;
    }
    const pawxaiDeleteResult = event.target.closest('.wp-pawxai-delete-result');
    if (pawxaiDeleteResult) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const prompts = settings.pawxai?.lastRun?.prompts;
        const index = Number(pawxaiDeleteResult.dataset.pawxaiResultIndex);
        if (Array.isArray(prompts) && Number.isInteger(index) && index >= 0 && index < prompts.length) {
            prompts.splice(index, 1);
            queueWeyPhoneSave(context);
            renderPawXaiScreenNow();
        }
        return;
    }
    const pawxaiCopySaved = event.target.closest('.wp-pawxai-copy-saved');
    if (pawxaiCopySaved) {
        const settings = getSettings(SillyTavern.getContext().extensionSettings);
        const entry = settings.pawxai?.savedPrompts?.find(item => item.id === pawxaiCopySaved.dataset.pawxaiSavedId);
        if (entry) copyPawXaiText(entry.prompt);
        return;
    }
    const pawxaiDeleteSaved = event.target.closest('.wp-pawxai-delete-saved');
    if (pawxaiDeleteSaved) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        if (deletePawXaiPrompt(settings, pawxaiDeleteSaved.dataset.pawxaiSavedId)) {
            if (!settings.pawxai.savedPrompts.some(entry => entry.characterName === currentPawXaiSavedCharacter)) currentPawXaiSavedCharacter = null;
            queueWeyPhoneSave(context);
            renderPawXaiScreenNow();
        }
        return;
    }
    const contactRow = event.target.closest('.wp-contact-row');
    if (contactRow) {
        currentContactName = contactRow.dataset.contactName;
        showScreen('contact-detail');
        return;
    }
    const contactMessageBtn = event.target.closest('#wp-contact-message-btn');
    if (contactMessageBtn) {
        if (contactMessageBtn.disabled) return;
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const castName = contactMessageBtn.dataset.contactName;
        const entry = getCombinedContactEntries(settings, {}).find(item => item.name === castName);
        if (!entry) return;
        const capability = resolveContactCapability(context, entry);
        if (!capability.messageable) return;
        const resolved = capability.resolvedName;
        const existingThreads = getThreadsFor(settings, resolved);
        if (existingThreads.length > 0) {
            // Resume their most recent thread rather than silently stacking new ones.
            if (capability.lorebookContact) {
                existingThreads[0].lorebookContact = true;
                existingThreads[0].lorebookName = capability.lorebookName;
            }
            currentConversationId = existingThreads[0].id;
            queueWeyPhoneSave(context);
            showScreen('conversation');
        } else {
            handleStartConversation(resolved, {
                lorebookContact: capability.lorebookContact,
                lorebookName: capability.lorebookName,
            });
        }
        return;
    }
    const appTile = event.target.closest('.wp-app-tile');
    if (appTile) {
        if (appTile.dataset.action === 'unified-sync') {
            if (!appTile.disabled) runUnifiedRefresh();
            return;
        }
        if (appTile.classList.contains('wp-app-tile-tier-locked')) {
            renderNoticeDialog(document.getElementById('wp-app-help'), {
                kicker: 'Kressa',
                title: 'Wolfgirl Assistant locked',
                body: 'This app is a Paw Patrol Plus and Platinum feature!',
                bullets: ['Upgrade your membership to unlock your own wolfgirl assistant~'],
            });
            return;
        }
        if (appTile.classList.contains('wp-app-tile-disabled')) {
            wpToast('info', 'This app is only available when there\'s an active roleplay chat open.');
            return;
        }
        const appKey = appTile.dataset.app;
        const app = getApp(appKey);
        if (appKey === 'messages') {
            const context = SillyTavern.getContext();
            const settings = getSettings(context.extensionSettings);
            markAppNotificationsRead(settings, context.chatId, 'messages');
            queueWeyPhoneSave(context);
            renderShadeNow();
            renderLockScreenNow();
        }
        if (appKey === 'kressa') {
            openKressaConversation();
        } else if (app?.screenView === 'phone-app') {
            currentPhoneApp = appKey;
            showScreen('phone-app');
        } else if (app) {
            showScreen(app.screenView);
        }
        return;
    }

    // Tappable like on a Chitter post — visual flair only (see lib/twitterLikes.js). Checked
    // before the author-link matcher so a like tap never navigates to a profile.
    const likeBtn = event.target.closest('.wp-twitter-like-btn');
    if (likeBtn) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const cacheKey = currentView === 'twitter-profile'
            ? twitterCacheKey('profile', currentTwitterProfileCharacter)
            : twitterCacheKey('feed');
        const entry = getPhoneAppContent(settings, context.chatId, cacheKey);
        if (!entry?.content) return;
        setPhoneAppContent(settings, context.chatId, cacheKey, {
            ...entry,
            content: toggleLike(entry.content, Number(likeBtn.dataset.postIndex)),
        });
        queueWeyPhoneSave(context);
        rerenderTwitterScreenIfVisible(
            currentView === 'twitter-profile' ? 'profile' : 'feed',
            currentTwitterProfileCharacter,
        );
        return;
    }
    // Bookmark toggle — before the author-link matcher so a save tap never navigates. The
    // data attributes locate the content in the visible cache; savedPosts.js owns identity.
    const saveBtn = event.target.closest('.wp-save-btn');
    if (saveBtn) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        if (saveBtn.dataset.postIndex !== undefined) {
            // A Chitter post (feed or profile view) — always saved under 'feed'.
            const cacheKey = currentView === 'twitter-profile'
                ? twitterCacheKey('profile', currentTwitterProfileCharacter)
                : twitterCacheKey('feed');
            const post = getPhoneAppContent(settings, context.chatId, cacheKey)?.content?.posts?.[Number(saveBtn.dataset.postIndex)];
            if (!post) return;
            toggleSaved(settings, 'feed', post);
            rerenderTwitterScreenIfVisible(currentView === 'twitter-profile' ? 'profile' : 'feed', currentTwitterProfileCharacter);
        } else {
            // A chronicle/chat/board item, addressed by section/item index in the visible cache.
            const item = getPhoneAppContent(settings, context.chatId, currentPhoneApp)
                ?.content?.sections?.[Number(saveBtn.dataset.sectionIndex)]?.items?.[Number(saveBtn.dataset.itemIndex)];
            if (!item) return;
            toggleSaved(settings, currentPhoneApp, item);
            rerenderPhoneAppScreenIfVisible(currentPhoneApp);
        }
        queueWeyPhoneSave(context);
        return;
    }
    const savedListBtn = event.target.closest('#wp-phone-app-saved-button');
    if (savedListBtn) {
        currentSavedAppKey = currentView === 'twitter-feed' ? 'feed' : currentPhoneApp;
        showScreen('saved-posts');
        return;
    }
    const savedRemoveBtn = event.target.closest('.wp-saved-remove');
    if (savedRemoveBtn) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        unsave(settings, currentSavedAppKey, savedRemoveBtn.dataset.savedId);
        queueWeyPhoneSave(context);
        showScreen('saved-posts');
        return;
    }
    const followingLinkBtn = event.target.closest('#wp-twitter-following-link');
    if (followingLinkBtn) {
        showScreen('twitter-following');
        return;
    }
    if (event.target.closest('#wp-twitter-feed-link')) {
        showScreen('twitter-feed');
        return;
    }

    const followingItem = event.target.closest('.wp-twitter-following-item');
    if (followingItem) {
        currentTwitterProfileCharacter = followingItem.dataset.name;
        showScreen('twitter-profile');
        return;
    }
    // A feed post's avatar or name/handle header (lib/panel.js's twitterPostCardMarkup) — same
    // navigation as a Following-list item, just reached from a different screen.
    const postAuthorLink = event.target.closest('.wp-twitter-post-author-link');
    if (postAuthorLink) {
        currentTwitterProfileCharacter = postAuthorLink.dataset.name;
        showScreen('twitter-profile');
        return;
    }
    const phoneAppRefreshBtn = event.target.closest('#wp-phone-app-refresh-button');
    if (phoneAppRefreshBtn && !phoneAppRefreshBtn.disabled) {
        if (currentView === 'twitter-profile' && currentTwitterProfileCharacter) {
            runTwitterProfileGeneration(currentTwitterProfileCharacter);
        } else {
            // Every sync app's refresh button fires the same single-call sync — one API request
            // fills the whole phone, respecting users' limited daily message budget.
            runUnifiedRefresh();
        }
        return;
    }
    const regenerateButton = event.target.closest('#wp-regenerate-button');
    if (regenerateButton) {
        if (!regenerateButton.disabled) toggleRegenerateMenu();
        return;
    }
    const regenerateMenuItem = event.target.closest('.wp-popup-menu-item[data-action="regenerate"]');
    if (regenerateMenuItem) {
        closeRegenerateMenu();
        handleRegenerate();
        return;
    }
    const memoryMenuItem = event.target.closest('.wp-popup-menu-item[data-action="memory"]');
    if (memoryMenuItem) {
        closeRegenerateMenu();
        editingMemoryId = null;
        showScreen('memory');
        return;
    }
    const priorHistoryMenuItem = event.target.closest('.wp-popup-menu-item[data-action="prior-history"]');
    if (priorHistoryMenuItem) {
        closeRegenerateMenu();
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const conversation = getConversation(settings, currentConversationId);
        if (!conversation) return;
        const next = conversation.hasHistory === false;
        setContactHistorySettings(settings, currentConversationId, { hasHistory: next });
        queueWeyPhoneSave(context);
        wpToast('info', next
            ? `${conversation.charName} now remembers you in this thread.`
            : `${conversation.charName} no longer knows who this number belongs to.`);
        return;
    }
    const selectMenuItem = event.target.closest('.wp-popup-menu-item[data-action="select"]');
    if (selectMenuItem) {
        closeRegenerateMenu();
        handleEnterSelectMode();
        return;
    }
    const newThreadMenuItem = event.target.closest('.wp-popup-menu-item[data-action="new-thread"]');
    if (newThreadMenuItem) {
        closeRegenerateMenu();
        handleStartNewThread();
        return;
    }
    const switchThreadsMenuItem = event.target.closest('.wp-popup-menu-item[data-action="switch-threads"]');
    if (switchThreadsMenuItem) {
        closeRegenerateMenu();
        handleSwitchThreads();
        return;
    }
    const scrubRoleplayMenuItem = event.target.closest('.wp-popup-menu-item[data-action="scrub-roleplay"]');
    if (scrubRoleplayMenuItem) {
        closeRegenerateMenu();
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const conversation = getConversation(settings, currentConversationId);
        if (!conversation || !isConversationLinkedToChat(conversation, context.chatId)) return;
        let scrubbed = 0;
        for (const message of conversation.messages) {
            if (message.capturedFromRoleplay || message.suppressedFromRoleplay) continue;
            message.suppressedFromRoleplay = true;
            scrubbed++;
        }
        if (scrubbed > 0) {
            queueWeyPhoneSave(context);
            updateRegenerateEnabled(conversation);
            wpToast('success', `Scrubbed ${scrubbed} message${scrubbed === 1 ? '' : 's'} from roleplay injection. The WeyPhone chat is unchanged; future texts can still be sent.`);
        } else {
            wpToast('info', 'There are no unsent chatlog messages left to scrub.');
        }
        return;
    }
    const threadDetailsMenuItem = event.target.closest('.wp-popup-menu-item[data-action="thread-details"]');
    if (threadDetailsMenuItem) {
        closeRegenerateMenu();
        showScreen('thread-details');
        return;
    }
    const memoryAddBtn = event.target.closest('#wp-memory-add-button');
    if (memoryAddBtn) {
        handleAddMemory();
        return;
    }
    const memoryGenerateNowBtn = event.target.closest('#wp-memory-generate-now-button');
    if (memoryGenerateNowBtn) {
        if (!memoryGenerateNowBtn.disabled) handleGenerateMemoryNow();
        return;
    }
    const memoryRegenerateLastBtn = event.target.closest('#wp-memory-regenerate-last-button');
    if (memoryRegenerateLastBtn) {
        if (!memoryRegenerateLastBtn.disabled) handleRegenerateLastMemory();
        return;
    }
    const memoryPinBtn = event.target.closest('.wp-memory-pin-btn');
    if (memoryPinBtn) {
        handleToggleMemoryPin(memoryPinBtn.dataset.id, !memoryPinBtn.classList.contains('wp-memory-pinned'));
        return;
    }
    const memoryEditBtn = event.target.closest('.wp-memory-edit-btn');
    if (memoryEditBtn) {
        editingMemoryId = memoryEditBtn.dataset.id;
        rerenderMemoryScreen();
        return;
    }
    const memoryEditConfirm = event.target.closest('.wp-memory-edit-confirm');
    if (memoryEditConfirm) {
        handleConfirmMemoryEdit(memoryEditConfirm.dataset.id);
        return;
    }
    const memoryEditCancel = event.target.closest('.wp-memory-edit-cancel');
    if (memoryEditCancel) {
        editingMemoryId = null;
        rerenderMemoryScreen();
        return;
    }
    const memoryDeleteBtn = event.target.closest('.wp-memory-delete-btn');
    if (memoryDeleteBtn) {
        handleDeleteMemory(memoryDeleteBtn.dataset.id);
        return;
    }
    if (event.target.closest('#wp-request-reply-button')) {
        handleRequestReply();
        return;
    }
    const roleplayModeButton = event.target.closest('.wp-roleplay-mode-option');
    if (roleplayModeButton) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const conversation = getConversation(settings, currentConversationId);
        const mode = roleplayModeButton.dataset.roleplayMode;
        if (!conversation || !Object.values(ROLEPLAY_MODES).includes(mode)) return;
        const roleplayActive = isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId });
        if (mode !== ROLEPLAY_MODES.UNLINKED && !roleplayActive) {
            wpToast('info', 'Open a main roleplay before using Observe or Linked.');
            return;
        }
        if (mode === ROLEPLAY_MODES.LINKED && isKressaConversation(conversation) && !isLiteralKressaRoleplay(context)) {
            wpToast('info', 'Kressa can be Linked only while her character-card roleplay is open. Use Observe when she is commentating on somebody else’s story.');
            return;
        }
        const roleplayChatId = mode === ROLEPLAY_MODES.LINKED
            ? context.chatId
            : (conversation.roleplayTether ? conversation.roleplayChatId : null);
        setTetheredSettings(settings, conversation.id, { roleplayMode: mode, roleplayChatId });
        queueWeyPhoneSave(context);
        updateRoleplayModeAvailability();
        updateRegenerateEnabled(conversation);
        return;
    }
    const kressaPaletteBtn = event.target.closest('.wp-kressa-palette-button');
    if (kressaPaletteBtn) {
        const palette = KRESSA_PALETTES.find(option => option.id === kressaPaletteBtn.dataset.palette);
        if (!palette) return;
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.kressaPalette = palette.id;
        queueWeyPhoneSave(context);
        applyKressaPalette(document.getElementById('wp-panel'), settings);
        showScreen('kressa-settings');
        return;
    }
    const pawxaiPaletteBtn = event.target.closest('.wp-pawxai-palette-button');
    if (pawxaiPaletteBtn) {
        const palette = PAWXAI_PALETTES.find(option => option.id === pawxaiPaletteBtn.dataset.palette);
        if (!palette) return;
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.pawxai = normalizePawXaiSettings(settings.pawxai);
        settings.pawxai.palette = palette.id;
        queueWeyPhoneSave(context);
        applyPawXaiPalette(document.getElementById('wp-panel'), settings);
        renderPawXaiScreenNow();
        return;
    }
    const pawxaiSuffixBtn = event.target.closest('.wp-pawxai-suffix-button');
    if (pawxaiSuffixBtn) {
        const fragment = pawxaiSuffixBtn.dataset.pawxaiSuffix;
        if (!fragment) return;
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.pawxai = normalizePawXaiSettings(settings.pawxai);
        settings.pawxai.qualityTags = togglePawXaiSuffix(settings.pawxai.qualityTags, fragment);
        const textarea = document.getElementById('wp-pawxai-quality');
        if (textarea) textarea.value = settings.pawxai.qualityTags;
        const selected = pawXaiSuffixEnabled(settings.pawxai.qualityTags, fragment);
        pawxaiSuffixBtn.classList.toggle('wp-selected', selected);
        pawxaiSuffixBtn.setAttribute('aria-pressed', String(selected));
        queueWeyPhoneSave(context);
        return;
    }
    const formatButton = event.target.closest('#wp-format-button');
    if (formatButton) {
        const dialog = document.getElementById('wp-format-dialog');
        if (dialog) dialog.hidden = false;
        return;
    }
    const formatCancel = event.target.closest('#wp-format-cancel');
    if (formatCancel) {
        const dialog = document.getElementById('wp-format-dialog');
        if (dialog) dialog.hidden = true;
        return;
    }
    if (event.target.closest('#wp-format-confirm')) {
        handleFormatWeyPhone();
        return;
    }
    if (event.target.closest('#wp-export-button')) {
        exportWeyPhone();
        return;
    }
    if (event.target.closest('#wp-import-button')) {
        document.getElementById('wp-import-file')?.click();
        return;
    }
    if (event.target.closest('#wp-send-button')) {
        handleQueueMessage();
        return;
    }
    const deleteConvoBtn = event.target.closest('.wp-list-item-delete');
    if (deleteConvoBtn) {
        handleDeleteConversation(deleteConvoBtn.dataset.id);
        return;
    }
    const conversationItem = event.target.closest('.wp-conversation-item');
    if (conversationItem) {
        currentConversationId = conversationItem.dataset.id;
        showScreen('conversation');
        return;
    }
    const contactItem = event.target.closest('.wp-contact-item');
    if (contactItem) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const entry = getCombinedContactEntries(settings).find(item => item.name === contactItem.dataset.name);
        const capability = entry ? resolveContactCapability(context, entry) : null;
        if (capability?.messageable) {
            handleStartConversation(capability.resolvedName, {
                lorebookContact: capability.lorebookContact,
                lorebookName: capability.lorebookName,
            });
        }
        return;
    }
    const editBtn = event.target.closest('.wp-message-edit-btn');
    if (editBtn) {
        editingMessageIndex = Number(editBtn.closest('.wp-message').dataset.index);
        rerenderConversationMessages();
        return;
    }
    const confirmBtn = event.target.closest('.wp-message-edit-confirm');
    if (confirmBtn) {
        handleConfirmEdit(confirmBtn.closest('.wp-message'));
        return;
    }
    const deleteMsgBtn = event.target.closest('.wp-message-edit-delete');
    if (deleteMsgBtn) {
        handleDeleteMessage(deleteMsgBtn.closest('.wp-message'));
        return;
    }
    const cancelBtn = event.target.closest('.wp-message-edit-cancel');
    if (cancelBtn) {
        editingMessageIndex = -1;
        rerenderConversationMessages();
    }
}

const MEMORY_SETTINGS_FIELD_IDS = [
    'wp-memory-profile-select', 'wp-memory-threshold-input',
    'wp-memory-primary-model-input', 'wp-memory-backup-model-input',
    'wp-tethered-full-history-checkbox', 'wp-tethered-history-cap-input',
];

const WALLPAPER_RANGE_FIELDS = {
    'wp-settings-wallpaper-x': { key: 'wallpaperPositionX', outputId: 'wp-wallpaper-x-value' },
    'wp-settings-wallpaper-y': { key: 'wallpaperPositionY', outputId: 'wp-wallpaper-y-value' },
    'wp-settings-wallpaper-dim': { key: 'wallpaperDim', outputId: 'wp-wallpaper-dim-value' },
    'wp-settings-wallpaper-wash': { key: 'wallpaperLightWash', outputId: 'wp-wallpaper-wash-value' },
};

function handleWallpaperRangeInput(target) {
    const field = WALLPAPER_RANGE_FIELDS[target.id];
    if (!field) return false;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    settings.ui[field.key] = Number(target.value);
    const output = document.getElementById(field.outputId);
    if (output) output.textContent = `${target.value}%`;
    queueWeyPhoneSave(context);
    applyWallpaper();
    return true;
}

function handleScreenBodyChange(event) {
    if (event.target.classList?.contains('wp-group-contact-checkbox')) {
        const name = event.target.dataset.name;
        if (event.target.checked) {
            if (!groupSelectionNames.includes(name) && groupSelectionNames.length < 4) groupSelectionNames.push(name);
        } else {
            groupSelectionNames = groupSelectionNames.filter(item => item !== name);
        }
        if (currentView === 'group-compose') showScreen('group-compose');
        return;
    }
    if (event.target.id === 'wp-thread-display-name' || event.target.id === 'wp-thread-user-nickname') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const conversation = getConversation(settings, currentConversationId);
        if (!conversation) return;
        if (event.target.id === 'wp-thread-display-name') conversation.displayName = event.target.value.trim() || null;
        else conversation.userNickname = event.target.value.trim() || null;
        queueWeyPhoneSave(context);
        return;
    }
    if (handleWallpaperRangeInput(event.target)) return;
    if (event.target.id === 'wp-mien-outfit') {
        currentMienGallery = selectMienOutfit(currentMienGallery, event.target.value);
        currentMienIndex = 0;
        mienAppliedLabel = '';
        renderMienScreenNow();
        return;
    }
    if (event.target.id === 'wp-import-file') {
        const file = event.target.files?.[0];
        importWeyPhone(file).finally(() => { event.target.value = ''; });
        return;
    }
    const pawxaiSettingFields = {
        'wp-pawxai-model': ['modelOverride', 'string'],
        'wp-pawxai-count': ['promptCount', 'number'],
        'wp-pawxai-count-quick': ['promptCount', 'number'],
        'wp-pawxai-focus': ['focus', 'string'],
        'wp-pawxai-focus-quick': ['focus', 'string'],
        'wp-pawxai-framing': ['framing', 'string'],
        'wp-pawxai-variation': ['variation', 'string'],
        'wp-pawxai-custom': ['customFragments', 'string'],
        'wp-pawxai-feedback': ['modelFeedback', 'string'],
        'wp-pawxai-quality': ['qualityTags', 'string'],
        'wp-pawxai-description': ['includeCharacterDescription', 'boolean'],
    };
    const pawxaiField = pawxaiSettingFields[event.target.id];
    if (pawxaiField) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const [key, type] = pawxaiField;
        settings.pawxai = normalizePawXaiSettings(settings.pawxai);
        settings.pawxai[key] = type === 'boolean'
            ? event.target.checked
            : type === 'number'
                ? Number(event.target.value)
                : event.target.value.trim();
        settings.pawxai = normalizePawXaiSettings(settings.pawxai);
        queueWeyPhoneSave(context);
        if (event.target.id.endsWith('-quick') && currentView === 'pawxai') renderPawXaiScreenNow();
        return;
    }
    // --- Settings app fields ---
    if (event.target.id === 'wp-settings-wallpaper-url') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const url = event.target.value.trim();
        settings.ui.wallpaper = url || 'default';
        queueWeyPhoneSave(context);
        applyWallpaper();
        if (currentView === 'settings-app') showScreen('settings-app');
        return;
    }
    if (event.target.classList?.contains('wp-settings-applabel')) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const key = event.target.dataset.appKey;
        const value = event.target.value.trim();
        if (value) settings.appLabels[key] = value;
        else delete settings.appLabels[key];
        queueWeyPhoneSave(context);
        refreshHomeScreenAvailability();
        return;
    }
    if (event.target.classList?.contains('wp-settings-contact-rename')) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const name = event.target.dataset.charName;
        const value = event.target.value.trim();
        if (value) settings.contactRenames[name] = value;
        else delete settings.contactRenames[name];
        queueWeyPhoneSave(context);
        // Reflect the new name in the hero/title immediately ('change' fires on commit, so the
        // re-render doesn't steal focus mid-typing).
        if (currentView === 'contact-detail') showScreen('contact-detail');
        return;
    }
    if (event.target.id === 'wp-settings-rpclock') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.ui.rpClockEnabled = event.target.checked;
        queueWeyPhoneSave(context);
        renderStatusBarNow();
        return;
    }
    if (event.target.id === 'wp-settings-battery-tracker') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.ui.batteryTracker = event.target.checked;
        queueWeyPhoneSave(context);
        // Re-render immediately (theatrical value or cached quota); the quota refresh this
        // kicks off inside resolveBatteryPercent re-renders again when the real number lands.
        renderStatusBarNow();
        if (currentView === 'settings-app') showScreen('settings-app');
        return;
    }
    if (event.target.id === 'wp-settings-capture-roleplay-texts') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.captureRoleplayTextsEnabled = event.target.checked;
        queueWeyPhoneSave(context);
        showScreen('settings-app');
        return;
    }
    if (event.target.id === 'wp-settings-model') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.modelOverride = event.target.value.trim();
        queueWeyPhoneSave(context);
        return;
    }
    if (event.target.id === 'wp-settings-texting-model') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.textingModelOverride = event.target.value.trim();
        queueWeyPhoneSave(context);
        return;
    }
    if (event.target.id === 'wp-settings-hard-mode') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.phoneHardModeEnabled = event.target.checked;
        queueWeyPhoneSave(context);
        return;
    }
    if (event.target.id === 'wp-kressa-model') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.kressaModel = event.target.value.trim();
        queueWeyPhoneSave(context);
        return;
    }
    if (event.target.id === 'wp-kressa-hard-mode') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.kressaHardModeEnabled = event.target.checked;
        queueWeyPhoneSave(context);
        return;
    }
    // Contact page "Prior history?" toggle — sets the per-character default for NEW threads.
    if (event.target.id === 'wp-contact-history-toggle') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const castName = event.target.dataset.contactName;
        const contactKey = resolveInstalledCharacterName(context, castName) ?? castName;
        settings.contactHistoryDefaults[contactKey] = event.target.checked;
        queueWeyPhoneSave(context);
        return;
    }
    if (!MEMORY_SETTINGS_FIELD_IDS.includes(event.target.id)) return;
    if (!currentConversationId) return;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const profileId = document.getElementById('wp-memory-profile-select').value;
    const threshold = Number(document.getElementById('wp-memory-threshold-input').value) || 100;
    const primaryModel = document.getElementById('wp-memory-primary-model-input').value.trim();
    const backupModel = document.getElementById('wp-memory-backup-model-input').value.trim();
    setMemorySettings(settings, currentConversationId, {
        memoryConnectionProfileId: profileId,
        memoryThreshold: threshold,
        memoryPrimaryModel: primaryModel,
        memoryBackupModel: backupModel,
    });

    const useFullHistory = document.getElementById('wp-tethered-full-history-checkbox').checked;
    const historyCapInput = document.getElementById('wp-tethered-history-cap-input');
    historyCapInput.disabled = useFullHistory;
    const tetheredHistoryCap = useFullHistory ? null : (Number(historyCapInput.value) || 1);
    setTetheredSettings(settings, currentConversationId, { tetheredHistoryCap });

    queueWeyPhoneSave(context);
}

// NOTE: the original fan build auto-regenerated a stale app screen the moment it was opened —
// a silent API call per app against users' limited daily message budget. Deliberately removed:
// flavor content now ONLY regenerates through the explicit one-call unified sync (or a profile's
// own refresh button). Screens simply show their cached content with its "generated N ago" age.

function helpAppKeyForView(view, settings) {
    if (view === 'phone-app') return currentPhoneApp;
    if (view === 'saved-posts') return currentSavedAppKey;
    if (view.startsWith('twitter-')) return 'feed';
    if (view === 'threads') return currentThreadsAppKey === 'kressa' ? 'kressa' : 'messages';
    if (view === 'conversation') {
        return getConversation(settings, currentConversationId)?.isDedicatedApp === 'kressa' ? 'kressa' : 'messages';
    }
    if (view === 'messages' || view === 'contacts' || view === 'group-compose' || view === 'thread-details' || view === 'memory') return 'messages';
    if (view === 'contacts-app' || view === 'contact-detail') return 'contacts';
    if (view === 'calculator' || view === 'calculator-settings') return 'calculator';
    if (view === 'notes' || view === 'note-editor') return 'notes';
    if (view === 'housing') return 'housing';
    if (view === 'pawxai') return 'pawxai';
    if (view === 'mien') return 'mien';
    if (view === 'settings-app' || view === 'app-names' || view === 'character-wallpapers') return 'settings';
    if (view === 'kressa-settings') return 'kressa';
    return null;
}

function showScreen(view) {
    currentView = view;
    if (view !== 'mien') mienFullscreen = false;
    // Navigating anywhere (including re-entering the same conversation) exits select mode —
    // stale selections/half-finished bulk deletes shouldn't survive a screen change.
    selectMode = false;
    selectedMessageIndices.clear();
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const panel = document.getElementById('wp-panel');
    const title = document.getElementById('wp-panel-title');
    const screenBody = document.getElementById('wp-screen-body');
    panel.dataset.view = view;
    panel.dataset.mienFullscreen = String(view === 'mien' && mienFullscreen);
    const helpAppKey = helpAppKeyForView(view, settings);
    const helpButton = document.getElementById('wp-help-button');
    helpButton.classList.toggle('wp-help-visible', Boolean(helpAppKey));
    helpButton.dataset.appKey = helpAppKey ?? '';
    helpButton.dataset.appLabel = helpAppKey ? resolveAppLabel(settings, helpAppKey) : '';
    // The obfuscated Weyland/Registrar lorebooks resolve through {{getvar}} shortcodes that only
    // populate while a chat is open (context.chatId is undefined otherwise) — texting from that
    // state silently gets hollow, contact-less replies with no error. Surface it instead of
    // letting it fail invisibly. (CHAT_CHANGED keeps this live without needing to leave the
    // screen; this call just covers the initial render / direct navigation into the view.)
    updateLoreWarningAvailability();
    updateHeaderGenerationCounter(context, settings, view === 'phone-app' && currentPhoneApp === 'chronicle');
    const helpDialog = document.getElementById('wp-app-help');
    helpDialog.hidden = true;
    helpDialog.innerHTML = '';
    setHeaderContactTarget(panel);

    // Per-app accent theming: the visible app's registry accent drives --wp-app-accent for the
    // whole screen (section titles, pills, links). Falls back to the Weyland red.
    const accentApp = view === 'phone-app' ? currentPhoneApp
        : view === 'saved-posts' ? currentSavedAppKey
        : view.startsWith('twitter-') ? 'feed'
        : view === 'threads' ? (currentThreadsAppKey ?? 'messages')
        : (view === 'messages' || view === 'conversation' || view === 'group-compose' || view === 'thread-details' || view === 'memory') ? 'messages'
        : (view === 'contacts-app' || view === 'contact-detail') ? 'contacts'
        : (view === 'calculator' || view === 'calculator-settings') ? 'calculator'
        : (view === 'notes' || view === 'note-editor') ? 'notes'
        : view === 'pawxai' ? 'pawxai'
        : view === 'mien' ? 'mien'
        : null;
    panel.style.setProperty('--wp-app-accent', getApp(accentApp)?.accent ?? '#AA3F3F');
    // Per-app visual identity hook — CSS scopes fonts/palettes on [data-app] (see style.css's
    // APP IDENTITIES section). currentPhoneApp distinguishes chronicle/chat/board within the
    // shared 'phone-app' view.
    panel.dataset.app = accentApp ?? '';
    delete panel.dataset.kressaPalette;
    delete panel.dataset.pawxaiPalette;
    delete panel.dataset.calculatorPalette;
    if (accentApp === 'pawxai') applyPawXaiPalette(panel, settings);
    if (accentApp === 'calculator') panel.dataset.calculatorPalette = settings.calculatorPalette ?? 'graphite';

    if (view === 'home') {
        title.textContent = 'Home';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        const flavorAppsEnabled = isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId });
        const tier = getTier(context);
        renderHomeScreen(screenBody, {
            apps: APP_REGISTRY
                .map(app => ({
                    ...app,
                    label: resolveAppLabel(settings, app.key),
                    tierLocked: !appVisibleForTier(app, tier),
                })),
            badges: getUnreadCounts(settings, context.chatId),
            flavorAppsEnabled,
            syncing: isSyncInFlight(),
            airplane: phoneState.airplane,
            generationAllowance: currentGenerationAllowance(context, settings),
            formatCooldown: formatGenerationCooldown,
        });
        return;
    }

    if (view === 'messages') {
        title.textContent = 'Messages';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderMessagesScreenNow(context, settings);
        return;
    }

    if (view === 'threads') {
        const isKressaThreads = currentThreadsAppKey === 'kressa';
        title.textContent = isKressaThreads ? 'Threads' : `${resolveContactName(settings, currentThreadsFilter ?? '')} Threads`;
        if (isKressaThreads) applyKressaPalette(panel, settings);
        const portraitMap = renderThreadsScreenNow(context, settings);
        renderPanelAvatar(
            document.getElementById('wp-panel-avatar'),
            isKressaThreads ? null : portraitMap?.[currentThreadsFilter],
        );
        return;
    }

    if (view === 'phone-app') {
        if (!currentPhoneApp) {
            showScreen('home');
            return;
        }
        title.textContent = resolveAppLabel(settings, currentPhoneApp);
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        rerenderPhoneAppScreenIfVisible(currentPhoneApp);
        return;
    }

    if (view === 'saved-posts') {
        if (!currentSavedAppKey) {
            showScreen('home');
            return;
        }
        title.textContent = `${resolveAppLabel(settings, currentSavedAppKey)} — Saved`;
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        const saved = getSaved(settings, currentSavedAppKey);
        const authorNames = currentSavedAppKey === 'feed' ? saved.map(e => e.data.authorName) : [];
        renderSavedPostsScreen(screenBody, {
            appKey: currentSavedAppKey,
            saved,
            portraitMap: buildTwitterPortraitMap(context, authorNames),
            formatRelativeTime,
        });
        return;
    }

    if (view === 'twitter-feed') {
        title.textContent = resolveAppLabel(settings, 'feed');
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        rerenderTwitterScreenIfVisible('feed');
        return;
    }

    if (view === 'twitter-following') {
        title.textContent = 'Following';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        if (!contactLorebooksAreReady()) {
            screenBody.innerHTML = '<div class="wp-empty-state"><i class="fa-solid fa-users"></i><div>Checking imported accounts…</div></div>';
            ensureContactLorebooks(context).then(() => {
                if (currentView === 'twitter-following') showScreen('twitter-following');
            });
            return;
        }
        const roster = getTwitterRoster();
        const portraitMap = buildTwitterPortraitMap(context, roster.map(c => c.name));
        renderTwitterFollowingScreen(screenBody, {
            roster: [...roster, ...PSA_ACCOUNTS],
            portraitMap,
            generationAllowance: currentGenerationAllowance(context, settings),
        });
        return;
    }

    if (view === 'twitter-profile') {
        if (!currentTwitterProfileCharacter) {
            showScreen('twitter-following');
            return;
        }
        title.textContent = currentTwitterProfileCharacter;
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        rerenderTwitterScreenIfVisible('profile', currentTwitterProfileCharacter);
        return;
    }

    if (view === 'settings-app') {
        title.textContent = resolveAppLabel(settings, 'settings');
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        if (settings.ui?.batteryTracker) refreshRemainingMessages(context, handleBatteryQuotaUpdate);
        renderSettingsScreen(screenBody, {
            settings,
            currentLiveModel: context.getChatCompletionModel?.() ?? '',
            logLines: getLogLines(),
            formatClockTime,
            batteryStatus: describeBatteryMode({
                enabled: Boolean(settings.ui?.batteryTracker),
                ...getQuotaSnapshot(context),
            }),
            generationAllowance: currentGenerationAllowance(context, settings),
            formatCooldown: formatGenerationCooldown,
        });
        return;
    }

    if (view === 'housing') {
        title.textContent = resolveAppLabel(settings, 'housing');
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderHousingScreen(screenBody, { registrarEnabled: settings.housingRegistrarEnabled });
        const registrarCheckbox = document.getElementById('wp-registrar-checkbox');
        if (registrarCheckbox) registrarCheckbox.checked = Boolean(settings.housingRegistrarEnabled);
        return;
    }

    if (view === 'kressa-settings') {
        title.textContent = 'Kressa Settings';
        panel.dataset.app = 'kressa';
        applyKressaPalette(panel, settings);
        panel.style.setProperty('--wp-app-accent', getApp('kressa')?.accent ?? '#8B7BB8');
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderKressaSettingsScreen(screenBody, {
            settings,
            currentLiveModel: context.getChatCompletionModel?.() ?? '',
        });
        return;
    }

    if (view === 'calculator') {
        title.textContent = resolveAppLabel(settings, 'calculator');
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderCalculatorScreen(screenBody, calcState);
        return;
    }

    if (view === 'notes') {
        title.textContent = resolveAppLabel(settings, 'notes');
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderNotesScreen(screenBody, { notes: getNotes(settings), formatRelativeTime });
        return;
    }

    if (view === 'character-wallpapers') {
        title.textContent = 'Character Wallpapers';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderCharacterWallpapersScreen(screenBody, { settings });
        return;
    }

    if (view === 'calculator-settings') {
        title.textContent = 'Calculator Colors';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderCalculatorSettingsScreen(screenBody, { selectedPalette: settings.calculatorPalette });
        return;
    }

    if (view === 'app-names') {
        title.textContent = 'App Names';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderAppNamesScreen(screenBody, { settings });
        return;
    }

    if (view === 'pawxai') {
        title.textContent = resolveAppLabel(settings, 'pawxai');
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderPawXaiScreenNow();
        return;
    }

    if (view === 'mien') {
        title.textContent = resolveAppLabel(settings, 'mien');
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        const activeCharacter = resolveMienCharacter(context);
        if (!mienLoading && currentMienGallery?.character?.name !== activeCharacter?.name) {
            currentMienGallery = null;
            currentMienIndex = 0;
            mienFullscreen = false;
            mienError = '';
            mienAppliedLabel = '';
        }
        renderMienScreenNow();
        if (!mienLoading && !currentMienGallery && !mienError) void refreshMienGallery();
        return;
    }

    if (view === 'note-editor') {
        const note = getNote(settings, currentNoteId);
        if (!note) {
            showScreen('notes');
            return;
        }
        title.textContent = 'Note';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderNoteEditorScreen(screenBody, { note });
        return;
    }

    if (view === 'contacts-app') {
        title.textContent = 'Contacts';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        if (!contactLorebooksAreReady()) {
            screenBody.innerHTML = '<div class="wp-empty-state"><i class="fa-solid fa-address-book"></i><div>Checking available contacts…</div></div>';
            ensureContactLorebooks(context).then(() => {
                if (currentView === 'contacts-app') showScreen('contacts-app');
            });
            return;
        }
        const entries = getCombinedContactEntries(settings, {
            onRefreshed: () => {
                queueWeyPhoneSave(context);
                if (currentView === 'contacts-app') showScreen('contacts-app');
            },
        }).filter(isGeneralMessagingContact);
        const displayEntries = searchCast(entries, contactsQuery).map(entry => {
            const installedName = resolveInstalledCharacterName(context, entry.name);
            const custom = settings.contactRenames?.[installedName ?? entry.name];
            return custom ? { ...entry, displayName: custom } : entry;
        });
        renderContactsAppScreen(screenBody, { entries: displayEntries, query: contactsQuery });
        return;
    }

    if (view === 'contact-detail') {
        if (!contactLorebooksAreReady()) {
            screenBody.innerHTML = '<div class="wp-empty-state"><i class="fa-solid fa-address-book"></i><div>Checking contact availability…</div></div>';
            ensureContactLorebooks(context).then(() => {
                if (currentView === 'contact-detail') showScreen('contact-detail');
            });
            return;
        }
        const entries = getCombinedContactEntries(settings, {});
        const entry = entries.find(e => e.name === currentContactName);
        if (!entry) {
            showScreen('contacts-app');
            return;
        }
        const capability = resolveContactCapability(context, entry);
        const renameKey = capability.resolvedName;
        const currentRename = settings.contactRenames?.[renameKey] ?? '';
        const displayName = currentRename || entry.name;
        title.textContent = displayName;
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderContactDetailScreen(screenBody, {
            entry,
            messagable: capability.messageable,
            lorebookOnly: capability.lorebookContact,
            lorebookLabel: capability.sourceLabel,
            knowsUser: isKnownByDefault(settings, renameKey),
            displayName,
            renameKey,
            currentRename,
            contactContext: resolveContactContext(settings.contactContexts, renameKey),
        });
        return;
    }

    if (view === 'contacts') {
        title.textContent = 'New Message';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        if (!contactLorebooksAreReady()) {
            ensureContactLorebooks(context).then(() => {
                if (currentView === 'contacts') showScreen('contacts');
            });
        }
        const characters = getCombinedContactEntries(settings)
            .filter(isGeneralMessagingContact)
            .filter(entry => resolveContactCapability(context, entry).messageable)
            .map(entry => ({ name: entry.name }));
        const portraitMap = buildPortraitMap(context.characters, characters.map(c => c.name), context.getThumbnailUrl);
        renderContactsScreen(screenBody, characters, portraitMap);
        return;
    }
    if (view === 'group-compose') {
        title.textContent = 'New Group';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        if (!contactLorebooksAreReady()) {
            screenBody.innerHTML = '<div class="wp-empty-state"><i class="fa-solid fa-user-group"></i><div>Finding subbot profiles…</div></div>';
            ensureContactLorebooks(context).then(() => {
                if (currentView === 'group-compose') showScreen('group-compose');
            });
            return;
        }
        renderGroupComposeScreen(screenBody, {
            contacts: getGroupContacts(settings),
            selectedNames: groupSelectionNames,
            title: groupDraftTitle,
        });
        return;
    }

    if (view === 'memory') {
        const conversation = getConversation(settings, currentConversationId);
        if (!conversation) {
            showScreen('messages');
            return;
        }
        title.textContent = 'Memory';
        const isGroup = (conversation.participants?.length ?? 1) > 1;
        const portraitMap = isGroup ? {} : buildPortraitMap(context.characters, [conversation.charName], context.getThumbnailUrl);
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), isGroup ? { group: true } : portraitMap[conversation.charName]);
        rerenderMemoryScreen();
        return;
    }

    if (view === 'thread-details') {
        const conversation = getConversation(settings, currentConversationId);
        if (!conversation) {
            showScreen('messages');
            return;
        }
        title.textContent = 'Thread Details';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderThreadDetailsScreen(screenBody, conversation);
        return;
    }

    // view === 'conversation'
    const conversation = getConversation(settings, currentConversationId);
    if (!conversation) {
        showScreen('messages');
        return;
    }
    title.textContent = conversation.displayName || (conversation.participants?.length > 1
        ? conversation.participants.join(', ')
        : resolveContactName(settings, conversation.charName));
    // Kressa's dedicated conversation wears her own warm purple/pink assistant skin (see
    // [data-app="kressa"] CSS) and her settings-cog header button — instead of Messages red.
    if (conversation.isDedicatedApp === 'kressa') {
        panel.dataset.app = 'kressa';
        applyKressaPalette(panel, settings);
        panel.style.setProperty('--wp-app-accent', getApp('kressa')?.accent ?? '#8B7BB8');
        // The in-app masthead already carries Kressa's identity; repeating her name in the phone
        // shell makes the two stacked bars read like duplicate headings.
        title.textContent = '';
    }
    const isGroup = (conversation.participants?.length ?? 1) > 1;
    const portraitMap = isGroup ? {} : buildPortraitMap(context.characters, [conversation.charName], context.getThumbnailUrl);
    renderPanelAvatar(
        document.getElementById('wp-panel-avatar'),
        conversation.isDedicatedApp === 'kressa' ? null : (isGroup ? { group: true } : portraitMap[conversation.charName]),
    );
    if (!isGroup && conversation.isDedicatedApp !== 'kressa') {
        const contactEntry = getCombinedContactEntries(settings).find(entry =>
            entry.name === conversation.charName || resolveInstalledCharacterName(context, entry.name) === conversation.charName);
        if (contactEntry) setHeaderContactTarget(panel, contactEntry.name);
    }
    renderConversationScreen(screenBody, { appKey: conversation.isDedicatedApp ?? null });
    editingMessageIndex = -1;
    const isTyping = generatingConversationIds.has(currentConversationId);
    renderMessages(document.getElementById('wp-messages'), conversation.messages, editingMessageIndex, isTyping, getSelectState(), (conversation.participants?.length ?? 1) > 1);
    updateRegenerateEnabled(conversation);
    // Route the tethered checkbox's checked AND disabled state (plus the mode-toggle visibility)
    // through the shared helper, so entering the conversation view freshly re-verifies the disabled
    // state against the currently-active main roleplay rather than assuming the last CHAT_CHANGED
    // left it correct. The helper reads this same conversation's tethered/isDedicatedApp fields, so
    // it reproduces exactly what the inline code did, plus the .disabled sync.
    updateRoleplayModeAvailability();
}

// SillyTavern's mobile CSS sets `body { position: fixed; overflow: hidden; }`, which breaks
// position:fixed children appended directly to <body> (confirmed against a known, already-fixed
// issue in the sibling EchoText extension, which hit this exact bug). This is why the portal used
// to be mounted as a sibling of <body> (a child of <html>) instead of a descendant of it. That
// escaped the broken-containing-block issue, but created a DIFFERENT bug: any sibling of <body>
// with a non-negative z-index automatically outranks EVERYTHING inside <body> regardless of
// magnitude, since position:fixed <body> is its own opaque stacking-context unit — so SillyTavern
// core's own toasts (#toast-container, z-index 999999) could never paint above WeyPhone's panel on
// mobile no matter how high toastr's own z-index was, proven empirically (a z-index sweep from 1
// to 2000000 on the portal made zero difference — the comparison was never happening at that
// level). Mounting inside <body> instead puts the portal back into the SAME stacking context as
// toastr's own container, where z-index comparisons actually apply — the portal's own z-index
// (below) is now deliberately kept under toastr's 999999 so toasts always win.
//
// This trades one platform-specific risk for another: the ORIGINAL position:fixed-inside-
// position:fixed body bug this portal exists to route around was iOS-Safari-specific (see the
// matching comment in Weyland-EchoText/index.js, "iOS PORTAL — escape SillyTavern's body {
// position: fixed }") and has not been re-verified on a real iOS device since this change. If
// WeyPhone's mobile positioning ever breaks specifically on iOS after this change, this is the
// first place to look — revert to document.documentElement.appendChild(portal) and accept the
// toast-behind-panel visual issue as the lesser regression until a real fix for both is found.
const WP_PORTAL_ID = 'wp-portal';

function ensurePortal() {
    let portal = document.getElementById(WP_PORTAL_ID);
    if (!portal) {
        portal = document.createElement('div');
        portal.id = WP_PORTAL_ID;
        // Static viewport units keep older WebViews functional; dynamic units override them where
        // supported so collapsing browser chrome and the on-screen keyboard resize the portal.
        portal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; width:100dvw; height:100vh; height:100dvh; z-index:999998; pointer-events:none;';
        document.body.appendChild(portal);
    }
    return portal;
}

// The mobile toggle-button position needs to clear SillyTavern's own top bar (#top-bar), whose
// rendered height varies by theme/font-size/content and isn't something CSS alone can know. Read
// it at runtime and expose it as a CSS custom property the mobile media query positions against
// (see style.css). Re-measured on resize since mobile browser chrome (address bar collapsing,
// etc.) can change the layout without a full reload.
function updateTopBarOffset() {
    const topBar = document.getElementById('top-bar');
    const bottom = topBar ? topBar.getBoundingClientRect().bottom : 0;
    document.documentElement.style.setProperty('--wp-topbar-bottom', `${Math.max(bottom, 0)}px`);
}

// Desktop-only drag-to-move for the panel, via its own header. Mobile's full-screen sheet has no
// use for this (its own media query pins top/left/right/bottom unconditionally, which this drag
// handler must never fight with) — gated behind the same width/height query the mobile CSS uses
// on the other side. Short landscape windows are treated as mobile too: there is not enough room
// to keep a floating phone on-screen and still offer a useful app viewport.
// Movement below this is a tap/click; at or above it, the gesture becomes a drag. Shared
// convention with initLockScreenGesture's own tap-vs-swipe check.
const DRAG_THRESHOLD_PX = 6;
const DESKTOP_PHONE_MEDIA = '(min-width: 769px) and (min-height: 521px)';
const FULLSCREEN_PHONE_MEDIA = '(max-width: 768px), (max-height: 520px)';

// Where the phone can be grabbed depends on lock state, like a real handset in a pocket:
//  - LOCKED: the whole top half of the phone drags it (the lock screen's unlock swipe owns the
//    bottom half — see initLockScreenGesture's matching gate).
//  - UNLOCKED: only the status bar drags it. The status bar also opens the shade on *click*, so
//    the drag only engages after DRAG_THRESHOLD_PX of movement, and a capture-phase click
//    suppressor swallows the click that browsers fire after a real drag's pointerup.
function initPanelDrag(panel) {
    let armed = false;
    let dragging = false;
    let dragConsumedClick = false;
    let startX = 0;
    let startY = 0;
    let startRight = 0;
    let startTop = 0;

    function pointerInDragZone(event) {
        if (event.target.closest('button, input, label, a, textarea, select, .wp-resize-handle')) return false;
        if (phoneState.locked) {
            const rect = panel.getBoundingClientRect();
            return (event.clientY - rect.top) < rect.height / 2;
        }
        return Boolean(event.target.closest('#wp-status-bar'));
    }

    panel.addEventListener('pointerdown', (event) => {
        if (!window.matchMedia(DESKTOP_PHONE_MEDIA).matches) return;
        if (!pointerInDragZone(event)) return;
        armed = true;
        dragging = false;
        dragConsumedClick = false;
        startX = event.clientX;
        startY = event.clientY;
        const rect = panel.getBoundingClientRect();
        const portalRect = panel.offsetParent.getBoundingClientRect();
        startRight = portalRect.right - rect.right;
        startTop = rect.top - portalRect.top;
        // No preventDefault and no capture yet — a sub-threshold tap must still become a normal
        // click (shade toggle, tap-to-unlock).
    });

    panel.addEventListener('pointermove', (event) => {
        if (!armed) return;
        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        if (!dragging) {
            if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;
            dragging = true;
            dragConsumedClick = true;
            panel.setPointerCapture(event.pointerId);
        }
        panel.style.right = `${Math.max(0, startRight - deltaX)}px`;
        panel.style.top = `${Math.max(0, startTop + deltaY)}px`;
    });

    const endDrag = () => { armed = false; dragging = false; };
    panel.addEventListener('pointerup', endDrag);
    panel.addEventListener('pointercancel', endDrag);

    // Browsers fire a click after pointerup even when the pointer travelled; swallow exactly the
    // one click that concluded a real drag so dragging by the status bar never toggles the shade
    // (capture phase, so this runs before the status bar's own click listener).
    panel.addEventListener('click', (event) => {
        if (!dragConsumedClick) return;
        dragConsumedClick = false;
        event.stopPropagation();
        event.preventDefault();
    }, true);

    // A desktop drag can leave inline style.top/style.right on the panel, and native CSS
    // `resize: both` can leave inline style.width/style.height. If the browser window is then
    // resized down across the mobile breakpoint while the panel is still open, those inline
    // styles would win the cascade over the mobile media query's own top/left/right/bottom/
    // width/height rules (inline styles always beat stylesheet rules, media query or not),
    // visually conflicting with the full-screen sheet layout. Clear them the moment we cross
    // into mobile width so the mobile rules take over cleanly.
    const mobileQuery = window.matchMedia(FULLSCREEN_PHONE_MEDIA);
    const clearInlinePositionOnMobile = (event) => {
        if (event.matches) {
            panel.style.removeProperty('top');
            panel.style.removeProperty('right');
            panel.style.removeProperty('width');
            panel.style.removeProperty('height');
        }
    };
    if (mobileQuery.addEventListener) {
        mobileQuery.addEventListener('change', clearInlinePositionOnMobile);
    } else {
        // Safari <14 fallback.
        mobileQuery.addListener(clearInlinePositionOnMobile);
    }
}

// Desktop-only 8-direction custom resize, replacing native CSS `resize: both` (which only offered
// a single browser-fixed bottom-right handle that grows in document-flow terms — but this panel is
// positioned via `right`, not `left`, so growing width via native resize pushed the LEFT edge
// outward while the right edge stayed pinned, reading as "grows toward the left" and fighting the
// cursor instead of tracking it). Each of the 8 handle elements below lets its own edge/corner
// track the cursor directly, with the OPPOSITE edge staying fixed — standard desktop window-
// manager resize behavior. No matchMedia guard is needed here the way initPanelDrag needs one on
// its own always-visible header: the 8 handle elements are display:none whenever the fullscreen
// phone query is active (see style.css), and a hidden element never receives pointer events, so
// this is inert on mobile and in short landscape windows by construction.
function initPanelResize(panel) {
    const MIN_WIDTH = 280;
    const MIN_HEIGHT = 320;
    let resizingDir = null;
    let startX = 0;
    let startY = 0;
    let startTop = 0;
    let startRight = 0;
    let startWidth = 0;
    let startHeight = 0;
    // Separate max ceiling per edge — EVERY direction has an implicit opposite edge that must
    // stay within the viewport, not just 'e'/'n':
    //   - 'e' keeps the left edge fixed (by construction, see pointermove below); growth is
    //     bounded by startRight+startWidth so the panel's own right edge can't be pushed past the
    //     right side of the viewport.
    //   - 'w' keeps the right edge fixed; growth is bounded by (viewport width - startRight) so
    //     the panel's LEFT edge can't be pushed past the left side of the viewport. (An earlier
    //     version of this fix wrongly gave 'w' only the flat viewport-relative ceiling with no
    //     left-edge protection at all — reproducible off-screen bug: drag the panel toward the
    //     right first via the header, then an extreme 'w' resize pushes the panel's left edge to a
    //     negative x-coordinate, off the left side of the screen entirely.)
    //   - 'n' keeps the bottom edge fixed; growth is bounded by startTop+startHeight so the top
    //     edge can't go past the top of the viewport.
    //   - 's' keeps the top edge fixed; growth is bounded by (viewport height - startTop) so the
    //     BOTTOM edge can't be pushed past the bottom of the viewport (same class of bug as 'w'
    //     above, mirrored on the vertical axis — reproducible from the panel's own default
    //     position with no prior drag needed, since its default top offset already leaves less
    //     than 90vh of room below it).
    let maxWidthForE = 0;
    let maxWidthForW = 0;
    let maxHeightForN = 0;
    let maxHeightForS = 0;

    panel.querySelectorAll('.wp-resize-handle').forEach((handle) => {
        const dir = handle.dataset.dir;

        handle.addEventListener('pointerdown', (event) => {
            resizingDir = dir;
            startX = event.clientX;
            startY = event.clientY;
            const rect = panel.getBoundingClientRect();
            const portalRect = panel.offsetParent.getBoundingClientRect();
            startTop = rect.top - portalRect.top;
            startRight = portalRect.right - rect.right;
            startWidth = rect.width;
            startHeight = rect.height;
            // See the declaration comment above for why each direction needs its own cap, not a
            // shared one — every direction has an implicit opposite edge that must stay on-screen.
            maxWidthForE = Math.min(window.innerWidth * 0.9, startRight + startWidth);
            maxWidthForW = Math.min(window.innerWidth * 0.9, window.innerWidth - startRight);
            maxHeightForN = Math.min(window.innerHeight * 0.9, startTop + startHeight);
            maxHeightForS = Math.min(window.innerHeight * 0.9, window.innerHeight - startTop);
            handle.setPointerCapture(event.pointerId);
            event.preventDefault();
            // Stop this from also being seen as a header drag-to-move if a handle ever visually
            // overlaps the header (the north handle sits right at the header's top edge). This is
            // likely unreachable in practice since the handles are DOM siblings of the header, not
            // descendants, so bubbling could never reach the header's own listener anyway — the
            // real protection there is z-index stacking (the handle paints on top and receives the
            // pointerdown first). Kept as harmless defensive code in case that DOM relationship
            // ever changes.
            event.stopPropagation();
        });

        handle.addEventListener('pointermove', (event) => {
            if (resizingDir !== dir) return;
            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;
            let newTop = startTop;
            let newRight = startRight;
            let newWidth = startWidth;
            let newHeight = startHeight;

            // Each edge tracks the cursor directly; the opposite edge/corner stays fixed. See the
            // task brief this function was built from for the full derivation — summary: for 'e'/'n'
            // (the edges where the far side is expressed via a separate top/right offset rather
            // than being implicit), the offset must move by however much the size ACTUALLY changed
            // (post-clamp), not by the raw cursor delta, so the fixed opposite edge stays truly
            // fixed even when a resize hits the min/max clamp.
            if (dir.includes('e')) {
                newWidth = Math.min(Math.max(startWidth + deltaX, MIN_WIDTH), maxWidthForE);
                newRight = startRight - (newWidth - startWidth);
            }
            if (dir.includes('w')) {
                newWidth = Math.min(Math.max(startWidth - deltaX, MIN_WIDTH), maxWidthForW);
            }
            if (dir.includes('n')) {
                newHeight = Math.min(Math.max(startHeight - deltaY, MIN_HEIGHT), maxHeightForN);
                newTop = startTop - (newHeight - startHeight);
            }
            if (dir.includes('s')) {
                newHeight = Math.min(Math.max(startHeight + deltaY, MIN_HEIGHT), maxHeightForS);
            }

            panel.style.top = `${Math.max(0, newTop)}px`;
            panel.style.right = `${Math.max(0, newRight)}px`;
            panel.style.width = `${newWidth}px`;
            panel.style.height = `${newHeight}px`;
        });

        const endResize = () => { if (resizingDir === dir) resizingDir = null; };
        handle.addEventListener('pointerup', endResize);
        handle.addEventListener('pointercancel', endResize);
    });
}

// Re-evaluates whether a main roleplay is currently active and syncs the tethered toggle's
// disabled state accordingly — called once on load and again every time SillyTavern's own
// CHAT_CHANGED event fires, so switching characters/chats in the main window updates the toggle
// live without requiring the WeyPhone panel to be closed and reopened.
function isKressaConversation(conversation) {
    return conversation?.isDedicatedApp === 'kressa' || String(conversation?.charName ?? '').trim().toLowerCase() === 'kressa';
}

function isLiteralKressaRoleplay(context) {
    if (context.groupId || context.characterId === undefined) return false;
    const activeCharacter = context.characters?.[context.characterId];
    return String(activeCharacter?.name ?? context.name2 ?? '').trim().toLowerCase() === 'kressa';
}

function updateRoleplayModeAvailability() {
    const picker = document.getElementById('wp-roleplay-mode-picker');
    if (!picker || !currentConversationId) return;
    const context = SillyTavern.getContext();
    const active = isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId });
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, currentConversationId);
    if (!conversation) return;
    const storedMode = getRoleplayMode(conversation);
    // A writable link belongs to the chat where the user selected it. Opening another roleplay
    // presents the DM as Unlinked rather than silently carrying that write access across stories.
    const mode = storedMode === ROLEPLAY_MODES.LINKED && !isConversationLinkedToChat(conversation, context.chatId)
        ? ROLEPLAY_MODES.UNLINKED
        : storedMode;
    const kressaRestricted = isKressaConversation(conversation) && !isLiteralKressaRoleplay(context);
    const linkedAvailable = active && !kressaRestricted;
    setRoleplayModePickerState(picker, {
        mode,
        roleplayActive: active,
        linkedAvailable,
        linkedUnavailableReason: kressaRestricted
            ? 'Linked is available only while the main roleplay is Kressa’s character-card chat.'
            : '',
    });
}

// CHAT_CHANGED fires the instant a chat opens OR closes (context.chatId flips to a value or back
// to undefined) — reacting here means the header icon drops the moment lore actually becomes
// available, instead of waiting for the user to leave and re-enter the conversation screen for
// showScreen's own check to rerun.
function updateLoreWarningAvailability() {
    const loreWarningButton = document.getElementById('wp-lore-warning-button');
    if (!loreWarningButton) return;
    const context = SillyTavern.getContext();
    loreWarningButton.classList.toggle('wp-lore-warning-visible', currentView === 'conversation' && !context.chatId);
}

// Re-renders the Home app grid (recomputing which flavor tiles should be enabled/disabled) if
// it's currently the visible screen — called on the same CHAT_CHANGED event as
// updateTetheredToggleAvailability, so activating/deactivating a main roleplay chat updates the
// grid live. Previously only showScreen('home') itself recomputed flavorAppsEnabled, so the grid
// stayed stuck at whatever it was when the panel was last opened until it was closed and reopened.
function refreshHomeScreenAvailability() {
    if (currentView !== 'home') return;
    showScreen('home');
}

// ---------------------------------------------------------------------------
// Phone-shell surfaces: status bar, lock screen, notification shade
// ---------------------------------------------------------------------------

// RP-clock (Settings app, default off): show the roleplay's own time — parsed from the most
// recent "¦¦ … ~ 9:28 AM ~ … ¦¦" scene header — instead of the real clock. Fails closed: no
// parseable header (or toggle off) → real time.
function resolveRpTime() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    if (!settings.ui?.rpClockEnabled) return null;
    return findMostRecentRpTime(context.chat);
}

function formatTetherClockTime(timestamp) {
    return resolveRpTime()?.time ?? formatClockTime(timestamp);
}

// Meta battery mode: percent = remaining daily messages (Settings toggle). The quota lookup
// is throttled inside helixQuota.js, so calling this from every 30s render tick is fine; when
// a fresh value lands, the onUpdate re-render paints it. Falls back to the theatrical drain
// whenever the real number is unknowable (toggle off, no key, fetch failed, unlimited plan).
function handleBatteryQuotaUpdate() {
    renderStatusBarNow();
    if (currentView === 'settings-app') showScreen('settings-app');
}

function resolveBatteryPercent(settings) {
    if (settings.ui?.batteryTracker) {
        refreshRemainingMessages(SillyTavern.getContext(), handleBatteryQuotaUpdate);
        const quota = getQuotaSnapshot(SillyTavern.getContext());
        const tracked = trackerBatteryLevel(quota.remaining, quota.limit);
        if (tracked !== null) return tracked;
    }
    return batteryLevel(phoneState.batteryStart, Date.now() - phoneState.sessionStart);
}

function renderStatusBarNow() {
    const rpTime = resolveRpTime();
    const settings = getSettings(SillyTavern.getContext().extensionSettings);
    renderStatusBar({
        clockText: rpTime?.time ?? formatClockTime(Date.now()),
        battery: resolveBatteryPercent(settings),
        dnd: phoneState.dnd,
        airplane: phoneState.airplane,
    });
}

function renderLockScreenNow() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const now = new Date();
    const rpTime = resolveRpTime();
    const unread = getNotifications(settings, context.chatId).filter(n => !n.read).slice(0, 4);
    renderLockScreen({
        clockText: rpTime?.time ?? formatClockTime(now.getTime()),
        dateText: rpTime
            ? `${rpTime.weekday}, ${rpTime.date}`
            : now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
        notifications: unread.map(n => ({ ...n, appIcon: getApp(n.appKey)?.icon })),
    });
}

// Applies the Settings-app wallpaper choice to the #wp-wallpaper layer — a preset key resolves to
// its gradient, anything else is treated as a custom image URL.
function applyWallpaper() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const wallpaper = document.getElementById('wp-wallpaper');
    if (!wallpaper) return;
    const value = settings.ui?.wallpaper ?? 'default';
    const preset = WALLPAPER_PRESETS[value];
    if (preset) {
        wallpaper.style.background = preset.css;
        return;
    }

    const positionX = Math.min(100, Math.max(0, Number(settings.ui?.wallpaperPositionX) || 0));
    const positionY = Math.min(100, Math.max(0, Number(settings.ui?.wallpaperPositionY) || 0));
    const dim = Math.min(80, Math.max(0, Number(settings.ui?.wallpaperDim) || 0)) / 100;
    const lightWash = Math.min(80, Math.max(0, Number(settings.ui?.wallpaperLightWash) || 0)) / 100;
    const safeUrl = value.replace(/"/g, '%22');
    // A black gradient is preferable to changing the layer's opacity: opacity would reveal the
    // host UI behind the phone, while dimming consistently makes icons/text easier to read.
    wallpaper.style.background = '#131313';
    wallpaper.style.backgroundImage = `linear-gradient(rgba(255,255,255,${lightWash}), rgba(255,255,255,${lightWash})), linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim})), url("${safeUrl}")`;
    wallpaper.style.backgroundPosition = `center, center, ${positionX}% ${positionY}%`;
    wallpaper.style.backgroundSize = 'auto, auto, cover';
    wallpaper.style.backgroundRepeat = 'no-repeat';
}

function renderShadeNow() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    renderShade({
        notifications: getNotifications(settings, context.chatId).map(n => ({ ...n, appIcon: getApp(n.appKey)?.icon })),
        formatRelativeTime,
        syncing: isSyncInFlight(),
        airplane: phoneState.airplane,
        dnd: phoneState.dnd,
        syncEnabled: isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId }),
    });
}

function setLocked(locked) {
    phoneState.locked = locked;
    const panel = document.getElementById('wp-panel');
    if (panel) panel.dataset.locked = String(locked);
    if (locked) {
        setShadeOpen(false);
        renderLockScreenNow();
    } else {
        setDimmed(false); // waking always lands on a lit screen
    }
}

// "Screen off": a pure-black layer over the whole phone, like a real handset dimming on its lock
// screen. Tap anywhere on the dark glass to wake back to the lock screen.
function setDimmed(dimmed) {
    phoneState.dimmed = dimmed;
    const panel = document.getElementById('wp-panel');
    if (panel) panel.dataset.dimmed = String(dimmed);
}

function setShadeOpen(open) {
    phoneState.shadeOpen = open;
    const shade = document.getElementById('wp-shade');
    if (shade) shade.classList.toggle('wp-shade-open', open);
    if (open) renderShadeNow();
}

// Navigates from a notification tap to the app it came from, marking that app's items read.
function openNotificationTarget(appKey) {
    const app = getApp(appKey);
    if (!app) return;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    markAppNotificationsRead(settings, context.chatId, appKey);
    queueWeyPhoneSave(context);
    setShadeOpen(false);
    if (app.screenView === 'phone-app') {
        currentPhoneApp = appKey;
        showScreen('phone-app');
    } else {
        showScreen(app.screenView === 'contacts-app' ? 'contacts' : app.screenView);
    }
}

function handleShadeClick(event) {
    const tile = event.target.closest('.wp-quick-tile');
    if (tile) {
        const kind = tile.dataset.tile;
        if (kind === 'sync') {
            runUnifiedRefresh();
            renderShadeNow();
        } else if (kind === 'airplane') {
            phoneState.airplane = !phoneState.airplane;
            renderStatusBarNow();
            renderShadeNow();
            refreshHomeScreenAvailability();
        } else if (kind === 'dnd') {
            phoneState.dnd = !phoneState.dnd;
            renderStatusBarNow();
            renderShadeNow();
        } else if (kind === 'lock') {
            setLocked(true);
        }
        return;
    }
    const clearBtn = event.target.closest('#wp-shade-clear');
    if (clearBtn) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        clearNotifications(settings, context.chatId);
        queueWeyPhoneSave(context);
        renderShadeNow();
        refreshHomeScreenAvailability();
        return;
    }
    const notification = event.target.closest('.wp-shade-notification');
    if (notification) {
        openNotificationTarget(notification.dataset.app);
        return;
    }
    // Tapping the dimmed area outside the shade panel closes it.
    if (event.target.id === 'wp-shade') setShadeOpen(false);
}

// Swipe-up-to-unlock (with plain click as the desktop-friendly fallback). Pointer events cover
// mouse + touch in one path. Only the BOTTOM half of the lock screen owns the unlock gesture —
// the top half is the locked phone's drag handle (see initPanelDrag's matching gate), which is
// also why the "swipe up to unlock" hint sits at the bottom.
function initLockScreenGesture(lockScreen) {
    let startY = null;
    lockScreen.addEventListener('pointerdown', (event) => {
        if (event.target.closest('button')) return; // reserve any future lock-screen controls
        const rect = lockScreen.getBoundingClientRect();
        if ((event.clientY - rect.top) < rect.height / 2) return; // top half → panel drag zone
        startY = event.clientY;
        lockScreen.setPointerCapture(event.pointerId);
    });
    lockScreen.addEventListener('pointermove', (event) => {
        if (startY === null) return;
        const delta = Math.max(0, startY - event.clientY);
        lockScreen.style.transform = `translateY(-${delta}px)`;
        lockScreen.style.opacity = String(Math.max(0.35, 1 - delta / 260));
    });
    const finish = (event) => {
        if (startY === null) return;
        const delta = startY - event.clientY;
        lockScreen.style.transform = '';
        lockScreen.style.opacity = '';
        startY = null;
        if (delta > 70 || Math.abs(delta) < 6) {
            // A real upward swipe — or a simple tap — unlocks.
            setLocked(false);
        }
    };
    lockScreen.addEventListener('pointerup', finish);
    lockScreen.addEventListener('pointercancel', () => {
        lockScreen.style.transform = '';
        lockScreen.style.opacity = '';
        startY = null;
    });
}

function captureKnownNames(context, settings) {
    // Directory labels are WeyPhone's canonical display identities. Installed cards and roster
    // entries are appended only when they do not describe somebody already present, preventing
    // "Sayori Akiyama" and "Professor Akiyama" from becoming two competing capture targets.
    const candidates = [
        ...getCastEntries(settings).map(entry => entry.name),
        ...contactLorebookState.registrarContacts.map(entry => entry.name),
        ...context.characters.map(character => character.name),
        ...WEYLAND_ROSTER.map(character => character.name),
    ].filter(Boolean);
    const names = [];
    for (const candidate of candidates) {
        if (!names.some(name => characterNamesEquivalent(name, candidate))) names.push(candidate);
    }
    return names;
}

function findCapturedThread(settings, participants, chatId) {
    const conversations = Object.values(settings.conversations);
    const linkedThread = conversations.find(conversation => isConversationLinkedToChat(conversation, chatId)
        && sameParticipants(conversation.participants?.length ? conversation.participants : [conversation.charName], participants));
    // A user can explicitly Link an existing ordinary DM before the first in-roleplay phone block
    // arrives. Route the reply into that thread instead of creating a visually identical duplicate.
    if (linkedThread) return linkedThread;
    // Return a disconnected captured origin only as a sentinel: the capture loop will skip it,
    // honoring Unlinked/Observe instead of creating a duplicate that silently reconnects itself.
    return conversations.find(conversation => conversation.roleplayTether
        && conversation.roleplayChatId === chatId
        && sameParticipants(conversation.participants?.length ? conversation.participants : [conversation.charName], participants));
}

/** Copy settled Phone¦/Texting¦ blocks into WeyPhone before the formatter sees them. */
function handleRoleplayPhoneCapture(messageId, options = {}) {
    try {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const manual = options && typeof options === 'object' && options.manual === true;
        if ((!manual && !settings.captureRoleplayTextsEnabled) || !context.chatId) return 0;
        const message = context.chat?.[Number(messageId)];
        if (!message || message.is_user || typeof message.mes !== 'string') return 0;
        const scopes = locatePhoneScopes(message.mes);
        if (!scopes.length) return 0;
        const knownNames = captureKnownNames(context, settings);
        const capturedScopes = [];
        let capturedCount = 0;
        for (const scope of scopes) {
            const routed = routePhoneScope(scope, {
                userName: context.name1 || 'User',
                knownNames,
                userNicknames: Object.values(settings.conversations)
                    .filter(conversation => conversation.roleplayChatId === context.chatId)
                    .map(conversation => conversation.userNickname).filter(Boolean),
            });
            if (!routed) continue;
            let conversation = findCapturedThread(settings, routed.participants, context.chatId);
            // Unlinked and Observe are intentionally one-way/non-participating. If a previously
            // captured thread was disconnected, do not silently reconnect it merely because the
            // model printed another phone block; the user can select Linked and manually rescan.
            if (conversation && !canCapturePhoneScopeIntoConversation(conversation, routed.mode, context.chatId)) continue;
            if (!conversation) {
                const soloName = routed.participants[0];
                const label = routed.title || routed.participants.join(', ');
                const installed = resolveInstalledCharacterName(context, soloName);
                const rosterEntry = getCombinedContactEntries(settings).find(entry => routed.participants.some(name => name === entry.name));
                const initialRoleplayMode = initialRoleplayModeForPhoneScope(routed.mode);
                conversation = createConversation(settings, routed.participants.length === 1 ? soloName : label, {
                    participants: routed.participants,
                    displayName: routed.title,
                    roleplayWireMode: routed.mode || null,
                    roleplayChatId: context.chatId,
                    roleplayTether: true,
                    roleplayMode: initialRoleplayMode,
                    lorebookContact: routed.participants.length > 1 || !installed,
                    lorebookName: rosterEntry?.lorebookName || 'Weyland',
                    hasHistory: true,
                });
                if (routed.participants.length > 1) {
                    conversation.participantBooks = Object.fromEntries(routed.participants.map(name => {
                        const entry = getCombinedContactEntries(settings).find(candidate => candidate.name === name) ?? { name };
                        return [name, resolveSubbotBook(entry) || 'Weyland'];
                    }));
                }
                setTetheredSettings(settings, conversation.id, {
                    roleplayMode: initialRoleplayMode,
                    roleplayChatId: context.chatId,
                    roleplayTether: true,
                });
            } else if (!conversation.displayName && routed.title) {
                conversation.displayName = routed.title;
            }
            // Repair a legacy solo capture that used the character's saved name for the user as
            // the local thread title (for example, Rivera's thread appearing as "Nova"). Do not
            // touch unrelated custom thread names.
            if (routed.mode === 'solo' && routed.userNickname
                && conversation.displayName === routed.userNickname) {
                conversation.displayName = routed.title;
            }
            if (routed.mode) conversation.roleplayWireMode = routed.mode;
            if (!conversation.userNickname && routed.userNickname) conversation.userNickname = routed.userNickname;
            const newMessages = dedupeCapturedMessages(routed.messages, conversation.messages);
            const addedMessages = [];
            for (const captured of newMessages) {
                const added = {
                    ...captured,
                    timestamp: genTimestamp(),
                    mainChatAnchor: context.chat.length,
                    capturedFromRoleplay: true,
                };
                appendMessage(settings, conversation.id, added);
                addedMessages.push(added);
                capturedCount++;
            }
            if (!manual) recordIncomingDmNotification(context, settings, conversation.id, conversation, addedMessages);
            capturedScopes.push(scope);
        }
        if (!capturedScopes.length || capturedCount === 0) return 0;
        queueWeyPhoneSave(context);
        refreshVisibleScreen();
        if (!options?.silent) {
            pushLogLine(`Captured ${capturedCount} roleplay text${capturedCount === 1 ? '' : 's'} into WeyPhone`);
            wpToast('success', `Captured ${capturedCount} roleplay text${capturedCount === 1 ? '' : 's'} into WeyPhone.`);
        }
        return capturedCount;
    } catch (error) {
        console.error('[WeyPhone] Roleplay text capture failed:', error);
        return 0;
    }

}

async function captureExistingRoleplay({ all = false } = {}) {
    const context = SillyTavern.getContext();
    if (!context.chatId || !Array.isArray(context.chat)) {
        wpToast('info', 'Open a roleplay first.');
        return;
    }
    const candidateIds = context.chat
        .map((message, index) => ({ message, index }))
        .filter(item => !item.message?.is_user && typeof item.message?.mes === 'string')
        .map(item => item.index);
    const ids = all ? candidateIds : candidateIds.slice(-1);
    let total = 0;
    for (const id of ids) {
        const captured = handleRoleplayPhoneCapture(id, { manual: true, silent: true });
        if (!captured) continue;
        total += captured;
    }
    if (total) {
        pushLogLine(`Manually imported ${total} roleplay text${total === 1 ? '' : 's'}`);
        wpToast('success', `Imported ${total} roleplay text${total === 1 ? '' : 's'} into WeyPhone.`);
    } else {
        wpToast('info', 'No compatible uncaptured phone blocks were found.');
    }
}

async function weyPhoneMainChatInterceptor() {
    try {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        // Linked is a per-conversation decision. Automatic capture is independently controlled
        // by captureRoleplayTextsEnabled and does not change a thread's selected mode.
        const active = Boolean(context.chatId);
        const plan = active
            ? buildTetherInjectionPlan({
                conversations: Object.values(settings.conversations),
                chatId: context.chatId,
                chatLength: context.chat?.length ?? 0,
                chat: context.chat,
                userName: context.name1 || 'User',
                formatClockTime: formatTetherClockTime,
            })
            : { caution: null, groups: [] };
        const reconciled = reconcileTetherPrompts(plan, tetherPromptKeys);
        for (const op of reconciled.ops) {
            context.setExtensionPrompt(op.key, op.content, op.position, op.depth, op.scan ?? false, op.role);
        }
        tetherPromptKeys = reconciled.nextKeys;
    } catch (error) {
        console.error('[WeyPhone] Roleplay text injection failed:', error);
    }
}
// The manifest loader resolves generate_interceptor from the page Window. Assign both spellings
// explicitly because some extension sandboxes expose a module-scoped globalThis proxy.
globalThis.weyPhoneMainChatInterceptor = weyPhoneMainChatInterceptor;
if (typeof window !== 'undefined') window.weyPhoneMainChatInterceptor = weyPhoneMainChatInterceptor;

function initPanel() {
    // The original fan build (WeylandTavern-WeyPhone-main) shares this extension's settings key
    // and DOM ids — running both at once would double-render and fight over state. First one to
    // load wins; the duplicate refuses to initialize.
    if (document.getElementById('wp-panel')) {
        console.warn('[WeyPhone] Another WeyPhone panel already exists — is the old fan extension still enabled? Skipping init.');
        toastr.warning('Two copies of WeyPhone are enabled. Disable/delete the old "WeylandTavern-WeyPhone-main" extension.', 'WeyPhone');
        return;
    }
    ensurePortal().insertAdjacentHTML('beforeend', createPanelMarkup());

    updateTopBarOffset();
    window.addEventListener('resize', updateTopBarOffset);
    window.visualViewport?.addEventListener('resize', updateTopBarOffset);

    const panel = document.getElementById('wp-panel');
    panel.dataset.mobilePlatform = /Android/i.test(navigator.userAgent)
        ? 'android'
        : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'other';
    const openHeaderContact = () => {
        const contactName = panel.dataset.headerContact;
        if (!contactName) return;
        currentContactName = contactName;
        showScreen('contact-detail');
    };
    for (const element of [document.getElementById('wp-panel-avatar'), document.getElementById('wp-panel-title')]) {
        element.addEventListener('click', openHeaderContact);
        element.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            openHeaderContact();
        });
    }
    const closeButton = document.getElementById('wp-panel-close');
    const sleepButton = document.getElementById('wp-status-sleep');
    const backButton = document.getElementById('wp-back-button');
    const composeButton = document.getElementById('wp-compose-button');
    const groupComposeButton = document.getElementById('wp-group-compose-button');
    const helpButton = document.getElementById('wp-help-button');
    const helpDialog = document.getElementById('wp-app-help');

    initPanelDrag(panel);
    initPanelResize(panel);

    // On narrow/mobile viewports the panel becomes a full-screen sheet (see style.css) and can
    // visually cover the toggle button, so open/close state is tracked explicitly here rather
    // than relying on the toggle button always being reachable to close it again.
    function setPanelOpen(open) {
        panel.classList.toggle('wp-open', open);
        if (open) {
            // Picking the phone up always lands on the lock screen — the diegetic entry point.
            showScreen('home');
            setLocked(true);
            renderStatusBarNow();
            maybeShowOnboarding();
            void refreshWeyPhoneSettings(SillyTavern.getContext()).then(changed => {
                if (!changed) return;
                applyWallpaper();
                renderStatusBarNow();
                renderLockScreenNow();
                renderShadeNow();
                showScreen(currentView);
            });
        }
    }

    // First pickup ever: paginated intro cards over the whole screen. Deliberately button-only
    // (no swipe-to-dismiss) so the message-budget warning on the last card can't be skipped past
    // by accident. settings.ui.onboarded is set only when "Let's go" is pressed.
    const onboardingEl = document.getElementById('wp-onboarding');
    onboardingEl.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.id === 'wp-onboard-prev') {
            onboardingPage = clampOnboardingPage(onboardingPage - 1);
            renderOnboarding(onboardingEl, { pageIndex: onboardingPage });
        } else if (button.id === 'wp-onboard-next') {
            if (onboardingPage >= ONBOARDING_PAGES.length - 1) {
                const context = SillyTavern.getContext();
                const settings = getSettings(context.extensionSettings);
                settings.ui.onboarded = true;
                queueWeyPhoneSave(context);
                onboardingEl.style.display = 'none';
            } else {
                onboardingPage = clampOnboardingPage(onboardingPage + 1);
                renderOnboarding(onboardingEl, { pageIndex: onboardingPage });
            }
        }
    });

    // WeyTav already exposes a phone button in the main chatbar. Its old Quick Reply command is
    // superseded by WeyPhone, so intercept that dynamically-rendered button in capture phase and
    // use it as the single launcher. Capture phase prevents the obsolete !Phone QR from firing.
    document.addEventListener('click', (event) => {
        const launcher = event.target.closest('[title="View Character\'s Phone"]');
        if (!launcher) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setPanelOpen(!panel.classList.contains('wp-open'));
    }, true);
    closeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        setPanelOpen(false);
    });
    sleepButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (phoneState.locked) setDimmed(true);
    });
    const goBack = () => {
        if (currentView === 'twitter-following') {
            showScreen('twitter-feed');
        } else if (currentView === 'twitter-profile') {
            showScreen('twitter-following');
        } else if (currentView === 'saved-posts') {
            showScreen(currentSavedAppKey === 'feed' ? 'twitter-feed' : 'phone-app');
        } else if (currentView === 'contact-detail') {
            showScreen('contacts-app');
        } else if (currentView === 'note-editor') {
            showScreen('notes');
        } else if (currentView === 'kressa-settings') {
            showScreen('conversation');
        } else if (currentView === 'app-names') {
            showScreen('settings-app');
        } else if (currentView === 'character-wallpapers') {
            showScreen('settings-app');
        } else if (currentView === 'calculator-settings') {
            showScreen('calculator');
        } else if (currentView === 'group-compose') {
            groupSelectionNames = [];
            groupDraftTitle = '';
            showScreen('contacts');
        } else if (currentView === 'thread-details') {
            showScreen('conversation');
        } else if (currentView === 'threads' && currentThreadsAppKey === 'kressa') {
            showScreen('conversation');
        } else if (currentView === 'memory' || currentView === 'conversation') {
            if (currentView === 'memory') {
                showScreen('conversation');
            } else {
                const settings = getSettings(SillyTavern.getContext().extensionSettings);
                const conversation = getConversation(settings, currentConversationId);
                showScreen(conversation?.isDedicatedApp === 'kressa' ? 'home' : 'messages');
            }
        } else if (currentView !== 'home') {
            showScreen('home');
        }
    };
    backButton.addEventListener('click', goBack);
    composeButton.addEventListener('click', () => showScreen('contacts'));
    groupComposeButton.addEventListener('click', () => {
        groupSelectionNames = [];
        groupDraftTitle = '';
        showScreen('group-compose');
    });
    helpButton.addEventListener('click', () => {
        if (!helpButton.dataset.appKey) return;
        renderAppHelpDialog(helpDialog, {
            appKey: helpButton.dataset.appKey,
            appLabel: helpButton.dataset.appLabel,
        });
    });
    document.getElementById('wp-lore-warning-button').addEventListener('click', () => {
        renderNoticeDialog(helpDialog, {
            kicker: 'Heads up',
            title: 'Lore isn’t fully loaded yet',
            body: 'Weyland’s character and location lore only stays loaded while a chat is open — it doesn’t matter which one. Until then, replies here may be missing details they\'d normally know.',
            bullets: ['Open any character or chat in WeylandTavern.', 'Continue on your phone. Since a chat is loaded, WeyPhone now has access to all of Weyland’s lorebook.', 'This warning comes back if you close out of every chat.'],
        });
    });
    helpDialog.addEventListener('click', event => {
        if (!event.target.closest('[data-help-close]')) return;
        helpDialog.hidden = true;
        helpDialog.innerHTML = '';
    });
    document.getElementById('wp-kressa-settings-button').addEventListener('click', () => showScreen('kressa-settings'));
    // Housing's registrar toggle rebuilds the iframe with/without ?registrar=true (the map page
    // gates the whole feature on that query param).
    document.getElementById('wp-registrar-checkbox').addEventListener('change', (event) => {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.housingRegistrarEnabled = event.target.checked;
        queueWeyPhoneSave(context);
        if (currentView === 'housing') {
            renderHousingScreen(document.getElementById('wp-screen-body'), { registrarEnabled: settings.housingRegistrarEnabled });
        }
    });

    // Android nav bar: back / home pill / lock.
    document.getElementById('wp-nav-back').addEventListener('click', goBack);
    document.getElementById('wp-nav-home').addEventListener('click', () => showScreen('home'));
    document.getElementById('wp-nav-lock').addEventListener('click', () => setLocked(true));

    // Status bar: tap toggles the notification shade (drag-down also works, below).
    const statusBar = document.getElementById('wp-status-bar');
    statusBar.addEventListener('click', () => {
        if (!phoneState.locked) setShadeOpen(!phoneState.shadeOpen);
    });
    document.getElementById('wp-shade').addEventListener('click', handleShadeClick);
    initLockScreenGesture(document.getElementById('wp-lock-screen'));
    // Screen off / wake — like resting a real phone face-up.
    document.getElementById('wp-dim-overlay').addEventListener('click', () => setDimmed(false));

    // Live clock/battery tick — cheap full status-bar re-render every 30s.
    renderStatusBarNow();
    setInterval(renderStatusBarNow, 30_000);
    applyWallpaper();

    // Delegated fallback-swap for portrait images — 'error'
    // events don't bubble, so this must be attached with `capture: true` to still catch it via
    // delegation on the whole panel (avatars render both inside #wp-screen-body, which is
    // replaced wholesale on navigation, and in the persistent #wp-panel-avatar header slot).
    panel.addEventListener('error', (event) => {
        const img = event.target;
        if (!(img instanceof HTMLImageElement)) return;
        const fallbackUrl = img.dataset.fallbackUrl;
        if (fallbackUrl) {
            delete img.dataset.fallbackUrl;
            img.src = fallbackUrl;
            return;
        }
        const placeholderUrl = img.dataset.placeholderUrl;
        if (!placeholderUrl) return;
        delete img.dataset.placeholderUrl;
        img.src = placeholderUrl;
    }, true);

    updateRoleplayModeAvailability();
    const context = SillyTavern.getContext();
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, handleRoleplayPhoneCapture);
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, updateRoleplayModeAvailability);
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, refreshHomeScreenAvailability);
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, updateLoreWarningAvailability);
    const refreshAfterResume = () => {
        if (document.visibilityState === 'hidden') return;
        void refreshWeyPhoneSettings(SillyTavern.getContext()).then(changed => {
            if (!changed) return;
            applyWallpaper();
            renderStatusBarNow();
            renderLockScreenNow();
            renderShadeNow();
            if (panel.classList.contains('wp-open')) showScreen(currentView);
        });
    };
    window.addEventListener('focus', refreshAfterResume);
    document.addEventListener('visibilitychange', refreshAfterResume);

    // Closes the Regenerate popup menu on any click outside it — the menu's own toggle/item
    // clicks are handled inside handleScreenBodyClick above and are excluded here since they
    // land inside #wp-regenerate-wrapper.
    document.addEventListener('click', (event) => {
        const menu = document.getElementById('wp-regenerate-menu');
        if (!menu || menu.hidden) return;
        if (event.target.closest('#wp-regenerate-wrapper')) return;
        menu.hidden = true;
    });

    // Screen content is fully replaced on every navigation (see showScreen), so listeners are
    // delegated on the stable #wp-screen-body container rather than attached to elements that
    // get destroyed and recreated.
    const screenBody = document.getElementById('wp-screen-body');
    screenBody.addEventListener('click', handleScreenBodyClick);
    screenBody.addEventListener('change', handleScreenBodyChange);
    screenBody.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.id === 'wp-input') {
            handleQueueMessage();
        }
    });
    // Notes editor — persist on every keystroke (saveSettingsDebounced coalesces the writes).
    screenBody.addEventListener('input', (event) => {
        if (handleWallpaperRangeInput(event.target)) return;
        if (event.target.id === 'wp-group-title') {
            groupDraftTitle = event.target.value;
            return;
        }
        if (event.target.id === 'wp-contact-context') {
            const contactContext = SillyTavern.getContext();
            const contactSettings = getSettings(contactContext.extensionSettings);
            const name = event.target.dataset.charName;
            if (event.target.value.trim()) contactSettings.contactContexts[name] = event.target.value;
            else delete contactSettings.contactContexts[name];
            queueWeyPhoneSave(contactContext);
            return;
        }
        if (event.target.id !== 'wp-note-text') return;
        const noteContext = SillyTavern.getContext();
        const noteSettings = getSettings(noteContext.extensionSettings);
        updateNote(noteSettings, event.target.dataset.noteId, { text: event.target.value });
        queueWeyPhoneSave(noteContext);
    });
    // Live Contacts search — re-render the list on every keystroke, restoring input focus (the
    // whole screen body is replaced by the re-render, input element included).
    screenBody.addEventListener('input', (event) => {
        if (event.target.id !== 'wp-contact-search') return;
        contactsQuery = event.target.value;
        if (currentView !== 'contacts-app') return;
        showScreen('contacts-app');
        const search = document.getElementById('wp-contact-search');
        if (search) {
            search.focus();
            search.setSelectionRange(search.value.length, search.value.length);
        }
    });
}

jQuery(async () => {
    const context = SillyTavern.getContext();
    initializeSettingsSync(getSettings(context.extensionSettings));
    initPanel();
    log('WeyPhone initialized');
});
