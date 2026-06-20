import applyPatches from "./patcher.js";

/**
 * When Character Management opens, show the character list (same as #rm_button_characters).
 */
function installAutoOpenCharactersList() {
    const drawerIcon = document.getElementById('rightNavDrawerIcon');
    const charactersButton = document.getElementById('rm_button_characters');
    if (!drawerIcon || !charactersButton) {
        return;
    }

    drawerIcon.addEventListener('click', () => {
        if (drawerIcon.classList.contains('closedIcon')) {
            charactersButton.click();
        }
    });
}

/** Close the right character drawer when it is open and not pinned. */
function closeCharacterDrawerIfOpen() {
    const panel = document.getElementById('right-nav-panel');
    const drawerIcon = document.getElementById('rightNavDrawerIcon');
    const pin = document.getElementById('rm_button_panel_pin');

    if (!panel || !drawerIcon) {
        return;
    }
    if ((pin instanceof HTMLInputElement && pin.checked) || panel.classList.contains('pinnedOpen')) {
        return;
    }
    if (!panel.classList.contains('openDrawer')) {
        return;
    }

    drawerIcon.click();
}

function installCloseDrawerOnCharacterSelect() {
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        if (!target.closest('.character_select')) {
            return;
        }
        closeCharacterDrawerIfOpen();
    });
}

function init() {
    console.log("[Streamlined UI] Initializing...");
    document.body.classList.add('streamlined-ui');
    installAutoOpenCharactersList();
    installCloseDrawerOnCharacterSelect();
    applyPatches();
    console.log("[Streamlined UI] Initialized successfully.");
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
