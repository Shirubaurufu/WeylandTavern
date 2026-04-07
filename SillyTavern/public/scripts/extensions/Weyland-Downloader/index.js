import { saveSettingsDebounced } from "../../../script.js";
import { fetchManifests, fetchKeyFile, openDownloadStream, downloadCharacters, listCharacters, listCharactersVersioned, downloadCharactersTest, manifestCache } from "./Modules/backend.js";

const { extensionSettings, renderExtensionTemplateAsync } = SillyTavern.getContext();
export const WT_DOWNLOAD_MODULE_NAME = "Weyland-Downloader";

// =========================
// ========= SETUP =========
// =========================

const extensionVersion = "1.0.0";
const extensionDirectory = '/scripts/extensions/Weyland-Downloader';

/**
 * @typedef {Object} WeylandDownloaderSettings
 * @property {boolean} debug
 * @property {boolean} autoupdate
 */

/** @type {WeylandDownloaderSettings} */
const defaultSettings = {
    debug: false,
    autoupdate: true
};

/** @type {WeylandDownloaderSettings} */
let settings = undefined;

let isDisconnected = false;
let isProcessing = false;
let downloadController = null;
let CHARACTER_DATA = [];



let currentSort = { col: 'name', asc: true };
const sortWeights = { 'release': 3, 'beta': 2, 'alpha': 1 };
let selectedCharacters = new Set();
let filteredRenderData = [];

function getSettings() {
    if (!extensionSettings[WT_DOWNLOAD_MODULE_NAME]) {
        extensionSettings[WT_DOWNLOAD_MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key in defaultSettings) {
        if (extensionSettings[WT_DOWNLOAD_MODULE_NAME][key] === undefined) {
            extensionSettings[WT_DOWNLOAD_MODULE_NAME][key] = defaultSettings[key];
        }
    }
    settings = extensionSettings[WT_DOWNLOAD_MODULE_NAME];
}

/**
 * @param {string} text
 * @param {*} error
 */
function weylandDebug(text, error) {
    if (settings === undefined) getSettings();
    if (settings?.debug) {
        if (error) {
            console.debug(`[${WT_DOWNLOAD_MODULE_NAME}] ${text}`, error);
        } else {
            console.debug(`[${WT_DOWNLOAD_MODULE_NAME}] ${text}`);
        }
    }
}

function initWeylandUI() {
    // UI INJECTION
    const uiCheckInterval = setInterval(() => {
        // @ts-ignore
        if ($('#external_import_button').length) {
            clearInterval(uiCheckInterval);

            // @ts-ignore
            if ($('#extensions_info').length && !$('#wt-nav-button').length) {
                const navHtml = `<div id="wt-nav-button" class="fa-solid fa-server interactable" title="Weyland University Roster"></div>`;
                // @ts-ignore
                $('#extensions_info').append(navHtml);
            }

            // @ts-ignore
            let $urlBtn = $('#external_import_button');
            if ($urlBtn.length) {
                let $newBtn = $urlBtn.clone(false);
                $urlBtn.replaceWith($newBtn);

                $newBtn.removeClass('fa-cloud-arrow-down')
                    .addClass('fa-server')
                    .attr('title', 'Open Weyland Roster')
                    .css('color', 'var(--rb-accent)')
                    .attr('id', 'wt-char-menu-btn');
            }

            // @ts-ignore
            $('#wt-nav-button, #wt-char-menu-btn').off('click').on('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // @ts-ignore
                $('#wt-modal-overlay').css('display', 'flex');
            });
        }
    }, 500);

    setTimeout(() => clearInterval(uiCheckInterval), 10000);
}

// =========================
// ======== RENDER =========
// =========================

// @ts-ignore
window.wt_setMobileView = function (view) {
    const container = document.getElementById('app-container');
    if (!container) return;
    container.classList.remove('show-menu', 'show-info');
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));

    if (view === 'menu') {
        container.classList.add('show-menu');
        document.querySelectorAll('.mobile-nav-btn')[0].classList.add('active');
    } else if (view === 'info') {
        container.classList.add('show-info');
        document.querySelectorAll('.mobile-nav-btn')[2].classList.add('active');
    } else {
        document.querySelectorAll('.mobile-nav-btn')[1].classList.add('active');
    }
};

