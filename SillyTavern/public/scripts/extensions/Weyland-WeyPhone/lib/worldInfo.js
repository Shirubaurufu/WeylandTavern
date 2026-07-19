/**
 * @param {Array<{key?: string[], content?: string, disable?: boolean, constant?: boolean}>} entries
 * @param {Array<{role: string, content: string}>} history
 */
export function scanEntries(entries, history) {
    const text = history.map(m => m.content ?? '').join('\n').toLowerCase();
    const matched = entries.filter(entry => {
        if (entry.disable) return false;
        if (entry.constant) return true;
        const keys = entry.key ?? [];
        return keys.some(key => typeof key === 'string' && key.length > 0 && text.includes(key.toLowerCase()));
    });
    return matched.map(entry => entry.content).filter(Boolean).join('\n');
}

/**
 * Builds the lorebook scan input for a phone reply. This intentionally includes the newest
 * unanswered user message (and every earlier message in the queued burst); prompt history is
 * split separately by the caller. Returning a new array prevents any scanner from mutating the
 * live conversation log.
 * @param {Array<{role: string, content: string}>} messages
 */
export function buildPhoneWorldInfoScanHistory(messages) {
    return Array.isArray(messages) ? messages.slice() : [];
}

function normalizeCharacterIdentity(value) {
    return String(value ?? '')
        .trim()
        .replace(/^[!@]+/, '')
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

/**
 * Finds the Weyland lorebook entry that defines a cast-directory contact. Full-name aliases win;
 * a unique name-part alias supports directory names such as "Vindica Blackwood" and "Aris
 * Thorne" whose subbot entries are keyed simply "Vindica" and "Thorne". Disabled entries never
 * define a phone personality.
 * @param {{entries?: Record<string, object>}|null} book
 * @param {string} charName
 * @returns {object|null}
 */
export function findLorebookCharacterEntry(book, charName) {
    const target = normalizeCharacterIdentity(charName);
    if (!target || !book?.entries || typeof book.entries !== 'object') return null;

    const candidates = Object.values(book.entries).filter(entry => entry && !entry.disable && entry.content);
    const aliasesFor = entry => [entry.comment, ...(Array.isArray(entry.key) ? entry.key : [entry.key])]
        .map(normalizeCharacterIdentity)
        .filter(Boolean);

    const exact = candidates.filter(entry => aliasesFor(entry).includes(target));
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return exact.find(entry => normalizeCharacterIdentity(entry.comment) === target) ?? exact[0];

    const nameParts = [...new Set(target.split(' ').filter(Boolean))];
    const partMatches = candidates.filter(entry => {
        const aliases = aliasesFor(entry);
        return nameParts.some(part => aliases.includes(part));
    });
    if (partMatches.length > 1) {
        // Weyland subbot entries conventionally carry an explicit !Name trigger. Ordinary lore
        // may also mention a character as a scan keyword (for example Mama's Den is keyed to
        // "Zora"), so prefer one unique explicit subbot trigger before declaring the name
        // ambiguous.
        const explicitSubbotMatches = partMatches.filter(entry => {
            const keys = Array.isArray(entry.key) ? entry.key : [entry.key];
            return keys.some(key => {
                const raw = String(key ?? '').trim();
                return raw.startsWith('!') && nameParts.includes(normalizeCharacterIdentity(raw));
            });
        });
        if (explicitSubbotMatches.length === 1) return explicitSubbotMatches[0];
    }
    return partMatches.length === 1 ? partMatches[0] : null;
}

export async function resolveLorebookContactProfile({ loadWorldInfo, charName, lorebookName = 'Weyland' }) {
    const book = await loadWorldInfo(lorebookName);
    const entry = findLorebookCharacterEntry(book, charName);
    if (!entry) return null;
    return {
        charName,
        personalityText: String(entry.content ?? '').trim(),
    };
}

/**
 * Tethered mode: use SillyTavern's real World Info scan engine, unmodified — this reflects
 * whatever World Info is currently globally active (the main chat's linked books) as-is.
 *
 * The real `getWorldInfoPrompt(chat, maxContext, isDryRun, globalScanData)` delegates to
 * `checkWorldInfo` which builds a `new WorldInfoBuffer(chat, globalScanData)` — that
 * constructor expects `chat` to be a plain `string[]`, ordered newest-message-first (depth 0
 * = most recent), and its `#initDepthBuffer` calls `.trim()` directly on each element.
 * WeyPhone's own `history` convention is an array of `{role, content}` objects, oldest-first,
 * so it must be converted at this boundary before being handed to the real function —
 * mirroring how SillyTavern's own core code prepares the same argument
 * (`public/script.js`): `coreChat.map(x => x.mes).reverse()`.
 *
 * `getWorldInfoPrompt` is called with `isDryRun` hardcoded to `false` (not `true`) because a real
 * dry-run scan misses already-active sticky/cooldown entries, which would make this tethered view
 * inaccurate. The tradeoff is that a `false` scan runs the real `checkTimedEffects`/
 * `setTimedEffectOfType` machinery in `public/scripts/world-info.js`, which reads/writes sticky
 * and cooldown bookkeeping directly on the shared, global `chatMetadata.timedWorldInfo` object —
 * even though only a synthetic, throwaway history array was scanned. Left unguarded, every
 * phone-app tethered scan would silently advance the REAL main chat's WI timed-effect state
 * (blocking a real keyword match from firing on cooldown, or anchoring a sticky window to
 * phone-scan timing) and that corruption would persist to disk on the next autosave. When a
 * `chatMetadata` object is supplied, this snapshots `chatMetadata.timedWorldInfo` immediately
 * before the scan and restores it immediately after (via `finally`, so it's restored even if the
 * scan throws) — this is local, synchronous computation, so the snapshot/restore window is as
 * tight as it can be. Restoration preserves the identity of the `chatMetadata` object itself
 * (it reassigns the `timedWorldInfo` property in place rather than replacing `chatMetadata`), so
 * any code holding a reference to `chatMetadata` keeps seeing the restored value. It does NOT
 * preserve the identity of the pre-scan `timedWorldInfo` value: that is restored from a
 * `structuredClone` snapshot, so a caller holding a direct reference to the original
 * `timedWorldInfo` object specifically would be looking at a now-detached copy after restoration.
 * Nothing in WeyPhone holds such a reference, so this is a precision note, not a live hazard.
 * @param {{getWorldInfoPrompt: Function, history: Array<{role: string, content: string}>, maxContext: number, chatMetadata?: object}} options
 */
export async function resolveWorldInfoTethered({ getWorldInfoPrompt, history, maxContext, chatMetadata }) {
    const chatForWI = history.map(m => m.content ?? '').reverse();

    const hadTimedWorldInfo = !!chatMetadata && Object.prototype.hasOwnProperty.call(chatMetadata, 'timedWorldInfo');
    const timedWorldInfoSnapshot = hadTimedWorldInfo ? structuredClone(chatMetadata.timedWorldInfo) : null;

    try {
        // Weyland's World Info scanner honors this optional, backwards-compatible flag only for
        // the overflow *toast*. Entries are still budgeted and truncated exactly as usual. This
        // keeps a synthetic phone scan from frightening users with a warning about their real RP.
        const result = await getWorldInfoPrompt(chatForWI, maxContext, false, {
            suppressWeyPhoneOverflowAlert: true,
        });
        return {
            worldInfoBefore: result.worldInfoBefore ?? '',
            worldInfoAfter: result.worldInfoAfter ?? '',
        };
    } finally {
        if (chatMetadata) {
            if (hadTimedWorldInfo) {
                chatMetadata.timedWorldInfo = timedWorldInfoSnapshot;
            } else {
                delete chatMetadata.timedWorldInfo;
            }
        }
    }
}

/**
 * Untethered mode: scan only the fixed "Weyland" lorebook plus (if set) the current persona's
 * linked lorebook, using WeyPhone's own lightweight scan — entirely independent of whatever
 * World Info the main chat has selected.
 * @param {{loadWorldInfo: Function, history: Array<{role: string, content: string}>, personaLorebookName?: string, additionalBookNames?: string[]}} options
 */
export async function resolveWorldInfoUntethered({ loadWorldInfo, history, personaLorebookName, additionalBookNames = [] }) {
    const bookNames = [...new Set([
        'Weyland',
        ...(personaLorebookName ? [personaLorebookName] : []),
        ...(Array.isArray(additionalBookNames) ? additionalBookNames : []),
    ].filter(Boolean))];
    const texts = [];
    for (const name of bookNames) {
        const data = await loadWorldInfo(name);
        if (!data || !data.entries) continue;
        const entries = Object.values(data.entries);
        const scanned = scanEntries(entries, history);
        if (scanned) texts.push(scanned);
    }
    return { worldInfoBefore: texts.join('\n'), worldInfoAfter: '' };
}
