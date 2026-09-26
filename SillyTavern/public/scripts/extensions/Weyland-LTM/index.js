// =====================================================================
// Weyland-LTM — Long-Term Memory manager (v1.3.3)
// =====================================================================
// Full-JS replacement for the STscript LTM pipeline (Sleep / LTMPrompt /
// LTMDisabler / MemorySaver). Async draft generation, editable draft
// window (with a dedicated editable title field), reroll (regenerates from
// source when known, otherwise rewrites), pin, merge, bulk-select delete,
// version history, backward-compat ingest of entries created by the old
// system.
//
// Generation goes through ChatCompletionService (raw API call) rather
// than the chat Generate() pipeline, so:
//   - Weyland-Router's interceptor never fires on LTM calls (no pause
//     dance needed)
//   - streaming works into our own editor even when chat streaming is
//     globally disabled
//   - a per-call model override never touches the user's settings
//
// See README.md for the full architecture writeup (prompt structure,
// storage format, the character-card POV tag convention) and
// USER_GUIDE.md for the plain-language version to hand to end users.
// =====================================================================

import {
    loadWorldInfo,
    saveWorldInfo,
    createWorldInfoEntry,
    createNewWorldInfo,
    METADATA_KEY,
    world_names,
} from '../../world-info.js';
import { oai_settings } from '../../openai.js';
import { main_api } from '../../../script.js';
import { SlashCommand } from '../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../slash-commands/SlashCommandParser.js';
import { getLocalVariable } from "../../variables.js";

const ctx = SillyTavern.getContext();
const {
    extensionSettings,
    saveSettingsDebounced,
    eventSource,
    event_types,
} = ctx;

export const WLM_MODULE_NAME = 'Weyland-LTM';
const EXT_VERSION = '1.6.0';

// Default LTM model out of the box for every fresh install. Lucky wants
// Sonnet reserved for actual roleplay messaging rather than burned on LTM
// summarization, so these are the alternatives offered as quick-fill
// buttons in the settings panel. Existing users who've already saved a
// (possibly blank) modelOverride are untouched — RECOMMENDED_LTM_MODEL only
// applies as the default the first time the extension initializes for a
// given install.
const RECOMMENDED_LTM_MODEL = 'gemini-3.8-flash';
// NOTE: LTM keeps its own list rather than sharing WeyPhone's ALTERNATE_PHONE_MODELS — the two
// extensions are independently installable, so a model added to one must be added here too.
const ALTERNATE_LTM_MODELS = ['minimax-m3', 'gemini-3.1-pro-preview'];
// Second choice when the chosen model errors out. MiniMax M3 is the house fallback
// across WeyPhone/PawXai/Kressa too: cheap, fast, available, and never Sonnet.
const FALLBACK_LTM_MODEL = 'minimax-m3';

// The provider renamed this model in place (same model, new id string). Anyone who used the old
// quick-fill button has the dead id saved in modelOverride, where every LTM summarization would
// silently fail against it — so rewrite it on load rather than waiting for them to notice.
// gemini-3.6-flash and 3.7-flash are both obsolete, superseded by 3.8. Neither id
// appears as a literal anywhere any more — they only survive as values saved in
// existing users' settings, which is exactly what this map is for.
const STALE_MODEL_RENAMES = {
    'gemini-3-pro-preview': 'gemini-3.1-pro-preview',
    'gemini-3.6-flash': 'gemini-3.8-flash',
    'gemini-3.7-flash': 'gemini-3.8-flash',
    // Helix lost access to GLM 4.7 entirely (2026-09-15); a stored setting pointing at either id
    // fails every LTM request, so both are rewritten to the recommended model rather than left
    // to error.
    'glm-4.7-thinking': 'gemini-3.8-flash',
    'glm-4.7': 'gemini-3.8-flash',
};

// =====================================================================
// SETTINGS
// =====================================================================

/**
 * @typedef {Object} WeylandLTMSettings
 * @property {boolean} enabled
 * @property {boolean} debug
 * @property {string} modelOverride          // '' => use main chat model
 * @property {string} connectionProfileId    // '' => use the live chat connection
 * @property {number} messagesBetweenLTMs    // suggestion cadence
 * @property {number} summarizeSpan          // legacy manual span; 0 = auto. Superseded by the
 *                                           // per-chat span override in __chatState, kept so an
 *                                           // existing install's saved value still applies.
 * @property {boolean} allowOversizedSpans   // opt out of MAX_SUMMARIZE_MESSAGES
 * @property {number} activeLTMCount         // how many stay constant-loaded before demotion
 * @property {number} maxVersionsPerEntry    // cap version history
 * @property {number} maxResponseTokens      // generation budget
 * @property {boolean} streamDrafts          // stream tokens into the editor
 * @property {boolean} suggestLTMs           // show the "Time for an LTM?" chip when due (Off mode only — Semi/Full auto-trigger instead)
 * @property {'off'|'semi'|'full'} autoLtmMode // off = manual only; semi = auto-draft, manual approve; full = auto-draft AND auto-save
 * @property {'auto'|'first'|'third'} povMode // auto = 1st person solo / 3rd person for groups
 * @property {Object} __drafts               // per-chat unsaved editor state
 * @property {Object} __chatState            // per-chat { lastLtmMessageId, lastAutoDraftMessageId, goalOverride }
 */

/** @type {WeylandLTMSettings} */
const defaultSettings = {
    enabled: true,
    debug: false,
    modelOverride: RECOMMENDED_LTM_MODEL,
    // '' = use the live chat connection directly (the default, and what almost
    // everyone wants — a Helix plan is one connection and this Just Works).
    // Set to a Connection Profile id to route LTM through that profile instead,
    // for the minority running several providers. See resolveLTMProfileId.
    connectionProfileId: '',
    fallbackModel: FALLBACK_LTM_MODEL,
    messagesBetweenLTMs: 50,
    summarizeSpan: 0,
    allowOversizedSpans: false,
    activeLTMCount: 3,
    maxVersionsPerEntry: 10,
    maxResponseTokens: 2000,
    streamDrafts: true,
    suggestLTMs: true,
    autoLtmMode: 'off',
    povMode: 'auto',
    __drafts: {},
    __chatState: {},
};

/** @type {WeylandLTMSettings} */
let settings;

function loadSettings() {
    extensionSettings[WLM_MODULE_NAME] ??= structuredClone(defaultSettings);
    settings = extensionSettings[WLM_MODULE_NAME];
    for (const [k, v] of Object.entries(defaultSettings)) {
        if (settings[k] === undefined) settings[k] = structuredClone(v);
    }
    // Idempotent: only rewrites an exact stale id, so it's a no-op once migrated (and for anyone
    // who never picked the renamed model).
    const renamed = STALE_MODEL_RENAMES[settings.modelOverride];
    if (renamed) settings.modelOverride = renamed;
}

function persistSettings() {
    saveSettingsDebounced();
}

// =====================================================================
// LOGGING
// =====================================================================

function ltmLog(msg, data) {
    if (!settings?.debug) return;
    data !== undefined
        ? console.debug(`[${WLM_MODULE_NAME}] ${msg}`, data)
        : console.debug(`[${WLM_MODULE_NAME}] ${msg}`);
}

function ltmWarn(msg, data) {
    data !== undefined
        ? console.warn(`[${WLM_MODULE_NAME}] ${msg}`, data)
        : console.warn(`[${WLM_MODULE_NAME}] ${msg}`);
}

function toast(kind, msg) {
    try { globalThis.toastr?.[kind]?.(msg, 'Weyland-LTM'); } catch { /* no toastr, no problem */ }
}

// =====================================================================
// MODEL RESOLUTION
// =====================================================================
// Same source->field map Weyland-Router uses. We only READ from it —
// the override is passed per-call, never written to settings.

const MODEL_FIELD_BY_SOURCE = {
    openai: 'openai_model',
    claude: 'claude_model',
    openrouter: 'openrouter_model',
    ai21: 'ai21_model',
    makersuite: 'google_model',
    vertexai: 'vertexai_model',
    mistralai: 'mistralai_model',
    cohere: 'cohere_model',
    perplexity: 'perplexity_model',
    groq: 'groq_model',
    nanogpt: 'nanogpt_model',
    deepseek: 'deepseek_model',
    aimlapi: 'aimlapi_model',
    xai: 'xai_model',
    pollinations: 'pollinations_model',
    moonshot: 'moonshot_model',
    fireworks: 'fireworks_model',
    cometapi: 'cometapi_model',
    custom: 'custom_model',
};

function getCurrentSource() {
    return oai_settings?.chat_completion_source || 'custom';
}

function getCurrentModelId() {
    const field = MODEL_FIELD_BY_SOURCE[getCurrentSource()] || 'custom_model';
    return oai_settings?.[field] || oai_settings?.custom_model || '';
}

function resolveGenerationModel() {
    return (settings.modelOverride || '').trim() || getCurrentModelId();
}

// The <select> option lists used for the settings field and the titlebar quick
// switcher. Sources: whatever the live connection actually offers, plus our own
// recommended/alternate ids (which may not be in the dropdown if the user is on a
// different provider) and whatever is currently saved — a saved id must always be
// selectable, or opening settings would silently rewrite it to something else.
const MODEL_SELECTORS_BY_SOURCE = {
    openai: ['#model_openai_select option'],
    claude: ['#model_claude_select option'],
    openrouter: ['#model_openrouter_select option'],
    makersuite: ['#model_google_select option'],
    vertexai: ['#model_vertexai_select option'],
    mistralai: ['#model_mistralai_select option'],
    cohere: ['#model_cohere_select option'],
    groq: ['#model_groq_select option'],
    nanogpt: ['#model_nanogpt_select option'],
    deepseek: ['#model_deepseek_select option'],
    aimlapi: ['#model_aimlapi_select option'],
    xai: ['#model_xai_select option'],
    moonshot: ['#model_moonshot_select option'],
    fireworks: ['#model_fireworks_select option'],
    cometapi: ['#model_cometapi_select option'],
    custom: ['#model_custom_select option', '#model_custom_select_fill option'],
};

function collectAvailableModelIds() {
    const ids = new Set();
    const add = (value) => {
        const id = String(value || '').trim();
        if (id && id !== 'none' && id !== 'None') ids.add(id);
    };

    add(RECOMMENDED_LTM_MODEL);
    ALTERNATE_LTM_MODELS.forEach(add);

    try {
        const selectors = MODEL_SELECTORS_BY_SOURCE[getCurrentSource()] || MODEL_SELECTORS_BY_SOURCE.custom;
        document.querySelectorAll(selectors.join(',')).forEach(opt => add(/** @type {HTMLOptionElement} */ (opt).value));
        const modelIds = SillyTavern.getContext().chatCompletionSettings?.['model_ids'];
        if (Array.isArray(modelIds)) modelIds.forEach(rec => add(typeof rec === 'string' ? rec : (rec?.id || rec?.name)));
    } catch (err) {
        ltmWarn('Could not read the available model list', err);
    }

    add(getCurrentModelId());
    add(settings?.modelOverride);
    return Array.from(ids).sort((a, b) => a.localeCompare(b));
}

/**
 * Builds the <option> markup shared by both model pickers.
 * '' is a real, meaningful value here (follow the live chat model), so it is an
 * option rather than a placeholder.
 */
function buildModelOptions(selectedId) {
    const current = String(selectedId || '');
    const options = [`<option value=""${current === '' ? ' selected' : ''}>Use current chat model${getCurrentModelId() ? ` (${escapeHtml(getCurrentModelId())})` : ''}</option>`];
    for (const id of collectAvailableModelIds()) {
        const label = id === RECOMMENDED_LTM_MODEL ? `${id} — recommended` : id;
        options.push(`<option value="${escapeHtml(id)}"${id === current ? ' selected' : ''}>${escapeHtml(label)}</option>`);
    }
    return options.join('');
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// =====================================================================
// CONNECTION PROFILE (opt-in)
// =====================================================================
// LTM normally posts straight to the live chat connection, which is correct for
// almost every install — a Helix plan is a single connection and the chat model
// and the LTM model live on the same endpoint. The exception is someone running
// several providers: a bare model id like "glm-4.7-thinking" sent while an
// OpenRouter profile is active is a model OpenRouter has never heard of (it
// namespaces them, "z-ai/glm-4.6"), and the request just fails. Pinning a profile
// keeps the model and the endpoint that serves it together.

function getConnectionProfiles() {
    const profiles = extensionSettings.connectionManager?.profiles;
    return Array.isArray(profiles) ? profiles : [];
}

/** The profile to send through, or '' to use the live connection directly. */
function resolveLTMProfileId() {
    const wanted = String(settings.connectionProfileId || '').trim();
    if (!wanted) return '';
    // A profile can be deleted after being chosen here. Fall back to the default
    // path rather than throwing — a memory that generates on the live connection
    // beats one that does not generate at all.
    if (!getConnectionProfiles().some(p => p.id === wanted)) {
        ltmWarn(`Connection profile ${wanted} no longer exists; using the live chat connection instead`);
        return '';
    }
    return wanted;
}

function buildProfileOptions(selectedId) {
    const current = String(selectedId || '');
    const options = [`<option value=""${current === '' ? ' selected' : ''}>Use my current chat connection (recommended)</option>`];
    for (const profile of getConnectionProfiles()) {
        const label = profile.api ? `${profile.name} (${profile.api})` : profile.name;
        options.push(`<option value="${escapeHtml(profile.id)}"${profile.id === current ? ' selected' : ''}>${escapeHtml(label)}</option>`);
    }
    return options.join('');
}

// =====================================================================
// JOB REGISTRY — async draft generations
// =====================================================================

/**
 * @typedef {Object} LTMJob
 * @property {string} id
 * @property {'queued'|'generating'|'ready'|'failed'} status
 * @property {string} chatId
 * @property {{ firstMessageId:number, lastMessageId:number } | null} range   // messages to feed the CURRENT generation call
 * @property {string} model
 * @property {string} draft
 * @property {string} [error]
 * @property {number} startedAt
 * @property {number} [finishedAt]
 * @property {string[]} versions
 * @property {{role:string, content:string}[]} [messagesOverride]  // set for merge/rewrite jobs instead of building fresh from `range`
 * @property {boolean} isFreshSummary       // true only for a from-scratch summary of new chat messages — gates recordLTMCoverage
 * @property {boolean} [autoTriggered]       // created by maybeAutoTrigger (semi/full Auto-LTM), not a manual "+ New LTM" click
 * @property {{ firstMessageId:number, lastMessageId:number } | null} [sourceRangeForSave]  // persisted on the saved entry so a later reroll can regenerate from source
 * @property {string} [rewriteTargetUid]    // entry replaced on save
 * @property {string[]} [mergeSourceUids]   // entries consumed on save
 * @property {AbortController} [abort]
 */

// In-memory only, intentionally not persisted to extensionSettings — a
// generating/ready draft that hasn't been saved yet is lost on a full page
// reload. This is an accepted tradeoff (drafts are cheap to regenerate;
// persisting partial generations/AbortControllers across reloads would add
// real complexity for little benefit). Saved entries obviously aren't
// affected — those live in the lorebook, not here.
/** @type {Map<string, LTMJob>} */
const jobs = new Map();

function createJob(chatId, range, extra = {}) {
    const job = /** @type {LTMJob} */ ({
        id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
        status: 'queued',
        chatId,
        range,
        model: resolveGenerationModel() || '(current model)',
        draft: '',
        startedAt: Date.now(),
        versions: [],
        ...extra,
    });
    jobs.set(job.id, job);
    return job;
}

function getJobsForChat(chatId) {
    return [...jobs.values()].filter(j => j.chatId === chatId);
}

// =====================================================================
// CHAT HELPERS
// =====================================================================

function getCurrentChatId() {
    const c = SillyTavern.getContext();
    return String(c.chatId ?? 'unknown');
}

// Weyland Tavern doesn't use SillyTavern's native group-chat feature at all —
// multi-character casts (e.g. Cerberus Sisters: Fawne, Neshe, Astrid) are
// authored as a single character card, so groupId is never set and there's
// no reliable signal to auto-detect "this is actually a multi-character
// cast" from ST's own APIs. Instead, POV is read from a tag baked into the
// character card itself (character.data.tags — the creator-embedded tags
// field, separate from SillyTavern's local per-install tag_map), so the
// backend team can set it once per character file and it travels with the
// card to every subscriber. Recognized tags (case-insensitive):
//   "LTM-POV-First" / "LTM-POV-Third" / "LTM-POV-Group" (alias for Third)
function getCharacterPovTag() {
    const c = SillyTavern.getContext();
    const character = c.characters?.[c.characterId];
    const cardTags = character?.data?.tags;
    if (!Array.isArray(cardTags)) return null;
    for (const raw of cardTags) {
        const t = String(raw).trim().toLowerCase().replace(/[:\s]/g, '-');
        if (t === 'ltm-pov-first') return 'first';
        if (t === 'ltm-pov-third' || t === 'ltm-pov-group') return 'third';
    }
    return null;
}

function getCurrentCharacterName() {
    const c = SillyTavern.getContext();
    return c.name2 || 'the character';
}

function getUserName() {
    return SillyTavern.getContext().name1 || 'the user';
}

// Weybot and Mirror Weyland are open-world Weyland framing cards, not characters. The scene is
// populated entirely by subbot NPCs, and the card name is a system label that never appears in the
// fiction — so there is no viewpoint character to anchor a memory on, and no NPC can be treated as
// "the" protagonist. Naming the card in the prompt caused two reported bugs: weaker models wrote
// third-person memories about "Weybot" itself instead of the NPCs actually in the scene, and auto
// POV had to guess whose first person to write in, landing on the persona in one memory and an NPC
// in the next. These runs are therefore always third person, and never name a viewpoint character.
const OPEN_WORLD_CARDS = new Set(['weybot', 'mirrorweyland']);

/**
 * Collapses a card name to letters and digits only, then drops a trailing copy
 * number, so every spelling of the same card lands on one key.
 *
 * This used to be an exact match on the raw display name, which meant a card
 * SillyTavern had named even slightly differently was not recognised as open
 * world at all — and the most common way that happens is importing a second
 * copy, which yields "Weybot_2". Both "Weybot" and "Weybot_2" exist in the
 * shipped chats folder, so this was reachable on a normal install: the run
 * silently fell through to 1st person and wrote WeyBot memories from the
 * perspective of whichever NPC the model latched onto.
 *
 * Handles: "WeyBot", "weybot", "Weybot_2", "Weybot 2", "Weybot (2)",
 * "Mirror Weyland", "Mirror-Weyland", "MirrorWeyland".
 */
function normalizeCardName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .replace(/\d+$/, '');
}

