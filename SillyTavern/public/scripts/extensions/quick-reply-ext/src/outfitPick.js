// Outfits the PLAYER picked (WeyPhone's Mien "Wear" button), kept apart from the costume the story set.
//
// Two chat variables, both per chat:
//   OutfitPick  = "<Sprite set>/<Outfit folder>", the outfit the player put on ("Summer/Cheerleader",
//                 or on a duo card "LyrisVesper/Casual" / "Lyris/Casual": who is shown AND what they wear).
//   OutfitStick = "true" while the player wants it held ("Keep on").
//
// CostmSave keeps meaning "the costume the story last asked for" (the footer's outfit code). Wearing an outfit
// does NOT move CostmSave, which is how the old costume menu behaved: the outfit holds until the model writes a
// DIFFERENT outfit code. Only the OUTFIT is compared, not the sprite set: on duo cards GroupCostumes picks who is
// shown from the scene every reply (sometimes at random), and that alone must not undo the player's pick.
// With "Keep on", the footer is ignored for this card and the pick is held.
//
// Pure: no SillyTavern imports, so the rules can be tested in Node (WeyPhone's test/mienWardrobe.test.js).

export const OUTFIT_PICK_VAR = 'OutfitPick';
export const OUTFIT_STICK_VAR = 'OutfitStick';

/** Outfits every player can wear. Anything else is an "extra" (bonus) outfit, a Paw Patrol Plus perk (Plus or
 *  Platinum: PP1 or PPP1; it was Platinum-only until 2026-11-18, Lucky's call), the same rule as
 *  getCharacterCostumeFromText ([O1]-[O9] footer codes). The Default entry is the bare character folder.
 *  Muse's SFW is her stand-in regular outfit. */
const BASE_OUTFITS = new Set(['', 'regular outfit', 'lingerie', 'naked', 'lounge', 'sfw']);

/** Sprite sets whose extra outfits are free for everyone (getCharacterCostumeFromText's "always load extra
 *  costumes" list: Blake & Serra's combined Festival set). */
const FREE_EXTRA_SETS = new Set(['BlakeSerra']);

/** Outfits that are hidden while NSFW images are hidden (global NSFW = "true", inverted name). */
const NSFW_OUTFITS = new Set(['lingerie', 'naked', 'lounge']);

/** Nara's "Community" sprite sets live beside her normal ones as "CommunityRegular Outfit" etc. */
const COMMUNITY_PREFIX = 'Community';

/** Characters whose Lingerie folder the old costume menu called "Undergarments" (it was "Lounge" for Bastet,
 *  Khepri, Nefara and Shani, who have a real Lounge folder, so that word already shows). */
const UNDERGARMENT_NAMES = new Set(['Cairo', 'Fasti', 'Lentyl', 'Seth']);

/** "Summer/Cheerleader" -> { character: "Summer", outfit: "Cheerleader" }. A bare "Summer" is the Default set. */
export function splitOutfitFolder(folder) {
    const text = String(folder ?? '').trim();
    const slash = text.indexOf('/');
    if (slash < 0) return { character: text, outfit: '' };
    return { character: text.slice(0, slash), outfit: text.slice(slash + 1) };
}

/** The outfit name without Nara's Community prefix, lower-cased, for the base/NSFW checks. */
function outfitKey(outfit) {
    let name = String(outfit ?? '').trim();
    if (name.startsWith(COMMUNITY_PREFIX)) name = name.slice(COMMUNITY_PREFIX.length);
    return name.trim().toLowerCase();
}

export function isCommunityOutfit(outfit) {
    return String(outfit ?? '').trim().startsWith(COMMUNITY_PREFIX);
}

/** Whether wearing this outfit needs Paw Patrol Plus or above. `set` = the sprite set it belongs to. */
export function isExtraOutfit(outfit, set = '') {
    if (FREE_EXTRA_SETS.has(String(set ?? ''))) return false;
    return !BASE_OUTFITS.has(outfitKey(outfit));
}

/** Whether this outfit must stay out of sight while NSFW images are hidden. */
export function isNsfwOutfit(outfit) {
    return NSFW_OUTFITS.has(outfitKey(outfit));
}

/** How an outfit folder is named to the player: "Lingerie" reads "Undergarments" for the men and the few women
 *  the old menu worded that way; Nara's Community sets read "Community · Regular Outfit". */
