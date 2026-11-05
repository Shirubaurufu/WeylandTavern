// HelixMind retired its DeepSeek and MiniMax models (2026-11, "temporarily"). Anything saved with one of those ids fails every
// request, so each Weyland extension that stores a model id moves it to Gemini 3.8 Flash ONCE.
//
// Once, on purpose, not on every load like the permanent STALE_MODEL_RENAMES maps: when HelixMind brings the models back, a
// player who picks DeepSeek again must be left alone. Each store carries its own marker (settings.retiredModelSwap) that is
// written whether or not anything needed changing, so a fresh install is marked too and its later choices are never touched.
//
// Pure (no DOM, no imports) so WeyPhone, LTM, Router and the main-chat swap can share it and Node can test it.

/** Changes only when there is a NEW round of retired models; installs that already ran this id are not swapped again. */
export const RETIRED_MODEL_SWAP_ID = 'hm-retired-deepseek-minimax-2026-11';
export const RETIRED_MODEL_REPLACEMENT = 'gemini-3.8-flash';

// 'minimax-m3', 'deepseek-v4-pro-thinking', 'MiniMax-M3', 'minimax/minimax-m3' ... the whole value must be a model-id-shaped
// token containing the family name, so a sentence that merely mentions DeepSeek is never rewritten.
const RETIRED_MODEL_PATTERN = /^[\w.:/-]*(?:deepseek|minimax)[\w.:/-]*$/i;

// Chat history and drafts hold free text; only fields that name a model are touched, and these never are walked.
const SKIPPED_KEYS = new Set(['messages', 'memories', '__drafts', '__chatState', 'history']);
const MAX_DEPTH = 8;

/** @param {unknown} value */
export function isRetiredModelId(value) {
    return typeof value === 'string' && RETIRED_MODEL_PATTERN.test(value.trim());
}

/**
 * Replaces every retired model id found in a field whose name contains "model" (modelOverride, memoryBackupModel,
 * fallbackModel, custom_model, ...), anywhere inside `node`.
 * @param {unknown} node settings object (mutated in place)
 * @returns {number} how many values were replaced
 */
export function swapRetiredModels(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return 0;
    let count = 0;
    for (const key of Array.isArray(node) ? node.keys() : Object.keys(node)) {
        if (SKIPPED_KEYS.has(String(key))) continue;
        const value = node[key];
        if (typeof value === 'string') {
            if (/model/i.test(String(key)) && isRetiredModelId(value)) {
                node[key] = RETIRED_MODEL_REPLACEMENT;
                count++;
            }
        } else if (value && typeof value === 'object') {
            count += swapRetiredModels(value, depth + 1);
        }
    }
    return count;
}

/**
 * Runs the swap on one settings object, once. The marker is written either way.
 * @param {Record<string, any>} settings
 * @returns {number} values replaced (0 when it already ran, or nothing needed it)
 */
export function applyRetiredModelSwapOnce(settings) {
    if (!settings || typeof settings !== 'object') return 0;
    if (settings.retiredModelSwap === RETIRED_MODEL_SWAP_ID) return 0;
    const count = swapRetiredModels(settings);
    settings.retiredModelSwap = RETIRED_MODEL_SWAP_ID;
    return count;
}
