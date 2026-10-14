// PromptOS -> Home -> Error Message Information. Renders the cards in errorHelpCatalog.js with the
// Gemini Filter Guide's building blocks (wp-gf-*), so both read as the same family of help pages.
//
// Deliberately not rendered: the search aliases (they're plumbing, and a list like "ECONN RESET,
// !Command, registrar" reads as noise), and any "what to send support" section. Support is a
// handful of people; a contact line at the bottom lets readers skip every step above it.
import { ERROR_HELP_CARDS, getErrorHelpCard, searchErrorHelp } from '../../errorHelpCatalog.js';
import { ensureGeminiGuideStylesheet } from './geminiFilterGuide.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const icon = name => `<i class="fa-solid fa-${name}" aria-hidden="true"></i>`;
const fmt = n => n.toLocaleString('en-US');

/** A redrawn Prompt Itemization (the real popup is a tall screenshot at phone width). Numbers are
 * from a real, healthy Gemini request (Lucky, 2026-10-09); only the rows that matter are kept, and
 * the two usual suspects carry their warning lines. Colors match SillyTavern's own chart. */
function itemizeChart() {
    const parts = [['System Info', 12206, 'sys'], ['Prompt Tokens', 5814, 'card'], ['World Info', 13882, 'wi'], ['Chat History', 2452, 'chat']];
    const watch = (label, value, limit) => `<div class="wp-eh-it-row is-watch is-sub"><span>${label}</span><b>${fmt(value)}</b><em>${icon('magnifying-glass')} Look here if it's over ${fmt(limit)}</em></div>`;
    const row = ([label, value, kind]) => `<div class="wp-eh-it-row is-${kind}${kind === 'wi' ? ' is-watch' : ''}"><span>${label}</span><b>${fmt(value)}</b>${kind === 'wi' ? `<em>${icon('magnifying-glass')} Look here if it's over ${fmt(16000)}</em>` : ''}</div>${kind === 'card' ? watch('User Persona', 140, 1000) : ''}`;
    return `<figure class="wp-eh-figure">
        <div class="wp-eh-itemize" role="img" aria-label="Example Prompt Itemization. World Info 13,882 tokens, look here if it's over 16,000. User Persona 140 tokens, look here if it's over 1,000. Total 34,354 of 60,000.">
            <div class="wp-eh-it-title">Prompt Itemization</div>
            <div class="wp-eh-it-body">
                <div class="wp-eh-it-bar" aria-hidden="true">${parts.map(([, value, kind]) => `<span class="is-${kind}" style="flex-grow:${value}"></span>`).join('')}</div>
                <div class="wp-eh-it-rows">${parts.map(row).join('')}</div>
            </div>
            <div class="wp-eh-it-total"><span>Total Tokens in Prompt</span><b>${fmt(34354)}</b></div>
            <div class="wp-eh-it-total"><span>Max Context</span><b>${fmt(60000)}</b></div>
        </div>
        <figcaption>A healthy example. Both suspects are under their limits here.</figcaption>
    </figure>`;
}

// Pictures a card's copy can place between paragraphs with `{ visual: name }`.
const VISUALS = {
    'itemize-button': () => `<figure class="wp-eh-figure"><img src="${new URL('../../../assets/help/prompt-itemization-button.png', import.meta.url).href}" alt="The Prompt button, a small list icon in the row of buttons above a message" loading="lazy"><figcaption>The Prompt button, in the row above a recent message.</figcaption></figure>`,
    'itemize-chart': itemizeChart,
};

// Paragraph boundaries belong to the copy, rather than a sentence/length heuristic.
const paragraphs = value => (Array.isArray(value) ? value : [value])
    .map(item => (typeof item === 'string' ? `<p>${escapeHtml(item)}</p>` : VISUALS[item?.visual]?.() ?? ''))
    .join('');
const actions = {
    home: ['Open PromptOS Home', 'sliders'],
    gemini: ['Read the Gemini Filter Guide', 'book-open'],
    dns: ['Turn on DNS Routing: 1.1.1.1', 'shield-halved'],
    registrar: ['Open the Registrar', 'id-card'],
};

