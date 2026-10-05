import test from 'node:test';
import assert from 'node:assert/strict';

import {
    splitMessage,
    joinMessage,
    extractSpans,
    spliceSpans,
    formatSpansForPrompt,
    parseSpanReplacements,
    cleanFullRewrite,
    buildUnderstudyMessages,
    buildNarratorDirective,
    detectMessageModes,
    buildStageDirections,
    stripModelReasoning,
    collapseAsteriskRuns,
    buildSceneReference,
    parseSceneHeader,
    thoughtsModeOf,
    effectiveUnderstudyScope,
    availableUnderstudyScopes,
    understudyScopeHint,
} from '../lib/understudy.js';

// Real message shapes lifted from the shipped chat history — bar-delimited header (current),
// bare tilde header (older), and the bracketed code footer.
const BAR_HEADER = '¦¦ Saturday, Oct 2nd ~ 8:47 PM ~ Black Barrel Bar ~ ¦¦';
const TILDE_HEADER = 'Wednesday, Aug 26th ~ 6:52 AM ~ Shared Bathroom ~';
const FOOTER = '[Embarrassment] [RC]';

test('splitMessage separates a bar-delimited header and bracket footer', () => {
    const mes = `${BAR_HEADER}\n\n*She leans back.* "Hey."\n\n${FOOTER}`;
    const { header, body, footer } = splitMessage(mes);
    assert.equal(header, BAR_HEADER);
    assert.equal(footer, FOOTER);
    assert.equal(body.trim(), '*She leans back.* "Hey."');
});

test('splitMessage handles the older bare tilde header', () => {
    const { header, body } = splitMessage(`${TILDE_HEADER}\n\nShe said nothing.\n\n${FOOTER}`);
    assert.equal(header, TILDE_HEADER);
    assert.equal(body.trim(), 'She said nothing.');
});

test('splitMessage tolerates a message with neither header nor footer', () => {
    const { header, body, footer } = splitMessage('[OOC: just a note back to you]');
    assert.equal(header, '');
    assert.equal(footer, '');
    assert.equal(body, '[OOC: just a note back to you]');
});

