export const SUITS = [ "red", "blue", "black", "white" ];

export const SUIT_NAMES = {
    red: "Red",
    blue: "Blue",
    black: "Black",
    white: "White"
};

export const KIND_NAMES = {
    skip: "Skip",
    rev: "Reverse",
    draw2: "Draw 2",
    wild: "Wild",
    wild4: "Wild Draw 4"
};

export const GIRLS = [ "belle", "eve", "astrid" ];

export const SEATS = [ "you", "belle", "eve", "astrid" ];

export const FIRST_VISIT_ORDER = Object.freeze([ "belle", "astrid", "eve" ]);

export const seating = night => Array.isArray(night?.order) && night.order.length === GIRLS.length ? night.order : GIRLS;

export const TABLES = Object.freeze({
    dime: {
        id: "dime",
        name: "The Dime Table",
        buyIn: 100,
        rate: .5,
        cap: 300
    },
    dollar: {
        id: "dollar",
        name: "The Back Booth",
        buyIn: 400,
        rate: 2,
        cap: 1200
    },
    velvet: {
        id: "velvet",
        name: "The Velvet Room",
        buyIn: 1500,
        rate: 7.5,
        cap: 4500
    }
});

export const HANDS_PER_NIGHT = 4;

export const CLOCK = [ "11:00 PM", "12:00 AM", "1:00 AM", "2:00 AM" ];

export const HAND_SIZE = 7;

export const CARDS = Object.freeze((() => {
    const out = [];
    for (const suit of SUITS) {
        out.push({
            suit: suit,
            kind: "num",
            n: 0
        });
        for (let n = 1; n <= 9; n++) out.push({
            suit: suit,
            kind: "num",
            n: n
        }, {
            suit: suit,
            kind: "num",
            n: n
        });
        for (const kind of [ "skip", "rev", "draw2" ]) out.push({
            suit: suit,
            kind: kind
        }, {
            suit: suit,
            kind: kind
        });
    }
    for (let i = 0; i < 4; i++) out.push({
        suit: null,
        kind: "wild"
    });
    for (let i = 0; i < 4; i++) out.push({
        suit: null,
        kind: "wild4"
    });
    return out.map(((c, id) => Object.freeze({
        id: id,
        ...c
    })));
})());

export const card = id => CARDS[id];

export const isWild = id => CARDS[id].suit === null;

export const isAttack = id => [ "skip", "draw2", "wild4" ].includes(CARDS[id].kind);

export function points(id) {
    const c = CARDS[id];
    return c.kind === "num" ? c.n : c.suit === null ? 50 : 20;
}

export const handPoints = ids => ids.reduce(((s, id) => s + points(id)), 0);

export function cardName(id) {
    const c = CARDS[id];
    if (c.suit === null) return KIND_NAMES[c.kind];
    return c.kind === "num" ? `${SUIT_NAMES[c.suit]} ${c.n}` : `${SUIT_NAMES[c.suit]} ${KIND_NAMES[c.kind]}`;
}

export function rand(st) {
    let t = st.rng = st.rng + 1831565813 >>> 0;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

function shuffle(st, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand(st) * (i + 1));
        [arr[i], arr[j]] = [ arr[j], arr[i] ];
    }
    return arr;
}

export function newNight(tableId, seed, {firstVisit: firstVisit = false} = {}) {
    const t = TABLES[tableId];
    if (!t) throw new Error("Unknown table.");
    const night = {
        table: tableId,
        handNo: 0,
        rng: seed >>> 0,
        bank: {
            you: t.buyIn,
            belle: t.buyIn,
            eve: t.buyIn,
            astrid: t.buyIn
        },
        out: [],
        astrid: {
            mood: "warm",
            left: 0
        },
        lacks: [],
        hand: null,
        last: null,
        done: false,
        glitched: false,
        tips: [],
        order: null
    };
    night.order = firstVisit ? [ ...FIRST_VISIT_ORDER ] : shuffle(night, [ ...GIRLS ]);
    return night;
}