function isOpenWorldRun() {
    const normalized = normalizeCardName(getCurrentCharacterName());
    const isOpenWorld = OPEN_WORLD_CARDS.has(normalized);
    ltmLog(`open-world check: "${getCurrentCharacterName()}" -> "${normalized}" -> ${isOpenWorld}`);
    return isOpenWorld;
}

/**
 * How the prompt should describe whose memory this is. A real character is named; an open-world
 * run is described instead, so the card's system name never enters the prompt at all.
 */
function memorySubjectLabel() {
    return isOpenWorldRun()
        ? 'an open-world Weyland session'
        : `the character "${getCurrentCharacterName()}"`;
}

/**
 * The "use real names" instruction, shared by the merge and rewrite prompts. On an open-world run
 * the card name must be named only to forbid it — a merge or reroll of an open-world memory would
 * otherwise be told to write "Weybot" in as a real character's name.
 */
function openWorldNamesLine(character, user) {
    return isOpenWorldRun()
        ? `Use the real names of everyone who appears, and "${user}" for the player. "${character}" is the system label for the world itself, NOT a person — it must never appear in your output or stand in for a character's name.`
        : `Use real names in your output ("${character}", "${user}").`;
}

// Same field WeyPhone's buildPersonaContextBlock reads (see lib/contactContext.js) — the active
// SillyTavern persona description, not anything LTM-specific.
function getPersonaDescription() {
    return SillyTavern.getContext().powerUserSettings?.persona_description || '';
}

function collectChatRange(firstMessageId, lastMessageId) {
    const chat = SillyTavern.getContext().chat || [];
    const slice = chat.slice(Math.max(0, firstMessageId), lastMessageId + 1);
    return slice
        .filter(m => !m.is_system && typeof m.mes === 'string' && m.mes.trim())
        .map(m => `${m.name || (m.is_user ? getUserName() : getCurrentCharacterName())}: ${m.mes}`)
        .join('\n\n');
}

// Weyland's writing style mandates every AI message open with a header like
// "¦¦ Saturday, June 4th ~ 11:51 PM ~ Flight JL062, Tokyo-Bound ~ (SAPH) ¦¦"
// (see the [HEADER FORMATTING] instructions in WeylandUni.json). That means
// the in-story date/time is almost always sitting right there in the chat
// log — no need to make the model guess it, which is what caused it to fall
// back to today's real-world date.
const HEADER_RE = /¦¦\s*([^¦\n]+?)\s*¦¦/;

/**
 * @param {string} mes
 * @returns {{date:string, time:string, location:string, tag:string} | null}
 */
function extractMessageHeader(mes) {
    if (!mes) return null;
    const m = String(mes).match(HEADER_RE);
    if (!m) return null;
    const [date, time, location, tag] = m[1].split('~').map(s => s.trim());
    if (!date || !time) return null;
    return { date, time, location: location || '', tag: (tag || '').replace(/[()]/g, '') };
}

/**
 * Walks the message range in order and returns every header found,
 * de-duping consecutive repeats (edited/regenerated messages often repeat
 * the same header). The last entry is the most recent in-story moment
 * covered by this excerpt — the right anchor date for the memory.
 */
function extractTimelineFromRange(firstMessageId, lastMessageId) {
    const chat = SillyTavern.getContext().chat || [];
    const slice = chat.slice(Math.max(0, firstMessageId), lastMessageId + 1);
    const timeline = [];
    for (const m of slice) {
        if (m.is_user || m.is_system) continue;
        const h = extractMessageHeader(m.mes);
        if (!h) continue;
        const prev = timeline[timeline.length - 1];
        if (prev && prev.date === h.date && prev.time === h.time) continue;
        timeline.push(h);
    }
    return timeline;
}

// On auto (summarizeSpan 0) "every N messages" is also the natural size for
// a single memory, so the cadence doubles as the span; a manual
// summarizeSpan overrides just that size, never the "skip what's already
// covered" start point computed elsewhere.
// Hard ceiling on how many messages go into one LTM. The chat context tops out
// around 80 messages, so a user asking for 120 produces a request that simply
// fails. 70 leaves headroom for the prompt scaffolding on top of the transcript.
// Overridable per-install via the settings checkbox, with a warning.
const MAX_SUMMARIZE_MESSAGES = 70;

function getSpanCap() {
    return settings.allowOversizedSpans ? Number.POSITIVE_INFINITY : MAX_SUMMARIZE_MESSAGES;
}

function resolveSummarizeSpan() {
    const manualSpan = Math.floor(Number(settings.summarizeSpan) || 0);
    const span = manualSpan > 0
        ? Math.max(10, manualSpan)
        : Math.max(10, Number(settings.messagesBetweenLTMs) || 50);
    return Math.min(span, getSpanCap());
}

/** The user's hand-set coverage window for this chat, if they edited it in the sidebar. */
function getSpanOverride(chatId = getCurrentChatId()) {
    const override = settings.__chatState[chatId]?.spanOverride;
    if (!override || !Number.isInteger(override.first) || !Number.isInteger(override.last)) return null;
    return override;
}

function setSpanOverride(chatId, first, last) {
    settings.__chatState[chatId] ??= {};
    settings.__chatState[chatId].spanOverride = {
        first: Math.max(0, Math.floor(first)),
        last: Math.max(0, Math.floor(last)),
    };
    persistSettings();
}

function clearSpanOverride(chatId) {
    if (settings.__chatState[chatId]) {
        delete settings.__chatState[chatId].spanOverride;
        persistSettings();
    }
}

function computeRangeFromCurrentChat() {
    const chatId = getCurrentChatId();
    const chat = SillyTavern.getContext().chat || [];
    const last = chat.length - 1;

    // An explicit span the user set in the sidebar wins outright — that readout
    // is a promise about what the next LTM will contain, so honour it literally.
    // Both ends are clamped into the messages that actually exist, and ordered,
    // so a stale or mistyped override can never produce an inverted range like
    // "5 / 1 (0 msgs)" — it collapses to the closest real span instead.
    const override = getSpanOverride(chatId);
    if (override) {
        const ceiling = Math.max(0, last);
        const first = Math.min(Math.max(0, Math.min(override.first, override.last)), ceiling);
        let lastId = Math.min(Math.max(0, Math.max(override.first, override.last)), ceiling);
        lastId = Math.max(first, lastId);
        // Trim the end to fit the cap rather than letting an over-limit span through
        // with a warning. Message ranges are inclusive, so 70→140 is 71 messages, not
        // 70 — a hand-typed round span would otherwise sit one over the limit and
        // trip a warning the user can't make sense of ("140 minus 70 IS 70"). Pulling
        // the end back to 139 keeps their arithmetic honest and the warning silent.
        const cap = getSpanCap();
        if (Number.isFinite(cap) && lastId - first + 1 > cap) lastId = first + cap - 1;
        return { firstMessageId: first, lastMessageId: lastId };
    }

    const state = settings.__chatState[chatId];
    // Cover everything since the last saved LTM. This used to be clamped to the
    // CADENCE, which silently dropped the oldest uncovered messages whenever more
    // than a cadence had piled up — 56 uncovered messages produced a 50-message
    // memory and the 6 oldest were lost with no warning (Zoey's report). The cap
    // is now the context-driven one, which is a real limit rather than a setting
    // that happens to double as one.
    //
    // The cap still matters most when no coverage was ever recorded — a fresh
    // install on a long-running chat, or a chat whose only LTMs are legacy entries
    // from the old STscript system (which never wrote __chatState) — where an
    // uncapped range would ship the ENTIRE chat history to the model.
    const cap = getSpanCap();
    let first = (getCoverage(chatId).lastLtmMessageId ?? -1) + 1;
    if (last - first + 1 > cap) first = last - cap + 1;
    if (first > last) first = Math.max(0, last - Math.min(cap, resolveSummarizeSpan()) + 1);
    return { firstMessageId: Math.max(0, first), lastMessageId: Math.max(0, last) };
}

/** How many messages a range covers, inclusive. */
function rangeSize(range) {
    if (!range) return 0;
    return Math.max(0, range.lastMessageId - range.firstMessageId + 1);
}

/**
 * The absolute message index the next LTM is aiming for — either a manual
 * override (like the old system's "Set LTM Goal") or computed from the
 * cadence setting off the last LTM's coverage. Mirrors the old system's
 * "LTM Progress X/Y" concept, just derived instead of hand-tracked.
 */
function getEffectiveGoal(chatId = getCurrentChatId()) {
    const state = settings.__chatState[chatId];
    if (Number.isInteger(state?.goalOverride)) return state.goalOverride;
    return (getCoverage(chatId).lastLtmMessageId ?? -1) + Number(settings.messagesBetweenLTMs || 50);
}

function setGoalOverride(chatId, absoluteMessageId) {
    settings.__chatState[chatId] ??= {};
    settings.__chatState[chatId].goalOverride = Math.max(0, Math.floor(absoluteMessageId));
    persistSettings();
}

function clearGoalOverride(chatId) {
    if (settings.__chatState[chatId]) {
        delete settings.__chatState[chatId].goalOverride;
        persistSettings();
    }
}

function recordLTMCoverage(chatId, lastMessageId) {
    // Overwriting wholesale is intentional — a fresh summary resets the
    // cadence baseline, so any manual goal override should clear too.
    // Keyed by the JOB's chatId, never the currently-open chat — the user is
    // encouraged to keep chatting (even elsewhere) while a draft generates,
    // so "current chat at save time" is not a safe assumption.
    // lastAutoDraftMessageId is explicitly preserved through the wipe —
    // it tracks a DIFFERENT cursor (see recordAutoDraftCoverage below) that
    // must survive saving an out-of-order draft, otherwise a later auto-
    // drafted-but-still-unsaved segment could get re-summarized from
    // scratch by the next auto-trigger.
    const prevAutoDraft = getCoverage(chatId).lastAutoDraftMessageId;
    const coverageAt = Date.now();
    settings.__chatState[chatId] = {
        lastLtmMessageId: lastMessageId,
        ...(prevAutoDraft !== undefined ? { lastAutoDraftMessageId: prevAutoDraft } : {}),
        coverageAt,
    };
    persistSettings();
    writeCoverageMetadata(chatId, settings.__chatState[chatId], coverageAt);
}

// Auto-LTM (semi/full) tracks its OWN cursor, separate from lastLtmMessageId
// (which only advances on an actual save). Semi-Auto drafts are meant to
// STACK — each cap hit queues its own draft with its own span, whether or
// not earlier drafts have been approved yet — so "has coverage advanced"
// can't be answered by "has anything been saved". Without this cursor,
// leaving several semi-auto drafts unapproved would make every subsequent
// auto-trigger recompute the same starting point and re-summarize ground
// an earlier (still-pending) draft already claimed.
function getAutoTriggerCursor(chatId) {
    const state = getCoverage(chatId);
    return Math.max(state?.lastLtmMessageId ?? -1, state?.lastAutoDraftMessageId ?? -1);
}

function recordAutoDraftCoverage(chatId, lastMessageId) {
    // Carry the current lastLtmMessageId along (from whichever copy is newer): this entry becomes
    // the newest record, so if it lacked the save cursor it would win and drop it.
    const { lastLtmMessageId } = getCoverage(chatId);
    const coverageAt = Date.now();
    settings.__chatState[chatId] ??= {};
    settings.__chatState[chatId].lastAutoDraftMessageId = lastMessageId;
    if (lastLtmMessageId !== undefined) settings.__chatState[chatId].lastLtmMessageId = lastLtmMessageId;
    settings.__chatState[chatId].coverageAt = coverageAt;
    persistSettings();
    writeCoverageMetadata(chatId, settings.__chatState[chatId], coverageAt);
}

// ---------------------------------------------------------------------
// Coverage mirror in the chat's own metadata
// ---------------------------------------------------------------------
// The two coverage cursors (lastLtmMessageId, lastAutoDraftMessageId) used to live ONLY in
// settings.__chatState. settings.json is one file shared by every open tab, and each tab saves its
// whole in-memory copy with no merge, so a tab opened BEFORE an LTM save writes the older copy back
// later and the record silently vanishes. (2026-09-25: a phone tab erased a desktop save. The panel
// went back to "none yet", the next LTM would have re-covered message 0 onward, and WeyPhone's
// tethered texting started sending the whole chat as history, since it starts after the cursor.)
//
// So the cursors are ALSO written into the chat's metadata, next to the chat-book name this
// extension already keeps there (METADATA_KEY). The chat file is per chat, travels with renames,
// exports and branches, and SillyTavern's integrity check refuses a stale-tab overwrite of it.
// Each copy carries a timestamp and the NEWER one wins, which keeps the existing overwrite
// semantics exactly (a fresh save still resets the baseline), rather than "highest wins".
// goalOverride / spanOverride stay settings-only: they are optional user tweaks, not coverage.
const COVERAGE_META_KEY = 'weyland_ltm_coverage';

/** The chat-metadata copy, readable only for the chat that is open right now. */
function coverageFromMetadata(chatId) {
    if (chatId !== getCurrentChatId()) return null;
    const value = SillyTavern.getContext().chatMetadata?.[COVERAGE_META_KEY];
    return value && typeof value === 'object' ? value : null;
}

/**
 * The effective coverage cursors for a chat: the newer of the settings copy and the chat-metadata
 * copy. Records written before this mirror existed have no timestamp and count as oldest, so a
 * legacy settings record keeps working until the first new save stamps both.
 * @returns {{ lastLtmMessageId?: number, lastAutoDraftMessageId?: number }}
 */
function getCoverage(chatId) {
    const fromSettings = settings.__chatState[chatId];
    const fromMeta = coverageFromMetadata(chatId);
    const winner = fromMeta && (Number(fromMeta.updatedAt) || 0) > (Number(fromSettings?.coverageAt) || 0)
        ? fromMeta
        : (fromSettings ?? fromMeta ?? {});
    const out = {};
    if (Number.isInteger(winner.lastLtmMessageId)) out.lastLtmMessageId = winner.lastLtmMessageId;
    if (Number.isInteger(winner.lastAutoDraftMessageId)) out.lastAutoDraftMessageId = winner.lastAutoDraftMessageId;
    return out;
}

/** Mirrors the cursors into the open chat's metadata. A job for another chat syncs on next open. */
function writeCoverageMetadata(chatId, state, updatedAt) {
    if (chatId !== getCurrentChatId()) return;
    const c = SillyTavern.getContext();
    if (!c.chatMetadata) return;
    const record = { updatedAt };
    if (Number.isInteger(state?.lastLtmMessageId)) record.lastLtmMessageId = state.lastLtmMessageId;
    if (Number.isInteger(state?.lastAutoDraftMessageId)) record.lastAutoDraftMessageId = state.lastAutoDraftMessageId;
    c.chatMetadata[COVERAGE_META_KEY] = record;
    c.saveMetadataDebounced?.();
}

/**
 * On chat open, bring the two copies back in step: a newer chat copy repairs a settings record a
 * stale tab wiped (so WeyPhone, which reads settings, sees it too), and a newer settings copy
 * (a draft saved while this chat was closed, or a chat LTM covered before this mirror existed)
 * is written into the chat. Writes only when they actually differ.
 */
