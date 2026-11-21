// Settings -> "What Ellie reads" (Lucky, 2026-11-21): the planner sees the chat's newest memory and the last 10
// messages (5 when that switch is off). Run: node --test test/whatEllieReads.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recentChatText, latestMemory, isMemoryEntry, buildFortuneMessages, RECENT_MESSAGES_MORE, RECENT_MESSAGES_FEWER } from '../fortuneCore.js';

const chat = Array.from({ length: 14 }, (_, i) => ({ name: i % 2 ? 'Ellie' : 'Lucky', mes: `message ${i}` }));

test('recent messages: 10 by default, 5 with the switch off, system messages skipped', () => {
    assert.equal(RECENT_MESSAGES_MORE, 10);
    assert.equal(RECENT_MESSAGES_FEWER, 5);
    const ten = recentChatText([...chat, { name: 'x', mes: 'hidden', is_system: true }], 10).split('\n');
    assert.equal(ten.length, 10);
    assert.equal(ten[0], 'Lucky: message 4');
    assert.equal(ten.at(-1), 'Ellie: message 13');
    assert.equal(recentChatText(chat, 5).split('\n').length, 5);
    assert.equal(recentChatText([], 10), '');
});

test('latest memory = the LTM entry with the highest order, skipping switched-off and non-memory entries', () => {
    const entries = {
        0: { automationId: 'ltm:a', order: 1, comment: 'Day one', content: 'They met.' },
        1: { automationId: 'ltm:b', order: 3, comment: 'Day three', content: 'They argued.' },
        2: { automationId: 'ltm:c', order: 4, comment: 'Off', content: 'Switched off.', disable: true },
        3: { automationId: '', order: 9, comment: 'Some lore', content: 'Not a memory.' },
        4: { automationId: '7', order: 2, comment: 'MEMORY ENTRY 2', content: 'Legacy one.' },
    };
    assert.deepEqual(latestMemory(entries), { title: 'Day three', content: 'They argued.' });
    assert.equal(latestMemory({}), null);
    assert.equal(latestMemory(undefined), null);
    assert.ok(isMemoryEntry(entries[4]));
    assert.ok(!isMemoryEntry({ automationId: '12', comment: 'Kodo Bowl', content: 'A venue.' }));
});

test('the memory goes into the request before the recent messages, and only when there is one', () => {
    const user = o => buildFortuneMessages({ charName: 'Ellie', cards: [], ...o }).find(m => m.role === 'user').content;
    const withMem = user({ memoryText: 'Day three\nThey argued.', recentChat: 'Lucky: hi' });
    const at = withMem.indexOf('[WHAT HAPPENED EARLIER IN THIS ROLEPLAY]');
    assert.ok(at > 0 && at < withMem.indexOf('[WHERE THE ROLEPLAY IS RIGHT NOW]'));
    assert.ok(withMem.includes('They argued.'));
    assert.ok(!user({ recentChat: 'Lucky: hi' }).includes('WHAT HAPPENED EARLIER'));
});

test('Foxfire matches LTM\'s own memory test (Weyland-LTM/index.js entryLooksLikeLTM)', { skip: !fs.existsSync(new URL('../../Weyland-LTM/index.js', import.meta.url)) && 'LTM not here' }, () => {
    const ltm = fs.readFileSync(new URL('../../Weyland-LTM/index.js', import.meta.url), 'utf8');
    assert.match(ltm, /const LTM_MARKER_PREFIX = 'ltm:'/);
    assert.ok(ltm.includes("return /MEMORY ENTRY|LTM/i.test(entry.comment || '') || /MEMORY:/i.test(entry.content || '');"));
    assert.ok(ltm.includes('entry.order = maxOrder + 1;'), 'newest memory = highest order');
});
