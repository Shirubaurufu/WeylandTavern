// HelixMind sampler guard (Lucky, 2026-10-17)
// ============================================
// WHAT: every chat request going to HelixMind leaves with Weyland's shipped values for frequency penalty,
// presence penalty and token probabilities, whatever the player's settings say.
//
// WHY: WT ships explicitly tuned settings, and no HelixMind user needs to change these. Changed values are
// invisible to the player (they sit in panels most people never open) and cost real troubleshooting time.
// The case that started this, a player's GLM-5 on 2026-10-17:
//   - replies came back garbled: words run together, stray Chinese tokens mid-English, leaked </think>.
//     Cause: frequency_penalty 1. It penalises every token the model has already used, and the most-used
//     tokens are spaces and punctuation, so the model starts avoiding them and reaches for rare tokens.
//   - roughly every other reply failed with "internal server error" and 0 output.
//     Contributing cause: logprobs 5 ("Request token probabilities"). Many GLM providers reject it.
// Neither is a WeyTav or SillyTavern default; he had changed them long ago and forgotten. Sonnet and Gemma
// shrugged the same settings off, which is why it looked like "only GLM is broken for me".
//
// HOW, and why this way:
// - It edits the outgoing request (CHAT_COMPLETION_SETTINGS_READY, wired in index.js), never the saved
//   settings. Bad values often arrive via an imported preset or an old install, so rewriting settings files
//   would be invasive and still miss the next import. Fixing the request covers every install at once,
//   already-broken ones included, and stops the moment this file is removed.
// - Only HelixMind is touched. A player's own provider (OpenRouter key, local model) is theirs to tune.
// - Cost: a URL check, two comparisons, two deletes and one short regex over the Additional Parameters text.
//   Microseconds per message; it never reads the chat messages, so chat length doesn't matter.
//
// 2026-10-18 UPDATE: HelixMind's backend dev (Kenne) asked us to send ONLY temperature (plus the essentials: model,
// messages, max_tokens, stream) and nothing else. Their side already deletes unsupported sampler fields before they
// reach the upstream provider, "but sometimes we might forget to configure it for some models", and newer models
// reject them outright (Gemma 4 failed most requests because of `stop`; most current models refuse a custom
// temperature/top_p/penalties at all). So the guard now REMOVES the whole set instead of resetting penalties to 0:
// an absent field can't be rejected, whereas a "0" still counts as a custom value to a strict upstream. Removal also
// goes through `custom_exclude_body` (the server deletes those keys from the FINAL body, after Additional Parameters
// are merged), because stop strings in Additional Parameters are a multi-line YAML list that can't be cut safely line by line.
//
// The matching UI change is in style.css (the "Request token probabilities" checkbox is hidden).
// Debugging a player's request: browser dev tools > Network > `generate` > Request payload. Note that the
// Transferred/Size columns are the REPLY; the request's size is Content-Length under Request Headers.

// Weyland's HelixMind endpoint is https://helixmind.online/v1; matched loosely so a mirror or path change still counts.
const HELIXMIND_URL = /helixmind/i;

// Request fields that HelixMind should never receive from us. Each one is something a strict upstream can reject:
// penalties/top_p (many current models refuse any custom value), `stop` (Gemma 4 failed on it, and a player's
// `</think>` stop string cut GLM-5 off instantly), `logprobs`/`top_logprobs` ("Request token probabilities", rejected by
// many GLM providers), `logit_bias` and `seed`. top_k is never sent for a Custom source by openai.js, but a player can
// add it in Additional Parameters, so it is listed too. Kept on purpose: temperature, model, messages, max_tokens, stream
// and reasoning_effort (that one is a real feature switch, not a sampler).
// test/helixRequestDefaults.test.js still checks the shipped settings.json values for the two penalties, as a tripwire:
// if we ever ship non-zero ones, someone should notice this guard throws them away.
const ROUTINE_FIELDS = new Set(['top_p', 'top_k', 'seed', 'logit_bias']);
const REMOVED_FIELDS = Object.freeze([
    'frequency_penalty', 'presence_penalty', 'top_p', 'top_k', 'stop', 'logit_bias', 'seed', 'logprobs', 'top_logprobs',
]);

