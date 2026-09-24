import { characters, chat, clearChat, deleteCharacterChatByName, getChat, getRequestHeaders, messageFormatting, saveCharacterDebounced, saveChatConditional, saveChatDebounced, this_chid } from "../../../../script.js";
import { hideChatMessageRange } from "../../../chats.js";
import { system_message_types } from "../../../system-messages.js";
import { sortMoments, timestampToMoment } from "../../../utils.js";
import { getCharacterID } from "./general.js";

/**
 * @typedef {Object} ChatMessage
 * @property {Object} extra
 * @property {string} mes
 * @property {number} swipe_id
 * @property {[]} swipe_info
 * @property {string[]} swipes
 * @property {string} name
 * @property {string} send_date
 * @property {boolean} is_user
 * @property {boolean} is_system
 */

/**
 * @param {{ names?: boolean; hidden?: boolean; role?: "system" | "assistant" | "user"}} args
 * @param {{ start?: number, end?: number}} range
 */
export async function getMessages(args, range) {
    const includeNames = args?.names || true;
    const includeHidden = args?.hidden || false;
    const role = args?.role;
    if (!range?.start) range.start = 0;
    if (!range?.end) range.end = chat.length - 1;

    if (!range) {
        console.warn(`[WQR] Invalid range provided for getMessages: ${range}`);
        return '';
    }

    const filterByRole = (/** @type {{ extra: { type: string; }; is_user: any; }} */ mes) => {
        if (!role) {
            return true;
        }

        const isNarrator = mes.extra?.type === system_message_types.NARRATOR;

        if (role === 'system') {
            return isNarrator && !mes.is_user;
        }

        if (role === 'assistant') {
            return !isNarrator && !mes.is_user;
        }

        if (role === 'user') {
            return !isNarrator && mes.is_user;
        }
        
        return false;
    };

    const processMessage = async (/** @type {number} */ mesId) => {
        const msg = chat[mesId];
        if (!msg) {
            return null;
        }

        if (role && !filterByRole(msg)) {
            return null;
        }

        if (!includeHidden && msg.is_system) {
            return null;
        }

        return includeNames ? `${msg.name}: ${msg.mes}` : msg.mes;
    };

    const messagePromises = [];

    for (let rInd = range.start; rInd <= range.end; ++rInd)
        messagePromises.push(processMessage(rInd));

    const messages = await Promise.all(messagePromises);

    return messages.filter(m => m !== null).join('\n\n');
}

/**
 * @param {"user" | "char" | "system" | undefined} role
 * @returns {ChatMessage | undefined}
 */
export function getFirstMessage(role = undefined) {
    switch (role) {
        case "user":
            return chat.find(message => message.is_user);
        case "char":
            return chat.find(message => !message.is_user && !message.is_system);
        case "system":
            return chat.find(message => message.is_system);
    }
    return chat[0];
}

/**
 * @param {"user" | "char" | "system" | undefined} role
 * @returns {ChatMessage | undefined}
 */
export function getLastMessage(role = undefined) {
    switch (role) {
        case "user":
            return chat.findLast(message => message.is_user);
        case "char":
            return chat.findLast(message => !message.is_user && !message.is_system);
        case "system":
            return chat.findLast(message => message.is_system);
    }
    return chat[chat.length-1];
}

/**
 * @param {{ start?: number, end?: number}} range
 * @param {string} name
 */
export async function hideMessages(range, name="") {
    if (!range?.start) range.start = chat.length - 1;
    if (!range?.end) range.end = chat.length - 1; 

    if (!range) {
        console.warn(`[WQR] Invalid range provided for hideMessages: ${range}`);
        return '';
    }

    const nameFilter = String(name ?? '').trim();
    await hideChatMessageRange(range.start, range.end, false, nameFilter);
    return '';
}

/**
 * @param {{ start?: number, end?: number}} range
 * @param {string} name
 */
export async function unhideMessages(range, name="") {
    if (!range?.start) range.start = chat.length - 1;
    if (!range?.end) range.end = chat.length - 1;

    if (!range) {
        console.warn(`[WQR] Invalid range provided for unhideMessagesd: ${range}`);
        return '';
    }

    const nameFilter = String(name ?? '').trim();
    await hideChatMessageRange(range.start, range.end, true, nameFilter);
    return '';
}

/**
 * @param {string} [characterName]
 * @returns 
 */
export async function getCharacterChatCount(characterName) {
    try {
        const characterID = characterName ? getCharacterID(characterName) : this_chid;
        if (!characterID) return;

        const response = await fetch('/api/chats/search', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                query: '',
                // @ts-ignore
                avatar_url: characters[characterID].avatar,
                group_id: null,
            }),
        });

        if (!response.ok) {
            throw new Error('Search failed');
        }

        const filteredData = await response.json();

        return filteredData.length;
    } catch (error) {
        console.error(`[WQR] getAllCharacterChats Error:`, error?.message);
    }
    
}

export function closeChat() {
    $('#option_close_chat').trigger('click');
}

/**
 * @param {string} [text]
 * @param {number} [messageID]
 * @param {number} [swipeID]
 */
export async function editSwipe(text="", messageID=-1, swipeID) {
    if (messageID < 0) messageID += chat.length;
    const mes = chat.at(messageID);
    mes.mes = text;
    if (mes.swipes) {
        mes.swipes[swipeID || (mes.swipe_id ?? 0)] = text;
    }
    document.querySelector(`#chat [mesid="${messageID}"] .mes_text`).innerHTML = messageFormatting(
        text,
        mes.name,
        mes.is_system,
        mes.is_user,
        messageID,
    );
    await saveChatConditional();
}

// Unused
async function revertChat() {
    await clearChat();
    chat.length = 0;

    const chatsResponse = await fetch('/api/characters/chats', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: characters[this_chid].avatar }),
    });

    if (chatsResponse.ok) {
        const chats = Object.values(await chatsResponse.json());
        chats.sort((a, b) => sortMoments(timestampToMoment(a.last_mes), timestampToMoment(b.last_mes)));
        try {
            // pick existing chat
            if (chats.length && typeof chats[1] === 'object') {
                characters[this_chid].chat = chats[1].file_name.replace('.jsonl', '');
                $('#selected_chat_pole').val(characters[this_chid].chat);
                saveCharacterDebounced();
                await getChat();
                await deleteCharacterChatByName(this_chid, chats[0].file_name.replace('.jsonl', ''))
            }
        } catch (error) {
            console.error(`[WQR] Failed to delete fake-new chat ${chats[0].file_name}`, error);
        }
    }
}