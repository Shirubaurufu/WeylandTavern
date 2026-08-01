import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildTetherInjectionPlan,
    canCapturePhoneScopeIntoConversation,
    dedupeCapturedMessages,
    initialRoleplayModeForPhoneScope,
    locatePhoneScopes,
    reconcileTetherPrompts,
    routePhoneScope,
    sameParticipants,
    TETHER_MAX_MESSAGES,
    TETHER_CONTEXT_MESSAGE_OPTIONS,
    resolveTetherMessageCap,
} from '../lib/roleplayTether.js';

test('captures a phone scope while the caller retains the original roleplay text', () => {
    const raw = 'She checks her phone.\nPhone¦Weynet - Lucky¦82%\nTexting¦Wolf Pack\nOutgoing¦9:10 PM¦Lucky¦hey\nIncoming¦9:11 PM¦Summer¦omw\nShe pockets it.';
    const [scope] = locatePhoneScopes(raw);
    const routed = routePhoneScope(scope, { userName: 'Lucky', knownNames: ['Summer'] });
    assert.deepEqual(routed.participants, ['Summer']);
    assert.deepEqual(routed.messages.map(message => message.role), ['user', 'assistant']);
    assert.equal(routed.title, 'Wolf Pack');
    assert.deepEqual(routed.messages.map(message => message.displayTime), ['9:10 PM', '9:11 PM']);
    assert.match(raw, /Incoming/);
    assert.match(raw, /She pockets it/);
});

test('new Solo metadata keeps a character-owned nickname from renaming the local DM', () => {
    const raw = 'Phone¦Weynet - Rivera¦74%¦Mode=Solo¦Members=Rivera;Lucky\nTexting¦Bitch\nIncoming¦7:08 PM¦Lucky¦you awake?\nOutgoing¦7:09 PM¦Rivera¦unfortunately';
    const [scope] = locatePhoneScopes(raw);
    assert.equal(scope.mode, 'solo');
    assert.deepEqual(scope.members, ['Rivera', 'Lucky']);
    const routed = routePhoneScope(scope, { userName: 'Lucky', knownNames: ['Rivera'] });
    assert.equal(routed.mode, 'solo');
    assert.deepEqual(routed.participants, ['Rivera']);
    assert.equal(routed.title, 'Rivera');
    assert.equal(routed.userNickname, 'Bitch');
    assert.deepEqual(routed.messages.map(message => message.role), ['user', 'assistant']);
});

test('Akiyama title abbreviations resolve to the Sayori Akiyama contact', () => {
    const raw = 'Phone\u00a6Weynet - Prof. Akiyama\u00a674%\u00a6Mode=Solo\u00a6Members=Prof. Akiyama;Lucky\nTexting\u00a6Lucky\nOutgoing\u00a67:09 PM\u00a6Prof. Akiyama\u00a6office hours are still on';
    const [scope] = locatePhoneScopes(raw);
    const routed = routePhoneScope(scope, { userName: 'Lucky', knownNames: ['Sayori Akiyama', 'Professor Akiyama'] });
    assert.deepEqual(routed.participants, ['Sayori Akiyama']);
    assert.equal(routed.messages[0].speaker, 'Sayori Akiyama');
    assert.equal(routed.title, 'Sayori Akiyama');
});

test('Akiyama aliases locate an existing thread as the same participant', () => {
    assert.equal(sameParticipants(['Sayori Akiyama'], ['Professor Akiyama']), true);
});

test('new Group metadata uses declared members and its visible group title', () => {
    const raw = 'Phone¦Weynet - Lucky¦68%¦Mode=Group¦Members=Lucky;Blake;Briar\nTexting¦cuties\nOutgoing¦7:12 PM¦Lucky¦you are both adorable\nIncoming¦7:12 PM¦Blake¦the fuck\nIncoming¦7:12 PM¦Briar¦HEHEHEHE';
    const [scope] = locatePhoneScopes(raw);
    const routed = routePhoneScope(scope, { userName: 'Lucky', knownNames: ['Blake', 'Briar'] });
    assert.equal(routed.mode, 'group');
    assert.deepEqual(routed.participants, ['Blake', 'Briar']);
    assert.equal(routed.title, 'cuties');
    assert.deepEqual(routed.messages.map(message => message.speaker), [undefined, 'Blake', 'Briar']);
});

