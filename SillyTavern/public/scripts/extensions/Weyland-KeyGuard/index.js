// Weyland KeyGuard — client side.
//
// WHAT IT FIXES
// -------------
// SillyTavern stores secrets as an ARRAY per key. `writeSecret` always APPENDS a new
// entry with a fresh uuid and deactivates the rest — it never overwrites (see
// src/endpoints/secrets.js). Separately, every saved Connection Profile pins a secret by
// uuid in its `secret-id` field, and applying a profile replays that field, calling
// rotateSecret() (see extensions/connection-manager/index.js).
//
// Net effect: changing your API key orphans every profile saved before the change, and
// the next profile switch silently re-activates the OLD key. Weyland Router applies a
// profile on every route swap, so Router users hit it constantly — but manual profile
// switching does exactly the same thing. This is upstream behaviour, not a Weyland bug,
// and it recurs on EVERY key change unless something repairs the pins.
//
// WHAT THIS DOES
//   1. Once per launch (throttled), asks the server which stored key actually works.
//   2. If the active key is dead and another one works, activates the working one.
//   3. Repoints Weyland connection profiles at that key, so switching profiles — and
//      therefore Router — can never revert it again.
//   4. Optionally removes keys the provider has definitively rejected, but only when a
//      known-good key exists.
//   5. Publishes a verdict the migration popup consumes, so users whose key already
//      works are never prompted to re-enter it.
//
// COST: one outbound provider request in the healthy steady state. Recovery can inspect
// additional stored Weyland keys, but the server hard-caps a pass at six validations.
// None occur inside the throttle window. No polling or background loop. The validation
// endpoint is metadata-only and does not consume the user's message allowance (verified:
// four calls moved global_rpd.used by 0).

import { eventSource, event_types, saveSettingsDebounced, getRequestHeaders } from '../../../script.js';
import { readSecretState, rotateSecret, deleteSecret, findSecret, SECRET_KEYS } from '../../secrets.js';

const MODULE_NAME = 'Weyland-KeyGuard';
const LOG = '[Weyland-KeyGuard]';

// Only profiles pointing at the live Weyland API are touched. Every custom-endpoint
// provider shares the one `api_key_custom` store, so a blanket repair would hand a
// Weyland key to somebody's unrelated provider profile.
const TARGET_HOST = 'helixmind.online';
const DEFAULT_PROFILE_NAME = 'HelixMind (Ratchet\'s API)';

/** Exact-host match so lookalike providers such as nothelixmind.online are untouched. */
function isTargetProfileUrl(value) {
    try {
        // KEYGUARD CONFLICT WATCH: use an exact parsed hostname. Substring matching
        // also matches hosts such as `nothelixmind.online` and can repin a foreign
        // provider profile to a Weyland secret.
        return new URL(String(value)).hostname.toLowerCase() === TARGET_HOST;
    } catch {
        return false;
    }
}

function isTargetProfile(profile) {
    const url = String(profile?.['api-url'] || '').trim();
    if (url) return isTargetProfileUrl(url);

    // The shipped default profile has this stable name. Use it only as a fallback when
    // the URL is absent; renamed URL-less profiles remain ambiguous and are left alone.
    return profile?.name === DEFAULT_PROFILE_NAME;
}

// One check per hour per install is plenty: launches are infrequent, and the failure
// this guards against only appears when a key changes.
const THROTTLE_MS = 60 * 60 * 1000;

/** Re-entrancy guard: our own rotate/delete calls emit the events we listen for. */
let busy = false;
let ranThisSession = false;

/** Resolved with the verdict once the first inspection finishes (or fails). */
let resolveReady;
const ready = new Promise((resolve) => { resolveReady = resolve; });

/** @typedef {{ hasKey: boolean, working: boolean, workingId: string|null, reachable: boolean, checked: boolean }} Verdict */

/** @type {Verdict} */
let verdict = { hasKey: false, working: false, workingId: null, reachable: true, checked: false };

function getCtx() {
    return globalThis.SillyTavern?.getContext?.() ?? null;
}

function getSettings(ctx) {
    if (!ctx?.extensionSettings) return null;
    const existing = ctx.extensionSettings[MODULE_NAME];
    if (!existing || typeof existing !== 'object') {
        ctx.extensionSettings[MODULE_NAME] = {
            enabled: true,
            pruneDeadKeys: true,
            backfillHmKey: true,
            lastCheckAt: 0,
        };
    }
    return ctx.extensionSettings[MODULE_NAME];
}

/** Calls the server helper. Returns null on any failure — never throws. */
async function inspect(validate) {
    try {
        const response = await fetch('/api/weyland-keyguard/inspect', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ validate }),
        });
        if (!response.ok) {
            console.warn(`${LOG} inspect returned ${response.status}`);
            return null;
        }
        return await response.json();
    } catch (error) {
        console.warn(`${LOG} inspect failed:`, error);
        return null;
    }
}

