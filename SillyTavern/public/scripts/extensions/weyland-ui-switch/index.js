// Weyland UI Switch: a one-click button that swaps between the Streamlined UI and the full UI.
//
// Why this exists: Streamlined UI (extensions/streamlined-ui, on by default) is an ordinary extension, so
// leaving it meant opening the settings menu, scrolling to "Manage extensions" and switching the extension
// off. Nobody finds that unprompted. This extension adds one button to each side.
//
// It is a separate extension on purpose: Streamlined UI is not loaded in full-UI mode, so a button living
// inside it could never offer the way back. This one is always loaded, and works out which side it is on
// from the extension list itself (the source of truth) rather than from the body.streamlined-ui class,
// which only exists once Streamlined UI has run, so there is no load-order race between the two.
//
// The switch is ST's own enable/disable path (extension_settings.disabledExtensions, then a reload), so it
// behaves exactly like ticking the extension in "Manage extensions", just without the hunt.
//
// Copy note: no em dashes (Lucky's rule for user-facing text).

import { disableExtension, enableExtension, extension_settings, extensionNames } from '../../extensions.js';

const STREAMLINED = 'streamlined-ui';
const BUTTON_ID = 'weyland_ui_switch';
// Full UI: the header row of the Extensions menu ("Extensions", "Manage extensions", "Install extension").
const EXTENSIONS_HEADER_ROW = '#rm_extensions_block .extensions_block > .alignitemscenter';
// Streamlined UI has no Extensions menu of its own: it folds extensions and user settings into the single
// Settings panel (#rm_api_block, the gear in the top bar), so the button goes at the very top of that panel
// instead of down where "Manage extensions" ended up.
const SETTINGS_PANEL = '#rm_api_block';
const ROW_ID = 'weyland_ui_switch_row';

/** True while Streamlined UI is the active layout. */
function streamlinedActive() {
    return !extension_settings.disabledExtensions.includes(STREAMLINED);
}

function buttonHtml() {
    return streamlinedActive()
        ? '<i class="fa-solid fa-table-columns"></i><span>Switch to Full UI</span>'
        : '<i class="fa-solid fa-wand-magic-sparkles"></i><span>Switch to Streamlined UI</span>';
}

async function onSwitch(event) {
    const button = event.currentTarget;
    if (button.classList.contains('disabled')) return;
    // Both calls save the settings and reload the page, so make the click feel acknowledged first.
    button.classList.add('disabled');
    button.querySelector('span').textContent = 'Switching...';
    try {
        if (streamlinedActive()) await disableExtension(STREAMLINED);
        else await enableExtension(STREAMLINED);
    } catch (error) {
        console.error('[Weyland UI Switch] Could not switch layouts:', error);
        button.classList.remove('disabled');
        button.innerHTML = buttonHtml();
        globalThis.toastr?.error('Could not switch layouts. Try again, or use Manage extensions.', 'Weyland UI Switch');
    }
}

function placeButton() {
    const streamlined = streamlinedActive();
    const host = document.querySelector(streamlined ? SETTINGS_PANEL : EXTENSIONS_HEADER_ROW);
    if (!host) return false;
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
        button = document.createElement('div');
        button.id = BUTTON_ID;
        button.className = 'menu_button menu_button_icon interactable';
        button.tabIndex = 0;
        button.addEventListener('click', onSwitch);
        button.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                button.click();
            }
        });
    }
    button.title = streamlined ? 'Show the full SillyTavern menus' : 'Go back to the simpler Weyland layout';
    button.innerHTML = buttonHtml();
    if (streamlined) {
        // Its own row, first thing in the panel.
        let row = document.getElementById(ROW_ID);
        if (!row) {
            row = document.createElement('div');
            row.id = ROW_ID;
        }
        row.append(button);
        host.prepend(row);
    } else {
        // First control in the row, right after the "Extensions" title.
        const title = host.querySelector('h3');
        if (title) title.after(button);
        else host.prepend(button);
    }
    return true;
}

function init() {
    // If Streamlined UI is not installed at all there is nothing to switch to or from.
    if (!extensionNames.includes(STREAMLINED)) return;
    if (placeButton()) return;
    // The Extensions block is part of the static page, but be patient in case it is built late.
    const observer = new MutationObserver(() => {
        if (placeButton()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
