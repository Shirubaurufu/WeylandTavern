// Weyland Tavern API Migration Notice
//
// A one-time modal shown to EXISTING users after the API backend migration, telling them
// their current key no longer works and offering to update it. New users (no HMKey yet)
// never see it. Persistence uses extensionSettings + saveSettingsDebounced, mirroring the
// house "show once" convention. User-facing copy never names the provider — to the user
// it is simply "Weyland Tavern's API".

import { eventSource, event_types, saveSettingsDebounced } from '../../../script.js';
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

/** The popup was dismissed (bypass / already-redeemed) — don't auto-show it again. */
function markSeen(ctx) {
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
                   <strong>Your current API key no longer works.</strong></p>
                <p class="whm-sub">Update it now to keep chatting — one click is usually all it takes.</p>

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
                        Messages can't be sent until your API key is updated. Bypass anyway?
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
        const oldKey = getHmKey(ctx);
        if (!oldKey) {
            setStatus(overlay, 'No existing key was found to update. Use "I have my new key" instead.', 'error');
            return;
        }
        setActionsDisabled(overlay, true);
        setStatus(overlay, 'Updating your key…', 'info');

        const result = await exchangeKey(oldKey);
        if (result.ok) {
            const wrote = await writeNewKey(ctx, result.newKey);
            if (wrote) {
                finishSuccess();
            } else {
                handleWriteFailure();
                setActionsDisabled(overlay, false);
            }
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

/** Decide, once, whether this user should see the migration notice. */
function maybeShowMigrationPopup() {
    if (handled) return;
    const ctx = SillyTavern?.getContext?.();
    if (!ctx || !ctx.extensionSettings) return; // settings not ready yet — wait for a later trigger
    handled = true;

    const settings = getSettings(ctx);
    const hasKey = getHmKey(ctx) !== null;

    // Classify this install ONCE, on the extension's first-ever run here. A key already
    // present means the install predates the migration (an existing user with an old key)
    // → eligible. A fresh install has no key yet at first run, so it is marked ineligible
    // forever: new subscribers get a working key at setup and must never see this notice,
    // which lets the extension live in the repo permanently without nagging them later.
    if (settings.migrationEligible === undefined) {
        settings.migrationEligible = hasKey;
        saveSettingsDebounced();
    }

    if (settings.migrationEligible && hasKey && !settings.migrationNoticeSeen) {
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
            <span>Your Weyland Tavern API key needs updating.</span>
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
        const oldKey = getHmKey(ctx);
        if (!oldKey) {
            showStatus('No existing key found. Use "I have a new key" to paste one.', 'error');
            return;
        }
        setDisabled(true);
        showStatus('Updating your key…', 'info');
        const result = await exchangeKey(oldKey);
        if (result.ok) {
            if (await writeNewKey(ctx, result.newKey)) {
                finishSuccess();
            } else {
                showStatus('Your key could not be saved. Please open a ticket for help.', 'error');
                setDisabled(false);
            }
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

/** Inject the API-screen converter once, for eligible installs that haven't migrated yet. */
function maybeInjectConverter() {
    if (converterInjected) return;
    const ctx = SillyTavern?.getContext?.();
    if (!ctx || !ctx.extensionSettings) return;
    const settings = getSettings(ctx);
    if (!settings.migrationEligible || settings.migrationCompleted) return;
    converterInjected = true;
    injectConverter(ctx);
}

jQuery(() => {
    // APP_READY fires once settings + globals are loaded, so HMKey is trustworthy by then.
    // Popup first (it also classifies the install), then the API-screen converter.
    const run = () => { maybeShowMigrationPopup(); maybeInjectConverter(); };
    eventSource.on(event_types.APP_READY, run);
    // Backstop in case APP_READY fired before this handler registered; both calls are idempotent.
    setTimeout(run, 5000);
});
