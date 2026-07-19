import { ASSET_BASE_URL } from './assetPaths.js';
import { placeholderPortraitUrl } from './placeholderPortraits.js';

const WEYBOORU_PORTRAIT_BASE_URL = 'https://cast.weybooru.com/images/portraits';

/**
 * Resolves a weybooru-CDN primary portrait URL plus a local SillyTavern-avatar fallback URL (or
 * a fallback initial, if the given name is empty) for each of the given character names.
 *
 * The weybooru URL is built from just the first word of `charName` (weybooru portrait filenames
 * are lowercase first names only, e.g. a multi-word character like "Kinsbane Manor" has its
 * portrait filed under "kinsbane.jpg") and attempted for EVERY name, regardless of
 * whether a matching local SillyTavern character card is actually installed — weybooru's own
 * catalog is independent of what's locally installed (e.g. it has real portraits for platform
 * roster characters like Fasti/Gem/Lyris even where no matching local character card exists, or
 * exists only under a different name/inside a combined multi-character card). Requiring a local
 * match before even trying weybooru was a real bug: several real roster names never got a portrait
 * attempted at all, even though the weybooru image genuinely existed and loaded fine on its own.
 *
 * `fallbackUrl` is the LOCAL SillyTavern avatar and `placeholderUrl` is one of WeyPhone's bundled
 * anonymous demi-human portraits. Rendering therefore degrades from cast CDN -> installed card ->
 * bundled placeholder, without ever exposing a broken-image square.
 *
 * Weybooru is a real third-party external CDN outside this codebase's control — callers must
 * preserve this fallback chain on load failure (see lib/panel.js's avatarMarkup).
 * @param {Array<{name: string, avatar: string}>} characters SillyTavern's context.characters
 * @param {string[]} charNames
 * @param {(type: string, file: string) => string} getThumbnailUrl SillyTavern's context.getThumbnailUrl
 * @returns {Record<string, {primaryUrl: string|null, fallbackUrl: string|null, placeholderUrl: string|null, initial: string|null}>}
 */
export function buildPortraitMap(characters, charNames, getThumbnailUrl) {
    const map = {};
    for (const charName of new Set(charNames)) {
        if (!charName) {
            map[charName] = { primaryUrl: null, fallbackUrl: null, placeholderUrl: null, initial: '' };
            continue;
        }
        const character = characters.find(c => c.name === charName);
        const firstName = charName.trim().split(/\s+/)[0].toLowerCase();
        map[charName] = {
            primaryUrl: `${WEYBOORU_PORTRAIT_BASE_URL}/${firstName}.jpg`,
            fallbackUrl: character ? getThumbnailUrl('avatar', character.avatar) : null,
            placeholderUrl: placeholderPortraitUrl(charName),
            initial: null,
        };
    }
    return map;
}

/**
 * Resolves a bundled local profile-picture asset for each PSA/business Twitter account —
 * unlike buildPortraitMap's character resolution, these are NOT weybooru CDN lookups or
 * SillyTavern character-card avatars; they're static images shipped with the extension itself
 * (assets/profiles/profile_<portraitKey>.webp). Keyed by each account's own explicit `portraitKey`
 * field (lib/twitterPrompts.js's PSA_ACCOUNTS) rather than a derived slug — deriving one the way
 * character portraits derive from a first name would collide here (e.g. "Weyland Alert" and
 * "Weyland Research Center" would both slug to "weyland").
 * @param {Array<{name: string, portraitKey: string}>} psaAccounts
 * @returns {Record<string, {primaryUrl: string, fallbackUrl: string|null, placeholderUrl: string|null, initial: string|null}>}
 */
export function buildPsaPortraitMap(psaAccounts) {
    const map = {};
    for (const account of psaAccounts) {
        map[account.name] = {
            primaryUrl: `${ASSET_BASE_URL}/profiles/profile_${account.portraitKey}.webp`,
            fallbackUrl: null,
            placeholderUrl: placeholderPortraitUrl(account.name),
            initial: account.name.charAt(0).toUpperCase(),
        };
    }
    return map;
}
