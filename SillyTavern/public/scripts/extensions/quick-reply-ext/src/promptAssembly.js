// PromptOS owns the optional layers; a prompt choice owns its storytelling prose.
// Keep rav.js's historical sources intact. Only adapt obsolete UI syntax, missing setting
// slots and competing preparation procedures here. Beta remains the shared layer source.
import { addNarratorGreenRoom, addShiftRouteLine, applyGeminiBypass } from './promptModifiers.js';
import { PREP_SHEET_2025 } from './prepSheet2025.js';
import { resolveNarratorStrength } from './narratorStrength.js';

const CLIENT_NOTE = /¦Weyland Tavern client note:[^¦]*¦\s*\n*/;
const NARRATOR_SLOT = '{{getvar::LocalNarrator}}';
// Marks where Old Prompt 2025's own analysis lives in its post-history: the three-line "think before responding" execution check.
// Analysis OFF deletes those lines; Analysis ON replaces them with the short scene sheet in prepSheet2025.js.
const THINK_CHECK_2025 = 'CRITICAL: THINK BEFORE RESPONDING.';
const OLD_ANALYSIS = /\[FINAL ROLEPLAY DIRECTIVES\][\s\S]*?Give me your best\.[^\n]*\n?/;

function section(text, start, end) {
    const from = text.indexOf(start);
    const to = text.indexOf(end, from + start.length);
    if (from < 0 || to < 0) throw new Error(`Prompt compatibility: missing ${start}`);
    return text.slice(from, to + end.length);
}

/**
 * Prompt choices as the player sees them. Since 2026-10-03 "Current" IS the Beta prompt: the old "normal" Current is retired
 * (its entry stays in rav.js, which is regenerated upstream, but nothing selects it). The "Beta" slot is held, greyed out in
 * PromptOS, until the next beta exists, so a saved "Beta Prompt" (everyone's default since 2026-09-28), a saved "Current Prompt",
 * a missing choice and an unknown one all resolve to Current, which is built from rav.js's "Beta Prompt" entry.
 * @param {Map<string, object>} ravs
 * @param {string} [savedChoice] the PromptChoice global
 * @returns {{saved: string, key: string}} saved: what PromptChoice should hold; key: which ravs entry to build from
 */
export function resolvePromptChoice(ravs, savedChoice) {
    const wanted = String(savedChoice ?? '').trim();
    if (!wanted || wanted === 'Current Prompt' || wanted === 'Beta Prompt' || !ravs.has(wanted)) {
        return { saved: 'Current Prompt', key: 'Beta Prompt' };
    }
    return { saved: wanted, key: wanted };
}

/**
 * preparePromptBase throws when one of Beta's section markers moves (Beta is regenerated upstream). A throw here would stop
 * XXX() from building ANY prompt, so degrade instead: log it and use the prompt exactly as stored. It loses the compatibility
 * edits for that choice but the chat keeps working.
 */
export function safePreparePromptBase(choice, entry, beta) {
    try {
        return preparePromptBase(choice, entry, beta);
    } catch (error) {
        console.error(`[WQR] Prompt compatibility failed for "${choice}" (did Beta's section markers change?). Using it exactly as stored.`, error);
        return entry;
    }
}

/**
 * Does Beta's scene sheet (the PromptOS Analysis layer) go on this prompt? The two old prompts never get it: with Analysis on they
 * keep their OWN analysis in the post-history, exactly where it always lived (base.ownAnalysis): 2026's 14-step procedure, and
 * 2025's short scene sheet (src/prepSheet2025.js, which replaces its old three-line "THINK BEFORE RESPONDING" check).
 * Everything else (shifts, Gemini Bypass, narrator, modes) layers on as usual, so callers also use this to build the
 * Course Correction item in its no-scene-sheet form.
 */
export function usesSceneSheet(base, analysisOn) {
    return Boolean(analysisOn) && !base?.ownAnalysis;
}

