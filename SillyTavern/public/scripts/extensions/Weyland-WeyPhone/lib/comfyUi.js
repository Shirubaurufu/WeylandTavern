// lib/comfyUi.js
//
// Thin client for the nightly-only ComfyUI<->WeyPhone bridge (the
// "/pawxai-character/send-to-07b" route added to the local
// ComfyUI-PawXai-Character custom node — see that repo's
// dev_send_to_07b.py). Only meaningful when a ComfyUI instance with that
// route is actually running at `baseUrl`; every function here fails soft
// (rejects with a clear Error) rather than assuming it's reachable.

export const COMFYUI_DEFAULT_BASE_URL = 'http://127.0.0.1:8188';
export const COMFYUI_SEND_TIMEOUT_MS = 15_000;
export const COMFYUI_POLL_INTERVAL_MS = 1_500;
export const COMFYUI_POLL_TIMEOUT_MS = 5 * 60_000; // 5 min — a still can take a while under load

function trimBaseUrl(baseUrl) {
    return String(baseUrl ?? '').trim().replace(/\/+$/, '') || COMFYUI_DEFAULT_BASE_URL;
}

async function readJsonSafe(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

/**
 * Sends a PawXai-generated prompt straight to the local 07B WeyGen workflow's
 * PawXaiCharacterPrompt node and queues it.
 * @param {{
 *   baseUrl?: string,
 *   character?: string,
 *   prompt: string,
 *   outfit?: string,
 *   variant?: string,
 *   resolution?: string,
 *   filenamePrefix?: string,
 *   seed?: number,
 *   fetchImpl?: typeof fetch,
 *   signal?: AbortSignal,
 * }} options
 * @returns {Promise<{promptId: string, saveNodeId: string}>}
 */
export async function sendPawXaiPromptToComfyUI({
    baseUrl = COMFYUI_DEFAULT_BASE_URL,
    character,
    prompt,
    outfit,
    variant,
    resolution,
    filenamePrefix,
    seed,
    fetchImpl = fetch,
    signal,
} = {}) {
    const cleanPrompt = String(prompt ?? '').trim();
    if (!cleanPrompt) throw new Error('sendPawXaiPromptToComfyUI: prompt is required');

    const controller = typeof AbortController === 'function' && !signal ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), COMFYUI_SEND_TIMEOUT_MS) : null;
    try {
        const response = await fetchImpl(`${trimBaseUrl(baseUrl)}/pawxai-character/send-to-07b`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            signal: signal ?? controller?.signal,
            body: JSON.stringify({
                character,
                prompt: cleanPrompt,
                outfit,
                variant,
                resolution,
                filename_prefix: filenamePrefix,
                seed,
            }),
        });
        const body = await readJsonSafe(response);
        if (!response.ok || !body?.prompt_id) {
            const message = body?.error?.message || body?.error || `HTTP ${response.status}`;
            throw new Error(`ComfyUI rejected the prompt: ${typeof message === 'string' ? message : JSON.stringify(message)}`);
        }
        return { promptId: body.prompt_id, saveNodeId: body.node_ids?.save ?? '11' };
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

/**
 * Polls ComfyUI's own /history endpoint until the given prompt finishes, then
 * returns the first image produced by the save node.
 * @param {{
 *   baseUrl?: string,
 *   promptId: string,
 *   saveNodeId?: string,
 *   fetchImpl?: typeof fetch,
 *   signal?: AbortSignal,
 *   intervalMs?: number,
 *   timeoutMs?: number,
 * }} options
 * @returns {Promise<{filename: string, subfolder: string, type: string}>}
 */
export async function pollComfyUiHistory({
    baseUrl = COMFYUI_DEFAULT_BASE_URL,
    promptId,
    saveNodeId = '11',
    fetchImpl = fetch,
    signal,
    intervalMs = COMFYUI_POLL_INTERVAL_MS,
    timeoutMs = COMFYUI_POLL_TIMEOUT_MS,
} = {}) {
    if (!promptId) throw new Error('pollComfyUiHistory: promptId is required');
    const deadline = Date.now() + timeoutMs;
    const url = `${trimBaseUrl(baseUrl)}/history/${encodeURIComponent(promptId)}`;

    while (true) {
        if (signal?.aborted) throw new Error('ComfyUI poll aborted');
        if (Date.now() > deadline) throw new Error('Timed out waiting for ComfyUI to finish rendering');

        const response = await fetchImpl(url, { signal });
        const body = await readJsonSafe(response);
        const entry = body?.[promptId];
        if (entry?.status?.completed) {
            if (entry.status.status_str && entry.status.status_str !== 'success') {
                const messages = JSON.stringify(entry.status.messages ?? entry.status);
                throw new Error(`ComfyUI generation failed: ${messages}`);
            }
            const images = entry.outputs?.[saveNodeId]?.images;
            const image = Array.isArray(images) ? images[0] : null;
            if (!image?.filename) throw new Error('ComfyUI finished but produced no image on the expected save node');
            return { filename: image.filename, subfolder: image.subfolder ?? '', type: image.type ?? 'output' };
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
}

/**
 * Builds a direct-viewable URL for a ComfyUI-served image (mirrors WeyPhone's
 * existing convention of plain URL-string <img src> — see lib/portraits.js).
 * @param {{baseUrl?: string, filename: string, subfolder?: string, type?: string}} options
 * @returns {string}
 */
export function comfyUiImageUrl({ baseUrl = COMFYUI_DEFAULT_BASE_URL, filename, subfolder = '', type = 'output' } = {}) {
    const params = new URLSearchParams({ filename: filename ?? '', subfolder, type });
    return `${trimBaseUrl(baseUrl)}/view?${params.toString()}`;
}
