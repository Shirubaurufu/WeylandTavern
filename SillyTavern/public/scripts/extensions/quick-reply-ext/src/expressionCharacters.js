// Official characters that have expression sprites in /characters/<Name>/<Outfit>/.
// Shared by quick-reply-ext (Weybot side characters) and registrar-expressions.
// Names must match the sprite folder casing exactly. Card-less subbots belong here too.
export const CHARACTERS_WITH_EXPRESSIONS = Object.freeze([
    "Aethel", "Aiko", "Ava", "Bap", "Bastet", "Belle", "Bianca", "Blake", "Briar", "Cairo", "Dash", "Ellie", "Eve", "Fasti",
    "Gemini", "Hannah", "Indigo", "Jade", "Jenn", "Kai", "Karmen", "Khepri", "Kiera", "Koshizu", "Kressa", "Kris", "Lentyl",
    "Loona", "Lucy", "Luna", "Lurkle", "Lyris", "Mika", "Muse", "Ṇ̶̰̼͘a̶͍̅́̒r̵̓̏̉̈́ā̸͒̔̄", "Nathan", "Nefara", "Nix", "Professor Akiyama",
    "Rein", "Rivera", "Rivet", "Rosa", "Serra", "Seth", "Shani", "Sofya", "Summer", "Sunny", "Vera", "Vesper", "Vindica",
    "Warren", "Willow", "Yue-Lin", "Astrid", "Neshe", "Fawne", "Tawny", "Chaska", "Gem"
]);

// Alternate names that redirect to a canonical name (the key must match the sprite folder).
// Aliases are matched exactly in quick-reply-ext and case-insensitively in registrar-expressions.
export const CHARACTER_ALIASES = Object.freeze({
    "Professor Akiyama": ["Professor Akiyama", "Akiyama", "Sayori"],
    "Ṇ̶̰̼͘a̶͍̅́̒r̵̓̏̉̈́ā̸͒̔̄": ["Nara"],
    "Yue-Lin": ["YueLin"],
    "Nix": ["Nicole"],
    "Dash": ["Dakota", "D. Ash"],
    "Mr. Wolfy": ["Wolfy"],
    "Thorne": ["Aris"],
    "Koshizu": ["Koko"],
});

// Members of multi-character cards whose names aren't in the card name.
// Cards named "A & B" are detected automatically and don't need an entry here.
export const GROUP_CARD_MEMBERS = Object.freeze({
    "Cerberus Sisters": ["Astrid", "Neshe", "Fawne"],
});

/**
 * Members of a multi-character card. While that card is active they always show
 * combined on the left, so they are never picked for the right slot.
 * @param {string} cardName
 * @returns {string[]}
 */
export function getGroupCardMembers(cardName) {
    const name = String(cardName || '');
    if (GROUP_CARD_MEMBERS[name]) return GROUP_CARD_MEMBERS[name];
    if (name.includes(' & ')) return name.split(' & ').map(n => n.trim()).filter(Boolean);
    return [];
}
