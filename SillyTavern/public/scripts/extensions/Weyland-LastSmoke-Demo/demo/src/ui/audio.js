const AUDIO_DIR = new URL("../../assets/audio/vendors/", import.meta.url).href;

const SAMPLES = {
    tap: [ "kenney-ui-audio/Audio/click1.ogg", .05 ],
    deny: [ "kenney-digital-audio/Audio/highDown.ogg", .04 ],
    coin: [ "kenney-music-jingles/Audio/Pizzicato jingles/jingles_PIZZI00.ogg", .07 ]
};

const STORM = [ "oga-rain-thunder/Dark_Rainy_Night(ambience).ogg", .07 ];

export class Audio {
    constructor() {
        this.enabled = true;
        this.ctx = null;
        this.loops = {};
        this.buffers = {};
        this.loading = {};
        this.useFiles = true;
    }
    unlock() {
        if (this.ctx || !window.AudioContext) return;
        try {
            this.ctx = new AudioContext;
            this.master = this.ctx.createGain();
            this.master.gain.value = this.enabled ? .55 : 0;
            this.master.connect(this.ctx.destination);
            this.noiseBuf = this.makeNoise();
            for (const name of Object.keys(SAMPLES)) this.load(name, SAMPLES[name]);
        } catch {
            this.ctx = null;
        }
    }
    load(name, [file, target], dir = AUDIO_DIR) {
        if (!this.useFiles || !this.ctx) return Promise.resolve(null);
        return this.loading[name] ??= fetch(dir + file.split("/").map(encodeURIComponent).join("/")).then((r => {
            if (!r.ok) throw new Error(`${r.status}`);
            return r.arrayBuffer();
        })).then((data => this.ctx.decodeAudioData(data))).then((buf => {
            let sum = 0, n = 0;
            for (let c = 0; c < buf.numberOfChannels; c++) {
                const d = buf.getChannelData(c);
                for (let i = 0; i < d.length; i += 4) {
                    sum += d[i] * d[i];
                    n++;
                }
            }
            const rms = Math.sqrt(sum / Math.max(1, n)) || 1;
            return this.buffers[name] = {
                buf: buf,
                gain: Math.min(4, Math.max(.05, target / rms))
            };
        })).catch((err => {
            console.warn(`[audio] file "${name}" unavailable, using synth:`, err.message);
            return this.buffers[name] = null;
        }));
    }
    sample(name, {gain: gain = 1, rate: rate = 1} = {}) {
        if (!this.ready) return true;
        const s = this.buffers[name];
        if (!s) return false;
        const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
        src.buffer = s.buf;
        src.playbackRate.value = rate;
        g.gain.value = s.gain * gain;
        src.connect(g).connect(this.master);
        src.start();
        return true;
    }
    setEnabled(on) {
        this.enabled = on;
        if (!this.ctx) return;
        this.master.gain.setTargetAtTime(on ? .55 : 0, this.ctx.currentTime, .05);
        if (!on) {
            this.stopLoop("purr");
            this.stopLoop("rain");
        }
    }
    get ready() {
        return !!this.ctx && this.enabled;
    }
    makeNoise() {
        const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return buf;
    }
    tone(freq, {at: at = 0, dur: dur = .12, type: type = "sine", gain: gain = .12, slide: slide = 0} = {}) {
        if (!this.ready) return;
        const c = this.ctx, t = c.currentTime + at;
        const o = c.createOscillator(), g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain, t + .008);
        g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
        o.connect(g).connect(this.master);
        o.start(t);
        o.stop(t + dur + .02);
    }
    noise({at: at = 0, dur: dur = .3, gain: gain = .1, freq: freq = 800, q: q = .7, type: type = "lowpass"} = {}) {
        if (!this.ready) return;
        const c = this.ctx, t = c.currentTime + at;
        const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = this.noiseBuf;
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
        s.connect(f).connect(g).connect(this.master);
        s.start(t, Math.random());
        s.stop(t + dur + .05);
    }
    tap() {
        this.sample("tap") || this.tone(880, {
            dur: .05,
            type: "triangle",
            gain: .05
        });
    }
    open() {
        this.sample("open") || (this.tone(660, {
            dur: .08,
            type: "sine",
            gain: .06
        }), this.tone(990, {
            at: .06,
            dur: .1,
            gain: .05
        }));
    }
    close() {
        this.tone(740, {
            dur: .08,
            gain: .05,
            slide: .7
        });
    }
    blip(i = 0) {
        this.tone(520 + i % 5 * 40, {
            dur: .025,
            type: "square",
            gain: .012
        });
    }
    coin() {
        this.sample("coin") || (this.tone(988, {
            dur: .07,
            type: "square",
            gain: .04
        }), this.tone(1319, {
            at: .07,
            dur: .16,
            type: "square",
            gain: .04
        }));
    }
    deny() {
        this.sample("deny") || this.tone(220, {
            dur: .14,
            type: "triangle",
            gain: .07,
            slide: .8
        });
    }
    heart() {
        this.sample("heart", {
            rate: .9 + Math.random() * .25
        }) || (this.tone(1046, {
            dur: .09,
            gain: .05
        }), this.tone(1318, {
            at: .07,
            dur: .12,
            gain: .04
        }));
    }
    bondUp() {
        this.sample("bondUp") || [ 523, 659, 784, 1046, 1318 ].forEach(((f, i) => this.tone(f, {
            at: i * .09,
            dur: .35,
            type: "triangle",
            gain: .07
        })));
    }
    notify() {
        this.sample("notify") || (this.tone(1175, {
            dur: .1,
            gain: .07
        }), this.tone(1568, {
            at: .11,
            dur: .18,
            gain: .06
        }));
    }
    catch() {
        this.catchN = ((this.catchN || 0) + 1) % 3;
        this.sample(`catch${this.catchN + 1}`, {
            rate: .95 + Math.random() * .15
        }) || (this.tone(784, {
            dur: .05,
            type: "square",
            gain: .035
        }), this.tone(1175, {
            at: .04,
            dur: .07,
            type: "square",
            gain: .03
        }));
    }
    microWin() {
        this.sample("microWin") || [ 784, 988, 1319 ].forEach(((f, i) => this.tone(f, {
            at: i * .07,
            dur: .12,
            type: "square",
            gain: .04
        })));
    }
    microLose() {
        this.sample("microLose") || this.tone(330, {
            dur: .3,
            type: "square",
            gain: .04,
            slide: .5
        });
    }
    speedUp() {
        this.sample("speedUp") || [ 523, 659, 784, 1046 ].forEach(((f, i) => this.tone(f, {
            at: i * .06,
            dur: .1,
            type: "square",
            gain: .04
        })));
    }
    gameOver() {
        this.sample("gameOver") || [ 659, 523, 392, 262 ].forEach(((f, i) => this.tone(f, {
            at: i * .16,
            dur: .22,
            type: "triangle",
            gain: .07
        })));
    }
    mew() {
        this.sample("mew", {
            gain: .8
        }) || this.tone(900, {
            dur: .3,
            gain: .03,
            slide: 1.3
        });
    }
    bonk() {
        this.tone(180, {
            dur: .2,
            type: "sawtooth",
            gain: .05,
            slide: .5
        });
        this.noise({
            dur: .12,
            gain: .05,
            freq: 500
        });
    }
    glitch() {
        for (let i = 0; i < 5; i++) this.tone(200 + Math.random() * 1800, {
            at: i * .025,
            dur: .03,
            type: "square",
            gain: .02
        });
        this.noise({
            dur: .18,
            gain: .04,
            freq: 3e3,
            type: "highpass"
        });
    }
    thunder() {
        this.noise({
            dur: 2.6,
            gain: .32,
            freq: 160,
            q: .4
        });
        this.noise({
            at: .05,
            dur: .6,
            gain: .15,
            freq: 900
        });
    }
    palm() {
        [ 392, 494, 587 ].forEach(((f, i) => this.tone(f, {
            at: i * .12,
            dur: 1.4,
            gain: .04
        })));
        this.noise({
            dur: 1.2,
            gain: .02,
            freq: 2400,
            type: "bandpass",
            q: 3
        });
    }
    startLoop(name, build) {
        if (!this.ready || this.loops[name]) return;
        this.loops[name] = build(this.ctx);
    }
    stopLoop(name) {
        const l = this.loops[name];
        if (!l) return;
        delete this.loops[name];
        const t = this.ctx.currentTime;
        l.gain.gain.setTargetAtTime(0, t, .15);
        setTimeout((() => l.nodes.forEach((n => {
            try {
                n.stop();
            } catch {}
        }))), 900);
    }
    purr(on) {
        if (!on) return this.stopLoop("purr");
        if (this.buffers.purr) return this.startLoop("purr", (c => this.fileLoop(c, this.buffers.purr, .2)));
        this.startLoop("purr", (c => {
            const s = c.createBufferSource();
            s.buffer = this.noiseBuf;
            s.loop = true;
            const f = c.createBiquadFilter();
            f.type = "lowpass";
            f.frequency.value = 220;
            const amp = c.createGain();
            amp.gain.value = 0;
            const lfo = c.createOscillator();
            lfo.frequency.value = 24;
            const depth = c.createGain();
            depth.gain.value = .5;
            lfo.connect(depth).connect(amp.gain);
            const gain = c.createGain();
            gain.gain.value = 0;
            gain.gain.setTargetAtTime(.5, c.currentTime, .2);
            s.connect(f).connect(amp).connect(gain).connect(this.master);
            s.start();
            lfo.start();
            return {
                gain: gain,
                nodes: [ s, lfo ]
            };
        }));
    }
    fileLoop(c, {buf: buf, gain: g0}, fade = 1.2, level = 1) {
        const s = c.createBufferSource();
        s.buffer = buf;
        s.loop = true;
        const gain = c.createGain();
        gain.gain.value = 0;
        gain.gain.setTargetAtTime(g0 * level, c.currentTime, fade);
        s.connect(gain).connect(this.master);
        s.start(0, buf.duration > 20 ? Math.random() * buf.duration : 0);
        return {
            gain: gain,
            nodes: [ s ],
            file: true
        };
    }
    rain(level, {storm: storm = false} = {}) {
        if (!level) return this.stopLoop("rain");
        if (storm && this.useFiles && this.ctx) {
            if (this.loops.rain && !this.loops.rain.file) this.stopLoop("rain");
            if (this.buffers.storm) return this.startLoop("rain", (c => this.fileLoop(c, this.buffers.storm, 1.5)));
            this.load("storm", STORM).then((b => {
                if (b && this.loops.rain && !this.loops.rain.file && this.wantStorm) this.rain(level, {
                    storm: true
                });
            }));
            this.wantStorm = true;
        } else {
            this.wantStorm = false;
            if (this.loops.rain?.file) this.stopLoop("rain");
        }
        if (this.loops.rain) {
            if (!this.loops.rain.file) this.loops.rain.gain.gain.setTargetAtTime(.05 * level, this.ctx.currentTime, .5);
            return;
        }
        this.startLoop("rain", (c => {
            const s = c.createBufferSource();
            s.buffer = this.noiseBuf;
            s.loop = true;
            const f = c.createBiquadFilter();
            f.type = "bandpass";
            f.frequency.value = 1400;
            f.Q.value = .5;
            const gain = c.createGain();
            gain.gain.value = 0;
            gain.gain.setTargetAtTime(.05 * level, c.currentTime, 1);
            s.connect(f).connect(gain).connect(this.master);
            s.start();
            return {
                gain: gain,
                nodes: [ s ]
            };
        }));
    }
}
