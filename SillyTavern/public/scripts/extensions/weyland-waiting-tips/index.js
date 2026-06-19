import { eventSource, event_types } from '../../events.js';
import { saveSettingsDebounced } from '../../../script.js';

const MODULE_NAME = 'weyland-waiting-tips';
const TIPS_URL = 'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnQIRzOIPpOg_WpRhXi2GixU_VCZD7I98tD_hgfPtFts_Q0J7q6C8CW4l1ZXRXsXOgsmXezVTPSXjo_WCF7fPy4NJk4__jGq29EdMgO-McVPyYW_O-g7AyJzUDAHGDkD3BDFZEKk716zokFp-9f_9ySuOtTf0aCFfeC6PxhAGsrXl8XMGgPyPghoGXgW3tiI--AWyuESWSFLFC7_nGCvyal7fwX2gnik83eJ2WfTGKvxnKtDjS984w0Y3wyiEbenHcOMyFGFoV1vju9hraSkVFHEHjTlBw&lib=MLc3VyvYzeD8UqArkcFgV53Qa-NNQ1Z9i';
const SEEN_MUST_SEE_KEY = `${MODULE_NAME}_seenMustSee`;
const AUTO_CYCLE_MS = 45000;
const TIP_CAROUSEL_MS = 280;
const SKIP_GENERATION_TYPES = new Set(['quiet', 'impersonate']);

/** Set to a tip Key to always show that entry; null for normal rotation. */
const DEBUG_PIN_TIP_KEY = null;

/** Shipped locally so the panel still works if the remote feed is unreachable. */
const FALLBACK_TIPS = [
    { Key: 'fallback-loading', Rarity: 'Common', Title: 'Hang tight', Tip: 'Your reply is on the way.' },
    { Key: 'character-downloader', Rarity: 'Must See', Title: 'Character Downloader', Tip: 'Looking for more official characters? You can find them in the [[Character Downloader]].' },
    { Key: 'weybooru-viewer', Rarity: 'Common', Title: 'Weybooru Viewer', Tip: 'You can browse community created artwork in the [[Weybooru Viewer]] while you wait for messages.' },
];


const RARITY_WEIGHTS = {
    'Common': 100,
    'Uncommon': 40,
    'Rare': 12,
    'Easter Egg': 1,
};

const { extensionSettings, renderExtensionTemplateAsync } = SillyTavern.getContext();

const defaults = {
    enabled: true,
};

/** @type {{ enabled: boolean }} */
let settings = defaults;

/** @type {Array<{ Key: string, Rarity: string, Title?: string, Tip: string, Length?: number, Notes?: string }>} */
let tipsCatalog = [];

const session = {
    history: [],
    idx: 0,
    autoAdvanceEnabled: true,
    open: false,
    autoTimer: null,
    waiting: false,
};

let tipCarouselGen = 0;
/** @type {{ key: string | null, html: string }} */
let tipDisplayed = { key: null, html: '' };

function getSettings() {
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaults);
    }
    const s = extensionSettings[MODULE_NAME];
    for (const k of Object.keys(defaults)) {
        if (s[k] === undefined) s[k] = defaults[k];
    }
    settings = s;
    return s;
}

function getSeenMustSeeKeys() {
    try {
        const raw = localStorage.getItem(SEEN_MUST_SEE_KEY);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr : []);
    } catch {
        return new Set();
    }
}

function markMustSeeSeen(key) {
    if (!key) return;
    const seen = getSeenMustSeeKeys();
    if (seen.has(key)) return;
    seen.add(key);
    try {
        localStorage.setItem(SEEN_MUST_SEE_KEY, JSON.stringify([...seen]));
    } catch {
        /* quota / private mode */
    }
}

function effectiveRarity(tip, seenMustSee) {
    const rarity = String(tip?.Rarity || 'Common').trim();
    if (rarity === 'Must See' && seenMustSee.has(tip.Key)) {
        return 'Common';
    }
    return rarity;
}

