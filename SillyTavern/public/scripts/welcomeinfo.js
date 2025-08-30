import { converter } from '../script.js';

let timelineLoaded = false;

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
            setTimeout(setupInfoPanel, 500);
            return;
        }

        const infoButtons = welcomePanel.querySelectorAll('.welcomeInfoButtons .info_button');
        const navButtons = welcomePanel.querySelectorAll('.infoNavigation .info_button');
        const infoSections = welcomePanel.querySelectorAll('.infoSection');

        console.log('Found buttons:', infoButtons.length, 'nav buttons:', navButtons.length);

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
                fetchAndRenderGoogleDoc();
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

async function fetchAndRenderGoogleDoc() {
    console.log("Timeline loading disabled for mobile compatibility");
    const container = document.getElementById('timelineInfo');
    if (container) {
        container.innerHTML = `<p>Timeline is not available on mobile devices. Please use a desktop browser to view the timeline.</p>`;
    }
    return;
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