async function refreshRoster(forceRebuild = false) {
    try {
        const manifests = await fetchManifests(forceRebuild);
        if (typeof manifests === 'string') {
            console.error("[Weyland-Downloader] Manifest fetch failed:", manifests);
            document.getElementById('banner-error').style.display = 'block';
            return;
        }

        const { remoteManifest, localManifest, pendingDiff } = manifests;
        const localCharNames = listCharacters(localManifest);
        const diffCharNames = listCharacters(pendingDiff);
        let charDict = {};
        let botDict = {};

        try {
            const apiRes = await fetch('https://cast.weybooru.com/data/data.json');
            if (apiRes.ok) {
                const apiData = await apiRes.json();
                if (Array.isArray(apiData.values)) {
                    const charsPair = apiData.values.find(v => Array.isArray(v) && v[0] === 'character');
                    const botsPair = apiData.values.find(v => Array.isArray(v) && v[0] === 'bot');

                    if (charsPair) charDict = charsPair[1] || {};
                    if (botsPair) botDict = botsPair[1] || {};
                }
            } else {
                console.error("[Weyland-Downloader] Fetch returned OK false! Status:", apiRes.status);
            }
        } catch (apiErr) {
            console.error("[Weyland-Downloader] Weybooru API metadata fetch failed:", apiErr);
        }

        CHARACTER_DATA = remoteManifest.characters.map(remoteChar => {
            const botId = remoteChar.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            let richHtml = `<div style="color:#666; font-style:italic;">No supplemental matrix data available.</div>`;
            const remoteNameLower = remoteChar.name.toLowerCase();

            const botInfo = Object.values(botDict).find(b => b.name?.toLowerCase() === remoteNameLower) || null;

            let charInfo = null;
            if (botInfo && typeof botInfo.charkey === 'string' && botInfo.charkey.trim() !== '') {
                const charKeyLower = botInfo.charkey.trim().toLowerCase();
                charInfo = Object.values(charDict).find(c => c.name?.toLowerCase() === charKeyLower) || null;
            } else if (!botInfo) {
                charInfo = Object.values(charDict).find(c => c.name?.toLowerCase() === remoteNameLower) || null;
            }

            let imageUrl = `https://cast.weybooru.com/images/photos/${botId}.webp`;

            if (charInfo || botInfo) {
                // Fallback custom image matching if provided later in the schema via API updates
                if (charInfo && charInfo.image) imageUrl = `https://cast.weybooru.com/images/photos/${charInfo.image}.webp`;
                else if (botInfo && botInfo.image) imageUrl = `https://cast.weybooru.com/images/photos/${botInfo.image}.webp`;

                const tagsRaw = charInfo?.tag || botInfo?.tags || botInfo?.tag || charInfo?.tags || '';
                const tags = typeof tagsRaw === 'string' ? tagsRaw : (tagsRaw.name || '');
                const summaryRaw = charInfo?.summary || botInfo?.summary || '';
                const summary = typeof summaryRaw === 'string' ? summaryRaw : (summaryRaw.name || '');

                let tagsHtml = tags ? `<div class="meta-tags">${tags.split(',').map(t => `<span class="tag-pill">${t.trim()}</span>`).join('')}</div>` : '';
                const summaryHtml = summary ? `<div class="meta-summary">${summary}</div>` : '';

                let detailsHtml = '<div class="meta-details">';

                const description = charInfo?.description || botInfo?.description || '';
                let descHtml = description ? `<div class="meta-desc">${String(description).replace(/\n/g, '<br>')}</div>` : '';

                const speciesRaw = charInfo?.species || '';
                const species = typeof speciesRaw === 'string' ? speciesRaw : (speciesRaw.name || '');
                const genderRaw = charInfo?.gender || '';
                const gender = typeof genderRaw === 'string' ? genderRaw : (genderRaw.name || '');
                const age = charInfo?.age || '';
                const height = charInfo?.height || '';
                const occupationRaw = charInfo?.occupation || '';
                const occupation = typeof occupationRaw === 'string' ? occupationRaw : (occupationRaw.name || '');
                const homeRaw = charInfo?.home || '';
                const home = typeof homeRaw === 'string' ? homeRaw : (homeRaw.name || '');

                if (species) detailsHtml += `<div class="detail-item"><span class="detail-label">Species</span><span class="detail-val" title="${species}">${species}</span></div>`;
                if (gender) detailsHtml += `<div class="detail-item"><span class="detail-label">Gender</span><span class="detail-val" title="${gender}">${gender}</span></div>`;
                if (age && age !== "??") detailsHtml += `<div class="detail-item"><span class="detail-label">Age</span><span class="detail-val" title="${age}">${age}</span></div>`;
                if (height) detailsHtml += `<div class="detail-item"><span class="detail-label">Height</span><span class="detail-val" title="${height}">${height}</span></div>`;
                if (occupation) detailsHtml += `<div class="detail-item"><span class="detail-label">Role</span><span class="detail-val" title="${occupation}">${occupation}</span></div>`;
                if (home) detailsHtml += `<div class="detail-item"><span class="detail-label">Home</span><span class="detail-val" title="${home}">${home}</span></div>`;

                detailsHtml += '</div>';
                if (detailsHtml === '<div class="meta-details"></div>') detailsHtml = '';

                richHtml = `${tagsHtml}${summaryHtml}${detailsHtml}${descHtml}`;
            }

            let status = remoteChar.zone?.toLowerCase() || 'release';
            if (status === 'standard') status = 'release';

            const isInstalled = localCharNames.includes(remoteChar.name);
            return {
                id: botId,
                sysName: remoteChar.name,
                name: charInfo?.name || botInfo?.name || remoteChar.name,
                status: status,
                version: remoteChar.version, //`v${remoteChar.version?.replace(/-/g, '.') || 'Unknown'}`,
                installed: isInstalled,
                updateAvailable: isInstalled && diffCharNames.includes(remoteChar.name),
                unavailableOnServer: false,
                serverZipName: null,
                image: imageUrl,
                richHtml: richHtml
            };
        });

        // Also check for local characters not on remote
        listCharactersVersioned(localManifest).forEach(localChar => {
            if (!CHARACTER_DATA.find(c => c.sysName === localChar.name)) {
                const botId = localChar.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                let imageUrl = `https://cast.weybooru.com/images/photos/${botId}.webp`;

                const localNameLower = localChar.name.toLowerCase();
                const botKey = Object.keys(botDict).find(k => k.toLowerCase() === localNameLower ||
                    botDict[k].name?.toLowerCase() === localNameLower);

                if (botKey && botDict[botKey] && botDict[botKey].image) {
                    imageUrl = `https://cast.weybooru.com/images/photos/${botDict[botKey].image}.webp`;
                }

                const botInfo = botKey ? botDict[botKey] : null;

                let charInfo = null;
                if (botInfo && typeof botInfo.charkey === 'string' && botInfo.charkey.trim() !== '') {
                    const charKeyLower = botInfo.charkey.trim().toLowerCase();
                    charInfo = Object.values(charDict).find(c => c.name?.toLowerCase() === charKeyLower) || null;
                } else if (!botInfo) {
                    charInfo = Object.values(charDict).find(c => c.name?.toLowerCase() === localNameLower) || null;
                }

                CHARACTER_DATA.push({
                    id: botId,
                    sysName: localChar.name,
                    name: charInfo?.name || botInfo?.name || localChar.name,
                    status: 'unknown',
                    version: localChar.version, //`v${localChar.version?.replace(/-/g, '.') || 'Unknown'}`,
                    installed: true,
                    updateAvailable: false,
                    unavailableOnServer: true,
                    serverZipName: null,
                    image: imageUrl,
                    richHtml: `<div style="color:#666; font-style:italic;">Character not found on remote server.</div>`
                });
            }
        });

        document.getElementById('banner-error').style.display = 'none';
        renderDownloader();

        const activeHoverId = document.querySelector('.char-row:hover')?.getAttribute('data-id');
        if (activeHoverId && window.innerWidth > 900) showCharacterInfo(activeHoverId);

    } catch (err) {
        console.error("[Weyland-Downloader] Fatal error during init.", err);
        const errBanner = document.getElementById('banner-error');
        if (errBanner) errBanner.style.display = 'block';
        renderDownloader();
    }
}

