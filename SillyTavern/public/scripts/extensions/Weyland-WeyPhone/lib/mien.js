import { canonicalCharacterName, displayCharacterName } from './characterIdentity.js';

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

function currentOutfitBucket(context) {
    const message = latestAssistantMessage(context)?.mes ?? '';
    const localNsfw = context?.chatMetadata?.variables?.NSFW;
    const globalNsfw = context?.extensionSettings?.variables?.global?.NSFW;
    const forceSafe = truthy(localNsfw !== undefined ? localNsfw : globalNsfw);
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

async function fetchJson(url, fetchImpl) {
    let fallbackTimer = null;
    try {
        const request = { method: 'GET', credentials: 'omit' };
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
    return folderName.split('/').slice(1).join(' / ') || folderName;
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
    };
}

async function findLocalOutfits(context, character, fetchImpl, documentRef) {
    const preferredFolders = mienFolderCandidates(context, character, documentRef);
    // Enumerates a character's REAL outfit subfolders. This is what surfaces non-conventional
    // outfits (Summer/Baker, Mika/Santa, Weybot/female, …) that no name-guess list can cover.
    // Requires GET /api/sprites/folders — see src/endpoints/sprites.js.
    const folderData = await fetchJson(`/api/sprites/folders?name=${encodeURIComponent(character.name)}`, fetchImpl);
    const discoveredFolders = Array.isArray(folderData)
        ? folderData
            .filter(entry => entry && typeof entry.name === 'string' && !('path' in entry))
            .map(entry => entry.name ? `${character.name}/${entry.name}` : character.name)
        : [];
    const folderNames = [...new Set([...preferredFolders, ...discoveredFolders])];
    const outfits = await Promise.all(folderNames.map(async folderName => {
        const data = await fetchJson(`/api/sprites/get?name=${encodeURIComponent(folderName)}`, fetchImpl);
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
} = {}) {
    const character = resolveMienCharacter(context);
    if (!character) return { character: null, outfits: [], selectedOutfitId: '', expressions: [], source: null, folderName: '' };
    const localOutfits = await findLocalOutfits(context, character, fetchImpl, documentRef);
    const outfits = localOutfits.length ? localOutfits : await findRegistrarOutfits(character, fetchImpl);
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
