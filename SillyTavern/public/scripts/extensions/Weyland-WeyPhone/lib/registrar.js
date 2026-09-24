import { getRequestHeaders, saveSettingsDebounced } from '../../../../script.js';
import { selected_world_info, worldInfoCache, updateWorldInfoList, loadWorldInfo } from '../../../world-info.js';
import { eventSource, event_types } from '../../../events.js';
import { getSettings } from './config.js';
import { createRegistrarApp } from './registrarApp.js';

export function createHostedRegistrar(onChanged) {
    async function setActive(name, active) {
        const index = selected_world_info.indexOf(name);
        if (active && index < 0) selected_world_info.push(name);
        if (!active && index >= 0) selected_world_info.splice(index, 1);
        // Refresh the native selector without firing its unrelated editor navigation flow.
        await updateWorldInfoList();
        saveSettingsDebounced();
        await eventSource.emit(event_types.WORLDINFO_SETTINGS_UPDATED);
    }
    return createRegistrarApp({
        async request(route, body) {
            const response = await fetch(`/api/registrar${route}`, {
                method: body ? 'POST' : 'GET', headers: getRequestHeaders(),
                ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60_000),
            });
            if (response.status === 404) throw new Error('Restart Weyland Tavern once to enable the new Registrar service, then reopen this app.');
            let data;
            try { data = await response.json(); } catch { throw new Error('The Registrar service returned an unreadable response. Please try again.'); }
            if (!response.ok) throw new Error(data.error || 'The Registrar request failed.');
            return data;
        },
        isActive: name => selected_world_info.includes(name),
        setActive,
        getAutoActivateNewImports: () => getSettings(SillyTavern.getContext().extensionSettings).registrar.autoActivateNewImports,
        getBrowseFilters: () => getSettings(SillyTavern.getContext().extensionSettings).registrar.browseFilters,
        setBrowseFilters(value) {
            const settings = getSettings(SillyTavern.getContext().extensionSettings).registrar;
            settings.browseFilters = value;
            delete settings.hideAnthroCharacters;
            saveSettingsDebounced();
        },
        setAutoActivateNewImports(value) {
            getSettings(SillyTavern.getContext().extensionSettings).registrar.autoActivateNewImports = value;
            saveSettingsDebounced();
        },
        async onLibraryChange(library, activate) {
            worldInfoCache.delete(library.bookName);
            await updateWorldInfoList();
            if (activate) await setActive(library.bookName, true);
            onChanged();
            await eventSource.emit(event_types.WORLDINFO_UPDATED, library.bookName, await loadWorldInfo(library.bookName));
        },
    });
}
