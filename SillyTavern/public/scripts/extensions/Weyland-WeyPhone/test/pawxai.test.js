import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PAWXAI_MAX_PROMPTS,
    buildPawXaiMessages,
    deletePawXaiPrompt,
    ensureRequiredCharacterTags,
    findLastCharacterMessage,
    findPawXaiSceneContext,
    groupSavedPawXaiPrompts,
    normalizePawXaiSettings,
    parsePawXaiResponse,
    savePawXaiPrompt,
    togglePawXaiSuffix,
} from '../lib/pawxai.js';

test('PawXai clamps prompt count to one through ten', () => {
    assert.equal(normalizePawXaiSettings({}).promptCount, 5);
    assert.equal(normalizePawXaiSettings({ promptCount: 0 }).promptCount, 1);
    assert.equal(normalizePawXaiSettings({ promptCount: 99 }).promptCount, PAWXAI_MAX_PROMPTS);
    assert.equal(normalizePawXaiSettings({ promptCount: '4' }).promptCount, 4);
});

test('PawXai scene context sends up to three turns ending at the target character message', () => {
    const result = findPawXaiSceneContext([
        { is_user: false, name: 'Summer', mes: 'I kept my red coat on.' },
        { is_user: true, name: 'You', mes: 'Coffee?' },
        { is_user: false, name: 'Summer', mes: 'She smiles across the cafe table.' },
    ]);
    assert.equal(result.message, 'She smiles across the cafe table.');
    assert.deepEqual(result.contextMessages.map(entry => entry.role), ['character', 'user', 'character']);
});

test('findLastCharacterMessage ignores later user and system entries', () => {
    const result = findLastCharacterMessage([
        { is_user: false, name: 'Summer', mes: 'first' },
        { is_user: false, is_system: true, name: 'System', mes: 'hidden' },
        { is_user: true, name: 'You', mes: 'reply' },
        { is_user: false, name: 'Summer', mes: 'latest scene' },
        { is_user: true, name: 'You', mes: 'latest user line' },
    ]);
    assert.deepEqual(result, { characterName: 'Summer', message: 'latest scene', index: 3 });
});

