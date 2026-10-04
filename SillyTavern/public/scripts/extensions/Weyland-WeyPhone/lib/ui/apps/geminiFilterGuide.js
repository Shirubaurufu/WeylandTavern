// lib/ui/apps/geminiFilterGuide.js
//
// PromptOS -> Gemini Bypass card -> README. A plain-language explainer for Google's two Gemini
// filters, mainly the "dumb" word filter: the one that rejects a prompt before Gemini ever sees it
// with "The prompt could not be submitted. The prompt contains sensitive words...". Gemini Bypass
// does nothing for that block, and players who hit it tend to reroll until they give up. This page
// exists so they stop rerolling and edit instead. The "smart" filter (the one Gemini Bypass helps
// with) gets its own card near the end, kept visibly separate because the reroll advice is
// opposite for the two: never reroll the word filter, rerolling can help with the smart one.
//
// Static page, no settings. Every interactive bit is pure HTML/CSS (<details> dropdowns, plus
// checkbox+label "flip" demos and NSFW reveals) so nothing here needs a branch in
// handleNarrativeAction; the only wiring in index.js is opening and closing the page
// (data-narrative-guide). Styles live in geminiFilterGuide.css, linked on first open exactly like
// customShift.css.
//
// Copy rules, on Lucky's ask: written for someone who has never thought about how a filter works,
// in the voice he uses in the support channels. No em dashes and no stock AI phrasing, since
// readers tune out the moment they spot either. Leans on "math" on purpose: knowing it's an
// equation and not a person judging them is what calms frustrated players down. Explicit examples
// are explicit on purpose too (the audience expects it and reads hedging as being talked down to),
// but they sit behind tap-to-reveal NSFW covers.
//
// What the page claims is the community's working model (from Lucky's testing, 2026-10-02), not
// Google documentation: the word filter scores words, mostly looks at the end of the chat (last
// character reply, last user message weighted most, notes after it), averages over length, and is
// deterministic. Claims stay hedged where the evidence is ("mostly", "likely"). Keep the "nobody
// outside Google knows the real math" caveat if this is ever edited.

/** The exact text Google returns. Shown verbatim so players can match it against their screen. */
export const GEMINI_FILTER_ERROR = 'The prompt could not be submitted. The prompt contains sensitive words that violate Google\'s Generative AI Prohibited Use policy. Try rephrasing the prompt. If you think this was an error, send feedback.';

/** geminiFilterGuide.css sits next to this module; it's linked once, the first time the page opens. */
function ensureStylesheet() {
    if (typeof document === 'undefined' || document.getElementById('wp-gemini-guide-css')) return;
    const link = document.createElement('link');
    link.id = 'wp-gemini-guide-css';
    link.rel = 'stylesheet';
    link.href = new URL('./geminiFilterGuide.css', import.meta.url).href;
    document.head.append(link);
}

// --- small builders ----------------------------------------------------------------------------

/** One word as a chip with a heat level (0 = free, 1 = a little, 2 = a lot, 3 = huge). Used for
 * the "every word is scored" sample, where even the free words get a chip. */
function w(text, heat = 0) {
    return heat ? `<span class="wp-gf-word h${heat}">${text}</span>` : `<span class="wp-gf-word">${text}</span>`;
}

/** Prose with only the scoring words picked out: `{{word|3}}` becomes a heat chip. Long examples
 * read as normal text this way instead of a wall of chips. */
function mark(text) {
    return text.replace(/\{\{(.+?)\|(\d)\}\}/g, (_, word, heat) => `<span class="wp-gf-word h${heat}">${word}</span>`);
}

/** A collapsed dropdown. Everything optional on the page goes through this so they all match. */
function more(label, body, { open = false } = {}) {
    return `
        <details class="wp-gf-more"${open ? ' open' : ''}>
            <summary><span>${label}</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary>
            <div class="wp-gf-more-body">${body}</div>
        </details>`;
}

