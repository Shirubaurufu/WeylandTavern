import { getCharacters, saveSettingsDebounced } from "../../../script.js";
import { Popup, POPUP_TYPE, POPUP_RESULT } from "../../popup.js";
import { fetchManifests, fetchKeyFile, openDownloadStream, downloadCharacters, listCharacters, listCharactersVersioned, downloadCharactersTest, manifestCache, removeCharacter, cancelDownload } from "./Modules/backend.js";
import { REPAIR_CONFIRMATION_TITLE, REPAIR_CONFIRMATION_MESSAGE, isRepairAction, downloadOutcomeLabel } from "./Modules/repair.js";
import { admitIds, formatBytes, queueDelayMs, summarizeBulk } from "./Modules/bulk.js";

const { extensionSettings, renderExtensionTemplateAsync } = SillyTavern.getContext();
export const WT_DOWNLOAD_MODULE_NAME = "Weyland-Downloader";

// =========================
// ========= SETUP =========
// =========================

const extensionVersion = "1.0.0";
const extensionDirectory = '/scripts/extensions/Weyland-Downloader';
let refreshRosterAuto = false;

/**
 * @typedef {Object} WeylandDownloaderSettings
 * @property {boolean} debug
 * @property {boolean} autoupdate
 */

/** @type {WeylandDownloaderSettings} */
const defaultSettings = {
    debug: false,
    autoupdate: false
};

/** @type {WeylandDownloaderSettings} */
let settings = undefined;

let isDisconnected = false;
let isProcessing = false;
let downloadController = null;
let CHARACTER_DATA = [];

// Download queue. The server runs one download at a time (one progress stream, a 5 s cooldown), so
// the queue lives here: clicking Update on a second row while the first downloads lines it up
// instead of graying out every button (a player who updates one character at a time asked for
// exactly this). Only the rows that are downloading or waiting are locked; everything else stays
// clickable. Bulk buttons join the same queue.
/** @type {{ ids: string[], reDownload: boolean } | null} */
let activeJob = null;
/** @type {{ ids: string[], reDownload: boolean }[]} */
let jobQueue = [];
let lastJobStartMs = 0;
let cancelRequested = false;
/** Per-character file progress for the row bars: sysName -> 0..1 */
const rowProgress = new Map();
let lastManifestFetchMs = 0;

/** Escapes text for HTML (names come from the cast site and card file names). */
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}



let currentSort = { col: 'name', asc: true };
const sortWeights = { 'release': 3, 'beta': 2, 'alpha': 1 };
let selectedCharacters = new Set();
let filteredRenderData = [];
let searchQuery = '';

