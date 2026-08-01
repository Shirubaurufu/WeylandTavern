// =====================================================================
// Weyland-StorylineEngine — guided story director (v1.0.0)
// =====================================================================
// A sibling of Weyland-LTM, built on the same bones: a draggable popout
// window, async draft generation through ChatCompletionService (never the
// chat Generate() pipeline), streaming into an editor, reroll, version
// history, a notification chip, a wand-menu entry, and slash commands.
//
// WHERE IT DIFFERS FROM LTM:
//   LTM looks BACKWARD — it summarizes what already happened into memory.
//   The Storyline Engine looks FORWARD — you type a premise ("the zombie
//   apocalypse begins") and it generates a structured storyline: ordered
//   beats, measurable objectives, a cast to introduce, and — the whole
//   point — PACING baked into each beat as machine-readable fields.
//
// THE PACING PROBLEM (why this exists):
//   Bots blow through a plot in three messages because pacing is normally
//   just implicit prose the model forgets to honor, AND because the model
//   can see the entire arc (including the ending) and races toward it.
//
//   Fix, in two parts:
//   1. Each beat carries a min/max message budget as a real parsed field,
//      not a vibe. See TEMPO_PROFILES + parsePacing.
//   2. At roleplay time we inject ONLY the current beat as an at-depth
//      system "director" note (buildDirectorText / writeDirector). The
//      model never sees future beats or the ending, so it can't rush to
//      them. A per-beat message counter (computeMessagesIntoBeat) drives a
//      two-phase directive — BUILD ("let it breathe, don't resolve yet")
//      then READY ("bring it to its outcome now") — and auto-advances the
//      beat once the max budget is spent.
//
// Storylines can be banked to a reusable library and re-run on any
// character; the main character is referred to as {{char}} and the human
// as {{user}} so a banked story ports cleanly between cards.
//
// See README.md for the full architecture writeup and USER_GUIDE.md for
// the plain-language version to hand to end users.
// =====================================================================

import {
    loadWorldInfo,
    saveWorldInfo,
    createWorldInfoEntry,
    createNewWorldInfo,
    world_info_position,
    METADATA_KEY,
    world_names,
} from '../../../world-info.js';
import { oai_settings } from '../../../openai.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';

const ctx = SillyTavern.getContext();
const {
    extensionSettings,
    saveSettingsDebounced,
    eventSource,
    event_types,
} = ctx;

export const WSE_MODULE_NAME = 'Weyland-StorylineEngine';
const EXT_VERSION = '1.0.0';

// Same house rule as Weyland-LTM: keep Sonnet reserved for actual roleplay
// messaging, not spent on structural generation. A thinking model does the
// storyline scaffolding better anyway. These feed the quick-fill buttons in
// the settings panel; the default only applies to fresh installs.
const RECOMMENDED_STORY_MODEL = 'glm-4.7-thinking';
const ALTERNATE_STORY_MODELS = ['minimax-m3', 'gemini-3.1-pro-preview'];

// The provider renamed this model in place (same model, new id string). Anyone who used the old
// quick-fill button has the dead id saved in modelOverride, where every storyline generation would
// silently fail against it — so rewrite it on load rather than waiting for them to notice.
const STALE_MODEL_RENAMES = { 'gemini-3-pro-preview': 'gemini-3.1-pro-preview' };

// =====================================================================
// TEMPO PROFILES
// =====================================================================
// The tempo setting is the headline pacing knob. It (a) tells the generator
// how many of the model's messages each beat should span, and (b) supplies
// the clamp floor/defaults used when a beat's PACING field is missing or
// absurd — this is what stops a hallucinated "every beat = 1 message"
// storyline from wiping itself out in three replies.

const TEMPO_PROFILES = {
    brisk: {
        label: 'Brisk',
        min: 1, max: 3, floor: 1,
        guidance: 'Move at a brisk clip — most beats should span roughly 1-3 of your messages. Keep momentum, but never collapse a whole beat into a single reply.',
    },
    standard: {
        label: 'Standard',
        min: 2, max: 5, floor: 2,
        guidance: 'Pace scenes naturally — most beats should span roughly 2-5 of your messages. Give each beat room to develop before resolving it.',
    },
    slowburn: {
        label: 'Slow burn',
        min: 4, max: 8, floor: 3,
        guidance: 'Take your time — most beats should span roughly 4-8 of your messages. Linger in each moment; let tension and detail accumulate before anything resolves.',
    },
};

function tempoProfile(tempo = settings?.tempo) {
    return TEMPO_PROFILES[tempo] || TEMPO_PROFILES.standard;
}

// =====================================================================
// PRESETS — genre quick-fills for the premise box
// =====================================================================
// One click drops a scaffolded premise into the input so the generator has
// a strong starting point instead of two bare words. `tempo`, when set,
// nudges the tempo selector to what suits the genre (user can still change
// it). These are starting points, not straitjackets — users edit freely.

const PRESETS = [
    { label: '🧟 Survival horror', tempo: 'standard', premise: 'A sudden catastrophe (outbreak / disaster) shatters normal life. Survival, dread, hard choices, and mounting body-horror stakes. Someone we care about should be lost or wounded along the way.' },
    { label: '💘 Slow-burn romance', tempo: 'slowburn', premise: 'Two people circling something unspoken. Small moments, near-misses, and rising tension that finally breaks into a confession. No rushing — let it ache.' },
    { label: '🕵️ Mystery', tempo: 'standard', premise: 'Something is wrong and no one will say what. A trail of clues, a false lead, a hidden culprit, and a reveal that reframes everything that came before.' },
    { label: '💰 Heist', tempo: 'brisk', premise: 'A high-stakes score with a plan, a crew, a complication that blows the plan apart, and a scramble to improvise the getaway. Tight, kinetic pacing.' },
    { label: '🗺️ Epic quest', tempo: 'slowburn', premise: 'A journey toward a distant goal, escalating trials, an ally gained and a cost paid, building to a confrontation that decides everything.' },
    { label: '☕ Slice of life', tempo: 'standard', premise: 'An ordinary stretch of days given shape — a small goal, a gentle complication, a quiet turning point, and a warm resolution. Low stakes, real feeling.' },
];

// =====================================================================
// SEED LIBRARY — worked examples shipped on first run
// =====================================================================
// Two fully-authored storylines in canonical format so a new user can hit
// "Run" immediately and see exactly what the output should look like. They
// use {{char}}/{{user}} so they port to any card. Seeded once, guarded by
// settings.__seeded so a user who deletes them doesn't get them back.

const SEED_STORYLINES = [
`[STORYLINE]

TITLE: The Outbreak
SETTING: A sprawling university campus on an ordinary weekday afternoon. Modern day. The tone curdles from mundane to survival horror over the course of an hour.
TONE: Survival horror, body-horror, rising dread

CAST:
- Lucy — {{char}}'s friend, trapped and panicking across campus (introduced: Beat 2)

--- BEAT 1 ---
SUMMARY: An ordinary afternoon. Something is subtly, then unmistakably, wrong — distant screams, a lockdown alert, a bitten stranger.
OBJECTIVE: {{char}} and {{user}} realize this is a real, spreading emergency and that they are not safe where they are.
ADVANCE WHEN: Both understand the danger is real and immediate.
PACING: 2-4 messages
INTRODUCES: none
OUTCOME: none

--- BEAT 2 ---
SUMMARY: {{char}}'s phone buzzes — a desperate text from Lucy, barricaded in the Brodlak dining hall and begging for help.
OBJECTIVE: {{char}} decides to go help Lucy and asks {{user}} to come along.
ADVANCE WHEN: {{char}} and {{user}} commit to heading for Brodlak.
PACING: 2-3 messages
INTRODUCES: Lucy
OUTCOME: none

--- BEAT 3 ---
SUMMARY: The route to Brodlak. The campus is a nightmare — the infected, the wounded, the things people are doing to survive.
OBJECTIVE: Cross the campus and reach the dining hall, paying some cost along the way.
ADVANCE WHEN: They reach the dining hall doors.
PACING: 3-5 messages
INTRODUCES: none
OUTCOME: none

--- BEAT 4 ---
SUMMARY: Inside Brodlak. Reunion with Lucy amid carnage; the situation is worse than the text let on.
OBJECTIVE: Regroup with Lucy and grasp that they cannot stay.
ADVANCE WHEN: The group accepts they have to run for it.
PACING: 2-4 messages
INTRODUCES: none
OUTCOME: none

--- BEAT 5 ---
SUMMARY: The escape from Brodlak. Chaos, a chokepoint, a choice about who goes first.
OBJECTIVE: Break out of the building alive — but not unscathed.
ADVANCE WHEN: The survivors clear the building.
PACING: 3-5 messages
INTRODUCES: none
OUTCOME: {{char}} is bitten during the escape. This MUST happen as the beat concludes — no clean getaway.

--- BEAT 6 ---
SUMMARY: The aftermath, somewhere temporarily safe. The bite is known. Grief, denial, and what comes next.
OBJECTIVE: Sit in the weight of what happened and what it means.
ADVANCE WHEN: The emotional reckoning has landed.
PACING: 3-6 messages
INTRODUCES: none
OUTCOME: none

ENDING: The story lands on the human cost of survival — {{char}} bitten, the group changed, an uncertain road ahead rather than a tidy rescue.

[END STORYLINE]`,

`[STORYLINE]

TITLE: The Unspoken Thing
SETTING: The ordinary shared world {{char}} and {{user}} already inhabit — no genre shift, just the slow surfacing of a feeling both have been avoiding.
TONE: Slow-burn romance, tender, aching

CAST:
- (none yet)

--- BEAT 1 ---
SUMMARY: A perfectly normal interaction with one beat too many of held eye contact. Nothing is said.
OBJECTIVE: Establish the unspoken tension without either character naming it.
ADVANCE WHEN: The moment has been felt by both, and pointedly not addressed.
PACING: 3-5 messages
INTRODUCES: none
OUTCOME: none

--- BEAT 2 ---
SUMMARY: A near-miss. One of them almost says it, then retreats behind a joke or an excuse.
OBJECTIVE: Raise the stakes — the feeling is now inconvenient and impossible to ignore.
ADVANCE WHEN: The retreat has visibly cost them something.
PACING: 4-6 messages
INTRODUCES: none
OUTCOME: none

--- BEAT 3 ---
SUMMARY: Forced proximity or a small crisis strips away the usual buffers.
OBJECTIVE: Corner them, gently, into honesty being the only way through.
ADVANCE WHEN: Pretending is no longer an option.
PACING: 4-7 messages
INTRODUCES: none
OUTCOME: none

--- BEAT 4 ---
SUMMARY: The confession. Halting, imperfect, real.
OBJECTIVE: The feeling is finally spoken aloud.
ADVANCE WHEN: It has been said, and answered.
PACING: 4-8 messages
INTRODUCES: none
OUTCOME: {{char}} confesses the feeling to {{user}} — clumsily, honestly. Do not let this arrive early; it lands only after the tension has fully built.

ENDING: Whatever answer {{user}} gives, the unspoken thing is finally spoken — the story resolves the tension it spent every prior beat building.

[END STORYLINE]`,
];

