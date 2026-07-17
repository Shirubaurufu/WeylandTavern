import { Fuse } from "../../../../lib.js";
import { characters, main_api, printCharacters, saveSettings, saveSettingsDebounced, this_chid } from "../../../../script.js";
import { background_settings } from "../../../backgrounds.js";
import { extension_settings } from "../../../extensions.js";
import { DEFAULT_FILTER_STATE } from "../../../filters.js";
import { chat_completion_sources, oai_settings } from "../../../openai.js";
import { user_avatar } from "../../../personas.js";
import { power_user } from "../../../power-user.js";
import { addTagsToEntity, removeTagFromEntity, searchCharByName, TAG_FOLDER_DEFAULT_TYPE, tag_map, tags } from "../../../tags.js";
import { textgen_types, textgenerationwebui_settings } from "../../../textgen-settings.js";
import { equalsIgnoreCaseAndAccents, getCharaFilename, onlyUnique, uuidv4 } from "../../../utils.js";
import { getGlobalVariable, getLocalVariable } from "../../../variables.js";
import { sendExpressionCall } from "../../expressions/index.js";

/**
 * @param {number} min
 * @param {number} max
 */
export function getRandomInt(min, max) {
    try {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    } catch {
        return null;
    }
}

export function getCurrentUserName() {
    try {
        // @ts-ignore
        return power_user?.personas[user_avatar] || ""
    } catch {
        return ""
    }
}

/**
 * Gets the name of the persona-bound lorebook.
 * @returns {string} The name of the persona-bound lorebook
 */
export function getPersonaBook() {
    return power_user?.persona_description_lorebook || '';
}

export function getCurrentCharacterName() {
    try {
        const charID = getCharacterID();
        if (charID === undefined) return;
        return characters[charID].data.name
    } catch {
        return
    }
}

export function getCurrentCharacterFirstMes() {
    try {
        const charID = getCharacterID();
        if (charID === undefined) return;
        return characters[charID].data.first_mes
    } catch {
        return
    }
}

export function getCurrentCharacterVersion() {
    try {
        const charID = getCharacterID();
        if (charID === undefined) return;
        const version = parseInt(characters[charID]?.data?.character_version);
        return version
    } catch {
        return
    }
}

export function getCurrentCharacterPersonality() {
    try {
        const charID = getCharacterID();
        if (charID === undefined) return;
        return characters[charID].data.personality
    } catch {
        return
    }
}

export function getCurrentCharacterDescription() {
    try {
        const charID = getCharacterID();
        if (charID === undefined) return;
        return characters[charID].data.description
    } catch {
        return
    }
}

export function getCurrentCharacterWorldbook() {
    try {
        const charID = getCharacterID();
        if (charID === undefined) return;
        return characters[charID].data?.extensions?.world
    } catch {
        return
    }
}

/**
 * @param {string} charText
 * @param {string} [charName]
 * @param {boolean} [allowExtra]
 * @returns 
 */
export function getCharacterCostumeFromText(charText, charName="", allowExtra) {
    let costume = "Regular Outfit";
    try {
        if (!charText) return "Regular Outfit";
        const textLength = charText.length;
        if (textLength > 50) {
            charText = charText.slice(Math.floor(textLength*0.65));
        }
        const costumeTag = [...charText.matchAll(/\] ?\[(\w+?)\]/g).map(m => m[1])].reverse()[0];
        const extraTag = /O\d/.test(costumeTag);
        const NSFW = getGlobalVariable("NSFW") === "false";
        allowExtra = (allowExtra ?? getGlobalVariable("PPP1") === "true") 
        || [ // List of characters that will always load extra costumes
            "BlakeSerra",
        ].includes(charName);
        if (allowExtra && extraTag) {
            costume = getLocalVariable(costumeTag) || "Regular Outfit";
        } 
        else if (NSFW) {
            switch (costumeTag) {
                case "LG": {
                    const lounge = ["Bastet", "Nefara", "Khepri", "Shani"].includes(charName);
                    if (charName === "Muse") {
                        costume = "Naked";
                    } else {
                        costume = lounge ? "Lounge" : "Lingerie";
                    }
                    break;
                }
                case "NK":
                    costume = "Naked";
                    break;
            }
        }
        
        if (charName === "Ṇ̶̰̼͘a̶͍̅́̒r̵̓̏̉̈́ā̸͒̔̄") {
            costume = `${getGlobalVariable("NaraCommunity") || ""}${costume}`;
        }
        
        return costume;
    } catch {
        return costume;
    }
}

