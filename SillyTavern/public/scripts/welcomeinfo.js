import { converter } from '../script.js';

let timelineLoaded = false;
let welcomeTrackerCountdownInterval = null;
let welcomeTrackerExpiryTimeMs = null;
let welcomeTrackerActivePanel = null;

function stopWelcomeTrackerCountdown() {
    clearInterval(welcomeTrackerCountdownInterval);
    welcomeTrackerCountdownInterval = null;
    welcomeTrackerExpiryTimeMs = null;
    welcomeTrackerActivePanel = null;
}

function formatMillisecondsToTime(ms) {
    if (ms < 0) {
        ms = 0;
    }

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (num) => String(num).padStart(2, '0');

    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    return `${pad(minutes)}:${pad(seconds)}`;
}

async function fetchWelcomeHelixUsageData(apiKey) {
    const response = await fetch('https://helixmind.online/v1/usage', {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const parsedResponse = await response.json();
    const twentyFourHoursAgoMs = Date.now() - (24 * 60 * 60 * 1000);
    let activeMessages = [];

    if (parsedResponse.data && Array.isArray(parsedResponse.data)) {
        activeMessages = parsedResponse.data
            .map(item => ({
                ...item,
                timestamp_ms: item.timestamp * 1000,
            }))
            .filter(message => message.timestamp_ms >= twentyFourHoursAgoMs)
            .sort((a, b) => a.timestamp_ms - b.timestamp_ms);
    }

    let totalLimit = Infinity;
    if (parsedResponse.limit === '') {
        totalLimit = Infinity;
    } else if (parsedResponse.limit && !Number.isNaN(parseInt(parsedResponse.limit, 10))) {
        totalLimit = parseInt(parsedResponse.limit, 10);
    }

    return {
        current_usage_count: activeMessages.length,
        messages: activeMessages,
        total_limit: totalLimit,
    };
}

function startWelcomeTrackerCountdown(welcomePanel, expiryTimeMs) {
    stopWelcomeTrackerCountdown();
    welcomeTrackerExpiryTimeMs = expiryTimeMs;
    welcomeTrackerActivePanel = welcomePanel;

    const nextMessageTimeText = welcomePanel.querySelector('#hm-next-message-time-text');
    if (!nextMessageTimeText) {
        return;
    }

    const updateTimerDisplay = () => {
        const panel = welcomeTrackerActivePanel;
        const timerText = panel?.querySelector('#hm-next-message-time-text');
        if (!panel || !timerText || welcomeTrackerExpiryTimeMs === null) {
            return;
        }

        const remainingMs = welcomeTrackerExpiryTimeMs - Date.now();
        if (remainingMs <= 0) {
            stopWelcomeTrackerCountdown();
            timerText.textContent = 'Refreshing...';
            void refreshWelcomeTrackerUsage(panel);
            return;
        }

        timerText.textContent = `${formatMillisecondsToTime(remainingMs)}`;
    };

    updateTimerDisplay();
    welcomeTrackerCountdownInterval = setInterval(updateTimerDisplay, 1000);
}

async function refreshWelcomeTrackerUsage(welcomePanel) {
    const ctx = SillyTavern?.getContext?.();
    const messagesUsedText = welcomePanel.querySelector('#hm-messages-used-text');
    const nextMessageTimeText = welcomePanel.querySelector('#hm-next-message-time-text');
    const helixApiKey = ctx?.variables?.global?.get('HMKey') ?? null;

    if (!messagesUsedText || !nextMessageTimeText) {
        return;
    }

    if (!helixApiKey || typeof helixApiKey !== 'string' || helixApiKey.trim() === '') {
        messagesUsedText.textContent = 'Key Error';
        nextMessageTimeText.textContent = 'Key Error';
        stopWelcomeTrackerCountdown();
        return;
    }

    messagesUsedText.textContent = 'Loading...';
    nextMessageTimeText.textContent = 'Loading...';

    try {
        const data = await fetchWelcomeHelixUsageData(helixApiKey);

        if (typeof data.total_limit === 'number' && Number.isFinite(data.total_limit)) {
            messagesUsedText.textContent = `${data.total_limit -data.current_usage_count} / ${data.total_limit}`;
        } else {
            messagesUsedText.textContent = `${data.current_usage_count}`;
        }

        if (data.current_usage_count === 0 || !data.messages || data.messages.length === 0) {
            nextMessageTimeText.textContent = 'Ready';
            document.getElementById('hm-next-message-container').style.display = 'none';
            stopWelcomeTrackerCountdown();
            return;
        }
        else {
            document.getElementById('hm-next-message-container').style.display = 'inline';
        }

        const oldestMessageTimestampMs = data.messages[0].timestamp_ms;
        const calculatedExpiryTimeMs = oldestMessageTimestampMs + (24 * 60 * 60 * 1000);

        if (calculatedExpiryTimeMs <= Date.now()) {
            nextMessageTimeText.textContent = 'Next Message In: Slot Open!';
            stopWelcomeTrackerCountdown();
            return;
        }

        startWelcomeTrackerCountdown(welcomePanel, calculatedExpiryTimeMs);
    } catch (error) {
        console.error('Welcome tracker: error fetching Helix usage data:', error);
        messagesUsedText.textContent = 'Messages Used: Error';
        nextMessageTimeText.textContent = 'Next Message In: Error';
        stopWelcomeTrackerCountdown();
    }
}

async function clearHelixTrackerKey(welcomePanel) {
    const ctx = SillyTavern?.getContext?.();
    if (!ctx) {
        console.error('SillyTavern context not available');
        return;
    }

    stopWelcomeTrackerCountdown();
    await ctx.executeSlashCommandsWithOptions(
        '/flushglobalvar HMKey | /secret-delete quiet=true key=api_key_custom api_key_custom',
    );
    updateTrackerKeyUI(welcomePanel);
}

function updateTrackerKeyUI(welcomePanel) {
    const ctx = SillyTavern?.getContext?.();
    const key = ctx?.variables?.global?.get('HMKey');
    const unset = welcomePanel.querySelector('#hm-key-unset');
    const set = welcomePanel.querySelector('#hm-key-set');
    const hasKey = typeof key === 'string' && key.trim().includes('helix');

    if (hasKey) {
        if (unset) {
            unset.style.display = 'none';
        }
        if (set) {
            set.style.display = '';
        }
        void refreshWelcomeTrackerUsage(welcomePanel);
    } else {
        stopWelcomeTrackerCountdown();
        if (unset) {
            unset.style.display = '';
        }
        if (set) {
            set.style.display = 'none';
        }
    }
}

async function setHelixTrackerKeyFromInput(welcomePanel) {
    const ctx = SillyTavern?.getContext?.();
    if (!ctx) {
        console.error('SillyTavern context not available');
        return;
    }

    const input = welcomePanel.querySelector('#tracker-key-input');
    const trimmedKey = input instanceof HTMLInputElement ? input.value.trim() : '';

    if (!trimmedKey) {
        return;
    }

    if (!trimmedKey.includes('helix')) {
        toastr.error('Please copy the entire key, including the \'helix-\' part.');
        return;
    }

    await ctx.executeSlashCommandsWithOptions(
        `/setglobalvar key=HMKey ${trimmedKey} | /secret-write quiet=true label=api_key_custom key=api_key_custom ${trimmedKey}`,
    );

    if (input instanceof HTMLInputElement) {
        input.value = '';
    }

    updateTrackerKeyUI(welcomePanel);
}

function setupTrackerKeyButton(welcomePanel) {
    const setButton = welcomePanel.querySelector('#set-tracker-key');
    const clearButton = welcomePanel.querySelector('#clear-tracker-key');
    const keyInput = welcomePanel.querySelector('#tracker-key-input');

    if (setButton && setButton.dataset.trackerKeyBound !== 'true') {
        setButton.dataset.trackerKeyBound = 'true';
        setButton.addEventListener('click', () => {
            void setHelixTrackerKeyFromInput(welcomePanel);
        });
    }

    if (keyInput && keyInput.dataset.trackerKeyBound !== 'true') {
        keyInput.dataset.trackerKeyBound = 'true';
        keyInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void setHelixTrackerKeyFromInput(welcomePanel);
            }
        });
    }

    if (clearButton && clearButton.dataset.trackerKeyBound !== 'true') {
        clearButton.dataset.trackerKeyBound = 'true';
        clearButton.addEventListener('click', () => {
            void clearHelixTrackerKey(welcomePanel);
        });
    }

    updateTrackerKeyUI(welcomePanel);
}