test('Alt and GroupAlt metadata are recognized but never imported into the user phone', () => {
    for (const [mode, members] of [['Alt', 'Rivera;Blake'], ['GroupAlt', 'Rivera;Blake;Briar']]) {
        const raw = `Phone¦Weynet - Rivera¦70%¦Mode=${mode}¦Members=${members}\nTexting¦friends\nOutgoing¦7:12 PM¦Rivera¦hello`;
        const [scope] = locatePhoneScopes(raw);
        assert.equal(scope.mode, mode.toLowerCase());
        assert.equal(routePhoneScope(scope, {
            userName: 'Lucky', knownNames: ['Rivera', 'Blake', 'Briar'],
        }), null);
    }
});

test('new metadata rejects a sender who is not a declared member', () => {
    const raw = 'Phone¦Weynet - Lucky¦68%¦Mode=Group¦Members=Lucky;Blake;Briar\nTexting¦cuties\nIncoming¦7:12 PM¦Mystery¦hello';
    const [scope] = locatePhoneScopes(raw);
    assert.equal(routePhoneScope(scope, { userName: 'Lucky', knownNames: ['Blake', 'Briar', 'Mystery'] }), null);
});

test('NoChar routes a user side-conversation without treating it as the active character DM', () => {
    const raw = 'Phone¦Weynet - Lucky¦68%¦Mode=NoChar¦Members=Lucky;Jenn\nTexting¦Jenn\nOutgoing¦7:12 PM¦Lucky¦where are you?\nIncoming¦7:13 PM¦Jenn¦dining hall';
    const [scope] = locatePhoneScopes(raw);
    const routed = routePhoneScope(scope, { userName: 'Lucky', knownNames: ['Rivera', 'Jenn'] });
    assert.equal(routed.mode, 'nochar');
    assert.deepEqual(routed.participants, ['Jenn']);
    assert.equal(routed.title, 'Jenn');
    assert.equal(initialRoleplayModeForPhoneScope(routed.mode), 'observe');
});

test('NoChar supports a user side-group and remains capture-only until explicitly Linked', () => {
    const raw = 'Phone¦Weynet - Lucky¦68%¦Mode=NoChar¦Members=Lucky;Jenn;Lucy\nTexting¦Lunch Crew\nIncoming¦7:13 PM¦Jenn¦dining hall\nIncoming¦7:13 PM¦Lucy¦omw';
    const [scope] = locatePhoneScopes(raw);
    const routed = routePhoneScope(scope, { userName: 'Lucky', knownNames: ['Jenn', 'Lucy'] });
    assert.deepEqual(routed.participants, ['Jenn', 'Lucy']);
    assert.equal(routed.title, 'Lunch Crew');
    const conversation = {
        roleplayWireMode: 'nochar', roleplayMode: 'observe', roleplayChatId: 'rivera-chat',
    };
    assert.equal(canCapturePhoneScopeIntoConversation(conversation, 'nochar', 'rivera-chat'), true);
    conversation.roleplayMode = 'unlinked';
    assert.equal(canCapturePhoneScopeIntoConversation(conversation, 'nochar', 'rivera-chat'), false);
    conversation.roleplayMode = 'linked';
    assert.equal(canCapturePhoneScopeIntoConversation(conversation, 'nochar', 'rivera-chat'), true);
});

test('a partial new-format header fails safely instead of falling into legacy inference', () => {
    const raw = 'Phone¦Weynet - Rivera¦74%¦Mode=Solo\nTexting¦Bitch\nIncoming¦7:08 PM¦Lucky¦you awake?';
    const [scope] = locatePhoneScopes(raw);
    assert.equal(scope.wireMetadata, true);
    assert.equal(routePhoneScope(scope, { userName: 'Lucky', knownNames: ['Rivera'] }), null);
});

test('injection preserves a roleplay phone block time instead of replacing it with wall-clock time', () => {
    const plan = buildTetherInjectionPlan({
        conversations: [{
            id: 'c1', roleplayMode: 'linked', roleplayChatId: 'chat-a', participants: ['Nara'], memories: [],
            messages: [{
                role: 'user', content: 'come do what i texted you', timestamp: 123,
                displayTime: '7:06 PM', mainChatAnchor: 1,
            }],
        }],
        chatId: 'chat-a', chatLength: 2, userName: 'Lucky',
        formatClockTime: () => '12:28 PM',
    });
    assert.match(plan.groups[0].content, /Outgoing¦7:06 PM¦Lucky¦come do what i texted you/);
    assert.doesNotMatch(plan.groups[0].content, /12:28 PM/);
});

