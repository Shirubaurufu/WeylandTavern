// Weyland Tavern API Migration Notice
//
// A one-time modal for the original migration cohort plus users whose stored Weyland key
// is now provider-rejected. A cohort key can still work, so the copy deliberately says it
// MAY need updating. New/current users without a positive historical hint remain silent
// unless the provider rejects their stored key.

import { eventSource, event_types, saveSettingsDebounced, getRequestHeaders } from '../../../script.js';
import { readSecretState } from '../../secrets.js';
import { exchangeKey } from './lib/migrateKey.js';

const MODULE_NAME = 'Weyland-HelixMigration';
const OVERLAY_ID = 'whm-overlay';
const CONVERTER_ID = 'whm-converter';

// Discord ticket channel for anyone the automatic exchange can't help.
const DISCORD_TICKET_URL = 'https://discord.com/channels/1336271839160307813/1366309366764011610/1366315322130567189';

// Guards against showing more than once per session (the persisted flag guards across
// sessions). Set as soon as we've made a show / don't-show decision at app-ready time.
let handled = false;

/** Ensure our settings bucket exists and return it. */
function getSettings(ctx) {
    const existing = ctx.extensionSettings[MODULE_NAME];
    if (!existing || typeof existing !== 'object') {
        ctx.extensionSettings[MODULE_NAME] = {};
    }
    return ctx.extensionSettings[MODULE_NAME];
}

/**
 * Preserve the original extension's positive rollout classification as a historical
 * cohort hint. `false` is not evidence that a key is current: API-screen users never had
 * HMKey and were therefore classified false even when they held a legacy key.
 */
function getLegacyCohortHint(settings) {
    if (settings.legacyCohortHint === true) return true;
    if (settings.migrationEligible === true) {
        // KEYGUARD CONFLICT WATCH: only migrate the positive value. Do not infer anything
        // from false, and keep the legacy property for rollback/production diagnostics.
        settings.legacyCohortHint = true;
        saveSettingsDebounced();
        return true;
    }
    return false;
}

/** The popup was dismissed (bypass / already-redeemed) — don't auto-show it again. */
function markSeen(ctx) {
    // KEYGUARD CONFLICT WATCH: `seen` and `completed` are intentionally different.
    // Bypass/already-redeemed stops the modal but must leave the API-screen converter
    // available; only markCompleted retires both surfaces.
    getSettings(ctx).migrationNoticeSeen = true;
    saveSettingsDebounced();
}

/**
 * A working new key was actually written on this install. Retires BOTH the popup and the
 * API-screen converter. Distinct from markSeen: a user who bypasses stops seeing the popup
 * but keeps the converter, which is exactly who the converter exists for.
 */
function markCompleted(ctx) {
    const settings = getSettings(ctx);
    settings.migrationNoticeSeen = true;
    settings.migrationCompleted = true;
    saveSettingsDebounced();
    document.getElementById(CONVERTER_ID)?.remove();
}

/** The old key the tracker stored as a global variable (null when none / new user). */
function getHmKey(ctx) {
    const key = ctx?.variables?.global?.get?.('HMKey');
    return (typeof key === 'string' && key.trim() !== '') ? key.trim() : null;
}

/**
 * Write a new key exactly the way the WT-HelixUsage tracker does — one piped slash command
 * that sets the HMKey global and the api_key_custom secret together. Returns false when the
 * secret write failed (the last command's pipe value is an empty string on failure), so the
 * caller can avoid marking the notice "seen" on a botched write.
 */
async function writeNewKey(ctx, newKey) {
    const result = await ctx.executeSlashCommandsWithOptions(
        `/setglobalvar key=HMKey ${newKey} | /secret-write quiet=true label=api_key_custom key=api_key_custom ${newKey}`,
    );
    return Boolean(result?.pipe);
}


/**
 * Ask the server to perform the exchange.
 *
 * WHY SERVER-SIDE: the browser cannot do this for most users. `allowKeysExposure` is
 * false in the shipped install base, so findSecret() returns null and the key is masked
 * — and users who set their key through SillyTavern's own API field never had the HMKey
 * global the old client-side path depended on. Those two groups could never complete an
 * automatic swap. The server reads the key straight from the secret store, so the path
 * works regardless of how the key was originally entered.
 *
 * @returns {Promise<{ok:true,newKey:string}|{ok:false,status:number|null,error:string}|null>}
 *          null means the endpoint is absent (older install) -> caller falls back.
 */