function pickWeightedRandom(candidates) {
    if (!candidates.length) return null;
    let total = 0;
    const weights = candidates.map((tip) => {
        const w = RARITY_WEIGHTS[effectiveRarity(tip, getSeenMustSeeKeys())] ?? RARITY_WEIGHTS['Common'];
        total += w;
        return w;
    });
    if (total <= 0) return candidates[Math.floor(Math.random() * candidates.length)];
    let roll = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
}

function pickNextTip() {
    if (!tipsCatalog.length) return null;

    if (DEBUG_PIN_TIP_KEY) {
        const pinned = tipsCatalog.find((t) => t.Key === DEBUG_PIN_TIP_KEY);
        if (!pinned) {
            console.warn(`[${MODULE_NAME}] DEBUG_PIN_TIP_KEY not found: ${DEBUG_PIN_TIP_KEY}`);
        }
        return pinned ?? null;
    }

    const seenMustSee = getSeenMustSeeKeys();
    const unseenMustSee = tipsCatalog.filter(
        (t) => String(t.Rarity || '').trim() === 'Must See' && t.Key && !seenMustSee.has(t.Key),
    );
    if (unseenMustSee.length) {
        return unseenMustSee[Math.floor(Math.random() * unseenMustSee.length)];
    }

    const shownKeys = new Set(session.history.map((t) => t.Key));
    let pool = tipsCatalog.filter((t) => !shownKeys.has(t.Key));
    if (!pool.length) pool = [...tipsCatalog];

    return pickWeightedRandom(pool);
}

function getTipTitle(tip) {
    const title = String(tip?.Title || '').trim();
    if (title) return title;
    return 'Did you know?';
}

/** In-tip [[Label]] tokens that open SillyTavern extension UIs. */
const ST_FEATURE_LINKS = {
    'Character Downloader': 'character-downloader',
    'Weybooru Viewer': 'weybooru-viewer',
};

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function replaceStFeatureLinks(html) {
    return String(html || '').replace(/\[\[([^[\]]+)\]\]/g, (match, label) => {
        const trimmed = label.trim();
        const feature = ST_FEATURE_LINKS[trimmed];
        if (!feature) return match;
        return `<button type="button" class="wwt-feature-link" data-wwt-feature="${feature}">${escapeHtml(trimmed)}</button>`;
    });
}

async function openCharacterDownloader() {
    const btn = document.getElementById('wt-char-menu-btn')
        || document.getElementById('wt-nav-button')
        || document.getElementById('weylandOpenDownloader');
    if (btn instanceof HTMLElement) {
        btn.click();
        return;
    }
    const modal = document.getElementById('wt-modal-overlay');
    if (modal instanceof HTMLElement) {
        modal.style.display = 'flex';
    }
}

async function openWeybooruViewer() {
    const menuItem = document.getElementById('wbv-menu-item');
    if (menuItem instanceof HTMLElement) {
        menuItem.click();
        return;
    }
    const ctx = SillyTavern.getContext();
    if (ctx?.executeSlashCommandsWithOptions) {
        try {
            await ctx.executeSlashCommandsWithOptions('/weybooru');
            return;
        } catch (e) {
            console.warn(`[${MODULE_NAME}] /weybooru slash command failed`, e);
        }
    }
    const modal = document.getElementById('wbv-modal-overlay');
    if (modal instanceof HTMLElement) {
        modal.style.display = 'flex';
    }
}

function openStFeature(feature) {
    if (feature === 'character-downloader') {
        void openCharacterDownloader();
    } else if (feature === 'weybooru-viewer') {
        void openWeybooruViewer();
    }
}

/** Pull img.right out of inline flow so text sits left and the image scales to row height. */
function layoutTipWithRightImage(root) {
    const rightImg = root.querySelector('img.right');
    if (!rightImg) return;

    const layout = document.createElement('div');
    layout.className = 'wwt-tip-layout wwt-tip-layout--right-img';

    const textCol = document.createElement('div');
    textCol.className = 'wwt-tip-text';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'wwt-tip-img-wrap';

    rightImg.remove();
    imgWrap.appendChild(rightImg);

    while (root.firstChild) {
        textCol.appendChild(root.firstChild);
    }

    layout.appendChild(textCol);
    layout.appendChild(imgWrap);
    root.appendChild(layout);
}

