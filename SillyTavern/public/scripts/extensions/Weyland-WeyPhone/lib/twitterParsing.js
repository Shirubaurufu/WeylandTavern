// lib/twitterParsing.js

import { stripMarkdownEmphasis } from './phoneAppFormatting.js';

// Matches "[@handle] rest of the post" — the leading portion of the format Twitter's own prompts
// (lib/twitterPrompts.js) instruct the model to produce. Every post line also starts with a
// markdown "- " bullet per that same prompt, so an optional leading "- " is tolerated here. The
// trailing "{likes:N retweets:N views:N}" stat block is intentionally NOT part of this regex —
// see STATS_RE below, matched separately against the remainder so a malformed/truncated/missing
// stat block degrades to zeroed stats instead of silently dropping the whole post. Never throws;
// unparseable lines (no "[@handle]" prefix at all) are simply skipped (degrade gracefully,
// matching this codebase's convention elsewhere).
// NOTE (style): this could be converted to named capture groups (`(?<handle>...)`) for
// readability, but it's already being restructured for this pass (splitting the stat block out) —
// leaving that as a follow-up rather than compounding two regex changes at once.
const POST_LINE_RE = /^-?\s*\[(@[\w.]+)\]\s+(.*)$/;

// Matches a trailing stat block, tolerant of: comma-formatted numbers (e.g. "views:1,200" — a
// plausible model deviation from twitterPrompts.js's "no commas/abbreviations" instruction), and a
// block truncated by a stream cutoff (missing the closing "}" and/or missing trailing fields).
// Every capture group is individually optional except the literal "{likes:" itself, which anchors
// the match — this lets a partially-truncated block ("{likes:12 retweets:3", no closing brace or
// views) still resolve the fields that did survive rather than failing to match at all.
const STATS_RE = /\s*\{likes:([\d,]*)(?:\s+retweets:([\d,]*)(?:\s+views:([\d,]*))?)?\}?\s*$/;
const RETWEET_RE = /^🔁\s*Retweeted from\s+(@[\w.]+):\s*(.*)$/;

// Matches profile mode's own "## BIO" section (lib/twitterPrompts.js) and captures its single line
// of bio text. Feed-mode output never has this section, so `bio` is simply absent for the feed.
const BIO_SECTION_RE = /^##\s*BIO\s*\n+([^\n]+)/im;

/**
 * Parses a stat-block number field, tolerating comma formatting and an empty/missing value
 * (defaults to 0 rather than NaN) — see STATS_RE above.
 * @param {string | undefined} raw
 * @returns {number}
 */
function parseStatNumber(raw) {
    if (!raw) return 0;
    const n = Number(raw.replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
}

/**
 * Resolves a display name for a handle: a real roster character's real name, a PSA/business
 * account's real name, or (if the model invented a handle not in either list) the handle text
 * itself with the leading "@" stripped — a graceful fallback, not an error.
 * @param {string} handle
 * @param {Array<{name: string, handle: string}>} roster
 * @param {Array<{name: string, handle: string}>} psaAccounts
 * @returns {{name: string, handle: string}}
 */
function resolveAuthorIdentity(handle, roster = [], psaAccounts = []) {
    const normalizedHandle = String(handle || '').trim().replace(/^@?/, '@').toLocaleLowerCase();
    const match = [...roster, ...psaAccounts].find(candidate => (
        String(candidate?.handle || '').trim().replace(/^@?/, '@').toLocaleLowerCase() === normalizedHandle
    ));
    if (match) {
        return {
            name: match.name,
            handle: String(match.handle || handle).replace(/^@?/, '@'),
        };
    }
    return {
        name: String(handle || '').replace(/^@/, ''),
        handle,
    };
}

/**
 * Parses WeyPhone's own Twitter markdown output (see lib/twitterPrompts.js for the format this is
 * built against) into a structured `{ posts }` shape for the Twitter feed/profile UI to render.
 * Degrades gracefully rather than throwing on unparseable/empty input — unrecognized lines are
 * simply skipped, matching this codebase's convention elsewhere (see lib/phoneAppFormatting.js).
 * @param {string} rawText
 * @param {{roster: Array<{name: string, handle: string}>, psaAccounts: Array<{name: string, handle: string}>}} options
 * @returns {{posts: Array<{authorName: string, handle: string, text: string, likes: number, retweets: number, views: number, isRetweet: boolean, retweetedFrom?: string, retweetedText?: string}>, bio: string|null}}
 */
export function parseTwitterPosts(rawText, { roster, psaAccounts }) {
    if (!rawText || typeof rawText !== 'string') return { posts: [], bio: null };

    try {
        const bioMatch = rawText.match(BIO_SECTION_RE);
        const bio = bioMatch ? stripMarkdownEmphasis(bioMatch[1].trim()) : null;
        const posts = [];
        for (const line of rawText.split('\n')) {
            const match = line.match(POST_LINE_RE);
            if (!match) continue;
            const [, handle, rest] = match;

            const statsMatch = rest.match(STATS_RE);
            const bodyText = (statsMatch ? rest.slice(0, statsMatch.index) : rest).trim();
            if (!bodyText) continue;
            const likes = parseStatNumber(statsMatch?.[1]);
            const retweets = parseStatNumber(statsMatch?.[2]);
            const views = parseStatNumber(statsMatch?.[3]);

            const retweetMatch = bodyText.match(RETWEET_RE);
            const author = resolveAuthorIdentity(handle, roster, psaAccounts);
            const post = {
                authorName: author.name,
                handle: author.handle,
                likes,
                retweets,
                views,
                isRetweet: !!retweetMatch,
            };
            if (retweetMatch) {
                post.retweetedFrom = retweetMatch[1];
                post.retweetedText = stripMarkdownEmphasis(retweetMatch[2]);
                post.text = '';
            } else {
                post.text = stripMarkdownEmphasis(bodyText);
            }
            posts.push(post);
        }
        return { posts, bio };
    } catch {
        return { posts: [], bio: null };
    }
}