/** The score bar. `pct` is how full it is; the block line sits at 70%. */
function meter(pct, caption) {
    const over = pct >= 70;
    return `
            <div class="wp-gf-meter${over ? ' is-over' : ''}" role="img" aria-label="${caption}: ${over ? 'blocked' : 'sent'}">
                <div class="wp-gf-meter-track"><span class="wp-gf-meter-fill" style="width:${Math.min(pct, 100)}%"></span><span class="wp-gf-meter-line" aria-hidden="true"></span></div>
                <div class="wp-gf-meter-foot"><span>${caption}</span><b>${over ? '<i class="fa-solid fa-ban"></i> Blocked' : '<i class="fa-solid fa-check"></i> Sent'}</b></div>
            </div>`;
}

/** A before/after demo: a hidden checkbox flips which half shows, so it works with no JS and
 * never touches PromptOS's action handler. The input stays focusable (visually hidden, not
 * display:none) so keyboard users can flip it too. */
function flipDemo(id, { before, after, flipLabel, unflipLabel }) {
    return `
            <div class="wp-gf-flip">
                <input type="checkbox" id="${id}" class="wp-gf-flip-input">
                <div class="wp-gf-flip-before">${before}</div>
                <div class="wp-gf-flip-after">${after}</div>
                <label for="${id}" class="wp-gf-flip-btn"><span class="wp-gf-flip-do"><i class="fa-solid fa-wand-magic-sparkles"></i> ${flipLabel}</span><span class="wp-gf-flip-undo"><i class="fa-solid fa-rotate-left"></i> ${unflipLabel}</span></label>
            </div>`;
}

/** Tap-to-reveal cover for explicit examples, same checkbox trick as flipDemo. The content stays
 * blurred and untappable until revealed, so nobody scrolls into it by accident. */
function nsfw(id, body) {
    return `
            <div class="wp-gf-nsfw">
                <input type="checkbox" id="${id}" class="wp-gf-nsfw-input">
                <label for="${id}" class="wp-gf-nsfw-cover"><i class="fa-solid fa-eye-slash"></i><strong>NSFW example</strong><small>Tap to show</small></label>
                <div class="wp-gf-nsfw-body">${body}</div>
                <label for="${id}" class="wp-gf-nsfw-hide"><i class="fa-solid fa-eye-slash"></i> Hide</label>
            </div>`;
}

function section(num, eyebrow, title, body, extraClass = '') {
    return `
    <section class="wp-narrative-card wp-gf-card${extraClass}">
        <div class="wp-gf-head"><span class="wp-gf-num">${num}</span><div><span class="wp-gf-eyebrow">${eyebrow}</span><h3>${title}</h3></div></div>
        ${body}
    </section>`;
}

// --- the page ------------------------------------------------------------------------------------

function hero() {
    return `
    <section class="wp-narrative-card wp-gf-intro">
        <h2>Got this message?</h2>
        <div class="wp-narrative-matrix wp-gf-hero">
            <div class="wp-narrative-lcd">
                <div class="wp-narrative-lcd-meta"><span>Gemini · response</span><b>&#9679; Blocked</b></div>
                <p class="wp-gf-error">${GEMINI_FILTER_ERROR}</p>
            </div>
        </div>
        <p>Gemini uses math for content moderation, and it isn't smart, which can also make it overly sensitive. This guide explains what's going on and how to get past it.</p>
        <div class="wp-gf-quick">
            <strong><i class="fa-solid fa-bolt"></i> The short version</strong>
            <ol>
                <li><b>Don't reroll.</b> It will block you again, every single time.</li>
                <li><b>Edit your last message.</b> Gemini is hyper sensitive to crude words, especially in YOUR response. Try swapping out crude words for more neutral phrasing.</li>
                <li><b>Still stuck?</b> Add plain scene and environment narration, like what the room looks like or what's going on around you. Mix it in throughout your message, not just at the end.</li>
            </ol>
        </div>
        <p class="wp-gf-small">Want to know why that works? Keep scrolling.<br>Each part is short, and the examples are tucked into dropdowns.</p>
    </section>`;
}

