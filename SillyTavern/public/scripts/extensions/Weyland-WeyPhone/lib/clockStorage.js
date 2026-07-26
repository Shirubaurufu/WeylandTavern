// lib/clockStorage.js
//
// Data + scheduling layer for the Clock app (alarms & timers). This is a straight port of the
// desktop TinyClock's Models.cs, adapted to WeyPhone's constraints:
//   - No filesystem: image/sound are URLs (or picker paths), not local file paths.
//   - Persisted state must be plain JSON, so items are plain objects and all behaviour lives in
//     pure functions here (TinyClock put methods on the classes; settings can't hold class
//     instances that survive a save/load, so we don't).
//   - Alarms/timers store a `timeMode` of 'default' | 'real' | 'rp'. Only the REAL-time scheduling
//     math lives in this file (computeNextFire etc.); the roleplay-time engine is a later layer
//     that reuses these same records. The field exists now so the record shape never has to change.
//
// Mirrors notesStorage.js conventions: id-keyed records under settings.ui, ensure-on-access, no
// UI and no policy here — just data.

// ---------------------------------------------------------------- constants

/** Recurrence kinds. String values (not ints like the C# enum) so a saved record is self-describing. */
export const RECURRENCE = Object.freeze({
    NEXT: 'next',            // next time the set time arrives (one-shot)
    DAILY: 'daily',          // every day at the set time
    DATE: 'date',            // a specific calendar date (one-shot)
    WEEKLY: 'weekly',        // chosen days of the week
    MONTHLY_NTH: 'monthlyNth', // the 1st/2nd/3rd/4th <weekday> of every month
    ANNUAL: 'annual',        // every year on a chosen month/day
});

/** Per-item time source. 'default' defers to the app-wide default (settings.ui.clockDefaultTimeMode). */
export const TIME_MODE = Object.freeze({ DEFAULT: 'default', REAL: 'real', RP: 'rp' });

/** New installs default the whole app to roleplay time (Lucky's call). Existing users are unaffected
 *  because this is only ever read through ensureClock(), which backfills the field lazily. */
const DEFAULT_APP_TIME_MODE = TIME_MODE.RP;

const DAY_MS = 24 * 60 * 60 * 1000;
// A fire that's overdue by less than this is treated as "just now / about to fire", not "missed
// while the tab was closed". Matches TinyClock's 90-second reconcile grace window.
const MISSED_GRACE_MS = 90 * 1000;

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

// ---------------------------------------------------------------- ids

let clockCounter = 0;
function genClockId(prefix) {
    clockCounter++;
    return `${prefix}_${Date.now()}_${clockCounter}`;
}

// ---------------------------------------------------------------- storage (ensure-on-access)

/**
 * Guarantees the Clock app's storage exists and returns it. Created lazily on first access, exactly
 * like notesStorage.ensureNotes — so nothing has to be declared in config.js and old installs are
 * upgraded transparently the first time the Clock app is opened.
 * @param {{ui?: object}} settings WeyPhone settings (see lib/config.js)
 */
function ensureClock(settings) {
    if (!settings.ui) settings.ui = {};
    if (!Array.isArray(settings.ui.clockAlarms)) settings.ui.clockAlarms = [];
    if (!Array.isArray(settings.ui.clockTimers)) settings.ui.clockTimers = [];
    if (typeof settings.ui.clockDefaultTimeMode !== 'string') {
        settings.ui.clockDefaultTimeMode = DEFAULT_APP_TIME_MODE;
    }
    return settings.ui;
}

/** The app-wide default time source ('real' | 'rp'). */
export function getDefaultTimeMode(settings) {
    return ensureClock(settings).clockDefaultTimeMode;
}

/** @param {'real'|'rp'} mode */
export function setDefaultTimeMode(settings, mode) {
    const ui = ensureClock(settings);
    ui.clockDefaultTimeMode = (mode === TIME_MODE.REAL) ? TIME_MODE.REAL : TIME_MODE.RP;
    return ui.clockDefaultTimeMode;
}

/**
 * Resolves an item's effective time source, collapsing 'default' to whatever the app default is.
 * @returns {'real'|'rp'}
 */
export function effectiveTimeMode(settings, item) {
    const mode = item?.timeMode;
    if (mode === TIME_MODE.REAL || mode === TIME_MODE.RP) return mode;
    return getDefaultTimeMode(settings);
}

// ---------------------------------------------------------------- alarms: CRUD

/**
 * @param {object} settings
 * @param {Partial<{title:string,imageUrl:string,soundUrl:string,timeMode:string,hour:number,
 *   minute:number,kind:string,date:string,weekDays:number[],nthWeek:number,nthDay:number,
 *   month:number,day:number}>} [fields]
 */