export function newHand(night, {flirt: flirt = true, lateCards: lateCards = false, glitchAnywhere: glitchAnywhere = false} = {}) {
    const seats = [ "you", ...seating(night).filter((s => !night.out.includes(s))) ];
    const deck = shuffle(night, CARDS.map((c => c.id)));
    const hands = Object.fromEntries(seats.map((s => [ s, [] ])));
    for (let i = 0; i < HAND_SIZE; i++) for (const s of seats) hands[s].push(deck.pop());
    let first;
    for (;;) {
        first = deck.pop();
        if (CARDS[first].kind === "num") break;
        deck.unshift(first);
    }
    night.hand = {
        seats: seats,
        deck: deck,
        discard: [ first ],
        hands: hands,
        suit: CARDS[first].suit,
        turn: (night.handNo + 1) % seats.length,
        dir: 1,
        called: {},
        exposed: null,
        drawn: null,
        winner: null,
        turns: 0,
        bribed: null,
        smoke: null,
        grudge: null,
        glitch: null,
        glitchAnywhere: glitchAnywhere,
        flirt: {
            held: false,
            pos: null,
            at: null,
            off: [],
            turn: -1
        }
    };
    if (flirt) night.hand.flirt.pos = Math.floor(rand(night) * deck.length);
    if (lateCards) {
        if (flirt) {
            night.hand.flirt.pos = deck.length;
            night.hand.flirt.minTurn = 6 + Math.floor(rand(night) * 3);
        }
        night.hand.glitchFrom = 6 + Math.floor(rand(night) * 3);
    }
    night.last = null;
    return night.hand;
}

export const top = h => h.discard[h.discard.length - 1];

export const current = h => h.seats[h.turn];

export function seatAfter(h, seat, steps = 1) {
    const i = h.seats.indexOf(seat);
    return h.seats[((i + h.dir * steps) % h.seats.length + h.seats.length) % h.seats.length];
}

export function canPlay(h, id, hand = h.hands[current(h)]) {
    if (id === h.glitch) return h.suit === "white" || h.glitchAnywhere;
    const c = CARDS[id], t = CARDS[top(h)];
    if (c.kind === "wild") return true;
    if (c.kind === "wild4") return !hand.some((x => x !== id && CARDS[x].suit === h.suit));
    if (c.suit === h.suit) return true;
    if (c.kind === "num") return t.kind === "num" && t.n === c.n;
    return c.kind === t.kind;
}

export const legalCards = (h, seat = current(h)) => h.hands[seat].filter((id => canPlay(h, id, h.hands[seat])));

export const heldCount = (h, seat) => (h?.hands?.[seat]?.length ?? 0) + (seat === "you" && h?.flirt?.held ? 1 : 0);

const flirtOnTop = h => !!h.flirt && !h.flirt.held && h.flirt.pos != null && h.flirt.pos >= h.deck.length;

export const FLIRT_DEMO_ODDS = .3;

const flirtDue = (night, h) => flirtOnTop(h) && (h.flirt.minTurn == null || h.turns >= h.flirt.minTurn && rand(night) < FLIRT_DEMO_ODDS);

function pullFromDeck(h, i) {
    const [id] = h.deck.splice(i, 1);
    if (h.flirt?.pos != null && i < h.flirt.pos) h.flirt.pos--;
    return id;
}

function takeCards(night, seat, k) {
    const h = night.hand, got = [];
    for (let i = 0; i < k; i++) {
        if (seat === "you" && flirtDue(night, h)) {
            h.flirt.held = true;
            h.flirt.pos = null;
            got.flirt = true;
            continue;
        }
        if (!h.deck.length) {
            const keep = h.discard.pop();
            h.deck = shuffle(night, h.discard);
            h.discard = [ keep ];
            if (h.flirt?.pos != null) h.flirt.pos = Math.floor(rand(night) * (h.deck.length + 1));
            if (!h.deck.length) break;
            if (seat === "you" && flirtDue(night, h)) {
                h.flirt.held = true;
                h.flirt.pos = null;
                got.flirt = true;
                continue;
            }
        }
        got.push(h.deck.pop());
        if (h.flirt?.pos != null && h.flirt.pos > h.deck.length) h.flirt.pos = h.deck.length;
    }
    h.hands[seat].push(...got);
    if (heldCount(h, seat) > 1) h.called[seat] = false;
    return got;
}

