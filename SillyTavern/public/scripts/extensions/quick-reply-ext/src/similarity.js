import { substituteParams } from "../../../../script.js";

class SimilarityFinder {
    constructor(text = "", options = {}) {
        this.options = {
            minRunLength: 3,
            minSeedWeight: 0.6,
            ...options
        };
        this._textHash = null;
        this.update(text);
    }

    /** @param {string} text */
    update(text) {
        // Skip the rebuild entirely if the text hasn't actually changed.
        // Matters here since this runs on a ~60s loop with 4 targets.
        const hash = SimilarityFinder.hashText(text);
        if (hash === this._textHash) return;
        this._textHash = hash;

        this.text = text;
        this.tokens = SimilarityFinder.tokenize(text);
        this.valueWeights = this.computeValueWeights(this.tokens);
        this.index = this.buildIndex(this.tokens);
    }

    /**
     * Fast, non-cryptographic hash (FNV-1a) just to detect "did this change".
     * @param {string} text
     */
    static hashText(text) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return `${text.length}:${hash >>> 0}`;
    }

    /**
     * @typedef {{type: "word" | "number" | "identifier" | "punct", value: string, weight: number}} token
     * @param {string} text
     * @returns {token[]}
     */
    static tokenize(text) {
        const regex = /[\p{L}\p{N}_]+|[^\s]/gu;
        const raw = text.toLowerCase().match(regex) ?? [];
        return raw.map(token => {
            if (/^[\p{L}]+$/u.test(token)) {
                return { type: "word", value: token, weight: 1.0 };
            }
            if (/^\p{N}+$/u.test(token)) {
                return { type: "number", value: token, weight: 0.8 };
            }
            if (/^[\p{L}\p{N}_]+$/u.test(token)) {
                return { type: "identifier", value: token, weight: 0.9 };
            }
            return { type: "punct", value: token, weight: 0.2 };
        });
    }

    /**
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @param {number} newMin
     * @param {number} newMax
     */
    inverseNormalizeLog(value, min, max, newMin, newMax) {
        const logMin = Math.log10(min + 1);
        const logMax = Math.log10(max);
        const logVal = Math.log10(value);

        if (logMax === logMin) return newMax;
        return newMax - (newMin + ((logVal - logMin) * (newMax - newMin)) / (logMax - logMin));
    }

    /**
     * @param {token[]} tokens
     * @returns {Map<string, number>}
     */
    computeValueWeights(tokens) {
        const counts = new Map();
        for (const token of tokens) {
            counts.set(token.value, (counts.get(token.value) ?? 0) + 1);
        }

        const weights = new Map();
        for (const token of tokens) {
            if (weights.has(token.value)) continue;
            const freqWeight = this.inverseNormalizeLog(
                counts.get(token.value), 0, tokens.length, 0, 1
            );
            weights.set(token.value, freqWeight * token.weight);
        }
        return weights;
    }

    /** @param {token} token */
    resolveWeight(token) {
        return this.valueWeights.get(token.value) ?? token.weight;
    }

    /** @param {token[]} tokens */
    applyWeights(tokens) {
        return tokens.map(token => ({ ...token, weight: this.resolveWeight(token) }));
    }

    /** @param {token[]} tokens */
    buildIndex(tokens) {
        /** @type {Map<string,number[]>} */
        const map = new Map();
        tokens.forEach((token, i) => {
            if (!map.has(token.value)) map.set(token.value, []);
            map.get(token.value).push(i);
        });
        return map;
    }

    /** @param {string} testText */
    compare(testText) {
        return this.compareTokens(SimilarityFinder.tokenize(testText));
    }

        /**
     * Same as compare(), but accepts raw (unweighted) tokens directly.
     * @param {token[]} rawTestTokens
     */
    compareTokens(rawTestTokens) {
        if (!this.index || !this.tokens) {
            throw new Error("SimilarityFinder.compareTokens() called before update() populated an index.");
        }

        const test = this.applyWeights(rawTestTokens);

        if (test.length === 0) {
            return {
                score: 0, coverage: 0, continuity: 0, order: 0,
                matchedTokens: 0, longestRun: 0, runs: []
            };
        }

        const candidates = [];
        const seen = new Set(); // dedup runs reached via multiple seeds on the same diagonal
        const seedThreshold = this.options.minSeedWeight;

        for (let t = 0; t < test.length; t++) {
            if (test[t].weight < seedThreshold) continue;
            const positions = this.index.get(test[t].value);
            if (!positions) continue;

            for (const m of positions) {
                // Extend forward
                let len = 0;
                let runWeight = 0;
                while (
                    m + len < this.tokens.length &&
                    t + len < test.length &&
                    this.tokens[m + len].value === test[t + len].value
                ) {
                    runWeight += test[t + len].weight;
                    len++;
                }

                // Extend backward — recovers leading low-weight tokens
                // (punctuation, common words) that couldn't seed a match
                // themselves but are still part of the true run.
                let backLen = 0;
                let backWeight = 0;
                while (
                    m - backLen - 1 >= 0 &&
                    t - backLen - 1 >= 0 &&
                    this.tokens[m - backLen - 1].value === test[t - backLen - 1].value
                ) {
                    backWeight += test[t - backLen - 1].weight;
                    backLen++;
                }

                const masterStart = m - backLen;
                const testStart = t - backLen;
                const length = len + backLen;

                if (length < this.options.minRunLength) continue;

                const key = `${masterStart}:${testStart}`;
                if (seen.has(key)) continue;
                seen.add(key);

                const weight = runWeight + backWeight;
                candidates.push({
                    masterStart,
                    masterEnd: masterStart + length - 1,
                    testStart,
                    testEnd: testStart + length - 1,
                    length,
                    weight,
                    density: weight / length
                });
            }
        }

        // Densest (most weight-per-token) runs win contested overlaps first.
        candidates.sort((a, b) => {
            if (b.length !== a.length) return b.length - a.length;
            if (b.density !== a.density) return b.density - a.density;
            return a.testStart - b.testStart;
        });

        const usedMaster = new Uint8Array(this.tokens.length);
        const usedTest = new Uint8Array(test.length);
        const accepted = [];

        for (const run of candidates) {
            let overlap = false;
            for (let i = 0; i < run.length; i++) {
                if (usedMaster[run.masterStart + i] || usedTest[run.testStart + i]) {
                    overlap = true;
                    break;
                }
            }
            if (overlap) continue;

            for (let i = 0; i < run.length; i++) {
                usedMaster[run.masterStart + i] = 1;
                usedTest[run.testStart + i] = 1;
            }
            accepted.push(run);
        }

        let matchedWeight = 0;
        let totalWeight = 0;
        for (const token of test) totalWeight += token.weight;
        for (const run of accepted) {
            for (let i = 0; i < run.length; i++) matchedWeight += test[run.testStart + i].weight;
        }

        const coverage = matchedWeight / totalWeight;
        const longestRun = accepted.reduce((max, r) => Math.max(max, r.length), 0);
        const continuity = accepted.reduce((sum, run) => {
            let weight = 0;
            for (let i = 0; i < run.length; i++) weight += test[run.testStart + i].weight;
            return sum + weight * weight;
        }, 0) / (totalWeight * totalWeight);

        const byTestOrder = accepted.slice().sort((a, b) => a.testStart - b.testStart);
        let inversionWeight = 0;
        let totalPairWeight = 0;
        for (let i = 0; i < byTestOrder.length; i++) {
            for (let j = i + 1; j < byTestOrder.length; j++) {
                const pairWeight = byTestOrder[i].weight * byTestOrder[j].weight;
                totalPairWeight += pairWeight;
                if (byTestOrder[j].masterStart < byTestOrder[i].masterStart) {
                    inversionWeight += pairWeight;
                }
            }
        }
        const order = totalPairWeight === 0
            ? (accepted.length === 0 ? 0 : coverage)
            : 1 - inversionWeight / totalPairWeight;

        const score = coverage * 0.65 + continuity * 0.25 + order * 0.10;

        return {
            score, coverage, continuity, order,
            matchedTokens: accepted.reduce((s, r) => s + r.length, 0),
            longestRun, runs: accepted
        };
    }

}

