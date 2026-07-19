// lib/ui/apps/settings.js

import { APP_REGISTRY } from '../../appRegistry.js';

// Same UI format as Weyland-LTM's model selection (input + "Use current" + quickfill preset
// buttons + disclaimer), with WeyPhone's own values. minimax-m3 is the default per Lucky;
// deepseek-v4-pro is his other tested favorite. Both keep Sonnet supply for actual messaging.
export const RECOMMENDED_PHONE_MODEL = 'minimax-m3';
export const ALTERNATE_PHONE_MODELS = ['deepseek-v4-pro', 'glm-4.7-thinking', 'gemini-3-pro-preview'];

// Wallpaper presets — pure-CSS background values applied to #wp-wallpaper, each themed to a
// corner of Weyland. Anything not in this map is treated as a custom image URL.
export const WALLPAPER_PRESETS = {
    default: {
        label: 'Weyland Ember',
        css: 'radial-gradient(120% 90% at 85% -10%, rgba(170,63,63,0.35), transparent 60%), radial-gradient(90% 70% at 10% 110%, rgba(198,116,18,0.22), transparent 55%), #131313',
    },
    violet: {
        label: 'Moonvale Night',
        css: 'radial-gradient(110% 80% at 20% -10%, rgba(107,91,149,0.4), transparent 60%), radial-gradient(80% 60% at 90% 110%, rgba(74,158,205,0.18), transparent 55%), #101018',
    },
    forest: {
        label: 'Rustwood',
        css: 'radial-gradient(110% 80% at 80% -10%, rgba(95,168,106,0.28), transparent 60%), radial-gradient(80% 60% at 10% 110%, rgba(198,116,18,0.18), transparent 55%), #0f1512',
    },
    mono: {
        label: 'Slate',
        css: 'radial-gradient(120% 90% at 50% -20%, rgba(255,255,255,0.07), transparent 60%), #141414',
    },
    // The observatory at 2am: a readable starfield over a deep blue-black.
    observatory: {
        label: 'Observatory',
        css: 'radial-gradient(2.5px 2.5px at 12% 18%, rgba(255,255,255,0.9), transparent 58%), radial-gradient(2px 2px at 34% 62%, rgba(255,255,255,0.7), transparent 58%), radial-gradient(3px 3px at 58% 30%, rgba(255,255,255,0.85), transparent 58%), radial-gradient(2px 2px at 71% 74%, rgba(255,255,255,0.6), transparent 58%), radial-gradient(2.5px 2.5px at 86% 12%, rgba(255,255,255,0.8), transparent 58%), radial-gradient(3px 3px at 24% 86%, rgba(255,255,255,0.75), transparent 58%), radial-gradient(2px 2px at 44% 44%, rgba(255,255,255,0.5), transparent 58%), radial-gradient(2.5px 2.5px at 92% 52%, rgba(255,255,255,0.65), transparent 58%), radial-gradient(90% 60% at 50% 115%, rgba(74,110,160,0.25), transparent 60%), #070a12',
    },
    // Sakurai Cafe in spring — soft pink dusk with a warm counter-light low in the frame.
    sakura: {
        label: 'Sakurai Bloom',
        css: 'radial-gradient(100% 70% at 80% -10%, rgba(232,140,168,0.3), transparent 60%), radial-gradient(80% 55% at 15% 105%, rgba(255,196,120,0.2), transparent 55%), radial-gradient(40% 30% at 40% 40%, rgba(232,140,168,0.1), transparent 70%), #171014',
    },
    // The Red Lantern after dark — neon red bleeding into a wet-asphalt teal.
    lantern: {
        label: 'Red Lantern',
        css: 'radial-gradient(90% 60% at 75% -5%, rgba(230,57,70,0.4), transparent 55%), radial-gradient(80% 55% at 10% 110%, rgba(42,111,120,0.32), transparent 55%), linear-gradient(180deg, rgba(230,57,70,0.05), transparent 40%), #0d0b10',
    },
    // Black Barrel Bar — amber whiskey glow on old oak, almost candlelit.
    barrel: {
        label: 'Black Barrel',
        css: 'radial-gradient(70% 55% at 50% 108%, rgba(198,116,18,0.42), transparent 60%), radial-gradient(100% 70% at 50% -20%, rgba(20,12,6,0.9), transparent 70%), #120c07',
    },
    // Kodo Bowl at closing — electric ramen-shop citrus on charcoal.
    kodo: {
        label: 'Kodo Bowl',
        css: 'radial-gradient(80% 60% at 90% 100%, rgba(240,160,40,0.3), transparent 55%), radial-gradient(70% 50% at 5% -5%, rgba(220,60,60,0.22), transparent 55%), repeating-linear-gradient(115deg, transparent 0 34px, rgba(255,255,255,0.015) 34px 36px), #131110',
    },
    // Sterling Hall's quad under an overcast sky — cool academic grey-blues.
    sterling: {
        label: 'Sterling Quad',
        css: 'radial-gradient(110% 75% at 30% -15%, rgba(120,140,170,0.22), transparent 60%), radial-gradient(80% 55% at 85% 110%, rgba(80,95,115,0.18), transparent 55%), #10141a',
    },
};