// =====================================================================
// SETTINGS
// =====================================================================

/**
 * @typedef {Object} WeylandStorySettings
 * @property {boolean} enabled              // master switch for the chip
 * @property {boolean} debug
 * @property {string}  modelOverride        // '' => use main chat model
 * @property {'brisk'|'standard'|'slowburn'} tempo
 * @property {number}  maxResponseTokens
 * @property {boolean} streamDrafts
 * @property {boolean} autoAdvance          // advance beats automatically on message budget
 * @property {boolean} showBeatChip         // persistent "Beat X/N" chip while a story runs
 * @property {number}  injectDepth          // at-depth injection depth for the director note
 * @property {number}  maxVersionsPerEntry
 * @property {boolean} __seeded             // library example seeding guard
 * @property {Object}  __drafts             // per-chat unsaved editor text
 * @property {Object}  __active             // per-chat active storyline runtime state
 * @property {Array}   __library            // banked reusable storylines
 */

/** @type {WeylandStorySettings} */
const defaultSettings = {
    enabled: true,
    debug: false,
    modelOverride: RECOMMENDED_STORY_MODEL,
    tempo: 'standard',
    maxResponseTokens: 3000,
    streamDrafts: true,
    autoAdvance: true,
    showBeatChip: true,
    injectDepth: 1,
    maxVersionsPerEntry: 10,
    __seeded: false,
    __drafts: {},
    __active: {},
    __library: [],
};

/** @type {WeylandStorySettings} */
let settings;

function loadSettings() {
    extensionSettings[WSE_MODULE_NAME] ??= structuredClone(defaultSettings);
    settings = extensionSettings[WSE_MODULE_NAME];
    for (const [k, v] of Object.entries(defaultSettings)) {
        if (settings[k] === undefined) settings[k] = structuredClone(v);
    }
    // Idempotent: only rewrites an exact stale id, so it's a no-op once migrated (and for anyone
    // who never picked the renamed model).
    const renamed = STALE_MODEL_RENAMES[settings.modelOverride];
    if (renamed) settings.modelOverride = renamed;
    if (!settings.__seeded) {
        try {
            for (const raw of SEED_STORYLINES) {
                const s = parseStoryline(raw);
                if (s) settings.__library.push(s);
            }
        } catch (err) {
            wseWarn('seeding library failed', err);
        }
        settings.__seeded = true;
        persistSettings();
    }
}

function persistSettings() {
    saveSettingsDebounced();
}

// =====================================================================
// LOGGING
// =====================================================================

function wseLog(msg, data) {
    if (!settings?.debug) return;
    data !== undefined
        ? console.debug(`[${WSE_MODULE_NAME}] ${msg}`, data)
        : console.debug(`[${WSE_MODULE_NAME}] ${msg}`);
}

function wseWarn(msg, data) {
    data !== undefined
        ? console.warn(`[${WSE_MODULE_NAME}] ${msg}`, data)
        : console.warn(`[${WSE_MODULE_NAME}] ${msg}`);
}

function toast(kind, msg) {
    try { globalThis.toastr?.[kind]?.(msg, 'Storyline Engine'); } catch { /* no toastr, no problem */ }
}

// =====================================================================
// MODEL RESOLUTION  (identical strategy to Weyland-LTM — read-only)
// =====================================================================

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

// =====================================================================
// JOB REGISTRY — async draft generations (in-memory, not persisted)
// =====================================================================

/**
 * @typedef {Object} StoryJob
 * @property {string} id
 * @property {'queued'|'generating'|'ready'|'failed'} status
 * @property {string} chatId
 * @property {string} model
 * @property {string} draft
 * @property {string} premise             // the user's premise text — kept so Reroll can regenerate
 * @property {string} tempo
 * @property {string} [error]
 * @property {number} startedAt
 * @property {number} [finishedAt]
 * @property {string[]} versions
 * @property {AbortController} [abort]
 */

/** @type {Map<string, StoryJob>} */
const jobs = new Map();