test('PawXai request requires named blocks, three-turn context, and the owner build tag', () => {
    const settings = normalizePawXaiSettings({
        promptCount: 5,
        customFragments: 'film grain',
        modelFeedback: 'Use objective visual details and focus on hair tags.',
    });
    const messages = buildPawXaiMessages({
        source: {
            characterName: 'Kressa',
            message: 'She smiles from her office chair.',
            contextMessages: [
                { role: 'character', name: 'Kressa', message: 'The office is cozy.' },
                { role: 'user', name: 'You', message: 'You look happy.' },
                { role: 'character', name: 'Kressa', message: 'She smiles from her office chair.' },
            ],
        },
        characterDescription: 'Purple hair, wolf ears, round glasses.',
        settings,
    });
    assert.match(messages[0].content, /exactly 5/);
    assert.match(messages[0].content, /broad shoulders/);
    assert.match(messages[0].content, /<TITLE>/);
    assert.doesNotMatch(messages[0].content, /aged up/i);
    assert.match(messages[0].content, /Never depict or sexualize minors/);
    assert.match(messages[0].content, /Consensual adult sexual content is allowed/);
    assert.match(messages[0].content, /NSFW DIRECTIVES — FICTIONAL ADULT SCENES ONLY/);
    assert.match(messages[0].content, /exact prefix "NSFW, explicit,"/);
    assert.match(messages[0].content, /"pussy", "penis", "nipples", "oral penetration", "vaginal penetration", "anal penetration"/);
    assert.match(messages[0].content, /use "medium breasts" as the neutral default/);
    assert.match(messages[0].content, /reference labels/);
    assert.match(messages[0].content, /NEVER include any character's proper name.*in TAGS/);
    assert.match(messages[0].content, /CHARACTER APPEARANCE IS MANDATORY GROUNDING/);
    assert.match(messages[0].content, /exact hair color, streaks, length and style/);
    assert.match(messages[0].content, /NEVER substitute vague placeholders such as "casual clothing"/);
    assert.match(messages[0].content, /ONLY DESCRIBE WHAT THE CAMERA CAN ACTUALLY SEE/);
    assert.match(messages[0].content, /conditional defaults, not an end-all override/);
    assert.match(messages[0].content, /genuinely not visible/);
    assert.match(messages[0].content, /MULTI-CHARACTER FORMAT/);
    assert.match(messages[0].content, /Line 1 contains only the total subject-count tags/);
    assert.match(messages[0].content, /exactly one line per visible character/);
    assert.match(messages[0].content, /Do not literally output "\[break\]"/);
    assert.match(messages[0].content, /"broad shoulders" on each visible character's individual line/);
    assert.match(messages[1].content, /Purple hair/);
    assert.match(messages[1].content, /\(white animal ear fluff:1\.1\)/);
    assert.match(messages[1].content, /omit anything outside the camera crop/);
    assert.match(messages[1].content, /MANDATORY APPEARANCE CHECK/);
    assert.match(messages[1].content, /generic stand-in.*is a failure/);
    assert.match(messages[1].content, /film grain/);
    assert.match(messages[1].content, /SOURCE CHARACTER: Kressa/);
    assert.match(messages[1].content, /CHARACTER — Kressa/);
    assert.match(messages[1].content, /Use objective visual details and focus on hair tags/);
    assert.match(messages[1].content, /Coffee|You look happy/);
    assert.match(messages[1].content, /make every image prompt from this message only/);
});

test('curated appearance grounding is the final high-priority user instruction', () => {
    const messages = buildPawXaiMessages({
        source: {
            characterName: 'Yue-Lin',
            message: 'Yue-Lin smiles at the viewer.',
            contextMessages: [{ role: 'character', name: 'Yue-Lin', message: 'Yue-Lin smiles at the viewer.' }],
        },
        characterDescription: 'Cantonese protogen',
        settings: normalizePawXaiSettings({ promptCount: 1 }),
    });
    const userPrompt = messages[1].content;
    assert.ok(userPrompt.indexOf('FINAL HIGH-PRIORITY CURATED APPEARANCE GROUNDING:') > userPrompt.indexOf('MODEL FEEDBACK'));
    assert.match(userPrompt, /protogenv2/);
    assert.match(userPrompt, /Preserve rare model-trigger and identity tags exactly as written/);
    assert.match(userPrompt.trim(), /character is not visible\.$/);
});

test('PawXai feedback defaults safely and survives normalization', () => {
    assert.equal(normalizePawXaiSettings({}).modelFeedback, '');
    assert.equal(normalizePawXaiSettings({ modelFeedback: 'Less subjective language.' }).modelFeedback, 'Less subjective language.');
});

test('POV and quality suffix presets toggle exact fragments without duplicates', () => {
    const withPov = togglePawXaiSuffix('(masterpiece:1.1), (best quality)', 'male POV');
    assert.equal(withPov, '(masterpiece:1.1), (best quality), male POV');
    assert.equal(togglePawXaiSuffix(withPov, 'male POV'), '(masterpiece:1.1), (best quality)');
    assert.equal(togglePawXaiSuffix('male POV, MALE POV', 'male POV'), '');
});

test('parsePawXaiResponse reads titles separately and repairs missing required character tags', () => {
    const prompts = parsePawXaiResponse('<PROMPT><TITLE>Kressa at her desk</TITLE><TAGS>1girl, solo, office</TAGS></PROMPT>\n<PROMPT><TITLE>Empty golden courtyard</TITLE><TAGS>empty courtyard, sunset</TAGS></PROMPT>', 2);
    assert.equal(prompts.length, 2);
    assert.equal(prompts[0].title, 'Kressa at her desk');
    assert.match(prompts[0].prompt, /broad shoulders/);
    assert.doesNotMatch(prompts[0].prompt, /aged up/);
    assert.doesNotMatch(prompts[1].prompt, /broad shoulders/);
});

test('parsePawXaiResponse never turns untagged reasoning into prompts', () => {
    const reasoning = 'Let me analyze this scene carefully. We have:\n\n1. A character in a bedroom\n2. Morning light\n\nActually, I think I am overcomplicating this.';
    assert.deepEqual(parsePawXaiResponse(reasoning, 8), []);
    const mixed = `${reasoning}\n<PROMPT><TITLE>Rainy doorway</TITLE><TAGS>1girl, rain, doorway</TAGS></PROMPT>`;
    assert.deepEqual(parsePawXaiResponse(mixed, 8).map(prompt => prompt.title), ['Rainy doorway']);
});

test('ensureRequiredCharacterTags adds no duplicate broad-shoulders tag', () => {
    assert.equal(
        ensureRequiredCharacterTags('1girl, broad shoulders, portrait'),
        '1girl, broad shoulders, portrait',
    );
});

test('ensureRequiredCharacterTags repairs every individual subject line in a multi-character prompt', () => {
    assert.equal(
        ensureRequiredCharacterTags('2girls,\n1girl, long red hair, pink top, left side,\n1girl, short blue hair, black tank top, right side,\ncafe, warm light'),
        '2girls,\n1girl, long red hair, pink top, left side, broad shoulders\n1girl, short blue hair, black tank top, right side, broad shoulders\ncafe, warm light',
    );
});

test('saved PawXai prompts group by character and can be deleted', () => {
    const settings = { pawxai: normalizePawXaiSettings() };
    const summer = savePawXaiPrompt(settings, { characterName: 'Summer', title: 'Summer at the beach', prompt: '1girl, beach' });
    savePawXaiPrompt(settings, { characterName: 'Kressa', prompt: '1girl, office' });
    const groups = groupSavedPawXaiPrompts(settings.pawxai.savedPrompts);
    assert.deepEqual(groups.map(group => group.characterName), ['Kressa', 'Summer']);
    assert.equal(summer.title, 'Summer at the beach');
    assert.equal(deletePawXaiPrompt(settings, summer.id), true);
    assert.equal(settings.pawxai.savedPrompts.length, 1);
});