/**
 * @param {string} [characterName]
 * @returns {number | undefined}
 */
export function getCharacterID(characterName) {
    if (this_chid === undefined) return;
    if (!characterName) return parseInt(this_chid);
    const char = characters.find(c => c.data.name === characterName);
    if (!char) return;
    return characters.indexOf(char);
}

/**
 * Creates a new tag object with the given tag name and default properties
 *
 * Not to be confused with `createNewTag`, which actually creates the tag and adds it to the existing list of tags.
 * Use this one to create temporary tag objects, for example for drawing.
 *
 * @param {string} tagName - The name of the tag
 * @return {import("../../../tags.js").Tag} The newly created tag object
 */
function newTag(tagName) {
    return {
        id: uuidv4(),
        name: tagName,
        folder_type: TAG_FOLDER_DEFAULT_TYPE,
        filter_state: DEFAULT_FILTER_STATE,
        // @ts-ignore
        sort_order: Math.max(0, ...tags.map(t => t.sort_order)) + 1,
        is_hidden_on_character_card: false,
        color: '',
        color2: '',
        create_date: Date.now(),
    };
}

/**
 * Creates a new tag with default properties and a randomly generated id
 *
 * Does **not** trigger a save, so it's up to the caller to do that
 *
 * @param {string} tagName - name of the tag
 * @returns {import("../../../tags.js").Tag} the newly created tag, or the existing tag if it already exists (with a logged warning)
 */
function createNewTag(tagName) {
    const existing = getTag(tagName);
    if (existing) {
        // @ts-ignore
        toastr.warning(`Cannot create new tag. A tag with the name already exists:<br />${existing.name}`, 'Creating Tag', { escapeHtml: false });
        return existing;
    }

    const tag = newTag(tagName);
    tags.push(tag);
    console.debug('Created new tag', tag.name, 'with id', tag.id);
    return tag;
}


/**
 * Gets a tag from the tags array based on the provided tag name (insensitive soft matching)
 * Optionally creates the tag if it doesn't exist
 *
 * @param {string} tagName - The name of the tag to search for
 * @param {object} [options={}] - Optional parameters
 * @param {boolean} [options.createNew=false] - Whether to create the tag if it doesn't exist
 * @returns {import("../../../tags.js").Tag?} The tag object that matches the provided tag name, or undefined if no match is found
 */
function getTag(tagName, { createNew = false } = {}) {
    let tag = tags.find(t => equalsIgnoreCaseAndAccents(t.name, tagName));
    if (!tag && createNew) {
        tag = createNewTag(tagName);
    }
    return tag || null;
}

/**
 * @param {string} tagName
 */
function paraGetTag(tagName, { allowCreate = false } = {}) {
    if (!tagName) {
        // @ts-ignore
        toastr.warning('Tag name must be provided.');
        return null;
    }
    let tag = getTag(tagName);
    if (allowCreate && !tag) {
        tag = createNewTag(tagName);
    }
    if (!tag) {
        // @ts-ignore
        toastr.warning(`Tag ${tagName} not found.`);
        return null;
    }
    return tag;
}

/**
 * @param {string} tagName
 * @param {string?} charName
 */
export function tagExists(tagName, charName=null) {
    // @ts-ignore
    if (!charName) charName = getCurrentCharacterName();
    const key = searchCharByName(charName);
    console.log(`[WQR] searchCharByName ${charName}: ${key}`);
    if (!key) return false;
    const tag = paraGetTag(tagName);
    console.log(`[WQR] paraGetTag ${tagName}:`, tag);
    if (!tag) return false;
    return tag_map[key] && tag_map[key].includes(tag.id);
}

/**
 * @param {string | string[]} tagName
 * @param {string?} charName
 */
export function tagAdd(tagName, charName=null) {
    // @ts-ignore
    if (!charName) charName = getCurrentCharacterName();
    const key = searchCharByName(charName);
    console.log(`[WQR] searchCharByName ${charName}: ${key}`);
    if (!key) return false;
    if (typeof tagName === "string") {
        const tag = paraGetTag(tagName, { allowCreate: true });
        console.log(`[WQR] paraGetTag ${tagName}:`, tag);
        if (!tag) return false;
        const result = addTagsToEntity(tag, key);
        printCharacters();
        return String(result);
    } else if (Array.isArray(tagName)) {
        /** @type {import("../../../tags.js").Tag[]} */ const tags = [];
        for (const name of tagName) {
            const tag = paraGetTag(name, { allowCreate: true });
            console.log(`[WQR] paraGetTag ${tagName}:`, tag);
            if (tag) tags.push(tag);
        }
        if (tags.length <= 0) return false;
        const result = addTagsToEntity(tags, key);
        printCharacters();
        return String(result);
    }
}

