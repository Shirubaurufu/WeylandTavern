import express from 'express';
import { readdir, stat, writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const router = express.Router();
const rateLimits = {
  'fetch-key': { lastCall: 0, cooldown: 2000 },
  'fetch-manifests': { lastCall: 0, cooldown: 2000 },
  'download': {lastCall: 0, cooldown: 5000 }
};

const BASE_URL = 'https://WeylandTavern.b-cdn.net';
const EXTENSION_PATH = join(__dirname, '..', '..', 'public', 'scripts', 'extensions', 'Weyland-Downloader', 'Bunny');
const KEY_FILE_PATH = join(EXTENSION_PATH, 'key.wtk');
const LOCAL_MANIFEST_PATH = join(EXTENSION_PATH, 'local-manifest.json');

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
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchFromBunny(url, signal);
      return response;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, retryDelayMiliseconds));
      }
    }
  }
  return null; // Both attempts failed
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

    return { characters };
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
            if (rebuildManifest) throw new Error();
            const content = await readFile(LOCAL_MANIFEST_PATH, 'utf-8');
            return JSON.parse(content);
        } catch {}
    }
    try {
        const localManifest = await buildLocalManifest(userPath, remoteManifest);
        await mkdir(EXTENSION_PATH, { recursive: true });
        await writeFile(LOCAL_MANIFEST_PATH, JSON.stringify(localManifest, null, 2));
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
    const localCharMap = new Map(localManifest.characters.map(c => [c.name, c]));

    const diffCharacters = [];

    for (const remoteChar of remoteManifest.characters) {
        const localChar = localCharMap.get(remoteChar.name);

        const updatePng = !localChar || localChar.version !== remoteChar.version;
        const diffSubcharacters = [];

        for (const remoteSub of remoteChar.subcharacters) {
            const localSub = localChar?.subcharacters.find(s => s.name === remoteSub.name);
            const diffCostumes = [];

            for (const remoteCostume of remoteSub.costumes) {
                const localCostume = localSub?.costumes.find(c => c.name === remoteCostume.name);
                const diffExpressions = [];

                for (const remoteExpr of remoteCostume.expressions) {
                    const localExpr = localCostume?.expressions.find(e => e.filename === remoteExpr.filename);
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
                const localLore = localChar?.lorebooks?.find(l => l.filename === remoteLore.filename);
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
       
        const localCharMap = new Map(localManifest.characters.map(c => [c.name, c]));

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
        let aborted = false;
        const abortController = new AbortController();

        for (const diffChar of diffChars) {
            const zoneFolder = diffChar.zoneHash;

            // Ensure character exists in local manifest
            if (!localCharMap.has(diffChar.name)) {
                const newChar = { name: diffChar.name, version: null, subcharacters: [] };
                localManifest.characters.push(newChar);
                localCharMap.set(diffChar.name, newChar);
            }

            const localChar = localCharMap.get(diffChar.name);

            // Stop JavaScript from complaining about potentially undefined entries
            if (localChar === undefined) continue;

            if (diffChar.updatePng) {
                const url = `${BASE_URL}/Characters/${zoneFolder}/${diffChar.name}/${diffChar.name}.png`;
                const destPath = join(charactersPath, `${diffChar.name}.png`);
                const characterName = diffChar.name;

                downloadTasks.push(async () => {
                    if (aborted) return;
                    try {
                        const response = await downloadWithRetry(url, abortController.signal);
                        if (!response) throw new Error('Failed after retry');

                        const buffer = Buffer.from(await response.arrayBuffer());
                        await mkdir(dirname(destPath), { recursive: true });
                        await writeFile(destPath, buffer);

                        localChar.version = diffChar.version;
                        consecutiveFailures = 0;

                        const charProgress = charTotals.get(characterName);
                        charProgress.completed++;
                        emitEvent('progress', { character: characterName, completed: charProgress.completed, total: charProgress.total });
                    } catch (error) {
                        failed.push({ character: characterName, file: `.png` });
                        if (error.name === 'AbortError') return;
                        consecutiveFailures++;

                        const charProgress = charTotals.get(characterName);
                        charProgress.failed++;
                        emitEvent('error', { character: characterName, message: `${charProgress.failed} file(s) failed to download` });

                        if (consecutiveFailures >= 10) {
                            aborted = true;
                            abortController.abort();
                        }
                    }
                });
            }

            for (const diffSub of diffChar.subcharacters) {
                let localSub = localChar.subcharacters.find(s => s.name === diffSub.name);
                if (!localSub) {
                    localSub = { name: diffSub.name, costumes: [] };
                    localChar.subcharacters.push(localSub);
                }

                for (const diffCostume of diffSub.costumes) {
                    let localCostume = localSub.costumes.find(c => c.name === diffCostume.name);
                    if (!localCostume) {
                        localCostume = { name: diffCostume.name, expressions: [] };
                        localSub.costumes.push(localCostume);
                    }

                    const costumePath = join(charactersPath, diffSub.name, diffCostume.name);

                    for (const diffExpr of diffCostume.expressions) {
                        const url = `${BASE_URL}/Characters/${zoneFolder}/${diffChar.name}/${diffSub.name}/${diffCostume.name}/${diffExpr.filename}`;
                        const destPath = join(costumePath, diffExpr.filename);
                        const characterName = diffChar.name;
                        const costumeName = diffCostume.name;
                        const filename = diffExpr.filename;
                        const version = diffExpr.version;

                        downloadTasks.push(async () => {
                            if (aborted) return;
                            try {
                                const response = await downloadWithRetry(url, abortController.signal);
                                if (!response) throw new Error('Failed after retry');

                                const buffer = Buffer.from(await response.arrayBuffer());
                                await mkdir(costumePath, { recursive: true });
                                await writeFile(destPath, buffer);

                                const localExpr = localCostume.expressions.find(e => e.filename === filename);
                                if (localExpr) {
                                    localExpr.version = version;
                                } else {
                                    localCostume.expressions.push({ filename, version });
                                }

                                consecutiveFailures = 0;

                                const charProgress = charTotals.get(characterName);
                                charProgress.completed++;
                                emitEvent('progress', { character: characterName, completed: charProgress.completed, total: charProgress.total });
                            } catch (error) {
                                failed.push({ character: characterName, file: `/${costumeName}/${filename}` });
                                if (error.name === 'AbortError') return;
                                consecutiveFailures++;

                                const charProgress = charTotals.get(characterName);
                                charProgress.failed++;
                                emitEvent('error', { character: characterName, message: `${charProgress.failed} file(s) failed to download` });

                                if (consecutiveFailures >= 10) {
                                    aborted = true;
                                    abortController.abort();
                                }
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
                    const url = `${BASE_URL}/Characters/${zoneFolder}/${diffChar.name}/${diffLore.filename}`;
                    const destPath = join(worldsPath, diffLore.filename);
                    const characterName = diffChar.name;
                    const loreName = diffLore.filename;
                    const loreVersion = diffLore.version;

                    downloadTasks.push(async () => {
                        if (aborted) return;
                        try {
                            const response = await downloadWithRetry(url, abortController.signal);
                            if (!response) throw new Error('Failed after retry');

                            const buffer = Buffer.from(await response.arrayBuffer());
                            await mkdir(dirname(destPath), { recursive: true });
                            await writeFile(destPath, buffer);

                            if (localChar.lorebooks !== undefined) {
                                const localLore = localChar.lorebooks.find(l => l.filename === loreName);
                                if (localLore) {
                                    localLore.version = loreVersion;
                                } else {
                                    localChar.lorebooks.push({ filename: loreName, version: loreVersion });
                                }
                            }

                            consecutiveFailures = 0;

                            const progress = charTotals.get(characterName);
                            progress.completed++;
                            emitEvent('progress', { character: characterName, completed: progress.completed, total: progress.total });
                        } catch (error) {
                            if (error.name === 'AbortError') return;
                            failed.push({ character: characterName, lorebook: loreName });
                            consecutiveFailures++;

                            const progress = charTotals.get(characterName);
                            progress.failed++;
                            emitEvent('error', { character: characterName, message: `${progress.failed} file(s) failed to download` });

                            if (consecutiveFailures >= 10) {
                                aborted = true;
                                abortController.abort();
                            }
                        }
                    });
                }
            }
        }

        // Execute with concurrency limit of 10
        const limit = pLimit(10);
        await Promise.all(downloadTasks.map(task => limit(task)));

        // Save updated local manifest regardless of failures
        await writeFile(LOCAL_MANIFEST_PATH, JSON.stringify(localManifest, null, 2));

        emitEvent('complete', { aborted, failed: failed.length > 0 ? failed : undefined });
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