export function createAlarm(settings, fields = {}) {
    const ui = ensureClock(settings);
    const alarm = {
        id: genClockId('alarm'),
        title: fields.title ?? '',
        imageUrl: fields.imageUrl ?? '',
        soundUrl: fields.soundUrl ?? '',
        timeMode: fields.timeMode ?? TIME_MODE.DEFAULT,
        // null = global (real-time, shows in every chat). A chatId scopes an RP item to one chat.
        chatId: fields.chatId ?? null,
        hour: clampInt(fields.hour, 0, 23, 7),
        minute: clampInt(fields.minute, 0, 59, 0),
        kind: fields.kind ?? RECURRENCE.NEXT,
        date: fields.date ?? null,                 // 'YYYY-MM-DD' for RECURRENCE.DATE
        weekDays: Array.isArray(fields.weekDays) ? [...fields.weekDays] : [], // 0=Sun..6=Sat
        nthWeek: clampInt(fields.nthWeek, 1, 4, 1),
        nthDay: clampInt(fields.nthDay, 0, 6, 1),  // MONTHLY_NTH weekday, 0=Sun
        month: clampInt(fields.month, 1, 12, 1),   // ANNUAL
        day: clampInt(fields.day, 1, 31, 1),       // ANNUAL
        enabled: true,
        nextFire: null,      // epoch ms of the next REAL-time fire; null until scheduled/for rp items
        snoozeUntil: null,   // epoch ms; set by the fire UI's Snooze button
        // RP alarms: persisted armed state { armedFrom: moment, targetMinutes } so story-time
        // progress survives a reload. Null until armed on the first message with a scene header.
        rpArm: null,
    };
    ui.clockAlarms.push(alarm);
    return alarm;
}

/** @returns {Array} alarms in creation order */
export function getAlarms(settings) {
    return ensureClock(settings).clockAlarms;
}

/**
 * Alarms visible in the given chat: every global (chatId null) alarm, plus alarms scoped to this
 * chatId. Passing a falsy chatId (no chat open) yields only the global ones.
 */
export function getVisibleAlarms(settings, chatId) {
    return ensureClock(settings).clockAlarms.filter(a => !a.chatId || a.chatId === chatId);
}

export function getAlarm(settings, id) {
    return ensureClock(settings).clockAlarms.find(a => a.id === id);
}

/** Shallow field update. Unknown keys are ignored so callers can't inject junk fields. */
export function updateAlarm(settings, id, fields = {}) {
    const alarm = getAlarm(settings, id);
    if (!alarm) return undefined;
    const allowed = ['title', 'imageUrl', 'soundUrl', 'timeMode', 'chatId', 'hour', 'minute', 'kind',
        'date', 'weekDays', 'nthWeek', 'nthDay', 'month', 'day', 'enabled', 'nextFire', 'snoozeUntil'];
    for (const key of allowed) {
        if (key in fields) alarm[key] = fields[key];
    }
    return alarm;
}

/** @returns {boolean} true if an alarm was removed */
export function deleteAlarm(settings, id) {
    const alarms = ensureClock(settings).clockAlarms;
    const index = alarms.findIndex(a => a.id === id);
    if (index === -1) return false;
    alarms.splice(index, 1);
    return true;
}

// ---------------------------------------------------------------- timers: CRUD
//
// Only a timer's DEFINITION is persisted (name/duration/sound/image/mode). Its live run state
// (running/paused, end time, remaining) is transient and owned by the engine layer, exactly like
// TinyClock marked those fields [JsonIgnore]. Keeping run state out of settings avoids writing to
// disk on every tick.

export function createTimer(settings, fields = {}) {
    const ui = ensureClock(settings);
    const timer = {
        id: genClockId('timer'),
        name: fields.name ?? '',
        durationSeconds: clampInt(fields.durationSeconds, 1, 24 * 60 * 60, 600), // default 10 min
        soundUrl: fields.soundUrl ?? '',
        imageUrl: fields.imageUrl ?? '',
        timeMode: fields.timeMode ?? TIME_MODE.DEFAULT,
        // null = global (real-time, resets on reload). A chatId scopes an RP timer to one chat.
        chatId: fields.chatId ?? null,
        // Persisted run state for RP timers ONLY (so story-time progress survives a reload). Real
        // timers leave this null and keep their run state in memory, cancelling on reload. Shape when
        // set: { state, mode, startMoment, baseSeconds, remainingSeconds }.
        run: null,
    };
    ui.clockTimers.push(timer);
    return timer;
}