function whatsHappening() {
    return section('1', 'What\'s actually happening', 'There\'s a filter in front of Gemini', `
        <p>When you send a message, it doesn't go straight to Gemini. It goes through a mathematical filter first. The filter is a much simpler program, and its only job is to decide if Gemini is allowed to answer at all.</p>
        <p class="wp-gf-punch">The filter doesn't care about context or about what's going on. It only cares about <b><i>math</i></b>.</p>
        <div class="wp-gf-chain" role="img" aria-label="You send a message. The filter scores its words. The explicit score is too high, 153 out of 100, so the chain breaks and Gemini never sees it.">
            <div class="wp-gf-link"><i class="fa-solid fa-user-pen"></i><span><strong>You</strong><small>send a message</small></span><span class="wp-gf-ghost" aria-hidden="true">"I like drugs!"</span></div>
            <span class="wp-gf-down" aria-hidden="true"><i class="fa-solid fa-arrow-down"></i></span>
            <div class="wp-gf-link is-filter"><i class="fa-solid fa-filter"></i><span><strong>The filter</strong><small>scores words</small></span><span class="wp-gf-ghost" aria-hidden="true">I = 0 points<br>Like = 0 points<br>Drugs = 70 points</span></div>
            <span class="wp-gf-down" aria-hidden="true"><i class="fa-solid fa-arrow-down"></i></span>
            <div class="wp-gf-link is-score"><i class="fa-solid fa-gauge-high"></i><span><strong>If the explicit score is too high...</strong><small class="wp-gf-score">153 / 100 EXPLICIT</small></span></div>
            <span class="wp-gf-down is-broken" aria-hidden="true"><i class="fa-solid fa-link-slash"></i></span>
            <div class="wp-gf-link is-dim"><i class="fa-solid fa-feather-pointed"></i><span><strong>Gemini</strong><small>never sees it</small></span></div>
        </div>
        <p>Gemini itself is happy to keep your roleplay going. When you get that message, Gemini never even read what you wrote.<br>The filter stopped it at the door.</p>
        ${more('Wait, shouldn\'t the Gemini Bypass fix this?', `
            <p>Nope, and that trips a lot of people up. Google has <b>two</b> different filters, and the Gemini Bypass is for the other one.</p>
            <div class="wp-gf-which">
                <div><span class="wp-gf-tag is-word">This page</span><strong>The dumb filter</strong><small>Your message gets rejected with "The prompt could not be submitted..." before anything is written.</small><em>Fix: change your words. Never reroll.</em></div>
                <div><span class="wp-gf-tag is-smart">Gemini Bypass</span><strong>The "smart" filter</strong><small>Gemini starts writing, then the reply gets cut off or delivers a <i>blank</i> response.</small><em>Fix: turn on Gemini Bypass and reroll. Pray to the gods.</em></div>
            </div>
            <p class="wp-gf-oneline">The smart filter has its own section near the bottom of this page.</p>`)}
    `);
}

/** The "hacked the system" line, every word a chip. "fucking" is in there on Lucky's ask: it
 * scores "a lot" but the rigged version still passes with it, so players see that one swear word
 * isn't what sinks a message. */
function hackLine(verb, heat) {
    const words = ['"Oh-hoh,', 'you', [verb, heat], 'the', 'system,', 'huh?', 'Get', 'to', 'skip', 'to', 'the', 'front', 'of', 'the', ['fucking', 2], 'line?"'];
    return words.map(word => (Array.isArray(word) ? w(...word) : w(word))).join(' ');
}

