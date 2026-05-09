import { eventSource, event_types } from '../../events.js';
import { isMobile } from '../../RossAscends-mods.js';
import { getExpressionLabel } from '../expressions/index.js';

const DEBUG = false;
const LOGGING_PREFIX = '[Registrar-Expressions]';
const EXPRESSION_WRAPPER_ID = 'expression-wrapper';
const LEFT_BASE_EXPRESSION_CONTAINER_ID = 'expression-holder';
const LEFT_BASE_EXPRESSION_ID = 'expression-image';
const LEFT_EXPRESSION_ID = 'registrar-expression-left';
const RIGHT_BASE_EXPRESSION_ID = 'side-character-loader-style';
const RIGHT_BASE_EXPRESSION_HIDE_CLASS = 'registrar-hide-side-character';
const RIGHT_EXPRESSION_ID = 'registrar-expression-right';
const DEBOUNCE_MS = 100;
const OBSERVERS = {
    left: {
        id: LEFT_BASE_EXPRESSION_CONTAINER_ID,
        observer: null,
        observedElement: null,
        options: {
            childList: true,
            subtree: true,
            characterData: true,
        },
    },
    right: {
        id: RIGHT_BASE_EXPRESSION_ID,
        observer: null,
        observedElement: null,
        options: {
            childList: true,
            subtree: true,
            characterData: true,
            attributeFilter: ['src'],
        },
    },
}
const SPEAKER_NAME_PATTERN = /(__|\*\*)(.+?):?\1/gi; // `__Name__` / `__Name:__` / `**Name**` / `**Name:**`
const PATH_CHARACTER_PATTERN = /characters\/(.+?)\//i; // `/characters/{name}/`
const EXCLUDED_SPEAKERS = new Set(['weybot','mirror weyland','{{user}}','{{char}}']);
const MAX_NAME_LENGTH = 32;
const MAX_NAME_WORDS = 3;
const REGISTRAR_EXPRESSIONS_MANIFEST_BASE = 'https://registrar.weybooru.com/expressions/';

const DEFAULT_EXPRESSION_LABELS = [
    'admiration', 'amusement', 'anger', 'annoyance', 'approval', 'caring', 'confusion',
    'curiosity', 'desire', 'disappointment', 'disapproval', 'disgust', 'embarrassment',
    'excitement', 'fear', 'gratitude', 'grief', 'joy', 'love', 'nervousness', 'neutral',
    'optimism', 'pride', 'realization', 'relief', 'remorse', 'sadness', 'surprise',
];

