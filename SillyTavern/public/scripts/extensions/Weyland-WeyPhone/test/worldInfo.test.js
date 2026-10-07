import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPhoneWorldInfoScanHistory, findLorebookCharacterEntry, resolveLorebookContactProfile, resolveWorldInfoTethered, resolveWorldInfoUntethered, scanEntries } from '../lib/worldInfo.js';

test('phone World Info scan history includes the newest queued user message without mutating the log', () => {
    const messages = [
        { role: 'user', content: 'first bubble' },
        { role: 'user', content: 'we are at Sakurai Cafe' },
    ];
    const scanHistory = buildPhoneWorldInfoScanHistory(messages);
    assert.notEqual(scanHistory, messages);
    assert.deepEqual(scanHistory, messages);
    assert.equal(scanHistory.at(-1).content, 'we are at Sakurai Cafe');
});

test('newest queued Kressa message can activate a Weyland lore entry', async () => {
    const messages = [
        { role: 'user', content: 'do you know where we are?' },
        { role: 'user', content: 'we are at the Sakurai Cafe' },
    ];
    const fakeLoadWorldInfo = async name => name === 'Weyland'
        ? { entries: { 123: { key: ['Sakurai'], content: 'Sakurai Cafe lore', disable: false, constant: false } } }
        : null;
    const result = await resolveWorldInfoUntethered({
        loadWorldInfo: fakeLoadWorldInfo,
        history: buildPhoneWorldInfoScanHistory(messages),
        personaLorebookName: '',
    });
    assert.equal(result.worldInfoBefore, 'Sakurai Cafe lore');
});

test('lorebook contact resolver matches a full directory name to a unique first-name subbot key', async () => {
    const book = {
        entries: {
            85: { key: ['Vindica', '!vindica'], comment: 'Vindica', content: '{{getvar::VI}}', disable: false },
            86: { key: ['someone else'], comment: 'Other', content: 'other profile', disable: false },
        },
    };
    assert.equal(findLorebookCharacterEntry(book, 'Vindica Blackwood'), book.entries[85]);
    const profile = await resolveLorebookContactProfile({ loadWorldInfo: async () => book, charName: 'Vindica Blackwood' });
    assert.deepEqual(profile, { charName: 'Vindica Blackwood', personalityText: '{{getvar::VI}}' });
});

test('lorebook contact resolver prefers Zora subbot trigger over Zora location lore', async () => {
    const location = {
        key: ['/Mama.?s/', 'dive bar', 'Zora'],
        comment: "Mama's Den",
        content: '[MAMAS DEN] location lore',
        disable: false,
    };
    const subbot = {
        key: ['!Zora', '!zora', 'Zora'],
        comment: 'Zora',
        content: '{{getvar::ZORA}}',
        disable: false,
    };
    const book = { entries: { 247: location, 248: subbot } };
    assert.equal(findLorebookCharacterEntry(book, 'Zora Adeyemi'), subbot);
    assert.deepEqual(
        await resolveLorebookContactProfile({ loadWorldInfo: async () => book, charName: 'Zora Adeyemi' }),
        { charName: 'Zora Adeyemi', personalityText: '{{getvar::ZORA}}' },
    );
});

test('lorebook contact resolver prefers a full-name alias and rejects disabled or ambiguous first-name entries', () => {
    const full = { key: ['Aris Thorne'], comment: 'Aris', content: 'correct' };
    const book = { entries: {
        1: full,
        2: { key: ['Aris'], comment: 'Aris Vale', content: 'other' },
        3: { key: ['Nora'], comment: 'Nora', content: 'disabled', disable: true },
    } };
    assert.equal(findLorebookCharacterEntry(book, 'Aris Thorne'), full);
    assert.equal(findLorebookCharacterEntry(book, 'Aris Unknown'), null);
    assert.equal(findLorebookCharacterEntry(book, 'Nora Reed'), null);
});