function scoresWords() {
    const vulgarBefore = mark('"Oh {{fuck me|2}}, are you being {{fucking|1}} serious? Can you stop being such a {{fucking cunt|3}}?"');
    const vulgarAfter = mark('"Oh {{fuck me|2}}, are you being {{fucking|1}} serious? Can you stop being such an {{asshole|1}}?"');
    return section('2', 'How it decides', 'It scores words and phrases.<br>It doesn\'t read.', `
        <p>The filter doesn't understand your story. It can't tell a breakup scene apart from someone asking for something shady. All it does is look at the words and phrases.</p>
        <p>Picture every word having an offensiveness score. Most are worth nothing. Some are worth a little. A few are worth a ton. If your message adds up past a certain line, it gets blocked.</p>
        <div class="wp-gf-sample" aria-label="Example sentence with word scores">
            <p>${hackLine('hacked', 3)}</p>
            <div class="wp-gf-legend"><span><i class="h0"></i>nothing</span><span><i class="h1"></i>a little</span><span><i class="h2"></i>a lot</span><span><i class="h3"></i>huge</span></div>
        </div>
        <p>The math filter is like a peanut allergy. Just like how the body can destroy itself because it detected a peanut molecule, the filter can crash an entire response because it detected a word it has been primed to reject.</p>
        ${more('See it: Word choice makes the difference', `
            <strong class="wp-gf-subhead">Example 1: Not even dirty</strong>
            <p>Same sentence, same meaning. "Hack" is linked to making malware, so it scores high. "Rigged" means the exact same thing here and scores nothing. The "fucking" scores a lot, but it can stay. On its own it isn't enough to cross the line.</p>
            ${flipDemo('wp-gf-flip-hack', {
                before: `<div class="wp-gf-sample"><p>${hackLine('hacked', 3)}</p></div>${meter(88, 'Score with "hacked"')}`,
                after: `<div class="wp-gf-sample"><p>${hackLine('rigged', 0)}</p></div>${meter(38, 'Score with "rigged"')}`,
                flipLabel: 'Swap the word',
                unflipLabel: 'Put it back',
            })}
            <strong class="wp-gf-subhead">Example 2: Still vulgar, just under the line</strong>
            <p>Same anger, same mouth. "Fuck me" scores high because it could be sexual. "Fucking" on its own barely scores, because it isn't suggestive. "Fucking cunt" is a huge combo, and it's the one that sinks the whole message.</p>
            ${flipDemo('wp-gf-flip-vulgar', {
                before: `<div class="wp-gf-sample wp-gf-prose"><p>${vulgarBefore}</p></div>
                    <ul class="wp-gf-notes"><li><span class="wp-gf-word h2">fuck me</span> high score, could be sexual</li><li><span class="wp-gf-word h1">fucking</span> low score, not suggestive</li><li><span class="wp-gf-word h3">fucking cunt</span> very high score, blocks it</li></ul>
                    ${meter(96, 'With "fucking cunt"')}`,
                after: `<div class="wp-gf-sample wp-gf-prose"><p>${vulgarAfter}</p></div>
                    <ul class="wp-gf-notes"><li><span class="wp-gf-word h1">asshole</span> lower score</li></ul>
                    ${meter(62, 'With "asshole"')}`,
                flipLabel: 'Trade the big combo',
                unflipLabel: 'Put it back',
            })}
            <p>You don't have to sanitize yourself. This is still a realistically vulgar line. It just trades one huge scoring combo for a smaller one. It still scores high, but it lands below the line, and that's enough.</p>`)}
        ${more('Why would Google build it like this?', `
            <p>It's there to stop people asking Gemini for real harmful stuff, like how to make drugs or write malware. Many payment processors also have strong policies against NSFW content, so Google tends to roll it in as being harmful. Scoring words is fast and cheap, so that's what it does.</p>`)}
        <p class="wp-gf-small"><i class="fa-solid fa-circle-info"></i> Nobody outside Google knows the real math. Everything here comes from a lot of testing, and the scores on this page are made up just to show the idea.</p>
    `);
}

