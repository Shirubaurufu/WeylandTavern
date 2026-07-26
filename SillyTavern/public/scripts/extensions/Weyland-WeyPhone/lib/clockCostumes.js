// lib/clockCostumes.js
//
// Costume data for the Clock app's image picker. There is no server endpoint that lists a
// character's costume subfolders, so instead of enumerating we PROBE known folder names via
// /api/sprites/get and keep the ones that return images. This module holds the known names.
//
// CHARACTER_OUTFITS is transcribed from the Weyland wardrobe QR (the same folder names the switcher
// uses). Maintain it alongside that QR — an added line makes a new costume browsable. Probing is
// self-correcting: a wrong or missing name simply doesn't appear, so this is a hint, not a contract.
//
// Notes on the folder scheme (from the WT team):
//   - The underwear tier is the "Lingerie" folder for nearly everyone (the "Underwear" /
//     "Undergarments" a user sees are just display labels). Egyptian characters use "Lounge" instead.
//     Both are NSFW. Willow's underwear tier is simply "Naked".
//   - Some characters also ship community-made variants (Community-prefixed folders).
//   - Multi-character casts have one folder per member plus every concatenated combo, with NO spaces
//     or "&" (e.g. Lyris & Vesper -> Lyris, Vesper, LyrisVesper; Cerberus -> Astrid, Neshe, Fawne,
//     AstridNeshe, AstridFawne, FawneNeshe, AstridFawneNeshe). Some combos have no sprites yet.

// Every browsable folder -> its ALTERNATE outfit folders (the defaults + NSFW tiers below are added
// automatically). Combos with no special outfits get [].
export const CHARACTER_OUTFITS = Object.freeze({
    'Aiko': ['College'],
    'Bap': ['Hoodie'],
    'Bastet': [],
    'Belle': ['Punk', 'Cozy'],
    'Blake': ['Dress', 'Festival'],
    'Cairo': ['Beanie'],
    'Fasti': ['Disguise'],
    'Hannah': ['Casual Clothes', 'Festival', 'Negligee'],
    'Jade': ['Karate'],
    'Jenn': ['Hoodie', 'Punk', 'Festival', 'Pajamas'],
    'Kai': ['Swimsuit'],
    'Karmen': ['Wet', 'Hoodie'],
    'Khepri': [],
    'Kiera': ['Beret'],
    'Koshizu': ['LazyDay'],
    'Kressa': ['Blouse', 'Lounge'],
    'Loona': ['Drunk'],
    'Lentyl': [],
    'Lucy': ['Casual', 'Sundress', 'Festival', 'Pajamas'],
    'Lyris': [],
    'Vesper': [],
    'Mika': ['Towel', 'Santa', 'Present'],
    'Nara': [],
    'Nefara': [],
    'Nix': ['Date', 'Festival'],
    'Rivera': ['Cheerleader', 'Laundry', 'Santa'],
    'Rosa': ['Jacket'],
    'Serra': ['Work', 'Pajamas', 'Festival'],
    'Seth': ['Casual Clothes', 'Maid'],
    'Shani': [],
    'Summer': ['Cheerleader', 'Hoodie', 'Festival', 'Dress', 'Baker'],
    'Warren': ['Qipao'],
    'Willow': [],
    // Multi-character combo / member folders that ship with WT (individual members above where they
    // also have their own outfits).
    'Astrid': [],
    'Neshe': [],
    'Fawne': [],
    'AstridNeshe': [],
    'AstridFawne': [],
    'FawneNeshe': [],
    'AstridFawneNeshe': [],
    'BlakeSerra': [],
    'LyrisVesper': ['Casual'],
    'JennLucy': [],
});

// The default outfit folder present for essentially every character (+ a community-made variant).
const DEFAULT_OUTFITS = ['Regular Outfit', 'CommunityRegular Outfit'];
// Underwear tier — "Lingerie" for most, "Lounge" for Egyptians, + community variant. NSFW-gated.
const UNDERWEAR_OUTFITS = ['Lingerie', 'Lounge', 'CommunityLingerie'];
// Nude tier (+ community variant). NSFW-gated.
const NUDE_OUTFITS = ['Naked', 'CommunityNaked'];

// Greeting images (user/images/Weyland) that are NSFW — mirrored from the "Pic" QR, which swaps
// these for a censored NSFW.avif sticker when the NSFW flag is off. Numbers are the file basenames.
const NSFW_GREETINGS = new Set(['010', '014', '097', '098', '901', '902', '903', '904']);

/** True if a greeting filename/URL is one of the NSFW-gated ones (or the censor sticker itself). */
export function isNsfwGreeting(filenameOrUrl) {
    const base = String(filenameOrUrl ?? '').split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
    return base.toUpperCase() === 'NSFW' || NSFW_GREETINGS.has(base);
}

/** The full static roster of folders that ship with WT. */
export function staticRoster() {
    return Object.keys(CHARACTER_OUTFITS);
}

/**
 * Folder names to probe for a character, most-relevant first. Unknown characters (e.g. user
 * downloads not in the map) still get the defaults + NSFW tiers so standard folders are found.
 * @param {string} name character/folder name
 * @param {{ nsfw?: boolean }} [opts] when nsfw is false the underwear/nude folders are omitted
 * @returns {string[]} de-duplicated costume folder names (without the "Character/" prefix)
 */
export function costumeProbeList(name, { nsfw = false } = {}) {
    const named = CHARACTER_OUTFITS[name] ?? [];
    const list = [...DEFAULT_OUTFITS, ...named];
    if (nsfw) list.push(...UNDERWEAR_OUTFITS, ...NUDE_OUTFITS);
    return [...new Set(list)];
}
