// src/doseRules.js
//
// The pure rules behind PromptOS's "A dose of..." (see src/dose.js for the feature and its state).
// No imports on purpose, so WeyPhone's Node tests can exercise the counting and the dice without
// loading SillyTavern.

// Leans short, as agreed with Lucky: 3-5 replies are most common, a 9 or 10 is rare but possible.
// Hard Mode is dosed on the same dice as everything else.
export const DOSE_LENGTH_WEIGHTS = Object.freeze({ 2: 10, 3: 14, 4: 14, 5: 13, 6: 11, 7: 9, 8: 7, 9: 5, 10: 4 });

/** @param {() => number} [random] */
export function rollDoseLength(random = Math.random) {
    const entries = Object.entries(DOSE_LENGTH_WEIGHTS);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = random() * total;
    for (const [length, weight] of entries) {
        roll -= weight;
        if (roll < 0) return Number(length);
    }
    return Number(entries[entries.length - 1][0]);
}

/**
 * What one generation does to a dose. Each NEW character reply uses one; a reroll, regenerate or
 * continue redoes the reply in front of you, so it keeps that reply's state and uses nothing up
 * (otherwise spamming reroll would burn through the dose). Right after a dose starts (used 0), a
 * reroll doses the reply in front of you, and that counts as the first one. Quiet generations
 * (WeyPhone texting etc.) and impersonation don't touch it.
 * @param {{used: number, total: number}} state
 * @param {string} type Generate() type
 * @returns {{live: boolean, used: number, ended: boolean} | null} null = leave everything as is
 */
export function nextDoseState({ used, total }, type) {
    const kind = String(type || "normal");
    if (kind === "quiet" || kind === "impersonate") return null;
    if (["swipe", "regenerate", "continue"].includes(kind)) {
        return { live: true, used: Math.max(used, 1), ended: false };
    }
    if (used < total) return { live: true, used: used + 1, ended: false };
    return { live: false, used, ended: true };
}