function getGroupIndex(char) {
    if (char.installed && char.updateAvailable) return 1;
    if (!char.installed) return 2;
    return 3;
}

function sortData() {
    filteredRenderData.sort((a, b) => {
        const groupA = getGroupIndex(a); const groupB = getGroupIndex(b);
        if (groupA !== groupB) return groupA - groupB;

        let valA = a[currentSort.col]; let valB = b[currentSort.col];
        if (currentSort.col === 'status') { valA = sortWeights[a.status]; valB = sortWeights[b.status]; }

        if (valA < valB) return currentSort.asc ? -1 : 1;
        if (valA > valB) return currentSort.asc ? 1 : -1;
        return 0;
    });
}

function updateSelectionState() {
    const count = selectedCharacters.size;
    let selectionText = `Click to Download ${count} Characters`;
    if (count === 0) {
        selectionText = `No Characters Selected`;
    } else if (count === 1) {
        const singleId = Array.from(selectedCharacters)[0];
        const char = CHARACTER_DATA.find(c => c.id === singleId);
        selectionText = `Click to Download ${char ? char.name : "Character"}`;
    }

    document.getElementById('status-bar-text').innerText = selectionText;
    document.getElementById('status-bar-total').innerText = `${filteredRenderData.length} Total`;

    const statusBar = document.getElementById('status-bar');
    if (count > 0) statusBar.classList.add('has-selection');
    else statusBar.classList.remove('has-selection');

    const selBtn = document.getElementById('btn-dl-selected');
    selBtn.style.display = count > 0 ? 'flex' : 'none';

    document.querySelectorAll('.char-row:not(.installed-uptodate)').forEach(row => {
        const charId = row.getAttribute('data-id');
        const btn = /** @type {HTMLButtonElement} */ (row.querySelector('.btn-dl'));
        if (btn) btn.disabled = count > 0 ? !selectedCharacters.has(charId) : false;
    });

    const actionableCount = filteredRenderData.filter(c => !c.installed || c.updateAvailable).length;
    
    const chkAll = /** @type {HTMLInputElement} */ (document.getElementById('chk-all'));
    chkAll.checked = (count > 0 && count === actionableCount);
    chkAll.indeterminate = (count > 0 && count < actionableCount);
}

function toggleCharacterSelection(id, isChecked) {
    if (isChecked) selectedCharacters.add(id);
    else selectedCharacters.delete(id);
    updateSelectionState();
}

