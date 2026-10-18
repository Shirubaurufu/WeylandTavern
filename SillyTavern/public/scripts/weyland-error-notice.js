// A DOM event keeps the Formatter independent of WeyPhone's startup and navigation state.
export const ERROR_HELP_EVENT = 'weyland:open-error-help';
export const INTERRUPTED_TITLE = 'Message Interrupted';
export const INTERRUPTED_BODY = 'The AI was mid-analysis when it was interrupted, either by a content filter, API issue or your ISP.';

// Some models come from a limited supply the whole community shares (2026-10-17: Sonnet 4.5 and
// Gemini 4 Argon). When the shared allowance runs out, HelixMind answers with something like
// "rate limit exceeded: key=rl:usr:<id>:grp:beta:rpd limit=2000". That reads like the player's own
// key broke (the usr id is our plan's, not theirs), and the generic 429 advice ("wait a minute")
// is wrong here, so the notice is swapped for Lucky's wording. `rpd` = requests per day; the
// window is rolling 24 hours, which is why the copy says "a few hours" and not "tomorrow".
// 2026-10-18: HelixMind reworded it to 'model group "beta" daily request limit exceeded (2000 requests per
// 24 hours). Try again in 2 seconds.' Both wordings are matched. The new one is keyed on "model group" +
// "daily request limit" so a player's OWN key quota (which never mentions a model group) keeps its own
// message, and its "Try again in 2 seconds" is exactly the advice the replacement notice exists to undo.
export const COMMUNITY_MODEL_LIMIT_PATTERN = /\brpd\s*limit\b|\bmodel\s+group\b[^\n]*?\bdaily\s+request\s+limit\b/i;
export const COMMUNITY_MODEL_LIMIT_TITLE = 'Community Model Maxed Out';
export const COMMUNITY_MODEL_LIMIT_BODY = 'This model is shared across the community and has reached its maximum usage for the day.\n\nPlease swap to another model. You may try this model again in a few hours.';
export const COMMUNITY_MODEL_LIMIT_ARTICLE = 'community-model-limit';

// A toast that opens one PromptOS error article when tapped (or Enter/Space while focused).
function showHelpNotice(kind, body, title, articleId) {
    const open = () => document.dispatchEvent(new CustomEvent(ERROR_HELP_EVENT, { detail: { articleId } }));
    const notice = toastr[kind](`${body}<br><br>Tap this message for more information.`, title, {
        timeOut: 15000, extendedTimeOut: 10000, closeButton: true, escapeHtml: false,
        preventDuplicates: true, onclick: open,
    });
    // Toastr supports pointer activation; supply keyboard activation for the same destination.
    notice?.attr?.({ tabindex: '0', role: 'button', 'aria-label': `${title}. Open error information.` });
    notice?.on?.('keydown', event => {
        if (event.target !== event.currentTarget) return; // Leave the close button's keys alone.
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
    return notice;
}

export function showMessageInterrupted() {
    showHelpNotice('warning', INTERRUPTED_BODY, INTERRUPTED_TITLE, 'interrupted');
}

// Drop-in for openai.js's `toastr.error(message, 'Chat Completion API')`. Only the shared daily limit
// is rewritten; every other API error keeps its own words and title. Weyland-Router recognizes the
// rewritten title too (its API_ERROR_PATTERNS), so Router users still fail over to the next model
// instantly and never see this toast.
export function showChatCompletionError(message, title = 'Chat Completion API') {
    if (typeof message === 'string' && COMMUNITY_MODEL_LIMIT_PATTERN.test(message)) {
        return showHelpNotice('error', COMMUNITY_MODEL_LIMIT_BODY.replaceAll('\n', '<br>'), COMMUNITY_MODEL_LIMIT_TITLE, COMMUNITY_MODEL_LIMIT_ARTICLE);
    }
    return toastr.error(message, title);
}