test('late-linked legacy texts do not inherit the roleplay clock from the moment they are linked', () => {
    const plan = buildTetherInjectionPlan({
        conversations: [{
            id: 'c1', roleplayMode: 'linked', roleplayChatId: 'chat-a', participants: ['Briar'], memories: [],
            messages: [{
                role: 'user', content: 'sent before the roleplay existed', timestamp: 1_774_900_800_000,
                mainChatAnchor: 0,
            }],
        }],
        chatId: 'chat-a', chatLength: 1, userName: 'Lucky',
        // RP-clock callers deliberately provide no fallback for messages with no historical
        // displayTime. In particular, they must not substitute the roleplay's current time.
        formatClockTime: () => '',
    });
    assert.match(plan.groups[0].content, /Outgoing¦¦Lucky¦sent before the roleplay existed/);
    assert.doesNotMatch(plan.groups[0].content, /9:00 PM/);
});

test('ambiguous unknown speakers fail atomically', () => {
    const [scope] = locatePhoneScopes('Incoming│now│Mystery Person│hello');
    assert.equal(routePhoneScope(scope, { userName: 'Lucky', knownNames: ['Summer'] }), null);
});

test('character-owned phone infers an unknown incoming sender as the user nickname', () => {
    const [scope] = locatePhoneScopes('Phone¦Weynet - Summer¦90%\nIncoming¦now¦juicebox¦where are you?\nOutgoing¦now¦Summer¦on my way');
    const routed = routePhoneScope(scope, { userName: 'Lucky', knownNames: ['Summer'] });
    assert.equal(routed.userNickname, 'juicebox');
    assert.deepEqual(routed.messages.map(message => message.role), ['user', 'assistant']);
});

test('stylized character-card names match plain phone names decorated with emoji', () => {
    const raw = 'Phone¦Weynet - Lucky¦89%\nTexting¦Nara ❤️🐺\nIncoming¦7:01 PM¦Nara ❤️🐺¦hey loser\nIncoming¦7:01 PM¦Nara ❤️🐺¦also hi';
    const [scope] = locatePhoneScopes(raw);
    const routed = routePhoneScope(scope, {
        userName: 'Lucky',
        knownNames: ['Ṇ̶̰̼͘a̶͍̅́̒r̵̓̏̉̈́ā̸͒̔̄'],
    });
    assert.deepEqual(routed.participants, ['Ṇ̶̰̼͘a̶͍̅́̒r̵̓̏̉̈́ā̸͒̔̄']);
    assert.deepEqual(routed.messages.map(message => message.content), ['hey loser', 'also hi']);
    assert.equal(routed.title, 'Nara ❤️🐺');
});

test('capture recap dedup drops only the matching stored tail', () => {
    const stored = [{ role: 'assistant', speaker: 'Summer', content: 'one' }];
    const incoming = [...stored, { role: 'assistant', speaker: 'Summer', content: 'two' }];
    assert.deepEqual(dedupeCapturedMessages(incoming, stored), [incoming[1]]);
});

test('capture recap dedup recognizes Loona-style full transcript echoes with minor formatting drift', () => {
    const stored = [
        { role: 'assistant', speaker: 'Loona', content: 'you dead or what' },
        { role: 'user', content: 'hey baby bear. be home in like 15?' },
        { role: 'user', content: 'was gonna get u nuggets.as a surprise but here i am' },
    ];
    const incoming = [
        { role: 'assistant', speaker: 'Loona', content: 'you dead or what' },
        { role: 'user', content: 'hey baby bear. be home in like 15?' },
        { role: 'user', content: 'was gonna get u nuggets. as a surprise but here i am' },
        { role: 'assistant', speaker: 'Loona', content: 'you literally just told me about the surprise' },
        { role: 'assistant', speaker: 'Loona', content: '20 piece. bbq sauce only.' },
    ];
    assert.deepEqual(dedupeCapturedMessages(incoming, stored), incoming.slice(3));
});

test('capture recap dedup tolerates one paraphrased user line after a strong replay anchor', () => {
    const stored = [
        { role: 'assistant', speaker: 'Loona', content: 'you literally just told me about the surprise' },
        { role: 'assistant', speaker: 'Loona', content: '20 piece. bbq sauce only.' },
        { role: 'user', content: 'okay i love uu ❤️❤️ see u soon cutie' },
    ];
    const incoming = [
        { role: 'assistant', speaker: 'Loona', content: 'you literally just told me about the surprise' },
        { role: 'assistant', speaker: 'Loona', content: '20 piece. bbq sauce only.' },
        { role: 'user', content: '[multiple heart emojis] i love uu' },
        { role: 'assistant', speaker: 'Loona', content: 'yeah yeah' },
        { role: 'assistant', speaker: 'Loona', content: 'hurry up' },
    ];
    assert.deepEqual(dedupeCapturedMessages(incoming, stored), incoming.slice(3));
});