function convertInfoLinks(text) {
    if (!text) return text;
    return String(text).replace(/\[\[([^\]:]+)(?::([^\]]+))?\]\]/g, (match, group1, group2) => {
        return group2 || group1;
    });
}

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
                    .attr('title', 'Character Downloader')
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
        // The server answers a second manifest check within 2 s with "Please wait", which used to
        // show the red "Failed to contact" banner. Queued downloads refresh after every job, so
        // space the checks out instead.
        const wait = 2100 - (Date.now() - lastManifestFetchMs);
        if (wait > 0) await sleep(wait);
        lastManifestFetchMs = Date.now();
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
                const tags = convertInfoLinks(typeof tagsRaw === 'string' ? tagsRaw : (tagsRaw.name || ''));
                const summaryRaw = charInfo?.summary || botInfo?.summary || '';
                const summary = convertInfoLinks(typeof summaryRaw === 'string' ? summaryRaw : (summaryRaw.name || ''));

                let tagsHtml = tags ? `<div class="meta-tags">${tags.split(',').map(t => `<span class="tag-pill">${t.trim()}</span>`).join('')}</div>` : '';
                const summaryHtml = summary ? `<div class="meta-summary">${summary}</div>` : '';

                let detailsHtml = '<div class="meta-details">';

                const description = convertInfoLinks(charInfo?.description || botInfo?.description || '');
                let descHtml = description ? `<div class="meta-desc">${String(description).replace(/\n/g, '<br>')}</div>` : '';

                const speciesRaw = charInfo?.species || '';
                const species = convertInfoLinks(typeof speciesRaw === 'string' ? speciesRaw : (speciesRaw.name || ''));
                const genderRaw = charInfo?.gender || '';
                const gender = convertInfoLinks(typeof genderRaw === 'string' ? genderRaw : (genderRaw.name || ''));
                const age = convertInfoLinks(charInfo?.age || '');
                const height = convertInfoLinks(charInfo?.height || '');
                const occupationRaw = charInfo?.occupation || '';
                const occupation = convertInfoLinks(typeof occupationRaw === 'string' ? occupationRaw : (occupationRaw.name || ''));
                const homeRaw = charInfo?.home || '';
                const home = convertInfoLinks(typeof homeRaw === 'string' ? homeRaw : (homeRaw.name || ''));

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
                name: convertInfoLinks(charInfo?.name || botInfo?.name || remoteChar.name),
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
                    name: convertInfoLinks(charInfo?.name || botInfo?.name || localChar.name),
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

        // Cards that are not part of the roster at all (the stock "Assistant" card, imports).
        // Weyland's card check closes those chats as soon as they open, so this list is the only
        // place they can be removed from.
        const otherCards = Array.isArray(manifests.otherCards) ? manifests.otherCards : [];
        otherCards.forEach((cardName, index) => {
            CHARACTER_DATA.push({
                id: `other-${index}-${cardName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
                sysName: cardName,
                name: cardName,
                status: 'other',
                version: null,
                installed: true,
                updateAvailable: false,
                unavailableOnServer: true,
                other: true,
                serverZipName: null,
                image: `/thumbnail?type=avatar&file=${encodeURIComponent(`${cardName}.png`)}`,
                richHtml: `<div class="meta-summary">Not part of the Weyland roster</div>
                    <div class="meta-desc">This card is in your character list, but Weyland Tavern didn't install it. Weyland can't open it (it closes chats with cards it doesn't recognise), so it just sits there.<br><br>
                    It is usually the <b>Assistant</b> card left over from a plain SillyTavern install, or a card that was imported by hand. Remove it below if you don't need it. Any chats with it are kept.</div>`,
            });
        });

        document.getElementById('banner-error').style.display = 'none';
        renderDownloader();

        const activeHoverId = document.querySelector('.char-row:hover')?.getAttribute('data-id');
        if (activeHoverId && window.innerWidth > 900) showCharacterInfo(activeHoverId);
        // Otherwise redraw whoever the info panel is showing, so its buttons match the new state
        // (after a removal it must offer Download again, not Repair / Remove).
        else if (shownInfoId && document.getElementById('view-info')?.classList.contains('active-view')) showCharacterInfo(shownInfoId, { quiet: true });

    } catch (err) {
        console.error("[Weyland-Downloader] Fatal error during init.", err);
        const errBanner = document.getElementById('banner-error');
        if (errBanner) errBanner.style.display = 'block';
        renderDownloader();
    }
}

