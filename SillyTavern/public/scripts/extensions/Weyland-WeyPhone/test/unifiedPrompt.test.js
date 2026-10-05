import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnifiedPrompt, UNIFIED_REFRESH_MAX_TOKENS, ROSTER_SAMPLE_SIZE } from '../lib/unifiedPrompt.js';
import { formatRosterAsText, WEYLAND_ROSTER } from '../lib/weylandRoster.js';
import { DISCORGI_CHANNELS } from '../lib/discorgiChannels.js';

// Full-roster build for the content assertions (deterministic — sampling disabled by asking for
// every member), plus a default sampled build for the sampling assertions.
const prompt = buildUnifiedPrompt({ sampleSize: WEYLAND_ROSTER.length });
const sampledPrompt = buildUnifiedPrompt();

test('unified prompt contains all four APP markers in order', () => {
    const order = ['# APP: CHRONICLE', '# APP: FEED', '# APP: CHAT', '# APP: BOARD'];
    let last = -1;
    for (const marker of order) {
        const index = prompt.indexOf(marker);
        assert.ok(index > last, `${marker} present and in order`);
        last = index;
    }
});

test('unified prompt carries the world-does-not-orbit directive core rules', () => {
    assert.match(prompt, /THE WORLD DOES NOT ORBIT \{\{user\}\}/);
    assert.match(prompt, /AT MOST ONE item across ALL FOUR APPS COMBINED/);
    assert.match(prompt, /A private moment can NEVER appear/);
    assert.match(prompt, /privileged information the world does not have/);
    assert.match(prompt, /no reaction at all/);
});

test('unified prompt keeps per-app format contracts the parsers rely on', () => {
    assert.match(prompt, /\{likes:12 retweets:2 views:340\}/); // feed stat block example
    assert.match(prompt, /## #dorm-commons/); // chat channel header convention
    assert.match(prompt, /"- \[10:52 PM\] \*\*@handle\*\* — message text"/); // chat bullet format
    assert.match(prompt, /\+47/); // board vote count convention
});

test('Discorgi prompt uses the real allowlist and selects only one or two channels per Sync', () => {
    for (const channel of DISCORGI_CHANNELS) assert.ok(prompt.includes(`- ${channel.name} — ${channel.description}`));
    const selection = prompt.match(/For THIS Sync, populate ONLY these randomly selected channels: ([^\n]+)/)?.[1];
    assert.ok(selection, 'selected channel line is present');
    const selectedNames = selection.split(', ').filter(Boolean);
    assert.ok(selectedNames.length === 1 || selectedNames.length === 2);
    assert.equal(new Set(selectedNames).size, selectedNames.length, 'selection is distinct');
    for (const name of selectedNames) assert.ok(DISCORGI_CHANNELS.some(channel => channel.name === name));
    assert.match(prompt, /Never invent, rename, or merge channels/);
});

test('channels switched off in Discorgi settings are neither rolled nor described to the model', () => {
    const nsfw = DISCORGI_CHANNELS.find(channel => channel.name === '#nsfw-lounge');
    for (let i = 0; i < 20; i += 1) {
        const filtered = buildUnifiedPrompt({ excludedDiscorgiChannels: ['#nsfw-lounge'] });
        assert.ok(!filtered.includes(nsfw.description), 'excluded channel description is not sent');
        const selection = filtered.match(/For THIS Sync, populate ONLY these randomly selected channels: ([^\n]+)/)[1];
        assert.ok(!selection.includes('#nsfw-lounge'));
    }
    const single = buildUnifiedPrompt({ excludedDiscorgiChannels: DISCORGI_CHANNELS.map(channel => channel.name).filter(name => name !== '#fur-hall') });
    assert.match(single, /For THIS Sync, populate ONLY these randomly selected channels: #fur-hall\n/);
});

test('at full sample size the whole roster appears verbatim, plus @luckypaww canon', () => {
    assert.ok(prompt.includes(formatRosterAsText(WEYLAND_ROSTER)));
    assert.match(prompt, /@luckypaww/);
});

test('social generation uses known identities and allows platform-appropriate adult language', () => {
    assert.match(prompt, /Never invent a student, display name, or username/);
    assert.match(prompt, /Never invent a poster or handle/);
    assert.doesNotMatch(prompt, /invented generic students|inventing a generic student is always allowed/);
    assert.match(prompt, /college-age adults/);
    assert.match(prompt, /#nsfw-lounge/);
    assert.match(prompt, /"pussy", "cunt", and "fuck"/);
});

test('default build samples ROSTER_SAMPLE_SIZE characters, not the whole roster', () => {
    assert.ok(ROSTER_SAMPLE_SIZE < WEYLAND_ROSTER.length, 'sample size is a real subset');
    const includedCount = WEYLAND_ROSTER
        .filter(member => sampledPrompt.includes(`${member.name} [${member.handle}]`))
        .length;
    assert.equal(includedCount, ROSTER_SAMPLE_SIZE);
});

test('sampling is deterministic with an injected randomFn and varies with different ones', () => {
    const a = buildUnifiedPrompt({ randomFn: () => 0.42 });
    const b = buildUnifiedPrompt({ randomFn: () => 0.42 });
    assert.equal(a, b);
    let x = 0;
    const c = buildUnifiedPrompt({ randomFn: () => { x = (x + 0.37) % 1; return x; } });
    assert.notEqual(a, c);
});

test('unified prompt leaves macros literal for send-time substitution', () => {
    assert.match(prompt, /\{\{user\}\}/);
    assert.match(prompt, /\{\{random::1::2::3\}\}/);
});

test('max tokens constant is the documented 8000 phone-wide budget', () => {
    assert.equal(UNIFIED_REFRESH_MAX_TOKENS, 8000);
});

test('unified prompt no longer names the real-world apps in user-facing copy', () => {
    assert.ok(!/Twitter/i.test(prompt));
    assert.ok(!/Discord\b/.test(prompt));
    assert.ok(!/Yik ?Yak/i.test(prompt));
});

test('unified prompt can ground a bounded set of optional imported Registrar guests', () => {
    const withRegistrar = buildUnifiedPrompt({
        registrarRoster: [{
            name: 'Hye-jun',
            handle: '@SandyDunes',
            bio: 'Aloof Draconid business student',
            profileText: '[Hye-jun INFO]\nQuiet, observant, and direct.',
        }],
    });
    assert.match(withRegistrar, /COMMUNITY REGISTRAR GUESTS/);
    assert.match(withRegistrar, /Hye-jun \(@SandyDunes\)/);
    assert.match(withRegistrar, /at most TWO Registrar-character items/);
    assert.doesNotMatch(buildUnifiedPrompt(), /COMMUNITY REGISTRAR GUESTS/);
});