test('capture recap dedup does not erase a single coincidentally repeated message', () => {
    const stored = [{ role: 'assistant', speaker: 'Loona', content: 'yeah yeah' }];
    const incoming = [
        { role: 'assistant', speaker: 'Loona', content: 'yeah yeah' },
        { role: 'assistant', speaker: 'Loona', content: 'new thought' },
    ];
    // The exact tail overlap remains intentional legacy behavior; a non-tail singleton is the
    // dangerous case guarded by the two-message requirement below.
    assert.deepEqual(dedupeCapturedMessages(incoming, stored), [incoming[1]]);
    assert.deepEqual(dedupeCapturedMessages(incoming, [
        { role: 'assistant', speaker: 'Loona', content: 'yeah yeah' },
        { role: 'user', content: 'something later' },
    ]), incoming);
});

test('injection is chat-scoped and stale prompt keys are explicitly cleared', () => {
    const plan = buildTetherInjectionPlan({
        conversations: [{
            id: 'c1', tethered: true, roleplayTether: true, roleplayChatId: 'chat-a',
            participants: ['Summer'], memories: [], lastMemoryMessageIndex: 0,
            messages: [{ role: 'user', content: 'room 288', timestamp: 1, mainChatAnchor: 3 }],
        }],
        chatId: 'chat-a', chatLength: 5, userName: 'Lucky', formatClockTime: () => '9:00 PM',
    });
    assert.equal(plan.groups.length, 1);
    assert.equal(plan.groups[0].depth, 0);
    assert.match(plan.groups[0].content, /^\[CURRENT TEXTING CHATLOG\]/);
    assert.match(plan.groups[0].content, /Active conversation: Lucky and Summer/);
    assert.match(plan.groups[0].content, /plans, invitations, destinations, meetings/);
    assert.match(plan.groups[0].content, /Do not reread, rediscover, or answer messages the character already handled/);
    assert.match(plan.groups[0].content, /room 288/);
    const activePrompt = reconcileTetherPrompts(plan, new Set()).ops.find(op => op.key === 'weyphone_tether_c1');
    assert.equal(activePrompt.scan, true);
    const reconciled = reconcileTetherPrompts({ caution: null, groups: [] }, new Set(['old-key']));
    assert.deepEqual(reconciled.ops[0], { key: 'old-key', content: '', position: -1, depth: 0, role: 0 });
});

test('only Linked mode writes a phone transcript into the roleplay', () => {
    const base = {
        id: 'c1', roleplayChatId: 'chat-a', participants: ['Summer'], memories: [],
        messages: [{ role: 'user', content: 'hello', mainChatAnchor: 1 }],
    };
    const build = roleplayMode => buildTetherInjectionPlan({
        conversations: [{ ...base, roleplayMode }],
        chatId: 'chat-a', chatLength: 1, userName: 'Lucky', formatClockTime: () => '',
    });
    assert.equal(build('unlinked').groups.length, 0);
    assert.equal(build('observe').groups.length, 0);
    assert.equal(build('linked').groups.length, 1);
});

test('scrubbed messages remain in the phone log but are omitted from roleplay injection', () => {
    const plan = buildTetherInjectionPlan({
        conversations: [{
            id: 'c1', roleplayMode: 'linked', roleplayChatId: 'chat-a', participants: ['Summer'], memories: [],
            messages: [
                { role: 'user', content: 'do not send this again', suppressedFromRoleplay: true, mainChatAnchor: 1 },
                { role: 'user', content: 'new text after scrub', mainChatAnchor: 2 },
            ],
        }],
        chatId: 'chat-a', chatLength: 2, userName: 'Lucky', formatClockTime: () => '',
    });
    assert.equal(plan.groups.length, 1);
    assert.doesNotMatch(plan.groups[0].content, /do not send this again/);
    assert.match(plan.groups[0].content, /new text after scrub/);
});