async function exchangeViaServer() {
    let response;
    try {
        response = await fetch('/api/weyland-keyguard/exchange', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({}),
        });
    } catch {
        return { ok: false, status: null, error: 'Could not reach the update service. Please check your connection and try again.' };
    }

    if (response.status === 404) return null;   // endpoint not mounted on this install

    let body = null;
    try { body = await response.json(); } catch { body = null; }

    if (response.ok && body?.ok && typeof body.newKey === 'string' && body.newKey.trim()) {
        return { ok: true, newKey: body.newKey.trim() };
    }
    return {
        ok: false,
        status: response.status,
        error: (body && typeof body.message === 'string' && body.message.trim())
            ? body.message.trim()
            : 'The key update could not be completed. Please open a ticket for help.',
    };
}

/**
 * Run the automatic update. Prefers the server path; falls back to the original
 * client-side exchange when the endpoint is missing AND an HMKey is available.
 * @returns {Promise<{ok:true}|{ok:false,status:number|null,error:string}>}
 */
async function runAutomaticUpdate(ctx) {
    // KEYGUARD CONFLICT WATCH: server-first is what makes migration work with the
    // shipped allowKeysExposure:false setting and for API-screen users without HMKey.
    // Fall back only when the endpoint is genuinely absent (exchangeViaServer returns
    // null for 404), not after a server/swap failure, or one click could exchange twice.
    const server = await exchangeViaServer();

    if (server) {
        if (!server.ok) return server;
        // The server already wrote the secret. Only HMKey is left, which WeyPhone and the
        // usage tracker read; writing the secret again here would append a duplicate.
        await ctx.executeSlashCommandsWithOptions(`/setglobalvar key=HMKey ${server.newKey}`);
        await readSecretState();
        return { ok: true };
    }

    const oldKey = getHmKey(ctx);
    if (!oldKey) {
        return { ok: false, status: null, error: 'No existing key was found to update. Use "I have my new key" instead.' };
    }
    const result = await exchangeKey(oldKey);
    if (!result.ok) return result;
    return (await writeNewKey(ctx, result.newKey))
        ? { ok: true }
        : { ok: false, status: null, error: 'Your key could not be saved. Please open a ticket for help.' };
}

/**
 * KeyGuard publishes whether the user's stored key actually works. We wait for it rather
 * than guessing from HMKey, which is what previously locked out everyone who set their
 * key through SillyTavern's own API field.
 */
async function waitForKeyGuard(timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let guard = globalThis.WeylandKeyGuard;

    // KEYGUARD CONFLICT WATCH: extensions import concurrently. APP_READY can reach this
    // module a fraction before KeyGuard publishes its global readiness promise. A single
    // immediate lookup made that harmless ordering race suppress migration for the whole
    // launch. This is a bounded startup wait only, not a background poll.
    while (!guard?.ready && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100));
        guard = globalThis.WeylandKeyGuard;
    }
    if (!guard?.ready) return null;

    const remainingMs = Math.max(0, deadline - Date.now());
    return Promise.race([
        guard.ready,
        new Promise(resolve => setTimeout(() => resolve(guard.getVerdict?.() ?? null), remainingMs)),
    ]);
}

function closeOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
}

