// COPY of Weyland-MuseStoryMachine/storyCore.js (2026-11-18). Muse's Story Machine is not released, and Lucky
// wants Foxfire to ship without it (no Muse tile, no store page), so Foxfire carries its own copy instead of
// importing Muse's. Below this note it is byte-identical to Muse's file on that date; test/storyCoreCopy.test.mjs
// checks that while both folders exist. Change BOTH files together, or the story shape drifts between the apps.
//
// Muse's Story Machine: the pure part (no SillyTavern imports), so it can be unit-tested in Node.
// Builds the generation request, parses what the model sends back, builds the text that is
// injected into the roleplay, and reads the chapter flag out of a reply header.
//
// Story shape:
//   { title, premise, muse, finale, chapters: [chapter...], fork?: { choice, routes: { A: route, B: route } } }
//   chapter = { name, scene, ends } (+ goal / beats on storylines made before 2026-11-14)
//   route   = { label, chapters: [chapter...], finale }
// With a fork, `chapters` is the shared trunk and the fork comes right after its last chapter.
// Chapter numbers run on through the routes: trunk 1-2, then 3A/3B, 4A/4B...

export const FLAVORS = [
    'Slow Burn', 'Heartbreak', 'Betrayal', 'Spicy', 'Horror', 'Mystery', 'Comedy',
    'Adventure', 'Rivals', 'Found Family', 'Revenge', 'Forbidden', 'Cozy',
];

const SPICE = ['none, fade to black if it comes up', 'flirty, some heat', 'steamy, sex on the page when it fits', 'filthy, explicit and unapologetic'];
const DARK = ['light and warm', 'some real stakes', 'dark, people get hurt', 'brutal, nothing is safe'];
const PACE = {
    slow: 'slow burn: each chapter should take a LONG time to play out',
    steady: 'steady: chapters take a good while, nothing is rushed',
    brisk: 'brisk: things move, but beats still need room to land',
};
export const ROUTES = ['A', 'B'];

export function clampChapters(n) {
    const v = Math.round(Number(n));
    return Number.isFinite(v) ? Math.min(7, Math.max(3, v)) : 4;
}

// ---------- story helpers (shared with index.js and the app) ----------

/** True when the story has a usable fork (both routes have chapters). */
export function hasFork(story) {
    return !!(story?.fork?.routes?.A?.chapters?.length && story.fork.routes.B?.chapters?.length && story.chapters?.length);
}

/** The chapter the fork's choice is made in (the last trunk chapter), or 0 without a fork. */
export function forkChapter(story) {
    return hasFork(story) ? story.chapters.length : 0;
}

export function otherRoute(route) { return route === 'A' ? 'B' : 'A'; }

/** How many chapters a path has. Before the fork is decided, route A's length stands in. */
export function totalFor(story, route) {
    if (!story?.chapters?.length) return 0;
    if (!hasFork(story)) return story.chapters.length;
    return story.chapters.length + story.fork.routes[route === 'B' ? 'B' : 'A'].chapters.length;
}

/** The chapter object at 1-based `n` on `route` (route is ignored on the trunk). */
export function chapterAt(story, n, route) {
    const trunk = story?.chapters || [];
    if (n <= trunk.length) return trunk[n - 1] || null;
    if (!hasFork(story) || !route) return null;
    return story.fork.routes[route]?.chapters[n - trunk.length - 1] || null;
}

/** "3" on the trunk, "4B" on a route. */
export function chapterLabel(story, n, route) {
    return n > forkChapter(story) && forkChapter(story) && route ? `${n}${route}` : String(n);
}

