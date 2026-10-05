import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePhoneAppOutput } from '../lib/phoneAppFormatting.js';

// All three fixtures below are REAL raw output captured live from the actual running platform's
// WeyPhone panel (Home -> app grid -> Chronicle/Discord/Yik Yak -> Refresh), via
// ConnectionManagerRequestService against the 'Rosa' main-roleplay chat (character 'Rosa', chatId
// 'Rosa - 2025-11-02@22h06m12s', 75 existing messages, byte-identical before/after capture) — not
// hypothetical/idealized examples. See .superpowers/sdd/task-7-report.md for the full capture
// transcript and chat-integrity check. This is WeyPhone's own markdown output format (Task 2's
// lib/phoneAppPrompts.js), not the prior milestone's real platform !Phone command HTML output.

const REAL_CHRONICLE_OUTPUT = `## WEYLAND ALERTS
- [9:14 AM] Senaka Boulevard pedestrian lighting between Sterling Hall and Kyomi Dining Hall is under maintenance through Sunday. Use caution in the affected stretch after dark, and allow extra travel time.
- [2:30 PM] A Pacific front is tracking toward the coast. Expect rain and gusty winds beginning late Saturday evening, with conditions clearing by Sunday afternoon. Secure any outdoor items.
- [4:45 PM] The Kodo Bowl Amphitheater south gate will be closed this weekend for concrete resurfacing. All events will use the north and east entrances only.

## HEADLINES
- Weyland City Council approves rezoning along the waterfront corridor after three-hour session Tuesday, clearing the way for a mixed-use development that has divided residents and local business owners for over a year.
- Red Lantern Ramen cited for outdoor seating ordinance violation after expanding patio furniture six inches past the approved boundary; owner Mr. Wolfy declined comment, reportedly gesturing at a ladle.
- Tetsuya Market announces expanded hours through spring semester following a surge in late-night foot traffic attributed to students avoiding the dining hall's Friday fish option.
- Soft Pike Trailer Park residents file formal noise complaint with the city for the third consecutive weekend; complaint lists "excessive bass audible from inside sealed vehicles" as primary grievance.
- A juvenile draconid was recovered unharmed Wednesday after becoming lodged in the decorative ironwork above the Weyland Post Office entrance; fire crew response time was approximately eleven minutes.
- Black Barrel quietly applies for extended weekend hours permit, citing "changing student social patterns." The permit, if approved, would push last call from 2:00 AM to 3:00 AM on Fridays and Saturdays.
- Local human-interest: retired okamimi couple celebrates fifty-two years in Weyland City, crediting longevity to "walking Senaka every morning, no matter what."
- Weyland Research Center confirms a three-year coastal erosion study will expand its monitoring stations along the campus beachfront beginning next month, partnering with the university's Marine Biology department.`;

const REAL_DISCORD_OUTPUT = `## DISCORD

## #announcements
- [9:14 PM] **@luckypaww** — pushed a hotfix tonight, Rosa's expression system was returning [Neutral] on literally everything including a scene where she jumped off a diving board naked. fixed. if you saw weird sprite behavior in the last hour that was why. please do not DM me about this i already know

- [9:47 PM] **@luckypaww** — also the Regie NPC was not supposed to be persistent across scenes, he just kind of kept showing up and getting dunked and i left it in because honestly it was funier than whatever i had planned. you're welcome

## #dorm-commons
- [10:02 PM] **@MikaFDIGL** — spinning tonight at Rivera's, someone bring me a red bull i forgot mine and i will literally die without it, not joking, cardiac event incoming

- [10:38 PM] **@belle_281** — okay so hypothetically if a wolfboy's limited edition nikes were at the bottom of rivera's pool that is NOT my problem legally speaking

- [11:01 PM] **@KoshizuW** — wait is that mack streaking through the living room on somebody's story right now?? hello? weyland never disappoints

## #weyland-sports
- [10:55 PM] **@WeylandAthletics** — reminder that the pool facility requires athletic shorts or approved swimwear at ALL times per campus policy. this is not directed at anyone specifically. it is directed at everyone specifically.

- [11:08 PM] **@ReggieT_okami** — i want it on record that i was pushed into that pool TWICE by the same person and my shoes are gone. campus security was useless. this is a war crime. i have witnesses.

## #occult-and-theology
- [10:17 PM] **@ElieFox109** — anyone else notice the powerwolf track mika dropped at 10:15 was literally Blessed and Possessed, sequential to Army of the Night. that's not a coincidence that a setlist with INTENT and i respect it deeply

- [10:44 PM] **@RosaH_315** — elie you are the only person this campus who would notice that and i love you for it. powerwolf is scripture and mika knows it. she's one of us now`;

