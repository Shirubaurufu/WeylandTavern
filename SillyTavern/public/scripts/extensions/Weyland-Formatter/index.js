import { eventSource, event_types, getCurrentChatId, reloadCurrentChat, saveSettingsDebounced, converter, reloadMarkdownProcessor } from '../../../script.js';
import { power_user } from '../../power-user.js';
import { getGlobalVariable } from '../../variables.js';
const {extensionSettings, renderExtensionTemplateAsync, chat} = SillyTavern.getContext();

const MODULE_NAME = "Weyland-Formatter";
const extensionVersion = "1.1.8";

/**
 * @typedef {Object} WeylandFormatterSettings
 * @property {boolean} enabled
 * @property {boolean} markdown
 * @property {boolean} debug
 */

/**
 * @type {WeylandFormatterSettings}
 */
const defaultSettings = {
    enabled: true,
    markdown: true,
    debug: false,
};

/**
 * @type {WeylandFormatterSettings}
 */
let settings = undefined;

/**
 * @typedef {Object} WeylandFormatterRegex
 * @property {RegExp} paragraphSplit
 * @property {RegExp} detectHeader
 * @property {RegExp} detectActionParagraph
 * @property {RegExp} detectWeybotRelations
 * @property {RegExp} greedyDetectAction
 * 
 * @property {RegExp} asterisk
 * 
 * @property {RegExp} goodStart
 * @property {RegExp} goodEnd
 * 
 * @property {RegExp} actionBetweenDialogue
 * @property {string} actionBetweenDialogueReplace
 * @property {RegExp} actionAfterDialogue
 * @property {string} actionAfterDialogueReplace
 * @property {RegExp} actionBeforeDialogue
 * @property {string} actionBeforeDialogueReplace
 * @property {RegExp} actionEmphasis
 * @property {string} actionEmphasisReplace
 * 
 * @property {RegExp} tooManyAsterisks
 * @property {string} tooManyAsterisksReplace
 * @property {RegExp} tooManyQuotes
 * @property {string} tooManyQuotesReplace
 * @property {RegExp} tooManyUnderscores
 * @property {string} tooManyUnderscoresReplace
 * @property {RegExp} tooManyGraves
 * @property {string} tooManyGravesReplace
 * 
 * @property {RegExp} squareBrackets
 * @property {string} squareBracketsReplace
 * @property {RegExp} parenthesis
 * @property {string} parenthesisReplace
 * @property {RegExp} curlyBrackets
 * @property {string} curlyBracketsReplace
 * @property {RegExp} codeBlocks
 * @property {string} codeBlocksReplace
 * @property {RegExp} speech
 * @property {string} speechReplace
 * 
 * @property {RegExp} missingEndAsterisk
 * @property {string} missingEndAsteriskReplace
 * @property {RegExp} missingStartAsterisk
 * @property {string} missingStartAsteriskReplace
 */

/**
 * @type {WeylandFormatterRegex}
 */
