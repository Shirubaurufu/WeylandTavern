// Ellie's Foxfire Fortunes: WeyPhone tile + the parent-page side of the app.
// Built the same way as Muse's Story Machine (read ../Weyland-MuseStoryMachine/index.js first): the
// app runs in an iframe (app/index.html) and talks to this file through window.ellieFoxfireFortunes
// (same origin, a plain object). This side owns the model call, per-chat storage, the prompt
// injection and reading the chapter flag out of each reply.
// A fortune is a Story Machine storyline with a tarot card on each chapter, so the injected text and
// the chapter-flag rules are Muse's storyCore.js, untouched. Only the request differs (fortuneCore.js).
// Since 2026-11-18 Foxfire ships WITHOUT Muse's Story Machine (Lucky: Muse isn't ready, no tile, no store
// page), so storyCore.js and the chat helpers (chatContext.js) are copies kept in this folder. Nothing here
// may import from ../Weyland-MuseStoryMachine: on a player's install that folder doesn't exist.
import {
    eventSource, event_types, setExtensionPrompt, extension_prompt_types, extension_prompt_roles,
} from '../../../script.js';
import { getContext, extension_settings } from '../../extensions.js';
import * as wp from '../Weyland-WeyPhone/lib/generation.js';
import { getTier, appVisibleForTier } from '../Weyland-WeyPhone/lib/tier.js';
import {
    buildInjection, readChapterFlag, nextChapterState, afterDelete, forkChapter, totalFor, chapterLabel,
} from './storyCore.js';
// The planner's view of the chat (card text with the charPer fallback, named cast and places): Muse's
// helpers, copied (see chatContext.js). test/storyCoreCopy.test.mjs checks the copies against Muse's.
import { hasOpenChat, oocModeOn, currentCharacter, cardText, recentChat, loreText } from './chatContext.js';
import { buildFortuneMessages, parseFortune, fortuneMaxTokens, isFilterRefusal, ACTS_FOR_USER_NOTE, BLOCK_OPTIONS, BLOCK_CUSTOM_MAX, BLOCK_CUSTOM_CHARS } from './fortuneCore.js';

const KEY = 'ellie-foxfire-fortunes';
const APP_NAME = 'Foxfire Fortunes'; // "Ellie's" dropped from the name (Lucky, 2026-11-17)
const PROMPT_KEY = 'ELLIE_FOXFIRE_FORTUNES';
const META_KEY = 'ellieFoxfireFortunes';
const MUSE_META_KEY = 'museStoryMachine';
const ICON_URL = new URL('./app-icon.svg', import.meta.url).href;
const PAGE_URL = new URL('./app/index.html', import.meta.url).href;
// Same spot as the Story Machine's storyline (depth 4, system role); see the note there.
const INJECT_DEPTH = 4;
const SHELF_MAX = 12;
// Kept question slips (the tray on the ask page). Newest first; the same text is never kept twice.
const PROMPTS_MAX = 20;
const PROMPT_CHARS = 1560; // the textarea's own maxlength
const PROMPT_NAME_CHARS = 40; // a kept slip's name: a short label, one line in the kept-slips box

let frame = null;
let abort = null;
const subscribers = new Set();

function ctx() { return getContext(); }

function shelfStore() {
    const root = (extension_settings.ellieFoxfireFortunes ||= {});
    if (!Array.isArray(root.shelf)) root.shelf = [];
    if (!Array.isArray(root.prompts)) root.prompts = [];
    return root;
}

// The player's settings page (Lucky, 2026-11-17). Kept in extension settings, like kept slips, so a blacklist
// set on the PC also holds on the phone. Cleaned on every write: unknown ids dropped, custom entries trimmed.
function readPrefs() {
    const p = shelfStore().prefs || {};
    const known = new Set(BLOCK_OPTIONS.map(o => o.id));
    return {
        blocks: (Array.isArray(p.blocks) ? p.blocks : []).filter(id => known.has(id)),
        customBlocks: (Array.isArray(p.customBlocks) ? p.customBlocks : [])
            .map(s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, BLOCK_CUSTOM_CHARS)).filter(Boolean).slice(0, BLOCK_CUSTOM_MAX),
    };
}
function writePrefs(next) {
    const root = shelfStore();
    root.prefs = { ...readPrefs(), ...next };
    root.prefs = readPrefs(); // store the cleaned version
    ctx().saveSettingsDebounced?.();
    return readPrefs();
}

function chatState() {
    const meta = ctx().chatMetadata;
    return meta ? meta[META_KEY] || null : null;
}

