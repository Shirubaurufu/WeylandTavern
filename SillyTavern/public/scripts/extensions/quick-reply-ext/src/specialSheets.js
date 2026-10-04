// src/specialSheets.js
//
// Cards that run their OWN system prompt (not {{getvar::ravteg}}) and open it with their own scene
// sheet: Kinsbane Manor, Mirror Weyland and Muse. Their prompts live in charper.js (Kinsbane, Muse)
// and the "Mirror" quick reply (Mirror); "Prompt Review/build-special-sheets.mjs" builds the sheets
// from the masters in "Prompt Review/Special Sheets/".
//
// What PromptOS settings mean for them (Lucky's calls, 2026-10-03):
// - The sheet ALWAYS runs. These cards need it, so the Analysis toggle and the prompt cartridges do
//   nothing here (PromptOS greys both out while one of these chats is open).
// - No narrator persona. Each has its own built-in voice, so nothing mentions a chosen narrator.
// - Roleplay Shifts (and doses and Hard Mode) DO reach them: horror shifts are made for Kinsbane and
//   Mirror. XXX() fills two chat variables that every special sheet carries:
//     {{getvar::SpecialShift}}        the feedback item, right under the sheet's "why" item 1
//     {{getvar::SpecialRecognition}}  a RECOGNITION box 0 ahead of box 1, where the model works it in
//   Both are empty with no shift, so the sheet reads exactly as written.

import { SHIFT_ROUTE_FAILED } from './promptModifiers.js';

/** Card name -> how many numbered boxes its sheet has (the RECOGNITION box is 0/N). */
export const SPECIAL_SHEET_CARDS = Object.freeze({
    'Kinsbane Manor': 15,
    'Mirror Weyland': 14,
    'Muse': 6,
});

export function specialSheetBoxes(charName) {
    return Object.hasOwn(SPECIAL_SHEET_CARDS, String(charName ?? '')) ? SPECIAL_SHEET_CARDS[charName] : 0;
}

// Beta's own box 0, reused word for word so both stay in sync when Lucky edits it in rav.js.
const BETA_RECOGNITION = /RECOGNITION \[0\/6\][\s\S]*?(?=\n\s*SPARK \[1\/6\])/;

/**
 * The shift text for a special sheet.
 * @param {object} options
 * @param {string} options.shift       the active shift name (dose included), or 'None'
 * @param {string} options.sheetItem   buildRoleplayShiftItem(...) in its scene-sheet form ("2. FEEDBACK ...")
 * @param {string} options.betaBody    rav.js Beta body, the source of the RECOGNITION box wording
 * @param {number} options.boxes       the card's box count (SPECIAL_SHEET_CARDS)
 * @param {string} [options.scope]     'restarted' | 'branched' | 'reroll' (Hard Mode)
 * @returns {{ item: string, recognition: string }}
 */
export function buildSpecialSheetShift({ shift, sheetItem, betaBody, boxes, scope = 'restarted' }) {
    const empty = { item: '', recognition: '' };
    // General-Use is Beta's built-in report and is written around Beta's own six boxes, so it has
    // nothing to point at on these sheets.
    if (!boxes || !sheetItem || !shift || shift === 'None' || shift === 'General-Use' || shift === 'Temporary') return empty;
    // Each special sheet numbers its own "why" items (Muse already has a 2.), so drop Beta's "2. ".
    const item = String(sheetItem).trim().replace(/^2\. /, '');
    const beta = String(betaBody ?? '').match(BETA_RECOGNITION)?.[0]?.trim();
    if (!beta) {
        console.warn('[WQR] Special sheet: Beta\'s RECOGNITION box was not found, so the shift goes in without its box.');
        return { item: item.replace(' Talk it through in your RECOGNITION box instead.', ''), recognition: '' };
    }
    const failed = SHIFT_ROUTE_FAILED[scope] ?? SHIFT_ROUTE_FAILED.restarted;
    const recognition = `${beta.replace('[0/6]', `[0/${boxes}]`)}\nCarry this through the whole sheet. When you decide what happens later on, think back to 0/${boxes}, ${failed}. Do better.`;
    return { item, recognition };
}