// The path a reply takes, top to bottom. Cards mark how often the trouble is at each stop, which
// answers the question players actually have ("is it me?") before they read a single step.
const ROUTE = [
    // "Weyland Tavern", never bare "Weyland": players read "Weyland" as the site or API they connect to.
    ['you', 'desktop', 'Weyland Tavern', 'on your machine'],
    ['net', 'wifi', 'Your internet', 'Wi-Fi, provider, VPN'],
    ['helix', 'server', "Weyland's API - HelixMind", 'or your own API service'],
    ['model', 'feather-pointed', 'The AI model', 'and its filters'],
];
const ROUTE_LEVELS = ['probably fine', 'sometimes', 'often', 'usually'];

function ensureStyles() {
    ensureGeminiGuideStylesheet();
    if (typeof document === 'undefined' || document.getElementById('wp-error-help-css')) return;
    const link = document.createElement('link');
    link.id = 'wp-error-help-css';
    link.rel = 'stylesheet';
    link.href = new URL('./errorHelp.css', import.meta.url).href;
    document.head.append(link);
}

export function errorHelpHomeCard() {
    return `<section class="wp-narrative-card wp-error-help-entry">
        <div class="wp-narrative-card-heading"><div><span>When something goes wrong</span><h3>Error Message Information</h3></div>${icon('circle-question')}</div>
        <p>Got an error you don't recognize? Look it up here to find out what it means and how to fix it.</p>
        <button type="button" class="wp-narrative-primary" data-error-help-action="open">Look up an error ${icon('chevron-right')}</button>
    </section>`;
}

function cardLink(card) {
    return `<button type="button" class="wp-eh-result" data-error-help-card="${card.id}"><span><strong>${escapeHtml(card.title)}</strong><small>${escapeHtml(card.summary)}</small></span>${icon('chevron-right')}</button>`;
}

export function errorHelpResultsHtml(query = '') {
    const cards = searchErrorHelp(query);
    if (!cards.length) return `<div class="wp-eh-empty"><strong>Nothing matches that yet</strong><p>Try a shorter piece of the message, like "socket", "EPROTO" or just the error number.</p><button type="button" class="wp-gf-back" data-error-help-action="clear">Show every error</button></div>`;
    if (query.trim()) return `<p class="wp-eh-count" role="status">${cards.length} ${cards.length === 1 ? 'match' : 'matches'}</p><div class="wp-eh-list">${cards.map(cardLink).join('')}</div>`;
    return [...new Set(ERROR_HELP_CARDS.map(card => card.group))].map(group => `<section class="wp-eh-group"><h3>${escapeHtml(group)}</h3><div class="wp-eh-list">${cards.filter(card => card.group === group).map(cardLink).join('')}</div></section>`).join('');
}

function directory(query) {
    return `<button type="button" class="wp-gf-back" data-error-help-action="home">${icon('chevron-left')} PromptOS Home</button>
    <section class="wp-narrative-card wp-gf-intro">
        <span class="wp-gf-eyebrow">PromptOS help</span><h2 tabindex="-1">Error Message Information</h2>
        <p>Type a few words from the message, or the error number. You can also scroll the list below.</p>
        <label class="wp-eh-search-label" for="wp-error-search">Search errors</label>
        <div class="wp-eh-search">${icon('magnifying-glass')}<input id="wp-error-search" type="search" value="${escapeHtml(query)}" placeholder="socket hang up, blank reply, 401..." autocomplete="off" spellcheck="false"></div>
        <p class="wp-gf-small wp-eh-coverage">Not every error or warning has a definition in this database, but we are working to expand and improve this as a community resource.</p>
    </section><div class="wp-eh-results" aria-live="polite">${errorHelpResultsHtml(query)}</div>`;
}

/** "Where it usually goes wrong": the reply's path with each stop rated. Stops a card leaves out
 * are "probably fine", which is information too. */