function isTruthy(value) {
    const s = String(value ?? '').trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

function isHideNsfwEnabled() {
    const context = SillyTavern.getContext();
    const localVars = context?.chatMetadata?.variables;
    const globalVars = context?.extensionSettings?.variables?.global;

    // Local chat var takes precedence, fallback to global var.
    const local = localVars?.NSFW;
    if (local !== undefined) return isTruthy(local);
    const global = globalVars?.NSFW;
    if (global !== undefined) return isTruthy(global);
    return false;
}

function isSideCharacterExpressionsEnabled() {
    const context = SillyTavern.getContext();
    const localVars = context?.chatMetadata?.variables;
    const globalVars = context?.extensionSettings?.variables?.global;

    // Local chat var takes precedence, fallback to global var.
    const raw = localVars?.SideCharacters ?? globalVars?.SideCharacters;
    if (raw === undefined || raw === null) return true;

    const s = String(raw).trim().toLowerCase();
    if (!s) return true;
    if (s === 'off' || s === 'false' || s === '0' || s === 'no') return false;
    if (s === 'on' || s === 'true' || s === '1' || s === 'yes') return true;
    return true;
}

function extractPathSpeakerName(path) {
    if (!path) return null;
    const match = path.match(PATH_CHARACTER_PATTERN);
    return match ? match[1].toLowerCase() : null;
}

function getSpeakerNames() {
    const context = SillyTavern.getContext();
    const names = [];
    const seen = new Set(EXCLUDED_SPEAKERS);

    // Add known speakers to this call's exclusion set (left/right base paths)
    const leftSpeaker = extractPathSpeakerName(leftBasePath);
    if (leftSpeaker) seen.add(leftSpeaker);

    const rightSpeaker = extractPathSpeakerName(rightBasePath);
    if (rightSpeaker) seen.add(rightSpeaker);

    if (DEBUG) {
        console.log(`${LOGGING_PREFIX} Seen speakers (excluded from side list):`, { leftSpeaker, rightSpeaker });
    }

    // Push with de-duplication and blank avoidance
    const pushUnique = (name) => {
        name = String(name || '').trim().toLowerCase();
        if (!name) return;
        if (seen.has(name)) return;
        if (name.length > MAX_NAME_LENGTH) return;
        if (name.split(/\s+/).length > MAX_NAME_WORDS) return;
        seen.add(name);
        names.push(name);
    };

    // Search the latest assistant message for speaker names
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const latestAssistant = [...chat].reverse().find((m) => m && !m.is_user && !m.is_system);
    if (latestAssistant?.mes) {
        // TODO: Consider matching against a canonical name list from the registrar
        //     This would enable matching when speaker headers aren't done properly
        //     But would produce false positives if non-present names are mentioned
        // `matchAll` returns a one-shot iterator — do not log via `Array.from(matches)` then loop the same object.
        const matches = [...latestAssistant.mes.matchAll(SPEAKER_NAME_PATTERN)];
        if (DEBUG) {
            console.log(`${LOGGING_PREFIX} Speaker name matches:`, matches);
        }
        for (const match of matches) {
            const name = match[2].trim();
            if (name) {
                pushUnique(name);
            }
        }
    }
    return names;
}

function getRightBaseExpressionPath() {
    const style = document.getElementById(RIGHT_BASE_EXPRESSION_ID);
    if (!style?.textContent) {
        return null;
    }
    const match = style.textContent.match(/background-image:\s*url\(\s*["']?([^"')]+)["']?\s*\)/i);
    return match ? match[1].trim() : null;
}

function getLeftBaseExpressionPath() {
    const element = document.getElementById(LEFT_BASE_EXPRESSION_ID);
    if (!element) {
        return null;
    }
    return element.getAttribute('src') || null;
}

let leftBasePath = null;
let rightBasePath = null;
function resolveBaseExpressionPaths() {
    leftBasePath = getLeftBaseExpressionPath();
    rightBasePath = getRightBaseExpressionPath();
    if (DEBUG) {
        console.log(`${LOGGING_PREFIX} Base expression paths resolved: left=${leftBasePath}, right=${rightBasePath}`);
    }
}

let officialCharacterSet = new Set();
function isOfficialCharacter(name) {

    // Init the character set if it's not already done
    if (!officialCharacterSet.size) {
        const context = SillyTavern.getContext();
        const chars = Array.isArray(context?.characters) ? context.characters : [];
        for (const c of chars) {
            const n = String(c?.name || '').trim().toLowerCase();
            if (n) officialCharacterSet.add(n);
        }
    }

    const normalized = String(name || '').trim().toLowerCase();
    if (!normalized) return false;
    return officialCharacterSet.has(normalized);
}

function getOutfitSegmentFromFolder(folderPath) {
    const raw = String(folderPath || '').trim();
    if (!raw) return '';
    const parts = raw.split('/').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return parts[1];
    return '';
}

function forceSafeOfficialOutfit(outfitName) {
    const raw = String(outfitName || '').trim();
    const low = raw.toLowerCase();
    if (!raw) return 'Regular Outfit';
    if (/(^|[\s_-])(regular|casual|normal|clothed)([\s_-]|$)/u.test(low)) {
        return raw;
    }
    // If the official outfit clearly maps to NSFW buckets, force a normal outfit.
    if (normalizeOutfit(raw) !== 'clothed') {
        return 'Regular Outfit';
    }
    return raw;
}

function getActiveOutfit(characterName) {
    const context = SillyTavern.getContext();
    const normalizedName = String(characterName || '').trim().toLowerCase();

    // Use the outfit of the left official character if available
    if (leftBasePath) {
        const leftImage = document.getElementById(LEFT_BASE_EXPRESSION_ID);
        const folder = leftImage instanceof HTMLImageElement ? leftImage.getAttribute('data-sprite-folder-name') : '';
        const expressionFolder = String(folder || '').trim();
        const leftOutfit = getOutfitSegmentFromFolder(expressionFolder);
        if (leftOutfit) {
            if (isHideNsfwEnabled()) {
                return forceSafeOfficialOutfit(leftOutfit);
            }
            return leftOutfit;
        }
    }

    // Derive from the expressions override path used by the core extension
    const chars = Array.isArray(context?.characters) ? context.characters : [];
    const character = chars.find((c) => String(c?.name || '').trim().toLowerCase() === normalizedName);
    if (!character) return '';

    const avatarBase = String(character.avatar || '').replace(/\.[^/.]+$/, '');
    if (!avatarBase) return '';

    let overrides = context?.extensionSettings?.expressionOverrides;
    overrides = Array.isArray(overrides) ? overrides : [];
    const override = overrides.find((o) => String(o?.name || '').trim() === avatarBase);

    const resolved = getOutfitSegmentFromFolder(override?.path || '');
    if (isHideNsfwEnabled()) {
        return forceSafeOfficialOutfit(resolved);
    }
    return resolved;
}

function normalizeOutfit(outfitName) {
    const name = String(outfitName || '').trim().toLowerCase();
    if (!name) return 'clothed';
    if (/(^|[\s_-])(nude|naked|bare|topless|bottomless)([\s_-]|$)/u.test(name)) {
        return 'nude';
    }
    if (/(^|[\s_-])(underwear|lingerie|bikini|swimsuit|bra|pant(ie|y)s?)([\s_-]|$)/u.test(name)) {
        return 'underwear';
    }
    return 'clothed';
}

function getEmotions() {
    const context = SillyTavern.getContext();
    const customEmotions = context?.extensionSettings?.expressions?.custom;
    const labels = new Set(DEFAULT_EXPRESSION_LABELS);
    if (Array.isArray(customEmotions)) {
        for (const emotion of customEmotions) {
            const label = String(emotion || '').trim().toLowerCase();
            if (label) labels.add(label);
        }
    }
    return labels;
}

/**
 * @param {string} name Normalized speaker name (lowercase).
 * @returns {Promise<string>}
 */
async function getSpeakerEmotion(name) {

    // On mobile, skip deeper analysis for performance
    if (isMobile()) {
        return defaultEmotion;
    }
    
    // Get the latest assistant message
    const context = SillyTavern.getContext();
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const latestAssistant = [...chat].reverse().find((m) => m && !m.is_user && !m.is_system);
    if (!latestAssistant?.mes) {
        return defaultEmotion;
    }

    // Get the last quote from the specified character
    let snippet = String(latestAssistant.mes).trim();
    const matches = latestAssistant.mes.matchAll(SPEAKER_NAME_PATTERN);
    for (const match of matches) {
        let nameTag = match[2].trim();
        if (nameTag) {
            nameTag = String(nameTag || '').trim().toLowerCase();
            if (nameTag !== name) continue;
            if (nameTag.length > MAX_NAME_LENGTH) continue;
            if (nameTag.split(/\s+/).length > MAX_NAME_WORDS) continue;

            // Capture the text from the name to the next line break
            let quote = latestAssistant.mes.slice(match.index + match[0].length);
            const endMatch = quote.match(/[\r\n$]+/);
            if (endMatch) {
                quote = quote.slice(0, endMatch.index);
            }
            snippet = quote;
            break;
        }
    }

    if (snippet.length >= 8) {
        try {
            const label = await getExpressionLabel(snippet, 0);
            if (label && String(label).trim()) {
                if (DEBUG) {
                    console.log(`${LOGGING_PREFIX} inidividualized emotion for ${name}: ${label}`);
                }
                return String(label).trim().toLowerCase();
            }
            if (DEBUG) {
                console.log(`${LOGGING_PREFIX} no individualized emotion found for ${name} (returned '${label}'), using default emotion: ${defaultEmotion}`);
            }
        } catch (e) {
            if (DEBUG) {
                console.log(`${LOGGING_PREFIX} getExpressionLabel failed for ${name}:`, e);
            }
        }
    }

    return defaultEmotion;
}

function getDefaultMessageEmotion() {
    // Get the latest assistant message
    const context = SillyTavern.getContext();
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const latestAssistant = [...chat].reverse().find((m) => m && !m.is_user && !m.is_system);
    if (!latestAssistant?.mes) {
        return "neutral";
    }

    // Look for a valid expression label like [admiration]
    const labels = getEmotions();
    const bracketTokens = latestAssistant.mes.matchAll(/\[([^\]\n]{1,32})\]\s*|\(([^)\n]{1,32})\)\s*/g);
    for (const match of bracketTokens) {
        const inner = String(match?.[1] || match?.[2] || '').trim().toLowerCase();
        if (inner && labels.has(inner)) return inner;
    }

    return "neutral";
}

