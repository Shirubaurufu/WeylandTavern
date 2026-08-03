import express from 'express';
import fetch from 'node-fetch';
import crypto from 'node:crypto';

import { SecretManager, SECRET_KEYS } from './secrets.js';

/**
 * Weyland KeyGuard — server side.
 *
 * WHY THIS IS SERVER-SIDE AND NOT IN THE EXTENSION
 * ------------------------------------------------
 * Two hard constraints make a browser-side implementation impossible:
 *
 * 1. CORS. `helixmind.online` only sends `Access-Control-Allow-Origin` to its own
 *    dashboard origin. A fetch from a WeyTav page (localhost:8000, a LAN IP, a user's
 *    own domain) is blocked by the browser before any response is readable. There is no
 *    finite origin list we could ask the provider to allow. Server-to-server calls are
 *    not subject to CORS, so the check has to originate here.
 *
 * 2. `allowKeysExposure` is FALSE in the shipped Weyland install base. With it off,
 *    `/api/secrets/find` returns null and `/api/secrets/read` masks every value down to
 *    its last three characters. The browser therefore cannot read the user's key at all
 *    — it cannot classify it, validate it, or hand it to the exchange service. The
 *    server can, via SecretManager, without weakening that setting for anyone.
 *
 * DESIGN RULES
 *  - Raw key values never leave this module. Responses carry secret IDs, never values.
 *    The single exception is /exchange, which returns the NEW key so the client can
 *    populate the `HMKey` global that WeyPhone and the usage tracker read. That key is
 *    one the user just deliberately obtained, and HMKey is stored in settings.json in
 *    plaintext by Weyland's existing design — so this is not a new class of exposure.
 *  - Keys are never logged, not even truncated.
 *  - Validation uses GET /v1/usage/quota. It is a metadata endpoint: measured against
 *    production, four consecutive calls moved `global_rpd.used` by 0. It does NOT spend
 *    a user's message allowance. It is used purely as an auth oracle (200 vs 401).
 *  - Results are cached by value-hash so repeated launches don't re-hit the provider.
 */

export const router = express.Router();

const API_BASE = 'https://helixmind.online';
const VALIDATE_PATH = '/v1/usage/quota';   // 401 unauthenticated -> a clean auth oracle
const USAGE_PATH = '/v1/usage';            // token-scoped; `total` is the per-user count
const SWAP_ENDPOINT = 'https://keys.weybooru.com/swap';
const KEY_PREFIX = 'helix';

const REQUEST_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;   // 6h: long enough that relaunches are free
const MAX_VALIDATIONS_PER_CALL = 6;        // hard ceiling on outbound calls per request

/**
 * status cache: sha256(key value) -> { status, at }
 * Hashed so a heap dump or accidental log of this map can't reveal a key.
 * Process-local by design; a restart simply re-validates once.
 * @type {Map<string, { status: string, at: number }>}
 */
const statusCache = new Map();

/**
 * fetch with a hard timeout. Uses an explicit AbortController rather than
 * AbortSignal.timeout() so there is no dependency on a particular Node minor.
 */
async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function fingerprint(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function isWeylandKey(value) {
    return typeof value === 'string' && value.trim().toLowerCase().startsWith(KEY_PREFIX);
}

/**
 * Reads this user's api_key_custom secrets as [{ id, label, active, value }].
 * SecretManager gives us real values regardless of `allowKeysExposure`; that setting
 * governs what the /api/secrets/* routes hand to the browser, not server-internal reads.
 */
function readCustomSecrets(directories) {
    const manager = new SecretManager(directories);
    const state = manager.getSecretState();
    const entries = state?.[SECRET_KEYS.CUSTOM];
    if (!Array.isArray(entries)) return [];

    return entries.map(entry => ({
        id: entry.id,
        label: entry.label,
        active: Boolean(entry.active),
        value: manager.readSecret(SECRET_KEYS.CUSTOM, entry.id) || '',
    }));
}

/**
 * Asks the provider whether a key authenticates.
 * @returns {Promise<'valid'|'invalid'|'unreachable'>}
 *   'unreachable' is deliberately distinct from 'invalid': a timeout or 5xx must never
 *   be mistaken for a dead key, because callers delete keys on 'invalid'.
 */
async function validateKey(value) {
    const fp = fingerprint(value);
    const cached = statusCache.get(fp);
    if (cached && (Date.now() - cached.at) < CACHE_TTL_MS && cached.status !== 'unreachable') {
        return cached.status;
    }

    let status;
    try {
        const response = await fetchWithTimeout(`${API_BASE}${VALIDATE_PATH}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${value}` },
        });
        // KEYGUARD CONFLICT WATCH: keep authentication rejection separate from
        // provider failure. Popup eligibility and dead-key pruning both trust this
        // distinction. Do not fold 429/5xx/timeout into `invalid`.
        //
        // Provider contract to confirm before release: every tested rejected or
        // disabled token returned 401. If a CDN/WAF can return 403 for an outage or
        // temporary block, remove 403 from `invalid` and let it become `unreachable`.
        if (response.status === 200) status = 'valid';
        else if (response.status === 401 || response.status === 403) status = 'invalid';
        else status = 'unreachable';   // 5xx / rate limit / anything ambiguous
    } catch {
        status = 'unreachable';        // offline, DNS, timeout
    }

    statusCache.set(fp, { status, at: Date.now() });
    return status;
}