function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'whm-overlay';
    overlay.innerHTML = `
        <div class="whm-window" role="dialog" aria-modal="true" aria-labelledby="whm-title">
            <div class="whm-header">
                <i class="fa-solid fa-key"></i>
                <h3 id="whm-title">Weyland Tavern API Update</h3>
            </div>
            <div class="whm-body">
                <p>Weyland Tavern's API upgraded its backend for security.
                   <strong>Your API key may need updated.</strong></p>
                <p class="whm-sub">Update it now to move to the current key system — one click is usually all it takes.</p>
                <p class="whm-sub">If you already got your new API key, you can safely bypass this message.</p>

                <div class="whm-status" id="whm-status" hidden></div>

                <div class="whm-actions" id="whm-actions">
                    <button class="menu_button whm-btn whm-btn-primary" id="whm-auto">
                        <i class="fa-solid fa-wand-magic-sparkles"></i><span>Update my key automatically</span>
                    </button>
                    <button class="menu_button whm-btn" id="whm-ticket">
                        <i class="fa-brands fa-discord"></i><span>Get my new key</span>
                    </button>
                    <button class="menu_button whm-btn" id="whm-manual">
                        <i class="fa-solid fa-keyboard"></i><span>I have my new key</span>
                    </button>
                    <button class="menu_button whm-btn whm-btn-ghost" id="whm-bypass">
                        <span>Bypass for now</span>
                    </button>
                </div>

                <div class="whm-manual-row" id="whm-manual-row" hidden>
                    <input type="text" id="whm-key-input" class="text_pole whm-key-input"
                           placeholder="helix-..." autocomplete="off" spellcheck="false">
                    <button class="menu_button whm-btn-primary" id="whm-key-submit"><span>Save key</span></button>
                </div>

                <div class="whm-bypass-row" id="whm-bypass-row" hidden>
                    <p class="whm-warn">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        You can keep using Weyland Tavern for now. Bypass this reminder?
                    </p>
                    <div class="whm-bypass-actions">
                        <button class="menu_button" id="whm-bypass-cancel"><span>Go back</span></button>
                        <button class="menu_button whm-btn-ghost" id="whm-bypass-confirm"><span>Bypass anyway</span></button>
                    </div>
                </div>
            </div>
        </div>
    `;
    return overlay;
}

/** Show a status line. Uses textContent so server-supplied error text is never HTML. */
function setStatus(overlay, text, kind = 'info') {
    const el = overlay.querySelector('#whm-status');
    if (!el) return;
    el.textContent = text;
    el.className = `whm-status whm-status-${kind}`;
    el.hidden = false;
}

function setActionsDisabled(overlay, disabled) {
    overlay.querySelectorAll('#whm-actions button').forEach((b) => { b.disabled = disabled; });
}

function showMigrationPopup(ctx) {
    if (document.getElementById(OVERLAY_ID)) return;
    const overlay = buildOverlay();
    document.body.appendChild(overlay);

    const actions = overlay.querySelector('#whm-actions');
    const manualRow = overlay.querySelector('#whm-manual-row');
    const bypassRow = overlay.querySelector('#whm-bypass-row');
    const keyInput = overlay.querySelector('#whm-key-input');

    // Finish successfully: brief confirmation, then close.
    const finishSuccess = () => {
        markCompleted(ctx);
        setStatus(overlay, 'Updated! You\'re all set.', 'success');
        setTimeout(closeOverlay, 1200);
    };

    // Common "the write itself failed" handling (rare: server up but secret store rejected).
    const handleWriteFailure = () => {
        setStatus(overlay, 'Your key could not be saved. Please open a ticket for help.', 'error');
    };

    // 1) Automatic exchange (default path).
    overlay.querySelector('#whm-auto')?.addEventListener('click', async () => {
        setActionsDisabled(overlay, true);
        setStatus(overlay, 'Updating your key…', 'info');

        const result = await runAutomaticUpdate(ctx);
        if (result.ok) {
            finishSuccess();
            return;
        }

        // Failure: show the server's user-safe message; the ticket/manual buttons stay open below.
        setStatus(overlay, result.error, 'error');
        // If the key was already redeemed there's nothing more the popup can do — stop it
        // re-nagging on future launches. Any other failure stays retryable (flag unset).
        if (result.status === 409) {
            markSeen(ctx);
        }
        setActionsDisabled(overlay, false);
    });

    // 2) Open the Discord ticket channel. Does not complete migration → flag stays unset.
    overlay.querySelector('#whm-ticket')?.addEventListener('click', () => {
        window.open(DISCORD_TICKET_URL, '_blank', 'noopener');
    });

    // 3) Reveal the manual key input.
    overlay.querySelector('#whm-manual')?.addEventListener('click', () => {
        manualRow.hidden = false;
        keyInput?.focus();
    });

    const submitManual = async () => {
        const value = keyInput instanceof HTMLInputElement ? keyInput.value.trim() : '';
        if (!value) return;
        if (!value.includes('helix')) {
            setStatus(overlay, 'Please paste the entire key, including the "helix-" part.', 'error');
            return;
        }
        const wrote = await writeNewKey(ctx, value);
        if (wrote) {
            finishSuccess();
        } else {
            handleWriteFailure();
        }
    };
    overlay.querySelector('#whm-key-submit')?.addEventListener('click', () => { void submitManual(); });
    keyInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); void submitManual(); }
    });

    // 4) Bypass — informational warning only. NO client-side send blocking anywhere.
    overlay.querySelector('#whm-bypass')?.addEventListener('click', () => {
        actions.hidden = true;
        manualRow.hidden = true;
        bypassRow.hidden = false;
    });
    overlay.querySelector('#whm-bypass-cancel')?.addEventListener('click', () => {
        bypassRow.hidden = true;
        actions.hidden = false;
    });
    overlay.querySelector('#whm-bypass-confirm')?.addEventListener('click', () => {
        markSeen(ctx);
        closeOverlay();
    });
}