function renderDownloader() {
    const listContainer = document.getElementById('character-list');
    if (!listContainer) return;

    filteredRenderData = CHARACTER_DATA.filter(char => {
        if (char.unavailableOnServer && !char.installed) return false;
        return true;
    });

    sortData();

    const allInstalled = filteredRenderData.length > 0 && filteredRenderData.every(c => c.installed && !c.updateAvailable);
    if (isDisconnected) {
        document.getElementById('banner-error').style.display = 'block';
        document.getElementById('banner-all-installed').style.display = 'none';
    } else {
        document.getElementById('banner-error').style.display = 'none';
        document.getElementById('banner-all-installed').style.display = allInstalled ? 'block' : 'none';
    }

    if (filteredRenderData.length === 0) {
        document.getElementById('list-header').style.display = 'none';
        listContainer.innerHTML = ''; return;
    } else {
        document.getElementById('list-header').style.display = 'grid';
    }

    let htmlString = ''; let currentRenderGroup = 0;

    filteredRenderData.forEach(char => {
        const charGroup = getGroupIndex(char);
        if (charGroup !== currentRenderGroup) {
            currentRenderGroup = charGroup;
            if (charGroup === 1) {
                htmlString += `<div class="installed-divider clickable-divider update-all-divider" title="Click to update all available"><div class="divider-content"><div><i class="fa-solid fa-circle-exclamation" style="color: var(--rb-warning); margin-right: 5px;"></i> Update Available</div><div class="divider-hint">(Click to Update All)</div></div></div>`;
            } else if (charGroup === 2) {
                htmlString += `<div class="installed-divider clickable-divider download-all-divider" title="Click to download all available"><div class="divider-content"><div><i class="fa-solid fa-cloud-arrow-down" style="margin-right: 5px;"></i> Available for Download</div><div class="divider-hint">(Click to Download All)</div></div></div>`;
            } else if (charGroup === 3) {
                htmlString += `<div class="installed-divider"><div class="divider-content"><div><i class="fa-solid fa-hard-drive" style="margin-right: 5px;"></i> Local Storage (Up to Date)</div></div></div>`;
            }
        }

        let isChecked = selectedCharacters.has(char.id) ? 'checked' : '';
        let checkbox = char.installed && !char.updateAvailable ? `<i class="fa-solid fa-check" style="color:#555"></i>` : `<input type="checkbox" class="char-chk" data-id="${char.id}" ${isChecked}>`;

        let dlButton;
        if (char.installed && !char.updateAvailable) {
            dlButton = `<button class="icon-btn btn-dl" disabled><i class="fa-solid fa-check"></i></button>`;
        } else if (char.status === 'unknown' || char.version === 'Unknown') {
            dlButton = `<button class="icon-btn btn-dl" disabled title="Not found on server"><i class="fa-solid fa-cloud-xmark" style="color:#555"></i></button>`;
        } else if (char.installed && char.updateAvailable) {
            dlButton = `<button class="icon-btn btn-dl" data-id="${char.id}" title="Update"><i class="fa-solid fa-rotate-right" style="color: var(--rb-warning);"></i></button>`;
        } else {
            dlButton = `<button class="icon-btn btn-dl" data-id="${char.id}" title="Download"><i class="fa-solid fa-download"></i></button>`;
        }

        let badgeClass = char.updateAvailable ? 'update' : (char.installed ? 'installed' : char.status);
        let badgeText = char.updateAvailable ? 'Update' : (char.installed ? 'Installed' : char.status);

        let rowClasses = [];
        if (char.installed && !char.updateAvailable) rowClasses.push('installed-uptodate');
        if (char.updateAvailable) rowClasses.push('has-update');

        htmlString += `
                <div class="char-row ${rowClasses.join(' ')}" data-id="${char.id}">
                    <div class="char-bg" style="background-image: url('${char.image}'), linear-gradient(#222, #111);"></div>
                    <div class="row-cell cell-checkbox">${checkbox}</div>
                    <div class="row-cell cell-name">${char.name}</div>
                    <div class="row-cell" style="display: flex; justify-content: flex-end; padding-right: 10px;"><span class="status-badge status-${badgeClass}">${badgeText}</span></div>
                    <div class="row-cell cell-actions"><button class="icon-btn btn-info" data-id="${char.id}" title="View Info"><i class="fa-solid fa-circle-info"></i></button>${dlButton}</div>
                </div>`;
    });

    listContainer.innerHTML = htmlString;

    document.querySelectorAll('.update-all-divider').forEach(div => {
        div.addEventListener('click', () => {
            const updatesOnly = filteredRenderData.filter(c => c.installed && c.updateAvailable).map(c => c.id);
            if (updatesOnly.length > 0) startTestDownload(updatesOnly);
        });
    });

    document.querySelectorAll('.download-all-divider').forEach(div => {
        div.addEventListener('click', () => {
            const downloadsOnly = filteredRenderData.filter(c => !c.installed).map(c => c.id);
            if (downloadsOnly.length > 0) startTestDownload(downloadsOnly);
        });
    });

    document.querySelectorAll('.char-row').forEach(row => {
        row.addEventListener('mouseenter', (e) => { 
            if (window.innerWidth > 900) {
                const currentTarget = /** @type {HTMLElement} */ (e.currentTarget);
                showCharacterInfo(currentTarget.getAttribute('data-id'))
            }; 
        });
        row.addEventListener('click', (e) => {
            const target = /** @type {HTMLElement} */ (e.target);
            if (target.closest('button, input')) return;
            const currentTarget = /** @type {HTMLElement} */ (e.currentTarget);
            if (window.innerWidth <= 900) showCharacterInfo(currentTarget.getAttribute('data-id'));
        });
    });

    document.querySelectorAll('.char-chk').forEach(chk => { 
        chk.addEventListener('change', (e) => {
            const target = /** @type {HTMLInputElement} */ (e.target);
            toggleCharacterSelection(target.getAttribute('data-id'), target.checked); 
        }); 
    });
    document.querySelectorAll('.btn-info').forEach(btn => { 
        btn.addEventListener('click', (e) => { 
            const currentTarget = /** @type {HTMLElement} */ (e.currentTarget);
            showCharacterInfo(currentTarget.getAttribute('data-id')); 
        }); 
    });
    document.querySelectorAll('.btn-dl:not(:disabled)').forEach(btn => { 
        btn.addEventListener('click', (e) => { 
            const currentTarget = /** @type {HTMLElement} */ (e.currentTarget);
            handleRowDownloadClick(currentTarget.getAttribute('data-id')); 
        }); 
    });

    document.getElementById('status-bar').addEventListener('click', () => {
        if (selectedCharacters.size > 0) startTestDownload(Array.from(selectedCharacters));
    });

    updateSelectionState();
}