function createJob(chatId, extra = {}) {
    const job = /** @type {StoryJob} */ ({
        id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
        status: 'queued',
        chatId,
        model: resolveGenerationModel() || '(current model)',
        draft: '',
        premise: '',
        tempo: settings.tempo || 'standard',
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

function getCurrentCharacterName() {
    const c = SillyTavern.getContext();
    return c.name2 || 'the character';
}

function getUserName() {
    return SillyTavern.getContext().name1 || 'the user';
}

/** Tail of the current chat, for grounding a generated storyline in the scene already in play. */
function recentSceneExcerpt(maxMessages = 12) {
    const chat = SillyTavern.getContext().chat || [];
    const slice = chat.slice(Math.max(0, chat.length - maxMessages));
    return slice
        .filter(m => !m.is_system && typeof m.mes === 'string' && m.mes.trim())
        .map(m => `${m.name || (m.is_user ? getUserName() : getCurrentCharacterName())}: ${m.mes}`)
        .join('\n\n')
        .slice(0, 6000); // hard cap so a giant recent message can't dominate the prompt
}

// =====================================================================
// STORYLINE PARSE / SERIALIZE
// =====================================================================
// Canonical format is a human-readable, regex-parseable block (same
// philosophy as LTM's [MEMORY ENTRY] template): the model emits it, the
// user can edit it freely in the textarea, and parseStoryline turns it back
// into the object that drives the runtime. serializeStoryline is the exact
// inverse, used to render a banked storyline back into the editor.

const STORY_KEYS_BEAT = ['SUMMARY', 'OBJECTIVE', 'ADVANCE WHEN', 'PACING', 'INTRODUCES', 'OUTCOME'];
const STORY_KEYS_HEAD = ['TITLE', 'SETTING', 'TONE'];
const BEAT_DELIM_RE = /^\s*-{2,}\s*BEAT\s+\d+[^\n]*-{2,}\s*$/im;
const BEAT_DELIM_RE_G = /^\s*-{2,}\s*BEAT\s+\d+[^\n]*-{2,}\s*$/gim;

function newStorylineId() {
    return crypto.randomUUID ? crypto.randomUUID() : `story-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Reads "KEY: value" lines out of a block, folding wrapped continuation lines into the value. */
function parseKeyedBlock(block, keys) {
    const keyRe = new RegExp('^\\s*(' + keys.map(k => k.replace(/\s+/g, '\\s+')).join('|') + ')\\s*:\\s*(.*)$', 'i');
    const out = {};
    let cur = null;
    for (const line of String(block).split(/\r?\n/)) {
        const m = line.match(keyRe);
        if (m) {
            cur = m[1].replace(/\s+/g, ' ').toUpperCase();
            out[cur] = (m[2] || '').trim();
        } else if (cur != null) {
            const t = line.trim();
            // Fold wrapped prose into the current value, but NOT: a cast bullet,
            // a beat delimiter, or another section header written in the format's
            // own ALL-CAPS "KEY:" style (e.g. "CAST:", "ENDING:") — otherwise the
            // CAST block would bleed into the TONE value and break the round-trip.
            if (t && !/^-\s/.test(t) && !BEAT_DELIM_RE.test(line) && !/^[A-Z][A-Z ]{1,}:/.test(t)) {
                out[cur] += (out[cur] ? ' ' : '') + t;
            }
        }
    }
    return out;
}

/** "2-4", "2 to 4", "3" → {min,max}. Missing/absurd falls back to the tempo profile and is clamped. */
function parsePacing(str, tempo) {
    const def = tempoProfile(tempo);
    let min, max;
    const range = String(str || '').match(/(\d+)\s*(?:[-–—]|to)\s*(\d+)/i);
    if (range) { min = +range[1]; max = +range[2]; }
    else {
        const single = String(str || '').match(/(\d+)/);
        if (single) { min = max = +single[1]; }
        else { min = def.min; max = def.max; }
    }
    min = Math.max(def.floor, Math.min(min, 40));
    max = Math.max(min, Math.min(max, 40));
    return { min, max };
}

function isNoneish(str) {
    return !str || /^\(?\s*(none|n\/a|na|-|—|nothing|tbd)\s*\)?$/i.test(String(str).trim());
}

function parseIntroduces(str) {
    if (isNoneish(str)) return [];
    return String(str).split(/,|\band\b|&/i).map(s => s.trim()).filter(Boolean);
}

/**
 * Parse canonical storyline text into an object. Returns null if it doesn't
 * even look like a storyline (no header / no beats).
 * @returns {null | {id:string,title:string,setting:string,tone:string,cast:Array,beats:Array,ending:string}}
 */
function parseStoryline(text, tempoForClamp = settings?.tempo) {
    const clean = cutToStoryline(stripThinkBlocks(text));
    if (!/\[STORYLINE\]/i.test(clean)) return null;

    let body = clean.replace(/\[STORYLINE\]/i, '').replace(/\[END STORYLINE\]/i, '').trim();

    // Pull ENDING off the tail first so it isn't swallowed by the last beat.
    let ending = '';
    const endingMatch = body.match(/^\s*ENDING\s*:\s*([\s\S]*)$/im);
    if (endingMatch) {
        ending = endingMatch[1].trim();
        body = body.slice(0, endingMatch.index).trim();
    }

    const chunks = body.split(BEAT_DELIM_RE_G);
    const head = chunks.shift() || '';
    const beatBodies = chunks.map(c => c.trim()).filter(Boolean);
    if (!beatBodies.length) return null;

    // Parse TITLE/SETTING/TONE only from the portion before CAST so the cast
    // list can't be folded into the last head value.
    const headKV = parseKeyedBlock(head.split(/^\s*CAST\s*:/im)[0] || head, STORY_KEYS_HEAD);
    const cast = [];
    const castSection = head.split(/^\s*CAST\s*:/im)[1] || '';
    for (const line of castSection.split(/\r?\n/)) {
        const m = line.match(/^\s*-\s+(.*)$/);
        if (!m) continue;
        const raw = m[1].trim();
        if (isNoneish(raw)) continue;
        const name = raw.split(/[—–\-:(]/)[0].trim();
        if (name) cast.push({ name, raw });
    }

    const beats = beatBodies.map((b, i) => {
        const kv = parseKeyedBlock(b, STORY_KEYS_BEAT);
        const pacing = parsePacing(kv['PACING'], tempoForClamp);
        return {
            summary: kv['SUMMARY'] || `Beat ${i + 1}`,
            objective: kv['OBJECTIVE'] || '',
            advanceWhen: kv['ADVANCE WHEN'] || '',
            min: pacing.min,
            max: pacing.max,
            introduces: parseIntroduces(kv['INTRODUCES']),
            outcome: isNoneish(kv['OUTCOME']) ? '' : (kv['OUTCOME'] || ''),
        };
    });

    return {
        id: newStorylineId(),
        title: headKV['TITLE'] || 'Untitled Storyline',
        setting: headKV['SETTING'] || '',
        tone: headKV['TONE'] || '',
        cast,
        beats,
        ending,
    };
}

/** Object → canonical text. Inverse of parseStoryline. */
function serializeStoryline(s) {
    if (!s) return '';
    const lines = [];
    lines.push('[STORYLINE]', '');
    lines.push(`TITLE: ${s.title || 'Untitled Storyline'}`);
    lines.push(`SETTING: ${s.setting || ''}`);
    lines.push(`TONE: ${s.tone || ''}`, '');
    lines.push('CAST:');
    if (s.cast?.length) for (const c of s.cast) lines.push(`- ${c.raw || c.name}`);
    else lines.push('- (none yet)');
    lines.push('');
    s.beats.forEach((b, i) => {
        lines.push(`--- BEAT ${i + 1} ---`);
        lines.push(`SUMMARY: ${b.summary || ''}`);
        lines.push(`OBJECTIVE: ${b.objective || ''}`);
        lines.push(`ADVANCE WHEN: ${b.advanceWhen || ''}`);
        lines.push(`PACING: ${b.min}-${b.max} messages`);
        lines.push(`INTRODUCES: ${b.introduces?.length ? b.introduces.join(', ') : 'none'}`);
        lines.push(`OUTCOME: ${b.outcome ? b.outcome : 'none'}`);
        lines.push('');
    });
    lines.push(`ENDING: ${s.ending || ''}`, '');
    lines.push('[END STORYLINE]');
    return lines.join('\n');
}

// =====================================================================
// GENERATION PROMPT
// =====================================================================
// Sandwich structure mirrors LTM: system ruleset, then the premise as
// framed user material, then a short high-recency reminder sent last.

const THINKING_DISCIPLINE = `Keep any <think></think> reasoning SHORT — a few terse bullets, not an essay. The instant you close </think>, continue in the SAME response with the actual output. Stopping after only the thinking block is a failure — you are not done until [END STORYLINE] has been written.`;

function buildStorylinePrompt(premise, tempo = settings.tempo, sceneExcerpt = '') {
    const character = getCurrentCharacterName();
    const user = getUserName();
    const prof = tempoProfile(tempo);

    const sceneBlock = sceneExcerpt
        ? `\nCURRENT SCENE (recent messages, for tone/continuity — the storyline may begin from here or pivot, but should not contradict it):\n---\n${sceneExcerpt}\n---\n`
        : '\n(No active scene was provided — write the storyline as a self-contained arc that could be dropped into any moment.)\n';

    const systemMsg = `[STORYLINE DIRECTOR SYSTEM]

You are a story architect for a roleplay between "${character}" (the main character, referred to below and in your output as {{char}}) and the human player (referred to as {{user}}). This is NOT a roleplay turn — you are stepping outside the story to DESIGN it. Do not write in-character dialogue or narration; produce only the structured storyline described below.

Your job: turn the PREMISE into a guided storyline — an ordered sequence of story beats with measurable objectives, deliberate pacing, and (where the premise demands them) forced outcomes. This storyline will be fed to the roleplay model one beat at a time to keep it on track and correctly paced.

CORE PRINCIPLES:
- USE MACROS FOR THE LEADS. Always call the main character {{char}} and the human {{user}}, never their literal names — this lets the storyline be reused with any character card. Give NEW characters you introduce their own ordinary names.
- HONOR EXPLICIT DEMANDS. If the premise names specific events or outcomes the user wants (e.g. "someone should get bitten during the escape"), place each one on the appropriate beat as its OUTCOME. The user's stated wishes are law.
- PACING IS THE POINT. ${prof.guidance} A beat is a SCENE, not a sentence — it should take several exchanges to play out. Set each beat's PACING field as a message range (e.g. "2-4 messages") reflecting how long that beat should breathe. Vary it: tense or pivotal beats may run longer; connective beats shorter. NEVER set every beat to "1 message" — that is the failure this whole system exists to prevent.
- MEASURABLE OBJECTIVES. Each beat's OBJECTIVE must be a concrete, checkable thing that happens ("{{char}} decides to go and asks {{user}} to come"), not a mood ("things feel tense"). ADVANCE WHEN states the condition that means the beat is finished.
- STRUCTURE. Produce between 5 and 9 beats: an opening that establishes the situation, rising complications, a climax/turning point, and a resolution beat. Only give a beat an OUTCOME when something specific must happen there; otherwise write "none".
- STAY GROUNDED. Build on the current scene if one is given. Do not invent contradictions with it.

Before writing, reason briefly inside a single <think></think> block: list the arc's shape, where any user-demanded outcomes land, and roughly how many messages each beat should span. Then write the storyline.

${THINKING_DISCIPLINE}

Output EXACTLY this structure and nothing else:

[STORYLINE]

TITLE: [a short, evocative title]
SETTING: [1-2 sentences: where, when, and the tonal arc]
TONE: [a few descriptive words, e.g. "survival horror, tense, body-horror"]

CAST:
- [Name] — [role] (introduced: Beat [n])
[list any NEW characters the story introduces; write "- (none yet)" if there are none]

--- BEAT 1 ---
SUMMARY: [what happens in this beat]
OBJECTIVE: [the concrete thing that must occur]
ADVANCE WHEN: [the condition that ends this beat]
PACING: [min]-[max] messages
INTRODUCES: [names introduced this beat, or "none"]
OUTCOME: [a forced outcome that MUST happen here, or "none"]

--- BEAT 2 ---
[...same fields...]

[...continue for all beats...]

ENDING: [the intended overall resolution — where the arc is meant to land]

[END STORYLINE]`;

    const premiseMsg = `PREMISE (design a storyline from this — it is the brief, NOT something to roleplay):
---
${premise}
---
${sceneBlock}`;

    const reminderMsg = `Reminder: do not roleplay or write in-character. Produce ONLY the [STORYLINE] block described in the system instructions, with real pacing ranges on every beat and any user-demanded events placed as OUTCOMEs. ${THINKING_DISCIPLINE}`;

    return [
        { role: 'system', content: systemMsg },
        { role: 'user', content: premiseMsg },
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
        .replace(/<think(?:ing)?>[\s\S]*$/i, '')
        .trim();
}

function cutToStoryline(text) {
    const str = String(text || '');
    const start = str.match(/\[STORYLINE\]/i);
    if (!start) return str;
    let out = str.slice(start.index);
    const end = out.match(/\[END STORYLINE\]/i);
    if (end) out = out.slice(0, end.index + end[0].length);
    return out.trim();
}

function validateStorylineShape(draft) {
    const trimmed = cutToStoryline(stripThinkBlocks(draft));
    if (!trimmed) return { ok: false, reason: 'empty output' };
    if (!/\[STORYLINE\]/i.test(trimmed)) return { ok: false, reason: 'missing [STORYLINE] header' };
    const beatCount = (trimmed.match(BEAT_DELIM_RE_G) || []).length;
    if (beatCount < 2) return { ok: false, reason: 'need at least 2 beats' };
    if (/^(i (can'?t|cannot|won'?t|am unable)|i'?m sorry)/i.test(trimmed)) {
        return { ok: false, reason: 'model refused' };
    }
    return { ok: true };
}

function extractTitleFromDraft(text) {
    const m = String(text || '').match(/^\s*TITLE\s*:\s*(.+)$/im);
    return m ? m[1].trim() : '(untitled storyline)';
}

function resolveTitleForSave(text, fallbackTitle) {
    const manual = titleInputEl()?.value.trim();
    if (manual) return manual;
    const parsed = extractTitleFromDraft(text);
    if (parsed !== '(untitled storyline)') return parsed;
    return fallbackTitle || '(untitled storyline)';
}

// =====================================================================
// GENERATION — raw ChatCompletionService call
// =====================================================================

function buildRequestPayload(messages, stream) {
    const source = getCurrentSource();
    const payload = {
        stream,
        messages,
        model: resolveGenerationModel(),
        chat_completion_source: source,
        max_tokens: Number(settings.maxResponseTokens) || 3000,
        reasoning_effort: 'min',
    };
    if (!payload.model) delete payload.model;
    if (source === 'custom' && oai_settings?.custom_url) payload.custom_url = oai_settings.custom_url;
    if (oai_settings?.reverse_proxy) {
        payload.reverse_proxy = oai_settings.reverse_proxy;
        payload.proxy_password = oai_settings.proxy_password || '';
    }
    return payload;
}

async function generateDraft(job) {
    job.status = 'generating';
    job.draft = '';
    job.error = undefined;
    job.abort = new AbortController();
    updateChip();
    refreshSidebar();
    setEditorGenerating(job, true);

    const messages = buildStorylinePrompt(job.premise, job.tempo, recentSceneExcerpt());

    try {
        const service = SillyTavern.getContext().ChatCompletionService;
        if (!service) throw new Error('ChatCompletionService not available in this SillyTavern version');

        const payload = buildRequestPayload(messages, !!settings.streamDrafts);
        wseLog('generation payload', { ...payload, proxy_password: payload.proxy_password ? '(redacted)' : undefined });

        const result = await service.processRequest(payload, {}, true, job.abort.signal);

        if (typeof result === 'function') {
            for await (const chunk of result()) {
                const stripped = stripThinkBlocks(chunk.text ?? '');
                const headerSeen = /\[STORYLINE\]/i.test(stripped);
                job.draft = cutToStoryline(stripped);
                streamIntoEditor(job.id, headerSeen ? job.draft : '…architecting storyline…');
            }
        } else {
            job.draft = cutToStoryline(stripThinkBlocks(result?.content ?? ''));
        }

        const check = validateStorylineShape(job.draft);
        if (!check.ok) {
            job.status = 'failed';
            job.error = check.reason;
            toast('warning', `Storyline draft failed validation: ${check.reason}`);
        } else {
            job.status = 'ready';
            toast('success', 'Storyline draft ready for review');
        }
    } catch (err) {
        if (job.abort?.signal?.aborted) {
            job.status = 'failed';
            job.error = 'stopped by user';
        } else {
            job.status = 'failed';
            job.error = String(err?.error?.message ?? err?.message ?? err);
            wseWarn('generation failed', err);
            toast('error', `Storyline generation failed: ${job.error}`);
        }
    } finally {
        job.finishedAt = Date.now();
        job.abort = undefined;
        setEditorGenerating(job, false);
        updateChip();
        refreshSidebar();
        if (selectedRef.current?.kind === 'job' && selectedRef.current.job.id === job.id) {
            selectJob(job);
        }
    }
}

// =====================================================================
// LOREBOOK — chat book resolution (same convention as ST / Weyland-LTM)
// =====================================================================

const STORY_MARKER = 'story:director:'; // automationId = "story:director:<storylineId>"

async function getOrCreateChatBookName() {
    const c = SillyTavern.getContext();
    const meta = c.chatMetadata;
    if (meta[METADATA_KEY] && Array.isArray(world_names) && world_names.includes(meta[METADATA_KEY])) {
        return meta[METADATA_KEY];
    }
    if (!c.chatId) throw new Error('Open a chat first');
    const name = `Chat Book ${c.chatId}`.replace(/[^a-z0-9]/gi, '_').replace(/_{2,}/g, '_').substring(0, 64);
    await createNewWorldInfo(name);
    meta[METADATA_KEY] = name;
    await c.saveMetadata();
    document.querySelectorAll('.chat_lorebook_button').forEach(el => el.classList.add('world_set'));
    return name;
}

function getChatBookNameIfExists() {
    const meta = SillyTavern.getContext().chatMetadata;
    const name = meta?.[METADATA_KEY];
    return (name && Array.isArray(world_names) && world_names.includes(name)) ? name : null;
}

// =====================================================================
// DIRECTOR NOTE — the current beat, projected into the chat
// =====================================================================
// This is the heart of the pacing fix. The active storyline never enters
// the prompt in full; only THIS text does — the current beat, phrased for
// the phase we're in, injected at depth as a system note so it reads like a
// live stage direction the model must obey. Future beats and the ending
// stay invisible, so the model can't rush toward them.

function buildDirectorText(active) {
    const s = active.storyline;
    const n = s.beats.length;

    if (active.completed) {
        return `[◆ STORY DIRECTOR — the guided storyline has reached its end ◆]
Story: "${s.title}"${s.tone ? ` — ${s.tone}` : ''}. All ${n} beats are complete.
${s.ending ? `Intended resolution: ${s.ending}\n` : ''}You are no longer constrained to a specific beat. Bring the story to a satisfying close at your own pace, honoring everything that has happened.`;
    }

    const idx = active.currentBeatIndex;
    const beat = s.beats[idx];
    const into = computeMessagesIntoBeat(active);
    const phase = active.phase || (into >= beat.min ? 'ready' : 'build');

    const header = `[◆ ACTIVE STORY DIRECTOR — binding stage directions for THIS scene ◆]
Story: "${s.title}"${s.tone ? ` — ${s.tone}` : ''}.${s.setting ? `\nSetting: ${s.setting}` : ''}
You are running a GUIDED storyline. Follow the CURRENT BEAT below and only that beat. Advance the plot deliberately — a beat is a scene, not a line. Never skip ahead to events that have not been unlocked, and never resolve the overall story early.`;

    const lines = [header, '', `▶ CURRENT BEAT (${idx + 1} of ${n}): ${beat.summary}`];
    if (beat.objective) lines.push(`Goal of this beat: ${beat.objective}`);

    if (phase === 'build') {
        lines.push(`Pacing: this beat is just opening (you are ~${into} message${into === 1 ? '' : 's'} into a target of ${beat.min}-${beat.max}). Develop it across your next several replies. Do NOT resolve it or move toward the next event yet — stay present and let the moment breathe.`);
        if (beat.outcome) lines.push(`Where this beat is heading (do NOT rush to it): ${beat.outcome}`);
    } else {
        lines.push(`Pacing: this beat has had room to develop (you are ~${into} message${into === 1 ? '' : 's'} in, target ${beat.min}-${beat.max}). When the moment feels earned, bring it to its conclusion and let the story move forward. Don't drag much past ${beat.max}.`);
        if (beat.outcome) lines.push(`⚠ REQUIRED OUTCOME — make this happen as the beat concludes: ${beat.outcome}`);
    }

    if (beat.advanceWhen) lines.push(`This beat is finished when: ${beat.advanceWhen}`);
    if (beat.introduces?.length) lines.push(`New to the scene this beat: ${beat.introduces.join(', ')}. You may bring them in now.`);

    return lines.join('\n');
}

function directorTitle(active) {
    const s = active.storyline;
    return active.completed
        ? `🎬 ${s.title} — complete`
        : `🎬 ${s.title} — Beat ${active.currentBeatIndex + 1}/${s.beats.length}`;
}

/** Create or update the single director entry for the active storyline. */
async function writeDirector(active) {
    const bookName = await getOrCreateChatBookName();
    const book = await loadWorldInfo(bookName);
    if (!book) throw new Error(`Could not load lorebook "${bookName}"`);

    let entry = (active.directorUid != null) ? book.entries[active.directorUid] : null;
    if (!entry) {
        entry = createWorldInfoEntry(bookName, book);
        if (!entry) throw new Error('Could not create a director lorebook entry');
        entry.automationId = `${STORY_MARKER}${active.storyline.id}`;
        entry.preventRecursion = true;
        entry.excludeRecursion = true;
        entry.addMemo = true;
        active.directorUid = entry.uid;
    }

    // Always (re)assert the injection shape — an at-depth system note at a
    // shallow depth is the highest-recency, most-obeyed placement, which is
    // exactly what a "do this now, don't rush" stage direction wants.
    entry.comment = directorTitle(active);
    entry.content = buildDirectorText(active);
    entry.constant = true;
    entry.disable = false;
    entry.vectorized = false;
    entry.position = world_info_position.atDepth; // 4
    entry.depth = Math.max(0, Number(settings.injectDepth) || 1);
    entry.role = 0; // extension_prompt_roles.SYSTEM
    entry.order = 50;

    await saveWorldInfo(bookName, book, true);
    persistSettings(); // directorUid may have just been assigned
}

/** Remove ALL story-director entries from the current chat book (used on deactivate / re-activate). */
async function removeAllDirectorEntries() {
    const bookName = getChatBookNameIfExists();
    if (!bookName) return;
    const book = await loadWorldInfo(bookName);
    if (!book?.entries) return;
    let changed = false;
    for (const [uid, entry] of Object.entries(book.entries)) {
        if (String(entry.automationId ?? '').startsWith(STORY_MARKER)) {
            delete book.entries[uid];
            changed = true;
        }
    }
    if (changed) await saveWorldInfo(bookName, book, true);
}

// =====================================================================
// ACTIVE STORYLINE RUNTIME
// =====================================================================

function getActiveState(chatId = getCurrentChatId()) {
    return settings.__active?.[chatId] || null;
}

/**
 * Messages the character has produced since the current beat began. Derived
 * from a length anchor rather than an event counter so it's reload-safe and
 * immune to swipe double-counting (a swipe replaces an index, it doesn't add
 * one). User/system messages don't count — "spend N messages on this beat"
 * has always meant N *character* messages.
 */
function computeMessagesIntoBeat(active) {
    const chat = SillyTavern.getContext().chat || [];
    const from = Math.max(0, active.beatAnchorLen ?? 0);
    let n = 0;
    for (let i = from; i < chat.length; i++) {
        const m = chat[i];
        if (m && !m.is_user && !m.is_system && typeof m.mes === 'string' && m.mes.trim()) n++;
    }
    return n;
}

async function activateStoryline(storyline) {
    const chatId = getCurrentChatId();
    if (!SillyTavern.getContext().chatId) { toast('warning', 'Open a chat first'); return; }
    await removeAllDirectorEntries();

    const active = {
        storyline: structuredClone(storyline),
        currentBeatIndex: 0,
        phase: 'build',
        beatAnchorLen: (SillyTavern.getContext().chat || []).length,
        active: true,
        completed: false,
        directorUid: null,
    };
    // Give it a fresh runtime id so re-activating a library item doesn't
    // collide with an old director entry's marker.
    active.storyline.id = newStorylineId();
    settings.__active[chatId] = active;
    persistSettings();

    try {
        await writeDirector(active);
        toast('success', `▶ Now running "${active.storyline.title}" — Beat 1/${active.storyline.beats.length}`);
    } catch (err) {
        wseWarn('activate failed', err);
        toast('error', `Could not start storyline: ${err?.message ?? err}`);
    }
    refreshSidebar();
    updateChip();
}

async function deactivateStoryline() {
    const chatId = getCurrentChatId();
    await removeAllDirectorEntries();
    delete settings.__active[chatId];
    persistSettings();
    toast('info', 'Storyline stopped — the director note has been removed');
    refreshSidebar();
    updateChip();
}

/**
 * Move the active storyline by `delta` beats (usually +1). Advancing past
 * the last beat marks the story complete. Advancing resets the per-beat
 * anchor so pacing counts fresh, and rewrites the director note.
 */
async function stepBeat(delta) {
    const active = getActiveState();
    if (!active) return;
    const n = active.storyline.beats.length;
    const target = active.currentBeatIndex + delta;

    if (target >= n) {
        active.completed = true;
        active.phase = 'ready';
    } else {
        active.currentBeatIndex = Math.max(0, target);
        active.completed = false;
        active.phase = 'build';
        active.beatAnchorLen = (SillyTavern.getContext().chat || []).length;
    }
    persistSettings();

    try {
        await writeDirector(active);
    } catch (err) {
        wseWarn('stepBeat writeDirector failed', err);
    }

    if (active.completed) toast('success', `🎬 "${active.storyline.title}" complete`);
    else toast('info', `Beat ${active.currentBeatIndex + 1}/${n}: ${active.storyline.beats[active.currentBeatIndex].summary}`);

    refreshSidebar();
    updateChip();
}

async function restartStoryline() {
    const active = getActiveState();
    if (!active) return;
    active.currentBeatIndex = 0;
    active.completed = false;
    active.phase = 'build';
    active.beatAnchorLen = (SillyTavern.getContext().chat || []).length;
    persistSettings();
    try { await writeDirector(active); } catch (err) { wseWarn('restart failed', err); }
    toast('info', 'Storyline restarted at Beat 1');
    refreshSidebar();
    updateChip();
}

/**
 * Runtime tick — runs on every received character message. Recomputes how
 * far into the current beat we are, flips BUILD→READY when the min budget is
 * met, and auto-advances when the max budget is spent (if autoAdvance is on).
 * The director note is only rewritten on an actual phase or beat change, so
 * this is cheap on the vast majority of turns.
 */
async function runtimeTick() {
    const active = getActiveState();
    if (!active || !active.active || active.completed) return;

    const beat = active.storyline.beats[active.currentBeatIndex];
    if (!beat) return;
    const into = computeMessagesIntoBeat(active);

    if (settings.autoAdvance && into >= beat.max) {
        await stepBeat(+1);
        return;
    }

    const newPhase = into >= beat.min ? 'ready' : 'build';
    if (newPhase !== active.phase) {
        active.phase = newPhase;
        persistSettings();
        try { await writeDirector(active); } catch (err) { wseWarn('phase update failed', err); }
    }
    refreshSidebar();
    updateChip();
}

/**
 * Self-heal on chat load / app ready: if this chat has an active storyline
 * but its director entry has gone missing (e.g. book reloaded, entry pruned
 * by an export round-trip), rewrite it so the guidance is actually present.
 */
async function reconcileDirector() {
    const active = getActiveState();
    if (!active || !active.active) return;
    try {
        const bookName = getChatBookNameIfExists();
        const book = bookName ? await loadWorldInfo(bookName) : null;
        const present = book?.entries && Object.values(book.entries)
            .some(e => String(e.automationId ?? '').startsWith(STORY_MARKER));
        if (!present) { active.directorUid = null; }
        // Recompute phase from current chat length before rewriting.
        const beat = active.storyline.beats[active.currentBeatIndex];
        if (beat && !active.completed) {
            active.phase = computeMessagesIntoBeat(active) >= beat.min ? 'ready' : 'build';
        }
        await writeDirector(active);
    } catch (err) {
        wseWarn('reconcileDirector failed', err);
    }
}

// =====================================================================
// LIBRARY  (banked, reusable storylines — persisted in settings)
// =====================================================================

function getLibrary() {
    return Array.isArray(settings.__library) ? settings.__library : (settings.__library = []);
}

function addToLibrary(storyline) {
    const lib = getLibrary();
    const copy = structuredClone(storyline);
    copy.id = copy.id || newStorylineId();
    // Update in place if an item with this id already exists, else append.
    const idx = lib.findIndex(s => s.id === copy.id);
    if (idx >= 0) lib[idx] = copy; else lib.push(copy);
    persistSettings();
    return copy.id;
}

function removeFromLibrary(id) {
    const lib = getLibrary();
    const idx = lib.findIndex(s => s.id === id);
    if (idx >= 0) { lib.splice(idx, 1); persistSettings(); }
}

// =====================================================================
// DRAFT PERSISTENCE  (per-chat editor text)
// =====================================================================

function saveDraftState(chatId, text) {
    if (!text || !text.trim()) { discardDraftState(chatId); return; }
    settings.__drafts[chatId] = { text, savedAt: Date.now() };
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

// =====================================================================
// VERSION HISTORY
// =====================================================================

function pushVersion(job) {
    const check = validateStorylineShape(job.draft);
    if (!check.ok) return;
    job.versions.push(job.draft);
    while (job.versions.length > (Number(settings.maxVersionsPerEntry) || 10)) job.versions.shift();
    renderVersionPicker(job);
}

function renderVersionPicker(job) {
    const picker = /** @type {HTMLSelectElement} */ (document.getElementById('wse-version-picker'));
    if (!picker) return;
    if (!job || !job.versions?.length) { picker.style.display = 'none'; return; }
    picker.style.display = '';
    picker.innerHTML = '<option value="current">Current draft</option>' + job.versions
        .map((_, i) => `<option value="${i}">Version ${i + 1}</option>`)
        .join('');
    picker.value = 'current';
}

// =====================================================================
// UI — NOTIFICATION CHIP
// =====================================================================

const CHIP_ID = 'wse-chip';

function ensureChip() {
    if (document.getElementById(CHIP_ID)) return;
    const chip = document.createElement('div');
    chip.id = CHIP_ID;
    chip.className = 'wse-chip wse-chip-hidden';
    chip.title = 'Storyline Engine';
    chip.addEventListener('click', () => openPanel());
    document.body.appendChild(chip);
}

function setChip(text, kind) {
    ensureChip();
    const chip = document.getElementById(CHIP_ID);
    chip.textContent = text;
    chip.dataset.kind = kind;
    chip.classList.remove('wse-chip-hidden');
}

function hideChip() {
    document.getElementById(CHIP_ID)?.classList.add('wse-chip-hidden');
}

// Priority: an in-flight generation, then a ready/failed draft, then the
// passive "story running" readout. The running readout is the persistent
// win here — at a glance you always know which beat you're on.
function updateChip() {
    if (!settings.enabled) return hideChip();
    const chatJobs = getJobsForChat(getCurrentChatId());
    if (chatJobs.some(j => j.status === 'generating')) return setChip('🎬 Storyline generating…', 'info');
    const ready = chatJobs.filter(j => j.status === 'ready').length;
    if (ready) return setChip(`🎬 ${ready} storyline draft${ready > 1 ? 's' : ''} ready`, 'ready');
    if (chatJobs.some(j => j.status === 'failed')) return setChip('⚠️ Storyline failed — click to reroll', 'error');

    const active = getActiveState();
    if (settings.showBeatChip && active?.active) {
        if (active.completed) return setChip(`🎬 ${active.storyline.title} — complete`, 'done');
        const n = active.storyline.beats.length;
        return setChip(`🎬 Beat ${active.currentBeatIndex + 1}/${n} — ${active.storyline.title}`, 'running');
    }
    hideChip();
}

// =====================================================================
// UI — MODAL PANEL
// =====================================================================

const MODAL_ID = 'wse-modal-overlay';

function buildModalHtml() {
    const presetBtns = PRESETS.map(p =>
        `<button class="wse-preset" data-premise="${escapeAttr(p.premise)}" data-tempo="${p.tempo || ''}" title="Fill the premise box with a ${p.label.replace(/^[^\s]+\s/, '')} scaffold">${p.label}</button>`
    ).join('');

    return `
<div id="${MODAL_ID}" style="display:none; position:fixed; inset:0; z-index:99990; pointer-events:none;">
  <div id="wse-modal">
    <div id="wse-titlebar">
      <span class="wse-title">🎬 Storyline Engine</span>
      <div class="wse-titlebar-actions">
        <button id="wse-settings-btn" title="Open Storyline Engine settings — model, tempo, auto-advance, injection depth">Settings ⚙</button>
        <button id="wse-close-btn" title="Close">✕</button>
      </div>
    </div>
    <div id="wse-body">
      <div id="wse-sidebar">
        <div class="wse-sidebar-actions">
          <button id="wse-new-btn" class="wse-btn-primary" title="Start a fresh storyline — clears the editor and focuses the premise box">+ New Storyline</button>
        </div>
        <div id="wse-active-box" style="display:none"></div>
        <div class="wse-lib-header">
          <span>Saved Storylines</span>
          <button id="wse-lib-delete-btn" class="wse-btn-sm wse-btn-danger" disabled title="Check one or more saved storylines, then delete them">🗑</button>
        </div>
        <div id="wse-library-list"></div>
      </div>
      <div id="wse-editor">
        <div id="wse-editor-header">
          <button id="wse-mobile-expand-btn" class="wse-btn-sm wse-mobile-only" title="Expand the editor to use most of the screen">⤢</button>
          <span id="wse-editor-title">New storyline</span>
          <div class="wse-editor-meta">
            <span id="wse-token-count"></span>
            <select id="wse-version-picker" style="display:none" title="Browse previous reroll attempts for this draft"></select>
          </div>
        </div>
        <div id="wse-premise-row">
          <input id="wse-premise" type="text" placeholder="Type a premise…  e.g. “the zombie apocalypse begins”" title="What story do you want? A phrase or a paragraph. Name any events you want to happen — they'll become forced outcomes." />
          <button id="wse-generate-btn" class="wse-btn-primary" title="Generate a structured storyline from the premise">✦ Generate</button>
        </div>
        <div id="wse-preset-row">${presetBtns}</div>
        <input id="wse-title-input" type="text" placeholder="Storyline title" style="display:none" title="Rename this storyline. Overrides the TITLE line in the text below." />
        <textarea id="wse-editor-body" spellcheck="false" placeholder="Type a premise above and hit Generate, pick a saved storyline from the left, or write beats here by hand.

Each beat carries a PACING range (e.g. 2-4 messages) — that's what keeps the bot from racing through your plot."></textarea>
        <div id="wse-editor-actions">
          <span id="wse-editor-status"></span>
          <button id="wse-stop-btn" class="wse-btn-sm wse-btn-danger" style="display:none" title="Cancel the current generation">■ Stop</button>
          <button id="wse-reroll-btn" class="wse-btn-sm" disabled title="Generate a new attempt from the same premise">🔁 Reroll</button>
          <button id="wse-savelib-btn" class="wse-btn-sm" disabled title="Save this storyline to your reusable library">★ Save to Library</button>
          <button id="wse-delete-btn" class="wse-btn-sm wse-btn-danger" disabled title="Discard this draft / remove this saved storyline">🗑 Delete</button>
          <button id="wse-activate-btn" class="wse-btn-primary" disabled title="Run this storyline — it starts guiding the chat from Beat 1">▶ Run this story</button>
        </div>
      </div>
      <div id="wse-settings-pane" style="display:none">
        <h3>Settings</h3>
        <label class="wse-field wse-check" title="Turn off to silence the storyline chip entirely.">
          <input id="wse-set-enabled" type="checkbox" />
          <span>Enable Storyline notifications <small>(drafts, failures, and the running-beat readout)</small></span>
        </label>
        <label class="wse-field" title="Model ID used only for storyline generation — never affects your actual chat connection. Blank = your current chat model.">
          <span>Model for storyline generation <small>(blank = current chat model)</small></span>
          <div class="wse-inline">
            <input id="wse-set-model" type="text" placeholder="${escapeAttr(getCurrentModelId() || 'model id')}" />
            <button id="wse-use-current-model" class="wse-btn-sm" title="Copy the active chat model">Use current</button>
          </div>
          <div class="wse-recommend-row">
            <span class="wse-recommend-label">Recommended:</span>
            <button class="wse-btn-sm wse-model-quickfill" data-model="${RECOMMENDED_STORY_MODEL}" title="Fill the field above with ${RECOMMENDED_STORY_MODEL}">${RECOMMENDED_STORY_MODEL}</button>
            ${ALTERNATE_STORY_MODELS.map(m => `<button class="wse-btn-sm wse-model-quickfill" data-model="${m}" title="Fill the field above with ${m}">${m}</button>`).join('')}
          </div>
          <small class="wse-recommend-disclaimer">Lucky does not recommend Sonnet for storyline generation — use glm-4.7-thinking or gemini-3.1-pro-preview so our Sonnet supply stays reserved for actual messaging.</small>
        </label>
        <label class="wse-field" title="The headline pacing knob. Sets how many of the bot's messages each beat should span, and the safety floor used when a beat's own pacing looks wrong.">
          <span>Story tempo</span>
          <select id="wse-set-tempo">
            <option value="brisk">Brisk — beats move fast (~1-3 messages each)</option>
            <option value="standard">Standard — beats breathe (~2-5 messages each)</option>
            <option value="slowburn">Slow burn — beats linger (~4-8 messages each)</option>
          </select>
        </label>
        <label class="wse-field wse-check" title="When on, the engine advances to the next beat automatically once a beat has used up its message budget. When off, you advance beats yourself from the active-story panel.">
          <input id="wse-set-autoadvance" type="checkbox" />
          <span>Auto-advance beats when their message budget is spent</span>
        </label>
        <label class="wse-field wse-check" title="Show a small chip telling you which beat you're on while a story runs.">
          <input id="wse-set-beatchip" type="checkbox" />
          <span>Show the running-beat chip</span>
        </label>
        <label class="wse-field" title="How deep into the recent messages the director note is injected. 1 = right at the front of the model's attention (most obeyed). Raise only if it feels too pushy.">
          <span>Director injection depth <small>(1 = most immediate)</small></span>
          <input id="wse-set-depth" type="number" min="0" max="10" step="1" />
        </label>
        <label class="wse-field" title="Generation budget for a single storyline. Raise if drafts get cut off before [END STORYLINE].">
          <span>Max response tokens</span>
          <input id="wse-set-maxtokens" type="number" min="800" step="100" />
        </label>
        <label class="wse-field wse-check" title="Show the storyline appearing as it generates instead of waiting for the whole thing.">
          <input id="wse-set-stream" type="checkbox" />
          <span>Stream drafts into the editor</span>
        </label>
        <label class="wse-field wse-check" title="For troubleshooting — only enable if asked to.">
          <input id="wse-set-debug" type="checkbox" />
          <span>Debug</span>
        </label>
        <div class="wse-settings-actions">
          <button id="wse-settings-back" class="wse-btn-primary">← Back to editor</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

function escapeAttr(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let modalInjected = false;

function injectModal() {
    if (modalInjected && document.getElementById(MODAL_ID)) return;
    document.getElementById(MODAL_ID)?.remove();
    document.body.insertAdjacentHTML('beforeend', buildModalHtml());
    modalInjected = true;

    document.getElementById('wse-close-btn').addEventListener('click', closePanel);
    document.getElementById('wse-settings-btn').addEventListener('click', () => toggleSettingsView());
    document.getElementById('wse-settings-back').addEventListener('click', () => toggleSettingsView(false));
    document.getElementById('wse-new-btn').addEventListener('click', onNewStorylineClicked);
    document.getElementById('wse-generate-btn').addEventListener('click', onGenerateClicked);
    document.getElementById('wse-stop-btn').addEventListener('click', onStopClicked);
    document.getElementById('wse-reroll-btn').addEventListener('click', onRerollClicked);
    document.getElementById('wse-savelib-btn').addEventListener('click', onSaveToLibraryClicked);
    document.getElementById('wse-delete-btn').addEventListener('click', onDeleteClicked);
    document.getElementById('wse-activate-btn').addEventListener('click', onActivateClicked);
    document.getElementById('wse-lib-delete-btn').addEventListener('click', onLibraryBulkDeleteClicked);
    document.getElementById('wse-editor-body').addEventListener('input', onEditorChanged);
    document.getElementById('wse-version-picker').addEventListener('change', onVersionPicked);
    document.getElementById('wse-mobile-expand-btn').addEventListener('click', toggleMobileExpand);

    document.getElementById('wse-premise').addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); onGenerateClicked(); }
    });

    document.getElementById('wse-use-current-model').addEventListener('click', () => {
        const input = /** @type {HTMLInputElement} */ (document.getElementById('wse-set-model'));
        input.value = getCurrentModelId();
        input.dispatchEvent(new Event('change'));
    });
    document.querySelectorAll('.wse-model-quickfill').forEach((quickfillBtn) => {
        quickfillBtn.addEventListener('click', () => {
            const input = /** @type {HTMLInputElement} */ (document.getElementById('wse-set-model'));
            input.value = /** @type {HTMLElement} */ (quickfillBtn).dataset.model;
            input.dispatchEvent(new Event('change'));
        });
    });
    document.querySelectorAll('.wse-preset').forEach((btn) => {
        btn.addEventListener('click', () => {
            const el = /** @type {HTMLElement} */ (btn);
            const premise = /** @type {HTMLInputElement} */ (document.getElementById('wse-premise'));
            premise.value = el.dataset.premise || '';
            premise.focus();
            const tempo = el.dataset.tempo;
            if (tempo && TEMPO_PROFILES[tempo]) {
                settings.tempo = tempo;
                persistSettings();
                const sel = /** @type {HTMLSelectElement} */ (document.getElementById('wse-set-tempo'));
                if (sel) sel.value = tempo;
                toast('info', `Tempo set to “${tempoProfile(tempo).label}” for this genre`);
            }
        });
    });

    bindSetting('wse-set-model', 'modelOverride', v => String(v || '').trim());
    bindSetting('wse-set-tempo', 'tempo', v => (TEMPO_PROFILES[v] ? v : 'standard'));
    bindSetting('wse-set-depth', 'injectDepth', v => Math.max(0, Math.min(10, Number(v) || 1)));
    bindSetting('wse-set-maxtokens', 'maxResponseTokens', v => Math.max(800, Number(v) || 3000));
    bindSetting('wse-set-stream', 'streamDrafts', null, true);
    bindSetting('wse-set-autoadvance', 'autoAdvance', null, true);
    bindSetting('wse-set-beatchip', 'showBeatChip', null, true);
    bindSetting('wse-set-debug', 'debug', null, true);
    bindSetting('wse-set-enabled', 'enabled', null, true);
    document.getElementById('wse-set-enabled').addEventListener('change', () => updateChip());
    document.getElementById('wse-set-beatchip').addEventListener('change', () => updateChip());
    document.getElementById('wse-set-depth').addEventListener('change', () => { const a = getActiveState(); if (a?.active) writeDirector(a).catch(() => {}); });

    setupDragging();

    document.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape') return;
        const overlay = document.getElementById(MODAL_ID);
        if (overlay && overlay.style.display !== 'none') closePanel();
    });
}

function bindSetting(elId, key, transform, isCheckbox = false) {
    const el = /** @type {HTMLInputElement} */ (document.getElementById(elId));
    if (!el) return;
    el.addEventListener('change', () => {
        settings[key] = isCheckbox ? el.checked : (transform ? transform(el.value) : el.value);
        persistSettings();
        wseLog(`setting ${key} =`, settings[key]);
    });
}

function loadSettingsIntoForm() {
    const set = (id, val) => { const el = /** @type {HTMLInputElement} */ (document.getElementById(id)); if (el) el.value = String(val); };
    const check = (id, val) => { const el = /** @type {HTMLInputElement} */ (document.getElementById(id)); if (el) el.checked = !!val; };
    set('wse-set-model', settings.modelOverride || '');
    set('wse-set-tempo', settings.tempo || 'standard');
    set('wse-set-depth', settings.injectDepth);
    set('wse-set-maxtokens', settings.maxResponseTokens);
    check('wse-set-stream', settings.streamDrafts);
    check('wse-set-autoadvance', settings.autoAdvance);
    check('wse-set-beatchip', settings.showBeatChip);
    check('wse-set-debug', settings.debug);
    check('wse-set-enabled', settings.enabled);
}

function toggleSettingsView(force) {
    const editor = document.getElementById('wse-editor');
    const pane = document.getElementById('wse-settings-pane');
    const showSettings = force !== undefined ? force : pane.style.display === 'none';
    if (showSettings) loadSettingsIntoForm();
    pane.style.display = showSettings ? 'flex' : 'none';
    editor.style.display = showSettings ? 'none' : 'flex';
}

function toggleMobileExpand() {
    const modal = document.getElementById('wse-modal');
    const btn = document.getElementById('wse-mobile-expand-btn');
    const expanded = modal.classList.toggle('wse-mobile-expanded');
    btn.textContent = expanded ? '⤡' : '⤢';
    btn.title = expanded ? 'Shrink the editor back down' : 'Expand the editor to use most of the screen';
}

function autoExpandEditorOnMobile() {
    if (!window.matchMedia('(max-width: 700px)').matches) return;
    document.getElementById('wse-modal')?.classList.add('wse-mobile-expanded');
    const btn = document.getElementById('wse-mobile-expand-btn');
    if (btn) { btn.textContent = '⤡'; btn.title = 'Shrink the editor back down'; }
}

function setupDragging() {
    const modal = document.getElementById('wse-modal');
    const titlebar = document.getElementById('wse-titlebar');
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
        const W = modal.offsetWidth;
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
    overlay.style.pointerEvents = 'auto';
    toggleSettingsView(false);
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
            const job = createJob(chatId);
            job.status = 'ready';
            job.draft = draft.text;
            selectJob(job);
            document.getElementById('wse-editor-title').textContent = 'Restored draft';
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
    if (selectedRef.current?.kind === 'job') {
        const editor = /** @type {HTMLTextAreaElement} */ (document.getElementById('wse-editor-body'));
        saveDraftState(getCurrentChatId(), editor?.value ?? '');
    }
}

// =====================================================================
// UI — SIDEBAR (active-story box + library list)
// =====================================================================

async function refreshSidebar() {
    if (!document.getElementById(MODAL_ID)) return;
    renderActiveBox();
    renderLibraryList();
}

function renderActiveBox() {
    const box = document.getElementById('wse-active-box');
    if (!box) return;
    const active = getActiveState();
    if (!active?.active) { box.style.display = 'none'; box.innerHTML = ''; return; }

    box.style.display = '';
    const s = active.storyline;
    const n = s.beats.length;

    if (active.completed) {
        box.innerHTML = `
          <div class="wse-active-title">🎬 ${escapeAttr(s.title)}</div>
          <div class="wse-active-sub">Complete — all ${n} beats done</div>
          <div class="wse-active-actions">
            <button id="wse-restart-btn" class="wse-btn-sm" title="Restart this storyline from Beat 1">⟲ Restart</button>
            <button id="wse-deactivate-btn" class="wse-btn-sm wse-btn-danger" title="Stop guiding this chat and remove the director note">✕ Stop</button>
          </div>`;
    } else {
        const beat = s.beats[active.currentBeatIndex];
        const into = computeMessagesIntoBeat(active);
        const pct = Math.max(0, Math.min(100, Math.round((into / Math.max(1, beat.max)) * 100)));
        const phaseLabel = (active.phase === 'ready') ? 'ready to resolve' : 'building';
        box.innerHTML = `
          <div class="wse-active-title">🎬 ${escapeAttr(s.title)}</div>
          <div class="wse-active-sub">Beat ${active.currentBeatIndex + 1} / ${n} · ${escapeAttr(phaseLabel)}</div>
          <div class="wse-active-beat" title="${escapeAttr(beat.objective || '')}">${escapeAttr(beat.summary)}</div>
          <div class="wse-progress"><div class="wse-progress-fill" style="width:${pct}%"></div></div>
          <div class="wse-active-meta">${into} / ${beat.min}-${beat.max} messages this beat${beat.outcome ? ' · has forced outcome' : ''}</div>
          <div class="wse-active-actions">
            <button id="wse-prev-btn" class="wse-btn-sm" title="Go back one beat" ${active.currentBeatIndex === 0 ? 'disabled' : ''}>◀</button>
            <button id="wse-advance-btn" class="wse-btn-sm" title="Advance to the next beat now">Advance ▶</button>
            <button id="wse-restart-btn" class="wse-btn-sm" title="Restart from Beat 1">⟲</button>
            <button id="wse-deactivate-btn" class="wse-btn-sm wse-btn-danger" title="Stop guiding this chat and remove the director note">✕</button>
          </div>`;
    }

    box.querySelector('#wse-advance-btn')?.addEventListener('click', () => stepBeat(+1));
    box.querySelector('#wse-prev-btn')?.addEventListener('click', () => stepBeat(-1));
    box.querySelector('#wse-restart-btn')?.addEventListener('click', restartStoryline);
    box.querySelector('#wse-deactivate-btn')?.addEventListener('click', deactivateStoryline);
}

function renderLibraryList() {
    const listEl = document.getElementById('wse-library-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    checkedLibrary.clear();
    const bulkBtn = /** @type {HTMLButtonElement} */ (document.getElementById('wse-lib-delete-btn'));
    if (bulkBtn) bulkBtn.disabled = true;

    // Drafts / in-flight jobs float at the top so a generating storyline is visible.
    for (const job of getJobsForChat(getCurrentChatId())) {
        const row = document.createElement('div');
        row.className = 'wse-lib-row wse-row-draft';
        row.textContent = `${statusIcon(job.status)} Draft — ${statusLabel(job.status)}`;
        row.addEventListener('click', () => selectJob(job));
        listEl.appendChild(row);
    }

    const lib = getLibrary();
    lib.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'wse-lib-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'wse-lib-checkbox';
        checkbox.title = 'Select to delete';
        checkbox.addEventListener('click', (ev) => ev.stopPropagation());
        checkbox.addEventListener('change', () => setLibraryChecked(item, row, checkbox.checked));

        const label = document.createElement('span');
        label.className = 'wse-lib-row-label';
        label.addEventListener('click', () => selectLibrary(item));
        const titleLine = document.createElement('div');
        titleLine.className = 'wse-lib-row-title';
        titleLine.textContent = `${idx + 1}. ${item.title || '(untitled)'}`;
        const metaLine = document.createElement('div');
        metaLine.className = 'wse-lib-row-meta';
        metaLine.textContent = `${item.beats?.length ?? 0} beats${item.tone ? ` · ${item.tone}` : ''}`;
        label.appendChild(titleLine);
        label.appendChild(metaLine);

        const runBtn = document.createElement('button');
        runBtn.className = 'wse-btn-sm wse-lib-run';
        runBtn.textContent = '▶';
        runBtn.title = 'Run this storyline now';
        runBtn.addEventListener('click', (ev) => { ev.stopPropagation(); activateStoryline(item); });

        row.appendChild(checkbox);
        row.appendChild(label);
        row.appendChild(runBtn);
        listEl.appendChild(row);
    });

    if (!listEl.children.length) {
        const empty = document.createElement('div');
        empty.className = 'wse-lib-empty';
        empty.textContent = 'No saved storylines yet. Generate one and hit ★ Save to Library.';
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

const selectedRef = { current: /** @type {null | {kind:'job',job:StoryJob} | {kind:'library',item:any}} */ (null) };
const checkedLibrary = new Map(); // id -> item, for bulk delete

function editorEl() {
    return /** @type {HTMLTextAreaElement} */ (document.getElementById('wse-editor-body'));
}
function titleInputEl() {
    return /** @type {HTMLInputElement} */ (document.getElementById('wse-title-input'));
}

function clearEditorDisplay() {
    if (!document.getElementById(MODAL_ID)) return;
    const editor = editorEl();
    if (editor) editor.value = '';
    const titleEl = document.getElementById('wse-editor-title');
    if (titleEl) titleEl.textContent = 'New storyline';
    const titleInput = titleInputEl();
    if (titleInput) { titleInput.value = ''; titleInput.style.display = 'none'; }
    renderVersionPicker(null);
    updateTokenCount('');
    const btn = id => /** @type {HTMLButtonElement} */ (document.getElementById(id));
    if (btn('wse-reroll-btn')) btn('wse-reroll-btn').disabled = true;
    if (btn('wse-savelib-btn')) btn('wse-savelib-btn').disabled = true;
    if (btn('wse-delete-btn')) btn('wse-delete-btn').disabled = true;
    if (btn('wse-activate-btn')) btn('wse-activate-btn').disabled = true;
    if (btn('wse-stop-btn')) btn('wse-stop-btn').style.display = 'none';
    const statusEl = document.getElementById('wse-editor-status');
    if (statusEl) statusEl.textContent = '';
    document.getElementById('wse-modal')?.classList.remove('wse-mobile-expanded');
    const expandBtn = document.getElementById('wse-mobile-expand-btn');
    if (expandBtn) { expandBtn.textContent = '⤢'; expandBtn.title = 'Expand the editor to use most of the screen'; }
}

function resetEditorSelection() {
    selectedRef.current = null;
    checkedLibrary.clear();
    clearEditorDisplay();
}

function showTitleInputWith(value) {
    const input = titleInputEl();
    if (!input) return;
    input.style.display = '';
    input.value = (value && value !== '(untitled storyline)') ? value : '';
}

function selectJob(job) {
    selectedRef.current = { kind: 'job', job };
    const title = job.status === 'ready' ? 'Draft — ready to review'
        : job.status === 'failed' ? `Draft — failed (${job.error ?? 'unknown error'})`
        : 'Draft — generating…';
    document.getElementById('wse-editor-title').textContent = title;
    editorEl().value = job.draft;
    editorEl().readOnly = job.status === 'generating';
    showTitleInputWith(extractTitleFromDraft(job.draft));
    setEditorButtons({ kind: 'job', job });
    renderVersionPicker(job);
    updateTokenCount(job.draft);
    autoExpandEditorOnMobile();
}

function selectLibrary(item) {
    selectedRef.current = { kind: 'library', item };
    document.getElementById('wse-editor-title').textContent = item.title || '(untitled storyline)';
    editorEl().value = serializeStoryline(item);
    editorEl().readOnly = false;
    showTitleInputWith(item.title);
    setEditorButtons({ kind: 'library', item });
    renderVersionPicker(null);
    updateTokenCount(editorEl().value);
    autoExpandEditorOnMobile();
}

function setEditorButtons(sel) {
    const btn = id => /** @type {HTMLButtonElement} */ (document.getElementById(id));
    const generating = sel.kind === 'job' && sel.job.status === 'generating';
    btn('wse-stop-btn').style.display = generating ? '' : 'none';
    btn('wse-reroll-btn').disabled = generating || sel.kind !== 'job' || !sel.job.premise;
    btn('wse-savelib-btn').disabled = generating;
    btn('wse-delete-btn').disabled = generating;
    btn('wse-activate-btn').disabled = generating;
    document.getElementById('wse-editor-status').textContent =
        sel.kind === 'job' && sel.job.status === 'failed' ? `⚠ ${sel.job.error ?? 'failed'}` : '';
}

function setEditorGenerating(job, generating) {
    if (selectedRef.current?.kind !== 'job' || selectedRef.current.job.id !== job.id) return;
    const editor = editorEl();
    if (!editor) return;
    editor.readOnly = generating;
    editor.classList.toggle('wse-generating', generating);
    setEditorButtons({ kind: 'job', job });
}

function streamIntoEditor(jobId, text) {
    if (selectedRef.current?.kind !== 'job' || selectedRef.current.job.id !== jobId) return;
    const editor = editorEl();
    if (!editor) return;
    editor.value = text;
    editor.scrollTop = editor.scrollHeight;
    updateTokenCount(text);
}

function onEditorChanged() {
    const text = editorEl().value;
    if (selectedRef.current?.kind === 'job') selectedRef.current.job.draft = text;
    updateTokenCount(text);
}

async function updateTokenCount(text) {
    const el = document.getElementById('wse-token-count');
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

function onNewStorylineClicked() {
    resetEditorSelection();
    const premise = /** @type {HTMLInputElement} */ (document.getElementById('wse-premise'));
    if (premise) { premise.value = ''; premise.focus(); }
    document.getElementById('wse-editor-title').textContent = 'New storyline';
}

async function onGenerateClicked() {
    const premiseEl = /** @type {HTMLInputElement} */ (document.getElementById('wse-premise'));
    const premise = premiseEl?.value.trim();
    if (!premise) { toast('warning', 'Type a premise first — even a couple of words'); premiseEl?.focus(); return; }

    const chatId = getCurrentChatId();
    const job = createJob(chatId, { premise, tempo: settings.tempo || 'standard' });
    await refreshSidebar();
    selectJob(job);
    generateDraft(job); // async on purpose — user can close and keep chatting
}

function onStopClicked() {
    if (selectedRef.current?.kind !== 'job') return;
    selectedRef.current.job.abort?.abort();
}

async function onRerollClicked() {
    if (selectedRef.current?.kind !== 'job') return;
    const job = selectedRef.current.job;
    if (job.status === 'generating' || !job.premise) return;
    pushVersion(job);
    generateDraft(job);
}

function currentEditorStoryline() {
    const text = editorEl().value.trim();
    const check = validateStorylineShape(text);
    if (!check.ok) {
        if (!window.confirm(`This doesn't look like a complete storyline (${check.reason}). Use it anyway?`)) return null;
    }
    const parsed = parseStoryline(text);
    if (!parsed) { toast('error', 'Could not parse a storyline out of the editor text'); return null; }
    const manualTitle = titleInputEl()?.value.trim();
    if (manualTitle) parsed.title = manualTitle;
    return parsed;
}

async function onActivateClicked() {
    const storyline = currentEditorStoryline();
    if (!storyline) return;
    // If we're editing a library item, carry its id so re-runs stay tied to it.
    if (selectedRef.current?.kind === 'library') storyline.id = selectedRef.current.item.id;
    await activateStoryline(storyline);
    // Editing text is done; drop the draft so it doesn't linger as "restored".
    discardDraftState(getCurrentChatId());
}

function onSaveToLibraryClicked() {
    const storyline = currentEditorStoryline();
    if (!storyline) return;
    if (selectedRef.current?.kind === 'library') storyline.id = selectedRef.current.item.id; // update in place
    const id = addToLibrary(storyline);
    toast('success', `★ Saved "${storyline.title}" to your library`);
    if (selectedRef.current?.kind === 'job') { jobs.delete(selectedRef.current.job.id); discardDraftState(getCurrentChatId()); }
    // Reselect the saved item so further edits update it rather than duplicating.
    const saved = getLibrary().find(s => s.id === id);
    if (saved) selectLibrary(saved);
    refreshSidebar();
    updateChip();
}

async function onDeleteClicked() {
    if (!selectedRef.current) return;
    if (selectedRef.current.kind === 'job') {
        const job = selectedRef.current.job;
        job.abort?.abort();
        jobs.delete(job.id);
        discardDraftState(job.chatId);
    } else if (selectedRef.current.kind === 'library') {
        if (!window.confirm(`Remove "${selectedRef.current.item.title}" from your library?`)) return;
        removeFromLibrary(selectedRef.current.item.id);
    }
    resetEditorSelection();
    await refreshSidebar();
    updateChip();
}

function setLibraryChecked(item, rowEl, checked) {
    if (checked) { checkedLibrary.set(item.id, item); rowEl.classList.add('wse-selected'); }
    else { checkedLibrary.delete(item.id); rowEl.classList.remove('wse-selected'); }
    /** @type {HTMLButtonElement} */ (document.getElementById('wse-lib-delete-btn')).disabled = checkedLibrary.size === 0;
}

async function onLibraryBulkDeleteClicked() {
    if (checkedLibrary.size === 0) return;
    const items = [...checkedLibrary.values()];
    const count = items.length;
    if (!window.confirm(`Delete ${count} saved storyline${count === 1 ? '' : 's'}? This can't be undone.`)) return;
    for (const item of items) removeFromLibrary(item.id);
    checkedLibrary.clear();
    toast('success', `Deleted ${count} storyline${count === 1 ? '' : 's'}`);
    resetEditorSelection();
    await refreshSidebar();
}

// =====================================================================
// SLASH COMMANDS
// =====================================================================

function registerSlashCommands() {
    try {
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'story',
            callback: async () => { await openPanel(); return ''; },
            helpString: 'Opens the Weyland Storyline Engine panel.',
        }));
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'story-advance',
            callback: async () => { await stepBeat(+1); return ''; },
            helpString: 'Advances the active storyline to the next beat.',
        }));
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'story-off',
            callback: async () => { await deactivateStoryline(); return ''; },
            helpString: 'Stops the active storyline and removes its director note.',
        }));
        wseLog('slash commands registered: /story, /story-advance, /story-off');
    } catch (err) {
        wseWarn('slash command registration failed', err);
    }
}

