import { eventSource, event_types, getCurrentChatId, reloadCurrentChat, saveSettingsDebounced, converter, reloadMarkdownProcessor } from '../../../script.js';
import { power_user } from '../../power-user.js';
import { getGlobalVariable } from '../../variables.js';
const {extensionSettings, renderExtensionTemplateAsync, chat} = SillyTavern.getContext();

const MODULE_NAME = "Weyland-Formatter";
const extensionVersion = "1.6.4";

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
 * @property {RegExp} greedyDetectActionQuotes
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
 * @property {RegExp} mergedActions
 * @property {string} mergedActionsReplace
 * 
 * @property {RegExp} singleQuoteBetweenAction
 * @property {string} singleQuoteBetweenActionReplace
 * 
 * @property {RegExp} actionEmphasisOne
 * @property {RegExp} actionEmphasisOneSingleQuoteGuard
 * @property {RegExp} actionEmphasisTwo
 * @property {string} actionEmphasisTwoReplace
 * 
 * @property {RegExp} dialogueEmphasisOne
 * @property {RegExp} dialogueEmphasisTwo
 * @property {string} dialogueEmphasisTwoReplace
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
 * @property {RegExp} normalizeQuotes
 * @property {RegExp} normalizeSingleQuotes
 * @property {RegExp} normalizeHyphens
 * @property {RegExp} normalizeElipses
 * @property {RegExp} normalizeSpaces
 * @property {RegExp} normalizeEmDashes
 * @property {RegExp} normalizeAsterisks
 * @property {RegExp} normalizeSwungDash
 * @property {RegExp} normalizePosessives
 * @property {RegExp} normalizeContractions
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
    detectHeader: /^[^"*~_`\n\r]*~[^"*_`\n\r]*[~\]\)]$/im,
    detectActionParagraph: /^\*[^"_*]*\*$/,
    detectWeybotRelations: /New [^{]+{[^}]+}/,
    greedyDetectAction: /(?<=[\s—]|^)\*([^"_\[\]\n\r]+)\*(?=[\s—]|$)/g,
    greedyDetectActionQuotes: /(?<=\*[\s—]|__[\s—]|^)"[^"]+"(?=[\s—]\*|[\s—]__|$)/,

    asterisk: /\*/g,

    goodStart: /^(?:[\[*'"`>]|__)/,
    goodEnd: /(?:[*'"`\]]|__)$/,

    actionBetweenDialogue: /(?<=[\["_`][\s—]|[\["_`][.,?!][\s—])(?:\*|(?<!["'_`\]]))([^\[\]"_`\r\n]+?)(?:\*|(?<!["'_`\]]))(?=[\s—]["_`\]])/g,
    actionBetweenDialogueReplace: "*$1*",
    actionAfterDialogue: /(?<=[\["_`][\s—]|[\["_`][.,?!][\s—])(?:\*|(?!["_`\[]))([^\[\]"_`\r\n]+?)(?:\*|(?<!["'_`\]]))(?:(?=\n)|$)/g,
    actionAfterDialogueReplace: "*$1*",
    actionBeforeDialogue: /^(?:\*|(?!["_`\[]))([^\[\]"_`\r\n]+?)(?:\*|(?!["_`\]]))(?=[\s—]["_\]])/g,
    actionBeforeDialogueReplace: "*$1*",
    mergedActions: /(?<=[\s—]|^)\*(?![\s—\*])([^"_`\n]+?)(?<!\*|[\s—])\*\*(?!\*|[\s—.,!?])([^"_`\n]+)\*(?=[\s—]|$)/g,
    mergedActionsReplace: "*$1* *$2*",

    singleQuoteBetweenAction: /\*[ —]([^\[\]"'_`\r\n]+?)[ —]\*/g,
    singleQuoteBetweenActionReplace: "—'$1'—",

    actionEmphasisOne: /(?<=[\s—]|^)\*(?![\s—\*])([^"_`]*)\*(?<![\s—])(?=[\s—]|$)/g,
    actionEmphasisOneSingleQuoteGuard: /\*[\s—]'[^']*?'\s\*/g,
    actionEmphasisTwo: /(?<=[\s—]|^)\*+(?![\s—])([^*]*)\*+(?<![\s—])(?=[\s—]|$|[.,?!])/g,
    actionEmphasisTwoReplace: "***$1***",

    dialogueEmphasisOne: /(?<=[\s—]|^)["_\[](?![\s—])([^"_`]*)["_\]](?<![\s—])(?=[\s—]|$)/g,
    dialogueEmphasisTwo: /(?<=[\s—]|^)\*+(?![\s—])([^*]*)(?<!hiccup|hic)\*+(?<![\s—])(?=[\s—]|$|[.,?!])/g,
    dialogueEmphasisTwoReplace: "**$1**",
    
    tooManyAsterisks: /\*{4,}/g,
    tooManyAsterisksReplace: "***",
    tooManyQuotes: /\"{2,}/g,
    tooManyQuotesReplace: `"`,
    tooManyUnderscores: /\_{3,}/g,
    tooManyUnderscoresReplace: "__",
    tooManyGraves: /\`{4,}/g,
    tooManyGravesReplace: "```",

    squareBrackets: /[\[\]]+((?![\s—])[^\]\[]+)(?<![\s—])[\[\]]+/g,
    squareBracketsReplace: "[$1]",
    parenthesis: /[\(\)]+((?![\s—])[^\)\()]+)(?<![\s—])[\(\)]+/g,
    parenthesisReplace: "($1)",
    curlyBrackets: /[\{\}]+((?![\s—])[^\}\{})]+)(?<![\s—])[\{\}]+/g,
    curlyBracketsReplace: "{$1}",
    codeBlocks: /^`{2,}(text|)([\s—]+)?([\w\W]+?\n?[^`\n]+?)(?:\n+|\n?)`{2,}$/gm,
    codeBlocksReplace: "```$1\n$3\n```",
    speech: /(?<=^|[\s—])(?:\**|`*)(["_\[][^"`\[\]]+?["_\]])(?:\**|`*)(?=[\s—]|$)/g,
    speechReplace: "$1",

    normalizeQuotes: /[\u00AB\u00BB\u201C\u201D\u02BA\u02EE\u201F\u275D\u275E\u301D\u301E\uFF02]/g,
    normalizeSingleQuotes: /[\u2018\u2019\u2039\u203A\u02BB\u02C8\u02BC\u02BD\u02B9\u201B\uFF07\u02CA\u275B\u275C]/g,
    normalizeHyphens: /[\u2010\u2043\u23BC\u23BD\uFE63\uFF0D\u2013]/g,
    normalizeElipses: /\u2026/g,
    normalizeSpaces: /[\u00A0\u2000\u200A\u202F\u205F\u3000\uFEFF]/g,
    normalizeEmDashes: /\u2015/g,
    normalizeAsterisks: /[\u2043\u2219\u25D8\u25E6\u2619\u2765\u2767]/g,
    normalizeSwungDash: /\u2053/g,
    normalizePosessives: /(?<=[^\s—])'(?=s)(?=\b)|(?<=s)'(?=[\s—.,!?])/ig,
    normalizeContractions: /(?<=[^\s—])'(?=t|ll|ve|re)(?=\b)/ig,

    missingEndAsterisk: /(?<=["_\]][\s—]|^)\*+([^"_\[\]]+)(?<!\*)(?=[\s—]["_\[]|$)/g,
    missingEndAsteriskReplace: "*$1*",
    missingStartAsterisk: /(?<=["_\]][\s—]|^)(?!\*)([^"_\[\]]+)(?<!\*)\*+(?=[\s—]["_\[]|$)/g,
    missingStartAsteriskReplace: "*$1*"
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

    //Normalize Unicode Symbols
    message = replaceText(message, weylandRegex.normalizeQuotes, `"`);
    message = replaceText(message, weylandRegex.normalizeSingleQuotes, `'`);
    message = replaceText(message, weylandRegex.normalizeHyphens, `-`);
    message = replaceText(message, weylandRegex.normalizeElipses, `...`);
    message = replaceText(message, weylandRegex.normalizeSpaces, ` `);
    message = replaceText(message, weylandRegex.normalizeEmDashes, `\u2014`);
    message = replaceText(message, weylandRegex.normalizeAsterisks, `*`);
    message = replaceText(message, weylandRegex.normalizeSwungDash, `~`);
    message = replaceText(message, weylandRegex.normalizePosessives, `\u2019`);
    message = replaceText(message, weylandRegex.normalizeContractions, `\u2019`);

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
        try {
            weylandDebug(`#${index} - Formatting...`);
            const paragraphLoopStartTime = performance.now();
            paragraph = paragraph.trim();
            if (weylandRegex.detectHeader.test(paragraph)) {
                //Format Header?
                paragraphs[index] = paragraph;
                weylandDebug(`#${index} - Formatting header took ${performance.now()-paragraphLoopStartTime} miliseconds`);
                return;
            }

            try {
                if (paragraph.match(weylandRegex.asterisk)?.length % 2 !== 0) {
                    paragraph = replaceText(paragraph, weylandRegex.missingEndAsterisk, weylandRegex.missingEndAsteriskReplace);
                    paragraph = replaceText(paragraph, weylandRegex.missingStartAsterisk, weylandRegex.missingStartAsteriskReplace);
                    if (paragraph.match(weylandRegex.asterisk)?.length % 2 !== 0) {
                        let matches = paragraph.match(weylandRegex.greedyDetectAction);
                        if (matches) {
                            matches.forEach((match) => {
                                paragraph = paragraph.replace(match, `*${replaceText(match, weylandRegex.asterisk, '')}*`);
                            });
                        }
                    }
                }
            } catch (e) {
                weylandDebug(`#${index} - MissingAsterisks error: ${e}`);
            }

            if (!weylandRegex.detectWeybotRelations.test(paragraph) && !weylandRegex.codeBlocks.test(paragraph))
            {
                const actionParagraph = weylandRegex.detectActionParagraph.test(paragraph);

                try {
                    paragraph = replaceText(paragraph, weylandRegex.mergedActions, weylandRegex.mergedActionsReplace);
                    if (!actionParagraph) paragraph = replaceText(paragraph, weylandRegex.actionBetweenDialogue, weylandRegex.actionBetweenDialogueReplace);

                    if (!actionParagraph) paragraph = replaceText(paragraph, weylandRegex.actionAfterDialogue, weylandRegex.actionAfterDialogueReplace);
                    if (!actionParagraph) paragraph = replaceText(paragraph, weylandRegex.actionBeforeDialogue, weylandRegex.actionBeforeDialogueReplace);

                    if (!weylandRegex.goodStart.test(paragraph) && !weylandRegex.goodEnd.test(paragraph)) {
                        weylandDebug(`#${index} - Adding asterisks to blank paragraph`);
                        paragraph = `*${paragraph}*`; //Entirely blank, add asterisks to both ends
                    }
                } catch (e) {
                    weylandDebug(`#${index} - ActionDialogueFix error: ${e}`);
                }
                
                try {
                    if (!actionParagraph && !weylandRegex.greedyDetectActionQuotes.test(paragraph)) {
                        weylandDebug(`#${index} - Greedy Detect Action Quotes`)
                        paragraph = paragraph.replaceAll(`"`,`'`);
                    }
                } catch (e) {
                    weylandDebug(`#${index} - ActionQuotes error: ${e}`);
                }

                try {
                    paragraph = replaceText(paragraph, weylandRegex.singleQuoteBetweenAction, weylandRegex.singleQuoteBetweenActionReplace);
                } catch (e) {
                    weylandDebug(`#${index} - ActionSingleQuoteFix error: ${e}`);
                }

                try {
                    paragraph.match(weylandRegex.actionEmphasisOne)?.forEach((match) => {
                        match = match.slice(1,-1);
                        if (weylandRegex.actionEmphasisOneSingleQuoteGuard.test(match)) {
                            const splitWord = "|SPLIT|"
                            match = match.replace(weylandRegex.actionEmphasisOneSingleQuoteGuard, splitWord);
                            const matchSplit = match.split(splitWord);
                            matchSplit.forEach((split) => {
                                if (weylandRegex.actionEmphasisTwo.test(split)) {
                                    weylandDebug(`#${index} - Formatting applied '${weylandRegex.actionEmphasisTwo}' with '${weylandRegex.actionEmphasisTwoReplace}' to: ${split}`)
                                    paragraph = paragraph.replace(
                                        split,
                                        split.replace(weylandRegex.actionEmphasisTwo, weylandRegex.actionEmphasisTwoReplace)
                                    );
                                }
                            });
                        } else if (weylandRegex.actionEmphasisTwo.test(match)) {
                            weylandDebug(`#${index} - Formatting applied '${weylandRegex.actionEmphasisTwo}' with '${weylandRegex.actionEmphasisTwoReplace}' to: ${match}`)
                            paragraph = paragraph.replace(
                                match,
                                match.replace(weylandRegex.actionEmphasisTwo, weylandRegex.actionEmphasisTwoReplace)
                            );
                        }
                    });
                } catch (e) {
                    weylandDebug(`#${index} - ActionEmphasis error: ${e}`);
                }
                
                try {
                    if (!actionParagraph) {
                        paragraph.match(weylandRegex.dialogueEmphasisOne)?.forEach((match) => {
                            match = match.slice(1,-1);
                            if (weylandRegex.dialogueEmphasisTwo.test(match)) {
                                weylandDebug(`#${index} - Formatting applied '${weylandRegex.dialogueEmphasisTwo}' with '${weylandRegex.dialogueEmphasisTwoReplace}' to: ${match}`)
                                paragraph = paragraph.replace(
                                    match,
                                    match.replace(weylandRegex.dialogueEmphasisTwo, weylandRegex.dialogueEmphasisTwoReplace)
                                );
                            }
                        });
                    }
                } catch (e) {
                    weylandDebug(`#${index} - DialogueEmphasis error: ${e}`);
                }
                
            }

            paragraphs[index] = paragraph; //Default loop end
            weylandDebug(`#${index} - Formatting paragraph took ${performance.now()-paragraphLoopStartTime} miliseconds`);
        } catch (e) {
            weylandDebug(`#${index} - Paragraph error: ${e}`);
        }
    });

    weylandDebug(`formatParagraphs took ${performance.now()-formatParagraphsStartTime} miliseconds`);
    return paragraphs;
}

function replaceText(text, regex, replace) {
    if (regex.test(text)) {
        const newText = text.replace(regex, replace);
        if (newText !== text) weylandDebug(`Formatting applied '${regex}' with '${replace}' to: ${text.match(regex)}`);
        return newText;
    }
    return text;
}

async function formatMessage(messageId) {
    if (settings === undefined) getSettings();
    if (!settings.enabled) return;

    const formatMessageStartTime = performance.now();
    //weylandDebug(JSON.stringify(chat[messageId]));

    const isUser = chat[messageId].is_user;
    const isSystem = chat[messageId].is_system;

    if (isUser || isSystem) return;

    const characterName = chat[messageId].name;

    const originalMessage = chat[messageId].mes;

    if (weylandRegex.detectHeader.test(originalMessage)) {
        weylandDebug(`Formatting message with ID: '${messageId}'`);
        weylandDebug(`Formatting character: ${characterName}`);
        const paragraphs = await formatParagraphs(originalMessage);
    
        chat[messageId].mes = paragraphs.join("\n\n");
        weylandDebug(`formatMessage took ${performance.now()-formatMessageStartTime} miliseconds`);
    }
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
            regex: /(\**\b(?:hic{1,2}(?!up)(?!cup)|hiccup)\b\**)/gi,
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
            regex: /\*(?![\s\n])([^*"_\[\]]*)(?!\*\s)\*([^*]+)\*([^*"_\[\]]*)\*(?<![\s\n])/g,
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
function singleQuoteExt(){
    try {
        return [{
            type: 'output',
            regex: /(?<=[\s—]|.>)('[^"]+?')(?=[\s—".,!?]|<.)/g,
            replace: `<q style="color: ${power_user.quote_text_color}; display: inline">$1</q>`
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in singleQuoteExt extension:`, e);
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
            regex: /((?<=.>)[^"*~_`\n\r]*~[^"*_`\n\r]*[~\]\)](?=<.|\s))/,
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
            regex: /\[\(.+\)\]: #/g,
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
    converter.addExtension(singleQuoteExt(), 'singleQuote');
    //converter.addExtension(nonItalicsExt(), 'insideAsterisks');
    converter.addExtension(fdiglMarkdownExt(), 'fdiglSystemMessage');
    if (settings.markdown) {
        converter.addExtension(hiccupMarkdownExt(), 'hiccup');
    }
}