/** @returns {Array} timers in creation order */
export function getTimers(settings) {
    return ensureClock(settings).clockTimers;
}

/** Timers visible in the given chat (global + this chat's). Falsy chatId yields only global. */
export function getVisibleTimers(settings, chatId) {
    return ensureClock(settings).clockTimers.filter(t => !t.chatId || t.chatId === chatId);
}

export function getTimer(settings, id) {
    return ensureClock(settings).clockTimers.find(t => t.id === id);
}

export function updateTimer(settings, id, fields = {}) {
    const timer = getTimer(settings, id);
    if (!timer) return undefined;
    const allowed = ['name', 'durationSeconds', 'soundUrl', 'imageUrl', 'timeMode', 'chatId'];
    for (const key of allowed) {
        if (key in fields) timer[key] = fields[key];
    }
    return timer;
}

/** @returns {boolean} true if a timer was removed */
export function deleteTimer(settings, id) {
    const timers = ensureClock(settings).clockTimers;
    const index = timers.findIndex(t => t.id === id);
    if (index === -1) return false;
    timers.splice(index, 1);
    return true;
}

// ---------------------------------------------------------------- real-time scheduling
//
// Direct port of TinyClock's Scheduler. All times are local-clock epoch milliseconds. These power
// REAL-mode alarms only; roleplay-mode alarms are evaluated against scene-header time elsewhere.

/** Epoch ms for a given calendar day (taken from `ref`) at h:m local time. */
function atTimeOnDay(ref, hour, minute) {
    return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), hour, minute, 0, 0).getTime();
}

function daysInMonth(year, month1) {
    // month1 is 1-based; day 0 of the next month is the last day of this one.
    return new Date(year, month1, 0).getDate();
}

/** Date of the `nth` (1..4) `dow` (0=Sun) in the month that `firstOfMonth` begins. */
function nthWeekdayOfMonth(firstOfMonth, nth, dow) {
    const offset = ((dow - firstOfMonth.getDay()) + 7) % 7;
    const day = 1 + offset + 7 * (clampInt(nth, 1, 4, 1) - 1);
    return new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), day);
}

/**
 * Next occurrence strictly after `fromMs`, or null if the alarm has no future fire.
 * @param {object} alarm
 * @param {number} fromMs epoch ms
 * @returns {number|null} epoch ms
 */
export function computeNextFire(alarm, fromMs) {
    const from = new Date(fromMs);
    const h = clampInt(alarm.hour, 0, 23, 7);
    const m = clampInt(alarm.minute, 0, 59, 0);

    switch (alarm.kind) {
        case RECURRENCE.NEXT:
        case RECURRENCE.DAILY: {
            // Both fire at the next arrival of the time; NEXT is one-shot, DAILY repeats (see isOneShot).
            let c = atTimeOnDay(from, h, m);
            if (c <= fromMs) {
                const next = new Date(from);
                next.setDate(next.getDate() + 1);
                c = atTimeOnDay(next, h, m);
            }
            return c;
        }
        case RECURRENCE.DATE: {
            if (!alarm.date) return null;
            const d = new Date(`${alarm.date}T00:00:00`);
            if (Number.isNaN(d.getTime())) return null;
            const c = atTimeOnDay(d, h, m);
            return c > fromMs ? c : null;
        }
        case RECURRENCE.WEEKLY: {
            if (!Array.isArray(alarm.weekDays) || alarm.weekDays.length === 0) return null;
            for (let i = 0; i < 8; i++) {
                const d = new Date(from);
                d.setDate(d.getDate() + i);
                const c = atTimeOnDay(d, h, m);
                if (c > fromMs && alarm.weekDays.includes(d.getDay())) return c;
            }
            return null;
        }
        case RECURRENCE.MONTHLY_NTH: {
            const first = new Date(from.getFullYear(), from.getMonth(), 1);
            for (let i = 0; i < 14; i++) {
                const monthStart = new Date(first.getFullYear(), first.getMonth() + i, 1);
                const nthDate = nthWeekdayOfMonth(monthStart, alarm.nthWeek, alarm.nthDay);
                const c = atTimeOnDay(nthDate, h, m);
                if (c > fromMs) return c;
            }
            return null;
        }
        case RECURRENCE.ANNUAL: {
            for (let y = from.getFullYear(); y <= from.getFullYear() + 2; y++) {
                const day = Math.min(clampInt(alarm.day, 1, 31, 1), daysInMonth(y, alarm.month));
                const c = atTimeOnDay(new Date(y, alarm.month - 1, day), h, m);
                if (c > fromMs) return c;
            }
            return null;
        }
        default:
            return null;
    }
}

