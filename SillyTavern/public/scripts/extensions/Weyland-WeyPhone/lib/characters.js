export const EXCLUDED_CHARACTER_NAMES = ['Weybot', 'Mirror Weyland', 'Kinsbane Manor'];

/**
 * @param {Array<{name: string}>} characters SillyTavern's context.characters
 * @param {string[]} [excludedNames]
 */
export function getSelectableCharacters(characters, excludedNames = EXCLUDED_CHARACTER_NAMES) {
    return characters.filter(character => !excludedNames.includes(character.name));
}
