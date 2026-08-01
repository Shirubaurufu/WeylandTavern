import { MODULE_NAME, getSettings, resetSettings } from './lib/config.js';
import { getRequestHeaders } from '../../../script.js';
import { resolveMasterPrompt, resolvePostHistoryInstructions, resolvePersonalityText, applySpecialCase } from './lib/promptResolution.js';
import { buildPhoneWorldInfoScanHistory, findLorebookCharacterEntry, resolveLorebookContactProfile, resolveWorldInfoTethered, resolveWorldInfoUntethered } from './lib/worldInfo.js';
import { createConversation, getConversation, appendMessage, editMessage, deleteMessage, deleteMessages, deleteConversation, getAllConversationSummaries, genTimestamp, discardTrailingReply, createMemory, editMemory, deleteMemory, setMemoryPinned, getPinnedMemories, setMemorySettings, countExchangesSince, getMemoryWindow, getLastGeneratedMemory, setTetheredSettings, setContactHistorySettings, findOrCreateDedicatedAppConversation, getThreadsFor, pruneOrphanedChatBuckets } from './lib/storage.js';
import { buildSystemPrompt, buildGroupSystemPrompt, buildMessages, resolveProfileId, resolveModelOverride, sendMessage, reconstructHistoryAsPhoneFormat, resolveStoredMessageTime, applyMacroSubstitution, joinNonEmptySections, extractResponseText } from './lib/generation.js';
import { createPanelMarkup, renderHousingScreen, renderMessagesScreen, renderContactsScreen, renderGroupComposeScreen, renderConversationScreen, renderThreadDetailsScreen, renderMessages, renderPanelAvatar, setRegenerateMenuItemsEnabled, renderMemoryScreen, populateConnectionProfileOptions, setRoleplayModePickerState, renderPhoneAppScreen, renderTwitterFollowingScreen, renderTwitterProfileScreen, renderTwitterFeedScreen, renderSavedPostsScreen } from './lib/panel.js';
import { formatRelativeTime, formatClockTime } from './lib/formatTime.js';
import { withTypingState } from './lib/generationTracking.js';
import { buildPortraitMap, buildPsaPortraitMap } from './lib/portraits.js';
import { mergeInstalledContacts } from './lib/installedContacts.js';
import { characterNamesEquivalent, displayCharacterName, findInstalledCharacterName, preferredContactDisplayName } from './lib/characterIdentity.js';
import { parseReply, parseGroupReply } from './lib/messageParsing.js';
import { TEXTING_MODE_INSTRUCTIONS, TEXTING_THOUGHTS_DISABLED } from './lib/textingModeInstructions.js';
import { FIRST_CONTACT_BLOCK } from './lib/firstContact.js';
import { isKnownByDefault } from './lib/knownContacts.js';
import { buildMemoryGenerationMessages, joinMemoriesForInjection, sendMemoryRequest } from './lib/memoryGeneration.js';
import { isMainRoleplayActive, resolveMainActiveLtmEntries, resolveMainHistorySlice, formatMainHistoryTranscript, buildTetheredViewBlock, convertMainChatToMessages, buildScanHistoryWithExtraText, KRESSA_ROLEPLAY_COMPANION_INSTRUCTIONS, KRESSA_POST_CHATLOG_ORIENTATION } from './lib/tetheredContext.js';
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
import { renderComingSoonScreen } from './lib/ui/apps/comingSoon.js';
import { renderAppNamesScreen, renderCharacterWallpapersScreen, renderFolderWallpapersScreen, renderSettingsScreen, WALLPAPER_PRESETS } from './lib/ui/apps/settings.js';
import { renderCommunityBooksScreen, renderCommunityPickScreen, renderCommunityDeleteScreen } from './lib/ui/apps/communityContacts.js';
import { scanBookForCandidates, addCommunityContacts, getCommunityContacts, deleteCommunityContacts, communityLorebookNames, communityContactDirectoryEntry, communityPickableBookNames } from './lib/communityLorebook.js';
import { renderClockScreen, renderTimerEditorScreen, renderAlarmEditorScreen, renderClockAlertScreen, renderClockPickerScreen, ringDashoffset, pickerBasename } from './lib/ui/apps/clock.js';
import { startAlarmSound, unlockAudio } from './lib/clockAlert.js';
import { staticRoster, costumeProbeList, isNsfwGreeting } from './lib/clockCostumes.js';
import { createTimer, getVisibleTimers, getTimer, updateTimer, deleteTimer, formatDuration, timerFraction, TIME_MODE, effectiveTimeMode, getDefaultTimeMode, setDefaultTimeMode, createAlarm, getVisibleAlarms, getAlarm, updateAlarm, deleteAlarm, computeNextFire, isOneShot, RECURRENCE } from './lib/clockStorage.js';
import { currentRpMoment, rpMinutesBetween } from './lib/rpTime.js';
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
import { applyMienExpression, loadMienGallery, resolveMienCharacter, selectMienOutfit } from './lib/mien.js';
import { renderMienScreen } from './lib/ui/apps/mien.js';
import { buildTetherInjectionPlan, canCapturePhoneScopeIntoConversation, dedupeCapturedMessages, initialRoleplayModeForPhoneScope, locatePhoneScopes, reconcileTetherPrompts, routePhoneScope, sameParticipants, TETHER_CONTEXT_MESSAGE_OPTIONS } from './lib/roleplayTether.js';
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
// Settings -> Community Contacts picker's in-progress state (session-only; nothing here persists
// until "Add Contacts" is pressed). selectedBooks/selectedCandidates are keyed the same way the
// UI module expects — see lib/ui/apps/communityContacts.js's JSDoc for the candidate key shape.
const communityPickerState = { selectedBooks: new Set(), candidates: [], selectedCandidates: new Set(), selectedDeletes: new Set() };
let calcState = calcInitialState(); // session-only, like a real calculator
let currentNoteId = null; // set when entering 'note-editor'
let currentPawXaiTab = 'generate';
let currentPawXaiSavedCharacter = null;
let pawxaiGenerating = false;
let currentMienGallery = null;
let currentMienIndex = 0;
// Clock app state. currentClockTab picks the visible tab; the timer editor's draft is declared just
// below. timerRuntime holds LIVE run state (never persisted, like TinyClock's [JsonIgnore] fields),
// keyed by timer id → { state, endTime, remainingSeconds }. clockTickHandle is the countdown loop.
let currentClockTab = 'timers';
// The timer editor works on a DRAFT copy so nothing persists until Create/Save; back = discard.
let timerDraft = null;       // working copy being edited, or null when the editor is closed
let timerDraftIsNew = false; // true while adding (Create button), false while editing (Save/Delete)
const timerRuntime = new Map();
let clockTickHandle = null;
// Alarm editor draft, same discard-on-back model as timers.
let alarmDraft = null;
let alarmDraftIsNew = false;
// Going-off queue. currentAlert is the one on screen; alertSound is its looping-sound handle.
let alertQueue = [];
let currentAlert = null;
let alertSound = null;
// Real (wall-clock) alarm scheduler: id -> next-fire epoch ms (in memory, so missed-while-closed
// alarms are simply recomputed to their next future time rather than firing late on reopen).
const alarmNextFire = new Map();
let alarmTickHandle = null;
const ALARM_SNOOZE_MS = 5 * 60 * 1000;
// When an RP alarm fires, a one-shot system note is injected into the next roleplay generation so
// the story reacts to it (e.g. wakes {{user}}). Consumed + cleared by the generate interceptor.
const RP_ALARM_INJECT_KEY = 'weyphone_rp_alarm';
let pendingAlarmInjection = null;       // LATE one-shot note(s) for alarm(s) that already fired
let earlyInjectAlarmId = null;          // the single closest alarm currently getting the EARLY note
// Only the closest alarm within ~2 story-days gets the forward/early note (covers "today or
// tomorrow", so a sleep time-skip still rings on time). Anything further stays late-only until closer.
const EARLY_INJECT_WINDOW_MIN = 2 * 24 * 60;
// Sound/image picker: which field ('sound'), which editor to return to, the fetched list (null =
// loading), and a transient preview-audio handle.
let pickerField = null;
let pickerReturn = null;
let pickerItems = null;
let previewAudio = null;
// Image picker navigation: 'root' (greetings + character list) or 'char' (one character's costumes).
let imgLevel = 'root';
let imgChar = null;
let imgCharacters = [];
let imgCostumeData = null;
// Settings-app folder wallpaper gallery: 'Weyland' (greetings) or 'FFFox'; items null = loading.
let wallpaperFolder = null;
let wallpaperFolderItems = null;
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

// ---------------------------------------------------------------------------
// WeyPhone data store (data/<user>/weyphone/weyphone.json)
// ---------------------------------------------------------------------------
// WeyPhone's threads used to live inside settings.json. That meant every phone save rewrote the
// whole global settings file — shared with every other extension and all user settings — so chat
// data caused write amplification and sat in the blast radius of an unrelated bad write.
// The store below is the same shape as the old extension_settings.WeyPhone object; only the
// transport changed, so the merge-safe multi-tab logic in flushWeyPhoneSettings is untouched.

/** @returns {Promise<object|null>} stored payload, or null when nothing has been written yet. */
async function readWeyPhoneStore() {
    const response = await fetchSettingsApi('/api/weyphone/data', {
        method: 'GET',
        headers: getRequestHeaders(),
        cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`Could not read WeyPhone data (${response.status}).`);
    const payload = await response.json();
    const data = payload?.data;
    // null is meaningful — it is what triggers the one-time migration below. Anything that is not
    // a plain object is treated as "nothing stored".
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return data;
}

async function writeWeyPhoneStore(data) {
    const response = await fetchSettingsApi('/api/weyphone/data', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ data }),
        cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`Could not save WeyPhone data (${response.status}).`);
}

/**
 * One-time move of an existing install's WeyPhone data out of settings.json and into its own file.
 *
 * Ordering is deliberately paranoid, because getting this wrong means a user opens the phone to
 * find every conversation gone:
 *   1. If the data file already exists, nothing to do — it is the source of truth.
 *   2. Otherwise take whatever is in settings.json (the legacy home) and WRITE it to the file.
 *   3. READ IT BACK and confirm it is really there.
 *   4. Only after that verification, clear the legacy copy out of settings.json.
 * If any step throws, we return the legacy data and leave settings.json completely untouched, so
 * the worst case is that the data briefly lives in both places — never in neither.
 *
 * @returns {Promise<object|null>} the payload WeyPhone should run on, or null for a fresh install.
 */
