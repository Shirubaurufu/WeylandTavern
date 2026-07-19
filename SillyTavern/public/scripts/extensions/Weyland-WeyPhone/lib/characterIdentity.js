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

export function findInstalledCharacterName(characters, requestedName) {
    const installed = Array.isArray(characters) ? characters : [];
    const target = canonicalCharacterName(requestedName);
    if (!target) return null;
    const exact = installed.find(character => canonicalCharacterName(character?.name) === target);
    if (exact) return exact.name;
    const first = target.split(/\s+/)[0];
    const firstMatches = installed.filter(character => canonicalCharacterName(character?.name).split(/\s+/)[0] === first);
    return firstMatches.length === 1 ? firstMatches[0].name : null;
}
