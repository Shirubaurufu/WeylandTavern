// Render only image syntax, leaving ordinary phone text and stored messages untouched.
// Do not run the main chat formatter here: it has roleplay-specific transformations.
export function safeImageUrl(value) {
    if (typeof value !== 'string') return null;
    const url = value.trim();
    if (!/^https?:\/\//i.test(url)) return null;
    try {
        const parsed = new URL(url);
        return parsed.username || parsed.password ? null : parsed.href;
    } catch { return null; }
}

function resolveGreetingImage(code) {
    // Same numeric global-variable lookup as Weyland-Formatter's introImagesExt.
    return globalThis.SillyTavern?.getContext?.().variables?.global?.get?.(code);
}

export function parseMessageImages(content, resolveShortcut = resolveGreetingImage) {
    const text = String(content ?? '');
    // Inline Markdown (including a parenthesized URL segment and optional title), plus
    // the exact [I001]/[P001] syntax supported by the host greeting formatter.
    const pattern = /!\[((?:\\.|[^\]\\])*)\]\(\s*(<[^>\n]+>|(?:[^\s()]+|\([^\s()]*\))+)\s*(?:"[^"\n]*"|'[^'\n]*')?\s*\)|\[\s*[IP](\d{3})\s*\]/g;
    const parts = [];
    let end = 0;
    for (const match of text.matchAll(pattern)) {
        let candidate = match[2]?.replace(/^<|>$/g, '');
        if (match[3]) {
            try { candidate = resolveShortcut(match[3]); } catch { candidate = null; }
        }
        const url = safeImageUrl(candidate);
        if (!url) continue; // Missing/unsafe references stay readable, never disappear.
        if (match.index > end) parts.push({ type: 'text', text: text.slice(end, match.index) });
        parts.push({ type: 'image', url, alt: match[1] || 'Attached image' });
        end = match.index + match[0].length;
    }
    if (end < text.length) parts.push({ type: 'text', text: text.slice(end) });
    return parts;
}

export function renderMessageImages(target, content, { selectable = false, resolveShortcut } = {}) {
    const doc = target.ownerDocument;
    for (const part of parseMessageImages(content, resolveShortcut)) {
        if (part.type === 'text') {
            target.appendChild(doc.createTextNode(part.text));
            continue;
        }
        const link = doc.createElement(selectable ? 'span' : 'a');
        link.className = 'wp-message-image-link';
        if (!selectable) {
            link.href = part.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.title = 'Open full-size image';
            // Let selection-mode clicks reach the bubble; ordinary image clicks only open it.
            link.addEventListener('click', event => event.stopPropagation());
        }
        const img = doc.createElement('img');
        img.className = 'wp-message-image';
        img.alt = part.alt;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => {
            link.textContent = `Image unavailable — ${part.url}`;
        }, { once: true });
        img.src = part.url;
        link.appendChild(img);
        target.appendChild(link);
    }
}
