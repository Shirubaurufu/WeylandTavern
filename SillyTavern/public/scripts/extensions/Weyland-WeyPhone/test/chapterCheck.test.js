// Chapter check (quick-reply-ext/src/promptModifiers.js addChapterCheck, 2026-11-19): the scene sheet's BOARD box reminds the
// model to move the chapter number in its header when it finishes a chapter (Foxfire Fortunes / story chapters). Added at
// assembly time because Current's sheet is in rav.js, which upstream regenerates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ravs } from '../../quick-reply-ext/src/promptRegistry.js';
import { assemblePromptLayers, safePreparePromptBase } from '../../quick-reply-ext/src/promptAssembly.js';
import { CHAPTER_CHECK_LINE, STORYLINE_MARKER, addChapterCheck, dropChapterCheckUnlessStory } from '../../quick-reply-ext/src/promptModifiers.js';
import { buildInjection } from '../../Weyland-EllieFoxfireFortunes/storyCore.js';

const beta = ravs.get('Beta Prompt');
const boardOf = text => text.match(/BOARD \[2\/6\][\s\S]*?(?=ICEBERG \[3\/6\])/)?.[0] ?? '';

test('Current (and Beta 3 when present) carry the chapter line once, as the last item of BOARD', () => {
    for (const key of ['Beta Prompt', 'Beta Prompt 3']) {
        const base = ravs.get(key);
        if (!base) continue; // Beta 3 is not in every build
        for (const opts of [{}, { shift: 'Horror', shiftItem: '2. FEEDBACK', shiftScope: 'restarted' }, { narrator: 'Salem' }]) {
            const { teg } = assemblePromptLayers(base, beta, { analysisOn: true, ...opts });
            const board = boardOf(teg);
            assert.ok(board, `${key}: BOARD box found`);
            assert.equal(teg.split(CHAPTER_CHECK_LINE).length, 2, `${key}: the line appears exactly once`);
            assert.equal(board.trimEnd().split('\n').at(-1), CHAPTER_CHECK_LINE, `${key}: it is BOARD's last line`);
        }
    }
});

test('no scene sheet, no chapter line (Analysis off, and 2026 keeping its own analysis)', () => {
    assert.ok(!assemblePromptLayers(beta, beta, { analysisOn: false }).teg.includes(CHAPTER_CHECK_LINE));
    // Prepared the way XXX does it, which is what gives 2026 its own analysis instead of Beta's sheet.
    const old = safePreparePromptBase('Old Prompt 2026', ravs.get('Old Prompt 2026'), beta);
    assert.ok(!assemblePromptLayers(old, beta, { analysisOn: true }).teg.includes(CHAPTER_CHECK_LINE));
});

test('addChapterCheck is idempotent and leaves a sheet without BOARD alone', () => {
    const sheet = 'BOARD [2/6] - x:\n- a\n\nICEBERG [3/6] - y';
    const once = addChapterCheck(sheet);
    assert.equal(once, `BOARD [2/6] - x:\n- a\n${CHAPTER_CHECK_LINE}\n\nICEBERG [3/6] - y`);
    assert.equal(addChapterCheck(once), once);
    const warn = console.warn; console.warn = () => {};
    try { assert.equal(addChapterCheck('no boxes here'), 'no boxes here'); } finally { console.warn = warn; }
});

// Lucky: the line should only be sent while a Foxfire story is active. XXX builds the sheet once, so the request decides.
test('the chapter check is only sent while a storyline is injected', () => {
    const { teg } = assemblePromptLayers(beta, beta, { analysisOn: true });
    const withoutStory = [{ role: 'system', content: teg }, { role: 'user', content: 'hi' }];
    assert.equal(dropChapterCheckUnlessStory(withoutStory), true);
    assert.ok(!withoutStory[0].content.includes(CHAPTER_CHECK_LINE));
    assert.equal(withoutStory[0].content, teg.replace(`\n${CHAPTER_CHECK_LINE}`, ''), 'only the line goes, BOARD stays intact');

    const story = buildInjection({ title: 'T', chapters: [{ name: 'One', scene: 's', ends: 'e' }, { name: 'Two', scene: 's', ends: 'e' }] }, 1);
    assert.ok(story.startsWith(STORYLINE_MARKER), 'the marker is the real start of the injected storyline');
    const withStory = [{ role: 'system', content: teg }, { role: 'system', content: story }, { role: 'user', content: 'hi' }];
    assert.equal(dropChapterCheckUnlessStory(withStory), false);
    assert.equal(withStory[0].content, teg);
});