// Additional Parameters ("Include Body Parameters", custom_include_body) is free YAML that the server merges into
// the request AFTER the fields above (chat-completions.js, mergeObjectWithYaml), so anything typed there would
// silently win over this guard. stripForbiddenKeys below removes those keys from the box text. Added after Codex's
// smoke test (2026-10-18) showed the first version only handled one-line entries and a plain "- key" exclude list.
const FORBIDDEN_KEY = new RegExp(`^(["']?)(?:${REMOVED_FIELDS.join('|')})\\1$`);

/**
 * Removes forbidden keys from an Additional Parameters box, whatever shape the YAML is in:
 * - "key: value" lines, with or without a leading "- " and with quoted keys;
 * - block values: a key whose list or map continues on the following lines ("stop:" then "- a", or "- stop:" then
 *   "  - a") is removed together with that continuation, so no orphan list lines are left behind;
 * - flow style: a whole-box JSON/flow map ("{ "stop": [...] }") is parsed as JSON and the keys deleted.
 * Anything it cannot read is returned untouched (the exclude list below is the second net for those).
 * @param {string} text
 * @returns {string}
 */
export function stripForbiddenKeys(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                let touched = false;
                for (const key of REMOVED_FIELDS) if (key in parsed) { delete parsed[key]; touched = true; }
                return touched ? JSON.stringify(parsed) : text;
            }
        } catch { /* not JSON: fall through to the line scanner, which will most likely leave it alone */ }
    }
    const lines = text.split(/(?<=\n)/);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const match = /^([ \t]*)(-[ \t]+)?([^:#\r\n]+?)[ \t]*:(.*)$/.exec(lines[i].replace(/\r?\n$/, ''));
        if (!match || !FORBIDDEN_KEY.test(match[3].trim())) { out.push(lines[i]); continue; }
        const indent = match[1].length;
        const isListItemKey = Boolean(match[2]);
        // Skip the continuation: blank lines, comments, anything indented deeper than this entry, and (for a plain
        // "key:" whose list sits at the same indent) "- item" lines at that indent.
        // Blank and comment lines only count as part of the block when another continuation line follows them;
        // otherwise they belong to whatever comes next (a comment after the block must survive).
        for (;;) {
            let k = i + 1;
            while (k < lines.length && (!lines[k].trim() || /^[ \t]*#/.test(lines[k]))) k++;
            if (k >= lines.length) break;
            const bare = lines[k].replace(/\r?\n$/, '');
            const nextIndent = /^[ \t]*/.exec(bare)[0].length;
            const continues = nextIndent > indent || (!isListItemKey && nextIndent === indent && /^[ \t]*-([ \t]|$)/.test(bare));
            if (!continues) break;
            i = k;
        }
    }
    return out.join('');
}


/**
 * Is this request headed to HelixMind? (Weyland's HelixMind connection is a Custom chat-completion source.)
 * @param {object} data The chat-completion request body (openai.js generate_data)
 * @returns {boolean}
 */
export function isHelixMindRequest(data) {
    return Boolean(data) && data.chat_completion_source === 'custom' && HELIXMIND_URL.test(String(data.custom_url ?? ''));
}

/**
 * Adds the removed fields to `custom_exclude_body` (Exclude Body Parameters; the server deletes those keys from the final
 * request, after Additional Parameters are merged). The server accepts a list, a map or a single key there, so each
 * shape gets the keys added in its own syntax; a box that isn't one of those is left exactly as typed, because
 * mixing syntaxes would make the whole box fail to parse and exclude nothing (the player's own entries included).
 * Comment and blank lines are ignored when deciding the shape.
 * @param {string} existing Current text of the box
 * @returns {string|null} New text, or null to leave the box alone
 */
function withExcludedFields(existing) {
    const text = String(existing ?? '');
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    const meaningful = lines.filter(line => !/^\s*#/.test(line));
    const unquote = value => value.trim().replace(/^["']|["']$/g, '');

    // Empty (or comments only): a plain list.
    if (!meaningful.length) return [...lines, ...REMOVED_FIELDS.map(key => `- ${key}`)].join('\n');

    // Flow list on one line: "[a, b]".
    const flat = meaningful.join(' ').trim();
    if (meaningful.length === 1 && /^\[.*\]$/.test(flat)) {
        const have = new Set(flat.slice(1, -1).split(',').map(unquote).filter(Boolean));
        const missing = REMOVED_FIELDS.filter(key => !have.has(key));
        if (!missing.length) return null;
        const inner = flat.slice(1, -1).trim();
        return [...lines.filter(line => /^\s*#/.test(line)), `[${[inner, ...missing].filter(Boolean).join(', ')}]`].join('\n');
    }

    // Block list: every meaningful line is "- key".
    if (meaningful.every(line => /^\s*-\s/.test(line))) {
        const have = new Set(meaningful.map(line => unquote(line.replace(/^\s*-\s*/, ''))));
        const missing = REMOVED_FIELDS.filter(key => !have.has(key));
        if (!missing.length) return null;
        return [...lines, ...missing.map(key => `- ${key}`)].join('\n');
    }

    // Map: every meaningful line is "key: value" at column 0 (nested maps and anything indented are not handled).
    if (meaningful.every(line => /^[^\s#-][^:]*:/.test(line))) {
        const have = new Set(meaningful.map(line => unquote(line.slice(0, line.indexOf(':')))));
        const missing = REMOVED_FIELDS.filter(key => !have.has(key));
        if (!missing.length) return null;
        return [...lines, ...missing.map(key => `${key}: null`)].join('\n');
    }

    // A single bare key ("reasoning_effort"): the server reads it as a string, so turn it into a list of two or more.
    if (meaningful.length === 1 && /^[^\s:#\[\]{}-][^:#\[\]{},]*$/.test(flat)) {
        return [...lines.filter(line => /^\s*#/.test(line)), `- ${unquote(flat)}`, ...REMOVED_FIELDS.filter(key => key !== unquote(flat)).map(key => `- ${key}`)].join('\n');
    }
    return null;
}

/**
 * Strips everything but the essentials from a HelixMind request. Mutates `data` in place, which is how
 * CHAT_COMPLETION_SETTINGS_READY listeners change what gets sent.
 * @param {object} data The chat-completion request body
 * @returns {string[]} The fields that were removed or edited (empty when nothing was there, or not HelixMind). index.js
 *   logs them to the console, so "why did my top_p do nothing?" has an answer.
 */
export function applyHelixMindDefaults(data) {
    if (!isHelixMindRequest(data)) return [];
    const changed = [];
    for (const key of REMOVED_FIELDS) {
        if (!(key in data)) continue;
        // Only report what a player would plausibly have set by hand. top_p, seed and the like are always present
        // (or just defaults), and logging them on every message would be noise; `logprobs: false` / 0 asks for nothing.
        if (!ROUTINE_FIELDS.has(key) && data[key] && !(Array.isArray(data[key]) && !data[key].length)) changed.push(key);
        delete data[key];
    }
    if (typeof data.custom_include_body === 'string' && data.custom_include_body) {
        const cleaned = stripForbiddenKeys(data.custom_include_body);
        if (cleaned !== data.custom_include_body) {
            data.custom_include_body = cleaned;
            changed.push('custom_include_body');
        }
    }
    // Last line of defence: whatever is still inside Additional Parameters (stop strings, a top_k) is cut from the
    // final body by the server, after it merges that box in.
    const exclude = withExcludedFields(data.custom_exclude_body);
    if (exclude !== null) data.custom_exclude_body = exclude;
    return changed;
}
