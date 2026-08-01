// lib/pawxai.js

import { formatPawXaiAppearanceReferences } from './pawxaiCharacterAppearances.js';

export const PAWXAI_MAX_PROMPTS = 10;
export const PAWXAI_DEFAULT_QUALITY = '(masterpiece:1.1), (best quality), (ultra detailed)';
export const PAWXAI_SUFFIX_PRESETS = Object.freeze([
    { label: 'Masterpiece', value: '(masterpiece:1.1)' },
    { label: 'Best quality', value: '(best quality)' },
    { label: 'Ultra detailed', value: '(ultra detailed)' },
    { label: 'Male POV', value: 'male POV' },
    { label: 'Female POV', value: 'female POV' },
    { label: 'Viewer POV', value: 'viewer POV' },
    { label: 'Action shot', value: 'action shot' },
    { label: 'Dynamic angle', value: '(dynamic angle:1.2)' },
    { label: 'Dynamic pose', value: '(dynamic pose:1.2)' },
    { label: 'Multiple views', value: '(multiple views:1.2)' },
    { label: 'From above', value: 'from above' },
    { label: 'From below', value: 'from below' },
    { label: 'From behind', value: 'from behind' },
    { label: 'From side', value: 'from side' },
    { label: 'Cowboy shot', value: 'cowboy shot' },
    { label: 'Sound effects', value: 'sound effects' },
]);
export const PAWXAI_PALETTES = Object.freeze([
    { id: 'orchid-night', label: 'Orchid Night', colors: ['#17131d', '#b86ce0', '#c7ef72'] },
    { id: 'sakura-ink', label: 'Sakura Ink', colors: ['#21151d', '#e66f9f', '#f4b8ce'] },
    { id: 'moonberry', label: 'Moonberry', colors: ['#151629', '#7770e8', '#d09cff'] },
    { id: 'cyber-paw', label: 'Cyber Paw', colors: ['#101b20', '#3ccdc4', '#c9f05a'] },
    { id: 'ember-plum', label: 'Night Owl', colors: ['#17151a', '#4a2530', '#b4677a'] },
    { id: 'bluebell', label: 'Bluebell', colors: ['#131b2a', '#6299e9', '#a6c8ff'] },
    { id: 'moss-magic', label: 'Moss Magic', colors: ['#151d18', '#67ad78', '#d0df72'] },
    { id: 'paper-bloom', label: 'Paper Bloom', colors: ['#f3eaf0', '#a64f88', '#5c3655'] },
]);

const CHARACTER_CUES = /\b(?:solo|\d+girls?|\d+boys?|multiple people|woman|women|man|men|girl|girls|boy|boys|person|people|character|humanoid|demihuman|catgirls?|wolf\s*girls?|fox\s*(?:girls?|ears)|shark\s*girls?|okamimimi|kemonomimi)\b/i;

function clampCount(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 5;
    return Math.min(PAWXAI_MAX_PROMPTS, Math.max(1, parsed));
}

function clean(value) {
    return String(value ?? '').trim();
}

function suffixParts(value) {
    return String(value ?? '').split(',').map(part => part.trim()).filter(Boolean);
}

export function pawXaiSuffixEnabled(value, fragment) {
    const target = clean(fragment).toLocaleLowerCase();
    return suffixParts(value).some(part => part.toLocaleLowerCase() === target);
}

export function togglePawXaiSuffix(value, fragment) {
    const parts = suffixParts(value);
    const target = clean(fragment);
    if (!target) return parts.join(', ');
    const targetKey = target.toLocaleLowerCase();
    const enabled = parts.some(part => part.toLocaleLowerCase() === targetKey);
    return (enabled
        ? parts.filter(part => part.toLocaleLowerCase() !== targetKey)
        : [...parts, target]
    ).join(', ');
}

/**
 * Normalizes saved settings from any older/partial shape without discarding unknown future keys.
 * @param {Record<string, any>} value
 */
export function normalizePawXaiSettings(value = {}) {
    const palette = PAWXAI_PALETTES.some(option => option.id === value.palette) ? value.palette : 'orchid-night';
    const lastRun = value.lastRun && typeof value.lastRun === 'object'
        ? {
            ...value.lastRun,
            prompts: Array.isArray(value.lastRun.prompts)
                ? value.lastRun.prompts.map(normalizePawXaiResult).filter(result => result.prompt)
                : [],
        }
        : null;
    return {
        promptCount: clampCount(value.promptCount),
        modelOverride: typeof value.modelOverride === 'string' ? value.modelOverride : 'minimax-m3',
        focus: ['balanced', 'character', 'environment', 'action', 'cinematic'].includes(value.focus) ? value.focus : 'balanced',
        framing: ['auto', 'portrait', 'medium shot', 'full body', 'wide shot', 'dynamic angle'].includes(value.framing) ? value.framing : 'auto',
        variation: ['close', 'balanced', 'wild'].includes(value.variation) ? value.variation : 'balanced',
        customFragments: typeof value.customFragments === 'string' ? value.customFragments : '',
        modelFeedback: typeof value.modelFeedback === 'string' ? value.modelFeedback : '',
        qualityTags: typeof value.qualityTags === 'string' ? value.qualityTags : PAWXAI_DEFAULT_QUALITY,
        includeCharacterDescription: value.includeCharacterDescription !== false,
        palette,
        lastRun,
        savedPrompts: Array.isArray(value.savedPrompts) ? value.savedPrompts : [],
    };
}