export const CHARACTER_WALLPAPERS = [
    ['Astrid', 'https://i.postimg.cc/Hx2rzpww/Screenshot-2026-07-18-at-12-19-15-Astrid-Postimages.png'],
    ['Bastet', 'https://i.postimg.cc/76V59x3z/Screenshot-2026-07-18-at-12-20-07-Bastet-Postimages.png'],
    ['Briar', 'https://i.postimg.cc/bv1DG0dk/Screenshot-2026-07-18-at-12-25-14-Tanker-(tanker475)-Img-BB.png'],
    ['Dash', 'https://i.postimg.cc/mDRc7cHg/Screenshot-2026-07-18-at-12-23-07-Weyland-Postimages.png'],
    ['Fawne', 'https://i.postimg.cc/Y9k4Q4WM/Screenshot-2026-07-18-at-12-24-22-Tanker-(tanker475)-Img-BB.png'],
    ['Khepri', 'https://i.postimg.cc/QtbFmXQC/Screenshot-2026-07-18-at-12-20-52-Khepri-Postimages.png'],
    ['Kiera', 'https://i.postimg.cc/LsjYqkhx/Screenshot-2026-07-18-at-12-24-54-Tanker-(tanker475)-Img-BB.png'],
    ['Lyris / Vesper', 'https://i.postimg.cc/pTZmC2fd/Screenshot-2026-07-18-at-12-21-10-Lyris-Postimages.png'],
    ['Miu', 'https://i.postimg.cc/0Qfzn8YJ/Screenshot-2026-07-18-at-12-20-29-Khepri-Postimages.png'],
    ['Neshe', 'https://i.postimg.cc/JtCCB89W/Screenshot-2026-07-18-at-12-18-39-My-Gallery-Postimages.png'],
    ['Rein', 'https://i.postimg.cc/wBDyt53D/Screenshot-2026-07-18-at-12-26-24-Tanker-(tanker475)-Img-BB.png'],
    ['Shani', 'https://i.postimg.cc/QMc9BgVQ/Screenshot-2026-07-18-at-08-57-19-from-Pix-AI-2015093759310897119-2-png-(PNG-Image-1280-960-pixels.png'],
    ['Vera', 'https://i.postimg.cc/4dZKpK9n/Screenshot-2026-07-18-at-12-22-33-Vera-Postimages.png'],
    ['Yue-Lin', 'https://i.postimg.cc/ydBJ0JZN/Screenshot-2026-07-18-at-08-55-00-4-png-(PNG-Image-1280-805-pixels).png'],
].map(([name, url]) => ({ name, url }));

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toggleRowMarkup({ id, label, sub, checked }) {
    return `
<label class="wp-settings-toggle-row">
    <span class="wp-settings-toggle-label">${escapeHtml(label)}${sub ? `<span class="wp-settings-sub">${escapeHtml(sub)}</span>` : ''}</span>
    <span class="wp-toggle-switch">
        <input type="checkbox" id="${id}" class="wp-toggle-input"${checked ? ' checked' : ''} />
        <span class="wp-toggle-track"><span class="wp-toggle-thumb"></span></span>
    </span>
</label>`;
}