function getGroupIndex(char) {
    if (char.other) return 4;
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

    // Rows that are downloading keep their locked button; queued ones stay clickable (to dequeue).
    document.querySelectorAll('.char-row:not(.installed-uptodate):not(.is-downloading):not(.is-other)').forEach(row => {
        const charId = row.getAttribute('data-id');
        const btn = /** @type {HTMLButtonElement} */ (row.querySelector('.btn-dl'));
        if (btn && !row.classList.contains('is-queued')) btn.disabled = count > 0 ? !selectedCharacters.has(charId) : false;
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
        if (searchQuery) {
            const matchesName = char.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesSysName = char.sysName.toLowerCase().includes(searchQuery.toLowerCase());
            if (!matchesName && !matchesSysName) return false;
        }
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
    const activeIds = new Set(activeJob?.ids ?? []);
    const queuedIds = new Set(jobQueue.flatMap(job => job.ids));

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
            } else if (charGroup === 4) {
                htmlString += `<div class="installed-divider other-divider"><div class="divider-content"><div><i class="fa-solid fa-ghost" style="margin-right: 5px;"></i> Not from the Roster</div><div class="divider-hint">(Weyland can't open these)</div></div></div>`;
            }
        }

        const isActive = activeIds.has(char.id);
        const isQueued = queuedIds.has(char.id);
        const isChecked = selectedCharacters.has(char.id) ? 'checked' : '';
        let checkbox;
        if (char.other) checkbox = `<i class="fa-solid fa-ghost" style="color:#555"></i>`;
        else if (char.installed && !char.updateAvailable) checkbox = `<i class="fa-solid fa-check" style="color:#555"></i>`;
        else checkbox = `<input type="checkbox" class="char-chk" data-id="${char.id}" ${isChecked} ${isActive || isQueued ? 'disabled' : ''}>`;

        let dlButton;
        if (char.other) {
            dlButton = `<button class="icon-btn btn-remove-row" data-id="${char.id}" title="Remove this card"><i class="fa-solid fa-trash-can"></i></button>`;
        } else if (isActive) {
            dlButton = `<button class="icon-btn btn-dl is-busy" disabled title="Downloading..."><i class="fa-solid fa-circle-notch fa-spin"></i></button>`;
        } else if (isQueued) {
            dlButton = `<button class="icon-btn btn-dl is-queued" data-id="${char.id}" title="Waiting in the queue. Click to take it out."><i class="fa-solid fa-hourglass-half"></i></button>`;
        } else if (char.installed && !char.updateAvailable) {
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
        if (char.other) { badgeClass = 'other'; badgeText = 'Other'; }
        if (isActive) { badgeClass = 'active'; badgeText = 'Downloading'; }
        else if (isQueued) { badgeClass = 'queued'; badgeText = 'Queued'; }

        const rowClasses = [];
        if (char.installed && !char.updateAvailable && !isActive && !isQueued) rowClasses.push('installed-uptodate');
        if (char.updateAvailable) rowClasses.push('has-update');
        if (char.other) rowClasses.push('is-other');
        if (isActive) rowClasses.push('is-downloading');
        if (isQueued) rowClasses.push('is-queued');
        const progress = Math.round((rowProgress.get(char.sysName) ?? 0) * 100);

        htmlString += `
                <div class="char-row ${rowClasses.join(' ')}" data-id="${char.id}" data-sys="${escapeHtml(char.sysName)}">
                    <div class="char-bg" style="background-image: url('${char.image}'), linear-gradient(#222, #111);"></div>
                    <div class="row-cell cell-checkbox">${checkbox}</div>
                    <div class="row-cell cell-name">${escapeHtml(char.name)}</div>
                    <div class="row-cell" style="display: flex; justify-content: flex-end; padding-right: 10px;"><span class="status-badge status-${badgeClass}">${badgeText}</span></div>
                    <div class="row-cell cell-actions"><button class="icon-btn btn-info" data-id="${char.id}" title="View Info"><i class="fa-solid fa-circle-info"></i></button>${dlButton}</div>
                    ${isActive ? `<div class="row-progress"><span style="width:${progress}%"></span></div>` : ''}
                </div>`;
    });

    listContainer.innerHTML = htmlString;

    // "Update All" only touches characters the player already has, so it goes straight to the queue.
    document.querySelectorAll('.update-all-divider').forEach(div => {
        div.addEventListener('click', () => {
            const updatesOnly = filteredRenderData.filter(c => c.installed && c.updateAvailable).map(c => c.id);
            if (updatesOnly.length > 0) startDownload(updatesOnly);
        });
    });

    // "Download All" adds characters the player never asked for, so it confirms first.
    document.querySelectorAll('.download-all-divider').forEach(div => {
        div.addEventListener('click', async () => {
            const downloadsOnly = filteredRenderData.filter(c => !c.installed && !c.other);
            if (downloadsOnly.length === 0) return;
            if (await confirmBulkDownload(downloadsOnly)) startDownload(downloadsOnly.map(c => c.id));
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
            const id = currentTarget.getAttribute('data-id');
            if (currentTarget.classList.contains('is-queued')) dequeue(id);
            else handleRowDownloadClick(id);
        });
    });
    document.querySelectorAll('.btn-remove-row').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const currentTarget = /** @type {HTMLElement} */ (e.currentTarget);
            void removeFromInstall(currentTarget.getAttribute('data-id'));
        });
    });

    updateSelectionState();
}

/** The character the info panel is showing (for refreshRoster to redraw). */
let shownInfoId = null;

/**
 * @param {string} id
 * @param {{ quiet?: boolean }} [options] quiet: redraw only, never switch the phone layout to the info pane
 */