/**
 * POST /api/weyland-keyguard/inspect
 * Body: { validate?: boolean }   (default true)
 *
 * Returns the user's custom-API secrets as IDs plus a verdict. With validate:false it
 * does zero network I/O — that mode exists so the client can repair connection profiles
 * after a key write without spending a request.
 *
 * Validation order is deliberate: the ACTIVE key first, and if it passes we stop. In the
 * healthy steady state that is exactly one outbound call per launch.
 */
router.post('/inspect', async (request, response) => {
    try {
        const secrets = readCustomSecrets(request.user.directories);
        const shouldValidate = request.body?.validate !== false;

        const summary = secrets.map(s => ({
            id: s.id,
            label: s.label,
            active: s.active,
            isWeyland: isWeylandKey(s.value),
            status: 'unchecked',
        }));

        const activeSecret = secrets.find(s => s.active) ?? null;
        const activeId = activeSecret?.id ?? null;
        // Every custom-endpoint provider (ElectronHub, etc.) shares this one secret store.
        // A client must know whether the CURRENTLY active secret is a Weyland key before
        // deciding whether to touch it — activating a Weyland key over a user's deliberately
        // chosen ElectronHub key would silently hijack their provider choice. `null` here
        // means "nothing is active at all", which is distinct from "active, but not
        // Weyland" — the former is safe to fill in, the latter must not be touched.
        // KEYGUARD CONFLICT WATCH: this is intentionally tri-state. `false` means a
        // different custom provider is deliberately active; `null` means no provider
        // key is active and is safe to fill. Do not coerce this to Boolean.
        const activeIsWeyland = activeSecret ? isWeylandKey(activeSecret.value) : null;
        let workingId = null;
        let reachable = true;

        if (shouldValidate) {
            // Newest last in the array (writeSecret appends), so newest-first here.
            const weyland = secrets.filter(s => isWeylandKey(s.value)).reverse();
            const active = weyland.find(s => s.active);
            const ordered = active ? [active, ...weyland.filter(s => s !== active)] : weyland;

            let checked = 0;
            for (const secret of ordered) {
                if (checked >= MAX_VALIDATIONS_PER_CALL) break;
                checked++;

                const status = await validateKey(secret.value);
                const row = summary.find(r => r.id === secret.id);
                if (row) row.status = status;

                if (status === 'unreachable') { reachable = false; break; }
                if (status === 'valid') { workingId = secret.id; break; }
            }
        }

        return response.json({
            ok: true,
            validated: shouldValidate,
            reachable,
            activeId,
            activeIsWeyland,
            workingId,
            secrets: summary,
        });
    } catch (error) {
        console.error('[Weyland-KeyGuard] inspect failed:', error?.message || error);
        return response.status(500).json({ ok: false, error: 'inspect_failed' });
    }
});

/**
 * POST /api/weyland-keyguard/exchange
 * Body: { id?: string }   (defaults to the active secret)
 *
 * Swaps a dead key for the user's new one, entirely server-side. This is the only path
 * that works for the shipped install base: with `allowKeysExposure: false` the browser
 * cannot read the old key to send it anywhere, and users who set their key through
 * SillyTavern's own API field have no `HMKey` global for the client to fall back on.
 *
 * On success the new key is written through SecretManager (same store, same shape as
 * /secret-write) and returned so the caller can set `HMKey`.
 */
