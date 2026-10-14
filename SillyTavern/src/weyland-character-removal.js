// Removing characters from the Character Downloader (src/endpoints/weyland.js -> POST /remove-character).
//
// Why this exists: the Downloader could add characters but never take them away, and a card that is
// not part of the Weyland roster (the stock "Assistant" card left over from a plain SillyTavern
// install, a card someone imported) cannot even be opened to delete it: Weyland's card-authenticity
// check (the "Descr" Quick Reply) kicks the chat out and reloads the page. So removal lives here,
// next to the thing that installed it.
//
// What a removal touches, and what it deliberately leaves alone:
//   - the card PNG and its cached thumbnail (the same two things SillyTavern's own delete removes),
//   - the character's expression files and bundled lorebooks, but ONLY files the download manifests
//     list for that character, and never anything another installed character also lists (Blake,
//     Serra and "Blake & Serra" share sprite folders; removing the pair must not strip the singles),
//   - folders it emptied (only if they are now empty: anything a user added by hand survives),
//   - NOT chats, NOT WeyPhone texts, NOT per-chat memory books. Those are the player's own story and
//     a re-download brings the character straight back to them.
//
// Planning is pure (no disk access) so the sharing rules are unit-tested; executing the plan is a
// thin, forgiving loop that reports what it could not delete instead of stopping halfway.

import { readdir, rmdir, unlink } from 'node:fs/promises';
import { join, sep } from 'node:path';

const key = value => String(value ?? '').toLowerCase();

/** Every subcharacter / costume / expression / lorebook a manifest entry lists. */
function assetsOf(entry) {
    const expressions = [];
    for (const sub of entry?.subcharacters ?? []) {
        if (!sub?.name) continue;
        for (const costume of sub.costumes ?? []) {
            for (const expr of costume.expressions ?? []) {
                if (expr?.filename) expressions.push({ sub: sub.name, costume: costume.name, filename: expr.filename });
            }
        }
    }
    const lorebooks = (entry?.lorebooks ?? []).map(l => l?.filename).filter(Boolean);
    const subs = (entry?.subcharacters ?? []).map(s => s?.name).filter(Boolean);
    return { expressions, lorebooks, subs };
}

/**
 * A file or folder name that came out of a manifest must stay a plain name: no separators, no
 * "..". Manifests come from our own CDN, but a removal deletes things, so it trusts nothing.
 * @param {string} name
 */
export function isPlainName(name) {
    const value = String(name ?? '');
    return value.length > 0 && value !== '.' && value !== '..' && !/[\\/]/.test(value) && !value.includes('\0');
}

/**
 * Works out exactly which files removing `name` deletes.
 * @param {{ name: string, remoteManifest?: any, localManifest?: any }} input
 * @returns {{ name: string, card: string, expressions: {sub:string,costume:string,filename:string}[], lorebooks: string[],
 *            folders: {sub:string,costume?:string}[], sharedSubs: string[], sharedLorebooks: string[] }}
 */
export function planCharacterRemoval({ name, remoteManifest, localManifest }) {
    if (!isPlainName(name)) throw new Error('Invalid character name');
    const target = key(name);
    const remoteEntry = remoteManifest?.characters?.find(c => key(c.name) === target);
    const localEntry = localManifest?.characters?.find(c => key(c.name) === target);
    // Prefer the manifest's own spelling of the name: on Windows the file keeps its original casing.
    const canonical = remoteEntry?.name ?? localEntry?.name ?? name;

    // What every OTHER installed character still needs. "Installed" = the record has a card version,
    // the same rule the Downloader uses to show "Installed".
    const keepSubs = new Set();
    const keepLore = new Set();
    for (const other of localManifest?.characters ?? []) {
        if (key(other.name) === target || other.version == null) continue;
        const remoteOther = remoteManifest?.characters?.find(c => key(c.name) === key(other.name));
        for (const source of [other, remoteOther]) {
            const assets = assetsOf(source);
            assets.subs.forEach(s => keepSubs.add(key(s)));
            assets.lorebooks.forEach(l => keepLore.add(key(l)));
        }
    }

    const expressions = new Map();
    const lorebooks = new Map();
    const folders = new Map();
    const sharedSubs = new Set();
    const sharedLorebooks = new Set();
    for (const source of [remoteEntry, localEntry]) {
        const assets = assetsOf(source);
        for (const expr of assets.expressions) {
            if (![expr.sub, expr.costume, expr.filename].every(isPlainName)) continue;
            if (keepSubs.has(key(expr.sub))) { sharedSubs.add(expr.sub); continue; }
            expressions.set(key(`${expr.sub}/${expr.costume}/${expr.filename}`), expr);
            folders.set(key(`${expr.sub}/${expr.costume}`), { sub: expr.sub, costume: expr.costume });
            folders.set(key(expr.sub), { sub: expr.sub });
        }
        for (const lore of assets.lorebooks) {
            if (!isPlainName(lore)) continue;
            if (keepLore.has(key(lore))) { sharedLorebooks.add(lore); continue; }
            lorebooks.set(key(lore), lore);
        }
    }

    return {
        name: canonical,
        card: `${canonical}.png`,
        expressions: [...expressions.values()],
        lorebooks: [...lorebooks.values()],
        // Deepest first, so a costume folder is tried before the subcharacter folder holding it.
        folders: [...folders.values()].sort((a, b) => Number(Boolean(b.costume)) - Number(Boolean(a.costume))),
        sharedSubs: [...sharedSubs],
        sharedLorebooks: [...sharedLorebooks],
    };
}

