// lib/unifiedParsing.js

import { parsePhoneAppOutput } from './phoneAppFormatting.js';
import { parseTwitterPosts } from './twitterParsing.js';
import { getSyncApps, getAppBySyncSection } from './appRegistry.js';

// Split points for the unified response. Deliberately tolerant of the drift patterns models
// actually produce: "# APP: FEED", "## APP: FEED", "# APP - FEED", "#APP: FEED", extra spaces,
// mixed case. The captured name is uppercased before registry lookup.
const APP_MARKER_RE = /^#{1,3}\s*APP\s*[:\-–—]\s*([A-Za-z]+)\s*$/gim;

// Grounding sections from the prompt that a sloppy model sometimes echoes back into its output.
// Never real app content — always dropped from whichever chunk they land in.
const ECHOED_PROMPT_SECTION_RE = /^(WEYLAND ROSTER|PSA\/BUSINESS ACCOUNTS)\b/i;

function stripEchoedPromptSections(parsed) {
    return { ...parsed, sections: parsed.sections.filter(s => !ECHOED_PROMPT_SECTION_RE.test(s.title)) };
}

/**
 * Parses one app's chunk into its cache-ready content, via the same per-app parsers the original
 * per-app generations used.
 * @param {string} appKey
 * @param {string} chunk
 * @param {{roster: Array, psaAccounts: Array}} context
 * @returns {{content: object, usable: boolean}}
 */
function parseAppChunk(appKey, chunk, context) {
    if (appKey === 'feed') {
        const parsed = parseTwitterPosts(chunk, { roster: context.roster, psaAccounts: context.psaAccounts });
        return { content: parsed, usable: parsed.posts.length > 0 };
    }
    const parsed = stripEchoedPromptSections(parsePhoneAppOutput(chunk));
    return { content: parsed, usable: parsed.sections.length > 0 };
}

// Known section-title shapes per app, used only by the no-markers rescue pass to classify
// orphaned sections when the model ignored the "# APP:" convention entirely.
function classifySectionTitle(title) {
    if (/^(WEYLAND ALERTS|HEADLINES)\b/i.test(title)) return 'chronicle';
    if (/^FEED\b/i.test(title)) return 'feed';
    if (/^#/.test(title)) return 'chat'; // "## #channel-name" headers parse with the leading '#'
    if (/^(BOARD|YIK ?YAK|YIP ?YAP)\b/i.test(title)) return 'board';
    return null;
}

/**
 * Rescue pass for a response with no "# APP:" markers at all: parse the whole text as one section
 * stream and route each recognizable section to its app. FEED can't be rescued this way (its posts
 * need parseTwitterPosts's own line format, which the section parser mangles), so it's only
 * attempted when a "## FEED" section header is present to slice around.
 * @param {string} rawText
 * @param {{roster: Array, psaAccounts: Array}} context
 */
function rescueWithoutMarkers(rawText, context) {
    const apps = {};
    const whole = stripEchoedPromptSections(parsePhoneAppOutput(rawText));
    const grouped = new Map();
    for (const section of whole.sections) {
        const appKey = classifySectionTitle(section.title);
        if (!appKey || appKey === 'feed') continue;
        if (!grouped.has(appKey)) grouped.set(appKey, []);
        grouped.get(appKey).push(section);
    }
    for (const [appKey, sections] of grouped) {
        apps[appKey] = { sections };
    }
    // FEED rescue: slice from its section header to the next ALL-CAPS section header (or EOF) and
    // hand that region to the real feed parser.
    const feedMatch = /^##\s*FEED\s*$/im.exec(rawText);
    if (feedMatch) {
        const rest = rawText.slice(feedMatch.index + feedMatch[0].length);
        const nextHeader = /^##\s+(?!#)[A-Z][A-Z /]+$/m.exec(rest);
        const feedChunk = nextHeader ? rest.slice(0, nextHeader.index) : rest;
        const parsed = parseTwitterPosts(feedChunk, { roster: context.roster, psaAccounts: context.psaAccounts });
        if (parsed.posts.length > 0) apps.feed = parsed;
    }
    return apps;
}

/**
 * Splits one unified sync response into per-app content.
 *
 * @param {string} rawText the model's whole response
 * @param {{roster: Array, psaAccounts: Array}} context passed through to parseTwitterPosts
 * @returns {{apps: Record<string, object>, failures: string[]}}
 *   `apps` maps appKey → cache-ready content for every app that parsed usably;
 *   `failures` lists sync apps that did NOT produce usable content this time (their existing
 *   caches should be left untouched by the caller).
 */
export function parseUnifiedRefresh(rawText, context) {
    const text = String(rawText ?? '');
    const syncAppKeys = getSyncApps().map(a => a.key);
    const apps = {};

    const markers = [...text.matchAll(APP_MARKER_RE)];
    if (markers.length === 0) {
        Object.assign(apps, rescueWithoutMarkers(text, context));
    } else {
        for (let i = 0; i < markers.length; i++) {
            const app = getAppBySyncSection(markers[i][1].toUpperCase());
            if (!app) continue; // unknown app name — chunk discarded
            const start = markers[i].index + markers[i][0].length;
            const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
            const chunk = text.slice(start, end);
            const { content, usable } = parseAppChunk(app.key, chunk, context);
            // If the model emitted the same app marker twice, keep the first usable chunk.
            if (usable && !(app.key in apps)) apps[app.key] = content;
        }
    }

    const failures = syncAppKeys.filter(key => !(key in apps));
    return { apps, failures };
}
