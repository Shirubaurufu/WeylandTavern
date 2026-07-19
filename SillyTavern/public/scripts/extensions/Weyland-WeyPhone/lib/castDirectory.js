// lib/castDirectory.js

import { CAST_SNAPSHOT } from './castSnapshot.js';

export const CAST_DATA_URL = 'https://cast.weybooru.com/data/data.json';
export const CAST_PORTRAIT_BASE = 'https://cast.weybooru.com/images/portraits';
export const CAST_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const CAST_FETCH_TIMEOUT_MS = 8_000;

/**
 * @typedef {Object} CastEntry
 * @property {string} name
 * @property {string} gender
 * @property {string|number} age
 * @property {string} birthday
 * @property {string} height
 * @property {string} species
 * @property {string} summary
 * @property {string} occupation
 * @property {string} home
 * @property {string} association
 * @property {string} handle
 * @property {string[]} tag
 * @property {string} description
 * @property {string} image portrait slug — '' when the character has no portrait yet
 */

function splitList(value) {
    return String(value ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Normalizes cast.weybooru.com's data.json payload ({values: [[key, payload], ...]} with the
 * "character" row holding a name-keyed object of raw entries) into a flat CastEntry[].
 * Tolerant of shape drift: a payload that isn't recognizable yields [] rather than throwing.
 * @param {unknown} json the parsed data.json body
 * @returns {CastEntry[]}
 */
export function parseCastData(json) {
    const values = json?.values;
    if (!Array.isArray(values)) return [];
    const characterRow = values.find(row => Array.isArray(row) && row[0] === 'character');
    const raw = characterRow?.[1];
    if (!raw || typeof raw !== 'object') return [];
    return Object.values(raw)
        .filter(c => c && typeof c === 'object' && c.name)
        // Aethel is canonically not a real person (she exists inside a phone game) — she has no
        // business in a contacts directory, even though the public cast site lists her.
        .filter(c => c.name !== 'Aethel')
        .map(c => ({
            name: String(c.name),
            gender: c.gender ?? '',
            age: c.age ?? '',
            birthday: c.birthday ?? '',
            height: c.height ?? '',
            species: c.species ?? '',
            summary: c.summary ?? '',
            occupation: c.occupation ?? '',
            home: String(c.home ?? '').replace(/\[\[|\]\]/g, ''), // strip wiki-link brackets
            association: c.association ?? '',
            handle: c.handle ?? '',
            tag: Array.isArray(c.tag) ? c.tag : splitList(c.tag),
            description: c.description ?? '',
            image: c.image ?? '',
        }));
}

/** @param {CastEntry} entry @returns {string|null} */
export function castPortraitUrl(entry) {
    return entry.image ? `${CAST_PORTRAIT_BASE}/${entry.image}.jpg` : null;
}

/**
 * Returns cast entries synchronously from the best available source — fresh cache, stale cache,
 * or the committed snapshot — and kicks off a background refresh when the cache is missing/stale.
 * The refresh never blocks rendering; `onRefreshed` fires only if newer data actually landed.
 * @param {{castDirectory: {fetchedAt: number, entries: CastEntry[]}|null}} settings
 * @param {{fetchImpl?: typeof fetch, now?: number, onRefreshed?: () => void}} [options]
 * @returns {CastEntry[]}
 */
export function getCastEntries(settings, { fetchImpl = fetch, now = Date.now(), onRefreshed } = {}) {
    const cache = settings.castDirectory;
    const fresh = cache && Array.isArray(cache.entries) && cache.entries.length > 0
        && (now - cache.fetchedAt) < CAST_CACHE_TTL_MS;
    if (!fresh) {
        refreshCastDirectory(settings, fetchImpl).then(updated => {
            if (updated) onRefreshed?.();
        });
    }
    if (cache && Array.isArray(cache.entries) && cache.entries.length > 0) return cache.entries;
    return CAST_SNAPSHOT;
}

// Deduped in-flight refresh — repeated Contacts opens while a fetch is pending share one request.
let refreshInFlight = null;

/**
 * Fetches and caches the live directory. Resolves true if the cache was updated.
 * Failures are swallowed (logged) — the caller is already rendering from cache/snapshot.
 * @param {{castDirectory: object|null}} settings
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<boolean>}
 */
export function refreshCastDirectory(settings, fetchImpl = fetch, { timeoutMs = CAST_FETCH_TIMEOUT_MS } = {}) {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
            const response = await fetchImpl(CAST_DATA_URL, controller ? { signal: controller.signal } : undefined);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const entries = parseCastData(await response.json());
            if (entries.length === 0) throw new Error('no cast entries in payload');
            settings.castDirectory = { fetchedAt: Date.now(), entries };
            return true;
        } catch (error) {
            console.warn('[WeyPhone] cast directory refresh failed:', error);
            return false;
        } finally {
            if (timeout) clearTimeout(timeout);
            refreshInFlight = null;
        }
    })();
    return refreshInFlight;
}

/**
 * Links cast entries to WeyPhone's generation roster: exact full-name match first, then unique
 * first-name match, then normalized handle match. Roster stays authoritative for generation —
 * this map only enriches display (portraits, bios).
 * @param {CastEntry[]} castEntries
 * @param {Array<{name: string, handle?: string}>} roster
 * @returns {Map<string, CastEntry>} roster name → cast entry
 */
export function linkCastToRoster(castEntries, roster) {
    const byFullName = new Map(castEntries.map(c => [c.name.toLowerCase(), c]));
    const byFirstName = new Map();
    for (const c of castEntries) {
        const first = c.name.split(/\s+/)[0].toLowerCase();
        byFirstName.set(first, byFirstName.has(first) ? null : c); // null marks ambiguity
    }
    const normalizeHandle = h => String(h ?? '').replace(/^@/, '').toLowerCase();
    const byHandle = new Map(castEntries.filter(c => c.handle).map(c => [normalizeHandle(c.handle), c]));

    const result = new Map();
    for (const member of roster) {
        const lower = member.name.toLowerCase();
        const match = byFullName.get(lower)
            ?? byFirstName.get(lower.split(/\s+/)[0])
            ?? (member.handle ? byHandle.get(normalizeHandle(member.handle)) : undefined);
        if (match) result.set(member.name, match);
    }
    return result;
}

/**
 * Case-insensitive multi-field search over the directory.
 * @param {CastEntry[]} entries
 * @param {string} query
 * @returns {CastEntry[]}
 */
export function searchCast(entries, query) {
    const q = String(query ?? '').trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(c => [c.name, c.species, c.occupation, c.summary, c.association, c.tag.join(' ')]
        .some(field => String(field).toLowerCase().includes(q)));
}