function syncCoverageOnOpen(chatId) {
    const fromSettings = settings.__chatState[chatId];
    const fromMeta = coverageFromMetadata(chatId);
    const settingsAt = Number(fromSettings?.coverageAt) || 0;
    const metaAt = Number(fromMeta?.updatedAt) || 0;
    const hasSettingsCursor = Number.isInteger(fromSettings?.lastLtmMessageId) || Number.isInteger(fromSettings?.lastAutoDraftMessageId);
    if (fromMeta && metaAt > settingsAt) {
        settings.__chatState[chatId] = { ...(fromSettings ?? {}) };
        for (const key of ['lastLtmMessageId', 'lastAutoDraftMessageId']) {
            if (Number.isInteger(fromMeta[key])) settings.__chatState[chatId][key] = fromMeta[key];
            else delete settings.__chatState[chatId][key];
        }
        settings.__chatState[chatId].coverageAt = metaAt;
        persistSettings();
    } else if (hasSettingsCursor && (!fromMeta || settingsAt > metaAt)) {
        // Legacy records get stamped now so both copies agree from here on.
        const at = settingsAt || Date.now();
        if (!settingsAt) { fromSettings.coverageAt = at; persistSettings(); }
        writeCoverageMetadata(chatId, fromSettings, at);
    }
}

// Each auto segment is capped to exactly one span, even if far more than a
// span's worth of new messages piled up since the cursor — that's what lets
// a long absence produce several appropriately-sized stacked drafts (each
// queued on a later updateChip pass, see maybeAutoTrigger) instead of one
// giant summary swallowing everything at once.
function computeNextAutoRange(chatId) {
    const chat = SillyTavern.getContext().chat || [];
    const last = chat.length - 1;
    const span = resolveSummarizeSpan();
    const cursor = getAutoTriggerCursor(chatId);
    const first = cursor + 1;
    const lastCapped = Math.min(last, cursor + span);
    return { firstMessageId: Math.max(0, first), lastMessageId: Math.max(0, lastCapped) };
}

// =====================================================================
// LTM PROMPT
// =====================================================================
// Every prompt builder below returns a MESSAGE ARRAY, not a single string,
// structured as a sandwich:
//   1. system  — the ruleset (who, format, anti-hallucination, date handling)
//   2. user    — the raw material (chat excerpt / existing entries)
//   3. user    — a short, high-recency reminder sent LAST, right before
//      generation, explicitly telling the model to stop roleplaying and
//      produce the entry now. Models weight the most recent turn heaviest,
//      so this is where "don't just think and then stop" belongs — burying
//      it up in the system message with everything else was letting models
//      wander off after a long <think> block and never actually answer.

const THINKING_DISCIPLINE = `Keep any <think></think> reasoning SHORT — a handful of terse bullet points, not an essay. The instant you close </think>, continue in that SAME response with the actual output. Stopping after only the thinking block is a failure — you are not done until [END MEMORY ENTRY] (or the equivalent closing marker) has been written.`;

/**
 * Identity-only grounding shared by every prompt builder: fixes the summarizer guessing
 * {{user}}'s pronouns from ambiguous names or character-side context when persona info was
 * sitting in SillyTavern the whole time. Bounded strictly to identity so the model doesn't
 * launder unrelated persona biography into the memory as if it were an event.
 * Returns '' when no persona is set, so the block never appears empty.
 * @param {string} user
 * @param {string} personaDescription
 */
function buildPersonaIdentityBlock(user, personaDescription) {
    if (!personaDescription) return '';
    return `\n[USER IDENTITY REFERENCE — "${user}"]\nBackground on "${user}" for identity and pronoun accuracy ONLY. Use it strictly to determine ${user}'s gender/pronouns and identity when the source text itself is ambiguous. Do NOT treat anything below as an event that happened, do NOT copy biographical/appearance details into the memory, and do NOT mention that this reference was provided.\n${personaDescription}\n[END USER IDENTITY REFERENCE]\n`;
}

/**
 * @param {'first'|'third'} [override] explicit POV, bypassing settings.povMode
 * @returns {'first'|'third'}
 */
function resolvePovMode(override) {
    // Open-world runs have no viewpoint character, so first person is meaningless there — this
    // deliberately overrides both the user's setting and an explicit reroll override.
    if (isOpenWorldRun()) return 'third';
    if (override === 'first' || override === 'third') return override;
    if (settings.povMode === 'first') return 'first';
    if (settings.povMode === 'third') return 'third';
    // auto: character card tag wins if present, otherwise default to 1st person
    return getCharacterPovTag() ?? 'first';
}

/**
 * @param {string} chatHistoryText
 * @param {ReturnType<typeof extractTimelineFromRange>} timeline
 */
function buildLTMPrompt(chatHistoryText, timeline = []) {
    const character = getCurrentCharacterName();
    const user = getUserName();
    const openWorld = isOpenWorldRun();
    const povMode = resolvePovMode();
    const wtMemory = getLocalVariable("WTMemory");
    const anchor = timeline.length ? timeline[timeline.length - 1] : null;

    const timelineBlock = timeline.length
        ? `\nTIME MARKERS FOUND IN THIS EXCERPT (from message headers, chronological order — this is ground truth, not something to infer):\n${timeline
            .map((h, i) => `${i + 1}. ${h.date} - ${h.time}${h.location ? ` @ ${h.location}` : ''}${h.tag ? ` [${h.tag}]` : ''}`)
            .join('\n')}\n`
        : '';

    const personaDescription = getPersonaDescription().trim();
    const personaBlock = buildPersonaIdentityBlock(user, personaDescription);

    const dateInstruction = anchor
        ? `- The in-story date and time is already known from the excerpt's own message headers (see TIME MARKERS above) — do NOT infer or invent one. The output template below already has the correct value filled in on the date/time line; reproduce that line exactly as written, character for character.`
        : `- Determine the IN-STORY date and time from context clues in the excerpt itself (explicit dates/times, time-of-day cues, anything establishing the story's own timeline). This is a FICTIONAL scene — it has no relation to today's real-world calendar date, so never use that. If the excerpt gives no explicit date, use a relative marker instead (e.g. "Later that evening", "The next morning") rather than inventing a specific one.`;

    const dateLine = anchor
        ? `[${anchor.date} - ${anchor.time}]`
        : `[IN-STORY DATE AND TIME, taken from the excerpt's own timeline — e.g. "Saturday, June 4th - 11:51 PM" — or a relative marker like "Later that evening" if the excerpt gives no explicit date. Do NOT use today's real-world date.]`;

    const povInstruction = openWorld
        ? `- Write in THIRD PERSON as a neutral, dispassionate narrator — a plain factual account, like an incident report, with no characterization. This is an open-world scene with NO main character: name every person who appears exactly as the excerpt names them, and never treat any one of them as the viewpoint character. Limit the account to what ${user} was present for (no spoilers, no off-screen events, no other characters' private secrets).`
        : povMode === 'first'
            ? `- Write from ${character}'s limited point of view, in FIRST PERSON, in ${character}'s authentic voice — no clinical jargon, no metaphors that don't fit them. Reads like ${character}'s own diary entry. Omit anything ${character} does not know (no spoilers, no other characters' secrets).`
            : `- Write in THIRD PERSON as a neutral, dispassionate narrator — NOT in ${character}'s voice. Do not adopt their personality, speech patterns, or emotional coloring; this is a plain factual account, like an incident report. Still limited to what ${character} would know at the time (no spoilers, no other characters' secrets) — just narrated without characterization.`;

    const narrativeTemplateLine = povMode === 'first'
        ? `[NARRATIVE SECTION — 500 tokens maximum, first person, in ${character}'s voice, like a journal entry]`
        : `[NARRATIVE SECTION — 500 tokens maximum, third person, neutral narrator with no characterization]`;

    const systemMsg = `[MEMORY FORMATION SYSTEM]

You are assisting with memory formation for ${memorySubjectLabel()}. This is NOT a roleplay turn — you are stepping outside the story to produce a structured summary of it, for ${openWorld ? `${user}'s` : "the character's"} own long-term memory.
${timelineBlock}${personaBlock}
Before writing, reason inside a single <think></think> block:
- Confirm the boundaries of the excerpt. Do NOT invent context from before it begins.
${dateInstruction}
- List every location and scene so coverage spans the whole excerpt, not just the end.
- Only include inferences you are 90%+ confident in.
${povInstruction}
${openWorld
        ? `- Use the real names of everyone who appears, exactly as the excerpt names them (and "${user}" for the player) — written out normally, not as placeholders or tokens. "${character}" is the system label for the world itself, NOT a person: it must never appear anywhere in your output, and must never be used in place of an actual character's name.`
        : `- Use real names in your output ("${character}", "${user}") — write them out normally, not as placeholders or tokens.`}
- Refer to "${user}" with the correct gender/pronouns${personaDescription ? ' from the USER IDENTITY REFERENCE above' : ' — if not evident from the excerpt, default to gender-neutral "they/them" rather than guessing'}.

${THINKING_DISCIPLINE}

Output EXACTLY this structure and nothing else:

[MEMORY ENTRY]

${dateLine}

# [SHORT DESCRIPTIVE TITLE]

${narrativeTemplateLine}

MEMORY:
• Location(s): [all locations visited]
• Key Events: [maximum 5, chronological]
• Conversations: [maximum 3 — topics and decisions made]${wtMemory ? ` ${wtMemory}` : ''}

FRAGMENTS:
• "[Meaningful quote worth remembering]" — [speaker, by name]
• [Specific sensory or emotional detail]
• [maximum 5 bullets total]

[END MEMORY ENTRY]

Guidelines: condense repetitive events; keep only major developments. For intimate/NSFW content, summarize briefly (what happened and why it mattered) — never a blow-by-blow.`;

    const excerptMsg = `${openWorld
        ? `CHAT EXCERPT FROM "${user}"'s OPEN-WORLD SESSION (multiple NPCs, no single main character)`
        : `CHAT EXCERPT BETWEEN "${user}" AND "${character}"`} — reference material for the summary below, NOT something to continue:
---
${chatHistoryText}
---`;

    const reminderMsg = `Reminder: do not continue the scene above and do not write a new line of dialogue or narration as ${openWorld ? 'anyone in it' : character}. Your only task right now is to produce the [MEMORY ENTRY] block described in the system instructions, summarizing the excerpt above. ${THINKING_DISCIPLINE}`;

    return [
        { role: 'system', content: systemMsg },
        { role: 'user', content: excerptMsg },
        { role: 'user', content: reminderMsg },
    ];
}

function buildMergePrompt(entryA, entryB) {
    const character = getCurrentCharacterName();
    const user = getUserName();
    // A merged entry is saved without a sourceRange, so a later reroll can only ever rewrite it.
    // Grounding identity here keeps a merge from baking a wrong pronoun into an entry that has
    // lost its link back to the original messages.
    const personaBlock = buildPersonaIdentityBlock(user, getPersonaDescription().trim());
    const systemMsg = `[MEMORY CONSOLIDATION SYSTEM]

You are assisting with memory consolidation for ${memorySubjectLabel()}. This is NOT a roleplay turn.
${personaBlock}
Combine the two memory entries given below into ONE entry in the same format. Preserve all distinct Key Events, Conversations, and Fragments; drop only true duplicates. Keep the narrative in the same voice and point of view as the originals. Choose the earlier entry's date.

${openWorldNamesLine(character, user)} If either source entry contains the literal placeholder text "{{char}}" or "{{user}}" instead of a real name, replace it with the correct real name in your output — don't reproduce the placeholder.

${THINKING_DISCIPLINE}

Output EXACTLY one [MEMORY ENTRY] ... [END MEMORY ENTRY] block in the same structure as the originals, and nothing else.`;

    const entriesMsg = `ENTRY A:
---
${entryA.content}
---

ENTRY B:
---
${entryB.content}
---`;

    const reminderMsg = `Reminder: do not roleplay as ${isOpenWorldRun() ? 'anyone from the scene' : character}. Your only task right now is to output the single merged [MEMORY ENTRY] block described in the system instructions. ${THINKING_DISCIPLINE}`;

    return [
        { role: 'system', content: systemMsg },
        { role: 'user', content: entriesMsg },
        { role: 'user', content: reminderMsg },
    ];
}

function buildRewritePrompt(entry) {
    const character = getCurrentCharacterName();
    const user = getUserName();
    const personaDescription = getPersonaDescription().trim();
    const personaBlock = buildPersonaIdentityBlock(user, personaDescription);
    // A reroll falls back to this rewrite path whenever the entry has no recorded sourceRange
    // (legacy STscript entries and merged entries) — precisely the old entries most likely to
    // carry a misgendered user. The pronoun correction below is therefore an explicit, deliberate
    // exception to the "do not change information" rule; without it the rewrite would faithfully
    // preserve the wrong pronouns and rerolling could never fix them.
    const pronounInstruction = personaDescription
        ? `\n\nIMPORTANT EXCEPTION to "do not change information": if the entry refers to "${user}" with pronouns or gendered wording that contradicts the USER IDENTITY REFERENCE above, correct them. This is a factual correction, not new information. Change nothing else about those sentences.`
        : '';
    const systemMsg = `[MEMORY REWRITE SYSTEM]

You are assisting with cleaning up an existing memory entry for ${memorySubjectLabel()}. This is NOT a roleplay turn.
${personaBlock}
Rewrite the entry given below in the exact same format, improving clarity and prose quality. Preserve all factual content — every Key Event, Conversation, and Fragment must still be present in some form. Do not add new information, do not remove information, and do not change the date/time line.${pronounInstruction}

${openWorldNamesLine(character, user)} If the source entry contains the literal placeholder text "{{char}}" or "{{user}}" instead of a real name, replace it with the correct real name in your output — don't reproduce the placeholder.

${THINKING_DISCIPLINE}

Output EXACTLY one [MEMORY ENTRY] ... [END MEMORY ENTRY] block in the same structure as the original, and nothing else.`;

    const entryMsg = `EXISTING ENTRY:
---
${entry.content}
---`;

    const reminderMsg = `Reminder: do not roleplay as ${isOpenWorldRun() ? 'anyone from the scene' : character}. Your only task right now is to output the rewritten [MEMORY ENTRY] block described in the system instructions. ${THINKING_DISCIPLINE}`;

    return [
        { role: 'system', content: systemMsg },
        { role: 'user', content: entryMsg },
        { role: 'user', content: reminderMsg },
    ];
}

// =====================================================================
// OUTPUT CLEANUP + SHAPE VALIDATION
// =====================================================================

function stripThinkBlocks(text) {
    return String(text || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        // Unclosed think block (mid-stream): hide everything from the tag on,
        // so reasoning never flashes in the editor while streaming.
        .replace(/<think(?:ing)?>[\s\S]*$/i, '')
        .trim();
}

/**
 * Cuts everything before "[MEMORY ENTRY]" and everything after
 * "[END MEMORY ENTRY]" — models often preface the entry with chatter
 * ("I'll analyze the excerpt...") or add a sign-off after it. If the
 * header hasn't appeared yet (still streaming, or a full refusal), the
 * text is returned unchanged so callers can tell the difference.
 */
function cutToMemoryEntry(text) {
    const str = String(text || '');
    const startMatch = str.match(/\[MEMORY ENTRY\]/i);
    if (!startMatch) return str;
    let out = str.slice(startMatch.index);
    const endMatch = out.match(/\[END MEMORY ENTRY\]/i);
    if (endMatch) out = out.slice(0, endMatch.index + endMatch[0].length);
    return out.trim();
}

function validateLTMShape(draft) {
    const trimmed = stripThinkBlocks(draft);
    if (!trimmed) return { ok: false, reason: 'empty output' };
    if (trimmed.length < 100) return { ok: false, reason: 'output too short' };
    if (!/\[MEMORY ENTRY\]/i.test(trimmed)) return { ok: false, reason: 'missing [MEMORY ENTRY] header' };
    if (!/\bMEMORY:/i.test(trimmed)) return { ok: false, reason: 'missing MEMORY section' };
    if (/^(i (can'?t|cannot|won'?t|am unable)|i'?m sorry)/i.test(trimmed)) {
        return { ok: false, reason: 'model refused' };
    }
    return { ok: true };
}

function extractTitleFromDraft(text) {
    const m = String(text || '').match(/^#\s+(.+)$/m);
    return m ? m[1].trim().replace(/[\[\]]/g, '') : '(untitled LTM)';
}

/**
 * Priority order for what to save as an entry's title:
 * 1. The dedicated title input, if the user typed something in it.
 * 2. The "# Title" line parsed out of the body text.
 * 3. Whatever title the entry already had (editing an existing entry
 *    without touching either of the above shouldn't blank its title).
 * 4. "(untitled LTM)" as an absolute fallback.
 */
function resolveTitleForSave(text, fallbackTitle) {
    const manual = titleInputEl()?.value.trim();
    if (manual) return manual;
    const parsed = extractTitleFromDraft(text);
    if (parsed !== '(untitled LTM)') return parsed;
    return fallbackTitle || '(untitled LTM)';
}

/** The bracketed date/time line directly under [MEMORY ENTRY] — see buildLTMPrompt. */
function extractDateFromDraft(text) {
    const m = String(text || '').match(/\[MEMORY ENTRY\]\s*\n+\s*\[([^\]]+)\]/i);
    return m ? m[1].trim() : '';
}

/**
 * Safety net for entries saved during v1.1.0's brief window where the model
 * was (wrongly) told to write literal {{char}}/{{user}} tokens into its
 * output. Resolves any that slipped through so old saved entries don't show
 * broken placeholder text in the sidebar/editor — harmless no-op on entries
 * that never had the bug (real names pass through unchanged).
 */
function displayName(text) {
    return String(text || '')
        .replace(/\{\{char\}\}/gi, getCurrentCharacterName())
        .replace(/\{\{user\}\}/gi, getUserName());
}

// =====================================================================
// GENERATION — raw ChatCompletionService call
// =====================================================================

/**
 * @param {{role:string, content:string}[]} messages
 * @param {boolean} stream
 */
function buildRequestPayload(messages, stream, modelOverride = undefined) {
    const source = getCurrentSource();
    const payload = {
        stream,
        messages,
        model: modelOverride !== undefined ? modelOverride : resolveGenerationModel(),
        chat_completion_source: source,
        max_tokens: Number(settings.maxResponseTokens) || 2000,
        // Ask the API to keep extended thinking minimal where the source
        // supports it (OpenAI-family, OpenRouter, xAI, etc.) — cuts down on
        // the "thinks for a while then stops without ever writing the entry"
        // failure mode. Harmless no-op on sources that don't honor it.
        reasoning_effort: 'min',
    };
    // No model resolvable — let the backend/provider use its default rather
    // than sending an empty string.
    if (!payload.model) delete payload.model;
    // Pass through connection details the backend needs for certain sources.
    if (source === 'custom' && oai_settings?.custom_url) payload.custom_url = oai_settings.custom_url;
    if (oai_settings?.reverse_proxy) {
        payload.reverse_proxy = oai_settings.reverse_proxy;
        payload.proxy_password = oai_settings.proxy_password || '';
    }
    return payload;
}

/**
 * One completion request for a given model. Two transports: a pinned Connection
 * Profile (opt-in, for multi-provider setups) or the live chat connection (the
 * default, and what a single-plan install wants).
 * @returns {Promise<any>} extracted data, or an async generator factory when streaming
 */
async function requestLTMCompletion(messages, model, stream, signal) {
    const profileId = resolveLTMProfileId();

    // The unpinned default posts straight to ChatCompletionService using
    // oai_settings.chat_completion_source — that object is Chat-Completion-only and
    // stays populated with whatever it was last set to even while main_api is
    // something else. Without this check, a user on Text Completion (Featherless,
    // KoboldCpp, etc.) with no LTM profile pinned would silently get a request built
    // from stale/unrelated chat-completion settings instead of their real connection —
    // wrong backend, confusing failure. Fail loudly and tell them the fix instead.
    if (!profileId && main_api !== 'openai') {
        throw new Error(`LTM can't use your live connection (${main_api}) automatically — it only knows how to post to Chat Completion APIs by default. Open LTM settings and pin a Connection Profile for your Text Completion provider instead.`);
    }

    if (profileId) {
        // sendRequest takes the model as an overridePayload, so one profile can
        // serve any model its endpoint exposes — and unlike switching the profile
        // outright (the Router's approach) this never touches the user's live
        // connection, which matters because LTM drafts generate in the background
        // while they keep chatting.
        const service = SillyTavern.getContext().ConnectionManagerRequestService;
        if (!service) throw new Error('ConnectionManagerRequestService not available in this SillyTavern version');
        ltmLog('generating via connection profile', { profileId, model, stream });
        return service.sendRequest(
            profileId,
            messages,
            Number(settings.maxResponseTokens) || 2000,
            { stream, signal, extractData: true },
            model ? { model } : {},
        );
    }

    const service = SillyTavern.getContext().ChatCompletionService;
    if (!service) throw new Error('ChatCompletionService not available in this SillyTavern version');
    const payload = buildRequestPayload(messages, stream, model);
    // Messages logged in full on purpose — this is exactly what gets sent to the
    // model, and that's the point of debug mode. proxy_password is redacted so a
    // pasted console log can't leak it by accident.
    ltmLog('generation payload', { ...payload, proxy_password: payload.proxy_password ? '(redacted)' : undefined });
    return service.processRequest(payload, {}, true, signal);
}

