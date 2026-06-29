import applyPatches from "./patcher.js";

/**
 * When Character Management opens with NO active character, jump straight to
 * the character list. If a character is already active, let ST's default
 * behavior show that character's profile pane (matching base ST UX).
 */
function installAutoOpenCharactersList() {
    const drawerIcon = document.getElementById('rightNavDrawerIcon');
    const charactersButton = document.getElementById('rm_button_characters');
    if (!drawerIcon || !charactersButton) {
        return;
    }

    drawerIcon.addEventListener('click', () => {
        if (!drawerIcon.classList.contains('closedIcon')) {
            return;
        }
        const ctx = window.SillyTavern?.getContext?.();
        const hasActiveCharacter =
            (ctx?.characterId !== undefined && ctx?.characterId !== null && ctx?.characterId !== '')
            || (typeof ctx?.groupId === 'string' && ctx.groupId.length > 0);
        if (hasActiveCharacter) {
            return;
        }
        charactersButton.click();
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
    // Auto-close on character select disabled — keeps the right pane open after
    // selecting a character so users can access chat lorebook, character lorebook,
    // tags, connected personas, and the More... dropdown.
    // installCloseDrawerOnCharacterSelect();
    applyPatches();
    console.log("[Streamlined UI] Initialized successfully.");
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