export function drawOne(night) {
    const h = night.hand, seat = current(h);
    if (seat === "you") {
        if (h.suit && !night.lacks.includes(h.suit)) night.lacks.push(h.suit);
    }
    h.exposed = null;
    const got = takeCards(night, seat, 1), [id] = got;
    h.drawn = id != null && canPlay(h, id) ? id : null;
    return {
        id: id ?? null,
        playable: h.drawn != null,
        flirt: !!got.flirt
    };
}

export const GLITCH_SEVENS = Object.freeze(CARDS.filter((c => c.suit === "white" && c.kind === "num" && c.n === 7)).map((c => c.id)));

export function plantGlitch(night) {
    const h = night.hand;
    if (!h || night.glitched || h.glitch != null || current(h) !== "you") return null;
    const i = h.deck.findIndex((id => GLITCH_SEVENS.includes(id)));
    if (i < 0) return null;
    const id = pullFromDeck(h, i);
    h.deck.push(id);
    h.glitch = id;
    night.glitched = true;
    return id;
}

export function clearBadBlood(night) {
    if (night.astrid.mood === "sour") {
        night.astrid.mood = "warm";
        night.astrid.left = 0;
    }
    if (night.hand) night.hand.grudge = null;
}

export function canFlirt(night) {
    const h = night.hand;
    if (!h?.flirt?.held || h.winner || current(h) !== "you" || h.drawn != null || h.flirt.turn === h.turns) return null;
    const t = seatAfter(h, "you");
    return GIRLS.includes(t) && h.flirt.at !== t && !h.flirt.off.includes(t) ? t : null;
}

export function flirt(night) {
    const target = canFlirt(night);
    if (!target) return null;
    const h = night.hand, f = h.flirt, snubbed = f.at;
    if (snubbed) {
        f.off.push(snubbed);
        h.grudge = {
            ...h.grudge || {},
            [snubbed]: GRUDGE_TURNS
        };
        if (snubbed === "astrid") {
            night.astrid.mood = "sour";
            night.astrid.left = 3;
        }
    }
    f.at = target;
    f.turn = h.turns;
    if (h.grudge?.[target]) h.grudge[target] = 0;
    if (target === "astrid" && night.astrid.mood !== "warm") {
        night.astrid.mood = "warm";
        night.astrid.left = 0;
    }
    f.held = false;
    const drew = takeCards(night, "you", 1);
    f.pos = Math.floor(rand(night) * h.deck.length);
    h.exposed = null;
    return {
        target: target,
        snubbed: snubbed,
        drew: drew
    };
}

export function pass(night) {
    const h = night.hand;
    clearSmoke(h, current(h));
    coolGrudges(h, current(h));
    h.drawn = null;
    h.turn = h.seats.indexOf(seatAfter(h, current(h)));
    h.turns++;
}

export const canCallLast = (night, seat) => {
    const h = night.hand;
    return !!h && heldCount(h, seat) === 2 && current(h) === seat && legalCards(h, seat).length > 0;
};

export function callLast(night, seat) {
    const h = night.hand, n = heldCount(h, seat);
    if (canCallLast(night, seat)) {
        h.called[seat] = true;
        return true;
    }
    if (n === 1 && h.exposed === seat) {
        h.called[seat] = true;
        h.exposed = null;
        return true;
    }
    return false;
}

export function catchOut(night, seat) {
    const h = night.hand;
    if (h.exposed !== seat) return null;
    h.exposed = null;
    return takeCards(night, seat, 2);
}