async function generateDraft(job) {
    job.status = 'generating';
    job.draft = '';
    job.error = undefined;
    job.abort = new AbortController();
    updateChip();
    refreshSidebar();
    setEditorGenerating(job, true);

    const messages = job.messagesOverride
        ?? buildLTMPrompt(
            collectChatRange(job.range.firstMessageId, job.range.lastMessageId),
            extractTimelineFromRange(job.range.firstMessageId, job.range.lastMessageId),
        );

    try {
        const stream = !!settings.streamDrafts;
        let result;
        try {
            result = await requestLTMCompletion(messages, resolveGenerationModel(), stream, job.abort.signal);
        } catch (primaryErr) {
            // One retry on the fallback model. Only safe while nothing has been
            // written yet — a mid-stream failure has already put partial text in
            // the editor, and restarting would splice two models' output together.
            const fallback = String(settings.fallbackModel || '').trim();
            const usable = fallback && fallback !== resolveGenerationModel() && !job.abort?.signal?.aborted && !job.draft;
            if (!usable) throw primaryErr;
            ltmWarn(`primary model failed, retrying on fallback "${fallback}"`, primaryErr);
            toast('info', `LTM model failed — retrying on ${fallback}`);
            result = await requestLTMCompletion(messages, fallback, stream, job.abort.signal);
            job.usedFallbackModel = fallback;
        }

        if (typeof result === 'function') {
            // Streaming: result is an async generator factory.
            for await (const chunk of result()) {
                const stripped = stripThinkBlocks(chunk.text ?? '');
                const headerSeen = /\[MEMORY ENTRY\]/i.test(stripped);
                job.draft = cutToMemoryEntry(stripped);
                // Hide any preamble chatter entirely until the model actually
                // reaches the [MEMORY ENTRY] header — don't flash it in the editor.
                streamIntoEditor(job.id, headerSeen ? job.draft : '…composing memory…');
            }
        } else {
            job.draft = cutToMemoryEntry(stripThinkBlocks(result?.content ?? ''));
        }

        const check = validateLTMShape(job.draft);
        if (!check.ok) {
            job.status = 'failed';
            job.error = check.reason;
            toast('warning', `LTM draft failed validation: ${check.reason}`);
        } else {
            job.status = 'ready';
            toast('success', 'LTM draft ready for review');
        }
    } catch (err) {
        if (job.abort?.signal?.aborted) {
            job.status = 'failed';
            job.error = 'stopped by user';
        } else {
            job.status = 'failed';
            job.error = String(err?.error?.message ?? err?.message ?? err);
            ltmWarn('generation failed', err);
            toast('error', `LTM generation failed: ${job.error}`);
        }
    } finally {
        job.finishedAt = Date.now();
        job.abort = undefined;
        setEditorGenerating(job, false);
        updateChip();
        refreshSidebar();
        if (selectedRef.current?.kind === 'job' && selectedRef.current.job.id === job.id) {
            selectJob(job); // refresh title/buttons/draft
        }
    }
}

// =====================================================================
// LOREBOOK IO
// =====================================================================

const LTM_MARKER_PREFIX = 'ltm:'; // new entries: automationId = "ltm:<uuid>"

// Mirrors ST's own `/getchatbook` naming convention exactly (same sanitize
// regex, same "Chat Book <id>" pattern) so that a chat that already has a
// bound lorebook — from the old STscript pipeline, or from the user
// manually attaching one — gets reused instead of a second book getting
// created alongside it.
//
// Per-chat lock: two nearly-simultaneous callers (e.g. Auto-LTM's
// background save landing at the same moment as a manual Save from the
// panel) must not both see "no book yet" and each independently
// createNewWorldInfo() their own — the check-then-create below has a gap
// between reading meta[METADATA_KEY] and the metadata write actually
// completing, and that gap is exactly where a second caller can slip in and
// duplicate the lorebook. Whoever calls first does the real work; anyone
// else for the SAME chat just awaits that same in-flight promise instead of
// racing it. Keyed by chatId, not global, so concurrent activity in
// unrelated chats never blocks on each other.
const chatBookCreationInFlight = new Map(); // chatId -> Promise<string>

async function getOrCreateChatBookName() {
    const c = SillyTavern.getContext();
    const meta = c.chatMetadata;
    if (meta[METADATA_KEY] && Array.isArray(world_names) && world_names.includes(meta[METADATA_KEY])) {
        return meta[METADATA_KEY];
    }
    if (!c.chatId) throw new Error('Open a chat first');
    const chatId = c.chatId;
    const inFlight = chatBookCreationInFlight.get(chatId);
    if (inFlight) return inFlight;

    const creation = (async () => {
        try {
            const name = `Chat Book ${chatId}`.replace(/[^a-z0-9]/gi, '_').replace(/_{2,}/g, '_').substring(0, 64);
            await createNewWorldInfo(name);
            meta[METADATA_KEY] = name;
            await c.saveMetadata();
            document.querySelectorAll('.chat_lorebook_button').forEach(el => el.classList.add('world_set'));
            return name;
        } finally {
            chatBookCreationInFlight.delete(chatId);
        }
    })();
    chatBookCreationInFlight.set(chatId, creation);
    return creation;
}

function getChatBookNameIfExists() {
    const meta = SillyTavern.getContext().chatMetadata;
    const name = meta?.[METADATA_KEY];
    return (name && Array.isArray(world_names) && world_names.includes(name)) ? name : null;
}

// Backward-compat detection for entries created by the old STscript pipeline
// (Sleep/LTMPrompt), which tagged entries with a plain numeric automationId
// (its own internal counter) rather than our "ltm:<uuid>" marker. A numeric
// ID alone isn't proof — plenty of unrelated WI entries could have a numeric
// automationId for other reasons — so it's only trusted as legacy-LTM if the
// content/comment ALSO looks like a memory entry. This is how old users' pre-
// existing memories get picked up by the new panel with zero migration step.
function entryLooksLikeLTM(entry) {
    const autoId = String(entry.automationId ?? '');
    if (autoId.startsWith(LTM_MARKER_PREFIX)) return true;
    if (/^\d+$/.test(autoId)) {
        return /MEMORY ENTRY|LTM/i.test(entry.comment || '') || /MEMORY:/i.test(entry.content || '');
    }
    return false;
}

async function readAllLTMEntries() {
    const bookName = getChatBookNameIfExists();
    if (!bookName) return [];
    let book;
    try {
        book = await loadWorldInfo(bookName);
    } catch (err) {
        ltmWarn('loadWorldInfo failed', err);
        return [];
    }
    if (!book?.entries) return [];

    const out = [];
    for (const entry of Object.values(book.entries)) {
        if (!entryLooksLikeLTM(entry)) continue;
        out.push({
            uid: entry.uid,
            automationId: String(entry.automationId ?? ''),
            title: (entry.comment || extractTitleFromDraft(entry.content) || '(untitled LTM)'),
            date: extractDateFromDraft(entry.content),
            content: entry.content || '',
            constant: !!entry.constant,
            vectorized: !!entry.vectorized,
            disabled: !!entry.disable,
            pinned: !!entry.wlmPinned,
            order: entry.order ?? 0,
            legacy: !String(entry.automationId ?? '').startsWith(LTM_MARKER_PREFIX),
            sourceRange: entry.wlmSourceRange || null,
        });
    }
    out.sort((a, b) => a.order - b.order);
    return out;
}

/**
 * Combines two entries' source ranges into the span that covers both —
 * used when saving a merged entry so it can still be "regenerated from
 * source" later instead of only ever being rewrite-polished.
 */
function unionSourceRange(a, b) {
    if (!a || !b) return null;
    // Merging is allowed on ANY two entries, not just adjacent ones. A min..max union across a gap
    // would claim coverage of messages neither memory ever summarized (merge 1-10 with 50-60 and
    // the union is 1-60), so a later reroll would regenerate from 40 messages of unrelated scene.
    // When the spans don't touch or overlap, record no range at all — reroll then falls back to
    // rewriting the merged text, which is the honest, non-destructive behavior.
    const disjoint = a.lastMessageId + 1 < b.firstMessageId || b.lastMessageId + 1 < a.firstMessageId;
    if (disjoint) return null;
    return {
        firstMessageId: Math.min(a.firstMessageId, b.firstMessageId),
        lastMessageId: Math.max(a.lastMessageId, b.lastMessageId),
    };
}

/**
 * Create or update an LTM lorebook entry. Returns the uid.
 * `sourceRange`, when given, is the original chat message span this memory
 * was summarized from — stored so a later reroll can regenerate from the
 * real conversation instead of just rewriting the saved text. Passing null
 * leaves whatever's already on the entry untouched (a plain text edit
 * shouldn't erase a previously-recorded source range).
 */
