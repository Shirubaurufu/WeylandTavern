import { chat_metadata, getCurrentChatId, saveMetadata, substituteParams } from "../../../../script.js";
import { t } from "../../../i18n.js";
import { findChar, getCharaFilename, isFalseBoolean, isTrueBoolean, onlyUnique, parseStringArray } from "../../../utils.js";
import { createNewWorldInfo, loadWorldInfo, METADATA_KEY, newWorldInfoEntryDefinition, newWorldInfoEntryTemplate, originalWIDataKeyMap, reloadEditor, saveWorldInfo, setWIOriginalDataValue, world_names } from "../../../world-info.js";
import { getContext } from "../../../extensions.js";
import { Fuse } from "../../../../lib.js";

/**
 * Gets the name of the chat-bound lorebook. Creates a new one if it doesn't exist.
 * @param {string} [chatbookName]
 * @param {boolean} [create]
 * @returns {Promise<string | undefined>} The name of the chat-bound lorebook
 */
export async function getCurrentChatbook(chatbookName,create=true) {
    if (!getCurrentChatId()) {
        // @ts-ignore
        toastr.warning(t`Open a chat to get a name of the chat-bound lorebook`);
        return '';
    }

    // @ts-ignore
    if (chat_metadata[METADATA_KEY] && world_names.includes(chat_metadata[METADATA_KEY])) {
        // @ts-ignore
        return chat_metadata[METADATA_KEY];
    }

    if (create) {
        const name = (() => {
            // Use the provided name if it's not in use
            if (chatbookName) {
                const name = String(chatbookName);
                if (world_names.includes(name)) {
                    throw new Error('This World Info file name is already in use');
                }
                return name;
            }

            // Replace non-alphanumeric characters with underscores, cut to 64 characters
            return `Chat Book ${getCurrentChatId()}`.replace(/[^a-z0-9]/gi, '_').replace(/_{2,}/g, '_').substring(0, 64);
        })();
        await createNewWorldInfo(name);

        // @ts-ignore
        chat_metadata[METADATA_KEY] = name;
        await saveMetadata();
        // @ts-ignore
        $('.chat_lorebook_button').addClass('world_set');
        return name;
    }
}

/**
 * @param {string} file
 * @param {string} field
 * @param {*} value
 */
export async function findLoreBookEntry(file, field, value) {
    const entries = await getEntriesFromFile(file);

    if (!entries) {
        return '';
    }

    if (typeof newWorldInfoEntryTemplate[field] === 'boolean') {
        const isTrue = isTrueBoolean(value);
        const isFalse = isFalseBoolean(value)

        if (isTrue) {
            value = String(true);
        }

        if (isFalse) {
            value = String(false);
        }
    }

    const fuse = new Fuse(entries, {
        keys: [{ name: field, weight: 1 }],
        includeScore: true,
        threshold: 0.3,
    });

    const results = fuse.search(value);

    if (!results || results.length === 0) {
        return '';
    }

    const result = results[0]?.item?.uid;

    if (result === undefined) {
        return '';
    }

    return result;
}

/**
 * @param {{ file: string; uid: number; field?: string; }} args
 * @param {*} value
 * @returns
 */