// This function will be called when the DOM is fully loaded
function initWelcomeInfoPanel() {
    console.log('Initializing Welcome Info Panel');

    // Function to set up the info panel functionality
    function setupInfoPanel() {
        console.log('Setting up info panel');

        // Get references to elements
        const welcomePanel = document.querySelector('.welcomePanel');
        if (!welcomePanel) {
            console.log('Welcome panel not found, waiting...');
            // If panel isn't loaded yet, try again shortly
            if (!document.body.getAttribute('skipped-welcome-screen')) {
                setTimeout(setupInfoPanel, 500);
            }
            return;
        }

        const infoButtons = welcomePanel.querySelectorAll('.welcomeInfoButtons button.info_button');
        const navButtons = welcomePanel.querySelectorAll('.infoNavigation .info_button');
        const infoSections = welcomePanel.querySelectorAll('.infoSection');

        console.log('Found buttons:', infoButtons.length, 'nav buttons:', navButtons.length);

        setupTrackerKeyButton(welcomePanel);

        // Function to show a specific info section
        function showInfoSection(infoType) {
            console.log('Showing info section:', infoType);

            // Enter info mode
            welcomePanel.classList.add('infoMode');

            // Hide all info sections
            infoSections.forEach(section => {
                section.style.display = 'none';
            });

            // Reset active state on nav buttons
            navButtons.forEach(btn => {
                btn.classList.remove('active');
            });

            // Show the selected section and fetch content
            if (infoType === 'character') {
                document.getElementById('characterInfo').style.display = 'block';
                welcomePanel.querySelector('.infoNavigation .info_button[data-info-type="character"]').classList.add('active');
                // Instead of fetching markdown, embed the webpage
                embedWebpage('character');
            } else if (infoType === 'dorm') {
                document.getElementById('dormInfo').style.display = 'block';
                welcomePanel.querySelector('.infoNavigation .info_button[data-info-type="dorm"]').classList.add('active');
                fetchAndRenderMarkdown('dorm');
            } else if (infoType === 'world') {
                document.getElementById('worldInfo').style.display = 'block';
                welcomePanel.querySelector('.infoNavigation .info_button[data-info-type="world"]').classList.add('active');
                fetchAndRenderMarkdown('world');
            } else if (infoType === 'timeline') {
                document.getElementById('timelineInfo').style.display = 'block';
                welcomePanel.querySelector('.infoNavigation .info_button[data-info-type="timeline"]').classList.add('active');
                fetchAndRenderGoogleDoc();
            } else if (infoType === 'help') {
                document.getElementById('CommandsInfo').style.display = 'block';
                welcomePanel.querySelector('.infoNavigation .info_button[data-info-type="help"]').classList.add('active');
                fetchAndRenderMarkdown("Commands");
            } else if (infoType === 'version') {
                document.getElementById('Version_InfoInfo').style.display = 'block';
                welcomePanel.querySelector('.infoNavigation .info_button[data-info-type="version"]').classList.add('active');
                fetchAndRenderMarkdown("Version_Info");
            }
        }

        // Add click handlers to main info buttons
        infoButtons.forEach(button => {
            console.log('Adding click handler to button:', button.getAttribute('data-info-type'));
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const infoType = this.getAttribute('data-info-type');
                console.log('Info button clicked:', infoType);
                showInfoSection(infoType);
            });
        });

        // Add click handlers to navigation buttons
        navButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const infoType = this.getAttribute('data-info-type');
                console.log('Nav button clicked:', infoType);

                if (infoType === 'back') {
                    // Go back to main welcome panel
                    welcomePanel.classList.remove('infoMode');
                } else {
                    // Show the selected info section
                    showInfoSection(infoType);
                }
            });
        });

        console.log('Info panel setup complete');
    }

    // Set up observers to detect when the welcome panel is added to the page
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    const node = mutation.addedNodes[i];
                    if (node.classList && node.classList.contains('welcomePanel')) {
                        console.log('Welcome panel added to the page');
                        setupInfoPanel();
                        return;
                    }
                }
            }
        });
    });

    // Start observing the chat container for when the welcome panel is added
    const chatContainer = document.getElementById('chat');
    if (chatContainer) {
        observer.observe(chatContainer, { childList: true, subtree: true });
        console.log('Observer started on chat container');
    } else {
        console.log('Chat container not found, will try again when document is ready');
    }

    // Also try to set up right away in case the panel is already there
    setupInfoPanel();
}

