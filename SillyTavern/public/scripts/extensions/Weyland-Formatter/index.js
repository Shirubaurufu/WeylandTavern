import { eventSource, event_types, getCurrentChatId, reloadCurrentChat, saveSettingsDebounced, converter, reloadMarkdownProcessor, updateMessageBlock } from '../../../script.js';
import { power_user } from '../../power-user.js';
import { getGlobalVariable } from '../../variables.js';
import { substituteParams } from '../../../script.js';
import { getTokenCountAsync } from '../../tokenizers.js';
import { oai_settings } from '../../openai.js';
const {extensionSettings, renderExtensionTemplateAsync, chat} = SillyTavern.getContext();

const MODULE_NAME = "Weyland-Formatter";
const extensionVersion = "1.11.12";
let preFormatLastMessage = undefined;
let postFormatLastMessage = undefined;

/**
 * @typedef {Object} WeylandFormatterSettings
 * @property {boolean} enabled
 * @property {boolean} markdown
 * @property {boolean} debug
 * @property {boolean} experimental
 */

/** @type {WeylandFormatterSettings} */
const defaultSettings = {
    enabled: true,
    markdown: true,
    debug: false,
    experimental: false,
};

/** @type {WeylandFormatterSettings} */
let settings = undefined;

/**
 * @typedef {Object} WeylandFormatterRegex
 * @property {RegExp} paragraphSplit
 * @property {RegExp} detectHeaderLegacy
 * @property {RegExp} detectHeader
 * @property {RegExp} detectMuseHeader
 * @property {RegExp} detectActionParagraph
 * @property {RegExp} detectWeybotRelations
 * @property {RegExp} greedyDetectAction
 * @property {RegExp} greedyDetectActionQuotes
 * @property {RegExp} detectHTMLParagraph
 * @property {RegExp} tavernTails
 * @property {RegExp} thinkFull
 * @property {RegExp} thinkStart
 * @property {RegExp} thinkEnd
 * 
 * @property {RegExp} asterisk
 * 
 * @property {RegExp} headerFix
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
 * @property {RegExp} singleQuoteBetweenActionSpeechGuardrail
 * @property {RegExp} singleQuoteBetweenAction
 * @property {string} singleQuoteBetweenActionReplace
 * 
 * @property {RegExp} actionEmphasisFix
 * @property {string} actionEmphasisFixReplace
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
 * @property {RegExp} normalizeHeight
 * 
 * @property {RegExp} missingEndAsterisk
 * @property {string} missingEndAsteriskReplace
 * @property {RegExp} missingStartAsterisk
 * @property {string} missingStartAsteriskReplace
 * 
 * @property {RegExp} detectPhone
 * @property {RegExp} phoneFix
 * 
 * @property {RegExp} subbotNameFix
 * @property {string} subbotNameFixReplace
 * 
 * @property {RegExp} breakbar
 * @property {RegExp} spacer
 * @property {RegExp} spacer2
 * 
 * @property {RegExp} expressionClothingParagraph
 * @property {RegExp} ltmFix
 * @property {RegExp} roughDraftRemove
 */

