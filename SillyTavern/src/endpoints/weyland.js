import express from 'express';
import { readdir, stat, writeFile, readFile, mkdir, chmod } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { readSecret } from './secrets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const router = express.Router();
const rateLimits = {
  'fetch-key': { lastCall: 0, cooldown: 2000 },
  'fetch-manifests': { lastCall: 0, cooldown: 2000 },
  'download': {lastCall: 0, cooldown: 5000 }
};

const HELIX_BASE = 'https://helixmind.online';

const BASE_URL = 'https://WeylandTavern.b-cdn.net';
const EXTENSION_PATH = join(__dirname, '..', '..', 'public', 'scripts', 'extensions', 'Weyland-Downloader', 'Bunny');
const KEY_FILE_PATH = join(EXTENSION_PATH, 'key.wtk');
const LOCAL_MANIFEST_PATH = join(EXTENSION_PATH, 'local-manifest.json');
const LOCAL_MANIFEST_VERSION = 2;

/** @type {Manifest | string | null} */
let localManifest = null;
/** @type {Manifest | string | null} */
let remoteManifest = null;
/** @type {Manifest | null} */
let pendingDiff = null;

/** @type {import('http').ServerResponse | null} */
let activeStream = null;
let downloadInProgress = false;

// ============================================================
// HELPERS
// ============================================================

/**
 * @param {Character[]} diffChars 
 * @returns {Map<string,Object>}
 */
function buildCharacterTotals(diffChars) {
  const totals = new Map();
  for (const diffChar of diffChars) {
    let total = diffChar.updatePng ? 1 : 0;
    for (const diffSub of diffChar.subcharacters) {
      for (const diffCostume of diffSub.costumes) {
        total += diffCostume.expressions.length;
      }
    }
    if (diffChar.lorebooks?.length) {
      total += diffChar.lorebooks.length;
    }
    totals.set(diffChar.name, { completed: 0, failed: 0, total });
  }
  return totals;
}

/**
 * @param {string} type 
 * @param {*} data 
 * @returns {void}
 */
function emitEvent(type, data) {
  if (!activeStream) return;
  activeStream.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
}

/**
 * @param {number} concurrency
 */
function pLimit(concurrency) {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve).catch(reject).finally(() => {
      active--;
      next();
    });
  };

  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

/**
 * @param {string} key 
 * @returns {Object}
 */
function checkRateLimit(key) {
  const limit = rateLimits[key];
  if (!limit) return { limited: true };
  const now = Date.now();
  if (now - limit.lastCall < limit.cooldown) {
    const remaining = Math.ceil((limit.cooldown - (now - limit.lastCall)) / 1000);
    return { limited: true, remaining };
  }
  limit.lastCall = now;
  return { limited: false };
}

/**
 * @param {Date} date
 * @returns {string}
 */