async function fetchRegistrarManifest(name, outfit) {
    const url = `${REGISTRAR_EXPRESSIONS_MANIFEST_BASE}${encodeURIComponent(name)}/${encodeURIComponent(outfit)}`;
    try {
        const res = await fetch(url, { method: 'GET', credentials: 'omit' });
        if (!res.ok) return null;
        return JSON.parse(await res.text());
    } catch (e) {
        if (DEBUG) {
            console.log(`${LOGGING_PREFIX} Registrar manifest fetch/parse failed`, { url, e });
        }
        return null;
    }
}

async function resolveRegistrarExpressionPath(name, outfit, emotion) {
    // Try to get a manifest from the Registrar
    let list = await fetchRegistrarManifest(name, outfit);
    if ((!list || list.length === 0) && outfit !== 'clothed') {
        list = await fetchRegistrarManifest(name, 'clothed');
    }
    if (!list || list.length === 0) return '';

    // Try to get the expression from the manifest
    const getExpression = (lab) => list.find((e) => e.label === lab);
    const direct = getExpression(emotion);
    if (direct?.path) return direct.path;
    const neutral = getExpression('neutral');
    if (neutral?.path) return neutral.path;
    return '';
}

async function resolveExpression(name){
    const isOfficial = isOfficialCharacter(name);
    const hideNsfw = isHideNsfwEnabled();
    const outfit = isOfficial
        ? (hideNsfw ? forceSafeOfficialOutfit(activeOutfit) : activeOutfit)
        : (hideNsfw ? 'clothed' : normalizeOutfit(activeOutfit));
    const emotion = await getSpeakerEmotion(name);

    if (isOfficial) {
        return {
            path: `/characters/${name}/${outfit}/${emotion}.avif`,
            name: name,
            isOfficial: true,
            outfit: outfit,
            emotion: emotion,
        }
    }
    return {
        path: await resolveRegistrarExpressionPath(name, outfit, emotion),
        name: name,
        isOfficial: false,
        outfit: outfit,
        emotion: emotion,
    };
}