/** Preserve the old prose while adapting the few instructions that conflict with today's UI. */
export function preparePromptBase(choice, entry, beta) {
    if (!['Old Prompt 2025', 'Old Prompt 2026'].includes(choice)) return entry;

    const output = section(beta.teg, '[HEADER FORMATTING]\n', '[END Proper Weyland Tavern formatting]');
    const phone = section(beta.teg, '[TEXT MESSAGE FORMATTING]', '[END TEXT MESSAGE FORMATTING]');
    const oldHeader = section(entry.teg, '[HEADER FORMATTING]', 'Example: Saturday, Oct 18th ~ 9:28 AM ~ Dormitory ~');
    const oldPhone = section(entry.teg, '[TEXT MESSAGE FORMATTING]', '[END TEXT MESSAGE FORMATTING]');
    // Move the original HTML prose intact behind the HTML toggle; it was previously always on.
    const html = section(entry.teg, '<html_guidelines>', '</html_guidelines>');
    let teg = entry.teg.replace(oldHeader, output)
        .replace('\n{{pipe}}\n', '\n') // obsolete footer insertion; modern footer is in output above
        .replace(html, '')
        .replace(oldPhone, phone);
    const modernSyntax = text => text
        .replaceAll('**NPC Name:**', '__NPC Name:__')
        .replaceAll('_***doing***_', '***doing***')
        .replaceAll('_**emphasis**_', '***emphasis***')
        .replaceAll('_hiccup_', '*hiccup*');
    teg = modernSyntax(teg);
    // Add only missing slots. Existing narrator, mode, language and thought instructions stay put.
    const mainSlots = ['OPALMode', 'MHR', 'DTH', 'SBC', 'GAH', 'WJS']
        .map(name => `{{getglobalvar::${name}}}`).filter(slot => !teg.includes(slot));
    teg += `\n\n${mainSlots.join('\n')}`;
    // The post-history gets the same treatment whether or not its own reasoning block is kept (see ownAnalysis below).
    const finishPost = (rawPost, { keepReasoning = false } = {}) => {
        let post = rawPost;
        if (choice === 'Old Prompt 2025') {
            // Its three-line preparation check is its own Analysis, and it never told models how to output it or when to stop (they
            // drafted, critiqued, and re-sent). Remove only the preparation command and keep the persona/dialogue reminder inside the
            // same section. With Analysis ON the scene sheet takes its place, just before that section (see ownAnalysis).
            post = post.replace('CRITICAL: THINK BEFORE RESPONDING.\nBefore generating your response, take a moment to carefully review your character\'s formatting guidelines, core directives, roleplay rules, established boundaries, and personality traits.\n', '')
                .replace(' or perform further reflection', '');
            if (keepReasoning) post = post.replace('<execution_check>', () => `${PREP_SHEET_2025}\n<execution_check>`);
        }
        post = modernSyntax(post);
        const postSlots = ['{{getvar::RPPOVLocal}}', '{{pipe}}', '{{getglobalvar::ClothingTracker}}']
            .filter(slot => !post.includes(slot));
        if (postSlots.length) post = post.replace('</final_directives>', `${postSlots.join('\n')}\n</final_directives>`);
        return post;
    };
    // `post` is the version WITHOUT the old reasoning block: WeyPhone's texting reads it, and so does the chat when Analysis is off.
    const post = finishPost(entry.post.replace(OLD_ANALYSIS, ''));
    // Old Prompt 2026 had its own reasoning procedure in the post-history. With Analysis ON the chat uses that original post
    // untouched (only the same syntax/slot housekeeping), instead of Beta's scene sheet. See usesSceneSheet().
    // Old Prompt 2025's own analysis lived in the short execution check in its post-history (the rest of that block is repeated rules);
    // with Analysis ON that spot now carries the short scene sheet instead of the old three lines.
    const ownAnalysis = choice === 'Old Prompt 2026' && OLD_ANALYSIS.test(entry.post) ? { post: finishPost(entry.post) }
        : choice === 'Old Prompt 2025' && entry.post.includes(THINK_CHECK_2025) ? { post: finishPost(entry.post, { keepReasoning: true }) }
            : undefined;
    return { ...entry, teg, post, ownAnalysis, whtml: html, expaltshow: beta.expaltshow, CCPC: beta.CCPC, CCPCA: beta.CCPCA };
}

