import { canonicalCharacterName, displayCharacterName } from './characterIdentity.js';
// The outfit rules (which outfits are NSFW, which need Paw Patrol Plus) are quick-reply-ext's, the module that dresses
// the character; one copy so Mien and the costume system can't disagree. Pure module, safe to import here.
import { isExtraOutfit, isNsfwOutfit, outfitDisplayName } from '../../quick-reply-ext/src/outfitPick.js';
export { isExtraOutfit };

const REGISTRAR_MANIFEST_BASE = 'https://registrar.weybooru.com/expressions/';
const REGISTRAR_OUTFITS = [
    { id: 'clothed', label: 'Clothed' },
    { id: 'underwear', label: 'Underwear' },
    { id: 'nude', label: 'Nude' },
];
const COMMON_LOCAL_OUTFIT_FOLDERS = [
    'Regular Outfit',
    'Lingerie',
    'Naked',
    'CommunityRegular Outfit',
    'CommunityLingerie',
    'CommunityNaked',
];

function truthy(value) {
    return /^(true|1|yes|on)$/i.test(String(value ?? '').trim());
}

function latestAssistantMessage(context) {
    return [...(Array.isArray(context?.chat) ? context.chat : [])]
        .reverse()
        .find(message => message && !message.is_user && !message.is_system) ?? null;
}

function avatarBaseName(avatar) {
    return String(avatar ?? '').replace(/\.[^/.]+$/, '');
}

/** WT's NSFW variable is inverted: "true" means hide NSFW images ("force safe"). A chat value beats the global. */
export function mienForceSafe(context) {
    const localNsfw = context?.chatMetadata?.variables?.NSFW;
    const globalNsfw = context?.extensionSettings?.variables?.global?.NSFW;
    return truthy(localNsfw !== undefined ? localNsfw : globalNsfw);
}

/** "Summer/Cheerleader" -> "Cheerleader"; a bare character folder (the Default set) -> "". */
export function outfitNameOf(folderName) {
    const text = String(folderName ?? '');
    const slash = text.indexOf('/');
    return slash < 0 ? '' : text.slice(slash + 1);
}

/**
 * While NSFW images are hidden, the old wand-menu picker never offered Lingerie or Naked; Mien listed every folder
 * and so showed nude sprites to players who had asked not to see them. Same rule now, Registrar sets included.
 */
export function withoutNsfwOutfits(outfits, forceSafe) {
    if (!forceSafe || !Array.isArray(outfits)) return outfits ?? [];
    return outfits.filter(outfit => outfit.source === 'registrar'
        ? !['underwear', 'nude'].includes(outfit.outfit)
        : !isNsfwOutfit(outfitNameOf(outfit.folderName)));
}

function currentOutfitBucket(context) {
    const message = latestAssistantMessage(context)?.mes ?? '';
    const forceSafe = mienForceSafe(context);
    if (!forceSafe && message.includes('[NK]')) return { local: 'Naked', registrar: 'nude' };
    if (!forceSafe && message.includes('[LG]')) return { local: 'Lingerie', registrar: 'underwear' };
    return { local: 'Regular Outfit', registrar: 'clothed' };
}

/**
 * Resolves the character whose gallery should be shown. In groups this follows the latest
 * assistant speaker; in a one-on-one chat it uses the active card.
 */
export function resolveMienCharacter(context) {
    if (!context || (context.characterId === undefined && !context.groupId)) return null;
    const latest = latestAssistantMessage(context);
    if (context.groupId) {
        const name = String(latest?.name ?? '').trim();
        if (!name) return null;
        const avatar = latest?.original_avatar
            ?? context.characters?.find(character => latest?.force_avatar?.includes(encodeURIComponent(character.avatar)))?.avatar
            ?? context.characters?.find(character => character.name === name)?.avatar
            ?? '';
        return { name, avatar, message: latest };
    }

    const character = context.characters?.[context.characterId];
    const name = String(character?.name ?? context.name2 ?? latest?.name ?? '').trim();
    if (!name) return null;
    return { name, avatar: character?.avatar ?? '', message: latest };
}