test('lorebook contact resolver supports a unique surname-keyed subbot such as Aris Thorne', async () => {
    const thorne = { key: ['!Thorne', 'Thorne', '!thorne'], comment: 'Thorne', content: '{{getvar::TRN}}' };
    const loadWorldInfo = async name => {
        assert.equal(name, 'Weyland');
        return { entries: { 46: thorne } };
    };

    assert.equal(findLorebookCharacterEntry(await loadWorldInfo('Weyland'), 'Aris Thorne'), thorne);
    assert.deepEqual(
        await resolveLorebookContactProfile({ loadWorldInfo, charName: 'Aris Thorne' }),
        { charName: 'Aris Thorne', personalityText: '{{getvar::TRN}}' },
    );
});

test('lorebook contact resolver can target an imported Registrar book', async () => {
    const calls = [];
    const loadWorldInfo = async name => {
        calls.push(name);
        return { entries: { 1: { comment: 'Hye-jun', key: ['!Hye-jun'], content: '[Hye-jun INFO]\nCommunity profile' } } };
    };
    const profile = await resolveLorebookContactProfile({
        loadWorldInfo,
        charName: 'Hye-jun',
        lorebookName: 'Weyland Registrar',
    });
    assert.deepEqual(calls, ['Weyland Registrar']);
    assert.equal(profile.personalityText, '[Hye-jun INFO]\nCommunity profile');
});

test('scanEntries matches an entry whose key appears in the history text', () => {
    const entries = [
        { key: ['dormitory'], content: 'Dormitory lore', disable: false, constant: false },
        { key: ['unrelated-keyword'], content: 'Should not match', disable: false, constant: false },
    ];
    const history = [{ role: 'user', content: 'Meet me at the dormitory tonight' }];
    assert.equal(scanEntries(entries, history), 'Dormitory lore');
});

test('scanEntries includes constant entries regardless of keyword match', () => {
    const entries = [{ key: ['nomatch'], content: 'Always included', disable: false, constant: true }];
    const history = [{ role: 'user', content: 'irrelevant text' }];
    assert.equal(scanEntries(entries, history), 'Always included');
});

test('an old Kiera mention cannot outlive the subbot entry’s two-message scan depth', () => {
    const entry = { key: ['Kiera', '!Kiera'], content: '[KIERA INFO] profile', scanDepth: 2, constant: false };
    const history = [
        { role: 'user', content: 'What do you know about Kiera?' },
        ...Array.from({ length: 30 }, () => ({ role: 'user', content: 'Look at this Rivera scene.' })),
    ];
    const before = structuredClone(history);
    assert.equal(scanEntries([entry], history), '');
    assert.deepEqual(history, before);
    history.push({ role: 'user', content: 'Now tell me about Kiera.' });
    assert.equal(scanEntries([entry], history), entry.content);
    assert.equal(scanEntries([{ ...entry, scanDepth: 0 }], history), '');
    assert.equal(scanEntries([{ ...entry, constant: true, scanDepth: 0 }], history), entry.content);
});

test('scanEntries does not apply another character tag-filtered constant to phone requests', () => {
    const entries = [
        { content: 'Global campus lore', constant: true, characterFilter: { names: [], tags: [] } },
        { content: 'Catgirl physiology', constant: true, characterFilter: { isExclude: false, names: [], tags: ['cat-tag'] } },
        { content: 'Zora-only lore', constant: true, characterFilter: { isExclude: false, names: ['Zora Adeyemi'], tags: [] } },
    ];
    assert.equal(
        scanEntries(entries, [{ role: 'user', content: 'hello' }], { characterNames: ['Zora Adeyemi'] }),
        'Global campus lore\nZora-only lore',
    );
});

test('untethered lore scanning forwards the active phone contact identity', async () => {
    const result = await resolveWorldInfoUntethered({
        loadWorldInfo: async () => ({ entries: {
            1: { content: 'Zora-only lore', constant: true, characterFilter: { isExclude: false, names: ['Zora Adeyemi'], tags: [] } },
            2: { content: 'Serra-only lore', constant: true, characterFilter: { isExclude: false, names: ['Serra'], tags: [] } },
        } }),
        history: [{ role: 'user', content: 'hello' }],
        characterNames: ['Zora Adeyemi'],
    });
    assert.equal(result.worldInfoBefore, 'Zora-only lore');
});