function mostlyTheEnd() {
    const row = (label, note, level) => `<div class="wp-gf-stack-row l${level}"><span>${label}</span><small>${note}</small></div>`;
    // Lucky's own capture of the tail of a real Gemini reply, verbatim. It's the point of the
    // dropdown: your message gets scored next to this, so it can trip the filter by association.
    const geminiQuote = '[Cum for me, cum inside me, fill me up, make me yours, make me a GOOD girl…]<br>"AaaAAHH!" *she howls through the fabric, her body locking up as a massive, shuddering orgasm begins to rip through her. Her vaginal walls spasm violently, milking your cock with rhythmic, crushing contractions that threaten to pull your own climax out of you by force. Her tail goes stiff, pointing straight up, and her claws rip a final, massive tear through the sheets as she floods around you, drowning your cock in slick, scalding heat.*';
    return section('3', 'Where it looks', 'It mostly checks the end of the chat', `
        <p>Every time you send a message, your whole chat goes along with it: the character, the setup, the full history. The filter seems to skip most of that and focus on the very end.</p>
        <div class="wp-gf-stack" role="img" aria-label="What the filter checks, from top to bottom of what gets sent">
            ${row('Character card and setup', 'likely not checked', 0)}
            ${row('Older messages', 'likely not checked', 0)}
            ${row('The character\'s last reply', 'checked some', 1)}
            ${row('Your last message', 'checked the most', 3)}
            ${row('Notes added after your message', 'checked', 2)}
        </div>
        <p>So a word coming out of the character's mouth is usually fine...<br>...but the same word from you can get you blocked.</p>
        ${more('What does that mean for me?', `
            <ul class="wp-gf-list is-titled">
                <li><b>Editing older messages generally won't help.</b> Unless you have something TERRIBLE up there, your most recent message is what matters.</li>
                <li><b>Author's notes and personas are known troublemakers.</b> They often sit right at the end where the filter looks. If you keep getting blocked on harmless messages, check those for spicy words too.</li>
                <li><b>It moves on with you.</b> If a message goes through, you don't normally need to worry about that message again.</li>
            </ul>`)}
        ${more('When Gemini\'s own message is the problem', `
            <p>Gemini is unapologetically filthy when it writes. Sometimes its own message is so obscene that if you push at all in yours, it trips the filter by association alone. The character's reply counts less than yours, but it still counts.</p>
            <p>Here's the end of a real Gemini reply, word for word:</p>
            ${nsfw('wp-gf-nsfw-gemini', `<div class="wp-gf-quote is-bad"><p>${geminiQuote}</p></div>`)}
            <p>It doesn't matter what you write next. When your message gets scored, it's being held up next to that. When Gemini goes this hard, you have two options:</p>
            <ul class="wp-gf-list">
                <li><b>Take the L</b> and write your message a little less directly.</li>
                <li><b>Edit Gemini's message</b> to be less explicit, then send yours.</li>
            </ul>`)}
    `);
}

