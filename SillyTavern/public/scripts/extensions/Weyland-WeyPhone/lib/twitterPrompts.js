// lib/twitterPrompts.js

import { WEYLAND_ROSTER, formatRosterAsText, formatNameHandle } from './weylandRoster.js';
import { SHARED_FRAMING_PREAMBLE } from './sharedPromptFraming.js';

// Twitter's own formatting rules, appended to the shared preamble.
const SHARED_FRAMING = `${SHARED_FRAMING_PREAMBLE}
- Use "- " (a markdown bullet) to start every individual post.
- Every post MUST end with a stat block in this exact format:
  "{likes:N retweets:N views:N}" — three whole numbers, no commas/abbreviations (e.g. "views:1200"
  not "views:1.2K"), realistic for a small university social app (most posts: single or low double
  digit likes, views usually higher than likes, retweets usually lower than likes).
- Every post MUST start with the poster's handle in square brackets, like "[@codewolf] post text
  here {likes:12 retweets:2 views:340}".
- A retweet should read: "[@handle] 🔁 Retweeted from @otherhandle: the original post text
  {likes:N retweets:N views:N}" — the stats belong to the retweeting post, not the original.
- Do not use any HTML tags or inline styling — plain markdown only.
- Keep each post to 1-3 sentences.
[END SPECIAL GENERATION FRAMING]`;

/**
 * PSA/business accounts that post to the Twitter main feed and also get a Following entry and
 * their own standalone profile page — no roster-style personality `bio` field though, since they
 * aren't characters; `portraitKey` selects their bundled local profile picture
 * (assets/profiles/profile_<portraitKey>.webp, see lib/portraits.js's buildPsaPortraitMap — NOT a
 * weybooru CDN lookup or a SillyTavern character-avatar fallback like roster characters get).
 * `context` is an optional one-line grounding sentence embedded directly into the prompt for an
 * account that has no standalone World Info entry of its own to auto-ground it (currently only
 * Weyland Dining Services) — every other account either has a real World Info entry that the
 * existing tethered WI scan (index.js's resolveWorldInfoTetheredForMainChat) picks up automatically
 * once the account's own name/handle appears in the prompt text, or is grounded well enough by its
 * name alone. Explicitly excludes Red Lantern, Black Barrel, and Mama's Den — not businesses that
 * would have an online presence, per the operator's own direction.
 * @type {Array<{name: string, handle: string, portraitKey: string, context?: string}>}
 */
export const PSA_ACCOUNTS = [
    { name: 'Weyland Alert', handle: '@WeylandAlert', portraitKey: 'alert' },
    { name: 'WeylandU', handle: '@WeylandU', portraitKey: 'university' },
    { name: 'Sakurai Cafe', handle: '@SakuraiCafe', portraitKey: 'sakurai' },
    { name: 'Rustwood Cafe', handle: '@RustwoodCafe', portraitKey: 'rustwood' },
    { name: 'Tetsuya Market', handle: '@TetsuyaMarket', portraitKey: 'tetsuya' },
    { name: 'Somnia', handle: '@Somnia', portraitKey: 'somnia' },
    { name: 'Exchange', handle: '@ExchangeWeyland', portraitKey: 'exchange' },
    { name: 'Kodo Bowl', handle: '@KodoBowl', portraitKey: 'kodo' },
    {
        name: 'Weyland Dining Services',
        handle: '@WeylandDining',
        portraitKey: 'dining',
        context: 'the university office that runs the Brodlak and Kyomi dining halls',
    },
    { name: 'Weyland Research Center', handle: '@WeylandResearch', portraitKey: 'research' },
    { name: 'Weyland Tavern', handle: '@WeylandTavern', portraitKey: 'tavern' },
];

// Embeds an account's optional `context` grounding sentence right into its own list entry so the
// model has it every time that account is mentioned, whether in the full feed-mode list or a
// single-account profile-mode grounding block (see buildTwitterPrompt's profile-mode groundingBlock
// below, which reuses this same formatting for consistency).
function formatPsaAccountAsText(account) {
    return account.context ? `${formatNameHandle(account)} — ${account.context}` : formatNameHandle(account);
}

export function formatPsaAccountsAsText(accounts) {
    return accounts.map(formatPsaAccountAsText).join('\n');
}

/**
 * @param {{mode: 'feed'} | {mode: 'profile', character: {name: string, handle: string, bio?: string, context?: string}}} options
 *   `character` is the profile's subject — a roster character (has `bio`, its multi-line
 *   personality-grounding text) or a PSA/business account (has `context` if one was given above,
 *   otherwise neither field — grounded by name/handle alone, relying on World Info auto-pull).
 * @returns {string}
 */
export function buildTwitterPrompt(options) {
    if (options.mode === 'profile') {
        const { character } = options;
        const groundingBlock = character.bio
            ? `${character.name} [${character.handle}]\n${character.bio}`
            : formatPsaAccountAsText(character);
        return `${SHARED_FRAMING}

Generate content for "${character.name}"'s [${character.handle}] Twitter profile — a scrollable
list of ONLY this account's own tweets and retweets. Do not generate posts from anyone else.

## BIO
Write ONE short bio line (under 100 characters) for this account's own Twitter bio — the tagline
that sits right under the profile name and handle. Some accounts take theirs seriously (a real,
straightforward description), others just put something funny or random — pick whichever fits this
account's personality. Put ONLY the bio text on this line, nothing else before or after it.

## POSTS
6-10 posts and/or retweets, all from ${character.name} [${character.handle}] only.
Twitter here is about standalone posts — personal thoughts, announcements, life updates, hot
takes — not conversation. These posts should each stand on their own, not read like one side of a
back-and-forth. Avoid writing these like a live group-chat reply thread, and avoid an
anonymous-sounding confession or explicit rant — these are public posts under
${character.name}'s own name, so keep them a personal broadcast, not a conversation or an
anonymous vent. Stay consistent with what's established below.

${groundingBlock}`;
    }

    return `${SHARED_FRAMING}

Generate content for the Weyland University Twitter main feed, as it would appear to {{user}}
scrolling their timeline.

## FEED
Exactly {{random::2::3::4}} of the posts in this feed MUST be from PSA/business accounts (see the
list below) — pick which accounts post at random each time, prioritizing whichever would be most
relevant to the current roleplay context. Fill the rest (aim for 10-14 posts total) with a variety
of individual Weyland characters (see the roster below) posting, retweeting, and occasionally
replying.
Twitter here is about standalone posts — personal thoughts, announcements, life updates, hot
takes — not back-and-forth conversation. A Twitter post stands on its own rather than being part
of a live chat exchange; replies/quote-posts are rare and should read as occasional commentary, not
an ongoing back-and-forth. Avoid writing these like a live group-chat reply thread, and avoid an
anonymous-sounding confession or explicit rant — these are public posts under the poster's own
name, so keep them a personal broadcast, not a conversation or an anonymous vent.

## WEYLAND ROSTER (for inspiration — draw from these established personalities)
${formatRosterAsText(WEYLAND_ROSTER)}

## PSA/BUSINESS ACCOUNTS (the exact count specified above comes from these, picked at random)
${formatPsaAccountsAsText(PSA_ACCOUNTS)}`;
}