test('phone character context activates only its matching positive species trait', () => {
    const entries = [
        { comment: 'Haienamimi Trait', content: 'Hyena physiology', constant: true, characterFilter: { isExclude: false, names: [], tags: ['hyena-tag'] } },
        { comment: 'Okamimimi Trait', content: 'Wolf physiology', constant: true, characterFilter: { isExclude: false, names: [], tags: ['wolf-tag'] } },
    ];
    assert.equal(
        scanEntries(entries, [{ role: 'user', content: 'hello' }], {
            characterNames: ['Zora Adeyemi'],
            characterContext: 'Zora is a Haienamimi (spotted hyena demihuman).',
        }),
        'Hyena physiology',
    );
});

test('an imported character with an unknown species safely receives no unrelated trait entry', () => {
    const entries = [
        { comment: 'Haienamimi Trait', content: 'Hyena physiology', constant: true, characterFilter: { isExclude: false, names: [], tags: ['hyena-tag'] } },
        { comment: 'Okamimimi Trait', content: 'Wolf physiology', constant: true, characterFilter: { isExclude: false, names: [], tags: ['wolf-tag'] } },
    ];
    const options = {
        characterNames: ['Molly Mole'],
        characterContext: 'Molly is a mole demi with velvet fur and digging claws.',
    };
    assert.doesNotThrow(() => scanEntries(entries, [{ role: 'user', content: 'hello' }], options));
    assert.equal(scanEntries(entries, [{ role: 'user', content: 'hello' }], options), '');
});

test('scanEntries skips disabled entries even if their key matches', () => {
    const entries = [{ key: ['dormitory'], content: 'Should be skipped', disable: true, constant: false }];
    const history = [{ role: 'user', content: 'the dormitory' }];
    assert.equal(scanEntries(entries, history), '');
});

test('scanEntries is case-insensitive', () => {
    const entries = [{ key: ['Dormitory'], content: 'Matched', disable: false, constant: false }];
    const history = [{ role: 'user', content: 'the DORMITORY is here' }];
    assert.equal(scanEntries(entries, history), 'Matched');
});

test('scanEntries does not match a non-constant entry whose key is undefined (guarded by `entry.key ?? []`)', () => {
    const entries = [{ content: 'No key at all', disable: false, constant: false }];
    const history = [{ role: 'user', content: 'some text mentioning anything' }];
    assert.equal(scanEntries(entries, history), '');
});

test('scanEntries skips non-string key elements without throwing (guarded by `typeof key === "string"`)', () => {
    const entries = [{ key: [123, null, undefined, { nested: true }], content: 'Should not match', disable: false, constant: false }];
    const history = [{ role: 'user', content: 'text containing 123 and other things' }];
    // No throw, and none of the non-string keys spuriously match.
    assert.equal(scanEntries(entries, history), '');
});

test('scanEntries treats an empty-string key as a non-match, not a match-everything (guarded by `key.length > 0`)', () => {
    // text.includes('') is always true; the length guard is exactly what prevents an empty key
    // from matching every possible history.
    const entries = [{ key: [''], content: 'Should not match on empty key', disable: false, constant: false }];
    const history = [{ role: 'user', content: 'any non-empty history text' }];
    assert.equal(scanEntries(entries, history), '');
});

test('resolveWorldInfoTethered converts history into a newest-first plain string[] before calling getWorldInfoPrompt', async () => {
    const fakeGetWorldInfoPrompt = async (chat, maxContext, isDryRun, globalScanData) => {
        assert.deepEqual(chat, ['third', 'second', 'first']);
        assert.equal(maxContext, 4096);
        assert.equal(isDryRun, false);
        assert.deepEqual(globalScanData, { suppressWeyPhoneOverflowAlert: true });
        return { worldInfoBefore: 'BEFORE', worldInfoAfter: 'AFTER' };
    };
    const result = await resolveWorldInfoTethered({
        getWorldInfoPrompt: fakeGetWorldInfoPrompt,
        history: [
            { role: 'user', content: 'first' },
            { role: 'assistant', content: 'second' },
            { role: 'user', content: 'third' },
        ],
        maxContext: 4096,
    });
    assert.deepEqual(result, { worldInfoBefore: 'BEFORE', worldInfoAfter: 'AFTER' });
});

