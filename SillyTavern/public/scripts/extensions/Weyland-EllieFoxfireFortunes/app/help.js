// Ellie's Foxfire Fortunes: the "?" guide (Lucky, 2026-11-19). Plain script like cards.js, so the sandbox still
// opens from a double click. parlor.js draws it; this file only holds the words.
//
// SCREENS: one entry per screen (app.dataset.screen), plus 'reading' for the fortune paper, which sits on top of
// whatever screen is under it. Each section is a heading that opens to a few short paragraphs and/or a list.
// A section with `cards: true` gets the whole deck appended, one row per card, each opening to READS.
//
// READS: what a card can turn into in a story. The menu tile and the prompt only carry one short meaning
// ("slow and even"), and players asked what that means in practice. Lucky's point when explaining it: like a real
// reading, one card means different things depending on what is going on, so each side lists a few ways it might
// play out rather than one answer. These are for the player only; nothing here is sent to the model.
(function () {
    const READS = {
        0: { up: ['Something starts on a whim, with no plan at all', 'Saying yes before thinking it through', 'A fresh start, a little naive, a lot of fun'],
            rev: ['A reckless choice comes back to bite', 'Someone jumps first and lands badly', 'The fun stops being fun'] },
        1: { up: ['Someone makes a plan happen through sheer nerve', 'A clever idea that actually works', 'Showing off, and pulling it off'],
            rev: ['A lie or a scheme is exposed', 'Someone is being played', 'A trick that falls apart at the worst time'] },
        2: { up: ['A secret sits in the room, unspoken', 'Someone knows more than they say', 'Intuition, a gut feeling, a quiet hint'],
            rev: ['The secret gets out', 'Something hidden is overheard or found', 'A confession nobody was ready for'] },
        3: { up: ['Being cared for, fed, tucked in', 'Warmth, comfort, home', 'Someone looks after someone else without being asked'],
            rev: ['Care that turns smothering or possessive', 'Mothering that nobody asked for', 'Comfort that becomes a cage'] },
        4: { up: ['An authority sets the rules (a parent, a boss, the law)', 'Structure, order, someone taking charge', 'Having to answer to someone'],
            rev: ['Pushing back against the rules', 'Someone in control loses their grip', 'A power struggle, and the boss blinks'] },
        5: { up: ['Family expectations, tradition, doing it "properly"', 'A ceremony, a custom, an institution', 'What someone was raised to want'],
            rev: ['Breaking a rule or a tradition', 'Wanting the forbidden thing', 'Walking away from what everyone expected'] },
        6: { up: ['Getting closer, physically or emotionally', 'A choice between people, or about one person', 'Two people who fit together'],
            rev: ['Right feelings, wrong time', 'Something or someone gets in the way', 'A pull that causes trouble'] },
        7: { up: ['A race, a rivalry, a competition', 'Pushing hard to win something', 'Momentum, drive, getting somewhere fast'],
            rev: ['Losing control by pushing too hard', 'A public crash or embarrassment', 'Winning at the wrong cost'] },
        8: { up: ['Patience wins someone or something over', 'Calming a temper, soothing a fear', 'Quiet courage instead of force'],
            rev: ['A temper finally snaps', 'Someone loses their composure', 'Everything held down comes out at once'] },
        9: { up: ['A quiet, private moment away from everyone', 'Late-night honesty', 'Time alone to think, maybe with one other person'],
            rev: ['Withdrawing and shutting people out', 'Loneliness', 'Someone goes silent and somebody has to notice'] },
        10: { up: ['Coincidence, fate, a lucky break', 'Being in the right place at the right time', 'Things suddenly change direction'],
            rev: ['Bad luck piling up', 'One of those days where nothing goes right', 'Plans derailed by chance'] },
        11: { up: ['The truth comes out and things are settled', 'Consequences, fairly given', 'Making it right, settling a debt'],
            rev: ['Getting even, revenge, payback', 'Someone takes the blame, fairly or not', 'A score settled, with mixed feelings after'] },
        12: { up: ['Stuck, waiting, and seeing things differently because of it', 'A pause that changes perspective', 'Letting go of control'],
            rev: ['Putting something off, stalling', 'Running out of excuses', 'Waiting turns into avoiding'] },
        13: { up: ['Something ends, and it makes room for something new', 'The last time something happens', 'Closure, bittersweet relief'],
            rev: ['Holding on to something already over', "Refusing to change when it's needed", 'Everyone else can see it, except them'] },
        14: { up: ['A slow and steady relationship', 'Things shared out fairly, a balance struck', 'A peace that holds', 'Turning a mess into something that works'],
            rev: ['Overdoing it, too much of a good thing', 'Losing balance, going to extremes', 'The morning after'] },
        15: { up: ['Giving in to temptation', 'Desire with no apologies', 'Indulgence, vice, just this once'],
            rev: ['Obsession, something that cannot be put down', 'An addiction or fixation starts to show', 'Wanting that turns into needing'] },
        16: { up: ['Sudden disaster, everything blows up', 'A truth bomb, a fight, a breakup', 'The thing everyone pretended about collapses'],
            rev: ['A disaster barely avoided', 'Shaken by how close it came', 'Damage control'] },
        17: { up: ['Hope, healing, a soft moment', 'Rest after something hard', 'Feeling better, slowly'],
            rev: ['Losing hope', 'Someone stops believing it will work out', 'Needing to be told it will be okay'] },
        18: { up: ['Nothing is what it seems', 'Confusion, mystery, a misunderstanding', 'Moving forward without seeing clearly'],
            rev: ['The illusion breaks, the truth is plain', 'A misunderstanding cleared up', 'Seeing someone as they really are'] },
        19: { up: ['Pure joy, play, a great day', 'Teasing and fun with nothing going wrong', 'Celebration'],
            rev: ['A brave face over something sad', 'Smiling through it', 'Happiness with small cracks in it'] },
        20: { up: ['The past comes back and has to be faced', 'An old flame, an old debt, an old wound', 'A second chance'],
            rev: ['Ignoring something that needs dealing with', 'Pretending not to hear', 'Running from the past'] },
        21: { up: ['Belonging, being part of something', 'Everything comes together', 'A happy ending, or a homecoming'],
            rev: ['Almost complete, one piece missing', 'So close, but not quite', 'Something or someone is absent'] },
    };

    const SCREENS = {
        dark: {
            title: 'The dark room',
            sections: [
                { h: 'Lighting the candles', p: ['Tap the three candles to light them. Once all three are lit, Ellie lets you sit down at her table.', 'You only have to do this the first time. After that the room is already lit when you come back.'] },
            ],
        },
        ask: {
            title: 'Asking for a fortune',
            sections: [
                { h: 'What Foxfire Fortunes does', p: ['Ellie plans a short story for the roleplay you have open: a set of chapters, one per card. Once you seal a fortune in, your roleplay follows it chapter by chapter, steering the story without taking it over.', 'Each reading is one model request, so it uses one message from your allowance.'] },
                { h: 'A reading for', p: ['Who the fortune is about: the character in your open chat, and you. These come from the chat itself, so they cannot be changed here.'] },
                { h: 'The slip', p: ['Write what you want the story to be about, in your own words. "Bastet and I sneak into the city museum after closing" is plenty.', 'You can also leave it blank. Then the cards you pick decide the story on their own.', 'When you do write something, your words always come first. The cards add flavor to the chapters where they fit, and get skipped where they do not.'] },
                { h: 'Kept slips', p: ['Tap "Keep this one" to save what is on the slip so you can use it again later. "Kept slips" opens your saved ones: tap one to put it back on the slip, use the pen to rename it, or throw it away.'] },
                { h: 'Kinsbane Manor and Muse', p: ['These two already tell their own story, so Ellie will not lay a fortune over it. Muse\'s custom start builds a brand new scenario, and that one can take a fortune like any other chat. Kinsbane Manor has no custom start, so it never takes one.'] },
                { h: 'How many scenes?', p: ['How many chapters the story has, and so how many cards you pick. Three is a short tale, five a proper story, seven a long road.'] },
            ],
        },
        draw: {
            title: 'Picking the scenes',
            sections: [
                { h: 'How the cards work', p: ['Every tile in the list is one card, upright or reversed. Tap a tile to put it in the next empty slot. The first slot is chapter 1, the second chapter 2, and so on.', 'With a blank slip, each card is the theme of its chapter. You are picking story beats, just without full control over how they play out. Like a real reading, a card can mean different things depending on what is happening, so the same card can lead to very different chapters.', 'With words on the slip, the cards are optional flavor. They get used where they fit what you asked for.'] },
                // Not a romance on purpose (Lucky, 2026-11-19): the guide's examples shouldn't hint that every fortune is a love story.
                { h: 'An example', p: ['On the slip: "Bastet and I sneak into the city museum after closing", with three scenes. You pick the Moon (not what it seems), the Chariot reversed (losing the reins) and the Tower reversed (disaster, barely dodged).', 'The story could go something like this: you and Bastet slip inside, and the museum is not as empty as it looked. Somebody else is in there, or something is. Then Bastet pushes it too far, and the night gets away from both of you. By the end the whole thing nearly comes down on your heads, and you get out by inches.', 'It works like a fortune teller saying "I see a strange night ahead, with things hidden in the dark... someone will push too far, and disaster will pass you by a hair."'] },
                { h: 'The cards', cards: true, p: ['Tap a card to see what it usually means and a few ways it can play out. Upright is the card as drawn; reversed is the card turned upside down, which usually flips or sours its meaning. Each card can only be used once per reading, either way up.'] },
                { h: 'Surprise me, Clear, Change your request', list: ['Surprise me: fills every empty slot at random. Fair warning, random picks can get wild, and the darker cards can take a story to strange places.', 'Clear: empties every slot.', 'Change your request: goes back to the slip. Your cards stay where they are.'] },
                { h: 'Set the mood', mood: true, p: ['Tap a dial on the table to step through its settings. Tap a dial below to see each setting.'] },
                { h: 'Plan it out first', p: ['On by default. Before it writes your fortune, the model does a special analysis of your request first, to make sure it understood what you asked for. It takes a bit longer, but the fortune is usually better thought out.'] },
            ],
        },
        gaze: {
            title: 'The gaze',
            sections: [
                { h: 'What is happening', p: ['Ellie is reading your cards: the model is writing your fortune. The ring shows roughly how long it usually takes. With "Plan it out first" on, or with two endings, it takes a little longer.', 'You can close the phone while she reads; the request keeps going, and your cards will still be on the table when you come back.'] },
                { h: 'Break the gaze', p: ['Cancels the reading and puts you back at the cards.'] },
            ],
        },
        reading: {
            title: 'Your fortune',
            sections: [
                { h: 'Reading it', p: ['This is the plan for your story: a title, the chapters in order, and when each chapter ends. The stamp at the top is the fortune\'s luck, from Great Blessing down to Trouble.', 'You can tap the text and change anything before you seal it in.'] },
                { h: 'The four seals', list: ['Seal it in: your open chat starts following this fortune. If the chat already follows one, this swaps it out.', 'Read again: asks for a new fortune with the same cards. This uses another message.', 'Tie it up: hangs it on the wishing branch so you can use it later, in this chat or another one.', 'Burn it: throws it away for good.'] },
            ],
        },
        unfold: {
            title: 'The fortune unfolding',
            sections: [
                { h: 'How it steers the story', p: ['Your chat is following this fortune. Each reply is written with the current chapter in mind, and when the chapter\'s ending happens in the story, it moves on to the next one by itself.', 'The tag at the top says where things stand: UNFOLDING (being followed), PAUSED, WAITING (OOC Mode is on, so the fortune waits until it is off) or FULFILLED (the last chapter is done).'] },
                { h: 'The chapter', p: ['The card row shows every chapter. Tap any card to jump to that chapter.', 'You can tap the chapter\'s name, scene or ending and rewrite it. The next reply follows your new version.'] },
                { h: 'Arrows and Pause', list: ['The arrows step back or forward a chapter by hand, in case the story moved on (or did not) without the fortune noticing.', 'Pause: the chat stops following the fortune until you unpause it. Your place is kept.'] },
                { h: 'Two roads', p: ['If the fortune has two endings, the road buttons switch between A and B. Before the crossing you will be asked which way to go.'] },
                { h: 'The other buttons', list: ['Read the whole fortune: shows the full plan.', 'Keep for later: hangs a copy on the wishing branch.', 'Ask again: back to the slip for a new reading. The current fortune keeps going until you seal in another.', 'Burn it: the chat stops following this fortune. A copy on the wishing branch stays.'] },
            ],
        },
        branch: {
            title: 'The wishing branch',
            sections: [
                { h: 'Kept fortunes', p: ['Every fortune you tie up hangs here. Tap one to read it, then seal it into the chat you have open, or burn it to take it off the branch.', 'The branch is shared by all your chats, so a fortune kept in one roleplay can be used in another.'] },
            ],
        },
        settings: {
            title: 'Settings',
            sections: [
                { h: 'Keep out of my stories', p: ['Tap anything you never want in a fortune, or add your own. It stays out even on the darkest settings.', 'The one exception is your own slip: if you ask for it in your own words, you get it.'] },
                { h: 'Model', p: ['Which model writes your fortunes, plus a backup that is tried once if the first one fails. Changes count from your next reading.'] },
                { h: 'Reset settings', p: ['Puts your settings and switches back to how they started, turns the sound back on, and blows the candles out so you get the opening again. Your cards, your slip and your fortunes are not touched.'] },
            ],
        },
    };

    // The mood dials, one row per setting, in the order a tap steps through them (index = the dial's value in
    // parlor.js). `dial` is the button on the table whose icon is copied for each row, drawn at that setting.
    const MOOD = [
        { dial: 'omMoon', h: 'Darkness', levels: [
            ['Soft', 'Warm, no hurt.'],
            ['Stakes', 'Potential hurt that can heal.'],
            ['Dark', 'Hurt that does not heal.'],
            ['Brutal', 'Maximum intensity, nothing held back, in whatever form fits the story.'],
        ] },
        { dial: 'omEmber', h: 'Spice', levels: [
            ['None', 'Puts the fire out. Spice is left out of the instructions entirely, so your character and the chat decide.'],
            ['Sweet', 'Gentle flirtatiousness. This is the default.'],
            ['Flirty', 'Overt flirtatiousness.'],
            ['Steamy', 'Overtly sexual.'],
            ['Filthy', 'Obscenely sexual.'],
        ] },
        { dial: 'omIncense', h: 'Pace', levels: [
            ['Slow', 'Each chapter takes a long time to play out.'],
            ['Steady', 'Chapters take a good while; nothing is rushed.'],
            ['Brisk', 'Things move faster, but each beat still lands.'],
        ] },
        { dial: 'omConn', h: 'Connection', intro: 'This tells the model where the two of you stand, or where you want things to go. Platonic says "we\'re friends, or we\'d like to stay friends", so the story stays away from romance. Breaking says "our relationship is falling apart, or should start to." The rest work the same way. If you have something more specific in mind, write it on the slip.', levels: [
            ['Unset', 'Leaves it to your character and the chat so far.'],
            ['Platonic', 'Not romantic or sexual: friendship, family or something else. Avoids inserting romance in the story.'],
            ['Interested', 'One or both of them show interest in the other, but neither has acted on it.'],
            ['Casual', 'They hook up or share affection, but they are not a couple.'],
            ['Complicated', 'Real feelings, but something stands in the way.'],
            ['Dating', 'Together, and it is still fairly new.'],
            ['Partnered', 'Committed and settled.'],
            ['Breaking', 'Still together, but it is coming apart.'],
            ['Broken', 'They were together, and it fell apart.'],
        ] },
        { dial: 'omCross', h: 'Two endings', levels: [
            ['Off', 'One road, start to finish.'],
            ['On', 'The story splits partway through into two roads, A and B, and you choose which to take when you get there. After the split, road A uses each card the way you laid it, and road B uses its other side.'],
        ] },
    ];

    window.EFFHelp = { READS, SCREENS, MOOD };
})();