function showCharacterInfo(id) {
    if (isProcessing) return;
    const char = CHARACTER_DATA.find(c => c.id === id);
    if (!char) return;

    document.getElementById('mika-bg').style.display = (id === 'mika') ? 'block' : 'none';
    document.getElementById('view-dl').classList.remove('active-view');
    document.getElementById('view-info').classList.add('active-view');
    document.getElementById('info-img').style.backgroundImage = `url('${char.image}'), linear-gradient(#333, #111)`;
    document.getElementById('info-name').innerText = char.name;
    document.getElementById('info-desc').innerHTML = `<div class="meta-sys">ID: ${char.id}</div>${char.richHtml}`;

    const infoDlBtn = document.getElementById('btn-info-dl');
    infoDlBtn.setAttribute('data-id', char.id);

    if (char.installed && !char.updateAvailable) {
        infoDlBtn.innerHTML = '<i class="fa-solid fa-download"></i> Redownload Character';
        infoDlBtn.style.display = settings?.debug ? 'inline-block' : 'none';
    } else {
        infoDlBtn.style.display = 'inline-block';
        if (char.updateAvailable) infoDlBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Update Character';
        else infoDlBtn.innerHTML = '<i class="fa-solid fa-download"></i> Download Character';
    }

    // @ts-ignore
    if (window.innerWidth <= 900) window.wt_setMobileView('info');
}

function showTerminal() {
    document.getElementById('view-info').classList.remove('active-view');
    document.getElementById('view-dl').classList.add('active-view');
    document.getElementById('mika-bg').style.display = 'none';
    // @ts-ignore
    if (window.innerWidth <= 900) window.wt_setMobileView('info');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function setupTerminal() {
    const term = document.getElementById('terminal-output');
    term.innerHTML = '';
    document.getElementById('progress-container').style.display = 'none';
    /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-modal')).disabled = true;
    /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-copy')).disabled = true;
    /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-ok')).disabled = true;
    return (html) => {
        term.innerHTML += `<div class="term-line">${html}</div>`;
        term.scrollTop = term.scrollHeight;
    };
}

function finishProcessing(addLine, finalMsg) {
    setTimeout(() => {
        isProcessing = false;
        downloadController = null;

        /** @type {HTMLButtonElement} */ (document.getElementById('btn-update-chars')).disabled = false;
        /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-new')).disabled = false;
        /** @type {HTMLButtonElement} */ (document.getElementById('chk-all')).disabled = false;
        /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-modal')).disabled = false;

        /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-copy')).disabled = false;
        /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-cancel')).disabled = true;
        /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-ok')).disabled = false;

        addLine(`<br><b>${finalMsg}</b>`);

        selectedCharacters.clear();
        /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('.char-chk')).forEach(c => c.checked = false);

        refreshRoster();

    }, 500);
}

// =========================
// ========= MAIN ==========
// =========================