/**
 * @param {string | string[]} tagName
 * @param {string?} charName
 */
export function tagRemove(tagName, charName=null) {
    // @ts-ignore
    if (!charName) charName = getCurrentCharacterName();
    const key = searchCharByName(charName);
    if (!key) return 'false';
    if (typeof tagName === "string") {
        const tag = paraGetTag(tagName);
        if (!tag) return 'false';
        const result = removeTagFromEntity(tag, key);
        printCharacters();
        return String(result);
    } else {
        let result = false;
        for (const name of tagName) {
            const tag = paraGetTag(name);
            if (tag) {
                const ret = removeTagFromEntity(tag, key);
                if (ret) result = true;
            }
        }
        printCharacters();
        return String(result);
    }
}

/**
 * Sets a model for the current API.
 * @param {string} model New model name
 * @param {boolean} quiet Named arguments
 * @returns {string} New or existing model name
 */
export function setLLModel(model, quiet=false) {
    // @ts-ignore
    const { control: modelSelectControl, options } = getModelOptions(quiet);

    // If no model was found, the reason was already logged, we just return here
    if (options === null) {
        return '';
    }

    model = String(model || '').trim();

    if (!model) {
        return modelSelectControl.value;
    }

    console.log('Set model to ' + model);

    if (modelSelectControl instanceof HTMLInputElement) {
        modelSelectControl.value = model;
        // @ts-ignore
        $(modelSelectControl).trigger('input');
        // @ts-ignore
        !quiet && toastr.success(`Model set to "${model}"`);
        return model;
    }

    if (!options.length) {
        // @ts-ignore
        !quiet && toastr.warning('No model options found. Check your API settings.');
        return '';
    }

    let newSelectedOption = null;

    const fuse = new Fuse(options, { keys: ['text', 'value'] });
    const fuzzySearchResult = fuse.search(model);

    // @ts-ignore
    const exactValueMatch = options.find(x => x.value.trim().toLowerCase() === model.trim().toLowerCase());
    // @ts-ignore
    const exactTextMatch = options.find(x => x.text.trim().toLowerCase() === model.trim().toLowerCase());

    if (exactValueMatch) {
        newSelectedOption = exactValueMatch;
    } else if (exactTextMatch) {
        newSelectedOption = exactTextMatch;
    } else if (fuzzySearchResult.length) {
        newSelectedOption = fuzzySearchResult[0].item;
    }

    if (newSelectedOption) {
        modelSelectControl.value = newSelectedOption.value;
        // @ts-ignore
        $(modelSelectControl).trigger('change');
        // @ts-ignore
        !quiet && toastr.success(`Model set to "${newSelectedOption.text}"`);
        return newSelectedOption.value;
    } else {
        // @ts-ignore
        !quiet && toastr.warning(`No model found with name "${model}"`);
        return '';
    }
}

/**
 * Retrieves the available model options based on the currently selected main API and its subtype
 * @param {boolean} quiet - Whether to suppress toasts
 *
 * @returns {{control: HTMLSelectElement|HTMLInputElement, options: HTMLOptionElement[]}?} An array of objects representing the available model options, or null if not supported
 */