/**
 * Cached KeyGuard verdict for this launch, so the popup and the converter agree and we
 * never ask twice.
 * @type {{hasKey:boolean,working:boolean,checked:boolean,reachable:boolean}|null}
 */
let cachedVerdict = null;

/**
 * Decide whether this user should see the migration notice.
 *
 * Eligibility combines the original extension's positive rollout-cohort record with a
 * live server verdict. A rejected Weyland key is always a migration candidate. A working
 * key is a candidate only when the historical value was positive. `false` is not trusted:
 * API-screen users lacked HMKey and were incorrectly classified false regardless of key
 * generation. Without a provider generation endpoint, those functional keys cannot be
 * distinguished from functional current keys.
 */
async function maybeShowMigrationPopup() {
    if (handled) return;
    const ctx = SillyTavern?.getContext?.();
    if (!ctx || !ctx.extensionSettings) return; // settings not ready yet — a later trigger retries
    handled = true;

    const settings = getSettings(ctx);
    if (settings.migrationCompleted) return;

    const legacyCohortHint = getLegacyCohortHint(settings);

    cachedVerdict = await waitForKeyGuard();

    // No verdict at all (KeyGuard absent or the endpoint is missing on an older install):
    // stay silent. Nagging someone whose key might be perfectly fine is worse than
    // showing nothing, and a false alarm here is what erodes trust in the notice.
    if (!cachedVerdict?.checked) return;

    // The provider was unreachable during the check (network blip, brief outage) — every
    // key legitimately came back unconfirmed, not rejected. `working` is false here for a
    // reason that has nothing to do with the user's key, so treating it as "genuinely
    // dead" would tell someone to replace a perfectly good key over a transient failure.
    // Stay silent; the next launch (or the next un-throttled check) tries again.
    if (!cachedVerdict.reachable) return;

    // No Weyland key stored at all → a brand-new user mid-setup. Never show.
    if (!cachedVerdict.hasKey) return;

    // KEYGUARD CONFLICT WATCH: a working key is not proof of the new key generation.
    // Prompt working keys only when the original extension recorded a positive cohort
    // classification. Independently, a confirmed rejected key is always a candidate.
    const migrationCandidate = legacyCohortHint || !cachedVerdict.working;
    if (!migrationCandidate) return;

    if (!settings.migrationNoticeSeen) {
        showMigrationPopup(ctx);
    }
}

// ── API-screen backup converter ───────────────────────────────────────────────
// A small "your key needs updating" row injected into the API panel, for eligible users
// who bypassed the popup or never saw it. Same exchange + write flow, no modal. It stays
// until a successful migration (migrationCompleted) and is never shown to ineligible/new
// installs — so, like the popup, it can live in the repo permanently without nagging.

let converterInjected = false;

function buildConverter() {
    const row = document.createElement('div');
    row.id = CONVERTER_ID;
    row.className = 'whm-converter';
    row.innerHTML = `
        <div class="whm-converter-head">
            <i class="fa-solid fa-key"></i>
            <span>Your API key may need updated.</span>
        </div>
        <div class="whm-converter-actions">
            <button class="menu_button whm-btn-primary" id="whm-conv-auto"><span>Update automatically</span></button>
            <button class="menu_button" id="whm-conv-manual"><span>I have a new key</span></button>
            <button class="menu_button" id="whm-conv-ticket"><i class="fa-brands fa-discord"></i><span>Ticket</span></button>
        </div>
        <div class="whm-converter-manual" id="whm-conv-manual-row" hidden>
            <input type="text" id="whm-conv-key-input" class="text_pole whm-key-input"
                   placeholder="helix-..." autocomplete="off" spellcheck="false">
            <button class="menu_button whm-btn-primary" id="whm-conv-key-submit"><span>Save</span></button>
        </div>
        <div class="whm-converter-status whm-status" id="whm-conv-status" hidden></div>
    `;
    return row;
}

