// lib/ui/apps/clock.js
//
// Render layer for the Clock app. Pure markup only — no state, no engine. The live timer run-state
// (running/paused/remaining) is owned by index.js and handed in via `runtimeOf(timer)`; this file
// just draws whatever snapshot it's given. Follows the notes.js template: one render function per
// screen, delegated event handling lives in index.js.
//
// Increment 2 scope: Timers are fully functional on REAL time. Alarms + roleplay-time are stubbed
// here and land in later increments; the per-item time-mode selector already persists the user's
// choice so no saved data has to change when the roleplay engine arrives.

import { formatDuration, timerFraction, TIME_MODE, RECURRENCE } from '../../clockStorage.js';

// Progress-ring geometry. The SVG viewBox is 0..80; r=34 leaves room for the stroke width.
const RING_RADIUS = 34;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** stroke-dashoffset for a given 0..1 fill fraction (full ring at 1, empty at 0). */
export function ringDashoffset(fraction) {
    return RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, fraction)));
}

/** Human label for a sound URL/path — the filename without its extension. */
export function pickerBasename(url) {
    const name = String(url || '').split('/').pop() || '';
    try { return decodeURIComponent(name).replace(/\.[^.]+$/, '') || 'Sound'; }
    catch { return name.replace(/\.[^.]+$/, '') || 'Sound'; }
}