export function outfitDisplayName(character, outfit) {
    const name = String(outfit ?? '');
    if (name === 'Lingerie' && UNDERGARMENT_NAMES.has(String(character ?? ''))) return 'Undergarments';
    return name.replace(/^Community(?=\S)/, 'Community · ');
}

/**
 * The sprite sets a card is drawn from. A normal card is one set (its own name). A duo card ("Lyris & Vesper",
 * "Cerberus Sisters") is drawn from each member's own set plus combined sets ("LyrisVesper") when a group of them
 * is on screen. `groups` = quick-reply-ext's CHARACTER_GROUPS_WITH_EXPRESSIONS. Sets without sprites are not
 * filtered here; Mien simply finds no outfits in them (Fawne has none yet).
 * @param {string} cardName
 * @param {string[]} members getGroupCardMembers(cardName); empty for a normal card
 * @param {{output: string, members: string[]}[]} groups
 * @returns {{base: string, label: string, members: string[]}[]} combined sets first, biggest first
 */
export function cardSpriteSets(cardName, members = [], groups = []) {
    if (!members.length) return [{ base: cardName, label: cardName, members: [cardName] }];
    const combined = groups
        .filter(group => group.members.length > 1 && group.members.every(member => members.includes(member)))
        .sort((a, b) => b.members.length - a.members.length)
        .map(group => ({ base: group.output, label: group.members.join(' & '), members: [...group.members] }));
    return [...combined, ...members.map(member => ({ base: member, label: member, members: [member] }))];
}

/** Accepts one name or a list of set names. */
function setList(bases) {
    return (Array.isArray(bases) ? bases : [bases]).map(value => String(value ?? '')).filter(Boolean);
}

/** The picked outfit if it belongs to one of this card's sprite sets, else ''. A pick never carries over to another
 *  card (a chat whose card was swapped). */
export function activeOutfitPick(pick, bases) {
    const value = String(pick ?? '').trim();
    const sets = setList(bases);
    if (!value || !sets.length) return '';
    return sets.includes(splitOutfitFolder(value).character) ? value : '';
}

/**
 * What a chat should show when it opens: the player's pick wins over the story's costume. A pick only survives
 * while the story hasn't changed outfits since (decideCostume forgets it then), or while "Keep on" holds, so a
 * pick that still exists is always the right thing to show. Before this, a reload undid the old picker.
 * @param {{costmSave: string, pick: string, bases?: string|string[], characterName?: string}} state
 * @returns {string} folder to show ('' = nothing saved)
 */
export function outfitToShow({ costmSave = '', pick = '', bases = null, characterName = '' } = {}) {
    const active = activeOutfitPick(pick, bases ?? (characterName || splitOutfitFolder(costmSave).character));
    return active || String(costmSave ?? '');
}

/**
 * The decision AutoCostumes / GroupCostumes make for one reply.
 * @param {{storyCostume: string, costmSave: string, pick: string, stick: boolean, bases?: string|string[], characterName?: string}} state
 *   storyCostume: the folder the footer asks for ("Summer/Hoodie", "Lyris/Casual"), or '' when the reply says
 *   nothing about clothes. bases: the card's sprite sets (characterName for a normal card).
 * @returns {{show: string, saveStory: string, clearPick: boolean}}
 *   show: folder to put on screen ('' = leave the portrait alone; callers skip it when it is already showing);
 *   saveStory: new CostmSave ('' = unchanged); clearPick: forget the player's pick, the story changed outfits.
 *
 * With "Keep on", CostmSave still follows the footer quietly. That way turning "Keep on" off later behaves like a
 * plain pick: it holds until the story asks for a different outfit than it last asked for.
 */
export function decideCostume({ storyCostume = '', costmSave = '', pick = '', stick = false, bases = null, characterName = '' } = {}) {
    const active = activeOutfitPick(pick, bases ?? characterName);
    const folderChanged = Boolean(storyCostume) && storyCostume !== costmSave;
    const saveStory = folderChanged ? storyCostume : '';
    if (!active) return { show: folderChanged ? storyCostume : '', saveStory, clearPick: false };
    const outfitChanged = Boolean(storyCostume) && splitOutfitFolder(storyCostume).outfit !== splitOutfitFolder(costmSave).outfit;
    if (stick || !outfitChanged) return { show: active, saveStory, clearPick: false };
    return { show: storyCostume, saveStory, clearPick: true };
}