export function playCard(night, id, suit = null) {
    const h = night.hand, seat = current(h), hand = h.hands[seat];
    if (!hand.includes(id)) throw new Error("Not in that hand.");
    if (!canPlay(h, id, hand)) throw new Error("That card does not play.");
    const c = CARDS[id];
    if (c.suit === null && !SUITS.includes(suit)) throw new Error("Name a suit.");
    hand.splice(hand.indexOf(id), 1);
    h.discard.push(id);
    clearSmoke(h, seat);
    coolGrudges(h, seat);
    h.suit = c.suit ?? suit;
    h.drawn = null;
    h.exposed = null;
    const glitch = id === h.glitch;
    if (glitch) h.glitch = null;
    const left = heldCount(h, seat);
    const ev = {
        seat: seat,
        id: id,
        kind: c.kind,
        suit: h.suit,
        glitch: glitch,
        target: null,
        drew: [],
        lastCall: left === 1 ? h.called[seat] ? "called" : "forgot" : null
    };
    if (left === 1 && !h.called[seat]) h.exposed = seat;
    if (c.kind === "rev") h.dir *= -1;
    if (!left) {
        h.winner = seat;
        h.exposed = null;
    }
    let step = 1;
    const next = seatAfter(h, seat);
    if (c.kind === "skip" || c.kind === "rev" && h.seats.length === 2) {
        ev.target = next;
        step = 2;
    }
    if (c.kind === "draw2" || c.kind === "wild4") {
        ev.target = next;
        if (!h.winner) ev.drew = takeCards(night, next, c.kind === "draw2" ? 2 : 4);
        step = 2;
    }
    if (c.kind === "rev") ev.target = h.seats.length === 2 ? next : null;
    if (!h.winner) {
        h.turn = h.seats.indexOf(seatAfter(h, seat, step));
        h.turns++;
    }
    if (seat === "you" && ev.target && GIRLS.includes(ev.target) && ev.kind !== "rev") {
        h.grudge = {
            ...h.grudge || {},
            [ev.target]: GRUDGE_TURNS
        };
        if (h.flirt?.at === ev.target) {
            h.flirt.at = null;
            h.flirt.off.push(ev.target);
            ev.heartbreak = ev.target;
        }
    }
    noteHit(night, ev);
    return ev;
}

function noteHit(night, ev) {
    const a = night.astrid;
    if (ev.seat === "you" && ev.target === "astrid") {
        a.mood = "sour";
        a.left = 3;
        return;
    }
    if (ev.seat === "astrid" && a.mood === "sour" && a.left > 0) {
        a.left--;
        if (a.left === 0) a.mood = "sorry";
    }
}

export function astridMakesUp(night) {
    const a = night.astrid;
    if (a.mood !== "sorry") return 0;
    const gift = Math.min(night.bank.astrid, Math.round(TABLES[night.table].buyIn * .08));
    night.bank.astrid -= gift;
    night.bank.you += gift;
    a.mood = "warm";
    a.left = 0;
    return gift;
}

export const BRIBE_RATE = .15;

export const SMOKE_TURNS = 2;

export const GRUDGE_TURNS = 3;

export const bribePrice = night => Math.max(1, Math.round(TABLES[night.table].buyIn * BRIBE_RATE));

const BRIBE_WANTS = {
    astrid: {
        test: c => c.kind === "skip",
        k: 2
    }
};

function clearSmoke(h, seat) {
    if (h.smoke?.[seat] > 0) h.smoke[seat]--;
}

function coolGrudges(h, seat) {
    if (seat !== "you" || !h.grudge) return;
    for (const g of Object.keys(h.grudge)) if (h.grudge[g] > 0) h.grudge[g]--;
}

function bribeSources(night, girl) {
    const h = night.hand, want = BRIBE_WANTS[girl];
    if (!want) return [];
    const pool = [ ...h.deck.map((id => ({
        from: "deck",
        id: id
    }))), ...h.discard.slice(0, -1).map((id => ({
        from: "discard",
        id: id
    }))), ...h.hands[girl].length > 2 ? h.hands[girl].map((id => ({
        from: "girl",
        id: id
    }))) : [] ];
    const pick = test => pool.filter((p => test(CARDS[p.id])));
    let got = pick(want.test);
    if (!got.length && want.fallback) got = pick(want.fallback);
    const fromGirl = got.filter((p => p.from === "girl")).slice(0, Math.max(0, h.hands[girl].length - 2));
    return [ ...got.filter((p => p.from !== "girl")), ...fromGirl ].slice(0, want.k);
}

export function bribeBlock(night, girl) {
    const h = night.hand;
    if (!h || h.winner) return "No hand in play.";
    if (current(h) !== "you") return "Wait for your turn.";
    if (h.bribed) return "One bribe a hand.";
    if (!GIRLS.includes(girl) || !h.seats.includes(girl)) return "She already left.";
    if (h.grudge?.[girl] > 0) return `You hit her. She won't help for ${h.grudge[girl]} more turn${h.grudge[girl] === 1 ? "" : "s"}.`;
    if (night.bank.you < bribePrice(night)) return "You can't cover it.";
    if (BRIBE_WANTS[girl] && !bribeSources(night, girl).length) return "Nothing left for her to slip you.";
    return "";
}