// ---------- other cast members (subbots) ----------

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Which cast members does the player's idea (or the scene) name? Uses the Weyland World Info book's
 * subbot entries (content exactly "{{getvar::XX}}", keyed on the character's names), so the planner
 * learns about the same people the roleplay itself would pull in, by the same names.
 * Matching is whole-word and case-sensitive ("Summer" the girl, not "this summer"). Keys starting
 * with "!" are summon commands and skipped. Names in the idea come first, then names in the scene.
 * Added 2026-11-14 (Lucky: "essential"): the planner only knew the main card, so a storyline built on
 * a side character had to invent who they are.
 * @param {object[]} entries World Info entries
 * @param {string[]} texts texts to search, most important first
 * @returns {{name:string, varName:string}[]}
 */
export function findNamedCast(entries, texts, { exclude = '', max = 4 } = {}) {
    const ex = String(exclude || '').trim().toLowerCase();
    const cast = [];
    for (const e of entries || []) {
        if (e?.disable) continue;
        const v = String(e?.content || '').trim().match(/^\{\{getvar::([^}]+)\}\}$/);
        const all = (e?.key || []).map(k => String(k).trim()).filter(Boolean);
        const keys = all.filter(k => !k.startsWith('!'));
        // Character subbots carry a "!Name" summon key; "Roommates", rooms and places use the same
        // {{getvar::X}} shape without one (live 2026-11-14: "roommate" in Loona's greeting pulled them in).
        if (!v || !keys.length || !all.some(k => k.startsWith('!'))) continue;
        // The first plain key is the name; comments can be "[REDACTED]" (Vortex) or describe the entry.
        const name = keys[0];
        if (ex && (name.toLowerCase() === ex || keys.some(k => k.toLowerCase() === ex))) continue;
        cast.push({ name, varName: v[1], res: keys.map(k => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(k)}(?![\\p{L}\\p{N}])`, 'u')) });
    }
    const found = new Map();
    texts.forEach((text, rank) => {
        const t = String(text || '');
        for (const c of cast) {
            if (found.has(c.varName)) continue;
            const pos = Math.min(...c.res.map(re => { const m = re.exec(t); return m ? m.index : Infinity; }));
            if (pos !== Infinity) found.set(c.varName, { name: c.name, varName: c.varName, rank, pos });
        }
    });
    return [...found.values()].sort((a, b) => a.rank - b.rank || a.pos - b.pos).slice(0, max)
        .map(({ name, varName }) => ({ name, varName }));
}

/**
 * Which places does the idea (or where the scene currently is) name? Location entries in the Weyland
 * book say "Potential Location" / "[Location]" near the top, or sit in the "Dorm" group. Keys work like
 * World Info's: plain keys whole-word and case-insensitive, "/regex/flags" keys as regexes. Because place
 * keys are often everyday words ("party", "ramen", "dorm"), callers pass only the idea and the current
 * reply's header, never the whole chat. Suppressed lore ("DO NOT MENTION") is never handed to the
 * planner, since whatever it reads can end up in the storyline the roleplay sees.
 * Entries limited to other characters by NAME are skipped; tag filters can't be checked here, so an
 * include-by-tag entry is skipped and an exclude-by-tag one is allowed.
 * Added 2026-11-14 (Lucky: "same with locations").
 * @returns {{name:string, content:string}[]}
 */
// Place entries (by comment) whose text has no "Potential Location" marker. Checked against Weyland.json 2026-11-14.
const UNMARKED_PLACES = new Set(['Sterling Hall Dormitory', 'Moonvale', 'Weyland City']);

export function findNamedPlaces(entries, texts, { charName = '', max = 3 } = {}) {
    const me = String(charName || '').trim().toLowerCase();
    const places = [];
    for (const e of entries || []) {
        const content = String(e?.content || '');
        if (e?.disable || e?.constant || !content.trim()) continue;
        const isPlace = e.group === 'Dorm' || UNMARKED_PLACES.has(String(e.comment || '').trim())
            || /potential location|\[location\]|^\s*location:/i.test(content.slice(0, 300));
        if (!isPlace || /DO NOT MENTION|SUPPRESSED/i.test(content)) continue;
        const f = e.characterFilter || {};
        const names = (f.names || []).map(n => String(n).toLowerCase());
        if (names.length && (f.isExclude ? names.includes(me) : !names.includes(me))) continue;
        if (!f.isExclude && !names.length && (f.tags || []).length) continue;
        const res = [];
        for (const raw of e.key || []) {
            const k = String(raw).trim();
            if (!k) continue;
            const rx = k.match(/^\/(.+)\/([a-z]*)$/i);
            try { res.push(rx ? new RegExp(rx[1], rx[2].replace(/[gy]/g, '')) : new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(k)}(?![\\p{L}\\p{N}])`, 'iu')); } catch { /* a broken key never matches */ }
        }
        if (res.length) places.push({ name: String(e.comment || e.key?.[0] || 'Place').trim(), content: content.trim(), res });
    }
    const found = new Map();
    texts.forEach((text, rank) => {
        const t = String(text || '');
        for (const p of places) {
            if (found.has(p.content)) continue;
            const pos = Math.min(...p.res.map(re => { const m = re.exec(t); return m ? m.index : Infinity; }));
            if (pos !== Infinity) found.set(p.content, { name: p.name, content: p.content, rank, pos });
        }
    });
    return [...found.values()].sort((a, b) => a.rank - b.rank || a.pos - b.pos).slice(0, max)
        .map(({ name, content }) => ({ name, content }));
}

