import express from 'express';
import { getCatalog, publicItem } from '../registrar/catalog.js';
import { readLibrary, librarySummary, saveLibraryChange } from '../registrar/library.js';
import { startExpressionSync, expressionSyncStatus } from '../registrar/expressions.js';

/** Mounted with the existing private, CSRF-protected SillyTavern API routes. */
export function createRegistrarRouter(catalogProvider = getCatalog, syncExpressions = startExpressionSync) {
    const router = express.Router();
    router.get('/catalog', async (_request, response) => {
        try {
            const catalog = await catalogProvider();
            response.json({ items: catalog.map(item => {
                try { return publicItem(item, catalog); }
                catch { return { ...publicItem({ ...item, kind: 'unavailable' }), kind: item.kind, key: `${item.kind}:${item.id}`, members: [], unavailable: true }; }
            }), fetchedAt: new Date().toISOString() });
        } catch {
            response.status(502).json({ error: 'The Registrar could not be reached. Your imported world is still available. Try again shortly.' });
        }
    });
    router.get('/library', async (request, response) => {
        try { response.json(librarySummary(await readLibrary(request.user.directories))); }
        catch (error) { response.status(409).json({ error: error.message }); }
    });
    router.get('/expressions/status', (request, response) => {
        response.json(expressionSyncStatus(request.user.directories));
    });
    // Re-checks sprites without changing lore (the app's "Scan for updates"): fetches only missing or
    // changed images, so it is cheap when everything is current, and it backfills imports made
    // before sprites were downloaded.
    router.post('/expressions/sync', (request, response) => {
        syncExpressions(request.user.directories);
        response.json(expressionSyncStatus(request.user.directories));
    });
    router.post('/library', async (request, response) => {
        const { action, key, startPaused, overwriteEdits } = request.body || {};
        const keyPattern = ['activate', 'deactivate'].includes(action) ? /^(character|location):\d+$/ : /^(character|location|collection):\d+$/;
        if (!['install', 'remove', 'activate', 'deactivate'].includes(action) || typeof key !== 'string' || !keyPattern.test(key)) {
            return response.status(400).json({ error: 'Choose a valid Registrar entry.' });
        }
        try {
            const catalog = action === 'install' ? await catalogProvider() : [];
            const book = await saveLibraryChange(request.user.directories, action, key, catalog, { startPaused: Boolean(startPaused), overwriteEdits: overwriteEdits === true });
            // Sprites download in the background (see registrar/expressions.js); the lore is usable now.
            syncExpressions(request.user.directories);
            response.json(librarySummary(book));
        } catch (error) { response.status(409).json({ error: error.message, code: error.code }); }
    });
    return router;
}

export const router = createRegistrarRouter();
