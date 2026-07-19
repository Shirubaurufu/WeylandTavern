import { ASSET_BASE_URL } from './assetPaths.js';

export const DEFAULT_PLACEHOLDER_PORTRAITS = Object.freeze([
    `${ASSET_BASE_URL}/contact-placeholders/generic-wolfgirl.webp`,
    `${ASSET_BASE_URL}/contact-placeholders/generic-bunnygirl.webp`,
    `${ASSET_BASE_URL}/contact-placeholders/generic-foxgirl.webp`,
]);

/**
 * Gives an unknown character a stable placeholder across every WeyPhone app.
 * FNV-1a is small, deterministic, and distributes ordinary character names well
 * enough that a contact list does not fill with the same silhouette.
 * @param {string} characterName
 */
export function placeholderPortraitUrl(characterName) {
    const name = String(characterName ?? '').trim().toLocaleLowerCase();
    let hash = 0x811c9dc5;
    for (let index = 0; index < name.length; index += 1) {
        hash ^= name.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return DEFAULT_PLACEHOLDER_PORTRAITS[(hash >>> 0) % DEFAULT_PLACEHOLDER_PORTRAITS.length];
}
