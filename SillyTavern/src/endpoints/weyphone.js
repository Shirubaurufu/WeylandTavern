import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { serverDirectory } from '../server-directory.js';

/**
 * Storage for WeyPhone's conversation data.
 *
 * WeyPhone originally kept every DM thread inside extension_settings in settings.json. That file is
 * loaded in full on every page load, rewritten in full on every save, and shared with every other
 * extension plus all user settings — so chat-shaped data living there caused write amplification and
 * put unrelated settings in the blast radius of a corrupt write.
 *
 * The data now lives inside the WeyPhone extension folder, by request of the backend team, so the
 * whole feature stays self-contained in one directory rather than spreading files across the repo.
 *
 * ---------------------------------------------------------------------------------------------
 * KNOWN TRADEOFFS OF THIS LOCATION (accepted deliberately; slated for the next redesign wave):
 *
 *  1. NOT AUTHENTICATED. Everything under public/ is served by `express.static` with no auth
 *     middleware in front of it (see server-main.js), so this file is reachable over HTTP by URL
 *     without logging in. Conversation content is therefore readable by anyone who can reach the
 *     server. This matters most for remote-exposed instances.
 *  2. NOT PER-USER. Unlike SillyTavern chats (which live under each user's own data directory),
 *     every ST user on this install shares this one file.
 *  3. LIVES IN A GIT-TRACKED FOLDER. The data file must stay git-ignored — both so user
 *     conversations are never accidentally committed to the public repo, and so routine
 *     update/repair tooling does not treat it as stray and remove it.
 * ---------------------------------------------------------------------------------------------
 *
 * Deliberately a single fixed filename with NO user-controlled path segment, so there is no path
 * traversal surface here at all.
 */

const WEYPHONE_EXTENSION_DIRECTORY = path.join(
    serverDirectory, 'public', 'scripts', 'extensions', 'Weyland-WeyPhone', 'data',
);
const WEYPHONE_DATA_FILE = 'weyphone.json';
const WEYPHONE_DATA_PATH = path.join(WEYPHONE_EXTENSION_DIRECTORY, WEYPHONE_DATA_FILE);

/**
 * Previous storage location (per-user, under the user's own data directory). Retained ONLY so an
 * install that already wrote data there is carried over instead of appearing empty. Safe to delete
 * this fallback once no deployment can still be holding data in the old spot.
 * @param {import('../users.js').UserDirectoryList} directories
 */
function getLegacyUserDataPath(directories) {
    return path.join(directories.root, 'weyphone', WEYPHONE_DATA_FILE);
}

/**
 * @param {string} filePath
 * @returns {object|null} parsed contents, or null when absent/empty
 */
function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
}

export const router = express.Router();

/**
 * Returns the stored WeyPhone payload, or null when nothing has been saved yet.
 * A null payload is what tells the client to run its one-time migration out of settings.json,
 * so "file missing" and "file empty" must stay distinguishable — never coerce this to {}.
 */
router.get('/data', function (request, response) {
    try {
        const current = readJsonFile(WEYPHONE_DATA_PATH);
        if (current) {
            return response.send({ data: current });
        }

        // Nothing in the current location — carry over data written by the previous (per-user)
        // storage location before reporting "nothing stored", so an already-migrated install does
        // not fall all the way back to settings.json and lose newer conversations.
        const legacy = readJsonFile(getLegacyUserDataPath(request.user.directories));
        if (legacy) {
            fs.mkdirSync(WEYPHONE_EXTENSION_DIRECTORY, { recursive: true });
            writeFileAtomicSync(WEYPHONE_DATA_PATH, JSON.stringify(legacy, null, 4), 'utf8');
            console.info('[WeyPhone] Carried stored data over into the extension folder');
            return response.send({ data: legacy });
        }

        return response.send({ data: null });
    } catch (error) {
        console.error('[WeyPhone] Could not read stored data:', error);
        // A read failure must NOT look like "no data yet" — that would make the client think it
        // needs to migrate again and overwrite good data with whatever is left in settings.json.
        return response.status(500).send({ error: 'Could not read WeyPhone data' });
    }
});

/**
 * Overwrites the stored WeyPhone payload. Written atomically so an interrupted save can never
 * leave a half-written file where a user's conversations used to be.
 */
router.post('/data', function (request, response) {
    try {
        const payload = request.body?.data;
        if (payload === undefined || payload === null) {
            return response.status(400).send({ error: 'No data provided' });
        }

        fs.mkdirSync(WEYPHONE_EXTENSION_DIRECTORY, { recursive: true });
        writeFileAtomicSync(WEYPHONE_DATA_PATH, JSON.stringify(payload, null, 4), 'utf8');
        return response.send({ ok: true });
    } catch (error) {
        console.error('[WeyPhone] Could not write data:', error);
        return response.status(500).send({ error: 'Could not write WeyPhone data' });
    }
});
