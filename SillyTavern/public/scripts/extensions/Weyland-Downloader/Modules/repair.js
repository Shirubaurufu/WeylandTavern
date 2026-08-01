export const REPAIR_CONFIRMATION_TITLE = 'Repair / Redownload Character?';
export const REPAIR_CONFIRMATION_MESSAGE = 'This redownloads the installed character card, full expression set, and bundled character lorebooks. Existing chats, WeyPhone texts, and per-chat LTM books are preserved. Changes to bundled lorebook and expression files are overwritten. Reload Weyland Tavern afterward to use updated card greetings. Continue?';

/** An up-to-date remote character can be force-fetched to repair a stale local manifest. */
export function isRepairAction(character) {
    return Boolean(character?.installed && !character?.updateAvailable && !character?.unavailableOnServer);
}

/** Keeps the terminal's final line honest for repair, partial, failure, and cancel outcomes. */
export function downloadOutcomeLabel({ repair = false, aborted = false, failedCount = 0, requestFailed = false } = {}) {
    if (aborted) return repair ? 'REPAIR ABORTED.' : 'SEQUENCE ABORTED.';
    if (requestFailed) return repair ? 'REPAIR FAILED.' : 'TRANSFER FAILED.';
    if (failedCount > 0) return repair
        ? 'REPAIR PARTIALLY COMPLETE — REVIEW FAILED FILES.'
        : 'TRANSFER PARTIALLY COMPLETE — REVIEW FAILED FILES.';
    return repair ? 'REPAIR COMPLETE.' : 'TRANSFER SEQUENCE COMPLETE.';
}
