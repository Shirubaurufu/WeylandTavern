import { converter } from '../script.js';

let timelineLoaded = false;

// This function will be called when the DOM is fully loaded
function initWelcomeInfoPanel() {
    console.log('Initializing Welcome Info Panel');

    // This is the core setup function. It assumes the panel element exists.
    function setupInfoPanel(welcomePanel) {
        console.log('Welcome panel element found. Setting up listeners...');
        if (!welcomePanel) return; // Safety check

        // This flag prevents the setup from running more than once
        if (welcomePanel.dataset.infoPanelSetup === 'true') {
            console.log('Info panel already set up. Skipping.');
            return;
        }
        welcomePanel.dataset.infoPanelSetup = 'true';

        const infoButtons = welcomePanel.querySelectorAll('.welcomeInfoButtons .info_button');
        const navButtons = welcomePanel.querySelectorAll('.infoNavigation .info_button');
        const infoSections = welcomePanel.querySelectorAll('.infoSection');

        // ... (The rest of your setup logic remains the same) ...
        // ... I'm copying it here for completeness ...

        function showInfoSection(infoType) {
            console.log('Showing info section:', infoType);
            welcomePanel.classList.add('infoMode');
            infoSections.forEach(section => { section.style.display = 'none'; });
            navButtons.forEach(btn => { btn.classList.remove('active'); });

            if (infoType === 'character') {
                document.getElementById('characterInfo').style.display = 'block';
                welcomePanel.querySelector('.infoNavigation .info_button[data-info-type="character"]').classList.add('active');
                fetchAndRenderMarkdown('character');
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
                // Let's keep the mobile fix here for now just in case
                // fetchAndRenderGoogleDoc();
            }
        }

        infoButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const infoType = this.getAttribute('data-info-type');
                showInfoSection(infoType);
            });
        });

        navButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const infoType = this.getAttribute('data-info-type');
                if (infoType === 'back') {
                    welcomePanel.classList.remove('infoMode');
                } else {
                    showInfoSection(infoType);
                }
            });
        });

        console.log('Info panel setup complete');
    }

    // --- The Main Logic ---
    // 1. Try to find the panel immediately.
    const existingPanel = document.querySelector('.welcomePanel');

    if (existingPanel) {
        // SCENARIO A (Desktop): The panel is already here. Set it up now.
        console.log('Welcome panel found immediately on script load.');
        setupInfoPanel(existingPanel);
    } else {
        // SCENARIO B (Mobile): The panel isn't here yet. Set up an observer to wait for it.
        console.log('Welcome panel not found. Setting up MutationObserver.');
        const observer = new MutationObserver((mutations, obs) => {
            const panel = document.querySelector('.welcomePanel');
            if (panel) {
                console.log('Welcome panel appeared. Setting up now.');
                setupInfoPanel(panel);
                obs.disconnect(); // We're done, so stop observing to save resources.
            }
        });

        // Start observing the main chat container.
        observer.observe(document.getElementById('chat'), {
            childList: true,
            subtree: true
        });
    }
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

