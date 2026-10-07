import { assembleRoleplayShiftItem } from '../../quick-reply-ext/src/roleplayShiftItem.js';

export function catnipRecipes(config) {
    const seen = new Set();
    return (Array.isArray(config?.catnipRecipes) ? config.catnipRecipes : []).filter(recipe => {
        if (!recipe || typeof recipe.id !== 'string' || seen.has(recipe.id)
            || typeof recipe.name !== 'string' || !recipe.name.trim()
            || typeof recipe.instructions !== 'string' || !recipe.instructions.trim()) return false;
        seen.add(recipe.id);
        return true;
    }).map(recipe => ({ id: recipe.id, name: recipe.name.slice(0, 80), instructions: recipe.instructions.slice(0, 6000), auto: recipe.auto === true }));
}

export function buildCatnipFeedback(config, note = '', onceIds = []) {
    const once = new Set(onceIds);
    const recipes = catnipRecipes(config).filter(recipe => recipe.auto || once.has(recipe.id));
    // The current, explicit note comes last so it can refine a standing recipe.
    return [...recipes.map(recipe => `[Catnip nip: ${recipe.name}]\n${recipe.instructions}`), String(note).trim()].filter(Boolean).join('\n\n');
}

function substitute(context, text) {
    try { return String(context.substituteParams?.(text) ?? text).trim(); } catch { return ''; }
}

function variable(context, name, local = false) {
    const macro = `{{${local ? 'getvar' : 'getglobalvar'}::${name}}}`;
    const value = substitute(context, macro);
    return value === macro || value.startsWith('{{') ? '' : value;
}

/** Compose live configured notes, respecting disabled notes and character replacement/order.
 * Copycat's explicit opt-in sends these on each rewrite, independent of main-chat cadence.
 * Reading settings directly avoids a cached extension prompt from the previous character.
 */
export function copycatAuthorsNotes(context) {
    const metadata = context.chatMetadata ?? {};
    const settings = context.extensionSettings?.note ?? {};
    if (Number(metadata.note_interval ?? settings.defaultInterval ?? 1) <= 0) return '';
    let text = String(metadata.note_prompt ?? settings.default ?? '');
    const avatar = context.characters?.[context.characterId]?.avatar;
    const filename = typeof avatar === 'string' ? avatar.replace(/\.[^/.]+$/, '') : '';
    const charNote = filename && settings.chara?.find(note => note.name === filename && note.useChara);
    if (charNote) {
        const own = String(charNote.prompt ?? '');
        text = charNote.position === 1 ? `${own}\n${text}` : charNote.position === 2 ? `${text}\n${own}` : own;
    }
    return substitute(context, text);
}

export function copycatCourseCorrection(context, beta) {
    if (!beta) return '';
    const dose = variable(context, 'DoseLive', true) === 'true' ? variable(context, 'DoseShift', true) : '';
    const saved = variable(context, 'RoleplayShift');
    const shift = dose || (variable(context, 'HardToggle') === 'On' ? 'Hard Mode' : saved === 'Hard Mode' ? 'None' : saved);
    let custom = null;
    if (shift === 'Custom Preset') {
        try {
            const parsed = JSON.parse(variable(context, 'RoleplayShiftCustom'));
            if (typeof parsed?.text === 'string' && parsed.text.trim()) custom = { name: String(parsed.name || 'Custom Preset'), text: parsed.text.trim() };
        } catch { /* No valid active custom preset. */ }
    }
    // Copycat has its own output contract, so ordinary corrections use the existing no-sheet
    // variant. General-Use is only active with Analysis enabled in the host prompt.
    const general = ['General-Use', 'Temporary'].includes(shift);
    const analysis = (variable(context, 'AnalysisToggle') || 'Enabled').toLowerCase() === 'enabled';
    const body = assembleRoleplayShiftItem(shift, beta, general && analysis, undefined, custom);
    return substitute(context, body);
}

export function copycatOptionalDirections(context, config, beta) {
    const notes = config.sendAuthorsNotes === true ? copycatAuthorsNotes(context) : '';
    const course = config.sendCourseCorrections === true ? copycatCourseCorrection(context, beta) : '';
    return [notes && `[AUTHOR'S NOTES]\n${notes}`, course && `[COURSE CORRECTION]\n${course}\nApply this correction to the requested rewrite. Keep Copycat's rewrite scope and output format.`].filter(Boolean).join('\n\n');
}
