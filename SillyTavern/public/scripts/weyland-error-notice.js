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

// HelixMind's generic "something was rejected" message (2026-10-18): "provider rejected the request; contact support
// with the request id". It is what comes back both when a provider's filter turns a request down and when a
// provider has a short outage, and players were contacting support with the request id. The raw text is replaced
// by Lucky's wording and the toast opens the guide card, which walks through the steps. The title stays
// "Chat Completion API" on purpose: Weyland-Router recognises failures by that title (and its own failover
// would otherwise wait out the generation timeout).
export const REQUEST_REJECTED_PATTERN = /provider rejected the request/i;
export const REQUEST_REJECTED_BODY = 'Request rejected:<br>Provider is down or a filter rejected your content.';
export const REQUEST_REJECTED_ARTICLE = 'request-rejected';

// Every other error that the PromptOS Error Message Information guide covers also gets "tap for more info".
// The guide's own catalog decides what is covered (its card patterns), so a new card gains the tap with no edit here.
// It is loaded lazily and best effort: WeyPhone may be missing, and the catalog imports this file (a static import
// would be a cycle). Until it has loaded, errors simply show as plain toasts, as before.
const GUIDE_GROUPS = new Set(['Replies', 'Connection', 'API key and account']);
let guideCatalog = null;
const guideLoading = import('./extensions/Weyland-WeyPhone/lib/errorHelpCatalog.js')
    .then(module => { guideCatalog = module; })
    .catch(() => { /* no guide installed: nothing to link to */ });
/** Resolves once the guide catalog has been loaded (or failed to). Mainly for tests. */
export const whenErrorGuideReady = () => guideLoading;

const escapeText = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** The guide card for a raw error message: a card's exact (specificMatch) pattern first, then its general one. */
export function findGuideArticle(message) {
    if (!guideCatalog || typeof message !== 'string' || !message.trim()) return null;
    const text = message.replace(/https?:\/\/\S+/gi, ''); // a URL can hold an unrelated error number
    const cards = guideCatalog.ERROR_HELP_CARDS.filter(card => GUIDE_GROUPS.has(card.group));
    return (cards.find(card => card.specificMatch?.test(text)) ?? cards.find(card => card.match?.test(text)))?.id ?? null;
}

// A toast that opens one PromptOS error article when tapped (or Enter/Space while focused).
function showHelpNotice(kind, body, title, articleId, hint = 'Tap this message for more information.') {
    const open = () => document.dispatchEvent(new CustomEvent(ERROR_HELP_EVENT, { detail: { articleId } }));
    const notice = toastr[kind](`${body}<br><br>${hint}`, title, {
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
    if (typeof message === 'string' && REQUEST_REJECTED_PATTERN.test(message)) {
        return showHelpNotice('error', REQUEST_REJECTED_BODY, title, REQUEST_REJECTED_ARTICLE, 'Tap for more info.');
    }
    // Anything else the guide covers keeps its own words and title, plus a tap-through to its card.
    const articleId = findGuideArticle(message);
    if (articleId) return showHelpNotice('error', escapeText(message), title, articleId, 'Tap for more info.');
    return toastr.error(message, title);
}