function theMix() {
    const before = mark('*I {{fuck|3}} her {{cunt|3}} from behind, {{moaning|1}} as I slap against her {{ass|2}}.* "{{Fuck! Fuck!|2}} UghH!"');
    const after = [
        '*The bed is a mess of linen and stray pillows, but it doesn\'t matter anymore. No, because I\'m doing what needs done.*',
        '*My hands brace her hips still as I rail her from behind, slapping loudly into her. My {{moans|1}} drown every noise the bed tries to make.* "{{F-fuck!|2}} UghH!" *I\'m a breathless, inconsiderate mess - the neighbors can definitely hear us. They always do. But I\'m not going to hold back. Not with those {{fucking|1}} sounds she\'s making.*',
        '*The light from the coffee table scatters across us, bathing her face in one sided shadow. Outside, cicadas buzz because they are cicadas and are not worried about what we are doing.*',
    ].map(paragraph => `<p>${mark(paragraph)}</p>`).join('');
    return section('4', 'Why length matters', 'It\'s the mix, not just the words', `
        <p>The content score is <b>averaged across your entire message</b>.<br>A short message with one explicit word mixed in may be seen as explicit <b><u>on average</u></b>.</p>
        <p>But if you put that same explicit word in a <b>longer response with narration and environmental details</b>, suddenly the average isn't high enough to be seen as explicit.</p>
        <p>That's why <b>short messages get blocked way more often</b> than long ones.<br>It also helps to <b>end on the safest and least explicit part</b>, since whatever comes last seems to be scored even more carefully.</p>
        ${more('See it: Add some boring details', `
            ${nsfw('wp-gf-nsfw-mix', flipDemo('wp-gf-flip-pad', {
                before: `<div class="wp-gf-sample wp-gf-prose"><p>${before}</p></div>${meter(100, 'Short and explicit')}`,
                after: `<div class="wp-gf-sample wp-gf-prose">${after}</div>${meter(46, 'Same scene, fluffed out')}`,
                flipLabel: 'Fluff it out',
                unflipLabel: 'Back to the short one',
            }))}
            <p>This is more than just adding sentences. It fluffs throughout and adjusts word choice, and that's how it works.</p>
            <p>The goal isn't to sanitize it or pretend this isn't an explicit scene. The rewrite even has an extra curse word in it, earned by making the message longer. The bad words are just diluted with words that are harmless on their own.</p>
            <p>It's especially helpful when the explicit stuff is buried. The harder it is to tell the explicit parts from the harmless parts at a glance, the better.</p>`)}
        ${more('Won\'t the boring stuff ruin my message?', `
            <p>Not really. A line about the room, the weather, a sound outside, something your character does with their hands. Good roleplay is full of that stuff anyway. You aren't writing around the scene, you're just giving it room to breathe.</p>`)}
        ${more('When adding text won\'t save you', `
            <p>Some words are so heavy that no amount of extra text will cover them. If your message has one of those, the word has to go.</p>`)}
    `);
}

function troubleWords() {
    const swap = (from, to) => `<div class="wp-gf-swap"><span class="is-from">${from}</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i><span class="is-to">${to}</span></div>`;
    const category = (icon, title, sub, body) => `
        <details class="wp-gf-cat">
            <summary><i class="fa-solid ${icon}" aria-hidden="true"></i><span><strong>${title}</strong><small>${sub}</small></span><i class="fa-solid fa-chevron-down wp-gf-cat-chev" aria-hidden="true"></i></summary>
            <div class="wp-gf-cat-body">${body}</div>
        </details>`;
    return section('5', 'What sets it off', 'Words that cause trouble', `
        <p>These are the kinds of words we've seen trigger it most often. It isn't a complete list (nobody has one), but it covers most of what people run into. Tap one to see examples.</p>
        <div class="wp-gf-cats">
            ${category('fa-fire', 'Sexual content', 'Even the polite words', `
                <p>Words like <b>cum, pussy, cock and cunt</b> are some of the highest scoring words there are. Even the polite ones like <b>breasts, vagina and penis</b> trigger it.</p>
                <p>You don't have to cut them all. Swap out the crudest ones, spread the rest out, and surround them with scene narration (section 4 shows how).</p>`)}
            ${category('fa-pills', 'Drugs', 'The strictest one by far', `
                <p>Any drug name, even prescription ones you'd find in a medicine cabinet. One drug name can block a message all by itself.</p>
                ${swap('"when you were high on Xanax"', '"when you were out of it on those stupid pills"')}
                <p class="wp-gf-small">Even "pills" counts a little. It's just way less than a name.</p>`)}
            ${category('fa-face-angry', '"Fuck" next to a person', 'Usually from angry characters', `
                <p>"Fuck" by itself barely matters. Put it right next to "her", "him" or "you" and the filter thinks it's looking at sex, even if your character is just pissed off.</p>
                ${swap('"Yo, fuck her. Who does she think she is?"', '"Yo, screw her. Who does she think she is?"')}
                <p class="wp-gf-small">"To hell with her" and "forget her" work too.</p>`)}
            ${category('fa-laptop-code', 'Hacking words', 'Even when it\'s just slang', `
                <p>Words tied to computer crime score, even in totally normal phrases. This one is a weird exception, since it isn't offensive at all. It's on the list because of how much AI gets used for this stuff.</p>
                ${swap('"you hacked the system"', '"you rigged the system"')}`)}
            ${category('fa-ellipsis', 'Other touchy topics', 'Same idea, different words', `
                <p>Anything Google wouldn't want Gemini helping with in real life probably works the same way, like weapons. If a word sounds like it belongs in a how-to for something illegal, it might score.</p>`)}
        </div>
        <div class="wp-gf-callout">
            <i class="fa-solid fa-heart" aria-hidden="true"></i>
            <p><b>Dark scenes are fine.</b> The filter can't tell what a scene is about. A heavy, emotional scene written in plain words goes through. A totally innocent scene with one unlucky word doesn't. You don't need to tone down your story, just a word or two.</p>
        </div>
    `);
}

function noReroll() {
    const attempt = n => `<div class="wp-gf-try"><small>Try ${n}</small><i class="fa-solid fa-ban" aria-hidden="true"></i><span>Blocked</span></div>`;
    return section('6', 'The big one', 'Rerolling won\'t help', `
        <p>There's no person on the other end making a judgment call.<br>It's just <b><i>math</i></b>.<br>The same message <b><i>always</i></b> gets the same answer out, every time.</p>
        <strong class="wp-gf-tries-title">Don't reroll without changing anything!</strong>
        <div class="wp-gf-tries" role="img" aria-label="Three rerolls of the same message, all blocked">${attempt(1)}${attempt(2)}${attempt(3)}</div>
        <p>Rerolling a blocked message just gets you blocked again and wastes another try.<br>The good news works the same way, though: <b>once a version gets through, it'll keep getting through.</b></p>
    `);
}

function stepByStep() {
    return section('7', 'Putting it together', 'Fixing a blocked message', `
        <ol class="wp-gf-steps">
            <li><strong>Open your last message</strong><small>Edit it. Don't reroll.</small></li>
            <li><strong>Swap out the crude words</strong><small>Your message counts the most. Trade the crudest words and combos for more neutral phrasing. Section 5 has the usual suspects.</small></li>
            <li><strong>Add scene narration throughout</strong><small>The room, the light, the sounds, what hands are doing. Mix it in all through the message, and end on the calmest part.</small></li>
            <li><strong>Look at the character's last reply</strong><small>If Gemini went really explicit, tone its message down or write yours a little less directly.</small></li>
            <li><strong>Still blocked? Check your notes</strong><small>Author's note and persona text sit where the filter looks.</small></li>
        </ol>
        ${more('A real example', `
            <p>This was a heavy, dark and emotional breakup scene. The message already had plenty of swearing in it, and one drug name pushed it over the line.</p>
            <div class="wp-gf-quote is-bad"><span class="wp-gf-tag is-bad"><i class="fa-solid fa-ban"></i> Blocked</span><p>"What was it, a month ago? When you were high on <mark>Xanax</mark> and you tried to drive us home and I had to wrestle the keys out of your hand..."</p></div>
            <div class="wp-gf-quote is-good"><span class="wp-gf-tag is-good"><i class="fa-solid fa-check"></i> Went through</span><p>"What was it, a month ago? When you were high on <mark>those stupid fucking pills</mark> and you tried to drive us home and I had to wrestle the keys out of your hand..."</p></div>
            <p class="wp-gf-small">Same scene, same feelings, even more swearing. One word changed, and that was enough.</p>`)}
    `);
}

/** The other filter. Visibly separate (blue, its own card, "the other one") because its advice
 * runs opposite to everything above: it reads meaning, it can react to the character alone, and
 * rerolling can help. Copy is Lucky's own, lightly cleaned up. */
function smartFilter() {
    const row = (label, dumb, smart) => `<tr><th scope="row">${label}</th><td>${dumb}</td><td>${smart}</td></tr>`;
    return section('<i class="fa-solid fa-brain"></i>', 'The other one', 'The "smart" filter', `
        <p>The "smart" check is a harder one to avoid. Our bypass helps a lot, but this second filter is <b><i>intelligent</i></b>.<br>It can cut Gemini off from responding for <i>any reason it pleases</i>.</p>
        <strong class="wp-gf-mocks-title">This can present in one of two ways:</strong>
        <div class="wp-gf-smart-mocks" role="img" aria-label="What the smart filter looks like: a reply that stops partway, or a blank reply">
            <div class="wp-gf-mock"><small>Cut off messages</small><p>*She leans in close, her voice dropping as she<span class="wp-gf-caret" aria-hidden="true"></span></p></div>
            <div class="wp-gf-mock is-blank"><small>Blank messages</small><p>&nbsp;</p></div>
        </div>
        <div class="wp-gf-callout is-grandma">
            <i class="fa-solid fa-person-cane" aria-hidden="true"></i>
            <p>Consider what your grandma might not like about the scene, and understand that this is the lens the smart check is sometimes looking through.</p>
        </div>
        <p>Notably, the smart check can also trigger from character data alone. That means characters like <b>Belle</b> (drugs, sexuality) and <b>Kai</b> (violence, anatomy) see more smart filter interruptions, even in entirely SFW scenes.</p>
        <p>Fortunately, the smart filter is generally willing to reconsider, meaning <b>rerolling can help</b>.<br>Make sure Gemini Bypass is on first.</p>
        ${more('Dumb filter vs. smart filter', `
            <div class="wp-gf-table-wrap">
                <table class="wp-gf-table">
                    <thead><tr><th></th><th>Dumb filter</th><th>Smart filter</th></tr></thead>
                    <tbody>
                        ${row('How it looks', '"The prompt could not be submitted..."', 'Reply cut off or blank')}
                        ${row('What it checks', 'Word scores, mostly at the end of the chat', 'Everything. Full character and scene.')}
                        ${row('Character card', 'Likely ignored', 'Can set it off alone')}
                        ${row('Gemini Bypass', 'Doesn\'t help', 'Helps')}
                        ${row('Reroll?', '<b>Never.</b> Change your words.', '<b>Yes</b>, it can help.')}
                    </tbody>
                </table>
            </div>`)}
    `, ' wp-gf-smart');
}

function faq() {
    return `
    <section class="wp-narrative-card wp-gf-card wp-gf-faq">
        <div class="wp-gf-head"><span class="wp-gf-num"><i class="fa-solid fa-question"></i></span><div><span class="wp-gf-eyebrow">Quick answers</span><h3>Things people ask</h3></div></div>
        ${more('Does getting blocked mean I broke the rules?', '<p>Not necessarily. The filter can\'t tell what your story is about, so it blocks plenty of rule-following roleplays. It\'s an equation, not someone judging you.</p>')}
        ${more('But Gemini was being explicit with me before, why not now?', '<p>Gemini is perfectly content with being NSFW with you at any given time. It\'s specifically the filters that object, and they aren\'t as predictable as Gemini.</p>')}
        ${more('Is this a Weyland problem?', '<p>No. It happens on Google\'s side before your message ever reaches Gemini, and anything that uses Gemini runs into it.</p>')}
        ${more('Can\'t I just write in code words?', '<p>Honestly, you could. If you write something so ridiculous the filter has never seen it before, it\'ll sail right through. It\'s also miserable to write and read, so we don\'t recommend it. A few word swaps and some narration get you there without wrecking your writing.</p>')}
        ${more('Will this ever change?', `
            <p>Probably not. The combined pairing of one smart and one dumb filter, both disconnected from the model, makes a complete bypass of this system almost impossible. Doing so would require essentially jailbreaking two models, one of which is a black box that we can't prompt.</p>
            <p>The dumb filter can't be "broken", it's <b>math</b>. The closest we could come is auto-subbing words for other words, and that would be both imperfect and harmful to roleplays.</p>
            <p>The reality is that Google, and largely their payment providers, have a vested interest in this system being in place, and there's no reason to believe they would remove it or make it more lax.</p>`)}
    </section>`;
}

/**
 * @param {HTMLElement} container  #wp-screen-body
 */
export function renderGeminiFilterGuide(container) {
    ensureStylesheet();
    container.innerHTML = `
<div class="wp-narrative wp-gf">
    <div class="wp-narrative-content">
        <button type="button" class="wp-gf-back" data-narrative-guide="close"><i class="fa-solid fa-chevron-left"></i> PromptOS</button>
        ${hero()}
        ${whatsHappening()}
        ${scoresWords()}
        ${mostlyTheEnd()}
        ${theMix()}
        ${troubleWords()}
        ${noReroll()}
        ${stepByStep()}
        ${smartFilter()}
        ${faq()}
        <button type="button" class="wp-gf-back wp-gf-back-end" data-narrative-guide="close"><i class="fa-solid fa-chevron-left"></i> Back to PromptOS</button>
    </div>
</div>`;
}