export function bribe(night, girl) {
    if (bribeBlock(night, girl)) return null;
    const h = night.hand, price = bribePrice(night);
    night.bank.you -= price;
    night.bank[girl] += price;
    h.bribed = girl;
    const out = {
        girl: girl,
        price: price,
        given: [],
        smoke: false,
        dealt: null
    };
    if (girl === "eve") {
        h.smoke = Object.fromEntries(h.seats.filter((s => s !== "you")).map((s => [ s, SMOKE_TURNS ])));
        out.smoke = true;
        return out;
    }
    if (girl === "belle") {
        out.dealt = Object.fromEntries(h.seats.map((s => [ s, takeCards(night, s, 1) ])));
        out.given = out.dealt.you || [];
        h.exposed = null;
        return out;
    }
    for (const p of bribeSources(night, girl)) {
        if (p.from === "deck") pullFromDeck(h, h.deck.indexOf(p.id)); else {
            const list = p.from === "discard" ? h.discard : h.hands[girl];
            list.splice(list.indexOf(p.id), 1);
        }
        h.hands.you.push(p.id);
        out.given.push(p.id);
    }
    if (heldCount(h, "you") > 1) h.called.you = false;
    return out;
}

export function settleHand(night) {
    const h = night.hand, t = TABLES[night.table];
    if (!h?.winner) return null;
    const paid = {};
    let pot = 0;
    for (const s of h.seats) {
        if (s === h.winner) continue;
        const owe = Math.min(night.bank[s], Math.round(handPoints(h.hands[s]) * t.rate));
        night.bank[s] -= owe;
        paid[s] = owe;
        pot += owe;
    }
    night.bank[h.winner] += pot;
    const broke = h.seats.filter((s => s !== "you" && night.bank[s] <= 0));
    night.out.push(...broke);
    night.handNo++;
    const heart = GIRLS.includes(h.flirt?.at) ? h.flirt.at : null;
    night.last = {
        winner: h.winner,
        paid: paid,
        pot: pot,
        broke: broke,
        heart: heart
    };
    night.hand = null;
    night.done = night.bank.you <= 0 || night.handNo >= HANDS_PER_NIGHT || GIRLS.every((g => night.out.includes(g)));
    return night.last;
}

export const cashOut = night => Math.max(0, Math.min(night.bank.you, TABLES[night.table].cap));

export const WIN_MULT = 4;

export function creditsFor(tableId, chips) {
    const t = TABLES[tableId];
    if (!t) return 0;
    const c = Math.max(0, Math.min(Math.round(chips) || 0, t.cap));
    return c <= t.buyIn ? c : t.buyIn + WIN_MULT * (c - t.buyIn);
}

export function foldChips(night) {
    const t = TABLES[night.table];
    const holding = night.hand?.hands?.you ? Math.round(handPoints(night.hand.hands.you) * t.rate) : 0;
    return Math.max(0, Math.min(night.bank.you - holding, t.cap));
}

export const CATCH = {
    belle: {
        p: .55,
        ms: 1100
    },
    eve: {
        p: .75,
        ms: 900
    },
    astrid: {
        p: .6,
        ms: 1300
    }
};

export const FORGET = {
    belle: .14,
    eve: .04,
    astrid: .08
};

export function willCatch(night, catcher, exposed) {
    if (catcher === "astrid" && exposed === "you") {
        if (night.astrid.mood === "warm" || night.astrid.mood === "sorry") return false;
        return true;
    }
    return rand(night) < CATCH[catcher].p;
}

export const forgets = (night, seat) => rand(night) < FORGET[seat];

function mostHeldSuit(hand, avoid = []) {
    const n = {
        red: 0,
        blue: 0,
        black: 0,
        white: 0
    };
    for (const id of hand) if (CARDS[id].suit) n[CARDS[id].suit] += 1 + points(id) / 40;
    return SUITS.filter((s => !avoid.includes(s))).sort(((a, b) => n[b] - n[a]))[0] || "red";
}

function leader(h, self) {
    return h.seats.filter((s => s !== self)).sort(((a, b) => h.hands[a].length - h.hands[b].length))[0];
}