/** True for kinds that fire once and are then done. */
export function isOneShot(alarm) {
    return alarm.kind === RECURRENCE.NEXT || alarm.kind === RECURRENCE.DATE;
}

/**
 * After an alarm fires (or is skipped): advance one-shots to disabled, repeats to their next fire.
 * Mutates the alarm. Mirrors TinyClock's Scheduler.Advance.
 */
export function advanceAlarm(alarm, fromMs) {
    if (isOneShot(alarm)) {
        alarm.enabled = false;
        alarm.nextFire = null;
        return;
    }
    alarm.nextFire = computeNextFire(alarm, fromMs);
    if (alarm.nextFire === null) alarm.enabled = false;
}

/**
 * Reconcile a single REAL-mode alarm against the current wall clock. Called when the app (re)opens:
 * anything overdue by more than the grace window was missed while the tab was closed — skip it,
 * report it, and reschedule. Mutates the alarm.
 * @returns {{missedAt: number}|null} the missed fire time, if one was skipped
 */
export function reconcileAlarm(alarm, nowMs) {
    let missed = null;

    if (typeof alarm.snoozeUntil === 'number' && alarm.snoozeUntil < nowMs - MISSED_GRACE_MS) {
        missed = { missedAt: alarm.snoozeUntil };
        alarm.snoozeUntil = null;
    }

    if (!alarm.enabled) return missed;

    if (alarm.nextFire === null) {
        alarm.nextFire = computeNextFire(alarm, nowMs);
        if (alarm.nextFire === null) alarm.enabled = false;
        return missed;
    }

    if (alarm.nextFire < nowMs - MISSED_GRACE_MS) {
        missed = { missedAt: alarm.nextFire };
        advanceAlarm(alarm, nowMs);
    }
    return missed;
}

// ---------------------------------------------------------------- timer display math

/**
 * "mm:ss" under an hour, "h:mm:ss" at or over. Rounds up so a timer shows 10:00 the instant it
 * starts (not 09:59), matching TinyClock's Math.Ceiling display.
 * @param {number} totalSeconds
 */
export function formatDuration(totalSeconds) {
    const secs = Math.max(0, Math.ceil(totalSeconds));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = n => String(n).padStart(2, '0');
    return h >= 1 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Remaining time as a 0..1 fraction of the full duration, for the progress ring.
 * @param {number} remainingSeconds
 * @param {number} durationSeconds
 */
export function timerFraction(remainingSeconds, durationSeconds) {
    if (!(durationSeconds > 0)) return 0;
    return Math.min(1, Math.max(0, remainingSeconds / durationSeconds));
}

// ---------------------------------------------------------------- human-readable schedule

/** "once, at the next 07:00" / "every Mon, Wed at 22:15" etc. Port of TinyClock's Scheduler.Describe. */
export function describeAlarm(alarm) {
    const t = `${String(clampInt(alarm.hour, 0, 23, 7)).padStart(2, '0')}:${String(clampInt(alarm.minute, 0, 59, 0)).padStart(2, '0')}`;
    switch (alarm.kind) {
        case RECURRENCE.NEXT:
            return `once, at the next ${t}`;
        case RECURRENCE.DAILY:
            return `every day at ${t}`;
        case RECURRENCE.DATE:
            return alarm.date ? `on ${alarm.date} at ${t}` : `on (no date) at ${t}`;
        case RECURRENCE.WEEKLY: {
            if (!Array.isArray(alarm.weekDays) || alarm.weekDays.length === 0) return `weekly (no days) at ${t}`;
            const order = d => (d + 6) % 7; // Monday-first
            const days = [...alarm.weekDays].sort((a, b) => order(a) - order(b))
                .map(d => WEEKDAY_NAMES[d].slice(0, 3));
            return `every ${days.join(', ')} at ${t}`;
        }
        case RECURRENCE.MONTHLY_NTH: {
            const nth = ['1st', '2nd', '3rd', '4th'][clampInt(alarm.nthWeek, 1, 4, 1) - 1];
            return `the ${nth} ${WEEKDAY_NAMES[clampInt(alarm.nthDay, 0, 6, 1)]} of every month at ${t}`;
        }
        case RECURRENCE.ANNUAL:
            return `every year on ${MONTH_NAMES[clampInt(alarm.month, 1, 12, 1) - 1]} ${clampInt(alarm.day, 1, 31, 1)} at ${t}`;
        default:
            return '';
    }
}

// ---------------------------------------------------------------- helpers

/** Coerce to an integer in [min,max], falling back to `fallback` for anything non-finite. */
function clampInt(value, min, max, fallback) {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}