// Alpha (Paw Patrol Platinum) only. Read with WeyPhone's own tier helpers so the phone and this file never
// disagree about who has access.
const TIER = 'platinum';
function membershipLapsed() {
    try { return !appVisibleForTier({ tierGated: TIER }, getTier(ctx())); } catch { return false; }
}

// A player who loses alpha keeps every fortune, but the fortunes stop steering their roleplays (Lucky,
// 2026-11-17): no injection, no chapter moves, and a Story Machine storyline can replace one without
// deleting it. Nothing is erased, so upgrading again picks each chat up where it was. This is checked at
// every generation (GENERATION_AFTER_COMMANDS re-runs applyInjection), so a change of membership counts at once.
function applyInjection() {
    const st = chatState();
    let text = st?.story && st.active && !st.done && !oocModeOn() && !membershipLapsed() ? buildInjection(st.story, st.chapter, st.route || null) : '';
    // A fortune planned with "Writer can act for me" may say what {{user}} does; without this line the
    // roleplay's own "never act as {{user}}" rule would read that as a mistake in the plan.
    if (text && st.story.actsForUser) text += `\n${ACTS_FOR_USER_NOTE}`;
    setExtensionPrompt(PROMPT_KEY, text, extension_prompt_types.IN_CHAT, INJECT_DEPTH, false, extension_prompt_roles.SYSTEM);
}

function notify() {
    applyInjection();
    const s = status();
    for (const fn of subscribers) { try { fn(s); } catch { /* a closed iframe's callback */ } }
}

function saveState(next) {
    const c = ctx();
    if (!c.chatMetadata) return;
    if (next) c.chatMetadata[META_KEY] = next; else delete c.chatMetadata[META_KEY];
    c.saveMetadataDebounced?.();
    notify();
}

function status() {
    const c = ctx();
    const ch = currentCharacter();
    const st = chatState();
    return {
        hasChat: hasOpenChat(),
        charName: c.groupId ? (c.groups?.find(g => g.id === c.groupId)?.name || 'this group') : (ch?.name || ''),
        userName: c.name1 || '',
        story: st?.story || null,
        chapter: st?.chapter || 1,
        route: st?.route || null,
        active: !!st?.active,
        done: !!st?.done,
        ooc: oocModeOn(),
        shelf: shelfStore().shelf.slice(),
        prompts: shelfStore().prompts.slice(),
    };
}

/**
 * Ask the model for a fortune. `cards` come from the app with their plain meaning attached
 * ({id, rev, pos, key, otherKey}); the deck itself lives in the app, not here.
 */
async function generate({ question = '', cards = [], spice = 1, darkness = 1, pace = 'steady', connection = null, fork = false, sheet = true, actsForUser = false } = {}) {
    const c = ctx();
    if (!hasOpenChat()) throw new Error('Open a chat first.');
    // The phone already keeps the app shut without alpha; this stops a request from a page left open.
    if (membershipLapsed()) throw new Error('Foxfire Fortunes needs a Paw Patrol Platinum membership.');
    if (!c.ConnectionManagerRequestService) throw new Error('Connection Manager is not available.');
    const cm = c.extensionSettings.connectionManager || {};
    const profileId = wp.resolveProfileId({ connectionProfileId: c.extensionSettings.WeyPhone?.connectionProfileId || '' }, cm.selectedProfile ?? '', cm.profiles);
    const model = wp.resolveModelOverride({ settingsModel: '', liveModel: c.getChatCompletionModel?.() });
    const recent = recentChat();
    // Named cast and places are looked up from the player's question, as the Story Machine does from its idea.
    const lore = await loreText(question, recent);
    const messages = buildFortuneMessages({
        charName: status().charName, userName: c.name1 || '', cardText: await cardText(), recentChat: recent,
        castText: lore.cast, placesText: lore.places,
        question, cards, spice, darkness, pace, connection, fork, sheet, actsForUser,
        // Read from storage here, not passed in by the app, so the saved list is always the one that counts.
        blocks: { ids: readPrefs().blocks, custom: readPrefs().customBlocks },
    });
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    // A content filter's refusal is flagged (`filtered`), so the app has Ellie answer it instead of an error box.
    let result;
    try {
        result = await wp.sendMessage({
            sendRequest: (pid, msgs) => c.ConnectionManagerRequestService.sendRequest(pid, msgs, fortuneMaxTokens({ fork, sheet }), { signal }, model ? { model } : {}),
            profileId, messages, model,
        });
    } catch (err) {
        if (isFilterRefusal(err?.message || err)) { try { err.filtered = true; } catch { /* a frozen error */ } }
        throw err;
    }
    const text = wp.extractResponseText(result);
    if (isFilterRefusal(text, { reply: true })) {
        throw Object.assign(new Error('A content filter refused the request.'), { filtered: true, raw: text });
    }
    const story = parseFortune(text);
    if (!story) {
        const err = new Error(text ? 'The model answered, but not in the fortune format.' : 'The model sent nothing back.');
        err.raw = text;
        throw err;
    }
    // Remembered on the story itself, so the injection knows it later (and a shelved fortune keeps it).
    if (actsForUser) story.actsForUser = true;
    return story;
}

