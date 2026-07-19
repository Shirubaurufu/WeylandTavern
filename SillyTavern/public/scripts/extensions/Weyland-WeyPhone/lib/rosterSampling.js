// lib/rosterSampling.js

/**
 * Random sample of `count` roster members, order-shuffled. Why this exists: the unified sync
 * prompt used to embed ALL 31 roster bios, and since every roster first name is a Weyland
 * lorebook key, the world-info scan activated every one of them — the WI token budget died at
 * ~68 entries per sync. Sampling ~20 keeps the scan inside budget, and rotates which characters
 * are "active" on social media each sync, which reads more alive anyway.
 *
 * `randomFn` is injectable so tests can be deterministic.
 * @template T
 * @param {T[]} roster
 * @param {number} count
 * @param {{randomFn?: () => number}} [options]
 * @returns {T[]} a new array; never mutates the input
 */
export function sampleRoster(roster, count, { randomFn = Math.random } = {}) {
    if (count >= roster.length) return [...roster];
    const shuffled = [...roster];
    // Fisher-Yates, driven by randomFn.
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(randomFn() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
}