async function saveLTMEntry({ uid = null, title, content, pinned = false, sourceRange = null }) {
    const bookName = await getOrCreateChatBookName();
    const book = await loadWorldInfo(bookName);
    if (!book) throw new Error(`Could not load lorebook "${bookName}"`);

    let entry;
    if (uid !== null && book.entries[uid]) {
        entry = book.entries[uid];
    } else {
        entry = createWorldInfoEntry(bookName, book);
        if (!entry) throw new Error('Could not create a new lorebook entry');
        entry.automationId = `${LTM_MARKER_PREFIX}${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
        // Highest order so newest memories sort last (chronological).
        const maxOrder = Math.max(0, ...Object.values(book.entries).map(e => e.order ?? 0));
        entry.order = maxOrder + 1;
        entry.constant = true;
        entry.position = 0; // world_info_position.before === 0 → "before_char" (confirmed against world-info.js:3241)
        entry.preventRecursion = true;
        entry.addMemo = true;
    }

    entry.comment = title;
    entry.content = content;
    entry.disable = false;
    entry.wlmPinned = !!pinned;
    if (sourceRange) entry.wlmSourceRange = sourceRange;

    await saveWorldInfo(bookName, book, true);
    return entry.uid;
}

async function deleteLTMEntry(uid) {
    const bookName = getChatBookNameIfExists();
    if (!bookName) return;
    const book = await loadWorldInfo(bookName);
    if (!book?.entries?.[uid]) return;
    delete book.entries[uid];
    await saveWorldInfo(bookName, book, true);
}

/**
 * Keep the newest `activeLTMCount` unpinned LTMs constant-loaded; demote
 * the rest to vectorized. Pinned entries always stay constant.
 */
async function demoteExcessLTMs() {
    const bookName = getChatBookNameIfExists();
    if (!bookName) return;
    const book = await loadWorldInfo(bookName);
    if (!book?.entries) return;

    // Sorted oldest-first (ascending `order`, which is assigned incrementally
    // at creation time — see saveLTMEntry). That means the FRONT of this
    // array is the oldest unpinned entries and the TAIL is the most recent —
    // `.slice(0, N)` below is "everything except the newest keepCount",
    // i.e. the ones to demote.
    const ltms = Object.values(book.entries)
        .filter(entryLooksLikeLTM)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const unpinned = ltms.filter(e => !e.wlmPinned);
    const keepCount = Math.max(0, Number(settings.activeLTMCount) || 3);
    const demote = unpinned.slice(0, Math.max(0, unpinned.length - keepCount));
    const promote = unpinned.slice(Math.max(0, unpinned.length - keepCount));

    let changed = false;
    for (const e of demote) {
        if (!e.vectorized || e.constant) { e.vectorized = true; e.constant = false; changed = true; }
    }
    for (const e of [...promote, ...ltms.filter(x => x.wlmPinned)]) {
        if (e.vectorized || !e.constant) { e.vectorized = false; e.constant = true; changed = true; }
    }
    if (changed) {
        await saveWorldInfo(bookName, book, true);
        ltmLog('demotion pass complete', { demoted: demote.length });
    }
}

// =====================================================================
// DRAFT PERSISTENCE
// =====================================================================

// How long an unsaved persisted draft survives before the sweep discards it.
const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function saveDraftState(chatId, text, job = null) {
    if (!text || !text.trim()) { discardDraftState(chatId); return; }
    // The job's range/flags MUST travel with the draft text: a draft restored
    // without `isFreshSummary` saves fine but never advances the coverage
    // cursor, so the NEXT "+ New LTM" re-summarizes ground an earlier memory
    // already covered (the "second LTM covered the whole RP again" bug).
    settings.__drafts[chatId] = {
        text,
        savedAt: Date.now(),
        range: job?.range ?? null,
        sourceRangeForSave: job?.sourceRangeForSave ?? null,
        isFreshSummary: job?.isFreshSummary === true,
    };
    persistSettings();
}

function loadDraftState(chatId) {
    return settings.__drafts?.[chatId] ?? null;
}

function discardDraftState(chatId) {
    if (settings.__drafts?.[chatId]) {
        delete settings.__drafts[chatId];
        persistSettings();
    }
}

// Drafts keyed by a chat id that no longer resolves (renamed/deleted chats)
// would otherwise sit in settings forever. Age is the only reliable signal
// we have for "orphaned", so anything past the TTL gets dropped at startup.
function sweepStaleDrafts() {
    let changed = false;
    for (const [chatId, draft] of Object.entries(settings.__drafts || {})) {
        if (!draft?.text?.trim() || (Date.now() - (draft.savedAt || 0)) > DRAFT_TTL_MS) {
            delete settings.__drafts[chatId];
            changed = true;
        }
    }
    if (changed) persistSettings();
}

// =====================================================================
// VERSION HISTORY
// =====================================================================

function pushVersion(job) {
    const check = validateLTMShape(job.draft);
    if (!check.ok) return; // never archive garbage
    job.versions.push(job.draft);
    while (job.versions.length > (Number(settings.maxVersionsPerEntry) || 10)) job.versions.shift();
    renderVersionPicker(job);
}

function renderVersionPicker(job) {
    const picker = /** @type {HTMLSelectElement} */ (document.getElementById('wlm-version-picker'));
    if (!picker) return;
    if (!job || !job.versions.length) { picker.style.display = 'none'; return; }
    picker.style.display = '';
    picker.innerHTML = '<option value="current">Current draft</option>' + job.versions
        .map((_, i) => `<option value="${i}">Version ${i + 1}</option>`)
        .join('');
    picker.value = 'current';
}

// =====================================================================
// UI — NOTIFICATION CHIP
// =====================================================================

const CHIP_ID = 'wlm-chip';

// Auto-hide after this long even if the user never touches it — the old
// "suggest" chip used to just sit there indefinitely, which was the exact
// complaint: too easy to miss on desktop (tiny, top-right corner) and too
// persistent on mobile (ate screen space and wouldn't go away). Tapping it
// dismisses it immediately either way.
const CHIP_AUTO_HIDE_MS = 60 * 1000;
let chipHideTimer = null;
let chipShown = null; // {text, kind} currently on screen — lets repeated calls no-op instead of resetting the clock
// Text of a chip the user tapped to dismiss. A tapped nudge ("Time for an
// LTM?", "LTM ready for approval") must stay gone even though its underlying
// condition is still true and updateChip() keeps re-requesting it on every
// message — otherwise it would just pop straight back on top of the panel
// the tap opened. Cleared once a genuinely different message wants the chip,
// or when the condition lapses entirely (hideChip via updateChip's
// fall-through), so the SAME nudge can legitimately return later.
let chipDismissedText = null;

function ensureChip() {
    if (document.getElementById(CHIP_ID)) return;
    const chip = document.createElement('div');
    chip.id = CHIP_ID;
    chip.className = 'wlm-chip wlm-chip-hidden';
    chip.title = 'Weyland-LTM';
    chip.addEventListener('click', () => {
        // Remember what was tapped so setChip() won't immediately re-show it.
        chipDismissedText = chipShown?.text ?? null;
        hideChipEl();
        openPanel();
    });
    document.body.appendChild(chip);
}

function setChip(text, kind) {
    ensureChip();
    // Suppressed: user tapped this exact message and it hasn't changed.
    if (text === chipDismissedText) { hideChipEl(); return; }
    // Any showable message different from the dismissed one supersedes it.
    chipDismissedText = null;
    const chip = document.getElementById(CHIP_ID);
    chip.textContent = text;
    chip.dataset.kind = kind;
    chip.classList.remove('wlm-chip-hidden');
    // Only (re)start the auto-hide timer for a genuinely NEW notification.
    // updateChip() fires on every incoming message — if a still-true
    // condition (e.g. "due") kept resetting the clock on every call, the
    // chip would never actually time out, which defeats the whole point.
    const isNew = !chipShown || chipShown.text !== text || chipShown.kind !== kind;
    if (isNew) {
        chipShown = { text, kind };
        clearTimeout(chipHideTimer);
        chipHideTimer = setTimeout(hideChipEl, CHIP_AUTO_HIDE_MS);
    }
}

// Hide the element without forgetting a pending dismissal — used by the tap
// handler and the auto-hide timer, so a dismissed-but-still-true nudge stays
// suppressed rather than resurfacing on the next updateChip() pass.
function hideChipEl() {
    document.getElementById(CHIP_ID)?.classList.add('wlm-chip-hidden');
    clearTimeout(chipHideTimer);
    chipHideTimer = null;
    chipShown = null;
}

// Full hide: also clears the dismissal, so once the condition genuinely
// lapses (updateChip's no-notification fall-through) the same nudge is free
// to return the next time it becomes true.
function hideChip() {
    hideChipEl();
    chipDismissedText = null;
}

// =====================================================================
// AUTO-LTM (semi/full)
// =====================================================================
// Three modes, settings.autoLtmMode:
//   'off'  (default) — nothing automatic. Chip nudges when due; user opens
//           the panel and clicks "+ New LTM" themselves, same as always.
//   'semi' — the moment the cadence cap is hit, a draft is generated in the
//           background automatically, but it's never written to the
//           lorebook without the user opening it and hitting Save. The chip
//           tracks progress: "Drafting an LTM…" while generating, then
//           "LTM ready for approval" once it's waiting on the user.
//   'full' — same auto-generation, but the draft is saved the instant it
//           passes validation, with zero manual step. The chip just shows
//           "Generating LTM…" and disappears — nothing is ever left
//           waiting on the user in this mode.
// Rerolling an unsaved auto-drafted job (semi mode) reuses job.range
// unchanged, same as any other job-kind reroll — so "come back 300
// messages later and reroll" still regenerates from the ORIGINAL span,
// never a recomputed/grown one. See onRerollClicked.

async function autoSaveJob(job) {
    try {
        const check = validateLTMShape(job.draft);
        if (!check.ok) {
            toast('warning', `Auto-LTM draft failed validation (${check.reason}) — left for manual review`);
            return false;
        }
        await saveLTMEntry({
            title: extractTitleFromDraft(job.draft),
            content: job.draft,
            sourceRange: job.sourceRangeForSave ?? null,
        });
        if (job.isFreshSummary) recordLTMCoverage(job.chatId, job.range.lastMessageId);
        jobs.delete(job.id);
        discardDraftState(job.chatId);
        await demoteExcessLTMs();
        toast('success', 'LTM auto-saved 🧠');
        return true;
    } catch (err) {
        ltmWarn('auto-save failed', err);
        toast('error', `Auto-LTM save failed: ${err?.message ?? err}`);
        return false;
    }
}

async function runAutoJob(job) {
    await generateDraft(job);
    if (job.status === 'ready' && settings.autoLtmMode === 'full') {
        await autoSaveJob(job);
    }
    // trigger:false — a completed auto-job must NOT immediately queue the
    // next segment on its own. Without this, a long-overdue chat cascades
    // through its entire backlog in one uninterrupted burst (each job's
    // completion re-firing the next), which is exactly the "opened a
    // 300-message chat and got hit with a pile of LTMs" bug. Catching up
    // now happens gradually: at most one new segment per genuine incoming
    // message (see the MESSAGE_RECEIVED listener), never per chat-open and
    // never self-chained.
    updateChip({ trigger: false });
    refreshSidebar();
}

// Called from updateChip() when trigger !== false — i.e. on real new chat
// activity (a message actually arriving), NOT on chat-open/switch and NOT
// automatically re-invoked by a just-finished auto-job (see runAutoJob).
// Uses the auto-draft cursor (getAutoTriggerCursor), NOT "does any job
// already exist for this chat" — semi-auto drafts are meant to STACK, so a
// second cap hit while an earlier draft is still unapproved must queue its
// OWN segment, not get swallowed by an "already have something pending"
// guard. The only thing that DOES block a new trigger is an in-flight
// generation: segments are produced one at a time, never concurrently. A
// long-overdue chat still fully catches up — just one segment per message
// instead of all at once — because each new message re-checks the cursor.
function maybeAutoTrigger(chatJobs) {
    if (settings.autoLtmMode === 'off' || !settings.enabled) return;
    const chatId = getCurrentChatId();
    const chat = SillyTavern.getContext().chat || [];
    if (chat.length < 2) return;
    if (chatJobs.some(j => j.status === 'generating' || j.status === 'queued')) return;
    const span = resolveSummarizeSpan();
    const cursor = getAutoTriggerCursor(chatId);
    if ((chat.length - 1) - cursor < span) return; // not enough new ground since the last auto/saved segment
    const range = computeNextAutoRange(chatId);
    // Advance the cursor immediately (before the async generation even
    // starts) so a rapid second updateChip() call in the same tick can't
    // queue an overlapping segment for the same messages.
    recordAutoDraftCoverage(chatId, range.lastMessageId);
    const job = createJob(chatId, range, { isFreshSummary: true, sourceRangeForSave: range, autoTriggered: true });
    runAutoJob(job); // async on purpose — don't block updateChip's caller
}

// Priority order matters here (checked top to bottom, first match wins): an
// in-flight generation is the most actionable thing to tell the user about,
// then a ready draft, then a failure, and only if none of those apply do we
// fall back to the passive "you might want to make one of these" nudge.
// Manual jobs (a real "+ New LTM" click) always get their own distinct text
// from auto-triggered ones, since the user driving a manual job is already
// looking right at the panel and doesn't need the same "hey, look over
// here" framing an unattended background draft does.
//
// `trigger` (default FALSE) gates whether this pass is allowed to fire
// maybeAutoTrigger. Defaulting to false is deliberate: updateChip() is
// called from a couple dozen places (job lifecycle transitions, settings
// changes, panel open/close, chat switch...), and ANY of those firing a new
// auto-trigger is how a chat-open or a job's own completion turns into a
// self-perpetuating cascade through the entire backlog — the "opened a
// 300-message chat and got hit with a pile of LTMs" bug. Only genuine new
// chat activity (an incoming message) should ever start a new auto-job, so
// only the MESSAGE_RECEIVED listener opts in with {trigger: true}. Every
// other caller still gets a chip that correctly reflects whatever's already
// true (an existing job, an already-due state) — it just can't CAUSE one.
function updateChip({ trigger = false } = {}) {
    if (!settings.enabled) return hideChip();
    let chatJobs = getJobsForChat(getCurrentChatId());
    if (trigger) maybeAutoTrigger(chatJobs);
    chatJobs = getJobsForChat(getCurrentChatId()); // re-fetch: maybeAutoTrigger may have just queued one this same tick

    const generatingAuto = chatJobs.filter(j => j.status === 'generating' && j.autoTriggered);
    const generatingManual = chatJobs.filter(j => j.status === 'generating' && !j.autoTriggered);
    const readyAuto = chatJobs.filter(j => j.status === 'ready' && j.autoTriggered);
    const readyManual = chatJobs.filter(j => j.status === 'ready' && !j.autoTriggered);
    const failed = chatJobs.filter(j => j.status === 'failed').length;

    if (generatingManual.length) return setChip('🧠 LTM generating…', 'info');
    if (generatingAuto.length) {
        return setChip(settings.autoLtmMode === 'full' ? 'Generating LTM…' : 'Drafting an LTM…', 'urgent');
    }
    if (readyManual.length) return setChip(`📝 ${readyManual.length} LTM draft${readyManual.length > 1 ? 's' : ''} ready`, 'ready');
    if (readyAuto.length && settings.autoLtmMode === 'semi') return setChip('LTM ready for approval', 'urgent');
    if (failed) return setChip('⚠️ LTM failed — click to reroll', 'error');

    // The passive due-nudge only applies to Off mode — Semi/Full both
    // auto-trigger the instant the cap is hit (maybeAutoTrigger, above), so
    // there's no "due but nothing happening yet" gap to nudge about there.
    if (settings.autoLtmMode === 'off' && settings.suggestLTMs) {
        const chat = SillyTavern.getContext().chat || [];
        if ((chat.length - 1) >= getEffectiveGoal()) return setChip('Time for an LTM?', 'urgent');
    }
    hideChip();
}

// =====================================================================
// UI — MODAL PANEL
// =====================================================================

const MODAL_ID = 'wlm-modal-overlay';

function buildModalHtml() {
    return `
<div id="${MODAL_ID}" style="display:none; position:fixed; inset:0; z-index:99990; pointer-events:none;">
  <div id="wlm-modal">
    <div id="wlm-titlebar">
      <span class="wlm-title">🧠 Long-Term Memory</span>
      <div class="wlm-titlebar-actions">
        <!-- Quick model switcher: swapping the LTM model is the single most common
             settings trip, so it lives here instead of behind the ⚙ panel.
             This is a real <select> at all times rather than a button that swaps
             itself for one — the swap version looked clickable but never opened,
             because focus()ing a select does not open its native dropdown. -->
        <span class="wlm-model-chip-label">Model:</span>
        <select id="wlm-model-chip-select" class="wlm-model-chip-select" title="Which model writes your memories. This only affects LTM generation — your roleplay chat model is untouched."></select>
        <button id="wlm-settings-btn" title="Open LTM settings — model, cadence, point of view, and more">LTM Settings ⚙</button>
        <button id="wlm-close-btn" title="Close">✕</button>
      </div>
    </div>
    <div id="wlm-body">
      <div id="wlm-sidebar">
        <div class="wlm-sidebar-actions">
          <button id="wlm-new-btn" class="wlm-btn-primary" title="Generate a new LTM from recent messages">+ New LTM</button>
          <button id="wlm-merge-btn" class="wlm-btn-sm" disabled title="Check two entries below, then merge them">Merge</button>
          <button id="wlm-bulk-delete-btn" class="wlm-btn-sm wlm-btn-danger" disabled title="Check one or more entries below, then delete them">🗑 Delete Selected</button>
        </div>
        <div id="wlm-progress-row">
          <div class="wlm-progress-line" title="LEFT: the message number where your last saved memory stopped. Everything after it is not yet remembered.&#10;RIGHT: the message number where the next memory is due — when you reach it, LTM offers to make one. '(now N)' is the message you are on right now.">
            <span class="wlm-progress-label">Last LTM / next at</span>
            <span id="wlm-last-ltm-text">—</span>
            <span class="wlm-progress-slash">/</span>
            <span id="wlm-progress-text">—</span>
            <input id="wlm-goal-input" type="number" min="0" style="display:none" title="Type the message number you want the next memory to be due at, then press Enter." />
            <button id="wlm-goal-edit-btn" class="wlm-btn-sm" title="Change when the next memory is due. Useful if you want one sooner than the normal schedule.">✎</button>
            <button id="wlm-goal-reset-btn" class="wlm-btn-sm" style="display:none" title="Back to the normal schedule (the 'suggest every N messages' setting).">↺</button>
          </div>
          <div class="wlm-progress-line" title="The exact stretch of chat the next memory will be written from: first message / last message, and how many that is.&#10;By default this is everything since your last memory. Edit it if you want the memory to cover a different stretch.">
            <span class="wlm-progress-label" id="wlm-span-label">Span start / end</span>
            <span id="wlm-span-text">—</span>
            <span id="wlm-span-edit-fields" style="display:none">
              <input id="wlm-span-first" type="number" min="0" title="First message to include. Message numbers are the counter shown on each message in chat." />
              <span class="wlm-progress-slash">/</span>
              <input id="wlm-span-last" type="number" min="0" title="Last message to include. Both ends are included in the memory." />
            </span>
            <button id="wlm-span-edit-btn" class="wlm-btn-sm" title="Pick exactly which messages go into the next memory.">✎</button>
            <button id="wlm-span-reset-btn" class="wlm-btn-sm" style="display:none" title="Back to covering everything since your last memory.">↺</button>
          </div>
          <div id="wlm-span-warning" class="wlm-span-warning" style="display:none"></div>
        </div>
        <div id="wlm-entry-list"></div>
      </div>
      <div id="wlm-editor">
        <div id="wlm-editor-header">
          <button id="wlm-mobile-expand-btn" class="wlm-btn-sm wlm-mobile-only" title="Expand the editor to use most of the screen">⤢</button>
          <span id="wlm-editor-title">No entry selected</span>
          <div class="wlm-editor-meta">
            <span id="wlm-token-count"></span>
            <select id="wlm-version-picker" style="display:none" title="Browse previous reroll attempts for this draft"></select>
          </div>
        </div>
        <input id="wlm-title-input" type="text" placeholder="Memory title" style="display:none" title="Rename this memory. Overrides whatever '# Title' line is in the text below." />
        <textarea id="wlm-editor-body" spellcheck="false" placeholder="Select an LTM from the sidebar, or hit '+ New LTM' to generate a draft from your recent messages."></textarea>
        <div id="wlm-editor-actions">
          <span id="wlm-editor-status"></span>
          <button id="wlm-stop-btn" class="wlm-btn-sm wlm-btn-danger" style="display:none" title="Cancel the current generation">■ Stop</button>
          <button id="wlm-reroll-btn" class="wlm-btn-sm" disabled title="Generate a new attempt. For a saved entry, regenerates from the original messages if known, otherwise rewrites the existing text.">🔁 Reroll</button>
          <button id="wlm-pin-btn" class="wlm-btn-sm" disabled title="Keep this memory permanently loaded — pinned entries are never demoted to vectorized-only.">📌 Pin</button>
          <button id="wlm-delete-btn" class="wlm-btn-sm wlm-btn-danger" disabled title="Delete this memory permanently.">🗑 Delete</button>
          <button id="wlm-save-btn" class="wlm-btn-primary" disabled title="Save this draft/edit to the character's memory.">💾 Save</button>
        </div>
      </div>
      <div id="wlm-settings-pane" style="display:none">
        <h3>Settings</h3>
        <label class="wlm-field wlm-check" title="Turn off to silence the memory chip entirely — no draft-ready, failed, or suggestion notifications will appear.">
          <input id="wlm-set-enabled" type="checkbox" />
          <span>Enable LTM notifications <small>(drafts ready/failed, and suggestions below)</small></span>
        </label>
        <label class="wlm-field" title="Model used only for LTM calls — never affects your actual chat connection. Pick from the models your connection offers, or choose Custom to type an id by hand.">
          <span>Model for LTM generation</span>
          <div class="wlm-inline">
            <select id="wlm-set-model-select" title="Pick the model LTM generation runs on">
              ${buildModelOptions(settings.modelOverride)}
              <option value="__custom__">Custom — type an id…</option>
            </select>
            <button id="wlm-use-current-model" class="wlm-btn-sm" title="Copy the active chat model">Use current</button>
          </div>
          <!-- Kept for ids the dropdown can't know about (a provider the user isn't
               currently connected to). Revealed by the Custom option above. -->
          <input id="wlm-set-model" type="text" placeholder="${getCurrentModelId() || 'model id'}" style="display:none" title="Model id, typed by hand" />
          <div class="wlm-recommend-row">
            <span class="wlm-recommend-label">Recommended LTM Model:</span>
            <button class="wlm-btn-sm wlm-model-quickfill" data-model="${RECOMMENDED_LTM_MODEL}" title="Switch to ${RECOMMENDED_LTM_MODEL}">${RECOMMENDED_LTM_MODEL}</button>
            ${ALTERNATE_LTM_MODELS.map(m => `<button class="wlm-btn-sm wlm-model-quickfill" data-model="${m}" title="Switch to ${m}">${m}</button>`).join('')}
          </div>
          <small class="wlm-recommend-disclaimer">Lucky does not recommend Sonnet for LTM generation. Instead, use gemini-3.8-flash whenever possible — minimax-m3 is a solid alternative. This ensures our Sonnet supply is used for actual messaging rather than LTM requests.</small>
        </label>
        <label class="wlm-field" title="If the model above fails or is unavailable, LTM retries once with this one instead of giving up. Leave it on ${FALLBACK_LTM_MODEL} unless you have a reason to change it.">
          <span>Fallback model <small>(used only if the model above fails)</small></span>
          <select id="wlm-set-fallback-model" title="Second choice, tried once if the first model errors out">
            <option value="">No fallback — fail instead of retrying</option>
          </select>
        </label>
        <label class="wlm-field" title="Which saved connection LTM sends through. Leave this on your current chat connection unless you run more than one provider — if you do, pinning the provider that actually hosts your LTM model stops 'model not found' errors when your chat is connected somewhere else.">
          <span>Connection for LTM <small>(almost everyone should leave this alone)</small></span>
          <select id="wlm-set-profile" title="Leave as-is unless you run several providers"></select>
        </label>
        <label class="wlm-field" title="How many new messages should pass before the reminder banner suggests a new LTM. On Auto below, this also sets how many messages go into each memory.">
          <span>Suggest an LTM every N messages</span>
          <input id="wlm-set-cadence" type="number" min="10" step="10" />
        </label>
        <label class="wlm-field wlm-check" title="Each LTM is capped at ${MAX_SUMMARIZE_MESSAGES} messages because the chat context tops out around 80 — a longer request usually fails outright instead of producing a memory. Tick this only if you know your context window can take it.">
          <input id="wlm-set-oversized" type="checkbox" />
          <span>Allow LTMs longer than ${MAX_SUMMARIZE_MESSAGES} messages <small>(not recommended — larger spans often fail against the context limit)</small></span>
        </label>
        <label class="wlm-field" title="How many recent memories stay permanently loaded in context at once. Older ones switch to semantic-search-only (vectorized) instead of disappearing — pinned memories are always exempt.">
          <span>Active (always-loaded) LTMs — older ones get vectorized <small>(recommended: 3)</small></span>
          <input id="wlm-set-active" type="number" min="0" step="1" />
        </label>
        <label class="wlm-field" title="Generation budget for a single LTM call. Raise this if drafts are getting cut off mid-entry.">
          <span>Max response tokens</span>
          <input id="wlm-set-maxtokens" type="number" min="500" step="100" />
        </label>
        <label class="wlm-field wlm-check" title="Show the draft appearing token-by-token as it generates, instead of waiting silently for the full response.">
          <input id="wlm-set-stream" type="checkbox" />
          <span>Stream drafts into the editor</span>
        </label>
        <label class="wlm-field wlm-check" title="Once enough new messages pile up since the last saved memory, a small \"Time for an LTM?\" banner pops up top-center as a gentle nudge. Only applies in Off mode below — Semi/Full-Auto auto-trigger instead of nudging. Tap it to dismiss, or it clears itself after a minute.">
          <input id="wlm-set-suggest" type="checkbox" />
          <span>Show a reminder when it's time for an LTM</span>
        </label>
        <label class="wlm-field" title="Off: nothing automatic, you click '+ New LTM' yourself. Semi-Auto: a draft is generated in the background the moment you hit your cap, but it still needs your Save. Full-Auto: same background generation, but it saves itself the instant it passes validation — no review step.">
          <span>Auto-LTM</span>
          <select id="wlm-set-automode">
            <option value="off">Off — generate manually (default)</option>
            <option value="semi">Semi-Auto — auto-draft, you approve</option>
            <option value="full">Full-Auto — auto-draft and auto-save</option>
          </select>
          <small>Semi-Auto shows "Drafting an LTM…" then "LTM ready for approval". Full-Auto just shows a brief "Generating LTM…" — nothing is ever left waiting on you.</small>
        </label>
        <label class="wlm-field" title="Controls whether memories are written as the character's own diary entry (1st person) or as a neutral, uncharacterized account (3rd person).">
          <span>Narrative point of view</span>
          <select id="wlm-set-povmode">
            <option value="auto">Auto — reads the character card's tag, else 1st person</option>
            <option value="first">Force 1st person — diary entry, in character's voice</option>
            <option value="third">Force 3rd person — plain narrator, no characterization</option>
          </select>
          <small>"Auto" uses each character's built-in memory style, preconfigured by the Weyland team — most characters journal in 1st person; multi-character casts use a neutral narrator. Pick a forced option only if you want to override that for everyone.</small>
          <small id="wlm-pov-openworld-note" class="wlm-note-locked" style="display:none">Open-world scenes have no single main character, so their memories are always written in 3rd person. 1st person is unavailable here — your saved preference is kept and will apply again on a normal character.</small>
        </label>
        <label class="wlm-field wlm-check" title="For troubleshooting — only enable if asked to.">
          <input id="wlm-set-debug" type="checkbox" />
          <span>Debug</span>
        </label>
        <div class="wlm-settings-actions">
          <button id="wlm-settings-back" class="wlm-btn-primary">← Back to editor</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

let modalInjected = false;

function injectModal() {
    if (modalInjected && document.getElementById(MODAL_ID)) return;
    document.getElementById(MODAL_ID)?.remove();
    document.body.insertAdjacentHTML('beforeend', buildModalHtml());
    modalInjected = true;

    document.getElementById('wlm-close-btn').addEventListener('click', closePanel);
    document.getElementById('wlm-settings-btn').addEventListener('click', () => toggleSettingsView());
    document.getElementById('wlm-settings-back').addEventListener('click', () => toggleSettingsView(false));
    document.getElementById('wlm-new-btn').addEventListener('click', onNewLTMClicked);
    document.getElementById('wlm-merge-btn').addEventListener('click', onMergeClicked);
    document.getElementById('wlm-bulk-delete-btn').addEventListener('click', onBulkDeleteClicked);
    document.getElementById('wlm-stop-btn').addEventListener('click', onStopClicked);
    document.getElementById('wlm-reroll-btn').addEventListener('click', onRerollClicked);
    document.getElementById('wlm-pin-btn').addEventListener('click', onPinToggleClicked);
    document.getElementById('wlm-delete-btn').addEventListener('click', onDeleteClicked);
    document.getElementById('wlm-save-btn').addEventListener('click', onSaveClicked);
    document.getElementById('wlm-editor-body').addEventListener('input', onEditorChanged);
    document.getElementById('wlm-version-picker').addEventListener('change', onVersionPicked);
    document.getElementById('wlm-use-current-model').addEventListener('click', () => applyModelChoice(''));
    // One handler for the recommended model + every alternate quick-fill button.
    document.querySelectorAll('.wlm-model-quickfill').forEach((quickfillBtn) => {
        quickfillBtn.addEventListener('click', () => {
            applyModelChoice(/** @type {HTMLElement} */ (quickfillBtn).dataset.model);
        });
    });
    document.getElementById('wlm-set-model-select').addEventListener('change', (ev) => {
        const value = /** @type {HTMLSelectElement} */ (ev.target).value;
        const manual = /** @type {HTMLInputElement} */ (document.getElementById('wlm-set-model'));
        if (value === '__custom__') {
            // Reveal the free-text box and let its own change handler save.
            manual.style.display = '';
            manual.value = settings.modelOverride || '';
            manual.focus();
            return;
        }
        manual.style.display = 'none';
        applyModelChoice(value);
    });
    document.getElementById('wlm-model-chip-select').addEventListener('change', (ev) => {
        applyModelChoice(/** @type {HTMLSelectElement} */ (ev.target).value);
    });
    document.getElementById('wlm-goal-edit-btn').addEventListener('click', beginGoalEdit);
    document.getElementById('wlm-goal-input').addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') commitGoalEdit();
        if (ev.key === 'Escape') cancelGoalEdit();
    });
    document.getElementById('wlm-goal-input').addEventListener('blur', commitGoalEdit);
    document.getElementById('wlm-goal-reset-btn').addEventListener('click', () => {
        clearGoalOverride(getCurrentChatId());
        renderProgress();
        updateChip();
    });
    document.getElementById('wlm-span-edit-btn').addEventListener('click', beginSpanEdit);
    ['wlm-span-first', 'wlm-span-last'].forEach((id) => {
        const el = document.getElementById(id);
        el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') commitSpanEdit();
            if (ev.key === 'Escape') cancelSpanEdit();
        });
    });
    // Commit on blur, but not when focus simply moved to the OTHER span box —
    // tabbing from start to end would otherwise save a half-edited range.
    ['wlm-span-first', 'wlm-span-last'].forEach((id) => {
        document.getElementById(id).addEventListener('blur', (ev) => {
            const next = /** @type {FocusEvent} */ (ev).relatedTarget;
            const movedWithinEditor = next instanceof HTMLElement
                && (next.id === 'wlm-span-first' || next.id === 'wlm-span-last');
            if (!movedWithinEditor) commitSpanEdit();
        });
    });
    document.getElementById('wlm-span-reset-btn').addEventListener('click', () => {
        clearSpanOverride(getCurrentChatId());
        renderProgress();
        updateChip();
    });
    document.getElementById('wlm-mobile-expand-btn').addEventListener('click', toggleMobileExpand);

    // Settings inputs → live-save on change
    bindSetting('wlm-set-model', 'modelOverride', v => String(v || '').trim());
    bindSetting('wlm-set-cadence', 'messagesBetweenLTMs', v => Math.max(10, Number(v) || 50));
    bindSetting('wlm-set-fallback-model', 'fallbackModel', v => String(v || '').trim());
    bindSetting('wlm-set-profile', 'connectionProfileId', v => String(v || '').trim());
    bindSetting('wlm-set-oversized', 'allowOversizedSpans', null, true);
    bindSetting('wlm-set-active', 'activeLTMCount', v => Math.max(0, Number(v) || 3));
    bindSetting('wlm-set-maxtokens', 'maxResponseTokens', v => Math.max(500, Number(v) || 2000));
    bindSetting('wlm-set-stream', 'streamDrafts', null, true);
    bindSetting('wlm-set-suggest', 'suggestLTMs', null, true);
    bindSetting('wlm-set-debug', 'debug', null, true);
    bindSetting('wlm-set-enabled', 'enabled', null, true);
    bindSetting('wlm-set-povmode', 'povMode', v => (['first', 'third'].includes(v) ? v : 'auto'));
    bindSetting('wlm-set-automode', 'autoLtmMode', v => (['semi', 'full'].includes(v) ? v : 'off'));
    // The free-text box only appears via the Custom option; bindSetting saves the
    // value, this refreshes both pickers so the typed id becomes a real option.
    document.getElementById('wlm-set-model').addEventListener('change', () => syncModelPickers());
    document.getElementById('wlm-set-enabled').addEventListener('change', () => updateChip());
    document.getElementById('wlm-set-cadence').addEventListener('change', () => { renderProgress(); updateChip(); });
    document.getElementById('wlm-set-oversized').addEventListener('change', () => { renderProgress(); updateChip(); });
    document.getElementById('wlm-set-automode').addEventListener('change', () => updateChip());

    setupDragging();

    // Escape closes — but not while typing in the chat beside it. Now that the chat stays usable
    // with the panel open, Escape in SillyTavern's own fields (cancel an edit, etc.) must not also
    // close LTM.
    document.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape') return;
        const overlay = document.getElementById(MODAL_ID);
        if (!overlay || overlay.style.display === 'none') return;
        const active = document.activeElement;
        if (active && !overlay.contains(active) && active.matches?.('input, textarea, select, [contenteditable="true"]')) return;
        closePanel();
    });
}