function visibleSpriteFolder(characterName, documentRef) {
    const normalized = characterName.toLowerCase();
    const images = Array.from(documentRef?.querySelectorAll?.('img.expression[data-sprite-folder-name]') ?? []);
    return images
        .map(image => image.getAttribute('data-sprite-folder-name') ?? '')
        .find(folder => folder.split('/')[0].trim().toLowerCase() === normalized) ?? '';
}

/**
 * Resolve the sprite folder the SAME way SillyTavern's own expression extension does
 * (see getSpriteFolderName in extensions/expressions/index.js): the folder is the character
 * name UNLESS an expression override exists for this character's avatar filename, in which case
 * ST renders from the override's `path`. Overrides are stored as { name: <avatarFilename>, path }
 * (see quick-reply-ext ExpressionOverride) and are how Weyland's outfit system points a character
 * at sprites that don't live under a name-matching folder.
 *
 * Mien previously only *guessed* folders from the character name, so any character whose real
 * folder came from an override (e.g. Sofya) showed a live expression in the roleplay but reported
 * "no expressions" in Mien. Reading the same override ST reads makes this the single source of
 * truth instead of guesswork. Returns '' when there is no override (caller falls back to the name).
 */
export function resolveOverrideFolder(context, character) {
    const overrides = context?.extensionSettings?.expressionOverrides;
    if (!Array.isArray(overrides) || !character) return '';
    const avatarBase = avatarBaseName(character.avatar);
    // Primary: ST's own key — the override name equals the avatar filename (with or without its
    // extension). Fallback: match by canonical character name, which also folds decorated/Unicode
    // card names down to their plain form (e.g. a stylized "Nara" card matching a "Nara" override).
    // Matching both ways keeps the previous lenient behavior while adding ST's exact resolution.
    const aliasKeys = new Set([
        character.name,
        displayCharacterName(character.name),
        avatarBase,
        displayCharacterName(avatarBase),
    ].map(canonicalCharacterName).filter(Boolean));
    const override = overrides.find(entry => {
        const key = String(entry?.name ?? '').trim();
        if (!key) return false;
        if (avatarBase && (key === avatarBase || key === character.avatar || avatarBaseName(key) === avatarBase)) return true;
        return aliasKeys.has(canonicalCharacterName(key));
    });
    return override?.path ? String(override.path).trim() : '';
}

export function mienFolderCandidates(context, character, documentRef = globalThis.document) {
    const outfit = currentOutfitBucket(context);
    const avatarBase = avatarBaseName(character.avatar);
    const aliases = [...new Set([
        character.name,
        displayCharacterName(character.name),
        avatarBase,
        displayCharacterName(avatarBase),
    ].map(value => String(value ?? '').trim()).filter(Boolean))];
    // Authoritative folder: whatever ST itself resolves for this character — the character name,
    // or an expression override keyed by the avatar filename (exactly how getSpriteFolderName in
    // extensions/expressions/index.js resolves it). This is the exact folder ST renders from, so it
    // is guaranteed to contain sprites — no guessing. If the override points at an outfit subfolder
    // (e.g. "Sofya/Regular Outfit"), derive its base so the sibling outfits can be enumerated too.
    const overrideFolder = resolveOverrideFolder(context, character);
    const overrideBase = overrideFolder.includes('/')
        ? overrideFolder.slice(0, overrideFolder.lastIndexOf('/'))
        : overrideFolder;
    const candidates = [
        // The currently-visible sprite folder stays highest priority so the open outfit is selected
        // first; the override folder is the authoritative fallback when the DOM has no usable match.
        visibleSpriteFolder(character.name, documentRef),
        overrideFolder,
        ...aliases.map(name => `${name}/${outfit.local}`),
        ...aliases.flatMap(name => COMMON_LOCAL_OUTFIT_FOLDERS.map(folder => `${name}/${folder}`)),
        ...aliases,
        // Sibling outfits under a custom override base (e.g. "SofyaSprites/Naked") — lower priority
        // so they only fill in when the name-based guesses don't already cover them.
        overrideBase,
        ...(overrideBase ? COMMON_LOCAL_OUTFIT_FOLDERS.map(folder => `${overrideBase}/${folder}`) : []),
    ];
    return [...new Set(candidates.map(value => String(value ?? '').trim()).filter(Boolean))];
}

