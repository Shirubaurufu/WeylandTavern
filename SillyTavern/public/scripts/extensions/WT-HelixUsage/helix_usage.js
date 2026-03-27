// Main extension code
// This extension monitors HelixMind API usage and displays it in the UI.
// This extension has been altered for WeylandTavern purposes.

// Start 1st WT Addition 

let extensionDisabled = false;

jQuery(async () => {
    if (document.getElementById('helix-usage-container')) {
        console.log('Helix Monitor (fork): Original extension detected, disabling self.');
        extensionDisabled = true;
        return;
    }

});

// Special import for WT
import { getGlobalVariable } from '../../variables.js';

// End 1st WT Addition

import { saveSettingsDebounced, eventSource, event_types} from "../../../../script.js"; // Added saveSettingsDebounced
import { extension_settings } from "../../extensions.js";

// Get the SillyTavern context
const context = SillyTavern.getContext();

// Variable to store if Helix configuration is active
let isHelixConfigActive = false;
let usageCountdownInterval = null;
let nextMessageExpiryTimeMs = null;
let hourlyBreakdownData = null; // To store hourly breakdown results

// --- Extension Constants ---
const extensionName = 'ST-HelixUsage';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`; // Relative path for loading HTML
const defaultHelixSettings = {
    showHourlyBreakdown: false,
};

// --- Settings Management ---
// Loads the extension settings if they exist, otherwise initializes them to the defaults.
function loadHelixSettings() {
    // Create the settings if they don't exist or are empty
    if (!extension_settings[extensionName] || Object.keys(extension_settings[extensionName]).length === 0) {
        extension_settings[extensionName] = { ...defaultHelixSettings };
    } else {
        // Ensure all default keys exist if settings were loaded but might be from an older version
        for (const key in defaultHelixSettings) {
            if (extension_settings[extensionName][key] === undefined) {
                extension_settings[extensionName][key] = defaultHelixSettings[key];
            }
        }
    }

    // Update UI elements with loaded settings
    const currentSettings = extension_settings[extensionName];
    if ($('#helix-usage-hourly-toggle').length) {
        $('#helix-usage-hourly-toggle').prop('checked', currentSettings.showHourlyBreakdown);
    } else {
        console.warn("Helix Monitor: #helix-usage-hourly-toggle not found during loadHelixSettings.");
    }
    // Call updateHourlyBreakdownUI here to ensure its state is correct after settings load / init
    updateHourlyBreakdownUI(hourlyBreakdownData);
}

// --- Main Extension Logic (Initialization, API calls, UI updates for usage display) ---

// Log to confirm the extension is loaded
console.log("Helix Usage Monitor extension loaded.");

// --- Helper Functions ---
function formatMillisecondsToTime(ms) {
    if (ms < 0) ms = 0;
    let totalSeconds = Math.floor(ms / 1000);
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;

    const pad = (num) => String(num).padStart(2, '0');

    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    } else {
        return `${pad(minutes)}:${pad(seconds)}`;
    }
}

// Helper function to format 24-hour to AM/PM
function formatHourForDisplay(hour24) {
    if (hour24 < 0 || hour24 > 23) return "Invalid Hour";
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    let hour12 = hour24 % 12;
    if (hour12 === 0) hour12 = 12; // 0 should be 12 AM, 12 should be 12 PM
    return `${hour12} ${ampm}`;
}

// --- Real API Function ---
async function fetchHelixUsageData_real(apiKey) {
    const apiUrl = 'https://helixmind.online/v1/usage';
    console.log(`Helix Monitor: Fetching REAL Helix usage data from ${apiUrl}...`);

    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (!response.ok) {
            let errorBodyDetail = "";
            try {
                const errorBodyText = await response.text(); 
                errorBodyDetail = errorBodyText.substring(0, 500); 
                console.error(`Helix Monitor: API Error Response Text (Status ${response.status}): ${errorBodyText}`);
            } catch (e) {
                console.warn('Helix Monitor: Could not read API error body.');
                errorBodyDetail = "(could not read error body)";
            }
            throw new Error(`API request failed: ${response.status} ${response.statusText}. Details: ${errorBodyDetail}`);
        }

        const parsedResponse = await response.json();
        // console.log('Helix Monitor: Raw Real API Response:', JSON.stringify(parsedResponse, null, 2)); // For debugging

        // Filter messages to within the last 24 hours and transform
        const twentyFourHoursAgoMs = Date.now() - (24 * 60 * 60 * 1000);
        let activeMessages = [];

        if (parsedResponse.data && Array.isArray(parsedResponse.data)) {
            activeMessages = parsedResponse.data
                .map(item => ({
                    ...item, // Keep original fields like 'model'
                    timestamp_ms: item.timestamp * 1000 // Convert API's seconds to milliseconds
                }))
                .filter(message => message.timestamp_ms >= twentyFourHoursAgoMs);
            
            // Sort active messages by timestamp, oldest first, to ensure messages[0] is the oldest for timer logic
            activeMessages.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
            console.log(`Helix Monitor: Found ${activeMessages.length} messages within the last 24 hours out of ${parsedResponse.data.length} total from API.`);
        } else {
            console.log("Helix Monitor: No 'data' array in API response or it's not an array.");
        }

        // Handle total_limit
        let apiTotalLimit = Infinity; // Default to no limit
        if (parsedResponse.limit === "") {
            apiTotalLimit = Infinity;
            console.log("Helix Monitor: API reports no limit (empty string).");
        } else if (parsedResponse.limit && !isNaN(parseInt(parsedResponse.limit, 10))) {
            apiTotalLimit = parseInt(parsedResponse.limit, 10);
            console.log(`Helix Monitor: API reports limit: ${apiTotalLimit}`);
        } else if (parsedResponse.hasOwnProperty('limit')) { // It has the key, but not empty or valid number
            console.warn(`Helix Monitor: API returned unexpected value for limit: "${parsedResponse.limit}". Treating as no limit.`);
            apiTotalLimit = Infinity;
        }

        const transformedData = {
            current_usage_count: activeMessages.length,
            messages: activeMessages, // These messages already have timestamp_ms
            total_limit: apiTotalLimit
        };
        // console.log('Helix Monitor: Transformed API Data:', JSON.stringify(transformedData, null, 2)); // For debugging
        return transformedData;

    } catch (error) {
        console.error('Helix Monitor: Network error or other issue fetching real Helix usage data:', error);
        throw error; // Re-throw to be caught by refreshUsageData
    }
}

// --- Hourly Breakdown Calculation ---
/**
 * Calculates the hourly breakdown of message expiries.
 * @param {Array<Object>} activeMessages - Array of message objects, each with a `timestamp_ms`.
 * @returns {Object} An object where keys are hours (0-23) and values are counts of messages resetting in that hour.
 */
function calculateHourlyBreakdown(activeMessages) {
    const now = new Date();
    const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); // Midnight today
    const tomorrowStartMs = todayStartMs + (24 * 60 * 60 * 1000); // Midnight tomorrow
    const dayAfterTomorrowStartMs = tomorrowStartMs + (24 * 60 * 60 * 1000); // Midnight the day after tomorrow

    const dailyBuckets = {
        today: {},    // Messages resetting from now until midnight today
        tomorrow: {}  // Messages resetting from midnight tonight until midnight tomorrow night
    };

    if (!activeMessages || activeMessages.length === 0) {
        return dailyBuckets; // Return empty buckets
    }

    for (const message of activeMessages) {
        if (typeof message.timestamp_ms !== 'number') {
            console.warn('Helix Monitor: calculateHourlyBreakdown encountered a message without a valid timestamp_ms:', message);
            continue;
        }
        const expiryMs = message.timestamp_ms + (24 * 60 * 60 * 1000);

        // Only consider messages that will reset in the future relative to now.
        if (expiryMs <= now.getTime()) {
            continue;
        }

        const expiryDate = new Date(expiryMs);
        const expiryHour = expiryDate.getHours(); // 0-23
        let dayKey = null;

        if (expiryMs >= now.getTime() && expiryMs < tomorrowStartMs) {
            // Resets today (from now until midnight)
            dayKey = 'today';
        } else if (expiryMs >= tomorrowStartMs && expiryMs < dayAfterTomorrowStartMs) {
            // Resets tomorrow
            dayKey = 'tomorrow';
        }
        // Resets further than "tomorrow" are ignored for this breakdown,
        // as activeMessages are filtered to the last 24h of Date.now(),
        // so their resets (timestamp_ms + 24h) should fall within roughly the next 24h period from Date.now().

        if (dayKey) {
            dailyBuckets[dayKey][expiryHour] = (dailyBuckets[dayKey][expiryHour] || 0) + 1;
        }
    }
    return dailyBuckets;
}
// --- Timer Logic ---
function startUsageCountdown(expiryTimeMs) {
    clearInterval(usageCountdownInterval);
    nextMessageExpiryTimeMs = expiryTimeMs;

    const nextMessageTimeText = document.getElementById('helix-next-message-time-text');
    if (!nextMessageTimeText) {
        console.warn("Helix Monitor: Next message time text element not found in startUsageCountdown.");
        return;
    }

    const updateTimerDisplay = () => {
        const remainingMs = nextMessageExpiryTimeMs - Date.now();
        if (remainingMs <= 0) {
            clearInterval(usageCountdownInterval);
            if (nextMessageTimeText) nextMessageTimeText.textContent = 'Next Message In: Refreshing...';
            console.log("Helix Monitor: Countdown expired, refreshing usage data.");
            refreshUsageData(); 
        } else {
            if (nextMessageTimeText) nextMessageTimeText.textContent = `Next Message In: ${formatMillisecondsToTime(remainingMs)}`;
        }
    };

    updateTimerDisplay(); 
    usageCountdownInterval = setInterval(updateTimerDisplay, 1000);
}


// --- Main Data Refresh and UI Update Logic ---
async function refreshUsageData() {
    const messagesUsedText = document.getElementById('helix-messages-used-text');
    const nextMessageTimeText = document.getElementById('helix-next-message-time-text');

    if (!isHelixConfigActive) {
        console.warn("Helix Monitor: refreshUsageData called while not active. This is unexpected. Aborting.");
        return;
    }

    console.log('Helix Monitor: Refreshing Helix usage data...');
    if (messagesUsedText) messagesUsedText.textContent = 'Messages Used: Loading...';
    if (nextMessageTimeText) nextMessageTimeText.textContent = 'Next Message In: Loading...';

    // Begin WT Edit

    let helixApiKey = null;

    helixApiKey = getGlobalVariable('HMKey') ?? null;

    if (!helixApiKey || typeof helixApiKey !== 'string' || helixApiKey.trim() === '') {
        console.error('Helix Monitor: HMKey global variable not found or empty.');
        if (messagesUsedText) messagesUsedText.textContent = 'Messages Used: Key Error';
        if (nextMessageTimeText) nextMessageTimeText.textContent = 'Next Message In: Key Error';
        return;
    }
    
    // End WT Edit

    try {
        const data = await fetchHelixUsageData_real(helixApiKey); 

        if (messagesUsedText) {
            if (typeof data.total_limit === 'number' && isFinite(data.total_limit)) {
                messagesUsedText.textContent = `Messages Used: ${data.current_usage_count} / ${data.total_limit}`;
            } else { // No limit or invalid limit
                messagesUsedText.textContent = `Messages Used: ${data.current_usage_count}`;
            }
        }

        if (nextMessageTimeText) {
            if (data.current_usage_count === 0 || !data.messages || data.messages.length === 0) {
                nextMessageTimeText.textContent = 'Next Message In: Ready';
                clearInterval(usageCountdownInterval);
                nextMessageExpiryTimeMs = null; 
                console.log("Helix Monitor: No messages used or messages array empty. Timer cleared, UI set to Ready.");
            } else {
                const oldestMessageTimestampMs = data.messages[0].timestamp_ms;
                const calculatedExpiryTimeMs = oldestMessageTimestampMs + (24 * 60 * 60 * 1000);
                
                console.log(`Helix Monitor: Oldest msg ts (ms): ${oldestMessageTimestampMs}, Calculated expiry (ms): ${calculatedExpiryTimeMs}, Now (ms): ${Date.now()}`);

                // Fallback for weird cases where the filter somehow fails to remove a message older than 24h
                if (calculatedExpiryTimeMs <= Date.now()) {
                    // Oldest message is already expired according to calculation
                    nextMessageTimeText.textContent = 'Next Message In: Slot Open!'; // Or "Ready"
                    clearInterval(usageCountdownInterval);
                    nextMessageExpiryTimeMs = null; // Clear stored expiry time
                    console.log("Helix Monitor: Oldest message already expired. UI updated, timer cleared. No immediate auto-refresh from this path.");
                } else {
                    // Oldest message has a future expiry time
                    startUsageCountdown(calculatedExpiryTimeMs);
                }
            }
        }

        // --- Hourly Breakdown Logic ---
        if (extension_settings && extension_settings[extensionName] && extension_settings[extensionName].showHourlyBreakdown) {
            if (data && data.messages && data.messages.length > 0) {
                hourlyBreakdownData = calculateHourlyBreakdown(data.messages); // data.messages is activeMessages
                // console.log("Helix Monitor: Hourly Breakdown Data:", JSON.stringify(hourlyBreakdownData, null, 2));
            } else {
                hourlyBreakdownData = null; // No active messages, clear breakdown
                // console.log("Helix Monitor: Hourly Breakdown - No active messages to process.");
            }
        } else {
            hourlyBreakdownData = null; // Setting is off, clear any stored data
            // console.log("Helix Monitor: Hourly Breakdown setting is off. Data cleared.");
        }
        updateHourlyBreakdownUI(hourlyBreakdownData); // Centralized call

    } catch (error) {
        console.error('Helix Monitor: Error fetching or processing Helix usage data:', error);
        if (messagesUsedText) messagesUsedText.textContent = 'Messages Used: Error';
        if (nextMessageTimeText) nextMessageTimeText.textContent = 'Next Message In: Error';
        clearInterval(usageCountdownInterval); // Stop timer on error
        hourlyBreakdownData = null; // Clear breakdown data on error too
        updateHourlyBreakdownUI(hourlyBreakdownData); // Ensure UI is cleared/hidden on error
    }
}

// --- Hourly Breakdown UI Functions ---
function createHourlyBreakdownUIContainer() {
    const listContainer = document.createElement('div');
    listContainer.id = 'helix-hourly-breakdown-list';
    // CSS will handle initial display:none
    return listContainer;
}

function updateHourlyBreakdownUI(dailyBuckets) {
    const listContainer = document.getElementById('helix-hourly-breakdown-list');
    if (!listContainer) {
        console.warn("Helix Monitor: Hourly breakdown list container not found.");
        return;
    }

    listContainer.innerHTML = ''; // Clear previous content
    const currentSettings = extension_settings[extensionName] || defaultHelixSettings;

    // Check if there's any data to display and if the setting is on
    const hasTodayData = dailyBuckets && dailyBuckets.today && Object.keys(dailyBuckets.today).length > 0;
    const hasTomorrowData = dailyBuckets && dailyBuckets.tomorrow && Object.keys(dailyBuckets.tomorrow).length > 0;

    if (!currentSettings.showHourlyBreakdown || (!hasTodayData && !hasTomorrowData)) {
        listContainer.style.display = 'none';
        return;
    }

    listContainer.style.display = 'block';
    let itemsAdded = 0;
    const now = new Date();
    const currentHour = now.getHours();

    // Display "Today"
    // For "Today", we only show hours from the current hour up to 23
    if (hasTodayData) {
        let todayDayItemsAdded = 0;
        const todayDaySpecificList = [];
        for (let h = currentHour; h < 24; h++) { // h is the actualExpiryHour here
            if (dailyBuckets.today[h] > 0) {
                const count = dailyBuckets.today[h];
                const displayHour = (h + 1) % 24;
                const formattedDisplayHour = formatHourForDisplay(displayHour);
                const itemElement = document.createElement('p');
                itemElement.textContent = `Resetting by ${formattedDisplayHour}: ${count} message${count > 1 ? 's' : ''}`;
                todayDaySpecificList.push(itemElement);
                todayDayItemsAdded++;
            }
        }
        if (todayDayItemsAdded > 0) {
            const headerElement = document.createElement('h4');
            headerElement.textContent = "Today";
            listContainer.appendChild(headerElement);
            todayDaySpecificList.forEach(item => listContainer.appendChild(item));
            itemsAdded += todayDayItemsAdded;
        }
    }

    // Display "Tomorrow"
    // For "Tomorrow", we show all hours from 0 to 23 that have entries
    if (hasTomorrowData) {
        let tomorrowDayItemsAdded = 0;
        const tomorrowDaySpecificList = [];
        for (let h = 0; h < 24; h++) { // h is the actualExpiryHour here
            if (dailyBuckets.tomorrow[h] > 0) {
                const count = dailyBuckets.tomorrow[h];
                const displayHour = (h + 1) % 24;
                const formattedDisplayHour = formatHourForDisplay(displayHour);
                const itemElement = document.createElement('p');
                itemElement.textContent = `Resetting by ${formattedDisplayHour}: ${count} message${count > 1 ? 's' : ''}`;
                tomorrowDaySpecificList.push(itemElement);
                tomorrowDayItemsAdded++;
            }
        }
        if (tomorrowDayItemsAdded > 0) {
            const headerElement = document.createElement('h4');
            headerElement.textContent = "Tomorrow";
            listContainer.appendChild(headerElement);
            tomorrowDaySpecificList.forEach(item => listContainer.appendChild(item));
            itemsAdded += tomorrowDayItemsAdded;
        }
    }

    if (itemsAdded === 0) {
        listContainer.style.display = 'none';
    }
}

// Function to create the Helix Usage Display UI
function createUsageDisplayUI() {
    const container = document.createElement('div');
    container.id = 'helix-usage-container';

    const messagesUsedP = document.createElement('p');
    messagesUsedP.id = 'helix-messages-used-text';
    messagesUsedP.textContent = 'Messages Used: N/A';
    container.appendChild(messagesUsedP);

    const nextMessageTimeP = document.createElement('p');
    nextMessageTimeP.id = 'helix-next-message-time-text';
    nextMessageTimeP.textContent = 'Next Message In: N/A';
    container.appendChild(nextMessageTimeP);

    // Create and append the hourly breakdown container here as well
    const hourlyBreakdownUI = createHourlyBreakdownUIContainer();
    container.appendChild(hourlyBreakdownUI);

    return container;
}

// Function to check conditions and update Helix UI visibility and API key
function checkAndUpdateHelixUI() {
    const uiContainer = document.getElementById('helix-usage-container');
    const messagesUsedText = document.getElementById('helix-messages-used-text');
    const nextMessageTimeText = document.getElementById('helix-next-message-time-text');

    if (!uiContainer) {
        console.warn("Helix Monitor: Main UI container not found in checkAndUpdateHelixUI.");
        return;
    }

    const currentSettings = context.chatCompletionSettings;
    let newActiveState = false;
    const helixUrlPattern = 'https://helixmind.online';

    if (currentSettings?.chat_completion_source === 'custom') {
        const customUrl = currentSettings?.custom_url ?? '';
        if (customUrl.startsWith(helixUrlPattern)) {
            newActiveState = true;
        }
    }

    if (isHelixConfigActive !== newActiveState) {
        console.log(`Helix Monitor: Active state changing from ${isHelixConfigActive} to ${newActiveState}.`);
        isHelixConfigActive = newActiveState; // Update the global state

        if (isHelixConfigActive) {
            uiContainer.classList.add('helix-active');
            console.log('Helix Monitor: Became active. Triggering initial data refresh.');
            refreshUsageData(); // Refresh data now that it's active
        } else {
            uiContainer.classList.remove('helix-active');
            clearInterval(usageCountdownInterval); // Stop timer
            if (messagesUsedText) messagesUsedText.textContent = 'Messages Used: N/A';
            if (nextMessageTimeText) nextMessageTimeText.textContent = 'Next Message In: N/A';
            
            // Also hide and clear the hourly breakdown UI
            const hourlyListContainer = document.getElementById('helix-hourly-breakdown-list');
            if (hourlyListContainer) {
                hourlyListContainer.style.display = 'none';
                hourlyListContainer.innerHTML = '';
            }
            hourlyBreakdownData = null; // Clear data when main UI becomes inactive

            console.log('Helix Monitor: Became inactive. UI reset, timer cleared, hourly breakdown hidden.');
        }
    }
    // If state hasn't changed, do nothing here. Refreshes are triggered by:
    // 1. Becoming active (above).
    // 2. Generation end/stopped events.
    // 3. Timer expiry.
    // 4. Settings changes (for hourly breakdown visibility specifically)
}

// Function to initialize and inject the Usage Display UI
function initHelixUsageUI() {
    // Check if the main usage display UI already exists
    if (document.getElementById('helix-usage-container')) {
        console.log("Helix Usage Monitor main display UI already exists.");
        return; // Main display already initialized
    }

    const usageUI = createUsageDisplayUI();
    let injectionSuccessful = false;

    // Injection logic: Target the "Streaming" toggle in the left navbar.
    // The goal is to insert the Helix Usage UI before the "Streaming" toggle.
    const streamToggleInput = document.getElementById('stream_toggle');
    let streamingToggleDiv = null;

    if (streamToggleInput) {
        // Find the closest ancestor div with class 'range-block'
        streamingToggleDiv = streamToggleInput.closest('div.range-block');
    }

    if (streamingToggleDiv && streamingToggleDiv.parentElement) {
        try {
            streamingToggleDiv.parentElement.insertBefore(usageUI, streamingToggleDiv);
            console.log("Helix Usage Monitor UI injected before the 'Streaming' toggle's div.range-block.");
            injectionSuccessful = true;
        } catch (e) {
            console.error("Error injecting Helix Usage Monitor UI before 'Streaming' toggle's div.range-block:", e);
        }
    } else {
        console.warn("Could not find the 'Streaming' toggle (input#stream_toggle) or its 'div.range-block' container. Attempting fallback injection.");
    }

    // Fallback: If specific injection fails, append to a known general area in the left navbar.
    if (!injectionSuccessful) {
        const leftNavPanel = document.getElementById('left-nav-panel');
        if (leftNavPanel) {
            const scrollableInner = leftNavPanel.querySelector('.scrollableInner .panels'); 
            if (scrollableInner) {
                scrollableInner.appendChild(usageUI);
                console.log("Helix Usage Monitor UI appended to '.scrollableInner .panels' in '#left-nav-panel' (fallback).");
                injectionSuccessful = true;
            } else {
                const genericScrollable = leftNavPanel.querySelector('.scrollableInner');
                if (genericScrollable) {
                    genericScrollable.appendChild(usageUI);
                     console.log("Helix Usage Monitor UI appended to '.scrollableInner' in '#left-nav-panel' (fallback).");
                     injectionSuccessful = true;
                } else {
                    leftNavPanel.appendChild(usageUI);
                    console.log("Helix Usage Monitor UI appended to '#left-nav-panel' (fallback).");
                    injectionSuccessful = true;
                }
            }
        }
    }

    if (!injectionSuccessful) {
        console.warn("Could not find a suitable parent element in the left navbar for Helix Usage Monitor UI. Appending to body as a last resort.");
        document.body.appendChild(usageUI);
        injectionSuccessful = true; // Assuming append to body is a success for this flag's purpose
    }

    if (injectionSuccessful) {
        checkAndUpdateHelixUI(); // Set initial state for the main usage display
    }
}

// jQuery ready function - Main entry point for the extension
jQuery(async () => {

    console.log("Helix Usage Monitor: jQuery ready.");
    // Initialize the main usage display UI first
    initHelixUsageUI();

    try {
        // Load settings HTML
        const settingsHtml = await $.get(`${extensionFolderPath}/helix_usage_settings.html`);
        // Append settings HTML to the designated area in SillyTavern's settings
        $('#extensions_settings').append(settingsHtml); // Standard ST practice
        console.log("Helix Monitor: Settings HTML loaded and appended.");

        // Attach event listener for the toggle
        $('#helix-usage-hourly-toggle').on('change', function() {
            if (!extension_settings[extensionName]) {
                extension_settings[extensionName] = { ...defaultHelixSettings };
            }
            const newShowSetting = $(this).prop('checked');
            extension_settings[extensionName].showHourlyBreakdown = newShowSetting;
            saveSettingsDebounced();
            console.log(`Helix Monitor: Hourly breakdown setting changed to ${newShowSetting}`);

            if (newShowSetting && isHelixConfigActive) {
                // User wants to show it, and main UI is active.
                // Check if we have data. If not, refresh.
                const hasData = hourlyBreakdownData &&
                                ((hourlyBreakdownData.today && Object.keys(hourlyBreakdownData.today).length > 0) ||
                                 (hourlyBreakdownData.tomorrow && Object.keys(hourlyBreakdownData.tomorrow).length > 0));
                if (!hasData) {
                    console.log("Helix Monitor: Toggle ON, main UI active, no breakdown data. Refreshing.");
                    refreshUsageData(); // This will call updateHourlyBreakdownUI with new data and current setting
                } else {
                    // Data exists, just update the UI with the new setting state
                    updateHourlyBreakdownUI(hourlyBreakdownData);
                }
            } else {
                // User wants to hide it, or main UI is not active.
                // updateHourlyBreakdownUI will handle hiding based on the new setting or if data is null.
                updateHourlyBreakdownUI(hourlyBreakdownData);
            }
        });

        // Load initial settings values into the UI
        loadHelixSettings();
        console.log("Helix Monitor: Initial settings loaded into UI.");

    } catch (error) {
        console.error("Helix Monitor: Error loading or initializing settings panel:", error);
    }
});

// Listen for SillyTavern settings updates to re-evaluate conditions for main display
eventSource.on(event_types.SETTINGS_UPDATED, () => {
    if (extensionDisabled) return;
    console.log("Helix Usage Monitor: SETTINGS_UPDATED event received.");
    checkAndUpdateHelixUI();
    // Checking Settings UI here should be unnecessary assuming the button listener is set up correctly
});

// Listen for generation ended event to trigger refresh
eventSource.on(event_types.GENERATION_ENDED, (data) => {
    //WT Addition for duplicate extension overlap
    if (extensionDisabled) return;
    console.log("Helix Usage Monitor: GENERATION_ENDED event received.");
    //WT Addition for duplicate extension overlap
    if (isHelixConfigActive) {
        console.log("Helix Monitor: Active, refreshing data after generation ended.");
        refreshUsageData();
    }
});