const weylandRegex = {
    paragraphSplit: /\n\s*\n/,
    detectHeader: /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|freshman|sophomore|junior|senior|\[roleplay)/i,
    detectActionParagraph: /^\*[^"_*]*\*$/,
    detectWeybotRelations: /New [^{]+{[^}]+}/,
    greedyDetectAction: /(?<=\s|^)\*([^"_\[\]\n\r]+)\*(?=\s|$)/g,

    asterisk: /\*/g,

    goodStart: /^[\[*"]|^__|^```/,
    goodEnd: /[*"\]]$|__$|```$/,

    actionBetweenDialogue: /(?<=[\["_`]\s)(?!\*)([^\[\]"_`\r\n]+?)(?<!\*)(?=\s["_`\]])/g,
    actionBetweenDialogueReplace: "*$1*",
    actionAfterDialogue: /(?<=[\["_`]\s)(?!\*)([^\[\]"_`\r\n]+?)(?<!\*)$/g,
    actionAfterDialogueReplace: "*$1*",
    actionBeforeDialogue: /^(?!\*)([^\[\]"_`\r\n]+?)(?<!\*)(?=\s["_\]])/g,
    actionBeforeDialogueReplace: "*$1*",
    actionEmphasis: /(?<=\s|^)\*(?![\s\n])([^*"_\[\]]*)(?!\*\s)\*+([^*]+)\*+([^*"_\[\]]*)\*(?<![\s\n])(?=\s|$)/g,
    actionEmphasisReplace: "*$1**$2**$3*",

    tooManyAsterisks: /\*{4,}/g,
    tooManyAsterisksReplace: "**",
    tooManyQuotes: /\"{2,}/g,
    tooManyQuotesReplace: `"`,
    tooManyUnderscores: /\_{3,}/g,
    tooManyUnderscoresReplace: "__",
    tooManyGraves: /\`{4,}/g,
    tooManyGravesReplace: "```",

    squareBrackets: /[\[\]]+((?!\s)[^\]\[]+)(?<!\s)[\[\]]+/g,
    squareBracketsReplace: "[$1]",
    parenthesis: /[\(\)]+((?!\s)[^\)\()]+)(?<!\s)[\(\)]+/g,
    parenthesisReplace: "($1)",
    curlyBrackets: /[\{\}]+((?!\s)[^\}\{})]+)(?<!\s)[\{\}]+/g,
    curlyBracketsReplace: "{$1}",
    codeBlocks: /^`{2,}(text|)(\s+)?([\w\W]+?\n?[^`\n]+?)(?:\n+|\n?)`{2,}$/gm,
    codeBlocksReplace: "```$1\n$3\n```",
    speech: /(?<=^|\s)(?:\**|`*)(["_\[][^"`\[\]]+["_\]])(?:\**|`*)(?=\s|$)/g,
    speechReplace: "$1",

    missingEndAsterisk: /(?:(?<=["_\]]\s\*)|(?<=^\*))([^\*"_`\[\]]*?)(?:(?=\s["_\[])|(?!["_\]\*])$)/g,
    missingEndAsteriskReplace: "$1*",
    missingStartAsterisk: /(?:(?<!\d'\d"\s)(?<=["_\]]\s)|(?<=^))([^\*"_`\[\]]*?)(?=\*(?:\s["_\[]|(?!["_\]\*])$))/g,
    missingStartAsteriskReplace: "*$1"
};


function getSettings() {
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }

    for (const key in defaultSettings) {
        if (extensionSettings[MODULE_NAME][key] === undefined) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }

    settings = extensionSettings[MODULE_NAME];
}

function weylandDebug(text) {
    if (settings === undefined) getSettings();
    if (settings?.debug) console.debug(`[${MODULE_NAME}] ${text}`);
}

async function formatParagraphs(message) {
    if (!message) return [];
    const formatParagraphsStartTime = performance.now();

    //Clean up too many symbols
    message = replaceText(message, weylandRegex.tooManyAsterisks, weylandRegex.tooManyAsterisksReplace);
    message = replaceText(message, weylandRegex.tooManyQuotes, weylandRegex.tooManyQuotesReplace);
    message = replaceText(message, weylandRegex.tooManyUnderscores, weylandRegex.tooManyUnderscoresReplace);
    message = replaceText(message, weylandRegex.tooManyGraves, weylandRegex.tooManyGravesReplace);

    //Fix any mismatched parenthesis, square brackets, curly brackets, codeblocks or speech patterns
    message = replaceText(message, weylandRegex.squareBrackets, weylandRegex.squareBracketsReplace);
    message = replaceText(message, weylandRegex.parenthesis, weylandRegex.parenthesisReplace);
    message = replaceText(message, weylandRegex.curlyBrackets, weylandRegex.curlyBracketsReplace);
    message = replaceText(message, weylandRegex.codeBlocks, weylandRegex.codeBlocksReplace);
    message = replaceText(message, weylandRegex.speech, weylandRegex.speechReplace);

    let paragraphs = message.split(weylandRegex.paragraphSplit);

    weylandDebug(`Paragraph count: ${paragraphs.length}`);

    paragraphs.forEach((paragraph, index) => {
        const paragraphLoopStartTime = performance.now();
        paragraph = paragraph.trim();
        if (weylandRegex.detectHeader.test(paragraph)) {
            //Format Header?
            paragraphs[index] = paragraph;
            weylandDebug(`Formatting header took ${performance.now()-paragraphLoopStartTime} miliseconds`);
            return;
        }

        if (!weylandRegex.detectWeybotRelations.test(paragraph) && !weylandRegex.codeBlocks.test(paragraph))
        {
            const actionParagraph = weylandRegex.detectActionParagraph.test(paragraph);

            //Stage 1 - Add asterisks to actions between dialogue, if missing
            if (!actionParagraph) paragraph = replaceText(paragraph, weylandRegex.actionBetweenDialogue, weylandRegex.actionBetweenDialogueReplace);

            //Stage 2 - Add asterisks to actions before and after dialogue, if missing
            if (!actionParagraph) paragraph = replaceText(paragraph, weylandRegex.actionAfterDialogue, weylandRegex.actionAfterDialogueReplace);
            if (!actionParagraph) paragraph = replaceText(paragraph, weylandRegex.actionBeforeDialogue, weylandRegex.actionBeforeDialogueReplace);

            //Stage 3 - Add symbols to blank paragraphs
            if (!weylandRegex.goodStart.test(paragraph) && !weylandRegex.goodEnd.test(paragraph))  paragraph = `*${paragraph}*`; //Entirely blank, add asterisks to both ends
            else if (!weylandRegex.goodStart.test(paragraph)) paragraph = weylandRegex.goodEnd.exec(paragraph) + paragraph; //Missing start symbol only, add end symbol to start
            else if (!weylandRegex.goodEnd.test(paragraph)) paragraph = paragraph + weylandRegex.goodStart.exec(paragraph); //Missing end symbol only, add start symbol to end

            paragraph = replaceText(paragraph, weylandRegex.actionEmphasis, weylandRegex.actionEmphasisReplace);
        }

        if (paragraph.match(weylandRegex.asterisk)?.length % 2 !== 0) {
            paragraph = replaceText(paragraph, weylandRegex.missingEndAsterisk, weylandRegex.missingEndAsteriskReplace);
            paragraph = replaceText(paragraph, weylandRegex.missingStartAsterisk, weylandRegex.missingStartAsteriskReplace);
            if (paragraph.match(weylandRegex.asterisk)?.length % 2 !== 0) {
                let matches = paragraph.match(weylandRegex.greedyDetectAction);
                if (matches) {
                    matches.forEach((match) => {
                        paragraph = paragraph.replace(match, `*${match.replaceAll("*", "")}*`);
                    });
                }
            }
        }

        paragraphs[index] = paragraph; //Default loop end
        weylandDebug(`Formatting paragraph #${index} took ${performance.now()-paragraphLoopStartTime} miliseconds`);
    })
    weylandDebug(`formatParagraphs took ${performance.now()-formatParagraphsStartTime} miliseconds`);
    return paragraphs;
}

function replaceText(text, regex, replace) {
    const newText = text.replace(regex, replace);
    if (newText !== text) weylandDebug(`Formatting applied '${regex}' with '${replace}' to: ${text.match(regex)}`);
    return newText;
}

async function formatMessage(messageId) {
    if (settings === undefined) getSettings();
    if (!settings.enabled) return;

    const formatMessageStartTime = performance.now();
    weylandDebug(`Formatting message with ID: '${messageId}'`);
    //weylandDebug(JSON.stringify(chat[messageId]));

    const isUser = chat[messageId].is_user;
    const isSystem = chat[messageId].is_system;

    if (isUser || isSystem) return;

    const characterName = chat[messageId].name;

    if (characterName == "Phone Status") return; //Never format !Phone messages

    const originalMessage = chat[messageId].mes;

    if (characterName == "Kressa" && !originalMessage.startsWith("ROLEPLAY", 1)) return; //Don't format Kressa's messages, unless in roleplay mode

    weylandDebug(`Formatting character: ${characterName}`);

    if (weylandRegex.detectHeader.test(originalMessage)) {
        const paragraphs = await formatParagraphs(originalMessage);
    
        chat[messageId].mes = paragraphs.join("\n\n");
    }

    weylandDebug(`formatMessage took ${performance.now()-formatMessageStartTime} miliseconds`);
}

(async function () {
    async function addExtensionSettings() {
        const template = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
        $('#extensions_settings2').append(template);

        // Enabled
        $('#weylandFormatterEnable').prop('checked', settings.enabled).on('input', function () {
            settings.enabled = !!$(this).prop('checked');
            weylandDebug(`[${MODULE_NAME}] Setting Enabled: ${settings.enabled}`);
            saveSettingsDebounced();
        });

        // Markdown
        $('#weylandFormatterMarkdown').prop('checked', settings.markdown).on('input', function () {
            settings.markdown = !!$(this).prop('checked');
            weylandDebug(`[${MODULE_NAME}] Setting Markdown: ${settings.markdown}`);
            updateReloadMarkdownProcessor();
            saveSettingsDebounced();
        });

        // Debug
        $('#weylandFormatterDebug').prop('checked', settings.debug).on('input', function () {
            settings.debug = !!$(this).prop('checked');
            weylandDebug(`[${MODULE_NAME}] Setting Debug: ${settings.debug}`);
            saveSettingsDebounced();
        });
    }
    
    console.debug(`[${MODULE_NAME}] Initializing v${extensionVersion}`);

    getSettings();
    await addExtensionSettings();

    if (settings.markdown) updateReloadMarkdownProcessor(); //Adds markdown for asterisks within italics and hiccups

    const formatterEvents = [
        event_types.MESSAGE_RECEIVED,
        event_types.MESSAGE_EDITED
    ];

    formatterEvents.forEach(e => eventSource.on(e, formatMessage));
})();

/**
 * @returns {showdown.ShowdownExtension[]}
 */
function hiccupMarkdownExt(){
    try {
        return [{
            type: 'output',
            regex: new RegExp('(\\**\\b(?:hic{1,2}(?!up)(?!cup)|hiccup)\\b\\**)', 'gi'),
            replace: `<q style="color: #aeae00; display: inline;">$1</q>`
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in hiccupMarkdownExt extension:`, e);
        return [];
    }
}

/**
 * @returns {showdown.ShowdownExtension[]}
 */
function nonItalicsExt(){
    try {
        return [{
            type: 'output',
            regex: new RegExp('\\*(?![\\s\\n])([^*"_\\[\\]]*)(?!\\*\\s)\\*([^*]+)\\*([^*"_\\[\\]]*)\\*(?<![\\s\\n])', 'g'),
            replace: `<em>$1</em><q style="color: ${power_user.italics_text_color}; display: inline">$2</q><em>$3</em>`
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in nonItalicsExt extension:`, e);
        return [];
    }
}

/**
 * @returns {showdown.ShowdownExtension[]}
 */
function headerMarkdownExt(){
    try {
        return [{
            type: 'output',
            regex: new RegExp('((?<!\\s)(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|freshman|sophomore|junior|senior|\\[roleplay)[^"*_\\[\\]`\\n\\r]*(?=\\s))', 'i'),
            replace: `<strong style="color: darkred;">$1</strong>`
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in headerMarkdownExt extension:`, e);
        return [];
    }
}

/**
 * @returns {showdown.ShowdownExtension[]}
 */
function thinkMarkdownExt(){
    try {
        return [{
            type: 'output',
            regex: new RegExp(getGlobalVariable('LTMRegexFind')),
            replace: ``
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in thinkMarkdownExt extension:`, e);
        return [];
    }
}

/**
 * @returns {showdown.ShowdownExtension[]}
 */
function fdiglMarkdownExt(){
    try {
        return [{
            type: 'output',
            regex: new RegExp(`\\[\\(.+\\)\\]: #`, 'g'),
            replace: ``
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in fdiglMarkdownExt extension:`, e);
        return [];
    }
}

function updateReloadMarkdownProcessor(){
    reloadMarkdownProcessor();
    converter.addExtension(thinkMarkdownExt(), 'weylandThink');
    converter.addExtension(headerMarkdownExt(), 'weylandHeader');
    //converter.addExtension(nonItalicsExt(), 'insideAsterisks');
    converter.addExtension(fdiglMarkdownExt(), 'fdiglSystemMessage');
    if (settings.markdown) {
        converter.addExtension(hiccupMarkdownExt(), 'hiccup');
    }
}