function fileNameFromPath(path) {
    const raw = String(path ?? '').split('/').pop()?.split('?')[0] ?? '';
    try { return decodeURIComponent(raw); } catch { return raw; }
}

export function normalizeLocalSprites(sprites, folderName) {
    if (!Array.isArray(sprites)) return [];
    return sprites
        .filter(sprite => sprite && typeof sprite.path === 'string' && typeof sprite.label === 'string')
        .map(sprite => ({
            label: sprite.label,
            path: sprite.path,
            fileName: fileNameFromPath(sprite.path),
            folderName,
            source: 'local',
        }));
}

export function normalizeRegistrarSprites(sprites, characterName, outfit) {
    if (!Array.isArray(sprites)) return [];
    return sprites
        .filter(sprite => sprite && typeof sprite.path === 'string' && typeof sprite.label === 'string')
        .map(sprite => ({
            label: sprite.label,
            path: sprite.path,
            fileName: fileNameFromPath(sprite.path),
            folderName: characterName,
            outfit,
            source: 'registrar',
        }));
}

async function fetchJson(url, fetchImpl, credentials = 'omit') {
    let fallbackTimer = null;
    try {
        const request = { method: 'GET', credentials };
        if (globalThis.AbortSignal?.timeout) {
            request.signal = globalThis.AbortSignal.timeout(5000);
        } else if (globalThis.AbortController) {
            const controller = new globalThis.AbortController();
            request.signal = controller.signal;
            fallbackTimer = setTimeout(() => controller.abort(), 5000);
        }
        const response = await fetchImpl(url, request);
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    } finally {
        if (fallbackTimer) clearTimeout(fallbackTimer);
    }
}

function localOutfitLabel(characterName, folderName) {
    if (folderName === characterName) return 'Default';
    const label = folderName.split('/').slice(1).join(' / ') || folderName;
    // "Undergarments" for the characters the old costume menu worded that way, "Community · ..." for Nara's
    // community sets (folders named "CommunityRegular Outfit" etc.). Shared with quick-reply-ext.
    return outfitDisplayName(folderName.split('/')[0], label);
}

function outfitRecord({ source, label, folderName, outfit = '', expressions }) {
    return {
        id: source === 'local' ? `local:${folderName}` : `registrar:${outfit}`,
        source,
        label,
        folderName,
        outfit,
        expressions,
        expressionCount: expressions.length,
        // Wearing it needs Paw Patrol Plus or above (extra outfits; Registrar sets can't be worn at all).
        extra: source === 'local' && isExtraOutfit(outfitNameOf(folderName), String(folderName).split('/')[0]),
    };
}

async function findLocalOutfits(context, character, fetchImpl, documentRef) {
    const preferredFolders = mienFolderCandidates(context, character, documentRef);
    // Enumerates a character's REAL outfit subfolders. This is what surfaces non-conventional
    // outfits (Summer/Baker, Mika/Santa, Weybot/female, …) that no name-guess list can cover.
    // Requires GET /api/sprites/folders — see src/endpoints/sprites.js.
    // Local sprite APIs share SillyTavern's session/HTTP authentication. External Registrar
    // manifests keep fetchJson's credential-free default, including when following redirects.
    const folderData = await fetchJson(`/api/sprites/folders?name=${encodeURIComponent(character.name)}`, fetchImpl, 'same-origin');
    const discoveredFolders = Array.isArray(folderData)
        ? folderData
            .filter(entry => entry && typeof entry.name === 'string' && !('path' in entry))
            .map(entry => entry.name ? `${character.name}/${entry.name}` : character.name)
        : [];
    const folderNames = [...new Set([...preferredFolders, ...discoveredFolders])];
    const outfits = await Promise.all(folderNames.map(async folderName => {
        const data = await fetchJson(`/api/sprites/get?name=${encodeURIComponent(folderName)}`, fetchImpl, 'same-origin');
        const expressions = normalizeLocalSprites(data, folderName);
        if (!expressions.length) return null;
        return outfitRecord({
            source: 'local',
            label: localOutfitLabel(character.name, folderName),
            folderName,
            expressions,
        });
    }));
    const seenLabels = new Set();
    return outfits.filter(outfit => {
        if (!outfit) return false;
        const key = outfit.label.toLocaleLowerCase();
        if (seenLabels.has(key)) return false;
        seenLabels.add(key);
        return true;
    });
}