function formatVersion(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const yy = String(date.getFullYear()).slice(-2);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${m}-${d}-${yy}-${hh}-${mm}`;
}

/**
 * @param {*} input 
 * @returns {string}
 */
function sha224(input) {
    return createHash('sha224').update(input).digest('hex');
}

/**
 * Treats manifest asset names as case-insensitive logical identifiers.
 * Windows preserves existing filename casing when overwriting a path whose
 * casing changed, so exact string comparisons can otherwise create permanent
 * phantom updates for the same on-disk file.
 * @param {string} value
 * @returns {string}
 */
function manifestNameKey(value) {
    return String(value).toLowerCase();
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
function manifestNamesEqual(left, right) {
    return manifestNameKey(left) === manifestNameKey(right);
}

/**
 * Gives Bunny CDN a new cache key whenever a manifest asset version changes.
 * The Pull Zone must have Vary Cache enabled for the `v` query parameter.
 * @param {string} url
 * @param {number | string} version
 * @returns {string}
 */
function withManifestVersion(url, version) {
    return `${url}?v=${encodeURIComponent(String(version))}`;
}

/**
 * Confirms Bunny returned the exact asset described by the manifest.
 * Manifest versions currently represent file sizes in bytes.
 * @param {Buffer} buffer
 * @param {number | string} expectedVersion
 * @param {string} assetName
 * @returns {number}
 */
function validateDownloadedAsset(buffer, expectedVersion, assetName) {
    const expectedSize = Number(expectedVersion);
    if (!Number.isSafeInteger(expectedSize) || expectedSize < 0) {
        throw new Error(`Invalid manifest version for ${assetName}: ${expectedVersion}`);
    }
    if (buffer.length !== expectedSize) {
        throw new Error(`Downloaded size mismatch for ${assetName}: expected ${expectedSize}, received ${buffer.length}`);
    }
    return buffer.length;
}

/**
 * Turns a download failure into a reason a user can act on. The terminal used to say only
 * "N file(s) failed to download", which hides four very different problems: the server,
 * the connection, a truncated file, or Windows refusing to save it.
 * @param {any} error
 * @returns {string}
 */
function describeDownloadFailure(error) {
    const code = error?.code || error?.cause?.code;
    if (code === 'EPERM' || code === 'EACCES') {
        return 'Windows blocked saving the file (check your antivirus, a Read-only file, or whether Weyland Tavern was ever started as administrator)';
    }
    if (code === 'EBUSY') return 'the file is open in another program';
    if (code === 'ENOSPC') return 'the disk is full';
    if (/size mismatch/i.test(String(error?.message))) return 'the file arrived incomplete';
    if (error?.name === 'TypeError' || code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
        return 'could not reach the download server (check your internet connection)';
    }
    return String(error?.message || 'unknown error');
}

/**
 * writeFile that recovers from a Read-only file. Windows reports writing to a Read-only file
 * as EPERM; clearing the flag is harmless (we are about to replace the file anyway) and fixes
 * that case. If something else is blocking (antivirus, a file owned by an administrator run),
 * the retry throws again and the caller reports it.
 * @param {string} path
 * @param {string | Buffer} data
 */
async function writeFileClearingReadOnly(path, data) {
    try {
        await writeFile(path, data);
    } catch (error) {
        if (error?.code !== 'EPERM' && error?.code !== 'EACCES') throw error;
        try {
            await chmod(path, 0o666);
        } catch {
            throw error;
        }
        await writeFile(path, data);
    }
}

/**
 * Saves the local manifest (the record of what is installed). Returns null on success, or a
 * plain reason on failure. Callers treat failure as non-fatal: the downloaded files are already
 * on disk, and healLocalManifestFromDisk() recognises them on the next check even if this
 * record could not be written.
 * @param {Manifest} manifest
 * @returns {Promise<string | null>}
 */
async function saveLocalManifest(manifest) {
    try {
        await mkdir(EXTENSION_PATH, { recursive: true });
        await writeFileClearingReadOnly(LOCAL_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
        return null;
    } catch (error) {
        console.warn('[Weyland] Could not save the download record:', LOCAL_MANIFEST_PATH, error?.message);
        return describeDownloadFailure(error);
    }
}

/**
 * @param {string} path
 * @returns {Promise<number | null>}
 */
async function sizeOnDisk(path) {
    try {
        return (await stat(path)).size;
    } catch {
        return null;
    }
}

/**
 * Before listing updates, double-check each file the record says is outdated against the file
 * actually on disk. If the disk copy is already exactly the server's size (manifest versions
 * are byte sizes), it is up to date and the record is corrected.
 *
 * Why: the record can fall behind the disk, e.g. when Windows refused to save it after a
 * successful download. Before this, those characters showed "Update" forever, however many
 * times they were downloaded.
 *
 * Why not simply rebuild the whole record from disk every time: SillyTavern rewrites a card PNG
 * when a character is favourited or edited, so its size stops matching the server. A disk-only
 * check would flag those as updates forever and overwrite the user's edits. Only accepting an
 * EXACT size match keeps that protection, and only checking already-flagged files keeps this to
 * a handful of file lookups on a normal check.
 * @param {string} userPath
 * @param {Manifest} remoteManifest
 * @param {Manifest} localManifest
 * @returns {Promise<number>} how many entries were corrected
 */
async function healLocalManifestFromDisk(userPath, remoteManifest, localManifest) {
    const charactersPath = join(userPath, 'characters');
    const worldsPath = join(userPath, 'worlds');
    const localCharMap = new Map(localManifest.characters.map(c => [manifestNameKey(c.name), c]));
    const checks = [];

    for (const remoteChar of remoteManifest.characters) {
        const key = manifestNameKey(remoteChar.name);
        const pngPath = join(charactersPath, `${remoteChar.name}.png`);
        const ensureLocalChar = () => {
            let localChar = localCharMap.get(key);
            if (!localChar) {
                localChar = { name: remoteChar.name, version: null, subcharacters: [] };
                localManifest.characters.push(localChar);
                localCharMap.set(key, localChar);
            }
            return localChar;
        };

        checks.push(async () => {
            let localChar = localCharMap.get(key);
            let healed = 0;
            // A character not in the record is only worth checking if its card is on disk;
            // otherwise it is simply not installed and every file lookup would miss.
            if (!localChar && await sizeOnDisk(pngPath) === null) return 0;

            if (localChar?.version !== remoteChar.version && await sizeOnDisk(pngPath) === Number(remoteChar.version)) {
                ensureLocalChar().version = remoteChar.version;
                healed++;
            }

            for (const remoteSub of remoteChar.subcharacters) {
                if (!remoteSub.name) continue;
                for (const remoteCostume of remoteSub.costumes) {
                    for (const remoteExpr of remoteCostume.expressions) {
                        localChar = localCharMap.get(key);
                        const localSub = localChar?.subcharacters.find(s => manifestNamesEqual(s.name, remoteSub.name));
                        const localCostume = localSub?.costumes.find(c => manifestNamesEqual(c.name, remoteCostume.name));
                        const localExpr = localCostume?.expressions.find(e => manifestNamesEqual(e.filename, remoteExpr.filename));
                        if (localExpr?.version === remoteExpr.version) continue;
                        const diskSize = await sizeOnDisk(join(charactersPath, remoteSub.name, remoteCostume.name, remoteExpr.filename));
                        if (diskSize !== Number(remoteExpr.version)) continue;

                        const char = ensureLocalChar();
                        let sub = char.subcharacters.find(s => manifestNamesEqual(s.name, remoteSub.name));
                        if (!sub) { sub = { name: remoteSub.name, costumes: [] }; char.subcharacters.push(sub); }
                        let costume = sub.costumes.find(c => manifestNamesEqual(c.name, remoteCostume.name));
                        if (!costume) { costume = { name: remoteCostume.name, expressions: [] }; sub.costumes.push(costume); }
                        const expr = costume.expressions.find(e => manifestNamesEqual(e.filename, remoteExpr.filename));
                        if (expr) expr.version = remoteExpr.version;
                        else costume.expressions.push({ filename: remoteExpr.filename, version: remoteExpr.version });
                        healed++;
                    }
                }
            }

            for (const remoteLore of remoteChar.lorebooks ?? []) {
                if (!remoteLore.filename) continue;
                localChar = localCharMap.get(key);
                const localLore = localChar?.lorebooks?.find(l => manifestNamesEqual(l.filename, remoteLore.filename));
                if (localLore?.version === remoteLore.version) continue;
                if (await sizeOnDisk(join(worldsPath, remoteLore.filename)) !== Number(remoteLore.version)) continue;
                const char = ensureLocalChar();
                if (!char.lorebooks) char.lorebooks = [];
                const lore = char.lorebooks.find(l => manifestNamesEqual(l.filename, remoteLore.filename));
                if (lore) lore.version = remoteLore.version;
                else char.lorebooks.push({ filename: remoteLore.filename, version: remoteLore.version });
                healed++;
            }
            return healed;
        });
    }

    // One task per character, so characters never race on the same record entries.
    const limit = pLimit(8);
    const counts = await Promise.all(checks.map(check => limit(check)));
    return counts.reduce((sum, n) => sum + n, 0);
}

/**
 * @param {string | URL | Request} url
 * @param {AbortSignal | null} signal
 * @returns {Promise<Response | null>}
 */
async function fetchFromBunny(url, signal = null) {
    const options = signal ? { signal } : {};
    const response = await fetch(url, options);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    return response;
}

/**
 * @param {string | URL | Request} url 
 * @param {AbortSignal | null} signal 
 * @param {number} retryDelayMiliseconds 
 * @returns {Promise<Response | null>}
 */
async function downloadWithRetry(url, signal, retryDelayMiliseconds = 1500) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchFromBunny(url, signal);
      return response;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, retryDelayMiliseconds));
      }
    }
  }
  // Both attempts failed. Throw the real error (not null) so the terminal can say WHY.
  // null stays reserved for a 404 from fetchFromBunny.
  throw lastError;
}

/**
 * @typedef {Object} AccessKeys
 * @property {string | null} betaHash
 * @property {string | null} alphaHash
 */

/**
 * @returns {Promise<AccessKeys>}
 */
async function loadKeyFile() {
    try {
        const content = await readFile(KEY_FILE_PATH, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        return {
            betaHash: lines[0] || null,
            alphaHash: lines[1] || null
        };
    } catch {
        return { betaHash: null, alphaHash: null };
    }
}

/**
 * @param {string} folderHash
 * @returns {Promise<Manifest | null>}
 */
async function fetchManifest(folderHash) {
    const url = `${BASE_URL}/Characters/${folderHash}/manifest.json`;
    const response = await fetchFromBunny(url);
    if (!response) return null;
    return response.json();
}

/**
 * @returns {Promise<Manifest | null>}
 */
async function fetchStandardManifest() {
    const url = `${BASE_URL}/Characters/Standard/manifest.json`;
    const response = await fetchFromBunny(url);
    if (!response) return null;
    return response.json();
}

/**
 * @param {Manifest | null} standardManifest 
 * @param {Manifest | null} betaManifest 
 * @param {Manifest | null} alphaManifest 
 * @param {string | null} betaHash 
 * @param {string | null} alphaHash 
 * @returns {Manifest}
 */
function mergeManifests(standardManifest, betaManifest, alphaManifest, betaHash, alphaHash) {
    const characters = [
        ...(standardManifest?.characters.map(c => ({ ...c, zone: 'Standard', zoneHash: 'Standard' })) ?? []),
        ...(betaManifest?.characters.map(c => ({ ...c, zone: 'Beta', zoneHash: betaHash })) ?? []),
        ...(alphaManifest?.characters.map(c => ({ ...c, zone: 'Alpha', zoneHash: alphaHash })) ?? [])
    ];
    return { characters };
}

/**
 * @param {Manifest} manifest 
 * @returns {Manifest}
 */
function stripZoneHashes(manifest) {
    return {
        characters: manifest.characters.map(({ zoneHash, updatePng, ...char }) => char)
    };
}

// ============================================================
// LOCAL MANIFEST
// ============================================================

/**
 * @typedef {Object} Expression
 * @property {string} filename
 * @property {number} version
 */

/**
 * @param {string} costumePath 
 * @returns {Promise<Expression[]>}
 */
async function getExpressionFiles(costumePath) {
    try {
        const files = await readdir(costumePath);
        const avifFiles = files.filter(f => f.endsWith('.avif'));

        return Promise.all(avifFiles.map(async (filename) => {
            const fileStat = await stat(join(costumePath, filename));
            return {
                filename,
                version: fileStat.size
            };
        }));
    } catch {
        return [];
    }
}

/**
 * @typedef {Object} Costume
 * @property {string} name
 * @property {Expression[]} expressions
 */

/**
 * @param {string} subcharacterPath 
 * @returns {Promise<Costume[]>}
 */
async function getCostumes(subcharacterPath) {
    try {
        const entries = await readdir(subcharacterPath, { withFileTypes: true });
        const costumeDirs = entries.filter(e => e.isDirectory());

        return Promise.all(costumeDirs.map(async (costumeDir) => {
            const costumePath = join(subcharacterPath, costumeDir.name);
            const expressions = await getExpressionFiles(costumePath);
            return {
                name: costumeDir.name,
                expressions
            };
        }));
    } catch {
        return [];
    }
}

/**
 * @typedef {Object} SubCharacter
 * @property {string} name
 * @property {Costume[]} costumes
 */

/**
 * @typedef {Object} World
 * @property {string} filename
 * @property {number | null} version
 */

/**
 * @typedef {Object} Character
 * @property {string} name
 * @property {number | null} version
 * @property {SubCharacter[]} subcharacters
 * @property {World[]} [lorebooks]
 * @property {string | null} [zoneHash]
 * @property {string | null} [zone]
 * @property {boolean} [updatePng]
 */

/**
 * @typedef {Object} Manifest
 * @property {number} [manifestCacheVersion]
 * @property {Character[]} characters
 */

/**
 * @param {string} userPath
 * @param {Manifest} remoteManifest
 * @returns {Promise<Manifest>}
 */
async function buildLocalManifest(userPath, remoteManifest) {
    const charactersPath = join(userPath, 'characters');
    const worldsPath = join(userPath, 'worlds');
    const characters = await Promise.all(remoteManifest.characters.map(async (remoteChar) => {
        const pngPath = join(charactersPath, `${remoteChar.name}.png`);
        let version = null;
        try {
            const pngStat = await stat(pngPath);
            version = pngStat.size;
        } catch {
            // PNG doesn't exist locally
        }

        const subcharacters = await Promise.all(remoteChar.subcharacters.filter(remoteSub => remoteSub.name).map(async (remoteSub) => {
            const subcharacterPath = join(charactersPath, remoteSub.name);
            const costumes = await getCostumes(subcharacterPath);
            return {
                name: remoteSub.name,
                costumes
            };
        }));

        let lorebooks = undefined;
        if (remoteChar.lorebooks?.length) {
            lorebooks = await Promise.all(remoteChar.lorebooks.filter(remoteWorld => remoteWorld.filename).map(async (remoteWorld) => {
                const lorePath = join(worldsPath, remoteWorld.filename);
                let loreVersion = null;
                try {
                    const loreStat = await stat(lorePath);
                    loreVersion = loreStat.size;
                } catch {
                    // Lorebook doesn't exist locally
                }
                return {
                    filename: remoteWorld.filename,
                    version: loreVersion
                };
            }));
        }

        return {
            name: remoteChar.name,
            version,
            subcharacters,
            ...(lorebooks !== undefined && { lorebooks })
        };
    }));

    return {
        manifestCacheVersion: LOCAL_MANIFEST_VERSION,
        characters,
    };
}

/**
 * @returns {Promise<Manifest | string>}
 */
async function fetchMergedRemoteManifest() {
    try {
        const { betaHash, alphaHash } = await loadKeyFile();
        const [standardManifest, betaManifest, alphaManifest] = await Promise.all([
            fetchStandardManifest(),
            betaHash ? fetchManifest(betaHash) : null,
            alphaHash ? fetchManifest(alphaHash) : null
        ]);

        return mergeManifests(standardManifest, betaManifest, alphaManifest, betaHash, alphaHash);
    } catch (error) {
        return `fetchMergedRemoteManifest(): ${error.message}`;
    }
}

/**
 * @param {string} userHandle 
 * @param {Manifest} remoteManifest 
 * @param {boolean} rebuildManifest 
 * @returns {Promise<Manifest | string>}
 */
async function getLocalManifest(userHandle, remoteManifest, rebuildManifest) {
    const userPath = join(__dirname, '..', '..', 'data', userHandle);
    if (!rebuildManifest) {
        try {
            const content = await readFile(LOCAL_MANIFEST_PATH, 'utf-8');
            const parsedManifest = JSON.parse(content);
            if (parsedManifest.manifestCacheVersion === LOCAL_MANIFEST_VERSION) {
                return parsedManifest;
            }
        } catch {}
    }
    try {
        const localManifest = await buildLocalManifest(userPath, remoteManifest);
        // Best effort: a record Windows won't let us save must not break the whole update check.
        // The freshly built manifest is correct either way; it just gets rebuilt next time.
        await saveLocalManifest(localManifest);
        return localManifest;
    } catch (error) {
        return `getLocalManifest(): ${error.message} / Dirname: ${__dirname}, userHandle: ${userHandle}`;
    }
}

// ============================================================
// DIFF
// ============================================================

/**
 * @param {Manifest} remoteManifest
 * @param {Manifest} localManifest
 * @returns {Manifest}
 */
function computeDiff(remoteManifest, localManifest) {
    const localCharMap = new Map(localManifest.characters.map(c => [manifestNameKey(c.name), c]));

    const diffCharacters = [];

    for (const remoteChar of remoteManifest.characters) {
        const localChar = localCharMap.get(manifestNameKey(remoteChar.name));

        const updatePng = !localChar || localChar.version !== remoteChar.version;
        const diffSubcharacters = [];

        for (const remoteSub of remoteChar.subcharacters) {
            const localSub = localChar?.subcharacters.find(s => manifestNamesEqual(s.name, remoteSub.name));
            const diffCostumes = [];

            for (const remoteCostume of remoteSub.costumes) {
                const localCostume = localSub?.costumes.find(c => manifestNamesEqual(c.name, remoteCostume.name));
                const diffExpressions = [];

                for (const remoteExpr of remoteCostume.expressions) {
                    const localExpr = localCostume?.expressions.find(e => manifestNamesEqual(e.filename, remoteExpr.filename));
                    if (!localExpr || localExpr.version !== remoteExpr.version) {
                        diffExpressions.push({ filename: remoteExpr.filename, version: remoteExpr.version });
                    }
                }

                if (diffExpressions.length > 0) {
                    diffCostumes.push({ name: remoteCostume.name, expressions: diffExpressions });
                }
            }

            if (diffCostumes.length > 0) {
                diffSubcharacters.push({ name: remoteSub.name, costumes: diffCostumes });
            }
        }

        // Diff lorebooks
        const diffLorebooks = [];
        if (remoteChar.lorebooks?.length) {
            for (const remoteLore of remoteChar.lorebooks) {
                const localLore = localChar?.lorebooks?.find(l => manifestNamesEqual(l.filename, remoteLore.filename));
                if (!localLore || localLore.version !== remoteLore.version) {
                    diffLorebooks.push({ filename: remoteLore.filename, version: remoteLore.version });
                }
            }
        }

        if (updatePng || diffSubcharacters.length > 0 || diffLorebooks.length > 0) {
            diffCharacters.push({
                name: remoteChar.name,
                zone: remoteChar.zone,
                zoneHash: remoteChar.zoneHash,
                updatePng,
                version: remoteChar.version,
                subcharacters: diffSubcharacters,
                ...(diffLorebooks.length > 0 && { lorebooks: diffLorebooks })
            });
        }
    }

    return { characters: diffCharacters };
}

// ============================================================
// ENDPOINTS
// ============================================================

router.get('/fetch-key', async (request, response) => {
    const { limited, remaining } = checkRateLimit('fetch-key');
    if (limited) {
        return response.status(429).json({ error: `/weyland/fetch-key: Please wait ${remaining} seconds before trying again` });
    }
    try {
        const password = request.header('X-Password');
        if (!password || typeof password !== 'string') return response.status(400).json({ error: 'Invalid or missing password' });
        const url = `${BASE_URL}/WeyKey/${sha224(password.trim())}/key.wtk`;

        const keyFile = await fetchFromBunny(url);
        if (!keyFile) {
            return response.status(404).json({ error: 'Invalid password' });
        }

        const content = await keyFile.text();
        await mkdir(EXTENSION_PATH, { recursive: true });
        await writeFile(KEY_FILE_PATH, content);

        response.status(200).json({ success: true });
    } catch (error) {
        console.error('/weyland/fetch-key: Failed to fetch key:', error);
        response.status(500).json({ error: `/weyland/fetch-key: ${error.message}` });
    }
});

/**
 * Per-key HelixMind usage, fetched server-side.
 *
 * The provider's new backend only allows browser (CORS) requests from its own origin, so the
 * usage trackers can't call it directly from WeyTavern's page. This route makes the same call
 * server-to-server (no browser, no CORS) and hands the tracker a normalised result.
 *
 * `used` comes from /v1/usage/by-token (the calling key's own request count); `limit` comes from
 * /v1/key (limits.effective_rpd, the calling key's effective daily cap). `remaining` = limit -
 * used. Any field that can't be read stays null and the client degrades gracefully.
 */
router.get('/helix-usage', async (request, response) => {
    response.set('Cache-Control', 'no-store'); // usage changes constantly; never cache this
    try {
        // Prefer the api_key_custom secret — the very key generation uses, read server-side —
        // so the tracker can never drift from the active key the way the HMKey global can (a
        // user who updates their key via ST's native field updates the secret but not HMKey).
        // Fall back to the X-Helix-Key header only if the secret isn't set.
        let key = '';
        try {
            const secret = request.user?.directories ? readSecret(request.user.directories, 'api_key_custom') : null;
            if (typeof secret === 'string') key = secret.trim();
        } catch { /* fall through to the header */ }
        if (!key) {
            const header = request.header('X-Helix-Key');
            if (typeof header === 'string') key = header.trim();
        }
        if (!key) {
            return response.status(400).json({ error: 'No HelixMind key configured' });
        }

        const auth = { headers: { Authorization: `Bearer ${key}` } };
        const sinceIso = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();

        // Each upstream is isolated so one failure can't blank the other or 500 the route.
        // used = the calling key's own request count in the last 24h (/v1/usage/by-token)
        let used = null;
        try {
            const r = await fetch(`${HELIX_BASE}/v1/usage/by-token?since=${encodeURIComponent(sinceIso)}`, auth);
            if (r.ok) {
                const payload = await r.json();
                const row = Array.isArray(payload?.data) ? payload.data[0] : null;
                const value = row?.total_requests;
                const n = Number(value);
                if (value != null && value !== '' && Number.isSafeInteger(n) && n >= 0) used = n;
            }
        } catch { /* leave used null */ }

        // limit = the calling key's effective daily cap (/v1/key -> limits.effective_rpd)
        let limit = null;
        try {
            const r = await fetch(`${HELIX_BASE}/v1/key`, auth);
            if (r.ok) {
                const info = await r.json();
                const n = Number(info?.limits?.effective_rpd);
                if (Number.isFinite(n) && n > 0) limit = n;
            }
        } catch { /* leave limit null */ }

        const messagesLeft = (typeof used === 'number' && typeof limit === 'number')
            ? Math.max(0, limit - used)
            : null;

        // Identify the effective key without exposing it; native secret changes must
        // not reuse the hourly estimate belonging to a previous key.
        const usageKeyId = createHash('sha256').update(key).digest('hex');
        return response.status(200).json({ used, limit, remaining: messagesLeft, usageKeyId });
    } catch (error) {
        console.error('/weyland/helix-usage: lookup failed:', error);
        return response.status(500).json({ error: `/weyland/helix-usage: ${error.message}` });
    }
});

router.get('/fetch-manifests', async (request, response) => {
    const { limited, remaining } = checkRateLimit('fetch-manifests');
    if (limited) {
        return response.status(429).json({ error: `/weyland/fetch-manifests: Please wait ${remaining} seconds before trying again` });
    }
    try {
        const userHandle = request.header('X-User-Handle') || 'default-user';
        const rebuildManifest = request.header('X-Rebuild-Manifest') ? true : false;

        // Fetch remote manifests
        remoteManifest = await fetchMergedRemoteManifest();
        if (typeof remoteManifest === 'string') throw new Error(remoteManifest);

        // Load or build local manifest
        localManifest = await getLocalManifest(userHandle, remoteManifest, rebuildManifest);
        if (typeof localManifest === 'string') throw new Error(localManifest);

        // Correct any "outdated" entries whose file on disk already matches the server
        // (see healLocalManifestFromDisk), then keep the corrected record if Windows lets us.
        const healed = await healLocalManifestFromDisk(join(__dirname, '..', '..', 'data', userHandle), remoteManifest, localManifest);
        if (healed > 0) {
            console.log(`[Weyland] Download record: ${healed} file(s) already up to date on disk were missing from it; corrected.`);
            await saveLocalManifest(localManifest);
        }

        // Compute and store diff
        pendingDiff = computeDiff(remoteManifest, localManifest);
        
        response.status(200).json({ remoteManifest: stripZoneHashes(remoteManifest), localManifest, pendingDiff });
    } catch (error) {
        console.error('/weyland/fetch-manifests: Failed to fetch manifests:', error);
        response.status(500).json({ error: `/weyland/fetch-manifests: ${error.message}` });
    }
});

router.post('/download', async (request, response) => {
    const { limited, remaining } = checkRateLimit('download');
    if (limited) {
        return response.status(429).json({ error: `/weyland/download: Please wait ${remaining} seconds before trying again` });
    }
    try {
        const userHandle = request.header('X-User-Handle') || 'default-user';
        const reDownload = (request.header('X-Redownload') || 'false').toLowerCase() === 'true';
        const { characters } = request.body;
        if (!pendingDiff) {
            return response.status(400).json({ error: 'No diff available, fetch manifests first' });
        }

        const userPath = join(__dirname, '..', '..', 'data', userHandle || 'default-user');
        const charactersPath = join(userPath, 'characters');
        const worldsPath = join(userPath, 'worlds');

        if (!localManifest || typeof localManifest === 'string') {
             // Load local manifest for updating
            const localManifestContent = await readFile(LOCAL_MANIFEST_PATH, 'utf-8');
            /** @type {Manifest} */
            localManifest = JSON.parse(localManifestContent);
        }
        if (!localManifest || typeof localManifest === 'string') throw new Error (localManifest || `Failed to load Local Manifest`);
       
        const localCharMap = new Map(localManifest.characters.map(c => [manifestNameKey(c.name), c]));

        /** @type {Character[] | null} */
        let diffChars = null;
        if (reDownload) {
            if (!remoteManifest || typeof remoteManifest === 'string') throw new Error(`Cannot load character for re-download`);
            // Filter remote to only requested characters
            diffChars = remoteManifest.characters.filter(c => characters.includes(c.name)).map(c => ({...c, updatePng: true}));
        } else {
            // Filter diff to only requested characters
            diffChars = pendingDiff.characters.filter(c => characters.includes(c.name));
        }
        if (!diffChars?.length) throw new Error(`No characters found for download`);
        const charTotals = buildCharacterTotals(diffChars);

        // Build flat list of all downloads
        const downloadTasks = [];
        const failed = [];
        let consecutiveFailures = 0;
        const consecutiveFailedCharacters = new Set();
        let aborted = false;
        const abortController = new AbortController();

        /** A file landed: reset both the batch-wide and this character's failure streaks. */
        const recordSuccess = (characterName) => {
            consecutiveFailures = 0;
            consecutiveFailedCharacters.clear();
            charTotals.get(characterName).consecutiveFailures = 0;
        };

        /** True when this character's remaining files should not be attempted. */
        const isSkipped = (characterName) => aborted || Boolean(charTotals.get(characterName).skipped);

        /**
         * One place for every failure: says WHY in the terminal and the server console, and
         * isolates a broken character. It used to take 10 failures in a row from ANY character to
         * abort the whole batch, so one bad character (Nefara, 2026-09-24) stopped six healthy
         * ones. Now a character is skipped after 5 straight failures, and the batch only stops
         * when failures span 2+ characters with nothing succeeding in between (a real outage,
         * or the whole characters folder being blocked).
         */
        const recordFailure = (characterName, filePath, error) => {
            const reason = describeDownloadFailure(error);
            console.warn(`[Weyland] Download failed: ${characterName} / ${filePath}: ${error?.message}`);
            failed.push({ character: characterName, filePath, reason });

            const charProgress = charTotals.get(characterName);
            charProgress.failed++;
            charProgress.consecutiveFailures = (charProgress.consecutiveFailures || 0) + 1;
            emitEvent('error', { character: characterName, message: `${charProgress.failed} file(s) failed to download: ${reason}` });

            if (charProgress.consecutiveFailures >= 5 && !charProgress.skipped) {
                charProgress.skipped = true;
                emitEvent('error', { character: characterName, message: 'Skipping the rest of this character so the others can finish. Try it again on its own afterward.' });
            }

            consecutiveFailures++;
            consecutiveFailedCharacters.add(characterName);
            if (!aborted && consecutiveFailures >= 10 && consecutiveFailedCharacters.size >= 2) {
                aborted = true;
                abortController.abort();
                emitEvent('error', { character: 'All characters', message: `Stopped: every download is failing (${reason}).` });
            }
        };

        for (const diffChar of diffChars) {
            const zoneFolder = diffChar.zoneHash;

            // Ensure character exists in local manifest
            const characterKey = manifestNameKey(diffChar.name);
            if (!localCharMap.has(characterKey)) {
                const newChar = { name: diffChar.name, version: null, subcharacters: [] };
                localManifest.characters.push(newChar);
                localCharMap.set(characterKey, newChar);
            }

            const localChar = localCharMap.get(characterKey);

            // Stop JavaScript from complaining about potentially undefined entries
            if (localChar === undefined) continue;

            if (diffChar.updatePng) {
                const url = withManifestVersion(`${BASE_URL}/Characters/${zoneFolder}/${diffChar.name}/${diffChar.name}.png`, diffChar.version);
                const destPath = join(charactersPath, `${diffChar.name}.png`);
                const characterName = diffChar.name;

                downloadTasks.push(async () => {
                    if (isSkipped(characterName)) return;
                    try {
                        const response = await downloadWithRetry(url, abortController.signal);
                        if (!response) throw new Error('Not found on the download server');

                        const buffer = Buffer.from(await response.arrayBuffer());
                        const downloadedSize = validateDownloadedAsset(buffer, diffChar.version, `${diffChar.name}.png`);
                        await mkdir(dirname(destPath), { recursive: true });
                        await writeFileClearingReadOnly(destPath, buffer);

                        localChar.version = downloadedSize;
                        recordSuccess(characterName);

                        const charProgress = charTotals.get(characterName);
                        charProgress.completed++;
                        emitEvent('progress', { character: characterName, completed: charProgress.completed, total: charProgress.total });
                    } catch (error) {
                        if (error.name === 'AbortError') return;
                        recordFailure(characterName, `${characterName}.png`, error);
                    }
                });
            }

            for (const diffSub of diffChar.subcharacters) {
                let localSub = localChar.subcharacters.find(s => manifestNamesEqual(s.name, diffSub.name));
                if (!localSub) {
                    localSub = { name: diffSub.name, costumes: [] };
                    localChar.subcharacters.push(localSub);
                }

                for (const diffCostume of diffSub.costumes) {
                    let localCostume = localSub.costumes.find(c => manifestNamesEqual(c.name, diffCostume.name));
                    if (!localCostume) {
                        localCostume = { name: diffCostume.name, expressions: [] };
                        localSub.costumes.push(localCostume);
                    }

                    const costumePath = join(charactersPath, diffSub.name, diffCostume.name);

                    for (const diffExpr of diffCostume.expressions) {
                        const url = withManifestVersion(`${BASE_URL}/Characters/${zoneFolder}/${diffChar.name}/${diffSub.name}/${diffCostume.name}/${diffExpr.filename}`, diffExpr.version);
                        const destPath = join(costumePath, diffExpr.filename);
                        const characterName = diffChar.name;
                        const costumeName = diffCostume.name;
                        const filename = diffExpr.filename;
                        const version = diffExpr.version;

                        downloadTasks.push(async () => {
                            if (isSkipped(characterName)) return;
                            try {
                                const response = await downloadWithRetry(url, abortController.signal);
                                if (!response) throw new Error('Not found on the download server');

                                const buffer = Buffer.from(await response.arrayBuffer());
                                const downloadedSize = validateDownloadedAsset(buffer, version, `${characterName}/${costumeName}/${filename}`);
                                await mkdir(costumePath, { recursive: true });
                                await writeFileClearingReadOnly(destPath, buffer);

                                const localExpr = localCostume.expressions.find(e => manifestNamesEqual(e.filename, filename));
                                if (localExpr) {
                                    localExpr.version = downloadedSize;
                                } else {
                                    localCostume.expressions.push({ filename, version: downloadedSize });
                                }

                                recordSuccess(characterName);

                                const charProgress = charTotals.get(characterName);
                                charProgress.completed++;
                                emitEvent('progress', { character: characterName, completed: charProgress.completed, total: charProgress.total });
                            } catch (error) {
                                if (error.name === 'AbortError') return;
                                recordFailure(characterName, `${diffSub.name}/${costumeName}/${filename}`, error);
                            }
                        });
                    }
                }
            }

            if (diffChar.lorebooks?.length) {
                // Ensure lorebooks array exists in local manifest
                if (!localChar.lorebooks) {
                    localChar.lorebooks = [];
                }

                for (const diffLore of diffChar.lorebooks) {
                    const url = withManifestVersion(`${BASE_URL}/Characters/${zoneFolder}/${diffChar.name}/${diffLore.filename}`, diffLore.version);
                    const destPath = join(worldsPath, diffLore.filename);
                    const characterName = diffChar.name;
                    const loreName = diffLore.filename;
                    const loreVersion = diffLore.version;

                    downloadTasks.push(async () => {
                        if (isSkipped(characterName)) return;
                        try {
                            const response = await downloadWithRetry(url, abortController.signal);
                            if (!response) throw new Error('Not found on the download server');

                            const buffer = Buffer.from(await response.arrayBuffer());
                            const downloadedSize = validateDownloadedAsset(buffer, loreVersion, loreName);
                            await mkdir(dirname(destPath), { recursive: true });
                            await writeFileClearingReadOnly(destPath, buffer);

                            if (localChar.lorebooks !== undefined) {
                                const localLore = localChar.lorebooks.find(l => manifestNamesEqual(l.filename, loreName));
                                if (localLore) {
                                    localLore.version = downloadedSize;
                                } else {
                                    localChar.lorebooks.push({ filename: loreName, version: downloadedSize });
                                }
                            }

                            recordSuccess(characterName);

                            const progress = charTotals.get(characterName);
                            progress.completed++;
                            emitEvent('progress', { character: characterName, completed: progress.completed, total: progress.total });
                        } catch (error) {
                            if (error.name === 'AbortError') return;
                            recordFailure(characterName, loreName, error);
                        }
                    });
                }
            }
        }

        // Execute with concurrency limit of 10
        const limit = pLimit(10);
        await Promise.all(downloadTasks.map(task => limit(task)));

        // Save updated local manifest regardless of failures. A failed save is NOT a failed
        // download: the files are on disk and the next update check recognises them
        // (healLocalManifestFromDisk). It used to throw here, so a download that fully worked
        // reported "API TRANSFER FAILED" and the characters kept showing "Update".
        const saveProblem = await saveLocalManifest(localManifest);
        if (saveProblem) {
            emitEvent('error', { character: 'Download record', message: `Your files were saved, but the record of them could not be: ${saveProblem}. They will be recognised on the next update check.` });
        }

        // `aborted` in this event reads as "cancelled by user" in the terminal, and the server
        // never cancels on a user's behalf, so an outage stop is reported through its error line
        // and the failed list instead.
        emitEvent('complete', { aborted: false, failed: failed.length > 0 ? failed : undefined });
        activeStream?.end();
        activeStream = null;

        response.status(200).json({ success: true });
    } catch (error) {
        console.error('/weyland/download: Failed to download files:', error);
        response.status(500).json({ error: `/weyland/download: ${error.message}` });
    }
});

router.get('/download-stream', (request, response) => {
  if (activeStream) {
    activeStream.end();
  }

  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();

  activeStream = response;

  request.on('close', () => {
    if (activeStream === response) {
      activeStream = null;
    }
  });
});

function simulateDownloadTask(charName, fileIndex, total) {
  return async () => {
    // Simulate variable download speeds
    await new Promise(r => setTimeout(r, 50 + Math.random() * 100));

    if (Math.random() < 0.05) {
      emitEvent('error', {
        character: charName,
        message: '1 file(s) failed to download'
      });
      return;
    }

    emitEvent('progress', {
      character: charName,
      completed: fileIndex + 1,
      total
    });
  };
}

router.get('/test-download', async (request, response) => {
    if (downloadInProgress) {
        return response.status(429).json({ error: 'Download already in progress' });
    }

    downloadInProgress = true;
    response.json({ success: true });

    const testCharacters = [
        { name: 'Ava', files: 24 },
        { name: 'Belle', files: 36 },
        { name: 'Bianca', files: 18 },
        { name: 'Blake', files: 30 },
        { name: 'Briar', files: 22 },
        { name: 'Cairo', files: 20 },
        { name: 'Cerberus Sisters', files: 48 },
        { name: 'Dash', files: 26 },
        { name: 'Ellie', files: 19 },
        { name: 'Eve', files: 28 },
        { name: 'Fasti', files: 17 },
        { name: 'Gem', files: 21 },
        { name: 'Indigo', files: 33 },
        { name: 'Jenn', files: 25 },
        { name: 'Kai', files: 23 },
        { name: 'Karmen', files: 16 },
        { name: 'Kiera', files: 31 },
        { name: 'Koshizu', files: 27 },
        { name: 'Kris', files: 14 },
        { name: 'Luna', files: 29 },
        { name: 'Mika', files: 22 },
        { name: 'Nix', files: 24 },
        { name: 'Rivet', files: 20 },
        { name: 'Rivera', files: 18 },
        { name: 'Rosa', files: 26 },
        { name: 'Serra', files: 23 },
        { name: 'Summer', files: 32 },
        { name: 'Sunny', files: 19 },
        { name: 'Vera', files: 21 },
        { name: 'Willow', files: 15 },
    ];

    try {
        const tasks = [];

        for (const char of testCharacters) {
            for (let i = 0; i < char.files; i++) {
                tasks.push(simulateDownloadTask(char.name, i, char.files));
            }
        }

        const limit = pLimit(10);
        await Promise.all(tasks.map(task => limit(task)));

        emitEvent('complete', { aborted: false, failed: undefined });
        activeStream?.end();
        activeStream = null;

        response.json({ success: true });
    } catch (error) {
        emitEvent('complete', { aborted: true, failed: [] });
        activeStream?.end();
        activeStream = null;
        response.status(500).json({ error: error.message });
    } finally {
        downloadInProgress = false;
    }
});