export function chooseMove(night, seat, {noAttack: noAttack = false} = {}) {
    const h = night.hand, hand = h.hands[seat];
    let legal = hand.filter((id => canPlay(h, id, hand)));
    if (h.flirt?.at === seat && seatAfter(h, seat) === "you") noAttack = true;
    if (noAttack && legal.some((id => !isAttack(id)))) legal = legal.filter((id => !isAttack(id)));
    if (!legal.length) return null;
    if (h.smoke?.[seat] > 0) {
        const id = legal[Math.floor(rand(night) * legal.length)];
        return {
            id: id,
            suit: CARDS[id].suit === null ? SUITS[Math.floor(rand(night) * SUITS.length)] : null
        };
    }
    const next = seatAfter(h, seat), prev = seatAfter(h, seat, -1);
    const nextN = h.hands[next].length;
    const lead = leader(h, seat);
    const mood = night.astrid.mood;
    const score = id => {
        const c = CARDS[id];
        let v = points(id) / 20 + rand(night) * .6;
        const attack = isAttack(id);
        if (c.suit === null) v -= hand.length > 3 ? 2.2 : -.5;
        if (seat === "belle") {
            if (attack) v += 2.5 + (nextN <= 3 ? 2 : 0);
            if (c.kind === "wild4") v += 3;
            if (c.kind === "rev" && h.hands[prev].length > nextN) v += 1;
        }
        if (seat === "eve") {
            if (attack) v += next === lead || nextN <= 3 ? 3.5 : -1.2;
            if (c.kind === "rev" && nextN <= 2 && h.hands[prev].length > 2) v += 3;
            if (c.kind === "num") v += points(id) / 10;
        }
        if (seat === "astrid") {
            const atYou = next === "you";
            if (attack) v += atYou ? mood === "sour" ? 5 : mood === "sorry" ? -5 : -2 : 1.8;
            if (c.kind === "rev") v += mood === "sour" ? prev === "you" ? -1 : 1 : atYou ? 1.5 : 0;
        }
        return v;
    };
    const best = legal.map((id => [ id, score(id) ])).sort(((a, b) => b[1] - a[1]))[0][0];
    let suit = null;
    if (CARDS[best].suit === null) {
        const rest = hand.filter((x => x !== best));
        suit = mostHeldSuit(rest);
        if (seat === "astrid" && next === "you" && mood === "sour") {
            const mean = night.lacks.find((s => rest.some((x => CARDS[x].suit === s))));
            if (mean) suit = mean;
        }
        if (seat === "astrid" && mood === "sorry" && h.hands.you) suit = mostHeldSuit(h.hands.you);
    }
    return {
        id: best,
        suit: suit
    };
}

