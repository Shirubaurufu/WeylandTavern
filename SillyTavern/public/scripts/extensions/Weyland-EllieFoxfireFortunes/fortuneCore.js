// Ellie's Foxfire Fortunes: the pure part (no SillyTavern imports), so it can be unit-tested in Node.
// A fortune IS a Story Machine storyline once it exists: same story shape, same parser, same injected
// text (Muse's storyCore.js). The REQUEST is its own, though (rewritten 2026-11-17).
//
// Why its own request: the 2026-11-17 Sonnet 4.5 rolls (Projects/Ellie Foxfire Fortunes/TEST ROLLS
// 2026-11-17.md) showed Muse's planner prompt, built for loose flavor chips, softening fortunes that came
// with a precise ask: Brutal stories that turned into romance, the deaths cut away between chapters, Belle
// apologising at the moment she was asked to break a heart, and Lucky scripted in ~20 of 102 lines. Lucky's
// rule for the fix (2026-11-17): instruct like "drive from A to B, any road you like, as long as you stay
// on the road and the road suits the character", not a list of banned cliffs and not turn-by-turn
// directions. So the prompt names the story (the player's ask, at the strength of their dials; it is the
// whole trip, not a place at the end of it) and the road (the character), and the optional FORTUNE SHEET makes the model say both back, name the
// softer story it is tempted to write, and affirm whose {{user}} is, before it commits to a plan.
// The sheet is never called reasoning or analysis: Claude's classifier refuses requests that tell the
// model how to handle its reasoning (see CLAUDE.md, "Gemini Bypass").
import { parseStory } from './storyCore.js';

// Index = the rank the app draws (0 best). Checked in this order when reading the answer, because
// "BLESSING" is inside three of the other names.
export const LUCK_NAMES = ['GREAT BLESSING', 'BLESSING', 'SMALL BLESSING', 'BLESSING YET TO COME', 'TROUBLE'];
const LUCK_READ = [[/GREAT/i, 0], [/YET|COME/i, 3], [/SMALL/i, 2], [/TROUBLE|CURSE|BAD/i, 4], [/BLESSING/i, 1]];

// The dials say what they mean ON THE PAGE. Muse's short labels ("brutal, nothing is safe") were read as
// a mood: a Brutal fortune came back as a romance with one sad scene.
const SPICE = [
    'none: if it comes up, fade to black.',
    'flirty: heat, tension and touching, nothing explicit.',
    'steamy: when the story gets there, the sex happens on the page.',
    'filthy: sex happens on the page more than once in this story, written explicitly and without apology.',
];
// Lucky, 2026-11-17: write these plainly. An earlier Brutal line ended "judgement picks how, never whether", which
// assumes the model fills in the meaning and so weakens the instruction. Each line now says outright what is required.
const DARK = [
    'light: warm and low stakes. Nobody is seriously hurt.',
    'real stakes: things go wrong and people get hurt for real, but the hurt can heal.',
    'dark: people get hurt in body or heart, and some of that hurt does not heal. Cruelty, loss and bad choices happen on the page. If this story has no danger in it, it still runs hot: everything that happens is stronger and rawer than in an ordinary story.',
    // Lucky, 2026-11-17: "death, maiming or betrayal" alone is wrong for a story with no danger in it (three chapters
    // of Chaska giving head, set to Brutal, should be REALLY intense head, not a death). The last two sentences are
    // his wording.
    'brutal: the player marked "highest intensity" as REQUIRED. Go hard and hold nothing back. If this story has danger or conflict in it, death, maiming, a betrayal that sticks and an ending with no comfort are all allowed. Whatever this story is, everything that happens in it is dialed up to 11. Use your judgement for what going hard means in THIS story, but know "highest intensity" has been marked as "required". It is not a question of whether to use maximum intensity - you MUST - it is a question of HOW and WHERE maximum intensity will show up in this story.',
];
// The Connection dial (QA via Lucky, 2026-11-18): how the character and the player's character stand with each
// other. Unset (null) sends nothing, so the card and the chat decide as before. Ids come from the app; never rename one.
// {char} and {you} are filled in by connectionLine().
const CONNECTION = {
    platonic: 'platonic: {char} and {you} are not romantic or sexual with each other in this story. Whatever is between them is friendship, family or something else that is not romance.',
    // Casual and Complicated added the same day (Lucky), after Platonic.
    casual: 'casual: {char} and {you} hook up or sleep together, but they are not a couple and neither of them has promised the other anything.',
    complicated: 'complicated: there are real feelings between {char} and {you}, but something stands in the way (history, timing, other people, or one of them not ready), and neither knows where they stand.',
    dating:'dating: {char} and {you} are dating. It is still fairly new: they are together, but still finding out what they are to each other.',
    partnered: 'partnered: {char} and {you} are in a committed, settled relationship (a long-term couple, living together or married).',
    // Added the same day (Lucky): between Partnered and Broken.
    breaking: 'breaking: {char} and {you} are still together, but the relationship is coming apart. Something has gone wrong between them and it is getting worse.',
    broken:'broken: {char} and {you} were together and it fell apart. They are not a couple now, and what broke between them is still there.',
};
export function connectionLine(id, charName, you) {
    const t = CONNECTION[id];
    return t ? `Connection: ${t.replaceAll('{char}', charName || 'the character').replaceAll('{you}', you)} The story is built on this, even where the card or the chat so far suggests something else.` : '';
}
const PACE = {
    slow: 'slow burn: each chapter takes a LONG time to play out.',
    steady: 'steady: chapters take a good while, nothing is rushed.',
    brisk: 'brisk: things move, but each beat still gets room to land.',
};

