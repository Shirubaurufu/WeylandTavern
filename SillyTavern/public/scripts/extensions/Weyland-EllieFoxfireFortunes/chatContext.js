// What the fortune planner gets to know about the open chat: the character's card and full bot, the last few
// messages, and lore for cast members and places that the request or the scene names.
//
// COPIED from Weyland-MuseStoryMachine/index.js (2026-11-18), where these helpers were written and live-tested.
// Muse's Story Machine is not released, and Lucky wants Foxfire to ship without it (no Muse tile, no store
// page). Importing Muse's index.js would run it and register its tile, so Foxfire carries its own copy of just
// these functions. The only change is that loreText takes the character's name from charName() here instead of
// Muse's status(). If one is fixed, fix the other too.
import { getContext, extension_settings } from '../../extensions.js';
import { loadWorldInfo } from '../../world-info.js';
import { findNamedCast, findNamedPlaces } from './storyCore.js';

function ctx() { return getContext(); }

export function hasOpenChat() {
    const c = ctx();
    return !!c.getCurrentChatId?.() && (c.characterId !== undefined || !!c.groupId);
}

// OOC Mode replaces the whole roleplay prompt; a storyline on top of it would pull the model back in character.
export function oocModeOn() {
    const v = extension_settings.variables?.global?.OOCMode;
    return String(v || '').toLowerCase() === 'enabled';
}

export function currentCharacter() {
    const c = ctx();
    return c.characterId !== undefined ? c.characters?.[c.characterId] : null;
}

// The open chat's character, or the group's name.
function charName() {
    const c = ctx();
    return c.groupId ? (c.groups?.find(g => g.id === c.groupId)?.name || 'this group') : (currentCharacter()?.name || '');
}

// What the planner gets to know about the character. The personality field is often a 30k+ character full
// bot, so it is cut; the description and the start of the bot carry who they are.
export async function cardText() {
    const c = ctx();
    const ch = currentCharacter();
    if (!ch) return '';
    const sub = s => { try { return c.substituteParams(String(s || '')); } catch { return String(s || ''); } };
    const parts = [sub(ch.description).slice(0, 5000), (await personalityText(ch, sub)).slice(0, 7000), sub(ch.scenario).slice(0, 1500)];
    return parts.filter(Boolean).join('\n\n');
}

// A Weyland card's personality is "{{getvar::X}}", and X is only filled (from quick-reply-ext's encoded
// charPer map) on the chat's FIRST user message. Live 2026-11-14 (Muse): a fresh Loona chat sent the planner her
// 1.2k description and none of her 34k bot. So an empty variable falls back to charPer directly.
async function personalityText(ch, sub) {
    const text = sub(ch.personality);
    if (text.trim()) return text;
    const varName = String(ch.personality || '').match(/\{\{getvar::([^}]+)\}\}/)?.[1];
    if (!varName) return '';
    try {
        const { charPer } = await import('../quick-reply-ext/src/charper.js');
        const vars = charPer?.get?.(ch.name)?.vars || {};
        // The keys are encoded too and decode when listed, so match by listing rather than vars[varName].
        const hit = Object.entries(vars).find(([k]) => k === varName);
        return hit ? sub(String(hit[1] ?? '')) : '';
    } catch { return ''; }
}

export function recentChat() {
    const c = ctx();
    const msgs = (c.chat || []).filter(m => !m.is_system && m.mes).slice(-6);
    return msgs.map(m => `${m.name}: ${String(m.mes).replace(/\s+/g, ' ').slice(0, 900)}`).join('\n');
}

// ---------- other cast members named in the request or the scene ----------
// The subbot text normally lives in a chat variable (quick-reply-ext's RosterSB sets e.g. TAWN from
// strings.rsbTAWN), but RosterSB only runs on the chat's FIRST user message, and a fortune is often asked for
// on a fresh chat. So an empty variable falls back to the encoded subbot itself, through the same VAR -> strings
// key pairs RosterSB uses, read from its source (first pair per variable = the default variant).
const CAST_MAX_CHARS = 3000;
let rosterMap = null;
async function rosterPairs() {
    if (rosterMap) return rosterMap;
    rosterMap = new Map();
    try {
        // A string, not a URL object: the adj extension wraps window.fetch and calls url.includes() (2026-11-14).
        const src = await (await fetch(new URL('../quick-reply-ext/index.js', import.meta.url).href)).text();
        for (const m of src.matchAll(/setLocalVariable\(\s*["']([A-Za-z0-9_]+)["']\s*,\s*strings\.(rsb[A-Za-z0-9_]+)/g)) {
            if (!rosterMap.has(m[1])) rosterMap.set(m[1], m[2]);
        }
    } catch { /* no fallback then; live variables still work */ }
    return rosterMap;
}

async function subbotText(varName) {
    const c = ctx();
    let text = String(c.chatMetadata?.variables?.[varName] ?? '');
    if (!text.trim()) {
        const key = (await rosterPairs()).get(varName);
        if (key) {
            try { text = String((await import('../quick-reply-ext/src/strings.js')).default[key] ?? ''); } catch { text = ''; }
        }
    }
    if (!text.trim() || text === 'undefined') return '';
    try { text = c.substituteParams(text); } catch { /* raw is still useful */ }
    return text.trim().slice(0, CAST_MAX_CHARS);
}

const PLACE_MAX_CHARS = 2500;

// The header of the latest character reply ("¦¦ date ~ time ~ Kodo Bowl ~ (Ch 2) ¦¦"): where the scene is now.
function currentHeader() {
    const chat = ctx().chat || [];
    for (let i = chat.length - 1; i >= 0; i--) {
        const m = chat[i];
        if (!m || m.is_user || m.is_system) continue;
        return String(m.mes || '').slice(0, 6000).match(/¦¦[^\n]*?¦¦/)?.[0] || '';
    }
    return '';
}

// Lore for the planner from the Weyland book: subbots of cast members and descriptions of places that the
// request or the scene names. One book load for both; a failure only costs the extra context.
export async function loreText(idea, recent) {
    const out = { cast: '', places: '' };
    try {
        const entries = Object.values((await loadWorldInfo('Weyland'))?.entries || {});
        const sub = s => { try { return ctx().substituteParams(s); } catch { return s; } };
        const parts = [];
        for (const { name, varName } of findNamedCast(entries, [idea, recent], { exclude: charName() })) {
            const text = await subbotText(varName);
            if (text) parts.push(`[${name}]\n${text}`);
        }
        out.cast = parts.join('\n\n');
        out.places = findNamedPlaces(entries, [idea, currentHeader()], { charName: charName() })
            .map(p => `[${p.name}]\n${sub(p.content).slice(0, PLACE_MAX_CHARS)}`).join('\n\n');
    } catch (err) {
        console.warn('[Foxfire Fortunes] could not read the lorebook', err);
    }
    return out;
}
