import { SlashCommandParser } from "../../slash-commands/SlashCommandParser.js";
import { SlashCommand } from "../../slash-commands/SlashCommand.js";
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from "../../slash-commands/SlashCommandArgument.js";

const STYLE_ID = 'side-character-loader-style';
const CONSOLE_PREFIX = '[SCL]';

const findImage = async (character, expression) => {
    const extensions = ['avif', 'png', 'webp'];
    const basePath = `characters/${character}`;
    
    // Try the requested expression first
    for (const ext of extensions) {
        const testUrl = `${basePath}/${expression}.${ext}`;
        try {
            const response = await fetch(testUrl, { method: 'HEAD' });
            if (response.ok) {
                return testUrl;
            }
        } catch (e) {
            // Continue to next extension
        }
    }
    
    // If expression not found and it's not already 'neutral', try neutral
    if (expression !== 'neutral') {
        for (const ext of extensions) {
            const testUrl = `${basePath}/neutral.${ext}`;
            try {
                const response = await fetch(testUrl, { method: 'HEAD' });
                if (response.ok) {
                    console.log(`${CONSOLE_PREFIX} Expression '${expression}' not found, using neutral`);
                    return testUrl;
                }
            } catch (e) {
                // Continue to next extension
            }
        }
    }
    
    // Nothing found
    console.log(`${CONSOLE_PREFIX} Image not found.`);
    return null;
};

const getSideCharacterWidth = () => {
    const sheld = document.getElementById('sheld');
    if (sheld) {
        const sheldRect = sheld.getBoundingClientRect();
        const availableWidth = window.innerWidth - sheldRect.right;
        if (availableWidth > 50) { // Only use if there's meaningful space
            return `${availableWidth}px`;
        }
    }
    return null; // Fall back to default
};

const updateSideCharacter = async (args) => {
    // Parse clear parameter
    const shouldClear = args.clear === 'true';
    
    // Remove old style
    const oldStyle = document.getElementById(STYLE_ID);
    if (oldStyle) oldStyle.remove();
    
    // If clearing, just remove and return
    if (shouldClear) {
        window.removeEventListener('resize', window._sclResizeHandler);
        return 'Side character cleared';
    }
    
    // Get dimensions from main expression image if not provided
    const expressionImg = $('#expression-image');
    
    // Wait for image to be fully loaded before reading dimensions
    let imgWidth = 0;
    let imgHeight = 0;
    
    if (expressionImg.length) {
        const img = expressionImg[0];
        
        // If image is already loaded, get dimensions immediately
        if (img.complete && img.naturalHeight !== 0) {
            imgWidth = expressionImg.width();
            imgHeight = expressionImg.height();
        } else {
            // Wait for image to load
            await new Promise((resolve) => {
                if (img.complete) {
                    resolve();
                } else {
                    img.addEventListener('load', resolve, { once: true });
                    // Timeout after 5 seconds if image doesn't load
                    setTimeout(resolve, 5000);
                }
            });
            
            imgWidth = expressionImg.width();
            imgHeight = expressionImg.height();
        }
    }
    
    // Only use expression image dimensions if height is at least 150px
    const autoWidth = getSideCharacterWidth();
    const defaultWidth = autoWidth || ((imgHeight >= 125) ? `${imgWidth}px` : '500px');
    const defaultHeight = (imgHeight >= 125) ? `${imgHeight}px` : '1200px';
    
    // Parse parameters with defaults
    const character = args.character || 'Blake';
    const expression = args.expression || 'neutral';
    const bottom = args.bottom || '0px';
    const right = args.right || '0px';
    const width = args.width || defaultWidth;
    const height = args.height || defaultHeight;
    
    // Find the image
    const imagePath = await findImage(character, expression);
    
    // If no image found, don't inject CSS
    if (!imagePath) {
        return `Side character: ${character} - ${expression} (not found)`;
    }
    
    // Inject new CSS
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        body::after {
            content: '';
            position: fixed;
            bottom: ${bottom};
            right: ${right};
            width: ${width};
            height: ${height};
            background-image: url("${imagePath}");
            background-size: contain;
            background-repeat: no-repeat;
            background-position: bottom center;
            pointer-events: none;
            z-index: 0;
            transition: opacity 0.3s ease;
            opacity: 1;
        }
    `;
    document.head.appendChild(style);

    // Re-run on window resize to keep width in sync with #sheld
    window.removeEventListener('resize', window._sclResizeHandler);
    window._sclResizeHandler = () => updateSideCharacter(args);
    window.addEventListener('resize', window._sclResizeHandler);
    
    return `Side character set to: ${character} - ${expression}`;
};

// Register the slash command
jQuery(async () => {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'sidecharacter',
        callback: updateSideCharacter,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'character',
                description: 'Character name/folder (defaults to Blake)',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'Blake',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'expression',
                description: 'Expression name to display (defaults to neutral)',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: 'neutral',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'clear',
                description: 'Clear the side character image',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: ['true', 'false'],
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'bottom',
                description: 'Bottom position (CSS value)',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: '0px',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'right',
                description: 'Right position (CSS value)',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: '0px',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'width',
                description: 'Image width (CSS value)',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: '500px',
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'height',
                description: 'Image height (CSS value)',
                typeList: [ARGUMENT_TYPE.STRING],
                defaultValue: '1200px',
            }),
        ],
        helpString: `
            <div>
                Displays a side character image with customizable position and size.
            </div>
            <div>
                <strong>Examples:</strong>
                <ul>
                    <li><code>/sidecharacter character=Summer expression=happy</code> - Show Summer with happy expression</li>
                    <li><code>/sidecharacter expression=sad</code> - Change expression (uses default character Blake)</li>
                    <li><code>/sidecharacter character=Kiera expression=neutral bottom=-200px right=50px</code> - Custom positioning</li>
                    <li><code>/sidecharacter clear=true</code> - Clear the side character</li>
                </ul>
            </div>
        `,
    }));
});