function route(card) {
    if (!card.route) return '';
    const rows = ROUTE.map(([key, glyph, name, sub]) => {
        const raw = card.route[key] ?? 0;
        const [level, label] = Array.isArray(raw) ? raw : [raw, ROUTE_LEVELS[raw]];
        return `<div class="wp-gf-stack-row l${level}"><span>${icon(glyph)}<span><b>${name}</b><small class="wp-eh-route-sub">${sub}</small></span></span><small>${escapeHtml(label)}</small></div>`;
    }).join('');
    return `<strong class="wp-eh-route-title">Where it usually goes wrong</strong><div class="wp-gf-stack wp-eh-route" role="img" aria-label="${escapeHtml(ROUTE.map(([key, , name]) => {
        const raw = card.route[key] ?? 0;
        return `${name}: ${Array.isArray(raw) ? raw[1] : ROUTE_LEVELS[raw]}`;
    }).join('. '))}">${rows}</div>`;
}

function article(card) {
    const isNotice = card.noticeLabel === 'Notice';
    return `<button type="button" class="wp-gf-back" data-error-help-action="list">${icon('chevron-left')} All errors</button>
    <section class="wp-narrative-card wp-gf-intro">
        <span class="wp-gf-eyebrow">${escapeHtml(card.group)}</span><h2 tabindex="-1">${escapeHtml(card.title)}</h2>
        ${card.example ? `<div class="wp-narrative-matrix wp-gf-hero${isNotice ? ' wp-eh-notice' : ''}"><div class="wp-narrative-lcd"><div class="wp-narrative-lcd-meta"><span>What you saw</span><b>${icon(isNotice ? 'circle-info' : 'triangle-exclamation')} ${escapeHtml(card.noticeLabel ?? 'Error')}</b></div><p class="wp-gf-error wp-eh-example">${escapeHtml(card.example)}</p></div></div>` : ''}
        <div class="wp-eh-explanation">${paragraphs(card.explanation)}</div>
        ${route(card)}
    </section>
    ${card.steps.length ? `<section class="wp-narrative-card wp-gf-card">
        <div class="wp-gf-head"><span class="wp-gf-num">${icon('wrench')}</span><div><span class="wp-gf-eyebrow">${escapeHtml(card.stepsEyebrow ?? 'Start at the top')}</span><h3>${escapeHtml(card.stepsTitle ?? 'What to try')}</h3></div></div>
        <ol class="wp-gf-steps">${card.steps.map(step => `<li><strong>${escapeHtml(step.title)}</strong><div class="wp-eh-step-copy">${paragraphs(step.text)}</div></li>`).join('')}</ol>
        ${card.note ? `<div class="wp-gf-callout wp-eh-note">${icon('circle-info')}<div>${paragraphs(card.note)}</div></div>` : ''}
        ${card.actions?.length ? `<div class="wp-eh-actions">${card.actions.map(action => `<button type="button" class="wp-narrative-secondary" data-error-help-action="${action}">${icon(actions[action][1])} ${actions[action][0]}</button>`).join('')}</div>` : ''}
    </section>` : ''}
    ${card.related?.length ? `<section class="wp-narrative-card wp-gf-card"><div class="wp-gf-head"><span class="wp-gf-num">${icon('book-open')}</span><div><span class="wp-gf-eyebrow">If you need it</span><h3>Related guides</h3></div></div><div class="wp-eh-list">${card.related.map(getErrorHelpCard).filter(Boolean).map(cardLink).join('')}</div>
        ${card.sources?.length ? `<details class="wp-gf-more"><summary><span>Links</span>${icon('chevron-down')}</summary><div class="wp-gf-more-body wp-eh-sources">${card.sources.map(([label, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ${icon('arrow-up-right-from-square')}</a>`).join('')}</div></details>` : ''}
    </section>` : ''}
    <button type="button" class="wp-gf-back wp-gf-back-end" data-error-help-action="list">${icon('chevron-left')} All errors</button>`;
}

export function renderErrorHelpScreen(container, { articleId = null, query = '' } = {}) {
    ensureStyles();
    const card = getErrorHelpCard(articleId);
    container.innerHTML = `<div class="wp-narrative wp-gf wp-eh"><div class="wp-narrative-content">${card ? article(card) : directory(query)}</div></div>`;
}

/** Replace only results while typing. The search field, focus and cursor remain in place. */
export function updateErrorHelpSearch(container, query) {
    const results = container.querySelector('.wp-eh-results');
    if (results) results.innerHTML = errorHelpResultsHtml(query);
}