async function migrateWeyPhoneStore() {
    const stored = await readWeyPhoneStore();
    if (stored) return stored;

    // No file yet: either a brand-new install, or an existing user who predates the data file.
    let serverSettings;
    try {
        serverSettings = await readServerSettings();
    } catch (error) {
        console.warn('[WeyPhone] Could not read settings.json while checking for legacy data:', error);
        return null;
    }
    const legacy = serverSettings?.extension_settings?.[MODULE_NAME];
    const hasLegacyData = legacy && typeof legacy === 'object' && !Array.isArray(legacy)
        && Object.keys(legacy).length > 0;
    if (!hasLegacyData) return null; // fresh install — defaults will be created normally

    try {
        await writeWeyPhoneStore(legacy);
        const verified = await readWeyPhoneStore();
        if (!verified) throw new Error('data file was not readable after writing');

        // Verified present in the new home — now, and only now, drop the legacy copy so settings.json
        // stops carrying it. A failure here is harmless: the file already holds the real data.
        delete serverSettings.extension_settings[MODULE_NAME];
        await writeServerSettings(serverSettings);
        log('Migrated WeyPhone data out of settings.json into its own file');
        toastr.success('WeyPhone conversations moved to their own storage file.', 'WeyPhone');
        return verified;
    } catch (error) {
        // Leave settings.json exactly as it was. WeyPhone keeps working from the legacy copy and
        // migration is retried on the next load.
        console.error('[WeyPhone] Data migration failed — keeping existing settings.json copy:', error);
        toastr.warning('WeyPhone could not move its data to the new storage file; your conversations are safe and it will retry next time.', 'WeyPhone');
        return legacy;
    }
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
        // Reads/writes the dedicated WeyPhone data file rather than rewriting the whole global
        // settings.json. The three-way merge below is unchanged — only where `remote` comes from
        // and where `merged` goes has moved, so multi-tab conflict handling behaves exactly as before.
        const remote = await readWeyPhoneStore();
        const merged = mergeWeyPhoneSettings(base, localSnapshot,
            remote && typeof remote === 'object' && !Array.isArray(remote) ? remote : base);
        await writeWeyPhoneStore(merged);

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
            // Same dedicated data file the writer uses — see readWeyPhoneStore.
            const remote = await readWeyPhoneStore();
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
    communityBooks: new Map(),
};