function showCharacterInfo(id, { quiet = false } = {}) {
    if (isProcessing) return;
    const char = CHARACTER_DATA.find(c => c.id === id);
    if (!char) return;
    shownInfoId = id;

    document.getElementById('mika-bg').style.display = (id === 'mika') ? 'block' : 'none';
    document.getElementById('view-dl').classList.remove('active-view');
    document.getElementById('view-info').classList.add('active-view');
    document.getElementById('info-img').style.backgroundImage = `url('${char.image}'), linear-gradient(#333, #111)`;
    document.getElementById('info-name').innerText = char.name;
    const metaLine = char.other ? `File: ${escapeHtml(char.sysName)}.png` : `ID: ${char.id}`;
    document.getElementById('info-desc').innerHTML = `<div class="meta-sys">${metaLine}</div>${char.richHtml}`;

    const infoDlBtn = document.getElementById('btn-info-dl');
    infoDlBtn.setAttribute('data-id', char.id);

    if (char.unavailableOnServer) {
        infoDlBtn.style.display = 'none';
    } else if (isRepairAction(char)) {
        infoDlBtn.innerHTML = '<i class="fa-solid fa-screwdriver-wrench"></i> Repair / Redownload Character';
        infoDlBtn.style.display = 'inline-block';
    } else {
        infoDlBtn.style.display = 'inline-block';
        if (char.updateAvailable) infoDlBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Update Character';
        else infoDlBtn.innerHTML = '<i class="fa-solid fa-download"></i> Download Character';
    }

    // Remove sits under Repair, deliberately quieter (striped, half-faded) so it reads as the
    // "are you sure" button it is. Any installed character can be removed, and so can a card that
    // is not from the roster at all.
    const removeBtn = document.getElementById('btn-info-remove');
    removeBtn.setAttribute('data-id', char.id);
    removeBtn.style.display = char.installed ? 'flex' : 'none';
    removeBtn.querySelector('span').textContent = char.other ? 'Remove This Card' : 'Remove Character';
    // The info panel sits right above it: Download/Repair is pushed to the bottom with margin-top:auto,
    // so with no Download button the Remove button takes that spot instead.
    removeBtn.classList.toggle('is-alone', infoDlBtn.style.display === 'none');

    // @ts-ignore
    if (!quiet && window.innerWidth <= 900) window.wt_setMobileView('info');
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

/** Terminal line writer for the session in progress (set by runQueue, used by enqueue/cancel). */
let sessionLine = null;

/** Puts the panel back to idle once the queue has drained. */
function finishSession(addLine, finalMsg) {
    isProcessing = false;
    downloadController = null;
    sessionLine = null;

    /** @type {HTMLButtonElement} */ (document.getElementById('btn-close-modal')).disabled = false;
    /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-copy')).disabled = false;
    /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-cancel')).disabled = true;
    /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-ok')).disabled = false;

    addLine(`<br><b>${finalMsg}</b>`);

    selectedCharacters.clear();
    /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('.char-chk')).forEach(c => c.checked = false);
    renderDownloader();
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
            if (refreshRosterAuto) {
                await refreshRoster();
                refreshRosterAuto = false;
            }
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
 * @param {boolean} reDownload
 */
function handleRowDownloadClick(id, reDownload = false) {
    if (selectedCharacters.size > 0) startDownload(Array.from(selectedCharacters), reDownload);
    else startDownload([id], reDownload);
}

async function reloadCharactersAfterDownload() {
    try {
        await getCharacters();
    } catch (error) {
        console.error(`[${WT_DOWNLOAD_MODULE_NAME}] Download completed, but the character list could not be reloaded:`, error);
        // @ts-ignore
        toastr.warning('Characters were updated, but WeyTav may need to be restarted before the changes appear.');
    }
}

const namesOf = ids => ids.map(id => CHARACTER_DATA.find(c => c.id === id)?.name).filter(Boolean);

/**
 * Starts a download, or lines it up behind the one that is running. Characters that are already
 * downloading or waiting are skipped, so double clicks and overlapping bulk buttons are harmless.
 * @param {string[]} targetIds
 * @param {boolean} reDownload
 */
function startDownload(targetIds = [], reDownload = false) {
    const ids = admitIds(targetIds, activeJob?.ids, jobQueue);
    if (ids.length === 0) {
        // @ts-ignore
        if (targetIds.length) toastr.info('Already downloading or waiting in the queue.');
        return;
    }
    const job = { ids, reDownload };
    if (isProcessing) {
        jobQueue.push(job);
        sessionLine?.(`<i class="fa-solid fa-hourglass-half" style="color:var(--rb-text-muted); width:15px;"></i> <span style="color:#aaa;">Queued: ${escapeHtml(namesOf(ids).join(', '))}</span>`);
        renderDownloader();
        return;
    }
    void runQueue(job);
}

/** Takes a waiting character back out of the queue (its row button turns into an hourglass while queued). */
function dequeue(id) {
    jobQueue = jobQueue.map(job => ({ ...job, ids: job.ids.filter(x => x !== id) })).filter(job => job.ids.length > 0);
    sessionLine?.(`<span style="color:#777;">Removed from the queue: ${escapeHtml(namesOf([id]).join(''))}</span>`);
    renderDownloader();
}

/** Runs jobs one after another until the queue is empty (or Cancel empties it). */
async function runQueue(firstJob) {
    isProcessing = true;
    cancelRequested = false;
    downloadController = new AbortController();
    showTerminal();
    const addLine = setupTerminal();
    sessionLine = addLine;
    /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-cancel')).disabled = false;

    // The first job runs right away; the rest stay IN the queue (drawn as Queued, and counted by
    // Cancel) until the moment they start.
    jobQueue.unshift(firstJob);
    let jobsRun = 0;
    let lastOutcome = '';
    while (jobQueue.length && !cancelRequested) {
        // The server refuses a new download within 5 s of the last one; wait that out quietly.
        const wait = queueDelayMs(lastJobStartMs, Date.now());
        if (wait > 0) {
            addLine(`<span style="color:#777;">Next in queue starts in ${Math.ceil(wait / 1000)}s...</span>`);
            await sleep(wait);
        }
        if (cancelRequested || !jobQueue.length) break;

        const job = jobQueue.shift();
        activeJob = job;
        rowProgress.clear();
        renderDownloader();
        lastJobStartMs = Date.now();
        const outcome = await runJob(job, addLine);
        jobsRun++;
        lastOutcome = downloadOutcomeLabel({ repair: job.reDownload, aborted: outcome.cancelled, failedCount: outcome.failedCount, requestFailed: outcome.requestFailed });
        // In a multi-job session each job gets its own result line; a lone job only gets the final one.
        if (jobsRun > 1 || jobQueue.length) addLine(`<span style="color:#888;">${escapeHtml(namesOf(job.ids).join(', '))}: ${lastOutcome}</span>`);

        activeJob = null;
        rowProgress.clear();
        await reloadCharactersAfterDownload();
        await refreshRoster();
        if (outcome.cancelled) cancelRequested = true;
    }
    jobQueue = [];

    const stopped = cancelRequested && !lastOutcome.includes('ABORTED');
    finishSession(addLine, stopped ? 'QUEUE STOPPED.' : (jobsRun > 1 ? 'QUEUE COMPLETE.' : lastOutcome || 'SEQUENCE ABORTED.'));
}

/**
 * One download request. Resolves when the SERVER answers, not when the progress stream says
 * "complete": the stream can drop (sleep, Wi-Fi) or be closed by Cancel, and waiting on it alone
 * left the Downloader stuck in "processing" until the page was reloaded.
 * @param {{ ids: string[], reDownload: boolean }} job
 * @param {(html: string) => void} addLine
 * @returns {Promise<{ cancelled: boolean, failedCount: number, requestFailed?: boolean }>}
 */
async function runJob({ ids, reDownload }, addLine) {
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

    if (isDisconnected) {
        addLine("Connecting to Weyland Servers... <span class='term-err'>FAILED</span>");
        await sleep(500);
        addLine('ERROR: Failed to contact the Roster Service ;-;<br>Connection refused.');
        return { cancelled: false, failedCount: 0, requestFailed: true };
    }

    addLine("Connecting to Weyland Servers... <span class='term-ok'>OK</span>");
    await sleep(300);

    const charWord = ids.length === 1 ? "character" : "characters";
    addLine(`Initializing server-side ${reDownload ? 'repair / redownload' : 'download'} for ${ids.length} ${charWord}...`);

    const namesArray = ids.map(id => {
        const char = CHARACTER_DATA.find(c => c.id === id);
        return char ? char.sysName : null;
    }).filter(n => n);

    progContainer.style.display = 'block';
    progTarget.innerHTML = `Sending Payload: ${escapeHtml(namesArray.join(', '))}`;
    progBar.style.width = '100%';
    progText.innerText = `Awaiting API...`;

    let completeEvent = null;
    const stream = openDownloadStream((event) => {
        if (event.type !== 'progress' && event.type !== 'complete' && event.type !== 'error') {
            addLine(`<i class="fa-solid fa-bug" style="color:yellow;"></i> Event payload: ${escapeHtml(JSON.stringify(event))}`);
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
                ui.label.innerHTML = `[${completed}/${total}] <i class="fa-solid fa-file-arrow-down"></i> ${escapeHtml(characterName)}`;
                ui.bar.style.width = `${charPerc * 100}%`;
                ui.text.innerText = `${Math.round(charPerc * 100)}%`;

                // The row's own thin progress bar in the list, so a queued update is easy to follow.
                rowProgress.set(characterName, charPerc);
                const rowBar = /** @type {HTMLElement | null} */ ([...document.querySelectorAll('.char-row.is-downloading')]
                    .find(row => row.getAttribute('data-sys') === characterName)?.querySelector('.row-progress span'));
                if (rowBar) rowBar.style.width = `${Math.round(charPerc * 100)}%`;

                let termLine = document.getElementById(`term-prog-${idName}`);
                if (!termLine) {
                    addLine(`<div id="term-prog-${idName}"></div>`);
                    termLine = document.getElementById(`term-prog-${idName}`);
                }
                if (termLine) {
                    if (completed >= total) {
                        termLine.innerHTML = `<i class="fa-solid fa-check" style="color:var(--rb-success); width:15px;"></i> <span style="color:#aaa;">${escapeHtml(characterName)} downloaded successfully</span> [${completed}/${total}]`;
                    } else {
                        termLine.innerHTML = `<i class="fa-solid fa-cog fa-spin" style="color:var(--rb-accent); width:15px;"></i> <span style="color:#fff;">Downloading ${escapeHtml(characterName)}...</span> [${completed}/${total}]`;
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
            addLine(`<i class="fa-solid fa-xmark term-err"></i> ERROR (${escapeHtml(event.character)}): ${escapeHtml(event.message)}`);
        } else if (event.type === 'complete') {
            completeEvent = event;
            if (event.aborted) {
                addLine(`<i class="fa-solid fa-xmark term-err"></i> <span class="term-err">DOWNLOAD CANCELLED BY USER.</span>`);
            } else if (event.failed && event.failed.length > 0) {
                event.failed.forEach(fail => {
                    addLine(`<i class="fa-solid fa-triangle-exclamation" style="color:var(--rb-warning);"></i> FAILED: ${escapeHtml(fail.character)} - ${escapeHtml(fail.filePath)}`);
                });
            } else {
                addLine(`<span class="term-ok">Transfer sequence finalized safely.</span>`);
            }
        }
    });

    try {
        addLine(`Transmitting handshake to backend API...`);
        const response = await downloadCharacters(namesArray, reDownload);
        if (typeof response === 'string') throw new Error(response);
        // The "complete" event is written just before the server answers; give it a beat to land.
        if (!completeEvent) await sleep(250);
        const cancelled = Boolean(response?.cancelled || completeEvent?.aborted);
        return { cancelled, failedCount: Array.isArray(completeEvent?.failed) ? completeEvent.failed.length : 0 };
    } catch (err) {
        addLine(`<i class="fa-solid fa-xmark term-err"></i> <span class="term-err">API TRANSFER FAILED: ${escapeHtml(err.message)}</span>`);
        return { cancelled: cancelRequested, failedCount: 0, requestFailed: !cancelRequested };
    } finally {
        stream.close();
        progContainer.style.display = 'none';
    }
}

/**
 * The confirmation in front of "Get New / Updates" and "Download All". A player who wanted five
 * characters pressed "Get New / Updates" and got the whole roster; this says how many, how big,
 * and how to pick just a few, before anything is fetched.
 * @param {any[]} targets CHARACTER_DATA entries about to be downloaded
 * @returns {Promise<boolean>}
 */
async function confirmBulkDownload(targets) {
    const summary = summarizeBulk(targets, manifestCache?.pendingDiff);
    const everyone = summary.fresh.length > 0 && summary.fresh.length === CHARACTER_DATA.filter(c => !c.installed && !c.other).length;
    const title = summary.fresh.length === 0
        ? `Update ${summary.total} character${summary.total === 1 ? '' : 's'}?`
        : `Download ${summary.total} character${summary.total === 1 ? '' : 's'}?`;
    const lede = everyone && summary.fresh.length > 1
        ? 'That is every character you don\'t have yet.'
        : 'Here is what this will fetch.';
    const stat = (value, label, tone = '') => `<div class="wtdl-stat ${tone}"><b>${value}</b><span>${label}</span></div>`;
    const chips = targets.slice(0, 60).map(c => `<span class="wtdl-chip${c.installed ? ' is-update' : ''}">${escapeHtml(c.name)}</span>`).join('')
        + (targets.length > 60 ? `<span class="wtdl-chip is-more">+${targets.length - 60} more</span>` : '');
    const html = `
        <div class="wtdl-confirm">
            <div class="wtdl-confirm-head">
                <div class="wtdl-confirm-icon"><i class="fa-solid fa-cloud-arrow-down"></i></div>
                <div><h3>${title}</h3><p>${lede}</p></div>
            </div>
            <div class="wtdl-stats">
                ${summary.fresh.length ? stat(summary.fresh.length, summary.fresh.length === 1 ? 'new character' : 'new characters') : ''}
                ${summary.updates.length ? stat(summary.updates.length, summary.updates.length === 1 ? 'update' : 'updates', 'is-update') : ''}
                ${summary.sizeKnown ? stat(formatBytes(summary.bytes), 'to download', 'is-size') : ''}
            </div>
            <div class="wtdl-chips">${chips}</div>
            <p class="wtdl-hint"><i class="fa-solid fa-lightbulb"></i> Only want a few? Tick their boxes and press <b>Download Selected</b>, or use each row's download button. Anyone you change your mind about can be removed later from their info panel.</p>
        </div>`;
    const popup = new Popup(html, POPUP_TYPE.CONFIRM, '', {
        okButton: summary.fresh.length ? `Download ${summary.total}` : `Update ${summary.total}`,
        cancelButton: 'Not now',
        allowVerticalScrolling: true,
    });
    return (await popup.show()) === POPUP_RESULT.AFFIRMATIVE;
}

/**
 * Removes one character (or a card that is not from the roster) after a confirmation that says
 * plainly what goes and what stays.
 * @param {string} id CHARACTER_DATA id
 */
async function removeFromInstall(id) {
    const char = CHARACTER_DATA.find(c => c.id === id);
    if (!char || !char.installed) return;
    if (isProcessing) {
        // @ts-ignore
        toastr.info('Finish the downloads in progress first, then remove characters.');
        return;
    }

    const name = escapeHtml(char.name);
    const goes = char.other
        ? ['The card itself, so it leaves your character list']
        : ['The character card', 'Their expression sprites', 'Their bundled lorebook, if they have one'];
    const stays = ['Your chats with them', 'WeyPhone texts and memories'];
    const html = `
        <div class="wtdl-confirm is-danger">
            <div class="wtdl-confirm-head">
                <div class="wtdl-confirm-icon"><i class="fa-solid fa-trash-can"></i></div>
                <div><h3>Remove ${name}?</h3><p>${char.other ? 'This card is not part of the Weyland roster.' : `You can download ${name} again any time from the roster.`}</p></div>
            </div>
            <div class="wtdl-columns">
                <div class="wtdl-col is-goes"><div class="wtdl-col-title"><i class="fa-solid fa-xmark"></i> Removed</div><ul>${goes.map(g => `<li>${g}</li>`).join('')}</ul></div>
                <div class="wtdl-col is-stays"><div class="wtdl-col-title"><i class="fa-solid fa-shield-heart"></i> Kept</div><ul>${stays.map(s => `<li>${s}</li>`).join('')}</ul></div>
            </div>
        </div>`;
    const popup = new Popup(html, POPUP_TYPE.CONFIRM, '', { okButton: char.other ? 'Remove card' : `Remove ${char.name}`, cancelButton: 'Keep', defaultResult: POPUP_RESULT.NEGATIVE });
    if ((await popup.show()) !== POPUP_RESULT.AFFIRMATIVE) return;

    try {
        // Close the chat first if it is this character's: removing the card under an open chat
        // leaves SillyTavern pointing at a character that no longer exists.
        const context = SillyTavern.getContext();
        const openAvatar = context.characters?.[context.characterId]?.avatar;
        if (openAvatar && openAvatar.toLowerCase() === `${char.sysName}.png`.toLowerCase()) {
            await context.executeSlashCommandsWithOptions('/closechat');
        }

        const result = await removeCharacter(char.sysName, char.other ? 'other' : 'roster');
        if (result.problems?.length) {
            console.warn(`[${WT_DOWNLOAD_MODULE_NAME}] Some files could not be removed:`, result.problems);
            // @ts-ignore
            toastr.warning(`${char.name} was removed, but ${result.problems.length} file(s) could not be deleted (in use, or blocked by antivirus). They are harmless.`);
        } else {
            // @ts-ignore
            toastr.success(`${char.name} was removed.`);
        }
        selectedCharacters.delete(id);
        await reloadCharactersAfterDownload();
        await refreshRoster();
    } catch (error) {
        console.error(`[${WT_DOWNLOAD_MODULE_NAME}] Remove failed:`, error);
        // @ts-ignore
        toastr.error(`Could not remove ${char.name}: ${error.message}`);
    }
}

async function runAutoUpdate() {
    try {
        const manifests = manifestCache; if (typeof manifests === 'string') throw new Error(manifests);
        if (!manifests?.pendingDiff?.characters) throw new Error(`pendingDiff missing or empty`);
        const localCharList = manifests?.localManifest?.characters?.filter(c => c.version); if (!localCharList) throw new Error(`localManifest missing or empty`);
        const localCharSet = new Set(localCharList.map(c => c.name));
        const pendingCharFiltered = manifests.pendingDiff.characters.filter(c => localCharSet.has(c.name)); if (!pendingCharFiltered) return;
        const updateOnlyNameList = pendingCharFiltered.map(c => c.name); if (!updateOnlyNameList) return;
        const updateCount = updateOnlyNameList.length;
        // @ts-ignore
        toastr.info(`Auto-Updating ${updateCount} character${updateCount > 1 ? `s` : ``}`);
        const downloadResult = await downloadCharacters(updateOnlyNameList);
        if (typeof downloadResult === 'string') throw new Error(downloadResult);
        await reloadCharactersAfterDownload();
        // @ts-ignore
        toastr.info(`Auto-Update Complete`);
        refreshRosterAuto = true;
    } catch (error) {
        console.error(`[${WT_DOWNLOAD_MODULE_NAME}] Failed to auto-update characters: ${error.message}`);
        // @ts-ignore
        toastr.error(`Character Auto-Update Failed`);
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
                // The new key changes which remote manifests are available; it does not
                // require re-statting users' locally edited character files.
                await refreshRoster();
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

    const searchInput = document.getElementById('wt-search-input');
    const searchClear = document.getElementById('wt-search-clear');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const target = /** @type {HTMLInputElement} */ (e.target);
            searchQuery = target.value;
            if (searchClear) searchClear.style.display = searchQuery ? 'block' : 'none';
            renderDownloader();
        });
    }
    if (searchClear) {
        searchClear.addEventListener('click', () => {
            searchQuery = '';
            if (searchInput) /** @type {HTMLInputElement} */ (searchInput).value = '';
            searchClear.style.display = 'none';
            renderDownloader();
        });
    }

    document.getElementById('btn-open-terminal').addEventListener('click', () => {
        showTerminal();
    });

    document.getElementById('btn-check-updates').addEventListener('click', async (e) => {
        const btn = /** @type {HTMLButtonElement} */ (e.currentTarget); const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="menu-btn-icon"><i class="fa-solid fa-spinner fa-spin"></i> Checking...</span>'; btn.disabled = true;

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
        if (updatesOnly.length > 0) startDownload(updatesOnly);
    });

    // Confirms first when it would add characters the player does not have (see confirmBulkDownload).
    document.getElementById('btn-dl-new').addEventListener('click', async () => {
        const newOrUpdates = filteredRenderData.filter(c => !c.other && (!c.installed || c.updateAvailable));
        if (newOrUpdates.length === 0) return;
        if (newOrUpdates.some(c => !c.installed) && !(await confirmBulkDownload(newOrUpdates))) return;
        startDownload(newOrUpdates.map(c => c.id));
    });

    document.getElementById('btn-dl-selected').addEventListener('click', () => {
        if (selectedCharacters.size > 0) startDownload(Array.from(selectedCharacters));
    });

    // Bound once here; it used to be re-bound on every list render, stacking a handler per refresh.
    document.getElementById('status-bar').addEventListener('click', () => {
        if (selectedCharacters.size > 0) startDownload(Array.from(selectedCharacters));
    });

    // The header checkbox had no handler, so "select all" did nothing. It selects everything the
    // list currently shows that can be downloaded or updated (search narrows it).
    document.getElementById('chk-all').addEventListener('change', (e) => {
        const checked = /** @type {HTMLInputElement} */ (e.target).checked;
        const busy = new Set([...(activeJob?.ids ?? []), ...jobQueue.flatMap(job => job.ids)]);
        selectedCharacters.clear();
        if (checked) {
            filteredRenderData.filter(c => !c.other && (!c.installed || c.updateAvailable) && !busy.has(c.id)).forEach(c => selectedCharacters.add(c.id));
        }
        /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('.char-chk')).forEach(chk => {
            chk.checked = selectedCharacters.has(chk.getAttribute('data-id'));
        });
        updateSelectionState();
    });

    // Real cancel: the server stops fetching (files already saved stay saved), and anything still
    // waiting in the queue is dropped. It used to only stop listening while the server carried on.
    document.getElementById('btn-dl-cancel').addEventListener('click', async () => {
        /** @type {HTMLButtonElement} */ (document.getElementById('btn-dl-cancel')).disabled = true;
        cancelRequested = true;
        const dropped = jobQueue.length;
        jobQueue = [];
        renderDownloader();
        sessionLine?.(`<span class="term-err">Cancelling...${dropped ? ` (${dropped} queued download${dropped === 1 ? '' : 's'} dropped)` : ''}</span>`);
        try {
            await cancelDownload();
        } catch (error) {
            console.warn(`[${WT_DOWNLOAD_MODULE_NAME}] Cancel request failed:`, error);
        }
    });

    document.getElementById('btn-info-remove').addEventListener('click', (e) => {
        void removeFromInstall(/** @type {HTMLElement} */ (e.currentTarget).getAttribute('data-id'));
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

    document.getElementById('btn-info-dl').addEventListener('click', async (e) => {
        const currentTarget = /** @type {HTMLElement} */ (e.currentTarget);
        const id = currentTarget.getAttribute('data-id');
        const char = CHARACTER_DATA.find(c => c.id === id);
        if (!id || !char || char.unavailableOnServer) return;
        const repair = isRepairAction(char);
        if (repair) {
            const confirmed = await Popup.show.confirm(REPAIR_CONFIRMATION_TITLE, REPAIR_CONFIRMATION_MESSAGE);
            if (!confirmed) return;
        }
        startDownload([id], repair);
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
        await runAutoUpdate();
    }
});
