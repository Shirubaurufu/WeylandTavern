// Every model request created by WeyPhone is bounded below the provider's 65K-token hard limit.
// Browser-side tokenizers are model-specific and expensive, so this deliberately uses a
// conservative 3.2 characters/token estimate (plus per-message overhead). In ordinary English
// that trims earlier than most real tokenizers would, leaving ample transport/model headroom.

export const PHONE_REQUEST_MAX_INPUT_TOKENS = 35_000;
export const PHONE_REQUEST_ESTIMATED_CHARS_PER_TOKEN = 3.2;
const MESSAGE_OVERHEAD_TOKENS = 8;
const TRIM_MARKER = '\n\n[...older WeyPhone context omitted to stay within the phone request limit...]\n\n';

export function estimatePhoneRequestTokens(messages) {
    return (Array.isArray(messages) ? messages : []).reduce((total, message) => {
        const chars = Array.from(String(message?.content ?? '')).length;
        return total + MESSAGE_OVERHEAD_TOKENS + Math.ceil(chars / PHONE_REQUEST_ESTIMATED_CHARS_PER_TOKEN);
    }, 0);
}

function truncateMiddle(content, maxTokens) {
    const value = String(content ?? '');
    const maxChars = Math.max(0, Math.floor((maxTokens - MESSAGE_OVERHEAD_TOKENS) * PHONE_REQUEST_ESTIMATED_CHARS_PER_TOKEN));
    if (Array.from(value).length <= maxChars) return value;
    const marker = Array.from(TRIM_MARKER);
    if (maxChars <= marker.length + 16) return Array.from(value).slice(-maxChars).join('');
    const source = Array.from(value);
    const available = maxChars - marker.length;
    const head = Math.floor(available * 0.55);
    return [...source.slice(0, head), ...marker, ...source.slice(-(available - head))].join('');
}

/**
 * Keeps the first system instruction, the final request, and as much newest intervening history
 * as fits. Whole old turns are discarded before any required edge message is shortened.
 */
export function limitPhoneRequestMessages(messages, maxTokens = PHONE_REQUEST_MAX_INPUT_TOKENS) {
    const source = (Array.isArray(messages) ? messages : [])
        .filter(message => message && typeof message.content === 'string')
        .map(message => ({ ...message }));
    if (source.length === 0 || estimatePhoneRequestTokens(source) <= maxTokens) return source;

    if (source.length === 1) {
        return [{ ...source[0], content: truncateMiddle(source[0].content, maxTokens) }];
    }

    const hasLeadingSystem = source[0]?.role === 'system';
    const system = hasLeadingSystem ? source[0] : null;
    const finalIndex = source.length - 1;
    const final = source[finalIndex];
    const systemTokens = system ? estimatePhoneRequestTokens([system]) : 0;
    const finalTokens = estimatePhoneRequestTokens([final]);

    let boundedSystem = system;
    let boundedFinal = final;
    if (systemTokens + finalTokens > maxTokens) {
        const systemShare = system ? Math.floor(maxTokens * 0.58) : 0;
        const finalShare = maxTokens - systemShare;
        if (system) boundedSystem = { ...system, content: truncateMiddle(system.content, systemShare) };
        boundedFinal = { ...final, content: truncateMiddle(final.content, finalShare) };
    }

    const selected = [];
    if (boundedSystem) selected.push(boundedSystem);
    const fixedTokens = estimatePhoneRequestTokens([...selected, boundedFinal]);
    let remaining = Math.max(0, maxTokens - fixedTokens);
    const middleStart = hasLeadingSystem ? 1 : 0;
    const newestMiddle = [];
    for (let index = finalIndex - 1; index >= middleStart; index--) {
        const cost = estimatePhoneRequestTokens([source[index]]);
        if (cost > remaining) continue;
        newestMiddle.unshift(source[index]);
        remaining -= cost;
    }
    selected.push(...newestMiddle);
    selected.push(boundedFinal);
    return selected;
}
