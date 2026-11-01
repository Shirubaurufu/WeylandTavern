// GLM requests must not carry image parts, including images from older chat turns.
// Run just before serialization, after model routing. Never rewrite saved chat content:
// the same conversation may be sent to an image-capable model on the next attempt.
const GLM_MODEL = /^(?:[^/\s]+\/)*glm(?:$|[-_. ]?\d)/i;

function isImagePart(part) {
    return part?.type === 'image_url' || part?.type === 'image' || part?.type === 'input_image';
}

/**
 * Omit images from a GLM request without touching the caller's objects.
 * Non-GLM requests stop before inspecting messages. Text-only GLM requests keep
 * their original objects too. Image data is never scanned, decoded or copied.
 * @template {{model?: string, messages?: any[]}} T
 * @param {T} data Outgoing chat-completion payload
 * @returns {T} Original payload unless at least one image part was removed
 */
export function omitGlmImages(data) {
    if (typeof data?.model !== 'string' || !GLM_MODEL.test(data.model.trim()) || !Array.isArray(data.messages)) return data;

    const messages = data.messages;
    let filtered;
    for (let index = 0; index < messages.length; index++) {
        const message = messages[index];
        const content = message?.content;
        if (!Array.isArray(content) || !content.some(isImagePart)) {
            if (filtered) filtered.push(message);
            continue;
        }

        filtered ??= messages.slice(0, index);
        const remaining = content.filter(part => !isImagePart(part));
        // Affected text-only turns use ordinary string content, accepted by text
        // backends. Keep other content kinds and all message/tool metadata intact.
        const textOnly = remaining.every(part => part?.type === 'text' && typeof part.text === 'string');
        const nextContent = textOnly ? remaining.map(part => part.text).join('\n') : remaining;
        // An image-only history turn has nothing left to send. Tool protocol turns
        // must retain their position and IDs even when their content becomes empty.
        if (textOnly && !nextContent.trim() && !message.tool_calls?.length
            && !message.function_call && message.role !== 'tool' && message.role !== 'function') continue;
        filtered.push({ ...message, content: nextContent });
    }
    return filtered ? { ...data, messages: filtered } : data;
}
