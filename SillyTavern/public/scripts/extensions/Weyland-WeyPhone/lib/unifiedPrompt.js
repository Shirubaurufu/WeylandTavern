// lib/unifiedPrompt.js

import { WEYLAND_ROSTER, formatRosterAsText } from './weylandRoster.js';
import { PSA_ACCOUNTS, formatPsaAccountsAsText } from './twitterPrompts.js';
import { sampleRoster } from './rosterSampling.js';
import { DISCORGI_CHANNELS, selectDiscorgiChannels } from './discorgiChannels.js';

// How many roster characters ride along in each sync prompt. All 31 used to go — and since every
// roster first name is a Weyland lorebook key, the WI scan activated all of them and blew its
// token budget (~68 entries fired per sync). 20 keeps the scan sane and rotates the "active"
// cast between syncs. The PARSER always gets the full roster regardless (it must recognize any
// name the model uses), so this only shapes generation, never breaks parsing.
export const ROSTER_SAMPLE_SIZE = 20;

// One generation request per sync — this constant is the tuning knob for how much content a
// single sync may produce. Budget math: ~30-38 items across four apps at ~35-60 tokens each
// ≈ 1,800-2,400 tokens of content plus headers; 4096 leaves headroom for reasoning-model
// preambles without inviting unbounded rambling (the prompt itself caps per-app item counts).
export const UNIFIED_REFRESH_MAX_TOKENS = 4096;

const WEYLAND_LOCATIONS = 'Weyland City, lecture halls, workshop, research, observatory, dorms, Senaka, Sakurai, Black Barrel Bar, Rustwood Cafe, Mama\'s Den, Exchange, Kodo Bowl, Kyomi, Brodlak, Tetsuya, Red Lantern, 7-Eleven, Somnia, Soft Pike, Moonvale, religion, kemeticism, seishism';

/**
 * Builds the single multi-app sync prompt. The four apps arrive in one response, split on
 * "# APP: NAME" h1 markers (see lib/unifiedParsing.js). Everything inside an app chunk keeps the
 * exact per-app formatting conventions the original per-app prompts established, so the existing
 * battle-tested parsers (parsePhoneAppOutput / parseTwitterPosts) work unchanged on each chunk.
 *
 * The [THE WORLD DOES NOT ORBIT {{user}}] block is the reason this rewrite exists: the original
 * prompts made every character react to the user's roleplay, so a private moment upstairs became
 * everyone's favorite topic across four apps at once. The directive inverts the default — the
 * world lives its own life; reacting to the roleplay is a rare, budgeted exception that must be
 * plausibly public knowledge.
 *
 * Macro tokens ({{user}}, {{random::...}}, and any {{getvar::...}} inside roster bios) are left
 * literal here and resolved at send time by applyMacroSubstitution, same as every other WeyPhone
 * prompt.
 * @param {{sampleSize?: number, randomFn?: () => number, registrarRoster?: Array}} [options] sampling knobs — see
 *   ROSTER_SAMPLE_SIZE above; randomFn injectable for deterministic tests
 * @returns {string}
 */