/** Ensure tip links open in a new tab; wire [[Feature]] deep links. */
function prepareTipHtml(html) {
    const raw = replaceStFeatureLinks(String(html || ''));
    if (!raw) return '';
    const wrap = document.createElement('div');
    wrap.innerHTML = raw;
    wrap.querySelectorAll('a[href]').forEach((anchor) => {
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
    });
    layoutTipWithRightImage(wrap);
    return wrap.innerHTML;
}

function syncAutoAdvanceUi() {
    const toggle = $('#wwt-auto-toggle');
    if (!toggle.length) return;
    toggle.toggleClass('wwt-auto--off', !session.autoAdvanceEnabled);
    toggle.attr('aria-pressed', session.autoAdvanceEnabled ? 'true' : 'false');
    toggle.attr('title', session.autoAdvanceEnabled ? 'Disable auto-advance' : 'Enable auto-advance');
    $('#wwt-overlay .wwt-foot').toggleClass('wwt-auto-paused', !session.autoAdvanceEnabled);
}

function setAutoAdvanceEnabled(enabled) {
    session.autoAdvanceEnabled = !!enabled;
    syncAutoAdvanceUi();
    if (session.autoAdvanceEnabled) {
        resetAutoTimer();
    } else {
        clearAutoTimer();
        $('#wwt-timer-bar').removeClass('wwt-timer-bar--anim');
    }
}

function bumpTipCarouselGen() {
    tipCarouselGen++;
    return tipCarouselGen;
}

function stripTipMotionClasses($el) {
    $el.off('transitionend.wwtTipSlide');
    $el.removeClass(
        'wwt-tip--no-trans wwt-tip--out-left wwt-tip--out-right wwt-tip--prep-right wwt-tip--prep-left',
    );
}

function clearTipCarouselState($el) {
    bumpTipCarouselGen();
    tipDisplayed = { key: null, html: '' };
    if ($el?.length) {
        stripTipMotionClasses($el);
        $el.empty();
    }
}

/**
 * @param {JQuery} $el
 * @param {string} html
 * @param {string} key
 * @param {'next' | 'prev' | null} dir
 */
function animateTipContent($el, html, key, dir) {
    if (!$el.length) return;

    const el = $el[0];
    const prev = tipDisplayed;
    const prepared = prepareTipHtml(html);

    if (!prepared) {
        clearTipCarouselState($el);
        return;
    }

    if (!dir || prev.key === null) {
        bumpTipCarouselGen();
        stripTipMotionClasses($el);
        $el.html(prepared);
        tipDisplayed = { key, html: prepared };
        return;
    }

    const myGen = bumpTipCarouselGen();
    stripTipMotionClasses($el);
    $el.html(prev.html || prepared);

    const outCls = dir === 'next' ? 'wwt-tip--out-left' : 'wwt-tip--out-right';
    const prepCls = dir === 'next' ? 'wwt-tip--prep-right' : 'wwt-tip--prep-left';

    void el.offsetWidth;
    $el.addClass(outCls);

    let outFailSafe = setTimeout(() => {
        outFailSafe = null;
        $el.off('transitionend.wwtTipSlide', onOutDone);
        if (myGen === tipCarouselGen) runPrepAndSlideIn();
    }, TIP_CAROUSEL_MS + 120);

    function finishSlideIn() {
        if (myGen !== tipCarouselGen) return;
        stripTipMotionClasses($el);
        tipDisplayed = { key, html: prepared };
    }

    function runPrepAndSlideIn() {
        if (myGen !== tipCarouselGen) return;
        $el.removeClass('wwt-tip--out-left wwt-tip--out-right');
        $el.addClass(`wwt-tip--no-trans ${prepCls}`).html(prepared);
        void el.offsetWidth;
        $el.removeClass('wwt-tip--no-trans');
        void el.offsetWidth;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (myGen !== tipCarouselGen) return;
                $el.removeClass(prepCls);
                let inFailSafe = setTimeout(() => {
                    inFailSafe = null;
                    $el.off('transitionend.wwtTipSlide', onInDone);
                    finishSlideIn();
                }, TIP_CAROUSEL_MS + 120);
                function onInDone(e) {
                    if (e.target !== el || myGen !== tipCarouselGen) return;
                    if (e.propertyName !== 'transform') return;
                    if (inFailSafe) {
                        clearTimeout(inFailSafe);
                        inFailSafe = null;
                    }
                    $el.off('transitionend.wwtTipSlide', onInDone);
                    finishSlideIn();
                }
                $el.on('transitionend.wwtTipSlide', onInDone);
            });
        });
    }

    function onOutDone(e) {
        if (e.target !== el || myGen !== tipCarouselGen) return;
        if (e.propertyName !== 'transform') return;
        if (outFailSafe) {
            clearTimeout(outFailSafe);
            outFailSafe = null;
        }
        $el.off('transitionend.wwtTipSlide', onOutDone);
        runPrepAndSlideIn();
    }

    $el.on('transitionend.wwtTipSlide', onOutDone);
}