const REAL_YIKYAK_OUTPUT = `## YIK YAK

- [11:04 PM] whoever just ran naked through rivera's party carrying a bottle of whiskey and waved at people on the way back out — i am in love with you. please find me. +134

- [11:06 PM] the guy had GILLS. i saw them. between his ears when he surfaced in the pool. what the FUCK is a makohire and why did nobody tell me they look like THAT +89

- [10:48 PM] my roomate took my shower cady AGAIN. it has my name on it in sharpie. i am going to lose my goddamn mind. this is the fourth time. FOURTH. +61

- [11:09 PM] regie lost his shoes dignity and his dry clothes tonight and the night is still young. pouring one out for him but also i kind of feel like he had it coming +77

- [10:22 PM] why does the dining hall smell like burning rubber every thursday specifically. every single thursday. what are they MAKING in there +44

- [11:07 PM] someone at rivera's party just canonballed naked off the high dive screaming something about powerwolf and it was genuinely the most spiritual experience of my life +203

- [10:55 PM] missed connection: hot tub at the stark party. you had anorca tail and purple eyes and you looked at me like i was an inconvenience and i haven't recovered +91

- [11:02 PM] the amount of blacklight-reactive things i have seen tonight that i was NOT supposed to see. i need to go to church. +156

- [10:31 PM] anyone else feel like the sophomore chem building smells different than last semester or is that just me. asking for completely unrelated reasons. +38

- [11:11 PM] rivera is currently crying in the pantry because someone opened her dad's good bourbon. she is also the one who opened it. this party is incredible. +118`;

test('parsePhoneAppOutput extracts at least one section with a title from real captured Chronicle output', () => {
    const result = parsePhoneAppOutput(REAL_CHRONICLE_OUTPUT);
    assert.ok(result.sections.length > 0, 'expected at least one section to be extracted from real output');
    assert.ok(result.sections[0].title.length > 0);
});

test('parsePhoneAppOutput extracts multiple items from real captured Chronicle output', () => {
    const result = parsePhoneAppOutput(REAL_CHRONICLE_OUTPUT);
    const totalItems = result.sections.reduce((sum, s) => sum + s.items.length, 0);
    assert.ok(totalItems > 1, 'expected more than one item across all sections');
});

