// Vector Storage's score threshold for World Info: Weyland ships 0.45 (2026-11), down from 0.5.
//
// 0.45 is Lucky's call after the 2026-11-05 review of vectorized World Info.
// The value lives in each player's own settings.json, so changing default/content/settings.json alone only reaches
// NEW installs. This moves existing installs too, ONCE, and only if they still have the old shipped 0.5: a player who
// picked their own number keeps it, and the marker stops it from ever running again (so 0.5 picked later is respected).

export const VECTOR_THRESHOLD_OLD_DEFAULT = 0.5;
export const VECTOR_THRESHOLD_DEFAULT = 0.45;
const MARKER_KEY = 'weylandVectorDefaults';
const MARKER_ID = 'threshold-0.45-2026-11';

/**
 * @param {{ extensionSettings: Record<string, any>, saveSettingsDebounced?: () => void }} context
 * @returns {boolean} true when the threshold was moved
 */
export function moveVectorThresholdOnce(context) {
    const store = (context.extensionSettings[MARKER_KEY] ??= {});
    if (store.threshold === MARKER_ID) return false;
    store.threshold = MARKER_ID;
    const vectors = context.extensionSettings.vectors;
    const moved = !!vectors && Number(vectors.score_threshold) === VECTOR_THRESHOLD_OLD_DEFAULT;
    if (moved) vectors.score_threshold = VECTOR_THRESHOLD_DEFAULT;
    // Saved either way, so the marker sticks on installs that had nothing to move.
    context.saveSettingsDebounced?.();
    return moved;
}