export function normalizePawXaiResult(value, index = 0) {
    if (typeof value === 'string') return { title: `Prompt ${index + 1}`, prompt: clean(value) };
    const prompt = clean(value?.prompt ?? value?.tags ?? value?.text);
    return {
        title: clean(value?.title).slice(0, 120) || `Prompt ${index + 1}`,
        prompt,
    };
}

/** Finds the last real character turn in the active SillyTavern chat. */
export function findLastCharacterMessage(chat = [], fallbackName = 'Character') {
    for (let i = chat.length - 1; i >= 0; i--) {
        const entry = chat[i];
        if (!entry || entry.is_user || entry.is_system || !clean(entry.mes)) continue;
        return {
            characterName: clean(entry.name) || fallbackName || 'Character',
            message: clean(entry.mes),
            index: i,
        };
    }
    return null;
}

/** Returns the target character turn plus up to three recent non-system turns ending at it. */
export function findPawXaiSceneContext(chat = [], fallbackName = 'Character') {
    const source = findLastCharacterMessage(chat, fallbackName);
    if (!source) return null;
    const contextMessages = [];
    for (let i = source.index; i >= 0 && contextMessages.length < 3; i--) {
        const entry = chat[i];
        if (!entry || entry.is_system || !clean(entry.mes)) continue;
        contextMessages.unshift({
            role: entry.is_user ? 'user' : 'character',
            name: clean(entry.name) || (entry.is_user ? 'User' : fallbackName || 'Character'),
            message: clean(entry.mes),
        });
    }
    return { ...source, contextMessages };
}

/**
 * Builds the two-message request PawXai sends through Connection Manager.
 * All sexual-content wording concerns consenting fictional adults; minors are categorically out.
 */