/**
 * Embeds a webpage into the specified container using an iframe
 * @param {string} type The type of content (currently only 'dorm')
 */
function embedWebpage(type) {
    if (document.getElementById(`${type}IframeOverlay`)) {
        return;
    }

    const container = document.getElementById(`${type}Info`);
    if (!container) {
        console.error(`Could not find container for ${type}Info`);
        return;
    }
    
    container.innerHTML = '';

    // Create a fixed overlay wrapper that escapes the message box bounds
    const overlay = document.createElement('div');
    overlay.id = `${type}IframeOverlay`;
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 9999;
        background: var(--SmartThemeBlurTintColor, #1a1a1a);
        display: flex;
        flex-direction: column;
    `;

    // Optional: a thin close/back bar at the top so users can return
    const topBar = document.createElement('div');
    topBar.style.cssText = `
        display: flex;
        align-items: center;
        padding: 6px 12px;
        background: var(--SmartThemeBodyColor, #111);
        border-bottom: 1px solid var(--SmartThemeBorderColor, #444);
        flex-shrink: 0;
    `;

    const backBtn = document.createElement('button');
    backBtn.textContent = '← Back';
    backBtn.style.cssText = `
        background: transparent;
        border: 1px solid var(--SmartThemeBorderColor, #666);
        color: var(--SmartThemeBodyTextColor, #fff);
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9em;
    `;

    backBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        overlay.remove();
        const welcomePanel = document.querySelector('.welcomePanel');
        if (welcomePanel) welcomePanel.classList.remove('infoMode');
    });
    
    topBar.appendChild(backBtn);

    const iframe = document.createElement('iframe');
    iframe.src = 'https://cast.weybooru.com/';
    iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        flex: 1;
    `;

    overlay.appendChild(topBar);
    overlay.appendChild(iframe);

    // Attach to body so it's completely outside the message box DOM
    document.body.appendChild(overlay);

    console.log(`Embedded webpage for ${type} as full-screen overlay`);
}

async function fetchAndRenderGoogleDoc() {
    if (timelineLoaded) {
        console.log("Timeline already loaded, not re-fetching.");
        return;
    }

    console.log("Attaching Shadow DOM and fetching timeline...");
    const container = document.getElementById('timelineInfo');
    if (!container) {
        console.error("Timeline container not found!");
        return;
    }

    const googleDocUrl = 'https://docs.google.com/document/d/e/2PACX-1vRHGk69-Q9vXH8rhM2ucoFKuh1KFpYd8_sbfnMWOiTmle4Sh-qyukgfYi5r2WqFPKLyyq_Lxsek3L7X/pub?embedded=true';

    try {
        const shadowRoot = container.attachShadow({ mode: 'open' });
        const response = await fetch(googleDocUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const docHtml = await response.text();

        // --- THE SLEDGEHAMMER ---
        // Create a <style> element with our new, more aggressive override rules.
        const overrideStyles = document.createElement('style');
        overrideStyles.textContent = `
            /* THE BIG FIX: Use the universal selector (*) to force EVERYTHING to have a transparent background. */
            * {
                background-color: transparent !important;
            }

            /* Keep this rule: It forces ALL text elements to inherit the main page's text color. */
            p, li, h1, h2, h3, h4, h5, h6, span, a {
                color: inherit !important;
            }
        `;

        // Inject the fetched HTML and our new override styles into the Shadow DOM
        shadowRoot.innerHTML = docHtml;
        shadowRoot.appendChild(overrideStyles);

        console.log("Timeline loaded into Shadow DOM with UNIVERSAL style overrides.");
        timelineLoaded = true;

    } catch (error) {
        console.error("Error loading timeline into Shadow DOM:", error);
        container.innerHTML = `<p>Failed to load the timeline. Please try again later.</p>`;
    }
}

// Initialize when the DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWelcomeInfoPanel);
} else {
    initWelcomeInfoPanel();
}

function sortCharacterCardsByName() {
    console.log("Attempting to sort character cards by name...");
    const grid = document.querySelector('.character-grid');

    if (!grid) {
        console.error("Character grid container not found for sorting.");
        return;
    }

    // 1. Grab all the card elements
    const cards = grid.querySelectorAll('.character-id-card');

    // 2. Convert the NodeList of cards into a real Array
    const cardsArray = Array.from(cards);

    // 3. Sort the array
    cardsArray.sort((cardA, cardB) => {
        // Find the name value inside each card
        const nameA = cardA.querySelector('.id-name .id-value').textContent.trim();
        const nameB = cardB.querySelector('.id-name .id-value').textContent.trim();

        // Use localeCompare for proper alphabetical sorting
        return nameA.localeCompare(nameB);
    });

    // 4. Re-append the cards to the grid in the new sorted order
    // Appending an existing element moves it, so this reorders the grid
    cardsArray.forEach(card => grid.appendChild(card));

    console.log("Character cards sorted successfully.");
}

/**
 * Fetches markdown content from GitHub and renders it to HTML
 * @param {string} type The type of content to fetch (character, dorm, world)
 */
async function fetchAndRenderMarkdown(type) {
    // The base URL to your GitHub repository's raw content
    const baseUrl = 'https://raw.githubusercontent.com/FFFox-ST-Manager/Weylandpedia/main/';
    const url = `${baseUrl}${type}.md`;

    try {
        console.log(`Fetching ${type} content from: ${url}`);

        // Fetch the markdown content
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch ${type} content: ${response.status}`);
        }

        // Get the markdown text
        const markdownContent = await response.text();
        console.log(`Received markdown content for ${type}`);

        // Convert markdown to HTML using SillyTavern's converter
        const htmlContent = converter.makeHtml(markdownContent);
        console.log(`Converted ${type} markdown to HTML`);

        // Insert the HTML into the appropriate section
        const container = document.getElementById(`${type}Info`);
        if (container) {
            container.innerHTML = htmlContent;
            console.log(`Inserted ${type} HTML content into page`);
            if (type === 'character') {
                setupCharacterFilter();
                sortCharacterCardsByName();
            }
            else if (type === 'world') {
                setupWorldLoreFilter();
            }
        } else {
            console.error(`Could not find container for ${type}Info`);
        }
    } catch (error) {
        console.error(`Error fetching ${type} content:`, error);
        const container = document.getElementById(`${type}Info`);
        if (container) {
            container.innerHTML = `<p>Failed to load ${type} information. Please try again later.</p>`;
        }
    }
}

function setupCharacterFilter() {
    const searchInput = document.getElementById('characterSearchInput');
    const characterCards = document.querySelectorAll('.character-id-card'); // Or '.character-card' if you used the older class

    // If we can't find the search bar or cards, don't do anything.
    if (!searchInput || characterCards.length === 0) {
        console.log("Search input or character cards not found, skipping filter setup.");
        return;
    }

    searchInput.addEventListener('input', () => {
        // 1. Get the search term, convert to lower case for case-insensitive matching
        const searchTerm = searchInput.value.toLowerCase();

        // 2. Loop through each character card
        characterCards.forEach(card => {
            // 3. Find the character's name within the card
            const nameElement = card.querySelector('.id-name .id-value');
            const characterName = nameElement ? nameElement.textContent.toLowerCase() : '';

            // 4. Check if the character's name includes the search term
            if (characterName.includes(searchTerm)) {
                // If it matches, make sure the card is visible
                card.style.display = 'block'; // Or 'flex' if you use that for layout
            } else {
                // If it doesn't match, hide the card
                card.style.display = 'none';
            }
        });
    });
}

function setupWorldLoreFilter() {
    console.log("Attempting to set up world lore filter...");
    const searchInput = document.getElementById('worldLoreSearchInput');
    const contentContainer = document.getElementById('worldInfo');

    if (!searchInput || !contentContainer) {
        console.error("World lore search input or content container not found!");
        return;
    }

    const allHeaders = contentContainer.querySelectorAll('h2');
    if (allHeaders.length === 0) {
        console.warn("No H2 headers found in world lore to filter.");
        return;
    }

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();

        // Iterate over each H2 header, treating it as the start of a section
        allHeaders.forEach(header => {
            let sectionElements = [header];
            let sectionText = header.textContent.toLowerCase();
            let currentNode = header.nextElementSibling;

            // Collect all elements belonging to this section
            // A section ends when we hit the next H2 or there are no more elements
            while (currentNode && currentNode.tagName !== 'H2') {
                sectionElements.push(currentNode);
                sectionText += currentNode.textContent.toLowerCase();
                currentNode = currentNode.nextElementSibling;
            }

            // Now, check if the collected text for the entire section contains the search term
            if (sectionText.includes(searchTerm)) {
                // If it matches, show all elements in this section
                sectionElements.forEach(el => el.style.display = ''); // Reset to default display
            } else {
                // If it doesn't match, hide all elements in this section
                sectionElements.forEach(el => el.style.display = 'none');
            }
        });
    });
}