function bindSetting(elId, key, transform, isCheckbox = false) {
    const el = /** @type {HTMLInputElement} */ (document.getElementById(elId));
    if (!el) return;
    el.addEventListener('change', () => {
        settings[key] = isCheckbox ? el.checked : (transform ? transform(el.value) : el.value);
        persistSettings();
        ltmLog(`setting ${key} =`, settings[key]);
    });
}

function loadSettingsIntoForm() {
    const set = (id, val) => { const el = /** @type {HTMLInputElement} */ (document.getElementById(id)); if (el) el.value = String(val); };
    const check = (id, val) => { const el = /** @type {HTMLInputElement} */ (document.getElementById(id)); if (el) el.checked = !!val; };
    set('wlm-set-model', settings.modelOverride || '');
    set('wlm-set-cadence', settings.messagesBetweenLTMs);
    check('wlm-set-oversized', settings.allowOversizedSpans);
    set('wlm-set-active', settings.activeLTMCount);
    set('wlm-set-maxtokens', settings.maxResponseTokens);
    check('wlm-set-stream', settings.streamDrafts);
    check('wlm-set-suggest', settings.suggestLTMs);
    check('wlm-set-debug', settings.debug);
    check('wlm-set-enabled', settings.enabled);
    set('wlm-set-povmode', settings.povMode || 'auto');
    set('wlm-set-automode', settings.autoLtmMode || 'off');
    // Rebuilt every time the panel opens: the available models depend on the live
    // connection, which can have changed since the modal was first injected.
    syncModelPickers();
    applyOpenWorldPovLock();
}

/**
 * Open-world runs (Weybot / Mirror Weyland) have no viewpoint character, so resolvePovMode forces
 * 3rd person there no matter what is selected. Surface that in the UI instead of silently ignoring
 * the setting: grey out the 1st-person option and explain why. The stored preference is left
 * untouched, so it applies again as soon as a normal character is loaded.
 */
function applyOpenWorldPovLock() {
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('wlm-set-povmode'));
    if (!select) return;
    const openWorld = isOpenWorldRun();

    const firstOption = /** @type {HTMLOptionElement | null} */ (select.querySelector('option[value="first"]'));
    if (firstOption) {
        firstOption.disabled = openWorld;
        firstOption.textContent = openWorld
            ? 'Force 1st person — unavailable in open world'
            : 'Force 1st person — diary entry, in character\'s voice';
    }

    const autoOption = /** @type {HTMLOptionElement | null} */ (select.querySelector('option[value="auto"]'));
    if (autoOption) {
        autoOption.textContent = openWorld
            ? 'Auto — 3rd person (open world has no main character)'
            : 'Auto — reads the character card\'s tag, else 1st person';
    }

    const note = document.getElementById('wlm-pov-openworld-note');
    if (note) note.style.display = openWorld ? '' : 'none';
}

/**
 * Progress readout in the sidebar — "current / goal" messages, mirroring
 * the old system's "LTM Progress X/Y" display, plus an editable override.
 */
function renderProgress() {
    const textEl = document.getElementById('wlm-progress-text');
    if (!textEl) return;
    const chatId = getCurrentChatId();
    const chat = SillyTavern.getContext().chat || [];
    const current = Math.max(0, chat.length - 1);
    const goal = getEffectiveGoal(chatId);
    const lastLtm = getCoverage(chatId).lastLtmMessageId;

    // Line 1 — where the last memory ended, and where the next one is due.
    const lastEl = document.getElementById('wlm-last-ltm-text');
    if (lastEl) lastEl.textContent = Number.isInteger(lastLtm) ? String(lastLtm) : 'none yet';
    textEl.textContent = `${goal} (now ${current})`;
    const hasGoalOverride = Number.isInteger(settings.__chatState[chatId]?.goalOverride);
    const resetBtn = document.getElementById('wlm-goal-reset-btn');
    if (resetBtn) resetBtn.style.display = hasGoalOverride ? '' : 'none';

    renderSpanLine();
}