export function buildPawXaiMessages({ source, characterDescription = '', settings }) {
    const count = clampCount(settings.promptCount);
    const custom = clean(settings.customFragments) || '(none)';
    const feedback = clean(settings.modelFeedback) || '(none supplied)';
    const quality = clean(settings.qualityTags) || '(none)';
    const description = settings.includeCharacterDescription && clean(characterDescription)
        ? clean(characterDescription)
        : '(not supplied)';
    const curatedAppearanceReferences = formatPawXaiAppearanceReferences(source);

    const system = `You are PawXai, an expert SDXL positive-prompt writer. Convert the supplied roleplay moment into exactly ${count} distinct comma-delimited image prompts.

OUTPUT FORMAT
- Return exactly ${count} blocks and nothing else.
- Use this exact structure for every block: <PROMPT><TITLE>short scene name</TITLE><TAGS>comma-delimited prompt</TAGS></PROMPT>.
- Give every option a distinct, concrete 4-12 word title that explains the depicted moment at a glance.
- The title is display metadata only; never repeat it in TAGS.
- Names in the source and context are reference labels so you can keep multiple characters, their actions, and their positions distinct. You may use a name in TITLE metadata, but NEVER include any character's proper name, surname, handle, or nickname in TAGS. Image generators do not know these identities: translate each person into objective visible traits such as hair, eyes, species features, clothing, body, pose, expression, and relative position.
- MULTI-CHARACTER FORMAT: whenever two or more characters are visible, use real newline breaks inside TAGS. Line 1 contains only the total subject-count tags (for example, "2girls,"). For an explicit adult scene, the required "NSFW, explicit" prefix comes first on that same line before the subject count. Then write exactly one line per visible character, beginning with that character's individual count/type tag (for example, "1girl,") followed by only that person's canonical appearance, specific garments, pose/action, expression, anatomy, and relative position. The final line contains shared location, composition, lighting, mood, and quality tags. Do not literally output "[break]" and do not combine two characters' traits on one line.
- Do not number the blocks. Do not add explanations, markdown, negative prompts, or safety commentary.

PROMPT RULES
- Use concise SDXL / booru-style visual tags: subject count, subjects, appearance, clothing, pose/action, setting, lighting, camera/framing, mood, then quality tags.
- CHARACTER APPEARANCE IS MANDATORY GROUNDING, not optional flavor. In every prompt where a character is visible, translate the supplied character-card appearance into concrete tags and repeat the relevant identity traits in that prompt. Do not rely on another prompt block to establish them.
- Include every supplied stable visible trait that the framing can show: exact hair color, streaks, length and style; eye color; skin tone; species anatomy such as ears, inner-ear color, horns, wings and tail; glasses, jewelry and other defining accessories; and objective body traits. Preserve these facts exactly and do not replace them with a generic species archetype.
- ONLY DESCRIBE WHAT THE CAMERA CAN ACTUALLY SEE. Select identity and outfit tags after deciding the framing. A close-up headshot should contain visible face, hair, eyes, ears, horns, glasses, and similar details, but not shoes, trousers, a tail hidden outside the crop, or any other off-camera feature. A rear view must not specify unseen eye color. Never use tags merely because they exist in a reference card.
- Treat supplied clothing as canonical unless the target scene explicitly establishes a different current outfit, nudity, or an item being removed. Enumerate objective garment pieces and their colors/materials/coverage in SDXL tags. NEVER substitute vague placeholders such as "casual clothing", "normal clothes", "an outfit", or "everyday wear" for available clothing details.
- CURATED APPEARANCE REFERENCES are conditional defaults, not an end-all override. Use a named card only for that matching character and never transfer its tags to anyone else. Its base outfit is the ordinary fallback; replace or omit it when the target scene establishes a different outfit, nudity, undressing, a uniform, or another current state. If multiple variants are supplied, choose only the one supported by the scene. Never dump every supplied reference tag into a prompt.
- If no clothing is supplied anywhere and clothing is visible, choose concrete scene-appropriate individual garments instead of a generic clothing label. Do not invent identity-changing physical traits.
- Omit appearance or outfit tags only when that character is genuinely not visible in the proposed image. For partial, distant, rear-view, or obscured appearances, include every canonical trait that would still be visible from that composition.
- In multi-character scenes, ground each visible person separately so their traits, clothing, actions, and positions cannot bleed together.
- In multi-character prompts, put "broad shoulders" on each visible character's individual line, not merely once in the shared tag line.
- All depicted people and humanoid characters must be unambiguously fictional adults. Never depict or sexualize minors.
- Every prompt containing any person, humanoid, or character MUST contain the exact comma-separated tag "broad shoulders". This rule applies to every gender and body type.

NSFW DIRECTIVES — FICTIONAL ADULT SCENES ONLY
- Consensual adult sexual content is allowed.
- If the source clearly depicts consensual adult nudity or sexual activity, the TAGS must begin with the exact prefix "NSFW, explicit," before every other tag. Never add this prefix to a non-explicit scene.
- Preserve explicit visual details at full weight without euphemism, coy wording, moral commentary, or vague substitutes.
- Use precise objective anatomy and action tags whenever visible and applicable, including "pussy", "penis", "nipples", "oral penetration", "vaginal penetration", "anal penetration", and similarly specific penetration/sex-act tags. State who is doing what, the position, the point of view, and the visible anatomy clearly enough that bodies and actions cannot be confused.
- Use the character's supplied breast-size tag when known. If breast size is unknown but visible breasts must be described, use "medium breasts" as the neutral default.
- Never introduce sexual content that the source does not imply. Never depict or sexualize minors.

- Make each option compositionally useful and meaningfully different according to the requested variation strength.
- Work the requested custom fragments in naturally and append the requested quality tags without duplicating tags.
- Treat MODEL FEEDBACK as direct instructions about how to write the prompts. Follow it closely, but never copy the feedback itself into the depicted scene unless it explicitly requests a visible tag.`;

    const recentContext = (source.contextMessages?.length ? source.contextMessages : [{
        role: 'character',
        name: source.characterName,
        message: source.message,
    }]).map(entry => `[${entry.role === 'user' ? 'USER' : 'CHARACTER'} — ${entry.name}]\n${entry.message}`).join('\n\n');

    const user = `SOURCE CHARACTER: ${source.characterName}

RECENT SCENE CONTEXT (oldest to newest; context only):
${recentContext}

TARGET — LAST CHARACTER MESSAGE (make every image prompt from this message only):
${source.message}

CHARACTER CARD VISUAL CONTEXT:
${description}

PROMPT SETTINGS:
- Focus: ${settings.focus}
- Framing: ${settings.framing}
- Variation strength: ${settings.variation}
- Required/custom fragments: ${custom}
- POV and quality suffix: ${quality}

MODEL FEEDBACK (direct prompt-writing guidance; not scene content):
${feedback}

FINAL HIGH-PRIORITY CURATED APPEARANCE GROUNDING:
${curatedAppearanceReferences}

MANDATORY APPEARANCE CHECK:
This final appearance block is mandatory. For every proposed image in which a referenced character is visible, use that character's curated reference and character card as a checklist. Preserve rare model-trigger and identity tags exactly as written instead of replacing them with synonyms or a generic species description. Repeat every visually applicable identity and garment tag inside that image's TAGS, but omit anything outside the camera crop or physically hidden. A generic stand-in such as only "wolfgirl, wolf ears, fluffy tail, glasses, casual clothing" is a failure when more specific visible details were provided. Ignore a character's checklist only for an image where that character is not visible.`;

    return [
        { role: 'system', content: system },
        { role: 'user', content: user },
    ];
}