function onReply(index) {
    const st = chatState();
    // Without alpha the fortune is paused: the story is not being followed, so its chapter must not move.
    if (!st?.story || !st.active || membershipLapsed()) return;
    const msg = ctx().chat?.[index];
    if (!msg || msg.is_user || msg.is_system) return;
    const next = nextChapterState(st, readChapterFlag(msg.mes), index, st.story);
    if (!next.changed) return;
    const oldRoute = st.route || null;
    const moved = next.chapter !== st.chapter || next.done !== !!st.done || next.route !== oldRoute;
    saveState({ ...st, chapter: next.chapter, route: next.route, done: next.done, advance: next.advance });
    if (moved) {
        const crossed = next.chapter === st.chapter && next.route !== oldRoute;
        const label = next.done ? 'The last card has played out.'
            : crossed ? `A change of heart. The fortune crossed to road ${next.route}.`
                : `The next card turned: chapter ${chapterLabel(st.story, next.chapter, next.route)}.`;
        globalThis.toastr?.info(label, APP_NAME, { timeOut: 3500 });
    }
}

// Deleting back past the reply that moved the story on undoes that step (rerolls don't, see storyCore).
function onDeleted() {
    const st = chatState();
    if (membershipLapsed()) return; // paused (see applyInjection): deletions don't rewind a story nobody is following
    const next = st?.story ? afterDelete(st, ctx().chat?.length ?? 0) : null;
    if (next) saveState(next);
}

const api = {
    status,
    generate,
    // Settings page: the chip list comes from here so the app and the prompt never disagree on what an id means.
    blockOptions: () => BLOCK_OPTIONS.map(({ id, label }) => ({ id, label })),
    blockLimits: () => ({ max: BLOCK_CUSTOM_MAX, chars: BLOCK_CUSTOM_CHARS }),
    getPrefs: readPrefs,
    setPrefs: writePrefs,
    cancel() { abort?.abort(); abort = null; },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    loadStory(story) {
        if (!hasOpenChat() || !story?.chapters?.length) return false;
        // One storyline per chat: the Story Machine's uses the same (Ch N) header flag, and two
        // injections would fight over it. The newer one wins (its loadStory ejects ours the same way).
        if (ctx().chatMetadata?.[MUSE_META_KEY]) window.museStoryMachine?.eject();
        saveState({ story, chapter: 1, route: null, active: true, done: false, advance: null, loadedAt: Date.now() });
        return true;
    },
    // Moving by hand. Past the fork a route is needed: the one asked for, else the one already taken, else A.
    setChapter(n, route) {
        const st = chatState();
        if (!st?.story) return;
        const forkAt = forkChapter(st.story);
        let r = forkAt ? (route || st.route || 'A') : null;
        const chapter = Math.min(Math.max(1, n | 0), totalFor(st.story, r));
        if (!forkAt || chapter <= forkAt) r = null;
        saveState({ ...st, chapter, route: r, done: false, advance: null });
    },
    finish() {
        const st = chatState();
        if (!st?.story) return;
        const r = forkChapter(st.story) ? (st.route || 'A') : null;
        saveState({ ...st, chapter: totalFor(st.story, r), route: r, done: true, advance: null });
    },
    // Resuming a paused fortune makes it the chat's storyline again, so a Story Machine storyline loaded in
    // the meantime steps aside (the two would fight over the same chapter flag).
    setActive(on) {
        const st = chatState();
        if (!st?.story) return;
        if (on && ctx().chatMetadata?.[MUSE_META_KEY]) window.museStoryMachine?.eject();
        saveState({ ...st, active: !!on });
    },
    // The Story Machine calls this when it loads a storyline. Without alpha the fortune is only paused, not
    // deleted, so it is still there if the player upgrades again (and they can't open the app to save it first).
    eject() {
        const st = chatState();
        if (!st) return;
        if (membershipLapsed() && st.story) saveState({ ...st, active: false });
        else saveState(null);
    },
    shelve(story) {
        const root = shelfStore();
        root.shelf = [{ ...story, shelvedAt: Date.now() }, ...root.shelf.filter(s => s.title !== story.title)].slice(0, SHELF_MAX);
        ctx().saveSettingsDebounced?.();
        notify();
    },
    unshelve(i) { const root = shelfStore(); root.shelf.splice(i, 1); ctx().saveSettingsDebounced?.(); notify(); },
    // Kept in extension settings, not the chat, so a kept question is there in every chat. No notify():
    // the app redraws the tray itself, and a notify would also redraw the unfold screen for nothing.
    keepPrompt(text) {
        const t = String(text || '').trim().slice(0, PROMPT_CHARS);
        if (!t) return;
        const root = shelfStore();
        // Keeping the same text again moves it to the top and keeps the name the player gave it.
        const name = root.prompts.find(p => p.text === t)?.name;
        root.prompts = [{ text: t, at: Date.now(), ...(name ? { name } : {}) }, ...root.prompts.filter(p => p.text !== t)].slice(0, PROMPTS_MAX);
        ctx().saveSettingsDebounced?.();
    },
    forgetPrompt(i) { const root = shelfStore(); root.prompts.splice(i, 1); ctx().saveSettingsDebounced?.(); },
    // A kept slip can carry a short name (Lucky, 2026-11-17: the kept-slips box lets you rename them). The name is
    // only a label in the box; the text is still what goes on the slip. An empty name drops it (the text shows again).
    renamePrompt(i, name) {
        const p = shelfStore().prompts[i];
        if (!p) return;
        const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, PROMPT_NAME_CHARS);
        if (n) p.name = n; else delete p.name;
        ctx().saveSettingsDebounced?.();
    },
};
window.ellieFoxfireFortunes = api;