async function findRegistrarOutfits(character, fetchImpl) {
    const names = [...new Set([character.name.toLowerCase(), character.name])];
    const outfits = await Promise.all(REGISTRAR_OUTFITS.map(async option => {
        for (const name of names) {
            const data = await fetchJson(`${REGISTRAR_MANIFEST_BASE}${encodeURIComponent(name)}/${encodeURIComponent(option.id)}`, fetchImpl);
            const expressions = normalizeRegistrarSprites(data, character.name, option.id);
            if (!expressions.length) continue;
            return outfitRecord({
                source: 'registrar',
                label: option.label,
                folderName: character.name,
                outfit: option.id,
                expressions,
            });
        }
        return null;
    }));
    return outfits.filter(Boolean);
}

export function selectMienOutfit(gallery, outfitId) {
    if (!gallery) return gallery;
    const selected = gallery.outfits?.find(outfit => outfit.id === outfitId)
        ?? gallery.outfits?.[0]
        ?? null;
    return {
        ...gallery,
        selectedOutfitId: selected?.id ?? '',
        expressions: selected?.expressions ?? [],
        source: selected?.source ?? null,
        folderName: selected?.folderName ?? '',
        outfit: selected?.outfit ?? '',
    };
}

export async function loadMienGallery(context, {
    fetchImpl = globalThis.fetch,
    documentRef = globalThis.document,
    outfitId = '',
    sets = null,
} = {}) {
    const character = resolveMienCharacter(context);
    if (!character) return { character: null, outfits: [], selectedOutfitId: '', expressions: [], source: null, folderName: '' };
    const safe = mienForceSafe(context);
    if (Array.isArray(sets) && sets.length > 1) return loadDuoGallery(character, sets, { fetchImpl, outfitId, safe });
    const localOutfits = withoutNsfwOutfits(await findLocalOutfits(context, character, fetchImpl, documentRef), safe);
    const outfits = localOutfits.length ? localOutfits : withoutNsfwOutfits(await findRegistrarOutfits(character, fetchImpl), safe);
    const preferredRegistrarId = `registrar:${currentOutfitBucket(context).registrar}`;
    return selectMienOutfit({
        character,
        outfits,
        expressions: [],
        source: null,
        folderName: '',
        outfit: '',
    }, outfitId || (localOutfits.length ? localOutfits[0]?.id : preferredRegistrarId));
}

/**
 * A duo card ("Lyris & Vesper", "Cerberus Sisters") is drawn from several sprite sets, quick-reply-ext's
 * WeylandOutfits.describe().sets: combined ones ("LyrisVesper") and each member's own. Every outfit is tagged with
 * its set (`set`, `setLabel`) so the screen can show a "who's showing" switch. Sets with no sprites drop out
 * (Fawne has none yet). The card's own name folder is never a set: duo cards don't draw from it.
 */
async function loadDuoGallery(character, sets, { fetchImpl, outfitId, safe }) {
    const noDom = { querySelectorAll: () => [] };
    const perSet = await Promise.all(sets.map(async set => {
        const outfits = await findLocalOutfits({}, { name: set.base, avatar: '' }, fetchImpl, noDom);
        return withoutNsfwOutfits(outfits, safe).map(outfit => ({ ...outfit, set: set.base, setLabel: set.label }));
    }));
    const outfits = perSet.flat();
    return selectMienOutfit({
        character,
        duo: true,
        outfits,
        expressions: [],
        source: null,
        folderName: '',
        outfit: '',
    }, outfitId || outfits[0]?.id);
}

/**
 * Bonus (extra) outfits are a Paw Patrol Plus perk. Without Plus, Mien still shows them, but only their neutral
 * face is open (Lucky, 2026-11-18): the rest are marked `plusLocked` and the screen draws them as locked teasers.
 * Base outfits and members are untouched. Returns a new gallery; the expressions are copied, not mutated.
 */