function getModelOptions(quiet) {
    const nullResult = { control: null, options: null };
    const modelSelectMap = [
        { id: 'generic_model_textgenerationwebui', api: 'textgenerationwebui', type: textgen_types.GENERIC },
        { id: 'custom_model_textgenerationwebui', api: 'textgenerationwebui', type: textgen_types.OOBA },
        { id: 'model_togetherai_select', api: 'textgenerationwebui', type: textgen_types.TOGETHERAI },
        { id: 'openrouter_model', api: 'textgenerationwebui', type: textgen_types.OPENROUTER },
        { id: 'model_infermaticai_select', api: 'textgenerationwebui', type: textgen_types.INFERMATICAI },
        { id: 'model_dreamgen_select', api: 'textgenerationwebui', type: textgen_types.DREAMGEN },
        { id: 'mancer_model', api: 'textgenerationwebui', type: textgen_types.MANCER },
        { id: 'vllm_model', api: 'textgenerationwebui', type: textgen_types.VLLM },
        { id: 'aphrodite_model', api: 'textgenerationwebui', type: textgen_types.APHRODITE },
        { id: 'ollama_model', api: 'textgenerationwebui', type: textgen_types.OLLAMA },
        { id: 'tabby_model', api: 'textgenerationwebui', type: textgen_types.TABBY },
        { id: 'featherless_model', api: 'textgenerationwebui', type: textgen_types.FEATHERLESS },
        { id: 'model_openai_select', api: 'openai', type: chat_completion_sources.OPENAI },
        { id: 'model_claude_select', api: 'openai', type: chat_completion_sources.CLAUDE },
        { id: 'model_openrouter_select', api: 'openai', type: chat_completion_sources.OPENROUTER },
        { id: 'model_ai21_select', api: 'openai', type: chat_completion_sources.AI21 },
        { id: 'model_google_select', api: 'openai', type: chat_completion_sources.MAKERSUITE },
        { id: 'model_vertexai_select', api: 'openai', type: chat_completion_sources.VERTEXAI },
        { id: 'model_mistralai_select', api: 'openai', type: chat_completion_sources.MISTRALAI },
        { id: 'custom_model_id', api: 'openai', type: chat_completion_sources.CUSTOM },
        { id: 'model_cohere_select', api: 'openai', type: chat_completion_sources.COHERE },
        { id: 'model_perplexity_select', api: 'openai', type: chat_completion_sources.PERPLEXITY },
        { id: 'model_groq_select', api: 'openai', type: chat_completion_sources.GROQ },
        { id: 'model_nanogpt_select', api: 'openai', type: chat_completion_sources.NANOGPT },
        { id: 'model_deepseek_select', api: 'openai', type: chat_completion_sources.DEEPSEEK },
        { id: 'model_aimlapi_select', api: 'openai', type: chat_completion_sources.AIMLAPI },
        { id: 'model_xai_select', api: 'openai', type: chat_completion_sources.XAI },
        { id: 'model_pollinations_select', api: 'openai', type: chat_completion_sources.POLLINATIONS },
        { id: 'model_moonshot_select', api: 'openai', type: chat_completion_sources.MOONSHOT },
        { id: 'model_fireworks_select', api: 'openai', type: chat_completion_sources.FIREWORKS },
        { id: 'model_cometapi_select', api: 'openai', type: chat_completion_sources.COMETAPI },
        { id: 'model_novel_select', api: 'novel', type: null },
        { id: 'horde_model', api: 'koboldhorde', type: null },
    ];

    function getSubType() {
        switch (main_api) {
            case 'textgenerationwebui':
                return textgenerationwebui_settings.type;
            case 'openai':
                return oai_settings.chat_completion_source;
            default:
                return null;
        }
    }

    const apiSubType = getSubType();
    const modelSelectItem = modelSelectMap.find(x => x.api == main_api && x.type == apiSubType)?.id;

    if (!modelSelectItem) {
        // @ts-ignore
        !quiet && toastr.info('Setting a model for your API is not supported or not implemented yet.');
        // @ts-ignore
        return nullResult;
    }

    const modelSelectControl = document.getElementById(modelSelectItem);

    if (!(modelSelectControl instanceof HTMLSelectElement) && !(modelSelectControl instanceof HTMLInputElement)) {
        // @ts-ignore
        !quiet && toastr.error(`Model select control not found: ${main_api}[${apiSubType}]`);
        // @ts-ignore
        return nullResult;
    }

    /**
     * Get options from a HTMLSelectElement or HTMLInputElement with a list.
     * @param {HTMLSelectElement | HTMLInputElement} control Control containing the options
     * @returns {HTMLOptionElement[]} Array of options
     */
    const getOptions = (control) => {
        if (control instanceof HTMLSelectElement) {
            return Array.from(control.options);
        }

        const valueOption = new Option(control.value, control.value);

        if (control instanceof HTMLInputElement && control.list instanceof HTMLDataListElement) {
            return [valueOption, ...Array.from(control.list.options)];
        }

        return [valueOption];
    };

    const options = getOptions(modelSelectControl).filter(x => x.value).filter(onlyUnique);
    return { control: modelSelectControl, options };
}

/**
 * @param {string?} bg
 */
