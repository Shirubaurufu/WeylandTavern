// lib/ui/statusBar.js

/**
 * The persistent Android-style status bar: clock left; DND / airplane indicators, signal, carrier,
 * battery right. Also the drag handle that opens the notification shade (wired in index.js).
 */
export function createStatusBarMarkup() {
    return `
<div id="wp-status-bar" title="Notifications">
    <span class="wp-status-left">
        <span id="wp-status-clock">12:00</span>
        <button type="button" id="wp-panel-close" title="Put phone away" aria-label="Put phone away">&times;</button>
        <button type="button" id="wp-status-sleep" title="Put screen to sleep" aria-label="Put screen to sleep"><i class="fa-solid fa-power-off"></i></button>
    </span>
    <span class="wp-status-right">
        <i id="wp-status-dnd" class="fa-solid fa-moon wp-status-icon" style="display:none" title="Do Not Disturb"></i>
        <i id="wp-status-airplane" class="fa-solid fa-plane wp-status-icon" style="display:none" title="Airplane mode"></i>
        <span id="wp-status-signal" class="wp-signal" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span id="wp-status-carrier">WeyLTE</span>
        <span id="wp-status-battery">
            <span id="wp-battery-percent">100</span>
            <span id="wp-battery-shell"><span id="wp-battery-fill"></span></span>
        </span>
    </span>
</div>`;
}

/**
 * @param {{clockText: string, battery: number, dnd: boolean, airplane: boolean}} state
 */
export function renderStatusBar({ clockText, battery, dnd, airplane }) {
    const clock = document.getElementById('wp-status-clock');
    if (clock) clock.textContent = clockText;
    const percent = document.getElementById('wp-battery-percent');
    if (percent) percent.textContent = String(battery);
    const fill = document.getElementById('wp-battery-fill');
    if (fill) {
        fill.style.width = `${battery}%`;
        fill.classList.toggle('wp-battery-low', battery <= 20);
    }
    const dndIcon = document.getElementById('wp-status-dnd');
    if (dndIcon) dndIcon.style.display = dnd ? '' : 'none';
    const planeIcon = document.getElementById('wp-status-airplane');
    if (planeIcon) planeIcon.style.display = airplane ? '' : 'none';
    const signal = document.getElementById('wp-status-signal');
    if (signal) signal.classList.toggle('wp-signal-off', airplane);
    const carrier = document.getElementById('wp-status-carrier');
    if (carrier) carrier.textContent = airplane ? '✈' : 'WeyLTE';
}
