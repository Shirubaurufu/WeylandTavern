/**
 * Looks up the resolved master-prompt entry (system prompt + post-history template)
 * for the given prompt choice, falling back to "Current Prompt" if the choice is unknown.
 * @param {Map<string, {teg: string, post: string, whtml?: string}>} ravs quick-reply-ext's exported ravs Map
 * @param {string} promptChoice The value of the "PromptChoice" global variable
 */
export function resolveMasterPrompt(ravs, promptChoice) {
    const entry = ravs.get(promptChoice) ?? ravs.get('Current Prompt');
    if (!entry) {
        throw new Error(`No rav.js entry found for prompt choice "${promptChoice}" or fallback "Current Prompt"`);
    }
    return entry;
}

/**
 * Replicates quick-reply-ext's XXX()'s {{pipe}} substitution in rav.post.
 *
 * NOTE: the real XXX() branches on a chat-LOCAL "ExpAltShow" variable (rav.expaltshow vs.
 * {{getglobalvar::RPFocus}}). WeyPhone has no chat context, so ExpAltShow is always
 * unset/false here — this always takes the same branch a brand-new chat would take before
 * ExpAltShow is ever toggled on, i.e. always uses rpFocus (a genuinely global variable).
 * @param {{post: string, whtml?: string}} ravEntry
 * @param {{htmlEnabled: boolean, rpFocus?: string}} options
 */
export function resolvePostHistoryInstructions(ravEntry, { htmlEnabled, rpFocus }) {
    const focusText = rpFocus ?? '';
    const htmlPart = htmlEnabled ? (ravEntry.whtml ?? '') : '=====';
    return ravEntry.post.replaceAll('{{pipe}}', `${focusText}\n${htmlPart}`);
}

/**
 * @param {{vars?: Record<string, string>} | null | undefined} config charPer.get(charName)
 */
export function resolvePersonalityText(config) {
    const vars = config?.vars ?? {};
    const keys = Object.keys(vars);
    if (!keys.length) return '';
    return vars[keys[0]];
}

/**
 * Replicates the small character-specific extras quick-reply-ext's CharPer() layers on top
 * of the standard charPer Map lookup. WeyPhone has no chat-local state to source the
 * triggering flags from yet (mcyYear, weepingWillow, isRestricted) — callers pass an empty
 * object today and get the base personality text back, which is a documented milestone-1
 * simplification, not a missing feature.
 * @param {string} charName
 * @param {string} personalityText
 * @param {{mcyYear?: string, mcyMinusTwoYear?: string, weepingWillow?: boolean, expressWillowText?: string, isRestricted?: boolean}} context
 */
export function applySpecialCase(charName, personalityText, context) {
    switch (charName) {
        case 'Aiko': {
            const attends = context.mcyYear !== 'Freshman' && context.mcyYear !== 'Sophomore';
            if (!attends) return personalityText;
            const yearPart = context.mcyMinusTwoYear ? `${context.mcyMinusTwoYear} ` : '';
            const attendance = `Aiko attends Weyland University Monday-Friday. Aiko is now starting her ${yearPart}year of Demonology at Weyland.`;
            return `${attendance}\n${personalityText}`;
        }
        case 'Willow':
            return context.weepingWillow ? `${personalityText}\n${context.expressWillowText ?? ''}` : personalityText;
        case 'Hannah':
            return context.isRestricted ? `${personalityText}\nShe is still a virgin.` : personalityText;
        default:
            return personalityText;
    }
}