/** The former Beta branch, shared unchanged across all selectable prompts. */
export function assemblePromptLayers(base, beta, {
    analysisOn = true, shift = 'None', shiftItem = '', shiftScope = 'restarted', geminiBypassEnabled = false, narrator = '', narratorStrength,
} = {}) {
    const early = resolveNarratorStrength(narratorStrength) === 'Low';
    const sceneSheet = usesSceneSheet(base, analysisOn);
    let teg;
    if (sceneSheet) {
        // No feedback means no RECOGNITION box. Keep the existing Beta conditional edits,
        // including the route reminder for an active shift. Box 6 is always built whole: with
        // Gemini Bypass on, its explicit warm-up is cut at SEND time for every model except Claude
        // (applyGeminiBypassForModel in promptModifiers.js), because only then is the model known.
        let body = shiftItem ? beta.body : beta.body
            .replace(/RECOGNITION \[0\/6\][\s\S]*?(?=SPARK \[1\/6\])/, '')
            .replace(' (Technically Seven)', '');
        // Check output settings in BOARD; avoid duplication if Fox adds this to the upstream prompt master.
        const povTenseCheck = "- POV + TENSE CHECK: Confirm the active character/player POV (e.g. 3rd/2nd = she/you). Narrate in present tense unless explicitly overridden or describing a requested time skip; don’t inherit POV or tense errors from previous replies.";
        if (!body.includes('- POV + TENSE CHECK:')) {
            body = body.replace('- Are character thoughts ENABLED or DISABLED?', line => `${line}\n${povTenseCheck}`);
        }
        const latestMessageReminder = '- Remember to respond to the latest user message in the chatlog.';
        if (!body.includes(latestMessageReminder)) {
            body = body.replace(/- POV \+ TENSE CHECK:[^\n]*/, line => `${line}\n${latestMessageReminder}`);
        }
        if (shiftItem) body = addShiftRouteLine(body, shiftScope);
        // A selected narrator (Lauren/Salem/Lucky, by name) takes over box 1 as their green room.
        body = addNarratorGreenRoom(body, narrator, early);
        teg = [beta.frameTop, shiftItem, beta.objectionValve, beta.bridgeLine, body, base.teg].filter(Boolean).join('\n\n');
    } else if (shift === 'Hard Mode') {
        // Beta's bridge line says "fill out your modified scene sheet", so a prompt running its own reasoning (2026, Analysis on)
        // never gets it. With Analysis off every prompt is treated alike, as before.
        teg = analysisOn && base.ownAnalysis ?`${shiftItem}\n\n${base.teg}` : `${shiftItem}\n\n${beta.bridgeLine}\n\n${base.teg}`;
    } else if (shiftItem) {
        teg = `${shiftItem}\n\n${base.teg}`;
    } else {
        teg = base.teg;
    }
    const note = beta.post.match(CLIENT_NOTE)?.[0] ?? '';
    // Analysis on + a prompt with its own reasoning: that prompt's original post-history, with no scene-sheet client note.
    const post = analysisOn && base.ownAnalysis ? base.ownAnalysis.post : base.post;
    // High keeps the narrator after the client note; Low routes it after the card. Do not add a
    // narrator to prompts that never carried one (including the special cards' own prompts).
    const hasNarrator = teg.includes(NARRATOR_SLOT) || post.includes(NARRATOR_SLOT);
    const narratorLayer = hasNarrator ? `${NARRATOR_SLOT}\n${narrator
        ? 'Narrator asides never reveal hidden character or lorebook information that {{user}} has not learned in the story.\n'
        : ''}\n` : '';
    return {
        teg: applyGeminiBypass(teg.replaceAll(NARRATOR_SLOT, ''), geminiBypassEnabled),
        post: (sceneSheet ? note : '') + (early ? '' : narratorLayer) + post.replace(CLIENT_NOTE, '').replaceAll(NARRATOR_SLOT, ''),
        narratorEarly: early ? narratorLayer : '',
    };
}

/** Shared by chat and WeyPhone; expanded focus/HTML values are supplied by the caller. */
export function resolvePromptPost(entry, { focus, htmlEnabled = false, htmlInstructions = '' }) {
    return entry.post.replaceAll('{{pipe}}', `${focus}\n${htmlEnabled ? (entry.whtml ?? htmlInstructions) : '====='}`);
}