/**
 * Line 2 — exactly which messages are in play. For a saved entry that's the range
 * it was built from (so you can see what an old memory covers before rerolling
 * it); otherwise it's what the NEXT generated LTM will contain.
 */
function renderSpanLine() {
    const labelEl = document.getElementById('wlm-span-label');
    const spanEl = document.getElementById('wlm-span-text');
    const warnEl = document.getElementById('wlm-span-warning');
    const editBtn = document.getElementById('wlm-span-edit-btn');
    const resetBtn = document.getElementById('wlm-span-reset-btn');
    if (!spanEl) return;

    const chatId = getCurrentChatId();
    const selected = selectedRef.current;
    // A saved entry knows the range it came from; show that instead, read-only.
    const savedRange = selected?.kind === 'entry' ? selected.entry?.sourceRange : null;
    const showingSaved = Boolean(savedRange && Number.isInteger(savedRange.firstMessageId));

    const range = showingSaved ? savedRange : computeRangeFromCurrentChat();
    const size = rangeSize(range);

    if (labelEl) labelEl.textContent = showingSaved ? 'This memory covers' : 'Span start / end';
    spanEl.textContent = Number.isInteger(range?.firstMessageId)
        ? `${range.firstMessageId} / ${range.lastMessageId}  (${size} msg${size === 1 ? '' : 's'})`
        : '—';

    if (editBtn) editBtn.style.display = showingSaved ? 'none' : '';
    if (resetBtn) resetBtn.style.display = (!showingSaved && getSpanOverride(chatId)) ? '' : 'none';

    if (warnEl) {
        // Only ever a warning about the NEXT generation, never about a saved entry.
        const over = !showingSaved && size > MAX_SUMMARIZE_MESSAGES;
        warnEl.style.display = over ? '' : 'none';
        warnEl.textContent = over
            ? `⚠ ${size} messages exceeds the ${MAX_SUMMARIZE_MESSAGES}-message limit — this request may fail against the context window.`
            : '';
    }
}

/**
 * Single entry point for changing the LTM model, whichever control was used —
 * the settings dropdown, a quick-fill button, "Use current", or the titlebar
 * chip. Keeps every picker showing the same value.
 * @param {string} modelId '' means "follow the live chat model".
 */
function applyModelChoice(modelId) {
    settings.modelOverride = String(modelId || '').trim();
    persistSettings();
    syncModelPickers();
}

function syncModelPickers() {
    const current = settings.modelOverride || '';

    const chipSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('wlm-model-chip-select'));
    if (chipSelect) {
        chipSelect.innerHTML = buildModelOptions(current);
        chipSelect.classList.toggle('wlm-model-chip-inherit', !current);
    }

    // Rebuild rather than just setting .value: the available list changes with the
    // connection, and a freshly-typed custom id has to become a real option.
    const settingsSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('wlm-set-model-select'));
    if (settingsSelect) {
        settingsSelect.innerHTML = `${buildModelOptions(current)}<option value="__custom__">Custom — type an id…</option>`;
    }
    const manual = /** @type {HTMLInputElement | null} */ (document.getElementById('wlm-set-model'));
    if (manual && manual.style.display === 'none') manual.value = current;

    // Fallback model: same list, plus an explicit "no fallback" choice. Rebuilt
    // alongside the others so a connection change refreshes every picker at once.
    const fallbackSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('wlm-set-fallback-model'));
    if (fallbackSelect) {
        const fallback = String(settings.fallbackModel ?? '');
        const options = [`<option value=""${fallback === '' ? ' selected' : ''}>No fallback — fail instead of retrying</option>`];
        for (const id of collectAvailableModelIds()) {
            const label = id === FALLBACK_LTM_MODEL ? `${id} — recommended fallback` : id;
            options.push(`<option value="${escapeHtml(id)}"${id === fallback ? ' selected' : ''}>${escapeHtml(label)}</option>`);
        }
        fallbackSelect.innerHTML = options.join('');
    }

    const profileSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('wlm-set-profile'));
    if (profileSelect) profileSelect.innerHTML = buildProfileOptions(settings.connectionProfileId || '');
}

function beginSpanEdit() {
    const spanEl = document.getElementById('wlm-span-text');
    const fields = document.getElementById('wlm-span-edit-fields');
    const firstIn = /** @type {HTMLInputElement} */ (document.getElementById('wlm-span-first'));
    const lastIn = /** @type {HTMLInputElement} */ (document.getElementById('wlm-span-last'));
    if (!spanEl || !fields || !firstIn || !lastIn) return;
    const range = computeRangeFromCurrentChat();
    firstIn.value = String(range.firstMessageId);
    lastIn.value = String(range.lastMessageId);
    fields.style.display = '';
    spanEl.style.display = 'none';
    firstIn.focus();
    firstIn.select();
}

function commitSpanEdit() {
    const spanEl = document.getElementById('wlm-span-text');
    const fields = document.getElementById('wlm-span-edit-fields');
    const firstIn = /** @type {HTMLInputElement} */ (document.getElementById('wlm-span-first'));
    const lastIn = /** @type {HTMLInputElement} */ (document.getElementById('wlm-span-last'));
    if (!fields || fields.style.display === 'none') return; // already committed/cancelled
    const first = Number(firstIn.value);
    const last = Number(lastIn.value);
    if (Number.isFinite(first) && Number.isFinite(last) && first >= 0 && last >= 0) {
        setSpanOverride(getCurrentChatId(), Math.min(first, last), Math.max(first, last));
    }
    fields.style.display = 'none';
    spanEl.style.display = '';
    renderProgress();
    updateChip();
}

function cancelSpanEdit() {
    const spanEl = document.getElementById('wlm-span-text');
    const fields = document.getElementById('wlm-span-edit-fields');
    if (!spanEl || !fields) return;
    fields.style.display = 'none';
    spanEl.style.display = '';
}

function beginGoalEdit() {
    const textEl = document.getElementById('wlm-progress-text');
    const input = /** @type {HTMLInputElement} */ (document.getElementById('wlm-goal-input'));
    if (!textEl || !input) return;
    input.value = String(getEffectiveGoal(getCurrentChatId()));
    input.style.display = '';
    textEl.style.display = 'none';
    input.focus();
    input.select();
}

function commitGoalEdit() {
    const textEl = document.getElementById('wlm-progress-text');
    const input = /** @type {HTMLInputElement} */ (document.getElementById('wlm-goal-input'));
    if (!input || input.style.display === 'none') return; // already committed/cancelled
    const val = Number(input.value);
    if (Number.isFinite(val) && val >= 0) setGoalOverride(getCurrentChatId(), val);
    input.style.display = 'none';
    textEl.style.display = '';
    renderProgress();
    updateChip();
}

function cancelGoalEdit() {
    const textEl = document.getElementById('wlm-progress-text');
    const input = document.getElementById('wlm-goal-input');
    if (!input || !textEl) return;
    input.style.display = 'none';
    textEl.style.display = '';
}

function toggleSettingsView(force) {
    const editor = document.getElementById('wlm-editor');
    const pane = document.getElementById('wlm-settings-pane');
    const showSettings = force !== undefined ? force : pane.style.display === 'none';
    if (showSettings) loadSettingsIntoForm();
    pane.style.display = showSettings ? 'flex' : 'none';
    editor.style.display = showSettings ? 'none' : 'flex';
}

// Mobile-only (see the `.wlm-mobile-only` / `.wlm-mobile-expanded` rules in
// style.css, scoped inside `@media (max-width: 700px)`). Below that width
// the panel stacks list-on-top, editor-on-bottom instead of side-by-side —
// there isn't enough width for two columns, but a half-height editor is
// still cramped for actually reading/writing a memory, hence this toggle to
// temporarily give the editor most of the screen and collapse the list
// down to just its action buttons.
function toggleMobileExpand() {
    const modal = document.getElementById('wlm-modal');
    const btn = document.getElementById('wlm-mobile-expand-btn');
    const expanded = modal.classList.toggle('wlm-mobile-expanded');
    btn.textContent = expanded ? '⤡' : '⤢';
    btn.title = expanded ? 'Shrink the editor back down' : 'Expand the editor to use most of the screen';
}

/** No-op outside the mobile breakpoint — see toggleMobileExpand. */
function autoExpandEditorOnMobile() {
    if (!window.matchMedia('(max-width: 700px)').matches) return;
    document.getElementById('wlm-modal')?.classList.add('wlm-mobile-expanded');
    const btn = document.getElementById('wlm-mobile-expand-btn');
    if (btn) { btn.textContent = '⤡'; btn.title = 'Shrink the editor back down'; }
}

function setupDragging() {
    const modal = document.getElementById('wlm-modal');
    const titlebar = document.getElementById('wlm-titlebar');
    let dragging = false, offX = 0, offY = 0;

    titlebar.addEventListener('mousedown', (ev) => {
        if (/** @type {HTMLElement} */ (ev.target).closest('button')) return;
        dragging = true;
        const rect = modal.getBoundingClientRect();
        offX = ev.clientX - rect.left;
        offY = ev.clientY - rect.top;
        ev.preventDefault();
    });
    window.addEventListener('mousemove', (ev) => {
        if (!dragging) return;
        const W = modal.offsetWidth, H = modal.offsetHeight;
        const newLeft = Math.min(Math.max(0, ev.clientX - offX), window.innerWidth - Math.min(W, 120));
        const newTop = Math.min(Math.max(0, ev.clientY - offY), window.innerHeight - 40);
        modal.style.left = newLeft + 'px';
        modal.style.top = newTop + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; });
}

async function openPanel() {
    injectModal();
    const overlay = document.getElementById(MODAL_ID);
    overlay.style.display = 'block';
    // The overlay stays pointer-events:none (as built in buildModalHtml); only #wlm-modal takes
    // clicks (style.css). Setting the full-screen overlay to 'auto' here turned it into an
    // invisible wall, so on desktop the chat beside the panel could not be clicked or typed in
    // until LTM was closed. Nothing relies on clicks landing on the overlay (no click-outside
    // close), and on phones the panel covers the screen anyway.
    overlay.style.pointerEvents = 'none';
    toggleSettingsView(false);
    syncModelPickers();
    await refreshSidebar();

    const chatId = getCurrentChatId();
    const chatJobs = getJobsForChat(chatId);
    const interesting = chatJobs.find(j => j.status === 'ready')
        ?? chatJobs.find(j => j.status === 'generating')
        ?? chatJobs.find(j => j.status === 'failed');
    if (interesting) {
        selectJob(interesting);
    } else {
        const draft = loadDraftState(chatId);
        if (draft?.text) {
            // Rebuild the job from what the draft actually covered, not from
            // the current chat — and keep its fresh-summary flag so saving it
            // still advances the coverage cursor. (Drafts persisted by older
            // versions carry no range/flags; those fall back to the old
            // recompute-and-don't-advance behavior.)
            const job = createJob(chatId, draft.range ?? computeRangeFromCurrentChat(), {
                isFreshSummary: draft.isFreshSummary === true,
                sourceRangeForSave: draft.sourceRangeForSave ?? null,
            });
            job.status = 'ready';
            job.draft = draft.text;
            selectJob(job);
            document.getElementById('wlm-editor-title').textContent = 'Restored draft';
            refreshSidebar();
        }
    }
    updateChip();
}

function closePanel() {
    const overlay = document.getElementById(MODAL_ID);
    if (!overlay) return;
    overlay.style.display = 'none';
    overlay.style.pointerEvents = 'none';
    // Persist unsaved editor text so nothing is lost on close — keyed by the
    // JOB's chat (not whatever chat happens to be open) and carrying the
    // job's range/flags so a later restore behaves like the original job.
    if (selectedRef.current?.kind === 'job') {
        const job = selectedRef.current.job;
        const editor = /** @type {HTMLTextAreaElement} */ (document.getElementById('wlm-editor-body'));
        saveDraftState(job.chatId, editor?.value ?? '', job);
    }
}

// =====================================================================
// UI — SIDEBAR
// =====================================================================

async function refreshSidebar() {
    const listEl = document.getElementById('wlm-entry-list');
    if (!listEl) return;
    renderProgress();
    listEl.innerHTML = '';
    checkedEntries.clear();
    const mergeBtn = /** @type {HTMLButtonElement} */ (document.getElementById('wlm-merge-btn'));
    if (mergeBtn) mergeBtn.disabled = true;
    const bulkDeleteBtn = /** @type {HTMLButtonElement} */ (document.getElementById('wlm-bulk-delete-btn'));
    if (bulkDeleteBtn) bulkDeleteBtn.disabled = true;

    const chatId = getCurrentChatId();
    for (const job of getJobsForChat(chatId)) {
        const row = document.createElement('div');
        row.className = 'wlm-sidebar-row wlm-row-draft';
        row.textContent = `${statusIcon(job.status)} Draft — ${statusLabel(job.status)}`;
        row.addEventListener('click', () => selectJob(job));
        listEl.appendChild(row);
    }

    let entries = [];
    try {
        entries = await readAllLTMEntries();
    } catch (err) {
        ltmWarn('readAllLTMEntries failed', err);
    }
    entries.forEach((entry, idx) => {
        const row = document.createElement('div');
        row.className = 'wlm-sidebar-row';
        if (entry.legacy) row.title = 'Created by the old LTM system';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'wlm-merge-checkbox';
        checkbox.title = 'Select — check two and hit Merge, or any number and hit Delete Selected';
        checkbox.addEventListener('click', (ev) => ev.stopPropagation());
        checkbox.addEventListener('change', () => setEntryChecked(entry, row, checkbox.checked));

        const label = document.createElement('span');
        label.className = 'wlm-sidebar-row-label';
        label.addEventListener('click', () => selectEntry(entry));

        const titleLine = document.createElement('div');
        titleLine.className = 'wlm-sidebar-row-title';
        titleLine.textContent = `${idx + 1}. ${entry.pinned ? '📌 ' : ''}${entry.vectorized ? '🔍 ' : ''}${displayName(entry.title)}`;
        label.appendChild(titleLine);

        if (entry.date) {
            const dateLine = document.createElement('div');
            dateLine.className = 'wlm-sidebar-row-date';
            dateLine.textContent = entry.date;
            label.appendChild(dateLine);
        }

        row.appendChild(checkbox);
        row.appendChild(label);
        listEl.appendChild(row);
    });

    if (!listEl.children.length) {
        const empty = document.createElement('div');
        empty.className = 'wlm-sidebar-empty';
        empty.textContent = 'No memories yet. Hit + New LTM to create the first one.';
        listEl.appendChild(empty);
    }
}

function statusIcon(status) {
    return { queued: '⏳', generating: '⚡', ready: '📝', failed: '⚠️' }[status] ?? '•';
}

function statusLabel(status) {
    return { queued: 'queued', generating: 'generating…', ready: 'ready to review', failed: 'failed' }[status] ?? status;
}

// =====================================================================
// UI — SELECTION + EDITOR
// =====================================================================

const selectedRef = { current: /** @type {null | {kind:'job',job:LTMJob} | {kind:'entry',entry:any}} */ (null) };
const checkedEntries = new Map(); // uid -> entry, shared by Merge (needs 2) and bulk-Delete (needs 1+)

function editorEl() {
    return /** @type {HTMLTextAreaElement} */ (document.getElementById('wlm-editor-body'));
}

function titleInputEl() {
    return /** @type {HTMLInputElement} */ (document.getElementById('wlm-title-input'));
}

/**
 * Blanks the editor pane back to "nothing selected". Pulled out into one
 * place because 4 call sites (chat switch, delete, save, bulk-delete) all
 * needed the exact same teardown — duplicating it risked them drifting out
 * of sync (e.g. someone adds a new field to the header and forgets to clear
 * it in 3 of the 4 spots).
 */
function clearEditorDisplay() {
    if (!document.getElementById(MODAL_ID)) return; // panel never injected yet
    const editor = editorEl();
    if (editor) editor.value = '';
    const titleEl = document.getElementById('wlm-editor-title');
    if (titleEl) titleEl.textContent = 'No entry selected';
    const titleInput = titleInputEl();
    if (titleInput) { titleInput.value = ''; titleInput.style.display = 'none'; }
    renderVersionPicker(null);
    updateTokenCount('');
    const btn = id => /** @type {HTMLButtonElement} */ (document.getElementById(id));
    if (btn('wlm-reroll-btn')) btn('wlm-reroll-btn').disabled = true;
    if (btn('wlm-pin-btn')) { btn('wlm-pin-btn').disabled = true; btn('wlm-pin-btn').textContent = '📌 Pin'; }
    if (btn('wlm-delete-btn')) btn('wlm-delete-btn').disabled = true;
    if (btn('wlm-save-btn')) btn('wlm-save-btn').disabled = true;
    if (btn('wlm-merge-btn')) btn('wlm-merge-btn').disabled = true;
    if (btn('wlm-stop-btn')) btn('wlm-stop-btn').style.display = 'none';
    const statusEl = document.getElementById('wlm-editor-status');
    if (statusEl) statusEl.textContent = '';
    // Nothing selected → collapse back to the normal split so the list is
    // visible again for picking something else (mobile only; a no-op class
    // toggle above the breakpoint).
    document.getElementById('wlm-modal')?.classList.remove('wlm-mobile-expanded');
    const expandBtn = document.getElementById('wlm-mobile-expand-btn');
    if (expandBtn) { expandBtn.textContent = '⤢'; expandBtn.title = 'Expand the editor to use most of the screen'; }
}