/**
 * Cards in the characters folder that are not part of the Weyland roster: not on the remote
 * manifest and not in the local download record. These are what the Downloader offers to remove
 * under "Not from the roster".
 * @param {string[]} fileNames entries of the characters folder
 * @param {any} remoteManifest
 * @param {any} localManifest
 * @returns {string[]} card names without the .png extension, sorted
 */
export function listOtherCards(fileNames, remoteManifest, localManifest) {
    const known = new Set([
        ...(remoteManifest?.characters ?? []).map(c => key(c.name)),
        ...(localManifest?.characters ?? []).map(c => key(c.name)),
    ]);
    return fileNames
        .filter(file => /\.png$/i.test(file))
        .map(file => file.replace(/\.png$/i, ''))
        .filter(cardName => isPlainName(cardName) && !known.has(key(cardName)))
        .sort((a, b) => a.localeCompare(b));
}

/** Removes one file; a file that is already gone counts as removed. */
async function removeFile(path, problems) {
    try {
        await unlink(path);
        return true;
    } catch (error) {
        if (error?.code === 'ENOENT') return false;
        problems.push(`${path.split(sep).slice(-3).join('/')}: ${error?.code || error?.message}`);
        return false;
    }
}

/** Removes a folder only if it is empty now; anything a user put there by hand keeps it alive. */
async function pruneFolder(path) {
    try {
        if ((await readdir(path)).length === 0) await rmdir(path);
    } catch { /* missing or not empty: leave it */ }
}

/**
 * Carries out a plan. Never throws for a single file: it collects what failed (antivirus, a file
 * open elsewhere) so the Downloader can say so, and still removes everything else.
 * @param {ReturnType<typeof planCharacterRemoval>} plan
 * @param {{ charactersPath: string, worldsPath: string, invalidateThumbnail?: (file: string) => void }} paths
 */
export async function executeCharacterRemoval(plan, { charactersPath, worldsPath, invalidateThumbnail }) {
    const problems = [];
    let removed = 0;

    if (await removeFile(join(charactersPath, plan.card), problems)) removed++;
    try {
        invalidateThumbnail?.(plan.card);
    } catch { /* a stale thumbnail is cosmetic and regenerates */ }

    for (const expr of plan.expressions) {
        if (await removeFile(join(charactersPath, expr.sub, expr.costume, expr.filename), problems)) removed++;
    }
    for (const folder of plan.folders) {
        await pruneFolder(folder.costume ? join(charactersPath, folder.sub, folder.costume) : join(charactersPath, folder.sub));
    }
    for (const lore of plan.lorebooks) {
        if (await removeFile(join(worldsPath, lore), problems)) removed++;
    }
    return { removed, problems };
}

/**
 * Forgets a character in the download record so it shows as "not installed" and a later download
 * fetches every file again (not just the ones the old record thought were missing).
 * @param {any} localManifest
 * @param {string} name
 * @returns {boolean} whether the record changed
 */
export function forgetInRecord(localManifest, name) {
    const list = localManifest?.characters;
    if (!Array.isArray(list)) return false;
    const index = list.findIndex(c => key(c.name) === key(name));
    if (index < 0) return false;
    list.splice(index, 1);
    return true;
}