function contactLorebookSignature() {
    const settings = getSettings(SillyTavern.getContext().extensionSettings);
    return ['Weyland', ...findRegistrarBookNames(world_names), ...communityLorebookNames(settings)].join('|');
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
        const communityBooks = new Map();
        const settingsForCommunity = getSettings(context.extensionSettings);
        await Promise.all(communityLorebookNames(settingsForCommunity).map(async name => {
            try {
                const book = await context.loadWorldInfo(name);
                if (book?.entries) communityBooks.set(name, book);
            } catch (error) {
                console.warn(`[WeyPhone] Could not read community lorebook "${name}":`, error);
            }
        }));
        if (contactLorebookState.signature === signature) {
            contactLorebookState.officialBook = officialBook;
            contactLorebookState.registrarBooks = registrar.books;
            contactLorebookState.registrarContacts = registrar.contacts;
            contactLorebookState.communityBooks = communityBooks;
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
async function buildTetheredContext(context, conversation, { kressaObserver = false } = {}) {
    if (getRoleplayMode(conversation) !== ROLEPLAY_MODES.OBSERVE) return '';
    if (!isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId })) return '';

    // Observers need the same scene-relevant lore and LTM grounding as the active roleplay. Kressa
    // remains Kressa because her own app prompt is still the acting character prompt; this material
    // is reference context only. Her transcript is capped separately below so it cannot become a
    // second full roleplay context window and tempt the model to continue the scene.
    const worldInfo = await resolveWorldInfoTetheredForMainChat(context);
    const ltmEntries = await resolveMainActiveLtmEntries({
        loadWorldInfo: context.loadWorldInfo,
        chatMetadata: context.chatMetadata,
        chatId: context.chatId,
    });

    const ltmSettings = context.extensionSettings['Weyland-LTM'];
    const lastLtmMessageId = ltmSettings?.__chatState?.[context.chatId]?.lastLtmMessageId ?? -1;

    const historySlice = resolveMainHistorySlice({
        chat: context.chat,
        lastLtmMessageId,
        historyCap: kressaObserver
            ? Math.min(15, Number.isFinite(conversation.tetheredHistoryCap) ? conversation.tetheredHistoryCap : 15)
            : conversation.tetheredHistoryCap,
    });
    const historyTranscript = formatMainHistoryTranscript(historySlice);

    return buildTetheredViewBlock({
        worldInfoText: worldInfo,
        ltmEntries,
        historyTranscript,
        postTranscriptInstructions: kressaObserver ? KRESSA_POST_CHATLOG_ORIENTATION : undefined,
    });
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
    // A dedicated-app thread (Kressa) opens from its own home tile, not Messages, so its
    // notification has to badge that tile instead. Validate the tag against the registry first —
    // an unknown/stale appKey would badge no tile at all and could never be cleared, so fall back
    // to Messages in that case.
    const dedicatedAppKey = conversation.isDedicatedApp;
    const appKey = dedicatedAppKey && getApp(dedicatedAppKey) ? dedicatedAppKey : 'messages';
    recordMessageNotification(settings, context.chatId, {
        title,
        text: latest.content,
        conversationId,
        appKey,
        appLabel: resolveAppLabel(settings, appKey),
    });
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
            suppressTimestampFallback: Boolean(settings.ui?.rpClockEnabled),
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
        const storedTimeOptions = { suppressTimestampFallback: Boolean(settings.ui?.rpClockEnabled) };
        const wire = message => {
            const time = resolveStoredMessageTime(message, formatClockTime, storedTimeOptions);
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
                displayTime: resolveRpTime()?.time,
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
        const tetheredBlock = await buildTetheredContext(context, conversation, { kressaObserver: isKressa });
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
        const storedTimeOptions = { suppressTimestampFallback: Boolean(settings.ui?.rpClockEnabled) };
        const reconstructedHistory = reconstructHistoryAsPhoneFormat(historyBeforeLast, { charName: character.name, userName }, formatClockTime, storedTimeOptions);
        const wrappedUserMessage = reconstructHistoryAsPhoneFormat([lastMessage], { charName: character.name, userName }, formatClockTime, storedTimeOptions)[0].content;

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
            const added = { role: 'assistant', content: messageText, timestamp: genTimestamp(), displayTime: resolveRpTime()?.time };
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
        displayTime: resolveRpTime()?.time,
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
    // preferredContactDisplayName collapses known name-mismatches between sources (e.g. the live
    // cast directory's "Baphrodel Puddyfoot" vs. her subbot/roster's "Bap") onto one canonical
    // display form BEFORE the exact-string dedup below runs — otherwise the same person shows up
    // as two separate contacts whenever the official directory and a community/registrar source
    // disagree on which name to use. Installed-card/subbot resolution stays correct either way
    // since that lookup is alias-aware (see findInstalledCharacterName/findLorebookCharacterEntry).
    const official = getCastEntries(settings, refreshOptions).map(entry => ({ ...entry, name: preferredContactDisplayName(entry.name) }));
    const seen = new Set(official.map(entry => entry.name.toLowerCase()));
    // Deliberately does NOT splice in contactLorebookState.registrarContacts here. That list is
    // every character parsed out of any imported /registrar/i-named book (see
    // lib/registrarLorebook.js) with no user choice involved — it still feeds social-app roster
    // sampling and roleplay-capture name matching elsewhere, which is fine (occasional flavor
    // characters, not a Contacts entry). But splicing it into the visible directory here made
    // Registrar characters permanently reappear in Contacts even after being removed via the
    // Community Contacts picker (deleteCommunityContacts only removes from communityContacts,
    // which never touched this always-on list) — the picker's whole point is that a Registrar
    // character becomes a contact only when the user explicitly adds them via
    // getCommunityContacts/addCommunityContacts below.
    const communityEntries = getCommunityContacts(settings).map(communityContactDirectoryEntry)
        .map(entry => ({ ...entry, name: preferredContactDisplayName(entry.name) }));
    const directoryEntries = [...official, ...communityEntries.filter(entry => {
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
        : (contactLorebookState.registrarBooks.get(preferredBookName) ?? contactLorebookState.communityBooks.get(preferredBookName));
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
    // subbot, a uniquely matching imported Registrar or user-picked community profile still
    // makes that person reachable.
    for (const [bookName, book] of [...contactLorebookState.registrarBooks, ...contactLorebookState.communityBooks]) {
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

// The Weybooru app tile: not an in-phone screen at all — it just launches the same standalone
// Weybooru Viewer overlay as the chat-bar picture-frame button, via the viewer's own registered
// `/weybooru` slash command. Reusing that command (rather than reaching into the viewer's private
// module state) keeps this working even if the viewer's internal implementation changes, and fails
// gracefully with a toast if that extension is missing or disabled.
const WEYBOORU_OVERLAY_ID = 'wbv-modal-overlay';
const WEYBOORU_CLOSE_BUTTON_ID = 'wbv-close-btn';

/** The viewer builds its overlay lazily on first open, so this is null until then. */
function weybooruOverlayElement() {
    return document.getElementById(WEYBOORU_OVERLAY_ID);
}

function isWeybooruViewerOpen() {
    const overlay = weybooruOverlayElement();
    return Boolean(overlay) && getComputedStyle(overlay).display !== 'none';
}

async function openWeybooruViewer() {
    // Tapping the tile again while the viewer is up closes it. Click the viewer's OWN close
    // button rather than just hiding the element: closeOverlay() also cancels in-flight
    // searches, stops the slideshow timer, and resets its tag-review UI (see
    // weybooru-viewer/index.js). Hiding the node would leave all of that running.
    if (isWeybooruViewerOpen()) {
        document.getElementById(WEYBOORU_CLOSE_BUTTON_ID)?.click();
        return;
    }

    const context = SillyTavern.getContext();
    try {
        await context.executeSlashCommandsWithOptions('/weybooru');
    } catch (error) {
        console.warn('[WeyPhone] Could not open the Weybooru Viewer:', error);
        wpToast('error', 'Weybooru Viewer isn\'t available — make sure that extension is installed and enabled.');
    }
    // NOTE: the viewer stacks above the phone via a CSS rule in style.css, NOT from here. Setting
    // the z-index in JS after this await does not work: the viewer's slash command fires
    // openOverlay() without awaiting it, and openOverlay in turn awaits a fetch of its own
    // template before appending the overlay — so on a first open the element does not exist yet
    // and any lookup here returns null. (It appeared to work only on a second open, once the
    // element was already built.)
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
    // Any tap primes audio playback for the going-off sound (browsers gate audio on a user gesture).
    unlockAudio();
    if (event.target.closest('#wp-alert-dismiss')) { dismissCurrentAlert(); return; }
    if (event.target.closest('#wp-alert-snooze')) { snoozeCurrentAlert(); return; }
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
    // Clock: open the sound picker from an editor.
    const chooseBtn = event.target.closest('.wp-clock-choose');
    if (chooseBtn) {
        openPicker(chooseBtn.dataset.picker);
        return;
    }
    // Clock picker: preview a sound.
    const previewBtn = event.target.closest('.wp-picker-preview');
    if (previewBtn) {
        previewSound(previewBtn.dataset.previewUrl);
        return;
    }
    // Clock picker: pick a sound row (empty url = default beep).
    const soundRow = event.target.closest('.wp-picker-row');
    if (soundRow) {
        setPickerValue(soundRow.dataset.soundUrl || '');
        return;
    }
    // Clock picker: pick an image (empty url = no image).
    const imagePick = event.target.closest('.wp-picker-image, .wp-picker-none');
    if (imagePick) {
        setPickerValue(imagePick.dataset.imageUrl || '');
        return;
    }
    // Clock picker: open the greetings folder.
    if (event.target.closest('#wp-picker-greetings-btn')) {
        imgLevel = 'greetings';
        showScreen('clock-picker');
        return;
    }
    // Clock picker: back from greetings to the root list.
    if (event.target.closest('#wp-picker-greetings-back')) {
        imgLevel = 'root';
        showScreen('clock-picker');
        return;
    }
    // Clock picker: open a character's costumes (probe their folders).
    const charBtn = event.target.closest('.wp-picker-char-btn');
    if (charBtn) {
        const name = charBtn.dataset.imgChar;
        imgLevel = 'char';
        imgChar = name;
        imgCostumeData = null;
        showScreen('clock-picker');
        probeCostumes(name).then(data => {
            if (currentView === 'clock-picker' && imgLevel === 'char' && imgChar === name) {
                imgCostumeData = data;
                showScreen('clock-picker');
            }
        });
        return;
    }
    // Clock picker: back from a character's costumes to the root list.
    if (event.target.closest('#wp-picker-char-back')) {
        imgLevel = 'root';
        imgChar = null;
        imgCostumeData = null;
        showScreen('clock-picker');
        return;
    }
    // Clock picker: use a pasted URL.
    if (event.target.closest('#wp-picker-url-use')) {
        const input = document.getElementById('wp-picker-url-input');
        setPickerValue((input?.value || '').trim());
        return;
    }
    // Clock: switch between the Timers and Alarms tabs.
    const clockTab = event.target.closest('.wp-clock-tab');
    if (clockTab) {
        currentClockTab = clockTab.dataset.clockTab === 'alarms' ? 'alarms' : 'timers';
        showScreen('clock');
        return;
    }
    // Clock: the Time-source control. Pressing either segment TOGGLES (you only touch it to change
    // it), and it drives BOTH the phone's displayed clock and the default mode for new timers/alarms.
    const defaultModeBtn = event.target.closest('.wp-clock-default-btn');
    if (defaultModeBtn) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const next = getDefaultTimeMode(settings) === TIME_MODE.RP ? TIME_MODE.REAL : TIME_MODE.RP;
        setDefaultTimeMode(settings, next);
        settings.ui.rpClockEnabled = (next === TIME_MODE.RP); // phone clock follows the same switch
        queueWeyPhoneSave(context);
        renderStatusBarNow();
        showScreen('clock');
        return;
    }
    // Clock: open the editor on a fresh, unsaved draft (persisted only if Create is pressed).
    // A new timer starts on the app default (concrete Real/Roleplay); with no chat it can only be Real.
    if (event.target.closest('#wp-timer-add')) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const startMode = context.chatId ? getDefaultTimeMode(settings) : TIME_MODE.REAL;
        timerDraft = { id: null, name: '', durationSeconds: 600, timeMode: startMode, soundUrl: '', imageUrl: '' };
        timerDraftIsNew = true;
        showScreen('timer-editor');
        return;
    }
    // Clock: commit a brand-new timer (draft -> stored). RP timers are scoped to the current chat.
    if (event.target.closest('#wp-timer-create-btn')) {
        if (!timerDraft) return;
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const isRp = effectiveTimeMode(settings, timerDraft) === 'rp';
        if (isRp && !context.chatId) { wpToast('info', 'Open a roleplay chat to use roleplay time.'); return; }
        createTimer(settings, {
            name: timerDraft.name,
            durationSeconds: timerDraft.durationSeconds,
            timeMode: timerDraft.timeMode,
            soundUrl: timerDraft.soundUrl,
            imageUrl: timerDraft.imageUrl,
            chatId: isRp ? context.chatId : null,
        });
        queueWeyPhoneSave(context);
        timerDraft = null;
        timerDraftIsNew = false;
        showScreen('clock');
        return;
    }
    // Clock: save edits to an existing timer (draft -> stored).
    if (event.target.closest('#wp-timer-save-btn')) {
        if (!timerDraft?.id) return;
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const isRp = effectiveTimeMode(settings, timerDraft) === 'rp';
        if (isRp && !context.chatId) { wpToast('info', 'Open a roleplay chat to use roleplay time.'); return; }
        updateTimer(settings, timerDraft.id, {
            name: timerDraft.name,
            durationSeconds: timerDraft.durationSeconds,
            timeMode: timerDraft.timeMode,
            soundUrl: timerDraft.soundUrl,
            imageUrl: timerDraft.imageUrl,
            chatId: isRp ? context.chatId : null,
        });
        // A timer switched to real time can't keep a persisted RP run; clear it and its live state.
        if (!isRp) {
            const timer = getTimer(settings, timerDraft.id);
            if (timer) timer.run = null;
            timerRuntime.delete(timerDraft.id);
        }
        // Keep an idle timer's shown remaining in step with a changed duration (don't disturb a run).
        const rt = timerRuntime.get(timerDraft.id);
        if (!rt || rt.state === 'idle') timerRuntime.set(timerDraft.id, { state: 'idle', mode: isRp ? 'rp' : 'real', endTime: 0, startMoment: null, baseSeconds: timerDraft.durationSeconds, remainingSeconds: timerDraft.durationSeconds });
        queueWeyPhoneSave(context);
        timerDraft = null;
        showScreen('clock');
        return;
    }
    // Clock: delete from within the timer editor.
    const timerDeleteBtn = event.target.closest('#wp-timer-delete-btn');
    if (timerDeleteBtn) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const id = timerDeleteBtn.dataset.timerId;
        deleteTimer(settings, id);
        timerRuntime.delete(id);
        queueWeyPhoneSave(context);
        timerDraft = null;
        timerDraftIsNew = false;
        showScreen('clock');
        return;
    }
    // Clock: a timer card control (start/pause/continue/reset/+1/edit/delete).
    const timerBtnEl = event.target.closest('.wp-timer-btn');
    if (timerBtnEl) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const id = timerBtnEl.dataset.timerId;
        const timer = getTimer(settings, id);
        if (!timer) return;
        const rpMoment = currentRpMoment(context.chat);
        switch (timerBtnEl.dataset.action) {
            case 'start': startTimer(timer, settings, rpMoment); break;
            case 'pause': pauseTimer(timer, settings, rpMoment); break;
            case 'continue': continueTimer(timer, settings, rpMoment); break;
            case 'reset': resetTimer(timer); break;
            case 'addminute': addMinuteTimer(timer); break;
            case 'edit':
                // Edit a copy so back = discard changes; Save commits it. Resolve any legacy
                // 'default' mode to its concrete Real/Roleplay so the editor reflects reality.
                timerDraft = { ...timer, timeMode: effectiveTimeMode(settings, timer) };
                timerDraftIsNew = false;
                showScreen('timer-editor');
                return;
            case 'delete':
                deleteTimer(settings, id);
                timerRuntime.delete(id);
                queueWeyPhoneSave(context);
                showScreen('clock');
                return;
        }
        // Real timers keep run state in memory only; RP timers persist theirs so a reload resumes.
        if (effectiveTimeMode(settings, timer) === 'rp') persistRpTimerRun(timer, context);
        showScreen('clock');
        return;
    }
    // Clock: open the editor on a fresh, unsaved alarm draft. A new alarm starts on the app default
    // (concrete Real/Roleplay); with no chat it can only be Real.
    if (event.target.closest('#wp-alarm-add')) {
        const addContext = SillyTavern.getContext();
        const addSettings = getSettings(addContext.extensionSettings);
        const startMode = addContext.chatId ? getDefaultTimeMode(addSettings) : TIME_MODE.REAL;
        alarmDraft = {
            id: null, title: '', hour: 7, minute: 0, kind: RECURRENCE.NEXT, date: null,
            weekDays: [], nthWeek: 1, nthDay: 1, month: 1, day: 1,
            timeMode: startMode, soundUrl: '', imageUrl: '', enabled: true,
        };
        alarmDraftIsNew = true;
        showScreen('alarm-editor');
        return;
    }
    // Clock: commit a brand-new alarm (createAlarm reads only the known fields; id/enabled ignored).
    // RP alarms are scoped to the current chat.
    if (event.target.closest('#wp-alarm-create-btn')) {
        if (!alarmDraft) return;
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const isRp = effectiveTimeMode(settings, alarmDraft) === 'rp';
        if (isRp && !context.chatId) { wpToast('info', 'Open a roleplay chat to use roleplay time.'); return; }
        createAlarm(settings, { ...alarmDraft, chatId: isRp ? context.chatId : null });
        queueWeyPhoneSave(context);
        syncAlarmTick(settings); // a new enabled real alarm needs the checker running
        alarmDraft = null;
        alarmDraftIsNew = false;
        showScreen('clock');
        return;
    }
    // Clock: save edits to an existing alarm.
    if (event.target.closest('#wp-alarm-save-btn')) {
        if (!alarmDraft?.id) return;
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const isRp = effectiveTimeMode(settings, alarmDraft) === 'rp';
        if (isRp && !context.chatId) { wpToast('info', 'Open a roleplay chat to use roleplay time.'); return; }
        updateAlarm(settings, alarmDraft.id, {
            title: alarmDraft.title, hour: alarmDraft.hour, minute: alarmDraft.minute,
            kind: alarmDraft.kind, date: alarmDraft.date, weekDays: alarmDraft.weekDays,
            nthWeek: alarmDraft.nthWeek, nthDay: alarmDraft.nthDay, month: alarmDraft.month, day: alarmDraft.day,
            timeMode: alarmDraft.timeMode, soundUrl: alarmDraft.soundUrl, imageUrl: alarmDraft.imageUrl,
            chatId: isRp ? context.chatId : null,
        });
        alarmNextFire.delete(alarmDraft.id); // recompute next fire from the edited schedule
        const editedAlarm = getAlarm(settings, alarmDraft.id);
        if (editedAlarm) editedAlarm.rpArm = null; // re-arm RP alarms against the edited schedule
        queueWeyPhoneSave(context);
        syncAlarmTick(settings);
        alarmDraft = null;
        showScreen('clock');
        return;
    }
    // Clock: delete from within the alarm editor.
    const alarmDeleteBtn = event.target.closest('#wp-alarm-delete-btn');
    if (alarmDeleteBtn) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        alarmNextFire.delete(alarmDeleteBtn.dataset.alarmId);
        deleteAlarm(settings, alarmDeleteBtn.dataset.alarmId);
        queueWeyPhoneSave(context);
        syncAlarmTick(settings);
        alarmDraft = null;
        alarmDraftIsNew = false;
        showScreen('clock');
        return;
    }
    // Clock: tap an alarm card body to edit it (works on a copy so back = discard changes).
    const alarmMain = event.target.closest('.wp-alarm-main');
    if (alarmMain) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const alarm = getAlarm(settings, alarmMain.dataset.alarmId);
        if (!alarm) return;
        // Resolve any legacy 'default' mode to concrete so the editor reflects reality.
        alarmDraft = { ...alarm, weekDays: [...(alarm.weekDays ?? [])], timeMode: effectiveTimeMode(settings, alarm) };
        alarmDraftIsNew = false;
        showScreen('alarm-editor');
        return;
    }
    // Clock: delete an alarm straight from its card.
    const alarmDel = event.target.closest('.wp-alarm-del');
    if (alarmDel) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        alarmNextFire.delete(alarmDel.dataset.alarmId);
        deleteAlarm(settings, alarmDel.dataset.alarmId);
        queueWeyPhoneSave(context);
        syncAlarmTick(settings);
        showScreen('clock');
        return;
    }
    // Clock: toggle a weekday chip in the alarm editor (draft + class only, no re-render).
    const alarmDay = event.target.closest('.wp-alarm-day');
    if (alarmDay) {
        if (!alarmDraft) return;
        if (!Array.isArray(alarmDraft.weekDays)) alarmDraft.weekDays = [];
        const day = Number(alarmDay.dataset.weekday);
        const at = alarmDraft.weekDays.indexOf(day);
        if (at === -1) alarmDraft.weekDays.push(day); else alarmDraft.weekDays.splice(at, 1);
        alarmDay.classList.toggle('wp-selected');
        return;
    }
    if (event.target.closest('#wp-app-names-button')) {
        showScreen('app-names');
        return;
    }
    if (event.target.closest('#wp-community-contacts-button')) {
        communityPickerState.selectedBooks.clear();
        communityPickerState.candidates = [];
        communityPickerState.selectedCandidates.clear();
        showScreen('community-contacts-books');
        return;
    }
    if (event.target.closest('#wp-community-scan-button')) {
        (async () => {
            const context = SillyTavern.getContext();
            const results = await Promise.all([...communityPickerState.selectedBooks].map(async name => {
                try {
                    const book = await context.loadWorldInfo(name);
                    return scanBookForCandidates(book, name);
                } catch (error) {
                    console.warn(`[WeyPhone] Could not scan lorebook "${name}":`, error);
                    return [];
                }
            }));
            communityPickerState.candidates = results.flat();
            // A mixed lorebook can surface locations and backstory entries alongside people.
            // Start with nothing checked so every imported contact is an explicit user choice.
            communityPickerState.selectedCandidates.clear();
            if (communityPickerState.candidates.length === 0) {
                wpToast('info', 'No named entries with body text found in the selected lorebook(s).');
            }
            showScreen('community-contacts-pick');
        })();
        return;
    }
    if (event.target.closest('#wp-community-add-button')) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const existingKeys = new Set(getCommunityContacts(settings).map(c => `${c.name.toLowerCase()}|${c.lorebookName.toLowerCase()}`));
        const picked = communityPickerState.candidates.filter(c =>
            communityPickerState.selectedCandidates.has(`${c.name.toLowerCase()}|${c.lorebookName.toLowerCase()}`) &&
            !existingKeys.has(`${c.name.toLowerCase()}|${c.lorebookName.toLowerCase()}`));
        const added = addCommunityContacts(settings, picked);
        queueWeyPhoneSave(context);
        contactLorebookState.ready = false; // force a reload so the new book(s) resolve for messaging
        wpToast('success', `Added ${added} ${added === 1 ? 'contact' : 'contacts'}.`);
        showScreen('settings-app');
        return;
    }
    if (event.target.closest('#wp-community-delete-button')) {
        communityPickerState.selectedDeletes.clear();
        showScreen('community-contacts-delete');
        return;
    }
    if (event.target.closest('#wp-community-delete-confirm')) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const deleted = deleteCommunityContacts(settings, communityPickerState.selectedDeletes);
        communityPickerState.selectedDeletes.clear();
        queueWeyPhoneSave(context);
        contactLorebookState.ready = false;
        wpToast('success', `Deleted ${deleted} community ${deleted === 1 ? 'contact' : 'contacts'}.`);
        showScreen('settings-app');
        return;
    }
    if (event.target.closest('#wp-character-wallpapers-button')) {
        showScreen('character-wallpapers');
        return;
    }
    if (event.target.closest('#wp-greetings-wallpapers-button')) {
        wallpaperFolder = 'Weyland';
        wallpaperFolderItems = null;
        showScreen('folder-wallpapers');
        void loadWallpaperFolder('Weyland');
        return;
    }
    if (event.target.closest('#wp-fffox-wallpapers-button')) {
        wallpaperFolder = 'FFFox';
        wallpaperFolderItems = null;
        showScreen('folder-wallpapers');
        void loadWallpaperFolder('FFFox');
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
    const folderWallpaper = event.target.closest('.wp-folder-wallpaper-card');
    if (folderWallpaper) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.ui.wallpaper = folderWallpaper.dataset.wallpaperUrl;
        queueWeyPhoneSave(context);
        applyWallpaper();
        showScreen('folder-wallpapers');
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
        // Mirrors openNotificationTarget's shade-entry behavior — any app tile opened directly
        // from the home screen should clear its own badge too, not just Messages. Guarded on a
        // truthy appKey because markAppNotificationsRead treats a missing key as "mark ALL apps
        // read"; a tile without data-app must never silently wipe every badge.
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        if (appKey) {
            markAppNotificationsRead(settings, context.chatId, appKey);
            queueWeyPhoneSave(context);
            renderShadeNow();
            renderLockScreenNow();
        }
        if (appKey === 'kressa') {
            openKressaConversation();
        } else if (appKey === 'weybooru') {
            void openWeybooruViewer();
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

// Discrete slider (15/30/45/60/All) controlling how many recent Linked-thread texts are injected
// into the roleplay as context. The slider position is an index into TETHER_CONTEXT_MESSAGE_OPTIONS;
// 0 in that list means "no cap". Returns true when it handled the event.
function handleTetherContextRangeInput(target) {
    if (target.id !== 'wp-settings-tether-context') return false;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const value = TETHER_CONTEXT_MESSAGE_OPTIONS[Number(target.value)] ?? 30;
    settings.tetherContextMessages = value;
    const output = document.getElementById('wp-tether-context-value');
    if (output) output.textContent = value === 0 ? 'All messages' : `${value} messages`;
    queueWeyPhoneSave(context);
    return true;
}

function handleScreenBodyChange(event) {
    if (applyTimerFieldFromEvent(event.target)) return;
    // Alarm recurrence change re-renders the editor so the kind-specific fields swap in.
    if (event.target.classList?.contains('wp-alarm-field') && event.target.dataset.field === 'kind') {
        if (alarmDraft) {
            alarmDraft.kind = event.target.value;
            showScreen('alarm-editor');
        }
        return;
    }
    // Alarm time-source change re-renders so the recurrence options update (RP has a reduced set),
    // coercing an unsupported kind (e.g. Weekly) down to Once when switching to Roleplay.
    if (event.target.classList?.contains('wp-alarm-field') && event.target.dataset.field === 'timeMode') {
        if (alarmDraft) {
            alarmDraft.timeMode = event.target.value;
            const rpKinds = [RECURRENCE.NEXT, RECURRENCE.DAILY, RECURRENCE.DATE];
            if (alarmDraft.timeMode === TIME_MODE.RP && !rpKinds.includes(alarmDraft.kind)) {
                alarmDraft.kind = RECURRENCE.NEXT;
            }
            showScreen('alarm-editor');
        }
        return;
    }
    if (applyAlarmFieldFromEvent(event.target)) return;
    // Alarm on/off toggle lives on the card and persists immediately (it isn't part of any draft).
    if (event.target.classList?.contains('wp-alarm-enable')) {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const alarmId = event.target.dataset.alarmId;
        updateAlarm(settings, alarmId, { enabled: event.target.checked });
        alarmNextFire.delete(alarmId); // recompute next fire fresh on re-enable; clear on disable
        const toggledAlarm = getAlarm(settings, alarmId);
        if (toggledAlarm) toggledAlarm.rpArm = null; // re-arm an RP alarm fresh from current story time
        queueWeyPhoneSave(context);
        syncAlarmTick(settings);
        if (currentView === 'clock') showScreen('clock');
        return;
    }
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
    if (event.target.classList?.contains('wp-community-book-checkbox')) {
        const name = event.target.value;
        if (event.target.checked) communityPickerState.selectedBooks.add(name);
        else communityPickerState.selectedBooks.delete(name);
        if (currentView === 'community-contacts-books') showScreen('community-contacts-books');
        return;
    }
    if (event.target.classList?.contains('wp-community-candidate-checkbox')) {
        const key = event.target.value;
        if (event.target.checked) communityPickerState.selectedCandidates.add(key);
        else communityPickerState.selectedCandidates.delete(key);
        if (currentView === 'community-contacts-pick') showScreen('community-contacts-pick');
        return;
    }
    if (event.target.classList?.contains('wp-community-delete-checkbox')) {
        const key = event.target.value;
        if (event.target.checked) communityPickerState.selectedDeletes.add(key);
        else communityPickerState.selectedDeletes.delete(key);
        if (currentView === 'community-contacts-delete') showScreen('community-contacts-delete');
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
    if (handleTetherContextRangeInput(event.target)) return;
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
    if (view === 'clock' || view === 'timer-editor' || view === 'alarm-editor' || view === 'clock-picker') return 'clock';
    if (view === 'pawxai') return 'pawxai';
    if (view === 'mien') return 'mien';
    if (view === 'settings-app' || view === 'app-names' || view === 'character-wallpapers' ||
        view === 'community-contacts-books' || view === 'community-contacts-pick' || view === 'community-contacts-delete') return 'settings';
    if (view === 'kressa-settings') return 'kressa';
    if (view === 'registrar-coming-soon') return 'registrar';
    return null;
}

// ---------------------------------------------------------------- Clock: timer engine
//
// The stored timer holds only its definition (name/duration/etc). Its live run state lives here in
// timerRuntime and is recomputed from an absolute endTime, so a running timer keeps counting while
// you browse other apps and is correct when you return. Not persisted — a page reload resets timers
// to idle, matching the desktop TinyClock.

// A timer runs on either 'real' (wall clock, ticks every 250ms) or 'rp' time. RP timers can't tick —
// roleplay time only moves when a new scene header arrives — so they hold a startMoment (the RP
// moment they began at) and baseSeconds (remaining when they began), and recompute their remaining
// as a snapshot each time a message lands: remaining = baseSeconds - (RP minutes elapsed × 60). A
// 30-second RP timer therefore fires the moment the story clock advances a full minute, exactly as
// intended. The engine mode is fixed at start (rt.mode).

/**
 * Materialize (or fetch) a timer's live run state. On first touch, an RP timer rehydrates from its
 * persisted `timer.run` (so story-time progress survives a reload); everything else starts idle. A
 * real timer has no persisted run, so it always comes back idle after a reload — cancelled, as
 * intended.
 */
function timerRuntimeFor(timer) {
    let rt = timerRuntime.get(timer.id);
    if (!rt) {
        rt = timer.run
            ? { state: timer.run.state, mode: timer.run.mode, endTime: 0, startMoment: timer.run.startMoment, baseSeconds: timer.run.baseSeconds, remainingSeconds: timer.run.remainingSeconds }
            : { state: 'idle', mode: 'real', endTime: 0, startMoment: null, baseSeconds: timer.durationSeconds, remainingSeconds: timer.durationSeconds };
        timerRuntime.set(timer.id, rt);
    }
    return rt;
}

/** Mirror an RP timer's live run state onto the persisted record so it survives a reload. */
function persistRpTimerRun(timer, context) {
    const rt = timerRuntime.get(timer.id);
    if (!rt) return;
    timer.run = { state: rt.state, mode: rt.mode, startMoment: rt.startMoment, baseSeconds: rt.baseSeconds, remainingSeconds: rt.remainingSeconds };
    queueWeyPhoneSave(context);
}

/** Remaining seconds for a RUNNING timer. `rpMoment` is the latest story time (may be null). */
function runningRemaining(rt, rpMoment) {
    if (rt.mode === 'rp') {
        // No baseline yet (started before any header) or no readable story time: hold steady.
        if (!rt.startMoment || !rpMoment) return rt.baseSeconds;
        const elapsedMin = rpMinutesBetween(rt.startMoment, rpMoment);
        const elapsed = (elapsedMin != null && elapsedMin > 0) ? elapsedMin * 60 : 0;
        return rt.baseSeconds - elapsed;
    }
    return (rt.endTime - Date.now()) / 1000;
}

/**
 * Snapshot a timer's display state for rendering.
 * @param {object} timer
 * @param {object} settings
 * @param {ReturnType<typeof currentRpMoment>} rpMoment latest story moment (null if none)
 */
function timerDisplayState(timer, settings, rpMoment) {
    const rt = timerRuntimeFor(timer);
    if (rt.state === 'running') {
        const remaining = runningRemaining(rt, rpMoment);
        if (remaining <= 0) return { state: 'done', remainingSeconds: 0 };
        // A RP timer with no baseline/story time yet is "waiting" — running but not advancing.
        const waiting = rt.mode === 'rp' && (!rt.startMoment || !rpMoment);
        return { state: 'running', remainingSeconds: remaining, waiting };
    }
    if (rt.state === 'paused') return { state: 'paused', remainingSeconds: rt.remainingSeconds };
    if (rt.state === 'done') return { state: 'done', remainingSeconds: 0 };
    return { state: 'idle', remainingSeconds: timer.durationSeconds };
}

function startTimer(timer, settings, rpMoment) {
    const rt = timerRuntimeFor(timer);
    rt.mode = effectiveTimeMode(settings, timer);
    rt.state = 'running';
    rt.remainingSeconds = timer.durationSeconds;
    if (rt.mode === 'rp') {
        rt.startMoment = rpMoment || null; // null baseline is filled in on the next message with a header
        rt.baseSeconds = timer.durationSeconds;
        rt.endTime = 0;
    } else {
        rt.endTime = Date.now() + timer.durationSeconds * 1000;
    }
}
function pauseTimer(timer, settings, rpMoment) {
    const rt = timerRuntimeFor(timer);
    if (rt.state !== 'running') return;
    rt.remainingSeconds = Math.max(0, runningRemaining(rt, rpMoment));
    rt.state = 'paused';
}
function continueTimer(timer, settings, rpMoment) {
    const rt = timerRuntimeFor(timer);
    if (rt.state !== 'paused') return;
    // Re-baseline from "now" (wall or story) with whatever time was left.
    if (rt.mode === 'rp') {
        rt.startMoment = rpMoment || null;
        rt.baseSeconds = rt.remainingSeconds;
    } else {
        rt.endTime = Date.now() + rt.remainingSeconds * 1000;
    }
    rt.state = 'running';
}
function resetTimer(timer) {
    const rt = timerRuntimeFor(timer);
    rt.state = 'idle';
    rt.endTime = 0;
    rt.startMoment = null;
    rt.baseSeconds = timer.durationSeconds;
    rt.remainingSeconds = timer.durationSeconds;
}
function addMinuteTimer(timer) {
    const rt = timerRuntimeFor(timer);
    if (rt.state === 'running') {
        if (rt.mode === 'rp') rt.baseSeconds += 60; // one more RP minute to elapse
        else rt.endTime += 60_000;
    } else if (rt.state === 'paused') {
        rt.remainingSeconds += 60;
    }
}

/**
 * Advance RP timers when a new message (and possibly a new scene header) arrives. RP timers don't
 * use the wall-clock interval, so this is their heartbeat: fill in a missing baseline, detect
 * completion, and refresh the display if the Clock app is open.
 */
function refreshRpTimersOnMessage() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const rpMoment = currentRpMoment(context.chat);
    let changed = false;
    const completed = [];
    // Only this chat's RP timers advance on its messages (an RP timer is scoped to one chat).
    for (const timer of getVisibleTimers(settings, context.chatId)) {
        const rt = timerRuntime.get(timer.id);
        if (!rt || rt.state !== 'running' || rt.mode !== 'rp') continue;
        if (!rt.startMoment && rpMoment) rt.startMoment = rpMoment; // begin counting now
        if (runningRemaining(rt, rpMoment) <= 0) {
            rt.state = 'done';
            rt.remainingSeconds = 0;
            completed.push(timer);
        }
        persistRpTimerRun(timer, context); // save advanced progress so a reload resumes here
        changed = true;
    }
    if (completed.length) {
        for (const timer of completed) fireTimerAlert(timer);
    } else if (changed && currentView === 'clock' && currentClockTab === 'timers') {
        showScreen('clock');
    }
}

// The wall-clock countdown loop for REAL timers only (RP timers advance via refreshRpTimersOnMessage).
// Runs in the BACKGROUND while any real timer is active — even when the Clock isn't the visible app
// or the phone is closed — so a timer can pop the phone open when it fires. Card text/ring are only
// touched while the Timers tab is actually showing; completion fires an alert regardless. Stops
// itself once no real timer is left running.
function clockTickFrame() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const onTimersTab = currentView === 'clock' && currentClockTab === 'timers';
    const completed = [];
    let stillRunning = false;
    for (const timer of getVisibleTimers(settings, context.chatId)) {
        const rt = timerRuntime.get(timer.id);
        if (!rt || rt.state !== 'running' || rt.mode === 'rp') continue;
        const remaining = (rt.endTime - Date.now()) / 1000;
        if (remaining <= 0) {
            rt.state = 'done';
            rt.remainingSeconds = 0;
            completed.push(timer);
            continue;
        }
        stillRunning = true;
        if (onTimersTab) {
            const display = document.querySelector(`[data-timer-display="${CSS.escape(timer.id)}"]`);
            if (display) display.textContent = formatDuration(remaining);
            const ring = document.querySelector(`[data-timer-ring="${CSS.escape(timer.id)}"] .wp-timer-ring-progress`);
            if (ring) ring.style.strokeDashoffset = ringDashoffset(timerFraction(remaining, timer.durationSeconds)).toFixed(2);
        }
    }
    for (const timer of completed) fireTimerAlert(timer); // takes over the screen
    if (!stillRunning) stopClockTick();
}
function startClockTick() {
    if (clockTickHandle === null) clockTickHandle = setInterval(clockTickFrame, 250);
}
function stopClockTick() {
    if (clockTickHandle !== null) { clearInterval(clockTickHandle); clockTickHandle = null; }
}
/** Keep the wall-clock ticker alive whenever a REAL-mode timer is running (any screen, even closed). */
function syncClockTick(settings) {
    const chatId = SillyTavern.getContext().chatId;
    const anyRealRunning = getVisibleTimers(settings, chatId).some(t => {
        const rt = timerRuntime.get(t.id);
        return rt?.state === 'running' && rt.mode !== 'rp';
    });
    if (anyRealRunning) startClockTick(); else stopClockTick();
}

/**
 * Persist a timer editor field edit. Returns true if it handled a `.wp-timer-field` target. Called
 * from both the change and input delegated listeners so selects, text, and number inputs all save.
 * Never re-renders (the editor screen would lose focus mid-typing).
 */
function applyTimerFieldFromEvent(target) {
    if (!target?.classList?.contains('wp-timer-field')) return false;
    if (!timerDraft) return true;
    // Edits land on the in-memory draft only. Persistence happens on Create/Save, and no re-render
    // fires here so the field keeps focus mid-typing.
    const field = target.dataset.field;
    if (field === 'name') timerDraft.name = target.value;
    else if (field === 'timeMode') timerDraft.timeMode = target.value;
    else if (field === 'soundUrl') timerDraft.soundUrl = target.value.trim();
    else if (field === 'imageUrl') timerDraft.imageUrl = target.value.trim();
    else if (field === 'h' || field === 'm' || field === 's') {
        // Recombine the three duration inputs from the DOM into total seconds.
        const editor = target.closest('.wp-timer-editor');
        const readNum = (f) => {
            const el = editor?.querySelector(`.wp-timer-field[data-field="${f}"]`);
            const n = Math.trunc(Number(el?.value));
            return Number.isFinite(n) && n > 0 ? n : 0;
        };
        timerDraft.durationSeconds = Math.max(1, readNum('h') * 3600 + readNum('m') * 60 + readNum('s'));
    }
    return true;
}

/**
 * Persist an alarm editor field into the in-memory draft. Returns true if it handled a
 * `.wp-alarm-field` target. 'kind' is intentionally a no-op here — the recurrence <select> is
 * handled in the change listener so it can re-render the editor with the right fields.
 */
function applyAlarmFieldFromEvent(target) {
    if (!target?.classList?.contains('wp-alarm-field')) return false;
    if (!alarmDraft) return true;
    const field = target.dataset.field;
    const clampInt = (value, min, max, fallback) => {
        const n = Math.trunc(Number(value));
        return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    if (field === 'title') alarmDraft.title = target.value;
    else if (field === 'time') {
        const [h, m] = String(target.value || '').split(':');
        alarmDraft.hour = clampInt(h, 0, 23, alarmDraft.hour);
        alarmDraft.minute = clampInt(m, 0, 59, alarmDraft.minute);
    }
    else if (field === 'kind') { /* re-rendered by the change listener */ }
    else if (field === 'date') alarmDraft.date = target.value || null;
    else if (field === 'nthWeek') alarmDraft.nthWeek = clampInt(target.value, 1, 4, 1);
    else if (field === 'nthDay') alarmDraft.nthDay = clampInt(target.value, 0, 6, 0);
    else if (field === 'month') alarmDraft.month = clampInt(target.value, 1, 12, 1);
    else if (field === 'day') alarmDraft.day = clampInt(target.value, 1, 31, 1);
    else if (field === 'timeMode') alarmDraft.timeMode = target.value;
    else if (field === 'soundUrl') alarmDraft.soundUrl = target.value.trim();
    else if (field === 'imageUrl') alarmDraft.imageUrl = target.value.trim();
    return true;
}

// ---------------------------------------------------------------- Clock: going-off alerts
//
// A timer or alarm that fires enqueues an alert. The phone pops open (or swaps apps) to a full-screen
// going-off view with a looping sound and Snooze/Dismiss. Alerts queue so simultaneous fires stack.

function fireTimerAlert(timer) {
    enqueueAlert({
        kind: 'timer',
        id: timer.id,
        title: timer.name?.trim() || 'Timer',
        subtitle: "Time's up",
        imageUrl: timer.imageUrl || '',
        soundUrl: timer.soundUrl || '',
    });
}

function enqueueAlert(alert) {
    // Skip a duplicate for something already going off or already queued.
    if (currentAlert?.id === alert.id || alertQueue.some(a => a.id === alert.id)) return;
    alertQueue.push(alert);
    if (!currentAlert) showNextAlert();
}

function showNextAlert() {
    if (alertSound) { alertSound.stop(); alertSound = null; }
    currentAlert = alertQueue.shift() || null;
    if (!currentAlert) return;
    alertSound = startAlarmSound(currentAlert.soundUrl);
    // Make the phone visible and take over with the going-off screen.
    const panel = document.getElementById('wp-panel');
    if (panel) panel.classList.add('wp-open');
    setLocked(false); // un-dims and shows the app screen
    showScreen('clock-alert');
    renderStatusBarNow();
}

/** Leave the going-off screen: silence it, run the per-kind after-action, then show next / the app. */
function closeCurrentAlert(afterAction) {
    if (alertSound) { alertSound.stop(); alertSound = null; }
    const alert = currentAlert;
    currentAlert = null;
    if (alert && typeof afterAction === 'function') afterAction(alert);
    if (alertQueue.length) showNextAlert();
    else showScreen('clock');
}

function dismissCurrentAlert() {
    closeCurrentAlert((alert) => {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        if (alert.kind === 'timer') {
            const timer = getTimer(settings, alert.id);
            if (timer) {
                resetTimer(timer); // dismiss = back to idle, ready to run again
                if (effectiveTimeMode(settings, timer) === 'rp') persistRpTimerRun(timer, context);
            }
        } else if (alert.kind === 'alarm') {
            const alarm = getAlarm(settings, alert.id);
            if (alarm) {
                if (effectiveTimeMode(settings, alarm) === 'rp') {
                    // RP: a one-shot is done; a repeat re-arms from the current story time.
                    if (isOneShot(alarm)) { alarm.enabled = false; alarm.rpArm = null; }
                    else { alarm.rpArm = armRpAlarm(alarm, currentRpMoment(context.chat)) ?? null; }
                    queueWeyPhoneSave(context);
                } else if (isOneShot(alarm)) {
                    updateAlarm(settings, alarm.id, { enabled: false }); // a one-shot is done
                    alarmNextFire.delete(alarm.id);
                    queueWeyPhoneSave(context);
                    syncAlarmTick(settings);
                } else {
                    alarmNextFire.set(alarm.id, computeNextFire(alarm, Date.now())); // schedule the next repeat
                    syncAlarmTick(settings);
                }
            }
        }
    });
}

function snoozeCurrentAlert() {
    closeCurrentAlert((alert) => {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        if (alert.kind === 'timer') {
            const timer = getTimer(settings, alert.id);
            if (timer) {
                startTimer(timer, settings, currentRpMoment(context.chat)); // snooze a timer = run it again
                if (effectiveTimeMode(settings, timer) === 'rp') persistRpTimerRun(timer, context);
            }
        } else if (alert.kind === 'alarm') {
            const alarm = getAlarm(settings, alert.id);
            if (alarm) {
                if (effectiveTimeMode(settings, alarm) === 'rp') {
                    const m = currentRpMoment(context.chat);
                    alarm.rpArm = m ? { armedFrom: m, targetMinutes: 5 } : null; // re-fire after 5 RP minutes
                    queueWeyPhoneSave(context);
                } else {
                    alarmNextFire.set(alarm.id, Date.now() + ALARM_SNOOZE_MS); // re-fire in 5 minutes
                    syncAlarmTick(settings);
                }
            }
        }
    });
}

// ---- Real (wall-clock) alarm scheduler ----

function fireAlarmAlert(alarm) {
    const h = alarm.hour % 12 || 12;
    const time = `${h}:${String(alarm.minute).padStart(2, '0')} ${alarm.hour < 12 ? 'AM' : 'PM'}`;
    enqueueAlert({
        kind: 'alarm',
        id: alarm.id,
        title: alarm.title?.trim() || 'Alarm',
        subtitle: time,
        imageUrl: alarm.imageUrl || '',
        soundUrl: alarm.soundUrl || '',
    });
}

// Checks each enabled REAL alarm against the wall clock. Runs in the background whenever any enabled
// real alarm exists, so an alarm can pop the phone open. On fire, the alarm is pulled from the map so
// it doesn't re-fire while the going-off screen is up; Dismiss/Snooze re-establish its next time.
function alarmTickFrame() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const now = Date.now();
    let anyReal = false;
    for (const alarm of getVisibleAlarms(settings, context.chatId)) {
        if (!alarm.enabled || effectiveTimeMode(settings, alarm) === 'rp') continue;
        anyReal = true;
        let next = alarmNextFire.get(alarm.id);
        if (next === undefined) {
            next = computeNextFire(alarm, now);
            if (next === null) continue; // nothing to schedule (e.g. a past one-shot date)
            alarmNextFire.set(alarm.id, next);
        }
        if (now >= next) {
            alarmNextFire.delete(alarm.id); // don't re-fire until Dismiss/Snooze re-arms it
            fireAlarmAlert(alarm);
        }
    }
    if (!anyReal) stopAlarmTick();
}
function startAlarmTick() {
    if (alarmTickHandle === null) alarmTickHandle = setInterval(alarmTickFrame, 5000);
}
function stopAlarmTick() {
    if (alarmTickHandle !== null) { clearInterval(alarmTickHandle); alarmTickHandle = null; }
}
/** Keep the alarm checker alive while any enabled REAL alarm exists (global, any screen). */
function syncAlarmTick(settings) {
    const chatId = SillyTavern.getContext().chatId;
    const anyReal = getVisibleAlarms(settings, chatId).some(a => a.enabled && effectiveTimeMode(settings, a) !== 'rp');
    if (anyReal) startAlarmTick(); else stopAlarmTick();
}

// ---- RP (story-time) alarm firing ----

/** The next RP moment an alarm should fire at, relative to `from`. Null if unschedulable. */
function rpTargetMoment(alarm, from) {
    if (alarm.kind === RECURRENCE.DATE) {
        // RP stories are often yearless, so a specific-date RP alarm fires at the next occurrence of
        // that MONTH/DAY in the story (the picked year is ignored). rpMinutesBetween rolls a
        // month/day that's already behind `from` forward to its next occurrence.
        const [, mo, d] = String(alarm.date ?? '').split('-').map(Number);
        if (!mo || !d) return null;
        return { year: from.year, month: mo - 1, day: d, hour: alarm.hour, minute: alarm.minute };
    }
    // NEXT (once) / DAILY: next arrival of hour:minute strictly after `from`.
    const anchorY = from.year ?? 2000;
    const fromMs = Date.UTC(anchorY, from.month, from.day, from.hour, from.minute);
    let tMs = Date.UTC(anchorY, from.month, from.day, alarm.hour, alarm.minute);
    if (tMs <= fromMs) tMs += 24 * 60 * 60 * 1000;
    const d = new Date(tMs);
    return { year: from.year == null ? null : d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/** Arm an RP alarm from a moment: { armedFrom, targetMinutes }, or null if already past (missed). */
function armRpAlarm(alarm, from) {
    const target = rpTargetMoment(alarm, from);
    if (!target) return null;
    const mins = rpMinutesBetween(from, target);
    if (mins === null || mins < 0) return null;
    return { armedFrom: from, targetMinutes: mins };
}

function alarmTimeLabel(alarm) {
    const h = alarm.hour % 12 || 12;
    return `${h}:${String(alarm.minute).padStart(2, '0')} ${alarm.hour < 12 ? 'AM' : 'PM'}`;
}

/** LATE note: an RP alarm already fired this turn — react to it going off (used for non-closest ones). */
function alarmInjectionText(alarm, userName) {
    const name = alarm.title?.trim() || 'Alarm';
    return `[WEYPHONE ALARM] ${userName}'s phone alarm "${name}" is set to go off at ${alarmTimeLabel(alarm)}. If they're asleep or occupied, let it intrude on the scene and react naturally.`;
}

/** EARLY note: a standing instruction so the AI rings the alarm in the very turn the scene reaches it. */
function earlyAlarmInjectionText(alarm, userName) {
    const name = alarm.title?.trim() || 'Alarm';
    const time = alarmTimeLabel(alarm);
    return `[WEYPHONE ALARM] ${userName} has a phone alarm set for ${time} ("${name}"). Don't mention or trigger it until the scene's clock reaches ${time}; then have it go off and wake them.`;
}

/**
 * The single closest enabled RP alarm (in this chat) within the early-injection window, for the
 * forward "ring when reached" note. Returns { id, text } or null.
 */
function computeEarlyAlarmInjection(context, settings) {
    const moment = currentRpMoment(context.chat);
    if (!moment) return null;
    let closest = null;
    let minRemaining = Infinity;
    for (const alarm of getVisibleAlarms(settings, context.chatId)) {
        if (!alarm.enabled || effectiveTimeMode(settings, alarm) !== 'rp' || !alarm.rpArm) continue;
        const elapsed = rpMinutesBetween(alarm.rpArm.armedFrom, moment);
        if (elapsed === null) continue;
        const remaining = alarm.rpArm.targetMinutes - elapsed;
        if (remaining > 0 && remaining < minRemaining) { minRemaining = remaining; closest = alarm; }
    }
    if (!closest || minRemaining > EARLY_INJECT_WINDOW_MIN) return null;
    return { id: closest.id, text: earlyAlarmInjectionText(closest, context.name1 || 'User') };
}

// Fire RP alarms whose story-time target has been reached, on each new message in their chat. Timing
// is measured forward from a persisted armedFrom moment, so it survives reload. The alarm is advanced
// on Dismiss/Snooze (not here); the going-off dedup keeps repeat alerts from stacking meanwhile.
function refreshRpAlarmsOnMessage() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const moment = currentRpMoment(context.chat);
    if (!moment) return;
    let changed = false;
    const fired = [];
    for (const alarm of getVisibleAlarms(settings, context.chatId)) {
        if (!alarm.enabled || effectiveTimeMode(settings, alarm) !== 'rp') continue;
        if (!alarm.rpArm) {
            const arm = armRpAlarm(alarm, moment);
            if (!arm) {
                if (isOneShot(alarm)) { alarm.enabled = false; changed = true; } // a past specific date = missed
                continue;
            }
            alarm.rpArm = arm;
            changed = true;
        }
        const elapsed = rpMinutesBetween(alarm.rpArm.armedFrom, moment);
        if (elapsed !== null && elapsed >= alarm.rpArm.targetMinutes) fired.push(alarm);
    }
    if (changed) queueWeyPhoneSave(context);
    for (const alarm of fired) fireAlarmAlert(alarm);
    if (fired.length) {
        // The closest alarm already had the EARLY (forward) note, so it should have rung in-scene;
        // only the others need the LATE one-shot note so simultaneous fires still react.
        const userName = context.name1 || 'User';
        const notes = fired.filter(alarm => alarm.id !== earlyInjectAlarmId).map(alarm => alarmInjectionText(alarm, userName));
        if (notes.length) pendingAlarmInjection = [pendingAlarmInjection, ...notes].filter(Boolean).join('\n');
    }
    if (fired.length === 0 && changed && currentView === 'clock' && currentClockTab === 'alarms') showScreen('clock');
}

// ---- Sound/image picker ----

function openPicker(field) {
    pickerField = field;
    pickerReturn = currentView;
    pickerItems = null;
    imgLevel = 'root';
    imgChar = null;
    imgCostumeData = null;
    if (field === 'image') imgCharacters = buildCharacterList();
    showScreen('clock-picker');
    void loadPickerItems(field);
}

/** Character/folder list for the image picker: the static WT roster + the user's installed cards. */
function buildCharacterList() {
    const context = SillyTavern.getContext();
    const installed = Array.isArray(context.characters) ? context.characters.map(c => c?.name).filter(Boolean) : [];
    return [...new Set([...staticRoster(), ...installed])].sort((a, b) => a.localeCompare(b));
}

/**
 * Whether NSFW content should be SHOWN. WT's `NSFW` variable is inverted from its name: it means
 * "force safe" when true (see Mien's `forceSafe` and the Pic QR, where NSFW==true shows the censor
 * sticker). So NSFW content is allowed only when the flag is falsy. Local chat var overrides global.
 */
function isNsfwEnabled() {
    const context = SillyTavern.getContext();
    const local = context.chatMetadata?.variables?.NSFW;
    const global = context.extensionSettings?.variables?.global?.NSFW;
    const value = local !== undefined ? local : global;
    const forceSafe = /^(true|1|yes|on)$/i.test(String(value ?? '').trim());
    return !forceSafe;
}

/** Probe a character's known costume folders (+ base folder), keeping those that return images. */
async function probeCostumes(char) {
    const names = costumeProbeList(char, { nsfw: isNsfwEnabled() });
    const targets = [{ folder: char, label: 'Default' }, ...names.map(c => ({ folder: `${char}/${c}`, label: c }))];
    const results = await Promise.all(targets.map(async target => {
        try {
            const res = await fetch('/api/sprites/get?name=' + encodeURIComponent(target.folder));
            if (!res.ok) return null;
            const data = await res.json();
            const images = Array.isArray(data) ? data.map(sprite => sprite?.path).filter(Boolean) : [];
            return images.length ? { label: target.label, images } : null;
        } catch { return null; }
    }));
    return results.filter(Boolean);
}

async function loadPickerItems(field) {
    try {
        if (field === 'sound') {
            const res = await fetch('/api/assets/get', { method: 'POST', headers: getRequestHeaders() });
            const data = await res.json();
            const bgm = Array.isArray(data?.bgm) ? data.bgm : [];
            pickerItems = bgm.map(p => ({ label: pickerBasename(p), url: '/' + String(p).replace(/^\/+/, '') }));
        } else {
            // The Weyland greeting-image folder (user/images/Weyland), served at /user/images/Weyland/.
            const res = await fetch('/api/images/list', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ folder: 'Weyland', sortField: 'name' }) });
            const files = await res.json();
            pickerItems = (Array.isArray(files) ? files : []).map(f => `/user/images/Weyland/${encodeURIComponent(f)}`);
        }
    } catch {
        pickerItems = [];
    }
    if (currentView === 'clock-picker' && pickerField === field) showScreen('clock-picker'); // refresh once loaded
}