export function setBackground(bg) {
    if (!bg) {
        // allow reporting of the background name if called without args
        return background_settings.name;
    }

    const bgElements = Array.from(document.querySelectorAll('.bg_example')).map((x) => ({ element: x, bgfile: x.getAttribute('bgfile') }));

    const fuse = new Fuse(bgElements, { keys: ['bgfile'] });
    const result = fuse.search(bg);

    if (!result.length) {
        return `No background found with name "${bg}"`;
    }

    const bgElement = result[0].item.element;

    if (bgElement instanceof HTMLElement) {
        bgElement.click();
    }

    return 'Finished';
}

/**
 * @param {string} [characterName]
 * @param {string} [costume]
 * @returns 
 */
export function getSpriteFolderName(characterName, costume) {
    let spriteFolderName = characterName || getCurrentCharacterName();
    const avatarFileName = getCharaFilename(characterName ? getCharacterID(characterName) : this_chid);
    // @ts-ignore
    const expressionOverride = extension_settings.expressionOverrides.find(e => e.name == avatarFileName);

    // @ts-ignore
    if (expressionOverride && expressionOverride.path) {
        // @ts-ignore
        spriteFolderName = expressionOverride.path;
    }

    if (costume) spriteFolderName = `${spriteFolderName}/${costume}`

    return spriteFolderName;
}

/**
 * @param {string} expression;
 * @param {string} [characterName]
 * @returns 
 */
export async function setExpression(expression, characterName) {
    // @ts-ignore
    await sendExpressionCall(getSpriteFolderName(characterName || getLocalVariable("CostmSave")?.split("/")?.[0]), expression.toLowerCase());
}

/**
 * @param {string} characterName
 * @param {string} costume;
 * @param {string} [expression]
 * @returns 
 */
export async function setCostumeAndExpression(characterName, costume, expression) {
    expression = expression || getLocalVariable("ExpSave") || "neutral";
    if (!expression) return;
    await setCostume(`${characterName}/${costume}`);
    // @ts-ignore
    await sendExpressionCall(`${characterName}/${costume}`, expression.toLowerCase());
}

/**
 * @param {string} folder
 */
export async function setCostume(folder) {
    if (!folder) {
        console.log('Clearing sprite set');
        folder = '';
    }
    let charName = folder.split("/")[0];

    if (folder.startsWith('/')) {
        // @ts-ignore
        charName = getCurrentCharacterName();
        if (!charName) return;
        folder = folder.slice(1);
        folder = `${charName}/${folder}`;
    }

    // @ts-ignore
    $('#expression_override').val(folder.trim());
    await ExpressionOverride(charName);

    return;
}

/**
 * @param {string} [characterName]
 */
async function ExpressionOverride(characterName) {
    characterName = characterName ?? getCurrentCharacterName();
    const avatarFileName = characterName?.length ? getCharaFilename(getCharacterID(characterName)) : getLocalVariable("CostmSave");
    console.log(`[WQR] avatarFileName: ${avatarFileName}`);

    // If the avatar name couldn't be found, abort.
    if (!avatarFileName) {
        console.debug(`Could not find filename for character with name ${characterName}`);
        return;
    }

    // @ts-ignore
    const overridePath = String($('#expression_override').val());
    const existingOverrideIndex = extension_settings.expressionOverrides.findIndex((e) =>
        // @ts-ignore
        e.name == avatarFileName,
    );

    console.log(`[WQR] overridePath: '${overridePath}'`);
    console.log(`[WQR] existingOverrideIndex: `, existingOverrideIndex);
    console.log(`[WQR] extension_settings.expressionOverrides: `, extension_settings.expressionOverrides);

    // If the path is empty, delete the entry from overrides
    if (overridePath === undefined || overridePath.length === 0) {
        if (existingOverrideIndex === -1) {
            return;
        }

        extension_settings.expressionOverrides.splice(existingOverrideIndex, 1);
    } else {
        // Properly override objects and clear the sprite cache of the previously set names
        // @ts-ignore
        const existingOverride = extension_settings.expressionOverrides[existingOverrideIndex];
        if (existingOverride) {
            Object.assign(existingOverride, { path: overridePath });
        } else {
            const characterOverride = { name: avatarFileName, path: overridePath };
            // @ts-ignore
            extension_settings.expressionOverrides.push(characterOverride);
        }

        console.debug(`Added/edited expression override for character with filename ${avatarFileName} to folder ${overridePath}`);
    }

    await saveSettings();
}