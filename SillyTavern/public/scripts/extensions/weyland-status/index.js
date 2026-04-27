import {
    DEFAULT_HEALTH_SOURCES,
    SERVICE_HEALTH_MONITORS,
    aggregateWorstLevel,
    createServiceHealthMonitor,
    healthLevelToDotClassSuffix,
    healthLevelToStateLabel,
    renderServiceHealthPanel,
} from './serviceHealthMonitor.js';

const MODULE_NAME = 'Weyland-Status-Tracker';

// --- Logging System ---
let isDebugEnabled = false;
/** When true, non-OK service detail rows can show a control to open the last API JSON. */
let isDebugDataEnabled = false;

// infoLog: Always outputs to console. Used for critical or standard lifecycle events.
const infoLog = (...msg) => console.log(`[${MODULE_NAME}]`, ...msg);

// debugLog: Only outputs if the user has checked the debug box. Used for menial UI tasks.
const debugLog = (...msg) => {
    if (isDebugEnabled) {
        console.log(`[${MODULE_NAME}]`, ...msg);
    }
};

async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.text();
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.json();
}

/**
 * Keeps `#custom_model_id` and `#model_custom_select` (SillyTavern API UI) tooltips in sync with
 * `custom-models.json`. Both elements get the same `title` string for the active custom model key.
 * Each `#model_custom_select` option whose `value` is a known id gets that entry's `description` as
 * its `title`.
 * @param {Record<string, { description?: string } | unknown>} modelsById
 */
function installCustomModelIdTitleSync(modelsById) {
    /** @type {WeakSet<HTMLElement>} */
    const wired = new WeakSet();

    const describeForKey = (key) => {
        const entry = key && Object.prototype.hasOwnProperty.call(modelsById, key) ? modelsById[key] : null;
        return entry && typeof entry === 'object' && entry !== null && 'description' in entry
            ? String(/** @type {{ description?: unknown }} */ (entry).description ?? '')
            : '';
    };

    const activeCustomModelKey = () => {
        const inp = document.getElementById('custom_model_id');
        const fromInput = inp instanceof HTMLInputElement ? inp.value.trim() : '';
        if (fromInput) return fromInput;
        const sel = document.getElementById('model_custom_select');
        if (sel instanceof HTMLSelectElement || sel instanceof HTMLInputElement) {
            return sel.value.trim();
        }
        return '';
    };

    const applyTitlesToTargets = () => {
        const desc = describeForKey(activeCustomModelKey());
        for (const id of ['custom_model_id', 'model_custom_select']) {
            const el = document.getElementById(id);
            if (!(el instanceof HTMLElement)) continue;
            if (desc) {
                el.title = desc;
            } else {
                el.removeAttribute('title');
            }
        }
    };

    const applyOptionTitlesForCustomModelSelect = () => {
        const select = document.getElementById('model_custom_select');
        if (!(select instanceof HTMLSelectElement)) return;
        const { options } = select;
        for (let i = 0; i < options.length; i++) {
            const opt = options.item(i);
            if (!opt) continue;
            const desc = describeForKey(opt.value.trim());
            if (desc) {
                opt.title = desc;
            } else {
                opt.removeAttribute('title');
            }
        }
    };

    const wireIfNeeded = (el) => {
        if (!(el instanceof HTMLElement) || wired.has(el)) return;
        wired.add(el);
        const refresh = () => applyTitlesToTargets();
        if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
            el.addEventListener('input', refresh);
            el.addEventListener('change', refresh);
        }
    };

    const tryWire = () => {
        const inp = document.getElementById('custom_model_id');
        const sel = document.getElementById('model_custom_select');
        if (inp) wireIfNeeded(inp);
        if (sel) wireIfNeeded(sel);
        applyTitlesToTargets();
        applyOptionTitlesForCustomModelSelect();
    };

    const selectObserver = new MutationObserver(() => {
        const select = document.getElementById('model_custom_select');
        selectObserver.disconnect();
        tryWire();
        selectObserver.observe(select, { childList: true, subtree: true });
    });

    const customObserver = new MutationObserver(() => {
        const custom = document.getElementById('custom_model_id');
        customObserver.disconnect();
        tryWire();
        customObserver.observe(custom, { childList: true, subtree: true });
    });

    const tryAttach = () => {
        const select = document.getElementById('model_custom_select');
        const custom = document.getElementById('custom_model_id');
        if (select && custom) {
            selectObserver.observe(select, { childList: true, subtree: true });
            customObserver.observe(custom, { childList: true, subtree: true });
        }
        else {
            requestAnimationFrame(tryAttach);
        }
    };
    tryAttach();

}