async function addExtensionSettings() {
    const template = await renderExtensionTemplateAsync(WT_DOWNLOAD_MODULE_NAME, 'settings');
    // @ts-ignore
    $('#extensions_settings2').append(template);

    // Debug
    // @ts-ignore
    $('#weylandDownloadDebug').prop('checked', settings.debug).on('input', function () {
        // @ts-ignore
        settings.debug = !!$(this).prop('checked');
        weylandDebug(`Setting Debug: ${settings.debug}`);
        saveSettingsDebounced();
        const btnDebugWt = document.getElementById('btn-update-wt');
        if (btnDebugWt) btnDebugWt.style.display = settings.debug ? 'flex' : 'none';
    });

    // @ts-ignore
    $('#weylandOpenDownloader').on('click', async function () {
        weylandDebug("Open Downloader clicked.");
        try {
            // @ts-ignore
            $('#wt-modal-overlay').css('display', 'flex');
        } catch (err) {
            console.error("[Weyland-Downloader] Error:", err);
            // @ts-ignore
            toastr.warning("[Weyland-Downloader] Failed to open character downloader.");
        }
    });

    // Auto Update
    // @ts-ignore
    $('#weylandDownloadAuto').prop('checked', settings.autoupdate).on('input', function () {
        // @ts-ignore
        settings.autoupdate = !!$(this).prop('checked');
        weylandDebug(`Setting Debug: ${settings.autoupdate}`);
        saveSettingsDebounced();
    });
}

/**
 * @param {string} id
 */
function handleRowDownloadClick(id) {
    if (selectedCharacters.size > 0) startTestDownload(Array.from(selectedCharacters));
    else startTestDownload([id]);
}

async function startTestDownload(targetIds = []) {
    if (isProcessing || targetIds.length === 0) return;
    isProcessing = true;

    downloadController = new AbortController();
    const signal = downloadController.signal;

    /** @type {HTMLButtonElement} */ (document.getElementById('btn-update-chars')).disabled = true;
    /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-new')).disabled = true;
    /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-selected')).disabled = true;
    /** @type {HTMLInputElement} */ (document.getElementById('chk-all')).disabled = true;
    /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('.btn-dl')).forEach(btn => btn.disabled = true);
    /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('.char-chk')).forEach(chk => chk.disabled = true);

    showTerminal();

    const addLine = setupTerminal();
    const progContainer = document.getElementById('progress-container');
    const progBar = document.getElementById('progress-bar');
    const progText = document.getElementById('progress-text');
    const progTarget = document.getElementById('progress-target');

    let charList = document.getElementById('char-progress-list');
    if (!charList) {
        charList = document.createElement('div');
        charList.id = 'char-progress-list';
        progContainer.insertBefore(charList, progTarget);
    }
    charList.innerHTML = '';

    let overallProgress = {};
    const progressUIs = {};

    /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-cancel')).disabled = false;

    if (isDisconnected) {
        addLine("Connecting to Weyland Servers... <span class='term-err'>FAILED</span>");
        await sleep(500);
        finishProcessing(addLine, "ERROR: Failed to contact the Roster Service ;-;<br>Connection refused.");
        return;
    }

    addLine("Connecting to Weyland Servers... <span class='term-ok'>OK</span>");
    await sleep(500);

    const charWord = targetIds.length === 1 ? "character" : "characters";
    addLine(`Initializing server-side download for ${targetIds.length} ${charWord}...`);

    const namesArray = targetIds.map(id => {
        const char = CHARACTER_DATA.find(c => c.id === id);
        return char ? char.sysName : null;
    }).filter(n => n);

    progContainer.style.display = 'block';
    progTarget.innerHTML = `Sending Payload: ${namesArray.join(', ')}`;
    progBar.style.width = '100%';
    progText.innerText = `Awaiting API...`;

    const stream = openDownloadStream((event) => {
        console.log('[Weyland-Downloader] SSE Event:', event);
        if (event.type !== 'progress' && event.type !== 'complete') {
            addLine(`<i class="fa-solid fa-bug" style="color:yellow;"></i> Event payload: ${JSON.stringify(event)}`);
        }

        if (event.type === 'progress') {
            try {
                const characterName = String(event.character || 'Downloading...');
                const completed = Number(event.completed || 0);
                const total = Number(event.total || 0);

                overallProgress[characterName] = { completed, total };

                let idName = characterName.replace(/[^a-z0-9]/gi, '-');
                if (!progressUIs[idName]) {
                    const container = document.createElement('div');
                    container.style.marginBottom = '12px';

                    const label = document.createElement('div');
                    label.className = 'term-line';
                    label.style.fontFamily = 'monospace';
                    label.style.fontSize = '11px';
                    label.style.color = 'var(--rb-text-muted)';

                    const wrap = document.createElement('div');
                    wrap.className = 'progress-wrapper';
                    wrap.style.height = '14px';
                    wrap.style.marginBottom = '4px';

                    const bar = document.createElement('div');
                    bar.className = 'progress-fill';
                    bar.style.backgroundColor = 'var(--rb-accent)';

                    const text = document.createElement('div');
                    text.className = 'progress-text';
                    text.style.fontSize = '10px';

                    wrap.appendChild(bar);
                    wrap.appendChild(text);
                    container.appendChild(label);
                    container.appendChild(wrap);

                    charList.appendChild(container);
                    progressUIs[idName] = { label, bar, text };
                }

                const ui = progressUIs[idName];
                const charPerc = total > 0 ? (completed / total) : 0;
                ui.label.innerHTML = `[${completed}/${total}] <i class="fa-solid fa-file-arrow-down"></i> ${characterName}`;
                ui.bar.style.width = `${charPerc * 100}%`;
                ui.text.innerText = `${Math.round(charPerc * 100)}%`;

                let termLine = document.getElementById(`term-prog-${idName}`);
                if (!termLine) {
                    addLine(`<div id="term-prog-${idName}"></div>`);
                    termLine = document.getElementById(`term-prog-${idName}`);
                }
                if (termLine) {
                    if (completed >= total) {
                        termLine.innerHTML = `<i class="fa-solid fa-check" style="color:var(--rb-success); width:15px;"></i> <span style="color:#aaa;">${characterName} downloaded successfully</span> [${completed}/${total}]`;
                    } else {
                        termLine.innerHTML = `<i class="fa-solid fa-cog fa-spin" style="color:var(--rb-accent); width:15px;"></i> <span style="color:#fff;">Downloading ${characterName}...</span> [${completed}/${total}]`;
                    }
                }

                let totalCompleted = 0;
                let totalTotal = 0;
                for (let c in overallProgress) {
                    totalCompleted += overallProgress[c].completed;
                    totalTotal += overallProgress[c].total;
                }

                const overallPerc = totalTotal > 0 ? (totalCompleted / totalTotal) : 0;
                progTarget.innerHTML = `Overall API Transfer: [${totalCompleted}/${totalTotal}] Files`;
                progBar.style.width = `${overallPerc * 100}%`;
                progText.innerText = `${Math.round(overallPerc * 100)}%`;
            } catch (err) {
                console.error('[Weyland-Downloader] SSE Progress Render Error:', err, event);
            }
        } else if (event.type === 'error') {
            addLine(`<i class="fa-solid fa-xmark term-err"></i> ERROR (${event.character}): ${event.message}`);
        } else if (event.type === 'complete') {
            if (event.aborted) {
                addLine(`<i class="fa-solid fa-xmark term-err"></i> <span class="term-err">DOWNLOAD CANCELLED BY USER.</span>`);
            } else if (event.failed && event.failed.length > 0) {
                event.failed.forEach(fail => {
                    addLine(`<i class="fa-solid fa-triangle-exclamation" style="color:var(--rb-warning);"></i> FAILED: ${fail.character} - ${fail.filePath}`);
                });
            } else {
                addLine(`<span class="term-ok">Transfer sequence finalized safely.</span>`);
            }
            progContainer.style.display = 'none';
            finishProcessing(addLine, event.aborted ? "SEQUENCE ABORTED." : "TRANSFER SEQUENCE COMPLETE.");
        }
    });

    signal.addEventListener('abort', () => stream.close());

    try {
        addLine(`Transmitting handshake to backend API...`);
        const response = await downloadCharacters(namesArray);
        if (typeof response === 'string') throw new Error(response);
    } catch (err) {
        stream.close();
        if (err.message === 'ABORTED') {
            addLine(`<i class="fa-solid fa-xmark term-err"></i> <span class="term-err">DOWNLOAD CANCELLED BY USER.</span>`);
        } else {
            addLine(`<i class="fa-solid fa-xmark term-err"></i> <span class="term-err">API TRANSFER FAILED: ${err.message}</span>`);
        }
        progContainer.style.display = 'none';
        finishProcessing(addLine, signal.aborted ? "SEQUENCE ABORTED." : "TRANSFER SEQUENCE COMPLETE.");
    }
}


