import { canonicalCharacterName, displayCharacterName } from './characterIdentity.js';

function localPortraitUrl(character, getThumbnailUrl) {
    if (!character?.avatar || typeof getThumbnailUrl !== 'function') return null;
    try {
        return getThumbnailUrl('avatar', character.avatar);
    } catch {
        return null;
    }
}

function installedOnlyEntry(character, getThumbnailUrl) {
    return {
        name: displayCharacterName(character.name),
        gender: '',
        age: '',
        birthday: '',
        height: '',
        species: '',
        summary: 'Installed character card',
        occupation: '',
        home: '',
        association: '',
        handle: '',
        tag: ['Installed'],
        description: '',
        image: '',
        localPortraitUrl: localPortraitUrl(character, getThumbnailUrl),
        installedOnly: true,
    };
}

/**
 * Enriches directory contacts with installed-card thumbnails and appends cards absent from both
 * the official cast and Registrar directories. A local-only card exists only for that user, so
 * unreleased/development characters never leak into anyone else's contact list.
 * @param {Array<object>} entries
 * @param {Array<{name: string, avatar?: string}>} characters
 * @param {(type: string, file: string) => string} getThumbnailUrl
 * @param {(directoryName: string) => string|null} resolveInstalledName
 */
export function mergeInstalledContacts(entries, characters, getThumbnailUrl, resolveInstalledName) {
    const installed = Array.isArray(characters) ? characters.filter(character => String(character?.name ?? '').trim()) : [];
    const byName = new Map(installed.map(character => [canonicalCharacterName(character.name), character]));
    const representedCards = new Set();

    const merged = (Array.isArray(entries) ? entries : []).map(entry => {
        const installedName = resolveInstalledName?.(entry.name);
        const character = installedName ? byName.get(canonicalCharacterName(installedName)) : null;
        if (!character) return entry;
        representedCards.add(canonicalCharacterName(character.name));
        return { ...entry, localPortraitUrl: localPortraitUrl(character, getThumbnailUrl) };
    });

    const knownDirectoryNames = new Set(merged.map(entry => canonicalCharacterName(entry.name)));
    for (const character of installed) {
        const key = canonicalCharacterName(character.name);
        if (representedCards.has(key) || knownDirectoryNames.has(key)) continue;
        representedCards.add(key);
        knownDirectoryNames.add(key);
        merged.push(installedOnlyEntry(character, getThumbnailUrl));
    }
    return merged;
}