class Detector {
    /**
     * @param {Record<string, string | {text: string, options?: object}>} targets
     * @param {object} defaultOptions - shared SimilarityFinder options, per-target options merge on top
     */
    constructor(targets = {}, defaultOptions = {}) {
        this.defaultOptions = defaultOptions;
        /** @type {Map<string, SimilarityFinder>} */
        this.finders = new Map();

        for (const [name, config] of Object.entries(targets)) {
            const { text, options } = typeof config === "string"
                ? { text: config, options: {} }
                : { text: config.text ?? "", options: config.options ?? {} };

            this.finders.set(name, new SimilarityFinder(text, { ...defaultOptions, ...options }));
        }
    }

    /**
     * Updates (or creates) a named target's reference text.
     * No-ops internally if the text hasn't changed (see SimilarityFinder.update).
     * @param {string} name
     * @param {string} text
     * @param {object} [options] - merged into existing finder options if provided
     */
    updateTarget(name, text, options) {
        text = substituteParams(text);
        if (!this.finders.has(name)) {
            this.finders.set(name, new SimilarityFinder(text, { ...this.defaultOptions, ...options }));
            return;
        }
        const finder = this.finders.get(name);
        if (options) Object.assign(finder.options, options);
        finder.update(text);
    }

    removeTarget(name) {
        this.finders.delete(name);
    }

    /**
     * Compares one LLM output against ALL registered targets.
     * Tokenizes the output ONCE and reuses it across every finder.
     * @param {string} outputText
     * @param {{threshold?: number}} [config]
     */
    check(outputText, { threshold = 0.6 } = {}) {
        const tokens = SimilarityFinder.tokenize(outputText);
        /** @type {Record<string, ReturnType<SimilarityFinder["compareTokens"]>>} */
        const results = {};
        let highestRisk = null;

        for (const [name, finder] of this.finders) {
            const result = finder.compareTokens(tokens);
            results[name] = result;

            if (result.score >= threshold) {
                if (!highestRisk || result.score > results[highestRisk].score) {
                    highestRisk = name;
                }
            }
        }

        return {
            tooSimilar: highestRisk !== null,
            highestRisk,
            threshold,
            results
        };
    }
}

export const detector = new Detector({per: "", des: "", teg: "", pos: ""});