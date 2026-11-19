// Foxfire Fortunes: the workbench. What the player has set up (the spread, the slip, the omens) and any fortune
// that was written but not yet sealed, burned or tied, kept in this device's localStorage.
//
// Why (Lucky, 2026-11-18, on his phone): he set up a whole scene, the request failed, he closed WeyPhone to change
// the model, and on reopening everything was gone. WeyPhone deletes the app's iframe when it closes, and all of
// that lived only in the iframe's memory. A fortune also costs a message, so one that comes back while the app is
// closed must not be thrown away either.
//
// Why localStorage and not extension settings or chat metadata: it never leaves the device. A save here costs
// nothing, while every extension-settings or chat save re-uploads a file of hundreds of KB, which is slow for the
// half of players who play over Tailscale from a phone. Progress is per device on purpose: it is a half-built
// spread, not something to sync.
//
// One file for both sides: a plain script (no import/export), so the app page loads it with a <script> tag and the
// extension's index.js loads it with a bare `import`. Either way it puts EFFBench on its own window's globalThis.
// The iframe and the parent page share an origin, so they read and write the same storage.
//
// Shape of the stored value (key "eff.bench"):
//   { spread: { n, slots, question, spice, dark, pace, conn, cross, screen, at } | null,
//     readings: { [chatId]: { story, dressed, opts?, at } } }
// `spread` is one per device, like the page itself (switching chats never cleared a half-built spread).
// `readings` is per chat: a fortune is written about one chat's characters, so it only ever reopens in that chat.
// dressed=false means it came straight from the model (stored by the parent) and still needs its cards and luck
// filled in by the app (dress() in parlor.js), from `opts`.
(function (root) {
    const KEY = 'eff.bench';
    const READINGS_MAX = 6; // a handful of chats' unsealed fortunes; older ones are dropped first

    function storage() { try { return root.localStorage || null; } catch { return null; } }

    function read() {
        const s = storage();
        const empty = { spread: null, readings: {} };
        if (!s) return empty;
        try {
            const v = JSON.parse(s.getItem(KEY) || 'null');
            if (!v || typeof v !== 'object') return empty;
            return {
                spread: v.spread && typeof v.spread === 'object' ? v.spread : null,
                readings: v.readings && typeof v.readings === 'object' && !Array.isArray(v.readings) ? v.readings : {},
            };
        } catch { return empty; }
    }

    function write(bench) {
        const s = storage();
        if (!s) return false;
        const readings = Object.fromEntries(Object.entries(bench.readings || {})
            .filter(([, r]) => r && r.story)
            .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
            .slice(0, READINGS_MAX));
        try { s.setItem(KEY, JSON.stringify({ spread: bench.spread || null, readings })); return true; } catch { return false; }
    }

    const id = chatId => String(chatId || '');
    // Strictly newer than anything stored, so the reading just saved is never the one trimmed away (two saves in
    // the same millisecond would otherwise tie, and the sort would keep the older one).
    const stamp = b => Math.max(Date.now(), ...Object.values(b.readings).map(r => (r && r.at) || 0).map(t => t + 1));

    root.EFFBench = {
        KEY,
        READINGS_MAX,
        read,
        getSpread: () => read().spread,
        saveSpread(spread) { const b = read(); b.spread = spread ? { ...spread, at: Date.now() } : null; return write(b); },
        getReading: chatId => read().readings[id(chatId)] || null,
        // The app's own copy, already dressed (and carrying any edits made on the paper).
        saveReading(chatId, story) { const b = read(); b.readings[id(chatId)] = { story, dressed: true, at: stamp(b) }; return write(b); },
        // The parent's copy, straight from the model, for when nobody is left to receive it.
        storePendingReading(chatId, story, opts) { const b = read(); b.readings[id(chatId)] = { story, opts, dressed: false, at: stamp(b) }; return write(b); },
        dropReading(chatId) { const b = read(); delete b.readings[id(chatId)]; return write(b); },
    };
})(globalThis);