/** @type {WeylandFormatterRegex} */
const weylandRegex = {
    paragraphSplit: /\n\s*\n/,
    detectHeaderLegacy: /(?:^|(?<=\\n))(?:\*{1,3})?(([^"*~_`\n\r\\]*)~([^"*_`\n\r]*)[~\]\)])(?:\*{1,3})?(?:$|(?=\\n))/m,
    detectHeader: /^¦+\s?(.+? ?(?:\(\w{4}\) ?)?)¦+$/m,
    detectMuseHeader: /^(?:(?:MUSE EXPERIMENT:.+)|(?:(?:(?:Mon|Tue(?:s)?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?|Sun)(?:day)?),.+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|(Nov|Dec)(?:ember)?) \d{1,2}, \d+ - \d{1,2}:\d{1,2} [AP]M(?:\s.+)?)|(?:.+ \(CODE: ?\d+\))|(?:Collar Status: (?:(?:In)?Active|Monitoring Only.+))|(?:Evening Scene:.+))$/im,
    detectActionParagraph: /^\*[^"_*]*\*$/,
    detectWeybotRelations: /New [^{]+{[^}]+}/,
    greedyDetectAction: /(?<=[\s—]|^)\*([^"_\[\]\n\r]+)\*(?=[\s—]|$)/g,
    greedyDetectActionQuotes: /(?<=\*[\s—]|__[\s—]|^)"[^"]+"(?=[\s—]\*|[\s—]__|$)/,
    detectHTMLParagraph: /^<[\s\S]*>$/,
    tavernTails: /^<div style="text-align: center;"><font size="6"><strong>Tavern Tails<\/strong><\/font><\/div>/,
    thinkFull: /<.*think.*>[\w\W]+?<.*\/.*think.*>/,
    thinkStart: /^<.*think.*>/,
    thinkEnd: /<.*\/.*think.*>$/,

    asterisk: /\*/g,

    headerFix: /^# ?/gm,

    goodStart: /^(?:[\[*'"`>]|__)/,
    goodEnd: /(?:[*'"`\]]|__)$/,

    actionBetweenDialogue: /(?<=[\["_`][\s—]|[\["_`][.,?!][\s—])(?:\*|(?<!["'_`\]]))([^\[\]"_`\r\n]+?)(?:\*|(?<!["'_`\]]))(?=[\s—]["_`\]])/g,
    actionBetweenDialogueReplace: "*$1*",
    actionAfterDialogue: /(?<=[\["_`][ —]|[\["_`][.,?!][ —])(?:\*|(?!["_`\[]))([^\[\]"_`\r\n]+?)(?:\*|(?<!["'_`\]]))(?:(?=\n)|$)/g,
    actionAfterDialogueReplace: "*$1*",
    actionBeforeDialogue: /^(?:\*|(?!["_`\[]))([^\[\]"_`\r\n]+?)(?:\*|(?!["_`\]]))(?=[\s—]["_\]])/g,
    actionBeforeDialogueReplace: "*$1*",
    mergedActions: /(?<=[\s—]|^)\*(?![\s—\*])([^"_`\n]+?)(?<!\*|[\s—])\*\*(?!\*|[\s—.,!?])([^"_`\n]+)\*(?=[\s—]|$)/g,
    mergedActionsReplace: "*$1* *$2*",

    singleQuoteBetweenActionSpeechGuardrail: /["'_\[`][^*"'\[\]_`]+\*[^*]+(?<!\*)\*[ —]([^\[\]"'_`\r\n]+?)[ —]\*(?!\*)[^\*]+\*[^"'_\[\]`]+["'_\]`]/g,
    singleQuoteBetweenAction: /(?<!\*)\*[ —]([^\[\]"'_`\r\n]+?)[ —]\*(?!\*)/g,
    singleQuoteBetweenActionReplace: "—'$1'—",

    actionEmphasisFix: /(?<=[\s—]|^)(?<=\*+.+?)\*+([^*\n]+)\*+(?=.+\*+)/g,
    actionEmphasisFixReplace: "***$1***",

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
    normalizeContractions: /(?<=[^\s—])'(?=t\W|ll\W|ve\W|re\W)/ig,
    normalizeHeight: /(\d{1,3})'(\d{1,2})"/g,

    missingEndAsterisk: /(?<=["_\]][\s—]|^)\*+([^"_\[\]]+)(?<!\*)(?=[\s—]["_\[]|$)/g,
    missingEndAsteriskReplace: "*$1*",
    missingStartAsterisk: /(?<=["_\]][\s—]|^)(?!\*)([^"_\[\]]+)(?<!\*)\*+(?=[\s—]["_\[]|$)/g,
    missingStartAsteriskReplace: "*$1*",

    detectPhone: /(?:incom|outgo)ing[¦\|]/i,
    phoneFix: /(Phone[¦\|].*\nTexting[¦\|].*\n)?((?:(?:Incom|Outgo)ing[¦\|].*(?:(?:\n)(?:Incom|Outgo)ing[¦\|].*)*))/i,

    subbotNameFix: /^(__[^"*_]+:)(?!__).*?(?= )/gm,
    subbotNameFixReplace: "$1__",

    breakbar: /¦/,
    spacer: /^---$/,
    spacer2: /^=+$/,

    expressionClothingParagraph: /^((?:\[[a-z]+?\]) ?(?:\[[a-z]+?\])(?: ?\[[a-z]+?\])?)(?: +)?(\[\d+\])?.*$/i,
    ltmFix: /(.*\n\n#.*[\s\S]*?\n\nMEMORY:[\s\S]*?\n\nFRAGMENTS:[\s\S]*?(?=\n\n))/im,
    roughDraftRemove: /((?<=\n)\n+)? *\[D\] *(\n+(?=\n))?/i,
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

function weylandDebug(text, error) {
    if (settings === undefined) getSettings();
    if (settings?.debug) {
        if (error) {
            console.debug(`[${MODULE_NAME}] ${text}`, error);
        } else {
            console.debug(`[${MODULE_NAME}] ${text}`);
        }
    }
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
    message = replaceText(message, weylandRegex.normalizeHeight, `$1\u2019$2\u201D`);

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

    //Fix any wrongly formatted subbot names
    message = replaceText(message, weylandRegex.subbotNameFix, weylandRegex.subbotNameFixReplace);

    // Remove the rough draft marker "[D]"
    message = replaceText(message, weylandRegex.roughDraftRemove, "");

    let paragraphs = message.split(weylandRegex.paragraphSplit);
    let paragraphCount = paragraphs.length;
    let thinking = false;
    let foundHeader = false;
    let foundFooter = false;

    weylandDebug(`Paragraph count: ${paragraphs.length}`);

    paragraphs.forEach((paragraph, index) => {
        try {
            weylandDebug(`#${index} - Formatting...`);
            const paragraphLoopStartTime = performance.now();
            paragraph = paragraph.trim();
            if (!thinking && weylandRegex.thinkStart.test(paragraph)) thinking = true;
            if (thinking) {
                if (weylandRegex.thinkEnd.test(paragraph)) thinking = false;
                return;
            }
            
            if (weylandRegex.detectHeader.test(paragraph) || weylandRegex.detectMuseHeader.test(paragraph)) {
                if (!thinking) {
                    //Format Header
                    const splitParagraph = paragraph.match(/([\w\W]+)(?<=¦ *\n)(.+)/);
                    if (splitParagraph) {
                        paragraph = splitParagraph[1].trim();
                    }
                    paragraph = replaceText(paragraph, weylandRegex.asterisk, "");
                    paragraph = replaceText(paragraph, weylandRegex.headerFix, "");
                    if (!foundHeader) {
                        paragraphCount -= index;
                        foundHeader = true;
                    }
                    paragraphCount -= 1;
                    paragraphs[index] = paragraph;
                    weylandDebug(`#${index} - Formatting header took ${performance.now()-paragraphLoopStartTime} miliseconds`);
                    if (splitParagraph) {
                        paragraph = splitParagraph[2].trim();
                        index += 1;
                        paragraphs.splice(index, 0, paragraph);
                    } else {
                        return;
                    }
                }
            }

            if (!foundHeader) {
                if (!weylandRegex.tavernTails.test(paragraph) && !settings?.experimental) {
                    paragraphs[index] = "";
                }
                return;
            }
            
            if (foundFooter) {
                paragraphs[index] = "";
                return;
            } else {
                try {
                    const expCloPar = paragraph.match(weylandRegex.expressionClothingParagraph);
                    if (expCloPar) {
                        foundFooter = true;
                        expCloPar[2] = `[${paragraphCount - (paragraphs.length-index)}]`;
                        paragraph = replaceText(paragraph, weylandRegex.expressionClothingParagraph, `${expCloPar[1]} ${expCloPar[2]}`);
                        paragraphs[index] = replaceText(paragraph, weylandRegex.asterisk, "");
                        return;
                    }
                } catch (e) {
                    weylandDebug(`#${index} - expCloPar error: ${e}`);
                }
            }

            if (weylandRegex.detectPhone.test(paragraph)) {
                const phoneFix = paragraph.match(weylandRegex.phoneFix);
                if (phoneFix) {
                    paragraphs[index] = phoneFix[0];
                } else {
                    paragraphCount -= 1;
                }
                return; 
            }

            if (weylandRegex.spacer.test(paragraph) || weylandRegex.spacer2.test(paragraph)) {
                paragraphCount -= 1;
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

            try {
                paragraph = replaceText(paragraph, weylandRegex.actionEmphasisFix, weylandRegex.actionEmphasisFixReplace);
            } catch (e) {
                weylandDebug(`#${index} - ActionEmphasisFix error: ${e}`);
            }
            

            if (!weylandRegex.detectWeybotRelations.test(paragraph) && !weylandRegex.codeBlocks.test(paragraph))
            {
                const actionParagraph = weylandRegex.detectActionParagraph.test(paragraph);

                try {
                    paragraph = replaceText(paragraph, weylandRegex.mergedActions, weylandRegex.mergedActionsReplace);
                    if (!actionParagraph) paragraph = replaceText(paragraph, weylandRegex.actionBetweenDialogue, weylandRegex.actionBetweenDialogueReplace);

                    if (!actionParagraph) paragraph = replaceText(paragraph, weylandRegex.actionAfterDialogue, weylandRegex.actionAfterDialogueReplace);
                    if (!actionParagraph) paragraph = replaceText(paragraph, weylandRegex.actionBeforeDialogue, weylandRegex.actionBeforeDialogueReplace);

                    if (!weylandRegex.goodStart.test(paragraph) && !weylandRegex.goodEnd.test(paragraph) && !weylandRegex.detectHTMLParagraph.test(paragraph)) {
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
                    const matches = paragraph.match(weylandRegex.singleQuoteBetweenActionSpeechGuardrail);
                    paragraph.match(weylandRegex.singleQuoteBetweenAction)?.forEach(match => {
                        if (!matches?.filter(str => str.includes(match))) {
                            weylandDebug(`#${index} - Formatting applied '${weylandRegex.singleQuoteBetweenAction}' with '${weylandRegex.singleQuoteBetweenActionReplace}' to: ${match}`)
                            paragraph = paragraph.replace(
                                match, 
                                match.replace(weylandRegex.singleQuoteBetweenAction, weylandRegex.singleQuoteBetweenActionReplace)
                            );
                        }
                    });
                } catch (e) {
                    weylandDebug(`#${index} - ActionSingleQuoteFix error: ${e}`);
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
    return paragraphs.filter(paragraph => paragraph.length !== 0);
}

function replaceText(text, regex, replace) {
    if (regex.test(text)) {
        const newText = text.replace(regex, replace);
        if (newText !== text) weylandDebug(`Formatting applied '${regex}' with '${replace}' to: ${text.match(regex)}`);
        return newText;
    }
    return text;
}

async function formatNewMessage(messageId) {
    if (settings === undefined) getSettings();
    const char = chat[messageId]?.name;
    if (messageId === 0 && char !== "Weybot") return;
    const blacklistChar = char === "Kressa" || char === "Kinsbane Manor";
    let mes = chat[messageId]?.mes;
    if (mes) {
        if (!blacklistChar) {
            if (!power_user.user_prompt_bias) {
                mes = `${substituteParams(getGlobalVariable("Thinking"))}\n\n${mes.trim()}`;
                console.log(`[Weyland-Debug] 1`);
            } else if (!/^\s?\[overwrite\]\s?/i.test(power_user.user_prompt_bias)) {
                mes = `${substituteParams(getGlobalVariable("Thinking"))}\n\n${mes.replace(substituteParams(power_user.user_prompt_bias),"").trim()}`;
                console.log(`[Weyland-Debug] 2`);
            }
        }
        if (/^\s?\[overwrite\]\s?/i.test(mes)) {
            mes = mes.replace(/^\s?\[overwrite\]\s?/i, "");
            console.log(`[Weyland-Debug] 3`);
        }
    }
    await formatMessage(messageId, mes);
}

async function formatMessage(messageId, mes = undefined) {
    if (settings === undefined) getSettings();
    const characterName = chat[messageId]?.name;
    if (messageId === 0 && characterName !== "Weybot") return;

    let originalMessage = mes ? mes : chat[messageId].mes;

    preFormatLastMessage = originalMessage;
    window.preFormatLastMessage = originalMessage;

    if (!settings?.enabled) {
        if (!settings?.experimental) {
            if (weylandRegex.thinkFull.test(originalMessage)) {
                chat[messageId].mes = originalMessage.replace(weylandRegex.thinkFull, "").trim();
            } else if (weylandRegex.thinkStart.test(originalMessage)) {
                if (weylandRegex.detectHeader) {
                    chat[messageId].mes = originalMessage.slice(originalMessage.indexOf(originalMessage.match(weylandRegex.detectHeader))).trim();
                } else if (chat[messageId].name === "Muse" && weylandRegex.detectMuseHeader) {
                    chat[messageId].mes = originalMessage.slice(originalMessage.indexOf(originalMessage.match(weylandRegex.detectMuseHeader))).trim();
                } else {
                    chat[messageId].mes = "";
                }
            } else if (weylandRegex.thinkEnd.test(originalMessage)) {
                chat[messageId].mes = originalMessage.split(weylandRegex.thinkEnd)[1].trim();
            }
        }
        if (chat[messageId].extra.token_count) {
            chat[messageId].extra.token_count = await getTokenCountAsync(chat[messageId].mes, 0);
        }
        return;
    }

    const formatMessageStartTime = performance.now();

    const isUser = chat[messageId].is_user;
    const isSystem = chat[messageId].is_system;

    if (isUser || isSystem) return;

    const ltmFix = originalMessage.match(weylandRegex.ltmFix);
    if (ltmFix) {
        originalMessage = ltmFix[1].trim();
        chat[messageId].mes = originalMessage;
    }

    const thinkFull = originalMessage.match(weylandRegex.thinkFull);
    let reason = settings?.experimental && chat[messageId].extra.reasoning ? `${chat[messageId].extra.reasoning}\n\n---\n\n` : "";
    if (thinkFull) {
        if (settings?.experimental) {
            reason = `${reason}${thinkFull[0].replace(weylandRegex.thinkStart,"").replace(weylandRegex.thinkEnd,"").trim()}`;
        }
        originalMessage = originalMessage.replace(thinkFull[0], "").trim();
    } else {
        if (weylandRegex.thinkStart.test(originalMessage)) {
            const detectHeader = originalMessage.match(weylandRegex.detectHeader);
            if (detectHeader) {
                const index = originalMessage.indexOf(detectHeader[0]);
                if (settings?.experimental) {
                    reason = `${reason}${originalMessage.slice(0, index).replace(weylandRegex.thinkStart,"").trim()}`;
                }
                originalMessage = originalMessage.slice(index).trimStart();
            } else if (chat[messageId].name === "Muse") {
                const detectMuseHeader = originalMessage.match(weylandRegex.detectMuseHeader);
                if (detectMuseHeader) {
                    const index = originalMessage.indexOf(detectMuseHeader[0]);
                    if (settings?.experimental) {
                        reason = `${reason}${originalMessage.slice(0, index).replace(weylandRegex.thinkStart,"").trim()}`;
                    }
                    originalMessage = originalMessage.slice(index).trimStart();
                } else {
                    originalMessage = "";
                }
            } else {
                originalMessage = "";
            }
        } else if (weylandRegex.thinkEnd.test(originalMessage)) {
            const split = originalMessage.split(weylandRegex.thinkEnd);
            if (settings?.experimental) {
                reason = `${reason}${split[0].replace(weylandRegex.thinkEnd,"").trim()}`;
            }
            originalMessage = split[1].trim();
        }
    }
    chat[messageId].extra.reasoning = reason;

    if (weylandRegex.detectHeader.test(originalMessage) || (characterName === `Muse` && weylandRegex.detectMuseHeader.test(originalMessage))) {
        weylandDebug(`Formatting message with ID: '${messageId}'`);
        weylandDebug(`Formatting character: ${characterName}`);
        const paragraphs = await formatParagraphs(originalMessage);
    
        originalMessage = paragraphs.join("\n\n");
    } else if (!settings?.experimental && !weylandRegex.thinkFull.test(originalMessage) && weylandRegex.thinkStart.test(originalMessage) && characterName !== "Kressa" && characterName !== "Kinsbane Manor") {
        originalMessage = "";
    }
    chat[messageId].mes = originalMessage;

    weylandDebug(`formatMessage took ${performance.now()-formatMessageStartTime} miliseconds`);

    postFormatLastMessage = originalMessage;
    window.postFormatLastMessage = originalMessage;

    if (chat[messageId]?.extra?.token_count && !settings?.experimental) {
        try {
            chat[messageId].extra.token_count = await getTokenCountAsync(originalMessage, 0);
        } catch (error) {
            weylandDebug(`Failed to update token count for message [${messageId}]`, error);
        }
    }

    weylandDebug(`Finished formatting message [${messageId}]`);
}

async function formatOutgoingMessages(data) {
    if (data.dryRun) return;
    if (data.chat) { // OpenAI
        data.chat.slice(-19).forEach(m => {
            if (m.role === "assistant") {
                m.content = m.content.replace(weylandRegex.detectHeaderLegacy, "¦¦ $1 ¦¦");
            }
        })
    } else if (data.prompt) { // Non-OpenAI
        // No idea what this looks like
    }
}

(async function () {
    async function addExtensionSettings() {
        const template = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
        $('#extensions_settings2').append(template);

        // Enabled
        $('#weylandFormatterEnable').prop('checked', settings.enabled).on('input', function () {
            settings.enabled = !!$(this).prop('checked');
            weylandDebug(`Setting Enabled: ${settings.enabled}`);
            saveSettingsDebounced();
        });

        // Markdown
        $('#weylandFormatterMarkdown').prop('checked', settings.markdown).on('input', function () {
            settings.markdown = !!$(this).prop('checked');
            weylandDebug(`Setting Markdown: ${settings.markdown}`);
            updateReloadMarkdownProcessor();
            saveSettingsDebounced();
        });

        // Debug
        $('#weylandFormatterDebug').prop('checked', settings.debug).on('input', function () {
            settings.debug = !!$(this).prop('checked');
            weylandDebug(`Setting Debug: ${settings.debug}`);
            saveSettingsDebounced();
        });

        // Experimental
        $('#weylandFormatterExperimental').prop('checked', settings.experimental).on('input', function () {
            settings.experimental = !!$(this).prop('checked');
            weylandDebug(`Setting Experimental: ${settings.experimental}`);
            if (settings.experimental) {
                toastr.warning('WARNING: Weyland-Formatter Experimental mode enabled. Experience may be negatively impacted. It is recommended to disable experimental mode.');
            } else {
                oai_settings.stream_openai = false;
                $('#stream_toggle').prop('checked', false);
            }
            saveSettingsDebounced();
        });

        $('#weylandPreFormatLastMessageButton').on('click', async function () {
            weylandDebug("Copy Pre-Format clicked.");
            if (!preFormatLastMessage) {
                toastr.warning('[Weyland-Formatter] Last message has not been set.');
                return;
            }

            try {
                await navigator.clipboard.writeText(preFormatLastMessage);
                toastr.info('[Weyland-Formatter] Copied Pre-Format Message to clipboard.');
            } catch (err) {
                console.error("[Weyland-Formatter] Clipboard Error:", err);
                toastr.warning('[Weyland-Formatter] Failed to copy Pre-Format Message to clipboard.');
            }
        });

        $('#weylandPostFormatLastMessageButton').on('click', async function () {
            weylandDebug("Copy Post-Format clicked.");
            if (!postFormatLastMessage) {
                toastr.warning('[Weyland-Formatter] Last message has not been set.');
                return;
            }

            try {
                await navigator.clipboard.writeText(postFormatLastMessage);
                toastr.info('[Weyland-Formatter] Copied Post-Format Message to clipboard.');
            } catch (err) {
                console.error("[Weyland-Formatter] Clipboard Error:", err);
                toastr.warning('[Weyland-Formatter] Failed to copy Post-Format Message to clipboard.');
            }
        });
        
        $('#stream_toggle').prop('checked', oai_settings.stream_openai).on('change', function () {
            if (!settings.experimental) {
                oai_settings.stream_openai = false;
                $('#stream_toggle').prop('checked', false);
                toastr.warning('WARNING: Streaming is not recommended for Weyland-Tavern.');
            } else {
                oai_settings.stream_openai = !!$('#stream_toggle').prop('checked');
            }
            saveSettingsDebounced();
        });
    }
    
    console.debug(`[${MODULE_NAME}] Initializing v${extensionVersion}`);

    getSettings();
    await addExtensionSettings();

    updateReloadMarkdownProcessor(); //Adds markdown

    eventSource.on(event_types.GENERATE_AFTER_COMBINE_PROMPTS, formatOutgoingMessages);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, formatOutgoingMessages);
    eventSource.on(event_types.MESSAGE_RECEIVED, formatNewMessage);
    eventSource.on(event_types.MESSAGE_EDITED, formatMessage);
    eventSource.on(event_types.CHAT_CHANGED, () => {
        if (settings.experimental)
            toastr.warning('WARNING: Weyland-Formatter Experimental mode enabled. Experience may be negatively impacted. It is recommended to disable experimental mode.');
    });
})();

/** @returns {showdown.ShowdownExtension[]} */
function introImagesExt(){
    try {
        return [{
            type: 'output',
            regex: /\[\s*[IP](\d{3})\s*\]/g,
            replace: function(match, p1) {
                return `<div style="text-align: center;"><img src="${getGlobalVariable(p1)}" style="max-height: 500px; height: auto; width: auto;"></div>`
            }
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in introImagesExt extension:`, e);
        return [];
    }
}

/**  @returns {showdown.ShowdownExtension[]} */
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

/** @returns {showdown.ShowdownExtension[]} */
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

/** @returns {showdown.ShowdownExtension[]} */
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

/** @returns {showdown.ShowdownExtension[]} */
function headerMarkdownExt(){
    try {
        return [{
            type: 'output',
            regex: /(?<=.>)(?:¦¦)? ?(.+~(?: ?\(\w{4}\))?) ?(?:¦¦)?(?=<\/.)/g,
            replace: `<strong style="color: darkred;">$1</strong>`
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in headerMarkdownExt extension:`, e);
        return [];
    }
}

/** @returns {showdown.ShowdownExtension[]} */
function headerV2MarkdownExt(){
    try {
        return [{
            type: 'output',
            regex: /(?<=.>)(?:¦+) ?(.+?(?: ?\(\w{4}\))?) ?(?:¦+)(?=<\/.|<br)/g,
            replace: function(match, p1) {
                try {
                    p1 = p1.replace(/<\/?q.*?>/g, ``);
                    p1 = p1.replace(/<\/?u>/g, ``);
                    p1 = p1.replace(/<\/?em>/g, ``);
                    p1 = p1.replace(/<\/?strong>/g, ``);
                    const split = p1.split(`~`);
                    const dateIndex = split.findIndex(x => /mon|tue|thu|wed|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(x));
                    const timeIndex = split.findIndex(x => /(?: |\d)[ap]m/i.test(x));
                    const modeIndex = split.findIndex(x => /saph|onyx|ruby/i.test(x));
                    const locationIndex = split.findIndex((x, index) => {
                        if (dateIndex > -1 && dateIndex === index) return false;
                        if (timeIndex > -1 && timeIndex === index) return false;
                        if (modeIndex > -1 && modeIndex === index) return false;
                        return true;
                    });
                    if (dateIndex < 0 || timeIndex < 0 || locationIndex < 0) {
                        return `<strong style="color: darkred;">${p1}</strong>`
                    }
                    const mode = modeIndex > -1 ? split[modeIndex].match(/saph|onyx|ruby/i)[0] : undefined;
                    
                    return `<div class="message-header">
<div class="message-location">${split[locationIndex].trim()}</div>
<div class="message-meta">
${modeIndex > -1 ? `<span class="message-mode"${mode ? ` data-mode="${mode.toUpperCase()}"` : ''}>${mode ? mode.toUpperCase().trim() : split[modeIndex].trim()}</span>` : ''}
<span>${split[dateIndex].trim()}</span>
<span>${split[timeIndex].trim()}</span>
</div>
</div>`
                } catch (e) {
                    console.error(`[${MODULE_NAME}] Error in headerV2MarkdownExt extension:`, e);
                    p1 = p1.replace(/<\/?q.*?>/g, ``);
                    p1 = p1.replace(/<\/?u>/g, ``);
                    p1 = p1.replace(/<\/?em>/g, ``);
                    p1 = p1.replace(/<\/?strong>/g, ``);
                    return `<strong style="color: darkred;">${p1}</strong>`
                }
            }
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in phoneMarkdownExt extension:`, e);
        return [];
    }
}

/** @returns {showdown.ShowdownExtension[]} */
function headerMarkdownMuseExt(){
    try {
        return [{
            type: 'output',
            regex: /((?<=p>)\s?(?:(?:MUSE EXPERIMENT:.+)|(?:(?:(?:Mon|Tue(?:s)?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?|Sun)(?:day)?),.+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|(Nov|Dec)(?:ember)?) \d{1,2}, \d+ - \d{1,2}:\d{1,2} ?[AP]M(?:\s.+|<br>\s)?)|(?:.+ \(CODE: ?\d+\))|(?:Collar Status: (?:(?:In)?Active|Monitoring Only.+))|(?:Evening Scene:.+))(?:[^"_\[\]]+?)?(?=<\/p))/i,
            replace: `<strong style="color: darkred;">$1</strong>`
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in headerMarkdownMuseExt extension:`, e);
        return [];
    }
}

/** @returns {showdown.ShowdownExtension[]} */
function expCloParCodeExt(){
    try {
        return [{
            type: 'output',
            regex: /<p>((?:\[[a-z]+?\]) ?(?:\[[a-z]+?\])(?: ?\[[a-z]+?\])?)(?: +)?(\[\d+\])?.*<\/p>/i,
            replace: ``
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in expCloParCodeExt extension:`, e);
        return [];
    }
}

/** @returns {showdown.ShowdownExtension[]} */
function weyBotRelationsExt(){
    try {
        return [{
            type: 'output',
            regex: /(?:<p>)?(?:<strong>)?(?:<em>)?New \w+:(?:<\/em>)?(?:<\/strong>)? {\w+}(?:<\/p>|<br>)?/ig,
            replace: ``
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in expCloParCodeExt extension:`, e);
        return [];
    }
}

/** @returns {showdown.ShowdownExtension[]} */
function thinkMarkdownExt(){
    try {
        return [{
            type: 'output',
            regex: /[\s\S]*\[MEMORY FORMATION SYSTEM\][\s\S]+\[END MEMORY FORMATION\. END MESSAGE HERE\. DO NOT RESUME ROLEPLAY\.\][\s\S]*/,
            replace: ``
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in thinkMarkdownExt extension:`, e);
        return [];
    }
}

/** @returns {showdown.ShowdownExtension[]} */
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

/** @returns {showdown.ShowdownExtension[]} */
function phoneMarkdownExt(){
    try {
        return [{
            type: 'output',
            regex: /<p>((?:Phone[¦\|].*\nTexting[¦\|].*\n)?(?:(?:(?:Incom|Outgo)ing[¦\|].*(?:(?:\n)(?:Incom|Outgo)ing[¦\|].*)*)))<\/p>/ig,
            replace: function(match, p1) {
                try {
                    p1 = p1.replace(/<\/?q.*?>/g, ``);
                    p1 = p1.replace(/<\/?u>/g, `__`);
                    p1 = p1.replace(/<\/?em>/g, `*`);
                    p1 = p1.replace(/<\/?strong>/g, `**`);
                    const lines = p1.split(`<br />\n`);
                    let phoneUIHeader = "";
                    let phoneUIFooter = "";
                    let messages = [];
                    if (/Phone[¦\|]/.test(lines[0])) {
                        const [carrier, _battery] = lines[0].split(/[¦\|]/).slice(1);
                        const contact = lines[1].split(/[¦\|]/)[1];
                        let battery = parseInt(_battery.replace(`%`,``),10);
                        if (battery <= 0) {
                            // @ts-ignore
                            battery = `empty`;
                        } else if(battery < 37) {
                            // @ts-ignore
                            battery = `quarter`;
                        } else if (battery < 62) {
                            // @ts-ignore
                            battery = `half`;
                        } else if (battery >= 100) {
                            // @ts-ignore
                            battery = `full`;
                        } else {
                            // @ts-ignore
                            battery = `three-quarters`;
                        }
                        phoneUIHeader = `<div style="background-color: #1a1a1a; border: 1px solid #444; border-radius: 8px; padding: 16px; color: #f0f0f0; max-width: 600px; margin: auto;">
<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 8px; margin-bottom: 12px; font-weight: bold; color: #66d9ef; font-size: 0.85em; white-space: nowrap;">
<span>${carrier}</span>
<span>${_battery} <i class="fa-solid fa-battery-${battery}" style="color: #66d9ef;"></i></span>
</div>
<div style="font-weight: bold; color: #a6e22e; text-align: center; margin-bottom: 12px; font-size: 1em;">
✧ ${contact} ✧
</div>
<div style="max-height: 382px; overflow-y: auto; padding-right: 10px;">\n\n`;
                        phoneUIFooter = `\n\n</div>
<div style="border-top: 1px solid #444; padding-top: 8px; margin-top: 12px; display: flex; gap: 8px; align-items: center;">
<input type="text" readonly placeholder="Type a message..." style="flex: 1; min-width: 0; background-color: #2a2a2a; border: 1px solid #555; border-radius: 16px; padding: 8px 12px; color: #f0f0f0; outline: none;">
<button style="background-color: #66d9ef; border: none; border-radius: 16px; padding: 8px 16px; color: #1a1a1a; font-weight: bold; white-space: nowrap; flex-shrink: 0;">Send</button>
</div>
</div>`;
                        messages = lines.slice(2);
                    } else {
                        phoneUIHeader = `<div style="background-color: #1a1a1a; border: 1px solid #444; border-radius: 8px; padding: 16px; color: #f0f0f0; max-width: 600px; margin: auto;">
<div style="max-height: 382px; overflow-y: auto; padding-right: 10px;">\n\n`;
                        phoneUIFooter = `\n</div>\n</div>`
                        messages = lines;
                    }
                    
                    messages.forEach((message, index) => {
                        const [type, time, name, text] = message.split(/[¦\|]/)
                        if (type.toLowerCase() === "incoming") {
                            messages[index] = `<div style="display: flex; margin-bottom: 12px; justify-content: flex-start;">
<div style="background-color: #333; border-radius: 12px; padding: 8px 12px; max-width: 70%;">
<div style="font-weight: bold; color: #ff69b4; margin-bottom: 4px;">${name}</div>
<div style="color: #f0f0f0;">${text}</div>
<div style="font-size: 0.75em; color: #888; text-align: right; margin-top: 4px;">${time}</div>
</div>
</div>`
                        } else {
                            if (type.toLowerCase() !== "outgoing") {
                                console.error(`[${MODULE_NAME}] Error in phoneMarkdownExt extension: ${type} is not Incoming or Outgoing! Falling back to Outgoing.`);
                            }
                            messages[index] = `<div style="display: flex; margin-bottom: 12px; justify-content: flex-end;">
<div style="background-color: #4a4a4a; border-radius: 12px; padding: 8px 12px; max-width: 70%;">
<div style="font-weight: bold; color: #66d9ef; margin-bottom: 4px;">${name}</div>
<div style="color: #f0f0f0;">${text}</div>
<div style="font-size: 0.75em; color: #888; text-align: right; margin-top: 4px;">${time}</div>
</div>
</div>`
                        }
                    })
                    return `${phoneUIHeader}${messages.join(`\n\n`)}${phoneUIFooter}`;
                } catch (e) {
                    console.error(`[${MODULE_NAME}] Error in phoneMarkdownExt extension:`, e);
                }
            }
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in phoneMarkdownExt extension:`, e);
        return [];
    }
}

/** @returns {showdown.ShowdownExtension[]} */
function lonePhoneMarkdownExt(){
    try {
        return [{
            type: 'output',
            regex: /<p>((?:Incoming|Outgoing)[¦\|][^\n]*?)<\/p>/ig,
            replace: function(match, p1) {
                try {
                    p1 = p1.replace(/<\/?q.*?>/g, ``);
                    p1 = p1.replace(/<\/?u>/g, `__`);
                    p1 = p1.replace(/<\/?em>/g, `*`);
                    p1 = p1.replace(/<\/?strong>/g, `**`);
                    const [type, time, name, text] = p1.split(/[¦\|]/)
                    if (type.toLowerCase() === "incoming") {
                        return `<div style="display: flex; margin-bottom: 12px; justify-content: flex-start;">
<div style="background-color: #333; border-radius: 12px; padding: 8px 12px; max-width: 70%;">
<div style="font-weight: bold; color: #ff69b4; margin-bottom: 4px;">${name}</div>
<div style="color: #f0f0f0;">${text}</div>
<div style="font-size: 0.75em; color: #888; text-align: right; margin-top: 4px;">${time}</div>
</div>
</div>`
                    } else {
                        if (type.toLowerCase() !== "outgoing") {
                            console.error(`[${MODULE_NAME}] Error in lonePhoneMarkdownExt extension: ${type} is not Incoming or Outgoing! Falling back to Outgoing.`);
                        }
                        return `<div style="display: flex; margin-bottom: 12px; justify-content: flex-end;">
<div style="background-color: #4a4a4a; border-radius: 12px; padding: 8px 12px; max-width: 70%;">
<div style="font-weight: bold; color: #66d9ef; margin-bottom: 4px;">${name}</div>
<div style="color: #f0f0f0;">${text}</div>
<div style="font-size: 0.75em; color: #888; text-align: right; margin-top: 4px;">${time}</div>
</div>
</div>`
                    }
                } catch (e) {
                    console.error(`[${MODULE_NAME}] Error in phoneMarkdownExt extension:`, e);
                    return match;
                }
            }
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in phoneMarkdownExt extension:`, e);
        return [];
    }
}

/** @returns {showdown.ShowdownExtension[]} */
function heartRateMarkdownExt(){
    try {
        return [{
            type: 'output',
            regex: /<p>¦ ?(\d+) ?bpm ?¦<\/p>/ig,
            replace: function(match, p1) {
                try {
                    weylandDebug(`Match: ${match}`);
                    weylandDebug(`p1: ${p1}`);
                    return `<p><div style="display: inline-flex; align-items: center; gap: 8px; background-color: #1a1a1a; padding: 8px 14px; border-radius: 6px; border: 1px solid #ff4444;">
  <span style="color: #ff6b6b; font-size: 1.1em; font-weight: bold; text-shadow: 0 0 4px rgba(255,75,75,0.4);">${p1}bpm</span>
  <span style="color: #ff4444; font-size: 1.3em; animation: heartbeat ${(60/(parseInt(p1))).toFixed(2)}s ease-in-out infinite; display: inline-block;">❤</span>
</div>

<style>
@keyframes heartbeat {
  0% { transform: scale( 1 ); }
  10% { transform: scale( 1 ); }
  30% { transform: scale( 1.3 ); }
  45% { transform: scale( 1 ); }
  65% { transform: scale( 1.3 ); }
  80% { transform: scale( 1 ); }
  100% { transform: scale( 1 ); }
}
</style></p>`
                } catch (e) {
                    console.error(`[${MODULE_NAME}] Error in phoneMarkdownExt extension:`, e);
                    return match;
                }
            }
        }];
    } catch (e) {
        console.error(`[${MODULE_NAME}] Error in phoneMarkdownExt extension:`, e);
        return [];
    }
}

function updateReloadMarkdownProcessor(){
    reloadMarkdownProcessor();
    converter.addExtension(thinkMarkdownExt(), 'weylandThink');
    converter.addExtension(introImagesExt(), 'introImages');
    converter.addExtension(headerV2MarkdownExt(), 'weylandHeader');
    converter.addExtension(headerMarkdownMuseExt(), 'weylandHeaderMuse');
    converter.addExtension(expCloParCodeExt(), 'expCloparCodeExt');
    converter.addExtension(weyBotRelationsExt(), 'weyBotRelationsExt');
    converter.addExtension(singleQuoteExt(), 'singleQuote');
    //converter.addExtension(nonItalicsExt(), 'insideAsterisks');
    converter.addExtension(phoneMarkdownExt(), 'phoneMarkdownExt');
    //converter.addExtension(lonePhoneMarkdownExt(), 'lonePhoneMarkdownExt');
    converter.addExtension(heartRateMarkdownExt(), 'heartRateMarkdown');
    converter.addExtension(fdiglMarkdownExt(), 'fdiglSystemMessage');
    if (settings.markdown) {
        converter.addExtension(hiccupMarkdownExt(), 'hiccup');
    }
}