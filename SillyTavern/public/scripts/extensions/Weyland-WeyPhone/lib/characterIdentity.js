// Common honorific abbreviations, expanded so "Prof. Akiyama" and "Professor Akiyama" resolve to
// the same person (Weyland is a university, so titled names are common and users type them both
// ways). Only a title that's directly followed by a name is expanded, so a character literally
// nicknamed "Prof" or "Doc" is left untouched.
const TITLE_ABBREVIATIONS = { prof: 'professor', dr: 'doctor' };

export function canonicalCharacterName(value) {
    return String(value ?? '')
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .trim()
        .replace(/^[!@]+/, '')
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase()
        .replace(/\b(prof|dr)\.?(?=\s)/g, (_, title) => TITLE_ABBREVIATIONS[title]);
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
    ['bap', 'baphrodel puddyfoot'],
    ['blake', 'blake fuyuki'],
];

// The single display name a contact-directory entry should collapse to when its sources disagree
// (e.g. the live cast directory calls her "Baphrodel Puddyfoot" while her subbot/roster entries
// say "Bap") — getCombinedContactEntries (index.js) rewrites every source to this form before
// deduping, so the same person shows up as ONE contact instead of two. Keyed by the matching
// CHARACTER_ALIAS_GROUPS entry's first element; a name outside any group is left as-is.
const PREFERRED_CONTACT_DISPLAY_NAMES = {
    dash: 'Dash',
    bap: 'Bap',
    blake: 'Blake Fuyuki',
};

export function preferredContactDisplayName(value) {
    const key = canonicalCharacterName(value);
    const group = CHARACTER_ALIAS_GROUPS.find(aliases => aliases.includes(key));
    const preferred = group && PREFERRED_CONTACT_DISPLAY_NAMES[group[0]];
    return preferred ?? displayCharacterName(value);
}

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
