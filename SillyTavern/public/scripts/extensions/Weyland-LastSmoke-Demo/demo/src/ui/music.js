const FILES = {
    "noir-lobby": "bgm-lobby.ogg",
    noir: "bgm-bar.ogg",
    "noir-last": "bgm-bar.ogg"
};

const LEVEL = .5, DUCKED = .12;

export class Music {
    constructor(audio) {
        this.audio = audio;
        this.dir = new URL("../../assets/audio/noir/", import.meta.url).href;
        this.track = null;
        this.ducked = false;
    }
    get level() {
        return this.ducked ? DUCKED : LEVEL;
    }
    play(id) {
        const file = FILES[id];
        if (!file || !this.audio.enabled) return;
        if (this.track?.id === id) {
            if (this.track.el.paused) this.start(this.track);
            return;
        }
        this.stop();
        const el = new window.Audio(this.dir + file);
        el.loop = true;
        el.volume = 0;
        el.preload = "auto";
        this.track = {
            id: id,
            el: el
        };
        this.start(this.track);
    }
    start(track) {
        track.el.play().then((() => this.fade(track.el, this.level))).catch((() => {
            addEventListener("pointerdown", (() => {
                if (this.track === track) this.start(track);
            }), {
                once: true,
                capture: true
            });
        }));
    }
    stop() {
        const t = this.track;
        this.track = null;
        if (!t) return;
        this.fade(t.el, 0, (() => t.el.pause()));
    }
    duck(on) {
        this.ducked = !!on;
        if (this.track) this.fade(this.track.el, this.level);
    }
    fade(el, to, done) {
        clearInterval(el._fade);
        el._fade = setInterval((() => {
            const d = to - el.volume;
            if (Math.abs(d) < .03) {
                el.volume = to;
                clearInterval(el._fade);
                done?.();
                return;
            }
            el.volume = Math.min(1, Math.max(0, el.volume + Math.sign(d) * .03));
        }), 40);
    }
}
