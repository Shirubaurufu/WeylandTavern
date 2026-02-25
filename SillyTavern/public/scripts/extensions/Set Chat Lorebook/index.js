import { getCurrentChatId, chat_metadata, saveMetadata } from "../../../script.js";
import { SlashCommandParser } from "../../slash-commands/SlashCommandParser.js";
import { SlashCommand } from "../../slash-commands/SlashCommand.js";
import { ARGUMENT_TYPE, SlashCommandNamedArgument } from "../../slash-commands/SlashCommandArgument.js";

// Change this to match the exact name of your bundled lorebook
const LOREBOOK_NAME = 'YourLorebookNameHere';

// The key ST uses to store the chat-bound lorebook in chat metadata
const METADATA_KEY = 'world_info';

const setChatLorebook = async (args) => {
    const chatId = getCurrentChatId();
    if (!chatId) {
        toastr.warning('Open a chat first');
        return '';
    }

    const name = args.name;
    if (!name) {
        toastr.warning('Provide a lorebook name');
        return '';
    }

    chat_metadata[METADATA_KEY] = name;
    await saveMetadata();
    $('.chat_lorebook_button').addClass('world_set');

    toastr.success(`Chat lorebook set to: ${name}`);
    return name;
};

jQuery(async () => {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'setchatlorebook',
        callback: setChatLorebook,
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'name',
                description: 'Name of the lorebook to attach to the current chat',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: true,
            }),
        ],
        helpString: 'Sets the chat-bound lorebook to an existing lorebook by name. Usage: <code>/setchatlorebook name=MyLorebook</code>',
    }));});
