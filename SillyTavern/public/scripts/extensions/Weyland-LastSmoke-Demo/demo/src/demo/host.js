import { Audio } from "../ui/audio.js";

import { Music } from "../ui/music.js";

import { openNoir } from "../games/noir/noirUI.js";

const GIRLS = [ "belle", "eve", "astrid" ];

const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
};

const SAVE_KEY = "lastSmokeDemo.v1";

const SAVE_FRESH_MS = 6 * 3600 * 1e3;

function loadSaved() {
    try {
        const r = JSON.parse(localStorage.getItem(SAVE_KEY));
        const s = r?.s;
        if (r && Date.now() - r.t < SAVE_FRESH_MS && s?.games?.noir?.round?.snapshot && s.stats && s.games.noir.hearts) return s;
    } catch {}
    return null;
}

const SKIP_KEY = "lastSmokeDemo.skipTutorial";

function loadSkipTutorial() {
    try {
        return localStorage.getItem(SKIP_KEY) === "1";
    } catch {
        return false;
    }
}

function freshState(skipTutorial = false) {
    return {
        stats: {
            credits: 100,
            bond: 1,
            energy: 0,
            affection: 0
        },
        games: {
            noir: {
                best: 0,
                round: null,
                nights: 0,
                taught: skipTutorial,
                visited: [],
                music: true,
                glitch: null,
                flirtTaught: skipTutorial,
                hearts: Object.fromEntries(GIRLS.map((g => [ g, {
                    n: 0,
                    seen: 0,
                    later: false,
                    flags: {}
                } ])))
            }
        }
    };
}

export class DemoHost {
    constructor(layer) {
        this.demo = true;
        this.layer = layer;
        this.audio = new Audio;
        this.music = new Music(this.audio);
        this.store = {
            changed: () => this.persist(),
            now: () => Date.now()
        };
        this.game = null;
        this.musicFor = null;
        this.gameLayerOwner = null;
        this.skipTutorial = loadSkipTutorial();
        this.s = loadSaved() || freshState(this.skipTutorial);
    }
    setSkipTutorial(skip) {
        this.skipTutorial = !!skip;
        try {
            if (this.skipTutorial) localStorage.setItem(SKIP_KEY, "1"); else localStorage.removeItem(SKIP_KEY);
        } catch {}
        this.s.games.noir.taught = this.skipTutorial;
        this.s.games.noir.flirtTaught = this.skipTutorial;
        this.persist();
    }
    persist() {
        try {
            if (this.s.games.noir.round?.snapshot) localStorage.setItem(SAVE_KEY, JSON.stringify({
                t: Date.now(),
                s: this.s
            })); else localStorage.removeItem(SAVE_KEY);
        } catch {}
    }
    resetDemo() {
        const music = this.s?.games?.noir?.music;
        this.s = freshState(this.skipTutorial);
        if (music === false) this.s.games.noir.music = false;
        this.persist();
    }
    now() {
        return Date.now();
    }
    uid() {
        return Math.random().toString(36).slice(2, 10);
    }
    motion() {
        return !matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    render() {}
    afterEvents() {}
    open() {
        return openNoir(this);
    }
    gameLayer(title, {onPause: onPause} = {}) {
        this.gameLayerOwner = Symbol(title);
        if (this.musicFor && this.s.games.noir.music !== false) this.music.play(this.musicFor);
        const layer = this.layer;
        layer.replaceChildren();
        layer.hidden = false;
        const quit = h("button", {
            className: "btn small ghost game-quit",
            textContent: "Quit",
            type: "button"
        });
        quit.onclick = () => {
            if (quit.dataset.armed) return this.quitGame();
            quit.dataset.armed = "1";
            quit.textContent = "Walk out? Folds hand";
            quit.classList.add("armed");
            setTimeout((() => {
                if (quit.isConnected) {
                    delete quit.dataset.armed;
                    quit.textContent = "Quit";
                    quit.classList.remove("armed");
                }
            }), 3e3);
        };
        const pause = h("button", {
            className: "icon-btn",
            type: "button",
            onclick: () => onPause?.()
        });
        pause.setAttribute("aria-label", "Pause");
        pause.innerHTML = '<svg class="icon"><use href="#i-pause"/></svg>';
        const head = h("header", {
            className: "game-head"
        }, pause, h("strong", {
            textContent: title
        }), h("span", {
            className: "game-energy"
        }), quit);
        const stage = h("div", {
            className: "game-stage"
        });
        layer.append(head, stage);
        requestAnimationFrame((() => layer.classList.add("open")));
        return {
            layer: layer,
            stage: stage
        };
    }
    endGameLayer() {
        const layer = this.layer, owner = this.gameLayerOwner;
        this.game?.cancelCountdown?.();
        this.music.stop();
        layer.classList.remove("open");
        setTimeout((() => {
            if (this.gameLayerOwner !== owner) return;
            layer.hidden = true;
            layer.replaceChildren();
        }), 250);
        this.game?.instance?.destroy?.();
        this.game = null;
    }
    handOff(next) {
        const owner = this.gameLayerOwner;
        this.game?.instance?.destroy?.();
        this.game = null;
        this.layer.querySelector(".game-stage")?.classList.add("handing-off");
        setTimeout((async () => {
            try {
                await next();
            } finally {
                if (this.gameLayerOwner === owner && !this.layer.hidden) this.endGameLayer();
            }
        }), 260);
    }
    pauseGame() {
        if (!this.game) return;
        this.game.instance?.pause?.();
        this.music.duck(true);
        this.game.showPause?.();
    }
    pausedRound() {
        return null;
    }
    showResumeCard() {
        setTimeout((() => this.open()), 300);
    }
    quitGame() {
        this.resetDemo();
        this.endGameLayer();
        setTimeout((() => this.open()), 300);
    }
    toTitle() {
        this.resetDemo();
        this.endGameLayer();
        setTimeout((() => this.open()), 300);
    }
    blocked(reason) {
        this.toast(reason);
    }
    toast(message, ms = 3e3) {
        const t = h("div", {
            className: "toast in",
            textContent: message
        });
        this.layer.parentElement.append(t);
        setTimeout((() => t.remove()), ms);
    }
    close() {
        if (window.parent && window.parent !== window) window.parent.postMessage({
            lastSmokeDemo: "close"
        }, location.origin); else {
            this.endGameLayer();
            setTimeout((() => this.open()), 300);
        }
    }
}