/**
 * Repoints Weyland connection profiles at `targetId`.
 * Profiles with no `api-url` are repaired only when their name exactly matches the
 * shipped default Weyland profile; all other URL-less profiles are left alone.
 * @returns {{ changed: number, unknown: string[] }}
 */
function repairProfiles(ctx, targetId) {
    const profiles = ctx?.extensionSettings?.connectionManager?.profiles;
    if (!Array.isArray(profiles) || !targetId) return { changed: 0, unknown: [] };

    let changed = 0;
    const unknown = [];

    for (const profile of profiles) {
        if (!profile || typeof profile !== 'object') continue;

        const url = String(profile['api-url'] || '').trim();
        if (!url && !isTargetProfile(profile)) {
            // Only worth flagging if it actually pins a secret; otherwise it is inert.
            if (profile['secret-id']) unknown.push(profile.name || '(unnamed)');
            continue;
        }
        if (!isTargetProfile(profile)) continue;

        // Explicitly pin the working key, even for a profile with no pin at all.
        // "No pin" is NOT safe to leave alone: applying it does not touch the active
        // secret, so it silently carries over WHATEVER is currently active — which, on
        // a multi-provider install, can be a different provider's key. A profile whose
        // api-url is helixmind.online must always resolve to a Weyland key, regardless
        // of what else is active when it gets applied.
        if (profile['secret-id'] === targetId) continue;

        profile['secret-id'] = targetId;
        changed++;
    }

    if (changed > 0) saveSettingsDebounced();
    return { changed, unknown };
}

/**
 * Keeps the `HMKey` global in step with the active key. WeyPhone's battery meter and the
 * WT-HelixUsage tracker both read HMKey rather than the secret store, so a user who set
 * their key through SillyTavern's own API field (which never writes HMKey) sees
 * "Key Error" even though their key is fine.
 *
 * Best-effort by design: findSecret() returns null when `allowKeysExposure` is false —
 * which is the shipped default — and we do NOT work around that. Those users get HMKey
 * populated the moment they go through the migration popup, which returns the key.
 */
async function backfillHmKey(ctx, secretId) {
    try {
        const value = await findSecret(SECRET_KEYS.CUSTOM, secretId);
        if (!value || typeof value !== 'string') return false;

        const current = ctx?.variables?.global?.get?.('HMKey');
        if (current === value) return false;

        await ctx.executeSlashCommandsWithOptions(`/setglobalvar key=HMKey ${value}`);
        return true;
    } catch (error) {
        console.warn(`${LOG} HMKey backfill skipped:`, error);
        return false;
    }
}

/**
 * Removes keys the provider definitively rejected (HTTP 401/403 only — never a timeout
 * or 5xx), and only when a known-good key exists, so a user is never left with none.
 */
async function pruneDeadKeys(result, workingId) {
    if (!workingId) return 0;

    const dead = (result.secrets || []).filter(s => s.isWeyland && s.status === 'invalid' && s.id !== workingId);
    let removed = 0;
    for (const secret of dead) {
        try {
            await deleteSecret(SECRET_KEYS.CUSTOM, secret.id);
            removed++;
        } catch (error) {
            console.warn(`${LOG} could not remove a dead key:`, error);
        }
    }
    return removed;
}

