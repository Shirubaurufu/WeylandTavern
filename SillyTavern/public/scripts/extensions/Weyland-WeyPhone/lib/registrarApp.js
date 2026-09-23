import { renderRegistrar } from './ui/apps/registrar.js';
import { normalizeRegistrarFilters } from './registrarFilters.js';

/** A self-contained screen controller. Host functions keep tests and previews off real user data. */
export function createRegistrarApp(host) {
    const state = { tab: 'character', query: '', sort: 'updated', page: 0, detail: null, history: [], items: [], library: null, loading: false, busy: false, active: false, error: '', notice: '', confirm: null, tokenCost: false, settingsOpen: false, scanResult: '', autoActivateNewImports: true };
    let container;
    let root;
    let generation = 0;
    let lastLoad = 0;
    let searchTimer;
    state.pendingUpdates = [];
    state.updatingAll = false;
    const alive = () => container && root && container.contains(root);
    function draw(resetScroll = false) {
        if (!alive()) return;
        const top = container.scrollTop;
        state.filtersOpen = root.querySelector('.rg-browse-filters')?.open ?? state.filtersOpen;
        const searchInput = container.querySelector('input[type="search"]');
        const focused = searchInput === document.activeElement;
        // Re-rendering replaces the whole subtree, so the old input (and its caret position) is
        // gone - refocusing the freshly-created one is not enough, it resets the caret to 0. That
        // turned every debounced re-render mid-typing into a race: each redraw silently moved the
        // caret to the start, so the next keystroke landed at the front instead of where it was
        // typed (typing "tsun" produced "sunt"). Capture and restore the selection explicitly.
        const selectionStart = focused ? searchInput.selectionStart : null;
        const selectionEnd = focused ? searchInput.selectionEnd : null;
        renderRegistrar(container, state);
        root = container.firstElementChild;
        container.scrollTop = resetScroll ? 0 : top;
        bind();
        if (focused) {
            const freshInput = container.querySelector('input[type="search"]');
            freshInput?.focus();
            if (freshInput && selectionStart !== null) freshInput.setSelectionRange(selectionStart, selectionEnd);
        }
        if (state.confirm) root.querySelector('[data-rg-action="cancel"]')?.focus();
        if (state.tokenCost) root.querySelector('[data-rg-action="closeTokenCost"]')?.focus();
        if (state.settingsOpen) root.querySelector('[data-rg-action="closeSettings"]')?.focus();
    }
    async function load() {
        const ticket = ++generation;
        state.loading = true; state.error = ''; draw();
        const results = await Promise.allSettled([host.request('/catalog'), host.request('/library')]);
        if (ticket !== generation) return;
        const [catalog, library] = results;
        if (catalog.status === 'fulfilled') { state.items = catalog.value.items; lastLoad = Date.now(); }
        if (library.status === 'fulfilled') { state.library = library.value; state.active = host.isActive(library.value.bookName); }
        state.error = results.filter(result => result.status === 'rejected').map(result => result.reason.message).join(' ');
        state.loading = false; draw();
    }
    async function mutate(action, key, options = {}) {
        if (state.busy) return;
        // A slower catalog/library refresh must not replace the result of a new import.
        ++generation;
        state.loading = false;
        state.busy = true; state.error = ''; state.notice = ''; state.confirm = null; draw();
        try {
            const library = await host.request('/library', { action, key, ...options });
            state.library = library;
            state.pendingUpdates = state.pendingUpdates.filter(update => update.key !== key);
            await host.onLibraryChange(library, action === 'install');
            state.active = host.isActive(library.bookName);
            state.notice = {
                remove: 'Import removed. Entries shared with another import are still in your world.',
                install: 'Added to your world. This lore is now active across your Weyland roleplays.',
                activate: 'Loaded. This entry can appear in your roleplays again.',
                deactivate: 'Unloaded. Kept in your world, but won’t appear or cost tokens until loaded again.',
            }[action];
        } catch (error) { state.error = error.message; }
        finally { state.busy = false; draw(); }
    }
    async function scanForUpdates() {
        if (state.busy || state.loading) return;
        state.pendingUpdates = [];
        state.scanResult = ''; draw();
        await load();
        if (state.error) { state.scanResult = 'Could not reach the Registrar. Try again shortly.'; draw(); return; }
        const catalogByKey = new Map(state.items.map(row => [row.key, row]));
        let updated = 0, missing = 0;
        for (const source of state.library?.sources ?? []) {
            const fresh = catalogByKey.get(source.key);
            if (!fresh) { missing++; continue; }
            if (fresh.updatedAt && source.updatedAt && Date.parse(fresh.updatedAt) > Date.parse(source.updatedAt)) {
                updated++;
                state.pendingUpdates.push({ key: source.key, name: fresh.name || source.name });
            }
        }
        state.scanResult = updated
            ? `${updated} update${updated === 1 ? '' : 's'} found. Choose Update all to download and apply them, or update entries individually.`
            : missing
                ? `Catalog refreshed. ${missing} import${missing === 1 ? '' : 's'} no longer public — still kept in your world.`
                : 'Everything is up to date.';
        draw();
    }
    async function updateAll() {
        if (state.busy || state.loading || !state.pendingUpdates.length) return;
        ++generation;
        state.busy = true; state.updatingAll = true; state.error = ''; state.notice = '';
        const updates = [...state.pendingUpdates];
        const failures = [];
        let completed = 0;
        const startPaused = !state.autoActivateNewImports;
        try {
            for (const [index, update] of updates.entries()) {
                state.scanResult = `Updating ${index + 1} of ${updates.length}: ${update.name}…`; draw();
                try {
                    const library = await host.request('/library', { action: 'install', key: update.key, startPaused });
                    state.library = library;
                    // Updating must not unpause the user's whole Registrar library.
                    await host.onLibraryChange(library, false);
                    state.active = host.isActive(library.bookName);
                    state.pendingUpdates = state.pendingUpdates.filter(row => row.key !== update.key);
                    completed++;
                } catch (error) { failures.push(`${update.name}: ${error.message}`); }
            }
            state.scanResult = failures.length
                ? `${completed} of ${updates.length} updates applied. ${failures.length} failed. Choose Update all to retry the remaining updates.`
                : `All ${completed} update${completed === 1 ? '' : 's'} downloaded and applied.`;
            state.error = failures.join(' ');
        } finally { state.busy = false; state.updatingAll = false; draw(); }
    }
    function bind() {
        root.querySelector('.rg-browse-filters')?.addEventListener('toggle', event => { state.filtersOpen = event.target.open; });
        root.addEventListener('click', async event => {
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            const d = button.dataset;
            if (d.rgTab) { state.tab = d.rgTab; state.detail = null; state.history = []; state.page = 0; state.query = ''; state.notice = ''; draw(true); }
            if (d.rgOpen) { if (state.detail) state.history.push(state.detail); state.detail = d.rgOpen; state.notice = ''; draw(true); }
            if (d.rgInstall && !state.busy) {
                const item = state.items.find(row => row.key === d.rgInstall);
                const startPaused = !state.autoActivateNewImports;
                if (item?.kind === 'collection' && item.members.length > 30) {
                    state.confirm = { action: 'install', key: d.rgInstall, startPaused, message: `This collection adds ${item.members.length} people and places. Large rosters use more context in every roleplay. You can also browse its members and add a smaller selection individually.` }; draw();
                } else await mutate('install', d.rgInstall, { startPaused });
            }
            if (d.rgRemove && !state.busy) { state.confirm = { action: 'remove', key: d.rgRemove, message: 'Remove this app import from future roleplays? Shared entries stay when another import uses them. Existing chats, phone contacts and other lorebooks are kept.' }; draw(); }
            if (d.rgToggle && !state.busy) {
                const item = state.library?.items.find(row => row.key === d.rgToggle);
                if (item) await mutate(item.active === false ? 'activate' : 'deactivate', d.rgToggle);
            }
            switch (d.rgAction) {
                case 'back': state.detail = state.history.pop() || null; draw(true); break;
                case 'refresh': if (!state.busy) await load(); break;
                case 'previous': state.page--; draw(true); break;
                case 'next': state.page++; draw(true); break;
                case 'cancel': state.confirm = null; draw(); break;
                case 'confirm': { const choice = state.confirm; if (choice) await mutate(choice.action, choice.key, { startPaused: choice.startPaused }); break; }
                case 'tokenCost': state.tokenCost = true; draw(); break;
                case 'closeTokenCost': state.tokenCost = false; draw(); break;
                case 'settings': state.settingsOpen = true; draw(); break;
                case 'closeSettings': state.settingsOpen = false; draw(); break;
                case 'scanUpdates': await scanForUpdates(); break;
                case 'clearFilters':
                    state.browseFilters = normalizeRegistrarFilters(); state.filterSearch = {}; state.page = 0;
                    host.setBrowseFilters?.(state.browseFilters); draw(); break;
                case 'updateAll': await updateAll(); break;
                case 'active':
                    if (state.busy) break;
                    try { await host.setActive(state.library.bookName, !state.active); state.active = host.isActive(state.library.bookName); }
                    catch (error) { state.error = error.message; }
                    draw(); break;
            }
        });
        root.querySelector('.rg-search')?.addEventListener('submit', event => {
            event.preventDefault(); clearTimeout(searchTimer); state.query = event.target.querySelector('input').value; state.page = 0; draw();
        });
        root.querySelector('.rg-search input')?.addEventListener('input', event => {
            state.query = event.target.value; clearTimeout(searchTimer);
            searchTimer = setTimeout(() => { state.page = 0; draw(); }, 250);
        });
        root.querySelector('.rg-list-heading select')?.addEventListener('change', event => { state.sort = event.target.value; state.page = 0; draw(); });
        root.querySelector('#rg-autoload-toggle')?.addEventListener('change', event => {
            state.autoActivateNewImports = event.target.checked;
            host.setAutoActivateNewImports(state.autoActivateNewImports);
        });
        root.querySelectorAll('[data-rg-filter-search]').forEach(input => input.addEventListener('input', () => {
            state.filterSearch ||= {};
            state.filterSearch[input.dataset.rgFilterSearch] = input.value;
            input.closest('fieldset').querySelectorAll('[data-rg-filter-option]').forEach(label => {
                label.hidden = !label.textContent.toLowerCase().includes(input.value.trim().toLowerCase());
            });
        }));
        root.querySelectorAll('[data-rg-filter]').forEach(input => input.addEventListener('change', () => {
            const filters = normalizeRegistrarFilters(state.browseFilters);
            const field = input.dataset.rgFilter;
            filters[field] = input.checked ? [...new Set([...filters[field], input.value])] : filters[field].filter(value => value !== input.value);
            state.browseFilters = filters;
            host.setBrowseFilters?.(filters);
            state.page = 0;
            const id = input.id;
            draw();
            root.querySelector(`#${id}`)?.focus();
        }));
        root.addEventListener('keydown', event => {
            // The docked walkthrough remains keyboard-accessible beside Settings.
            if (root.closest('.wp-tour-active')) return;
            if (!state.confirm && !state.tokenCost && !state.settingsOpen) return;
            if (event.key === 'Escape') { event.preventDefault(); state.confirm = null; state.tokenCost = false; state.settingsOpen = false; draw(); }
            if (event.key === 'Tab') {
                const buttons = [...root.querySelectorAll('.rg-dialog button:not(:disabled), .rg-dialog input:not(:disabled), .rg-dialog select:not(:disabled), .rg-dialog summary')].filter(element => element.getClientRects().length);
                const index = buttons.indexOf(document.activeElement);
                event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
            }
        });
    }
    return {
        // Read-only navigation for the guide, using the actual catalog and library.
        showTutorialStep(step) {
            state.confirm = null;
            state.tokenCost = false;
            state.settingsOpen = step === 'settings';
            if (['welcome', 'intro', 'browse', 'search'].includes(step)) {
                if (state.tab === 'library') state.tab = 'character';
                state.detail = null;
            } else if (step === 'detail') {
                state.detail ||= root?.querySelector('[data-rg-open]')?.dataset.rgOpen || state.items[0]?.key || null;
            } else {
                state.tab = 'library'; state.detail = null; state.query = ''; state.page = 0;
            }
            draw(true);
        },
        closeTutorial() { state.settingsOpen = false; state.tokenCost = false; draw(); },
        mount(target) {
            container = target;
            state.autoActivateNewImports = host.getAutoActivateNewImports();
            state.browseFilters = normalizeRegistrarFilters(host.getBrowseFilters?.());
            renderRegistrar(container, state); root = container.firstElementChild; bind();
            if (!state.loading && !state.busy && Date.now() - lastLoad > 60_000) void load();
            else if (state.library) { state.active = host.isActive(state.library.bookName); draw(); }
        },
        back() {
            if (state.confirm) { state.confirm = null; draw(); return true; }
            if (!state.detail) return false;
            state.detail = state.history.pop() || null; draw(true); return true;
        },
    };
}
