// lib/clockAlert.js
//
// Looping alert sound for the Clock app's going-off screen. Plays a user-provided sound URL when
// one is set, otherwise a generated beep via the Web Audio API — so there's always a sound with no
// bundled asset required. Browsers block audio that starts without a prior user gesture, so
// unlockAudio() is called on the first tap inside the phone to prime the AudioContext; if the alert
// still fires with no prior gesture the sound simply starts when the user taps Snooze/Dismiss.

let audioCtx = null;

function ensureCtx() {
    if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
}

/** Prime audio playback on a user gesture (call from the first tap in the phone). */
export function unlockAudio() {
    try { ensureCtx(); } catch { /* audio unavailable in this environment */ }
}

/**
 * Start a looping alert sound. Returns a handle whose stop() silences it.
 * @param {string} [url] optional sound URL; falls back to a generated beep loop
 * @returns {{stop: () => void}}
 */
export function startAlarmSound(url) {
    if (url) {
        try {
            const audio = new Audio(url);
            audio.loop = true;
            audio.play().catch(() => { /* blocked until a gesture — retried by re-fire */ });
            return { stop() { try { audio.pause(); audio.currentTime = 0; } catch { /* ignore */ } } };
        } catch { /* bad URL — fall through to the beep */ }
    }
    return startBeepLoop();
}

/** A short 880Hz beep repeated on an interval, via Web Audio (no file needed). */
function startBeepLoop() {
    const ctx = ensureCtx();
    if (!ctx) return { stop() { /* no audio */ } };
    let stopped = false;
    const beep = () => {
        if (stopped) return;
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = 880;
            const t = ctx.currentTime;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.3);
        } catch { /* ignore a dropped beep */ }
    };
    beep();
    const handle = setInterval(beep, 900);
    return { stop() { stopped = true; clearInterval(handle); } };
}
