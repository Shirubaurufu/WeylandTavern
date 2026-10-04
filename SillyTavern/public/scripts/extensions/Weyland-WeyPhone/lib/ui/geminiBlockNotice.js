// lib/ui/geminiBlockNotice.js
//
// When Gemini's word filter rejects a prompt, the provider hands back its rejection as the reply
// text ("The prompt could not be submitted. The prompt contains sensitive words that violate
// Google's [Generative AI Prohibited Use policy](...)..."), so it lands in the chat as an ordinary
// character message. Players reroll it over and over because nothing tells them that's pointless.
// This tacks a short system note onto any such message pointing them at the PromptOS guide
// (lib/ui/apps/geminiFilterGuide.js).
//
// Display only, on purpose: the note is added to the rendered message, never to chat[i].mes. A
// saved note would ride along in the prompt as part of "the character's last reply", which is
// inside the window the word filter scores, and it would show up in edits and copies. The trade is
// that it has to be re-added every time ST re-renders a message, hence the observer below.

/** Matched against the rendered text, where the policy link has become plain words. */
export const GEMINI_BLOCK_TRIGGER = 'The prompt contains sensitive words that violate Google\'s Generative AI Prohibited Use policy';

const NOTICE_CLASS = 'wp-gemini-block-notice';

export function isGeminiBlockText(text) {
    const flat = String(text ?? '').replace(/[‘’]/g, '\'').replace(/\s+/g, ' ');
    return flat.includes(GEMINI_BLOCK_TRIGGER);
}

/** Lucky's wording. Inline styles so it reads the same under any SillyTavern theme without
 * WeyPhone's stylesheet being involved in chat rendering. */
export function geminiBlockNoticeHtml() {
    return `<div class="${NOTICE_CLASS}" style="margin-top:12px;padding:10px 12px;border-left:3px solid #4f7fc4;border-radius:6px;background:rgba(79,127,196,.12);font-size:.92em;line-height:1.5;">
<p style="margin:0 0 6px;"><b>SYSTEM NOTE:</b> It looks like you were hit by Gemini's "dumb" filter.<br>Don't re-roll this response without changing your message. It will just block you again.</p>
<p style="margin:0 0 4px;">We made a guide that explains the situation and how to get around it in your WeyPhone.</p>
<p style="margin:0;">-&gt; Open your WeyPhone (phone icon by your chatbar)<br>-&gt; PromptOS<br>-&gt; Scroll down to the Gemini Bypass<br>-&gt; Tap "READ ME - Gemini Filter Guide"</p>
</div>`;
}

/** Adds the note to one rendered message body if it's a block message and doesn't have it yet. */
export function decorateMessageText(mesText) {
    if (!mesText || mesText.querySelector(`.${NOTICE_CLASS}`)) return false;
    if (!isGeminiBlockText(mesText.textContent)) return false;
    mesText.insertAdjacentHTML('beforeend', geminiBlockNoticeHtml());
    return true;
}

/**
 * Watches the chat for rendered messages. ST rewrites a message's .mes_text on every render
 * (first render, swipe, edit, chat reload), which wipes the note, so a MutationObserver re-adds
 * it. Work per batch is only the .mes_text elements the mutations touched, and the text check is a
 * plain includes(), so streaming replies stay cheap.
 */
export function installGeminiBlockNotice(doc = document) {
    const chat = doc.getElementById('chat');
    if (!chat || typeof MutationObserver === 'undefined') return null;
    let pending = new Set();
    let scheduled = false;
    const flush = () => {
        scheduled = false;
        const targets = pending;
        pending = new Set();
        for (const mesText of targets) if (mesText.isConnected) decorateMessageText(mesText);
    };
    const queue = (mesText) => {
        if (!mesText) return;
        pending.add(mesText);
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(flush);
        }
    };
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
            // Our own insertion shows up here too; decorateMessageText's "already has it" check
            // makes that a no-op instead of a loop.
            queue(target?.closest?.('.mes_text'));
            for (const node of record.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches?.('.mes_text')) queue(node);
                node.querySelectorAll?.('.mes_text').forEach(queue);
            }
        }
    });
    observer.observe(chat, { childList: true, subtree: true, characterData: true });
    chat.querySelectorAll('.mes_text').forEach(queue);
    return observer;
}