function clampPercent(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
}

function modelQuickfills(inputId) {
    return `
        <div class="wp-settings-recommend-row">
            <span class="wp-settings-recommend-label">Recommended:</span>
            <button type="button" class="wp-btn-sm wp-model-quickfill" data-input-id="${inputId}" data-model="${RECOMMENDED_PHONE_MODEL}">${RECOMMENDED_PHONE_MODEL}</button>
            ${ALTERNATE_PHONE_MODELS.map(model => `<button type="button" class="wp-btn-sm wp-model-quickfill" data-input-id="${inputId}" data-model="${model}">${model}</button>`).join('')}
        </div>`;
}

export function renderAppNamesScreen(container, { settings }) {
    container.innerHTML = `
<div class="wp-settings wp-app-names-settings">
    <div class="wp-settings-section">
        <div class="wp-settings-section-title">App Names</div>
        <div class="wp-settings-hint">These names only change how apps are labeled on your WeyPhone.</div>
        ${APP_REGISTRY.map(app => `
        <label class="wp-settings-field">
            <span>${escapeHtml(app.label)}</span>
            <input type="text" class="wp-settings-applabel" data-app-key="${escapeHtml(app.key)}" placeholder="${escapeHtml(app.label)}" value="${escapeHtml(settings.appLabels?.[app.key] ?? '')}" />
        </label>`).join('')}
    </div>
</div>`;
}

export function renderCharacterWallpapersScreen(container, { settings }) {
    const selected = settings.ui?.wallpaper ?? '';
    const wallpaperX = clampPercent(settings.ui?.wallpaperPositionX, 50);
    const wallpaperY = clampPercent(settings.ui?.wallpaperPositionY, 50);
    const wallpaperDim = clampPercent(settings.ui?.wallpaperDim, 20);
    const wallpaperLightWash = clampPercent(settings.ui?.wallpaperLightWash, 0);
    container.innerHTML = `
<div class="wp-settings wp-character-wallpaper-settings">
    <div class="wp-settings-section">
        <div class="wp-settings-section-title">Character Wallpapers</div>
        <div class="wp-settings-hint">Tap a character to use their wallpaper. Then tune the crop and readability below.</div>
        <div class="wp-character-wallpaper-grid">
            ${CHARACTER_WALLPAPERS.map(wallpaper => `
            <button type="button" class="wp-character-wallpaper-card${selected === wallpaper.url ? ' wp-selected' : ''}" data-wallpaper-url="${escapeHtml(wallpaper.url)}">
                <img src="${escapeHtml(wallpaper.url)}" alt="" loading="lazy" />
                <span>${escapeHtml(wallpaper.name)}</span>
            </button>`).join('')}
        </div>
    </div>
    <div class="wp-settings-section">
        <div class="wp-settings-section-title">Wallpaper Focus</div>
        <div class="wp-wallpaper-controls">
            <label class="wp-wallpaper-range"><span>Horizontal focus <output id="wp-wallpaper-x-value">${wallpaperX}%</output></span><input id="wp-settings-wallpaper-x" type="range" min="0" max="100" value="${wallpaperX}" /></label>
            <label class="wp-wallpaper-range"><span>Vertical focus <output id="wp-wallpaper-y-value">${wallpaperY}%</output></span><input id="wp-settings-wallpaper-y" type="range" min="0" max="100" value="${wallpaperY}" /></label>
            <label class="wp-wallpaper-range"><span>Background dimming <small>Default 20%</small> <output id="wp-wallpaper-dim-value">${wallpaperDim}%</output></span><input id="wp-settings-wallpaper-dim" type="range" min="0" max="80" value="${wallpaperDim}" /></label>
            <label class="wp-wallpaper-range"><span>Light wash <small>Default 0%</small> <output id="wp-wallpaper-wash-value">${wallpaperLightWash}%</output></span><input id="wp-settings-wallpaper-wash" type="range" min="0" max="80" value="${wallpaperLightWash}" /></label>
            <div class="wp-settings-hint">Light wash places a translucent white layer over a busy image so dark foreground text stays readable.</div>
        </div>
    </div>
</div>`;
}

