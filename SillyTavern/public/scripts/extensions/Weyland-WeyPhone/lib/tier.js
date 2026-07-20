// lib/tier.js

// Paw Patrol tier detection — the platform stores enrollment as global variables set by the
// welcome panel's monthly-code flow (see public/scripts/welcomeinfo.js): PP1 = Plus (beta key),
// PPP1 = Platinum (alpha key), both the string 'true' when enrolled. Same raw-global-read
// convention as quick-reply-ext/src/general.js. Honor-system flags, not secure entitlements —
// consistent with how the rest of the platform treats them.

function varTruthy(value) {
    return value === true || value === 'true';
}

/**
 * @param {{variables?: {global?: {get: (key: string) => unknown}}}} context SillyTavern.getContext()
 * @returns {{plus: boolean, platinum: boolean}}
 */
export function getTier(context) {
    const get = key => context?.variables?.global?.get?.(key);
    return { plus: varTruthy(get('PP1')), platinum: varTruthy(get('PPP1')) };
}

/**
 * Whether a registry app should be visible for this tier. Apps without a tierGated field are
 * visible to everyone; tierGated: 'any' needs Plus OR Platinum; 'platinum' needs Platinum.
 * @param {{tierGated?: 'any'|'platinum'|null}} app
 * @param {{plus: boolean, platinum: boolean}} tier
 */
export function appVisibleForTier(app, tier) {
    if (!app.tierGated) return true;
    if (app.tierGated === 'platinum') return tier.platinum;
    return tier.plus || tier.platinum;
}
