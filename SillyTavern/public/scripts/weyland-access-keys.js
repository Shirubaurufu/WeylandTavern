// Weyland access keys, client side: the HelixMind API key and the Downloader's Paw Patrol password.
//
// Three places let a player enter a HelixMind key (first-time setup, the home screen, the API panel) and they all used to do
// their own thing: write whatever was typed, never check it, and "clear" by deleting the oldest stored key with the right
// label instead of the one in use. They share this now:
//   - the key must look like a HelixMind key (weyland-key-format.js);
//   - the provider is asked whether it works BEFORE anything is saved or removed (KeyGuard's /validate);
//   - the previous Weyland keys are removed only after the new one was saved and accepted, so a misclick or a typo can
//     never leave a player without a working key.
// The Paw Patrol key verified at setup or on the home screen is also handed to the Downloader (unlockDownloaderWithKey), so
// Alpha and Beta characters show up without typing the same password a second time.

import { getRequestHeaders } from '../script.js';
import { SECRET_KEYS, writeSecret, readSecretState } from './secrets.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from './slash-commands/SlashCommandArgument.js';
import { normalizeHelixKey } from './weyland-key-format.js';

/** @typedef {'ok' | 'unchecked' | 'empty' | 'format' | 'invalid' | 'unreachable' | 'failed'} KeySaveStatus */

async function postKeyGuard(path, body) {
    try {
        const response = await fetch(`/api/weyland-keyguard/${path}`, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body ?? {}),
        });
        return response.ok ? await response.json() : null;
    } catch (error) {
        console.warn(`[Weyland keys] ${path} failed:`, error);
        return null;
    }
}

/**
 * Saves a HelixMind key as the active API key and as HMKey (what the usage trackers read).
 * Nothing is written unless the key looks right and the provider accepts it, and older Weyland keys are removed only after
 * that. If the provider cannot be reached the key is saved only when there was no key before, since there is nothing to lose.
 * @param {unknown} raw what the player typed or pasted
 * @returns {Promise<{ status: KeySaveStatus, hadKey: boolean }>} 'ok' = saved and accepted; 'unchecked' = saved, provider unreachable
 */
export async function setHelixKey(raw) {
    const parsed = normalizeHelixKey(raw);
    if (!parsed.ok) return { status: parsed.reason, hadKey: false };

    const check = await postKeyGuard('validate', { key: parsed.key });
    const hadKey = Boolean(check?.hasExisting);
    if (check?.status === 'format') return { status: 'format', hadKey };
    if (check?.status === 'invalid') return { status: 'invalid', hadKey };

    const accepted = check?.status === 'valid';
    // Unreachable, or an older install without the endpoint: only go ahead when there is no key to protect.
    if (!accepted && hadKey) return { status: 'unreachable', hadKey };

    const id = await writeSecret(SECRET_KEYS.CUSTOM, parsed.key, 'api_key_custom');
    if (!id) return { status: 'failed', hadKey };

    SillyTavern.getContext().variables.global.set('HMKey', parsed.key);
    if (accepted) {
        await postKeyGuard('prune-others');
        await readSecretState();
    }
    return { status: accepted ? 'ok' : 'unchecked', hadKey };
}

/**
 * Hands a verified Paw Patrol password to the Downloader so its Alpha and Beta lists unlock. Same call the Downloader's own
 * password box makes (the server hashes it and fetches the matching key file from the CDN).
 * @param {string} password
 * @returns {Promise<boolean>} true when the CDN knew the password
 */
export async function unlockDownloaderWithKey(password) {
    try {
        const response = await fetch('/api/weyland/fetch-key', { headers: { 'X-Password': String(password).trim() } });
        const data = await response.json().catch(() => ({}));
        return response.status === 200 && data.success === true;
    } catch (error) {
        console.warn('[Weyland keys] Downloader unlock failed:', error);
        return false;
    }
}

/**
 * /wtsethelixkey <key> : first-time setup uses this instead of writing the key itself.
 * Returns wt-key-ok, wt-key-unchecked, wt-key-empty, wt-key-format, wt-key-invalid, wt-key-unreachable or wt-key-failed.
 */
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'wtsethelixkey',
    returns: 'wt-key-<status>',
    unnamedArgumentList: [
        SlashCommandArgument.fromProps({ description: 'HelixMind API key', typeList: [ARGUMENT_TYPE.STRING], isRequired: true }),
    ],
    helpString: 'Checks a HelixMind API key with the provider and saves it as the active key. Returns wt-key-ok, wt-key-unchecked, wt-key-empty, wt-key-format, wt-key-invalid, wt-key-unreachable or wt-key-failed.',
    callback: async (_args, value) => {
        const { status } = await setHelixKey(String(value ?? ''));
        return `wt-key-${status}`;
    },
}));
