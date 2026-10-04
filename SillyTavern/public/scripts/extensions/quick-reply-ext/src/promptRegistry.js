// The prompt table every consumer reads (quick-reply-ext's XXX, WeyPhone's phone requests, the tests).
//
// rav.js is regenerated upstream from FFFox's and Shiru's plaintext master, so anything added INSIDE it is wiped by their next
// re-encode (that is exactly what removed Sam, Sofya and Tawny from the 09-23 handoff). Mini is ours, so it is registered here,
// from its own file, and rav.js stays byte-identical to upstream.
//
// Mini is built from Beta's section markers. If upstream moves one, createMiniPrompt throws: that must cost us the Mini choice, not
// the whole extension (a throw at import time would stop quick-reply-ext from loading at all). resolvePromptChoice() sends a choice
// that has no entry back to Current, so a Mini that failed to build simply is not selectable.
import { ravs } from './rav.js';
import { createMiniPrompt } from './miniPrompt.js';

/** @returns {boolean} whether Mini is available after the call */
export function registerMiniPrompt(table = ravs) {
    if (table.has('Mini Prompt')) return true;
    try {
        table.set('Mini Prompt', createMiniPrompt(table.get('Beta Prompt')));
        return true;
    } catch (error) {
        console.error('[WQR] Mini Prompt could not be built from Beta\'s sections, so it is unavailable until the markers are fixed.', error);
        return false;
    }
}

registerMiniPrompt();

export { ravs };