test('captured roleplay texts are not injected twice, but later WeyPhone replies are', () => {
    const plan = buildTetherInjectionPlan({
        conversations: [{
            id: 'c1', tethered: true, roleplayTether: true, roleplayChatId: 'chat-a',
            participants: ['Nara'], memories: [], lastMemoryMessageIndex: 0,
            messages: [
                { role: 'assistant', speaker: 'Nara', content: 'already visible in roleplay', capturedFromRoleplay: true, mainChatAnchor: 3 },
                { role: 'user', content: 'continued inside WeyPhone', mainChatAnchor: 5 },
                { role: 'assistant', speaker: 'Nara', content: 'new phone reply', mainChatAnchor: 5 },
            ],
        }],
        chatId: 'chat-a', chatLength: 6, userName: 'Lucky', formatClockTime: () => '9:00 PM',
    });
    assert.equal(plan.groups.length, 1);
    assert.doesNotMatch(plan.groups[0].content, /already visible in roleplay/);
    assert.match(plan.groups[0].content, /continued inside WeyPhone/);
    assert.match(plan.groups[0].content, /new phone reply/);
});

test('Linked injection keeps the complete unsummarized WeyPhone transcript instead of only its last twenty texts', () => {
    const messages = Array.from({ length: 24 }, (_, index) => ({
        role: 'user', content: `phone text ${index + 1}`, mainChatAnchor: 3,
    }));
    const plan = buildTetherInjectionPlan({
        conversations: [{
            id: 'c1', roleplayMode: 'linked', roleplayChatId: 'chat-a', participants: ['Loona'], memories: [],
            lastMemoryMessageIndex: 0, messages,
        }],
        chatId: 'chat-a', chatLength: 4, userName: 'Lucky', formatClockTime: () => '',
    });
    assert.match(plan.groups[0].content, /phone text 1/);
    assert.match(plan.groups[0].content, /phone text 24/);
});

test('Linked injection hard-caps the transcript to the most recent TETHER_MAX_MESSAGES', () => {
    const messages = Array.from({ length: 45 }, (_, index) => ({
        role: 'user', content: `phone text ${index + 1}`, mainChatAnchor: 3,
    }));
    const plan = buildTetherInjectionPlan({
        conversations: [{
            id: 'c1', roleplayMode: 'linked', roleplayChatId: 'chat-a', participants: ['Loona'], memories: [],
            lastMemoryMessageIndex: 0, messages,
        }],
        chatId: 'chat-a', chatLength: 4, userName: 'Lucky', formatClockTime: () => '',
    });
    // 45 unsummarized texts, cap is 30 -> oldest 15 (texts 1..15) are dropped, newest 30 (16..45) kept.
    assert.doesNotMatch(plan.groups[0].content, /phone text 15\b/);
    assert.match(plan.groups[0].content, /phone text 16\b/);
    assert.match(plan.groups[0].content, /phone text 45\b/);
    const kept = (plan.groups[0].content.match(/phone text \d+/g) || []).length;
    assert.equal(kept, TETHER_MAX_MESSAGES);
});

test('maxMessages honors the configured slider value (e.g. 15) and 0 = keep all', () => {
    const messages = Array.from({ length: 45 }, (_, index) => ({
        role: 'user', content: `phone text ${index + 1}`, mainChatAnchor: 3,
    }));
    const build = maxMessages => buildTetherInjectionPlan({
        conversations: [{
            id: 'c1', roleplayMode: 'linked', roleplayChatId: 'chat-a', participants: ['Loona'], memories: [],
            lastMemoryMessageIndex: 0, messages,
        }],
        chatId: 'chat-a', chatLength: 4, userName: 'Lucky', formatClockTime: () => '', maxMessages,
    });
    // 15-stop keeps only the newest 15 (texts 31..45).
    const fifteen = build(15).groups[0].content;
    assert.equal((fifteen.match(/phone text \d+/g) || []).length, 15);
    assert.doesNotMatch(fifteen, /phone text 30\b/);
    assert.match(fifteen, /phone text 31\b/);
    // 0 = "All": every un-summarized message rides along.
    const all = build(0).groups[0].content;
    assert.equal((all.match(/phone text \d+/g) || []).length, 45);
    assert.match(all, /phone text 1\b/);
    assert.match(all, /phone text 45\b/);
});