/** The "Sound / Choose" row shown in an editor. `soundUrl` empty = the default beep. */
function soundTriggerMarkup(soundUrl) {
    // Pasted URLs are shown whole (CSS ellipsis trims the tail); only local files get a clean
    // filename label — stripping a URL down to its last path segment reads like it was truncated.
    const label = !soundUrl ? 'Default beep'
        : (/^https?:\/\//i.test(soundUrl) ? soundUrl : pickerBasename(soundUrl));
    return `
<div class="wp-settings-field wp-settings-field-column">
    <span>Sound <small>(optional)</small></span>
    <div class="wp-picker-trigger">
        <span class="wp-picker-current" title="${escapeHtml(soundUrl || 'Default beep')}">${escapeHtml(label)}</span>
        <button type="button" class="wp-btn-sm wp-clock-choose" data-picker="sound">Choose</button>
    </div>
</div>`;
}

/** The "Image / Choose" row shown in an editor. `imageUrl` empty = no image (icon fallback fires). */
function imageTriggerMarkup(imageUrl) {
    return `
<div class="wp-settings-field wp-settings-field-column">
    <span>Image <small>(optional)</small></span>
    <div class="wp-picker-trigger">
        ${imageUrl ? `<img class="wp-picker-thumb" src="${escapeHtml(imageUrl)}" alt="" />` : '<span class="wp-picker-current">None</span>'}
        <button type="button" class="wp-btn-sm wp-clock-choose" data-picker="image">Choose</button>
    </div>
</div>`;
}

/** A grid of selectable image tiles. */
function imageGridMarkup(urls, currentValue) {
    return `<div class="wp-picker-image-grid">${urls.map(url => `
<button type="button" class="wp-picker-image${currentValue === url ? ' wp-selected' : ''}" data-image-url="${escapeHtml(url)}"><img src="${escapeHtml(url)}" alt="" loading="lazy" /></button>`).join('')}</div>`;
}

/**
 * The sound OR image picker screen. `items` is null while loading; for 'sound' an array of
 * { label, url }, for 'image' (root level) an array of greeting url strings. `imgNav` drives the
 * image picker's two levels: { level:'root'|'char', char, characters:[names], costumeData }.
 * @param {HTMLElement} container #wp-screen-body
 */
export function renderClockPickerScreen(container, { field, items, currentValue, imgNav }) {
    let content;
    // A character's costumes, each a section with its own image grid.
    if (field === 'image' && imgNav?.level === 'char') {
        let sections;
        if (imgNav.costumeData === null) sections = `<div class="wp-picker-loading">Loading ${escapeHtml(imgNav.char)}…</div>`;
        else if (imgNav.costumeData.length === 0) sections = `<div class="wp-picker-empty">No sprite folders found for ${escapeHtml(imgNav.char)}.</div>`;
        else sections = imgNav.costumeData.map(group => `
<div class="wp-picker-section-title">${escapeHtml(group.label)}</div>
${imageGridMarkup(group.images, currentValue)}`).join('');
        content = `
<button type="button" class="wp-picker-back" id="wp-picker-char-back"><i class="fa-solid fa-chevron-left"></i> ${escapeHtml(imgNav.char)}</button>
${sections}`;
        container.innerHTML = `<div class="wp-clock-picker">${content}</div>`;
        return;
    }
    // The greeting-images folder.
    if (field === 'image' && imgNav?.level === 'greetings') {
        let grid;
        if (items === null) grid = `<div class="wp-picker-loading">Loading images…</div>`;
        else if (items.length === 0) grid = `<div class="wp-picker-empty">No greeting images found in <code>user/images/Weyland</code>.</div>`;
        else grid = imageGridMarkup(items, currentValue);
        content = `
<button type="button" class="wp-picker-back" id="wp-picker-greetings-back"><i class="fa-solid fa-chevron-left"></i> Greetings</button>
${grid}`;
        container.innerHTML = `<div class="wp-clock-picker">${content}</div>`;
        return;
    }
    if (field === 'image') {
        // Root: a clean folder list — No image, a "Greetings" folder, then each character.
        const noneRow = `<button type="button" class="wp-picker-none${!currentValue ? ' wp-selected' : ''}" data-image-url="">No image</button>`;
        const chars = Array.isArray(imgNav?.characters) ? imgNav.characters : [];
        const charList = chars.length
            ? `<div class="wp-picker-char-list">${chars.map(name => `<button type="button" class="wp-picker-char-btn" data-img-char="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')}</div>`
            : '';
        content = `${noneRow}
<div class="wp-picker-section-title">Weyland Greetings</div>
<div class="wp-picker-char-list"><button type="button" class="wp-picker-char-btn" id="wp-picker-greetings-btn">Greetings</button></div>
<div class="wp-picker-section-title">Characters</div>${charList}`;
    } else {
        const defaultRow = `<button type="button" class="wp-picker-row${!currentValue ? ' wp-selected' : ''}" data-sound-url="">Default beep</button>`;
        let list;
        if (items === null) list = `<div class="wp-picker-loading">Loading sounds…</div>`;
        else if (items.length === 0) list = `<div class="wp-picker-empty">No sounds in your <code>assets/bgm</code> folder yet.</div>`;
        else list = items.map(item => `
<div class="wp-picker-row-wrap">
    <button type="button" class="wp-picker-row${currentValue === item.url ? ' wp-selected' : ''}" data-sound-url="${escapeHtml(item.url)}">${escapeHtml(item.label)}</button>
    <button type="button" class="wp-picker-preview" data-preview-url="${escapeHtml(item.url)}" title="Preview" aria-label="Preview"><i class="fa-solid fa-play"></i></button>
</div>`).join('');
        content = `<div class="wp-picker-section-title">Built in</div>${defaultRow}<div class="wp-picker-section-title">Your sounds <small>(assets/bgm)</small></div>${list}`;
    }
    container.innerHTML = `
<div class="wp-clock-picker">
    ${content}
    <div class="wp-picker-url">
        <input type="text" id="wp-picker-url-input" placeholder="…or paste ${field === 'image' ? 'an image' : 'a sound'} URL" />
        <button type="button" class="wp-btn-sm" id="wp-picker-url-use">Use</button>
    </div>
</div>`;
}

function tabsMarkup(activeTab) {
    const tab = (key, label) => `
<button type="button" class="wp-clock-tab${activeTab === key ? ' wp-clock-tab-active' : ''}" data-clock-tab="${key}">${label}</button>`;
    return `<div class="wp-clock-tabs">${tab('timers', 'Timers')}${tab('alarms', 'Alarms')}</div>`;
}

/**
 * The app-wide Time-source control. Drives the phone's displayed clock AND the concrete mode fresh
 * timers/alarms start on. Pressing either segment toggles (handled in index.js), so data-default-mode
 * is only a marker of which side was tapped.
 */
function defaultControlMarkup(defaultMode) {
    const seg = (mode, label) => `<button type="button" class="wp-clock-default-btn${defaultMode === mode ? ' wp-selected' : ''}" data-default-mode="${mode}">${label}</button>`;
    return `
<div class="wp-clock-default">
    <span class="wp-clock-default-label">Time source</span>
    <div class="wp-clock-default-seg">${seg(TIME_MODE.REAL, 'Real')}${seg(TIME_MODE.RP, 'Roleplay')}</div>
</div>`;
}

/** One control button in a timer card. `action` is read back in index.js's click handler. */
function timerBtn(action, icon, title, timerId, { text = '' } = {}) {
    return `<button type="button" class="wp-timer-btn" data-action="${action}" data-timer-id="${escapeHtml(timerId)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${text ? escapeHtml(text) : `<i class="${icon}"></i>`}</button>`;
}

/** Controls shown depend on the live run state, mirroring TinyClock's per-state button set. */
function timerControls(timer, state) {
    const id = timer.id;
    switch (state) {
        case 'running':
            return timerBtn('pause', 'fa-solid fa-pause', 'Pause', id)
                + timerBtn('addminute', '', '+1 minute', id, { text: '+1′' })
                + timerBtn('delete', 'fa-solid fa-xmark', 'Delete', id);
        case 'paused':
            return timerBtn('continue', 'fa-solid fa-play', 'Continue', id)
                + timerBtn('reset', 'fa-solid fa-rotate-left', 'Reset', id)
                + timerBtn('delete', 'fa-solid fa-xmark', 'Delete', id);
        case 'done':
            return timerBtn('reset', 'fa-solid fa-rotate-left', 'Dismiss', id)
                + timerBtn('edit', 'fa-solid fa-pen', 'Edit', id)
                + timerBtn('delete', 'fa-solid fa-xmark', 'Delete', id);
        default: // idle
            return timerBtn('start', 'fa-solid fa-play', 'Start', id)
                + timerBtn('edit', 'fa-solid fa-pen', 'Edit', id)
                + timerBtn('delete', 'fa-solid fa-xmark', 'Delete', id);
    }
}

function modeBadge(timer) {
    if (timer.timeMode === TIME_MODE.REAL) return '<span class="wp-timer-mode">Real</span>';
    if (timer.timeMode === TIME_MODE.RP) return '<span class="wp-timer-mode">RP</span>';
    return ''; // 'default' — no badge, follows the app default
}

function timerCardMarkup(timer, runtime) {
    const state = runtime?.state ?? 'idle';
    const remaining = runtime?.remainingSeconds ?? timer.durationSeconds;
    const fraction = timerFraction(remaining, timer.durationSeconds);
    const name = timer.name?.trim() || 'Timer';
    const waitingNote = runtime?.waiting ? '<span class="wp-timer-waiting">waiting for story time…</span>' : '';
    return `
<div class="wp-timer-card wp-timer-${state}" data-timer-id="${escapeHtml(timer.id)}">
    <div class="wp-timer-ringwrap">
        <svg class="wp-timer-ring" viewBox="0 0 80 80" aria-hidden="true" data-timer-ring="${escapeHtml(timer.id)}">
            <circle class="wp-timer-ring-track" cx="40" cy="40" r="${RING_RADIUS}" />
            <circle class="wp-timer-ring-progress" cx="40" cy="40" r="${RING_RADIUS}"
                style="stroke-dasharray:${RING_CIRCUMFERENCE.toFixed(2)};stroke-dashoffset:${ringDashoffset(fraction).toFixed(2)}" />
        </svg>
        <span class="wp-timer-display" data-timer-display="${escapeHtml(timer.id)}">${escapeHtml(formatDuration(remaining))}</span>
    </div>
    <div class="wp-timer-meta">
        <span class="wp-timer-name">${escapeHtml(name)}</span>
        <span class="wp-timer-sub">${escapeHtml(formatDuration(timer.durationSeconds))}${modeBadge(timer)}${waitingNote}</span>
    </div>
    <div class="wp-timer-controls">${timerControls(timer, state)}</div>
</div>`;
}

// ---- alarm helpers ----

const PAD2 = n => String(n).padStart(2, '0');
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ORDINALS = ['1st', '2nd', '3rd', '4th'];

/** 24h hour/minute -> "7:00 AM" for the phone's clock display. */
function format12h(hour, minute) {
    const h = (Number(hour) % 12) || 12;
    const suffix = Number(hour) < 12 ? 'AM' : 'PM';
    return `${h}:${PAD2(minute)} ${suffix}`;
}

/** 'YYYY-MM-DD' -> 'Jul 18, 2026' by parts, avoiding timezone shifts from Date parsing. */
function formatDateLabel(iso) {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    if (!y || !m || !d) return 'No date set';
    return `${MONTH_ABBR[m - 1]} ${d}, ${y}`;
}

/** The recurrence in words (time is shown separately) — the card's secondary line. */
function scheduleSummary(alarm) {
    switch (alarm.kind) {
        case RECURRENCE.DAILY: return 'Every day';
        case RECURRENCE.DATE: return formatDateLabel(alarm.date);
        case RECURRENCE.WEEKLY: {
            const days = Array.isArray(alarm.weekDays) ? alarm.weekDays : [];
            if (days.length === 0) return 'No days set';
            if (days.length === 7) return 'Every day';
            const order = d => (d + 6) % 7; // Monday-first
            return [...days].sort((a, b) => order(a) - order(b)).map(d => WEEKDAY_ABBR[d]).join(', ');
        }
        case RECURRENCE.MONTHLY_NTH:
            return `${ORDINALS[Math.min(4, Math.max(1, alarm.nthWeek || 1)) - 1]} ${WEEKDAY_ABBR[alarm.nthDay ?? 0]} monthly`;
        case RECURRENCE.ANNUAL:
            return `Every ${MONTH_ABBR[(alarm.month || 1) - 1]} ${alarm.day || 1}`;
        default: return 'Once'; // RECURRENCE.NEXT
    }
}

function alarmToggleMarkup(alarm) {
    return `
<label class="wp-toggle-switch wp-alarm-enable-wrap" title="${alarm.enabled ? 'On' : 'Off'}">
    <input type="checkbox" class="wp-toggle-input wp-alarm-enable" data-alarm-id="${escapeHtml(alarm.id)}"${alarm.enabled ? ' checked' : ''} />
    <span class="wp-toggle-track"><span class="wp-toggle-thumb"></span></span>
</label>`;
}

function alarmCardMarkup(alarm) {
    return `
<div class="wp-alarm-card${alarm.enabled ? '' : ' wp-alarm-off'}" data-alarm-id="${escapeHtml(alarm.id)}">
    <button type="button" class="wp-alarm-main" data-alarm-id="${escapeHtml(alarm.id)}">
        <span class="wp-alarm-time">${escapeHtml(format12h(alarm.hour, alarm.minute))}</span>
        <span class="wp-alarm-info">
            <span class="wp-alarm-title">${escapeHtml(alarm.title?.trim() || 'Alarm')}</span>
            <span class="wp-alarm-sub">${escapeHtml(scheduleSummary(alarm))}${modeBadge(alarm)}</span>
        </span>
    </button>
    <div class="wp-alarm-side">
        ${alarmToggleMarkup(alarm)}
        <button type="button" class="wp-alarm-del" data-alarm-id="${escapeHtml(alarm.id)}" title="Delete" aria-label="Delete"><i class="fa-solid fa-xmark"></i></button>
    </div>
</div>`;
}

/**
 * Clock app main screen (tabbed).
 * @param {HTMLElement} container #wp-screen-body
 * @param {{tab: 'timers'|'alarms', timers: Array, alarms: Array, runtimeOf: (timer: object) => ({state:string, remainingSeconds:number})}} state
 */
export function renderClockScreen(container, { tab, timers, alarms, runtimeOf, defaultMode = TIME_MODE.RP }) {
    let body;
    if (tab === 'alarms') {
        const list = alarms.length === 0
            ? `<div class="wp-empty-state"><i class="fa-solid fa-bell wp-empty-state-icon"></i><div>No alarms yet. Tap + to add one.</div></div>`
            : `<div class="wp-alarm-list">${alarms.map(alarmCardMarkup).join('')}</div>`;
        body = `
${list}
<button type="button" id="wp-alarm-add" class="wp-fab" title="New alarm"><i class="fa-solid fa-plus"></i></button>`;
    } else {
        const list = timers.length === 0
            ? `<div class="wp-empty-state"><i class="fa-solid fa-hourglass-half wp-empty-state-icon"></i><div>No timers yet. Tap + to add one.</div></div>`
            : `<div class="wp-timer-list">${timers.map(timer => timerCardMarkup(timer, runtimeOf(timer))).join('')}</div>`;
        body = `
${list}
<button type="button" id="wp-timer-add" class="wp-fab" title="New timer"><i class="fa-solid fa-plus"></i></button>`;
    }
    container.innerHTML = `<div class="wp-clock">${tabsMarkup(tab)}${defaultControlMarkup(defaultMode)}${body}</div>`;
}

function numberField(label, field, value, timerId, { min = 0, max = 59 } = {}) {
    return `
<label class="wp-timer-duration-field">
    <span>${escapeHtml(label)}</span>
    <input type="number" class="wp-timer-field" inputmode="numeric" min="${min}" max="${max}"
        data-field="${field}" data-timer-id="${escapeHtml(timerId)}" value="${escapeHtml(String(value))}" />
</label>`;
}

/**
 * Timer editor. Duration is split into h/m/s inputs; index.js recombines them into durationSeconds.
 * Works on a draft copy — nothing is saved until Create/Save (see index.js). `isNew` picks the
 * action buttons: a single Create for a brand-new timer (back = discard), or Save + Delete for an
 * existing one (back = discard changes).
 * @param {HTMLElement} container #wp-screen-body
 * @param {{timer: object, isNew: boolean}} state
 */
export function renderTimerEditorScreen(container, { timer, isNew, chatOpen = true }) {
    const total = Math.max(0, Math.trunc(timer.durationSeconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const mode = timer.timeMode ?? TIME_MODE.DEFAULT;
    // Roleplay/Default (which resolves to roleplay) need an open chat to anchor to.
    const modeOption = (value, label, disabled = false) => `<option value="${value}"${mode === value ? ' selected' : ''}${disabled ? ' disabled' : ''}>${label}</option>`;

    container.innerHTML = `
<div class="wp-timer-editor">
    <label class="wp-settings-field wp-settings-field-column">
        <span>Name</span>
        <input type="text" class="wp-timer-field" data-field="name" data-timer-id="${escapeHtml(timer.id)}"
            placeholder="Timer" value="${escapeHtml(timer.name ?? '')}" />
    </label>

    <div class="wp-settings-field wp-settings-field-column">
        <span>Duration</span>
        <div class="wp-timer-duration">
            ${numberField('Hours', 'h', hours, timer.id, { max: 23 })}
            ${numberField('Minutes', 'm', minutes, timer.id, { max: 59 })}
            ${numberField('Seconds', 's', seconds, timer.id, { max: 59 })}
        </div>
    </div>

    <label class="wp-settings-field wp-settings-field-column">
        <span>Time source</span>
        <select class="wp-timer-field" data-field="timeMode" data-timer-id="${escapeHtml(timer.id)}">
            ${modeOption(TIME_MODE.REAL, 'Real time')}
            ${modeOption(TIME_MODE.RP, 'Roleplay time', !chatOpen)}
        </select>
        <small class="wp-settings-hint">${chatOpen ? 'Roleplay timers advance with the story clock; real time uses your device clock. RP timers live in this chat only.' : 'Open a roleplay chat to use roleplay time.'}</small>
    </label>

    ${soundTriggerMarkup(timer.soundUrl)}

    ${imageTriggerMarkup(timer.imageUrl)}

    <div class="wp-timer-editor-actions">
        ${isNew
        ? `<button type="button" id="wp-timer-create-btn" class="menu_button"><i class="fa-solid fa-check"></i> Create</button>`
        : `<button type="button" id="wp-timer-delete-btn" class="menu_button wp-secondary-button" data-timer-id="${escapeHtml(timer.id)}"><i class="fa-solid fa-trash-can"></i> Delete</button>
           <button type="button" id="wp-timer-save-btn" class="menu_button"><i class="fa-solid fa-check"></i> Save</button>`}
    </div>
</div>`;
}

/**
 * The full-screen "going off" takeover shown when a timer or alarm fires.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{alert: {title: string, subtitle: string, imageUrl?: string}}} state
 */
export function renderClockAlertScreen(container, { alert }) {
    const image = alert.imageUrl
        ? `<img class="wp-alert-image" src="${escapeHtml(alert.imageUrl)}" alt="" />`
        : `<div class="wp-alert-image wp-alert-image-fallback"><i class="fa-solid fa-clock"></i></div>`;
    container.innerHTML = `
<div class="wp-clock-alert">
    ${image}
    <div class="wp-alert-copy">
        <div class="wp-alert-title">${escapeHtml(alert.title)}</div>
        <div class="wp-alert-sub">${escapeHtml(alert.subtitle)}</div>
    </div>
    <div class="wp-alert-actions">
        <button type="button" id="wp-alert-snooze" class="menu_button wp-secondary-button">Snooze</button>
        <button type="button" id="wp-alert-dismiss" class="menu_button">Dismiss</button>
    </div>
</div>`;
}

/** Day-of-week chips for the Weekly recurrence. Toggling is handled in index.js (class + draft). */
function dayButtonsMarkup(weekDays) {
    const set = Array.isArray(weekDays) ? weekDays : [];
    return `<div class="wp-alarm-days">${[0, 1, 2, 3, 4, 5, 6].map(d =>
        `<button type="button" class="wp-alarm-day${set.includes(d) ? ' wp-selected' : ''}" data-weekday="${d}" aria-label="${WEEKDAY_FULL[d]}">${DAY_LETTERS[d]}</button>`
    ).join('')}</div>`;
}

/**
 * Alarm editor. Draft model like the timer editor — nothing persists until Create/Save. The
 * recurrence <select> re-renders the screen (via index.js) so the kind-specific fields below it
 * swap in; all other fields update the draft in place.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{alarm: object, isNew: boolean}} state
 */
export function renderAlarmEditorScreen(container, { alarm, isNew, chatOpen = true }) {
    const time = `${PAD2(alarm.hour)}:${PAD2(alarm.minute)}`;
    const kind = alarm.kind;
    const mode = alarm.timeMode ?? TIME_MODE.DEFAULT;
    const kindOption = (value, label) => `<option value="${value}"${kind === value ? ' selected' : ''}>${label}</option>`;
    // RP alarms are limited to Once / Every day / a specific date (a full story-calendar recurrence
    // is niche); real alarms get the full set.
    const kindOptions = (mode === TIME_MODE.RP)
        ? `${kindOption(RECURRENCE.NEXT, 'Once (next time)')}${kindOption(RECURRENCE.DAILY, 'Every day')}${kindOption(RECURRENCE.DATE, 'On a date')}`
        : `${kindOption(RECURRENCE.NEXT, 'Once (next time)')}${kindOption(RECURRENCE.DAILY, 'Every day')}${kindOption(RECURRENCE.DATE, 'On a date')}${kindOption(RECURRENCE.WEEKLY, 'Weekly')}${kindOption(RECURRENCE.MONTHLY_NTH, 'Monthly (nth weekday)')}${kindOption(RECURRENCE.ANNUAL, 'Every year')}`;
    // Roleplay/Default (which resolves to roleplay) need an open chat to anchor to.
    const modeOption = (value, label, disabled = false) => `<option value="${value}"${mode === value ? ' selected' : ''}${disabled ? ' disabled' : ''}>${label}</option>`;

    // Only the fields relevant to the chosen recurrence are shown.
    let recurrenceFields = '';
    if (kind === RECURRENCE.DATE) {
        recurrenceFields = `
<label class="wp-settings-field wp-settings-field-column">
    <span>Date</span>
    <input type="date" class="wp-alarm-field" data-field="date" value="${escapeHtml(alarm.date || '')}" />
</label>`;
    } else if (kind === RECURRENCE.WEEKLY) {
        recurrenceFields = `
<div class="wp-settings-field wp-settings-field-column">
    <span>Days</span>
    ${dayButtonsMarkup(alarm.weekDays)}
</div>`;
    } else if (kind === RECURRENCE.MONTHLY_NTH) {
        recurrenceFields = `
<div class="wp-settings-field wp-settings-field-column">
    <span>Which weekday</span>
    <div class="wp-alarm-inline">
        <select class="wp-alarm-field" data-field="nthWeek">${[1, 2, 3, 4].map(n => `<option value="${n}"${(alarm.nthWeek || 1) === n ? ' selected' : ''}>${ORDINALS[n - 1]}</option>`).join('')}</select>
        <select class="wp-alarm-field" data-field="nthDay">${WEEKDAY_FULL.map((name, i) => `<option value="${i}"${(alarm.nthDay ?? 0) === i ? ' selected' : ''}>${name}</option>`).join('')}</select>
    </div>
</div>`;
    } else if (kind === RECURRENCE.ANNUAL) {
        recurrenceFields = `
<div class="wp-settings-field wp-settings-field-column">
    <span>Date each year</span>
    <div class="wp-alarm-inline">
        <select class="wp-alarm-field" data-field="month">${MONTH_FULL.map((name, i) => `<option value="${i + 1}"${(alarm.month || 1) === i + 1 ? ' selected' : ''}>${name}</option>`).join('')}</select>
        <input type="number" class="wp-alarm-field" data-field="day" min="1" max="31" value="${escapeHtml(String(alarm.day || 1))}" />
    </div>
</div>`;
    }

    const actions = isNew
        ? `<button type="button" id="wp-alarm-create-btn" class="menu_button"><i class="fa-solid fa-check"></i> Create</button>`
        : `<button type="button" id="wp-alarm-delete-btn" class="menu_button wp-secondary-button" data-alarm-id="${escapeHtml(alarm.id)}"><i class="fa-solid fa-trash-can"></i> Delete</button>
           <button type="button" id="wp-alarm-save-btn" class="menu_button"><i class="fa-solid fa-check"></i> Save</button>`;

    container.innerHTML = `
<div class="wp-alarm-editor">
    <label class="wp-settings-field wp-settings-field-column">
        <span>Time</span>
        <input type="time" class="wp-alarm-field" data-field="time" value="${time}" />
    </label>
    <label class="wp-settings-field wp-settings-field-column">
        <span>Label</span>
        <input type="text" class="wp-alarm-field" data-field="title" placeholder="Alarm" value="${escapeHtml(alarm.title ?? '')}" />
    </label>
    <label class="wp-settings-field wp-settings-field-column">
        <span>Repeat</span>
        <select class="wp-alarm-field" data-field="kind">${kindOptions}</select>
    </label>
    ${recurrenceFields}
    <label class="wp-settings-field wp-settings-field-column">
        <span>Time source</span>
        <select class="wp-alarm-field" data-field="timeMode">
            ${modeOption(TIME_MODE.REAL, 'Real time')}
            ${modeOption(TIME_MODE.RP, 'Roleplay time', !chatOpen)}
        </select>
        <small class="wp-settings-hint">${chatOpen ? 'RP alarms live in this chat only.' : 'Open a roleplay chat to use roleplay time.'}</small>
    </label>
    ${soundTriggerMarkup(alarm.soundUrl)}
    ${imageTriggerMarkup(alarm.imageUrl)}
    <div class="wp-alarm-editor-actions">${actions}</div>
</div>`;
}