// ---------- generation request ----------

/**
 * The messages for the outline request. The format is strict tagged lines (not JSON) because
 * models break JSON on quotes inside dialogue, and tagged lines survive bold markers and numbering.
 */
export function buildGenerationMessages({
    charName = '', userName = '', cardText = '', recentChat = '', castText = '', placesText = '',
    idea = '', flavors = [], spice = 1, darkness = 1, chapters = 4, pace = 'steady', fork = false,
} = {}) {
    const n = clampChapters(chapters);
    const player = userName || 'the player';
    const Player = userName || 'The player';
    const system = [
        'You design storylines for long-form roleplay on Weyland Tavern, an adults-only fiction platform. Every character is an adult. Dark, violent and explicit themes are allowed whenever the player asks for them; do not soften what they asked for.',
        'You write the PLAN of a story, not the story itself. The plan will be handed to the roleplay writer one chapter at a time, so every chapter must make sense on its own and leave room for the player to act.',
        'Rules for the plan:',
        `- The player character is ${userName || '{{user}}'}. NEVER decide what they say, do, feel or choose. Scenes are things that happen AROUND them, or that the other characters do. The player reacts.`,
        // Live test 2026-11-12 (Gemini 3.8 Flash, 2 of 2 rolls): with only the line above, beats still read
        // "Lucky cuts a finger", "Lucky has to maneuver the phone", "while Lucky uses the bathroom".
        `- ${Player} is NEVER the subject of a SCENE or an ENDS WHEN. Bad: "${Player} cuts a finger." Good: "A cover slip shatters and blood beads on ${player}'s finger." Bad: "while ${player} steps away". Good: "the moment ${player}'s back is turned".`,
        // Live 2026-11-14 (Lucky's screenshot, Chaska storyline): the rule above held for subjects, but beats
        // still scripted him as SET-UP: "Lucky's holding her and asks if she's okay", "he asks how class went...
        // he smiles and says he missed her". The roleplay then plays his part for him.
        `- That includes set-up and background: never write what ${player} says, asks, feels, notices or does, not even in passing ("${userName || 'he'} asks how class went", "${userName || 'he'} smiles", "while ${userName || 'he'}'s holding her"). Describe the situation the character walks into and what THEY do and feel. Good: "She gets home an hour late, and it's ${player} waiting on the couch." Bad: "She gets home late; ${userName || 'he'} asks how class went and says he missed her."`,
        // Lucky, 2026-11-14: what the player wrote in their own idea is theirs to keep. "She comes home and I catch
        // her" -> "Lucky confronts her" is fine. Inventing new specifics or dialogue on top of it is not.
        `- The ONE exception: an action ${player} wrote into their own idea below is theirs, and the plan may use it as written (idea "she comes home and I catch her" -> "${userName || 'He'} catches her as she walks in" is fine). Never add anything to it: no new actions, details, words or reactions for ${player} beyond what they wrote.`,
        '- Characters stay exactly who their card says they are. The plan changes their situation, never their personality.',
        // Lucky, 2026-11-14: step-by-step beats ("first she..., then she..., then...") made the character
        // ignore the player ("I'm supposed to do these in order"). One line of direction, the character
        // decides how. His good example: "Chapter 1 - Enthusiastic oral: Loona gives Lucky enthusiastic oral,
        // happy that he got home from class." Open-ended in HOW, clear in WHAT.
        '- A SCENE is direction, not a script: one or two sentences saying what is going on and what the characters want or feel, in broad strokes. It may name at most ONE specific detail (a place, an object, a mood). NEVER a sequence of steps, never "first... then... then...", never a list of actions. How the character goes about it is up to them and to how the player reacts, so the player can redirect the scene and the character can follow.',
        `  Good: "Bastet hides from her PR team in ${player}'s dorm, acting like all of it is beneath her while she secretly loves it." Bad: "Bastet sits on the bed. She complains about the candles. Then she asks for snacks. Then she falls asleep."`,
        '- A chapter lasts many messages of roleplay. Each one ends on a clear, visible event (ENDS WHEN), something that HAPPENS on the page, so the writer can tell the chapter is over.',
        fork ? '- This story FORKS. One chapter ends on a real choice that belongs to the player, and the story splits into two routes depending on what they decide. The plan never makes that choice: the FORK line asks it, ROUTE A and ROUTE B play out each answer. Both routes are full, worthwhile stories, neither is the "wrong" answer.' : '',
        // Live 2026-11-14 (Sonnet 5): route A opened "Lucky agrees to try again but sets boundaries", route B
        // "Lucky tells Loona they can't do this again", and the label was "Yes, but carefully": the choice was
        // the player's, the boundaries, words and caution were invented for them.
        fork ? `- Each route begins right AFTER ${player} has answered. Never narrate the answer itself, and never add terms, conditions, reasons or words to it. Bad: "${Player} agrees to try again but sets boundaries." Good: "Back together, Loona overcorrects, trying too hard at everything." ROUTE labels are the bare answer ("Yes" / "No, it's over"), nothing added.` : '',
        fork ? `- Players change their minds. Someone who says no can say yes three chapters later and cross over to the other route at the same chapter number. So write each route chapter so it still works for someone arriving late from the other route.` : '',
        '- Plain words. No purple prose, no "tapestry", no "a testament to".',
    ].filter(Boolean).join('\n');

    const chapterShape = [
        'CHAPTER: <chapter name>',
        'SCENE: <one or two sentences of direction, at most one specific detail, no steps>',
        'ENDS WHEN: <the visible event that closes the chapter>',
    ];
    const format = fork
        ? [
            ...chapterShape,
            '(repeat CHAPTER / SCENE / ENDS WHEN for the shared chapters before the fork. The last of them ENDS WHEN the choice is put in front of the player.)',
            `FORK: <the choice, as a question about what ${player} does, e.g. "Does ${userName || 'the player'} take her back?">`,
            'ROUTE A: <a few words, the first answer>',
            ...chapterShape,
            '(repeat for every route A chapter)',
            'FINALE: <how route A can end, with room for the player to change it>',
            'ROUTE B: <a few words, the other answer>',
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
        castText ? `[OTHER CHARACTERS NAMED IN THE IDEA OR THE SCENE]\nThis is who they are. They stay exactly in character too. Use them as the story needs, and don't drag in ones it doesn't.\n${String(castText).trim()}\n` : '',
        placesText ? `[PLACES NAMED IN THE IDEA OR WHERE THE SCENE IS]\nThis is what these places are like. Use what fits the story.\n${String(placesText).trim()}\n` : '',
        recentChat ? `[WHERE THE ROLEPLAY IS RIGHT NOW]\n${String(recentChat).trim()}\n` : '[THE ROLEPLAY HAS NOT STARTED YET]\n',
        '[WHAT THE PLAYER WANTS]',
        String(idea || '').trim() || '(no idea given: surprise them, something that fits this character perfectly)',
        flavors.length ? `Flavors: ${flavors.join(', ')}` : '',
        `Spice: ${SPICE[spice] ?? SPICE[1]}`,
        `Darkness: ${DARK[darkness] ?? DARK[1]}`,
        `Pacing: ${PACE[pace] ?? PACE.steady}`,
        fork
            // Live 2026-11-14: asked for 4, Sonnet 5 wrote 2 shared + 1 per route.
            ? `Chapters: every path through the story is exactly ${n} chapters long (the shared chapters plus ONE route). Put the fork after any chapter from 1 to ${n - 1}, wherever the story's real decision is. Count it: with the fork after chapter 2, that is 2 shared chapters, then ${n - 2} in route A and ${n - 2} in route B.`
            : `Chapters: exactly ${n}`,
        '',
        '[ANSWER IN EXACTLY THIS FORMAT, nothing before or after]',
        'TITLE: <short, catchy>',
        'PREMISE: <two or three sentences, what this story is about>',
        `MUSE: <one line from Muse, a flirty, bubbly slime girl who lives in the story machine, reacting to this story. Talks to ${player} as "cutie" or "researcher-mine">`,
        ...format,
    ].filter(x => x !== '').join('\n');

    return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// ---------- parsing ----------

// "**TITLE:**", "## Title:", "1. CHAPTER:" all normalise to a plain tag line.
function cleanLine(line) {
    return String(line)
        .replace(/^\s*(?:#{1,6}\s*)?/, '')
        .replace(/\*\*|__/g, '')
        .trim();
}

const TAG = /^(TITLE|PREMISE|MUSE|CHAPTER(?:\s+\d+\s*[AB]?)?|SCENE|GOAL|BEATS|ENDS WHEN|ENDS|FINALE|FORK|ROUTE\s*[AB12])\s*[:\-]\s*(.*)$/i;
const unquote = s => s.replace(/^["']|["']$/g, '');

/**
 * Parse the tagged outline. Returns null when nothing usable came back (no chapters).
 * A fork whose two routes didn't both come back is folded into a straight story.
 */
export function parseStory(text) {
    const out = { title: '', premise: '', muse: '', finale: '', chapters: [] };
    let fork = null;
    let route = null; // the route object chapters currently go into
    let cur = null;
    let field = '';
    for (const raw of String(text || '').split(/\r?\n/)) {
        // Markdown dividers between sections (Sonnet 5, live 2026-11-14) are not text: they were glued onto
        // the field above as " ---".
        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) continue;
        const line = cleanLine(raw);
        if (!line) continue;
        // "1. CHAPTER: x" is a tag; "1. The power dies" is a numbered beat (handled as a bullet below).
        const m = line.replace(/^\d+[.)]\s+/, '').match(TAG);
        if (m) {
            const tag = m[1].toUpperCase().replace(/\s+\d+\s*[AB]?$/, '');
            const val = m[2].trim();
            if (tag === 'CHAPTER') {
                // "CHAPTER: 1. Lab Partner Roulette" and "CHAPTER: Chapter 1: The Morning After" (both seen live) -> bare name
                cur = { name: unquote(val.replace(/^(?:chapter\s*)?\d+\s*[AB]?\s*[.):-]\s*/i, '')), scene: '', ends: '', beats: [] };
                (route ? route.chapters : out.chapters).push(cur);
                field = 'name';
            } else if (tag.startsWith('ROUTE')) {
                // Read the letter from the raw tag: `tag` has had "ROUTE 2"'s number stripped like a chapter's.
                const key = /[B2]$/i.test(m[1].trim()) ? 'B' : 'A';
                fork ||= { choice: '', routes: {} };
                route = fork.routes[key] = { label: unquote(val), chapters: [], finale: '' };
                cur = null;
                field = 'label';
            } else if (tag === 'FORK') { fork ||= { choice: '', routes: {} }; fork.choice = unquote(val); field = 'fork'; cur = null; }
            else if (tag === 'BEATS') {
                field = 'beats';
                if (cur && val) cur.beats.push(val.replace(/^[-*•]\s*/, ''));
            } else if (tag === 'SCENE' && cur) { cur.scene = val; field = 'scene'; }
            else if (tag === 'GOAL' && cur) { cur.goal = val; field = 'goal'; }
            else if ((tag === 'ENDS WHEN' || tag === 'ENDS') && cur) { cur.ends = val.replace(/^WHEN\s*:?\s*/i, ''); field = 'ends'; }
            else if (tag === 'TITLE') { out.title = unquote(val); field = 'title'; }
            else if (tag === 'PREMISE') { out.premise = val; field = 'premise'; }
            else if (tag === 'MUSE') { out.muse = unquote(val); field = 'muse'; }
            else if (tag === 'FINALE') {
                if (route) route.finale = val; else out.finale = val;
                field = 'finale'; cur = null;
            }
            continue;
        }
        const bullet = line.match(/^(?:[-*•]|\d+[.)])\s*(.+)$/);
        if (bullet && cur && ['beats', 'goal', 'name', 'scene'].includes(field)) {
            cur.beats.push(bullet[1].trim());
            field = 'beats';
            continue;
        }
        // A wrapped continuation line belongs to whatever field came last.
        if (field === 'beats' && cur && cur.beats.length) cur.beats[cur.beats.length - 1] += ' ' + line;
        else if (field === 'scene' && cur) cur.scene += ' ' + line;
        else if (field === 'goal' && cur) cur.goal += ' ' + line;
        else if (field === 'ends' && cur) cur.ends += ' ' + line;
        else if (field === 'premise') out.premise += ' ' + line;
        else if (field === 'finale') { if (route) route.finale += ' ' + line; else out.finale += ' ' + line; }
        else if (field === 'muse') out.muse += ' ' + line;
        else if (field === 'fork' && fork) fork.choice += ' ' + line;
        else if (field === 'label' && route) route.label += ' ' + line;
    }
    const tidy = list => {
        const kept = list.filter(c => c.name || c.scene || c.beats.length);
        for (const c of kept) if (!c.beats.length) delete c.beats;
        return kept;
    };
    out.chapters = tidy(out.chapters);
    if (fork) {
        for (const r of Object.values(fork.routes)) r.chapters = tidy(r.chapters);
        const { A, B } = fork.routes;
        if (A?.chapters.length && B?.chapters.length && out.chapters.length) {
            out.fork = { choice: fork.choice.trim(), routes: { A, B } };
        } else {
            // Half a fork: play whichever route came back as a straight story.
            const only = A?.chapters.length ? A : B?.chapters.length ? B : null;
            if (only) { out.chapters.push(...only.chapters); if (only.finale) out.finale = only.finale; }
        }
    }
    if (!out.chapters.length) return null;
    out.chapters.forEach((c, i) => { if (!c.name) c.name = `Chapter ${i + 1}`; });
    if (out.fork) for (const r of ROUTES) out.fork.routes[r].chapters.forEach((c, i) => { if (!c.name) c.name = `Chapter ${out.chapters.length + i + 1}${r}`; });
    if (!out.title) out.title = 'Untitled Goo';
    return out;
}

// ---------- the injected text ----------

function chapterBody(ch) {
    const out = [];
    if (ch.scene) out.push(`What this chapter is about: ${ch.scene}`);
    if (ch.goal) out.push(`This chapter is for: ${ch.goal}`);
    // Lucky, 2026-11-14: a scripted order makes the character ignore the player.
    out.push('That is direction, not a script. How {{char}} goes about it is up to {{char}}, and to {{user}}. If {{user}} redirects the scene (asks for something different, takes it somewhere else), go with them and keep the chapter\'s spirit. There is no order of steps to protect.');
    if (ch.beats?.length) {
        out.push('Moments that could happen (optional, any order, skip or reshape any of them):');
        out.push(...ch.beats.map(b => `- ${b}`));
    }
    out.push('This chapter should take MANY responses. Draw it out until its ending comes naturally.');
    if (ch.ends) out.push(`This chapter ends when: ${ch.ends}`);
    return out;
}

/**
 * The text injected into the roleplay. Shaped after Yue-Lin's "Damaged Start" script (the wording
 * that is known to keep models from rushing and from playing the user) and the Muse Experiment's
 * header codes. Only the CURRENT chapter is sent in full: a model that sees every chapter races to the end.
 * @param {object} story parsed story
 * @param {number} chapter 1-based current chapter
 * @param {'A'|'B'|null} route the route taken, once past the fork
 */
export function buildInjection(story, chapter, route = null) {
    if (!story?.chapters?.length) return '';
    const forkAt = forkChapter(story);
    const r = forkAt && chapter > forkAt ? (route === 'B' ? 'B' : 'A') : null;
    const total = totalFor(story, r);
    const n = Math.min(Math.max(1, chapter | 0), total);
    const ch = chapterAt(story, n, r);
    const label = chapterLabel(story, n, r);
    const last = n === total && (!forkAt || r);
    const atFork = forkAt && n === forkAt;
    const fork = story.fork;
    const finale = r ? fork.routes[r].finale : story.finale;

    let later = [];
    if (r) later = fork.routes[r].chapters.slice(n - forkAt).map((c, i) => `- Chapter ${n + 1 + i}${r}: ${c.name}`);
    else {
        later = story.chapters.slice(n).map((c, i) => `- Chapter ${n + 1 + i}: ${c.name}`);
        if (forkAt) later.push('- Then a choice that belongs to {{user}}. Never hint at it or steer them toward any answer.');
    }

    const flagLines = [];
    flagLines.push(`README! Silently end the header of every response with (Ch ${label}), e.g. "¦¦ ... ~ Location ~ (Ch ${label})¦¦". This is your flag for where the story is.`);
    // Live test 2026-11-12 (Gemini 3.8 Flash): with chapter 2 injected, a reroll still copied "(Ch 1)" from the headers above it.
    if (n > 1) flagLines.push(`Earlier messages show older flags. Those chapters are OVER. Do not copy their flag: from now on it is (Ch ${label}).`);
    if (atFork) {
        const { A, B } = fork.routes;
        flagLines.push(
            `This chapter builds to a choice that belongs to {{user}} alone: ${fork.choice || 'what they do next'} Put it in front of them and never answer it for them or push them toward either side.`,
            `Once {{user}} has clearly made that choice on the page, use (Ch ${n + 1}A) from the next response on if they chose: ${A.label}. Use (Ch ${n + 1}B) if they chose: ${B.label}. Until they have chosen, keep (Ch ${n}).`,
        );
    } else if (last) {
        flagLines.push(`This is the LAST chapter. Once its ending has fully HAPPENED on the page (not planned, not hinted, happened), use (Fin) instead of (Ch ${label}) from the next response on.`);
    } else {
        flagLines.push(`Once this chapter's ending has fully HAPPENED on the page (not planned, not hinted, happened), use (Ch ${chapterLabel(story, n + 1, r)}) from the next response on. Never skip a number.`);
    }
    if (r) {
        const o = otherRoute(r);
        if (chapterAt(story, n, o)) {
            flagLines.push(`{{user}} can still change their mind. If they ever clearly reverse their choice (${fork.routes[o].label}), the story crosses to the other road: use (Ch ${n}${o}) from the next response on. Only for a real change of heart, never for a passing moment, and never steer them toward it.`);
        }
    }

    const lines = [
        `[READ FIRST: ROLEPLAY CONTEXT - CUSTOM STORYLINE - "${story.title}"]`,
        '- {{user}} built this storyline for this roleplay and wants it followed. It supersedes the card\'s default scenario where the two conflict, but never the characters: everyone stays exactly who their card says they are.',
        story.premise ? `- The story: ${story.premise}` : '',
        r ? `- The story forked on: ${fork.choice} {{user}} chose: ${fork.routes[r].label}. This is that road.` : '',
        '',
        'There is a set story to play out here, which is why I need your cooperation. If {{user}} appears hellbent on breaking this story, allow them to. The story waits for them, it never drags them.',
        '',
        'PACE YOURSELF, PLEASE. Multiple or MANY responses should happen inside each chapter, it should feel organic and earned. If {{user}} says "Oh, I guess this must be scripted then", we have *failed*.',
        '',
        'SUPER IMPORTANT - DO NOT ACT AS {{user}}. They are the participant! When something happens to them, stop and let them react to it. Taking their turn robs them of the chance to be IN THE STORY.',
        '',
        '*NOTE* Be very careful around NPC omniscience! Characters only know what they were told or saw themselves.',
        '',
        `WHERE WE ARE: Chapter ${label} of ${total} - "${ch.name}"`,
        ...chapterBody(ch),
        '',
        ...flagLines,
        '',
        later.length ? 'Still to come (NEVER reveal or rush these, foreshadow at most):' : '',
        ...later,
        last && finale ? `Where it can end: ${finale}` : '',
        '',
        `[END ROLEPLAY CONTEXT - CUSTOM STORYLINE - "${story.title}"]`,
    ];
    return lines.filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0)).join('\n').trim();
}

