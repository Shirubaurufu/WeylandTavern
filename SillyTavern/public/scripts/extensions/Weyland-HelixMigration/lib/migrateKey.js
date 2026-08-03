// lib/migrateKey.js
//
// Automatic API-key exchange against the WeylandDashboard swap endpoint.
// Shared by the migration popup (index.js) and the temporary API-screen converter.
//
// Client contract (Josh, confirmed 2026-07-30):
//   POST https://keys.weybooru.com/swap   body: { "oldKey": "<value>" }   (only that field)
//     HTTP 200  { "newKey": "helix-..." }   -> success
//     non-200   { "error":  "<message>" }   -> failure (message is user-safe, on-brand)
//
// The endpoint has per-IP exponential backoff, so callers must fire exactly ONE request
// per explicit user action — never retry loops or polling.

export const MIGRATE_ENDPOINT = 'https://keys.weybooru.com/swap';

/**
 * @typedef {{ ok: true, newKey: string }
 *   | { ok: false, status: number|null, error: string }} ExchangeResult
 */

/**
 * Exchange an old key for the user's new one. Never throws — network/CORS failures come
 * back as `{ ok: false, status: null }` so the caller can render one consistent path.
 * @param {string} oldKey the current HMKey value
 * @param {typeof fetch} [fetchFn] injectable for tests
 * @returns {Promise<ExchangeResult>}
 */
export async function exchangeKey(oldKey, fetchFn = fetch) {
    let response;
    try {
        response = await fetchFn(MIGRATE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldKey }),
        });
    } catch {
        // No readable HTTP response — offline, DNS, or (most often) the browser blocking the
        // response because keys.weybooru.com sent no CORS headers for this origin. Logged to
        // help diagnose; the user just sees a friendly message and the ticket/manual buttons.
        console.warn('[HelixMigration] /swap failed before a readable response — possible CORS/preflight or network issue.');
        return {
            ok: false,
            status: null,
            error: 'Could not reach the update service. Please check your connection and try again.',
        };
    }

    let body = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }

    if (response.ok && body && typeof body.newKey === 'string' && body.newKey.trim() !== '') {
        return { ok: true, newKey: body.newKey.trim() };
    }

    const error = (body && typeof body.error === 'string' && body.error.trim() !== '')
        ? body.error.trim()
        : 'The key update could not be completed. Please open a ticket for help.';
    return { ok: false, status: response.status, error };
}