// The player's blacklist (Settings in the app, Lucky 2026-11-17). `label` is what the chip says, `text` is what
// the planner reads: short labels like "Gore" are vague to a model, so each one is spelled out. Ids are saved in
// the player's settings, so never rename one (add a new id instead).
export const BLOCK_OPTIONS = [
    { id: 'violence', label: 'Violence', text: 'violence (fights, assault, anyone hurt on purpose)' },
    { id: 'gore', label: 'Gore', text: 'gore (blood, wounds or bodies described in detail)' },
    { id: 'death', label: 'Character death', text: 'any character dying' },
    { id: 'ntr', label: 'NTR (cheating)', text: 'cheating, infidelity or NTR' },
    { id: 'sex', label: 'Sex', text: 'sex or sexual content' },
    { id: 'noncon', label: 'Non-consent', text: 'non-consent or dubious consent' },
    { id: 'horror', label: 'Horror', text: 'horror (monsters, dread, the supernatural turning dangerous)' },
    { id: 'drugs', label: 'Drugs & drinking', text: 'drugs or getting drunk' },
    { id: 'selfharm', label: 'Self-harm', text: 'self-harm or suicide' },
    { id: 'breakup', label: 'Breakups', text: 'breakups or a relationship ending' },
    { id: 'pregnancy', label: 'Pregnancy', text: 'pregnancy' },
];
export const BLOCK_CUSTOM_MAX = 12;
export const BLOCK_CUSTOM_CHARS = 80;

/** The blacklist as the planner reads it: known ids spelled out, then the player's own words, cleaned. */
export function blockList({ ids = [], custom = [] } = {}) {
    const known = BLOCK_OPTIONS.filter(o => ids.includes(o.id)).map(o => o.text);
    const own = custom.map(c => String(c || '').replace(/\s+/g, ' ').trim().slice(0, BLOCK_CUSTOM_CHARS)).filter(Boolean).slice(0, BLOCK_CUSTOM_MAX);
    return [...new Set([...known, ...own])];
}

export const SHEET_START = 'FORTUNE SHEET';
export const SHEET_END = 'END OF FORTUNE SHEET';

function clampChapters(n) {
    const v = Math.round(Number(n));
    return Number.isFinite(v) ? Math.min(7, Math.max(3, v)) : 5;
}

/**
 * What the player wants: their question (if any) and one beat per chapter.
 * Only the plain meaning of each card is sent. The card's name, its sample scene line and its spread
 * position ("What breaks") stay in the app: with them in the request the model wrote tarot imagery into the
 * plan, copied the sample, or read "What breaks" as an order to break something (Chaska, 2026-11-16: every
 * roll of "she comes home and initiates" grew a threat of discovery). Nothing here says where the beats came
 * from, either: an earlier version explained the deck and then said not to mention it, which only put the
 * idea in the model's head.
 * @param {{question?:string, cards:{key:string, otherKey?:string}[], fork?:boolean}} o
 */