test('scan-split: transcript is scanned for World Info, pinned memories are injected but NOT scanned', () => {
    const plan = buildTetherInjectionPlan({
        conversations: [{
            id: 'c1', roleplayMode: 'linked', roleplayChatId: 'chat-a', participants: ['Zora'],
            lastMemoryMessageIndex: 0,
            memories: [{ pinned: true, content: 'Long history involving Mama\'s Bar and half the campus roster.' }],
            messages: [{ role: 'user', content: 'meet at the docks?', mainChatAnchor: 3 }],
        }],
        chatId: 'chat-a', chatLength: 4, userName: 'Lucky', formatClockTime: () => '9:00 PM',
    });
    const { ops } = reconcileTetherPrompts(plan, new Set());
    const transcriptOp = ops.find(op => op.key === 'weyphone_tether_c1');
    const memoryOp = ops.find(op => op.key === 'weyphone_tether_c1_mem');

    // Transcript op: scanned, contains the message text, and does NOT contain the memory.
    assert.equal(transcriptOp.scan, true);
    assert.match(transcriptOp.content, /meet at the docks/);
    assert.doesNotMatch(transcriptOp.content, /Mama's Bar/);

    // Memory op: injected as context but scanning is OFF so it can't trigger lorebooks.
    assert.ok(memoryOp, 'expected a separate memory op');
    assert.equal(memoryOp.scan, false);
    assert.match(memoryOp.content, /Mama's Bar/);
});

test('scan-split: a stale memory op is cleared when the pinned memory goes away', () => {
    // Previously had both keys; now the conversation has no pinned memories -> the _mem key must be
    // explicitly cleared so a removed memory does not linger in the prompt.
    const plan = buildTetherInjectionPlan({
        conversations: [{
            id: 'c1', roleplayMode: 'linked', roleplayChatId: 'chat-a', participants: ['Zora'], memories: [],
            lastMemoryMessageIndex: 0, messages: [{ role: 'user', content: 'still on?', mainChatAnchor: 3 }],
        }],
        chatId: 'chat-a', chatLength: 4, userName: 'Lucky', formatClockTime: () => '',
    });
    const { ops, nextKeys } = reconcileTetherPrompts(plan, new Set(['weyphone_tether_c1', 'weyphone_tether_c1_mem']));
    assert.ok(!nextKeys.has('weyphone_tether_c1_mem'));
    const cleared = ops.find(op => op.key === 'weyphone_tether_c1_mem');
    assert.deepEqual(cleared, { key: 'weyphone_tether_c1_mem', content: '', position: -1, depth: 0, role: 0 });
});

test('resolveTetherMessageCap normalizes slider values and rejects junk', () => {
    for (const option of TETHER_CONTEXT_MESSAGE_OPTIONS) {
        assert.equal(resolveTetherMessageCap(option), option);
    }
    assert.equal(resolveTetherMessageCap(0), 0);           // "all"
    assert.equal(resolveTetherMessageCap(999), TETHER_MAX_MESSAGES);  // off-list -> default
    assert.equal(resolveTetherMessageCap('nonsense'), TETHER_MAX_MESSAGES);
    assert.equal(resolveTetherMessageCap(undefined), TETHER_MAX_MESSAGES);
});

test('Linked transcript expires after ten roleplay character responses without phone activity', () => {
    const conversation = {
        id: 'c1', roleplayMode: 'linked', roleplayChatId: 'chat-a', participants: ['Loona'], memories: [],
        messages: [{ role: 'user', content: 'old phone text', mainChatAnchor: 1 }],
    };
    const nineResponses = [
        { is_user: true },
        ...Array.from({ length: 9 }, () => ({ is_user: false })),
    ];
    const tenResponses = [...nineResponses, { is_user: false }];
    const build = chat => buildTetherInjectionPlan({
        conversations: [conversation], chatId: 'chat-a', chatLength: chat.length,
        chat, userName: 'Lucky', formatClockTime: () => '',
    });
    assert.equal(build(nineResponses).groups.length, 1);
    assert.equal(build(tenResponses).groups.length, 0);
});

test('user roleplay turns do not consume the ten character-response Linked transcript lifetime', () => {
    const chat = [
        { is_user: false },
        ...Array.from({ length: 20 }, () => ({ is_user: true })),
    ];
    const plan = buildTetherInjectionPlan({
        conversations: [{
            id: 'c1', roleplayMode: 'linked', roleplayChatId: 'chat-a', participants: ['Loona'], memories: [],
            messages: [{ role: 'user', content: 'still recent', mainChatAnchor: 1 }],
        }],
        chatId: 'chat-a', chatLength: chat.length, chat, userName: 'Lucky', formatClockTime: () => '',
    });
    assert.equal(plan.groups.length, 1);
});
