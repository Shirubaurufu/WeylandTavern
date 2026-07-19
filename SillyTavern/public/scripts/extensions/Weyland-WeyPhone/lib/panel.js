// lib/panel.js

import { ASSET_BASE_URL, MAPS_BASE_URL } from './assetPaths.js';
import { postIdFor } from './savedPosts.js';
import { createStatusBarMarkup } from './ui/statusBar.js';
import { createLockScreenMarkup } from './ui/lockScreen.js';
import { createShadeMarkup } from './ui/shade.js';
import { DISCORGI_CHANNELS } from './discorgiChannels.js';

export function createPanelMarkup() {
    return `
<div id="wp-panel" data-view="home" data-locked="true">
    <div class="wp-resize-handle wp-resize-n" data-dir="n"></div>
    <div class="wp-resize-handle wp-resize-s" data-dir="s"></div>
    <div class="wp-resize-handle wp-resize-e" data-dir="e"></div>
    <div class="wp-resize-handle wp-resize-w" data-dir="w"></div>
    <div class="wp-resize-handle wp-resize-ne" data-dir="ne"></div>
    <div class="wp-resize-handle wp-resize-nw" data-dir="nw"></div>
    <div class="wp-resize-handle wp-resize-se" data-dir="se"></div>
    <div class="wp-resize-handle wp-resize-sw" data-dir="sw"></div>
    <div id="wp-phone">
        <div id="wp-wallpaper"></div>
        ${createStatusBarMarkup()}
        <div id="wp-panel-header">
            <button type="button" id="wp-back-button" class="wp-header-btn" title="Back" aria-label="Back"><i class="fa-solid fa-arrow-left"></i></button>
            <div id="wp-panel-avatar"></div>
            <div id="wp-panel-title">Messages</div>
            <button id="wp-help-button" class="wp-header-btn" title="What is this?" aria-label="What is this?"><i class="fa-solid fa-circle-question"></i></button>
            <label id="wp-registrar-toggle-label" class="wp-toggle-label" title="Also show community characters from the registrar on the map">
                <span class="wp-toggle-switch">
                    <input type="checkbox" id="wp-registrar-checkbox" class="wp-toggle-input" />
                    <span class="wp-toggle-track"><span class="wp-toggle-thumb"></span></span>
                </span>
                <span class="wp-toggle-text">Registrar</span>
            </label>
            <button type="button" id="wp-kressa-settings-button" class="wp-header-btn" title="Kressa settings" aria-label="Kressa settings"><i class="fa-solid fa-gear"></i></button>
            <button type="button" id="wp-group-compose-button" class="wp-header-btn" title="New Group Chat" aria-label="New group chat"><i class="fa-solid fa-user-group"></i></button>
            <button type="button" id="wp-compose-button" class="wp-header-btn" title="New Message" aria-label="New message"><i class="fa-solid fa-pen-to-square"></i></button>
        </div>
        <div id="wp-screen-body"></div>
        <div id="wp-app-help" hidden></div>
        <div id="wp-nav-bar">
            <button type="button" id="wp-nav-back" class="wp-nav-btn" title="Back" aria-label="Back"><i class="fa-solid fa-chevron-left"></i></button>
            <button type="button" id="wp-nav-home" class="wp-nav-btn" title="Home" aria-label="Home"><span id="wp-nav-pill"></span></button>
            <button type="button" id="wp-nav-lock" class="wp-nav-btn" title="Lock" aria-label="Lock WeyPhone"><i class="fa-solid fa-lock"></i></button>
        </div>
        ${createShadeMarkup()}
        ${createLockScreenMarkup()}
        <div id="wp-onboarding" style="display: none"></div>
    </div>
</div>`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Renders a weybooru-primary image with a data-attribute-carried fallback to the local
 * SillyTavern avatar URL — the only reliable way to detect a failed external-CDN image load from
 * plain HTML without a real pre-flight network round-trip. The actual swap-on-error logic lives
 * in index.js's delegated 'error' listener (attached with `capture: true` on the panel, since
 * `error` events don't bubble), which reads `dataset.fallbackUrl` and clears it before swapping —
 * mirroring the old inline `this.onerror=null` guard — to prevent an infinite loop if the
 * fallback URL itself also fails to load. Using a real listener instead of an inline `onerror="..."`
 * string avoids a single-quote-breakout vector: `escapeHtml` alone can't safely embed an
 * attacker-controlled URL inside a JS string literal that's itself inside an HTML attribute,
 * because browsers HTML-decode attribute values (e.g. `&#39;` back to `'`) before handing the
 * string to the JS parser.
 * @param {{primaryUrl: string|null, fallbackUrl: string|null, placeholderUrl?: string|null, initial: string|null}} [portrait]
 */
function avatarMarkup(portrait) {
    if (portrait?.group) {
        return '<div class="wp-avatar wp-avatar-fallback wp-avatar-group" aria-label="Group chat"><i class="fa-solid fa-user-group" aria-hidden="true"></i></div>';
    }
    if (portrait && portrait.primaryUrl) {
        const fallbackAttr = portrait.fallbackUrl
            ? ` data-fallback-url="${escapeHtml(portrait.fallbackUrl)}"`
            : '';
        const placeholderAttr = portrait.placeholderUrl
            ? ` data-placeholder-url="${escapeHtml(portrait.placeholderUrl)}"`
            : '';
        return `<img class="wp-avatar" src="${escapeHtml(portrait.primaryUrl)}" alt="" loading="lazy" decoding="async"${fallbackAttr}${placeholderAttr} />`;
    }
    if (portrait?.placeholderUrl) {
        return `<img class="wp-avatar" src="${escapeHtml(portrait.placeholderUrl)}" alt="" loading="lazy" decoding="async" />`;
    }
    const initial = portrait && portrait.initial ? portrait.initial : '?';
    return `<div class="wp-avatar wp-avatar-fallback">${escapeHtml(initial)}</div>`;
}

function typingDotsMarkup() {
    return '<span class="wp-typing-dots"><span class="wp-typing-dot"></span><span class="wp-typing-dot"></span><span class="wp-typing-dot"></span></span>';
}

/**
 * Sets (or clears) the panel header's avatar.
 * @param {HTMLElement} container #wp-panel-avatar
 * @param {{primaryUrl: string|null, fallbackUrl: string|null, placeholderUrl?: string|null, initial: string|null}} [portrait] pass null/undefined to clear
 */
export function renderPanelAvatar(container, portrait) {
    container.innerHTML = portrait ? avatarMarkup(portrait) : '';
}

export function firstNameForSpeaker(speaker) {
    return String(speaker ?? '').trim().split(/\s+/)[0] || 'Group';
}

/**
 * The Housing app is a static, self-contained interactive floor-map tool (maps/weyland_dorms.html,
 * ported from aerosplat-dev's own follow-up release) — not roleplay-content dependent like the
 * flavor apps, so it renders as an iframe, isolating its full-page CSS/JS/font-imports/live
 * cast.weybooru.com fetches from the phone's own styles. The map page gates its whole "Registrar"
 * (community-character) feature behind a ?registrar=true query param, so `registrarEnabled`
 * controls the iframe's src itself.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{registrarEnabled: boolean}} state
 */
export function renderHousingScreen(container, { registrarEnabled }) {
    const src = registrarEnabled ? `${MAPS_BASE_URL}/weyland_dorms.html?registrar=true` : `${MAPS_BASE_URL}/weyland_dorms.html`;
    container.innerHTML = `<iframe class="wp-housing-iframe" src="${src}" title="Housing Directory"></iframe>`;
}

const YIKYAK_VOTE_RE = /\s*\+(\d+)\s*$/;

/**
 * Best-effort decoration for a Discord item — flags @luckypaww's posts as a system/server notice,
 * and pulls out the bolded "**@handle**" username lib/phoneAppFormatting.js's shared parser already
 * captures into `item.boldPrefix` (the same mechanism the Chronicle renderer uses for headlines
 * below) so it can be rendered as its own bold span instead of plain body text. Channel identity is
 * NOT extracted from the item text: lib/unifiedPrompt.js's CHAT app rules put each channel in
 * its own "## #channel-name" section header (rendered as this section's title, see
 * renderPhoneAppScreen below), so the message body never needs to name its own channel. Gracefully
 * falls through to plain, unbolded text if boldPrefix is missing or doesn't actually prefix the
 * text — never assumes the model's output matches perfectly.
 * @param {{text: string, boldPrefix?: string}} item
 * @returns {{isServerPost: boolean, username: string|null, text: string}}
 */
function decorateDiscordItem(item) {
    const hasUsername = Boolean(item.boldPrefix) && item.text.startsWith(item.boldPrefix);
    const isServerPost = /^\[?@luckypaww\]?/.test(hasUsername ? item.boldPrefix : item.text);
    const text = hasUsername ? item.text.slice(item.boldPrefix.length).trim() : item.text;
    return { isServerPost, username: hasUsername ? item.boldPrefix : null, text };
}

/**
 * Best-effort decoration for a Yik Yak item's text — extracts a trailing "+NN" vote count (if
 * present, per the yikyak prompt's own "optionally a vote count like '+47' at the end"
 * instruction) into a separate pill, leaving the remaining text vote-count-free.
 * @param {string} text
 * @returns {{voteCount: number|null, text: string}}
 */
function decorateYikYakItem(text) {
    const match = text.match(YIKYAK_VOTE_RE);
    if (!match) return { voteCount: null, text };
    return { voteCount: Number(match[1]), text: text.slice(0, match.index).trim() };
}

/**
 * Shared refresh control — an icon button (spinning while a generation is in flight) instead of
 * a text button, used by every content-app screen.
 * @param {boolean} isGenerating
 */
function refreshButtonMarkup(isGenerating) {
    return `<button id="wp-phone-app-refresh-button" class="menu_button wp-refresh-btn"${isGenerating ? ' disabled' : ''} title="${isGenerating ? 'Syncing…' : 'Sync'}"><i class="fa-solid fa-rotate${isGenerating ? ' fa-spin' : ''}"></i></button>`;
}

/**
 * The bookmark-list button that sits next to the sync button on every content app — opens that
 * app's saved-posts screen (index.js delegation matches the id).
 */
function savedButtonMarkup() {
    return '<button id="wp-phone-app-saved-button" class="menu_button wp-refresh-btn" title="Saved posts"><i class="fa-solid fa-bookmark"></i></button>';
}

/**
 * A small ghost bookmark toggle. `saved` paints it filled; the data attributes let index.js's
 * click delegation find the underlying content again.
 * @param {{saved: boolean, attrs: string}} state attrs = pre-escaped data-attribute string
 */
function saveToggleMarkup({ saved, attrs }) {
    return `<button type="button" class="wp-save-btn${saved ? ' wp-saved' : ''}" ${attrs} title="${saved ? 'Unsave' : 'Save'}"><i class="fa-${saved ? 'solid' : 'regular'} fa-bookmark"></i></button>`;
}

/**
 * Diegetic empty state — the phone blames connectivity, never the ungenerated cache.
 * @param {string} copy from appRegistry's emptyStateCopy()
 */
function emptyStateMarkup(copy) {
    return `
<div class="wp-empty-state">
    <i class="fa-solid fa-wifi wp-empty-state-icon"></i>
    <div>${escapeHtml(copy).replace(/\n/g, '<br>')}</div>
    <div class="wp-empty-state-hint">Sync to check for updates</div>
</div>`;
}

function inlineHelpButton(appKey) {
    return `<button type="button" class="wp-inline-help" data-app-key="${appKey}" title="What is this?" aria-label="What is this?"><i class="fa-solid fa-circle-question"></i></button>`;
}

// These in-app bars give generated content a recognizable product shell. Yip Yap stays purely
// aesthetic; Chitter's existing Following destination is exposed as its header tab so there is
// only one navigation affordance for the feature.
function boardHeaderMarkup() {
    return `
<div class="wp-yipyap-header">
    <div class="wp-yipyap-brand"><img src="${ASSET_BASE_URL}/weyphone_yikyak.webp" alt="" /><span>Yip Yap</span></div>${inlineHelpButton('board')}
    <div class="wp-yipyap-campus">Weyland Campus</div>
    <div class="wp-yipyap-tabs"><span class="wp-active">Nearby</span><span class="wp-yipyap-coming-tab">Hot<small>Coming soon!</small></span><span class="wp-yipyap-coming-tab">New<small>Coming soon!</small></span></div>
</div>`;
}

function chitterHeaderMarkup(activeTab = 'feed') {
    const feedTab = activeTab === 'feed'
        ? '<span class="wp-active">For you</span>'
        : '<button type="button" id="wp-twitter-feed-link">For you</button>';
    const followingTab = activeTab === 'following'
        ? '<span class="wp-active">Following</span>'
        : '<button type="button" id="wp-twitter-following-link">Following</button>';
    return `
<div class="wp-chitter-header">
    <div class="wp-chitter-topline">
        <i class="fa-solid fa-comment-dots wp-chitter-mark"></i>
        <span class="wp-chitter-wordmark">chitter</span>
        <span class="wp-chitter-icons"><i class="fa-solid fa-magnifying-glass"></i>${inlineHelpButton('feed')}</span>
    </div>
    <div class="wp-chitter-tabs">${feedTab}${followingTab}</div>
</div>`;
}

function discorgiHeaderMarkup(activeChannelNames = []) {
    const activeChannels = new Set(activeChannelNames.map(name => String(name).trim().toLowerCase()));
    const channelDirectory = DISCORGI_CHANNELS.map(channel => {
        const activeClass = activeChannels.has(channel.name) ? ' wp-active' : '';
        return `<span class="wp-discorgi-channel-option${activeClass}" title="${escapeHtml(channel.description)}">${escapeHtml(channel.name)}</span>`;
    }).join('');
    return `
<div class="wp-discorgi-header">
    <div class="wp-discorgi-topline">
        <span class="wp-discorgi-brand"><i class="fa-solid fa-dog"></i> Weyland University Discorgi</span>
        <span class="wp-discorgi-server-name"></span>
        ${inlineHelpButton('chat')}
    </div>
    <div class="wp-discorgi-channel-list" aria-label="Discorgi channels">${channelDirectory}</div>
</div>`;
}

/**
 * One phone-app content item, styled per app. `saveButtonHtml` (optional) is appended inside
 * the item so the bookmark rides along with whatever per-app decoration applies.
 * @param {string} appKey
 * @param {{text: string, timestamp?: string, boldPrefix?: string}} item
 * @param {string} [saveButtonHtml]
 */
function phoneAppItemMarkup(appKey, item, saveButtonHtml = '') {
    if (appKey === 'chat') {
        const decorated = decorateDiscordItem(item);
        const serverClass = decorated.isServerPost ? ' wp-discord-server-post' : '';
        const usernameHtml = decorated.username
            ? `<span class="wp-discord-username">${escapeHtml(decorated.username)}</span> `
            : '';
        return `
    <div class="wp-phone-app-item wp-discord-item${serverClass}">
        ${decorated.isServerPost ? '<span class="wp-discord-server-tag">SERVER</span>' : ''}
        ${item.timestamp ? `<span class="wp-phone-app-timestamp">${escapeHtml(item.timestamp)}</span>` : ''}
        ${usernameHtml}<span class="wp-phone-app-item-text">${escapeHtml(decorated.text)}</span>${saveButtonHtml}
    </div>`;
    }
    if (appKey === 'board') {
        const decorated = decorateYikYakItem(item.text);
        return `
    <div class="wp-phone-app-item wp-yikyak-item">
        <span class="wp-phone-app-item-text">${escapeHtml(decorated.text)}</span>
        ${decorated.voteCount !== null ? `<span class="wp-yikyak-vote-pill">+${decorated.voteCount}</span>` : ''}${saveButtonHtml}
    </div>`;
    }
    if (appKey === 'chronicle' && item.boldPrefix && item.text.startsWith(item.boldPrefix)) {
        const rest = item.text.slice(item.boldPrefix.length).trim();
        return `
    <div class="wp-phone-app-item wp-chronicle-item">
        ${item.timestamp ? `<span class="wp-phone-app-timestamp">${escapeHtml(item.timestamp)}</span>` : ''}
        <span class="wp-chronicle-headline">${escapeHtml(item.boldPrefix)}</span>
        <span class="wp-phone-app-item-text">${escapeHtml(rest)}</span>${saveButtonHtml}
    </div>`;
    }
    return `
    <div class="wp-phone-app-item">
        ${item.timestamp ? `<span class="wp-phone-app-timestamp">${escapeHtml(item.timestamp)}</span>` : ''}
        <span class="wp-phone-app-item-text">${escapeHtml(item.text)}</span>${saveButtonHtml}
    </div>`;
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {{appKey: string, appLabel: string, emptyCopy: string, entry: {content: {sections: Array<{title: string, items: Array<{text: string, timestamp?: string}>}>}, generatedAt: number} | undefined, isGenerating: boolean, formatRelativeTime: (epochMs: number) => string, savedIds?: Set<string>}} state
 */
export function renderPhoneAppScreen(container, { appKey, appLabel, emptyCopy, entry, isGenerating, formatRelativeTime, savedIds = new Set() }) {
    const refreshButton = refreshButtonMarkup(isGenerating);
    const activeDiscorgiChannels = entry?.content?.sections
        ?.map(section => String(section.title).trim().toLowerCase())
        .filter(title => title.startsWith('#')) ?? [];
    const appHeader = appKey === 'board' ? boardHeaderMarkup()
        : appKey === 'chat' ? discorgiHeaderMarkup(activeDiscorgiChannels)
        : '';

    if (!entry || !entry.content || entry.content.sections.length === 0) {
        container.innerHTML = `
${appHeader}
${emptyStateMarkup(emptyCopy ?? 'No connection.')}
<div id="wp-phone-app-actions">${refreshButton}${savedButtonMarkup()}</div>`;
        return;
    }

    const sectionsHtml = entry.content.sections.map((section, sectionIndex) => {
        // A section title that's just the app's own name (e.g. Yik Yak's prompt only ever
        // produces one flat "YIK YAK" section; Discord's prompt is instructed to always split into
        // per-channel "## #channel-name" sections, but a real model doesn't always follow
        // instructions perfectly and can still fall back to one flat "## DISCORD" section) is
        // entirely redundant with the panel's own header title — suppress it rather than showing
        // the same name twice. A genuine per-channel/per-subsection title (e.g. "#announcements",
        // "WEYLAND ALERTS") is never equal to the app label, so it always stays visible.
        // Suppress a section title that's just the app's own name repeated — either its display
        // label ("YIP YAP") or the sync-prompt section name the model was told to emit ("BOARD").
        const redundantTitles = new Set([appLabel.toUpperCase(), 'BOARD', 'FEED', 'CHAT', 'DISCORD', 'YIK YAK', 'YIP YAP', 'CHITTER', 'DISCORGI']);
        const sectionTitleHtml = redundantTitles.has(section.title.toUpperCase())
            ? ''
            : `<div class="wp-phone-app-section-title">${escapeHtml(section.title)}</div>`;
        return `
<div class="wp-phone-app-section">
    ${sectionTitleHtml}
    ${section.items.map((item, itemIndex) => phoneAppItemMarkup(appKey, item, saveToggleMarkup({
        saved: savedIds.has(postIdFor(appKey, item)),
        attrs: `data-section-index="${sectionIndex}" data-item-index="${itemIndex}"`,
    }))).join('')}
</div>`;
    }).join('');

    container.innerHTML = `
${appHeader}
<div id="wp-phone-app-meta">Refreshed ${escapeHtml(formatRelativeTime(entry.generatedAt))}</div>
<div id="wp-phone-app-content">${sectionsHtml}</div>
<div id="wp-phone-app-actions">${refreshButton}${savedButtonMarkup()}</div>`;
}

/**
 * One Twitter post card — shared by the feed screen and profile screens. Retweets nest the
 * original post's text with a thin left border (same visual grammar as Discord's reply-thread
 * nesting), with a small "Retweeted" label above.
 * @param {{authorName: string, handle: string, text: string, likes: number, retweets: number, views: number, isRetweet: boolean, retweetedFrom?: string, retweetedText?: string}} post
 * @param {Record<string, {primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}>} portraitMap
 */
function twitterPostCardMarkup(post, portraitMap, postIndex, saved = undefined) {
    // The like stat is tappable (visual flair only — see lib/twitterLikes.js); index.js's click
    // delegation matches .wp-twitter-like-btn and needs the post's index within the cached list.
    const likeButton = postIndex === undefined
        ? `<span class="wp-twitter-stat">❤ ${post.likes}</span>`
        : `<button type="button" class="wp-twitter-stat wp-twitter-like-btn${post.liked ? ' wp-liked' : ''}" data-post-index="${postIndex}">${post.liked ? '❤' : '♡'} ${post.likes}</button>`;
    // Bookmark rides in the stats row; `saved === undefined` (the saved-posts screen's own
    // cards) omits it — that screen has its own remove control.
    const saveButton = (postIndex === undefined || saved === undefined)
        ? ''
        : saveToggleMarkup({ saved, attrs: `data-post-index="${postIndex}"` });
    const statsRow = `
<div class="wp-twitter-post-stats">
    ${likeButton}
    <span class="wp-twitter-stat">🔁 ${post.retweets}</span>
    <span class="wp-twitter-stat">👁 ${post.views}</span>
    ${saveButton}
</div>`;

    const bodyHtml = post.isRetweet
        ? `<div class="wp-twitter-retweet-label">🔁 Retweeted from ${escapeHtml(post.retweetedFrom)}</div>
<div class="wp-twitter-retweet-body">${escapeHtml(post.retweetedText)}</div>`
        : `<div class="wp-twitter-post-text">${escapeHtml(post.text)}</div>`;

    // The avatar and name/handle header are both clickable, navigating to that author's own
    // profile page (index.js's click delegation matches this class, same as a Following-list
    // item) — a retweet's authorName is whoever DID the retweeting (this post's real owner), not
    // the original poster named in retweetedFrom, so that's who a click here correctly goes to.
    const authorName = escapeHtml(post.authorName);
    return `
<div class="wp-twitter-post">
    <div class="wp-twitter-post-author-link" data-name="${authorName}">${avatarMarkup(portraitMap[post.authorName])}</div>
    <div class="wp-twitter-post-main">
        <div class="wp-twitter-post-header wp-twitter-post-author-link" data-name="${authorName}">
            <span class="wp-twitter-post-name">${authorName}</span>
            <span class="wp-twitter-post-handle">${escapeHtml(post.handle)}</span>
        </div>
        ${bodyHtml}
        ${statsRow}
    </div>
</div>`;
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {{entry: {content: {posts: Array}, generatedAt: number} | undefined, isGenerating: boolean, formatRelativeTime: (epochMs: number) => string, portraitMap: Record<string, {primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}>}} state
 */
export function renderTwitterFeedScreen(container, { entry, isGenerating, formatRelativeTime, portraitMap, savedIds = new Set() }) {
    const refreshButton = refreshButtonMarkup(isGenerating);
    const appHeader = chitterHeaderMarkup('feed');

    if (!entry || !entry.content || !entry.content.posts || entry.content.posts.length === 0) {
        container.innerHTML = `
${appHeader}
${emptyStateMarkup('Your feed is out of signal range.')}
<div id="wp-phone-app-actions">${refreshButton}${savedButtonMarkup()}</div>`;
        return;
    }

    const postsHtml = entry.content.posts.map((post, i) =>
        twitterPostCardMarkup(post, portraitMap, i, savedIds.has(postIdFor('feed', post)))).join('');

    container.innerHTML = `
${appHeader}
<div id="wp-phone-app-meta">Refreshed ${escapeHtml(formatRelativeTime(entry.generatedAt))}</div>
<div id="wp-twitter-feed-content">${postsHtml}</div>
<div id="wp-phone-app-actions">${refreshButton}${savedButtonMarkup()}</div>`;
}

/**
 * Static, instant, NOT model-generated — a plain list derived from the structured roster.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{roster: Array<{name: string, handle: string}>, portraitMap: Record<string, {primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}>}} state
 */
export function renderTwitterFollowingScreen(container, { roster, portraitMap }) {
    container.innerHTML = `${chitterHeaderMarkup('following')}
<div class="wp-chitter-pane wp-chitter-following-pane">${roster.map(character => `
<div class="wp-list-item wp-twitter-following-item" data-name="${escapeHtml(character.name)}">
    ${avatarMarkup(portraitMap[character.name])}
    <div class="wp-list-item-main">
        <div class="wp-list-item-title">${escapeHtml(character.name)}</div>
        <div class="wp-list-item-snippet">${escapeHtml(character.handle)}</div>
    </div>
</div>`).join('')}</div>`;
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {{character: {name: string, handle: string} | undefined, portraitMap: Record<string, {primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}>, entry: {content: {posts: Array}, generatedAt: number} | undefined, isGenerating: boolean, formatRelativeTime: (epochMs: number) => string}} state
 */
export function renderTwitterProfileScreen(container, { character, portraitMap, entry, isGenerating, formatRelativeTime, savedIds = new Set() }) {
    if (!character) {
        container.innerHTML = `${chitterHeaderMarkup('profile')}<div class="wp-empty-state">Character not found.</div>`;
        return;
    }
    const refreshButton = refreshButtonMarkup(isGenerating);
    // The bio is model-generated content (lib/twitterPrompts.js's "## BIO" section, parsed by
    // lib/twitterParsing.js), not a static field on `character` — it's only available once a
    // generation has actually completed, hence the optional chaining.
    const bioHtml = entry?.content?.bio
        ? `<div class="wp-twitter-profile-bio">${escapeHtml(entry.content.bio)}</div>`
        : '';
    const header = `
<div class="wp-twitter-profile-header">
    ${avatarMarkup(portraitMap[character.name])}
    <div class="wp-twitter-profile-name">${escapeHtml(character.name)}</div>
    <div class="wp-twitter-profile-handle">${escapeHtml(character.handle)}</div>
    ${bioHtml}
</div>`;

    if (!entry || !entry.content || !entry.content.posts || entry.content.posts.length === 0) {
        container.innerHTML = `${chitterHeaderMarkup('profile')}${header}
${emptyStateMarkup("This profile hasn't loaded — weak signal out here.")}
<div id="wp-phone-app-actions">${refreshButton}</div>`;
        return;
    }

    const postsHtml = entry.content.posts.map((post, i) =>
        twitterPostCardMarkup(post, portraitMap, i, savedIds.has(postIdFor('feed', post)))).join('');

    container.innerHTML = `${chitterHeaderMarkup('profile')}${header}
<div id="wp-phone-app-meta">Refreshed ${escapeHtml(formatRelativeTime(entry.generatedAt))}</div>
<div id="wp-twitter-feed-content">${postsHtml}</div>
<div id="wp-phone-app-actions">${refreshButton}</div>`;
}

/**
 * The per-app Saved screen — bookmarked content that survives syncs. Chitter saves render as
 * post cards; other apps reuse their own item styling. Each entry gets a remove control.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{appKey: string, saved: Array<{id: string, savedAt: number, data: object}>, portraitMap: Record<string, object>, formatRelativeTime: (epochMs: number) => string}} state
 */
export function renderSavedPostsScreen(container, { appKey, saved, portraitMap, formatRelativeTime }) {
    if (saved.length === 0) {
        container.innerHTML = `
<div class="wp-empty-state">
    <i class="fa-regular fa-bookmark wp-empty-state-icon"></i>
    <div>Nothing saved yet.</div>
    <div class="wp-empty-state-hint">Tap the bookmark on any post to keep it through syncs</div>
</div>`;
        return;
    }
    container.innerHTML = `<div id="wp-saved-list">${saved.map(entry => `
<div class="wp-saved-entry">
    <div class="wp-saved-entry-meta">
        <span>Saved ${escapeHtml(formatRelativeTime(entry.savedAt))}</span>
        <button type="button" class="wp-saved-remove" data-saved-id="${escapeHtml(entry.id)}" title="Remove from saved"><i class="fa-solid fa-bookmark"></i></button>
    </div>
    ${appKey === 'feed'
        ? twitterPostCardMarkup(entry.data, portraitMap)
        : phoneAppItemMarkup(appKey, entry.data)}
</div>`).join('')}</div>`;
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {Array<{id: string, charName: string, lastMessageSnippet: string, lastActive: number, isTyping?: boolean}>} summaries
 * @param {(epochMs: number) => string} formatRelativeTime
 * @param {Record<string, {primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}>} portraitMap keyed by charName
 */
export function renderMessagesScreen(container, summaries, formatRelativeTime, portraitMap) {
    if (!summaries.length) {
        container.innerHTML = '<div class="wp-empty-state">No conversations yet. Tap <i class="fa-solid fa-pen-to-square"></i> to start one.</div>';
        return;
    }
    container.innerHTML = summaries.map(summary => `
<div class="wp-list-item wp-conversation-item" data-id="${escapeHtml(summary.id)}">
    ${avatarMarkup(portraitMap[summary.charName])}
    <div class="wp-list-item-main">
        <div class="wp-list-item-title">${escapeHtml(summary.displayName ?? summary.charName)}</div>
        <div class="wp-list-item-snippet${summary.isTyping ? ' wp-typing-snippet' : ''}">${summary.isTyping ? `${typingDotsMarkup()} typing...` : escapeHtml(summary.lastMessageSnippet || 'No messages yet')}</div>
    </div>
    <div class="wp-list-item-meta">
        <div class="wp-list-item-time">${escapeHtml(formatRelativeTime(summary.lastActive))}</div>
        <button class="wp-list-item-delete" data-id="${escapeHtml(summary.id)}" title="Delete conversation"><i class="fa-solid fa-trash-can"></i></button>
    </div>
</div>`).join('');
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {Array<{name: string}>} characters
 * @param {Record<string, {primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}>} portraitMap keyed by character name
 */
export function renderContactsScreen(container, characters, portraitMap) {
    if (!characters.length) {
        container.innerHTML = '<div class="wp-empty-state">No characters available.</div>';
        return;
    }
    container.innerHTML = characters.map(character => `
<div class="wp-list-item wp-contact-item" data-name="${escapeHtml(character.name)}">
    ${avatarMarkup(portraitMap[character.name])}
    <div class="wp-list-item-main">
        <div class="wp-list-item-title">${escapeHtml(character.name)}</div>
    </div>
</div>`).join('');
}

export function renderGroupComposeScreen(container, { contacts, selectedNames = [], title = '' }) {
    const selected = new Set(selectedNames);
    container.innerHTML = `
<div class="wp-group-compose">
    <div class="wp-settings-hint">Choose 2–4 people. Groups always use compact lorebook subbots, even when a full character card is installed.</div>
    <div class="wp-group-contact-list">
        ${contacts.map(contact => `<label class="wp-group-contact${selected.has(contact.name) ? ' wp-selected' : ''}"><input type="checkbox" class="wp-group-contact-checkbox" data-name="${escapeHtml(contact.name)}"${selected.has(contact.name) ? ' checked' : ''}${!selected.has(contact.name) && selected.size >= 4 ? ' disabled' : ''} /><span>${escapeHtml(contact.name)}</span><small>${escapeHtml(contact.bookName)}</small></label>`).join('')}
    </div>
    ${selected.size >= 2 ? `
    <div class="wp-group-name-step">
        <label class="wp-settings-field wp-settings-field-column"><span>What should this group be called? <small>(optional)</small></span><input id="wp-group-title" type="text" maxlength="60" value="${escapeHtml(title)}" placeholder="Wolf Pack" /></label>
        <button type="button" id="wp-create-group-button" class="menu_button">Create group (${selected.size}/4)</button>
    </div>` : '<div class="wp-settings-hint wp-group-selection-count">Select at least two people to name and create the group.</div>'}
</div>`;
}

/**
 * Renders the message-list + input-row shell into the screen body. Call once when entering the
 * conversation view; use renderMessages separately to (re-)populate the message list itself.
 * @param {HTMLElement} container #wp-screen-body
 */
export function renderConversationScreen(container, { appKey = null } = {}) {
    const kressaHeader = appKey === 'kressa' ? `
<div class="wp-kressa-chat-header" aria-hidden="true">
    <span class="wp-kressa-spark">✦</span>
    <span><strong>Kressa</strong><small>Wolfgirl Assistant</small></span>
</div>` : '';
    container.innerHTML = `
${kressaHeader}
<div id="wp-roleplay-mode-picker" class="wp-roleplay-mode-picker" role="radiogroup" aria-label="Roleplay connection mode">
    <div class="wp-roleplay-mode-options">
        <button type="button" class="wp-roleplay-mode-option" data-roleplay-mode="unlinked" role="radio" aria-checked="true">Unlinked</button>
        <button type="button" class="wp-roleplay-mode-option" data-roleplay-mode="observe" role="radio" aria-checked="false">Observe</button>
        <button type="button" class="wp-roleplay-mode-option" data-roleplay-mode="linked" role="radio" aria-checked="false">Linked</button>
    </div>
    <div id="wp-roleplay-mode-hint" class="wp-roleplay-mode-hint">Isolated from the current roleplay.</div>
</div>
<div id="wp-messages"></div>
<div id="wp-input-row">
    <div id="wp-regenerate-wrapper">
        <button id="wp-regenerate-button" class="wp-header-btn" title="More options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        <div id="wp-regenerate-menu" class="wp-popup-menu" hidden>
            <button type="button" class="wp-popup-menu-item" data-action="new-thread">Start New Thread</button>
            <button type="button" class="wp-popup-menu-item" data-action="switch-threads">Switch Threads</button>
            <button type="button" class="wp-popup-menu-item" data-action="thread-details">Thread Details</button>
            <button type="button" class="wp-popup-menu-item" data-action="select">Delete Messages</button>
            <button type="button" class="wp-popup-menu-item" data-action="memory">Memories</button>
            ${appKey === 'kressa' ? '' : '<button type="button" class="wp-popup-menu-item" data-action="prior-history">Prior History</button>'}
            <button type="button" class="wp-popup-menu-item" data-action="regenerate">Regenerate</button>
            <button type="button" class="wp-popup-menu-item" data-action="scrub-roleplay" title="Stop injecting the current chatlog without deleting its bubbles" hidden>Scrub messages</button>
        </div>
    </div>
    <button id="wp-share-button" class="wp-header-btn" title="Share recent texts with the roleplay" aria-label="Share recent texts with the roleplay"><i class="fa-solid fa-share-nodes"></i></button>
    <input type="text" id="wp-input" placeholder="Message..." />
    <button id="wp-request-reply-button" class="wp-compose-action wp-request-reply" title="Request a reply" aria-label="Request a reply" disabled><i class="fa-solid fa-rotate"></i></button>
    <button id="wp-send-button" class="wp-compose-action wp-queue-message" title="Add message to the conversation" aria-label="Add message to the conversation"><i class="fa-solid fa-arrow-up"></i></button>
</div>
<div id="wp-select-actions" hidden>
    <button id="wp-select-cancel" class="wp-select-action wp-select-cancel">Cancel</button>
    <span id="wp-select-count">0 selected</span>
    <button id="wp-select-delete" class="wp-select-action wp-select-delete" disabled>Delete</button>
</div>`;
}

export function renderThreadDetailsScreen(container, conversation) {
    const participants = conversation.participants?.length ? conversation.participants : [conversation.charName];
    container.innerHTML = `
<div class="wp-settings">
    <div class="wp-settings-section">
        <div class="wp-settings-section-title">Thread Details</div>
        <label class="wp-settings-field wp-settings-field-column"><span>Thread name</span><input id="wp-thread-display-name" type="text" maxlength="60" value="${escapeHtml(conversation.displayName ?? '')}" placeholder="${escapeHtml(participants.join(', '))}" /></label>
        <label class="wp-settings-field wp-settings-field-column"><span>Your nickname in their phone <small>(optional)</small></span><input id="wp-thread-user-nickname" type="text" maxlength="60" value="${escapeHtml(conversation.userNickname ?? '')}" placeholder="juicebox" /></label>
        <div class="wp-settings-field wp-settings-field-column"><span>Participants</span><div>${participants.map(escapeHtml).join(' · ')}</div></div>
        ${conversation.roleplayTether ? '<div class="wp-settings-hint"><i class="fa-solid fa-link"></i> This thread belongs only to the roleplay where it was captured.</div>' : ''}
    </div>
</div>`;
}

/**
 * The "..." trigger button (#wp-regenerate-button) is always enabled — the menu itself must
 * always be reachable, since Memory should be addable even before a conversation's first message
 * (e.g. to frame/set up context for a dedicated app before ever sending anything). Only the
 * individual Regenerate/Delete Messages items are conditionally disabled, since those genuinely
 * have nothing to act on with zero (or zero-regeneratable) messages — Memory is never disabled.
 * @param {HTMLElement} menuEl #wp-regenerate-menu
 * @param {{canRegenerate: boolean, hasMessages: boolean, linked?: boolean, canScrub?: boolean}} state
 */
export function setRegenerateMenuItemsEnabled(menuEl, { canRegenerate, hasMessages, linked = false, canScrub = false }) {
    const regenerateItem = menuEl.querySelector('[data-action="regenerate"]');
    const selectItem = menuEl.querySelector('[data-action="select"]');
    const scrubItem = menuEl.querySelector('[data-action="scrub-roleplay"]');
    if (regenerateItem) regenerateItem.disabled = !canRegenerate;
    if (selectItem) selectItem.disabled = !hasMessages;
    if (scrubItem) {
        scrubItem.hidden = !linked;
        scrubItem.disabled = !canScrub;
    }
}

/** Updates the three-way roleplay connection control at the top of a DM. */
export function setRoleplayModePickerState(pickerEl, { mode, roleplayActive, linkedAvailable, linkedUnavailableReason = '' }) {
    if (!pickerEl) return;
    for (const button of pickerEl.querySelectorAll('.wp-roleplay-mode-option')) {
        const option = button.dataset.roleplayMode;
        const selected = option === mode;
        button.classList.toggle('wp-selected', selected);
        button.setAttribute('aria-checked', String(selected));
        button.disabled = option !== 'unlinked' && (!roleplayActive || (option === 'linked' && !linkedAvailable));
        if (option === 'linked' && linkedUnavailableReason) button.title = linkedUnavailableReason;
        else button.removeAttribute('title');
    }
    const hint = pickerEl.querySelector('#wp-roleplay-mode-hint');
    if (!hint) return;
    if (!roleplayActive) hint.textContent = 'Open a roleplay to use Observe or Linked.';
    else if (mode === 'observe') hint.textContent = `Can see the roleplay; this DM cannot write into it.${linkedUnavailableReason ? ` ${linkedUnavailableReason}` : ''}`;
    else if (mode === 'linked') hint.textContent = 'Uses the main roleplay model; WeyPhone replies are queued there.';
    else hint.textContent = `Isolated from the current roleplay.${linkedUnavailableReason ? ` ${linkedUnavailableReason}` : ''}`;
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {Array<{id: string, content: string, pinned: boolean}>} memories
 * @param {string|null} [editingMemoryId] id of the memory currently in inline-edit mode
 * @param {{isGenerating?: boolean, canGenerateNow?: boolean, canRegenerateLast?: boolean}} [state]
 */
export function renderMemoryScreen(container, memories, editingMemoryId = null, state = {}) {
    // `tethered` is intentionally read but not rendered here — the tethered toggle itself lives
    // in the header, not the Memory screen; it's accepted as a state param only because
    // index.js's single rerenderMemoryScreen call site assembles one state object for everything.
    const {
        isGenerating = false, canGenerateNow = true, canRegenerateLast = true,
        tethered = false, tetheredHistoryCap = null,
    } = state;
    const listHtml = memories.length
        ? memories.map(memory => {
            if (memory.id === editingMemoryId) {
                return `
<div class="wp-list-item wp-memory-item wp-memory-editing" data-id="${escapeHtml(memory.id)}">
    <textarea class="wp-memory-edit-textarea">${escapeHtml(memory.content)}</textarea>
    <div class="wp-message-edit-controls">
        <button class="wp-memory-edit-confirm" data-id="${escapeHtml(memory.id)}" title="Confirm"><i class="fa-solid fa-check"></i></button>
        <button class="wp-memory-edit-cancel" title="Cancel"><i class="fa-solid fa-xmark"></i></button>
    </div>
</div>`;
            }
            return `
<div class="wp-list-item wp-memory-item" data-id="${escapeHtml(memory.id)}">
    <div class="wp-list-item-main">
        <div class="wp-memory-content">${escapeHtml(memory.content)}</div>
    </div>
    <div class="wp-list-item-meta">
        <button class="wp-memory-pin-btn${memory.pinned ? ' wp-memory-pinned' : ''}" data-id="${escapeHtml(memory.id)}" title="${memory.pinned ? 'Unpin' : 'Pin'}"><i class="fa-solid fa-thumbtack"></i></button>
        <button class="wp-memory-edit-btn" data-id="${escapeHtml(memory.id)}" title="Edit"><i class="fa-solid fa-pencil"></i></button>
        <button class="wp-memory-delete-btn" data-id="${escapeHtml(memory.id)}" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
    </div>
</div>`;
        }).join('')
        : '<div class="wp-empty-state">No memories yet.</div>';

    const generateNowDisabled = isGenerating || !canGenerateNow;
    const regenerateLastDisabled = isGenerating || !canRegenerateLast;

    container.innerHTML = `
<div id="wp-memory-list">${listHtml}</div>
<div id="wp-memory-add-row">
    <textarea id="wp-memory-add-input" placeholder="Add a memory..."></textarea>
    <button id="wp-memory-add-button" class="menu_button">Add</button>
</div>
<div id="wp-memory-settings">
    <label class="wp-memory-settings-label">Connection Profile
        <select id="wp-memory-profile-select"></select>
    </label>
    <label class="wp-memory-settings-label">Generate a memory every
        <input type="number" id="wp-memory-threshold-input" min="1" />
        exchanges
    </label>
    <label class="wp-memory-settings-label">Primary model
        <input type="text" id="wp-memory-primary-model-input" placeholder="gemini-3-pro-preview" />
    </label>
    <label class="wp-memory-settings-label">Backup model (used if primary fails)
        <input type="text" id="wp-memory-backup-model-input" placeholder="glm-4.7" />
    </label>
    <div id="wp-memory-actions">
        <button id="wp-memory-generate-now-button" class="menu_button"${generateNowDisabled ? ' disabled' : ''}>${isGenerating ? 'Generating…' : 'Generate memory now'}</button>
        <button id="wp-memory-regenerate-last-button" class="menu_button"${regenerateLastDisabled ? ' disabled' : ''}>Regenerate last memory</button>
    </div>
    <div id="wp-tethered-settings">
        <div class="wp-memory-settings-subheading">Tethered mode</div>
        <label class="wp-memory-settings-label wp-checkbox-label">
            <input type="checkbox" id="wp-tethered-full-history-checkbox" ${tetheredHistoryCap === null ? 'checked' : ''} />
            All messages since the main roleplay's last memory
        </label>
        <label class="wp-memory-settings-label">Or, last
            <input type="number" id="wp-tethered-history-cap-input" min="1" value="${tetheredHistoryCap ?? ''}" ${tetheredHistoryCap === null ? 'disabled' : ''} />
            messages of the main roleplay
        </label>
    </div>
</div>`;
}

/**
 * @param {HTMLSelectElement} selectEl #wp-memory-profile-select
 * @param {Array<{id: string, name?: string}>} profiles
 * @param {string} selectedId empty string means "use main chat's active profile"
 */
export function populateConnectionProfileOptions(selectEl, profiles, selectedId) {
    const defaultOption = '<option value="">Use main chat\'s active profile</option>';
    const profileOptions = profiles.map(p =>
        `<option value="${escapeHtml(p.id)}"${p.id === selectedId ? ' selected' : ''}>${escapeHtml(p.name || p.id)}</option>`
    ).join('');
    selectEl.innerHTML = defaultOption + profileOptions;
    if (!selectedId) selectEl.value = '';
}

/**
 * @param {HTMLElement} container #wp-messages
 * @param {Array<{role: string, content: string}>} messages
 * @param {number} [editingIndex] index of the message currently in inline-edit mode; -1 (default) for none
 * @param {boolean} [isTyping] whether to append an animated typing-indicator bubble after the real messages
 * @param {{active?: boolean, selectedIndices?: Set<number>}} [selectState] bulk-delete select mode — when active,
 *   every bubble (both roles) renders a checkbox instead of any edit control, and inline-edit mode is suppressed.
 */
export function renderMessages(container, messages, editingIndex = -1, isTyping = false, selectState = {}, showSpeakers = false) {
    const { active: selectActive = false, selectedIndices = new Set() } = selectState;
    container.innerHTML = '';
    messages.forEach((message, index) => {
        const bubble = document.createElement('div');
        bubble.className = `wp-message ${message.role === 'user' ? 'wp-user' : 'wp-char'}`;
        bubble.dataset.index = String(index);
        let speakerLabel = null;

        if (selectActive) {
            bubble.classList.toggle('wp-message-selected', selectedIndices.has(index));
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'wp-message-select-checkbox';
            checkbox.checked = selectedIndices.has(index);
            // The whole bubble is the click target (delegated at the caller level) — this
            // checkbox is a visual indicator, not an independent control, so it shouldn't be a
            // second separately-focusable/toggleable element.
            checkbox.tabIndex = -1;
            const textSpan = document.createElement('span');
            textSpan.className = 'wp-message-text';
            textSpan.textContent = message.content;
            bubble.appendChild(checkbox);
            bubble.appendChild(textSpan);
        } else if (index === editingIndex) {
            bubble.classList.add('wp-message-editing');
            bubble.innerHTML = `
<textarea class="wp-message-edit-textarea">${escapeHtml(message.content)}</textarea>
<div class="wp-message-edit-controls">
    <button class="wp-message-edit-confirm" title="Confirm"><i class="fa-solid fa-check"></i></button>
    <button class="wp-message-edit-delete" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
    <button class="wp-message-edit-cancel" title="Cancel"><i class="fa-solid fa-xmark"></i></button>
</div>`;
        } else {
            if (showSpeakers && message.role !== 'user' && message.speaker) {
                speakerLabel = document.createElement('span');
                speakerLabel.className = 'wp-message-speaker';
                speakerLabel.textContent = firstNameForSpeaker(message.speaker);
            }
            const textSpan = document.createElement('span');
            textSpan.className = 'wp-message-text';
            textSpan.textContent = message.content;
            bubble.appendChild(textSpan);
            // Only the user's own messages are editable — a character's reply can only be
            // changed by regenerating it (see the Regenerate control), not hand-edited in place,
            // so no edit button is rendered for wp-char bubbles at all.
            if (message.role === 'user') {
                const editButton = document.createElement('button');
                editButton.className = 'wp-message-edit-btn';
                editButton.title = 'Edit';
                editButton.innerHTML = '<i class="fa-solid fa-pencil"></i>';
                bubble.appendChild(editButton);
            }
        }
        if (speakerLabel) {
            const groupBlock = document.createElement('div');
            groupBlock.className = 'wp-group-message-block';
            groupBlock.appendChild(speakerLabel);
            groupBlock.appendChild(bubble);
            container.appendChild(groupBlock);
            return;
        }
        container.appendChild(bubble);
    });
    if (isTyping) {
        const typingBubble = document.createElement('div');
        typingBubble.className = 'wp-message wp-char wp-typing-bubble';
        typingBubble.innerHTML = typingDotsMarkup();
        container.appendChild(typingBubble);
    }
    if (editingIndex < 0) {
        container.scrollTop = container.scrollHeight;
    }
}