export function buildUnifiedPrompt({ sampleSize = ROSTER_SAMPLE_SIZE, randomFn, registrarRoster = [] } = {}) {
    const rosterSample = sampleRoster(WEYLAND_ROSTER, sampleSize, { randomFn });
    const selectedDiscorgiChannels = selectDiscorgiChannels(randomFn);
    const discorgiDirectory = DISCORGI_CHANNELS
        .map(channel => `- ${channel.name} — ${channel.description}`)
        .join('\n');
    const selectedDiscorgiNames = selectedDiscorgiChannels.map(channel => channel.name).join(', ');
    const registrarGuests = (Array.isArray(registrarRoster) ? registrarRoster : []).map(character => `
### ${character.name} (${character.handle || 'no public handle'})
${character.bio || 'Community Registrar character.'}
${String(character.profileText ?? '').slice(0, 6000)}`).join('\n');
    return `[SPECIAL GENERATION — WEYPHONE SYNC]
This is not a normal roleplay reply. {{user}} just hit "sync" on their phone, and you are
generating one refresh of content for FOUR apps at once — a newspaper, a public social feed, a
live chat server, and an anonymous local board — for the world of Weyland University. You are not
speaking as any character and not continuing the current scene. No fourth-wall breaks, no
narration, no framing — only the app content itself.

FORMATTING (parsed automatically — follow exactly):
- Each app begins with "# APP: NAME" (a markdown h1) on its own line. Generate all four apps, in
  this exact order: CHRONICLE, FEED, CHAT, BOARD.
- Inside an app, use "## SECTION NAME" (a markdown h2) for section headers, in ALL CAPS (CHAT
  uses lowercase "## #channel-name" headers instead — see its rules).
- Use "- " (a markdown bullet) to start every individual item/post/message.
- Timestamped items put the clock time in square brackets at the very start of the bullet, like
  "- [10:52 PM] ...". Never a day name or date as the bracketed marker.
- Plain markdown only — no HTML, no decorative borders. Keep each item to 1-3 sentences.

[THE WORLD DOES NOT ORBIT {{user}}]
This is the most important rule of this generation. Weyland is a living city of thousands of
people, and every one of them woke up today with their own problems, jokes, crushes, deadlines,
and errands. They are NOT an audience to {{user}}'s story.

- The overwhelming majority of items — everything except at most ONE — must have ZERO connection
  to {{user}} or to anything that happened in the recent roleplay. Not a reference, not an echo,
  not a coy allusion, not a thematic parallel. Characters post about THEIR OWN lives: their
  classes, their hobbies, their feuds, their dinner, the weather, a broken vending machine.
- AT MOST ONE item across ALL FOUR APPS COMBINED may react to a recent roleplay event, and ONLY
  if that event was plausibly public — something that happened in front of witnesses, in a shared
  space, loud enough or visible enough that a stranger could have noticed it. If it qualifies,
  render it the way a real bystander would: partial, offhand, possibly wrong about details, and
  quickly buried among unrelated posts. You may also simply include no reaction at all — that is
  always the safest and often the most realistic choice.
- A private moment can NEVER appear. If it happened behind a closed door, in a whisper, between
  two people alone, or inside anyone's head — nobody else knows, so nobody posts about it. A quiet
  kiss in a dorm room does not become campus gossip. Treat the roleplay history you can see as
  privileged information the world does not have.
- Ambient continuity over reactivity: it is far better for this refresh to quietly continue
  threads from the WORLD's own life — the volleyball team's season, an ongoing construction
  project, a running joke in a chat channel, a storefront that closed last month — than to react
  to {{user}}. If earlier phone content established something (a rivalry, an event, a complaint),
  today's content may show its next beat.
- Characters are candid and self-absorbed in the way real people are online: they post to be
  seen, to complain, to flirt, to show off, to procrastinate. Write them mid-life, not mid-plot.

[ESTABLISHED IDENTITIES AND NATURAL LANGUAGE]
- For every named or attributed post/message, use ONLY an existing identity and exact handle from
  the active Weyland roster, optional Community Registrar guests, or PSA/business accounts below.
  Never invent a student, display name, or username. Never alter a supplied handle. Anonymous
  BOARD posts remain anonymous and therefore need no invented identity.
- These are college-age adults talking naturally. Allow casual profanity wherever it fits the
  speaker and platform; do not sanitize believable uses of words such as "shit" or "fuck".
- Explicit adult language is allowed where the channel calls for it. In #nsfw-lounge especially,
  candid sexual discussion may use direct words such as "pussy", "cunt", and "fuck". Keep each
  app and channel tonally appropriate: the Chronicle remains edited news, while CHAT and BOARD may
  be much less filtered.

# APP: CHRONICLE
"The Weyland Chronicle" — the university's newspaper app. Voice: institutional, edited, a beat
reporter's remove. Nothing here is live or conversational; everything reads like it passed a copy
desk. The Chronicle covers the CITY, not {{user}}'s social circle.

## WEYLAND ALERTS
{{random::1::2::3}} practical campus alerts — weather, a maintenance notice, an event reminder.
Brief and informative, never dramatic. Every alert starts with a bracketed clock time like
"[9:14 AM]".

## HEADLINES
6-8 headlines for the city of Weyland broadly — local business openings/closings, city council
happenings, weather-related city news, minor local crime blotter items, community events,
human-interest pieces. Vary the tone — some mundane, some quirky, a couple with real local color.
Format each as a short, punchy bolded headline (3-8 words) followed by a one-sentence summary with
the actual detail — e.g. "- **City Council Approves Waterfront Rezoning** After a three-hour
session Tuesday, the council cleared the way for a mixed-use development that has divided
residents for over a year." Not campus gossip.
When mentioning specific places, prefer real Weyland locations and themes such as: ${WEYLAND_LOCATIONS}.

# APP: FEED
The public social feed — short posts broadcast under real handles. Voice: performative and
public-facing; people post here knowing everyone can see it, so it's their curated self — brags,
hot takes, event plugs, aesthetic moments described in text, mild subtweeting.

## FEED
8-10 posts. Every post starts with the poster's handle in brackets and ends with a stat block in
this exact format: "[@codewolf] post text here {likes:12 retweets:2 views:340}" — three whole
numbers, no commas or abbreviations, realistic for a small university social app (most posts
single or low-double-digit likes, views higher than likes, retweets lower than likes). A retweet
reads: "[@handle] 🔁 Retweeted from @otherhandle: the original post text {likes:N retweets:N
views:N}" — the stats belong to the retweeting post. Use roster characters and their exact real
handles from the roster below, with at most one PSA/business account and optional imported
Registrar guests when available. Never invent a poster or handle. Posts are standalone personal broadcasts about the POSTER's own day —
not conversation, not anyone else's story.

# APP: CHAT
The Weyland Tavern chat server, as {{user}} would see it scrolling notifications. Voice: live,
overlapping, casual — real back-and-forth between named people; typos and lowercase welcome.

FORMAT — this overrides the generic section rule for this app only: use EACH CHANNEL NAME as its
own h2 header, lowercase with the "#", exactly like "## #dorm-commons", and list that channel's
messages as bullets underneath it. Every message bullet is exactly
"- [10:52 PM] **@handle** — message text" (timestamp, bolded @handle, em dash, message). Never
restate the channel inside a message.

REAL CHANNEL DIRECTORY — these are the only channels that exist for this generation:
${discorgiDirectory}

For THIS Sync, populate ONLY these randomly selected channels: ${selectedDiscorgiNames}
- Produce exactly one h2 section for each selected channel, and no section for any other channel.
- Keep the literal leading "#" in every channel header. Never invent, rename, or merge channels.
- Write 6-10 messages total, distributed naturally across the selected channel or channels.
- Include at least one short reply exchange (2-3 messages answering each other). This is live
  conversation, not a list of unrelated broadcasts. Every message has a named identity; no
  anonymous-style confessions. Every named identity must come from the supplied roster, Registrar
  guests, or @luckypaww; do not invent server members or usernames.
- @luckypaww is the server owner. He may appear where natural with distinctly meta commentary
  about running or maintaining Weyland Tavern and its characters/subbots, often comically annoyed
  that something broke. In #weyland-lore-chat he must answer at least one oddly specific or inane
  lore question. Other messages should read as normal in-world chatter.

# APP: BOARD
The anonymous hyperlocal board. Voice: the unfiltered id of the campus — no names attached, so
posts are noticeably more petty, horny, scandalous, or raw than anything above. One anonymous
voice per post; optionally a vote count like "+47" at the very end.

## BOARD
8-10 anonymous posts — missed connections, rants and raves, lost & found, roommate drama, gossip
about UNNAMED third parties. A post may be written in a way that's recognizably consistent with a
roster personality for a reader who knows them well ("guess who posted this" energy) — but never
name the poster, and remember the world-does-not-orbit rule: the drama here is the campus's own,
not a retelling of {{user}}'s scenes. Not an organized back-and-forth — one anonymous voice per
post.

## WEYLAND ROSTER (grounding — tonight's active slice of a much larger cast; draw on these
established personalities where a post or message is plausibly theirs, and do not force all of
them in. For attributed content, this list is an identity allowlist, not inspiration for invented students.)
${formatRosterAsText(rosterSample)}

${registrarGuests ? `## COMMUNITY REGISTRAR GUESTS (optional local imports)
These community-made characters are available in this user's imported Registrar lorebook. They
exist in Weyland alongside the official cast, but are optional guests rather than mandatory stars.
Use at most TWO Registrar-character items across the entire four-app refresh, and it is fine to
use none. Preserve their supplied identity and public handle.
${registrarGuests}
` : ''}

## PSA/BUSINESS ACCOUNTS (FEED may use at most one)
${formatPsaAccountsAsText(PSA_ACCOUNTS)}
[END SPECIAL GENERATION FRAMING]`;
}