router.post('/exchange', async (request, response) => {
    try {
        const manager = new SecretManager(request.user.directories);
        const secrets = readCustomSecrets(request.user.directories);
        const requestedId = typeof request.body?.id === 'string' ? request.body.id : null;

        // `api_key_custom` is shared by every custom provider. If ElectronHub (or any
        // other non-Weyland provider) is active while a dead Weyland key is stored, the
        // migration popup still needs to exchange the Weyland key. Never default to the
        // globally active foreign secret; prefer the active Weyland secret, otherwise
        // the newest stored Weyland secret (writeSecret appends).
        // KEYGUARD CONFLICT WATCH: api_key_custom is shared by HelixMind,
        // ElectronHub, and other custom providers. Never default exchange to the
        // globally active secret: if ElectronHub is active, migration still needs the
        // stored Weyland key. Preserve active-Weyland, then newest-Weyland ordering.
        const source = requestedId
            ? secrets.find(s => s.id === requestedId)
            : secrets.find(s => s.active && isWeylandKey(s.value))
                || [...secrets].reverse().find(s => isWeylandKey(s.value));

        if (!source || !isWeylandKey(source.value)) {
            return response.status(400).json({ ok: false, error: 'no_key', message: 'No Weyland Tavern API key was found to update.' });
        }

        let swapResponse;
        try {
            swapResponse = await fetchWithTimeout(SWAP_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldKey: source.value }),
            });
        } catch {
            return response.status(503).json({ ok: false, error: 'unreachable', message: 'Could not reach the update service. Please check your connection and try again.' });
        }

        let body = null;
        try { body = await swapResponse.json(); } catch { body = null; }

        if (!swapResponse.ok || !body || typeof body.newKey !== 'string' || !body.newKey.trim()) {
            const message = (body && typeof body.error === 'string' && body.error.trim())
                ? body.error.trim()
                : 'The key update could not be completed. Please open a ticket for help.';
            return response.status(swapResponse.status === 409 ? 409 : 502).json({ ok: false, error: 'swap_failed', message });
        }

        const newKey = body.newKey.trim();
        const newId = manager.writeSecret(SECRET_KEYS.CUSTOM, newKey, 'api_key_custom');

        // The freshly issued key is known-good; seed the cache so the follow-up inspect
        // doesn't spend another request confirming what we just learned.
        statusCache.set(fingerprint(newKey), { status: 'valid', at: Date.now() });

        return response.json({ ok: true, newKey, newId });
    } catch (error) {
        console.error('[Weyland-KeyGuard] exchange failed:', error?.message || error);
        return response.status(500).json({ ok: false, error: 'exchange_failed', message: 'The key update could not be completed. Please open a ticket for help.' });
    }
});

/**
 * POST /api/weyland-keyguard/quota
 * Body: { }
 *
 * Token-scoped usage for the ACTIVE key — the per-user number (out of the user's own
 * 20/50/125/500), NOT the shared 12,000 account pool. `/v1/usage/quota` reports the
 * account pool and is the wrong endpoint for a per-user display; `/v1/usage` is scoped
 * to the calling token and returns a `total` for the filtered range.
 *
 * NOT wired to anything yet. Provided because the usage trackers are blocked by exactly
 * the same CORS wall and will need a server-side path; see README-BACKEND.md.
 */
router.post('/quota', async (request, response) => {
    try {
        const secrets = readCustomSecrets(request.user.directories);
        const active = secrets.find(s => s.active);
        if (!active || !isWeylandKey(active.value)) {
            return response.status(400).json({ ok: false, error: 'no_key' });
        }

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const url = `${API_BASE}${USAGE_PATH}?since=${encodeURIComponent(since)}&limit=1`;

        const upstream = await fetchWithTimeout(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${active.value}` },
        });

        if (!upstream.ok) {
            return response.status(upstream.status).json({ ok: false, error: 'upstream' });
        }

        const body = await upstream.json();
        return response.json({ ok: true, used: Number(body?.total) || 0 });
    } catch (error) {
        console.error('[Weyland-KeyGuard] quota failed:', error?.message || error);
        return response.status(500).json({ ok: false, error: 'quota_failed' });
    }
});