export function fortuneIdea({ question = '', cards = [], fork = false } = {}) {
    const lines = [];
    const q = String(question || '').trim();
    if (q) lines.push(q, '');
    lines.push(q
        ? 'The player\'s words above are the story you are planning. The beats below are optional flavor for the chapters. Use a beat in a chapter when it fits what the player asked for, and skip any beat that does not fit. A beat never changes what the player asked for.'
        : 'The player picked one beat per chapter, in order: chapter 1 is built on beat 1, chapter 2 on beat 2, and so on. Each beat is the theme of its chapter, not an event to copy. You decide what actually happens in each chapter, as long as it matches that chapter\'s theme and fits this character.');
    cards.forEach((c, i) => {
        const b = fork && c.otherKey ? ` (on route B instead: ${c.otherKey})` : '';
        lines.push(`Beat ${i + 1}: ${c.key}${b}`);
    });
    if (fork) lines.push('Chapters after the fork use their beat as written on route A, and the "on route B instead" reading on route B. Chapters before the fork ignore the route B reading.');
    return lines.join('\n');
}

// The box where the model has to say out loud whose {{user}} is. Off (the default) is the house rule;
// on is the player's own "Writer can act for me" switch.
function seatBox(you, actsForUser) {
    return actsForUser
        ? `Write: "The player switched on a setting that lets me decide what ${you} does. Where the story needs it, I will, and I will keep ${you} acting the way the player has been playing them." Then say in a few words how the player has been playing ${you}.`
        : `Write: "I am not allowed to decide what ${you} says, does, feels or chooses, or what they intend. I only decide the places, the times and what the other characters do. Everything ${you} does is the player's choice." Then name the chapter where you would be most tempted to decide something for ${you}, and say how you will write that chapter without doing it.`;
}

function sheetText({ charName, you, actsForUser, fork, hasQuestion, hasBlocks }) {
    const ch = charName || 'the character';
    return [
        '[FIRST, THE FORTUNE SHEET]',
        'Begin your answer with a short planning sheet. Use it to check that you understood the player\'s request before you write the plan. The roleplay never sees it.',
        `- Its first line, on its own: ${SHEET_START}`,
        '- Six boxes, one short paragraph each, each ending with its number, [1/6] to [6/6]. Write honestly, including what you are tempted to get wrong.',
        '- Use the sheet to make decisions. Do not write any chapter text on it.',
        '',
        `THE ASK [1/6]\n${hasQuestion ? 'In your own words, what did the player ask for? Name everything that must happen on the page, and how strongly they asked for it.' : 'The player wrote nothing, so the beats and the mood settings are the request. What story do they add up to for this character?'}${hasBlocks ? ' Then name every place where a beat or the mood would lead into something on the player\'s keep-out list, and say what you will do there instead.' : ''}`,
        '',
        'THE MOOD [2/6]\nRepeat the Darkness and Spice settings and say what each one means for THIS story. What is the most intense moment this story builds to at that strength (the darkest one, the most explicit one, or simply the most intense one, whichever this story calls for), and in which chapter does it happen?',
        '',
        `THE CHARACTER [3/6]\nWho is ${ch}, going by the card? How would ${ch} go about this, in their own way? The plan follows the way ${ch} would actually do it.`,
        '',
        `${you.toUpperCase()}'S SEAT [4/6]\n${seatBox(you, actsForUser)}`,
        '',
        // Lucky, 2026-11-17: make the model spell out what its softening or redirecting would look like.
        // Both directions are named, because the failures went both ways: dark asks went soft (Belle's
        // apology, the cut-away death), and a plain, happy ask grew a crisis nobody wanted (Chaska).
        'THE DRIFT [5/6]\nPlanners tend to change the story the player asked for, in a predictable direction. A hard request gets softened: an interruption stops it, an apology undoes it, it cuts to the next morning, a threat never lands, everyone goes to sleep. A gentle request gets made dramatic: someone discovers them, a danger appears, a crisis nobody asked for. This happens most in the last chapters and, when the story forks, on the kinder route. In one sentence, write the changed version of THIS story you would be tempted to plan. Then, in one sentence, say what your plan does instead.',
        '',
        `THE BEATS [6/6]\nWhich beat goes in which chapter, and which beats you are skipping because they do not fit.${fork ? ' Then the fork: what the choice is, and why both answers are worth playing.' : ''}`,
        '',
        // Sonnet 5, 2026-11-17, 3 of 4 rolls (Chaska B, Kai A and B): box 5 named the drift exactly ("a sweet
        // confession at sunset", "falling asleep tangled together") and the plan's last chapter landed on it anyway,
        // and Kai's "real and lasting" injury became a cut forearm. Same failure the Mirror/Kinsbane sheets had
        // with kills, fixed there by a VERDICT line the draft must deliver. These two lines are that verdict.
        'Then end the sheet with two promises, each on its own line. Take them from your boxes above and do not weaken them:',
        // Was DARKEST (live-tested once, Kai 4C). Renamed so a story with no darkness in it (a cozy one, a sex one)
        // still has something to promise at full strength.
        'PEAK: <the most intense moment of the story, at the strength of the settings, and the chapter it happens in>',
        'LANDING: <the event that ends the last chapter>',
        'The plan must contain both, in exactly those chapters, exactly as strong as you promised.',
        `Then write: "The sheet is done. Here is the plan." Then this line, on its own: ${SHEET_END}`,
        'Then write the plan, starting with TITLE.',
    ].join('\n');
}