// ---------- reading the flag and moving the story ----------

/**
 * Reads the chapter flag from the start of a reply (the header): {n, route} (route is 'A', 'B' or
 * null), 'fin', or null. Only the first 400 characters are read so a "(Ch 3)" quoted later in prose
 * can't move the story.
 */
export function readChapterFlag(text) {
    // Read the "¦¦ ... ¦¦" header when there is one, wherever it sits. Live 2026-11-14 (Sonnet 5): a reply
    // opened with 1.3k characters of visible "# Plan" prose that MENTIONED "(Ch 3B)" before the real header;
    // reading the first 400 characters would also have obeyed "I shouldn't use (Ch 4A) yet".
    const s = String(text || '');
    const header = s.slice(0, 6000).match(/¦¦[^\n]*?¦¦/);
    const head = header ? header[0] : s.slice(0, 400);
    if (/\(\s*fin\s*\)/i.test(head)) return 'fin';
    const m = head.match(/\(\s*ch(?:apter)?\.?\s*(\d{1,2})\s*([ab])?\s*\)/i);
    return m ? { n: Number(m[1]), route: m[2] ? m[2].toUpperCase() : null } : null;
}

/**
 * Decide the new state after a character reply at message index `index`.
 * - (Ch N+1) advances one chapter, (Fin) on the last chapter finishes it.
 * - At the fork the flag must name a route ((Ch 4A) / (Ch 4B)); after it, a missing letter means
 *   "same route", and the same chapter with the other letter crosses over (a change of heart).
 * - A move STICKS through rerolls. The flag is written by the reply AFTER the one where the ending
 *   happened, so rerolling the flag-writing reply doesn't un-happen the ending. (Live test 2026-11-12: a
 *   reroll copied the old "(Ch 1)" from earlier headers and the first version of this stepped the story
 *   back, wrongly.) A reroll of the reply that made the last move can't move the story again either:
 *   it would copy the old route letter and cross straight back. Only deleting messages back past the
 *   move undoes it: see afterDelete().
 * Never moves more than one step per reply, so a model writing (Ch 5) on chapter 2 can't skip ahead.
 * @param {{chapter:number, route?:string|null, done?:boolean, advance?:object|null}} state
 * @returns {{chapter:number, route:string|null, done:boolean, advance:object|null, changed:boolean}}
 */
