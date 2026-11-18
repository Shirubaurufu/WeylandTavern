// Ellie's Foxfire Fortunes: the deck. Plain script (no modules) so the sandbox opens from a double click.
// Each card carries what it means for a STORY (upright and reversed), a chapter name, one scene line of
// direction (open in how, clear in what, never scripting the player), and what Ellie says when it turns up.
// {char} = the roleplay's character, {user} = the player. Scene lines never give {user} words or actions.
(function () {
    const C = (id, num, name, glyph, up, rev, ellie) => ({ id, num, name, glyph, up, rev, ellie });
    const M = (key, title, scene) => ({ key, title, scene });

    // Glyphs are drawn around (0,0) in a box of roughly -30..30. Stroke and fill come from the card frame.
    const ARCANA = [
        C(0, '0', 'The Fool', '<circle cx="14" cy="-18" r="7" class="a"/><path d="M-24 22h26l14-10M-10 22l6-22 12 8M-4 0l-10-6"/><path d="M8 26l8 6 8-6" class="thin"/>',
            M('a leap with no plan', 'A Leap', '{char} does something on pure impulse, with no plan behind it, and it drags the whole night somewhere new.'),
            M('a mistake that costs', 'Looking Down', '{char} realises too late what that reckless choice is going to cost, and has to live in it for a while.'),
            'Just his sandals, at the edge. Um. I think he jumped. Happily.'),
        C(1, 'I', 'The Magician', '<circle cx="-8" cy="-20" r="7"/><circle cx="8" cy="-20" r="7"/><path d="M0-8v34"/><circle cx="0" cy="26" r="3" class="a"/><path d="M-22 10h12M10 10h12" class="thin"/>',
            M('making it happen', 'Sleight of Hand', '{char} pulls off something bold through nerve and cleverness, and enjoys having an audience for it.'),
            M('a trick, a con', 'The Trick', 'Something {char} set up turns out to be a trick, and it comes apart in front of the one person it was meant to fool.'),
            'Everything she needs, right there on the table. Imagine.'),
        C(2, 'II', 'The High Priestess', '<path d="M-22-26v52M22-26v52"/><path d="M6-12a13 13 0 1 0 0 24a10 10 0 1 1 0-24z" class="a"/>',
            M('a secret kept', 'What Stays Unsaid','{char} is holding something back, and the scene is built around how close it comes to slipping out.'),
            M('a secret gets out', 'It Slips', 'The thing {char} was hiding gets out in the worst possible way, and there is no pretending it did not.'),
            '...a curtain, and a scroll she will not open. She knows something.'),
        C(3, 'III', 'The Empress', '<circle cx="0" cy="-8" r="14" class="a"/><path d="M0 6v22M-10 18h20"/><path d="M-20-24l6 6M20-24l-6 6M0-30v6" class="thin"/>',
            M('being looked after', 'Soft Hands', '{char} takes care of someone without being asked, and it is warmer than either of them expected.'),
            M('too much care', 'Smothered', 'The care {char} gives tips over into too much, and the closeness starts to feel like a closed door.'),
            'Persimmons. That one is warm. Like... a kitchen.'),
        C(4, 'IV', 'The Emperor', '<path d="M-18 26v-34h36v34z"/><path d="M-18-8l6-16 12 10 12-10 6 16" class="a"/><path d="M-8 26v-14h16v14" class="thin"/>',
            M('rules step in', 'House Rules', 'Someone with authority steps into the scene and sets terms, and {char} has to decide how much of it to swallow.'),
            M('control cracks', 'The Crown Slips', '{char} pushes back against the person holding the rules, and for once they are the one who blinks.'),
            'An empty throne, on top of a mountain. He is very... sure of himself.'),
        C(5, 'V', 'The Hierophant', '<path d="M0-28v56M-8-18h16M-13-6h26M-18 6h36"/><circle cx="-14" cy="24" r="4" class="a"/><circle cx="14" cy="24" r="4" class="a"/>',
            M('what family expects', 'The Old Way', 'What {char} was raised to want walks into the room, and the weight of doing it properly comes in with it.'),
            M('breaking tradition', 'Not Allowed', '{char} wants the one thing the family said never to want, and stops pretending otherwise.'),
            'I... like this one. The old gate, the old keys. Sorry, that is boring.'),
        C(6, 'VI', 'The Lovers', '<circle cx="-8" cy="2" r="15"/><circle cx="8" cy="2" r="15"/><path d="M0-30c-5-7-14 1 0 9c14-8 5-16 0-9z" class="a"/>',
            M('closeness, a choice', 'Closer', '{char} lets the distance close, slowly, and the scene is the two of them finding out how near is too near.'),
            M('wrong time', 'Bad Timing', 'The pull between them shows up at exactly the wrong moment, with someone or something in the way.'),
            '...two cranes. They, um. They mate for life.'),
        C(7, 'VII', 'The Chariot', '<path d="M-20 8v-22h40v22z"/><path d="M-20-14l20-14 20 14" class="a"/><circle cx="-12" cy="18" r="8"/><circle cx="12" cy="18" r="8"/>',
            M('a race, a rival', 'Neck and Neck', '{char} is competing with someone for something that matters, and losing politely is not on the table.'),
            M('losing the reins', 'Off the Road', '{char} pushes too hard to win and loses control of the whole thing in public.'),
            'Two horses, both pulling. Fast. I would fall out.'),
        C(8, 'VIII', 'Strength', '<path d="M-20-22l8 16h24l8-16-4 30-16 18-16-18z" class="a"/><circle cx="-8" cy="2" r="2"/><circle cx="8" cy="2" r="2"/><path d="M-4 12l4 4 4-4" class="thin"/>',
            M('patience tames it', 'Gentle With It', '{char} is patient with something wild and frightened, and little by little it comes closer.'),
            M('a temper snaps', 'The Snap', 'The thing {char} has been holding down all week finally gets loose, and it is not pretty.'),
            'A lion, and he is... bowing. Gently. I like that.'),
        C(9, 'IX', 'The Hermit', '<path d="M-10-10h20l6 10v18h-32v-18z"/><path d="M0-2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z" class="a"/><path d="M-6-10c0-14 12-14 12 0" class="thin"/>',
            M('a quiet night apart', 'Three in the Morning', 'The world empties out and {char} is left somewhere quiet with one other person and nothing to hide behind.'),
            M('shut out', 'Door Closed', '{char} pulls away from everyone, and the scene is about who notices and what they do about it.'),
            'Oh. That is... me, a little. A lantern, on a long road.'),
        C(10, 'X', 'Wheel of Fortune', '<circle cx="0" cy="0" r="24"/><circle cx="0" cy="0" r="6" class="a"/><path d="M0-24v48M-24 0h48M-17-17l34 34M17-17l-34 34" class="thin"/>',
            M('luck turns', 'Of All the Places', 'Pure coincidence throws {char} into the one situation nobody would have chosen, and for once the luck runs {char}\'s way.'),
            M('a bad streak', 'One of Those Days', 'Everything that can go wrong for {char} does, one small thing after another, until it is almost funny.'),
            'It goes up. Then, um. It goes down. It is a wheel.'),
        C(11, 'XI', 'Justice', '<path d="M0-28v54M-22-18h44"/><path d="M-30 0l8-18 8 18a8 5 0 0 1-16 0z" class="a"/><path d="M14 0l8-18 8 18a8 5 0 0 1-16 0z" class="a"/><path d="M-10 26h20"/>',
            M('the truth weighed', 'Fair Is Fair', 'Something that was owed finally gets settled, out loud, and {char} gets to see it done.'),
            M('blamed, or payback', 'Paid Back', '{char} gets even with someone over an old wrong, and finds out how it feels once it is done.'),
            'She is fair. That is... not always the nice one.'),
        C(12, 'XII', 'The Hanged Man', '<path d="M-22-26h44M0-26v20"/><circle cx="0" cy="18" r="7" class="a"/><path d="M0-6l-10 10M0-6l10 10M0-6v16"/>',
            M('stuck, seeing it new', 'Upside Down', '{char} is stuck somewhere with no way to hurry it along, and the waiting turns the whole thing over into something new.'),
            M('stalling', 'Any Day Now', '{char} keeps putting off the one thing that has to be done, and the excuses are getting thin.'),
            'Upside down, from the plum tree. He is fine. He is just... waiting.'),
        C(13, 'XIII', 'Death', '<path d="M-14 28l22-52"/><path d="M8-24c18 2 24 16 18 28c-2-12-10-18-22-18z" class="a"/><path d="M-22 28h20" class="thin"/>',
            M('an ending makes room', 'The Last Time', 'Something in {char}\'s life ends for good in this scene, and there is a strange relief underneath the loss.'),
            M('refusing to let go', 'Holding On', '{char} clings to something that is already over, and everyone else in the room can see it.'),
            'A sickle. It is not... it just means something ends. Mostly.'),
        C(14, 'XIV', 'Temperance', '<path d="M-26-20h16l-3 18h-10z"/><path d="M10 6h16l-3 18h-10z"/><path d="M-12-10c14 0 16 8 22 16" class="a"/><circle cx="14" cy="-18" r="5" class="thin"/>',
            M('slow and even', 'No Rush', 'Nothing dramatic happens and that is the point: {char} lets something build an inch at a time.'),
            M('overdoing it', 'Too Much', '{char} goes too far with something that was fine in small amounts, and has to face the morning after.'),
            'Pouring from one cup to the other. Slow. I like slow.'),
        C(15, 'XV', 'The Devil', '<path d="M-14-6c-14-6-12-22-4-24c-2 10 4 14 10 16M14-6c14-6 12-22 4-24c2 10-4 14-10 16"/><circle cx="0" cy="4" r="12" class="a"/><path d="M-8 22a8 6 0 1 0 16 0a8 6 0 1 0-16 0" class="thin"/>',
            M('giving in', 'Just This Once', '{char} stops arguing with the wanting and gives in to it, completely, without an apology.'),
            M('obsession', 'Can\'t Stop', 'What started as wanting has turned into something {char} cannot put down, and it is starting to show.'),
            'An oni. It, um. It does not always mean that. Sometimes it does.'),
        C(16, 'XVI', 'The Tower', '<path d="M-12 28v-40h24v40z"/><path d="M-16-12h32l-4-10h-24z" class="a"/><path d="M24-30l-12 16h10l-12 18" class="bolt"/><path d="M-4 0h8M-4 12h8" class="thin"/>',
            M('it all blows up', 'The Night It Broke', 'Without warning, the thing everyone was pretending about blows open, and {char} is standing right in the middle of it.'),
            M('disaster, barely dodged', 'So Close', 'The disaster misses by inches, and {char} spends the scene shaking from how near it came.'),
            'Oh. Um. I do not love this one. The roof coming off. It is fine.'),
        C(17, 'XVII', 'The Star', '<path d="M0-26l5 17 17 5-17 5-5 17-5-17-17-5 17-5z" class="a"/><circle cx="-20" cy="-20" r="2"/><circle cx="20" cy="-22" r="2"/><circle cx="22" cy="20" r="2"/><circle cx="-22" cy="22" r="2"/>',
            M('hope, a soft night', 'After the Rain', 'A quiet, kind scene: {char} gets to rest, and something that was hurting starts to mend.'),
            M('hope runs thin', 'No Stars Out', '{char} has stopped believing this will work out, and says so, and waits to be told she is wrong.'),
            'Oh, that is a nice one. That is the one you hope for.'),
        C(18, 'XVIII', 'The Moon', '<path d="M8-28a18 18 0 1 0 0 34a14 14 0 1 1 0-34z" class="a"/><path d="M-24 28l5-14 5 10 4-6M24 28l-5-14-5 10-4-6"/><path d="M-2 14v4M-10 12v3M6 12v3" class="thin"/>',
            M('not what it seems', 'Something in the Dark', 'Nothing in this scene is quite what it looks like, and {char} has to move through it half blind.'),
            M('the illusion breaks', 'Lights On', 'The lie {char} has been living inside falls apart, and what is really there is plainer and stranger.'),
            'A fox, out under the moon. Things in the dark are not always bad.'),
        C(19, 'XIX', 'The Sun', '<circle cx="0" cy="0" r="12" class="a"/><path d="M0-28v10M0 18v10M-28 0h10M18 0h10M-20-20l7 7M13 13l7 7M20-20l-7 7M-13 13l-7 7"/>',
            M('joy, play', 'Stupid Happy', '{char} is in a ridiculous good mood and it is contagious: the scene is play, teasing and nothing going wrong.'),
            M('a brave face', 'Smiling Anyway', '{char} is being bright and funny on top of something sad, and the cracks are small but there.'),
            'Sunflowers. Warm. Um. I mostly see the other one. The moon one.'),
        C(20, 'XX', 'Judgement', '<path d="M-24 10l34-22v28z" class="a"/><path d="M10-12h10v28h-10"/><path d="M-10 26c4-6 8-6 12 0M4 26c4-6 8-6 12 0" class="thin"/>',
            M('it comes back', 'Answer the Call', 'Something from {char}\'s past comes back and asks to be dealt with, and this time {char} turns to face it.'),
            M('the call ignored', 'Let It Ring', 'The past comes calling for {char}, who lets it ring and spends the scene pretending not to hear.'),
            'The horn calls, and something old comes back. They... do that.'),
        C(21, 'XXI', 'The World', '<ellipse cx="0" cy="0" rx="18" ry="26"/><ellipse cx="0" cy="0" rx="11" ry="18" class="a"/><circle cx="-24" cy="-24" r="3"/><circle cx="24" cy="-24" r="3"/><circle cx="-24" cy="24" r="3"/><circle cx="24" cy="24" r="3"/>',
            M('belonging', 'All of Us', '{char} looks around and realises there are people here, a place, and a seat at the table with {char}\'s name on it.'),
            M('one piece missing', 'Almost', 'Everything {char} wanted is right here except one thing, and that one empty chair keeps pulling the eye.'),
            'Everything, all at once. Even the mountain. That is... a lot. In a good way.'),
    ];

    // Where a card sits in the spread decides what it speaks to. The last card always settles things.
    const POSITIONS = {
        3: ['What stirs', 'What turns', 'What settles'],
        5: ['What stirs', 'What pulls', 'What turns', 'What breaks', 'What settles'],
        7: ['What stirs', 'What hides', 'What pulls', 'What turns', 'What it costs', 'What breaks', 'What settles'],
    };

    const ENDS = [
        'The moment has clearly landed and something between them is different.',
        'Somebody says the thing out loud.',
        'There is no going back to how it was an hour ago.',
        'They are left alone with what just happened.',
        'One of them walks away, or pointedly does not.',
        'The night moves on and takes the scene with it.',
        'It is settled, one way or the other.',
    ];

    const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

    // The face of a card as SVG. Code-drawn stand-in for CODEX art (EFF-10): same 100x160 frame.
    // Codex's painted deck (EFF-10 to EFF-13): 22 woodblock faces, a shared frame whose top and bottom plates
    // take the numeral and the name, and a light wear pass on top. All 400x640, the same 5:8 as the card box.
    // The art keeps its top and bottom calm for those plates, so the text is still drawn here (it stays sharp
    // and needs no font in the image). The old drawn glyphs (card.glyph) are kept in ARCANA, unused, as a fallback.
    const FACE_FILES = ['00-fool', '01-magician', '02-high-priestess', '03-empress', '04-emperor', '05-hierophant', '06-lovers',
        '07-chariot', '08-strength', '09-hermit', '10-wheel-of-fortune', '11-justice', '12-hanged-man', '13-death', '14-temperance',
        '15-devil', '16-tower', '17-star', '18-moon', '19-sun', '20-judgement', '21-world'];
    const CARD_DIR = 'assets/cards/';
    function cardFace(card) {
        return `<svg viewBox="0 0 100 160" xmlns="http://www.w3.org/2000/svg" class="card-svg" aria-hidden="true">
<image href="${CARD_DIR}${FACE_FILES[card.id]}.webp" x="0" y="0" width="100" height="160" preserveAspectRatio="none"/>
<image href="${CARD_DIR}frame.webp" x="0" y="0" width="100" height="160" preserveAspectRatio="none"/>
<image href="${CARD_DIR}wear.webp" x="0" y="0" width="100" height="160" preserveAspectRatio="none" opacity=".7"/>
<text x="50" y="11.4" text-anchor="middle" class="c-num">${card.num}</text>
<text x="50" y="151.7" text-anchor="middle" class="c-name"${card.name.length > 13 ? ' textLength="66" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(card.name.toUpperCase())}</text>
</svg>`;
    }

    // The back: indigo, a gold frame and one blue flame. Used as a CSS background so 22 fan cards stay cheap.
    const BACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 160"><defs><radialGradient id="g" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#2b2a66"/><stop offset="1" stop-color="#120f2e"/></radialGradient></defs><rect x="1" y="1" width="98" height="158" rx="7" fill="url(#g)" stroke="#0a0818" stroke-width="2"/><rect x="6" y="6" width="88" height="148" rx="4" fill="none" stroke="#c9973a" stroke-width="1.4"/><path d="M50 22l28 58-28 58-28-58z" fill="none" stroke="#c9973a" stroke-width=".8"/><path d="M50 52c12 14 16 22 10 34c-3 6-17 6-20 0c-4-8 2-12 4-20c4 6 6 6 6-14z" fill="#59b6ff"/><path d="M50 68c5 7 7 11 4 16c-2 3-7 3-8 0c-2-4 2-6 2-10z" fill="#dff4ff"/><g fill="#c9973a"><circle cx="16" cy="16" r="2"/><circle cx="84" cy="16" r="2"/><circle cx="16" cy="144" r="2"/><circle cx="84" cy="144" r="2"/><circle cx="50" cy="34" r="1.4"/><circle cx="50" cy="126" r="1.4"/></g></svg>`;

    window.EFF = { ARCANA, POSITIONS, ENDS, cardFace, BACK_URL: `url("${CARD_DIR}back.webp")`, BACK_URL_DRAWN: `url("data:image/svg+xml,${encodeURIComponent(BACK_SVG)}")`, esc };
})();
