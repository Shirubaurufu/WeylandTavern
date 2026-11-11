// Summer, Belle and Loona expose their normally-on bracketed thoughts as a per-chat PromptOS choice.
// Keep the character allow-list and saved-variable semantics in one place so the phone UI and
// the prompt assembler cannot drift apart.
//
// Only add a character whose thoughts are ALWAYS on (the fixed name list in XXX). Characters whose
// thoughts depend on the greeting (Vera, Fawne, drunk Jenn) have their own switches in XXX, and this
// one is checked first, so adding them here would override those.

export const CHARACTER_THOUGHTS_VARIABLE = 'CharacterThoughtsToggle';
export const CHARACTER_THOUGHTS_CHARACTERS = Object.freeze(['Summer', 'Belle', 'Loona']);

export function supportsCharacterThoughtsToggle(characterName) {
    return CHARACTER_THOUGHTS_CHARACTERS.includes(String(characterName ?? '').trim());
}

/** Unset is intentionally enabled: these characters had thoughts before this control existed. */
export function characterThoughtsEnabled(characterName, savedValue) {
    return supportsCharacterThoughtsToggle(characterName)
        && String(savedValue ?? '').trim().toLowerCase() !== 'disabled';
}
