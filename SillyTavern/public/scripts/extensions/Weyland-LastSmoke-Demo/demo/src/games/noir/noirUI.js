import * as R from "../../core/rules.js";

import { TUNING } from "../../core/config.js";

import { NOIR_SKIN } from "../../ui/skins.js";

import * as E from "./engine.js";

import * as L from "./noirLines.js";

import { bustUrl, artUrl, envUrl, uiUrl, allArt } from "./noirArt.js";

import * as HT from "./noirHearts.js";

import { playScene } from "./noirScene.js";

import { DEMO_COPY } from "./demoCopy.js";

const W = 360, H = 640;

const el = (tag, className = "", props = {}) => Object.assign(document.createElement(tag), {
    className: className,
    ...props
});

const GLYPH = {
    skip: "⊘",
    rev: "⇄",
    draw2: "+2",
    wild: "?",
    wild4: "+4",
    flirt: "♥"
};

const SLAM = {
    skip: "SKIPPED!",
    rev: "REVERSE!",
    draw2: "DRAW 2!",
    wild: "WILD!",
    wild4: "WILD DRAW 4!"
};

function lettering(text) {
    const out = [];
    for (const part of text.split(/(\*\*\*[^*]+\*\*\*|\*[^*]+\*)/)) {
        if (!part) continue;
        if (/^\*\*\*[^*]+\*\*\*$/.test(part)) {
            out.push(el("b", "nr-stress", {
                textContent: part.slice(3, -3)
            }));
            continue;
        }
        if (/^\*[^*]+\*$/.test(part)) {
            out.push(el("i", "nr-aside", {
                textContent: part.slice(1, -1)
            }));
            continue;
        }
        for (const bit of part.split(/(\b[A-Z][A-Z']*[A-Z]\b)/)) {
            if (!bit) continue;
            out.push(/^[A-Z][A-Z']*[A-Z]$/.test(bit) ? el("b", "nr-yell", {
                textContent: bit
            }) : document.createTextNode(bit));
        }
    }
    return out;
}

export const ANSI = {
    L: [ "██╗     ", "██║     ", "██║     ", "██║     ", "███████╗", "╚══════╝" ],
    A: [ " █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝" ],
    S: [ "███████╗", "██╔════╝", "███████╗", "╚════██║", "███████║", "╚══════╝" ],
    T: [ "████████╗", "╚══██╔══╝", "   ██║   ", "   ██║   ", "   ██║   ", "   ╚═╝   " ],
    M: [ "███╗   ███╗", "████╗ ████║", "██╔████╔██║", "██║╚██╔╝██║", "██║ ╚═╝ ██║", "╚═╝     ╚═╝" ],
    O: [ " ██████╗ ", "██╔═══██╗", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ " ],
    K: [ "██╗  ██╗", "██║ ██╔╝", "█████╔╝ ", "██╔═██╗ ", "██║  ██╗", "╚═╝  ╚═╝" ],
    E: [ "███████╗", "██╔════╝", "█████╗  ", "██╔══╝  ", "███████╗", "╚══════╝" ],
    " ": [ "   ", "   ", "   ", "   ", "   ", "   " ]
};

const ARMS = {
    "═": "LR",
    "║": "UD",
    "╗": "LD",
    "╔": "RD",
    "╝": "LU",
    "╚": "RU"
};

const EMBER = [ [ 0, "#3a0d14" ], [ .25, "#6e1420" ], [ .5, "#d1263a" ], [ .72, "#e8622a" ], [ .9, "#efeadf" ] ];

let logoN = 0;

export function ansiLogo(words) {
    const CW = 6, CH = 12, cx = 3, cy = 6, d = 1.5;
    const rows = words.map((w => [ 0, 1, 2, 3, 4, 5 ].map((r => [ ...w ].map((ch => ANSI[ch][r])).join("")))));
    const cols = Math.max(...rows.map((r => [ ...r[0] ].length)));
    const parts = [], defs = [], hot = [];
    const id = `nr-ember-${++logoN}`;
    rows.forEach(((_, wi) => {
        const top = wi * 7 * CH;
        const stops = EMBER.flatMap((([at, col], i) => [ `<stop offset="${at}" stop-color="${col}"/>`, `<stop offset="${EMBER[i + 1]?.[0] ?? 1}" stop-color="${col}"/>` ])).join("");
        defs.push(`<linearGradient id="${id}-${wi}" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${top + 6 * CH}">${stops}</linearGradient>`);
    }));
    rows.forEach(((word, wi) => word.forEach(((line, r) => {
        const chars = [ ...line ];
        const x0 = Math.floor((cols - chars.length) / 2) * CW, y = (wi * 7 + r) * CH;
        let rects = "", path = "";
        chars.forEach(((ch, i) => {
            const X = x0 + i * CW;
            if (ch === "█") {
                rects += `<rect x="${X}" y="${y}" width="${CW}" height="${CH - 1}"/>`;
                if (r >= 4 && hash(`${wi}.${r}.${i}`) % 5 === 0) hot.push(`<rect x="${X}" y="${y + 6}" width="${CW}" height="${CH - 7}" style="animation-delay:${-(hash(`${i}${r}`) % 23) / 10}s"/>`);
                return;
            }
            const arms = ARMS[ch];
            if (!arms) return;
            if (arms === "LR") {
                path += `M${X} ${y + cy - d}h${CW}M${X} ${y + cy + d}h${CW}`;
                return;
            }
            if (arms === "UD") {
                path += `M${X + cx - d} ${y}v${CH}M${X + cx + d} ${y}v${CH}`;
                return;
            }
            const sx = arms[0] === "L" ? -1 : 1, sy = arms[1] === "U" ? -1 : 1;
            const hx = sx < 0 ? X : X + CW, vy = sy < 0 ? y : y + CH;
            for (const k of [ -1, 1 ]) path += `M${hx} ${y + cy + k * sy * d}H${X + cx + k * sx * d}V${vy}`;
        }));
        parts.push(`<g fill="url(#${id}-${wi})">${rects}</g><path class="nr-logo-shadow" d="${path}"/>`);
    }))));
    const svg = `<svg viewBox="-1 -1 ${cols * CW + 2} ${(rows.length * 7 - 1) * CH + 2}" shape-rendering="crispEdges" aria-hidden="true"><defs>${defs.join("")}</defs>${parts.join("")}<g class="nr-logo-hot">${hot.join("")}</g></svg>`;
    const box = el("div", "nr-logo", {
        role: "img",
        ariaLabel: words.map((w => w[0] + w.slice(1).toLowerCase())).join(" ")
    });
    box.innerHTML = svg;
    return box;
}

export function splitActs(text) {
    const acts = [];
    const said = text.replace(/\*\*\*([^*]+)\*\*\*/g, "$1").replace(/\*([^*]+)\*/g, ((_, a) => {
        acts.push(a.trim());
        return " ";
    })).replace(/\s{2,}/g, " ").trim().replace(/\u0001([^\u0002]*)\u0002/g, "***$1***");
    return {
        acts: acts,
        said: said
    };
}

const spoken = pool => pool.filter((t => splitActs(t).said));

const asideMs = text => Math.max(4500, 2500 + text.length * 60);

const YOU_GRACE_MS = 3300;

const GLITCH_CHANCE = .05;

const DEMO_GLITCH_ODDS = .2;

const pixelSvg = (rows, cls) => {
    const px = [];
    rows.forEach(((row, y) => [ ...row ].forEach(((ch, x) => {
        if (ch !== ".") px.push(`<rect x="${x}" y="${y}" width="1" height="1"${ch === "o" ? ' class="hi"' : ""}/>`);
    }))));
    return `<svg class="${cls}" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${px.join("")}</svg>`;
};

const HEART_ROWS = [ ".XX...XX.", "XoXX.XXXX", "XoXXXXXXX", "XXXXXXXXX", ".XXXXXXX.", "..XXXXX..", "...XXX...", "....X...." ];

const BOLT_ROWS = [ "...XXX", "..XXX.", ".XXX..", "XXXXXX", "..XXX.", ".XXX..", ".XX...", "XX....", "X....." ];

const heartSvg = cls => pixelSvg(HEART_ROWS, cls);

const nightTrack = n => n.handNo >= E.HANDS_PER_NIGHT - 1 ? "noir-last" : "noir";

const GIRLS_HIT = ev => !!ev.target && ev.target !== "you";

const hash = s => {
    let h = 2166136261;
    for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
};

export function openNoir(app) {
    if (app.demo) return showDemoTitle(app);
    const r = app.s.games.noir.round;
    if (r && !r.settled) return startNight(app, r.levelId);
    return showLobby(app, {
        intro: true
    });
}

const TITLE_W = 941, TITLE_H = 1672;

const TITLE_STRIPS = [ [ "title-window-rain_8f.png", 8, 0, 542, 296, 302, 8 ], [ "title-eve-smoke_6f.png", 6, 4, 599, 111, 182, 2 ], [ "title-astrid-smoke_6f.png", 6, 821, 605, 119, 190, 2 ], [ "title-ashtray-smoke_8f.png", 8, 466, 870, 126, 163, 2 ] ];

const HOOKAH = {
    x: 615,
    y: 675,
    puffs: 4
};

const preloaded = new Set;

function preload(urls) {
    for (const u of urls) {
        if (preloaded.has(u)) continue;
        preloaded.add(u);
        const i = new Image;
        i.decoding = "async";
        i.src = u;
    }
}

const TABLE_ART = {
    dime: "table-dime.avif",
    dollar: "table-booth.avif",
    velvet: "table-velvet.avif"
};

const pct = (v, of) => `${(v / of * 100).toFixed(3)}%`;

export function titleScene() {
    const box = el("div", "nr-title", {
        ariaHidden: "true"
    });
    box.append(el("img", "nr-title-art", {
        src: envUrl("title-bar.avif"),
        alt: "",
        draggable: false
    }));
    for (const [file, frames, x, y, w, h, fps] of TITLE_STRIPS) {
        const s = el("i", "nr-title-fx");
        Object.assign(s.style, {
            left: pct(x, TITLE_W),
            top: pct(y, TITLE_H),
            width: pct(w, TITLE_W),
            height: pct(h, TITLE_H),
            backgroundImage: `url("${envUrl(file)}")`,
            backgroundSize: `${frames * 100}% 100%`,
            animationTimingFunction: `steps(${frames}, jump-none)`,
            animationDuration: `${frames / fps}s`
        });
        box.append(s);
    }
    const r = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < HOOKAH.puffs; i++) {
        const p = el("i", "nr-puff");
        const secs = r(11, 17), w = r(3.5, 6.5);
        Object.assign(p.style, {
            left: pct(HOOKAH.x + r(-6, 6), TITLE_W),
            top: pct(HOOKAH.y, TITLE_H),
            width: `${w.toFixed(2)}cqw`,
            margin: `${(-w / 2).toFixed(2)}cqw 0 0 ${(-w / 2).toFixed(2)}cqw`,
            animationDuration: `${secs.toFixed(2)}s`,
            animationDelay: `${(-Math.random() * secs).toFixed(2)}s`
        });
        p.style.setProperty("--rise", `${(r(140, 230) / TITLE_H * 100).toFixed(2)}cqh`);
        p.style.setProperty("--dx", `${((Math.random() < .5 ? -1 : 1) * r(.6, 3.2)).toFixed(2)}cqw`);
        p.style.setProperty("--peak", r(.45, .85).toFixed(2));
        box.append(p);
    }
    return box;
}

function brandHeader(layer) {
    const title = layer?.querySelector(".game-head strong");
    if (!title) return;
    const logo = ansiLogo([ "LAST SMOKE" ]);
    logo.classList.add("nr-headlogo");
    title.replaceChildren(logo);
}

function musicButton(app, cls) {
    const b = el("button", `nr-musicbtn ${cls}`, {
        type: "button",
        textContent: "♪"
    });
    const on = () => app.s.games.noir.music !== false;
    const paint = () => {
        b.classList.toggle("off", !on());
        b.setAttribute("aria-pressed", String(on()));
        b.title = b.ariaLabel = on() ? "Music on (tap to turn off)" : "Music off (tap to turn on)";
    };
    b.onclick = e => {
        e.stopPropagation();
        app.audio.tap();
        app.s.games.noir.music = !on();
        app.store.changed("noir music");
        if (on() && app.musicFor) app.music?.play(app.musicFor); else if (!on()) app.music?.stop();
        paint();
    };
    paint();
    return b;
}

function tutorialButton(app) {
    const b = el("button", "nr-topbtn nr-tutorialbtn", {
        type: "button"
    });
    const paint = () => {
        const skip = !!app.skipTutorial;
        b.textContent = skip ? DEMO_COPY.tutorialOff : DEMO_COPY.tutorialOn;
        b.classList.toggle("off", skip);
        b.setAttribute("aria-pressed", String(!skip));
        b.title = b.ariaLabel = skip ? "Tutorial messages off (tap to turn on)" : "Tutorial messages on (tap to skip them)";
    };
    b.onclick = e => {
        e.stopPropagation();
        app.audio.tap();
        app.setSkipTutorial(!app.skipTutorial);
        paint();
    };
    paint();
    return b;
}

function showLobby(app, {intro: intro = false} = {}) {
    app.musicFor = "noir-lobby";
    const {stage: stage} = app.gameLayer("Last Smoke", {
        onPause: () => app.endGameLayer(),
        skin: NOIR_SKIN
    });
    const game = {
        kind: "noir-lobby",
        instance: null,
        showPause: () => document.addEventListener("visibilitychange", (function back() {
            if (document.hidden) return;
            document.removeEventListener("visibilitychange", back);
            if (app.game === game) app.music?.duck(false);
        }))
    };
    app.game = game;
    app.render();
    const root = el("div", intro ? "nr-lobby nr-intro" : "nr-lobby");
    const logo = ansiLogo([ "LAST", "SMOKE" ]);
    const tables = el("div", "nr-tables");
    const t = app.s.stats;
    for (const tb of Object.values(E.TABLES)) {
        const lock = lockReason(app, tb);
        const b = el("button", `nr-tablecard${lock ? " locked" : ""}`, {
            type: "button"
        });
        if (TABLE_ART[tb.id]) b.style.backgroundImage = `url("${envUrl(TABLE_ART[tb.id])}")`;
        b.append(el("strong", "", {
            textContent: tb.name.replace(/^The /, "")
        }), el("span", "nr-buyin", {
            textContent: `${tb.buyIn} cr`
        }), el("small", "", {
            textContent: lock || `house covers ${tb.cap}`
        }));
        b.onclick = () => {
            if (lock) {
                app.audio.deny();
                return app.toast(lock);
            }
            if (app.game?.kind !== "noir-lobby") return;
            app.audio.tap();
            app.handOff((() => startNight(app, tb.id)));
        };
        tables.append(b);
    }
    const top = el("div", "nr-lobby-top");
    const back = el("button", "nr-topbtn", {
        type: "button",
        textContent: "‹",
        ariaLabel: "Leave Last Smoke",
        title: "Leave"
    });
    back.onclick = () => {
        app.audio.tap();
        app.endGameLayer();
    };
    const wallet = el("div", "nr-wallet");
    wallet.setAttribute("aria-label", `Your credits: ${t.credits}. Winnings pay ${E.WIN_MULT} times.`);
    wallet.append(el("i", "nr-chip"), el("strong", "", {
        textContent: t.credits.toLocaleString("en-US")
    }), el("span", "nr-wallet-unit", {
        textContent: "CR"
    }), el("em", "nr-wallet-tag", {
        textContent: `WINS PAY ${E.WIN_MULT}×`
    }));
    const rulesBtn = el("button", "nr-topbtn", {
        type: "button",
        textContent: "?",
        ariaLabel: "House rules",
        title: "House rules"
    });
    rulesBtn.onclick = () => {
        app.audio.tap();
        const sheet = rulesSheet((() => sheet.remove()));
        root.append(sheet);
    };
    const right = el("div", "nr-topright");
    right.append(musicButton(app, "nr-topbtn"), rulesBtn);
    top.append(back, wallet, right);
    const foot = el("div", "nr-lobby-foot");
    foot.append(tables);
    root.append(titleScene(), top, logo, foot);
    stage.append(root);
    preload(allArt());
}

function showDemoTitle(app) {
    app.musicFor = "noir-lobby";
    const {stage: stage} = app.gameLayer("Last Smoke", {
        onPause: () => app.close(),
        skin: NOIR_SKIN
    });
    app.game = {
        kind: "noir-lobby",
        instance: null,
        showPause: () => {}
    };
    app.render();
    const root = el("div", "nr-lobby nr-intro nr-demo");
    const logo = ansiLogo([ "LAST", "SMOKE" ]);
    const top = el("div", "nr-lobby-top");
    const back = el("button", "nr-topbtn", {
        type: "button",
        textContent: "‹",
        ariaLabel: "Leave Last Smoke",
        title: "Leave"
    });
    back.onclick = () => {
        app.audio.tap();
        app.close();
    };
    const rulesBtn = el("button", "nr-topbtn", {
        type: "button",
        textContent: "?",
        ariaLabel: "House rules",
        title: "House rules"
    });
    rulesBtn.onclick = () => {
        app.audio.tap();
        const sheet = rulesSheet((() => sheet.remove()));
        root.append(sheet);
    };
    const right = el("div", "nr-topright");
    right.append(tutorialButton(app), musicButton(app, "nr-topbtn"), rulesBtn);
    top.append(back, el("em", "nr-demo-stamp", {
        textContent: "DEMO"
    }), right);
    const resumable = !!app.s.games.noir.round?.snapshot;
    const tables = el("div", "nr-tables");
    for (const tb of Object.values(E.TABLES)) {
        const open = tb.id === "dime";
        const b = el("button", "nr-tablecard" + (open ? "" : " nr-blur"), {
            type: "button",
            disabled: !open
        });
        if (TABLE_ART[tb.id]) b.style.backgroundImage = 'url("' + envUrl(TABLE_ART[tb.id]) + '")';
        b.append(el("strong", "", {
            textContent: tb.name.replace(/^The /, "")
        }), el("span", "nr-buyin", {
            textContent: tb.buyIn + " cr"
        }), el("small", "", {
            textContent: open ? resumable ? DEMO_COPY.resumeNote : DEMO_COPY.seatNote : "house covers " + tb.cap
        }));
        if (open) b.onclick = () => {
            if (app.game?.kind !== "noir-lobby") return;
            app.audio.tap();
            if (!resumable) app.resetDemo();
            app.handOff((() => startNight(app, "dime")));
        };
        tables.append(b);
    }
    const foot = el("div", "nr-lobby-foot");
    foot.append(tables);
    if (resumable) {
        const fresh = el("button", "nr-btn ghost nr-demo-fresh", {
            type: "button",
            textContent: DEMO_COPY.fresh
        });
        fresh.onclick = () => {
            if (app.game?.kind !== "noir-lobby") return;
            app.audio.tap();
            app.resetDemo();
            app.handOff((() => showDemoTitle(app)));
        };
        foot.append(fresh);
    }
    root.append(titleScene(), top, logo, foot);
    stage.append(root);
    preload(allArt());
}

function lockReason(app, tb) {
    const need = TUNING.games.noir.tableBond[tb.id] ?? 1;
    if (app.s.stats.bond < need) return `Opens at Bond Level ${need}`;
    if (app.s.stats.credits < tb.buyIn) return `Needs ${tb.buyIn} credits`;
    return "";
}

function rulesSheet(close) {
    const s = el("div", "nr-sheet");
    const body = el("div", "nr-sheet-body");
    const rows = [ [ "Match the colour, the number or the symbol on the pile.", null ], [ "Nothing to play? Tap the deck to draw one. If it fits, you can play it.", null ], [ "SKIP", "skip", "The next player loses their turn." ], [ "REVERSE", "rev", "Play turns around the table." ], [ "DRAW 2", "draw2", "The next player draws two and loses their turn." ], [ "WILD", "wild", "Plays on anything. You pick the colour." ], [ "WILD DRAW 4", "wild4", "Pick the colour, and the next player draws four. Only when you hold nothing of the colour in play." ], [ "Down to one card? Hit LAST SMOKE before anyone catches you, or draw two. Catch them first and THEY draw two.", null ], [ "FLIRT", "flirt", "Shuffled into the deck, and only you can draw it. Play it on the next player: it costs you a card, and she won't throw anything at you. Finish the hand without hitting her and she keeps the heart. Flirt with someone else after and the first one is snubbed." ], [ `Walk out ahead and your winnings pay ${E.WIN_MULT}x in credits.`, null ], [ "First one out takes the pot: everyone pays for the cards they still hold (numbers are face value, symbols 20, wilds 50).", null ] ];
    for (const [a, k, b] of rows) {
        const p = el("p", k ? "nr-rule" : "");
        if (k) {
            p.append(el("b", "nr-rule-g", {
                textContent: GLYPH[k]
            }), el("strong", "", {
                textContent: a
            }), el("span", "", {
                textContent: b
            }));
        } else p.textContent = a;
        body.append(p);
    }
    const x = el("button", "nr-btn", {
        type: "button",
        textContent: "Got it"
    });
    x.onclick = () => close();
    s.append(el("h3", "", {
        textContent: "House rules"
    }), body, x);
    return s;
}

function startNight(app, tableId) {
    const r = R.startRound(app.s, {
        gameId: "noir",
        roundId: app.uid(),
        now: app.now(),
        levelId: tableId
    });
    if (!r.ok) return app.blocked(r.reason);
    preload(allArt());
    const round = r.round;
    let night = round.snapshot ? E.cleanNoirSnap(round.snapshot, round.levelId) : null;
    const fresh = !night;
    if (!night) {
        const visited = app.s.games.noir.visited ||= [];
        night = E.newNight(round.levelId, hash(round.id), {
            firstVisit: !app.demo && !visited.includes(round.levelId)
        });
        if (!visited.includes(round.levelId)) visited.push(round.levelId);
    }
    R.saveRoundSnapshot(app.s, "noir", round.id, JSON.parse(JSON.stringify(night)));
    app.store.changed("noir start");
    app.musicFor = nightTrack(night);
    const leave = () => {
        if (show.settled) return app.handOff((() => showLobby(app)));
        show.pause();
        app.endGameLayer();
        app.showResumeCard(app.pausedRound());
    };
    const {stage: stage, layer: layer} = app.gameLayer("Last Smoke", {
        onPause: leave,
        skin: NOIR_SKIN
    });
    brandHeader(layer);
    layer.querySelector(".game-head .game-energy")?.before(musicButton(app, "nr-headbtn"));
    const show = new NoirShow(app, {
        stage: stage,
        round: round,
        night: night,
        fresh: fresh,
        leave: leave
    });
    app.game = {
        kind: "noir",
        instance: show,
        showPause: () => {
            app.endGameLayer();
            app.showResumeCard(app.pausedRound());
        }
    };
    app.render();
    show.run();
}

class NoirShow {
    constructor(app, {stage: stage, round: round, night: night, fresh: fresh, leave: leave}) {
        Object.assign(this, {
            app: app,
            stage: stage,
            round: round,
            night: night,
            fresh: fresh,
            leave: leave
        });
        this.alive = true;
        this.calm = !app.motion();
        this.sleepers = new Set;
        this.timers = [];
        this.waiters = new Set;
        this.tappers = new Set;
        this.queue = [];
        this.teach = !app.s.games.noir.taught;
        this.tipsSeen = new Set(Array.isArray(night.tips) ? night.tips : []);
        this.yourTurns = 0;
        this.lastLine = {};
        this.wrongs = {};
        this.lastFlirt = -9;
        this.banterUsed = new Set;
        this.lastBanterTurn = -99;
        this.girlFlirted = false;
        this.saidTonight = new Set;
        this.hits = {};
        this.courted = new Set;
        this.suspenseHand = -1;
        this.courtHit = null;
        this.egged = null;
        this.skippers = new Set;
        this.karmaHand = -1;
        this.listens = 0;
        this.heartsTonight = [];
        this.dannyHand = -1;
        this.dannyTold = false;
        this.flirtOn = !this.teach || !!app.demo;
        this.inviteWait = {};
        this.build();
        this.onVis = () => {
            if (document.hidden && this.alive && !app.demo) this.leave();
        };
        document.addEventListener("visibilitychange", this.onVis);
    }
    build() {
        const root = this.root = el("div", `nr-root${this.calm ? " calm" : ""}`);
        const scene = this.scene = el("div", "nr-scene");
        const bg = el("div", "nr-bg");
        bg.append(el("i", "nr-rain"), el("i", "nr-smoke"), el("i", "nr-lamp"));
        this.clockEl = el("div", "nr-clock");
        this.tableEl = el("div", "nr-tname", {
            textContent: E.TABLES[this.night.table].name
        });
        this.flowEl = el("div", "nr-flow", {
            ariaLabel: "Direction of play"
        });
        this.flowEl.append(el("i"), el("i"), el("i"));
        const top = el("div", "nr-top");
        top.append(this.clockEl, this.flowEl, this.tableEl);
        this.panels = {};
        const strip = el("div", "nr-strip");
        E.seating(this.night).forEach(((who, pos) => {
            const p = el("div", "nr-panel");
            p.dataset.who = who;
            p.dataset.pos = String(pos);
            const img = el("img", "nr-bust", {
                alt: L.NAMES[who],
                draggable: false
            });
            const name = el("div", "nr-name", {
                textContent: L.NAMES[who].toUpperCase()
            });
            const count = el("div", "nr-count");
            const countN = el("b");
            count.append(el("i", "nr-mini-back"), countN);
            const chips = el("div", "nr-chips");
            const fxLayer = el("div", "nr-pfx");
            const smoke = el("i", `nr-wisp ${who}`);
            const catchBtn = el("button", "nr-catch", {
                type: "button",
                textContent: "CATCH HER!"
            });
            catchBtn.onclick = e => {
                e.stopPropagation();
                this.youCatch?.();
            };
            const heart = el("i", "nr-pheart");
            heart.innerHTML = heartSvg("ph");
            const meter = el("i", "nr-hm");
            meter.append(el("b"));
            p.append(img, smoke, name, count, chips, fxLayer, heart, meter, catchBtn);
            const bubble = el("div", "nr-bubble");
            bubble.dataset.who = who;
            bubble.dataset.pos = String(pos);
            const act = el("div", "nr-act");
            act.dataset.who = who;
            act.dataset.pos = String(pos);
            strip.append(p);
            this.panels[who] = {
                p: p,
                img: img,
                countN: countN,
                chips: chips,
                fxLayer: fxLayer,
                catchBtn: catchBtn,
                bubble: bubble,
                act: act,
                meter: meter
            };
        }));
        this.bubbles = el("div", "nr-bubbles");
        for (const who of E.GIRLS) this.bubbles.append(this.panels[who].act, this.panels[who].bubble);
        this.caption = el("div", "nr-caption");
        this.capName = el("b", "nr-capname");
        this.capText = el("span", "nr-captext");
        this.capGhost = el("span", "nr-capghost", {
            ariaHidden: "true"
        });
        this.capLive = el("span", "nr-caplive");
        this.capText.append(this.capGhost, this.capLive);
        this.caption.append(this.capName, this.capText, el("i", "nr-more"));
        const table = el("div", "nr-table");
        this.deckEl = el("button", "nr-deck", {
            type: "button",
            ariaLabel: "Draw a card"
        });
        this.deckEl.append(el("i", "nr-card back"), el("i", "nr-card back"), el("i", "nr-card back"), this.deckN = el("b", "nr-deckn"));
        this.deckEl.onclick = () => {
            if (this.deckAsTable) {
                this.deckAsTable = false;
                return;
            }
            this.onDeck?.();
        };
        this.pileEl = el("div", "nr-pile");
        this.dirEl = el("div", "nr-dir");
        this.dirEl.append(el("i"), el("i"));
        this.suitEl = el("div", "nr-suit");
        table.append(this.dirEl, this.deckEl, this.pileEl, this.suitEl);
        this.handEl = el("div", "nr-hand");
        this.youChips = el("div", "nr-ychips");
        this.callBtn = el("button", "nr-call", {
            type: "button",
            textContent: "LAST SMOKE",
            disabled: true
        });
        this.callBtn.onclick = () => this.onCall?.();
        this.hint = el("div", "nr-hint");
        this.bribeBtn = el("button", "nr-bribe", {
            type: "button",
            disabled: true
        });
        this.bribeBtn.onclick = e => {
            e.stopPropagation();
            this.onBribe?.();
        };
        const mid = el("div", "nr-mid");
        mid.append(this.hint, this.bribeBtn);
        const bar = el("div", "nr-bar");
        bar.append(this.youChips, mid, this.callBtn);
        this.fx = el("div", "nr-fx");
        this.modal = el("div", "nr-modal");
        this.capAct = el("div", "nr-capact");
        this.povCig = el("div", "nr-povcig");
        const glow = el("i", "cig-glow");
        glow.style.backgroundImage = `url("${uiUrl("pov-cigarette-ember_4f.png")}")`;
        this.povCig.append(el("img", "cig-art", {
            src: uiUrl("pov-cigarette.png"),
            alt: "",
            draggable: false
        }), glow, el("i", "nr-wisp pov"), el("i", "nr-wisp pov b"));
        const capSlot = el("div", "nr-capslot"), capCol = el("div", "nr-capcol");
        capCol.append(this.capAct, this.caption);
        capSlot.append(capCol);
        scene.append(bg, top, strip, this.bubbles, capSlot, table, this.handEl, bar, this.povCig, this.fx, this.modal, el("i", "nr-crt"));
        root.append(scene);
        this.stage.append(root);
        if (typeof ResizeObserver !== "undefined") {
            this.ro = new ResizeObserver((() => {
                if (this.alive) this.renderHand(this.live || []);
            }));
            this.ro.observe(this.handEl);
        }
        scene.addEventListener("pointerdown", (e => {
            const b = e.target.closest("button, .nr-card.live");
            this.deckAsTable = b === this.deckEl && !this.onDeck;
            if (!b || this.deckAsTable) this.tap();
        }));
    }
    sleep(ms, skippable = false) {
        if (!this.alive) return Promise.resolve();
        const dur = this.calm ? ms * .7 : ms;
        return new Promise((res => {
            const done = () => {
                clearTimeout(t);
                this.sleepers.delete(rec);
                res();
            };
            const t = setTimeout(done, dur);
            const rec = {
                done: done,
                skippable: skippable
            };
            this.sleepers.add(rec);
        }));
    }
    skip() {
        for (const s of [ ...this.sleepers ]) if (s.skippable) s.done();
    }
    tap() {
        if (this.typing) {
            this.typing = false;
            return;
        }
        const now = performance.now();
        const top = [ ...this.tappers ].pop();
        if (top) {
            if (now - top.at > 220) top();
            return;
        }
        this.skip();
    }
    tapWait() {
        if (!this.alive) return Promise.resolve();
        const was = this.hint.textContent;
        this.hint.textContent = "Tap to continue";
        this.root.classList.add("waiting");
        return new Promise((res => {
            const rec = () => {
                this.tappers.delete(rec);
                if (!this.tappers.size) {
                    this.root.classList.remove("waiting");
                    if (this.hint.textContent === "Tap to continue") this.hint.textContent = was;
                }
                res();
            };
            rec.at = performance.now();
            this.tappers.add(rec);
        }));
    }
    later(fn, ms) {
        const t = setTimeout((() => {
            if (this.alive) fn();
        }), ms);
        this.timers.push(t);
        return t;
    }
    wait(setup) {
        return new Promise((res => {
            const rec = v => {
                this.waiters.delete(rec);
                res(v);
            };
            this.waiters.add(rec);
            setup(rec);
        }));
    }
    get hand() {
        return this.night.hand;
    }
    present(who) {
        return !this.night.out.includes(who);
    }
    save() {
        if (!this.alive) return;
        R.saveRoundSnapshot(this.app.s, "noir", this.round.id, JSON.parse(JSON.stringify(this.night)));
        this.app.store.changed("noir move");
    }
    sfx(kind) {
        const a = this.app.audio;
        if (!a?.enabled) return;
        if (kind === "card") a.noise({
            dur: .06,
            gain: .08,
            freq: 2600,
            type: "highpass"
        }); else if (kind === "draw") a.noise({
            dur: .09,
            gain: .05,
            freq: 1400,
            type: "bandpass",
            q: 1.2
        }); else if (kind === "slam") {
            a.noise({
                dur: .18,
                gain: .12,
                freq: 300
            });
            a.tone(110, {
                dur: .16,
                type: "square",
                gain: .04,
                slide: .6
            });
        } else if (kind === "chips") for (let i = 0; i < 4; i++) a.tone(1800 + i * 140, {
            at: i * .05,
            dur: .04,
            type: "square",
            gain: .02
        }); else if (kind === "call") {
            a.tone(392, {
                dur: .12,
                type: "triangle",
                gain: .07
            });
            a.tone(523, {
                at: .12,
                dur: .22,
                type: "triangle",
                gain: .07
            });
        } else if (kind === "lighter") {
            a.tone(2400, {
                dur: .03,
                type: "square",
                gain: .03
            });
            a.noise({
                at: .05,
                dur: .25,
                gain: .05,
                freq: 900,
                type: "bandpass",
                q: .8
            });
        } else if (kind === "bust") a.gameOver(); else if (kind === "win") a.microWin(); else if (kind === "deny") a.deny();
    }
    line(who, pool) {
        const t = this.unsaid(pool, this.lastLine[who]);
        if (t) this.lastLine[who] = t;
        return t;
    }
    unsaid(pool, last = null) {
        if (!pool?.length) return null;
        let left = pool.filter((x => !this.saidTonight.has(x)));
        if (!left.length) {
            pool.forEach((x => this.saidTonight.delete(x)));
            left = pool;
        }
        if (left.length > 1) left = left.filter((x => x !== last));
        const t = left[Math.floor(Math.random() * left.length)];
        this.saidTonight.add(t);
        return t;
    }
    nudgeLine(who) {
        const odd = L.NUDGE_IDLE[who].filter((t => !this.saidTonight.has(t)));
        if (!odd.length || Math.random() >= .25) return this.line(who, L.NUDGE[who]);
        const t = odd[Math.floor(Math.random() * odd.length)];
        this.saidTonight.add(t);
        return t;
    }
    sayTake(pool) {
        const take = this.unsaid((pool || []).filter((t => t.every((([w]) => this.present(w))))));
        if (!take) return false;
        for (const [who, text] of take) this.say(who, text);
        return true;
    }
    tally(seat, target) {
        const k = `${this.night.handNo}|${seat}>${target}`;
        return this.hits[k] = (this.hits[k] || 0) + 1;
    }
    say(who, text) {
        if (!this.alive || !text || !this.panels[who] || !this.present(who)) return;
        this.queue.push([ who, text ]);
    }
    async talkOut() {
        while (this.alive && this.queue.length) {
            const [who, text] = this.queue.shift();
            if (!this.present(who)) continue;
            this.showBubble(who, text, true);
            await this.tapWait();
        }
        this.hideBubbles();
    }
    aside(who, text) {
        if (!this.alive || !text || !this.panels[who] || !this.present(who) || this.queue.length) return;
        if (this.teaching || this.caption.classList.contains("named")) return;
        const shown = this.showBubble(who, text, false);
        shown._t = setTimeout((() => {
            if (!shown.classList.contains("nr-held")) this.hideBubbles();
        }), asideMs(text));
    }
    showBubble(who, text, more) {
        this.hideBubbles();
        const {bubble: bubble, act: act, p: p} = this.panels[who];
        const {acts: acts, said: said} = splitActs(text.replace(/\{n\}/g, ""));
        act.textContent = acts.join(".. ");
        act.classList.toggle("on", acts.length > 0);
        const holder = said ? bubble : act;
        if (said) {
            bubble.replaceChildren(...lettering(said));
            bubble.style.top = acts.length ? `${act.offsetHeight + 10}px` : "";
            bubble.classList.remove("on");
            void bubble.offsetWidth;
            bubble.classList.add("on");
        }
        if (more) holder.append(el("i", "nr-more"));
        holder.classList.toggle("nr-held", more);
        p.classList.add("talk");
        return holder;
    }
    hideBubbles() {
        for (const who of E.GIRLS) {
            const {bubble: bubble, act: act, p: p} = this.panels[who];
            clearTimeout(bubble._t);
            clearTimeout(act._t);
            bubble.classList.remove("on", "nr-held");
            act.classList.remove("on", "nr-held");
            p.classList.remove("talk");
        }
    }
    async captionSay(text, _ms, {who: who = "", wait: wait = true} = {}) {
        if (!this.alive || !text) return;
        const c = this.caption;
        c.classList.add("on");
        c.classList.toggle("named", !!who);
        if (!who) this.capAt = this.hand?.turns ?? 0;
        this.capName.textContent = who ? L.NAMES[who].toUpperCase() : "";
        this.capGhost.textContent = "";
        this.capLive.textContent = "";
        const {acts: acts, said: said} = splitActs(text);
        this.capAct.textContent = acts.join(".. ");
        this.capAct.classList.toggle("on", acts.length > 0);
        text = said;
        this.capGhost.textContent = text;
        const run = Symbol("cap");
        this.capRun = run;
        this.typing = true;
        for (let i = 0; i <= text.length; i += 2) {
            if (!this.alive || this.capRun !== run) return;
            if (!this.typing) break;
            this.capLive.textContent = text.slice(0, i);
            if (i % 6 === 0) this.app.audio?.blip?.(i);
            await new Promise((r => setTimeout(r, this.calm ? 0 : 14)));
        }
        if (this.capRun === run) this.typing = false;
        this.capLive.textContent = text;
        if (!wait) return;
        c.classList.add("nr-held");
        await this.tapWait();
        c.classList.remove("nr-held");
    }
    restMood(who) {
        const n = this.night, h = this.hand;
        if (n.out.includes(who)) return "broke";
        if (h?.smoke?.[who] > 0) return "blind";
        if (who === "astrid" && n.astrid.mood === "sour") return "sour";
        return "calm";
    }
    setFace(img, src) {
        if (img.src === src) return;
        img.src = src;
        img.classList.toggle("nr-art", !src.startsWith("data:"));
    }
    mood(who, m, ms = 1800) {
        const {img: img} = this.panels[who];
        clearTimeout(img._t);
        img._held = m !== this.restMood(who);
        this.setFace(img, bustUrl(who, m));
        if (img._held) img._t = setTimeout((() => {
            img._held = false;
            if (this.alive) this.showRest(who);
        }), ms);
    }
    showRest(who) {
        const {img: img} = this.panels[who];
        if (!img._held) this.setFace(img, bustUrl(who, this.restMood(who)));
    }
    smoky() {
        const h = this.hand;
        return !!h?.smoke && Object.values(h.smoke).some((v => v > 0));
    }
    cardEl(id, extra = "") {
        if (id === this.hand?.glitch) return this.glitchCardEl(id, extra);
        const c = E.card(id);
        const blind = this.smoky();
        const d = el("div", `nr-card ${c.suit ? `s-${c.suit}` : "s-wild"} k-${c.kind} ${extra}${blind ? " smoked" : ""}`);
        d.dataset.id = id;
        const face = blind ? "?" : c.kind === "num" ? String(c.n) : GLYPH[c.kind];
        const name = blind || c.kind === "num" ? "" : E.KIND_NAMES[c.kind].toUpperCase();
        if (c.suit) {
            d.classList.add("pulp");
            if (face.length > 1) d.classList.add("wide");
            d.append(el("b", "huge", {
                textContent: face
            }), el("i", "band"), el("b", "px", {
                textContent: face
            }));
            if (name) d.append(el("em", "nm", {
                textContent: name
            }));
        } else {
            d.classList.add("spot");
            d.append(el("i", "dim"), el("i", "beam"), el("b", "huge", {
                textContent: face
            }));
            if (name) d.append(el("em", "nm", {
                textContent: name
            }));
        }
        return d;
    }
    glitchCardEl(id, extra = "") {
        const d = el("div", `nr-card s-white k-glitch nr-glitch ${extra}`);
        d.dataset.id = id;
        d.setAttribute("aria-label", "A white card with a pixel heart on it. Something about it is wrong.");
        const wrap = el("span", "nr-gwrap");
        wrap.innerHTML = heartSvg("gh-r") + heartSvg("gh-b") + heartSvg("gh");
        d.append(wrap, el("i", "nr-gtear"));
        return d;
    }
    flirtCardEl() {
        const h = this.hand, mine = !!this.onFlirt && !this.bribing && !this.flirting;
        const to = mine ? E.canFlirt(this.night) : null;
        const next = h ? E.seatAfter(h, "you") : null;
        const d = el("div", `nr-card nr-flirt ${to ? "live" : mine ? "dead" : ""}`);
        d.dataset.id = "flirt";
        const wrap = el("span", "nr-fheart");
        wrap.innerHTML = heartSvg("fh");
        const why = !h || !E.GIRLS.includes(next) ? "" : h.flirt?.at === next ? "HAS IT" : h.flirt?.off.includes(next) ? "NOPE" : L.NAMES[next].toUpperCase();
        d.append(el("i", "ix", {
            textContent: "♥"
        }), wrap, el("em", "lbl", {
            textContent: "FLIRT"
        }), el("b", "nr-fto", {
            textContent: why
        }));
        d.setAttribute("aria-label", to ? `Flirt with ${L.NAMES[to]}. Costs a card.` : "Flirt card");
        return d;
    }
    async flirtLesson() {
        if (this.app.s.games.noir.flirtTaught) return;
        for (const t of HT.FLIRT_LESSON) await this.captionSay(t);
        if (!this.alive) return;
        this.app.s.games.noir.flirtTaught = true;
        this.app.store.changed("noir flirt taught");
    }
    renderMeter(who) {
        const m = this.app.s.games.noir.hearts?.[who], P = this.panels[who];
        if (!m || !P) return;
        const lvl = HT.levelFor(m.n), lo = HT.LEVEL_HEARTS[lvl - 1] || 0, hi = HT.LEVEL_HEARTS[lvl];
        const p = hi ? (m.n - lo) / (hi - lo) : 1;
        P.meter.classList.toggle("on", m.n > 0);
        P.meter.style.setProperty("--p", String(Math.max(0, Math.min(1, p))));
        P.meter.title = `${m.n} ${m.n === 1 ? "heart" : "hearts"}`;
    }
    async doFlirt() {
        const n = this.night;
        const r = E.flirt(n);
        if (!r) return;
        this.flirting = true;
        this.save();
        this.sfx("draw");
        const before = this.handLefts();
        this.renderPanels();
        this.renderHand(E.legalCards(this.hand, "you"));
        this.landFromDeck(r.drew, before);
        this.floatNum(r.target, "♥", "red");
        this.mood(r.target, "grin", 2400);
        const back = this.line(r.target, HT.FLIRT_BACK[r.target]);
        if (Array.isArray(back)) for (const [who, text] of back) this.say(who, text); else this.say(r.target, back);
        if (r.snubbed) {
            this.mood(r.snubbed, "cross", 3e3);
            this.say(r.snubbed, this.line(r.snubbed, HT.SNUBBED[r.snubbed]));
        } else if (Math.random() < .35) {
            const pools = HT.JEALOUS[r.target] || {};
            const who = Object.keys(pools).filter((g => this.present(g)))[Math.floor(Math.random() * 2)];
            if (who) this.say(who, this.line(who, pools[who]));
        }
        await this.talkOut();
        this.flirting = false;
    }
    maybeGlitch() {
        const app = this.app;
        if (app.demo) {
            if (this.hand.turns < this.hand.glitchFrom || Math.random() >= DEMO_GLITCH_ODDS) return;
        } else if (this.teach || !R.noirGlitchAllowed(app.s, app.now()) || Math.random() >= GLITCH_CHANCE) return;
        if (E.plantGlitch(this.night) == null) return;
        R.noirGlitchSeen(app.s, app.now());
        app.store.changed("noir glitch");
    }
    async glitchLands() {
        const app = this.app, n = this.night, h = this.hand;
        const was = this.pileEl.lastElementChild;
        if (was) {
            const g = this.glitchCardEl(E.top(h), "pilecard landing");
            for (const v of [ "--r", "--x", "--y" ]) g.style.setProperty(v, was.style.getPropertyValue(v));
            was.replaceWith(g);
        }
        this.scene.classList.remove("shake");
        void this.scene.offsetWidth;
        this.scene.classList.add("shake");
        await this.sleep(1100);
        if (!this.alive) return;
        this.renderPile();
        this.pileEl.lastElementChild?.classList.add("nr-unglitch");
        app.afterEvents?.(R.noirGlitchPlayed(app.s));
        E.clearBadBlood(n);
        this.wrongs = {};
        app.store.changed("noir glitch played");
        this.save();
        this.renderPanels();
        this.glitchPop();
        for (const g of E.GIRLS) if (this.present(g)) this.mood(g, "shocked", 1600);
        const take = this.unsaid(L.GLITCH.filter((t => t.every((([who]) => this.present(who))))));
        if (take) for (const [who, text] of take) this.say(who, text);
    }
    glitchPop() {
        const p = el("div", "nr-gpop");
        p.setAttribute("aria-hidden", "true");
        p.innerHTML = `<b>+${R.NOIR_GLITCH_GIFT.affection}</b>${heartSvg("gp-icon")}<b>+${R.NOIR_GLITCH_GIFT.energy}</b>${pixelSvg(BOLT_ROWS, "gp-icon bolt")}`;
        this.fx.append(p);
        this.later((() => p.remove()), 3100);
    }
    renderPile(animateFrom = null) {
        const h = this.hand;
        this.flowEl.classList.toggle("on", !!h);
        if (!h) {
            this.pileEl.replaceChildren();
            return;
        }
        const ids = h.discard.slice(-4);
        const kids = ids.map(((id, i) => {
            const c = this.cardEl(id, "pilecard");
            const k = hash(`${id}:${h.discard.length - ids.length + i}`);
            c.style.setProperty("--r", `${k % 29 - 14}deg`);
            c.style.setProperty("--x", `${(k >> 5) % 9 - 4}px`);
            c.style.setProperty("--y", `${(k >> 9) % 7 - 3}px`);
            return c;
        }));
        if (animateFrom && kids.length) {
            const last = kids[kids.length - 1];
            last.classList.add("fly");
            last.style.setProperty("--fx", `${animateFrom.x}px`);
            last.style.setProperty("--fy", `${animateFrom.y}px`);
        }
        this.pileEl.replaceChildren(...kids);
        this.suitEl.classList.toggle("off", !E.isWild(E.top(h)));
        this.suitEl.replaceChildren(el("i", `sw q-${h.suit}`), el("span", "", {
            textContent: E.SUIT_NAMES[h.suit].toUpperCase()
        }));
        this.suitEl.dataset.suit = h.suit;
        this.deckN.textContent = String(h.deck.length);
        this.dirEl.classList.toggle("ccw", h.dir === -1);
        this.flowEl.classList.toggle("ccw", h.dir === -1);
    }
    renderPanels() {
        const h = this.hand, n = this.night;
        for (const who of E.GIRLS) {
            const P = this.panels[who];
            const out = n.out.includes(who);
            P.p.classList.toggle("out", out);
            P.p.classList.toggle("turn", !!h && E.current(h) === who);
            P.p.classList.toggle("one", !!h && h.hands[who]?.length === 1);
            P.countN.textContent = out ? "--" : h ? `${h.hands[who].length}` : "-";
            P.chips.textContent = `$${n.bank[who]}`;
            P.p.classList.toggle("blind", !!h?.smoke?.[who]);
            P.p.classList.toggle("grudge", !!h?.grudge?.[who]);
            P.p.classList.toggle("paid", !!h && h.bribed === who);
            P.p.classList.toggle("heart", !!h && h.flirt?.at === who);
            P.p.classList.toggle("snub", !!h && !!h.flirt?.off.includes(who));
            this.renderMeter(who);
            this.showRest(who);
        }
        this.clockEl.textContent = E.CLOCK[Math.min(n.handNo, E.CLOCK.length - 1)];
        this.youChips.innerHTML = "";
        this.youChips.append(el("small", "", {
            textContent: "YOUR CHIPS"
        }), el("b", "", {
            textContent: `$${n.bank.you}`
        }));
    }
    renderHand(live = []) {
        const h = this.hand;
        if (!h) {
            this.handEl.replaceChildren();
            return;
        }
        const order = id => {
            const c = E.card(id);
            return (c.suit ? E.SUITS.indexOf(c.suit) : 4) * 100 + (c.kind === "num" ? c.n : c.kind === "wild4" ? 60 : 30 + [ "skip", "rev", "draw2", "wild" ].indexOf(c.kind));
        };
        this.live = live;
        const owed = new Set(this.pendingDraw || []);
        const ids = h.hands.you.filter((id => !owed.has(id))).sort(((a, b) => order(a) - order(b)));
        if (this.flirtOn && h.flirt?.held) ids.unshift("flirt");
        const w = this.handEl.clientWidth || W;
        const n = ids.length, cw = 58, span = w - 64 - cw;
        const step = n > 1 ? Math.min(cw + 4, span / (n - 1)) : 0;
        const x0 = (w - (step * (n - 1) + cw)) / 2;
        const kids = ids.map(((id, i) => {
            const c = id === "flirt" ? this.flirtCardEl() : this.cardEl(id, live.includes(id) ? "live" : live.length ? "dead" : "");
            const t = n > 1 ? i / (n - 1) - .5 : 0;
            c.style.left = `${x0 + i * step}px`;
            c.style.setProperty("--r", `${t * Math.min(24, n * 3)}deg`);
            c.style.setProperty("--dy", `${Math.abs(t) * Math.min(18, n * 2.4)}px`);
            c.style.setProperty("--d", `${i * .37 % 2}s`);
            c.style.zIndex = String(i + 1);
            if (id === "flirt") {
                if (c.classList.contains("live")) c.onclick = e => {
                    e.stopPropagation();
                    this.onFlirt?.();
                };
            } else if (live.includes(id)) c.onclick = e => {
                e.stopPropagation();
                this.onCard?.(id, c);
            };
            return c;
        }));
        this.handEl.replaceChildren(...kids);
    }
    renderAll(live = []) {
        this.renderPanels();
        this.renderPile();
        this.renderHand(live);
        this.setCall();
        this.setBribe();
    }
    handLefts() {
        const m = new Map;
        for (const c of this.handEl.children) m.set(c.dataset.id, parseFloat(c.style.left) || 0);
        return m;
    }
    landFromDeck(ids, before = new Map) {
        if (this.calm || !this.handEl.animate) return;
        const box = this.handEl.getBoundingClientRect(), k = box.width / (this.handEl.offsetWidth || box.width) || 1;
        const deck = (this.deckEl.querySelector(".nr-card") || this.deckEl).getBoundingClientRect();
        const flying = ids.map(String);
        for (const c of this.handEl.children) {
            const end = `translateY(${parseFloat(c.style.getPropertyValue("--dy")) || 0}px) rotate(${parseFloat(c.style.getPropertyValue("--r")) || 0}deg)`;
            if (flying.includes(c.dataset.id)) {
                const at = c.getBoundingClientRect();
                const dx = (deck.left + deck.width / 2 - (at.left + at.width / 2)) / k, dy = (deck.top + deck.height / 2 - (at.top + at.height / 2)) / k;
                c.animate([ {
                    transform: `translate(${dx}px, ${dy}px) rotate(-6deg) scale(.9)`
                }, {
                    transform: end
                } ], {
                    duration: 420,
                    easing: "cubic-bezier(.2, .8, .3, 1)"
                });
            } else if (before.has(c.dataset.id)) {
                const shift = before.get(c.dataset.id) - (parseFloat(c.style.left) || 0);
                if (Math.abs(shift) > .5) c.animate([ {
                    transform: `translateX(${shift}px) ${end}`
                }, {
                    transform: end
                } ], {
                    duration: 300,
                    easing: "ease-out"
                });
            }
        }
    }
    slam(text, tone = "red", {big: big = false} = {}) {
        if (!this.alive) return;
        const s = el("div", `nr-slam ${tone}${big ? " big" : ""}`, {
            textContent: text
        });
        this.fx.append(s);
        this.later((() => s.remove()), 1300);
        if (!this.calm) {
            this.scene.classList.remove("shake");
            void this.scene.offsetWidth;
            this.scene.classList.add("shake");
        }
    }
    async cutIn(who, text, mood = "grin") {
        if (!this.alive) return;
        if (this.calm) {
            this.slam(text, "red", {
                big: true
            });
            return;
        }
        const art = mood === "cross" ? artUrl(`chars/cutin-${who}-hit`) || artUrl(`chars/cutin-${who}`) : artUrl(`chars/cutin-${who}`);
        const box = el("div", "nr-cutin");
        const torn = (depth = 16) => {
            const top = [], bot = [];
            for (let x = 0; x <= 100; x += 4) {
                top.push(`${x}% ${Math.random() * depth}%`);
                bot.unshift(`${x}% ${100 - Math.random() * depth}%`);
            }
            return `polygon(${[ ...top, ...bot ].join(",")})`;
        };
        const strip = el("div", `nr-cut-strip${art ? " art" : ""}`);
        strip.style.backgroundImage = `url("${art || bustUrl(who, mood)}")`;
        strip.style.clipPath = torn();
        const scrapA = el("i", "nr-cut-scrap a");
        scrapA.style.clipPath = torn(40);
        const scrapB = el("i", "nr-cut-scrap b");
        scrapB.style.clipPath = torn(40);
        const shout = el("strong", "nr-cut-text", {
            textContent: text
        });
        box.append(el("i", "nr-cut-band"), scrapA, strip, scrapB, shout);
        this.fx.append(box);
        this.later((() => box.remove()), 1300);
        this.scene.classList.remove("shake");
        void this.scene.offsetWidth;
        this.scene.classList.add("shake");
        await this.sleep(950, true);
    }
    floatNum(where, text, tone = "red") {
        const host = where === "you" ? this.youChips : this.panels[where]?.fxLayer;
        if (!host) return;
        const f = el("b", `nr-float ${tone}`, {
            textContent: text
        });
        host.append(f);
        this.later((() => f.remove()), 1500);
    }
    originOf(seat) {
        const from = (seat === "you" ? this.handEl : this.panels[seat]?.p)?.getBoundingClientRect();
        const pile = this.pileEl.getBoundingClientRect();
        if (!from || !pile.width) return {
            x: 0,
            y: 200
        };
        return {
            x: from.left + from.width / 2 - (pile.left + pile.width / 2),
            y: from.top + from.height / 2 - (pile.top + pile.height / 2)
        };
    }
    async rollChips(from, to) {
        const b = this.youChips.querySelector("b");
        if (!b || from === to) return;
        b.classList.add("rolling");
        const steps = this.calm ? 1 : 16;
        for (let i = 1; i <= steps; i++) {
            if (!this.alive) return;
            b.textContent = `$${Math.round(from + (to - from) * (i / steps))}`;
            if (i % 3 === 0) this.sfx("chips");
            await new Promise((r => setTimeout(r, 32)));
        }
        b.classList.remove("rolling");
    }
    async run() {
        const n = this.night;
        this.renderAll();
        if (this.fresh) {
            const [place, money] = L.CAPTIONS.arrive[n.table];
            if (this.teach) {
                await this.captionSay(L.CAPTIONS.first);
                for (const t of L.CAPTIONS.firstNight.arrive) await this.captionSay(t);
            } else await this.captionSay(L.pick(place));
            await this.captionSay(L.pick(money));
            const spoke = new Set;
            const order = Math.random() < .5 ? [ "belle", "astrid" ] : [ "astrid", "belle" ];
            if (Math.random() < .08) order.unshift("eve"); else order.push("eve");
            for (const who of order) {
                if (spoke.has(who)) continue;
                const g = this.line(who, L.GREET[who]);
                if (Array.isArray(g)) for (const [w, t] of g) {
                    this.say(w, t);
                    spoke.add(w);
                } else this.say(who, g);
            }
            await this.talkOut();
        } else {
            await this.captionSay("I sat back down. My chips were right where I'd left them.. I think. I didn't count them before I went.", 1400);
        }
        let resumed = !this.fresh, leaving = null;
        while (this.alive && !n.done) {
            if (resumed && !n.hand && n.last) {
                const go = await this.betweenHands(false);
                if (!go || !this.alive) break;
            }
            resumed = false;
            this.fresh = false;
            if (!n.hand) await this.deal();
            if (!this.alive) return;
            await this.playHand();
            if (!this.alive) return;
            await this.endHand();
            if (!this.alive) return;
            if (this.app.demo) return this.demoEnd();
            const inv = await this.heartInvite();
            if (!this.alive) return;
            if (inv?.leave) {
                leaving = inv.leave;
                break;
            }
            if (n.done) break;
            const go = await this.betweenHands(true);
            if (!go) break;
        }
        if (this.alive) await this.endNight(leaving);
    }
    async deal() {
        const n = this.night;
        E.newHand(n, {
            flirt: this.flirtOn,
            lateCards: !!this.app.demo,
            glitchAnywhere: !!this.app.demo
        });
        this.save();
        this.renderPanels();
        this.pileEl.replaceChildren();
        this.handEl.replaceChildren();
        if (this.app.s.games.noir.music !== false) this.app.music?.play(nightTrack(n));
        const hour = Math.min(n.handNo, 3);
        await this.captionSay(this.teach ? L.CAPTIONS.firstNight.hand[hour] : L.pick(L.CAPTIONS.hand[hour]), 1500);
        const talker = E.GIRLS.filter((g => this.present(g)))[Math.floor(Math.random() * 3) % E.GIRLS.filter((g => this.present(g))).length];
        if (talker) this.aside(talker, this.line(talker, L.DEAL[talker]));
        this.renderPile();
        const ids = this.hand.hands.you;
        this.root.classList.add("drawing");
        for (let i = 1; i <= ids.length; i++) {
            if (!this.alive) return;
            this.renderHandPartial(i);
            this.sfx("draw");
            await this.sleep(160);
        }
        this.renderAll();
        await this.sleep(700, true);
        this.root.classList.remove("drawing");
        if (this.teach) await this.lesson("goal");
    }
    renderHandPartial(k) {
        const keep = this.hand.hands.you;
        const full = keep.slice();
        this.hand.hands.you = full.slice(0, k);
        this.renderHand();
        this.hand.hands.you = full;
        this.handEl.lastChild?.classList.add("dealt");
    }
    async playHand() {
        const h = this.hand;
        while (this.alive && !h.winner) {
            const seat = E.current(h);
            this.renderAll();
            if (seat === "you") await this.yourTurn(); else await this.botTurn(seat);
            if (!this.alive) return;
            this.save();
            if (h.exposed && !h.winner) await this.catchWindow(h.exposed);
            if (!this.alive) return;
            await this.talkOut();
            if (!this.alive || h.winner) break;
            if (this.teach && this.caughtLesson) {
                this.caughtLesson = false;
                await this.lesson("catch");
            }
            this.clearOldCaption();
            this.save();
            const smoky = this.smoky();
            if (this.wasSmoky && !smoky) {
                this.renderPanels();
                this.renderPile();
                this.renderHand(this.live);
                await this.captionSay(L.SMOKE_CLEARS, 1600);
            }
            this.wasSmoky = smoky;
            await this.maybeBanter();
        }
    }
    flirt() {
        this.lastFlirt = this.yourTurns;
        const turn = this.hand;
        const chain = [ [ "belle", this.line("belle", L.FLIRT.belle) ] ];
        if (this.present("astrid") && this.night.astrid.mood !== "sour" && Math.random() < .55) {
            chain.push([ "astrid", this.line("astrid", L.ASTRID_COUNTER) ]);
            if (this.present("eve") && Math.random() < .35) chain.push([ "eve", this.line("eve", spoken(L.EVE_ROLL)) ]);
        }
        let at = 0;
        for (const [who, text] of chain) {
            this.later((() => {
                if (this.hand === turn && E.current(turn) === "you" && !turn.winner) this.aside(who, text);
            }), at);
            at += asideMs(text) + 150;
        }
    }
    clearOldCaption() {
        const h = this.hand, c = this.caption;
        if (!h || !c.classList.contains("on") || c.classList.contains("named") || this.teaching) return;
        if (h.turns - (this.capAt ?? 0) >= h.seats.length) {
            c.classList.remove("on");
            this.capAct.classList.remove("on");
        }
    }
    async yourTurn() {
        const h = this.hand, n = this.night;
        const live = E.legalCards(h, "you");
        this.yourTurns++;
        if (this.teach) await this.heldLesson();
        if (!this.alive) return;
        if (this.hand.flirt?.held) {
            this.renderAll(live);
            await this.flirtLesson();
            if (!this.alive) return;
        }
        this.renderAll(live);
        this.root.classList.add("yours");
        this.setCall();
        this.hint.textContent = live.length ? "Your play" : "Nothing fits. Draw.";
        const standing = this.teach ? this.standingLesson(live) : false;
        const next = E.seatAfter(h, "you");
        if (standing) {} else if (this.present("astrid") && n.astrid.mood === "warm" && next !== "astrid" && live.some(E.isAttack) && Math.random() < .55) {
            this.aside("astrid", this.line("astrid", L.EGG_ON[next]));
            this.egged = {
                target: next,
                turn: this.yourTurns
            };
        } else if (this.present("astrid") && n.astrid.mood === "sour" && Math.random() < .3) this.aside("astrid", this.line("astrid", L.SOUR_JAB)); else if (this.present("belle") && this.yourTurns - this.lastFlirt >= 3 && Math.random() < .18) this.flirt();
        const nudge = this.later((() => {
            const g = E.GIRLS.filter((x => this.present(x)));
            const who = g[Math.floor(Math.random() * g.length)];
            if (who) this.aside(who, this.nudgeLine(who));
        }), 2e4);
        const result = await this.wait((done => {
            this.onCard = async (id, node) => {
                if (this.bribing) return;
                if (E.card(id).suit === null) {
                    const suit = await this.pickSuit();
                    if (!suit) return;
                    done({
                        play: id,
                        suit: suit,
                        node: node
                    });
                } else done({
                    play: id,
                    node: node
                });
            };
            this.onDeck = () => {
                if (!this.bribing) done({
                    draw: true
                });
            };
            this.onCall = () => {
                if (E.callLast(n, "you")) {
                    this.lightUp();
                    this.setCall();
                    this.setBribe();
                    this.save();
                }
            };
            this.onBribe = async () => {
                if (this.bribing) return;
                const girl = await this.pickBribe();
                if (!girl || !this.alive) return;
                await this.doBribe(girl);
                if (!this.alive) return;
                const now = E.legalCards(h, "you");
                this.renderAll(now);
                this.hint.textContent = now.length ? "Your play" : "Nothing fits. Draw.";
            };
            this.onFlirt = async () => {
                if (this.bribing || this.flirting) return;
                await this.doFlirt();
                if (!this.alive) return;
                const now = E.legalCards(h, "you");
                this.renderAll(now);
                this.hint.textContent = now.length ? "Your play" : "Nothing fits. Draw.";
            };
            this.setBribe();
            this.renderHand(live);
        }));
        clearTimeout(nudge);
        this.onCard = this.onDeck = this.onBribe = this.onFlirt = null;
        this.setBribe();
        this.root.classList.remove("yours");
        this.hint.textContent = "";
        if (standing) this.endLesson();
        this.hideBubbles();
        if (!this.alive || !result) return;
        if (result.draw) {
            this.maybeGlitch();
            const before = this.handLefts();
            const d = E.drawOne(n);
            this.sfx("draw");
            this.renderAll();
            this.landFromDeck([ d.flirt ? "flirt" : d.id ], before);
            this.save();
            if (d.flirt) {
                await this.flirtLesson();
                if (!this.alive) return;
            }
            if (d.playable) {
                const choice = await this.drawnChoice(d.id);
                if (!this.alive) return;
                if (choice) {
                    const suit = E.card(d.id).suit === null ? await this.pickSuit(true) : null;
                    return this.doPlay("you", d.id, suit);
                }
            } else await this.sleep(900, true);
            E.pass(n);
            return;
        }
        await this.doPlay("you", result.play, result.suit);
    }
    async heldLesson() {
        const h = this.hand, n = this.night;
        if (this.yourTurns >= 3 && !h.bribed && n.bank.you >= E.bribePrice(n) && !this.tipsSeen.has("bribe")) await this.lesson("bribe");
    }
    standingLesson(live) {
        const h = this.hand;
        let key = null;
        if (E.heldCount(h, "you") === 2 && !h.called.you && !this.tipsSeen.has("lastcall")) key = "lastcall"; else if (!live.length && !this.tipsSeen.has("draw")) key = "draw"; else if (live.length && !this.tipsSeen.has("play")) key = "play"; else if (live.some((id => E.card(id).kind !== "num")) && !this.tipsSeen.has("symbols")) key = "symbols";
        if (!key) return false;
        this.lesson(key, {
            wait: false
        });
        return true;
    }
    async lesson(key, {wait: wait = true} = {}) {
        const text = L.LESSONS[key];
        if (!text || this.tipsSeen.has(key) || !this.alive) return;
        this.tipsSeen.add(key);
        this.night.tips = [ ...this.tipsSeen ];
        this.save();
        const targets = {
            play: [ this.pileEl, this.handEl ],
            draw: [ this.deckEl ],
            symbols: [ this.handEl ],
            lastcall: [ this.callBtn ],
            bribe: [ this.bribeBtn ]
        }[key] || [];
        this.teaching = targets;
        for (const t of targets) t.classList.add("nr-teach");
        this.hideBubbles();
        const who = this.present("astrid") ? "astrid" : "";
        if (who) this.mood("astrid", "grin", 5e3);
        await this.captionSay(text, 0, {
            who: who,
            wait: wait
        });
        if (wait) this.endLesson();
        if (Object.keys(L.LESSONS).every((k => this.tipsSeen.has(k)))) this.markTaught();
    }
    endLesson() {
        this.capRun = null;
        this.typing = false;
        for (const t of this.teaching || []) t.classList.remove("nr-teach");
        this.teaching = null;
        this.caption.classList.remove("on");
        this.capAct.classList.remove("on");
        const box = this.caption;
        setTimeout((() => {
            if (!box.classList.contains("on")) {
                box.classList.remove("named");
                this.capName.textContent = "";
            }
        }), 260);
    }
    markTaught() {
        if (this.app.s.games.noir.taught) return;
        this.app.s.games.noir.taught = true;
        this.teach = false;
        this.app.store.changed("noir taught");
    }
    setCall() {
        const h = this.hand;
        const can = !!h && (E.canCallLast(this.night, "you") && !h.called.you || h.exposed === "you");
        this.callBtn.disabled = !can;
        this.callBtn.classList.toggle("hot", can);
        this.callBtn.classList.toggle("urgent", !!h && h.exposed === "you");
        const lit = !!h && !h.winner && !!h.called?.you && E.heldCount(h, "you") <= 2;
        this.callBtn.textContent = h?.exposed === "you" ? "LIGHT UP!" : lit ? "LIT" : "LAST SMOKE";
        this.povCig.classList.toggle("on", lit);
    }
    lightUp() {
        this.sfx("lighter");
        this.povCig.classList.remove("on");
        void this.povCig.offsetWidth;
        this.povCig.classList.add("on");
    }
    setBribe() {
        const h = this.hand, n = this.night;
        if (!h) {
            this.bribeBtn.disabled = true;
            this.bribeBtn.textContent = "BRIBE";
            return;
        }
        const price = E.bribePrice(n);
        const yours = !!this.onBribe && E.current(h) === "you" && !h.winner;
        this.bribeBtn.textContent = h.bribed ? "PAID OFF" : `BRIBE $${price}`;
        this.bribeBtn.disabled = !yours || !!h.bribed || n.bank.you < price || this.povCig.classList.contains("on");
    }
    pickBribe() {
        const n = this.night;
        const FAVOUR = {
            eve: "Takes a long drag and blows it across the table. Everyone plays blind for two turns.",
            belle: "Deals everyone one card, you and herself too.",
            astrid: "Slips two Skip cards into your hand."
        };
        return this.wait((done => {
            const box = el("div", "nr-bribebox");
            box.append(el("p", "", {
                textContent: `Slip someone $${E.bribePrice(n)}`
            }));
            const close = v => e => {
                e?.stopPropagation();
                this.modal.classList.remove("on");
                this.modal.replaceChildren();
                done(v);
            };
            for (const g of E.GIRLS) {
                const why = E.bribeBlock(n, g);
                const b = el("button", `nr-bribe-row${why ? " no" : ""}`, {
                    type: "button"
                });
                b.dataset.who = g;
                b.append(el("img", "", {
                    src: bustUrl(g, why ? "cross" : "grin"),
                    alt: ""
                }), el("strong", "", {
                    textContent: L.NAMES[g]
                }), el("span", "", {
                    textContent: why || FAVOUR[g]
                }));
                b.onclick = why ? e => {
                    e.stopPropagation();
                    this.sfx("deny");
                } : e => {
                    this.app.audio.tap();
                    close(g)(e);
                };
                box.append(b);
            }
            const x = el("button", "nr-btn ghost", {
                type: "button",
                textContent: "Never mind"
            });
            x.onclick = close(null);
            box.append(x);
            this.modal.replaceChildren(box);
            this.modal.classList.add("on");
        }));
    }
    async doBribe(girl) {
        const n = this.night;
        const before = n.bank.you;
        const r = E.bribe(n, girl);
        if (!r) return;
        this.bribing = true;
        this.save();
        this.sfx("chips");
        this.floatNum("you", `-$${r.price}`, "red");
        this.floatNum(girl, `+$${r.price}`, "blue");
        this.renderPanels();
        this.setBribe();
        this.rollChips(before, n.bank.you);
        this.say(girl, this.line(girl, L.BRIBE_TAKE[girl]));
        await this.talkOut();
        if (r.smoke) {
            this.sfx("lighter");
            this.mood("eve", "exhale", 2400);
            await this.sleep(700);
            this.slam("SMOKE SCREEN", "blue");
            this.renderPanels();
            this.renderPile();
            this.renderHand(this.live);
            await this.sleep(1100);
            for (const g of [ "belle", "astrid" ]) if (this.present(g)) this.say(g, this.line(g, L.SMOKED[g]));
            await this.talkOut();
        } else if (r.dealt) {
            await this.sleep(500);
            this.slam("ROUND ON BELLE", "red");
            for (const s of Object.keys(r.dealt)) if (s !== "you" && r.dealt[s].length) {
                this.floatNum(s, "+1", "red");
                this.sfx("draw");
                await this.sleep(260);
            }
            this.renderAll(E.legalCards(this.hand, "you"));
            for (const id of r.given) this.handEl.querySelector(`[data-id="${id}"]`)?.classList.add("dealt");
            this.sfx("draw");
            await this.sleep(700);
            const grumbler = [ "eve", "astrid" ].filter((g => this.present(g)))[Math.floor(Math.random() * 2)];
            if (grumbler) {
                this.say(grumbler, this.line(grumbler, L.BELLE_ROUND[grumbler]));
                await this.talkOut();
            }
        } else {
            await this.sleep(600);
            this.slam("UNDER THE TABLE", "red");
            this.renderHand(E.legalCards(this.hand, "you"));
            for (const id of r.given) this.handEl.querySelector(`[data-id="${id}"]`)?.classList.add("dealt");
            this.sfx("draw");
            await this.sleep(900);
        }
        this.bribing = false;
    }
    pickSuit(must = false) {
        this.root.classList.add("picking");
        this.modal.classList.add("suit");
        const end = v => {
            this.root.classList.remove("picking");
            this.modal.classList.remove("suit");
            return v;
        };
        return this.wait((done => {
            const box = el("div", "nr-suitpick");
            box.append(el("p", "", {
                textContent: "Pick a colour"
            }));
            const row = el("div", "nr-suitrow");
            for (const s of E.SUITS) {
                const b = el("button", `nr-suitbtn s-${s}`, {
                    type: "button"
                });
                b.append(el("span", "", {
                    textContent: E.SUIT_NAMES[s]
                }));
                b.onclick = e => {
                    e.stopPropagation();
                    this.app.audio.tap();
                    this.modal.classList.remove("on");
                    this.modal.replaceChildren();
                    done(s);
                };
                row.append(b);
            }
            box.append(row);
            if (!must) {
                const x = el("button", "nr-btn ghost", {
                    type: "button",
                    textContent: "Back"
                });
                x.onclick = e => {
                    e.stopPropagation();
                    this.modal.classList.remove("on");
                    this.modal.replaceChildren();
                    done(null);
                };
                box.append(x);
            }
            this.modal.replaceChildren(box);
            this.modal.classList.add("on");
        })).then(end);
    }
    drawnChoice(id) {
        return this.wait((done => {
            const box = el("div", "nr-drawn");
            box.append(el("p", "", {
                textContent: "It fits."
            }), this.cardEl(id, "show"));
            const row = el("div", "nr-row");
            const play = el("button", "nr-btn", {
                type: "button",
                textContent: "Play it"
            });
            const keep = el("button", "nr-btn ghost", {
                type: "button",
                textContent: "Keep it"
            });
            const close = v => e => {
                e.stopPropagation();
                this.app.audio.tap();
                this.modal.classList.remove("on");
                this.modal.replaceChildren();
                done(v);
            };
            play.onclick = close(true);
            keep.onclick = close(false);
            row.append(play, keep);
            box.append(row);
            this.modal.replaceChildren(box);
            this.modal.classList.add("on");
        }));
    }
    async botTurn(seat) {
        const h = this.hand;
        await this.sleep(550 + Math.random() * 600, true);
        if (!this.alive) return;
        if (seat === "belle") {
            await this.dannyStory();
            if (!this.alive) return;
        }
        const after = await this.lastCardShow(seat);
        await this.botMove(seat);
        if (after && this.alive && this.hand === h && h.hands[seat]?.length) {
            for (const [who, text] of after) this.say(who, text);
            await this.talkOut();
        }
    }
    async lastCardShow(seat) {
        const n = this.night, h = this.hand;
        if (h.hands[seat].length !== 1 || this.suspenseHand === n.handNo || Math.random() >= .25) return null;
        const takes = (L.SUSPENSE[seat] || []).filter((t => [ ...t.lines, ...t.after || [] ].every((([who]) => this.present(who)))));
        const take = this.unsaid(takes);
        if (!take) return null;
        this.suspenseHand = n.handNo;
        for (const [who, text] of take.lines) this.say(who, text);
        await this.talkOut();
        return take.after || null;
    }
    async dannyStory() {
        const n = this.night, h = this.hand;
        if (this.teach || this.dannyTold || n.handNo < 1 || this.dannyHand === n.handNo || h.hands.belle.length <= 1) return;
        this.dannyHand = n.handNo;
        if (Math.random() >= .15 || !this.sayTake(L.DANNY)) return;
        this.dannyTold = true;
        await this.talkOut();
    }
    madAtYou(seat) {
        const n = this.night, h = this.hand, hit = this.wrongs[`you>${seat}`];
        return seat === "astrid" && n.astrid.mood === "sour" || h.grudge?.[seat] > 0 || hit != null && n.handNo - hit <= 1;
    }
    async court(seat, mv) {
        const n = this.night, h = this.hand;
        this.courtHit = null;
        if (!mv || !E.isAttack(mv.id) || E.seatAfter(h, seat) !== "you" || h.smoke?.[seat] > 0) return mv;
        const key = `${n.handNo}|${seat}`;
        if (this.courted.has(key) || Math.random() >= .4) return mv;
        const soft = E.chooseMove(n, seat, {
            noAttack: true
        });
        const canSpare = !!soft && !E.isAttack(soft.id);
        const mad = this.madAtYou(seat);
        const pick = this.unsaid((mad ? L.COURT_MAD : L.COURT)[seat]);
        if (!pick) return mv;
        this.courted.add(key);
        const ask = Array.isArray(pick.ask) ? pick.ask[Math.floor(Math.random() * pick.ask.length)] : pick.ask;
        this.mood(seat, mad ? "cross" : "smug", 2400);
        const ans = await this.courtPick(seat, ask, pick, mad);
        if (!this.alive || !ans) return mv;
        const kind = ans.kind;
        this.say(seat, ans.reply || this.line(seat, pick.said[kind]));
        for (const [who, text] of pick.after?.[kind] || []) if (this.present(who)) this.say(who, text);
        const score = pick.plays?.[kind] || kind;
        this.mood(seat, score === "wrong" ? "cross" : "grin", 1800);
        const odds = {
            right: mad ? .5 : .65,
            meh: mad ? .1 : .25,
            wrong: 0
        }[score];
        if (canSpare && Math.random() < odds) {
            this.say(seat, this.line(seat, (mad ? L.SPARE_MAD : L.SPARE)[seat]));
            if (mad) delete this.wrongs[`you>${seat}`];
            await this.talkOut();
            return soft;
        }
        if (score === "right") this.say(seat, this.line(seat, (mad ? L.PUSH_MAD : L.PUSH)[seat]));
        await this.talkOut();
        this.courtHit = seat;
        return mv;
    }
    courtPick(seat, ask, pick, mad) {
        const opts = [ "right", "meh", "wrong" ].map((k => {
            const a = pick[k][Math.floor(Math.random() * pick[k].length)];
            return Array.isArray(a) ? [ k, a[0], a[1] ] : [ k, a, null ];
        })).sort((() => Math.random() - .5));
        return this.wait((done => {
            const box = el("div", "nr-courtbox");
            const head = el("div", "nr-court-head");
            head.append(el("img", "", {
                src: bustUrl(seat, mad ? "cross" : "grin"),
                alt: ""
            }), el("strong", "", {
                textContent: L.NAMES[seat]
            }));
            const {acts: acts, said: said} = splitActs(ask);
            const q = el("p", "nr-court-ask");
            if (acts.length) q.append(el("em", "", {
                textContent: acts.join(".. ")
            }));
            if (said) q.append(el("span", "", {
                textContent: said
            }));
            box.append(head, q);
            for (const [k, text, reply] of opts) {
                const b = el("button", "nr-court-opt", {
                    type: "button"
                });
                const mine = splitActs(text);
                if (mine.acts.length) b.append(el("em", "", {
                    textContent: mine.acts.join(".. ")
                }));
                if (mine.said) b.append(mine.said);
                b.onclick = e => {
                    e.stopPropagation();
                    this.app.audio.tap();
                    this.modal.classList.remove("on");
                    this.modal.replaceChildren();
                    done({
                        kind: k,
                        reply: reply
                    });
                };
                box.append(b);
            }
            this.modal.replaceChildren(box);
            this.modal.classList.add("on");
        }));
    }
    async botMove(seat) {
        const h = this.hand, n = this.night;
        await this.botCall(seat);
        if (h.smoke?.[seat] > 0 && Math.random() < .35) this.say(seat, this.line(seat, L.BLIND[seat]));
        let mv = E.chooseMove(n, seat);
        if (!mv) {
            const d = E.drawOne(n);
            this.sfx("draw");
            this.floatNum(seat, "+1", "ink");
            this.renderAll();
            await this.sleep(900, true);
            if (!d.playable) {
                if (Math.random() < .18) this.say(seat, this.line(seat, L.DRY[seat]));
                E.pass(n);
                return;
            }
            await this.botCall(seat);
            if (!this.alive) return;
            mv = {
                id: d.id,
                suit: E.card(d.id).suit === null ? E.chooseMove(n, seat)?.suit || "red" : null
            };
        } else {
            mv = await this.court(seat, mv);
            if (!this.alive) return;
        }
        await this.doPlay(seat, mv.id, mv.suit);
    }
    async botCall(seat) {
        const n = this.night, h = this.hand;
        if (!E.canCallLast(n, seat) || E.forgets(n, seat)) return;
        const lit = h.seats.filter((x => x !== seat && h.called[x] && h.hands[x].length === 1)).length;
        E.callLast(n, seat);
        const pool = lit >= 2 ? L.LAST_CALL_THIRD[seat] : lit === 1 ? L.LAST_CALL_TOO[seat] : L.LAST_CALL[seat];
        this.say(seat, `*puts a cigarette in her mouth* ${this.line(seat, pool)}`);
        this.sfx("lighter");
        this.mood(seat, "exhale", 2600);
        this.panels[seat].p.classList.add("called");
        this.later((() => this.panels[seat]?.p.classList.remove("called")), 1600);
        await this.talkOut();
    }
    async forcedDraw() {
        if (!this.pendingDraw?.length || !this.alive) {
            this.pendingDraw = [];
            return;
        }
        this.root.classList.add("drawing");
        this.deckEl.classList.add("owed");
        const show = () => {
            const k = this.pendingDraw.length;
            this.deckEl.dataset.owe = `+${k}`;
            this.hint.textContent = `Tap the deck: draw ${k}`;
        };
        show();
        await this.wait((done => {
            this.onDeck = () => {
                const before = this.handLefts();
                const id = this.pendingDraw.shift();
                this.sfx("draw");
                this.renderHand();
                this.landFromDeck([ id ], before);
                if (this.pendingDraw.length) show(); else done(true);
            };
        }));
        this.onDeck = null;
        this.pendingDraw = [];
        this.deckEl.classList.remove("owed");
        delete this.deckEl.dataset.owe;
        this.hint.textContent = "";
        if (!this.alive) return;
        this.renderHand();
        await this.sleep(350);
        this.root.classList.remove("drawing");
    }
    async doPlay(seat, id, suit) {
        const n = this.night, h = this.hand;
        const wasMood = n.astrid.mood;
        const ev = E.playCard(n, id, suit);
        this.sfx("card");
        this.renderPanels();
        this.renderPile(this.originOf(seat));
        if (seat === "you") this.renderHand();
        this.setCall();
        await this.sleep(450);
        if (ev.glitch) await this.glitchLands();
        const c = E.card(id);
        if (c.kind !== "num") {
            const big = c.kind === "wild4" || c.kind === "draw2";
            const face = seat !== "you" ? seat : GIRLS_HIT(ev) ? ev.target : null;
            this.sfx("slam");
            if (big && face) await this.cutIn(face, SLAM[c.kind], seat !== "you" ? "grin" : "cross"); else this.slam(SLAM[c.kind], big ? "red" : "blue", {
                big: c.kind === "wild4"
            });
        }
        if (c.suit === null) await this.sleep(200);
        if (ev.target === "you" && ev.drew.length) this.pendingDraw = [ ...ev.drew ];
        if (ev.target && ev.drew.length) {
            this.floatNum(ev.target, `+${ev.drew.length}`, "red");
            this.renderAll();
        }
        if (ev.target === "you" && ev.drew.length) await this.forcedDraw();
        this.react(ev, wasMood);
        if (seat === "astrid" && n.astrid.mood === "sorry") await this.astridSorry();
        await this.sleep(c.kind === "num" ? 900 : 1500, true);
        void h;
    }
    react(ev, wasMood) {
        const n = this.night, {seat: seat, target: target, kind: kind} = ev;
        if (!target) return;
        const atk = kind === "skip" || kind === "draw2" || kind === "wild4";
        if (!atk) return;
        if (seat !== "you") this.mood(seat, target === "you" ? "smug" : "grin");
        if (target !== "you") this.mood(target, kind === "wild4" ? "shocked" : "cross", kind === "wild4" ? 2600 : 1800);
        const pb = this.payback(seat, target);
        const karma = kind === "skip" && seat !== "you" && target !== "you" && this.skippers.has(`${n.handNo}|${target}`);
        if (kind === "skip" && seat !== "you") this.skippers.add(`${n.handNo}|${seat}`);
        const listened = seat === "you" && this.egged?.target === target && this.egged.turn === this.yourTurns;
        if (seat === "you") this.egged = null;
        if (ev.heartbreak) {
            this.tally(seat, target);
            this.say(target, this.line(target, HT.HEARTBREAK[target]));
            return;
        }
        if (this.hand?.winner) return;
        const again = this.tally(seat, target) >= 2;
        if (this.courtHit === seat && target === "you") {
            this.courtHit = null;
            return;
        }
        if (listened && ++this.listens === 2 && this.sayTake(L.LISTENED_AGAIN)) return;
        if (listened && this.sayTake(L.LISTENED[target])) return;
        if (karma && this.karmaHand !== n.handNo && Math.random() < .3 && this.sayTake(L.KARMA[target])) {
            this.karmaHand = n.handNo;
            return;
        }
        if (seat === "you" && target === "astrid") {
            const pool = pb === "taken" ? L.TAKEN.astrid : again ? L.AGAIN_BY_YOU.astrid : kind === "skip" && Math.random() < .7 ? L.SOUR_SKIPPED : L.SOUR;
            this.say("astrid", this.line("astrid", pool));
            this.mood("astrid", kind === "wild4" ? "shocked" : "cross", 2200);
            return;
        }
        if (seat === "astrid" && target === "you" && n.astrid.mood === "sour") {
            this.say("astrid", this.line("astrid", L.SOUR_HIT));
            return;
        }
        if (Math.random() >= .65) return;
        if (pb === "taken") {
            this.say(target, this.line(target, L.TAKEN[target]));
            return;
        }
        if (pb === "revenge") {
            this.say(seat, this.line(seat, L.REVENGE[seat]));
            return;
        }
        if (again && seat === "you") {
            this.say(target, this.line(target, L.AGAIN_BY_YOU[target]));
            return;
        }
        if (again && target === "you") {
            this.say(seat, this.line(seat, L.AGAIN_ON_YOU[seat]));
            return;
        }
        if (seat === "you" && this.present("astrid") && wasMood === "warm" && Math.random() < .6) this.say("astrid", this.line("astrid", L.CHEER)); else if (seat === "you" && target !== "belle" && this.present("belle") && Math.random() < .3) this.say("belle", this.line("belle", L.BELLE_CHEER));
        const fight = (again ? L.GIRL_HITS_AGAIN : L.GIRL_HITS)[`${seat}>${target}`]?.filter((t => t.every((([w]) => this.present(w)))));
        if (fight?.length && (again || Math.random() < .6)) {
            const take = this.unsaid(fight, this.lastTake);
            this.lastTake = take;
            for (const [who, text] of take) this.say(who, text);
            const third = E.GIRLS.find((g => g !== seat && g !== target && this.present(g) && !take.some((([w]) => w === g))));
            if (third && Math.random() < .35) this.say(third, this.line(third, spoken(L.ONLOOKER[third])));
            return;
        }
        if (seat !== "you" && Math.random() < .5) this.say(seat, this.line(seat, target === "you" ? [ ...L.HIT[seat], ...L.HIT_YOU[seat] || [] ] : L.HIT[seat]));
        if (target !== "you" && Math.random() < .8) this.say(target, this.line(target, kind === "wild4" ? L.SETUP_OUCH[target] : seat === "you" ? L.OUCH[target] : L.OUCH_GIRL[target]));
    }
    payback(seat, target) {
        if (seat !== "you" && target !== "you") return null;
        const now = this.night.handNo, back = this.wrongs[`${target}>${seat}`];
        this.wrongs[`${seat}>${target}`] = now;
        if (back == null || now - back > 1) return null;
        delete this.wrongs[`${target}>${seat}`];
        return seat === "you" ? "taken" : "revenge";
    }
    async astridSorry() {
        const gift = E.astridMakesUp(this.night);
        if (!gift) return;
        const before = this.night.bank.you - gift;
        this.mood("astrid", "sorry", 3200);
        this.say("astrid", this.line("astrid", L.SORRY).replace("{n}", String(gift)));
        this.floatNum("astrid", `-${gift}`, "ink");
        this.floatNum("you", `+${gift}`, "blue");
        this.renderPanels();
        await this.rollChips(before, this.night.bank.you);
        this.save();
    }
    async catchWindow(exposed) {
        const n = this.night, h = this.hand;
        const racers = E.GIRLS.filter((g => g !== exposed && this.present(g) && h.seats.includes(g))).map((g => ({
            g: g,
            ms: (exposed === "you" ? YOU_GRACE_MS - E.CATCH.eve.ms : 0) + E.CATCH[g].ms + Math.random() * 500,
            will: E.willCatch(n, g, exposed)
        }))).filter((r => r.will)).sort(((a, b) => a.ms - b.ms));
        const first = racers[0];
        const windowMs = exposed === "you" ? YOU_GRACE_MS + 1500 : 2600;
        let outcome = await this.wait((done => {
            const t1 = first ? setTimeout((() => done({
                by: first.g
            })), first.ms) : null;
            const late = exposed !== "you" && Math.random() < .35 ? setTimeout((() => done({
                saved: true
            })), 1300 + Math.random() * 400) : null;
            const t2 = setTimeout((() => done({
                none: true
            })), windowMs);
            this.timers.push(t1, t2, late);
            if (exposed === "you") {
                this.setCall();
                this.onCall = () => {
                    if (E.callLast(n, "you")) done({
                        saved: true,
                        you: true
                    });
                };
            } else {
                const btn = this.panels[exposed].catchBtn;
                btn.classList.add("on");
                this.youCatch = () => done({
                    by: "you"
                });
            }
            const clear = () => {
                clearTimeout(t1);
                clearTimeout(t2);
                clearTimeout(late);
            };
            this._clearRace = clear;
        }));
        this._clearRace?.();
        this.onCall = null;
        this.youCatch = null;
        for (const g of E.GIRLS) this.panels[g].catchBtn.classList.remove("on");
        if (!this.alive || !outcome) return;
        if (exposed !== "you" && this.teach && !this.tipsSeen.has("catch")) this.caughtLesson = true;
        if (outcome.saved) {
            if (outcome.you) this.lightUp(); else {
                E.callLast(n, exposed);
                this.say(exposed, `*puts a cigarette in her mouth* ${this.line(exposed, L.LAST_CALL[exposed])}`);
                this.sfx("lighter");
                this.mood(exposed, "exhale", 2600);
            }
        } else if (outcome.by) {
            const drew = E.catchOut(n, exposed);
            if (drew) {
                if (exposed === "you") this.pendingDraw = [ ...drew ];
                this.sfx("slam");
                if (outcome.by !== "you") await this.cutIn(outcome.by, "CAUGHT!", "grin"); else this.slam("CAUGHT!", "red", {
                    big: true
                });
                if (outcome.by !== "you") this.mood(outcome.by, "smug", 3e3);
                if (exposed !== "you") this.mood(exposed, "shocked", 2600);
                this.floatNum(exposed, `+${drew.length}`, "red");
                if (outcome.by === "you") {
                    this.say(exposed, this.line(exposed, L.CAUGHT_BY_YOU[exposed]));
                } else {
                    this.say(outcome.by, this.line(outcome.by, L.CATCH[outcome.by]));
                    if (exposed !== "you") this.say(exposed, this.line(exposed, L.CAUGHT[exposed]));
                }
                if (exposed === "you") {
                    this.renderAll();
                    await this.forcedDraw();
                }
            }
        } else if (exposed === "you" && this.present("astrid") && (n.astrid.mood === "warm" || n.astrid.mood === "sorry")) {
            if (Math.random() < .6) this.say("astrid", this.line("astrid", L.ASTRID_COVER));
            h.exposed = null;
        } else h.exposed = null;
        this.setCall();
        this.renderAll();
        await this.sleep(700, true);
    }
    async maybeBanter() {
        const h = this.hand;
        if (!h || h.turns - this.lastBanterTurn < 5 || Math.random() > .22) return;
        const here = E.GIRLS.filter((g => this.present(g)));
        if (!this.girlFlirted && here.length >= 2 && Math.random() < .06) {
            const flirts = L.GIRL_FLIRTS.filter((take => take.every((([w]) => here.includes(w)))));
            if (flirts.length) {
                this.girlFlirted = true;
                this.lastBanterTurn = h.turns;
                for (const [who, text] of flirts[Math.floor(Math.random() * flirts.length)]) this.say(who, text);
                await this.talkOut();
                return;
            }
        }
        const takes = [];
        L.BANTER.forEach(((topic, i) => topic.forEach(((take, t) => {
            if (i !== this.lastTopic && !this.banterUsed.has(`${i}:${t}`) && take.every((([w]) => here.includes(w)))) takes.push([ i, t ]);
        }))));
        const fresh = takes.filter((([i]) => !L.BANTER[i].some(((_, t) => this.banterUsed.has(`${i}:${t}`)))));
        const pool = fresh.length ? fresh : takes;
        if (!pool.length || here.length < 2) {
            const who = here[Math.floor(Math.random() * here.length)];
            if (who && Math.random() < .5) {
                if (who === "eve") this.mood("eve", "exhale", 2600);
                this.say(who, this.line(who, L.IDLE[who]));
                await this.talkOut();
            }
            this.lastBanterTurn = h.turns;
            return;
        }
        const [idx, t] = pool[Math.floor(Math.random() * pool.length)];
        const bit = L.BANTER[idx][t];
        this.banterUsed.add(`${idx}:${t}`);
        this.lastTopic = idx;
        this.lastBanterTurn = h.turns;
        for (const [who, text] of bit) this.say(who, text);
        await this.talkOut();
    }
    async endHand() {
        const n = this.night, h = this.hand;
        const winner = h.winner;
        const youBefore = n.bank.you;
        this.root.classList.add("reveal");
        const res = E.settleHand(n);
        this.save();
        if (!res) return;
        this.sfx(winner === "you" ? "win" : "slam");
        if (winner === "you") {
            this.slam("CLEAN OUT!", "blue", {
                big: true
            });
            for (const [g, v] of Object.entries(res.paid)) if (v) {
                this.floatNum(g, `-$${v}`, "red");
                if (g !== "you") this.mood(g, "cross", 4e3);
            }
            const say = E.GIRLS.filter((g => this.present(g) || res.broke.includes(g)));
            const who = say[Math.floor(Math.random() * say.length)];
            if (who) this.say(who, this.line(who, L.YOU_WIN[who]));
        } else {
            this.slam(`${L.NAMES[winner].toUpperCase()} WINS`, "red", {
                big: true
            });
            this.mood(winner, "smug", 6e3);
            this.say(winner, this.line(winner, L.WIN[winner]));
            for (const [g, v] of Object.entries(res.paid)) if (v && g !== "you") this.floatNum(g, `-$${v}`, "red");
            if (res.paid.you) this.floatNum("you", `-$${res.paid.you}`, "red");
            const sore = E.GIRLS.filter((g => g !== winner && this.present(g)));
            const s2 = sore[Math.floor(Math.random() * sore.length)];
            if (s2) this.say(s2, this.line(s2, L.SORE[s2]));
        }
        this.renderPanels();
        await this.rollChips(youBefore, n.bank.you);
        await this.sleep(900, true);
        await this.talkOut();
        if (res.heart) {
            this.heartsTonight.push(res.heart);
            R.noirHeart(this.app.s, res.heart);
            this.app.store.changed("noir heart");
            this.floatNum(res.heart, "+♥", "red");
            this.renderPanels();
            if (Math.random() < .4 && this.present(res.heart)) {
                this.say(res.heart, this.line(res.heart, HT.KEPT[res.heart]));
                await this.talkOut();
            }
        }
        if (winner === "you") await this.captionSay(L.pick(L.CAPTIONS.youWin), 1800);
        for (const g of res.broke) {
            this.sfx("bust");
            this.showBubble(g, this.line(g, L.BROKE[g]), true);
            await this.tapWait();
            this.hideBubbles();
            await this.captionSay(L.CAPTIONS.girlBroke[g]);
        }
        this.root.classList.remove("reveal");
        this.renderAll();
        if (n.bank.you <= 0) await this.captionSay(L.pick(L.CAPTIONS.broke), 2e3);
    }
    async heartInvite() {
        const app = this.app, n = this.night, last = n.last?.heart;
        const girls = E.GIRLS.filter((g => this.present(g) && HT.INVITE[g] && R.noirSceneDue(app.s, g) && n.handNo >= (this.inviteWait[g] ?? 0)));
        if (!girls.length) return null;
        const g = girls.includes(last) ? last : girls[0];
        const m = app.s.games.noir.hearts[g], scene = HT.sceneFor(g, R.noirSceneDue(app.s, g), app.s.games.noir.hearts[g].flags), inv = HT.INVITE[g];
        const yes = await this.inviteBox(g, this.line(g, m.later ? inv.again : inv.ask), inv.sure, inv.laterBtn);
        if (!this.alive) return null;
        if (yes && scene.confirm) {
            for (const [who, text] of scene.confirm.lines) this.say(who, text);
            await this.talkOut();
            if (!this.alive) return null;
            const go = await this.inviteBox(g, null, scene.confirm.yes, scene.confirm.no);
            if (!this.alive) return null;
            if (go) return {
                leave: {
                    girl: g,
                    scene: scene
                }
            };
            for (const [who, text] of scene.confirm.noLines) this.say(who, text);
        } else if (yes) {
            await this.playHeartScene(g, scene);
            return null;
        } else this.say(g, this.line(g, inv.later));
        R.noirSceneLater(app.s, g);
        app.store.changed("noir later");
        this.inviteWait[g] = n.handNo + 1;
        await this.talkOut();
        return null;
    }
    inviteBox(who, text, a, b) {
        return this.wait((done => {
            const box = el("div", "nr-courtbox nr-invite");
            const head = el("div", "nr-court-head");
            head.append(el("img", "", {
                src: bustUrl(who, "grin"),
                alt: ""
            }), el("strong", "", {
                textContent: L.NAMES[who]
            }));
            box.append(head);
            if (text) {
                const {acts: acts, said: said} = splitActs(text);
                const q = el("p", "nr-court-ask");
                if (acts.length) q.append(el("em", "", {
                    textContent: acts.join(".. ")
                }));
                if (said) q.append(el("span", "", {
                    textContent: said
                }));
                box.append(q);
            }
            for (const [label, v] of [ [ a, true ], [ b, false ] ]) {
                const btn = el("button", "nr-court-opt", {
                    type: "button",
                    textContent: label
                });
                btn.onclick = e => {
                    e.stopPropagation();
                    this.app.audio.tap();
                    this.modal.classList.remove("on");
                    this.modal.replaceChildren();
                    done(v);
                };
                box.append(btn);
            }
            this.modal.replaceChildren(box);
            this.modal.classList.add("on");
        }));
    }
    async playHeartScene(girl, scene, vars = {}, extra = {}, onPay = null) {
        const app = this.app, m = app.s.games.noir.hearts[girl];
        this.root.classList.add("in-scene");
        const res = await playScene(this.root, scene, {
            flags: {
                ...m.flags,
                ...extra
            },
            vars: vars,
            onPay: onPay,
            alive: () => this.alive,
            tap: () => app.audio?.tap?.()
        });
        this.root.classList.remove("in-scene");
        if (!res || !this.alive) return null;
        R.noirSceneSeen(app.s, girl, scene.level, res.flags);
        app.store.changed("noir scene");
        this.renderPanels();
        return res;
    }
    betweenHands() {
        const n = this.night;
        return this.wait((done => {
            const box = el("div", "nr-between");
            const cash = E.cashOut(n), buy = E.TABLES[n.table].buyIn;
            const diff = cash - buy, credits = E.creditsFor(n.table, cash);
            box.append(el("p", "nr-bclock", {
                textContent: `${E.CLOCK[Math.min(n.handNo, 3)]}${n.handNo === 3 ? " · LAST HAND" : ""}`
            }), el("b", "nr-bnum", {
                textContent: `$${n.bank.you}`
            }), el("small", `nr-bdiff ${diff >= 0 ? "up" : "down"}`, {
                textContent: diff > 0 ? `+${diff} on the night, paid ${E.WIN_MULT}x: +${credits - buy} credits` : `${diff} on the night`
            }));
            if (n.bank.you > E.TABLES[n.table].cap) box.append(el("small", "nr-bcap", {
                textContent: `The house only covers ${E.TABLES[n.table].cap}.`
            }));
            const row = el("div", "nr-row");
            const deal = el("button", "nr-btn", {
                type: "button",
                textContent: "Deal me in"
            });
            const walk = el("button", "nr-btn ghost", {
                type: "button",
                textContent: `Cash out ${credits} cr`
            });
            const close = v => e => {
                e.stopPropagation();
                this.app.audio.tap();
                this.modal.classList.remove("on");
                this.modal.replaceChildren();
                done(v);
            };
            deal.onclick = close(true);
            walk.onclick = close(false);
            row.append(deal, walk);
            box.append(row);
            this.modal.replaceChildren(box);
            this.modal.classList.add("on");
        }));
    }
    async endNight(leaving = null) {
        const app = this.app, n = this.night;
        n.done = true;
        const cash = E.cashOut(n), buy = E.TABLES[n.table].buyIn;
        const prevBest = app.s.games.noir.best;
        const r = R.settleRound(app.s, {
            gameId: "noir",
            roundId: this.round.id,
            score: cash,
            now: app.now()
        });
        if (!r.ok) return;
        this.settled = true;
        if (this.teach) this.markTaught();
        app.store.changed("noir settle");
        app.afterEvents?.(r.events);
        const diff = cash - buy;
        let gave = 0;
        if (leaving) {
            this.hideBubbles();
            this.caption.classList.remove("on");
            const credits = app.s.stats.credits, ask = HT.askFor(credits);
            const broke = credits < HT.ASK_FLOOR || ask <= 0;
            await this.playHeartScene(leaving.girl, leaving.scene, {
                ask: ask.toLocaleString("en-US")
            }, {
                broke: broke ? "yes" : "no"
            }, (() => {
                gave = R.noirPayAstrid(app.s, ask);
                app.store.changed("noir paid astrid");
            }));
            if (!this.alive) return;
        } else {
            const C = L.CAPTIONS, way = diff > 0 ? "up" : diff < 0 ? "down" : "even", heart = this.heartsTonight.at(-1);
            const glow = E.GIRLS.filter((g => (n.bank[g] ?? 0) > buy * 1.6)).sort(((x, y) => n.bank[y] - n.bank[x]))[0];
            const named = t => heart ? t.replace(/\{girl\}/g, L.NAMES[heart]) : t;
            await this.captionSay(L.pick(C.closing), 1500);
            if (glow) {
                await this.captionSay(L.pick(C.glow[glow]), 1800);
                await this.captionSay(named(L.pick(C.meThough[heart ? way + "Heart" : way])), 1800);
            } else await this.captionSay(named(L.pick(heart ? C.cashHeart[way] : {
                up: C.cashUp,
                down: C.cashDown,
                even: C.cashEven
            }[way])), 1800);
        }
        if (diff > 0) app.audio.coin();
        this.endCard({
            buy: buy,
            cash: cash,
            diff: diff,
            paid: r.credits,
            best: cash > prevBest && diff > 0,
            gave: gave,
            gaveTo: leaving?.girl
        });
    }
    async demoEnd() {
        const app = this.app, winner = this.night.last?.winner;
        app.resetDemo();
        const closing = DEMO_COPY.closeLines[winner];
        if (closing) {
            for (const [who, text] of closing) this.say(who, text);
            await this.talkOut();
        }
        if (!this.alive) return;
        await this.captionSay(DEMO_COPY.closeCaption);
        if (!this.alive) return;
        this.caption.classList.remove("on");
        this.capAct.classList.remove("on");
        this.destroy();
        app.game = {
            kind: "noir",
            instance: null,
            showPause: () => {}
        };
        const box = el("div", "nr-endtab");
        box.append(el("p", "nr-endtab-head", {
            textContent: DEMO_COPY.endHead
        }), el("h3", "nr-endtab-title even", {
            textContent: DEMO_COPY.endTitle
        }), el("p", "nr-demo-endnote", {
            textContent: DEMO_COPY.endNote
        }));
        const btns = el("div", "nr-endtab-btns");
        const again = el("button", "nr-btn", {
            type: "button",
            textContent: DEMO_COPY.again
        });
        const leave = el("button", "nr-btn ghost", {
            type: "button",
            textContent: DEMO_COPY.leave
        });
        const go = next => e => {
            e.stopPropagation();
            if (box.dataset.going) return;
            box.dataset.going = "1";
            app.audio.tap();
            next();
        };
        again.onclick = go((() => {
            app.resetDemo();
            app.handOff((() => startNight(app, "dime")));
        }));
        leave.onclick = go((() => app.toTitle()));
        btns.append(again, leave);
        box.append(btns);
        const wrap = el("div", "nr-endwrap");
        wrap.append(box);
        this.root.append(wrap);
    }
    endCard({buy: buy, cash: cash, diff: diff, paid: paid, best: best, gave: gave = 0, gaveTo: gaveTo = null}) {
        const app = this.app, table = E.TABLES[this.night.table];
        this.destroy();
        app.game = {
            kind: "noir",
            instance: null,
            showPause: () => document.addEventListener("visibilitychange", (function back() {
                if (document.hidden) return;
                document.removeEventListener("visibilitychange", back);
                if (app.game?.kind === "noir" && !app.game.instance) app.music?.duck(false);
            }))
        };
        const box = el("div", "nr-endtab");
        box.append(el("p", "nr-endtab-head", {
            textContent: `${table.name} · closing time`
        }), el("h3", `nr-endtab-title ${diff > 0 ? "up" : diff < 0 ? "down" : "even"}`, {
            textContent: diff > 0 ? "Up for the night" : diff < 0 ? "Down for the night" : "Broke even"
        }));
        const rows = el("dl", "nr-endtab-rows");
        const row = (k, v, cls = "") => rows.append(el("dt", "", {
            textContent: k
        }), el("dd", cls, {
            textContent: v
        }));
        row("Bought in", `${buy} cr`);
        row("Walked out with", `${cash} chips`);
        if (diff > 0) row(`Winnings paid ${E.WIN_MULT}x`, `+${paid - buy} cr`, "plus"); else if (diff < 0) row("Lost on the night", `${diff} cr`, "minus");
        if (gave) row(`For ${L.NAMES[gaveTo] || "her"}`, `-${gave.toLocaleString("en-US")} cr`, "minus");
        row("Your credits now", `${app.s.stats.credits.toLocaleString("en-US")} cr`, "total");
        box.append(rows);
        if (best) box.append(el("em", "nr-endtab-stamp", {
            textContent: "Best night yet"
        }));
        const btns = el("div", "nr-endtab-btns");
        const lock = lockReason(app, table);
        const again = el("button", "nr-btn", {
            type: "button",
            textContent: lock ? "Same table (locked)" : "Same table again",
            disabled: !!lock
        });
        if (lock) again.title = lock;
        const lobby = el("button", "nr-btn ghost", {
            type: "button",
            textContent: "Back to the lobby"
        });
        const go = next => e => {
            e.stopPropagation();
            if (box.dataset.going) return;
            box.dataset.going = "1";
            app.audio.tap();
            app.handOff(next);
        };
        again.onclick = go((() => startNight(app, table.id)));
        lobby.onclick = go((() => showLobby(app)));
        btns.append(again, lobby);
        box.append(btns);
        const wrap = el("div", "nr-endwrap");
        wrap.append(box);
        this.root.append(wrap);
    }
    pause() {
        if (!this.alive) return;
        if (!this.settled) this.save();
        this.destroy();
    }
    destroy() {
        this.alive = false;
        for (const s of [ ...this.sleepers ]) s.done();
        for (const t of [ ...this.tappers ]) t();
        for (const w of [ ...this.waiters ]) w(null);
        this.queue = [];
        this.timers.forEach((t => clearTimeout(t)));
        this._clearRace?.();
        this.ro?.disconnect();
        document.removeEventListener("visibilitychange", this.onVis);
    }
}
