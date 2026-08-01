import { quickReplyApi } from "../quick-reply/index.js";
import { executeSlashCommandsWithOptions } from "../../slash-commands.js";

import { getGlobalVariable, getLocalVariable } from "../../variables.js";
import { chat, doNewChat, eventSource, event_types } from "../../../script.js";
import { selected_world_info, onWorldInfoChange } from "../../world-info.js";
import { isMobile } from "../../RossAscends-mods.js";
import { setPersonaLockState } from "../../personas.js";
import { updateSideCharacter } from "../Side-Character-Loader/index.js";
import { SlashCommandParser } from "../../slash-commands/SlashCommandParser.js";
import { SlashCommand } from "../../slash-commands/SlashCommand.js";
import { ARGUMENT_TYPE, SlashCommandArgument } from "../../slash-commands/SlashCommandArgument.js";

import { getRandomInt, getCurrentCharacterName, getCurrentUserName, setLLModel, setBackground, tagExists, tagAdd, tagRemove, getPersonaBook, getCurrentCharacterWorldbook, setCostume, setExpression, setCostumeAndExpression, getCharacterCostumeFromText, getCurrentCharacterVersion, getCurrentCharacterPersonality, getCurrentCharacterDescription, getCurrentCharacterFirstMes } from "./src/general.js";
import { deleteGlobalVariable, deleteLocalVariable, deleteLocalVariables, flushInject, inject, setGlobalVariable, setLocalVariable } from "./src/variables.js"
import { findLoreBookEntry, getEntryField, setEntryField } from "./src/lorebook.js";
import { doButtons, doPopup } from "./src/popups.js";
import { closeChat, editSwipe, getFirstMessage, getLastMessage, unhideMessages } from "./src/chat.js";
import strings from "./src/strings.js";
import { scenarios, tails } from "./src/scenarios.js";
import { charPer, specialChar } from "./src/charper.js";
import { ravs } from "./src/rav.js";
import { detector } from "./src/similarity.js";

const debug = true;

/**
 * Debug Logs
 * @param {string} message
 * @param {any} object
 */
function DebugLog(message, object=undefined) {
    if (!debug) return;
    if (object !== undefined) {
        console.log(`[WQR] ${message}`, object);
    } else {
        console.log(`[WQR] ${message}`);
    }
}

// Non-Persistent checks, use sparingly
const checks = {
    skipChatChange: false,
    lastChatID: ""
};

// EVENTS
//#region

async function OnStartup() {
    try {
        DebugLog(`OnStartup called.`);
    } catch (error) {
        console.error(`[WQR] OnStartup Error:`, error);
    }
}

/**
 * @param {{ chat: []; dryRun: Boolean; }} args
 */
async function OnBeforeGeneration(args) {
    try {
        DebugLog(`OnBeforeGeneration called.`);
        await quickReplyApi.executeQuickReply("Weyland","~");
        await quickReplyApi.executeQuickReply("Weyland","ExtCheck");
        if (args.dryRun) return; // Avoid running scripts on dry runs
        // DebugLog(`chat:`, args.chat);
    } catch (error) {
        console.error(`[WQR] OnBeforeGeneration Error:`, error);
    }
}

/**
 * @param {number} messageID
 */
async function OnUser(messageID) {
    try {
        DebugLog(`OnUser called.`);
        // DebugLog(`OnUser chat:`, chat);
        // DebugLog(`OnUser chat message:`, chatMessage);
        // DebugLog(`OnUser messageID`, messageID);

        /** @type {import("./src/chat.js").ChatMessage | undefined} */ const chatMessage = chat[messageID];

        const userText = chatMessage?.mes;
        const userName = chatMessage?.name;

        if (!userName || !chatMessage?.send_date) return;
        
        const currentUserMessID = `${userName}_${messageID}_${chatMessage?.send_date}`
        const newMessage = currentUserMessID !== getLocalVariable("lastUserMessID");

        if (newMessage) {
            if (!userText) return; // Empty message, scripts below this require message contents

            DebugLog(`UserMessageID: ${currentUserMessID} !== ${getLocalVariable("lastUserMessID")}`);

            const characterName = getCurrentCharacterName();

            // Setup Script
            if (getLocalVariable("ScenarioSet") !== "true") {
                let anyFail = false;
                if (getLocalVariable("ravteg") === "") {
                    await AutoStart();
                }

                setLocalVariable("newchatstarted", "true");

                // Scenarios Script
                const scenariosResult = await Scenarios(userText);
                if (scenariosResult !== undefined) anyFail = true;

                if (getLocalVariable("PastRP") === "") {
                    const rosterSBResult = await RosterSB(characterName);
                    if (rosterSBResult !== undefined) anyFail = true;
                    const sterSchoolYearResult = await SetSchoolYear();
                    if (sterSchoolYearResult !== undefined) anyFail = true;
                }
                
                const charPerResult = await CharPer(characterName);
                if (charPerResult !== undefined) anyFail = true;
                
                setLocalVariable("ScenarioSet", "true");
            }

            // Make sure the Weyland lorebook is on
            if (!selected_world_info.includes("Weyland")) {
                onWorldInfoChange({ state: 'on', silent: 'true' }, 'Weyland');
            }

            // Refresh Check
            if (userText.includes("!Refresh")) {
                await SetupCostumesAndTags(characterName);
                await CharPer(characterName);
                await RosterSB(characterName);
                await SetSchoolYear();
            }

            // Weybot
            if (characterName === "Weybot") {
                await Relationships();
            }

            // LTMRav?
            if (getLocalVariable("MIP") !== "true") {
                if (getLocalVariable("LTMRav") === "true") {
                    setLocalVariable("LTMRav", "false");
                    await XXX();
                    onWorldInfoChange({ state: 'on', silent: 'true' }, 'Weyland');
                    if (characterName === "Kris") {
                        setLocalVariable("Krisrav", getLocalVariable("temprav"));
                    }
                    await quickReplyApi.executeQuickReply("Weyland","Framework");
                    await unhideMessages({start: 0, end: messageID+2});
                    const ModelSwitched = getGlobalVariable("ModelSwitched");
                    if (ModelSwitched !== "") {
                        await setLLModel(ModelSwitched);
                        deleteGlobalVariable("ModelSwitched");
                    }
                    if (getLocalVariable("EntryNumber") > 1) {
                        setLocalVariable("LTMDisabler", "false");
                        await quickReplyApi.executeQuickReply("Weyland","LTMDisabler");
                    }
                }
            }

            // MuseFirst
            if (characterName === "Muse" && getGlobalVariable("Muse1st") !== "true") {
                await doPopup({large: true, wide: true}, strings.musF);
                setGlobalVariable("Muse1st", "true");
            }

            setLocalVariable("lastUserMessID", currentUserMessID); // Update lastUserMessID to check if message has changed next call
        } else {
            DebugLog(`UserMessageID: ${currentUserMessID} === ${getLocalVariable("lastUserMessID")}`);
        }

    } catch (error) {
        console.error(`[WQR] OnUser Error:`, error);
    }
    
}

/**
 * @param {number} messageID
 */
async function OnAi(messageID) {
    try {
        DebugLog(`OnAi called.`);
        // DebugLog(`OnAi chat:`, chat);
        // DebugLog(`OnAi chat message:`, chatMessage);
        // DebugLog(`OnAi messageID`, messageID);

        /** @type {import("./src/chat.js").ChatMessage | undefined} */ const chatMessage = chat[messageID];

        const charText = chatMessage?.mes;
        const charName = chatMessage?.name;

        if (!charText || !charName) return; // Empty message or invalid sender, scripts below this require those
 
        const charSwipeID = chatMessage?.swipe_id;

        const currentMessID = `${charName}_${messageID}_${chatMessage?.send_date}_${charSwipeID}`
        const newMessage = currentMessID !== getLocalVariable("lastMessID");

        if (newMessage) {
            DebugLog(`CharMessageID: ${currentMessID} !== ${getLocalVariable("lastMessID")}`);
            
            // Set Analysis for Prompt Type based on RUBY
            if (/[\(\[]RUBY[\]\)]/.test(charText)) {
                setLocalVariable("AnalysisLayer", strings.RubyAnalysis);
            } else {
                setLocalVariable("AnalysisLayer", strings.NorAnalysis);
            }

            // AngelDevil Script
            AngelDevil();

            // CostumeChangeforBot Script
            CostumeChangeBot(chatMessage, charName);

            // AutoBG Script
            AutoBG(chatMessage);

            // Cleanup ContextTimer
            if (getLocalVariable("ConstantContext") !== "" && messageID >= getLocalVariable("ContextTimer")) {
                deleteLocalVariable("ContextTimer");
            }

            // Set AZERTY
            if (getRandomInt(1, 4) === 4) {
                setLocalVariable("AZERTY", `- Chance to send jumbled messages without realizing when forgetting to switch keyboard layouts after gaming sessions (e.g., "Qhere is ,y qrt?" instead of "Where is my art?") (never realizes slipup in same message; never fixes keyboard in the same message; apologizes ONLY in a new keyboard-fixed message)`);
            } else {
                deleteLocalVariable("AZERTY");
            }

            // Set Random Drama
            switch(getRandomInt(1, 11)) {
                case 1:
                default:
                    setLocalVariable("ChosenDrama", "Unexpected good news");
                    break;
                case 2:
                    setLocalVariable("ChosenDrama", "Invitations to exclusive events");
                    break;
                case 3:
                    setLocalVariable("ChosenDrama", "Spontaneous road trips");
                    break;
                case 4:
                    setLocalVariable("ChosenDrama", "Exciting campus event");
                    break;
                case 5:
                    setLocalVariable("ChosenDrama", "Urgent texts from exes or family");
                    break;
                case 6:
                    setLocalVariable("ChosenDrama", "Friends needing serious help");
                    break;
                case 7:
                    setLocalVariable("ChosenDrama", "Revealed secrets or confessions");
                    break;
                case 8:
                    setLocalVariable("ChosenDrama", "Rival situations");
                    break;
                case 9:
                    setLocalVariable("ChosenDrama", "Emergency situations");
                    break;
                case 10:
                    setLocalVariable("ChosenDrama", "Unexpected visitors");
                    break;
                case 11:
                    setLocalVariable("ChosenDrama", "Suspicious activities");
                    break;
            }

            // Flush Aethel
            if (charName === "Aethel") {
                if (getLocalVariable("N3k0Flush") === "") {
                    setLocalVariable("N3k0Flush", 0);
                }
                if (!chatMessage.mes.includes("✧･ﾟ")) {
                    if (getLocalVariable("N3k0Flush") === 2) {
                        flushInject("N3k0")
                    } else {
                        setLocalVariable("N3k0Flush", getLocalVariable("N3k0Flush")+1);
                    }
                } else {
                    setLocalVariable("N3k0Flush", 0);
                }
            }

            // Set DieRoll
            if (chatMessage.mes.includes(":__")) {
                setLocalVariable("DieRoll", getRandomInt(6, 16));
            } else {
                setLocalVariable("DieRoll", getRandomInt(3, 8));
            }

            await Clear();

            setLocalVariable("lastMessID", currentMessID); // Update lastMessID to check if message has changed next call
        }
    } catch (error) {
        console.error(`[WQR] OnAI Error:`, error);
    }
}

/**
 * @param {number} messageID
 */
async function OnSwipe(messageID) {
    try {
        DebugLog(`OnSwipe called.`);
        const charMessage = chat[messageID];

        const charName = charMessage?.name;
        const newSwipe = charMessage?.swipe_id === undefined || !Array.isArray(charMessage?.swipes) ? true : charMessage.swipe_id >= charMessage.swipes.length

        if (charName && !newSwipe) {
            if (charName === "Cerberus Sisters" && messageID === 0 && charMessage.swipe_id < 4) {
                setLocalVariable("CerberusSister", ["Fawne", "Neshe", "Astrid"][charMessage.swipe_id])
            }
            await CostumeChangeBot(charMessage);
            await AutoBG(charMessage);
        }
    } catch (error) {
        console.error(`[WQR] OnSwipe Error:`, error);
    }
}

/**
 * @param {string} chatbookName 
 */
async function OnChatChanged(chatbookName) {
    try {
        DebugLog(`OnChatChanged called.`);
        DebugLog(`Chatbook: `, chatbookName);
        if (checks.skipChatChange) {
            checks.skipChatChange = false;
            return;
        }
        const charName = chatbookName?.split(" ")?.[0]?.trim() || getCurrentCharacterName();
        await quickReplyApi.executeQuickReply("Weyland","~");
        await quickReplyApi.executeQuickReply("Weyland","ExtCheck");
        if (checks.lastChatID !== chatbookName) {
            await quickReplyApi.executeQuickReply("Weyland", "Descr");
            await quickReplyApi.executeQuickReply("Weyland", "PP&PPPLimiters");
            if (chat.length === 1) {
                if (!chat[0]?.swipe_id) {
                    switch (charName) {
                        case "Rosa":
                            setLocalVariable("CostmSave", "Rosa/Intro");
                            await setCostume("Rosa/Intro");
                            break;
                        case "Mirror Weyland":
                        case "Weybot":
                            if (chat[0]?.mes !== getCurrentCharacterFirstMes()) break;
                            await AutoStart();
                            break;
                    }
                }
            }
            // TitleBarColors Script
            await TitleBarColors();
            checks.lastChatID = chatbookName;
        }
    } catch (error) {
        console.error(`[WQR] OnChatChanged Error:`, error);
    }
}

