// HelixMind retired DeepSeek and MiniMax (2026-11). The main chat connection is part of "how Weyland talks to HelixMind", so the
// swap for it lives here beside the other HelixMind rules; WeyPhone, LTM and Router each swap their own saved choices with the
// same shared helper (weyland-retired-models.js).
//
// ONCE per install: a player who connected to a HelixMind model that no longer exists would only get errors, so the saved model on
// a HelixMind connection (and on any connection profile that points at HelixMind) moves to Gemini 3.8 Flash. The marker is
// written whether or not anything needed changing, so a model picked later, after HelixMind brings these back, is never touched.
// Connections to other providers keep their model; DeepSeek through OpenRouter or its own API is not what was retired.

import { RETIRED_MODEL_SWAP_ID, RETIRED_MODEL_REPLACEMENT, isRetiredModelId } from '../../weyland-retired-models.js';

const MARKER_KEY = 'weylandRetiredModels';

/** @param {unknown} url */
function isHelixMindUrl(url) {
    return typeof url === 'string' && /helixmind/i.test(url);
}

/**
 * @param {{ extensionSettings: Record<string, any>, chatCompletionSettings?: Record<string, any>, saveSettingsDebounced?: () => void }} context
 * @returns {{ connection: boolean, profiles: number }} what was moved; both falsy/0 on a repeat run
 */
export function swapRetiredMainModels(context) {
    const result = { connection: false, profiles: 0 };
    const store = (context.extensionSettings[MARKER_KEY] ??= {});
    if (store.retiredModelSwap === RETIRED_MODEL_SWAP_ID) return result;
    store.retiredModelSwap = RETIRED_MODEL_SWAP_ID;

    // The live chat connection (Connection Profile "custom" endpoint, HelixMind's OpenAI-compatible URL)
    const live = context.chatCompletionSettings;
    if (live && isHelixMindUrl(live.custom_url) && isRetiredModelId(live.custom_model)) {
        live.custom_model = RETIRED_MODEL_REPLACEMENT;
        result.connection = true;
    }

    // Saved Connection Profiles that point at HelixMind (the shipped "HelixMind (Ratchet's API)" one, and copies the player made)
    const profiles = context.extensionSettings.connectionManager?.profiles;
    if (Array.isArray(profiles)) {
        for (const profile of profiles) {
            const helix = isHelixMindUrl(profile?.['api-url']) || /helixmind/i.test(String(profile?.name ?? ''));
            if (helix && isRetiredModelId(profile.model)) {
                profile.model = RETIRED_MODEL_REPLACEMENT;
                result.profiles++;
            }
        }
    }

    context.saveSettingsDebounced?.();
    return result;
}