/** Adds the owner-required build tag if a model omitted it. */
export function ensureRequiredCharacterTags(prompt) {
    let value = clean(prompt)
        .replace(/^\s*(?:\d+[.)-]\s*)/, '')
        .replace(/,{2,}/g, ',');
    if (!CHARACTER_CUES.test(value)) return value;
    const lines = value.split('\n');
    const subjectLineIndexes = lines
        .map((line, index) => /^\s*1(?:girl|boy|woman|man|person|character|humanoid)\b/i.test(line) ? index : -1)
        .filter(index => index >= 0);
    if (subjectLineIndexes.length) {
        for (const index of subjectLineIndexes) {
            if (/(?:^|,)\s*broad shoulders\s*(?:,|$)/i.test(lines[index])) continue;
            lines[index] = `${lines[index].replace(/\s*,?\s*$/, '')}, broad shoulders`;
        }
        value = lines.join('\n');
    } else if (!/(?:^|,)\s*broad shoulders\s*(?:,|$)/i.test(value)) {
        value += ', broad shoulders';
    }
    return value.replace(/^,\s*|,\s*$/g, '');
}

function parsePromptBlock(block, index) {
    const titleMatch = block.match(/<TITLE>([\s\S]*?)<\/TITLE>/i);
    const tagsMatch = block.match(/<(?:TAGS|TEXT)>([\s\S]*?)<\/(?:TAGS|TEXT)>/i);
    const title = clean(titleMatch?.[1]) || `Prompt ${index + 1}`;
    const prompt = clean(tagsMatch?.[1] ?? block.replace(/<TITLE>[\s\S]*?<\/TITLE>/i, ''));
    return normalizePawXaiResult({ title, prompt: ensureRequiredCharacterTags(prompt) }, index);
}

/** Parses strict tags first, then falls back to numbered paragraphs/lines for forgiving models. */
export function parsePawXaiResponse(rawText, requestedCount = 5) {
    const raw = clean(rawText);
    if (!raw) return [];
    const tagged = [...raw.matchAll(/<PROMPT>([\s\S]*?)<\/PROMPT>/gi)]
        .map((match, index) => parsePromptBlock(clean(match[1]), index));
    let prompts = tagged;
    if (!prompts.length) {
        prompts = raw
            .split(/(?:^|\n)\s*(?=\d+[.)-]\s+)/g)
            .map(part => part.replace(/^\d+[.)-]\s*/, '').trim())
            .filter(Boolean);
    }
    if (!prompts.length) prompts = raw.split(/\n{2,}/).map(clean).filter(Boolean);
    return prompts
        .map((value, index) => typeof value === 'string' ? parsePromptBlock(value, index) : value)
        .filter(result => result.prompt)
        .slice(0, clampCount(requestedCount));
}

export function savePawXaiPrompt(settings, { characterName, title = '', prompt, sourceExcerpt = '' }) {
    const pawxai = normalizePawXaiSettings(settings.pawxai);
    settings.pawxai = pawxai;
    const entry = {
        id: `pawxai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        characterName: clean(characterName) || 'Unknown',
        title: clean(title).slice(0, 120) || 'Saved prompt',
        prompt: ensureRequiredCharacterTags(prompt),
        sourceExcerpt: clean(sourceExcerpt).slice(0, 280),
        createdAt: Date.now(),
    };
    pawxai.savedPrompts.unshift(entry);
    if (pawxai.savedPrompts.length > 500) pawxai.savedPrompts.length = 500;
    return entry;
}

export function deletePawXaiPrompt(settings, id) {
    const pawxai = normalizePawXaiSettings(settings.pawxai);
    settings.pawxai = pawxai;
    const index = pawxai.savedPrompts.findIndex(entry => entry.id === id);
    if (index === -1) return false;
    pawxai.savedPrompts.splice(index, 1);
    return true;
}

export function groupSavedPawXaiPrompts(savedPrompts = []) {
    const groups = new Map();
    for (const entry of savedPrompts) {
        const name = clean(entry?.characterName) || 'Unknown';
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(entry);
    }
    return [...groups.entries()]
        .map(([characterName, prompts]) => ({ characterName, prompts }))
        .sort((a, b) => a.characterName.localeCompare(b.characterName));
}