/**
 * @param {any} args 
 */
async function OnNewChat(args) {
    // This is called when a person creates a chat without deleting the previous one
    try {
        DebugLog(`OnNewChat called.`);

        if (getGlobalVariable("AltGreetingMessage") !== "true") {
            doPopup({wide: true}, `<font size="5"><strong>Did you know this tip?</strong></font><br><br>You can access alternate greetings for Lucky's characters by starting a new chat and clicking on the left or right arrows at the bottom of the opening message!<br>You can also press the left or right arrows to shift between them freely.<br><br>We hope you're enjoying your stay here at Weyland University!</a>`);
            setGlobalVariable("AltGreetingMessage", "true");
        }
    } catch (error) {
        console.error(`[WQR] OnNewChat Error:`, error);
    }
}
//#endregion

// SCRIPTS
//#region
/**
 * @param {string} [charName]
 */
async function AutoStart(charName) {
    const PerformanceStart = performance.now();
    try {
        const charVer = getCurrentCharacterVersion();
        if (!charVer) throw new Error("No character version");
        const qrVer = getGlobalVariable("QRVersion");
        if ((typeof qrVer === 'string' ? parseInt(qrVer) : qrVer) >= charVer) {
            if (getLocalVariable("Run") === "true") return;
            charName = charName || getCurrentCharacterName();
            if (!charName) return;
            const isMirrorWeyland = charName === "Mirror Weyland";
            if (isMirrorWeyland) setLocalVariable("MirrorBegun", "");
            setLocalVariable("Run", "true");
            setLocalVariable("StartingYear", "false");
            setLocalVariable("ExpHid", "true");
            setLocalVariable("LocalNarrator", getGlobalVariable("Narrator"));
            setLocalVariable("PhoneCom", isMirrorWeyland ? getGlobalVariable("CommandPhone") : getGlobalVariable("PhoneCommand"));
            if (charName === "Weybot") {
                await quickReplyApi.executeQuickReply("Weyland", "WeybotStart");
            }
            if (fCheck() && charName === "Kressa") {
                await setCostume("Kressa/Lounge");
            }
            if (!/Kinsbane Manor|Weybot|Kressa/.test(charName) && getLocalVariable("POVType") === "1st") {
                setGlobalVariable("MessageModeSet", "true");
                inject({id: "MM", position: "chat", depth: "0"}, strings.firstpov);
            }
            if (getCurrentCharacterWorldbook() === "Weyland Characters") {
                switch (charName) {
                    case "Aiko": {
                        const OutfitCodesUID = await findLoreBookEntry("Aiko's Manor", "comment", `Aiko Outfit Codes`);
                        const content = await getEntryField("Aiko's Manor", OutfitCodesUID);
                        setLocalVariable("ClothingCodeP", content);
                        break;
                    }
                    case "Muse": {
                        const OutfitCodesUID = await findLoreBookEntry("Muse Experiment", "comment", `Muse Outfit Codes`);
                        const content = await getEntryField("Muse Experiment", OutfitCodesUID);
                        setLocalVariable("ClothingCodeP", content);
                        break;
                    }
                    default:
                        setLocalVariable("ClothingCodeP", "===");
                        break;
                }
            }
            setLocalVariable("ravgte", strings.ravgte);
            setLocalVariable("OrderNumber", "1000");
            if (!getGlobalVariable("LTMHowMany")) setGlobalVariable("LTMHowMany", "10");
            if (!getGlobalVariable("LTMMessages")) setGlobalVariable("LTMMessages", "50");
            if (!getGlobalVariable("LTMTokens")) setGlobalVariable("LTMTokens", "300");
            setLocalVariable("NewGroup", charName);
            setLocalVariable("AddChar", charName);
            setLocalVariable("GroupWarning", "0");
            setLocalVariable("Warning", strings.warning);
            await quickReplyApi.executeQuickReply("Weyland", "Descr");
            await XXX();
            setLocalVariable("PostRavMem", getLocalVariable("postrav"));
            setLocalVariable("PostRavCount", "0");
            if (isMirrorWeyland) {
                await quickReplyApi.executeQuickReply("WeylandUni", "MirrorStart");
            }
            AutoCostumes(charName);
            if (/Kinsbane Manor|Muse|Aethel|Kressa/.test(charName)) {
                await SpecialChar(charName);
            }
        }
        DebugLog(`[P] AutoStart: ${(performance.now() - PerformanceStart).toFixed(4)}ms`);
    } catch (error) {
        console.error(`[WQR] AutoStart Error:`, error);
        if (fCheck()) {
            toastr.info(`Character Crashing. Update WTVersion.`);
        } else {
            toastr.info(`You need to update your WeylandTavern version to use this character.`);
            closeChat();
        }
    }
}

/**
 * TitleBarColors Script
 * OnChatChanged
 * @returns {Promise<string | undefined>}
 */
async function TitleBarColors() {
    const PerformanceStart = performance.now();
    try {
        const charName = getCurrentCharacterName();
        if (!charName) return "{{char}} undefined"
        const charBookWC = getCurrentCharacterWorldbook() === "Weyland Characters";
        if (/Lurkle|Weybot|Indigo/.test(charName)) {
            if (getGlobalVariable(`RegexOn${charName}`) === "") {
                setGlobalVariable(`RegexOn${charName}`, "true");
                await executeSlashCommandsWithOptions('/regex-toggle state=on quiet=true Assistant');
            }
        }
        const scenarioUID = await findLoreBookEntry("Weyland Characters", "automationId", "Scenario");
        await setEntryField({file: "Weyland Characters", uid: scenarioUID, field: "key"}, getLocalVariable("CharKeys"));
        setLocalVariable("JennLucyRoom", getLocalVariable("EarlyStart") === "true" ? strings.LSRoom : strings.JLRoom);
        //Happens if Chat Has already Setup
        if (getLocalVariable("Run") === "true") {
            let clothingCodeP = "===";
            if (charBookWC) {
                const OutfitCodesUID = await findLoreBookEntry("Weyland Characters", "comment", `${charName} Outfit Codes`);
                const content = await getEntryField("Weyland Characters", OutfitCodesUID);
                if (content) clothingCodeP = content;
            } else {
                switch (charName) {
                    case "Aiko": {
                        const OutfitCodesUID = await findLoreBookEntry("Aiko's Manor", "comment", `Aiko Outfit Codes`);
                        const content = await getEntryField("Aiko's Manor", OutfitCodesUID);
                        if (content) clothingCodeP = content;
                        break;
                    }
                    case "Muse": {
                        const OutfitCodesUID = await findLoreBookEntry("Muse Experiment", "comment", `Muse Outfit Codes`);
                        const content = await getEntryField("Muse Experiment", OutfitCodesUID);
                        if (content) clothingCodeP = content;
                        break;
                    }
                }
            }
            setLocalVariable("ClothingCodeP", clothingCodeP);
            if (getLocalVariable("AnalysisLayer") === "") {
                setLocalVariable("AnalysisLayer", strings.NorAnalysis);
            }
            if (getLocalVariable("LocalN") === "") {
                setLocalVariable("LocalNarrator", getGlobalVariable("Narrator"));
                
            }
            await XXX();
        }
        const costumeSave = getLocalVariable("CostmSave").split("/");
        if (costumeSave?.length > 1) {
            await setCostumeAndExpression(costumeSave[0], costumeSave[1]);
            const costumeSaveSide = getLocalVariable("CostmSaveSide");
            if (costumeSaveSide) {
                const expSave = getLocalVariable("ExpSave");
                if (!expSave) await Expressions(undefined, undefined, true);
                await setExpression(getLocalVariable("ExpSave"));
                await updateSideCharacter({character: costumeSaveSide});
            }
        } else {
            await CostumeChangeBot(undefined, undefined);
        }
        if (getGlobalVariable("AutoBG") !== "false") {
            const bg = getLocalVariable("BGFound");
            if (!bg) {
                await AutoBG();
            } else {
                setBackground(bg);
            }
        }
        if (charName === "Kinsbane Manor" && getLocalVariable("KinsbaneFort") === "") {
            await quickReplyApi.executeQuickReply("Weyland","History");
        }
        if (chat.length === 1) {
            const newChatCheck = document.querySelector(`[data-i18n="[title]Chat Lore Alt+Click to open the lorebook"]`)?.['className'];
            if (newChatCheck === "chat_lorebook_button menu_button fa-solid fa-passport interactable world_set") {
                await doNewChat({ deleteCurrentChat: false });
            }
        }
        if (charName === "Mirror Weyland") {
            setLocalVariable("PhoneCom", getGlobalVariable("CommandPhone"));
            if (getLocalVariable("MirrorBegun") === "") {
                setLocalVariable("MirrorBegun", "true");
                await AutoStart();
            } else {
                if (getLocalVariable("ConstantScenario") === "") {
                    await Scenarios();
                }
            }
        } else {
            setLocalVariable("PhoneCom", getGlobalVariable("PhoneCommand"));
        }
        DebugLog(`[P] TitleBarColors: ${(performance.now() - PerformanceStart).toFixed(4)}ms`);
    } catch (err) {
        console.error(`[WQR] TitleBarColors Error:`, err);
        return `Error`;
    }
}

/**
 * Expressions Script
 * OnChatChanged & OnSwipe
 * @param {string} [charName]
 * @param {import("./src/chat.js").ChatMessage} [charMessage]
 * @param {boolean} [disableSetting]
 */
async function Expressions(charName, charMessage, disableSetting=false) {
    const PerformanceStart = performance.now();
    try {
        if (charMessage === undefined) charMessage = getLastMessage("char");
        if (charMessage === undefined) {
            DebugLog("[E] Expressions: charMessage missing");
            return "charMessage missing"
        }
        if (!charName) charName = getCurrentCharacterName();
        if (!charName) {
            DebugLog("[E] Expressions: {{char}} undefined");
            return "{{char}} undefined"
        }
        const expressions = [
            "admiration", "amusement", "anger", "annoyance", "approval",
            "caring", "confusion", "curiosity",
            "desire", "disappointment", "disapproval", "disgust",
            "embarrassment", "excitement",
            "fear",
            "gratitude", "grief",
            "joy",
            "love", 
            "nervousness", "neutral",
            "optimism",
            "pride",
            "realization", "relief", "remorse",
            "sadness", "surprise"
        ];
        const expressionMatches = charMessage.mes.match(/(?<=\[)[a-zA-Z]+(?=\])/g)?.reverse().map(exp => exp.toLowerCase());
        if (expressionMatches !== undefined) {
            for (const expression of expressionMatches) {
                if (expressions.includes(expression)) {
                    DebugLog(`Expressions: Found: ${expression}`);
                    setLocalVariable("ExpSave", expression);
                    if (!disableSetting) { 
                        await setExpression(expression)
                    }
                    break;
                }
            }
        } else if (!getLocalVariable("ExpSave")) {
            DebugLog(`Expressions: No last expression`);
            setLocalVariable("ExpSave", "neutral");
            if (!disableSetting) {
                await setExpression("neutral");
            }
        }
        DebugLog(`[P] Expressions: ${(performance.now() - PerformanceStart).toFixed(4)}ms`)
    } catch (err) {
        console.error(`[WQR] Expressions Error:`, err);
        return `Error`;
    }
}

/**
 * SideCharacters Script
 * OnChatChanged & OnSwipe
 * @param {string} [charName]
 * @param {import("./src/chat.js").ChatMessage} [charMessage]
 */
async function SideCharacters(charName, charMessage) {
    const PerformanceStart = performance.now();
    try {
        if (isMobile() && getLocalVariable("CostmSaveSide") !== "") {
            setLocalVariable("CostmSaveSide", "");
            updateSideCharacter({clear: 'true'});
            DebugLog(`SideCharacters: Cleared side-character from mobile browser.`);
        }
        if (isMobile() || getGlobalVariable("AutoCostume") === "No") return "Aborted";
        if (charMessage === undefined) charMessage = getLastMessage("char");
        if (charMessage === undefined) return "charMessage missing";
        if (!charName) charName = getCurrentCharacterName();
        if (!charName) return "{{char}} undefined";

        const {charactersWithExpressions, characterGroupsWithExpressions, aliasLookup} = await GetCharacterNamesAndAliases();

        const foundCharacters = [...new Set(
            [...charMessage.mes.matchAll(/_{0,2}(?:Mirror )?(.+?):_{1,2}/g)]
                .map(m => aliasLookup.get(m[1]) ?? m[1])
                .filter(name => charactersWithExpressions.includes(name))
            )];
            
        const group = characterGroupsWithExpressions.find(g =>
            g.output === charName || g.display === charName
        );

        const excluded = new Set(group ? group.members : [charName]);

        const availableCharacters = foundCharacters.filter(name => !excluded.has(name));

        if (!availableCharacters.length) {
            DebugLog(`SideCharacters: No valid side-character found.`);
            if (getLocalVariable("CostmSaveSide") !== "") {
                setLocalVariable("CostmSaveSide", "");
                updateSideCharacter({clear: 'true'});
                DebugLog(`SideCharacters: Cleared side-character.`);
            }
            return;
        }

        DebugLog(`SideCharacters: Discovered: ${availableCharacters.length}`);

        const pickedChar = availableCharacters.length > 1 ? availableCharacters[Math.floor(Math.random() * availableCharacters.length)] : availableCharacters[0];
        const costume = getCharacterCostumeFromText(charMessage.mes, pickedChar, false);
        const spriteFolder = `${pickedChar}/${costume}`;

        DebugLog(`SideCharacters: Picked "${pickedChar}"`);

        if (getLocalVariable("CostmSaveSide") !== spriteFolder) {
            setLocalVariable("CostmSaveSide", spriteFolder);
            updateSideCharacter({character: spriteFolder, expression: getLocalVariable("ExpSave")}).then(result => {
            if (result) DebugLog(`SideCharacters: Update:`, result);
            }).catch(err => {
                console.error(`[WQR] SideCharacters Error:`, err);
            });
        }
        DebugLog(`[P] SideCharacters: ${(performance.now() - PerformanceStart).toFixed(4)}ms`)
    } catch (err) {
        console.error(`[WQR] SideCharacters Error:`, err);
        return `Error`;
    }
}