function clearAutoTimer() {
    if (session.autoTimer) {
        clearTimeout(session.autoTimer);
        session.autoTimer = null;
    }
}

function resetAutoTimer() {
    clearAutoTimer();
    if (!session.open || !session.waiting || !session.autoAdvanceEnabled) return;

    const $bar = $('#wwt-timer-bar');
    $bar.removeClass('wwt-timer-bar--anim');
    void $bar[0]?.offsetWidth;
    $bar.addClass('wwt-timer-bar--anim');

    session.autoTimer = setTimeout(() => {
        session.autoTimer = null;
        navigateTip(1, false);
    }, AUTO_CYCLE_MS);
}

function playPanelEnterAnimation() {
    const panel = $('#wwt-overlay .wwt-panel');
    if (!panel.length) return;
    panel.addClass('wwt-panel--enter');
    void panel[0].offsetWidth;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            panel.removeClass('wwt-panel--enter');
        });
    });
}

function syncDom(dir = null, { animateEnter = false } = {}) {
    const overlay = $('#wwt-overlay');
    if (!overlay.length) return;

    const cur = session.history[session.idx];
    const wasOpen = overlay.hasClass('wwt-visible');

    overlay.toggleClass('wwt-visible', session.open);
    overlay.attr('aria-hidden', session.open ? 'false' : 'true');

    if (animateEnter && session.open && !wasOpen) {
        playPanelEnterAnimation();
    }

    $('#wwt-prev').prop('disabled', session.idx <= 0);
    $('#wwt-next').prop('disabled', false);

    if (cur) {
        $('#wwt-head-title').text(getTipTitle(cur));
        animateTipContent($('#wwt-tip'), cur.Tip || '', cur.Key || '', dir);
        const rarity = String(cur.Rarity || 'Common').trim();
        if (rarity === 'Must See' && cur.Key) {
            markMustSeeSeen(cur.Key);
        }
    } else {
        $('#wwt-head-title').text('');
        clearTipCarouselState($('#wwt-tip'));
    }

    syncAutoAdvanceUi();
}

function appendNewTip() {
    const tip = pickNextTip();
    if (!tip) return false;
    session.history.push(tip);
    session.idx = session.history.length - 1;
    return true;
}

/**
 * @param {number} delta
 * @param {boolean} manual
 */
function navigateTip(delta, manual = true) {
    if (!session.waiting) return;

    if (manual) {
        setAutoAdvanceEnabled(false);
    }

    if (delta < 0) {
        if (session.idx <= 0) return;
        session.idx--;
        syncDom('prev');
        if (!manual) resetAutoTimer();
        return;
    }

    if (session.idx < session.history.length - 1) {
        session.idx++;
        syncDom('next');
        if (!manual) resetAutoTimer();
        return;
    }

    if (!appendNewTip()) return;
    syncDom('next');
    if (!manual) resetAutoTimer();
}