export function cleanNoirSnap(raw, tableId) {
    try {
        const t = TABLES[tableId];
        if (!t || !raw || typeof raw !== "object" || raw.table !== tableId) return null;
        const int = v => Number.isFinite(v) ? Math.trunc(v) : 0;
        const n = {
            table: tableId,
            handNo: Math.max(0, Math.min(HANDS_PER_NIGHT, int(raw.handNo))),
            rng: int(raw.rng) >>> 0,
            bank: {},
            out: (Array.isArray(raw.out) ? raw.out : []).filter((g => GIRLS.includes(g))).filter(((g, i, a) => a.indexOf(g) === i)),
            astrid: {
                mood: [ "warm", "sour", "sorry" ].includes(raw.astrid?.mood) ? raw.astrid.mood : "warm",
                left: Math.max(0, Math.min(12, int(raw.astrid?.left)))
            },
            glitched: raw.glitched === true,
            tips: (Array.isArray(raw.tips) ? raw.tips : []).filter((k => typeof k === "string" && /^[a-z]{1,12}$/.test(k))).filter(((k, i, a) => a.indexOf(k) === i)).slice(0, 12),
            lacks: (Array.isArray(raw.lacks) ? raw.lacks : []).filter((s => SUITS.includes(s))).filter(((s, i, a) => a.indexOf(s) === i)),
            hand: null,
            last: null,
            done: raw.done === true,
            order: Array.isArray(raw.order) && raw.order.length === GIRLS.length && [ ...raw.order ].sort().join() === [ ...GIRLS ].sort().join() ? [ ...raw.order ] : null
        };
        const total = t.buyIn * SEATS.length;
        let sum = 0;
        for (const s of SEATS) {
            n.bank[s] = Math.max(0, Math.min(total, int(raw.bank?.[s])));
            sum += n.bank[s];
        }
        if (sum > total) return null;
        if (raw.hand) {
            const rh = raw.hand;
            const seats = [ "you", ...seating(n).filter((s => !n.out.includes(s))) ];
            if (!Array.isArray(rh.seats) || rh.seats.join() !== seats.join()) return null;
            const ids = arr => Array.isArray(arr) ? arr.filter(Number.isInteger) : [];
            const hands = Object.fromEntries(seats.map((s => [ s, ids(rh.hands?.[s]) ])));
            const deck = ids(rh.deck), discard = ids(rh.discard);
            const all = [ ...deck, ...discard, ...Object.values(hands).flat() ];
            if (all.length !== CARDS.length || new Set(all).size !== CARDS.length || all.some((id => id < 0 || id >= CARDS.length)) || !discard.length) return null;
            n.hand = {
                seats: seats,
                deck: deck,
                discard: discard,
                hands: hands,
                suit: SUITS.includes(rh.suit) ? rh.suit : CARDS[discard[discard.length - 1]].suit || "red",
                turn: Math.max(0, Math.min(seats.length - 1, int(rh.turn))),
                dir: rh.dir === -1 ? -1 : 1,
                called: Object.fromEntries(seats.map((s => [ s, rh.called?.[s] === true ]))),
                exposed: seats.includes(rh.exposed) && hands[rh.exposed].length + (rh.exposed === "you" && rh.flirt?.held === true ? 1 : 0) === 1 ? rh.exposed : null,
                drawn: Number.isInteger(rh.drawn) && hands[seats[int(rh.turn)]]?.includes(rh.drawn) ? rh.drawn : null,
                winner: null,
                turns: Math.max(0, int(rh.turns)),
                bribed: GIRLS.includes(rh.bribed) && seats.includes(rh.bribed) ? rh.bribed : null,
                grudge: rh.grudge && typeof rh.grudge === "object" ? Object.fromEntries(GIRLS.filter((g => seats.includes(g))).map((g => [ g, Math.max(0, Math.min(GRUDGE_TURNS, int(rh.grudge[g]))) ]))) : null,
                smoke: rh.smoke && typeof rh.smoke === "object" ? Object.fromEntries(seats.filter((s => s !== "you")).map((s => [ s, Math.max(0, Math.min(SMOKE_TURNS, int(rh.smoke[s]))) ]))) : null,
                glitch: GLITCH_SEVENS.includes(rh.glitch) && hands.you.includes(rh.glitch) ? rh.glitch : null,
                glitchFrom: Number.isFinite(rh.glitchFrom) ? Math.trunc(rh.glitchFrom) : undefined,
                glitchAnywhere: rh.glitchAnywhere === true,
                flirt: (() => {
                    const f = rh.flirt && typeof rh.flirt === "object" ? rh.flirt : {};
                    const off = (Array.isArray(f.off) ? f.off : []).filter((g => GIRLS.includes(g) && seats.includes(g))).filter(((g, i, a) => a.indexOf(g) === i));
                    const at = GIRLS.includes(f.at) && seats.includes(f.at) && !off.includes(f.at) ? f.at : null;
                    const held = f.held === true, pos = !held && Number.isInteger(f.pos) && f.pos >= 0 && f.pos <= deck.length ? f.pos : null;
                    return {
                        held: held,
                        pos: pos,
                        at: at,
                        off: off,
                        turn: Number.isFinite(f.turn) ? Math.trunc(f.turn) : -1,
                        ...Number.isFinite(f.minTurn) ? {
                            minTurn: Math.trunc(f.minTurn)
                        } : {}
                    };
                })()
            };
        }
        if (raw.last && typeof raw.last === "object" && SEATS.includes(raw.last.winner)) {
            n.last = {
                winner: raw.last.winner,
                paid: {},
                pot: Math.max(0, int(raw.last.pot)),
                broke: (raw.last.broke || []).filter((g => GIRLS.includes(g))),
                heart: GIRLS.includes(raw.last.heart) ? raw.last.heart : null
            };
            for (const s of SEATS) if (Number.isFinite(raw.last.paid?.[s])) n.last.paid[s] = Math.max(0, int(raw.last.paid[s]));
        }
        return n;
    } catch {
        return null;
    }
}