/** Full pass: validate, heal, repair, publish a verdict. */
async function runFullCheck(force = false) {
    const ctx = getCtx();
    const settings = getSettings(ctx);
    if (!ctx || !settings || settings.enabled === false) return;
    if (busy) return;

    const since = Date.now() - (Number(settings.lastCheckAt) || 0);
    if (!force && since < THROTTLE_MS) {
        // KEYGUARD CONFLICT WATCH: the persisted verdict is required here. This module
        // is recreated on reload, so returning the in-memory default would hide a real
        // migration popup for the rest of the throttle window.
        // Throttled: skip the network call, but do NOT publish the in-memory default.
        // `verdict` resets to {checked:false, ...} on every page load, since this module
        // is re-evaluated fresh each time. Without this, a user whose key is genuinely
        // broken would see the popup on the first load after it breaks, then see it go
        // silent on any reload within the throttle window — not because anything was
        // fixed, but because the reset default collided with the throttle. The throttle
        // exists to limit provider requests, not to hide a real, still-valid verdict.
        if (settings.lastVerdict && typeof settings.lastVerdict === 'object') {
            verdict = settings.lastVerdict;
        }
        resolveReady(verdict);
        return;
    }

    busy = true;
    try {
        const result = await inspect(true);
        if (!result?.ok) {
            // Server unavailable (older install, endpoint not mounted). Publish an
            // explicitly "unknown" verdict; consumers must not act on it.
            verdict = { hasKey: false, working: false, workingId: null, reachable: false, checked: false };
            return;
        }

        settings.lastCheckAt = Date.now();

        const weyland = (result.secrets || []).filter(s => s.isWeyland);
        verdict = {
            hasKey: weyland.length > 0,
            working: Boolean(result.workingId),
            workingId: result.workingId || null,
            reachable: result.reachable !== false,
            checked: true,
        };
        // Persist so a throttled reload (see above) reflects this real result, not the
        // fresh-page-load default.
        settings.lastVerdict = verdict;

        if (!result.workingId) {
            // Nothing works, or the provider was unreachable. Do not touch anything:
            // rotating between dead keys helps nobody and pruning could take the last one.
            if (verdict.reachable) console.info(`${LOG} no working key found; leaving settings untouched.`);
            saveSettingsDebounced();
            return;
        }

        // 1. Make the working key the active one — but ONLY if the currently active secret
        //    is itself a Weyland key, or nothing is active at all. `api_key_custom` is
        //    shared across every custom-endpoint provider (ElectronHub, etc.), so if the
        //    active secret belongs to a different provider, that is the user's deliberate
        //    choice — rotating it to a Weyland key just because one happens to validate
        //    would silently hijack which provider they are using. `activeIsWeyland` is
        //    `null` (not `false`) when nothing is active at all, which IS safe to fill in —
        //    see weyland-keyguard.js for why those two states must not be conflated.
        // KEYGUARD CONFLICT WATCH: do not simplify this to an id mismatch check.
        // SillyTavern shares api_key_custom across providers, and doing so silently
        // switched live ElectronHub users to Weyland during regression testing.
        const safeToActivate = result.activeIsWeyland === true || result.activeIsWeyland === null;
        if (safeToActivate && result.activeId !== result.workingId) {
            console.info(`${LOG} active key was not the working one — switching.`);
            await rotateSecret(SECRET_KEYS.CUSTOM, result.workingId);
            await readSecretState();
        } else if (!safeToActivate && result.activeId !== result.workingId) {
            console.info(`${LOG} a working Weyland key exists but a different provider is active — leaving it as-is.`);
        }

        // 2. Stop profiles (and therefore Router) from reverting it.
        const { changed, unknown } = repairProfiles(ctx, result.workingId);
        if (changed > 0) console.info(`${LOG} repaired ${changed} connection profile(s).`);
        if (unknown.length > 0) {
            console.info(`${LOG} ${unknown.length} profile(s) pin a key but have no server URL; left alone: ${unknown.join(', ')}`);
        }

        // 3. Keep HMKey-based consumers (WeyPhone, usage tracker) working.
        if (settings.backfillHmKey !== false) await backfillHmKey(ctx, result.workingId);

        // 4. Clear out keys the provider has rejected.
        if (settings.pruneDeadKeys !== false) {
            const removed = await pruneDeadKeys(result, result.workingId);
            if (removed > 0) {
                console.info(`${LOG} removed ${removed} rejected key(s).`);
                await readSecretState();
            }
        }

        saveSettingsDebounced();
    } finally {
        busy = false;
        resolveReady(verdict);
    }
}

/**
 * Cheap pass after a key write/rotation: re-pin profiles to whatever is active now.
 * Deliberately does NO network I/O — the user just chose a key, and validating it here
 * would spend a request on every keystroke-y save. The next launch validates.
 */
async function runProfileSync() {
    const ctx = getCtx();
    const settings = getSettings(ctx);
    if (!ctx || !settings || settings.enabled === false) return;
    if (busy) return;

    busy = true;
    try {
        const result = await inspect(false);   // classification only, no provider call
        if (!result?.ok || !result.activeId) return;

        // Only re-pin when the newly active secret is actually a Weyland key; otherwise
        // the user just switched to a different provider and profiles must not follow.
        const active = (result.secrets || []).find(s => s.id === result.activeId);
        if (!active?.isWeyland) return;

        const { changed } = repairProfiles(ctx, result.activeId);
        if (changed > 0) console.info(`${LOG} re-pinned ${changed} profile(s) after a key change.`);

        if (settings.backfillHmKey !== false) await backfillHmKey(ctx, result.activeId);
    } finally {
        busy = false;
    }
}

/** Debounce: a single user action can emit several secret events in a row. */
let syncTimer = null;
function scheduleProfileSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { void runProfileSync(); }, 750);
}

function onSecretEvent(key) {
    if (key && key !== SECRET_KEYS.CUSTOM) return;
    if (busy) return;   // our own rotate/delete emitted this
    scheduleProfileSync();
}

jQuery(() => {
    const start = () => {
        if (ranThisSession) return;
        ranThisSession = true;
        void runFullCheck();
    };

    eventSource.on(event_types.APP_READY, start);
    // Backstop if APP_READY fired before this handler registered; start() is idempotent.
    setTimeout(start, 5000);

    eventSource.on(event_types.SECRET_WRITTEN, onSecretEvent);
    eventSource.on(event_types.SECRET_ROTATED, onSecretEvent);
    eventSource.on(event_types.SECRET_DELETED, onSecretEvent);
});

// Consumed by Weyland-HelixMigration to decide whether to show the migration popup.
// `ready` resolves once (or immediately, inside the throttle window).
globalThis.WeylandKeyGuard = {
    ready,
    getVerdict: () => verdict,
    recheck: () => runFullCheck(true),
};