export function lockBonusFaces(gallery, member) {
    if (member || !gallery?.outfits?.length) return gallery;
    const outfits = gallery.outfits.map(outfit => outfit.extra
        ? { ...outfit, expressions: outfit.expressions.map(expression => ({ ...expression, plusLocked: expression.label !== 'neutral' })) }
        : outfit);
    return selectMienOutfit({ ...gallery, outfits }, gallery.selectedOutfitId);
}

/** Where to start in an outfit's strip: the first face the player may use (neutral, in a locked bonus outfit). */
export function firstOpenFace(expressions) {
    const index = (expressions ?? []).findIndex(expression => !expression.plusLocked);
    return index < 0 ? 0 : index;
}

/** The first sprite in `outfit` with this mood label, or null. Used to carry a locked face into a new outfit. */
export function sameFaceIn(outfit, label) {
    return outfit?.expressions?.find(expression => expression.label === label) ?? null;
}

function findExpressionImage(characterName, documentRef) {
    const normalized = characterName.toLowerCase();
    const images = Array.from(documentRef?.querySelectorAll?.('img.expression') ?? []);
    return images.find(image => (image.getAttribute('data-sprite-folder-name') ?? '').split('/')[0].toLowerCase() === normalized)
        ?? images[0]
        ?? null;
}

export async function applyMienExpression(selection, characterName, { documentRef = globalThis.document } = {}) {
    if (!selection) throw new Error('No expression selected.');
    if (selection.source === 'local') {
        const { sendExpressionCall } = await import('../../expressions/index.js');
        await sendExpressionCall(selection.folderName, selection.label, {
            force: true,
            overrideSpriteFile: selection.fileName,
        });
        return;
    }

    const image = findExpressionImage(characterName, documentRef);
    if (!image) throw new Error('The Expressions display is not available in this chat.');
    image.src = selection.path;
    image.setAttribute('data-expression', selection.label);
    image.setAttribute('data-sprite-filename', selection.fileName);
    image.setAttribute('data-sprite-folder-name', characterName);
    image.setAttribute('title', selection.label);
    image.closest('#expression-holder, .expression-holder')?.style.setProperty('display', '');
}

// Where locks are saved. NOT "mienLocks": the 2026-11-10 release wrote a lock there every time a
// player pressed "Set in chat", lock button or not, so faces stuck for players who never asked
// for a lock. Nothing reads that old key any more, which frees every one of those players without
// them doing anything. A lock set on purpose in that one day has to be set again.
const LOCKS = 'mienExpressionLocks';

/** The face locked for this character (Mien's lock button), or null. The snapshot carries every
 *  field applyMienExpression needs, so a lock keeps working after the gallery is reloaded. */
export function lockedMienExpression(settings, characterName) {
    const lock = settings?.[LOCKS]?.[characterName];
    return lock?.label ? lock : null;
}

/** "Set in chat" while a lock is holding: the lock follows to the new face. With no lock this does
 *  nothing, so a plain "Set in chat" lasts until the next character message, as it always has.
 *  @returns {boolean} whether a lock moved. */
export function moveLockedMienExpression(settings, characterName, selection) {
    if (!selection || !lockedMienExpression(settings, characterName)) return false;
    return setLockedMienExpression(settings, characterName, selection);
}

/** Sets (selection given) or clears (null) the lock. @returns {boolean} whether anything changed. */
export function setLockedMienExpression(settings, characterName, selection) {
    if (!settings || !characterName) return false;
    if (!settings[LOCKS] || typeof settings[LOCKS] !== 'object' || Array.isArray(settings[LOCKS])) {
        settings[LOCKS] = {};
    }
    if (!selection) {
        if (!settings[LOCKS][characterName]) return false;
        delete settings[LOCKS][characterName];
        return true;
    }
    const snapshot = {
        label: selection.label,
        path: selection.path,
        fileName: selection.fileName,
        folderName: selection.folderName,
        source: selection.source,
    };
    const current = settings[LOCKS][characterName];
    if (current && ['label', 'path', 'fileName', 'folderName', 'source'].every(field => current[field] === snapshot[field])) return false;
    settings[LOCKS][characterName] = snapshot;
    return true;
}