test('parsePhoneAppOutput never includes raw markdown syntax in extracted item text from real captured Chronicle output', () => {
    const result = parsePhoneAppOutput(REAL_CHRONICLE_OUTPUT);
    for (const section of result.sections) {
        for (const item of section.items) {
            assert.doesNotMatch(item.text, /^##/);
            assert.doesNotMatch(item.text, /^- /);
            assert.doesNotMatch(item.text, /\*\*/, 'no raw markdown bold markers should leak through');
        }
    }
});

test('parsePhoneAppOutput extracts at least one section with a title from real captured Discord output', () => {
    const result = parsePhoneAppOutput(REAL_DISCORD_OUTPUT);
    assert.ok(result.sections.length > 0, 'expected at least one section to be extracted from real output');
    assert.ok(result.sections[0].title.length > 0);
});

test('parsePhoneAppOutput extracts multiple items from real captured Discord output', () => {
    const result = parsePhoneAppOutput(REAL_DISCORD_OUTPUT);
    const totalItems = result.sections.reduce((sum, s) => sum + s.items.length, 0);
    assert.ok(totalItems > 1, 'expected more than one item across all sections');
});

test('parsePhoneAppOutput never includes raw markdown syntax in extracted item text from real captured Discord output', () => {
    const result = parsePhoneAppOutput(REAL_DISCORD_OUTPUT);
    for (const section of result.sections) {
        for (const item of section.items) {
            assert.doesNotMatch(item.text, /^##/);
            assert.doesNotMatch(item.text, /^- /);
            assert.doesNotMatch(item.text, /\*\*/, 'no raw markdown bold markers should leak through');
        }
    }
});

test('parsePhoneAppOutput extracts at least one section with a title from real captured Yik Yak output', () => {
    const result = parsePhoneAppOutput(REAL_YIKYAK_OUTPUT);
    assert.ok(result.sections.length > 0, 'expected at least one section to be extracted from real output');
    assert.ok(result.sections[0].title.length > 0);
});

test('parsePhoneAppOutput extracts multiple items from real captured Yik Yak output', () => {
    const result = parsePhoneAppOutput(REAL_YIKYAK_OUTPUT);
    const totalItems = result.sections.reduce((sum, s) => sum + s.items.length, 0);
    assert.ok(totalItems > 1, 'expected more than one item across all sections');
});

test('parsePhoneAppOutput never includes raw markdown syntax in extracted item text from real captured Yik Yak output', () => {
    const result = parsePhoneAppOutput(REAL_YIKYAK_OUTPUT);
    for (const section of result.sections) {
        for (const item of section.items) {
            assert.doesNotMatch(item.text, /^##/);
            assert.doesNotMatch(item.text, /^- /);
            assert.doesNotMatch(item.text, /\*\*/, 'no raw markdown bold markers should leak through');
        }
    }
});

test('parsePhoneAppOutput real captured Chronicle section titles match what the model actually produced', () => {
    // Sanity-check against the real observed section names so a future regex change that silently
    // stops matching the model's actual markdown header format gets caught here, not just via a
    // generic 'length > 0' assertion.
    const chronicle = parsePhoneAppOutput(REAL_CHRONICLE_OUTPUT);
    const titles = chronicle.sections.map(s => s.title);
    assert.deepEqual(titles, ['WEYLAND ALERTS', 'HEADLINES']);
});

test('parsePhoneAppOutput drops the real captured Discord output\'s leading empty "## DISCORD" header', () => {
    // Real captured Discord output emits a bare "## DISCORD" header with no bullets under it
    // before the actual per-channel "## #announcements"/"## #dorm-commons" sub-headers start —
    // confirms the empty-section-drop behavior against the actual fixture that motivated it.
    const discord = parsePhoneAppOutput(REAL_DISCORD_OUTPUT);
    const titles = discord.sections.map(s => s.title);
    assert.ok(!titles.includes('DISCORD'), 'the empty leading "DISCORD" header should be dropped, not rendered as an empty section');
    assert.ok(titles.some(t => t.startsWith('#')), 'expected real per-channel sub-headers to survive as sections');
});

// Regression test: a real generation was observed collapsing to one flat, non-empty "## DISCORD"
// section (the model ignoring the per-channel-header instruction entirely, and additionally
// writing an ad hoc "[#channel] [time] @user: text" convention within the bullet instead of the
// requested "[time] **@handle** — text" one) — the raw content still needs to parse into a
// section with real items rather than silently dropping everything, even though the section title
// itself will duplicate the panel header (that half of the fix lives in lib/panel.js's
// renderPhoneAppScreen, which suppresses a section title equal to the app label).
test('parsePhoneAppOutput still extracts items when the model ignores the per-channel-header instruction and emits one flat non-empty "## DISCORD" section', () => {
    const flatDiscordOutput = `## DISCORD
- [#announcements] [9:14 PM] @luckypaww: pushed a hotfix tonight, fixed the expression bug.
- [#dorm-commons] [10:02 PM] @MikaFDIGL: spinning tonight at Rivera's, who's coming?`;
    const result = parsePhoneAppOutput(flatDiscordOutput);
    assert.equal(result.sections.length, 1);
    assert.equal(result.sections[0].title, 'DISCORD');
    assert.equal(result.sections[0].items.length, 2);
});

test('parsePhoneAppOutput extracts real captured timestamps from Chronicle and Yik Yak output', () => {
    const chronicle = parsePhoneAppOutput(REAL_CHRONICLE_OUTPUT);
    const chronicleTimestamps = chronicle.sections.flatMap(s => s.items).map(i => i.timestamp).filter(Boolean);
    assert.ok(chronicleTimestamps.length > 0, 'expected at least one Chronicle item to have a parsed timestamp');

    const yikyak = parsePhoneAppOutput(REAL_YIKYAK_OUTPUT);
    const yikyakTimestamps = yikyak.sections.flatMap(s => s.items).map(i => i.timestamp).filter(Boolean);
    assert.ok(yikyakTimestamps.length > 0, 'expected at least one Yik Yak item to have a parsed timestamp');
});

test('parsePhoneAppOutput returns an empty sections array for empty input', () => {
    assert.deepEqual(parsePhoneAppOutput(''), { sections: [] });
});

test('parsePhoneAppOutput returns an empty sections array (never throws) for garbage input', () => {
    assert.deepEqual(parsePhoneAppOutput('not markdown at all, just plain text with no structure'), { sections: [] });
});

test('parsePhoneAppOutput returns an empty sections array (never throws) for non-string input', () => {
    assert.deepEqual(parsePhoneAppOutput(null), { sections: [] });
    assert.deepEqual(parsePhoneAppOutput(undefined), { sections: [] });
});

// Regression test for the MARKDOWN_EMPHASIS_RE false-pairing bug: single `_`/`*` were previously
// valid emphasis delimiters, so two unrelated single-underscore tokens in the same item text
// (e.g. real Discord/Yik Yak usernames like "@belle_281" alongside other underscored words) got
// cross-word false-paired, and everything between them was spliced together as if it were one
// emphasis run — corrupting real, unrelated text. Narrowing the regex to only the double/triple
// forms (`**`/`__`/`***`/`___`) eliminates this while still stripping genuine bold wrapping.
test('parsePhoneAppOutput does not corrupt text containing two unrelated single-underscore tokens', () => {
    const input = '## HEADLINES\n- shoutout to under_score and also foo_bar for the help';
    const result = parsePhoneAppOutput(input);
    const text = result.sections.flatMap(s => s.items).map(i => i.text).join(' ');
    assert.equal(text, 'shoutout to under_score and also foo_bar for the help');
});

test('parsePhoneAppOutput still strips genuine **bold**-wrapped emphasis markers', () => {
    const input = '## HEADLINES\n- **@luckypaww** posted an update';
    const result = parsePhoneAppOutput(input);
    const text = result.sections.flatMap(s => s.items).map(i => i.text).join(' ');
    assert.equal(text, '@luckypaww posted an update');
    assert.doesNotMatch(text, /\*\*/);
});

// Chronicle's own headline+summary convention: "- **Short Headline** rest of the sentence." The
// leading bold span's inner text is captured separately as boldPrefix (for the renderer to
// visually distinguish it) while item.text still has ALL emphasis markers stripped as before,
// unchanged for callers that don't care about boldPrefix (e.g. Discord/Yik Yak's own renderer).
test('parsePhoneAppOutput captures a leading bold span as boldPrefix, item.text stays fully unwrapped', () => {
    const input = '## HEADLINES\n- **City Council Approves Waterfront Rezoning** After a three-hour session, the council cleared the way for development.';
    const result = parsePhoneAppOutput(input);
    const item = result.sections[0].items[0];
    assert.equal(item.boldPrefix, 'City Council Approves Waterfront Rezoning');
    assert.equal(item.text, 'City Council Approves Waterfront Rezoning After a three-hour session, the council cleared the way for development.');
    assert.doesNotMatch(item.text, /\*\*/);
});

test('parsePhoneAppOutput omits boldPrefix entirely when an item has no leading bold span', () => {
    const input = '## WEYLAND ALERTS\n- Weather advisory: light rain expected after 2AM.';
    const result = parsePhoneAppOutput(input);
    const item = result.sections[0].items[0];
    assert.equal(item.boldPrefix, undefined);
});

// Regression tests for TIMESTAMP_RE: originally required an AM/PM suffix, so a 24-hour timestamp
// like "[22:52]" was left embedded at the front of item.text instead of populating
// item.timestamp. phoneAppPrompts.js's SHARED_FRAMING only actually instructs 12-hour "[10:52
// PM]"-style timestamps (no 24-hour format is ever requested), so this is defensive hardening
// against model drift rather than a fix for an observed real-output failure.
test('parsePhoneAppOutput extracts a 12-hour AM/PM timestamp', () => {
    const input = '## WEYLAND ALERTS\n- [9:14 AM] campus alert text';
    const result = parsePhoneAppOutput(input);
    const item = result.sections[0].items[0];
    assert.equal(item.timestamp, '9:14 AM');
    assert.equal(item.text, 'campus alert text');
});

test('parsePhoneAppOutput extracts a 24-hour timestamp instead of leaving it embedded in item.text', () => {
    const input = '## WEYLAND ALERTS\n- [22:52] campus alert text';
    const result = parsePhoneAppOutput(input);
    const item = result.sections[0].items[0];
    assert.equal(item.timestamp, '22:52');
    assert.equal(item.text, 'campus alert text');
});

test('parsePhoneAppOutput tolerates a double space between the time and AM/PM, normalizing to a single space', () => {
    const input = '## WEYLAND ALERTS\n- [10:52  PM] campus alert text';
    const result = parsePhoneAppOutput(input);
    const item = result.sections[0].items[0];
    assert.equal(item.timestamp, '10:52 PM');
    assert.equal(item.text, 'campus alert text');
});

// Coverage addition (not a behavior fix): parsePhoneAppOutput already handles CRLF correctly since
// JS's "." excludes \r from matches and multiline "$" matches immediately before the following
// \n, so the trailing \r never leaks into a captured title/item — confirmed here, mirroring the
// existing CRLF-normalization test in test/messageParsing.test.js.
test('parsePhoneAppOutput handles CRLF line endings without leaking \\r into titles or item text', () => {
    const input = '## WEYLAND ALERTS\r\n- [9:14 AM] alert one\r\n- alert two\r\n\r\n## HEADLINES\r\n- headline one\r\n';
    const result = parsePhoneAppOutput(input);
    assert.deepEqual(result.sections.map(s => s.title), ['WEYLAND ALERTS', 'HEADLINES']);
    const items = result.sections.flatMap(s => s.items);
    assert.equal(items[0].timestamp, '9:14 AM');
    for (const item of items) {
        assert.doesNotMatch(item.text, /\r/);
        if (item.timestamp) assert.doesNotMatch(item.timestamp, /\r/);
    }
});