let activeOutfit = null;
let defaultEmotion = null;
async function setExpressions(){
    const sideExpressionsEnabled = isSideCharacterExpressionsEnabled();

    let left = { 
        path: leftBasePath || '',
        name: extractPathSpeakerName(leftBasePath) || '',
        isOfficial: leftBasePath ? true : false,
        outfit: '',
        emotion: '',
     };
    let right = { 
        path: rightBasePath || '',
        name: extractPathSpeakerName(rightBasePath) || '',
        isOfficial: rightBasePath ? true : false,
        outfit: '',
        emotion: '',
     };

    // If the left and right base path characters are the same, open the right slot
    if (left.name == right.name) {
        right = { path: '', name: '', isOfficial: false, outfit: '', emotion: '' };
        if (DEBUG) {
            console.log(`${LOGGING_PREFIX} Left and right base path characters are the same, setting right to null.`);
        }
    }

    // If there are any open slots, fill them
    if ((sideExpressionsEnabled && (!left.path || !right.path))) {

        // Get the list of speakers in the scene
        const speakers = getSpeakerNames();
        if (DEBUG) {
            console.log(`${LOGGING_PREFIX} Scene characters`, speakers);
        }

        // Determine the outfit to use for expressions
        activeOutfit = getActiveOutfit(speakers[0]);
        left.outfit = activeOutfit;
        right.outfit = activeOutfit;
        if (DEBUG) {
            console.log(`${LOGGING_PREFIX} Active outfit: ${activeOutfit}`);
            console.log(`${LOGGING_PREFIX} Normalized outfit: ${normalizeOutfit(activeOutfit)}`);
        }

        // Determine the default emotion to use
        defaultEmotion = getDefaultMessageEmotion();
        left.emotion = defaultEmotion;
        right.emotion = defaultEmotion;
        if (DEBUG) {
            console.log(`${LOGGING_PREFIX} Default emotion: ${defaultEmotion}`);
        }

        let nameIndex = 0;
        if (!left.path) {
            // Try names until you find a good one or run out
            while (speakers[nameIndex]) {
                const expression = await resolveExpression(speakers[nameIndex]);
                nameIndex++;
                if (expression?.path) {
                    if (DEBUG) {
                        console.log(`${LOGGING_PREFIX} Placing ${speakers[nameIndex-1]} in left expression slot`);
                    }
                    left = expression;
                    break;
                }
            }
        }
        if (!right.path) {
            // Keep going through the list if there still is one
            while (speakers[nameIndex]) {
                const expression = await resolveExpression(speakers[nameIndex]);
                nameIndex++;
                if (expression?.path) {
                    if (DEBUG) {
                        console.log(`${LOGGING_PREFIX} Placing ${speakers[nameIndex-1]} in right expression slot`);
                    }
                    right = expression;
                    break;
                }
            }
        }
    }

    if (left.path) {
        leftExpression.setAttribute('src', left.path);
        leftExpression.setAttribute('title', toTitleCase(left.emotion));
        leftExpression.setAttribute('style', 'display: block;');    
    } else {
        leftExpression.removeAttribute('style');
    }
    if (right.path) {
        rightExpression.setAttribute('src', right.path);
        rightExpression.setAttribute('title', toTitleCase(right.emotion));
        rightExpression.setAttribute('style', 'display: block;');
    } else {
        rightExpression.removeAttribute('style');
    }
}

