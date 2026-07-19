/**
 * Copies text from a real click handler. The synchronous textarea path comes first because
 * navigator.clipboard is commonly unavailable on HTTP/Tailscale phone sessions; if the legacy
 * browser command is unavailable, the modern async API remains the fallback.
 * @param {string} text
 * @param {{documentApi?: Document, navigatorApi?: Navigator}} [dependencies]
 * @returns {Promise<boolean>}
 */
export async function copyTextToClipboard(text, dependencies = {}) {
    const documentApi = dependencies.documentApi ?? globalThis.document;
    const navigatorApi = dependencies.navigatorApi ?? globalThis.navigator;
    const value = String(text ?? '');

    if (documentApi?.body && documentApi.createElement && documentApi.execCommand) {
        const textarea = documentApi.createElement('textarea');
        const previouslyFocused = documentApi.activeElement;
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.inset = '-9999px auto auto -9999px';
        textarea.style.opacity = '0';
        documentApi.body.appendChild(textarea);
        try {
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange?.(0, value.length);
            if (documentApi.execCommand('copy')) return true;
        } catch {
            // Continue to the modern API below.
        } finally {
            textarea.remove();
            previouslyFocused?.focus?.();
        }
    }

    try {
        if (!navigatorApi?.clipboard?.writeText) return false;
        await navigatorApi.clipboard.writeText(value);
        return true;
    } catch {
        return false;
    }
}
