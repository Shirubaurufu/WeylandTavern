/**
 * Weyland Theme for SillyTavern
 * A simple Weyland Theme edit for the essential Weyland experience.
 */

// Global settings and constants
const EXTENSION_NAME = 'Weyland Theme';
const settingsKey = 'SillyTavernWeylandTheme';
const extensionName = "SillyTavern-WeylandTheme";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Function to load the CSS file
function loadStyleCSS() {
    const baseUrl = getBaseUrl();
    const cssUrl = baseUrl + '/style.css';

    // Check if the CSS link already exists
    const existingLink = document.getElementById('WeylandTheme-style');
    if (existingLink) return;

    // Create a new link element for the CSS file
    const linkElement = document.createElement('link');
    linkElement.id = 'WeylandTheme-style';
    linkElement.rel = 'stylesheet';
    linkElement.href = cssUrl;

    // Append the link element to the document head
    document.head.appendChild(linkElement);
}

// Function to get the base URL for the extension
function getBaseUrl() {
    let baseUrl = '';

    // Try various methods to determine the base URL
    if (typeof import.meta !== 'undefined' && import.meta.url) {
        baseUrl = new URL('.', import.meta.url).href;
    } else {
        const currentScript = document.currentScript;
        if (currentScript && currentScript.src) {
            baseUrl = currentScript.src.substring(0, currentScript.src.lastIndexOf('/'));
        } else {
            // Fallback to a hardcoded path if other methods fail
            baseUrl = `${window.location.origin}/scripts/extensions/third-party/${extensionName}`;
        }
    }

    return baseUrl;
}

// Main initialization function
(function initExtension() {
    console.debug(`[${EXTENSION_NAME}]`, 'Initializing extension');

    // Load the style.css file
    loadStyleCSS();

    console.debug(`[${EXTENSION_NAME}]`, 'Extension initialized');
})();