// =====================================================================
// WAND MENU ENTRY (Extensions dropdown)
// =====================================================================

function addWandMenuItem() {
    const container = document.getElementById('extensionsMenu');
    if (!container || document.getElementById('wse-wand-item')) return;
    const item = document.createElement('div');
    item.id = 'wse-wand-item';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = '<span>🎬</span><span>Storyline Engine</span>';
    item.addEventListener('click', () => openPanel());
    container.appendChild(item);
}

// =====================================================================
// BOOTSTRAP
// =====================================================================

(function init() {
    try {
        loadSettings();
        ensureChip();
        registerSlashCommands();
        addWandMenuItem();

        eventSource?.on?.(event_types?.CHAT_CHANGED, () => {
            resetEditorSelection();
            updateChip();
            reconcileDirector();
            if (document.getElementById(MODAL_ID)?.style.display === 'block') {
                refreshSidebar();
            }
        });
        eventSource?.on?.(event_types?.MESSAGE_RECEIVED, () => { runtimeTick(); });
        eventSource?.on?.(event_types?.APP_READY, () => { addWandMenuItem(); reconcileDirector(); });

        console.info(`[${WSE_MODULE_NAME}] initialized v${EXT_VERSION}`);
    } catch (err) {
        console.error(`[${WSE_MODULE_NAME}] init failed`, err);
    }
})();