function wireConverter(ctx, row) {
    const status = row.querySelector('#whm-conv-status');
    const manualRow = row.querySelector('#whm-conv-manual-row');
    const keyInput = row.querySelector('#whm-conv-key-input');

    const showStatus = (text, kind = 'info') => {
        status.textContent = text;
        status.className = `whm-converter-status whm-status whm-status-${kind}`;
        status.hidden = false;
    };
    const setDisabled = (disabled) => {
        row.querySelectorAll('.whm-converter-actions button').forEach((b) => { b.disabled = disabled; });
    };
    // Show the confirmation briefly, then retire the row (markCompleted removes it).
    const finishSuccess = () => {
        showStatus('Updated! Your key is set.', 'success');
        setTimeout(() => markCompleted(ctx), 1200);
    };

    row.querySelector('#whm-conv-auto')?.addEventListener('click', async () => {
        setDisabled(true);
        showStatus('Updating your key…', 'info');
        const result = await runAutomaticUpdate(ctx);
        if (result.ok) {
            finishSuccess();
            return;
        }
        showStatus(result.error, 'error');
        if (result.status === 409) markSeen(ctx);
        setDisabled(false);
    });

    row.querySelector('#whm-conv-ticket')?.addEventListener('click', () => {
        window.open(DISCORD_TICKET_URL, '_blank', 'noopener');
    });

    row.querySelector('#whm-conv-manual')?.addEventListener('click', () => {
        manualRow.hidden = false;
        keyInput?.focus();
    });

    const submitManual = async () => {
        const value = keyInput instanceof HTMLInputElement ? keyInput.value.trim() : '';
        if (!value) return;
        if (!value.includes('helix')) {
            showStatus('Please paste the entire key, including the "helix-" part.', 'error');
            return;
        }
        if (await writeNewKey(ctx, value)) {
            finishSuccess();
        } else {
            showStatus('Your key could not be saved. Please open a ticket for help.', 'error');
        }
    };
    row.querySelector('#whm-conv-key-submit')?.addEventListener('click', () => { void submitManual(); });
    keyInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); void submitManual(); }
    });
}

function injectConverter(ctx, retries = 20) {
    if (document.getElementById(CONVERTER_ID)) return;
    const openaiApi = document.getElementById('openai_api');
    if (!openaiApi) {
        if (retries > 0) setTimeout(() => injectConverter(ctx, retries - 1), 500);
        return;
    }
    const row = buildConverter();
    openaiApi.after(row);
    wireConverter(ctx, row);
}

/**
 * Inject the API-screen converter for the same hybrid candidate group as the popup. This
 * keeps the backup path available after bypassing a working legacy-cohort notice.
 */
function maybeInjectConverter() {
    if (converterInjected) return;
    const ctx = SillyTavern?.getContext?.();
    if (!ctx || !ctx.extensionSettings) return;
    const settings = getSettings(ctx);
    if (settings.migrationCompleted) return;
    // Same reasoning as the popup gate above: an unreachable check must not be read as
    // "confirmed dead", or a network blip would tell the user to replace a working key.
    if (!cachedVerdict?.checked || !cachedVerdict.reachable) return;
    if (!cachedVerdict.hasKey) return;
    const migrationCandidate = getLegacyCohortHint(settings) || !cachedVerdict.working;
    if (!migrationCandidate) return;
    converterInjected = true;
    injectConverter(ctx);
}

jQuery(() => {
    // The popup decision now awaits KeyGuard's verdict, so this is async. The converter
    // runs afterwards and reuses the same cached verdict.
    const run = async () => {
        await maybeShowMigrationPopup();
        maybeInjectConverter();
    };
    eventSource.on(event_types.APP_READY, () => { void run(); });
    // Backstop in case APP_READY fired before this handler registered; both are idempotent.
    setTimeout(() => { void run(); }, 5000);
});