// The Weyland greeting folder holds real greeting backgrounds alongside other assets. Backgrounds are
// the 3-digit files 000–799; 099, 147, and 154 are literal phone screenshots, not usable wallpapers.
const EXCLUDED_GREETINGS = new Set(['099', '147', '154']);

/**
 * Greeting URLs to show as wallpaper / alarm images. Keeps only real greeting backgrounds — 3-digit
 * filenames 000–799, minus the phone-screenshot files — then drops NSFW greetings while SFW. The
 * 3-digit rule also removes the NSFW.avif censor sticker and any non-numeric or 800+ asset.
 */
function filterGreetings(urls) {
    if (urls === null) return null;
    const nsfw = isNsfwEnabled();
    return urls.filter(url => {
        const base = String(url).split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
        if (!/^\d{3}$/.test(base) || Number(base) > 799) return false; // real greetings are 000–799
        if (EXCLUDED_GREETINGS.has(base)) return false;                // literal phone screenshots
        if (!nsfw && isNsfwGreeting(url)) return false;                // hide NSFW greetings while SFW
        return true;
    });
}

/** Load a folder-backed wallpaper gallery (Weyland greetings get NSFW-filtered; FFFox raw). */
async function loadWallpaperFolder(folder) {
    try {
        const res = await fetch('/api/images/list', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ folder, sortField: 'name' }) });
        const files = await res.json();
        let urls = (Array.isArray(files) ? files : []).map(f => `/user/images/${encodeURIComponent(folder)}/${encodeURIComponent(f)}`);
        urls = folder === 'Weyland' ? (filterGreetings(urls) ?? []) : urls.filter(u => !/\/NSFW\.avif$/i.test(u));
        wallpaperFolderItems = urls;
    } catch {
        wallpaperFolderItems = [];
    }
    if (currentView === 'folder-wallpapers' && wallpaperFolder === folder) showScreen('folder-wallpapers');
}