function resetSessionHistory() {
    session.history = [];
    session.idx = 0;
    session.autoAdvanceEnabled = true;
    clearTipCarouselState($('#wwt-tip'));
}

function isActivelyGenerating() {
    return document.body?.dataset?.generating === 'true';
}

function shouldShowForGeneration(type, dryRun) {
    if (dryRun) return false;
    if (type && SKIP_GENERATION_TYPES.has(type)) return false;
    return true;
}

function showOverlay() {
    if (!getSettings().enabled) return;
    if (!tipsCatalog.length) return;
    if (session.waiting) return;

    session.waiting = true;
    session.open = true;
    session.autoAdvanceEnabled = true;
    resetSessionHistory();
    appendNewTip();
    syncDom(null, { animateEnter: true });
    resetAutoTimer();
}

function hideOverlay(persistClose = false) {
    session.open = false;
    session.waiting = false;
    clearAutoTimer();
    syncDom(null);

    if (persistClose) {
        getSettings().enabled = false;
        $('#wwt-enabled').prop('checked', false);
        saveSettingsDebounced();
    }
}

function ensureOverlayBuilt() {
    if ($('#wwt-overlay').length) return;

    const html = `
<div id="wwt-overlay" aria-hidden="true">
  <div class="wwt-panel" role="dialog" aria-labelledby="wwt-head-title">
    <div class="wwt-head">
      <div class="wwt-head-left">
        <div class="wwt-spinner" aria-hidden="true"></div>
        <div class="wwt-head-title" id="wwt-head-title"></div>
      </div>
      <button type="button" class="wwt-close" id="wwt-close" title="Hide tips" aria-label="Hide tips">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="wwt-body" id="wwt-swipe-area">
      <div class="wwt-navrow">
        <button type="button" class="wwt-arrow" id="wwt-prev" aria-label="Previous tip">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="wwt-tip-stage">
          <div class="wwt-tip" id="wwt-tip"></div>
        </div>
        <button type="button" class="wwt-arrow" id="wwt-next" aria-label="Next tip">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
    </div>
    <div class="wwt-foot">
      <div class="wwt-timer-track" aria-hidden="true">
        <div class="wwt-timer-bar" id="wwt-timer-bar"></div>
      </div>
      <span class="wwt-foot-hint">swipe · <button type="button" class="wwt-auto-toggle" id="wwt-auto-toggle" aria-pressed="true">auto</button></span>
    </div>
  </div>
</div>`;

    $('body').append(html);
    $('#wwt-overlay').css('--wwt-auto-cycle-s', AUTO_CYCLE_MS / 1000);
    wireOverlayEvents();
}

function wireOverlayEvents() {
    $('#wwt-close').on('click', (e) => {
        e.stopPropagation();
        hideOverlay(true);
    });

    $('#wwt-prev').on('click', (e) => {
        e.stopPropagation();
        navigateTip(-1, true);
    });

    $('#wwt-next').on('click', (e) => {
        e.stopPropagation();
        navigateTip(1, true);
    });

    $('#wwt-auto-toggle').on('click', (e) => {
        e.stopPropagation();
        setAutoAdvanceEnabled(!session.autoAdvanceEnabled);
    });

    // Tip body links: external hrefs in a new tab; [[Feature]] opens in ST.
    $('#wwt-tip').on('click', '.wwt-feature-link', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openStFeature(String($(this).data('wwt-feature') || ''));
    });

    $('#wwt-tip').on('click', 'a[href]', function (e) {
        e.stopPropagation();
        const href = $(this).attr('href');
        if (!href || href.startsWith('#')) return;
        e.preventDefault();
        window.open(href, '_blank', 'noopener,noreferrer');
    });

    const swipeArea = document.getElementById('wwt-swipe-area');
    if (!swipeArea) return;

    let x0 = null;
    let y0 = null;
    let t0 = null;
    let touchId = null;

    const SWIPE_MIN = 50;
    const SWIPE_DOM = 1.25;
    const SWIPE_MAX_MS = 900;
    const SWIPE_COMMIT = 14;

    swipeArea.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        if (!t) return;
        x0 = t.clientX;
        y0 = t.clientY;
        t0 = Date.now();
        touchId = t.identifier;
    }, { passive: true });

    swipeArea.addEventListener('touchmove', (e) => {
        if (x0 == null) return;
        const t = Array.from(e.touches).find((x) => x.identifier === touchId);
        if (!t) return;
        const dx = t.clientX - x0;
        const dy = t.clientY - y0;
        if (Math.abs(dx) < SWIPE_COMMIT) return;
        if (Math.abs(dx) < Math.abs(dy) * SWIPE_DOM) return;
    }, { passive: true });

    swipeArea.addEventListener('touchend', (e) => {
        if (x0 == null || t0 == null) return;
        const t = Array.from(e.changedTouches).find((x) => x.identifier === touchId) || e.changedTouches[0];
        if (!t) {
            x0 = y0 = t0 = touchId = null;
            return;
        }
        const dt = Date.now() - t0;
        const dx = t.clientX - x0;
        const dy = t.clientY - y0;
        x0 = y0 = t0 = touchId = null;
        const ok = dt <= SWIPE_MAX_MS
            && Math.abs(dx) >= SWIPE_MIN
            && Math.abs(dx) >= Math.abs(dy) * SWIPE_DOM;
        if (ok) {
            if (dx > 0) navigateTip(-1, true);
            else navigateTip(1, true);
        }
    }, { passive: true });
}