// Regression test for the real, live-verified bug: getWorldInfoPrompt is called with isDryRun
// hardcoded to false (deliberately, so the tethered view doesn't miss already-active sticky/
// cooldown entries — see the comment on resolveWorldInfoTethered). SillyTavern's real engine
// writes sticky/cooldown bookkeeping directly onto the shared chatMetadata.timedWorldInfo object
// as a side effect of that non-dry-run scan, regardless of what synthetic history was scanned.
// Simulates that real side effect via a fake getWorldInfoPrompt that mutates chatMetadata, and
// asserts resolveWorldInfoTethered restores it afterward so a phone-app tethered scan never
// leaves a trace on the real main chat's WI timed-effect state.
test('resolveWorldInfoTethered restores chatMetadata.timedWorldInfo after a scan that mutates it', async () => {
    const chatMetadata = { timedWorldInfo: { cooldown: { someKey: 5 }, sticky: {} } };
    const fakeGetWorldInfoPrompt = async (chat, maxContext, isDryRun) => {
        assert.equal(isDryRun, false);
        // Simulate the real engine's checkTimedEffects/setTimedEffectOfType side effect: it
        // mutates the live chatMetadata.timedWorldInfo object in place.
        chatMetadata.timedWorldInfo.cooldown.someKey = 0;
        chatMetadata.timedWorldInfo.cooldown.newlyActivatedKey = 3;
        return { worldInfoBefore: 'BEFORE', worldInfoAfter: 'AFTER' };
    };

    await resolveWorldInfoTethered({
        getWorldInfoPrompt: fakeGetWorldInfoPrompt,
        history: [{ role: 'user', content: 'hello' }],
        maxContext: 4096,
        chatMetadata,
    });

    assert.deepEqual(chatMetadata.timedWorldInfo, { cooldown: { someKey: 5 }, sticky: {} });
});

test('resolveWorldInfoTethered restores chatMetadata.timedWorldInfo even if getWorldInfoPrompt throws', async () => {
    const chatMetadata = { timedWorldInfo: { cooldown: { someKey: 5 } } };
    const fakeGetWorldInfoPrompt = async () => {
        chatMetadata.timedWorldInfo.cooldown.someKey = 0;
        throw new Error('scan failed');
    };

    await assert.rejects(() => resolveWorldInfoTethered({
        getWorldInfoPrompt: fakeGetWorldInfoPrompt,
        history: [],
        maxContext: 4096,
        chatMetadata,
    }));

    assert.deepEqual(chatMetadata.timedWorldInfo, { cooldown: { someKey: 5 } });
});

test('resolveWorldInfoTethered deletes chatMetadata.timedWorldInfo if a scan creates it where none existed before', async () => {
    const chatMetadata = {};
    const fakeGetWorldInfoPrompt = async () => {
        chatMetadata.timedWorldInfo = { cooldown: { freshlyCreated: 1 } };
        return { worldInfoBefore: '', worldInfoAfter: '' };
    };

    await resolveWorldInfoTethered({
        getWorldInfoPrompt: fakeGetWorldInfoPrompt,
        history: [],
        maxContext: 4096,
        chatMetadata,
    });

    assert.equal(Object.prototype.hasOwnProperty.call(chatMetadata, 'timedWorldInfo'), false);
});

test('resolveWorldInfoTethered works unchanged when no chatMetadata is supplied', async () => {
    const fakeGetWorldInfoPrompt = async () => ({ worldInfoBefore: 'BEFORE', worldInfoAfter: 'AFTER' });
    const result = await resolveWorldInfoTethered({
        getWorldInfoPrompt: fakeGetWorldInfoPrompt,
        history: [],
        maxContext: 4096,
    });
    assert.deepEqual(result, { worldInfoBefore: 'BEFORE', worldInfoAfter: 'AFTER' });
});