function bindWeylandEvents() {
    document.getElementById('btn-close-modal').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isProcessing) document.getElementById('wt-modal-overlay').style.display = 'none';
    });

    let pwTimeout;
    document.getElementById('pw-access').addEventListener('input', (e) => {
        clearTimeout(pwTimeout);
        pwTimeout = setTimeout(async () => {
            const target = /** @type {HTMLInputElement} */ (e.target);
            const val = target.value.trim();
            if (!val) {
                refreshRoster();
                return;
            }
            const result = await fetchKeyFile(val);
            if (result === true) {
                await refreshRoster(true);
            } else {
                console.warn("[Weyland-Downloader] Invalid password or fetch failed:", result);
            }
        }, 800);
    });

    document.getElementById('btn-update-wt').addEventListener('click', async (e) => {
        const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i> Refreshing...';
        btn.disabled = true;
        await refreshRoster(true);
        btn.innerHTML = '<i class="fa-solid fa-check" style="margin-right: 8px; color: var(--rb-success);"></i> Refreshed';
        setTimeout(() => { btn.innerHTML = originalHtml; btn.disabled = false; }, 2000);
    });

    document.getElementById('btn-check-updates').addEventListener('click', async (e) => {
        const btn = /** @type {HTMLButtonElement} */ (e.currentTarget); const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i> Checking...'; btn.disabled = true;

        if (!isDisconnected) {
            document.getElementById('banner-error').style.display = 'none';
            await refreshRoster();
        } else {
            document.getElementById('banner-error').style.display = 'block'; document.getElementById('banner-all-installed').style.display = 'none';
        }

        btn.innerHTML = originalHtml; btn.disabled = false;
    });

    document.getElementById('btn-update-chars').addEventListener('click', () => {
        const updatesOnly = filteredRenderData.filter(c => c.installed && c.updateAvailable).map(c => c.id);
        if (updatesOnly.length > 0) startTestDownload(updatesOnly);
    });

    document.getElementById('btn-dl-new').addEventListener('click', () => {
        const newOrUpdates = filteredRenderData.filter(c => !c.installed || c.updateAvailable).map(c => c.id);
        if (newOrUpdates.length > 0) startTestDownload(newOrUpdates);
    });

    document.getElementById('btn-dl-selected').addEventListener('click', () => {
        if (selectedCharacters.size > 0) startTestDownload(Array.from(selectedCharacters));
    });

    document.getElementById('btn-dl-cancel').addEventListener('click', () => {
        if (downloadController) downloadController.abort();
        /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-cancel')).disabled = true;
    });

    document.getElementById('btn-dl-copy').addEventListener('click', async () => {
        const termLines = document.querySelectorAll('#terminal-output .term-line');
        let rawText = '';
        termLines.forEach(line => {
            let temp = document.createElement('div');
            temp.innerHTML = line.innerHTML;
            rawText += temp.innerText + '\n';
        });
        try {
            await navigator.clipboard.writeText(rawText);
            const copyBtn = document.getElementById('btn-dl-copy');
            const originalHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> COPIED!';
            setTimeout(() => { copyBtn.innerHTML = originalHtml; }, 2000);
        } catch (err) {
            console.error('Failed to copy terminal log!', err);
        }
    });

    document.getElementById('btn-dl-ok').addEventListener('click', () => {
        document.getElementById('view-dl').classList.remove('active-view');
        document.getElementById('view-info').classList.add('active-view');
        // @ts-ignore
        if (window.innerWidth <= 900) window.wt_setMobileView('main');
    });

    document.getElementById('btn-info-dl').addEventListener('click', (e) => {
        const currentTarget = /** @type {HTMLElement} */ (e.currentTarget);
        const id = currentTarget.getAttribute('data-id');
        if (id) handleRowDownloadClick(id);
    });

    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', (e) => {
            const currentTarget = /** @type {HTMLElement} */ (e.currentTarget);
            const sortCol = currentTarget.getAttribute('data-sort');
            if (currentSort.col === sortCol) {
                currentSort.asc = !currentSort.asc;
            } else {
                currentSort.col = sortCol;
                currentSort.asc = true;
            }

            document.querySelectorAll('.sortable').forEach(h => {
                h.classList.remove('active');
                h.querySelector('i').className = 'fa-solid fa-sort';
            });

            currentTarget.classList.add('active');
            currentTarget.querySelector('i').className = currentSort.asc ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';

            renderDownloader();
        });
    });

    document.getElementById('brand-header').addEventListener('click', () => {
        // @ts-ignore
        if (window.innerWidth <= 900) window.wt_setMobileView('menu');
    });
}

