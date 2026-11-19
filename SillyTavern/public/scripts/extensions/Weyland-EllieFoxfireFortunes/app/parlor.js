// Foxfire Fortunes. One plain script, no imports. The SAME file runs in two places:
// - inside WeyPhone (an iframe made by the Weyland-EllieFoxfireFortunes extension): everything that
//   touches SillyTavern goes through window.parent.ellieFoxfireFortunes, and a real model writes the fortune;
// - opened on its own (the sandbox): sandboxApi() at the bottom stands in, and the cards write a
//   stand-in fortune with no model call.
// Both have the shape of Muse's Story Machine's parent API (status / generate / loadStory / setChapter /
// setActive / finish / eject / shelve / unshelve), and a fortune is the same story object (title, premise,
// chapters[{name, scene, ends}], finale, fork) plus a card on every chapter, so the roleplay injection is
// Muse's storyCore.js unchanged.
(() => {
    const { ARCANA, POSITIONS, ENDS, cardFace, BACK_URL, esc } = window.EFF;
    const $ = id => document.getElementById(id);
    const app = $('app'), stage = $('stage'), scene = $('scene');
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (list, not) => { let x; do { x = list[Math.floor(Math.random() * list.length)]; } while (list.length > 1 && x === not); return x; };
    document.documentElement.style.setProperty('--back', BACK_URL);

    function el(tag, attrs = {}, ...kids) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === 'class') n.className = v;
            else if (k === 'text') n.textContent = v;
            else if (k === 'html') n.innerHTML = v;
            else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
            else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
        }
        for (const kid of kids) if (kid != null && kid !== false) n.append(kid);
        return n;
    }

    // ---------- what Ellie says. Short on purpose: if she talks a lot she is written wrong. ----------
    // [mood, text]. Moods: soft, shy, happy, think, startle, fluster.
    const LINES = {
        greet: [['shy', 'Hi... You can sit, if you like.'], ['shy', 'Oh... hi again.']],
        ask: [['shy', 'Um... whenever you’re ready.']],
        ownReading: [['fluster', 'Oh... that’s me. Um, I’ll try.']],
        shuffle: [['shy', 'Just a second... I always thank the cards.'], ['shy', 'Um... pick whichever feels right.']],
        pickHint: [['shy', 'I could pick one for you... if you like.']],
        takeOut: [['shy', 'Oh... back it goes.']],
        full: [['shy', 'The spread is full. You can take one out.']],
        turn: [['shy', 'Oh... the other way. Okay.']],
        moon: [['shy', 'A full moon. That feels safe.'], ['shy', 'Just a little shadow.'], ['shy', 'I could light another candle.'], ['shy', 'Um... stay close?']],
        ember: [['soft', 'Just a little warmth.'], ['shy', 'A little flirty... okay.'], ['fluster', 'Oh. That’s... warm.'], ['fluster', 'Um... I’ll leave that part to you.']],
        incense: [['shy', 'We have time.'], ['shy', 'Somewhere in the middle?'], ['shy', 'Oh... a short one.']],
        cross: [['shy', 'One road. Okay.'], ['shy', 'Two roads... you can choose later.']],
        // One per Connection step, Unset first (index = state.conn).
        conn: [['shy', 'Oh... we can leave that to the cards.'], ['soft', 'Just friends. That’s nice.'], ['fluster', 'Casual... oh. Um. Okay.'], ['think', 'It’s... complicated. I see.'], ['fluster', 'Dating... um. Okay.'], ['fluster', 'Oh... together, together.'], ['shy', 'It’s... fraying. Oh.'], ['shy', 'Oh... it broke. I’m sorry.']],
        keptLater: [['shy', 'It’ll be on the branch... for later.']],
        gaze: [['shy', 'Um... let me look.'], ['shy', 'Just a moment.']],
        gazing: [['shy', 'I think I see it now...'], ['shy', 'A little longer, if that’s okay.']],
        done: [['shy', 'Oh... here it is.'], ['shy', 'Um... I think it’s ready.']],
        sealed: [['shy', 'There. Um... good luck.']],
        tied: [['shy', 'It’ll be here if you want it.']],
        tiedBad: [['shy', 'We can leave that one here.']],
        burned: [['shy', 'Oh... there it goes.'], ['shy', 'I think it’s okay to let it go.']],
        unveiled: [['shy', 'We can go on, then.']],
        veiled: [['shy', 'The cards can wait.']],
        next: [['shy', 'Um... the next card.']],
        prev: [['shy', 'Back one... okay.']],
        crossed: [['shy', 'The other road, then?']],
        finished: [['shy', 'That was the last one... thank you.']],
        ball: [['shy', 'Oh... sorry. It does that.'], ['shy', 'Only a little flame.'], ['shy', 'Could you leave the glass be? It’s old.']],
        ear: [['shy', 'Oh... those are sensitive.']],
        tail: [['shy', 'Um... please leave my tail alone.']],
        idle: [['shy', 'I like it when it’s quiet like this.'], ['shy', 'The rain sounds nice tonight.']],
        noChat: [['shy', 'Um... could you open a chat first?']],
        empty: [['shy', 'Oh... a blank slip is okay.']],
        branchEmpty: [['shy', 'Nothing on the branch yet.']],
        // Content-filter refusals (Lucky's wording, 2026-11-18): the first three in a session, then any after that.
        filtered: [['shy', 'The spirits are being very.. picky.. today.'], ['fluster', '.. sorry.. the spirits.. um.. can be kind of ridiculous.. about content stuff..']],
    };
    // The Darkness dial. Briefly renamed "Intensity" / "Intense" on 2026-11-17 and put back the same day (Lucky
    // preferred "Dark"). The prompt explains what each step means; the label only has to read well.
    const DARK = ['Soft', 'Stakes', 'Dark', 'Brutal'];
    const SPICE = ['Sweet', 'Flirty', 'Steamy', 'Filthy'], PACE = ['slow', 'steady', 'brisk'], PACE_NAMES = ['Slow', 'Steady', 'Brisk'];
    // The Connection dial (QA via Lucky, 2026-11-18): how {char} and {user} stand with each other. Step 0 is Unset:
    // nothing is sent, and the omen shows dimmed until it is tapped. The ids are what the request reads
    // (fortuneCore.js CONNECTION), so never rename one.
    // Added the same day (Lucky): Casual and Complicated after Platonic, Breaking between Partnered and Broken.
    // The omen's drawing is picked by id (data-c="casual"), not by position, so a step can be added anywhere.
    const CONN = ['Unset', 'Platonic', 'Casual', 'Complicated', 'Dating', 'Partnered', 'Breaking', 'Broken'];
    const CONN_IDS = [null, 'platonic', 'casual', 'complicated', 'dating', 'partnered', 'breaking', 'broken'];
    const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
    const LUCK = [['大吉', 'Great Blessing'], ['吉', 'Blessing'], ['小吉', 'Small Blessing'], ['末吉', 'Blessing Yet to Come'], ['凶', 'Trouble']];

    const state = { n: 5, slots: [], spice: 1, dark: 1, pace: 1, conn: 0, cross: false, draft: null, mode: 'draft', fromBranch: null, held: null, lastTouch: Date.now(), gazeToken: 0, busy: false };
    // Any tap also wakes her if she dozed off during a quiet stretch (see the idle timer in init).
    const touch = () => { state.lastTouch = Date.now(); };

    // ---------- sound: parlor theme, rain and synthesized effects ----------
    const snd = (() => {
        let ctx, master, on = true, rain, music, musicGain, musicFade;
        const MUSIC_LEVEL = 0.75, MUSIC_FADE_SECONDS = 2.75;
        const readingClips = new Map();
        let readingSoundId = 0;
        const canPlay = () => on && (!navigator.userActivation || navigator.userActivation.hasBeenActive);
        const SCALE = [146.83, 220, 293.66, 311.13, 392, 440, 466.16, 587.33, 622.25, 783.99];
        try { on = localStorage.getItem('eff.sound') !== '0'; } catch { /* storage blocked */ }
        function ac() {
            if (!ctx) {
                ctx = new (window.AudioContext || window.webkitAudioContext)();
                master = ctx.createGain(); master.gain.value = on ? 0.6 : 0; master.connect(ctx.destination);
            }
            if (ctx.state === 'suspended') ctx.resume();
            return ctx;
        }
        function env(v, dur, t0) { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); g.connect(master); return g; }
        function tone(f, v, dur, type = 'triangle', at = 0) {
            const t0 = ctx.currentTime + at, o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0);
            o.connect(env(v, dur, t0)); o.start(t0); o.stop(t0 + dur + 0.05); return o;
        }
        function hiss(v, dur, freq, q = 1, at = 0, sweepTo) {
            const t0 = ctx.currentTime + at, len = Math.ceil(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
            const s = ctx.createBufferSource(); s.buffer = buf;
            const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
            if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
            s.connect(f); f.connect(env(v, dur, t0)); s.start(t0);
        }
        const pluck = (f, v = 0.22, at = 0) => { tone(f, v, 1.5, 'triangle', at); tone(f * 2, v * 0.3, 0.5, 'sine', at); hiss(v * 0.4, 0.03, 3000, 1, at); };
        const bowl = (f = 220, v = 0.2) => { tone(f, v, 5, 'sine'); tone(f * 2.76, v * 0.35, 3.2, 'sine'); tone(f * 5.4, v * 0.12, 1.6, 'sine'); };
        const FX = {
            strike: () => { hiss(0.3, 0.12, 4200, 0.8); hiss(0.18, 0.7, 500, 0.6, 0.08, 1800); },
            // Card sounds at 40% of their first level (Lucky, 2026-11-17: cards are not loud). `lay` is a card
            // being set down in the spread, the quiet version of `place`.
            flip: () => hiss(0.12, 0.07, 2600, 1.2),
            slide: () => hiss(0.064, 0.22, 1400, 0.7, 0, 3200),
            lay: () => { tone(110, 0.1, 0.12, 'sine'); pluck(pick(SCALE.slice(2, 8)), 0.056, 0.03); },
            place: () => { tone(110, 0.25, 0.12, 'sine'); pluck(pick(SCALE.slice(2, 8)), 0.14, 0.03); },
            tick: () => tone(880, 0.07, 0.05, 'sine'),
            tap: () => pluck(pick(SCALE.slice(4)), 0.1),
            nope: () => { pluck(155.56, 0.16); pluck(146.83, 0.16, 0.12); },
            whoosh: () => hiss(0.3, 0.9, 300, 0.7, 0, 2400),
            wisp: () => { hiss(0.12, 0.4, 900, 2, 0, 2600); tone(1174, 0.05, 0.4, 'sine'); },
            bowl: () => bowl(220), bowlLow: () => bowl(146.83, 0.16),
            chime: () => [783.99, 1174.66, 932.33, 1567.98].forEach((f, i) => tone(f, 0.08, 1.8, 'sine', i * 0.11)),
            unroll: () => hiss(0.2, 0.6, 1800, 0.5, 0, 700),
            stamp: () => { tone(70, 0.5, 0.2, 'sine'); hiss(0.3, 0.06, 500, 0.6); },
            burn: () => { hiss(0.3, 1.5, 600, 0.6, 0, 3200); hiss(0.14, 1.5, 5000, 2); },
            gasp: () => hiss(0.1, 0.16, 2400, 3, 0, 5200),
            blip: () => tone(rand(560, 640), 0.012, 0.05, 'sine'),
            // Only reached when the recording below is missing (the synth stand-ins for Codex's two new ones).
            shuffle: () => { hiss(0.064, 0.22, 1400, 0.7, 0, 3200); hiss(0.064, 0.22, 1400, 0.7, 0.18, 3200); hiss(0.064, 0.22, 1400, 0.7, 0.36, 3200); },
            knot: () => pluck(pick(SCALE.slice(4)), 0.1),
        };
        // Codex's recorded effects (EFF-32). Each one replaces the synth sound of the same name once it has
        // loaded; until then, or where fetch is blocked (the sandbox opened as a file), the synth plays.
        const RECORDED = { strike: 'match', flip: 'card-flip', slide: 'card-slide', shuffle: 'shuffle', unroll: 'paper-unroll', stamp: 'stamp', burn: 'paper-burn', knot: 'knot' };
        // Playback level per effect. The files are mastered about as loud as the music (RMS around -20 dB, peaks
        // near 0), so at full level a shuffle and a burn hit like "a loud whip, then loud fire" (Lucky, 2026-11-17).
        // Each gain brings its file to about -31 dB RMS, roughly where the synth sounds they replace sat and well
        // under the music. Measured in the browser (decodeAudioData) on 2026-11-17; re-measure if a file changes.
        // The card sounds (flip, slide, shuffle) are 60% under that again: "cards are not loud" (Lucky, 2026-11-17).
        const RECORDED_GAIN = { strike: 0.30, flip: 0.104, slide: 0.108, shuffle: 0.116, unroll: 0.29, stamp: 0.20, burn: 0.31, knot: 0.33 };
        const buffers = new Map();
        let loading = false;
        function loadRecorded() {
            if (loading || location.protocol === 'file:') return;
            loading = true;
            for (const [name, file] of Object.entries(RECORDED)) {
                fetch(`assets/${file}.ogg`).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
                    .then(b => ctx.decodeAudioData(b)).then(buf => buffers.set(name, buf)).catch(() => { /* keep the synth */ });
            }
        }
        function playRecorded(name) {
            const buf = buffers.get(name);
            if (!buf) return false;
            const s = ctx.createBufferSource(); s.buffer = buf;
            // A small random pitch so a run of card flips doesn't sound like one sample on repeat.
            if (name === 'flip' || name === 'slide') s.playbackRate.value = rand(0.94, 1.06);
            const g = ctx.createGain(); g.gain.value = RECORDED_GAIN[name] ?? 0.3;
            s.connect(g); g.connect(master); s.start();
            return true;
        }
        function startMusic() {
            if (!on) return;
            // Started at open (below, at boot) the audio context can come up suspended until the first touch;
            // the music element then "plays" into a silent context. The first click wakes the context.
            if (music?.paused === false) { if (ctx?.state === 'suspended') ctx.resume(); return; }
            try {
                if (!music) {
                    music = new Audio('assets/bgm-parlor.ogg');
                    music.loop = true;
                    // Browsers can silence file:// media routed through Web Audio.
                    if (location.protocol !== 'file:') {
                        ac();
                        musicGain = ctx.createGain();
                        musicGain.gain.value = 0;
                        ctx.createMediaElementSource(music).connect(musicGain);
                        musicGain.connect(master);
                    }
                }
                const gain = musicGain?.gain;
                if (gain) {
                    ac();
                    gain.cancelScheduledValues(ctx.currentTime);
                    gain.setValueAtTime(0, ctx.currentTime);
                } else {
                    music.volume = 0;
                }
                music.play().then(() => {
                    if (!on || music.paused) return;
                    if (gain) {
                        const now = ctx.currentTime;
                        gain.setValueAtTime(0, now);
                        gain.linearRampToValueAtTime(MUSIC_LEVEL, now + MUSIC_FADE_SECONDS);
                        return;
                    }
                    const began = performance.now();
                    const fade = now => {
                        const progress = Math.max(0, Math.min(1, (now - began) / (MUSIC_FADE_SECONDS * 1000)));
                        music.volume = MUSIC_LEVEL * 0.6 * progress;
                        if (progress < 1) musicFade = requestAnimationFrame(fade);
                    };
                    musicFade = requestAnimationFrame(fade);
                }).catch(() => { /* retry on the next click */ });
            } catch { /* sound is optional */ }
        }
        function stopMusic() {
            cancelAnimationFrame(musicFade);
            music?.pause();
        }
        function startReadingSounds() {
            if (!canPlay()) return;
            const id = ++readingSoundId;
            try {
                ac();
                for (const [name, fallback] of [['bowl', 'bowlLow'], ['fire-rise', 'whoosh']]) {
                    let clip = readingClips.get(name);
                    if (!clip) {
                        clip = new Audio('assets/' + name + '.ogg');
                        // The direct-file sandbox uses native media output.
                        if (location.protocol === 'file:') clip.volume = 0.6;
                        else ctx.createMediaElementSource(clip).connect(master);
                        readingClips.set(name, clip);
                    }
                    clip.currentTime = 0;
                    clip.play().catch(error => {
                        if (on && id === readingSoundId && app.dataset.screen === 'gaze' && error.name !== 'AbortError') {
                            FX[fallback]();
                        }
                    });
                }
            } catch { /* sound is optional */ }
        }
        function stopReadingSounds() {
            readingSoundId++;
            for (const clip of readingClips.values()) clip.pause();
        }
        // The fire bed: a soft roar of the foxfire, heard ONLY while she gazes into the ball (Lucky, 2026-11-17).
        // It used to be the "rain" loop, started with the candles and running under everything, which players
        // hear as a fire that never goes out. It is now started and stopped by show() for the gaze screen, at 60%
        // of its old level (0.035 -> 0.021), with a short fade so it doesn't snap on and off. Codex's recorded
        // rain (amb-rain.ogg) is not played: there is no constant background sound any more.
        function ambience(start) {
            if (rain) {
                const old = rain, og = rain.gainNode;
                try { og.gain.setTargetAtTime(0, ctx.currentTime, 0.25); old.stop(ctx.currentTime + 1.2); } catch { /* already stopped */ }
                rain = null;
            }
            if (!start || !on) return;
            ac();
            const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / 9000));
            rain = ctx.createBufferSource(); rain.buffer = buf; rain.loop = true;
            const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.4;
            const g = ctx.createGain(); g.gain.setValueAtTime(0, ctx.currentTime); g.gain.setTargetAtTime(0.021, ctx.currentTime, 0.4);
            rain.gainNode = g;
            rain.connect(f); f.connect(g); g.connect(master); rain.start();
        }
        return {
            // No sound before the first tap: browsers refuse it and log a warning (her hello on a return visit is silent).
            fx(name) { if (!canPlay()) return; try { ac(); loadRecorded(); if (!playRecorded(name)) FX[name]?.(); } catch { /* audio is decoration */ } },
            ambience, startMusic, stopMusic, startReadingSounds, stopReadingSounds, get on() { return on; },
            setOn(v) {
                on = v;
                try { localStorage.setItem('eff.sound', v ? '1' : '0'); } catch { /* storage blocked */ }
                if (ctx) master.gain.value = v ? 0.6 : 0;
                if (v) startMusic();
                else { stopMusic(); stopReadingSounds(); }
                ambience(false);   // the fire bed is gone (2026-11-18); this just stops a leftover loop
            },
        };
    })();

    // ---------- the camera: the painting is 1280x720 units; the stage is a window onto it ----------
    // Measured on the video's frame (stretched to 1280x720) with the gaze ring drawn over it: the glass is centred
    // at 850,350, radius about 145.
    const BALL = { x: 850, y: 350, r: 145 };
    const CAMS = { dark: { x: 640, y: 330, z: 1 }, rest: { x: 640, y: 320, z: 1 }, ask: { x: 640, y: 300, z: 1 }, draw: { x: 660, y: 320, z: 1 }, gaze: { x: 850, y: 350, z: 1.55 }, branch: { x: 520, y: 280, z: 1.1 } };
    const view = { cam: CAMS.dark, s: 1, tx: 0, ty: 0 };
    // The crop used to cut most of the ball off (Lucky, 2026-11-18): the stage is a narrow window on a 16:9
    // picture, and centring on a point left of the ball pushed the glass past the right edge. Now the whole ball
    // (plus a little air) is always kept in frame: the zoom backs off until it fits (never below "cover", which
    // would show black bars), and the window slides just far enough to bring it in.
    function layout() {
        const r = stage.getBoundingClientRect();
        if (!r.width) return;
        const cover = Math.max(r.width / 1280, r.height / 720);
        const need = BALL.r * 2.6;   // the ball's diameter, the ring around it and a little air
        const fit = Math.min(r.width, r.height) / need;
        const s = Math.max(cover, Math.min(cover * view.cam.z, fit));
        // Where the picture's left (or top) edge goes for a zoom k: centred on `centre`, then slid so the ball's
        // edges (lo*k+t and hi*k+t on screen) stay inside 0..size when the ball fits at all, and never so far
        // that the picture's own edge comes into view.
        const keep = (size, full, centre, lo, hi, k) => {
            let t = size / 2 - centre * k;
            if ((hi - lo) * k <= size) t = Math.min(Math.max(t, -lo * k), size - hi * k);
            return Math.min(0, Math.max(size - full * k, t));
        };
        const m = BALL.r * 1.12;
        const tx = keep(r.width, 1280, view.cam.x, BALL.x - m, BALL.x + m, s);
        const ty = keep(r.height, 720, view.cam.y, BALL.y - m, BALL.y + m, s);
        Object.assign(view, { s, tx, ty });
        scene.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
        // The gaze ring circles the ball itself, wherever the crop puts it. It used to sit in the middle of the
        // stage, a different spot from the ball, so the words rising in the glass ran across its line.
        const ring = $('gazeRing');
        if (ring) {
            const g = CAMS.gaze, gs = Math.max(cover, Math.min(cover * g.z, fit));
            const gx = keep(r.width, 1280, g.x, BALL.x - m, BALL.x + m, gs), gy = keep(r.height, 720, g.y, BALL.y - m, BALL.y + m, gs);
            ring.style.left = `${gx + BALL.x * gs}px`; ring.style.top = `${gy + BALL.y * gs}px`;
            // Drawn INSIDE the glass (QA, 2026-11-18: it still sat over the ball's rim). The circle's radius is 54/120
            // of this width, so 1.7 r puts the line at about 0.77 of the ball's radius, clear of the rim and its shine
            // (1.8 still nearly touched the rim at the top on a 400px-wide phone).
            ring.style.width = `${BALL.r * 1.7 * gs}px`;
        }
    }
    function camera(name) { view.cam = CAMS[name] || CAMS.rest; layout(); }
    function toScreen(x, y) { const r = stage.getBoundingClientRect(); return { x: r.left + view.tx + x * view.s, y: r.top + view.ty + y * view.s }; }
    new ResizeObserver(layout).observe(stage);

    // ---------- foxfire: additive flame sprites on a half-resolution canvas over the ball ----------
    const fire = (() => {
        const cv = $('fire'), ctx = cv.getContext('2d'), parts = [];
        const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
        const g = sprite.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(225,245,255,1)'); grad.addColorStop(0.25, 'rgba(110,190,255,.75)'); grad.addColorStop(0.6, 'rgba(40,90,255,.25)'); grad.addColorStop(1, 'rgba(20,40,255,0)');
        g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
        // `want` is the level the screen asked for; `held` means the idle video is showing its own fire, so the
        // steady flames stop (bursts still fly, they read as sparks off the ball).
        let level = 0, want = 0, held = false, last = 0, raf = 0;
        function spawn(burst) {
            const a = rand(-0.3, Math.PI + 0.3), inside = Math.random() < 0.45;
            const rr = inside ? rand(0, 0.7) : rand(0.85, 1.1);
            parts.push({
                x: (BALL.x + Math.cos(a) * BALL.r * rr * (inside ? 1 : 1.02)) / 2, y: (BALL.y + Math.sin(a) * BALL.r * rr * 0.9 + (inside ? 20 : 30)) / 2,
                vx: rand(-0.25, 0.45) + (burst ? rand(-1.2, 1.2) : 0), vy: -rand(0.3, 1) * (inside ? 0.6 : 1.2) - (burst ? rand(0.5, 2) : 0),
                life: 0, max: rand(40, 95), size: rand(10, 26) * (inside ? 1.3 : 1) * (1 + level * 0.12), seed: rand(0, 9),
            });
        }
        function frame(t) {
            raf = requestAnimationFrame(frame);
            if (document.hidden || t - last < 30) return;
            last = t;
            ctx.clearRect(0, 0, cv.width, cv.height);
            if (!level && !parts.length) return;
            const want = [0, 1.2, 2.4, 5][level];
            for (let i = 0; i < Math.floor(want) + (Math.random() < want % 1 ? 1 : 0); i++) spawn(false);
            ctx.globalCompositeOperation = 'lighter';
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i];
                p.life++; p.x += p.vx + Math.sin(t * 0.004 + p.seed) * 0.35; p.y += p.vy; p.vy -= 0.008;
                const k = p.life / p.max;
                if (k >= 1) { parts.splice(i, 1); continue; }
                const sz = p.size * (1 - k * 0.6);
                ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, k * 1.15)) * 0.55;
                ctx.drawImage(sprite, p.x - sz / 2, p.y - sz / 2, sz, sz);
            }
            ctx.globalAlpha = 1;
        }
        raf = requestAnimationFrame(frame);
        return {
            set(n) { want = n; level = held ? 0 : n; scene.dataset.fire = n; },
            hold(h) { held = h; level = h ? 0 : want; },
            burst(n = 30) { for (let i = 0; i < n; i++) spawn(true); },
        };
    })();

    // A wisp of foxfire that flies between two screen points (the ball, a card, a button).
    function wisp(from, to, ms = 650) {
        const w = el('div', { class: 'wisp' });
        document.body.append(w);
        const dx = to.x - from.x, dy = to.y - from.y, bend = rand(-60, 60);
        w.style.left = `${from.x}px`; w.style.top = `${from.y}px`;
        if (app.dataset.screen !== 'gaze') snd.fx('wisp');
        return w.animate([
            { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
            { transform: `translate(calc(-50% + ${dx * 0.5 + bend}px), calc(-50% + ${dy * 0.5 - 50}px)) scale(1.2)`, opacity: 1, offset: 0.5 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.5)`, opacity: 0.2 },
        ], { duration: ms, easing: 'cubic-bezier(.4,.1,.4,1)' }).finished.then(() => w.remove(), () => w.remove());
    }
    const centre = node => { const r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const ballPoint = () => toScreen(BALL.x, BALL.y);

    // ---------- Ellie: the video loop, always ----------
    // Lucky, 2026-11-18: the old drawn sprites (mood faces, tail frames, blink patch) must never be seen. Before,
    // a line with a mood of its own (tapping the ball, the ear, a quiet stretch making her sleepy) faded the video
    // out and showed those sprites. Now her moods only show as the bubble, the little emote over her head and the
    // blush (#scene[data-mood] in parlor.css); the video keeps playing through all of it.
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The video (Lucky's Seedance loop, 2026-11-17): her tail wagging, hair moving and the fire in the ball. It
    // plays in every screen, the dark room included (the candles there dim the whole scene with a filter).
    // Under it sits its first frame as a still (#still), so a slow load, reduced motion or a video that can't
    // play still shows the same picture, never an empty room. Paused while the page is hidden, and it carries
    // on from where it was, so coming back is instant and the loop never visibly restarts.
    // Phones often hold 'canplay' back until playback is asked for, and one refused or interrupted play() used
    // to give up for good (Lucky, 2026-11-17), so it just asks to play and a light check retries if it stalled.
    const idleLoop = (() => {
        const v = $('loop');
        let failed = reducedMotion;
        const start = () => { if (!failed) v.play().catch(() => { /* the check retries */ }); };
        if (!failed) {
            // The video has its own fire in the ball, so the canvas's steady flames stay out of the way while it
            // plays (bursts still fly, they read as sparks off the glass). Held only once it really plays, so a
            // video that never starts doesn't leave the still's ball without its flames.
            v.addEventListener('playing', () => { fire.hold(true); scene.classList.add('loop-on'); });
            v.addEventListener('error', () => { failed = true; fire.hold(false); scene.classList.remove('loop-on'); });
            document.addEventListener('visibilitychange', () => { if (document.hidden) v.pause(); else start(); });
            setInterval(() => { if (!document.hidden && v.paused) start(); }, 3000);
        }
        return { start };
    })();

    // ---------- Ellie talks ----------
    let typing, bubbleTimer, emoteTimer, lastSpokenAt = -Infinity;
    const ASIDE_CHANCE = 0.3, ASIDE_GAP_MS = 12000;
    // Lucky, 2026-11-17: Ellie never says the same line twice in one session; silence beats a repeat. Kept in
    // sessionStorage so closing and reopening the app in the same tab still counts as the same session.
    // Lines passed with `required` are exempt: they explain why a tap did nothing (no chat open, spread full,
    // fortune still open), and without them the second such tap would look broken.
    const spokenLines = new Set();
    try {
        const stored = JSON.parse(sessionStorage.getItem('eff.spokenLines') || '[]');
        if (Array.isArray(stored)) for (const line of stored) if (typeof line === 'string') spokenLines.add(line);
    } catch { /* The current mount still remembers its spoken lines. */ }
    const EMOTE = { shy: '〃', think: '…', startle: '!', fluster: '〃〃', happy: '♪' };
    function fillNames(text) { const s = api.status(); return String(text).replaceAll('{char}', s.charName).replaceAll('{user}', s.userName); }
    function say(entry, { required = false } = {}) {
        if (!entry) return;
        const [mood, text] = entry;
        if (!required && spokenLines.has(text)) return;
        const now = Date.now();
        if (!required && (now - lastSpokenAt < ASIDE_GAP_MS || Math.random() >= ASIDE_CHANCE)) return;
        lastSpokenAt = now;
        spokenLines.add(text);
        try { sessionStorage.setItem('eff.spokenLines', JSON.stringify([...spokenLines])); } catch { /* storage blocked */ }
        scene.dataset.mood = mood;
        const e = $('emote');
        clearTimeout(emoteTimer);
        e.hidden = !EMOTE[mood];
        if (EMOTE[mood]) { e.textContent = EMOTE[mood]; e.style.animation = 'none'; void e.offsetWidth; e.style.animation = ''; emoteTimer = setTimeout(() => { e.hidden = true; }, 2200); }
        if (mood === 'startle' || mood === 'fluster') snd.fx('gasp');
        // A no-break space before the last word, so a line never ends with one word alone on its own row
        // (Lucky's screenshot); the CSS `text-wrap: balance` on #bubbleText evens out the rest.
        const bubble = $('bubble'), out = $('bubbleText'), full = fillNames(text).replace(/(\S) +(\S+)$/, '$1\u00a0$2');
        bubble.hidden = false; bubble.dataset.mood = mood;
        bubble.style.animation = 'none'; void bubble.offsetWidth; bubble.style.animation = '';
        clearInterval(typing);
        clearTimeout(bubbleTimer);
        let i = 0; out.textContent = '';
        typing = setInterval(() => {
            i += 1; out.textContent = full.slice(0, i);
            if (i % 4 === 0 && /\w/.test(full[i - 1] || '')) snd.fx('blip');
            if (i >= full.length) clearInterval(typing);
        }, 34);
        bubbleTimer = setTimeout(() => { bubble.hidden = true; delete scene.dataset.mood; }, Math.max(3500, full.length * 34 + 2400));
    }
    function sayFrom(list) {
        const unused = list.filter(([, text]) => !spokenLines.has(text));
        if (unused.length) say(pick(unused));
    }

    // ---------- screens ----------
    function show(screen) {
        app.dataset.screen = screen;
        // No fire bed any more, not even in the gaze (QA via Lucky, 2026-11-18: take the fire/rain sound out
        // entirely). This only makes sure an old loop is stopped; snd.ambience never starts one now.
        snd.ambience(false);
        const settings = $('btnSettings');
        settings.disabled = screen === 'gaze';
        settings.setAttribute('aria-expanded', String(screen === 'settings'));
        camera({ dark: 'dark', ask: 'ask', draw: 'draw', gaze: 'gaze', branch: 'branch' }[screen] || 'rest');
        fire.set(screen === 'dark' ? 0 : screen === 'gaze' ? 3 : screen === 'draw' ? 2 : 1);
        idleLoop.start();
        if (screen === 'unfold') renderUnfold();
        if (screen === 'branch') renderBranch();
        $('table').scrollTop = 0;
        // The scene list always opens at the top. This has to happen after the panel is shown: a scroll
        // position set while it is hidden is ignored, so the list used to reopen where it was left.
        if (screen === 'draw') { $('menu').scrollTop = 0; syncMenuMore(); }
        saveBench();
    }
    // "More below" on the scene list, until it is scrolled to the end.
    function syncMenuMore() {
        const m = $('menu');
        m.parentElement.classList.toggle('more', m.scrollHeight - m.clientHeight - m.scrollTop > 8);
    }
    const homeScreen = () => api.status().story ? 'unfold' : 'ask';
    const home = () => show(homeScreen());

    // The candles: three taps. Lighting a candle is how you invite someone to sit with you.
    function setupCandles() {
        const all = [...document.querySelectorAll('.candle')];
        all.forEach(c => c.addEventListener('click', async () => {
            if (c.classList.contains('lit')) return;
            touch(); c.classList.add('lit'); snd.fx('strike');
            const n = all.filter(x => x.classList.contains('lit')).length;
            app.dataset.lit = n;
            $('candleHint').textContent = ['Light the candles', 'Two more', 'One more', ''][n];
            if (n < 3) return;
            try { localStorage.setItem('eff.lit', '1'); } catch { /* then she just asks again next time */ }
            await wait(500);
            enter();
        }));
    }
    async function enter() {
        app.dataset.lit = 3;
        fire.set(1); fire.burst(40); snd.fx('whoosh'); snd.fx('bowl');
        camera('rest');
        const returning = sessionStorage.getItem('eff.seen') === '1';
        say(LINES.greet[returning ? 1 : 0], { required: !returning });
        sessionStorage.setItem('eff.seen', '1');
        await wait(2400);
        if (app.dataset.screen === 'settings' && state.beforeSettings === 'dark') state.beforeSettings = homeScreen();
        else home();
    }

    // ---------- ask ----------
    function setupAsk() {
        for (const b of $('spreads').querySelectorAll('button')) {
            b.addEventListener('click', () => {
                touch(); snd.fx('tap');
                setSpreadN(Number(b.dataset.n));
                saveBench();
            });
        }
        // Only the sandbox lets you type the names; in WeyPhone they are the open chat's.
        for (const id of ['inChar', 'inUser']) $(id).addEventListener('change', () => { if (LIVE) return; api.rename($('inChar').value, $('inUser').value); if (id === 'inChar' && /^ellie$/i.test($('inChar').value.trim())) say(LINES.ownReading[0]); });
        $('btnShuffle').addEventListener('click', shuffle);
        $('menu').addEventListener('scroll', syncMenuMore, { passive: true });
        $('btnKeep').addEventListener('click', keepQuestion);
        $('btnKeptOpen').addEventListener('click', openKept);
        $('keptClose').addEventListener('click', () => { snd.fx('tap'); closeKept(); });
        $('keptModal').addEventListener('click', e => { if (e.target === $('keptModal')) closeKept(); });
        $('question').addEventListener('input', syncKept);
        renderKept();
    }

    // The spread-size buttons (3, 5 or 7 scenes): sets the number and lights the matching button.
    function setSpreadN(n) {
        state.n = n;
        for (const o of $('spreads').querySelectorAll('button')) { const on = Number(o.dataset.n) === n; o.classList.toggle('on', on); o.setAttribute('aria-checked', String(on)); }
    }

    // ---------- the workbench: progress survives closing the app (see bench.js) ----------
    // Everything the player set up is written to this device's storage as they go: the spread, the slip, the omens
    // and the screen. An unsealed fortune is kept per chat. WeyPhone deletes this page when the phone closes, so
    // without this a failed request plus "close the phone to change the model" lost the whole scene (Lucky,
    // 2026-11-18).
    const bench = window.EFFBench || null;
    let benchTimer = null, restoring = false;
    // The chat a reading belongs to. The sandbox has no chats, so it uses one fixed name.
    const benchChat = () => (LIVE ? api.status().chatId : 'sandbox') || '';
    function spreadSnapshot() {
        const scr = app.dataset.screen;
        return {
            n: state.n, slots: state.slots.map(s => (s ? { id: s.id, rev: !!s.rev } : null)), question: $('question').value,
            spice: state.spice, dark: state.dark, pace: state.pace, conn: state.conn, cross: state.cross,
            // Closed mid-gaze comes back to the cards: the request itself carries on in the parent page.
            screen: scr === 'draw' || scr === 'gaze' ? 'draw' : 'ask',
        };
    }
    function saveBench() {
        if (!bench || restoring) return;
        clearTimeout(benchTimer);
        benchTimer = setTimeout(flushBench, 250);
    }
    function flushBench() {
        clearTimeout(benchTimer); benchTimer = null;
        if (!bench || restoring) return;
        bench.saveSpread(spreadSnapshot());
    }
    // The open fortune, with whatever was typed on the paper, saved under the chat it was written for (not the
    // chat that happens to be open now: the player can switch chats with the paper still out).
    const isFreshDraft = () => !$('reading').hidden && state.mode === 'draft' && state.fromBranch == null;
    function saveDraftReading() { if (bench && isFreshDraft()) bench.saveReading(state.readingChat, readPaper()); }
    function dropDraftReading() { if (bench && state.mode === 'draft' && state.fromBranch == null) bench.dropReading(state.readingChat ?? benchChat()); }

    // A saved spread back on the table. Every value is checked, since storage can hold anything (an older version,
    // a hand edit). Returns true when the player was on the cards, so init() can take them back there.
    function restoreSpread() {
        const sp = bench?.getSpread();
        if (!sp) return false;
        const sizes = [...$('spreads').querySelectorAll('button')].map(b => Number(b.dataset.n));
        const int = (v, lo, hi, dflt) => (Number.isInteger(v) && v >= lo && v <= hi ? v : dflt);
        restoring = true;
        try {
            const n = sizes.includes(sp.n) ? sp.n : state.n;
            setSpreadN(n);
            const used = new Set();
            state.slots = Array.from({ length: n }, (_, i) => {
                const s = Array.isArray(sp.slots) ? sp.slots[i] : null;
                if (!s || !Number.isInteger(s.id) || !ARCANA[s.id] || used.has(s.id)) return null;
                used.add(s.id);
                return { id: s.id, rev: !!s.rev };
            });
            if (typeof sp.question === 'string') $('question').value = sp.question.slice(0, Number($('question').maxLength) > 0 ? $('question').maxLength : 1560);
            state.spice = int(sp.spice, 0, 3, state.spice);
            state.dark = int(sp.dark, 0, 3, state.dark);
            state.pace = int(sp.pace, 0, 2, state.pace);
            state.conn = int(sp.conn, 0, CONN.length - 1, state.conn);
            state.cross = !!sp.cross;
            syncOmens(); syncKept();
        } finally { restoring = false; }
        return sp.screen === 'draw' && state.slots.some(Boolean);
    }

    // An unsealed fortune for this chat, opened again. `onlyFresh` is for while the app is open: then only a
    // fortune the parent saved with nobody here to take it (dressed: false) opens by itself. One the player already
    // looked at and put aside waits for the next time the app opens.
    function restoreReading({ onlyFresh = false } = {}) {
        if (!bench || !$('reading').hidden || !['ask', 'draw', 'unfold'].includes(app.dataset.screen)) return false;
        const chat = benchChat(), r = bench.getReading(chat);
        if (!r?.story?.chapters?.length || (onlyFresh && r.dressed)) return false;
        let story = structuredClone(r.story);
        if (!r.dressed) {
            const cards = (r.opts?.cards || []).filter(c => c && Number.isInteger(c.id) && ARCANA[c.id]);
            if (!cards.length) return false;
            try { story = dress(story, { cards, darkness: r.opts.darkness ?? state.dark, spice: r.opts.spice ?? state.spice }); } catch { return false; }
            // The cards the fortune was read from go back on the table too, so "Read again" uses the same spread.
            const sizes = [...$('spreads').querySelectorAll('button')].map(b => Number(b.dataset.n));
            if (sizes.includes(cards.length)) { setSpreadN(cards.length); state.slots = cards.map(c => ({ id: c.id, rev: !!c.rev })); }
        }
        buildMenu(); buildSlots();
        show('draw');
        openReading(story, 'draft');
        if (!r.dressed) say(['happy', 'Oh! It came through while you were away.'], { required: true });
        return true;
    }

    // ---------- kept slips: requests saved to use again ----------
    // Stored by the api (WeyTav: extension settings, so they follow the player to every chat and device;
    // sandbox: localStorage). Newest first. They live in their own box (#keptModal), opened from the
    // "Kept slips" button, so the writing screen stays short however many are kept (Lucky, 2026-11-17).
    // In the box: tap a slip to put it on the writing slip, the pen to give it a name, × to throw it away.
    const keptText = () => $('question').value.trim();
    const PEN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4L16 5l3 3L8 19z M14 7l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
    function renderKept(renaming = -1) {
        const list = api.status().prompts || [];
        $('keptList').replaceChildren(...list.map((p, i) => {
            if (i === renaming) return keptNameRow(p, i);
            const use = el('button', { class: 'kept-use', title: p.text },
                p.name ? el('b', { text: p.name }) : null, el('span', { text: p.text }));
            use.addEventListener('click', () => {
                touch(); snd.fx('tap');
                $('question').value = p.text; syncKept(); closeKept();
                say(['soft', 'This one again. Okay.']);
            });
            const rename = el('button', { class: 'kept-rename', 'aria-label': `Rename: ${(p.name || p.text).slice(0, 60)}`, html: PEN_ICON });
            rename.addEventListener('click', () => { touch(); snd.fx('tap'); renderKept(i); });
            const forget = el('button', { class: 'kept-forget', 'aria-label': `Throw away: ${(p.name || p.text).slice(0, 60)}`, text: '×' });
            forget.addEventListener('click', () => {
                touch(); snd.fx('tap');
                api.forgetPrompt(i); renderKept();
                say(['shy', 'Thrown away. Um. Paper likes going back.']);
            });
            return el('div', { class: 'kept-slip', 'data-i': i }, use, rename, forget);
        }));
        $('keptEmpty').hidden = list.length > 0;
        syncKept();
        if (renaming >= 0) { const box = $('keptList').querySelector('.kept-name'); box?.focus(); box?.select(); }
    }
    // The rename row: a text box in place of the slip. Enter or leaving the box saves; Escape cancels.
    // An empty name removes it, so the slip shows its text again.
    function keptNameRow(p, i) {
        const box = el('input', { class: 'kept-name', value: p.name || '', maxlength: '40', placeholder: 'Name this slip', 'aria-label': 'Name for this kept slip', spellcheck: 'false' });
        let done = false;
        const finish = save => {
            if (done) return; done = true;
            if (save) { api.renamePrompt?.(i, box.value); snd.fx('place'); }
            renderKept();
        };
        box.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
        });
        box.addEventListener('blur', () => finish(true));
        return el('div', { class: 'kept-slip editing', 'data-i': i }, box);
    }
    function openKept() { touch(); snd.fx('unroll'); renderKept(); $('keptModal').hidden = false; $('keptList').scrollTop = 0; }
    function closeKept() { $('keptModal').hidden = true; }
    // Keep is only useful for new text: grey it out when the slip is empty or already kept, and ring the kept one.
    function syncKept() {
        const t = keptText(), list = api.status().prompts || [];
        const at = list.findIndex(p => p.text === t);
        $('btnKeep').disabled = !t || at >= 0;
        $('btnKeep').textContent = t && at >= 0 ? 'Kept' : 'Keep this one';
        $('btnKeptOpen').textContent = list.length ? `Kept slips (${list.length})` : 'Kept slips';
        $('keptList').querySelectorAll('.kept-slip').forEach((s, i) => s.classList.toggle('on', i === at));
        saveBench();   // runs on every keystroke on the slip and when a kept slip is put on it
    }
    function keepQuestion() {
        const t = keptText();
        if (!t) return;
        touch(); snd.fx('place');
        api.keepPrompt(t); renderKept();
        $('keptList').scrollTop = 0;
        say(['happy', 'Kept. It will be here next time.']);
    }

    function shuffle() {
        touch();
        if (!api.status().hasChat) { snd.fx('nope'); say(LINES.noChat[0], { required: true }); return; }
        if (!LIVE) api.rename($('inChar').value, $('inUser').value);
        else if (/^ellie$/i.test(api.status().charName.trim()) && !state.toldOwn) { state.toldOwn = true; say(LINES.ownReading[0]); }
        // Going back to change the request keeps the cards already picked (Lucky, 2026-11-17). A different
        // number of scenes keeps the first ones that still fit and leaves the rest of the row empty.
        state.slots = Array.from({ length: state.n }, (_, i) => state.slots[i] || null);
        buildMenu(); buildSlots();
        show('draw');   // silent: Lucky cut the shuffle sound on "Pick the scenes" (2026-11-17)
        sayFrom($('question').value.trim() ? LINES.shuffle : LINES.empty);
        setTimeout(() => { if (app.dataset.screen === 'draw' && !state.slots.some(Boolean)) sayFrom(LINES.pickHint); }, 4200);
        syncGaze();
    }

    // ---------- the spread and the fan ----------
    function cardNode(slot, extra = '') {
        const c = ARCANA[slot.id];
        return el('div', { class: `card ${slot.rev ? 'rev' : ''} ${extra}` }, el('div', { class: 'inner' }, el('div', { class: 'back' }), el('div', { class: 'face', html: cardFace(c) })));
    }
    function buildSlots() {
        const box = $('slots');
        box.dataset.n = state.n;
        box.replaceChildren(...state.slots.map((s, i) => {
            const b = el('button', { class: `slot${s ? ' filled' : ''}`, 'data-i': i, 'aria-label': `${POSITIONS[state.n][i]}${s ? `: ${ARCANA[s.id].name}${s.rev ? ', reversed' : ''}` : ', empty'}` },
                el('span', { class: 'slot-num', text: ROMAN[i] }), s ? cardNode(s, 'flipped') : null, el('span', { class: 'slot-pos', text: POSITIONS[state.n][i] }));
            b.addEventListener('click', () => { if (state.slots[i]) openHeld(i); else snd.fx('tick'); });
            return b;
        }));
        box.classList.toggle('crossed', state.cross);
        box.style.setProperty('--at', Math.floor(state.n / 2));
        syncMenu(); syncGaze();
        saveBench();
    }
    // The menu: all 22 cards, both ways up, as 44 plain "this happens" tiles. One tap adds a scene.
    // Lucky's note: the Story Machine was easy because you just picked from a wide menu, so the player
    // never has to know what a tarot card means. The card name is small print under the plain words.
    const beatText = key => key.charAt(0).toUpperCase() + key.slice(1);
    function buildMenu() {
        $('menu').replaceChildren(...ARCANA.flatMap(c => [false, true].map(rev => {
            const b = el('button', { class: `beat${rev ? ' rev' : ''}`, 'data-id': c.id, 'data-rev': rev ? 1 : 0 },
                el('b', { text: beatText((rev ? c.rev : c.up).key) }), el('small', { text: `${c.name}${rev ? ', reversed' : ''}` }), el('i'));
            b.addEventListener('click', () => toggleBeat(c.id, rev, b));
            return b;
        })));
        $('menu').scrollTop = 0;
    }
    function syncMenu() {
        for (const b of $('menu').children) {
            const id = Number(b.dataset.id), rev = b.dataset.rev === '1', at = state.slots.findIndex(s => s && s.id === id);
            const on = at !== -1 && state.slots[at].rev === rev;
            b.classList.toggle('on', on);
            b.classList.toggle('other', at !== -1 && !on);   // the same card's other side is already in the story
            b.setAttribute('aria-pressed', String(on));
            b.querySelector('i').textContent = on ? ROMAN[at] : '';
        }
        const got = state.slots.filter(Boolean).length;
        $('pickHead').textContent = got < state.n ? `Pick what happens · ${got} of ${state.n}` : `All ${state.n} scenes picked`;
    }
    function toggleBeat(id, rev, btn) {
        if (state.busy) return;
        const at = state.slots.findIndex(s => s && s.id === id);
        if (at === -1) { place(id, rev, btn); return; }
        touch();
        if (state.slots[at].rev === rev) { state.slots[at] = null; snd.fx('slide'); say(LINES.takeOut[0]); }
        else { state.slots[at].rev = rev; snd.fx('flip'); }   // tapped the other side of a card already down: turn it over
        buildSlots();
    }
    const nextEmpty = () => state.slots.findIndex(s => !s);
    function syncGaze() { $('btnGaze').disabled = nextEmpty() !== -1; $('btnFate').hidden = nextEmpty() === -1; $('btnClear').hidden = !state.slots.some(Boolean); }

    async function place(id, rev, fromEl, quiet = false) {
        const i = nextEmpty();
        if (i === -1) { snd.fx('nope'); say(LINES.full[0], { required: true }); return; }
        touch();
        const slot = { id, rev };
        state.slots[i] = slot;
        syncMenu();
        saveBench();
        // A card-sized back flies from the tapped tile to its place in the row.
        const src = fromEl.getBoundingClientRect(), from = { left: src.left + src.width / 2 - 20, top: src.top + src.height / 2 - 32, width: 40, height: 64 };
        const target = $('slots').children[i], to = target.getBoundingClientRect();
        snd.fx('slide');
        const fly = el('div', { class: 'fly' });
        Object.assign(fly.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
        document.body.append(fly);
        await fly.animate([
            { transform: 'translate(0,0) rotate(0deg)' },
            { transform: `translate(${(to.left - from.left) * 0.5}px, ${(to.top - from.top) * 0.5 - 40}px) rotate(${rand(-20, 20)}deg) scale(1.15)`, offset: 0.5 },
            { transform: `translate(${to.left - from.left + (to.width - from.width) / 2}px, ${to.top - from.top + 6}px) rotate(0deg) scale(${to.width / from.width * 0.86})` },
        ], { duration: 420, easing: 'cubic-bezier(.3,.1,.3,1)' }).finished.catch(() => {});
        fly.remove();
        if (state.slots[i] !== slot) return;   // cleared or taken out while it was in the air
        // Lay it face down, then turn it over.
        const node = cardNode(slot);
        target.classList.add('filled'); target.querySelector('.card')?.remove(); target.insertBefore(node, target.lastChild);
        snd.fx('lay');
        await wait(90);
        node.classList.add('flipped'); snd.fx('flip');
        wisp(ballPoint(), centre(target), 520);
        syncGaze();
        if (quiet) return;
        const c = ARCANA[id];
        if (id === 16) { $('flash').classList.remove('go'); void $('flash').offsetWidth; $('flash').classList.add('go'); say(['startle', c.ellie]); }
        else say([id === 6 || id === 15 ? 'fluster' : id === 17 || id === 19 || id === 8 ? 'happy' : 'soft', c.ellie]);
    }
    // "Surprise me": the deck fills whatever is still empty, and this is the only place a card can land reversed by chance.
    async function fate() {
        if (state.busy) return;
        state.busy = true;
        let first = true;
        while (nextEmpty() !== -1 && app.dataset.screen === 'draw') {
            const used = new Set(state.slots.filter(Boolean).map(s => s.id));
            const id = pick(ARCANA.filter(c => !used.has(c.id))).id;
            await place(id, Math.random() < 0.3, $('btnFate'), !first && nextEmpty() !== state.slots.lastIndexOf(null));
            first = false;
            await wait(160);
        }
        state.busy = false;
    }
    function clearSlots() { if (state.busy) return; touch(); state.slots = Array(state.n).fill(null); snd.fx('slide'); buildSlots(); }

    // One card, held up close: read it, turn it, or choose a different one.
    function openHeld(i) {
        touch(); state.held = i; snd.fx('flip');
        renderHeld();
        $('cardModal').hidden = false;
    }
    function renderHeld() {
        const s = state.slots[state.held], c = ARCANA[s.id], m = s.rev ? c.rev : c.up;
        $('heldCard').replaceChildren(cardNode(s, 'flipped big'));
        $('heldPos').textContent = `${ROMAN[state.held]} · ${POSITIONS[state.n][state.held]}`;
        $('heldName').textContent = `${c.name}${s.rev ? ', reversed' : ''}`;
        $('heldMeaning').textContent = `In a story: ${m.key}.`;
    }
    function setupHeld() {
        $('heldTurn').addEventListener('click', () => { const s = state.slots[state.held]; s.rev = !s.rev; snd.fx('flip'); renderHeld(); say(LINES.turn[0]); });
        // Swapping is done from the menu now, so this only takes the card back out.
        $('heldSwap').addEventListener('click', () => { state.slots[state.held] = null; say(LINES.takeOut[0]); closeHeld(); });
        $('heldOk').addEventListener('click', closeHeld);
        $('cardModal').addEventListener('click', e => { if (e.target === $('cardModal')) closeHeld(); });
    }
    function closeHeld() { $('cardModal').hidden = true; snd.fx('place'); buildSlots(); }

    // ---------- omens: the dials, as things on the table ----------
    // Kept outside setupOmens so restoring a saved spread (restoreSpread) can redraw the dials too.
    let syncOmens = () => {};
    function setupOmens() {
        const sync = syncOmens = () => {
            $('omMoon').style.setProperty('--p', state.dark); $('valMoon').textContent = DARK[state.dark];
            $('omEmber').style.setProperty('--p', state.spice); $('valEmber').textContent = SPICE[state.spice];
            $('omIncense').style.setProperty('--p', state.pace); $('valIncense').textContent = PACE_NAMES[state.pace];
            $('omConn').dataset.c = CONN_IDS[state.conn] || 'unset'; $('valConn').textContent = CONN[state.conn];
            $('omCross').setAttribute('aria-pressed', String(state.cross)); $('valCross').textContent = state.cross ? 'On' : 'Off';
            scene.dataset.spice = state.spice; app.dataset.dark = state.dark;
            $('slots').classList.toggle('crossed', state.cross);
            saveBench();
        };
        $('omMoon').addEventListener('click', () => { touch(); state.dark = (state.dark + 1) % 4; sync(); snd.fx('tap'); say(LINES.moon[state.dark]); });
        $('omEmber').addEventListener('click', () => { touch(); state.spice = (state.spice + 1) % 4; sync(); snd.fx('tap'); if (state.spice > 1) fire.burst(12); say(LINES.ember[state.spice]); });
        $('omIncense').addEventListener('click', () => { touch(); state.pace = (state.pace + 1) % 3; sync(); snd.fx('tap'); say(LINES.incense[state.pace]); });
        // Unset -> Platonic -> Casual -> Complicated -> Dating -> Partnered -> Breaking -> Broken -> Unset.
        $('omConn').addEventListener('click', () => { touch(); state.conn = (state.conn + 1) % CONN.length; sync(); snd.fx(state.conn ? 'knot' : 'tap'); say(LINES.conn[state.conn]); });
        $('omCross').addEventListener('click', () => { touch(); state.cross = !state.cross; sync(); snd.fx('place'); say(LINES.cross[state.cross ? 1 : 0]); });
        sync();
        setupSwitches();
    }

    // The two writing switches. Kept in this device's storage like the sound switch: they are the player's
    // standing preference, not part of one reading. The sheet is on unless turned off; acting for the
    // player is off unless turned on (Lucky, 2026-11-17).
    function syncWritingSwitches() {
        $('swSheet').setAttribute('aria-pressed', String(state.sheet));
        $('swActs').setAttribute('aria-pressed', String(state.acts));
    }
    function setupSwitches() {
        const read = (k, dflt) => { try { const v = localStorage.getItem(k); return v === null ? dflt : v === '1'; } catch { return dflt; } };
        state.sheet = read('eff.sheet', true);
        state.acts = read('eff.acts', false);
        const flip = (key, store) => () => {
            touch(); state[key] = !state[key];
            try { localStorage.setItem(store, state[key] ? '1' : '0'); } catch { /* then it lasts for this visit */ }
            syncWritingSwitches(); snd.fx('tap');
        };
        $('swSheet').addEventListener('click', flip('sheet', 'eff.sheet'));
        $('swActs').addEventListener('click', flip('acts', 'eff.acts'));
        syncWritingSwitches();
    }

    // ---------- settings: the player's blacklist ----------
    // The chip list and the limits come from the api, so the app never disagrees with the prompt about what an
    // id means. Every tap saves at once (no Save button to forget); the parent cleans what it stores.
    function openSettings() {
        const scr = app.dataset.screen;
        // Settings open from every screen but the gaze, the dark room included: the cog used to be ignored until
        // the candles were lit, which read as "the cog doesn't work" (Lucky, 2026-11-17).
        if (scr === 'gaze') return;
        // An open fortune is not closed for this: a draft would be lost. Settings wait until it is put down.
        if (!$('reading').hidden) { say(['shy', 'Um... could you put the fortune down first?'], { required: true }); return; }
        if (scr === 'settings') { closeSettings(); return; }
        state.beforeSettings = scr;
        snd.fx('tap'); renderSettings(); show('settings');
    }
    function closeSettings() { snd.fx('tap'); const back = state.beforeSettings; state.beforeSettings = null; back ? show(back) : home(); }
    function renderSettings() {
        const prefs = api.getPrefs(), on = new Set(prefs.blocks);
        $('blockChips').replaceChildren(...api.blockOptions().map(o => {
            const b = el('button', { class: 'chip', 'aria-pressed': String(on.has(o.id)), text: o.label });
            b.addEventListener('click', () => {
                touch(); snd.fx('tap');
                const now = new Set(api.getPrefs().blocks);
                if (now.has(o.id)) now.delete(o.id); else now.add(o.id);
                api.setPrefs({ blocks: [...now] }); renderSettings();
            });
            return b;
        }));
        $('blockOwn').replaceChildren(...prefs.customBlocks.map((t, i) => {
            const b = el('button', { class: 'chip', 'aria-label': `Stop keeping out: ${t}` }, el('span', { text: t }), el('b', { text: '×' }));
            b.addEventListener('click', () => {
                touch(); snd.fx('tap');
                const list = api.getPrefs().customBlocks; list.splice(i, 1);
                api.setPrefs({ customBlocks: list }); renderSettings();
            });
            return b;
        }));
        const full = prefs.customBlocks.length >= api.blockLimits().max;
        $('blockInput').disabled = full; $('blockAdd').disabled = full;
        $('blockInput').placeholder = full ? 'That is as many as fit' : 'Add your own, e.g. spiders';
    }
    function addBlock() {
        const t = $('blockInput').value.replace(/\s+/g, ' ').trim();
        if (!t) return;
        touch(); snd.fx('place');
        const list = api.getPrefs().customBlocks;
        if (!list.some(x => x.toLowerCase() === t.toLowerCase())) api.setPrefs({ customBlocks: [...list, t] });
        $('blockInput').value = '';
        renderSettings();
        say(['soft', 'Okay. I will keep that out.']);
    }
    async function resetSettings() {
        const reset = await confirmModal('Restore sound and writing defaults, clear your story filters and blow out the candles so you can light them again?', 'Reset settings', 'Cancel');
        if (!reset) return;
        blowOutCandles();
        api.setPrefs({ blocks: [], customBlocks: [] });
        state.sheet = true;
        state.acts = false;
        try {
            localStorage.removeItem('eff.sheet');
            localStorage.removeItem('eff.acts');
        } catch { /* The defaults already apply to this visit. */ }
        syncWritingSwitches();
        setSound(true);
        $('blockInput').value = '';
        renderSettings();
    }
    // Reset also replays the candle opening (Lucky, 2026-11-17). The candles go out and the "already lit"
    // memory is forgotten, so leaving Settings lands in the dark room with Ellie's first greeting still to come.
    // Spread, request and fortunes are untouched.
    function blowOutCandles() {
        try { localStorage.removeItem('eff.lit'); } catch { /* storage blocked: the room is dark for this visit anyway */ }
        try { sessionStorage.removeItem('eff.seen'); } catch { /* same */ }
        document.querySelectorAll('.candle').forEach(c => c.classList.remove('lit'));
        app.dataset.lit = 0;
        $('candleHint').textContent = 'Light the candles';
        snd.ambience(false);
        state.beforeSettings = 'dark';
    }
    function setupSettings() {
        $('btnSettings').addEventListener('click', openSettings);
        $('settingsBack').addEventListener('click', closeSettings);
        $('settingsReset').addEventListener('click', resetSettings);
        $('blockAdd').addEventListener('click', addBlock);
        $('blockInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addBlock(); } });
    }

    // ---------- the model picker (top bar, Settings, and the "fire went out" box) ----------
    // Lucky, 2026-11-18: a request failed on his phone and the only way to try another model was to close WeyPhone
    // and change the chat's own model. Now Foxfire has its own choice, like Copycat: a model ('' = whatever the chat
    // uses) and a backup tried once if it fails. The list is WeyPhone's (the house models plus whatever this
    // connection offers). Saved at once by the parent; it counts from the next reading, never the one in progress.
    const hasModels = () => typeof api.getModels === 'function';
    function modelSummary(m) {
        const main = m.model || (m.live ? `the chat's model (${m.live})` : "the chat's model");
        return `Fortunes are written by ${main}.${m.fallback ? ` If it fails, ${m.fallback} tries once.` : ' No backup.'}`;
    }
    function renderModels() {
        if (!hasModels()) return;
        const m = api.getModels();
        const fill = (sel, current, first) => {
            const ids = [...new Set([...(m.options || []), ...(current ? [current] : [])])];
            sel.replaceChildren(el('option', { value: '', text: first }), ...ids.map(id => el('option', { value: id, text: id })));
            sel.value = current || '';
        };
        fill($('modelMain'), m.model, m.live ? `Use the chat's model (${m.live})` : "Use the chat's model");
        fill($('modelBackup'), m.fallback, 'No backup');
        $('modelNote').textContent = `${modelSummary(m)} A change counts from the next reading.`;
        $('setModelNow').textContent = modelSummary(m);
    }
    function openModels() {
        if (!hasModels()) return;
        touch(); snd.fx('tap');
        renderModels();
        $('modelModal').hidden = false;
    }
    function closeModels() { $('modelModal').hidden = true; renderModels(); }
    function setupModels() {
        if (!hasModels()) return;
        $('btnModel').hidden = false;
        $('setModelGroup').hidden = false;
        $('btnModel').addEventListener('click', openModels);
        $('setModelOpen').addEventListener('click', openModels);
        $('modelClose').addEventListener('click', () => { snd.fx('tap'); closeModels(); });
        $('modelModal').addEventListener('click', e => { if (e.target === $('modelModal')) closeModels(); });
        $('modelMain').addEventListener('change', () => { api.setModels({ model: $('modelMain').value }); snd.fx('place'); renderModels(); });
        $('modelBackup').addEventListener('change', () => { api.setModels({ fallback: $('modelBackup').value }); snd.fx('place'); renderModels(); });
        renderModels();
    }

    // ---------- the gaze ----------
    let stopGaze;
    async function gaze() {
        // A second tap while the camera is still zooming in would start a second request.
        if (nextEmpty() !== -1 || app.classList.contains('gaze-in')) return;
        touch();
        const token = ++state.gazeToken, alive = () => token === state.gazeToken;
        closeReading(true);
        const slotEls = [...$('slots').children].map(centre);
        // The way in, in order (Lucky, 2026-11-18): the camera zooms into the ball first while the cards stay put;
        // only once it is close does the table slide away and the room grow; the ring and the words come last.
        // Before, all three started at once, so the red panel slid off over a black gap, the ring formed over
        // nothing, and the zoom caught up afterwards. The request itself starts right away (below): only the
        // pictures wait, and a fast answer waits for them.
        const ring = $('gazeRing'), fillRing = $('gazeFill');
        ring.hidden = true; fillRing.style.strokeDashoffset = 339;
        app.classList.add('gaze-in');
        camera('gaze');
        snd.fx('whoosh');
        const intro = (async () => {
            await wait(1150);
            // `ended` (declared below, set by stop()): a request that already failed must not pull the room
            // into the gaze after the error was shown.
            if (!alive() || ended) return;
            // While the stage grows, the scene follows it frame by frame instead of easing behind it (that lag is
            // what showed black under the room).
            scene.classList.add('tracking');
            show('gaze');
            sayFrom(LINES.gaze);
            snd.startReadingSounds();
            await wait(950);
            scene.classList.remove('tracking');
            app.classList.remove('gaze-in');
            if (!alive() || ended) return;
            ring.hidden = false;
        })();
        // The ring follows the clock, not a fixed step: p = 0.97 * (1 - e^(-t/tau)). The old step (5% of the
        // gap every 250 ms) was 90% full in about 20 s and then crawled through the rest of a 30-50 s request
        // (Lucky, 2026-11-17). tau is set so an ordinary request lands near 85% when it returns: about 45 s with
        // the plan sheet on, 30 s with it off, a quarter longer for two endings (more chapters to write). It
        // never reaches 100% on its own; the answer arriving fills it.
        const tau = (state.sheet !== false ? 21 : 14) * (state.cross ? 1.25 : 1);
        const started = performance.now() + 2100;   // the ring's clock starts when the ring appears
        const timer = setInterval(() => {
            const prog = 0.97 * (1 - Math.exp(-Math.max(0, performance.now() - started) / 1000 / tau));
            fillRing.style.strokeDashoffset = 339 * (1 - prog);
        }, 250);
        const aside = setTimeout(() => { if (alive()) sayFrom(LINES.gazing); }, 16000);
        // `ended` stops the card words floating up in the glass. Before it, a failed request sent the player
        // back to the cards while the words kept appearing in the ball (the loop only watched for a cancel).
        let ended = false;
        const stop = () => {
            ended = true;
            clearInterval(timer);
            clearTimeout(aside);
            if (stopGaze !== stop) return;
            stopGaze = null;
            ring.hidden = true;
            $('visions').replaceChildren();
            app.classList.remove('gaze-in'); scene.classList.remove('tracking');
        };
        stopGaze = stop;
        // Each card goes into the fire, and its meaning surfaces in the glass. Paced to the whole wait, not the
        // first few seconds (Lucky, 2026-11-17: every word was gone 6 s into a 35 s request): the cards share
        // the time the ring expects (2 x tau, about 85% full), each word drifts up slowly and overlaps the next,
        // and if the answer is late the cards go round again so the ball is never empty.
        (async () => {
            await intro;
            await wait(300);
            const n = state.slots.length, span = Math.max(4500, (tau * 2000 - 900) / n), life = span * 1.5;
            for (let i = 0; alive() && !ended; i++) {
                const k = i % n, s = state.slots[k], c = ARCANA[s.id];
                // The wisp flies from each card only on the first round; later rounds just surface in the glass.
                if (i < n) wisp(slotEls[k].y > 0 ? { x: slotEls[k].x, y: Math.min(slotEls[k].y, innerHeight - 40) } : ballPoint(), ballPoint(), 900);
                await wait(i < n ? 800 : 0);
                if (!alive() || ended) return;
                if (i < n) fire.burst(10);
                const v = el('span', { class: 'vision slow', text: (s.rev ? c.rev : c.up).key, style: `left:${BALL.x + rand(-28, 28)}px;top:${BALL.y + rand(-10, 45)}px;animation-duration:${Math.round(life)}ms` });
                $('visions').append(v); setTimeout(() => v.remove(), life + 100);
                await wait(span - (i < n ? 800 : 0));
            }
        })();
        try {
            // The parent side knows nothing about the deck, so every card travels with its plain meaning
            // (and the meaning of its other side, which is what road B of a crossing is read from).
            const dealt = state.slots.map((s, i) => {
                const c = ARCANA[s.id], m = s.rev ? c.rev : c.up, o = s.rev ? c.up : c.rev;
                return { ...s, name: c.name, pos: POSITIONS[state.slots.length][i], key: m.key, hint: m.scene, otherKey: o.key };
            });
            const opts = { question: $('question').value.trim(), cards: dealt, spice: state.spice, darkness: state.dark, pace: PACE[state.pace], connection: CONN_IDS[state.conn], fork: state.cross, sheet: state.sheet !== false, actsForUser: !!state.acts };
            const story = dress(await api.generate(opts), opts);
            await intro;
            if (!alive()) return;
            fillRing.style.strokeDashoffset = 0;
            await wait(350);
            stop();
            fire.burst(60); snd.fx('chime');
            $('flash').classList.remove('go', 'blue'); void $('flash').offsetWidth; $('flash').classList.add('go', 'blue');
            sayFrom(LINES.done);
            await wait(700);
            if (!alive()) return;
            show('draw'); camera('rest');
            openReading(story, 'draft');
        } catch (err) {
            stop();
            if (!alive()) return;
            snd.stopReadingSounds();
            show('draw'); snd.fx('nope');
            // A content filter said no (Gemini's "could not be submitted", a provider's safety block): Ellie says
            // so herself instead of an error box, since there's nothing to fix but the request (Lucky, 2026-11-18).
            // Her first three in a session are a shrug; after that she's embarrassed about it. Counted per tab
            // session, like her spoken lines.
            if (err?.filtered) {
                let n = 0;
                try { n = Number(sessionStorage.getItem('eff.filterCount')) || 0; sessionStorage.setItem('eff.filterCount', String(n + 1)); } catch { /* storage blocked: always the first line */ }
                say(n < 3 ? LINES.filtered[0] : LINES.filtered[1], { required: true });
                return;
            }
            say(['shy', 'Oh... it went quiet.']);
            // The cards, the slip and the omens are all still on the table (and saved), so trying another model is
            // one tap away instead of a trip out of the phone.
            const msg = `The fire went out: ${err?.message || err}\n\nYour cards and your slip are still on the table.`;
            const choice = await modal(msg, hasModels() ? [['Okay', false], ['Try another model', 'model', true]] : [['Okay', true, true]]);
            if (choice === 'model') openModels();
        }
    }
    function breakGaze() {
        state.gazeToken++;
        stopGaze?.();
        app.classList.remove('gaze-in'); scene.classList.remove('tracking');
        snd.stopReadingSounds();
        api.cancel();
        show('draw');
    }

    // ---------- story helpers (same rules as storyCore.js) ----------
    const forkAt = story => (story?.fork ? story.chapters.length : 0);
    const totalFor = (story, route) => (story.fork ? story.chapters.length + story.fork.routes[route || 'A'].chapters.length : story.chapters.length);
    const chapterAt = (story, n, route) => { const f = forkAt(story); return f && n > f ? story.fork.routes[route || 'A'].chapters[n - f - 1] : story.chapters[n - 1]; };
    const label = (story, n, route) => { const f = forkAt(story); return f && n > f ? `${ROMAN[n - 1]}${route || 'A'}` : ROMAN[n - 1]; };

    // ---------- the fortune (an omikuji slip) ----------
    function openReading(story, mode, fromBranch = null) {
        state.draft = structuredClone(story); state.mode = mode; state.fromBranch = fromBranch;
        const s = api.status(), editable = mode === 'draft';
        const ce = editable ? { contenteditable: 'true', spellcheck: 'false' } : {};
        const f = forkAt(story);
        let order = 0;
        const chapter = (c, idx, num, route) => {
            const card = ARCANA[c.card.id];
            const here = mode === 'view' && s.story && s.chapter === num && (route || null) === (f && num > f ? s.route : null) && !s.done;
            return el('section', { class: `ch${here ? ' here' : ''}`, 'data-i': idx, 'data-route': route || '', style: `animation-delay:${0.5 + order++ * 0.1}s` },
                el('div', { class: 'ch-card' }, cardNode(c.card, 'flat flipped')),
                el('div', { class: 'ch-body' },
                    el('span', { class: 'ch-meta', text: `${label(story, num, route)} · ${c.pos} · ${card.name}${c.card.rev ? ', reversed' : ''}${here ? ' · YOU ARE HERE' : ''}` }),
                    el('h3', { 'data-f': 'name', ...ce, text: c.name }),
                    el('p', { class: 'ch-scene', 'data-f': 'scene', ...ce, text: c.scene }),
                    el('p', { class: 'ch-ends' }, el('b', { text: 'Ends when ' }), el('span', { 'data-f': 'ends', ...ce, text: c.ends }))));
        };
        const luck = LUCK[story.luck ?? 1];
        const forkParts = f ? [
            el('section', { class: 'crossing', style: `animation-delay:${0.5 + order++ * 0.1}s` },
                el('span', { class: 'crossing-tag', text: 'THE CROSSING' }),
                el('p', { 'data-f': 'choice', ...ce, text: story.fork.choice }),
                el('small', { text: 'Your call when you get there. Change your mind later and the fortune crosses over.' })),
            ...['A', 'B'].map(r => el('div', { class: `road r-${r}`, 'data-road': r },
                el('div', { class: 'road-head' }, el('b', { text: `Road ${r}` }), el('span', { 'data-f': 'label', ...ce, text: story.fork.routes[r].label })),
                ...story.fork.routes[r].chapters.map((c, j) => chapter(c, j, f + j + 1, r)),
                el('p', { class: 'finale' }, el('b', { text: `Road ${r} settles ` }), el('span', { 'data-f': 'rfinale', ...ce, text: story.fork.routes[r].finale })))),
        ] : [];
        $('paper').replaceChildren(
            el('div', { class: 'paper-head' },
                el('span', { class: 'tate', text: '狐火みくじ' }),
                el('div', { class: `luck l-${story.luck ?? 1}` }, el('b', { text: luck[0] }), el('span', { text: luck[1] })),
                el('span', { class: 'tate right', text: `第${['一', '二', '三', '四', '五', '六', '七'][totalFor(story, 'A') - 1]}番` })),
            el('h2', { 'data-f': 'title', ...ce, text: story.title }),
            el('p', { class: 'premise', 'data-f': 'premise', ...ce, text: story.premise }),
            story.ellie ? el('div', { class: 'note' }, el('span', { text: story.ellie }), el('i', { text: 'Ellie' })) : '',
            ...story.chapters.map((c, i) => chapter(c, i, i + 1, null)),
            ...forkParts,
            story.finale && !f ? el('p', { class: 'finale' }, el('b', { text: 'How it settles ' }), el('span', { 'data-f': 'finale', ...ce, text: story.finale })) : '',
            editable ? el('p', { class: 'edit-hint', text: 'Tap any line to change it before you seal it.' }) : '');
        $('slSeal').hidden = !editable; $('slTie').hidden = !editable || fromBranch != null; $('slAgain').hidden = !editable || fromBranch != null;
        $('slSeal').querySelector('span').textContent = s.story ? 'Swap it in' : 'Seal it in';
        $('slBurnText').textContent = !editable ? 'Close' : fromBranch != null ? 'Untie & burn' : 'Burn it';
        $('reading').className = ''; $('reading').hidden = false;
        // A fortune always opens at its top. Reset only once it is visible (a hidden scroller ignores it,
        // which is why a reading sometimes opened at the end), and again next frame, after the chapters'
        // entrance animation has given the paper its full height.
        $('paper').scrollTop = 0;
        requestAnimationFrame(() => { $('paper').scrollTop = 0; });
        snd.fx('unroll');
        // A fresh fortune is saved the moment it is on the table, so closing the phone now loses nothing.
        if (editable && fromBranch == null) { state.readingChat = benchChat(); saveDraftReading(); }
    }
    function readPaper() {
        const p = $('paper'), st = structuredClone(state.draft);
        const txt = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
        st.title = txt(p.querySelector('[data-f="title"]')) || st.title;
        st.premise = txt(p.querySelector('[data-f="premise"]'));
        const fin = p.querySelector('[data-f="finale"]'); if (fin) st.finale = txt(fin);
        p.querySelectorAll('.ch').forEach(sec => {
            const r = sec.dataset.route, c = (r ? st.fork.routes[r].chapters : st.chapters)[Number(sec.dataset.i)];
            c.name = txt(sec.querySelector('[data-f="name"]')) || c.name;
            c.scene = txt(sec.querySelector('[data-f="scene"]'));
            c.ends = txt(sec.querySelector('[data-f="ends"]'));
        });
        if (st.fork) {
            st.fork.choice = txt(p.querySelector('[data-f="choice"]')) || st.fork.choice;
            p.querySelectorAll('[data-road]').forEach(box => {
                const rt = st.fork.routes[box.dataset.road];
                rt.label = txt(box.querySelector('[data-f="label"]')) || rt.label;
                rt.finale = txt(box.querySelector('[data-f="rfinale"]'));
            });
        }
        return st;
    }
    function closeReading(silent) { $('reading').hidden = true; if (!silent) state.fromBranch = null; }

    function setupReading() {
        // Edits typed on an unsealed fortune are saved too (half a second after the last keystroke).
        let paperTimer = null;
        $('paper').addEventListener('input', () => { clearTimeout(paperTimer); paperTimer = setTimeout(saveDraftReading, 500); });
        $('slSeal').addEventListener('click', async () => {
            const s = api.status();
            if (s.story && !await confirmModal(`This chat already follows "${s.story.title}". Swap it for this one?`, 'Swap it', 'Keep the old one')) return;
            api.loadStory(readPaper());
            dropDraftReading();   // sealed in: the chat has it now, so it is not waiting on the table any more
            snd.fx('stamp'); $('reading').classList.add('sealed');
            say(LINES.sealed[0]);
            await wait(1300);
            closeReading(); show('unfold');
        });
        $('slAgain').addEventListener('click', () => { closeReading(true); gaze(); });
        $('slTie').addEventListener('click', async () => {
            const story = readPaper();
            api.shelve(story); snd.fx('knot');
            $('reading').classList.add('tying');
            wisp(centre($('paper')), centre($('btnBranch')), 800);
            say(story.luck === 4 ? LINES.tiedBad[0] : LINES.tied[0]);
            await wait(800);
            $('btnBranch').classList.remove('ping'); void $('btnBranch').offsetWidth; $('btnBranch').classList.add('ping');
            $('reading').classList.remove('tying');
        });
        $('slBurn').addEventListener('click', async () => {
            if (state.mode !== 'draft') { closeReading(); snd.fx('tap'); return; }
            dropDraftReading();
            if (state.fromBranch != null) api.unshelve(state.fromBranch);
            snd.fx('burn'); $('reading').classList.add('burning');
            sayFrom(LINES.burned);
            await wait(1500);
            const back = state.fromBranch != null;
            closeReading();
            if (back) show('branch'); else if (app.dataset.screen !== 'draw') home();
        });
    }

    // ---------- unfolding: the fortune the chat is following ----------
    function renderUnfold() {
        const s = api.status();
        if (!s.story) { show('ask'); return; }
        const story = s.story, f = forkAt(story), route = f && s.chapter > f ? (s.route || 'A') : null, total = totalFor(story, route);
        $('ufTitle').textContent = story.title;
        // OOC Mode swaps out the whole roleplay prompt, so the parent holds the fortune back while it is on.
        $('ufTag').textContent = s.done ? 'FULFILLED' : !s.active ? 'PAUSED' : s.ooc ? 'WAITING (OOC MODE)' : 'UNFOLDING';
        $('ufTag').classList.toggle('off', !s.active || s.done || !!s.ooc);
        const mini = (c, n, r) => {
            const cls = s.done || n < s.chapter ? 'past' : n === s.chapter ? 'now' : 'future';
            const b = el('button', { class: `uf-card ${cls}`, title: c.name }, cardNode(c.card, cls === 'future' ? 'flat' : 'flat flipped'), el('span', { text: label(story, n, r) }));
            b.addEventListener('click', () => { touch(); jumpTo(n, r); });
            return b;
        };
        const cards = story.chapters.map((c, i) => mini(c, i + 1, null));
        if (f) {
            cards.push(el('div', { class: `uf-cross${route ? ' past' : ''}`, title: story.fork.choice }, el('i'), el('span', { text: route ? `Road ${route}` : 'A or B?' })));
            if (route) cards.push(...story.fork.routes[route].chapters.map((c, j) => mini(c, f + j + 1, route)));
        }
        $('ufCards').replaceChildren(...cards);
        $('ufCards').querySelector('.now')?.scrollIntoView({ inline: 'center', block: 'nearest' });
        $('ufRoads').hidden = !f;
        if (f) {
            $('ufRoads').replaceChildren(el('span', { text: 'ROAD' }), ...['A', 'B'].map(r => {
                const b = el('button', { class: route === r ? 'on' : '', 'aria-pressed': String(route === r) }, el('b', { text: r }), el('span', { text: story.fork.routes[r].label }));
                b.addEventListener('click', () => { touch(); chooseRoad(r); });
                return b;
            }));
        }
        const c = chapterAt(story, s.chapter, route), card = ARCANA[c.card.id];
        // The chapter being played can be retyped here, the way the fortune could before it was sealed (Lucky,
        // 2026-11-18). Not once it is fulfilled: nothing follows it any more. The span remembers which chapter it
        // shows, so a save that lands after the player tapped another card still goes to the right one.
        const editable = !s.done, ce = editable ? { contenteditable: 'true', spellcheck: 'false' } : {};
        // "Ends when" reads as one sentence, so the shown text starts lower-case; the saved text keeps its own case
        // unless the player actually changed it (saveChapterEdit compares against what was shown).
        const endsShown = `${c.ends.charAt(0).toLowerCase()}${c.ends.slice(1)}`;
        $('ufChapter').classList.toggle('done', s.done);
        $('ufChapter').dataset.n = String(s.chapter); $('ufChapter').dataset.route = route || '';
        $('ufChapter').replaceChildren(
            el('span', { class: 'ch-meta', text: `Card ${label(story, s.chapter, route)} of ${total} · ${c.pos} · ${card.name}${c.card.rev ? ', reversed' : ''}` }),
            el('h3', { 'data-f': 'name', ...ce, text: c.name }), el('p', { 'data-f': 'scene', ...ce, text: c.scene }),
            el('p', { class: 'ch-ends' }, el('b', { text: 'Ends when ' }), el('span', { 'data-f': 'ends', 'data-shown': endsShown, ...ce, text: endsShown })),
            f && s.chapter === f && !s.done ? el('p', { class: 'uf-fork', text: `Then the crossing: ${story.fork.choice}` }) : '',
            editable ? el('p', { class: 'edit-hint', text: 'Tap any line to change this chapter. The next reply follows the new version.' }) : '');
        $('ufPrev').disabled = s.chapter <= 1 && !s.done;
        $('ufNext').disabled = s.done;
        // Plain words (Lucky, 2026-11-16): "Veil the cards" did not say that it stops the chat following the fortune.
        $('ufToggle').textContent = s.active ? 'Pause' : 'Unpause';
        $('ufToggle').hidden = s.done;
        syncKeepLater();
    }
    // "Keep for later" ties the fortune this chat follows to the wishing branch (QA, 2026-11-18: once a story was
    // sealed in there was no way to save it; Tie it up only shows on a fresh reading). The branch keeps the plan
    // only, not this chat's place in it: taken down later and sealed into any chat, it starts at chapter 1.
    // Shelving matches by title, so a fortune already on the branch reads "On the branch".
    function syncKeepLater() {
        const s = api.status(), on = !!s.story && s.shelf.some(k => k.title === s.story.title);
        $('ufKeep').disabled = on; $('ufKeep').textContent = on ? 'On the branch' : 'Keep for later';
    }
    async function keepForLater() {
        const s = api.status();
        if (!s.story) return;
        touch();
        // Only the plan: the chat's chapter, route and paused flag stay with the chat.
        api.shelve(structuredClone(s.story)); snd.fx('knot');
        wisp(centre($('ufKeep')), centre($('btnBranch')), 800);
        say(LINES.keptLater[0], { required: true });
        syncKeepLater();
        await wait(800);
        $('btnBranch').classList.remove('ping'); void $('btnBranch').offsetWidth; $('btnBranch').classList.add('ping');
    }
    // Saves what the player typed into the unfolding chapter. Called half a second after the last keystroke and
    // again when the field loses focus; the parent ignores a save that changes nothing.
    let chapterEditTimer = null;
    function saveChapterEdit() {
        clearTimeout(chapterEditTimer); chapterEditTimer = null;
        const box = $('ufChapter'), n = Number(box.dataset.n);
        if (!n || typeof api.editChapter !== 'function') return;
        const txt = f => (box.querySelector(`[data-f="${f}"]`)?.textContent || '').replace(/\s+/g, ' ').trim();
        const endsNode = box.querySelector('[data-f="ends"]');
        const ends = txt('ends');
        // Untouched "ends when" goes back as '' (= keep the stored text, capital letter and all).
        api.editChapter(n, box.dataset.route || null, { name: txt('name'), scene: txt('scene'), ends: ends === endsNode?.dataset.shown ? '' : ends });
    }
    function jumpTo(n, route = null) {
        const s = api.status();
        if (!s.story || (n === s.chapter && (route || null) === (s.route || null) && !s.done)) return;
        const forward = n > s.chapter;
        api.setChapter(n, route); snd.fx('flip');
        say(forward ? LINES.next[0] : LINES.prev[0]);
    }
    function chooseRoad(r) {
        const s = api.status(), f = forkAt(s.story);
        if (!f) return;
        if (s.chapter <= f) { api.setChapter(f + 1, r); snd.fx('place'); say(['think', `Past the crossing. Road ${r}. Okay.`]); return; }
        if (s.route === r) return;
        api.setChapter(s.chapter, r); snd.fx('place'); say(LINES.crossed[0]);
    }
    const pickRoad = () => { const { fork } = api.status().story; return modal(`Which way? ${fork.choice}`, [['Not yet', null], ['A: ' + fork.routes.A.label, 'A', true], ['B: ' + fork.routes.B.label, 'B', true]]); };
    function setupUnfold() {
        $('ufPrev').addEventListener('click', () => { const s = api.status(); jumpTo(s.done ? totalFor(s.story, s.route) : s.chapter - 1, s.route); });
        $('ufNext').addEventListener('click', async () => {
            const s = api.status(), f = forkAt(s.story);
            if (f && s.chapter === f) { const r = await pickRoad(); if (r) jumpTo(f + 1, r); return; }
            if (s.chapter < totalFor(s.story, s.route)) { jumpTo(s.chapter + 1, s.route); return; }
            api.finish(); snd.fx('chime'); fire.burst(40); say(LINES.finished[0]);
        });
        $('ufToggle').addEventListener('click', () => { const s = api.status(); api.setActive(!s.active); snd.fx('place'); say(s.active ? LINES.veiled[0] : LINES.unveiled[0]); });
        $('ufRead').addEventListener('click', () => openReading(api.status().story, 'view'));
        $('ufNew').addEventListener('click', () => { snd.fx('tap'); show('ask'); say(LINES.ask[0]); });
        $('ufKeep').addEventListener('click', keepForLater);
        $('ufChapter').addEventListener('input', () => { clearTimeout(chapterEditTimer); chapterEditTimer = setTimeout(saveChapterEdit, 500); });
        $('ufChapter').addEventListener('focusout', () => { if (chapterEditTimer) saveChapterEdit(); });
        // Enter in the one-line chapter name finishes it instead of breaking the line.
        $('ufChapter').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset?.f === 'name') { e.preventDefault(); e.target.blur(); } });
        $('ufBurn').addEventListener('click', async () => {
            const kept = api.status().shelf.some(k => k.title === api.status().story?.title);
            if (!await confirmModal(kept ? 'Burn this fortune? The chat stops following it. The copy on the wishing branch stays.' : 'Burn this fortune? The chat stops following it. (Tap Keep for later first if you want it again.)', 'Burn it', 'Keep it')) return;
            api.eject(); snd.fx('burn'); fire.burst(50); show('ask'); sayFrom(LINES.burned);
        });
    }

    // ---------- the wishing branch ----------
    function renderBranch() {
        const s = api.status();
        $('branchEmpty').hidden = s.shelf.length > 0;
        $('branch').replaceChildren(
            el('div', { class: 'bough', html: '<svg viewBox="0 0 400 120" preserveAspectRatio="none"><path d="M-10 30C80 10 160 44 240 30S360 20 410 44" fill="none" stroke="#3a2418" stroke-width="9" stroke-linecap="round"/><path d="M120 28c10-14 22-18 34-20M290 26c8-10 20-12 30-12" fill="none" stroke="#3a2418" stroke-width="4" stroke-linecap="round"/><g fill="#f5b6c8"><circle cx="154" cy="8" r="5"/><circle cx="320" cy="14" r="5"/><circle cx="60" cy="20" r="4"/><circle cx="226" cy="30" r="4"/><circle cx="372" cy="28" r="4"/></g><g fill="#ffe9a8"><circle cx="154" cy="8" r="1.6"/><circle cx="320" cy="14" r="1.6"/><circle cx="60" cy="20" r="1.4"/></g></svg>' }),
            ...s.shelf.map((story, i) => {
                const k = el('button', { class: `knot l-${story.luck ?? 1}`, style: `--x:${6 + (i * 88 / Math.max(5, s.shelf.length - 1 || 1))}%;--d:${(i * 0.37) % 1.5}s;--len:${86 + (i * 29) % 46}px`, title: story.title },
                    el('i'), el('span', { text: story.title }));
                k.addEventListener('click', () => { touch(); openReading(story, 'draft', i); });
                return k;
            }));
        if (!s.shelf.length) say(LINES.branchEmpty[0]);
    }

    // ---------- modals ----------
    function modal(text, buttons) {
        return new Promise(resolve => {
            $('modalText').textContent = text;
            $('modalBtns').replaceChildren(...buttons.map(([lbl, value, primary]) => {
                const b = el('button', { class: primary ? 'cta small' : 'ghost', text: lbl });
                b.addEventListener('click', () => { $('modal').hidden = true; snd.fx('tap'); resolve(value); });
                return b;
            }));
            $('modal').hidden = false;
        });
    }
    const confirmModal = (text, yes, no) => modal(text, [[no, false], [yes, true, true]]);

    // ---------- the phone's back button ----------
    // WeyPhone calls this (through the extension's `back()`) before it leaves the app. Returns true when it
    // stepped back inside the app, false when there is nowhere further back and the phone should go home.
    // Order: whatever is on top closes first (a question, a held card, the paper), then the screens step back
    // the way the on-screen buttons would.
    function stepBack() {
        if (!$('modal').hidden) { $('modalBtns').firstElementChild?.click(); return true; } // first button is always the "no"/cancel
        if (!$('keptModal').hidden) { closeKept(); return true; }
        if (!$('modelModal').hidden) { closeModels(); return true; }
        if (!$('cardModal').hidden) { closeHeld(); return true; }
        if (!$('reading').hidden) {
            // A fresh fortune that is not sealed or tied would be lost, and it cost a message: ask first.
            if (state.mode === 'draft' && state.fromBranch == null) {
                confirmModal('Put this fortune down? It is not sealed in or tied to the branch, so it will be gone.', 'Put it down', 'Keep reading')
                    .then(yes => { if (yes) { dropDraftReading(); closeReading(); snd.fx('tap'); } });
            } else {
                // closeReading() forgets fromBranch, so read it first: a kept fortune goes back to the branch.
                const fromBranch = state.fromBranch != null;
                closeReading(); snd.fx('tap');
                if (fromBranch) show('branch');
            }
            return true;
        }
        const scr = app.dataset.screen;
        if (scr === 'gaze') {
            confirmModal('Stop the reading? Ellie stops looking.', 'Stop', 'Keep going').then(yes => { if (yes) breakGaze(); });
            return true;
        }
        if (scr === 'draw') { snd.fx('tap'); show('ask'); return true; }
        if (scr === 'branch') { snd.fx('tap'); home(); return true; }
        if (scr === 'settings') { closeSettings(); return true; }
        // "Ask again" goes from the fortune to the ask page; back returns to the fortune.
        if (scr === 'ask' && api.status().story) { snd.fx('tap'); show('unfold'); return true; }
        return false;
    }
    window.effBack = stepBack;

    // ---------- what the cards add to any fortune, whoever wrote it ----------
    // The omikuji rank: more reversed cards and more darkness read worse, the Star and the Sun help, the Tower hurts.
    function luckOf(cards, darkness) {
        const n = cards.length, revs = cards.filter(c => c.rev).length, has = id => cards.some(c => c.id === id);
        return Math.min(4, Math.max(0, Math.round((revs / n) * 3 + darkness * 0.55 - (has(17) || has(19) ? 0.6 : 0) + (has(16) ? 0.5 : 0))));
    }
    function noteOf(cards, spice) {
        const n = cards.length, revs = cards.filter(c => c.rev).length, has = id => cards.some(c => c.id === id);
        if (has(16)) return 'Oh... the Tower. I hope it’s gentle with you.';
        if (spice === 3) return 'Um... I’ll leave the warm part to you.';
        if (!revs) return 'They all came out upright. Oh... that’s nice.';
        if (revs > n / 2) return 'A few turns... maybe give it time.';
        if (has(6)) return 'Oh... the Lovers. Um.';
        if (has(18)) return 'The Moon... I’d look twice, if you can.';
        return 'I think... it’s a kind one.';
    }
    // A fortune written by the model comes back as a bare story. Every screen here draws a card per
    // chapter, so each chapter gets the card it was written from: chapter k = card k on either road, and
    // road B reads its cards the other way up (that is how the request describes it too). A model that
    // wrote more chapters than there are cards reuses the last card instead of breaking the page.
    function dress(story, { cards, darkness, spice }) {
        const n = cards.length;
        const give = (c, k, flip) => {
            if (c.card) return;
            const s = cards[Math.min(k, n - 1)];
            c.card = { id: s.id, rev: flip ? !s.rev : s.rev }; c.pos = POSITIONS[n][Math.min(k, n - 1)];
        };
        story.chapters.forEach((c, i) => give(c, i, false));
        if (story.fork) for (const r of ['A', 'B']) story.fork.routes[r].chapters.forEach((c, j) => give(c, story.chapters.length + j, r === 'B'));
        if (!Number.isInteger(story.luck)) story.luck = luckOf(cards, darkness);
        if (!story.ellie) story.ellie = noteOf(cards, spice);
        return story;
    }

    // ---------- the sandbox stand-in for the model: the cards write the fortune themselves ----------
    function composeFortune({ question, cards, darkness, spice, fork }, names) {
        const n = cards.length, pos = POSITIONS[n];
        const put = t => t.replaceAll('{char}', names.charName).replaceAll('{user}', names.userName);
        // No two chapters share an ending: the last card always settles it, the rest walk the list from a start the cards pick.
        const base = cards.reduce((a, c) => a + c.id, 0), lastEnd = ENDS.length - 1;
        const chap = (slot, i) => { const c = ARCANA[slot.id], m = slot.rev ? c.rev : c.up; return { name: m.title, scene: put(m.scene), ends: i === n - 1 ? ENDS[lastEnd] : ENDS[(base + i) % lastEnd], card: { ...slot }, pos: pos[i] }; };
        const all = cards.map(chap), first = ARCANA[cards[0].id], last = ARCANA[cards[n - 1].id];
        const revs = cards.filter(c => c.rev).length, has = id => cards.some(c => c.id === id);
        const keys = cards.map(s => (s.rev ? ARCANA[s.id].rev : ARCANA[s.id].up).key);
        const luck = luckOf(cards, darkness), ellie = noteOf(cards, spice);
        const story = {
            title: `${first.name}, Then ${last.name.replace(/^The /, 'the ')}`,
            premise: question ? `You asked the cards: "${question}" They answered with ${n} turns for ${names.charName}: ${keys.join('; ')}.` : `No question, only the cards. ${n} turns for ${names.charName}: ${keys.join('; ')}.`,
            ellie, luck, chapters: all,
            finale: cards[n - 1].rev ? 'The last card fell upside down, so it does not end clean. How it ends is still yours.' : 'The last card fell the right way up. Where it lands is yours to choose.',
        };
        if (!fork) return story;
        // Crossroads: the same cards read two ways. Road A as they fell, road B with every one turned over.
        const at = Math.floor(n / 2), rest = cards.slice(at);
        const choices = [`When it matters, does ${names.userName} stay or go?`, `Does ${names.userName} tell the truth, or keep the peace?`, `Does ${names.userName} reach back, or let the moment pass?`];
        return {
            ...story, finale: '', chapters: all.slice(0, at),
            fork: {
                choice: choices[cards.reduce((a, c) => a + c.id, 0) % choices.length],
                routes: {
                    A: { label: 'The cards as they fell', chapters: rest.map((s, j) => chap(s, at + j)), finale: 'The cards land the way they were dealt.' },
                    B: { label: 'Every card turned over', chapters: rest.map((s, j) => chap({ id: s.id, rev: !s.rev }, at + j)), finale: 'The same cards, read from the other side of the table.' },
                },
            },
        };
    }

    function sandboxApi() {
        const KEY = 'eff.sandbox.v1';
        let data = { st: null, shelf: [], prompts: [], prefs: { blocks: [], customBlocks: [] }, charName: 'Belle', userName: 'Lucky' };
        // A copy of the chip list for the sandbox only (it has no fortuneCore.js). In WeyTav the parent's
        // BLOCK_OPTIONS is the one used, so a label tweak there needs no change here.
        const BLOCKS = [['violence', 'Violence'], ['gore', 'Gore'], ['death', 'Character death'], ['ntr', 'NTR (cheating)'], ['sex', 'Sex'], ['noncon', 'Non-consent'],
            ['horror', 'Horror'], ['drugs', 'Drugs & drinking'], ['selfharm', 'Self-harm'], ['breakup', 'Breakups'], ['pregnancy', 'Pregnancy']];
        try { Object.assign(data, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* start clean */ }
        const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* fine */ } };
        const subs = new Set(), ping = () => { save(); subs.forEach(f => f()); };
        let cancelled = 0;
        return {
            status: () => ({ hasChat: true, charName: data.charName || 'your character', userName: data.userName || 'you', story: data.st?.story || null, chapter: data.st?.chapter || 1, route: data.st?.route || null, active: !!data.st?.active, done: !!data.st?.done, shelf: data.shelf.slice(), prompts: data.prompts.slice() }),
            // Same rules as the real api (Weyland-EllieFoxfireFortunes/index.js): newest first, no duplicates, 20 max.
            keepPrompt(text) { const name = data.prompts.find(p => p.text === text)?.name; data.prompts = [{ text, at: Date.now(), ...(name ? { name } : {}) }, ...data.prompts.filter(p => p.text !== text)].slice(0, 20); save(); },
            forgetPrompt(i) { data.prompts.splice(i, 1); save(); },
            renamePrompt(i, name) { const p = data.prompts[i]; if (!p) return; const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40); if (n) p.name = n; else delete p.name; save(); },
            blockOptions: () => BLOCKS.map(([id, label]) => ({ id, label })),
            blockLimits: () => ({ max: 12, chars: 80 }),
            getPrefs: () => ({ blocks: (data.prefs?.blocks || []).slice(), customBlocks: (data.prefs?.customBlocks || []).slice() }),
            setPrefs(next) {
                const p = { blocks: [], customBlocks: [], ...data.prefs, ...next };
                data.prefs = { blocks: p.blocks, customBlocks: p.customBlocks.map(s => String(s).trim().slice(0, 80)).filter(Boolean).slice(0, 12) };
                save(); return this.getPrefs();
            },
            rename(c, u) { data.charName = c.trim() || 'Belle'; data.userName = u.trim() || 'you'; save(); },
            async generate(opts) {
                const mine = cancelled;
                await wait(2600 + opts.cards.length * 1150);
                if (mine !== cancelled) throw new Error('cancelled');
                // Sandbox only: a slip that says "filter test" plays a content-filter refusal, to try Ellie's lines.
                if (/filter test/i.test(opts.question)) throw Object.assign(new Error('Filtered (sandbox).'), { filtered: true });
                return composeFortune(opts, { charName: data.charName, userName: data.userName });
            },
            cancel() { cancelled++; },
            subscribe(f) { subs.add(f); },
            loadStory(story) { data.st = { story, chapter: 1, route: null, active: true, done: false }; ping(); return true; },
            setChapter(n, route) {
                if (!data.st) return;
                const f = forkAt(data.st.story), r = f ? (route || data.st.route || 'A') : null;
                data.st.chapter = Math.min(Math.max(1, n), totalFor(data.st.story, r));
                data.st.route = f && data.st.chapter > f ? r : null; data.st.done = false; ping();
            },
            finish() { if (data.st) { data.st.done = true; ping(); } },
            setActive(on) { if (data.st) { data.st.active = on; ping(); } },
            editChapter(n, route, fields) {
                const ch = data.st && chapterAt(data.st.story, n, route);
                if (!ch) return false;
                for (const k of ['name', 'scene', 'ends']) if (fields[k]) ch[k] = fields[k];
                ping(); return true;
            },
            eject() { data.st = null; ping(); },
            shelve(story) { data.shelf.unshift(story); data.shelf = data.shelf.slice(0, 12); ping(); },
            unshelve(i) { data.shelf.splice(i, 1); ping(); },
        };
    }
    // Inside WeyPhone the parent page owns the chat, the model and the storage (same origin, so a plain
    // object is enough). The try is for a cross-origin parent, which throws on property access.
    const liveApi = (() => { try { return window.parent !== window ? window.parent.ellieFoxfireFortunes : null; } catch { return null; } })();
    const LIVE = !!liveApi;
    const api = liveApi || sandboxApi();

    // ---------- start ----------
    function showNames() {
        const s = api.status();
        $('inChar').value = s.hasChat ? s.charName : 'nobody yet'; $('inUser').value = s.userName || 'you';
    }
    function setSound(on) {
        snd.setOn(on);
        $('btnSound').setAttribute('aria-pressed', String(snd.on));
    }
    function init() {
        // Opening (Lucky, 2026-11-18): Ellie at full size, fading in, with no pan. The room used to start on the
        // dark-room framing and then ease across to the menu's (stage height and camera both animating), which
        // read as a zoom out of a close-up of her ear. While .opening is on, nothing in the room animates its
        // size or position; it comes off two frames after the first screen is set, and the fade is a CSS
        // animation on the stage (parlor.css).
        app.classList.add('opening');
        requestAnimationFrame(() => requestAnimationFrame(() => app.classList.remove('opening')));
        idleLoop.start();   // the dark room shows her too (dimmed), and show() isn't called for it
        showNames();
        if (LIVE) { app.classList.add('live'); $('inChar').readOnly = true; $('inUser').readOnly = true; $('inChar').tabIndex = -1; $('inUser').tabIndex = -1; }
        setupCandles(); setupAsk(); setupHeld(); setupOmens(); setupReading(); setupUnfold(); setupSettings(); setupModels();
        $('btnGaze').addEventListener('click', gaze);
        $('btnFate').addEventListener('click', fate);
        $('btnClear').addEventListener('click', clearSlots);
        $('btnBack').addEventListener('click', () => { snd.fx('tap'); show('ask'); });
        $('btnBreak').addEventListener('click', breakGaze);
        $('branchBack').addEventListener('click', () => { snd.fx('tap'); home(); });
        $('btnBranch').addEventListener('click', () => {
            if (app.dataset.screen === 'dark' || app.dataset.screen === 'gaze') return;
            snd.fx('tap'); closeReading();
            if (app.dataset.screen === 'branch') home(); else show('branch');
        });
        $('btnSound').setAttribute('aria-pressed', String(snd.on));
        $('btnSound').addEventListener('click', () => { setSound(!snd.on); if (snd.on) snd.fx('chime'); });
        const lit = () => app.dataset.screen !== 'dark';
        $('hitBall').addEventListener('click', () => { if (!lit() || app.dataset.screen === 'gaze') return; touch(); fire.burst(26); snd.fx('whoosh'); sayFrom(LINES.ball); });
        $('hitEar').addEventListener('click', () => { if (!lit()) return; touch(); sayFrom(LINES.ear); });
        $('hitTail').addEventListener('click', () => { if (!lit()) return; touch(); say(LINES.tail[0]); });
        // The parent calls this when the chat changes or the story moves. A different chat can mean a
        // different fortune (or none), so the ask/unfold screens swap to match; a half-built spread is left alone.
        api.subscribe(() => {
            showNames();
            const scr = app.dataset.screen, has = !!api.status().story;
            // Not while the player is typing into the chapter: a redraw would throw away the caret (and our own
            // save is one of the things that calls this). The next redraw after they leave the field catches up.
            if (scr === 'unfold') { if (!$('ufChapter').contains(document.activeElement)) renderUnfold(); }
            else if (scr === 'ask' && has && $('reading').hidden) show('unfold');
            // A fortune asked for before the app was closed and reopened lands here when it arrives (this page
            // isn't the one that asked, so nothing else would show it). Never during a gaze of our own.
            restoreReading({ onlyFresh: true });
        });
        // She fidgets when it is quiet. Rarely: silence is her default.
        setInterval(() => {
            if (!['ask', 'draw', 'unfold'].includes(app.dataset.screen) || document.hidden || Date.now() - state.lastTouch < 90000 || !$('reading').hidden) return;
            touch(); sayFrom(LINES.idle);
        }, 10000);
        // Music from the moment the app opens (Lucky, 2026-11-17), not the first touch. The player just tapped the
        // tile in the same page, so browsers usually allow it; if one doesn't, the first tap starts it as before.
        snd.startMusic();
        document.addEventListener('pointerdown', snd.startMusic);
        document.addEventListener('click', snd.startMusic);
        window.addEventListener('pagehide', () => { snd.stopMusic(); snd.stopReadingSounds(); snd.ambience(false); flushBench(); saveDraftReading(); });
        // A phone going to sleep or switching apps hides the page without closing it: write now, while we can.
        document.addEventListener('visibilitychange', () => { if (document.hidden) { flushBench(); saveDraftReading(); } });
        layout();
        // The candle opening plays once, ever (Lucky: boot up and get to the menu). After that the room is
        // already lit and she just says hi.
        let litBefore = false;
        try { litBefore = !!localStorage.getItem('eff.lit'); } catch { /* storage blocked: play the opening */ }
        // Whatever was on the table when the app last closed goes back on it (bench.js): the slip, the cards, the
        // omens. Restored even in the dark room, so lighting the candles finds it waiting.
        const backToCards = restoreSpread();
        if (litBefore) {
            document.querySelectorAll('.candle').forEach(c => c.classList.add('lit'));
            app.dataset.lit = 3; fire.set(1); home();
            // An unsealed fortune for this chat comes first; otherwise back to the cards if that's where they were.
            if (!restoreReading() && backToCards) { buildMenu(); buildSlots(); show('draw'); }
            setTimeout(() => say(LINES.greet[1]), 500);
            // Closed while she was still looking: the request carries on in the parent page and its fortune is
            // saved when it lands (restoreReading in the subscriber above shows it).
            if (LIVE && api.status().busy) setTimeout(() => say(['think', 'Still looking... I will put it on the table when it comes.'], { required: true }), 3200);
        }
    }
    init();
})();