// --- SillyTavern Entry Point ---
// Module scripts run when ST injects the script; use an IIAFE so init always runs.
// If the parser is still running, wait once for DOMContentLoaded (same idea as jQuery ready).
(async () => {

    if (document.readyState === 'loading') {
        await new Promise((resolve) => {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        });
    }

    infoLog('Initializing extension...');

    const extensionFolderPath = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));

    try {
        const [settingsHtml, customModelsById] = await Promise.all([
            fetchText(`${extensionFolderPath}/settings.html`),
            fetchJson(`${extensionFolderPath}/custom-models.json`).catch((e) => {
                console.warn(`[${MODULE_NAME}] Could not load custom-models.json; custom model tooltips disabled.`, e);
                return /** @type {Record<string, unknown>} */ ({});
            }),
        ]);

        installCustomModelIdTitleSync(
            customModelsById && typeof customModelsById === 'object' ? customModelsById : {},
        );

        const extensionsSettings = document.getElementById('extensions_settings');
        if (extensionsSettings) {
            extensionsSettings.insertAdjacentHTML('beforeend', settingsHtml);
        } else {
            console.warn(`[${MODULE_NAME}] #extensions_settings not found; settings UI not mounted.`);
        }

        const WST_OPEN_SETTINGS_ATTR = 'data-wst-open-wst-settings';

        const getExtensionSettingsBlock = () =>
            document.getElementById('extensions_settings') ||
            document.getElementById('extensions_settings2') ||
            document.querySelector('[id^="extensions_settings"]');

        /**
         * SillyTavern puts extension UIs in the top “Extensions” drawer (`#rm_extensions_block`),
         * not in jQuery UI tabs. Opening it uses the same path as clicking the cubes icon
         * (`#extensions-settings-button .drawer-toggle`); that also closes other top-bar drawers
         * (e.g. User settings) per `doNavbarIconClick` in ST’s `script.js`.
         * @returns {{ status: 'already_open' } | { status: 'opened' } | { status: 'unavailable' }}
         */
        const ensureSillyTavernExtensionsTopDrawerOpen = () => {
            const block = document.getElementById('rm_extensions_block');
            if (!block) {
                return { status: 'unavailable' };
            }
            if (block.classList.contains('openDrawer')) {
                return { status: 'already_open' };
            }
            const toggle = document.querySelector('#extensions-settings-button .drawer-toggle');
            if (toggle instanceof HTMLElement) {
                toggle.click();
                return { status: 'opened' };
            }
            return { status: 'unavailable' };
        };

        const openWstSettingsDrawer = () => {
            const root = document.getElementById('wst-status-extension-root');
            if (!root) return;
            const toggle = root.querySelector('.inline-drawer-toggle');
            const content = root.querySelector('.inline-drawer-content');
            if (!toggle || !content) return;
            if (content.getBoundingClientRect().height < 2) {
                toggle.click();
            }
        };

        const navigateToWstExtensionSettings = () => {
            infoLog('Opening Weyland Status Tracker extension settings (from Service Health).');
            const extBlock = getExtensionSettingsBlock();
            const drawer = ensureSillyTavernExtensionsTopDrawerOpen();
            if (drawer.status === 'unavailable') {
                infoLog(
                    'Extensions top bar (#rm_extensions_block / #extensions-settings-button) not found; is this SillyTavern?',
                );
            }
            const scrollAndUnfold = () => {
                const wst = document.getElementById('wst-status-extension-root');
                const scrollTo =
                    wst && document.body?.contains(wst) ? wst : extBlock || null;
                if (scrollTo) {
                    scrollTo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else {
                    infoLog(
                        'Extension settings block not in DOM. Open the Extensions panel from the top bar, then use this control again.',
                    );
                }
                window.setTimeout(() => openWstSettingsDrawer(), 250);
            };
            if (drawer.status === 'opened') {
                window.setTimeout(scrollAndUnfold, 200);
            } else {
                scrollAndUnfold();
            }
        };

        const onWstOpenSettingsLinkCapture = (e) => {
            let trigger = null;
            if (typeof e.composedPath === 'function') {
                for (const n of e.composedPath()) {
                    if (n instanceof Element && n.hasAttribute(WST_OPEN_SETTINGS_ATTR)) {
                        trigger = n;
                        break;
                    }
                }
            }
            if (!trigger) {
                const t = e.target;
                if (t instanceof Node) {
                    const el = t instanceof Element ? t : t.parentElement;
                    if (el) {
                        trigger = el.closest(`[${WST_OPEN_SETTINGS_ATTR}]`);
                    }
                }
            }
            if (!trigger) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            navigateToWstExtensionSettings();
        };
        document.addEventListener('click', onWstOpenSettingsLinkCapture, true);

        // -----------------------
        // Event Binding
        // -----------------------

        const debugCheckbox = document.getElementById('wst-debug-checkbox');
        if (debugCheckbox) {
            debugCheckbox.addEventListener('change', () => {
                isDebugEnabled = debugCheckbox.checked;
                infoLog(`Debug logging ${isDebugEnabled ? 'enabled' : 'disabled'}.`);
            });
        }

        const healthRoot = document.getElementById('wst-service-health-root');
        const healthRefreshBtn = document.getElementById('wst-service-health-refresh');

        /** @type {{ lastChecked: Date | null, fetchError: string | null }} */
        const healthMeta = { lastChecked: null, fetchError: null };

        const incidentUrlForMonitor = (id) => {
            if (id === 'google-antigravity') return 'https://www.google.com/appsstatus/dashboard';
            if (id === 'cloudflare') return 'https://www.cloudflarestatus.com/';
            if (id === 'anthropic') return 'https://status.anthropic.com/';
            return 'https://health.aws.amazon.com/health/status';
        };

        const noteByMonitorId = new Map(
            DEFAULT_HEALTH_SOURCES.flatMap((src) =>
                src.monitors.map((m) => [m.id, src.note != null ? String(src.note) : null]),
            ),
        );

        const waitingSnapshot = () =>
            SERVICE_HEALTH_MONITORS.map((m) => ({
                id: m.id,
                label: m.label,
                level: 'unknown',
                sinceUnixSec: null,
                headline: null,
                incidentUrl: incidentUrlForMonitor(m.id),
                note: noteByMonitorId.get(m.id) ?? null,
                rawApiJson: null,
            }));

        let lastHealthResults = waitingSnapshot();

        const panelMeta = () => ({ ...healthMeta, showDebugData: isDebugDataEnabled });

        const debugDataCheckbox = document.getElementById('wst-debug-data-checkbox');
        if (debugDataCheckbox) {
            debugDataCheckbox.addEventListener('change', () => {
                isDebugDataEnabled = debugDataCheckbox.checked;
                if (healthRoot) {
                    renderServiceHealthPanel(healthRoot, lastHealthResults, panelMeta());
                }
            });
        }

        const PIP_DATA_ATTR = 'data-wst-aggregate-pip';
        const RM_API_BANNER_CLASS = 'wst-rm-api-aggregate-status';
        const RM_API_PIP_IN_BANNER_ATTR = 'data-wst-rm-api-aggregate-pip';

        const topBarPipTitle = (results, meta) => {
            if (meta.fetchError) {
                infoLog(`Tracked services refresh failed (${meta.fetchError})`) ;
                return 'Unable to refresh up-stream service status.';
            }
            const level = aggregateWorstLevel(results);
            const label = healthLevelToStateLabel(level);
            if (level === 'ok') {
                return 'No known issues with up-stream services.';
            }
            const atLevel = results.filter((r) => r.level === level).map((r) => r.label);
            return `One or more up-stream services may be ${label}.`;
        };

        let pipRaf = 0;
        const updateApiStatusTopPips = () => {
            const level = healthMeta.fetchError ? 'unknown' : aggregateWorstLevel(lastHealthResults);
            const suffix = healthLevelToDotClassSuffix(level);
            const title = topBarPipTitle(lastHealthResults, healthMeta);
            for (const host of document.querySelectorAll('#API-status-top')) {
                if (!(host instanceof HTMLElement)) continue;
                let pip = host.querySelector(`[${PIP_DATA_ATTR}]`);
                if (!pip) {
                    pip = document.createElement('span');
                    pip.setAttribute(PIP_DATA_ATTR, '');
                    pip.setAttribute('role', 'img');
                    host.prepend(pip);
                }
                pip.className = `wst-health-dot wst-aggregate-pip wst-health-dot--${suffix}`;
                pip.title = title;
                pip.setAttribute('aria-label', title);
            }

            for (const block of document.querySelectorAll('#rm_api_block')) {
                if (!(block instanceof HTMLElement)) continue;
                let banner = block.querySelector(`.${RM_API_BANNER_CLASS}`);
                if (!banner) {
                    banner = document.createElement('div');
                    banner.className = `${RM_API_BANNER_CLASS} wst-rm-api-aggregate-status--${suffix}`;
                    banner.setAttribute('role', 'status');

                    const pipRm = document.createElement('span');
                    pipRm.setAttribute(RM_API_PIP_IN_BANNER_ATTR, '');
                    pipRm.setAttribute(PIP_DATA_ATTR, '');
                    pipRm.setAttribute('role', 'img');
                    const textEl = document.createElement('span');
                    textEl.className = 'wst-rm-api-aggregate-status__text';
                    const openSettingsBtn = document.createElement('button');
                    openSettingsBtn.type = 'button';
                    openSettingsBtn.setAttribute(WST_OPEN_SETTINGS_ATTR, '');
                    openSettingsBtn.className = 'wst-rm-api-aggregate-status__link';
                    openSettingsBtn.textContent = 'Service Health';
                    openSettingsBtn.setAttribute('aria-label', 'Open Weyland Status Tracker in extension settings');

                    banner.append(pipRm, textEl, openSettingsBtn);
                    block.prepend(banner);
                } else {
                    if (block.firstElementChild !== banner) {
                        block.prepend(banner);
                    }
                    banner.className = `${RM_API_BANNER_CLASS} wst-rm-api-aggregate-status--${suffix}`;
                }

                const pipRm = banner.querySelector(`[${RM_API_PIP_IN_BANNER_ATTR}]`);
                const textEl = banner.querySelector('.wst-rm-api-aggregate-status__text');
                if (pipRm) {
                    pipRm.className = `wst-health-dot wst-aggregate-pip wst-health-dot--${suffix}`;
                    pipRm.title = title;
                    pipRm.setAttribute('aria-label', title);
                }
                if (textEl) {
                    textEl.textContent = title;
                }
            }
        };

        const scheduleUpdateApiStatusTopPips = () => {
            if (pipRaf) return;
            pipRaf = requestAnimationFrame(() => {
                pipRaf = 0;
                updateApiStatusTopPips();
            });
        };

        if (document.body) {
            const pipObserver = new MutationObserver(() => {
                scheduleUpdateApiStatusTopPips();
            });
            pipObserver.observe(document.body, { childList: true, subtree: true });
        }
        updateApiStatusTopPips();

        if (healthRoot) {
            healthRoot.addEventListener('click', (e) => {
                const t = e.target;
                if (!(t instanceof Element)) return;
                const btn = t.closest('.wst-health-raw-data-btn');
                if (!btn || !healthRoot.contains(btn)) return;
                e.preventDefault();
                const id = btn.getAttribute('data-wst-service');
                if (!id) return;
                const r = lastHealthResults.find((x) => x.id === id);
                if (!r?.rawApiJson) return;
                const blob = new Blob([r.rawApiJson], { type: 'application/json' });
                const u = URL.createObjectURL(blob);
                const w = globalThis.open(u, '_blank', 'noopener,noreferrer');
                if (w) {
                    setTimeout(() => {
                        URL.revokeObjectURL(u);
                    }, 10_000);
                } else {
                    URL.revokeObjectURL(u);
                }
            });
        }

        const monitor = createServiceHealthMonitor({
            onUpdate(results) {
                lastHealthResults = results;
                healthMeta.lastChecked = new Date();
                healthMeta.fetchError = null;
                if (healthRoot) {
                    renderServiceHealthPanel(healthRoot, results, panelMeta());
                }
                updateApiStatusTopPips();
            },
        });

        if (healthRoot) {
            renderServiceHealthPanel(healthRoot, lastHealthResults, panelMeta());
        }

        monitor.start();

        if (healthRoot && healthRefreshBtn) {
            healthRefreshBtn.addEventListener('click', async () => {
                healthRefreshBtn.disabled = true;
                healthRefreshBtn.classList.add('wst-health-refresh--busy');
                debugLog('Manual service health refresh requested.');
                try {
                    await monitor.refresh();
                } catch (e) {
                    healthMeta.fetchError = e instanceof Error ? e.message : String(e);
                    renderServiceHealthPanel(healthRoot, lastHealthResults, panelMeta());
                    updateApiStatusTopPips();
                    infoLog('Manual service health refresh failed:', e);
                } finally {
                    healthRefreshBtn.disabled = false;
                    healthRefreshBtn.classList.remove('wst-health-refresh--busy');
                }
            });
        }

        infoLog('Initialization complete.');
    } catch (err) {
        console.error(`[${MODULE_NAME}] Failed to load extension files:`, err);
    }
})();