// =========================
// ========= BOOT ==========
// =========================
// @ts-ignore
jQuery(async () => {
    console.debug(`[${WT_DOWNLOAD_MODULE_NAME}] Initializing v${extensionVersion}`);

    getSettings();
    await addExtensionSettings();

    try {
        // @ts-ignore
        const html = await $.get(`${extensionDirectory}/template.html`);
        // @ts-ignore
        $('body').append(html);
        document.getElementById('btn-update-wt').innerHTML = `<i class="fa-solid fa-refresh" style="margin-right: 8px;"></i> Force Refresh Manifest`;
        if (settings) {
            document.getElementById('btn-update-wt').style.display = settings.debug ? 'flex' : 'none';
        }
        weylandDebug("Template injected successfully.");
    } catch (err) {
        console.error("[Weyland-Downloader] CRITICAL ERROR: Failed to load template.html.", err);
        // @ts-ignore
        toastr.error("[Weyland-Downloader] Failed to load downloader html");
        return;
    }

    initWeylandUI();
    bindWeylandEvents();
    await refreshRoster();
    if (settings.autoupdate) {
        try {
            const manifests = manifestCache;
            if (typeof manifests === 'string') throw new Error(manifests);
            const updateCount = manifests?.pendingDiff?.characters?.length;
            if (updateCount && updateCount > 0) {
                // @ts-ignore
                toastr.info(`Auto-Updating ${updateCount} character${updateCount > 1 ? `s` : ``}`);
                const downloadResult = await downloadCharacters(listCharacters(manifests.pendingDiff));
                if (typeof downloadResult === 'string') throw new Error(downloadResult);
                // @ts-ignore
                toastr.info(`Auto-Update Complete`);
            }
        } catch (error) {
            console.error(`[${WT_DOWNLOAD_MODULE_NAME}] Failed to auto-update characters: ${error.message}`);
            // @ts-ignore
            toastr.error(`Character Auto-Update Failed`);
        }
    }
});