function toTitleCase(str) {
    return str.replace(
      /\w\S*/g,
      text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
  }

let debounceTimer = null;
function scheduleRefresh() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        debounceTimer = null;
        resolveBaseExpressionPaths();
        await setExpressions();
    }, DEBOUNCE_MS);
}

function observeExpression(side) {
    const element = document.getElementById(OBSERVERS[side].id);
    if (element === OBSERVERS[side].observedElement && OBSERVERS[side].observer) {
        return true;
    }
    if (OBSERVERS[side].observer) {
        OBSERVERS[side].observer.disconnect();
        OBSERVERS[side].observer = null;
    }
    OBSERVERS[side].observedElement = element;
    if (!element) {
        return false;
    }
    OBSERVERS[side].observer = new MutationObserver(scheduleRefresh);
    OBSERVERS[side].observer.observe(element, OBSERVERS[side].options);
    if (DEBUG) {
        console.log(`${LOGGING_PREFIX} Began observing ${side} expression.`);
    }
    return true;
}

function insertExpressionElements() {
    const baseHolder = document.getElementById(EXPRESSION_WRAPPER_ID);
    const container = document.createElement('div');
    container.id = 'registrar-expressions-container';
    container.innerHTML = `
        <div class="registrar-expression-holder registrar-expression-left">
            <img id="${LEFT_EXPRESSION_ID}" class="registrar-expression-img" src="" />
        </div>
        <div class="registrar-expression-holder registrar-expression-right">
            <img id="${RIGHT_EXPRESSION_ID}" class="registrar-expression-img" src="" />
        </div>
    `;
    baseHolder.parentElement.insertBefore(container, baseHolder);

    leftExpression = document.getElementById(LEFT_EXPRESSION_ID);
    rightExpression = document.getElementById(RIGHT_EXPRESSION_ID);
}

let headObserver = null;
let lateMountObserver = null;
let leftExpression = null;
let rightExpression = null;
function initExtension() {

    if (DEBUG) {
        console.log(`${LOGGING_PREFIX} Initializing extension.`);
    }
    
    // Right character is set by replacing a style element
    headObserver = new MutationObserver(() => {
        observeExpression("right");
        scheduleRefresh();
    });
    headObserver.observe(document.head, { childList: true });

    // Left character element might not be created yet
    if (!document.getElementById(LEFT_BASE_EXPRESSION_ID)) {
        if (DEBUG) {
            console.log(`${LOGGING_PREFIX} Left expression not found, waiting for late mount.`);
        }
        lateMountObserver = new MutationObserver(() => {
            if (DEBUG) {
                console.log(`${LOGGING_PREFIX} Possible left expression late mount detected, attempting to observe.`);
            }
            if (observeExpression("left")) {
                if (DEBUG) {
                    console.log(`${LOGGING_PREFIX} Left expression late mount observed, disconnecting late mount observer.`);
                }
                lateMountObserver.disconnect();
                lateMountObserver = null;

                insertExpressionElements();
                scheduleRefresh(); 
            }
        });
        lateMountObserver.observe(document.body, { childList: true, subtree: true });
    } else {
        insertExpressionElements();
        scheduleRefresh();
    }

    // Start watching the expressions for changes
    observeExpression("right");
    observeExpression("left");
    scheduleRefresh();

    // Refresh on new assistant messages even if base expressions didn't mutate
    eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
        const context = SillyTavern.getContext();
        const message = context?.chat?.[messageId];
        if (!message || message.is_user || message.is_system) {
            return;
        }
        if (DEBUG) {
            console.log(`${LOGGING_PREFIX} Assistant message received, scheduling refresh.`, { messageId });
        }
        scheduleRefresh();
    });

    // Refresh when user settings are updated (includes variable-backed NSFW toggles).
    eventSource.on(event_types.SETTINGS_UPDATED, () => {
        if (DEBUG) {
            console.log(`${LOGGING_PREFIX} SETTINGS_UPDATED received, scheduling refresh.`);
        }
        scheduleRefresh();
    });

    // Hide the base right side character
    document.body.classList.add(RIGHT_BASE_EXPRESSION_HIDE_CLASS);

}

jQuery(initExtension);