export async function setEntryField(args, value) {
    const file = args.file;
    const uid = args.uid;
    const field = args.field || 'content';
    const tags = getContext().tags;

    // characterFilter is an object with internal fields we need to access, which may also may be null and need to be populated
    // @ts-ignore
    const createCharacterFilterFieldObjectIfNeeded = (currentEntry) => {
        if (!currentEntry.characterFilter) {
            Object.assign(
                currentEntry,
                {
                    characterFilter: {
                        isExclude: false,
                        names: [],
                        tags: [],
                    },
                },
            );
        }
    };

    if (value === undefined) {
        return 'Value is required';
    }

    if (typeof value === "string") value = value.replace(/\\([{}|])/g, '$1');

    const data = await loadWorldInfo(file);

    if (!data || !('entries' in data)) {
        return 'Valid World Info file name is required';
    }

    // @ts-ignore
    const entry = data.entries[uid];

    if (!entry) {
        return 'Valid UID is required';
    }

    if (!Object.hasOwn(newWorldInfoEntryDefinition, field)) {
        return 'Valid field name is required';
    }

    // Init a default value for the field if it does not exist
    if (!Object.hasOwn(entry, field)) {
        entry[field] = newWorldInfoEntryDefinition[field].default;
    }

    // Use an array filter if it exists for the field
    const arrayFilter = newWorldInfoEntryDefinition[field]?.arrayFilter || (() => true);

    // handle special cases, otherwise execute default logic
    // @ts-ignore
    let tagNames;
    let charNames;
    switch (field) {
        case 'characterFilterNames':
            createCharacterFilterFieldObjectIfNeeded(entry);
            charNames = Array.isArray(value) ? value : parseStringArray(value);
            entry.characterFilter.names = charNames
                .map((name) => getCharaFilename(null, { manualAvatarKey: findChar({ name, allowAvatar: true, preferCurrentChar: false, quiet: true })?.avatar }))
                .filter(Boolean)
                .filter(onlyUnique);
            setWIOriginalDataValue(data, uid, 'character_filter', entry.characterFilter);
            break;
        case 'characterFilterTags':
            createCharacterFilterFieldObjectIfNeeded(entry);
            tagNames = Array.isArray(value) ? value : parseStringArray(value);
            //Find the tag objects corresponding to each name in the user array, then return an array of the corresponding IDs
            // @ts-ignore
            entry.characterFilter.tags = tags.filter((tag) => tagNames.includes(tag.name)).map((tag) => tag.id);
            setWIOriginalDataValue(data, uid, 'character_filter', entry.characterFilter);
            break;
        case 'characterFilterExclude':
            createCharacterFilterFieldObjectIfNeeded(entry);
            entry.characterFilter.isExclude = typeof value === "boolean" ? value : isTrueBoolean(value);;
            setWIOriginalDataValue(data, uid, 'character_filter', entry.characterFilter);
            break;
        default:
            if (Array.isArray(entry[field])) {
                entry[field] = (Array.isArray(value) ? value : parseStringArray(value)).filter(arrayFilter);
            } else if (typeof entry[field] === 'boolean') {
                entry[field] = typeof value === 'boolean' ? value : isTrueBoolean(value);
            } else if (typeof entry[field] === 'number') {
                entry[field] = typeof value === 'number' ? value : Number(value);
            } else {
                entry[field] = value;
            }

            // @ts-ignore
            if (originalWIDataKeyMap[field]) {
                // @ts-ignore
                setWIOriginalDataValue(data, uid, originalWIDataKeyMap[field], entry[field]);
            }
    }

    await saveWorldInfo(file, data);
    reloadEditor(file);
    return 'Finished';
}

/**
 * @param {number} uid
 * @param {string} file
 * @param {string} [field]
 */
export async function getEntryField(file, uid, field="content") {
    const tags = getContext().tags;

    const entries = await getEntriesFromFile(file);

    if (!entries) {
        return '';
    }

    const entry = entries.find(x => String(x.uid) === String(uid));

    if (!entry) {
        toastr.warning('Valid UID is required');
        return '';
    }

    if (!Object.hasOwn(newWorldInfoEntryDefinition, field)) {
        toastr.warning('Valid field name is required');
        return '';
    }

    // handle special cases, otherwise execute default logic
    let fieldValue;
    switch (field) {
        case 'characterFilterNames':
            if (entry.characterFilter) {
                fieldValue = entry.characterFilter.names;
            }
            break;
        case 'characterFilterTags':
            if (entry.characterFilter) {
                if (!entry.characterFilter.tags) {
                    return '';
                }
                //Find the tag objects corresponding to each ID in the array, then return the names
                fieldValue = tags.filter((tag) => entry.characterFilter.tags.includes(tag.id)).map((tag) => tag.name);
            }
            break;
        case 'characterFilterExclude':
            if (entry.characterFilter) {
                fieldValue = entry.characterFilter.isExclude;
            }
            break;
        default:
            fieldValue = entry[field] ?? newWorldInfoEntryDefinition[field]?.default;
    }

    if (fieldValue === undefined) {
        return '';
    }

    if (Array.isArray(fieldValue)) {
        return JSON.stringify(fieldValue.map(x => substituteParams(x)));
    }

    return substituteParams(String(fieldValue));
}

/**
 * @param {string} file
 */
export async function getEntriesFromFile(file) {
    if (!file || !world_names.includes(file)) {
        // @ts-ignore
        toastr.warning(t`Valid World Info file name is required`);
        return '';
    }

    const data = await loadWorldInfo(file);

    if (!data || !('entries' in data)) {
        // @ts-ignore
        toastr.warning(t`World Info file has an invalid format`);
        return '';
    }

    // @ts-ignore
    const entries = Object.values(data.entries);

    if (!entries || entries.length === 0) {
        // @ts-ignore
        toastr.warning(t`World Info file has no entries`);
        return '';
    }

    return entries;
}