// The footer matcher must not eat a bracketed THOUGHT that happens to end the body.
test('splitMessage does not mistake a trailing bracketed thought for the footer', () => {
    const mes = `${BAR_HEADER}\n\nShe looks away.\n\n[God, I hate that he's right about this]\n\n${FOOTER}`;
    const { body, footer } = splitMessage(mes);
    assert.equal(footer, FOOTER);
    assert.match(body, /God, I hate that he's right/);
});

test('joinMessage restores header and footer byte-identically', () => {
    const mes = `${BAR_HEADER}\n\n*She leans back.* "Hey."\n\n${FOOTER}`;
    const parts = splitMessage(mes);
    const rebuilt = joinMessage({ ...parts, body: 'REWRITTEN BODY' });
    assert.ok(rebuilt.startsWith(BAR_HEADER), 'header preserved');
    assert.ok(rebuilt.endsWith(FOOTER), 'footer preserved');
    assert.match(rebuilt, /REWRITTEN BODY/);
    assert.ok(!rebuilt.includes('She leans back'), 'old body gone');
});

test('a header-only one-liner is not also counted as a footer', () => {
    const { header, footer } = splitMessage('[CS]');
    // "[CS]" is footer-shaped but it is the only line; it must not be claimed twice.
    assert.ok(!(header && footer), 'the same line cannot be both header and footer');
});

test('extractSpans pulls quoted dialogue, straight and curly', () => {
    const body = '*He shrugs.* "I dunno." She stared. “Really?”';
    const spans = extractSpans(body, 'dialogue');
    assert.deepEqual(spans.map(s => s.text), ['I dunno.', 'Really?']);
});

test('extractSpans pulls actions and thoughts separately', () => {
    const body = '*crosses arms* "Fine." [he is absolutely not fine]';
    assert.deepEqual(extractSpans(body, 'actions').map(s => s.text), ['crosses arms']);
    assert.deepEqual(extractSpans(body, 'thoughts').map(s => s.text), ['he is absolutely not fine']);
});

test('extractSpans returns offsets that address the inner text exactly', () => {
    const body = 'She said "hello there" quietly.';
    const [span] = extractSpans(body, 'dialogue');
    assert.equal(body.slice(span.start, span.end), 'hello there');
});

test('spliceSpans replaces only the spans and leaves delimiters in place', () => {
    const body = '*He shrugs.* "I dunno." *He looks away.*';
    const spans = extractSpans(body, 'dialogue');
    const out = spliceSpans(body, spans, { 1: 'I-I dunno man I dunno' });
    assert.equal(out, '*He shrugs.* "I-I dunno man I dunno" *He looks away.*');
});

test('spliceSpans with multiple spans keeps earlier offsets valid', () => {
    const body = '"one" middle "two"';
    const spans = extractSpans(body, 'dialogue');
    const out = spliceSpans(body, spans, { 1: 'FIRST REPLACEMENT IS LONGER', 2: 'x' });
    assert.equal(out, '"FIRST REPLACEMENT IS LONGER" middle "x"');
});

// A partial or malformed model response must degrade, never corrupt.
test('spliceSpans leaves a span alone when its replacement is missing or blank', () => {
    const body = '"one" and "two"';
    const spans = extractSpans(body, 'dialogue');
    assert.equal(spliceSpans(body, spans, { 2: 'TWO' }), '"one" and "TWO"');
    assert.equal(spliceSpans(body, spans, { 1: '   ' }), '"one" and "two"');
    assert.equal(spliceSpans(body, spans, {}), body);
});

test('formatSpansForPrompt numbers spans from one', () => {
    const spans = extractSpans('"a" "b"', 'dialogue');
    assert.equal(formatSpansForPrompt(spans), '<<1>> a\n<<2>> b');
});

test('parseSpanReplacements reads numbered lines back', () => {
    const parsed = parseSpanReplacements('<<1>> F-FAST?\n<<2>> I dunno man');
    assert.deepEqual(parsed, { 1: 'F-FAST?', 2: 'I dunno man' });
});

test('parseSpanReplacements survives fences, preamble and multi-line replacements', () => {
    const parsed = parseSpanReplacements('Here you go:\n```\n<<1>> line one\nstill fragment one\n<<2>> two\n```');
    assert.equal(parsed[1], 'line one\nstill fragment one');
    assert.equal(parsed[2], 'two');
});

test('parseSpanReplacements ignores junk that is not a numbered marker', () => {
    assert.deepEqual(parseSpanReplacements('I cannot help with that.'), {});
});

test('cleanFullRewrite strips fences and a short preamble line', () => {
    assert.equal(cleanFullRewrite('```\nthe prose\n```'), 'the prose');
    assert.equal(cleanFullRewrite('Here is the rewrite:\n\nthe prose'), 'the prose');
});

test('cleanFullRewrite does not eat real prose that merely contains a colon', () => {
    const prose = 'She had one rule: never answer him twice.\n\nHe answered anyway.';
    assert.equal(cleanFullRewrite(prose), prose);
});

test('buildUnderstudyMessages sends span rules and fragments for a scoped rewrite', () => {
    const body = '*shrugs* "I dunno."';
    const spans = extractSpans(body, 'dialogue');
    const messages = buildUnderstudyMessages({
        scope: 'dialogue',
        characterName: 'Briar',
        characterProfile: 'BRIAR PROFILE TEXT',
        recentMessages: [{ name: 'Lucky', text: 'You talk fast.' }],
        body,
        spans,
    });
    const system = messages[0].content;
    const user = messages[1].content;
    assert.match(system, /SPOKEN DIALOGUE/);
    // The mission sentence must name the part being rewritten and the quality to align it to.
    assert.match(system, /rewrite the provided response to better align with the character/);
    assert.match(system, /BRIAR PROFILE TEXT/);
    assert.match(system, /VOICE IS MORE IMPORTANT THAN GRAMMAR/);
    assert.match(user, /<<1>> I dunno\./);
    assert.match(user, /You talk fast\./);
});

test('buildUnderstudyMessages tells a full rewrite not to write header or footer', () => {
    const messages = buildUnderstudyMessages({ scope: 'full', body: 'some prose' });
    assert.match(messages[0].content, /do NOT write a closing bracket code line/i);
    assert.match(messages[1].content, /<<<BEGIN PASSAGE>>>/);
});

// Lucky's wording, kept verbatim on purpose: it is deliberately vague so it generalises
// across characters, and an earlier draft explained it into specifics, which broke that.
test('the uncomfortable scope carries the instruction verbatim', () => {
    const messages = buildUnderstudyMessages({ scope: 'uncomfortable', body: 'x' });
    assert.ok(messages[0].content.includes('Do the uncomfortable thing where the last model missed the mark'),
        'the verbatim instruction must survive intact');
});

test('the mission tells the second model the character was not fully encapsulated', () => {
    const messages = buildUnderstudyMessages({ scope: 'full', body: 'x' });
    assert.match(messages[0].content, /doesn't fully encapsulate the character/);
});

test('the brief is generic and the scope instruction lives in its own section', () => {
    // Lucky rewrote the opening generically, so the per-scope wording moved out of the brief.
    const forScope = (scope) => buildUnderstudyMessages({ scope, body: 'x' })[0].content;
    for (const scope of ['full', 'dialogue', 'thoughts', 'actions']) {
        assert.match(forScope(scope), /rewrite the provided response to better align with the character/);
    }
    assert.match(forScope('dialogue'), /\[SCOPE\]\nSPOKEN DIALOGUE only/);
    assert.match(forScope('thoughts'), /\[SCOPE\]\nINTERNAL THOUGHTS only/);
    assert.match(forScope('actions'), /\[SCOPE\]\nROLEPLAY ACTIONS only/);
});

test('macros are resolved so the rewriter never sees raw {{user}}/{{char}}', () => {
    const messages = buildUnderstudyMessages({
        scope: 'full',
        characterName: 'Briar',
        characterProfile: '{{char}} likes {{user}}',
        body: 'x',
        userName: 'Lucky',
    });
    assert.match(messages[0].content, /Briar likes Lucky/);
    assert.ok(!messages[0].content.includes('{{user}}'));
});

// End-to-end: the header and footer must survive a scoped rewrite untouched.
test('round trip: scoped rewrite changes only dialogue, header and footer intact', () => {
    const mes = `${BAR_HEADER}\n\n*She leans back, grinning.* "I dont talk fast."\n\n${FOOTER}`;
    const parts = splitMessage(mes);
    const spans = extractSpans(parts.body, 'dialogue');
    const replacements = parseSpanReplacements('<<1>> I-I doNOTtalkfast and-and whoeverSAID that was fucking with you');
    const rebuilt = joinMessage({ ...parts, body: spliceSpans(parts.body, spans, replacements) });

    assert.ok(rebuilt.startsWith(BAR_HEADER));
    assert.ok(rebuilt.endsWith(FOOTER));
    assert.match(rebuilt, /\*She leans back, grinning\.\*/, 'narration untouched');
    assert.match(rebuilt, /doNOTtalkfast/);
    assert.ok(!rebuilt.includes('I dont talk fast'), 'old dialogue replaced');
});

// Reasoning blocks are preamble, not prose. The rewriter must never see the model's own
// scratchpad, and the header sitting *after* a <think> block must still be protected.
// Patterns mirrored from Weyland-Formatter (thinkFull / analysisFull).
test('splitMessage protects a leading <think> block and the header after it', () => {
    const mes = `<think>\nShe would be annoyed here.\n</think>\n${BAR_HEADER}\n\n"Sure."\n\n${FOOTER}`;
    const { header, body, footer } = splitMessage(mes);
    assert.match(header, /<think>/, 'reasoning kept in the protected preamble');
    assert.match(header, /Black Barrel Bar/, 'header after the block is still protected');
    assert.equal(body.trim(), '"Sure."');
    assert.equal(footer, FOOTER);
    assert.ok(!body.includes('<think>'), 'reasoning never reaches the rewritable body');
});

test('splitMessage protects an <analysis> block the same way', () => {
    const mes = `<analysis>\nbeat check\n</analysis>\n${BAR_HEADER}\n\nProse here.\n\n${FOOTER}`;
    const { header, body } = splitMessage(mes);
    assert.match(header, /<analysis>/);
    assert.equal(body.trim(), 'Prose here.');
});

test('a reasoning block round-trips byte-identically', () => {
    const mes = `<think>\nkeep me exactly\n</think>\n${BAR_HEADER}\n\nProse.\n\n${FOOTER}`;
    const parts = splitMessage(mes);
    const rebuilt = joinMessage({ ...parts, body: 'NEW PROSE' });
    assert.match(rebuilt, /<think>\nkeep me exactly\n<\/think>/);
    assert.match(rebuilt, /NEW PROSE/);
    assert.ok(rebuilt.endsWith(FOOTER));
});

// Regression guard. Two separate drafts of UNCOMFORTABLE_DIRECTIVE wrapped the instruction in
// balancing qualifiers that read as reasonable and function as permission to soften — the exact
// shape Weyland's system prompt calls the SWERVE. A directive against swerving must not swerve.
test('the uncomfortable directive contains no softening off-ramps', () => {
    const system = buildUnderstudyMessages({ scope: 'uncomfortable', body: 'x' })[0].content;
    const offRamps = [
        /not cruelty for its own sake/i,
        /not darkness as decoration/i,
        /tasteful/i,
        /gratuitous/i,
        /where appropriate/i,
    ];
    for (const pattern of offRamps) {
        assert.ok(!pattern.test(system), `softening clause leaked back in: ${pattern}`);
    }
    // And it must still say the hard part out loud.
    assert.match(system, /can be crude/i);
    assert.match(system, /softening it is the only way to get this wrong/i);
});

test('every scope carries the swerve check, not just the uncomfortable one', () => {
    for (const scope of ['full', 'dialogue', 'thoughts', 'actions']) {
        const system = buildUnderstudyMessages({ scope, body: 'x' })[0].content;
        assert.match(system, /lands on something tidier instead/i, `scope ${scope} lost the swerve check`);
    }
});

// Understudy sees the whole character file and only a sliver of the chat, so it is the component
// most likely to narrate a secret as established fact. Weyland's own prompt calls that out
// ("secrets and backstory never leak into descriptions, foreshadowing..."), so every scope carries
// the rule — and it must not have turned into permission to write vaguely.
test('every scope carries the spoiler rule, and it is not an excuse to hedge', () => {
    for (const scope of ['full', 'uncomfortable', 'dialogue', 'thoughts', 'actions']) {
        const system = buildUnderstudyMessages({ scope, body: 'x' })[0].content;
        assert.match(system, /has not happened on the page yet/i, `scope ${scope} lost the spoiler rule`);
        // The rule is preceded by WHY, because a model that assumes the reader can also see the
        // profile treats the rule as arbitrary and reasons its way around it.
        assert.match(system, /never seen the profile above, and never will/i, `scope ${scope} lost the reader-cannot-see framing`);
        assert.match(system, /stripped out before anything reaches the screen/i, `scope ${scope} lost the why`);
        assert.match(system, /unstated, unhinted, unforeshadowed/i, `scope ${scope} lost the leak list`);
        assert.match(system, /without the secret placed on top/i, `scope ${scope} lost the full-strength clause`);
        assert.match(system, /Do NOT place secrets in narration/, `scope ${scope} lost the direct instruction`);
    }
});

test('the spoiler rule survives having no character profile at all', () => {
    const system = buildUnderstudyMessages({ scope: 'full', body: 'x', characterProfile: '' })[0].content;
    assert.match(system, /has not happened on the page yet/i);
});

// A Weyland profile can be 40k+ characters against a five-message scene window, and the model
// reads the biggest thing in the prompt as the brief — writing a character showcase instead of
// one beat. The counter-instruction has to be present whenever a profile is.
test('a profile always arrives with instructions on how to use it', () => {
    const system = buildUnderstudyMessages({ scope: 'full', body: 'x', characterProfile: 'Tail: red. Hair: red.' })[0].content;
    assert.match(system, /reference, not a checklist/i);
    assert.match(system, /Do not feel obligated to inject details/i);
    assert.match(system, /If a detail was out of frame in the original, it stays out of frame/i);

    // Nothing to explain how to use when there is no profile.
    const bare = buildUnderstudyMessages({ scope: 'full', body: 'x', characterProfile: '' })[0].content;
    assert.ok(!/reference, not a checklist/i.test(bare));
});

// No WeyPhone app runs an analysis layer (Lucky's rule): Copycat tells the model to write
// directly and to ignore any reasoning instructions a character card carries, rather than offering
// a <think> scratch space. The output-side strip tests below remain as the safety net.
test('every scope forbids an analysis/think preamble and waves off card reasoning instructions', () => {
    for (const scope of ['full', 'uncomfortable', 'dialogue', 'thoughts', 'actions']) {
        const system = buildUnderstudyMessages({ scope, body: 'x' })[0].content;
        assert.match(system, /\[NO ANALYSIS\]/, `scope ${scope} lost the no-analysis directive`);
        assert.match(system, /No analysis, planning, checklist or <think> block/, `scope ${scope} invites reasoning again`);
        assert.match(system, /belongs to a different pipeline: ignore it here/, `scope ${scope} lost the card waiver`);
        assert.doesNotMatch(system, /open with a <think> block/i, `scope ${scope} still offers a scratchpad`);
    }
});

// The promise made by SCRATCHPAD_DIRECTIVE has to actually hold on both output paths, or the
// model's planning notes land in the chat.
test('a scratchpad really is stripped, on both the full and the scoped path', () => {
    assert.equal(cleanFullRewrite('<think>\nplan: make her hostile\n</think>\n\nShe bit back.'), 'She bit back.');
    assert.equal(cleanFullRewrite('<analysis>checks</analysis>\n\nActual prose.'), 'Actual prose.');
    assert.deepEqual(
        parseSpanReplacements('<think>\nplanning, <<ignore me>>\n</think>\n\n<<1>> first\n<<2>> second'),
        { 1: 'first', 2: 'second' },
    );
});

test('a narrator may not bring its fourth-wall privileges into a rewrite', () => {
    const system = buildUnderstudyMessages({
        scope: 'full', body: 'x', narratorText: 'Salem may break the fourth wall to address the user.',
    })[0].content;
    assert.match(system, /that permission stays with the main model/i);
    assert.match(system, /Add an aside only if the original message contained one/i);
    assert.match(system, /no parenthetical remarks to the reader/i);
});

// Understudy invites the model to think in a <think> block; the other half of that promise is
// that nothing in there can reach the chat. These are the shapes that previously got through.
test('reasoning never survives, wherever it sits and however it ends', () => {
    // Reasoning-only. The old `|| text` fallback handed this straight back as the take, and it
    // was non-empty enough to pass the caller's "came back empty" check.
    assert.equal(cleanFullRewrite('<think>\nI planned and never wrote prose.\n</think>'), '');
    // Never closed - a truncated or run-away reasoning pass.
    assert.equal(cleanFullRewrite('<think>\nplanning forever, cut off mid'), '');
    assert.equal(cleanFullRewrite('<thinking attr="x">\nplanning\n</thinking>'), '');
    assert.equal(cleanFullRewrite('<analysis>checks</analysis>'), '');
    // Mid-message, not just leading.
    assert.equal(cleanFullRewrite('She bit back.\n\n<think>was that too far?</think>').trim(), 'She bit back.');
    // Normal output is untouched.
    assert.equal(cleanFullRewrite('<think>plan</think>\n\nShe bit back.'), 'She bit back.');
});

test('span markers inside the scratchpad are not replacements', () => {
    // A draft marker written while thinking used to be spliced into the message, dragging a
    // literal </think> in with it.
    assert.deepEqual(parseSpanReplacements('<think>\n<<1>> draft idea\n</think>'), {});
    assert.deepEqual(
        parseSpanReplacements('<think>\nMaybe <<1>> should be angrier.\n</think>\n\n<<1>> the real one'),
        { 1: 'the real one' },
    );
    // And an unclosed block cannot swallow the real replacements either way round.
    assert.deepEqual(parseSpanReplacements('<<1>> real\n\n<think>\n<<2>> scratch'), { 1: 'real' });
});

test('stripModelReasoning leaves ordinary prose alone', () => {
    const prose = 'She thought about it. *A think, even.* "I think so," she said.';
    assert.equal(stripModelReasoning(prose), prose);
    assert.equal(stripModelReasoning(''), '');
    assert.equal(stripModelReasoning(null), '');
});

// Observed in the wild: a take wrote "[she is blowing this SO HARD ... Don't you DARE look at
// Gemini right now, Briar -]" - the narrator commenting on the character from outside, printed
// inside the character's own head. Brackets are a first-person channel with a fixed owner.
test('every scope is told the bracket channel belongs to the character, in first person', () => {
    for (const scope of ['full', 'uncomfortable', 'dialogue', 'thoughts', 'actions']) {
        const system = buildUnderstudyMessages({ scope, characterName: 'Briar', body: 'x' })[0].content;
        assert.match(system, /BRACKET CHANNEL BELONGS TO Briar/i, `scope ${scope} lost the ownership rule`);
        assert.match(system, /FIRST PERSON/, `scope ${scope} lost the person rule`);
        assert.match(system, /refers to Briar in the third person/i, `scope ${scope} lost the failure it guards`);
        // A narrator persona must not be able to override it.
        assert.match(system, /this rule outranks it/i, `scope ${scope} lost the narrator precedence`);
    }
});

test('the bracket rule still permits third person about OTHER people', () => {
    const system = buildUnderstudyMessages({ scope: 'full', characterName: 'Briar', body: 'x' })[0].content;
    // Without this carve-out the rule reads as "no third person in brackets at all", which would
    // ban "[she's going to kill me]" - a perfectly ordinary thought about somebody else.
    assert.match(system, /Thoughts about anyone ELSE in third person are fine/i);
    assert.match(system, /the thinker is still Briar/i);
});

// Both carried over from the Beta Prompt, which tells the FIRST-pass model all of this and used
// to tell the rewriter none of it.
test('every scope inherits the banned-slop patterns', () => {
    for (const scope of ['full', 'uncomfortable', 'dialogue', 'thoughts', 'actions']) {
        const system = buildUnderstudyMessages({ scope, body: 'x' })[0].content;
        assert.match(system, /LITOTES \(NOT X, BUT Y\)/, `scope ${scope} lost the litotes ban`);
        assert.match(system, /hypophora/i, `scope ${scope} lost the hypophora ban`);
        assert.match(system, /NO NARRATIVE HESITATION/, `scope ${scope} lost the hesitation ban`);
        assert.match(system, /You actually see me|you see the real me/i, `scope ${scope} lost the trope ban`);
    }
});

test('every scope is told it may not write the user', () => {
    for (const scope of ['full', 'uncomfortable', 'dialogue', 'thoughts', 'actions']) {
        const system = buildUnderstudyMessages({ scope, userName: 'Lucky', body: 'x' })[0].content;
        assert.match(system, /USER AGENCY - DO NOT CONTROL Lucky/, `scope ${scope} lost the control boundary`);
        assert.match(system, /The sensation is yours to paint\. The reaction is theirs to choose\./,
            `scope ${scope} lost the sensation\/reaction split`);
        // The rewrite-specific half: "make it hit harder" must not be satisfied by narrating
        // the reader's reaction, which is the cheapest available shortcut to intensity.
        assert.match(system, /That shortcut is closed/i, `scope ${scope} lost the rewrite-specific warning`);
    }
});

test('the prompt stays title-led, gender-neutral and free of the removed intros', () => {
    const system = buildUnderstudyMessages({
        scope: 'uncomfortable', characterName: 'Kai', userName: 'Reader', characterProfile: 'P',
        // Run through buildStageDirections, not passed raw: the [STANDING MODIFIERS] title
        // lives in that function, so a bare string would bypass the very thing being asserted.
        narratorText: 'N', stageDirections: buildStageDirections(['S']), feedback: 'F', allowDeviation: true,
    })[0].content;
    // Chatty lead-ins that were replaced by titles.
    for (const gone of [
        /Here's how to find the spot/i,
        /You also have something you do not normally get/i,
        /And be clear on what you're allowed/i,
        /A boundary that does not bend/i,
        // Matched loosely on purpose: the precise wording ("it stays" vs "This stays") changed
        // during the rewrite and the exact-phrase guard passed while the intro was still there.
        /deliberately open-ended/i,
        /How to use that profile, because its size is misleading/i,
        /It's not that it got them wrong/i,
        /the single most important instruction in this prompt/i,
        /the single most important instruction in this prompt:/,
    ]) assert.ok(!gone.test(system), `removed intro came back: ${gone}`);
    // Gendered defaults in Understudy's own text (quoted examples are allowed to be gendered).
    for (const gone of [/in her own head/i, /her colouring, her build/i, /how she reacts/i, /hit her pretty perfectly/i, /she is never a "she" inside her own brackets/i])
        assert.ok(!gone.test(system), `gendered default came back: ${gone}`);
    // Every section is announced by a bracket title.
    for (const title of ['[Copycat BRIEF]', '[HOW TO USE THE PROFILE]', '[NO ANALYSIS]', '[KEEP SECRETS]',
        '[VOICE IS MORE IMPORTANT THAN GRAMMAR]', '[THOUGHTS - CHECK IF ENABLED]', '[BANNED AI SLOP PATTERNS]',
        '[USER AGENCY - DO NOT CONTROL Reader]', '[NARRATOR MODIFIER]', '[STANDING MODIFIERS]',
        '[DO THE UNCOMFORTABLE THING]', '[MAJOR DEVIATION - ENABLED]', '[OUTPUT FORMAT]'])
        assert.ok(system.includes(title), `missing section title ${title}`);
    // The brief ends with a checklist naming every section, so a renamed section that is not
    // also renamed there would leave the model hunting for a heading that does not exist.
    for (const title of ['[HOW TO USE THE PROFILE]', '[NO ANALYSIS]', '[KEEP SECRETS]',
        '[VOICE IS MORE IMPORTANT THAN GRAMMAR]', '[THOUGHTS - CHECK IF ENABLED]', '[BANNED AI SLOP PATTERNS]',
        '[NARRATOR MODIFIER]', '[STANDING MODIFIERS]'])
        assert.ok(system.split(title).length >= 3, `${title} is named in the brief checklist but has no section, or vice versa`);
    // The two litotes kept on purpose.
    assert.match(system, /It is reference, not a checklist\./);
    assert.match(system, /It is not a narration channel, not an aside to the reader/);
});

// The header is deliberately never sent as TEXT, which also meant the rewriter never knew where
// or when the scene was. These send the facts while keeping the header itself out of reach.
test('the scene header is parsed into facts across every header shape in use', () => {
    assert.deepEqual(parseSceneHeader('¦¦ Saturday, Oct 2nd ~ 8:51 PM ~ Black Barrel Bar ~ (SAPH) ¦¦'), {
        date: 'Saturday, Oct 2nd', time: '8:51 PM', location: 'Black Barrel Bar', mode: 'SAPH',
        raw: 'Saturday, Oct 2nd ~ 8:51 PM ~ Black Barrel Bar ~ (SAPH)',
    });
    // Older bare-tilde header, no mode tag.
    const tilde = parseSceneHeader('Wednesday, Aug 26th ~ 6:52 AM ~ Shared Bathroom ~');
    assert.equal(tilde.location, 'Shared Bathroom');
    assert.equal(tilde.mode, '');
    assert.equal(parseSceneHeader(''), null);
});

test('scene facts reach the user message, and nothing invents one when there is no header', () => {
    const withHeader = buildUnderstudyMessages({
        scope: 'full', body: 'x', header: '¦¦ Saturday, Oct 2nd ~ 8:51 PM ~ Black Barrel Bar ¦¦',
    })[1].content;
    assert.match(withHeader, /SCENE REFERENCE/);
    assert.match(withHeader, /Location: Black Barrel Bar/);
    assert.match(withHeader, /Time: 8:51 PM/);
    // It is reference, never something to reproduce - the header is pasted back automatically.
    assert.match(withHeader, /do not write any of this into your output/i);
    // And it sits with the passage rather than up in the scene log.
    assert.ok(withHeader.indexOf('SCENE REFERENCE') < withHeader.indexOf('<<<BEGIN PASSAGE>>>'));

    const headerless = buildUnderstudyMessages({ scope: 'full', body: 'x' })[1].content;
    assert.ok(!/SCENE REFERENCE/.test(headerless));
});

test('an unparseable header is passed through rather than dropped', () => {
    assert.match(buildSceneReference('some odd header'), /some odd header/);
});

test('a director note outranks the keep-everything bullet it contradicts', () => {
    // Observed: a note asking for a new action ("she suggests the beach") was dropped, because
    // the brief four lines below it forbids new events and the model obeyed the bullet.
    const system = buildUnderstudyMessages({ scope: 'full', body: 'x', feedback: 'she suggests the beach' })[0].content;
    const bullet = system.indexOf('Keep everything that HAPPENED');
    const precedence = system.indexOf('the guidance wins over the continuity bullet above');
    assert.ok(precedence > bullet, 'the precedence clause must follow the bullet it overrides');
    assert.match(system, /Everything EARLIER in the log still stands/);
    // With no note there is no conflict, and the line would read as licence to wander.
    assert.ok(!/guidance wins over the continuity bullet/.test(buildUnderstudyMessages({ scope: 'full', body: 'x' })[0].content));
});

test('a scoped rewrite is mandatory, not a suggestion', () => {
    for (const scope of ['dialogue', 'thoughts', 'actions', 'dialogueThoughts']) {
        const system = buildUnderstudyMessages({ scope, body: '"a" [b] *c*', spans: extractSpans('"a" [b] *c*', 'dialogue') })[0].content;
        assert.match(system, /EVERY fragment must be genuinely rewritten/, `scope ${scope} lost the mandatory-rewrite rule`);
    }
    for (const scope of ['full', 'uncomfortable']) {
        assert.match(buildUnderstudyMessages({ scope, body: 'x' })[0].content, /must be genuinely rewritten, not polished/,
            `scope ${scope} lost the mandatory-rewrite rule`);
    }
});

test('the dialogue + thoughts scope extracts both kinds, in document order, without overlap', () => {
    const body = '*She grins.* "Like the charms!" [oh god he is cute] *She bites down.* "Favorite shape?"';
    const spans = extractSpans(body, 'dialogue+thoughts');
    assert.deepEqual(spans.map(s => s.text), ['Like the charms!', 'oh god he is cute', 'Favorite shape?']);
    // Splicing must leave narration and the delimiters untouched.
    assert.equal(spliceSpans(body, spans, { 1: 'A', 2: 'B', 3: 'C' }),
        '*She grins.* "A" [B] *She bites down.* "C"');
    // A quote inside a thought belongs to the thought; it must not be claimed twice.
    const nested = extractSpans('[he said "no" to me]', 'dialogue+thoughts');
    assert.deepEqual(nested.map(s => s.text), ['he said "no" to me']);
});

test('meaningless asterisk runs are collapsed before the take is applied', () => {
    // Live failure: a take reached the chat containing "***THWACK.*****". Markdown cannot resolve
    // a run of five, so it rendered the asterisks literally, and Weyland-Formatter's own repair
    // skipped the paragraph because its TOTAL asterisk count was even (ten).
    assert.equal(collapseAsteriskRuns('A snort. ***THWACK.*****'), 'A snort. ***THWACK.***');
    // The three meaningful runs are untouched.
    assert.equal(collapseAsteriskRuns('normal *italic* text'), 'normal *italic* text');
    assert.equal(collapseAsteriskRuns('**bold** and ***both***'), '**bold** and ***both***');
    // A line that is only asterisks is a divider, not emphasis.
    assert.equal(collapseAsteriskRuns('one\n****\ntwo'), 'one\n****\ntwo');
    // Both output paths get it: whole-passage rewrites and spliced fragments alike.
    assert.equal(cleanFullRewrite('She slams the bar. ***THWACK.*****'), 'She slams the bar. ***THWACK.***');
    assert.deepEqual(parseSpanReplacements('<<1>> ***LOUD.*****'), { 1: '***LOUD.***' });
});

test('an orphan closing tag is stripped', () => {
    // Seen in the wild: a response that begins "</think>*The stutter hits her...". Neither the
    // closed nor the unclosed pattern catches it, because both start from an opening tag.
    assert.equal(cleanFullRewrite('</think>*The stutter hits her.*'), '*The stutter hits her.*');
    assert.equal(cleanFullRewrite('</analysis>\n\nReal prose.'), 'Real prose.');
    // A closing tag mid-prose is not a stray opener and must not eat the text around it.
    assert.equal(cleanFullRewrite('She said it. </think> is a tag.'), 'She said it. </think> is a tag.');
});

test('the scene log is fenced and cannot be mistaken for the passage', () => {
    // Observed: a rewrite that opened with the FIRST LINE OF THE PREVIOUS MESSAGE, because the
    // log and the passage arrived as plain prose under similar headings.
    const user = buildUnderstudyMessages({
        scope: 'full', body: 'THE BODY',
        recentMessages: [{ name: 'Briar', text: 'PREVIOUS MESSAGE' }],
    })[1].content;
    assert.match(user, /<<<SCENE LOG>>>[\s\S]*PREVIOUS MESSAGE[\s\S]*<<<END SCENE LOG>>>/);
    assert.match(user, /<<<BEGIN PASSAGE>>>\nTHE BODY\n<<<END PASSAGE>>>/);
    assert.match(user, /ALREADY WRITTEN and ALREADY SENT/);
    assert.match(user, /do not carry any of their sentences into your output/);
    assert.match(user, /Your output replaces exactly this text/);
    // The log must come first and the passage last, nearest the instruction.
    assert.ok(user.indexOf('<<<END SCENE LOG>>>') < user.indexOf('<<<BEGIN PASSAGE>>>'));
});

test('a scoped rewrite fences the full passage too', () => {
    const body = '"a" and "b"';
    const user = buildUnderstudyMessages({
        scope: 'dialogue', body, spans: extractSpans(body, 'dialogue'),
        recentMessages: [{ name: 'Briar', text: 'PREVIOUS MESSAGE' }],
    })[1].content;
    assert.match(user, /<<<BEGIN PASSAGE>>>/);
    assert.match(user, /do not draw sentences from the scene log above into it/);
});

test('no note means no guidance paragraph', () => {
    const system = buildUnderstudyMessages({ scope: 'full', body: 'x' })[0].content;
    assert.ok(!/The user provided the following guidance/.test(system));
    // The brief still has to read as a whole sentence with the paragraph removed.
    assert.match(system, /in its entirely\.\n\nThis is normally done because/);
});

test('the director note is quoted intact, inside the brief, near the top', () => {
    const note = 'She is being too nice in a scene where she should be hostile.';
    const system = buildUnderstudyMessages({ scope: 'full', body: 'x', feedback: note })[0].content;
    assert.match(system, /The user provided the following guidance:/);
    assert.ok(system.includes(note), 'the note was not carried through verbatim');
    // It arrives as the reason the model was called in, before any of the craft rules.
    assert.ok(system.indexOf(note) < system.indexOf('[KEEP SECRETS]'));
    assert.ok(system.indexOf(note) < system.indexOf('[OUTPUT FORMAT]'));
});

test('a multi-line note is carried through whole', () => {
    const system = buildUnderstudyMessages({ scope: 'full', body: 'x', feedback: 'line one\nline two' })[0].content;
    assert.ok(system.includes('line one\nline two'), 'the note was truncated or reflowed');
});

test('major deviation is opt-in, and is never offered on a scoped rewrite', () => {
    const off = buildUnderstudyMessages({ scope: 'full', body: 'x' })[0].content;
    assert.ok(!/permission to throw out/i.test(off), 'deviation licence appeared without being asked for');

    const on = buildUnderstudyMessages({ scope: 'full', body: 'x', allowDeviation: true })[0].content;
    assert.match(on, /permission to throw out what happens in this message entirely/i);
    assert.match(on, /is this more THEM/);
    // The licence changes the beat, not the history.
    assert.match(on, /nothing already in the log gets undone/i);

    // A span-scoped rewrite splices fragments in place; it cannot change the outcome, so
    // offering the licence there would be telling the model something untrue.
    for (const scope of ['dialogue', 'thoughts', 'actions']) {
        const scoped = buildUnderstudyMessages({ scope, body: 'x', allowDeviation: true })[0].content;
        assert.ok(!/permission to throw out/i.test(scoped), `scope ${scope} was offered a licence it cannot use`);
    }
});

test('message modes are detected from the header and footer the message already has', () => {
    assert.deepEqual(detectMessageModes('¦¦ Monday ~ 9pm ~ Dorm ~ (RUBY)¦¦', '[Smug] [RC] [3]'), ['RubyModeEntry']);
    assert.deepEqual(detectMessageModes('¦¦ Monday ~ 9pm ~ Dorm ~ (ONYX)¦¦', '[Soft] [RC] [OPAL] [3]'), ['OnyxModeEntry', 'OpalModeEntry']);
    // SAPH is a placeholder tag with no instruction block behind it.
    assert.deepEqual(detectMessageModes('¦¦ Monday ~ 9pm ~ Dorm ~ (SAPH)¦¦', ''), []);
    assert.deepEqual(detectMessageModes('¦¦ Monday ~ 9pm ~ Dorm¦¦', '[Smug] [RC] [3]'), []);
    // A mode named in the prose must not activate it — only the header/footer tags count.
    assert.deepEqual(detectMessageModes('', ''), []);
});

test('stage directions collapse to nothing when every modifier is off', () => {
    assert.equal(buildStageDirections([]), '');
    assert.equal(buildStageDirections(['', '   ', null, undefined]), '');
});

test('stage directions are framed as rules already in force, and reach the prompt', () => {
    const block = buildStageDirections(['[CRITICAL LANGUAGE MODIFIER: reply in French]', '[ROLEPLAY MODIFIER] second person']);
    assert.match(block, /STANDING MODIFIERS/);
    assert.match(block, /in force when the original was written/i);
    assert.match(block, /reply in French/);
    assert.match(block, /second person/);

    const system = buildUnderstudyMessages({ scope: 'full', body: 'x', stageDirections: block })[0].content;
    assert.ok(system.includes(block), 'stage directions did not reach the system prompt');
    // A narrator is a style; these are rules. Rules must come after the style they override.
    const withNarrator = buildUnderstudyMessages({
        scope: 'full', body: 'x', stageDirections: block, narratorText: 'Salem writes dark.',
    })[0].content;
    assert.ok(withNarrator.indexOf('[NARRATOR MODIFIER]') < withNarrator.indexOf('STANDING MODIFIERS'));
});

test('an empty narrator adds nothing at all', () => {
    assert.equal(buildNarratorDirective(''), '');
    assert.equal(buildNarratorDirective('   '), '');
    assert.equal(buildNarratorDirective(null), '');
    const system = buildUnderstudyMessages({ scope: 'full', body: 'x' })[0].content;
    assert.ok(!/ROLEPLAY MODIFIER/i.test(system), 'narrator block appeared with no narrator set');
});

test('a narrator rides along verbatim, under the never-appear framing', () => {
    const persona = '[CRITICAL - NARRATOR - SALEM]\nSalem is an unflinching narrator.';
    const system = buildUnderstudyMessages({ scope: 'full', body: 'x', narratorText: persona })[0].content;
    assert.match(system, /^\[NARRATOR MODIFIER\]\nFor this rewrite, you are writing as the following narrator\./m);
    assert.match(system, /just as Tolkien does not appear in his own books/);
    // The persona text itself must survive untouched — it is Lucky's prompt, not ours to reword.
    assert.ok(system.includes(persona), 'narrator persona text was altered on the way in');
});

test('the narrator block does not displace the scope brief or the output rules', () => {
    const system = buildUnderstudyMessages({ scope: 'dialogue', body: 'x', narratorText: 'Narrator text.' })[0].content;
    // Order matters: voice rules -> narrator -> what to rewrite -> how to return it.
    assert.ok(system.indexOf('[NARRATOR MODIFIER]') < system.indexOf('SPOKEN DIALOGUE only'));
    assert.ok(system.indexOf('SPOKEN DIALOGUE only') < system.indexOf('OUTPUT FORMAT'));
});

// Copycat strips the shared postrav footer, and the chat's ThoughtSet line lived inside it, so the
// rewrite model was told to "check whether thoughts are enabled" with nothing to check against and
// added bracketed thoughts to characters that have them off (reported on Tawny).
// Thoughts follow the character's own setting three ways (Lucky, 2026-10-02): on = thoughts are
// part of Everything and the rules for writing them come along; off = only the disabled message,
// with thoughts never mentioned anywhere else (including the Everything scope); unknown = the
// generic, hardened check.
const THOUGHTS_OFF = '[CHARACTER THOUGHTS: DISABLED BY DEFAULT. DO NOT SEND EXPLICITLY STATED CHARACTER THOUGHTS WITH RESPONSES UNLESS {{user}} REQUESTS THEM TO BE ENABLED.]';
const THOUGHTS_ON = '[CHARACTER THOUGHTS: ENABLED. Show {{char}}\'s private thoughts in [brackets].]';

test('thoughts mode is read from the chat setting: on, off, or unknown', () => {
    assert.equal(thoughtsModeOf(THOUGHTS_OFF), 'off');
    assert.equal(thoughtsModeOf(THOUGHTS_ON), 'on');
    assert.equal(thoughtsModeOf(''), 'unknown');
    assert.equal(thoughtsModeOf(undefined), 'unknown');
});

test('thoughts OFF: only the disabled message goes along, and nothing else mentions thoughts', () => {
    const system = buildUnderstudyMessages({ scope: 'full', body: 'x', userName: 'Robin', thoughtsSetting: THOUGHTS_OFF })[0].content;
    assert.ok(system.includes('[THOUGHTS SETTING FOR THIS CHAT'), 'the setting block is present');
    assert.ok(system.includes('UNLESS Robin REQUESTS'), '{{user}} inside the setting is resolved like everything else');
    assert.ok(!system.includes('[THOUGHTS - CHECK IF ENABLED]') && !system.includes('[THOUGHTS - ENABLED FOR THIS CHARACTER]'), 'no thoughts rules at all');
    assert.match(system, /\[SCOPE\]\nThe whole passage: dialogue and narration\. All of it is yours to redo\./);
});

test('thoughts ON: Everything includes thoughts, with the rules for writing them under the setting', () => {
    const system = buildUnderstudyMessages({ scope: 'full', body: 'x', thoughtsSetting: THOUGHTS_ON })[0].content;
    const settingAt = system.indexOf('[THOUGHTS SETTING FOR THIS CHAT');
    const rulesAt = system.indexOf('[THOUGHTS - ENABLED FOR THIS CHARACTER]', settingAt);
    assert.ok(settingAt >= 0 && rulesAt > settingAt && rulesAt - settingAt < THOUGHTS_ON.length + 200, 'the rules sit directly under the setting');
    assert.ok(system.includes('THE BRACKET CHANNEL BELONGS TO'));
    assert.ok(!system.includes('[THOUGHTS - CHECK IF ENABLED]'), 'no on/off test to get wrong');
    assert.match(system, /\[SCOPE\]\nThe whole passage: dialogue, narration, thoughts\. All of it is yours to redo\./);
});

test('thought scopes only exist for characters with thoughts, and a saved one falls back when they are off', () => {
    assert.deepEqual(availableUnderstudyScopes('off').filter(key => /houghts/.test(key)), []);
    assert.ok(availableUnderstudyScopes('on').includes('thoughts') && availableUnderstudyScopes('on').includes('dialogueThoughts'));
    assert.ok(availableUnderstudyScopes('unknown').includes('thoughts'), 'unknown hides nothing');
    assert.equal(effectiveUnderstudyScope('dialogueThoughts', 'off'), 'dialogue');
    assert.equal(effectiveUnderstudyScope('thoughts', 'off'), 'full');
    assert.equal(effectiveUnderstudyScope('thoughts', 'on'), 'thoughts');
    assert.equal(effectiveUnderstudyScope('nonsense', 'on'), 'full');
    assert.equal(understudyScopeHint('full', 'off'), 'Rewrite everything: dialogue and narration.');
    // A caller that still passes a thought scope for a thoughts-off character gets the safe prompt.
    const system = buildUnderstudyMessages({ scope: 'thoughts', body: 'x', thoughtsSetting: THOUGHTS_OFF })[0].content;
    assert.match(system, /\[SCOPE\]\nThe whole passage: dialogue and narration\./);
});

// Sayori (thoughts off) got bracketed thoughts from a Gemini "Everything" rewrite: the full scope,
// sitting after the thoughts rule and closest to the output, listed thoughts flatly as part of the
// job, and the disabled setting's "unless {{user}} requests them" read like the director's note.
test('the full scope only includes thoughts when enabled, and a rewrite request never enables them', () => {
    const system = buildUnderstudyMessages({ scope: 'full', body: 'x', feedback: 'include the text block' })[0].content;
    assert.match(system, /\[SCOPE\]\nThe whole passage: dialogue, narration, and thoughts only if they are enabled/);
    assert.doesNotMatch(system, /dialogue, narration, thoughts\. All of it/);
    assert.match(system, /Requesting this rewrite, a note about what to change, or asking for other content \(a text block, a different tone\) is NOT that request: thoughts stay off\./);
});

test('with no thoughts setting known, the rewrite gets the generic rule and no invented setting', () => {
    for (const thoughtsSetting of [undefined, '', '   ']) {
        const system = buildUnderstudyMessages({ scope: 'full', body: 'x', thoughtsSetting })[0].content;
        assert.ok(!system.includes('[THOUGHTS SETTING FOR THIS CHAT'));
        assert.ok(system.includes('[THOUGHTS - CHECK IF ENABLED]'));
    }
});
