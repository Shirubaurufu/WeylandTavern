// Character Thoughts: a per-chat PromptOS switch for every intro that turns bracketed thoughts on.
// Keep the lists and saved-variable semantics in one place so the phone UI and the prompt assembler cannot drift apart.
//
// It started on Summer, Belle and Loona (whose thoughts are always on). Since 2026-11-19 (Lucky: "roll it out to all
// thought enabled intros") it covers every chat where XXX switches thoughts on:
//   - the always-on characters below (ALWAYS_THOUGHTS_CHARACTERS, which is also the list XXX uses),
//   - Vera, on all three intros (default on for her original greeting or a start scenario, off for the others),
//   - Cerberus Sisters when Fawne is the sister,
//   - greetings that bring their own thoughts block (scenarios.js SpecialThoughts + ThoughtSet: Blake's second greeting,
//     Jenn's drunk night, Fawne's Cerberus greeting).
// Bap is NOT here: her thoughts are Baphomet's, and the PromptOS "Baphomet Visibility" switch already turns them off.
//
// Which chats qualify is decided by XXX, the only place that knows the greeting, the scenario stash and the sister. It writes
// the name of whoever thinks into the chat variable CHARACTER_THOUGHTS_AVAILABLE (NO_THOUGHTS when this chat has none), and
// PromptOS shows the switch only for a name. A chat that XXX has not rebuilt since this update has no value yet (a missing
// chat variable reads as ''), so the always-on names still fall back to showing the switch, exactly as before.

export const CHARACTER_THOUGHTS_VARIABLE = 'CharacterThoughtsToggle';
export const CHARACTER_THOUGHTS_AVAILABLE = 'CharacterThoughtsAvailable';
/** Stored when XXX found no thoughts in this chat. Not '', because '' is what a never-written variable reads as. */
export const NO_THOUGHTS = 'none';

/** Characters whose thoughts are on in every chat, whatever the greeting. */
// Willow was taken off on 2026-11-19 (Lucky: she was never meant to have thoughts in the traditional sense; he will
// rework that later). Her chats get no thoughts and no switch.
export const ALWAYS_THOUGHTS_CHARACTERS = Object.freeze(['Summer', 'Loona', 'Belle', 'Hannah', 'Seth', 'Lentyl', 'Briar', 'Dash']);
/** Kept for older imports; it is the same list now. */
export const CHARACTER_THOUGHTS_CHARACTERS = ALWAYS_THOUGHTS_CHARACTERS;

export function hasAlwaysOnThoughts(characterName) {
    return ALWAYS_THOUGHTS_CHARACTERS.includes(String(characterName ?? '').trim());
}

/** Kept for older callers: true for the always-on characters. Per-chat availability is chatThoughtsThinker(). */
export function supportsCharacterThoughtsToggle(characterName) {
    return hasAlwaysOnThoughts(characterName);
}

/**
 * What the switch means while the player has never set it, per chat: 'on' or 'off'. XXX writes it. 'off' only for intros
 * that never had thoughts before the switch reached them (Vera's dinner and custom start), so their default stays as it was.
 */
export const CHARACTER_THOUGHTS_DEFAULT = 'CharacterThoughtsDefault';

/** An explicit Enabled/Disabled wins; unset follows the chat's default (on unless XXX stored 'off'). */
export function thoughtsSwitchOn(savedValue, defaultValue = 'on') {
    const saved = String(savedValue ?? '').trim().toLowerCase();
    if (saved === 'disabled') return false;
    if (saved === 'enabled') return true;
    return String(defaultValue ?? '').trim().toLowerCase() !== 'off';
}

/** Kept for older callers (Loona's request cut): the always-on character, with the switch not set to Disabled. */
export function characterThoughtsEnabled(characterName, savedValue) {
    return supportsCharacterThoughtsToggle(characterName) && thoughtsSwitchOn(savedValue);
}

/**
 * Who thinks in this chat, for PromptOS: the name XXX stored, or for a chat XXX has not rebuilt yet, the card name when the
 * character's thoughts are always on. '' = no thoughts, so no switch.
 * @param {string} characterName the open card's name
 * @param {string|undefined} storedThinker the chat's CHARACTER_THOUGHTS_AVAILABLE value ('' / undefined = never written)
 */
export function chatThoughtsThinker(characterName, storedThinker) {
    const stored = String(storedThinker ?? '').trim();
    if (stored === NO_THOUGHTS) return '';
    if (stored) return stored;
    return hasAlwaysOnThoughts(characterName) ? String(characterName).trim() : '';
}