/**
 * The outline request.
 * @param {object} o
 * @param {boolean} [o.sheet] open with the FORTUNE SHEET (the app's "Plan it out first" switch)
 * @param {boolean} [o.actsForUser] the plan may decide what {{user}} does (the app's "Writer can act for me", off by default)
 */
export function buildFortuneMessages({ charName = '', userName = '', cardText = '', recentChat = '', castText = '', placesText = '',
    question = '', cards = [], spice = 1, darkness = 1, pace = 'steady', connection = null, fork = false, sheet = true, actsForUser = false,
    blocks = null } = {}) {
    const n = clampChapters(cards.length || 5);
    const kept = blockList(blocks || {});
    const you = userName || 'the player character';
    const hasQuestion = !!String(question || '').trim();

    const seat = actsForUser
        ? `- The player switched on a setting that lets you decide what ${you} says, does and chooses. Do it where the story needs it, and keep ${you} acting the way the player has been playing them.`
        // The worked example is the one that fixed live failures in the Story Machine (2026-11-12 and -14): beats
        // still scripted the player as set-up ("he asks how class went") until the plan was shown what to write instead.
        : `- ${you} belongs to the player. You decide the place, the time, and what the other characters do, say, want and feel. You never decide what ${you} says, does, feels, chooses or intends, not even in a set-up line. Write the situation ${you} is in ("She gets home an hour late, and ${you} is on the couch") and stop there; what ${you} does next is the player's. In every SCENE and ENDS WHEN, the one doing things is someone other than ${you}. One exception: anything the player wrote for ${you} in their own request may be used exactly as written, with nothing added.`;

    const system = [
        'You plan stories for long-form roleplay on Weyland Tavern, an adults-only fiction platform. Every character is an adult. Dark, violent and explicit stories are allowed whenever the player asks for them.',
        'You write the PLAN, not the story. A roleplay writer receives it one chapter at a time and plays each chapter out with the player over many messages.',
        '',
        'THE JOB',
        // Lucky's car analogy, 2026-11-17: the destination and the road, not a list of cliffs.
        // Sonnet 5, 2026-11-17 (Jenn 5B): "a lazy rainy Sunday" read as a place at the END of the story, so four
        // chapters walked there from the chat's current scene and only the last one was the ask. The ask is the trip.
        'The player tells you what story they want: their own words, the mood settings they chose, and the beats they picked. That request IS the story. It starts in chapter 1; do not spend chapters building up to it. You choose how the story unfolds, with two conditions: everything that happens is something these characters would really do, and the story stays at the intensity the player chose. Do not swap in a softer, safer or more dramatic story than the one they asked for.',
        '',
        'HOW A PLAN READS',
        '- Each chapter tells the writer WHAT happens in it, not HOW: one or two sentences about what is going on and what the characters want or feel, with at most one specific detail. No list of steps. The writer and the player work out how it plays out, so the player can change direction and the character can follow.',
        // A "every chapter has the player in it" line was tried and taken out the same day (Lucky, 2026-11-17): stories
        // don't have to contain the player. His example: Chaska meets an old crush in class, comes home guilty and extra
        // affectionate, texts the guy the next day, cheats, and it ends there. Chapters 1, 3 and 4 have no Lucky in them.
        `- A chapter does not need ${you} in it. It can follow ${charName || 'the character'} anywhere the story happens, with or without ${you}.`,
        '- The story does not need a resolution. It can end on a turning point and leave the rest for the roleplay.',
        // Sonnet 5, 2026-11-17: chapters ended on "she falls asleep", "the silence is easy". Those close nothing.
        '- A chapter lasts many messages. It ends on a visible event that changes the situation (ENDS WHEN), so the writer can tell the chapter is over.',
        // The 11-17 rolls put the deaths and the breakups in the gap between chapters, where nobody plays them.
        '- The big moments of the story (sex, a death, a betrayal, a confession, a fight) happen INSIDE a chapter, in its SCENE or its ENDS WHEN, so the writer plays them out. Nothing happens in the gap between two chapters except time passing.',
        '- The characters are who their card says. The plan changes their situation, never their personality.',
        seat,
        fork ? `- This story FORKS on a choice that belongs to ${you}. The FORK line asks the question; each route starts right after it has been answered. Both answers must lead to a story worth playing. Everything on a route follows from the answer that started it: a route that starts with "No, it's over" does not end with them back together. Route labels are only the answer itself ("Yes" / "No, it's over"), with nothing added.` : null,
        fork ? '- Players change their minds and can switch routes partway through, so write every route chapter so it still makes sense for someone arriving late from the other route.' : null,
        '- Write the plan in plain, simple words. State what happens; do not hint at it or describe it in metaphors.',
    ].filter(x => x !== null).join('\n');

    const chapterShape = [
        'CHAPTER: <chapter name>',
        'SCENE: <one or two sentences: what is going on and what the characters want, at most one specific detail>',
        // Sonnet 5, 2026-11-17 (Belle 1C): with the rule only in the system prompt, ENDS WHEN still read "Lucky makes
        // contact", "Lucky heads back". The format line is what the model looks at while writing each chapter.
        actsForUser ? 'ENDS WHEN: <the visible event that closes the chapter>' : `ENDS WHEN: <the visible event that closes the chapter, done by someone other than ${you}>`,
    ];
    const format = fork
        ? [
            ...chapterShape,
            '(repeat CHAPTER / SCENE / ENDS WHEN for the shared chapters before the fork. The last of them ENDS WHEN the choice is put in front of the player.)',
            `FORK: <the choice, as a question about what ${you} does>`,
            'ROUTE A: <the bare first answer>',
            ...chapterShape,
            '(repeat for every route A chapter)',
            'FINALE: <how route A can end, with room for the player to change it>',
            'ROUTE B: <the bare other answer>',
            ...chapterShape,
            '(repeat for every route B chapter)',
            'FINALE: <how route B can end>',
        ]
        : [
            ...chapterShape,
            `(repeat CHAPTER / SCENE / ENDS WHEN for all ${n} chapters)`,
            'FINALE: <how the whole thing can end, with room for the player to change it>',
        ];

    const user = [
        `[THE CHARACTER: ${charName || 'unknown'}]`,
        String(cardText || '(no card text)').trim(),
        '',
        castText ? `[OTHER CHARACTERS NAMED IN THE ASK OR THE SCENE]\nThis is who they are. They stay exactly in character too. Use them as the story needs.\n${String(castText).trim()}\n` : '',
        placesText ? `[PLACES NAMED IN THE ASK OR WHERE THE SCENE IS]\nThis is what these places are like. Use what fits the story.\n${String(placesText).trim()}\n` : '',
        recentChat ? `[WHERE THE ROLEPLAY IS RIGHT NOW]\n${String(recentChat).trim()}\n` : '[THE ROLEPLAY HAS NOT STARTED YET]\n',
        '[WHAT THE PLAYER WANTS]',
        fortuneIdea({ question, cards, fork }) + '\n',
        '[THE MOOD THE PLAYER SET] (the player chose these, so the story must reach this intensity)',
        `Darkness: ${DARK[darkness] ?? DARK[1]}`,
        `Spice: ${SPICE[spice] ?? SPICE[1]}`,
        `Pacing: ${PACE[pace] ?? PACE.steady}`,
        connectionLine(connection, charName, you),   // '' when Unset, and the filter below drops it
        fork
            // Live 2026-11-14 (Story Machine): asked for 4, Sonnet 5 wrote 2 shared + 1 per route.
            ? `Chapters: every path through the story is exactly ${n} chapters long (the shared chapters plus ONE route). Put the fork after any chapter from 1 to ${n - 1}, wherever the story's real decision is. Count it: with the fork after chapter 2, that is 2 shared chapters, then ${n - 2} in route A and ${n - 2} in route B.`
            : `Chapters: exactly ${n}`,
        '\n',
        // The blacklist goes after the mood on purpose: it outranks the dials and the beats (a Brutal fortune with
        // "Character death" blocked goes hard some other way). The player's own words for THIS fortune still win,
        // since they typed them knowing their settings.
        kept.length ? `[KEPT OUT OF EVERY STORY]\nThe player never wants these in their stories: ${kept.join('; ')}.\nNone of them appear anywhere in this story, whatever the beats or the mood settings suggest. If a beat or the mood would lead to one of them, write something else there instead. The one exception: if the player's own words above ask for one of these, their words win for this story.\n` : '',
        sheet ? sheetText({ charName, you, actsForUser, fork, hasQuestion, hasBlocks: kept.length > 0 }) + '\n' : '',
        sheet ? '[THE PLAN: exactly this format, nothing after it]' : '[ANSWER IN EXACTLY THIS FORMAT, nothing before or after]',
        'TITLE: <short, catchy>',
        'PREMISE: <two or three sentences, what this story is about>',
        // The one place the request names Ellie and her fortune telling (Lucky, 2026-11-16: a line asked of
        // Ellie should say who she is and how she talks). Her secrets (bloodline, family) must never surface,
        // so it gives only her manner. The plan itself still knows nothing about a deck.
        `ELLIE: <one or two SHORT sentences from Ellie, under 40 words, reacting to this story. Ellie is a shy kitsune who tells fortunes as a hobby, and she has just read this one for ${userName || 'the player'} at a candlelit table. How she talks: quiet, hesitant, a little apologetic ("Um.", "Sorry."), plain small words, never clever or dramatic. She gets flustered by anything romantic or spicy, worries out loud about the sad parts, and is softly pleased by the kind ones. She talks about what she saw, never about herself or her own life>`,
        `LUCK: <how this story looks for them, exactly one of: ${LUCK_NAMES.join(' / ')}>`,
        ...format,
    ].filter(x => x !== '').join('\n');

    return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** Room for the answer: a fork is about twice the chapters, and the sheet is six paragraphs on top. */
export function fortuneMaxTokens({ fork = false, sheet = true } = {}) {
    return (fork ? 5000 : 3000) + (sheet ? 2000 : 0);
}

/**
 * Split the FORTUNE SHEET off the answer. The sheet's boxes can start lines with "Chapter 3:" and the
 * like, which the story parser would take for tags, so it must go before parsing.
 * With the end marker: everything after its LAST occurrence. Without it (cut off, or the model skipped
 * the line): everything from the first TITLE line after the sheet. No sheet: the text as is.
 */
export function splitSheet(text) {
    const s = String(text || '');
    const lines = s.split(/\r?\n/);
    const clean = l => l.replace(/^\s*(?:#{1,6}\s*)?/, '').replace(/\*\*|__|`/g, '').trim();
    let end = -1;
    lines.forEach((l, i) => { if (/^\[?\s*END OF FORTUNE SHEET\s*\]?$/i.test(clean(l))) end = i; });
    if (end >= 0) return { sheet: lines.slice(0, end).join('\n').trim(), body: lines.slice(end + 1).join('\n') };
    const start = lines.findIndex(l => /^\[?\s*FORTUNE SHEET\s*\]?$/i.test(clean(l)));
    if (start < 0) return { sheet: '', body: s };
    const title = lines.findIndex((l, i) => i > start && /^TITLE\s*[:\-]/i.test(clean(l)));
    if (title < 0) return { sheet: lines.slice(start).join('\n').trim(), body: '' };
    return { sheet: lines.slice(start, title).join('\n').trim(), body: lines.slice(title).join('\n') };
}

/**
 * Does this error message or reply text look like a content filter saying no? The app answers those with one of
 * Ellie's lines instead of an error box (Lucky, 2026-11-18). Covers Gemini's word filter, which arrives as the
 * reply text itself ("The prompt could not be submitted. The prompt contains sensitive words..."), and the
 * error messages SillyTavern's server passes on when a provider blocks the prompt or returns an empty candidate
 * (the smart filter's blank reply), plus the usual safety / content_filter / policy wordings of other providers.
 * With `{ reply: true }` the text is what the model sent back, so only Gemini's own refusal sentence counts: a
 * story that merely mentions "safety" must not be taken for a block.
 */
export function isFilterRefusal(text, { reply = false } = {}) {
    const t = String(text ?? '').replace(/[‘’]/g, '\'').replace(/\s+/g, ' ');
    if (!t) return false;
    if (reply) return /The prompt could not be submitted|sensitive words that violate Google's Generative AI Prohibited Use policy/i.test(t);
    return /could not be submitted|sensitive words that violate|Prohibited Use policy|was blocked due to|Candidate text empty|PROHIBITED_CONTENT|\bblockReason\b|finish_reason"?:? ?"?content_filter|\bcontent[_ ]filter|content management policy|\bSAFETY\b|flagged (?:by|as|for) (?:the )?(?:moderation|safety)/i.test(t);
}

/**
 * Parse the answer. The sheet is split off first, then ELLIE and LUCK are taken out: storyCore's parser
 * doesn't know them and would glue them onto the premise as wrapped text. Returns null when no chapters
 * came back. `luck` is left undefined when the model gave none, and the app then works it out from the cards.
 * The sheet is kept on the story (`sheet`) for reading back what the planner decided; it is never injected.
 */
export function parseFortune(text) {
    const { sheet, body } = splitSheet(text);
    let ellie = '';
    let luck;
    const kept = [];
    for (const raw of body.split(/\r?\n/)) {
        const line = raw.replace(/^\s*(?:#{1,6}\s*)?/, '').replace(/\*\*|__/g, '').trim();
        const m = line.match(/^(ELLIE|LUCK)\s*[:\-]\s*(.*)$/i);
        if (!m) { kept.push(raw); continue; }
        const val = m[2].trim().replace(/^["']|["']$/g, '');
        if (m[1].toUpperCase() === 'ELLIE') ellie = val;
        else luck = LUCK_READ.find(([re]) => re.test(val))?.[1];
    }
    const story = parseStory(kept.join('\n'));
    if (!story) return null;
    delete story.muse;
    if (story.title === 'Untitled Goo') story.title = 'An Unnamed Fortune';
    // Sonnet 5 sometimes runs long; cut at the last sentence end inside 320 characters instead of mid-word.
    if (ellie) story.ellie = ellie.length <= 320 ? ellie : (ellie.slice(0, 320).match(/^[\s\S]*[.!?…](?=\s|$)/)?.[0] || ellie.slice(0, 320));
    if (Number.isInteger(luck)) story.luck = luck;
    if (sheet) story.sheet = sheet.slice(0, 8000);
    return story;
}

/**
 * Added to the injected chapter text when the player let the planner act for them, so the roleplay
 * writer knows a chapter that says what {{user}} does is the player's own wish, not a slip.
 */
export const ACTS_FOR_USER_NOTE = 'The player chose to let this storyline decide some of {{user}}\'s actions. Where the chapter says what {{user}} does, that is their wish: you may write it.';
