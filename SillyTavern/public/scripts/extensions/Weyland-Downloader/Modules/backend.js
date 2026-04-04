import { getCurrentUserHandle } from "../../../user.js";
import { WT_DOWNLOAD_MODULE_NAME } from "../index.js";

/** @import { Manifest, ManifestResponse, DownloadEvent, VersionedCharacter } from "../types.js" */
let csrfToken = null;

/**
 * @returns {Promise<string | null>}
 */
async function getCsrfToken() {
    try {
        csrfToken = (await (await fetch('/csrf-token')).json()).token;
        return csrfToken;
    } catch (error) {
        console.error(`[${WT_DOWNLOAD_MODULE_NAME}] Failed to get csrf token:`, error.message);
        return null;
    }
}


// =========================
// ======== HELPER =========
// =========================

/**
 * @param {Manifest} manifest
 * @returns {string[]} Array of character names that exist on manifest
 */
export function listCharacters(manifest) {
    return manifest.characters
        .filter(character => character.version)
        .map(character => character.name);
}

/**
 * @param {Manifest} manifest 
 * @returns {VersionedCharacter[]} Array of characters that exist on manifest (name and version of character PNG)
 */
export function listCharactersVersioned(manifest) {
    return manifest.characters
        .filter(character => character.version)
        .map(character => ({
            name: character.name,
            version: character.version
        }));
}

// =========================
// ======= BACK-END ========
// =========================

/**
 * Call this with the correct password to **gain access to Alpha/Beta characters**
 * @param {string} password
 * @returns {Promise<boolean | string>}
 */
export async function fetchKeyFile(password) {
    try {
        const response = await fetch('/api/weyland/fetch-key', {
            headers: {
                'X-Password': password 
            }
        });
        const data = await response.json();
        if (response.status !== 200) return data.error;
        return data.success;
    } catch (error) {
        return error.message;
    }
}

/**
 * Call this to obtain **local** & **remote** manifests and their **difference**
 * @param {boolean} forceRebuild
 * @returns {Promise<ManifestResponse | string>}
 */
export async function fetchManifests(forceRebuild = false) {
    try {
        const response = await fetch('/api/weyland/fetch-manifests', {
            method: 'GET',
            headers: {
                'X-User-Handle': getCurrentUserHandle() || 'default-user',
                'X-Rebuild-Manifest': forceRebuild ? 'true' : ''
            }
        });
        const data = await response.json();
        if (response.status !== 200) return data.error;
        console.log(`[${WT_DOWNLOAD_MODULE_NAME}] Manifest Debug:`, data);
        return data;
    } catch (error) {
        return error.message;
    }
}

/**
 * **Make sure "fetchManifests()" has been called prior to calling "downloadCharacters()"**
 * @param {string[]} characterNames
 * @returns {Promise<true | string>} **True** upon completion or **String** on error.
 */
export async function downloadCharacters(characterNames) {
    try {
        if (!csrfToken) {
            if (!(await getCsrfToken())) {
                return `Failed to get CSRF Token.`;
            }
        }
        const response = await fetch('api/weyland/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Csrf-Token': csrfToken,
                'X-User-Handle': getCurrentUserHandle() || 'default-user'
            },
            body: JSON.stringify({ characters: characterNames })
        });
        const data = await response.json();
        if (response.status !== 200) return data.error;
        return data;
    } catch (error) {
        return error.message;
    }
}

/**
 * Open an SSE connection to receive download progress events
 * @param {function(DownloadEvent): void} onEvent - callback for each event
 * @returns {EventSource} the SSE connection
 */
export function openDownloadStream(onEvent) {
    const source = new EventSource('/api/weyland/download-stream');

    source.onerror = () => {
        source.close();
    };

    source.onmessage = (event) => {
        /** @type {DownloadEvent} */
        const data = JSON.parse(event.data);
        onEvent(data);
        if (data.type === 'complete') {
            source.close();
        }
    };

    return source;
}

/**
 * @returns {Promise<true | string>} **True** upon completion or **String** on error.
 */
export async function downloadCharactersTest() {
    try {
        const response = await fetch('api/weyland/test-download', {
            method: 'GET'
        });
        const data = await response.json();
        if (response.status !== 200) return data.error;
        return data;
    } catch (error) {
        return error.message;
    }
}
