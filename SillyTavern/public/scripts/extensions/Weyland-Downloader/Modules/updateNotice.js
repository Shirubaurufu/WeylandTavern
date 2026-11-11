// Which installed characters have an update waiting, and a fingerprint of each update.
// Pure (no SillyTavern imports) so it can be tested on its own.
//
// The Downloader checks the roster once when the page loads. This turns that answer into a short list
// other extensions can read (WeyPhone shows it as a notification), and gives every pending update a
// SIGNATURE: a fingerprint of what the server is offering for that character. A player who waves an
// update away should not hear about that same update on every launch, only when the server offers
// something different, and "different" is exactly "the signature changed".

/** Small stable string hash (FNV-1a, 32 bit). Only used to keep signatures short. */
function hash(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Every file the server lists for a character with its version (the byte size), sorted, so the order
 * the manifest happens to list them in does not matter.
 * @param {any} character an entry of the REMOTE manifest
 * @returns {string[]}
 */
function fileVersions(character) {
    const files = [`card=${character?.version ?? ''}`];
    for (const book of character?.lorebooks ?? []) files.push(`book/${book?.filename}=${book?.version}`);
    for (const sub of character?.subcharacters ?? []) {
        for (const costume of sub?.costumes ?? []) {
            for (const expression of costume?.expressions ?? []) {
                files.push(`${sub?.name}/${costume?.name}/${expression?.filename}=${expression?.version}`);
            }
        }
    }
    return files.sort();
}

/**
 * Fingerprint of what the server currently offers for one character. It is taken from the REMOTE
 * manifest, not from the difference to the player's copy, so it stays the same however much or little
 * of the update the player has installed, and changes only when the server's files change.
 * @param {any} remoteCharacter
 * @returns {string}
 */
export function updateSignature(remoteCharacter) {
    return hash(fileVersions(remoteCharacter).join('|'));
}

/**
 * The installed characters with an update waiting.
 * @param {{ remoteManifest?: any, localManifest?: any, pendingDiff?: any } | null | undefined} manifests
 * @param {(sysName: string) => string} [displayName] the name players know the character by
 * @returns {{ sysName: string, name: string, signature: string }[]}
 */
export function pendingUpdates(manifests, displayName = name => name) {
    const versioned = list => (Array.isArray(list) ? list : []).filter(character => character?.version);
    const installed = new Set(versioned(manifests?.localManifest?.characters).map(character => character.name));
    const remote = new Map(versioned(manifests?.remoteManifest?.characters).map(character => [character.name, character]));
    return versioned(manifests?.pendingDiff?.characters)
        .filter(character => installed.has(character.name) && remote.has(character.name))
        .map(character => ({
            sysName: character.name,
            name: String(displayName(character.name) || character.name),
            signature: updateSignature(remote.get(character.name)),
        }));
}

/** The names of the characters in `ids` that were already installed, so a finished job can tell an update from a first install. */
export function updatedNames(ids, characters) {
    return (Array.isArray(ids) ? ids : [])
        .map(id => (Array.isArray(characters) ? characters : []).find(character => character?.id === id))
        .filter(character => character?.installed && !character?.other)
        .map(character => character.name);
}

export const RELOAD_TITLE = 'Reload to finish updating?';

/** The text of the "reload now?" popup shown when the Downloader closes after an update. */
export function reloadMessage(names) {
    const list = [...new Set(names)];
    const who = list.length === 0 ? 'Your characters'
        : list.length === 1 ? list[0]
        : list.length <= 3 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
        : `${list.length} characters`;
    const verb = list.length === 1 ? 'was' : 'were';
    return `${who} ${verb} updated. Weyland Tavern is still using what it loaded when this page opened, `
        + 'so the new greetings, expressions and outfits will not show up properly until the page is reloaded. '
        + 'Your chats are saved, nothing is lost.';
}