test('resolveWorldInfoUntethered scans the Weyland book and merges a persona book if provided', async () => {
    const books = {
        Weyland: { entries: { 0: { key: ['always'], content: 'Weyland lore', disable: false, constant: true } } },
        'Persona Book': { entries: { 0: { key: ['always'], content: 'Persona lore', disable: false, constant: true } } },
    };
    const fakeLoadWorldInfo = async (name) => books[name] ?? null;
    const result = await resolveWorldInfoUntethered({
        loadWorldInfo: fakeLoadWorldInfo,
        history: [],
        personaLorebookName: 'Persona Book',
    });
    assert.equal(result.worldInfoBefore, 'Weyland lore\nPersona lore');
    assert.equal(result.worldInfoAfter, '');
});

test('resolveWorldInfoUntethered works with no persona lorebook set', async () => {
    const books = {
        Weyland: { entries: { 0: { key: ['always'], content: 'Weyland lore', disable: false, constant: true } } },
    };
    const fakeLoadWorldInfo = async (name) => books[name] ?? null;
    const result = await resolveWorldInfoUntethered({
        loadWorldInfo: fakeLoadWorldInfo,
        history: [],
        personaLorebookName: '',
    });
    assert.equal(result.worldInfoBefore, 'Weyland lore');
});

// Documents CURRENT behavior (not an endorsement of it — see report). resolveWorldInfoUntethered
// has no try/catch around loadWorldInfo, so a throw propagates to the caller and aborts the reply.
// This is asymmetric with resolveMainActiveLtmEntries (tetheredContext.js), which catches and
// degrades to []. Flagged for a human decision; behavior deliberately left unchanged here.
test('resolveWorldInfoUntethered propagates the error when loadWorldInfo throws (currently unguarded)', async () => {
    const fakeLoadWorldInfo = async () => { throw new Error('book load failed'); };
    await assert.rejects(
        () => resolveWorldInfoUntethered({ loadWorldInfo: fakeLoadWorldInfo, history: [], personaLorebookName: '' }),
        /book load failed/,
    );
});

test('resolveWorldInfoUntethered treats a null book as empty (skips it, yielding no WI text)', async () => {
    const fakeLoadWorldInfo = async () => null;
    const result = await resolveWorldInfoUntethered({ loadWorldInfo: fakeLoadWorldInfo, history: [], personaLorebookName: '' });
    assert.deepEqual(result, { worldInfoBefore: '', worldInfoAfter: '' });
});

test('resolveWorldInfoUntethered skips a null persona book but still returns the Weyland scan', async () => {
    const books = {
        Weyland: { entries: { 0: { key: ['always'], content: 'Weyland lore', disable: false, constant: true } } },
    };
    const fakeLoadWorldInfo = async (name) => books[name] ?? null;
    const result = await resolveWorldInfoUntethered({
        loadWorldInfo: fakeLoadWorldInfo,
        history: [],
        personaLorebookName: 'Missing Persona Book',
    });
    assert.equal(result.worldInfoBefore, 'Weyland lore');
});

test('resolveWorldInfoUntethered scans a conversation-specific Registrar book without duplicating Weyland', async () => {
    const calls = [];
    const result = await resolveWorldInfoUntethered({
        loadWorldInfo: async name => {
            calls.push(name);
            return { entries: { 1: { constant: true, content: `${name} lore` } } };
        },
        history: [],
        additionalBookNames: ['Weyland Registrar', 'Weyland'],
    });
    assert.deepEqual(calls, ['Weyland', 'Weyland Registrar']);
    assert.match(result.worldInfoBefore, /Weyland Registrar lore/);
});

test('phone default lore scan includes the fifteenth bubble and excludes the sixteenth', () => {
    const entry = {key: ['Kiera'], content: 'Kiera lore'};
    const history = [{role: 'user', content: 'Kiera'},
        ...Array.from({length: 14}, () => ({role: 'assistant', content: 'Rivera scene'}))];
    assert.equal(scanEntries([entry], history), entry.content);
    history.push({role: 'user', content: 'Rivera'});
    for (const scanDepth of [undefined, null, -1]) {
        assert.equal(scanEntries([{...entry, scanDepth}], history), '');
    }
    assert.equal(scanEntries([{...entry, scanDepth: 16}], history), entry.content);
    assert.equal(scanEntries([{...entry, constant: true}], history), entry.content);
});