// WeyPhone keeps its own status bar and home button around a mounted app, so the page needs no close button.
function mountApp(container) {
    unmountApp();
    frame = document.createElement('iframe');
    frame.className = 'wp-external-app-frame';
    frame.allow = 'autoplay';
    // The timestamp keeps the browser from showing a cached copy of the page after an update.
    frame.src = `${PAGE_URL}?v=${Date.now()}`;
    container.replaceChildren(frame);
}

function unmountApp() {
    subscribers.clear();
    frame?.remove();
    frame = null;
}

// While the app is open, WeyPhone's status bar (time, signal, battery) takes the parlor's colors: the near-black
// plum at the top of the room and the gold of the app's own buttons, so the phone's chrome reads as part of the
// app (Lucky, 2026-11-17). Same pattern as Registrar's `#wp-panel[data-app="registrar"] #wp-status-bar`, but the
// rule lives here, so WeyPhone needs no change. The status bar draws everything from --wp-text / --wp-text-dim,
// so overriding those two on the bar recolors the clock, signal bars, battery shell and fill together.
function addStatusBarTheme() {
    if (document.getElementById('eff-status-theme')) return;
    const style = document.createElement('style');
    style.id = 'eff-status-theme';
    style.textContent = `
#wp-panel[data-app="${KEY}"][data-view="external-app"] #wp-status-bar {
    background: #07050f; color: #d7a84a; --wp-text: #d7a84a; --wp-text-dim: #d7a84aa6; text-shadow: none;
}`;
    document.head.append(style);
}

function registerPhoneTile() {
    addStatusBarTheme();
    const apps = (window.weyPhoneExternalApps ||= []);
    if (apps.some(app => app?.key === KEY)) return;
    apps.push({
        // No `store` block: the WeyStore page lives in WeyPhone's lib/weystoreCatalog.js (with its own
        // lettering in weystore.css), where the store's house-rule test can check it.
        key: KEY, label: 'Fortunes', icon: ICON_URL, accent: '#6fd3ff', mount: mountApp, unmount: unmountApp,
        // Alpha (Paw Patrol Platinum, PPP1) only (Lucky, 2026-11-17). WeyPhone's lib/tier.js reads this the same
        // way as for its own apps: the store shows "Members" instead of Get, and the tile is not drawn without it.
        tierGated: TIER,
        // The phone's back button: let the page step back through its own screens first (parlor.js stepBack).
        back: () => { try { return frame?.contentWindow?.effBack?.() === true; } catch { return false; } },
    });
    document.dispatchEvent(new CustomEvent('weyphone:apps-changed'));
}

eventSource.on(event_types.APP_READY, registerPhoneTile);
eventSource.on(event_types.CHAT_CHANGED, notify);
// Re-applied right before a generation too, in case OOC Mode was flipped since the last change.
eventSource.on(event_types.GENERATION_AFTER_COMMANDS, applyInjection);
eventSource.on(event_types.MESSAGE_RECEIVED, onReply);
eventSource.on(event_types.MESSAGE_SWIPED, onReply);
eventSource.on(event_types.MESSAGE_DELETED, onDeleted);
registerPhoneTile();
