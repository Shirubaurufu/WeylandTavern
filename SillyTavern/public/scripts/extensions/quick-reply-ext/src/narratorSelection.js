import { isOocModeEnabled } from './oocMode.js';

// The narrator text is copied into chats and can outlive the template it came from.
// Identify its stable header (or the classic menu's macro), never just byte-for-byte prose.
const NAMES = ['Default', 'Lauren', 'Lucky', 'Salem'];
// Cached chat prompts must rebuild after removing the narrator's mandatory prewritten lines,
// even when the narrator and strength have not changed.
const NARRATOR_PROMPT_REVISION = '2026-10-09-no-prewritten-lines';
const normalize = value => String(value ?? '').replace(/\\([{}])/g, '$1').replace(/\r\n?/g, '\n').trim();

export function narratorSelection(prompt, getGlobal = () => '') {
    const text = normalize(prompt);
    if (!text || /^\[Core Roleplay Instructions\]$/i.test(text)) return 'Default';
    const macro = text.match(/^\{\{getglobalvar::(Default|Lauren|Lucky|Salem)\}\}$/i);
    const header = text.match(/\[CRITICAL\s*-\s*NARRATOR\s*-\s*(Lauren|Lucky|Salem)\]/i);
    const named = macro?.[1] ?? header?.[1];
    if (named) return NAMES.find(name => name.toLowerCase() === named.toLowerCase());
    return NAMES.find(name => text === normalize(getGlobal(name))) ?? 'Custom';
}

export function narratorBuildState(getGlobal, getLocal) {
    const override = String(getLocal('LocalN') ?? '').trim() !== '';
    const text = override ? getLocal('LocalNarrator') : getGlobal('Narrator');
    // Include a macro's resolved value: a classic chat override follows template updates too.
    const id = narratorSelection(text, getGlobal);
    return JSON.stringify([NARRATOR_PROMPT_REVISION, text ?? '', getGlobal('NarratorStrength') ?? '', id,
        /\{\{getglobalvar::/i.test(String(text)) ? getGlobal(id) ?? '' : '',
        // A mode change in another tab must replace this chat's cached base prompt too.
        isOocModeEnabled(getGlobal('OOCMode'))]);
}