function applyTipsCatalog(data) {
    tipsCatalog = Array.isArray(data)
        ? data.filter((t) => t && t.Key && t.Tip)
        : [];
    if (!tipsCatalog.length) {
        tipsCatalog = [...FALLBACK_TIPS];
    }
}

async function loadTipsCatalog() {
    try {
        const res = await fetch(TIPS_URL, { method: 'GET', credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        applyTipsCatalog(await res.json());
        console.debug(`[${MODULE_NAME}] Loaded ${tipsCatalog.length} tips.`);
    } catch (e) {
        console.warn(`[${MODULE_NAME}] Failed to load tips, using fallback set:`, e);
        applyTipsCatalog(FALLBACK_TIPS);
    }
}

async function addExtensionSettings() {
    const template = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
    const target = document.getElementById('extensions_settings2')
        || document.getElementById('extensions_settings');
    if (target) {
        $(target).append(template);
    }

    const s = getSettings();
    $('#wwt-enabled').prop('checked', s.enabled).on('input', function () {
        s.enabled = !!$(this).prop('checked');
        saveSettingsDebounced();
        if (!s.enabled && session.open) {
            hideOverlay(false);
        }
    });
}

function onWaitStart(type, dryRun) {
    if (!shouldShowForGeneration(type, dryRun)) return;
    if (session.waiting && !isActivelyGenerating() && !session.open) {
        session.waiting = false;
    }
    ensureOverlayBuilt();
    showOverlay();
}

function onWaitEnd() {
    if (!session.open && !session.waiting) return;
    hideOverlay(false);
}

function bindEvents() {
    const tryStart = (type, _params, dryRun) => onWaitStart(type, dryRun);

    eventSource.on(event_types.GENERATION_STARTED, tryStart);
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, tryStart);

    // Fires after the user message is committed — backup if generation events were missed.
    eventSource.on(event_types.USER_MESSAGE_RENDERED, () => {
        if (!isActivelyGenerating()) return;
        onWaitStart(undefined, false);
    });

    eventSource.on(event_types.GENERATION_ENDED, onWaitEnd);
    eventSource.on(event_types.GENERATION_STOPPED, onWaitEnd);

    eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
        if (!session.waiting) return;
        const context = SillyTavern.getContext();
        const message = context?.chat?.[messageId];
        if (message && !message.is_user && !message.is_system) {
            onWaitEnd();
        }
    });
}

applyTipsCatalog(FALLBACK_TIPS);
bindEvents();

jQuery(async () => {
    console.debug(`[${MODULE_NAME}] Initializing`);
    getSettings();
    ensureOverlayBuilt();
    await Promise.all([loadTipsCatalog(), addExtensionSettings()]);
});
