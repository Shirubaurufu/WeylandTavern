export function canonicalCharacterName(value) {
    return String(value ?? '')
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .trim()
        .replace(/^[!@]+/, '')
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase();
}

export function displayCharacterName(value) {
    return String(value ?? '')
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .trim()
        .replace(/\s+/g, ' ');
}

// Explicit canon/card aliases that cannot be inferred safely from first names. Keep the returned
// card's real name untouched; these keys only answer whether two labels identify the same person.
const CHARACTER_ALIAS_GROUPS = [
    ['dash', 'dakota ash', 'dakota ash (dash)'],
    ['akiyama', 'professor akiyama', 'sayori akiyama'],
];

const SHARED_PERSONALITY_CARD_FALLBACKS = new Map([
    ['astrid', ['cerberus sisters', 'cerb sisters']],
    ['fawne', ['cerberus sisters', 'cerb sisters']],
    ['neshe', ['cerberus sisters', 'cerb sisters']],
]);

function characterAliasKeys(value) {
    const key = canonicalCharacterName(value);
    const group = CHARACTER_ALIAS_GROUPS.find(aliases => aliases.includes(key));
    return new Set(group ?? [key]);
}

export function characterNamesEquivalent(left, right) {
    const leftKeys = characterAliasKeys(left);
    return [...characterAliasKeys(right)].some(key => leftKeys.has(key));
}

export function isSharedPersonalityCardMatch(requestedName, installedName) {
    const providers = SHARED_PERSONALITY_CARD_FALLBACKS.get(canonicalCharacterName(requestedName));
    return Boolean(providers?.includes(canonicalCharacterName(installedName)));
}

export function findInstalledCharacterName(characters, requestedName) {
    const installed = Array.isArray(characters) ? characters : [];
    const target = canonicalCharacterName(requestedName);
    if (!target) return null;
    const exact = installed.find(character => canonicalCharacterName(character?.name) === target);
    if (exact) return exact.name;
    const aliased = installed.find(character => characterNamesEquivalent(character?.name, requestedName));
    if (aliased) return aliased.name;
    const sharedPersonalityCard = installed.find(character => isSharedPersonalityCardMatch(requestedName, character?.name));
    if (sharedPersonalityCard) return sharedPersonalityCard.name;
    const first = target.split(/\s+/)[0];
    const firstMatches = installed.filter(character => canonicalCharacterName(character?.name).split(/\s+/)[0] === first);
    return firstMatches.length === 1 ? firstMatches[0].name : null;
}