export function nextChapterState(state, flag, index, story) {
    const chapter = state.chapter || 1;
    const route = state.route || null;
    const done = !!state.done;
    const keep = { chapter, route, done, advance: state.advance || null, changed: false };
    if (done || !flag || state.advance?.index === index) return keep;
    const forkAt = forkChapter(story);
    const record = { index, from: chapter, fromRoute: route };
    if (flag === 'fin') {
        const onEnd = chapter === totalFor(story, route) && (!forkAt || route);
        return onEnd ? { chapter, route, done: true, advance: record, changed: true } : keep;
    }
    const { n } = flag;
    if (n === chapter + 1) {
        let r = null;
        if (forkAt && chapter === forkAt) { r = flag.route; if (!r) return keep; }
        else if (forkAt && chapter > forkAt) r = flag.route || route;
        if (n > totalFor(story, r)) return keep;
        return { chapter: n, route: r, done, advance: record, changed: true };
    }
    if (n === chapter && forkAt && chapter > forkAt && flag.route && flag.route !== route && chapterAt(story, n, flag.route)) {
        return { chapter, route: flag.route, done, advance: record, changed: true };
    }
    return keep;
}

/**
 * After messages are deleted: if the reply that moved the story is gone, go back one step.
 * @returns {object|null} the new state, or null when nothing changes
 */
export function afterDelete(state, chatLength) {
    const adv = state?.advance;
    if (!adv || chatLength > adv.index) return null;
    return { ...state, chapter: adv.from, route: adv.fromRoute ?? null, done: false, advance: null };
}