/**
 * The Settings app: one scrolling screen of sections.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{
 *   settings: object,
 *   currentLiveModel: string,
 *   logLines: Array<{timestamp: number, message: string}>,
 *   formatClockTime: (ts: number) => string,
 *   batteryStatus?: string,
 * }} state
 */
export function renderSettingsScreen(container, { settings, currentLiveModel, logLines, formatClockTime, batteryStatus = '' }) {
    const wallpaperValue = settings.ui?.wallpaper ?? 'default';
    const isCustomWallpaper = !(wallpaperValue in WALLPAPER_PRESETS);
    const wallpaperX = clampPercent(settings.ui?.wallpaperPositionX, 50);
    const wallpaperY = clampPercent(settings.ui?.wallpaperPositionY, 50);
    const wallpaperDim = clampPercent(settings.ui?.wallpaperDim, 20);
    const wallpaperLightWash = clampPercent(settings.ui?.wallpaperLightWash, 0);

    const wallpaperSection = `
<div class="wp-settings-section">
    <div class="wp-settings-section-title">Wallpaper</div>
    <div class="wp-wallpaper-swatches">
        ${Object.entries(WALLPAPER_PRESETS).map(([key, preset]) => `
        <button type="button" class="wp-wallpaper-swatch${wallpaperValue === key ? ' wp-selected' : ''}" data-wallpaper="${key}" title="${escapeHtml(preset.label)}" aria-label="${escapeHtml(preset.label)}" style="background:${preset.css}"></button>`).join('')}
    </div>
    <button type="button" id="wp-character-wallpapers-button" class="wp-settings-link-row wp-character-wallpapers-link">
        <span>Character wallpapers <small>Browse an alphabetical gallery and adjust each image's focus.</small></span>
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
    </button>
    <input id="wp-settings-wallpaper-url" type="text" placeholder="…or paste a custom image URL" value="${isCustomWallpaper ? escapeHtml(wallpaperValue) : ''}" />
    <div id="wp-settings-wallpaper-controls" class="wp-wallpaper-controls"${isCustomWallpaper ? '' : ' hidden'}>
        <label class="wp-wallpaper-range">
            <span>Horizontal focus <output id="wp-wallpaper-x-value">${wallpaperX}%</output></span>
            <input id="wp-settings-wallpaper-x" type="range" min="0" max="100" value="${wallpaperX}" />
        </label>
        <label class="wp-wallpaper-range">
            <span>Vertical focus <output id="wp-wallpaper-y-value">${wallpaperY}%</output></span>
            <input id="wp-settings-wallpaper-y" type="range" min="0" max="100" value="${wallpaperY}" />
        </label>
        <label class="wp-wallpaper-range">
            <span>Background dimming <small>Default 20%</small> <output id="wp-wallpaper-dim-value">${wallpaperDim}%</output></span>
            <input id="wp-settings-wallpaper-dim" type="range" min="0" max="80" value="${wallpaperDim}" />
        </label>
        <label class="wp-wallpaper-range">
            <span>Light wash <small>Default 0%</small> <output id="wp-wallpaper-wash-value">${wallpaperLightWash}%</output></span>
            <input id="wp-settings-wallpaper-wash" type="range" min="0" max="80" value="${wallpaperLightWash}" />
        </label>
        <div class="wp-settings-hint wp-wallpaper-hints">
            <span>Focus shifts which part of the image stays visible.</span>
            <span>Dimming darkens the image. Light wash adds a translucent white overlay so foreground text stays readable.</span>
        </div>
    </div>
</div>`;

    const labelsSection = `
<div class="wp-settings-section">
    <div class="wp-settings-section-title">App Names</div>
    <button type="button" id="wp-app-names-button" class="wp-settings-link-row">
        <span>View and edit app names <small>Customize labels without crowding the main Settings screen.</small></span>
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
    </button>
</div>`;

    const clockSection = `
<div class="wp-settings-section">
    <div class="wp-settings-section-title">Clock</div>
    ${toggleRowMarkup({
        id: 'wp-settings-rpclock',
        label: 'Roleplay time',
        sub: 'Read the clock from the latest scene header',
        checked: Boolean(settings.ui?.rpClockEnabled),
    })}
</div>`;

    const batterySection = `
<div class="wp-settings-section">
    <div class="wp-settings-section-title">Battery</div>
    ${toggleRowMarkup({
        id: 'wp-settings-battery-tracker',
        label: 'Messages-left battery',
        sub: 'Battery % shows your remaining daily messages',
        checked: Boolean(settings.ui?.batteryTracker),
    })}
    <div class="wp-settings-hint wp-battery-mode-status">${escapeHtml(batteryStatus)}</div>
</div>`;

    const tetherSection = `
<div class="wp-settings-section">
    <div class="wp-settings-section-title">Roleplay Text Tethering <small>Experimental</small></div>
    <div class="wp-settings-hint">Choose Unlinked, Observe, or Linked inside each DM. Linked conversations round-trip through the main roleplay model; Observe is read-only and Unlinked is isolated.</div>
    ${toggleRowMarkup({
        id: 'wp-settings-capture-roleplay-texts',
        label: 'Capture generated phone blocks',
        sub: 'Copy compatible Phone¦ / Texting¦ blocks into WeyPhone automatically',
        checked: Boolean(settings.captureRoleplayTextsEnabled),
    })}
    <div class="wp-settings-field wp-transfer-card wp-tether-import-card">
        <div class="wp-transfer-copy">
            <span>Existing roleplay texts</span>
            <small>Manually capture a missed reply or backfill the active scenario, even when automatic capture is off.</small>
        </div>
        <div class="wp-transfer-actions">
            <button type="button" id="wp-capture-last-roleplay" class="wp-btn-sm">Capture last reply</button>
            <button type="button" id="wp-import-roleplay-texts" class="wp-btn-sm">Scan current roleplay</button>
        </div>
    </div>
    <div class="wp-settings-hint">Unrecognized or ambiguous speakers are left untouched in the roleplay. Captured threads are visible only while their original roleplay is active.</div>
</div>`;

    const modelSection = `
<div class="wp-settings-section">
    <div class="wp-settings-section-title">Generation Model</div>
    <label class="wp-settings-field wp-settings-field-column" title="Model ID used for Chronicle, Chitter, Discorgi, and Yip Yap Sync. It never affects your main chat connection.">
        <span>Model for social-app Sync <small>(blank = current chat model)</small></span>
        <div class="wp-settings-inline">
            <input id="wp-settings-model" type="text" placeholder="${escapeHtml(currentLiveModel || 'model id')}" value="${escapeHtml(settings.modelOverride ?? '')}" />
            <button type="button" class="wp-btn-sm wp-settings-use-current-model" data-input-id="wp-settings-model" title="Copy the active chat model">Use current</button>
        </div>
        ${modelQuickfills('wp-settings-model')}
    </label>
    <label class="wp-settings-field wp-settings-field-column" title="Model ID used when requesting replies in Messages. It never affects Sync or your main chat connection.">
        <span>Texting model <small>(blank = current chat model)</small></span>
        <div class="wp-settings-inline">
            <input id="wp-settings-texting-model" type="text" placeholder="${escapeHtml(currentLiveModel || 'model id')}" value="${escapeHtml(settings.textingModelOverride ?? '')}" />
            <button type="button" class="wp-btn-sm wp-settings-use-current-model" data-input-id="wp-settings-texting-model" title="Copy the active chat model">Use current</button>
        </div>
        ${modelQuickfills('wp-settings-texting-model')}
        <small class="wp-settings-recommend-disclaimer"><strong>Lucky strongly recommends Minimax M3 or DeepSeek V4</strong> for WeyPhone generation. He asks that users avoid Sonnet here so Sonnet capacity stays available to the wider community.</small>
    </label>
</div>`;

    const behaviorSection = `
<div class="wp-settings-section">
    <div class="wp-settings-section-title">Generation Behavior</div>
    ${toggleRowMarkup({
        id: 'wp-settings-hard-mode',
        label: 'Allow Hard Mode in WeyPhone',
        sub: 'Apply Weyland Hard Mode to supported phone requests while the global Hard Mode toggle is on',
        checked: Boolean(settings.phoneHardModeEnabled),
    })}
    <div class="wp-settings-hint">Off by default. The global storytelling toggle cannot affect WeyPhone unless you enable this. Kressa has her own independent setting.</div>
</div>`;

    const formatSection = `
<div class="wp-settings-section wp-format-section">
    <div class="wp-settings-section-title">Device</div>
    <div class="wp-settings-field wp-format-row">
        <span>Format WeyPhone <small>Erase conversations, memories, notes, cached feeds, saved posts, and preferences.</small></span>
        <button type="button" id="wp-format-button" class="wp-btn-sm wp-danger-button">Format</button>
    </div>
</div>`;

    const transferSection = `
<div class="wp-settings-section">
    <div class="wp-settings-section-title">Backup &amp; Transfer</div>
    <div class="wp-settings-field wp-transfer-card">
        <span>Move this WeyPhone <small>Includes chats, memories, notes, saved posts, PawXai prompts, wallpaper, and every app preference. API keys are not stored by WeyPhone.</small></span>
        <div class="wp-transfer-actions">
            <button type="button" id="wp-export-button" class="wp-btn-sm"><i class="fa-solid fa-file-export"></i> Export</button>
            <button type="button" id="wp-import-button" class="wp-btn-sm"><i class="fa-solid fa-file-import"></i> Import</button>
            <input id="wp-import-file" type="file" accept="application/json,.json" hidden />
        </div>
    </div>
</div>`;

    const logSection = `
<div class="wp-settings-section">
    <div class="wp-settings-section-title">Logs <button type="button" id="wp-settings-log-copy" class="wp-btn-sm">Copy</button></div>
    <div id="wp-settings-log">${logLines.length === 0
        ? '<div class="wp-settings-hint">Nothing logged yet this session.</div>'
        : logLines.map(line => `<div class="wp-settings-log-line"><span>${escapeHtml(formatClockTime(line.timestamp))}</span> ${escapeHtml(line.message)}</div>`).join('')}</div>
</div>`;

    container.innerHTML = `
<div class="wp-settings">
    ${wallpaperSection}
    ${clockSection}
    ${batterySection}
    ${tetherSection}
    ${modelSection}
    ${behaviorSection}
    ${labelsSection}
    ${transferSection}
    ${logSection}
    ${formatSection}
    <div class="wp-settings-credit">
        <i class="fa-solid fa-heart" aria-hidden="true"></i>
        <div class="wp-settings-credit-copy">
            <strong class="wp-settings-credit-v2">WeyPhone V2 by Kressa and Lucky</strong>
            <div class="wp-settings-credit-v1">Based on the original WeyPhone V1 project by <strong>@aerosplat</strong>.<br />WeyPhone V1 walked so we could run.<br />Thank you, Aero!~</div>
        </div>
    </div>
</div>
<div id="wp-format-dialog" class="wp-format-dialog" hidden>
    <div class="wp-format-dialog-card" role="dialog" aria-modal="true" aria-labelledby="wp-format-dialog-title">
        <div id="wp-format-dialog-title" class="wp-format-dialog-title">Format this WeyPhone?</div>
        <div class="wp-format-dialog-copy">Everything stored inside WeyPhone will be erased. This cannot be undone, and first-time setup will begin again.</div>
        <div class="wp-format-dialog-actions">
            <button type="button" id="wp-format-cancel" class="wp-btn-sm">Cancel</button>
            <button type="button" id="wp-format-confirm" class="wp-btn-sm wp-danger-button">Erase everything</button>
        </div>
    </div>
</div>`;
}