/** The editor draft the picker is choosing for (timer or alarm). */
function pickerDraft() {
    return pickerReturn === 'alarm-editor' ? alarmDraft : timerDraft;
}

function setPickerValue(value) {
    const draft = pickerDraft();
    if (draft) {
        if (pickerField === 'sound') draft.soundUrl = value;
        else draft.imageUrl = value;
    }
    stopPreview();
    showScreen(pickerReturn || 'clock');
}

function stopPreview() {
    if (previewAudio) { try { previewAudio.pause(); } catch { /* ignore */ } previewAudio = null; }
}

function previewSound(url) {
    stopPreview();
    if (!url) return;
    try { previewAudio = new Audio(url); previewAudio.play().catch(() => { /* blocked/bad url */ }); } catch { /* ignore */ }
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
        : (view === 'clock' || view === 'timer-editor' || view === 'alarm-editor' || view === 'clock-alert' || view === 'clock-picker') ? 'clock'
        : view === 'pawxai' ? 'pawxai'
        : view === 'mien' ? 'mien'
        : view === 'registrar-coming-soon' ? 'registrar'
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
            communityContactCount: getCommunityContacts(settings).length,
        });
        return;
    }

    if (view === 'community-contacts-books') {
        title.textContent = 'Community Contacts';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderCommunityBooksScreen(screenBody, {
            worldNames: communityPickableBookNames(world_names.filter(name => name !== 'Weyland')),
            selected: communityPickerState.selectedBooks,
        });
        return;
    }

    if (view === 'community-contacts-pick') {
        title.textContent = 'Community Contacts';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderCommunityPickScreen(screenBody, {
            candidates: communityPickerState.candidates,
            selected: communityPickerState.selectedCandidates,
            existingKeys: new Set(getCommunityContacts(settings).map(c => `${c.name.toLowerCase()}|${c.lorebookName.toLowerCase()}`)),
        });
        return;
    }

    if (view === 'community-contacts-delete') {
        title.textContent = 'Delete Community Contacts';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderCommunityDeleteScreen(screenBody, {
            contacts: getCommunityContacts(settings),
            selected: communityPickerState.selectedDeletes,
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

    if (view === 'registrar-coming-soon') {
        title.textContent = resolveAppLabel(settings, 'registrar');
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderComingSoonScreen(screenBody, {
            label: resolveAppLabel(settings, 'registrar'),
            note: 'The Weyland Registrar is on its way to WeyPhone.',
        });
        return;
    }

    if (view === 'clock-alert') {
        if (!currentAlert) {
            showScreen('clock');
            return;
        }
        title.textContent = currentAlert.kind === 'alarm' ? 'Alarm' : 'Timer';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderClockAlertScreen(screenBody, { alert: currentAlert });
        return;
    }

    if (view === 'clock') {
        title.textContent = resolveAppLabel(settings, 'clock');
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        const clockRpMoment = currentRpMoment(context.chat);
        renderClockScreen(screenBody, {
            tab: currentClockTab,
            timers: getVisibleTimers(settings, context.chatId),
            alarms: getVisibleAlarms(settings, context.chatId),
            runtimeOf: (timer) => timerDisplayState(timer, settings, clockRpMoment),
            defaultMode: getDefaultTimeMode(settings),
        });
        syncClockTick(settings);
        return;
    }

    if (view === 'character-wallpapers') {
        title.textContent = 'Character Wallpapers';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderCharacterWallpapersScreen(screenBody, { settings });
        return;
    }

    if (view === 'folder-wallpapers') {
        const isGreetings = wallpaperFolder === 'Weyland';
        title.textContent = isGreetings ? 'Greetings Wallpapers' : 'FFFox Wallpapers';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderFolderWallpapersScreen(screenBody, {
            title: isGreetings ? 'Greetings Wallpapers' : 'FFFox Wallpapers',
            emptyHint: isGreetings ? 'No greeting images found.' : 'No FFFox wallpapers yet — add images to user/images/FFFox.',
            images: wallpaperFolderItems,
            currentValue: settings.ui?.wallpaper ?? '',
        });
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

    if (view === 'timer-editor') {
        if (!timerDraft) {
            showScreen('clock');
            return;
        }
        title.textContent = timerDraftIsNew ? 'New Timer' : 'Timer';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderTimerEditorScreen(screenBody, { timer: timerDraft, isNew: timerDraftIsNew, chatOpen: Boolean(context.chatId) });
        return;
    }

    if (view === 'alarm-editor') {
        if (!alarmDraft) {
            showScreen('clock');
            return;
        }
        title.textContent = alarmDraftIsNew ? 'New Alarm' : 'Alarm';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderAlarmEditorScreen(screenBody, { alarm: alarmDraft, isNew: alarmDraftIsNew, chatOpen: Boolean(context.chatId) });
        return;
    }

    if (view === 'clock-picker') {
        if (!pickerReturn || !pickerDraft()) {
            showScreen('clock');
            return;
        }
        title.textContent = pickerField === 'image' ? 'Choose Image' : 'Choose Sound';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        const draft = pickerDraft();
        const currentValue = (pickerField === 'image' ? draft.imageUrl : draft.soundUrl) || '';
        const imgNav = pickerField === 'image'
            ? { level: imgLevel, char: imgChar, characters: imgCharacters, costumeData: imgCostumeData }
            : undefined;
        // Only the greetings level gets the greeting filter; costume/character levels pass through
        // (their images aren't 3-digit-named and are already NSFW-scoped at probe time).
        const items = pickerField === 'image' && imgLevel === 'greetings' ? filterGreetings(pickerItems) : pickerItems;
        renderClockPickerScreen(screenBody, { field: pickerField, items, currentValue, imgNav });
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
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    // A message without a stored displayTime predates scene-time capture (or was sent before
    // this conversation was attached to a roleplay). The current scene clock is not its
    // historical send time, so leave the wire-time blank instead of inventing a timestamp that
    // changes whenever the scene advances. The original epoch remains stored for IRL mode.
    if (settings.ui?.rpClockEnabled) return '';
    return formatClockTime(timestamp);
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
                maxMessages: settings.tetherContextMessages,
            })
            : { caution: null, groups: [] };
        const reconciled = reconcileTetherPrompts(plan, tetherPromptKeys);
        for (const op of reconciled.ops) {
            context.setExtensionPrompt(op.key, op.content, op.position, op.depth, op.scan ?? false, op.role);
        }
        tetherPromptKeys = reconciled.nextKeys;
        // RP-alarm note (IN_CHAT depth 0, system role). EARLY: a standing "ring when reached" note for
        // the closest upcoming alarm (recomputed each turn, so it rings on time in the crossing turn).
        // LATE: any one-shot note for alarms that already fired (consumed once). Empty = cleared.
        const early = computeEarlyAlarmInjection(context, settings);
        earlyInjectAlarmId = early?.id ?? null;
        const alarmNote = [early?.text, pendingAlarmInjection].filter(Boolean).join('\n');
        context.setExtensionPrompt(RP_ALARM_INJECT_KEY, alarmNote || '', 1, 0, false, 0);
        pendingAlarmInjection = null;
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
        } else if (currentView === 'timer-editor') {
            // Back = discard the draft (a new timer is dropped; edits to an existing one are reverted).
            timerDraft = null;
            timerDraftIsNew = false;
            showScreen('clock');
        } else if (currentView === 'alarm-editor') {
            alarmDraft = null;
            alarmDraftIsNew = false;
            showScreen('clock');
        } else if (currentView === 'clock-alert') {
            dismissCurrentAlert(); // back = dismiss the going-off screen
        } else if (currentView === 'clock-picker') {
            stopPreview();
            if (pickerField === 'image' && imgLevel !== 'root') {
                imgLevel = 'root'; // step up from a character's costumes / greetings to the list
                imgChar = null;
                imgCostumeData = null;
                showScreen('clock-picker');
            } else {
                showScreen(pickerReturn || 'clock'); // back = cancel, keep the current value
            }
        } else if (currentView === 'kressa-settings') {
            showScreen('conversation');
        } else if (currentView === 'app-names') {
            showScreen('settings-app');
        } else if (currentView === 'character-wallpapers') {
            showScreen('settings-app');
        } else if (currentView === 'folder-wallpapers') {
            showScreen('settings-app');
        } else if (currentView === 'community-contacts-pick') {
            showScreen('community-contacts-books');
        } else if (currentView === 'community-contacts-books' || currentView === 'community-contacts-delete') {
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
    // The shared-header saved-posts button (Chronicle/Discorgi/Yip Yap — see the
    // #wp-panel[data-view="phone-app"] visibility rule in style.css). Lives in #wp-panel-header,
    // which is static markup created once and never re-rendered, so — unlike the screenBody click
    // delegation below that handles Chitter's own in-content copy of this same button id — it
    // needs its own direct listener attached here at setup time.
    document.getElementById('wp-phone-app-saved-button').addEventListener('click', () => {
        currentSavedAppKey = currentPhoneApp;
        showScreen('saved-posts');
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
    // RP-time timers advance with the story, so a new message (carrying a fresh scene header) is
    // their tick. Real-time timers are unaffected (they run off the wall-clock interval).
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, refreshRpTimersOnMessage);
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, refreshRpAlarmsOnMessage);
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
        if (handleTetherContextRangeInput(event.target)) return;
        if (applyTimerFieldFromEvent(event.target)) return;
        if (applyAlarmFieldFromEvent(event.target)) return;
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
    // Load WeyPhone's data from its own file BEFORE anything reads settings, migrating an existing
    // install out of settings.json on first run. On any failure this returns null (or the legacy
    // copy) and WeyPhone falls back to whatever ST already loaded into extensionSettings, so a
    // storage problem degrades to the old behavior instead of showing an empty phone.
    try {
        const stored = await migrateWeyPhoneStore();
        if (stored) {
            context.extensionSettings[MODULE_NAME] = stored;
        }
    } catch (error) {
        console.error('[WeyPhone] Could not load stored data; falling back to settings.json copy:', error);
    }
    const settings = getSettings(context.extensionSettings);
    // Sweep stale per-chat caches once per load. These are keyed by chatId and were never cleaned
    // up, so they grew with the number of chats a user had ever opened. Both are regenerable caches.
    const prunedBuckets = pruneOrphanedChatBuckets(settings);
    initializeSettingsSync(settings);
    if (prunedBuckets) {
        log(`Pruned ${prunedBuckets} stale per-chat cache bucket${prunedBuckets === 1 ? '' : 's'}`);
        queueWeyPhoneSave(context);
    }
    initPanel();
    syncAlarmTick(settings); // resume watching any enabled real alarms from a previous session
    log('WeyPhone initialized');
});