/**
 * AutoBG Script
 * OnChatChanged, OnSwipe & OnAI
 * @param {import("./src/chat.js").ChatMessage} [charMessage]
 * @returns {Promise<string | undefined>}
 */
async function AutoBG(charMessage) {
    const PerformanceStart = performance.now();
    try {
        if (!charMessage) charMessage = getLastMessage("char");
        if (!charMessage) return "No char message to extract BG from";
        if (getGlobalVariable("AutoBG") !== "false") {
            if (getLocalVariable("PhoneBG") !== "true") {
                BG(charMessage.mes, charMessage.name).then(() => {
                    DebugLog(`[P] AutoBG: BG: ${(performance.now()-PerformanceStart).toFixed(4)}ms`);
                }).catch(() => {});
            } else {
                setLocalVariable("PhoneBG", "false");
            }
        }
    } catch (err) {
        console.error(`[WQR] AutoBG Error:`, err);
        return `Error`
    }
}

/**
 * Scenarios Script
 * OnChatChanged & OnUser
 * @param {string} [userMessage]
 * @returns {Promise<string | undefined>}
 */
async function Scenarios(userMessage) {
    if (!userMessage) userMessage = getLastMessage("user")?.mes;
    if (!userMessage || getLocalVariable("newchatstarted") === "") return "Aborted";
    const PerformanceStart = performance.now();
    let waitDeduction = 0;
    try {
        if (userMessage.includes("[Early Start]")) {
            toastr.info(`Early Start Activated`);
            setLocalVariable("EarlyStart", "true");
        }
        if (userMessage.includes("[New Roommate]")) {
            toastr.info(`New Roommate Acquired`);
            setLocalVariable("DumpingBlake", "true");
        }

        const greeting = getFirstMessage("char");
        const greetingText = greeting?.mes;
        const greetingSwipe = greeting?.swipe_id;

        if (!greetingText || greetingSwipe === undefined) {
            console.error(`[WQR] Missing greeting.`);
            return "Missing greeting"
        }

        if (/Following your character information and personality as a basis/.test(greetingText)) {
            inject({id: "ooc", ephemeral: "true", role: "user", depth: "0", position: "chat"}, strings.oocI);
        }

        const charName = getCurrentCharacterName();

        // Tails
        if (greetingText.includes("Tavern Tails")) {
            try {
                for (const [comparison, tailGreeting] of tails) {
                    if (tailGreeting && greetingText.includes(comparison)) {
                        const keys = Object.keys(tailGreeting);
                        if (keys.length) {
                            const lastKey = keys[keys.length-1];
                            for (const key of keys) {
                                setLocalVariable(key, tailGreeting[key], key !== lastKey)
                                if (key === "CharKeys") {
                                    const scenarioID = await findLoreBookEntry("Weyland Characters", "automationId", "Scenario");
                                    await setEntryField({file: "Weyland Characters", uid: scenarioID, field: "key"}, tailGreeting[key]);
                                }
                            }
                        }
                        if (comparison === "Greeting message straight from Kowloon" && getPersonaBook() === "Walled City") {
                            await setPersonaLockState(true, "chat");
                        }
                        break;
                    }
                }
            } catch (error) {
                console.error(`[WQR] Scenarios Error: Failed to set tail greeting for "${charName}"`, error);
            }
        }
        // Regular
        else {
            // Do Special Setup
            const SpecialSetupTime = performance.now();
            switch (charName) {
                case "Loona": {
                    if (greetingSwipe === 0) {
                        const result = await doButtons({labels: `["Dismissed Him - Kinda Drunk","Nearly Hooked Up - Kinda Drunk","Dismissed Him - Turbo Drunk","Nearly Hooked Up - Turbo Drunk"]`}, strings.redC);
                        const choice = result ? result : "Dismissed Him - Turbo Drunk";
                        const dismissed = choice.includes("Dismissed");
                        const turbo = choice.includes("Turbo");
                        if (turbo) {
                            setLocalVariable("DrunkCoach", strings.redT);
                        }
                        setLocalVariable("ConstantScenario", dismissed ? strings.redD : strings.redH);
                    }
                    break;
                }
                case "Willow": {
                    if (getLocalVariable("WeepingWillow") === "") {
                        const result = await doPopup({result: true, okButton: "Expressive", cancelButton: "Normal"}, `Would you like Willow in her base or expressive version?<br><br>
Base Willow<br>
- Red, unnerving dotted eyes. Eyes do not change shape.<br><br>
Expressive Willow <br>
- Red eyes that change shape depending on Willow's mood.`);
                        setLocalVariable("WeepingWillow", result === "1" ? "true" : "false");
                    }
                    break;
                }
                case "Kris": {
                    const result = await doPopup({result: true, okButton: "Hard Mode", cancelButton: "Standard"}, `Standard Kris and Hard Mode Kris contain functionally the same bot.
However, Hard Mode Kris essentially has a voice in his head demanding he not hold back, and be more of an asshole.<br><br>
This is our sort of rough approach of forcing down the LLM Niceness barrier with the current generation of models.`);
                    setLocalVariable("Krisrav", result === "1" ? strings.krirav : getLocalVariable("postrav"));
                    break;
                }
            }
            waitDeduction = performance.now()-SpecialSetupTime;

            // Do Regular Setup
            const charScenarios = scenarios.get(charName);
            if (charScenarios === undefined) {
                console.error(`[WQR] Scenarios Error: Scenarios for "${charName}" not found.`);
                return;
            }

            await SetupCostumesAndTags(charName, charScenarios);

            if (charScenarios.specialVars !== undefined) {
                try {
                    const keys = Object.keys(charScenarios.specialVars);
                    if (keys.length) {
                        const lastKey = keys[keys.length-1];
                        for (const key of keys) {
                            setLocalVariable(key, charScenarios.specialVars[key], key !== lastKey)
                        }
                    }
                } catch {
                    console.error(`[WQR] Scenarios Error: Failed to set special vars for "${charName}"`, charScenarios.specialVars);
                }
            }

            if (charScenarios.greetings !== undefined && charScenarios.greetings.length) {
                try {
                    const greetingObj = charScenarios.greetings[greetingSwipe];
                    if (greetingObj !== undefined) {
                        const keys = Object.keys(greetingObj);
                        if (keys.length) {
                            const lastKey = keys[keys.length-1];
                            for (const key of keys) {
                                setLocalVariable(key, greetingObj[key], key !== lastKey)
                                if (key === "CharKeys") {
                                    const scenarioID = await findLoreBookEntry("Weyland Characters", "automationId", "Scenario");
                                    await setEntryField({file: "Weyland Characters", uid: scenarioID, field: "key"}, greetingObj[key]);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error(`[WQR] Scenarios Error: Failed to set greeting vars for "${charName}"`, error);
                }
            }
        } 
        
        setLocalVariable("AnalysisLayer", strings.NorAnalysis);

        if (getLocalVariable("SpecialThoughts") === "true" || charName === "Vera") {
            await XXX();
        }

        DebugLog(`[P] Scenario: ${(performance.now() - (PerformanceStart-waitDeduction)).toFixed(4)}ms`);
    } catch (error) {
        console.error(`[WQR] Scenarios Error:`, error);
    }
}

/**
 * RosterSB Script
 * OnUser
 * @param {string} [charName] 
 * @returns {Promise<string | undefined>}
 * */
async function RosterSB(charName) {
    if (!charName) charName = getCurrentCharacterName();
    const PerformanceStart = performance.now();
    try {
        const dumpingBlake = getLocalVariable("DumpingBlake") === "true";
        let earlyStart = getLocalVariable("EarlyStart") === "true";
        const mcyIsFreshman = getLocalVariable("MCY") === "Freshman";
        const startingMonth = getLocalVariable("StartingMonth");

        if (charName === "Mirror Weyland") {
            await quickReplyApi.executeQuickReply("WeylandUni", "Mirror");
            return;
        }
        setLocalVariable("WeylandSetting", strings.rsbWeyS, true);
        if (charName === "Weybot") {
            if (getLocalVariable("StartingYear") === "Freshman") {
                if (startingMonth === "July") {
                    setLocalVariable("EarlyStart", "true", true);
                    earlyStart = true;
                }
                if (startingMonth === "August") {
                    setLocalVariable("EarlyStart", "true", true);
                    earlyStart = true;
                }
            }
        }
        if (earlyStart) {
            setLocalVariable("NewSchool", strings.rsbNewSchool, true);
            setLocalVariable("NewPhone", "- {{user}} is very new to Weyland University, and does not know most characters yet. DO NOT use Named NPC's for messages unless {{user}} has met them during this roleplay session.", true);
            setLocalVariable("JennRoomSit", `Unassigned: Jenn
Room 268: Lucy (solo)`, true);
        } else {
            setLocalVariable("JennRoomSit", "Room 268: Lucy & Jenn", true);
        }
        if (!mcyIsFreshman) {
            setLocalVariable("FreshRoom", `Room 290: Bianca (solo)
Room 311: Karmen & NPC
Room 376: Lentyl & NPC
Room 109: Ellie & NPC
Room 315: Rosa & NPC
Room 313: Sofya & NPC`, true);
        } else {
            setLocalVariable("FreshRoom", "Room 290: Bianca & Herra", true);
        }
        if (dumpingBlake) {
            setLocalVariable("BlakeRoommateSit", "Room 271: Blake & NPC", true);
        } else {
            setLocalVariable("BlakeRoommateSit", "Room 271: Blake & {{user}}", true);
        }
        setLocalVariable("Roommates", strings.rsbRoommates, true);
        setLocalVariable("R268", earlyStart ? "looking for new dorm" : "room 268", true);
        setLocalVariable("RT", strings.rsbRT, true);
        setLocalVariable("WTavern", strings.rsbWTavern, true);
        setLocalVariable("KinsbaneLoc", "[KINSBANE MANOR] Potential Location: The Kinsbane Manor\nOnce-grand Victorian mansion that now stands as a testament to neglect and time's relentless march. The manor has long since been abandoned, though rumors surround the place of it possibly being haunted. Most will not approach the mansion unless on a dare. Aiko lives here alone. [END KINSBANE MANOR]\n-----", true);
        if (fCheck()) {
            setLocalVariable("crush", "Has a crush on {{user}}.", true);
        }
        if (dumpingBlake) {
            setLocalVariable("BlakeRoom", strings.rsbBlakeRoom, true);
        } else {
            setLocalVariable("BlakeRoom", strings.rsbBlakeRoomB, true);
        }
        setLocalVariable("AI", strings.rsbAI, true);
        setLocalVariable("AV", strings.rsbAV, true);
        setLocalVariable("BP", strings.rsbBP, true);
        setLocalVariable("BE", strings.rsbBE, true);
        setLocalVariable("BI", strings.rsbBI, true);
        if (!mcyIsFreshman) {
            setLocalVariable("BlakeSit", "Blake is good friends and trusting of {{user}} and Mika, but still is bratty and coarse towards them. Blake is highly protective of her little sister Serra and those she considers her own.", true);
        } else {
            if (earlyStart) {
                setLocalVariable("BlakeSit", strings.rsbBlakeSit, true);
            } else {
                setLocalVariable("BlakeSit", strings.rsbBlakeSitB, true);
            }
        }
        if (dumpingBlake) {
            setLocalVariable("BlakeInfoSit", "Blake Fuyuki is in room 271", true);
        } else {
            setLocalVariable("BlakeInfoSit", "Blake Fuyuki is {{user}}'s roommate in room 271", true);
        }
        setLocalVariable("BL", strings.rsbBL, true);
        setLocalVariable("CA", strings.rsbCA, true);
        setLocalVariable("EL", strings.rsbEL, true);
        setLocalVariable("FA", strings.rsbFA, true);
        setLocalVariable("GE", strings.rsbGE, true);
        setLocalVariable("HA", strings.rsbHA, true);
        if (!mcyIsFreshman) {
            setLocalVariable("IN", strings.rsbIN, true);
        } else {
            setLocalVariable("IN", strings.rsbINB, true);
        }
        if (earlyStart) {
            setLocalVariable("JennSit", "Jenn was originally supposed to be a racist catboy's (Kris) roommate, but has been kicked out, and is now working with {{user}} to find a new roommate to take her in.", true);
        } else {
            setLocalVariable("JennSit", strings.rsbJennSit, true);
        }
        setLocalVariable("JE", strings.rsbJE, true);
        setLocalVariable("KA", strings.rsbKA, true);
        if (fCheck()) {
            setLocalVariable("KarmenSuc", strings.rsbKarmenSuc, true);
        }
        setLocalVariable("KM", strings.rsbKM, true);
        setLocalVariable("KI", strings.rsbKI, true);
        if (!mcyIsFreshman) {
            setLocalVariable("KrisSit", `He was Jenn's potential roommate in room 276, but kicked her out. Hates canines and humans.
Dated Nix during Freshman year, but got dumped early on.`, true);
        } else {
            if (earlyStart) {
                setLocalVariable("KrisSit", "He was Jenn's roommate in room 276, but kicked her out. Hates canines and humans. He is currently dating Nix.", true);
            } else {
                setLocalVariable("KrisSit", `He was Jenn's potential roommate in room 276, but kicked her out. Hates canines and humans.
Dated Nix at start of Freshman, but ended getting dumped.`, true);
            }
        }
        setLocalVariable("KR", strings.rsbKR, true);
        setLocalVariable("LE", strings.rsbLE, true);
        if (earlyStart) {
            setLocalVariable("LucySit", "Does not yet have a rooommate. Extremely shy and reclusive.", true);
        } else {
            setLocalVariable("LucySit", "Jenn's roommate.", true);
        }
        setLocalVariable("LU", strings.rsbLU, true);
        setLocalVariable("LN", strings.rsbLN, true);
        setLocalVariable("LK", strings.rsbLK, true);
        setLocalVariable("LY", strings.rsbLY, true);
        setLocalVariable("VS", strings.rsbVS, true);
        if (dumpingBlake) {
            setLocalVariable("BlakeMikaSit", "a wolfgirl", true);
        } else {
            setLocalVariable("BlakeMikaSit", "a wolfgirl that shares a room with {{user}}", true);
        }
        setLocalVariable("MK", strings.rsbMK, true);
        if (earlyStart) {
            setLocalVariable("NixSit", "Currently dating Kris. Nix has been Kris' girlfriend for over a year despite how he stands her up on dates and uses her.", true);
        } else {
            setLocalVariable("NixSit", strings.rsbNixSit, true);
        }
        setLocalVariable("NX", strings.rsbNX, true);
        setLocalVariable("RE", strings.rsbRE, true);
        setLocalVariable("SE", strings.rsbSE, true);
        setLocalVariable("ST", strings.rsbST, true);
        setLocalVariable("SU", strings.rsbSU, true);
        setLocalVariable("VR", strings.rsbVR, true);
        setLocalVariable("VI", strings.rsbVI, true);
        setLocalVariable("WA", strings.rsbWA, true);
        setLocalVariable("JR", strings.rsbJR, true);
        if (!mcyIsFreshman) {
            setLocalVariable("NathanSit", strings.rsbNathanSit, true);
        } else {
            if (earlyStart) {
                setLocalVariable("NathanSit", "He is trying to win Blake over and convince her to go out with him. Blake will not give much resistance if approached by Nathan. He doesn't recognize {{user}}.", true);
            } else {
                setLocalVariable("NathanSit", strings.rsbNathanSitB, true);
            }
        }
        setLocalVariable("NA", strings.rsbNA, true);
        setLocalVariable("RI", strings.rsbRI, true);
        setLocalVariable("DE", strings.rsbDE, true);
        setLocalVariable("SY", strings.rsbSY, true);
        setLocalVariable("MA", strings.rsbMA, true);
        setLocalVariable("GN", strings.rsbGN, true);
        setLocalVariable("TM", strings.rsbTM, true);
        setLocalVariable("RV", strings.rsbRV, true);
        setLocalVariable("KL", strings.rsbKL, true);
        setLocalVariable("KO", strings.rsbKO, true);
        setLocalVariable("AE", "not yet made", true);
        setLocalVariable("NR", "not yet made", true);
        setLocalVariable("WW", strings.rsbWW, true);
        setLocalVariable("DT", strings.rsbDT, true);
        setLocalVariable("TRN", strings.rsbTRN, true);
        setLocalVariable("LEO", strings.rsbLEO, true);
        setLocalVariable("EV", strings.rsbEV, true);
        setLocalVariable("RS", strings.rsbRS, true);
        setLocalVariable("BR", strings.rsbBR, true);
        setLocalVariable("NS", strings.rsbNS, true);
        setLocalVariable("AD", strings.rsbAD, true);
        setLocalVariable("FW", strings.rsbFW, true);
        setLocalVariable("AN", strings.rsbAN, true);
        setLocalVariable("MS", strings.rsbMS, true);
        setLocalVariable("TV", strings.rsbTV, true);
        setLocalVariable("GT", strings.rsbGT, true);
        setLocalVariable("RD", strings.rsbRD, true);
        setLocalVariable("MG", strings.rsbMG, true);
        setLocalVariable("DH", strings.rsbDH, true);
        setLocalVariable("NEVEND", strings.rsbNEVEND, true);
        setLocalVariable("MUSER", strings.rsbMUSER, true);
        setLocalVariable("SN", strings.rsbSN, true);
        setLocalVariable("OV", strings.rsbOV, true);
        setLocalVariable("NV", strings.rsbNV, true);
        setLocalVariable("YD", strings.rsbYD, true);
        setLocalVariable("BT", strings.rsbBT, true);
        setLocalVariable("AH", strings.rsbAH, true);
        setLocalVariable("MU", strings.rsbMU, true);
        setLocalVariable("MAa", strings.rsbMAa, true);
        setLocalVariable("DEd", strings.rsbDEd, true);
        setLocalVariable("EAd", strings.rsbEAd, true);
        setLocalVariable("RY", strings.rsbRY, true);
        setLocalVariable("NF", strings.rsbNF, true);
        setLocalVariable("SK", strings.rsbSK, true);
        setLocalVariable("KP", strings.rsbKP, true);
        setLocalVariable("SI", strings.rsbSI, true);
        setLocalVariable("YL", strings.rsbYL, true);
        setLocalVariable("TESS", strings.rsbTESS, true);
        setLocalVariable("VEN", strings.rsbVEN, true);
        setLocalVariable("BENBOT", strings.rsbBENBOT, true);
        setLocalVariable("LEX", strings.rsbLEX, true);
        setLocalVariable("HIRO", strings.rsbHIRO, true);
        setLocalVariable("CADE", strings.rsbCADE, true);
        setLocalVariable("VESN", strings.rsbVESN, true);
        setLocalVariable("BAST", strings.rsbBAST, true);
        setLocalVariable("RUE", strings.rsbRUE, true);
        setLocalVariable("KYA", strings.rsbKYA, true);
        setLocalVariable("ZORA", strings.rsbZORA, true);
        setLocalVariable("PAVL", strings.rsbPAVL, true);
        setLocalVariable("LENS", strings.rsbLENS, true);
        setLocalVariable("OKSA", strings.rsbOKSA, true);
        setLocalVariable("MONTE", strings.rsbMONTE, true);
        setLocalVariable("BRIET", strings.rsbBRIET);
        setLocalVariable("TORY", strings.rsbTORY);

        DebugLog(`[P] RosterSB: ${(performance.now()-PerformanceStart).toFixed(4)}ms`);
    } catch (error) {
        console.error(`[WQR] RosterSB Error:`, error);
        return "Error"
    }
}

/**
 * CharPer Script
 * OnUser
 * @param {string} [charName] 
 * @returns {Promise<string | undefined>}
 * */
async function CharPer(charName) {
    charName = charName || getCurrentCharacterName();
    if (!charName) return;
    const PerformanceStart = performance.now();
    try {
        // Special
        switch (charName) {
            case "Rosa":
            case "Eve":
                setLocalVariable("History", "set");
                break;
            case "Aiko": {
                setLocalVariable("KinsbaneBG", "true");
                const MCY = getLocalVariable("MCY");
                let aikoAttendance = null;
                if (MCY !== "Freshman" && MCY !== "Sophomore") {
                    aikoAttendance = "Aiko attends Weyland University Monday-Friday. Aiko is now starting her {{getvar::MCY-2}} year of Demonology at Weyland.";
                }
                const config = charPer.get("Aiko");
                if (config !== undefined) {
                    try {
                        const keys = Object.keys(config.vars);
                        if (keys.length) {
                            const value = config.vars[`${keys[0]}`];
                            setLocalVariable(keys[0], `${aikoAttendance ? `${aikoAttendance}\n` : ""}${value}`)
                        }
                    } catch {
                        console.error(`[WQR] Scenarios Error: Failed to set charPer vars for "${charName}"`);
                        return "Error"
                    }
                }
                DebugLog(`[P] CharPer: ${(performance.now()-PerformanceStart).toFixed(4)}ms`);
                return;
            }
            case "Kinsbane Manor":
                setLocalVariable("KinsbaneBG", "true");
                break;
            case "Willow":
                if (getLocalVariable("WeepingWillow") === "true") {
                    setLocalVariable("ExpressWillow", strings.expW);
                } else {
                    deleteLocalVariable("ExpressWillow");
                }
                break;
            case "Hannah":
                if (fCheck()) {
                    setLocalVariable("HannahV", "She is still a virgin.");
                } else {
                    deleteLocalVariable("HannahV");
                }
                break;
        }

        //Standard
        const config = charPer.get(charName);
        if (config !== undefined) {
            try {
                const keys = Object.keys(config.vars);
                if (keys.length) {
                    const lastKey = keys[keys.length-1];
                    for (const key of keys) {
                        DebugLog(`CharPer set ${key}`);
                        setLocalVariable(key, config.vars[key], key !== lastKey)
                    }
                }
            } catch {
                console.error(`[WQR] Failed to set charPer vars for "${charName}"`);
                return "Error"
            }
        }
        DebugLog(`[P] CharPer: ${(performance.now()-PerformanceStart).toFixed(4)}ms`);
    } catch (error) {
        console.error(`[WQR] CharPer Error:`, error);
        return "Error"
    }
}

/**
 * Relationships Script
 * OnUser
 */
async function Relationships(){
    const PerformanceStart = performance.now();
    try {
        const lastCharMessage = getLastMessage("char")?.mes;
        if (!lastCharMessage) return;
        const RelationshipPrefix = "The following are characters that {{user}}";
        /**
         * RelationshipType, RelationshipSuffix
         * @type {Object.<string,string>}
         */
        const relationshipTypes = {
            "Acquaintance": "is acquainted with",
            "Friend": "is friends with",
            "Hostile": "is on negative terms with",
            "Lover": "has as lovers"
        };

        /**
         * Character, RelationshipType
         * @type {Object.<string,string>}
         */
        const relationships = JSON.parse(getLocalVariable("WeybotRelationships") || "{}");
        for (const relationshipType of Object.keys(relationshipTypes)) {
            const matches = [...lastCharMessage.matchAll(new RegExp(`(?<=New ${relationshipType}:) *{?([^{}\n\\d]+)`, "g"))
                .map(m => m[1])
                .filter(name => name !== "None")
            ];
            if (!matches?.length) continue;
            for (const name of matches) {
                relationships[name] = relationshipType;
            }
        }

        const ConstantScenarioLines = [];
        for (const relationshipType of Object.keys(relationshipTypes)) {
            const characters = Object.keys(relationships)
                .filter(name => relationships[name] === relationshipType);
            if (characters?.length)
                ConstantScenarioLines.push(`${RelationshipPrefix} ${relationshipTypes[relationshipType]}: ${characters.join(", ")}.`);
        }

        setLocalVariable("WeybotRelationships", JSON.stringify(relationships) || "{}");

        const constantScenario = `[{{user}} RELATIONSHIPS]\n${ConstantScenarioLines.join('\n') ?? "No relationships yet."}\n[END {{user}} RELATIONSHIPS]`
        setLocalVariable("ConstantScenario", constantScenario);
        DebugLog(`[P] Relationships: ${(performance.now()-PerformanceStart).toFixed(4)}ms`);
    } catch (error) {
        console.error(`[WQR] Relationships Error:`, error);
    }
}

/** 
 * @param {import("./src/chat.js").ChatMessage} [charMessage]
 * @param {string} [charName]
*/
async function CostumeChangeBot(charMessage, charName) {
    const PerformanceStart = performance.now();
    try {
        if (!charMessage) charMessage = getLastMessage("char");
        if (!charMessage) return "No charMessage";
        const charText = charMessage.mes;
        charName = charName || charMessage.name || getCurrentCharacterName();
        if (!charName) return "{{char}} undefined";
        await Expressions(charName, charMessage, true);
        let openWorld = false;
        if (/Phone Status/.test(charText)) {
            setLocalVariable("CostmSave", "Phone");
            await setCostume("Phone");
            DebugLog(`Costume set to: Phone`);
        } else if (/Weybot|Mirror Weyland|Kinsband Manor/.test(charName)) {
            await OpenWorldCostumes(charName, charMessage);
            openWorld = true;
        } else {
            await AutoCostumes(charName, charMessage);
        }
        if (!openWorld) {
            await setExpression(getLocalVariable("ExpSave") || "neutral");
            await SideCharacters(charName, charMessage);
        }
        DebugLog(`[P] CostumeChangeBot: ${(performance.now() - PerformanceStart).toFixed(4)}ms`);
    } catch (error) {
        console.error(`[WQR] CostumeChangeBot Error:`, error);
        return "Error";
    }
}

async function AngelDevil() {
    try {
        DebugLog(`AngelDevil called`);
        const angels = strings.goodConcience.length;
        const devils = strings.badConcience.length;
        setLocalVariable("Angel", angels ? strings.goodConcience[ Math.floor(Math.random() * angels)] || "" : "");
        setLocalVariable("Devil", devils ? strings.badConcience[Math.floor(Math.random() * devils)] || "" : "");
    } catch (error) {
        console.error(`[WQR] AngelDevil Error:`, error);
    }
}
//#endregion

// FUNCTIONS
//#region
/**
 * Helper Function
 * SideCharacters
 * @param {string} [charName]
 * @returns {Promise<{
 * listOfCharacters: string[], 
 * charactersWithExpressions: string[],
 * characterGroupsWithExpressions: {output: string, display: string, members: string[]}[],
 * resolveCharacterOverride: function, 
 * aliasLookup: Map<string,string>
 * }>}
 */
async function GetCharacterNamesAndAliases(charName) {
    if (!charName) charName = getCurrentCharacterName();
    /** @type {string[]} */
    const charactersWithExpressions = [
        "Aiko", "Ava", "Bap", "Bastet", "Belle", "Bianca", "Blake", "Briar", "Cairo", "Dash", "Ellie", "Eve", "Fasti",
        "Gemini", "Hannah", "Indigo", "Jenn", "Kai", "Karmen", "Khepri", "Kiera", "Koshizu", "Kressa", "Kris", "Lentyl",
        "Loona", "Lucy", "Luna", "Lurkle", "Lyris", "Mika", "Muse", "Ṇ̶̰̼͘a̶͍̅́̒r̵̓̏̉̈́ā̸͒̔̄", "Nathan", "Nefara", "Nix", "Professor Akiyama",
        "Rein", "Rivera", "Rivet", "Rosa", "Serra", "Seth", "Shani", "Sofya", "Summer", "Sunny", "Vera", "Vesper", "Vindica", 
        "Warren", "Willow",
        // Cerberus Sisters
        "Astrid", "Neshe", "Fawne",
        ...[
            getGlobalVariable("OCPick1"),
            getGlobalVariable("OCPick2"),
            getGlobalVariable("OCPick3")
        ].filter(x => typeof x === 'string' && x !== "")
    ].filter(name => !charName?.includes(name));

    // Higher up is higher priority
    const characterGroupsWithExpressions = [
        // Groups of two
        { output: "BlakeSerra", display: "Blake & Serra", members: ["Blake", "Serra"] },
        { output: "LyrisVesper", display: "Lyris & Vesper", members: ["Lyris", "Vesper"] },
        // Cerberus Sisters
        { output: "AstridNeshe", display: "Cerberus Sisters", members: ["Astrid", "Neshe"] }
    ];

    const groupsByMember = new Map();

    for (const group of characterGroupsWithExpressions) {
        for (const member of group.members) {
            const groups = groupsByMember.get(member) ?? [];
            groups.push(group);
            groupsByMember.set(member, groups);
        }
    }

    /**
     * @param {string} chosenName 
     * @param {string[]} foundCharacters 
     * @returns 
     */
    const resolveCharacterOverride = (chosenName, foundCharacters) => {
        if (!foundCharacters.includes(chosenName)) foundCharacters.push(chosenName);
        const found = new Set(foundCharacters);

        // Chosen name is already a group
        const chosenGroups = characterGroupsWithExpressions.filter(x => x.members.includes(chosenName) || x.output === chosenName);
        if (chosenGroups?.length) {
            let output = chosenName;
            for (const chosenGroup of chosenGroups) {
                DebugLog("chosenGroup: ", chosenGroup);
                const membersFound = chosenGroup.members.filter(m => found.has(m));
                DebugLog("membersFound: ", membersFound);

                // If all members are present, use the group.
                if (membersFound.length === chosenGroup.members.length) {
                    DebugLog("All members present return: ", chosenGroup.output);
                    return chosenGroup.output;
                }

                // If only one member is present, use that member.
                if (membersFound.length === 1) {
                    DebugLog("One member present return: ", membersFound[0]);
                    output = membersFound[0];
                }
            }
            return output;
        }
        
        // Chosen name is an individual.
        const groups = groupsByMember.get(chosenName) ?? [];

        for (const group of groups) {
            // @ts-ignore
            if (group.members.every(m => found.has(m))) {
                return group.output;
            }
        }

        return chosenName;
    }

    const listOfCharacters = [
        "Adrian", "Aethel", "Ahset", "Aiko", "Astrid", "Ava", "Baphrodel", "Bastet", "Belle", "Ben", "Bianca", "Blake", "Briar",
        "Brietta", "Cairo", "Chaska", "Dash", "Deredra", "Derek", "Dmitri", "Ellie", "Emily", "Eve", "Fasti", "Fawne", "Garret",
        "Gaven", "Gem", "Gemini", "Hannah", "Indigo", "Jenn", "Jericho", "Kai", "Karmen", "Kellen", "Khepri", "Kiera", "Koshizu",
        "Kressa", "Kris", "Kyana", "Lentyl", "Leo", "Lexa", "Loona", "Loren", "Lucy", "Luna", "Lurkle", "Lyris", "Margaret", "Mark",
        "Mason", "Mika", "Miu", "Muse", "Ṇ̶̰̼͘a̶͍̅́̒r̵̓̏̉̈́ā̸͒̔̄", "Nathan", "Navine", "Nefara", "Neshe", "Nix", "Orville", "Rein", "Remy", "Richard",
        "Rivera", "Rivet", "Rosa", "Professor Akiyama", "Serra", "Seth", "Shani", "Skye", "Sobek", "Sofya", "Summer", "Sunny", "Tessa", 
        "Thorne", "Tom", "Travis", "Vera", "Vesper", "Vindica", "Warren", "Willow", "Mr. Wolfy", "Yue-Lin", "Zora"
    ].filter(name => !charName?.includes(name));

    const characterAliases = {
        "Professor Akiyama": ["Professor Akiyama", "Akiyama", "Sayori"],
        "Ṇ̶̰̼͘a̶͍̅́̒r̵̓̏̉̈́ā̸͒̔̄": ["Nara"],
        "Yue-Lin": ["YueLin"],
        "Nix": ["Nicole"],
        "Dash": ["Dakota", "D. Ash"],
        "Mr. Wolfy": ["Wolfy"],
        "Thorne": ["Aris"]
    };

    const aliasLookup = new Map();

    for (const [canonical, aliases] of Object.entries(characterAliases)) {
        for (const alias of aliases) {
            aliasLookup.set(alias, canonical);
        }
    }

    return { listOfCharacters, charactersWithExpressions, characterGroupsWithExpressions, resolveCharacterOverride, aliasLookup };
}

/**
 * BG Script
 * AutoBG
 * @param {string} [charMessage]
 * @param {string} [charName]
 * @returns {Promise<string | undefined>}
 */
async function BG(charMessage, charName) {
    try {
        deleteLocalVariables(["Aiko","BGFound"]);
        if (!charMessage) charMessage = getLastMessage("char")?.mes;
        if (!charMessage) return "No message to compare against";
        const header = charMessage.match(/¦¦.*(?:\r?\n¦¦.*)*?(?=\r?\n\r?\n|$)/)?.[0] || charMessage.match(/^.+?~.+?~(?=$|\n)/m)?.[0];
        if (!header) return "No header to compare against";

        /**
         * @param {string | Array<string>} backgroundString
         * @param {string?} flags
         */
        function checkMessage(backgroundString, flags="") {
            if (!backgroundString || !header) return false;
            if (Array.isArray(backgroundString)) backgroundString = backgroundString.join("|");
            const regexp = new RegExp(`~[^~\n]*(?:${backgroundString})[^~\n]*(?:~|¦¦)`, flags || "");
            return regexp.test(header);
        }

        const bg = await (async () => {
            try {
                // Function returns on first match
                // Earlier checks = Higher Priority

                const userName = getCurrentUserName();
                if (!charName) charName = getCurrentCharacterName();
                if (!charName) {
                    DebugLog(`BG: No current chatName`);
                    return;
                }
                
                // djmika cleanup
                if (getLocalVariable("djmika") === "true" && !checkMessage("Exchange")) {
                    deleteLocalVariable("djmika");
                }

                // Aiko
                // "Aiko" mention forces kb aiko room.avif regardless of other matches.
                if (checkMessage("Aiko")) return "kb aiko room.avif";

                // Kinsbane Manor
                // Applies if char is Kinsbane Manor / Aiko, or header mentions Kinsbane/Manor.
                // Kinsbane-specific BGs override generics
                if (charName === "Kinsbane Manor"
                || charName === "Aiko"
                || checkMessage(["Kinsbane", "Manor"])) 
                {
                    // Tree house interior is more specific than tree house — check first.
                    if (checkMessage([
                        "Inside[^~\n]*Tree ?[Hh]ouse",
                        "Tree ?[Hh]ouse[^~\n]*Interior",
                        "Inside[^~\n]*Fort Aiko",
                        "Fort Aiko[^~\n]*Interior"
                    ])) return "kb inside treehouse.avif";
                    if (checkMessage(["Tree ?[Hh]ouse", "Fort Aiko"])) return "kb treehouse.avif";

                    if (checkMessage(["Garden", "Well"])) return "kb garden.avif";
                    if (checkMessage([
                        "Manor[^~\n]*Exterior",
                        "Outside[^~\n]*Manor",
                        "Kinsbane[^~\n]*Exterior",
                        "Outside[^~\n]*Kinsbane",
                        "Porch"
                    ])) return "kb front.avif";
                    if (checkMessage("Driveway")) return "kb driveway.avif";

                    // Note: "Hall" here matches things like "Lecture Hall" or "Sterling Hall" too —
                    // but we're already inside a Kinsbane context gate, so collisions are unlikely.
                    if (checkMessage(["Entrance[^~\n]*Hall", "Entry[^~\n]*Hall", "Manor[^~\n]*Entry"])) {
                        return "kb entry.avif";
                    }
                    if (checkMessage(["Hall", "Landing", "Upstairs", "Second Floor", "2nd Floor"])) {
                        return "kb upstairs.avif";
                    }

                    if (checkMessage(["Study", "Office"])) return "kb study.avif";
                    if (checkMessage(["Living", "Sitting"])) return "kb living room.avif";
                    if (checkMessage("Kitchen")) return "kb kitchen.avif";
                    if (checkMessage("Greenhouse")) return "kb greenhouse.avif";
                    if (checkMessage(["Basement", "Cellar"])) return "kb basement.avif";
                    if (checkMessage(["Bedroom", "Parent", "Master"])) return "kb master bed.avif";
                    if (checkMessage("Bath")) return "kb master bath.avif";
                    if (checkMessage("Locked")) return "kb aiko room.avif";
                    // No Kinsbane-specific match — fall through to general resolution.
                }

                if (fCheck()) {
                    await quickReplyApi.executeQuickReply("FFFox Greetings", "BG");
                    return;
                }

                // GENERAL RESOLUTION

                // Karaveia
                if (checkMessage("Karaveia")) {
                    if (checkMessage("Dining")) return "Karaveia Dun Dining Area.avif";
                    if (checkMessage("Greenhouse")) return "Karaveia Dun Greenhouse.avif";
                    if (checkMessage("Entrance")) return "Karaveia Dun Entrance.avif";
                    if (checkMessage(["Hot Springs", "Onsen"])) return "Karaveia Dun Hot Springs.avif";
                    if (checkMessage(["Residence", "Bedroom"])) return "Karaveia Dun Residence.avif";
                    if (checkMessage("Hall")) return "Karaveia Dun Halls.avif";
                    return "Karaveia Dun Communal Area.avif";
                }
                
                // Brodlak
                if (checkMessage("Brodlak")) return "Brodlak.avif";
                
                // Kyomi
                if (checkMessage("Kyomi")) return "Kyomi.avif";
                
                // Mama's Den
                if (checkMessage("Mama")) {
                    if (checkMessage("Den")) return "Mama Den.avif";
                }

                // Observation Room
                if (checkMessage("Observation Room")) return "observe.avif";

                // Blake / 271 / user's room
                if (checkMessage(["271", "Blake", userName])) return "blake room 3.avif";

                // Boulevard
                if (checkMessage("Sen[ea]ka Boulevard")) return "Seneka_Boulevard.avif";
                if (checkMessage("Side Street")) return "Old Side Street.avif";

                const exterior = checkMessage(["Exterior", "Outside", "Outer"], "i");

                // Night time is from 7pm to 5am
                const isNight = checkMessage([
                    "(?:[7-9]|1[01]):\\d\\d PM",
                    "(?:12|[1-5]):\\d\\d AM",
                ], "i");

                // Cafes / Bars
                if (checkMessage("Sakurai")) {
                    if (exterior) return "sakurai cafe outside.avif";
                    return isNight ? "Sakurai Cafe Night.avif" : "Sakurai Cafe Day.avif";
                }
                if (checkMessage("Rustwood")) return "Rustwood Cafe 2.avif";
                if (checkMessage("Black Barrel")) {
                    return checkMessage("Backroom") ? "BBB Backroom.avif" : "BBB.avif";
                }
                if (checkMessage("Mama")) return "Mamas Den.avif";
                if (checkMessage("Barcade")) return "Barcade.avif";
                if (checkMessage(["Bar", "Dive"])) return "Dive Bar.avif";
                if (checkMessage("Diner")) return exterior ? "Diner Exterior.avif" : "Diner Interior.avif";
                if (checkMessage(["Bakery", "Pastry"])) return "Bakery.avif";
                if (checkMessage(["Meadery", "Winery"])) return "Meadery.avif";
                if (checkMessage("Vineyard")) return "Vineyard.avif";
                if (checkMessage("Restaurant")) return "Restaurant.avif";

                // Civic / Misc
                if (checkMessage(["Hospital", "Medical", "Nurse", "Doctor", "Treatment", "Patient"])) {
                    return "Treatment Facility.avif";
                }
                if (checkMessage(["Tetsuya", "Grocery"])) return "Tetsuya_Aisle_FIn-1.avif";
                if (checkMessage(["Ramen", "Red Lantern"])) return "ramen.avif";
                if (checkMessage(["Church", "Chapel", "Wedding", "Altar"])) return "chapel.avif";
                if (checkMessage("Farm")) return "farm.avif";
                if (checkMessage(["Cell", "Jail", "Prison"])) return "cell.avif";

                // Specific dorm rooms
                if (checkMessage("Serra")) return "serra room 2.avif";
                if (checkMessage(["292", "Vera", "Fasti"])) return "vera room 1.avif";
                if (checkMessage(["273", "Kai", "Kiera"])) return "kai room.avif";
                if (checkMessage(["279", "Summer"])) return "summer room 3.avif";
                if (checkMessage(["309", "Briar"])) return "briar room.avif";
                if (checkMessage(["383", "Willow"])) return "Willow room.avif";
                if (checkMessage(["280", "Koshizu"])) return "koshizu room.avif";
                if (checkMessage(["284", "Indigo"])) return "indigo room 2.avif";
                if (checkMessage(["281", "Belle"])) return "belle room 2.avif";
                if (checkMessage(["283", "Nix"])) return "nix room 4.avif";
                if (checkMessage(["269", "Mika"])) return "mika room.avif";
                if (checkMessage(["275", "Cairo"])) return "cairo room.avif";
                if (checkMessage(["290", "Bianca"])) return "bianca room 3.avif";
                if (checkMessage(["268", "Jenn", "Lucy"])) return "lucy room 3.avif";

                // Specific bedrooms (apartment occupants)
                if (checkMessage("Bedroom")) {
                    if (checkMessage("Hannah")) return "Hannah_s Bedroom.avif";
                    if (checkMessage(["Akiyama", "Sayori"])) return "Akiyama_s Bedroom.avif";
                    if (checkMessage("Seth")) return "Seth_s Bedroom.avif";
                    if (checkMessage("Warren")) return "Warren_s Bedroom.avif";
                    if (checkMessage("Jericho")) return "Jericho Bedroom.avif";
                    if (checkMessage(["Mark", "Rein"])) return "Rein and Mark Bedroom_Bedroom.avif";
                    if (checkMessage("Gemini")) return "Gemini_Bedroom.avif";
                    return "Generic Bedroom.avif";
                }

                // Apartments
                if (checkMessage("Hannah")) return "Hannah_s Apartment.avif";
                if (checkMessage("Warren")) return "Warren_s Apartment.avif";
                if (checkMessage(["Akiyama", "Sayori"])) return "Akiyama_s Apartment.avif";
                if (checkMessage("Seth")) return "Seth_s Apartment.avif";
                if (checkMessage(["Mark", "Rein"])) return "Rein and Mark Apartment.avif";
                if (checkMessage("Gemini")) return "Gemini_Apartment.avif";
                if (checkMessage("Jericho")) return "Jericho Apartment.avif";
                if (checkMessage(["Student Housing", "Apartment", "Residence"])) {
                    if (exterior || checkMessage("Complex")) return "Apartment Complex.avif";
                    return "Generic Apartment.avif";
                }

                if (checkMessage(["Commons", "Common Area"])) return "Common_Room.avif";
                if (checkMessage("Dorm Room")) return "dorms 2.avif";

                // Lounge / Forest / Trails
                if (checkMessage("Lounge")) return "lounge.avif";

                // Forest sub-types first (more specific), then forest fallback
                if (checkMessage(["Firefly", "Fireflies"])) return "Field of Fireflies.avif";
                if (checkMessage("Clearing")) return "Forest Clearing.avif";
                if (checkMessage(["Trail", "Trails", "Path", "Pathway"])) {
                    const num = getRandomInt(1, 4);
                    return `Forest Trails ${num}.avif`;
                }
                if (checkMessage(["Forest", "Woods", "Nature"])) {
                    return isNight ? "Forest Night.avif" : "Forest Day.avif";
                }

                // Soft Pike / Cerberus
                if (checkMessage([
                    "Cerberus[^~\n]*Trailer",
                    "Inside Trailer",
                    "Trailer[^~\n]*13",
                    "Trailer[^~\n]*Interior"
                ])) return "cerberus.avif";
                if (checkMessage(["Trailer", "Soft Pike"])) {
                    if (checkMessage("Entrance")) return "Soft Pike Entrance.avif";
                    return isNight ? "Soft Pike Night.avif" : "Soft Pike Day.avif";
                }
                
                // Hot spring / tub
                if (checkMessage("Hot Tub")) return "Hot tub.avif";
                if (checkMessage(["Hot Spring", "Onsen", "Wolf Spring"])) return "onsen 2.avif";

                // Party
                if (checkMessage("Party")) {
                    if (checkMessage("Pool")) return "pool party.avif";
                    if (checkMessage("Kitchen")) return "Kitchen House Party.avif";
                    if (checkMessage("Bedroom")) return "house party.avif";
                    if (checkMessage("House")) return "House_Party.avif";
                }

                // Pool (Must be after Party)
                if (checkMessage("Pool")) {
                    return checkMessage("Hall") ? "Pool Hall.avif" : "Swimming Pool.avif";
                }
                if (checkMessage("Swimming")) return "Swimming Hole.avif";

                const isRain = /\b(?:rain|raining|rainfall|drizzle|drizzling|downpour|pouring|storm|storming|thunderstorm|monsoon|shower(?:s)?|heavy +rain|light +rain|wet|soaked|drenched|puddles?|raindrops?|rain-soaked|rainy|overcast +and +wet)\b/i.test(charMessage);

                // Car
                if (checkMessage([" Car ", "Van ", "Minivan", "Truck", "Vehicle"])) {
                    return isRain ? "car interior.avif" : "Car Interior 2.avif";
                }

                // Library
                if (checkMessage("Library Nook")) return "library nook.avif";
                if (checkMessage(["Library", "Nook"])) return "library.avif";

                // Office / Lab
                if (checkMessage("Office")) return "Office.avif";
                if (checkMessage(["Lab", "Laboratory"])) return "Lab.avif";

                // Hotel / Motel
                if (checkMessage(["Hotel", "Motel"])) {
                    const isLuxury = checkMessage(["Luxury", "Expensive", "High End", "Five Star", "Five-Star"]);
                    const isCheap = checkMessage(["Cheap", "Poor", "Dirty", "Rundown", "One-Star", "One Star"]);
                    const isLove = checkMessage(["Love", "Sex"]);
                    if (exterior) {
                        if (isLove) return "Love Hotel Exterior.avif";
                        if (isLuxury) return "Luxury Hotel Exterior.avif";
                        if (isCheap) return "Cheap Motel Exterior.avif";
                        return "Hotel Exterior.avif";
                    }
                    if (checkMessage("Pool")) return "Hotel Pool.avif";
                    if (checkMessage("Hot Tub")) return "Luxury Hot tub.avif";
                    if (isLove) return "Love Hotel Interior.avif";
                    if (isLuxury) return "Luxury Hotel Interior.avif";
                    if (isCheap) return "Cheap Motel Interior.avif";
                    return "Hotel Interior.avif";
                }

                // Backyard / Camp / Cabin / Amusement
                if (checkMessage("Cookout")) return "Backyard Cookout.avif";
                if (checkMessage("Backyard")) {
                    return checkMessage("Bonfire") ? "Backyard Bonfire.avif" : "Empty Backyard.avif";
                }
                if (checkMessage("Tent")) {
                    return isNight ? "Solo Campground Night.avif" : "Solo Campground Day.avif";
                }
                if (checkMessage(["Camp ", "Campsite", "Campgrounds"])) return "Campground.avif";

                if (checkMessage("Cabin")) {
                    if (exterior) return "Cabin in the Woods.avif";
                    if (checkMessage("Bedroom")) return "Cabin Bedroom Interior.avif";
                    return "Cabin Interior.avif";
                }

                if (checkMessage("Arboretum")) {
                    return isNight ? "Arboretum Night.avif" : "Arboretum Day.avif";
                }
                if (checkMessage(["Amusement Park", "Roller Coaster", "Theme Park"])) {
                    return isNight ? "Amusement Park Night.avif" : "Amusement Park Day.avif";
                }

                // Boat
                if (checkMessage(["Yacht", "Boat", "Ship"])) return "Yacht Party.avif";

                // Roof
                if (checkMessage(["Roof", "Rooftop"])) {
                    if (checkMessage(["Garden", "Greenhouse", "Sanctuary"])) return "Rooftop Greenhouse.avif";
                    return "Rooftop.avif";
                }

                // Misc Stores
                if (checkMessage(["Icecream", "Ice Cream"])) return "Icecream Shop.avif";
                if (checkMessage("Record")) return "Record Store.avif";
                if (checkMessage("Game")) return "Game Store.avif";
                if (checkMessage(["Book", "Bookstore"])) return "Bookstore.avif";
                if (checkMessage(["Skate", "Skatepark"])) return "Empty Skatepark.avif";

                // Park / Outdoor
                if (checkMessage("Lake")) return "lake.avif";
                if (checkMessage("Playground")) return "Empty Playground.avif";
                if (checkMessage("Trampoline")) return "Indoor Trampoline.avif";
                if (checkMessage(["River", "Riverside"])) return "River Walk.avif";
                if (checkMessage(["Overlook", "Cliffside", "Outlook"])) return "Cliffside Parking Lot 2.avif";
                if (checkMessage("Park")) return isNight ? "Parc_8_Night.avif" : "Park.avif";

                // Transit / Stairs / Alley
                if (checkMessage("Bus")) return checkMessage("Stop") ? "Bus Stop.avif" : "Bus Interior.avif";
                if (checkMessage(["Stairwell", "Staircase", "Stairs"])) return "Stairwell.avif";
                if (checkMessage("Bowling")) return "Bowling Alley.avif";
                if (checkMessage("Alley")) return "Alley.avif";

                // Sports
                if (checkMessage("Gym")) return "Gym 2.avif";
                if (checkMessage("Locker")) return "Locker Room.avif";
                if (checkMessage("Baseball")) return "Baseball Field.avif";
                if (checkMessage("Basketball")) return "Basketball Court.avif";
                if (checkMessage("Volleyball")) return "Volleyball Court.avif";
                if (checkMessage("Football")) return "Football Field.avif";
                if (checkMessage(["Sports", "Tennis"])) return "Sports Complex.avif";

                // Haunted / Construction
                if (checkMessage("Haunted")) {
                    return exterior ? "Haunted House.avif" : "Haunted House Interior.avif";
                }
                if (checkMessage(["Construction", "Observatory"])) return "construction.avif";

                // Classrooms
                // Art and Workshop are checked before generic Class because they have their
                // own BGs and would otherwise be shadowed by the lecture-hall fallback.
                if (checkMessage("Art")) return "Art Class.avif";
                if (checkMessage(["Workshop", "Crafts"])) return "workshop.avif";
                if (checkMessage(["Class", "Lecture Hall", "Biology", "Calculus"])) {
                    return exterior ? "lecture hall.avif" : "Lecture Hall 2.avif";
                }
                if (checkMessage(["Cook", "Culinary"])) return "Sterling_Hall_Inside_3.avif";

                // Treehouse / Kinsbane front (general context)
                if (checkMessage(["Treehouse", "Tree House", "Aiko[^~\n]*Fort", "Aiko[^~\n]*Tree"])) {
                    return "kb treehouse.avif";
                }
                if (checkMessage("Kinsbane")) return "kb front.avif";

                // Campus generic
                if (checkMessage(["Sterling", "Dorm"])) return "sterling.avif";
                if (checkMessage(["Quad", "Campus", "Walkway"])) return "Quad.avif";
                if (checkMessage(["Dormitory Pathway", "Grounds"])) {
                    return isRain ? "weyland uni rain.avif" : "campus grounds.avif";
                }
                if (checkMessage(["Hallway", "Corridor"])) return "hallway.avif";
                if (checkMessage(["Bathroom", "Restroom", "Toilet", "Washroom"])) return "shared bathroom 2.avif";
                if (checkMessage("Mall")) return "mall 2.avif";

                // Theater / Tavern / Habitat
                if (checkMessage(["Movie", "Theatre", "Theater", "Cinema"])) return "Theater.avif";
                if (checkMessage("Weyland Tavern")) return "weyland tavern.avif";
                if (checkMessage("Research Center")) return "Weyland Research Center.avif";
                if (checkMessage(["Habitat", "Research", "Observation"])) return "observe.avif";

                // Exchange
                if (checkMessage("Exchange")) {
                    const djmika = getLocalVariable("djmika") === "true";
                    if (!djmika) {
                        if (/Mika/.test(charMessage)) {
                            setLocalVariable("djmika", "true");
                            return "exchange 2.avif";
                        }
                        return "exchange.avif";
                    }
                    return;
                }

                if (checkMessage("Kodo Bowl")) return "Kodo_Bowl.avif";

                const isAlone = /\b(?:alone|empty|deserted|nobody)\b/i.test(charMessage);

                // Beach
                if (checkMessage("Beach")) {
                    if (checkMessage("Bonfire")) return "Beach Bonfire.avif";
                    if (checkMessage(["Cove", "Hidden"])) return "Beach Hidden Beach Cove.avif";
                    if (isNight) return "Beach_Night.avif";
                    if (isAlone) return "Beach_Day.avif";
                    return Math.random() < 0.5 ? "Beach_1.avif" : "Beach_2.avif";
                }

                if (checkMessage("Boardwalk")) {
                    return isAlone ? "Boardwalk_Empty.avif" : "Boardwalk_Pop.avif";
                }
                if (checkMessage("Pier")) return isNight ? "Pier_Night.avif" : "Pier_Day.avif";

                // Adult / Casino
                if (checkMessage("Casino")) return "Casino.avif";
                if (checkMessage("Strip")) return "Strip Club.avif";
                if (checkMessage("Adult")) return "Adult Store.avif";

                // Japan
                if (checkMessage(["Japan", "Tokyo"])) {
                    if (checkMessage(["Countryside", "Rural"])) return "Japanese Countryside.avif";
                    if (checkMessage(["Town", "Village"])) return "Small Japanese Town.avif";
                    if (checkMessage("Forest")) return "Japanese Forest.avif";
                    if (checkMessage(["Mountain", "Mount", "Trail"])) return "Japanese Mountain Trail.avif";
                    return "Japanese City.avif";
                }

                // Ellie's Estate (char-gated)
                if (charName === "Ellie" && checkMessage(["Estate", "Castle", "Ellie", "Tomoryu"])) {
                    if (checkMessage(["Garden", "Pond"])) return "Japanese Estate Garden.avif";
                    if (checkMessage(["Shrine", "Grave"])) return "Japanese Estate Exterior Shrines.avif";
                    if (checkMessage("Engawa")) return "Japanese Estate Engawa.avif";
                    if (checkMessage(["Dining", "Eating", "Meal", "Food", "Dinner", "Breakfast"])) {
                        return "Japanese Estate Dining Room.avif";
                    }
                    if (checkMessage("Ellie")) return "Japanese Estate Ellie Bedroom.avif";
                    return "Japanese Estate Bedroom.avif";
                }

                if (checkMessage("Torii")) return "Mountian Tori Gates.avif";

                if (checkMessage("Europe")) {
                    return checkMessage("City") ? "Large European City.avif" : "Small European Town.avif";
                }

                if (checkMessage(["Plane", "Airplane"])) {
                    return checkMessage("Window") ? "Airplane Interior Window View.avif" : "Airplane Interior.avif";
                }

                if (checkMessage("Arcade")) return "Arcade.avif";

                // Somnia 
                if (checkMessage("Somnia")) {
                    if (exterior) return "somnia 1.avif";
                    if (checkMessage(["Front Desk", "Reception"])) return "somnia 2.avif";
                    if (checkMessage("Bar")) return "somnia 3.avif";
                    if (checkMessage("Kiosk")) return "somnia 5.avif";
                    return "somnia 4.avif";
                }

                if (checkMessage(["7-Eleven", "Seven-Eleven"])) return "seven eleven.avif";

                // Festivals
                if (checkMessage("Moonlight")) return "festival.avif";
                if (checkMessage("Sunrise")) return "sunrise.avif";
                if (checkMessage(["Harvest", "Autumn", "Fall"])) return "Autumn Festival.avif";
                if (checkMessage(["Festival", "Lantern"])) return "Lantern Festival.avif";

                // Caravan
                if (checkMessage("Caravan")) {
                    if (checkMessage("Outer")) {
                        return isNight ? "caravan outer night.avif" : "caravan outer day.avif";
                    }
                    return isNight ? "caravan ring night.avif" : "caravan ring day.avif";
                }

                // Pavilions / Christmas
                if (checkMessage("Sunstone")) return "sunstone.avif";
                if (checkMessage("Moonstone")) return "moonstone.avif";
                if (checkMessage(["Christmas", "Santa", "Holiday"])) return "Sterling_Hall_Christmas_1.avif";
            } catch {}
        })();

        if (bg) {
            if (getLocalVariable("BGFound") !== bg) {
                DebugLog(`New BG Found:`, bg);
                setLocalVariable("BGFound", bg);
                setGlobalVariable("BGFoundG", bg);
                setBackground(bg);
                return bg;
            } else {
                DebugLog(`Same BG Found:`, bg);
                return bg;
            }
        } else {
            DebugLog(`No BG found.`);
        }

        return;
    } catch (err) {
        console.error(`[WQR] BG Error:`, err);
        return `Error`
    }
}

/** 
 * @param {string} [charName]
 * @param {import("./src/chat.js").ChatMessage} [charMessage]
*/
async function OpenWorldCostumes(charName, charMessage) {
    const PerformanceStart = performance.now();
    try {
        if (!charMessage) charMessage = getLastMessage("char");
        if (!charMessage) return;
        const lookForSide =  !(isMobile() || getGlobalVariable("AutoCostume") === "No");
        charName = charName || charMessage.name || getCurrentCharacterName();

        const mainRegex = /_{0,2}(?:Mirror )?(.+?):_{1,2}/g;
        const altRegex = /\b([A-Z][A-Za-z\-]{,16})\b(?= (?:[A-Za-z]{2,}(?:s|[ie]d)\b|is[^.,!?\n]+[A-Za-z]+ing\b))/g;

        const {charactersWithExpressions, aliasLookup} = await GetCharacterNamesAndAliases("Weybot");

        const foundCharacters = [...new Set(
            [...charMessage.mes.matchAll(mainRegex)]
                .map(m => aliasLookup.get(m[1]) ?? m[1])
                .filter(name => charactersWithExpressions.includes(name))
            )];
        if (foundCharacters.length < 2) {
            foundCharacters.push(...new Set(
                [...charMessage.mes.matchAll(altRegex)]
                    .map(m => aliasLookup.get(m[1]) ?? m[1])
                    .filter(name => charactersWithExpressions.includes(name) && !foundCharacters.includes(name))
            ));
        }

        if (!foundCharacters?.length) {
            DebugLog(`OpenWorldCostumes: No characters found.`);
            // TODO: Add Weybot Male/Female/Other costumes here
            await setExpression('#reset');
            updateSideCharacter({clear: 'true'});
            return;
        }

        DebugLog(`OpenWorldCostumes: Discovered: ${foundCharacters.length}`, foundCharacters);
        
        const { pickedCharMain, pickedCharSide } = (() => {
            let firstPick = 0;
            let charOverride = "";
            if (charName === "Kinsbane Manor") {
                const aikoIndex = foundCharacters.indexOf("Aiko");
                if (aikoIndex !== undefined) {
                    firstPick = aikoIndex;
                } else if (/ghost/i.test(charMessage.mes)) {
                    charOverride = "Kinsbane Manor";
                }
            } else if (foundCharacters.length > 2) {
                firstPick = Math.floor(Math.random() * foundCharacters.length);
            }

            const pickedCharMain = charOverride || foundCharacters.splice(firstPick, 1)[0];
            const pickedCharSide = lookForSide ? foundCharacters[Math.floor(Math.random() * foundCharacters.length)] : undefined;

            return { pickedCharMain, pickedCharSide };
        })();

        const mainCostume = pickedCharMain === "Kinsbane Manor" ? (() => {
            setLocalVariable("ExpSave", "neutral");
            return "Ghost"
        })() : getCharacterCostumeFromText(charMessage.mes, pickedCharMain, false);
        const sideCostume = getCharacterCostumeFromText(charMessage.mes, pickedCharSide, false);

        if (getLocalVariable("ExpSave") === "") {
            await Expressions(charName, charMessage, true);
        }
        const expression = getLocalVariable("ExpSave");
        
        if (mainCostume && getLocalVariable("CostmSave") !== `${pickedCharMain}/${mainCostume}`) {
            setLocalVariable("CostmSave", `${pickedCharMain}/${mainCostume}`);
            await setCostumeAndExpression(pickedCharMain, mainCostume, expression);
            DebugLog(`OpenWorldCostumes: Set left-side to "${pickedCharMain}/${mainCostume}"`);
        }
        if (lookForSide) {
            if (pickedCharSide && getLocalVariable("CostmSaveSide") !== `${pickedCharSide}/${sideCostume}`) {
                setLocalVariable("CostmSaveSide", `${pickedCharSide}/${sideCostume}`);
                await updateSideCharacter({character: `${pickedCharSide}/${sideCostume}`, expression: getLocalVariable("ExpSave")});
                DebugLog(`OpenWorldCostumes: Set right-side to "${pickedCharSide}/${sideCostume}"`);
            } else if (getLocalVariable("CostmSaveSide") !== "") {
                setLocalVariable("CostmSaveSide", "");
                updateSideCharacter({clear: "true"});
                DebugLog(`OpenWorldCostumes: Cleared right-side.`);
            }
        }
        DebugLog(`[P] OpenWorldCostumes: ${(performance.now() - PerformanceStart).toFixed(4)}ms`);
    } catch (error) {
        console.error(`[WQR] OpenWorldCostumes Error:`, error);
    }
}

/**
 * @param {string} [charName]
 * @param {import("./src/chat.js").ChatMessage} [charMessage]
 */
async function GroupCostumes(charName, charMessage) {
    const PerformanceStart = performance.now();
    try {
        if (!charMessage) charMessage = getLastMessage("char");
        if (!charMessage) return;
        charName = charName || charMessage.name || getCurrentCharacterName();
        if (!charName) return;

        const mainRegex = /_{0,2}(?:Mirror )?(.+?):_{1,2}/g;
        const altRegex = /\b([A-Z][A-Za-z\-]{,16})\b(?= (?:[A-Za-z]{2,}(?:s|[ie]d)\b|is[^.,!?\n]+[A-Za-z]+ing\b))/g;

        const {charactersWithExpressions, resolveCharacterOverride, aliasLookup} = await GetCharacterNamesAndAliases("Weybot");

        const foundCharacters = [...new Set(
            [...charMessage.mes.matchAll(mainRegex)]
                .map(m => aliasLookup.get(m[1]) ?? m[1])
                .filter(name => charactersWithExpressions.includes(name))
            )];
        if (foundCharacters.length < 2) {
            foundCharacters.push(...new Set(
                [...charMessage.mes.matchAll(altRegex)]
                    .map(m => aliasLookup.get(m[1]) ?? m[1])
                    .filter(name => charactersWithExpressions.includes(name) && !foundCharacters.includes(name))
            ));
        }

        let pickedChar = foundCharacters.length ? foundCharacters[Math.floor(Math.random() * foundCharacters.length)] : "";
        DebugLog(`Default picked char: ${pickedChar}`, foundCharacters);
        if (charName.includes("&")) {
            pickedChar = resolveCharacterOverride(charName.replaceAll(/ & /g, ""), foundCharacters);
        } else if (charName === "Cerberus Sisters") {
            const sister = getLocalVariable("CerberusSister");
            if (sister && sister !== "3rd") pickedChar = resolveCharacterOverride(sister, foundCharacters);
        }
        DebugLog(`Overwrite picked char: ${pickedChar}`);

        const costume = getCharacterCostumeFromText(charMessage.mes, pickedChar);
        const charCostume = `${pickedChar}/${costume}`;
        if (costume && getLocalVariable("CostmSave") !== charCostume) {
            setLocalVariable("CostmSave", charCostume);
            await setCostume(charCostume);
            DebugLog(`Set new costume: ${charCostume}`);
        }
        DebugLog(`[P] GroupCostumes: ${(performance.now() - PerformanceStart).toFixed(4)}ms`);
    } catch (error) {
        console.error(`[WQR] GroupCostumes Error:`, error);
    }
}

/** 
 * @param {string} [charName]
 * @param {import("./src/chat.js").ChatMessage} [charMessage]
*/
async function AutoCostumes(charName, charMessage) {
    const PerformanceStart = performance.now();
    try {
        if (!charMessage) charMessage = getLastMessage("char");
        if (!charMessage) return "No charMessage";
        charName = charName || charMessage.name || getCurrentCharacterName();
        if (!charName) return "{{char}} undefined";
        if (getGlobalVariable("AutoCostume") !== "No") {
            const groupCharacter = [
                "Blake & Serra", "Lyris & Vesper", "Cerberus Sisters"
            ].includes(charName);
            const openWorld = [
                "Weybot", "Mirror Weyland", "Kinsbane Manor"
            ].includes(charName);
            if (openWorld) return "Aborted";
            if (groupCharacter) {
                await GroupCostumes(charName, charMessage);
            } else {
                const costume = getCharacterCostumeFromText(charMessage.mes, charName);
                const charCostume = `${charName}/${costume}`;
                if (costume && getLocalVariable("CostmSave") !== charCostume) {
                    setLocalVariable("CostmSave", charCostume);
                    setCostume(charCostume);
                    DebugLog(`Set new costume: ${charCostume}`);
                }
            }
        }
        DebugLog(`[P] AutoCostumes: ${(performance.now() - PerformanceStart).toFixed(4)}ms`);
    } catch (error) {
        console.error(`[WQR] AutoCostumes Error:`, error);
    }
}

/**
 * @param {string} [charName]
 * @param {import("./src/scenarios.js").Character} [charScenarios]
 * @returns 
 */
async function SetupCostumesAndTags(charName, charScenarios) {
    try {
        charName = charName || getCurrentCharacterName();
        DebugLog(`SetupCostumesAndTags charName: ${charName}`);
        if (!charName) return;
        charScenarios = charScenarios || scenarios.get(charName);
        if (!charScenarios) return;
        DebugLog(`SetupCostumesAndTags charScenarios:`, charScenarios);
        if (Array.isArray(charScenarios?.tags)) {
            try {
                for (const tag of charScenarios.tags) {
                    const exists = tagExists(tag, charName);
                    DebugLog(`Add "${tag}" if not exists on "${charName}": Exists?: ${exists}`);
                    if (!exists) {
                        tagAdd(tag, charName);
                    }
                }
            } catch {
                console.error(`[WQR] Scenarios Error: Failed to set tags for "${charName}"`, charScenarios.tags);
            }
        }

        if (Array.isArray(charScenarios?.removeTags)) {
            try {
                for (const tag of charScenarios.removeTags) {
                    DebugLog(`Remove "${tag}" if exists on "${charName}": Exists?: ${tagExists(tag, charName)}`);
                    if (tagExists(tag, charName)) tagRemove(tag, charName);
                }
            } catch {
                console.error(`[WQR] Scenarios Error: Failed to remove tags for "${charName}"`, charScenarios.removeTags);
            }
        }

        if (Array.isArray(charScenarios?.costumes)) {
            try {
                for (let costumeID = 1; costumeID <= charScenarios.costumes.length; costumeID++) {
                    const costumeVar = `O${costumeID}`;
                    const costume = charScenarios.costumes[costumeID-1];
                    setLocalVariable(costumeVar, costume, costumeID !== charScenarios.costumes.length);
                }
            } catch {
                console.error(`[WQR] Scenarios Error: Failed to set costumes for "${charName}"`, charScenarios.costumes);
            }
        }
    } catch {}
}

/**
 * SetSchoolYear
 * OnUser
 * @param {string} [startingYear]
 * @returns {Promise<string | undefined>}
 */
async function SetSchoolYear(startingYear) {
    /** @type {string} */ startingYear = startingYear || getLocalVariable("StartingYear");
    try {
        const offset = {
            Freshman: 0,
            Sophomore: 1,
            Junior: 2,
            Senior: 3,
            Alumni: 4
        }[startingYear || "Freshman"] || 0;

        /** @param {number} year */
        function MCY(year) {
            if (startingYear === "Alumni") return "alumni";

            const stages = [
                "not yet present (future character)",
                "Freshman",
                "Sophomore",
                "Junior",
                "Senior",
                "alumni"
            ];

            return stages[Math.max(0, Math.min(5, year + offset + 1))];
        }
        /** @param {number} year */
        function GRA(year) {
            if (startingYear === "Alumni") return "alumni";

            const stage = year + offset;

            if (stage <= 2)
                return ["Freshman", "Sophomore", "Junior", "Senior"][stage];

            if (stage <= 4)
                return "Grad student";

            return "alumni";
        }
        /** @param {number} year */
        function PHD(year) {
            if (startingYear === "Alumni") return "alumni";

            const stage = year + offset;

            if (stage <= 2)
                return ["Freshman", "Sophomore", "Junior", "Senior"][stage];

            if (stage <= 4)
                return "Grad student";

            return "Post-Grad student";
        }

        // MCY
        setLocalVariable("MCY-3", MCY(-3), true);
        setLocalVariable("MCY-2", MCY(-2), true);
        setLocalVariable("MCY-1", MCY(-1), true);
        setLocalVariable("MCY", MCY(0), true);
        setLocalVariable("MCY1", MCY(1), true);
        setLocalVariable("MCY2", MCY(2), true);
        setLocalVariable("MCY3", MCY(3), true);
        setLocalVariable("MCY4", MCY(4));

        // Graduate
        setLocalVariable("GRA1", GRA(1), true);
        setLocalVariable("GRA2", GRA(2), true);
        setLocalVariable("GRA3", GRA(3), true);
        setLocalVariable("GRA4", GRA(4), true);
        setLocalVariable("GRA5", GRA(5), true);
        setLocalVariable("GRA6", GRA(6));

        // PhD
        setLocalVariable("PHD1", PHD(1), true);
        setLocalVariable("PHD2", PHD(2), true);
        setLocalVariable("PHD3", PHD(3), true);
        setLocalVariable("PHD4", PHD(4), true);
        setLocalVariable("PHD5", PHD(5), true);
        setLocalVariable("PHD6", PHD(6));

        // Ages
        const ageMin = 19;
        const ageMax = 90;
        for (let age = ageMin; age <= ageMax; age++) {
            setLocalVariable(`${age}YO`, age + offset, age !== ageMax);
        }

        // School year
        const startYear = 2020 + offset;
        setLocalVariable("SchoolYear", `${startYear}-${startYear + 1}`);
    } catch (error) {
        console.error(`[WQR] SetSchoolYear Error:`, error);
        return "Error"
    }
}

/**
 * @param {string} [charName]
 * @returns 
 */
async function SpecialChar(charName) {
    const PerformanceStart = performance.now();
    try {
        charName = charName || getCurrentCharacterName();
        if (!charName) return;
        const specialVars = specialChar.get(charName);
        if (specialVars?.vars) {
            const keys = Object.keys(specialVars.vars);
            if (keys.length) {
                const lastKey = keys[keys.length-1];
                for (const key of keys) {
                    DebugLog(`SpecialChar set ${key}`);
                    setLocalVariable(key, specialVars.vars[key], key !== lastKey);
                }
            }
        }
        const specialVarsKressa = specialChar.get("Kressa");
        if (specialVarsKressa?.vars) {
            const keys = Object.keys(specialVarsKressa.vars);
            if (keys.length) {
                const lastKey = keys[keys.length-1];
                for (const key of keys) {
                    DebugLog(`SpecialChar set ${key}`);
                    setLocalVariable(key, specialVarsKressa.vars[key], key !== lastKey);
                }
            }
        }
        DebugLog(`[P] SpecialChar: ${(performance.now() - PerformanceStart).toFixed(4)}ms`);
    } catch (error) {
        console.error(`[WQR] SpecialChar Error:`, error);
    }
}

/**
 * @param {string} [charName]
 * @returns 
 */
async function XXX(charName) {
    const PerformanceStart = performance.now();
    try {
        charName = charName || getCurrentCharacterName();
        if (!charName) return;
        if (getLocalVariable("RPPOVLocalSet") === "") setLocalVariable("RPPOVLocal", getGlobalVariable("RPPOV"));
        if (/Kinsbane Manor|Aethel|Muse|Kressa/.test(charName)) await SpecialChar();
        if (getLocalVariable("LocalN") === "") setLocalVariable("LocalNarrator", getGlobalVariable("Narrator"));
        if (ravs.get(getGlobalVariable("PromptChoice")) === undefined) setGlobalVariable("PromptChoice", "Current Prompt");
        const pc = getGlobalVariable("PromptChoice");
        const rav = ravs.get(pc) || ravs.get("Current Prompt");
        if (!rav) throw new Error("No rav found");
        if (["Summer","Loona","Belle","Hannah","Seth","Lentyl","Briar","Willow","Bap","Dash"].includes(charName) && rav.thinkYes) {
            setLocalVariable("ThoughtSet", rav.thinkYes);
        } else if (charName === "Vera" && getLocalVariable("Scenario") && rav.thinkYes) {
            setLocalVariable("ThoughtSet", rav.thinkYes);
        } else if (charName === "Cerberus Sisters" && getLocalVariable("CerberusSister") === "Fawne" && rav.thinkYes) {
            setLocalVariable("ThoughtSet", rav.thinkYes);
        } else if (getLocalVariable("SpecialThoughts") && rav.thinkSpec) {
            setLocalVariable("ThoughtSet", rav.thinkSpec);
        } else {
            setLocalVariable("ThoughtSet", "[CHARACTER THOUGHTS: DISABLED BY DEFAULT. DO NOT SEND EXPLICITLY STATED CHARACTER THOUGHTS WITH RESPONSES UNLESS {{user}} REQUESTS THEM TO BE ENABLED.]");
        }
        switch (pc) {
            default:
                setLocalVariable("CCPromptCodes", /Weybot|Mirror Weyland/.test(charName) ? rav.CCPCA : rav.CCPC);
                setLocalVariable("ravteg", rav.teg);
                setLocalVariable("postrav", rav.post.replace("{{pipe}}", `${getLocalVariable("ExpAltShow") === "true" ? `${rav.expaltshow}` : "{{getglobalvar::RPFocus}}"}\n${getGlobalVariable("HTML!") === "Enabled" ? strings.whtml : "====="}`));
                break;
            case "Old Prompt 2025":
                let replace = [];
                if (charName !== "Muse") {
                    replace.push('');
                    if (getLocalVariable("LTMRav") !== "true") {
                        replace.push(charName === "Weybot" ? rav.CCPCA : rav.CCPC);
                        replace.push(rav.NoMuseNoLTMRav);
                    } else {
                        replace.push("Do not use the roleplay header or footer in your memory creation.");
                    }
                    replace.push('');
                }
                setLocalVariable("ravteg",rav.teg.replace("\n{{pipe}}\n", replace.join("\n")));
                setLocalVariable("postrav", rav.post);
                break;
        }
        await Clear();
        DebugLog(`[P] XXX: ${(performance.now() - PerformanceStart).toFixed(4)}ms`);
    } catch (error) {
        console.error(`[WQR] XXX Error:`, error);
    }
}

/**
 * @param {import("./src/chat.js").ChatMessage} [charMessage]
 */
async function Clear(charMessage) {
    const PerformanceStart = performance.now();
    try {
        charMessage = charMessage || getLastMessage("char");
        if (!charMessage?.mes) return;
        detector.updateTarget("teg", getLocalVariable("ravteg"));
        detector.updateTarget("post", getLocalVariable("postrav"));
        detector.updateTarget("per", getCurrentCharacterPersonality() || "");
        detector.updateTarget("des", getCurrentCharacterDescription() || "");
        const check = detector.check(charMessage.mes, {threshold: 0.375});
        if (check.tooSimilar) {
            await editSwipe("");
            if (debug) console.warn(`[WQR] Too similar "${check.highestRisk}", score ${check.results[check.highestRisk].score}`);
        }
        DebugLog(`[P] Clear: ${(performance.now() - PerformanceStart).toFixed(4)}ms`);
    } catch (error) {
        console.error(`[WQR] Clear Error:`, error);
    }
}

function fCheck() {
    return getGlobalVariable("WTCreator") === "FFFox";
}
//#endregion

// SETUP

function registerSlashCommands() {
    try {
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'wuxxx',
            callback: async () => {await XXX();return '';}
        }));
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'wurostersb',
            callback: async () => {await RosterSB();return '';}
        }));
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'wucharper',
            callback: async () => {await CharPer();return '';}
        }));
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'wuspecialchar',
            callback: async () => {await SpecialChar();return '';}
        }));
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'wubg',
            callback: async () => {await BG();return '';}
        }));
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'wuautocostumes',
            callback: async () => {await AutoCostumes();return '';}
        }));
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'wuexpressions',
            callback: async () => {await Expressions();return '';}
        }));
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'wuopenworldcostumes',
            callback: async () => {await OpenWorldCostumes();return '';}
        }));
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'wusidecharacters',
            callback: async () => {await SideCharacters();return '';}
        }));
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'wusetschoolyear',
            callback: async (args, startingyear) => {
                if (typeof startingyear === 'string') {
                    await SetSchoolYear(startingyear);
                } else {
                    await SetSchoolYear();
                }
                return '';
            },
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'startingyear',
                    typeList: [ARGUMENT_TYPE.STRING],
                }),
            ],
        }));
    } catch (err) {
        DebugLog('Slash command registration failed', err);
    }
}

(async function () {
    eventSource.on(event_types.APP_READY, OnStartup);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, OnBeforeGeneration);
    eventSource.on(event_types.MESSAGE_SENT, OnUser);
    eventSource.on(event_types.MESSAGE_RECEIVED, OnAi);
    eventSource.on(event_types.CHAT_CHANGED, OnChatChanged);
    eventSource.on(event_types.CHAT_CREATED, OnNewChat);
    eventSource.on(event_types.MESSAGE_SWIPED, OnSwipe);
    DebugLog("Setup");
    registerSlashCommands();
})();