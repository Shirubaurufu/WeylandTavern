// Pure helpers behind the Downloader's bulk confirmations and its per-row download queue.
// Kept free of DOM and network so test/bulk.test.js can pin the numbers players are shown.

/** Manifest "versions" are byte sizes, so a diff entry says exactly how much a download costs. */
export function diffEntryBytes(entry) {
    if (!entry) return 0;
    let bytes = entry.updatePng ? Number(entry.version) || 0 : 0;
    for (const sub of entry.subcharacters ?? []) {
        for (const costume of sub.costumes ?? []) {
            for (const expr of costume.expressions ?? []) bytes += Number(expr.version) || 0;
        }
    }
    for (const lore of entry.lorebooks ?? []) bytes += Number(lore.version) || 0;
    return bytes;
}

/** "1.4 GB", "820 MB", "12 KB". One decimal only where it helps. */
export function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    const units = ['bytes', 'KB', 'MB', 'GB'];
    let size = value;
    let unit = 0;
    while (size >= 1000 && unit < units.length - 1) { size /= 1024; unit++; }
    if (unit === 0) return `${Math.round(size)} ${units[0]}`;
    return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

/**
 * What a bulk action is about to do, for its confirmation.
 * @param {{sysName:string,name:string,installed:boolean,updateAvailable:boolean}[]} characters the targets
 * @param {{characters?: any[]}|null} pendingDiff the server's diff (manifestCache.pendingDiff)
 */
export function summarizeBulk(characters, pendingDiff) {
    const diffByName = new Map((pendingDiff?.characters ?? []).map(c => [String(c.name).toLowerCase(), c]));
    const fresh = [];
    const updates = [];
    let bytes = 0;
    let sized = 0;
    for (const char of characters) {
        (char.installed ? updates : fresh).push(char.name);
        const entry = diffByName.get(String(char.sysName).toLowerCase());
        if (entry) { bytes += diffEntryBytes(entry); sized++; }
    }
    return { total: characters.length, fresh, updates, bytes, sizeKnown: sized === characters.length && characters.length > 0 };
}

/**
 * Which of `ids` can join the queue: not already downloading and not already waiting.
 * Order is kept and duplicates inside `ids` collapse.
 */
export function admitIds(ids, activeIds, queuedJobs) {
    const busy = new Set(activeIds ?? []);
    for (const job of queuedJobs ?? []) job.ids.forEach(id => busy.add(id));
    const admitted = [];
    for (const id of ids) {
        if (!busy.has(id)) { busy.add(id); admitted.push(id); }
    }
    return admitted;
}

/**
 * The server refuses a second /download within 5 s of the last one (weyland.js rateLimits). A
 * queued job waits out whatever is left of that window instead of failing with "Please wait".
 */
export function queueDelayMs(lastStartMs, nowMs, cooldownMs = 5300) {
    if (!lastStartMs) return 0;
    return Math.max(0, cooldownMs - (nowMs - lastStartMs));
}