/**
 * Clears the editor pane AND selection state. Must run on every chat
 * switch — otherwise the previous character's draft/entry stays visible
 * in the editor even after the sidebar refreshes to the new chat's list.
 */
function resetEditorSelection() {
    selectedRef.current = null;
    checkedEntries.clear();
    clearEditorDisplay();
}

/**
 * Reveals the dedicated title field and pre-fills it with whatever title
 * is already known — parsed from a "# Title" line for a draft, or the
 * entry's stored title for a saved memory. Left blank (not "(untitled
 * LTM)") when nothing's known yet, so the placeholder text shows instead.
 */
function showTitleInputWith(value) {
    const input = titleInputEl();
    if (!input) return;
    input.style.display = '';
    input.value = (value && value !== '(untitled LTM)') ? value : '';
}

function selectJob(job) {
    selectedRef.current = { kind: 'job', job };
    const title = job.status === 'ready' ? 'Draft — ready to review'
        : job.status === 'failed' ? `Draft — failed (${job.error ?? 'unknown error'})`
        : 'Draft — generating…';
    document.getElementById('wlm-editor-title').textContent = title;
    editorEl().value = job.draft;
    editorEl().readOnly = job.status === 'generating';
    showTitleInputWith(extractTitleFromDraft(job.draft));
    setEditorButtons({ kind: 'job', job });
    renderVersionPicker(job);
    updateTokenCount(job.draft);
    renderSpanLine();
    autoExpandEditorOnMobile();
}

function selectEntry(entry) {
    selectedRef.current = { kind: 'entry', entry };
    document.getElementById('wlm-editor-title').textContent = displayName(entry.title) + (entry.legacy ? '  (legacy)' : '');
    // Resolved for display/editing — if this entry was saved during the
    // brief window with the {{char}}/{{user}} bug, editing and re-saving
    // now permanently fixes it (Save writes back whatever's in the textarea).
    const resolvedContent = displayName(entry.content);
    editorEl().value = resolvedContent;
    editorEl().readOnly = false;
    showTitleInputWith(displayName(entry.title));
    setEditorButtons({ kind: 'entry', entry });
    renderVersionPicker(null);
    updateTokenCount(resolvedContent);
    // Shows this memory's own coverage range instead of the next-LTM span, so you
    // can see what an old memory contains before deciding to reroll it.
    renderSpanLine();
    autoExpandEditorOnMobile();
}

function setEditorButtons(sel) {
    const btn = id => /** @type {HTMLButtonElement} */ (document.getElementById(id));
    const generating = sel.kind === 'job' && sel.job.status === 'generating';
    btn('wlm-stop-btn').style.display = generating ? '' : 'none';
    btn('wlm-reroll-btn').disabled = generating;
    btn('wlm-pin-btn').disabled = sel.kind !== 'entry';
    btn('wlm-pin-btn').textContent = sel.kind === 'entry' && sel.entry.pinned ? '📌 Unpin' : '📌 Pin';
    btn('wlm-delete-btn').disabled = generating;
    btn('wlm-save-btn').disabled = generating;
    document.getElementById('wlm-editor-status').textContent =
        sel.kind === 'job' && sel.job.status === 'failed' ? `⚠ ${sel.job.error ?? 'failed'}` : '';
}

function setEditorGenerating(job, generating) {
    if (selectedRef.current?.kind !== 'job' || selectedRef.current.job.id !== job.id) return;
    const editor = editorEl();
    if (!editor) return;
    editor.readOnly = generating;
    editor.classList.toggle('wlm-generating', generating);
    setEditorButtons({ kind: 'job', job });
}

function streamIntoEditor(jobId, text) {
    if (selectedRef.current?.kind !== 'job' || selectedRef.current.job.id !== jobId) return;
    const editor = editorEl();
    if (!editor) return;
    // Deliberately does NOT follow the caret to the bottom. Being able to cancel a
    // draft mid-stream is only useful if you can read what has arrived so far, and
    // auto-scrolling yanked the view away on every token (Zoey's report). The
    // scroll position is preserved across the value swap so the user stays put.
    const { scrollTop } = editor;
    editor.value = text;
    editor.scrollTop = scrollTop;
    updateTokenCount(text);
}

function onEditorChanged() {
    const text = editorEl().value;
    if (selectedRef.current?.kind === 'job') selectedRef.current.job.draft = text;
    updateTokenCount(text);
}

async function updateTokenCount(text) {
    const el = document.getElementById('wlm-token-count');
    if (!el) return;
    if (!text) { el.textContent = ''; return; }
    try {
        const count = await SillyTavern.getContext().getTokenCountAsync(text);
        el.textContent = `${count} tokens`;
    } catch {
        el.textContent = `~${Math.ceil(text.length / 4)} tokens`;
    }
}

function onVersionPicked(ev) {
    if (selectedRef.current?.kind !== 'job') return;
    const job = selectedRef.current.job;
    const val = /** @type {HTMLSelectElement} */ (ev.target).value;
    if (val === 'current') return;
    const idx = Number(val);
    if (Number.isInteger(idx) && job.versions[idx] !== undefined) {
        // Swap: current draft becomes a version, picked version becomes current.
        const picked = job.versions[idx];
        const current = editorEl().value;
        job.versions[idx] = current;
        job.draft = picked;
        editorEl().value = picked;
        updateTokenCount(picked);
        /** @type {HTMLSelectElement} */ (ev.target).value = 'current';
        toast('info', `Swapped in version ${idx + 1}`);
    }
}

// =====================================================================
// UI — BUTTON HANDLERS
// =====================================================================

async function onNewLTMClicked() {
    const chatId = getCurrentChatId();
    const chat = SillyTavern.getContext().chat || [];
    if (chat.length < 2) { toast('warning', 'Not enough messages to summarize yet'); return; }
    const range = computeRangeFromCurrentChat();
    // An oversized span only gets here when the user explicitly ticked the override
    // (computeRangeFromCurrentChat clamps otherwise) or hand-set a span that large.
    // Warn rather than block — they asked for it, but the failure mode is opaque
    // enough (the provider just errors) to be worth naming up front.
    const size = rangeSize(range);
    if (size > MAX_SUMMARIZE_MESSAGES) {
        toast('warning', `Summarizing ${size} messages — past the ${MAX_SUMMARIZE_MESSAGES}-message limit, this may fail against the context window.`);
    }
    const job = createJob(chatId, range, { isFreshSummary: true, sourceRangeForSave: range });
    await refreshSidebar();
    selectJob(job);
    generateDraft(job); // async on purpose — user can close the panel and keep chatting
}

function onStopClicked() {
    if (selectedRef.current?.kind !== 'job') return;
    selectedRef.current.job.abort?.abort();
}

async function onRerollClicked() {
    if (selectedRef.current?.kind === 'job') {
        const job = selectedRef.current.job;
        if (job.status === 'generating') return;
        pushVersion(job);
        generateDraft(job);
        return;
    }
    if (selectedRef.current?.kind === 'entry') {
        const entry = selectedRef.current.entry;
        let job;
        if (entry.sourceRange) {
            // The original chat range is known — regenerate from the actual
            // conversation (fixes wrong/hallucinated facts, not just prose).
            // This is what the old system's "Reroll LTM" always did.
            job = createJob(getCurrentChatId(), entry.sourceRange, {
                isFreshSummary: false,
                sourceRangeForSave: entry.sourceRange,
                rewriteTargetUid: entry.uid,
            });
            toast('info', 'Regenerating from the original messages…');
        } else {
            // No known source (legacy or merged entry) — fall back to a
            // rewrite pass on the entry's own saved text.
            job = createJob(getCurrentChatId(), null, {
                messagesOverride: buildRewritePrompt(entry),
                isFreshSummary: false,
                sourceRangeForSave: null,
                rewriteTargetUid: entry.uid,
            });
            toast('info', 'No original source recorded for this entry — rewriting existing text instead');
        }
        await refreshSidebar();
        selectJob(job);
        generateDraft(job);
    }
}

async function onPinToggleClicked() {
    if (selectedRef.current?.kind !== 'entry') return;
    const entry = selectedRef.current.entry;
    try {
        entry.pinned = !entry.pinned;
        await saveLTMEntry({ uid: entry.uid, title: entry.title, content: editorEl().value, pinned: entry.pinned });
        await demoteExcessLTMs();
        toast('success', entry.pinned ? 'Pinned — this memory will always stay loaded' : 'Unpinned');
        await refreshSidebar();
        selectEntry(entry);
    } catch (err) {
        ltmWarn('pin toggle failed', err);
        toast('error', `Could not update entry: ${err?.message ?? err}`);
    }
}

async function onDeleteClicked() {
    if (!selectedRef.current) return;
    if (selectedRef.current.kind === 'job') {
        const job = selectedRef.current.job;
        job.abort?.abort();
        jobs.delete(job.id);
        discardDraftState(job.chatId);
    } else {
        if (!window.confirm('Delete this memory permanently?')) return;
        try {
            await deleteLTMEntry(selectedRef.current.entry.uid);
        } catch (err) {
            ltmWarn('delete failed', err);
            toast('error', `Could not delete: ${err?.message ?? err}`);
            return;
        }
    }
    selectedRef.current = null;
    clearEditorDisplay();
    await refreshSidebar();
    updateChip();
}

async function onSaveClicked() {
    const text = editorEl().value.trim();
    if (!text) { toast('warning', 'Nothing to save'); return; }

    const check = validateLTMShape(text);
    if (!check.ok && !window.confirm(`This doesn't look like a normal LTM (${check.reason}). Save anyway?`)) {
        return;
    }

    try {
        if (selectedRef.current?.kind === 'job') {
            const job = selectedRef.current.job;
            await saveLTMEntry({
                title: resolveTitleForSave(text, null),
                content: text,
                sourceRange: job.sourceRangeForSave ?? null,
            });

            // Merge jobs consume their source entries on successful save.
            if (Array.isArray(job.mergeSourceUids)) {
                for (const uid of job.mergeSourceUids) await deleteLTMEntry(uid);
            }
            // Entry rewrites/regenerations replace their target.
            if (job.rewriteTargetUid !== undefined) await deleteLTMEntry(job.rewriteTargetUid);

            // Only from-scratch summaries of new messages advance chat
            // coverage — merges and rewrites/regenerations of old entries
            // don't cover new ground and must NOT move the cursor backward.
            if (job.isFreshSummary) recordLTMCoverage(job.chatId, job.range.lastMessageId);
            jobs.delete(job.id);
            discardDraftState(job.chatId);
        } else if (selectedRef.current?.kind === 'entry') {
            const entry = selectedRef.current.entry;
            await saveLTMEntry({
                uid: entry.uid,
                title: resolveTitleForSave(text, entry.title),
                content: text,
                pinned: entry.pinned,
                sourceRange: entry.sourceRange ?? null,
            });
        } else {
            return;
        }

        await demoteExcessLTMs();
        toast('success', 'Memory saved 🧠');
        selectedRef.current = null;
        clearEditorDisplay();
        await refreshSidebar();
        updateChip();
    } catch (err) {
        ltmWarn('save failed', err);
        toast('error', `Save failed: ${err?.message ?? err}`);
    }
}

// Checkboxes are shared between Merge (needs exactly 2) and bulk-Delete
// (needs 1+) — no cap on how many can be checked, each button just enables
// or stays disabled based on the count it actually needs.
function setEntryChecked(entry, rowEl, checked) {
    if (checked) {
        checkedEntries.set(entry.uid, entry);
        rowEl.classList.add('wlm-selected');
    } else {
        checkedEntries.delete(entry.uid);
        rowEl.classList.remove('wlm-selected');
    }
    /** @type {HTMLButtonElement} */ (document.getElementById('wlm-merge-btn')).disabled = checkedEntries.size !== 2;
    /** @type {HTMLButtonElement} */ (document.getElementById('wlm-bulk-delete-btn')).disabled = checkedEntries.size === 0;
}

async function onMergeClicked() {
    if (checkedEntries.size !== 2) return;
    const [a, b] = [...checkedEntries.values()];
    try {
        const job = createJob(getCurrentChatId(), null, {
            messagesOverride: buildMergePrompt(a, b),
            isFreshSummary: false,
            sourceRangeForSave: unionSourceRange(a.sourceRange, b.sourceRange),
            mergeSourceUids: [a.uid, b.uid],
        });
        checkedEntries.clear();
        await refreshSidebar();
        selectJob(job);
        generateDraft(job);
    } catch (err) {
        // A throw here (e.g. from a prompt builder) used to fail completely
        // silently — the click registered but nothing visible happened,
        // since nothing downstream of the throw ever ran. Surface it.
        ltmWarn('merge failed', err);
        toast('error', `Could not start merge: ${err?.message ?? err}`);
    }
}

async function onBulkDeleteClicked() {
    if (checkedEntries.size === 0) return;
    const entries = [...checkedEntries.values()];
    const count = entries.length;
    if (!window.confirm(`Delete ${count} ${count === 1 ? 'memory' : 'memories'} permanently? This can't be undone.`)) {
        return;
    }
    let failures = 0;
    for (const entry of entries) {
        try {
            await deleteLTMEntry(entry.uid);
        } catch (err) {
            failures++;
            ltmWarn(`bulk delete failed for "${entry.title}"`, err);
        }
    }
    checkedEntries.clear();
    if (failures === 0) {
        toast('success', `Deleted ${count} ${count === 1 ? 'memory' : 'memories'}`);
    } else {
        toast('error', `Deleted ${count - failures}/${count} — ${failures} failed, check console`);
    }
    // The active editor selection may have just been deleted out from under it.
    selectedRef.current = null;
    clearEditorDisplay();
    await refreshSidebar();
    updateChip();
}

// =====================================================================
// SLASH COMMANDS
// =====================================================================

function registerSlashCommands() {
    try {
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'ltm',
            callback: async () => { await openPanel(); return ''; },
            helpString: 'Opens the Weyland Long-Term Memory panel.',
        }));
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'ltm-new',
            callback: async () => {
                injectModal();
                await onNewLTMClicked();
                return '';
            },
            helpString: 'Queues a new LTM draft from recent messages (generation runs in the background).',
        }));
        ltmLog('slash commands registered: /ltm, /ltm-new');
    } catch (err) {
        ltmWarn('slash command registration failed', err);
    }
}

// =====================================================================
// WAND MENU ENTRY (Extensions dropdown)
// =====================================================================

function addWandMenuItem() {
    const container = document.getElementById('extensionsMenu');
    if (!container || document.getElementById('wlm-wand-item')) return;
    const item = document.createElement('div');
    item.id = 'wlm-wand-item';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = '<span>🧠</span><span>Long-Term Memory</span>';
    item.addEventListener('click', () => openPanel());
    container.appendChild(item);
}

// =====================================================================
// BOOTSTRAP
// =====================================================================

(function init() {
    try {
        loadSettings();
        sweepStaleDrafts();
        ensureChip();
        registerSlashCommands();
        addWandMenuItem();

        eventSource?.on?.(event_types?.CHAT_CHANGED, () => {
            // Before anything reads coverage: repair/mirror between settings and the chat file.
            try { syncCoverageOnOpen(getCurrentChatId()); } catch (err) { console.warn(`[${WLM_MODULE_NAME}] coverage sync failed`, err); }
            resetEditorSelection();
            // trigger:false — opening/switching chats must only ever REFLECT
            // existing state, never kick off a new auto-draft. Otherwise a
            // long-overdue chat (or one where Auto-LTM was just turned on)
            // starts generating the instant it's opened, with no message
            // sent — see runAutoJob for the matching half of this fix.
            updateChip({ trigger: false });
            if (document.getElementById(MODAL_ID)?.style.display === 'block') {
                refreshSidebar();
                // Switching between an open-world card and a normal one while the settings pane is
                // already open must re-evaluate whether 1st person is selectable.
                applyOpenWorldPovLock();
            }
        });
        // The ONLY event allowed to start a new auto-job — see updateChip's
        // trigger param doc for why every other call site defaults to false.
        eventSource?.on?.(event_types?.MESSAGE_RECEIVED, () => updateChip({ trigger: true }));
        eventSource?.on?.(event_types?.APP_READY, () => addWandMenuItem());

        console.info(`[${WLM_MODULE_NAME}] initialized v${EXT_VERSION}`);
    } catch (err) {
        console.error(`[${WLM_MODULE_NAME}] init failed`, err);
    }
})();
