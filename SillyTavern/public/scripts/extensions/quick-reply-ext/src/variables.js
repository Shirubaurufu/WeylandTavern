import { chat_metadata, event_types, eventSource, extension_prompt_roles, extension_prompt_types, saveSettingsDebounced, setExtensionPrompt } from "../../../../script.js";
import { extension_settings, saveMetadataDebounced } from "../../../extensions.js";
import { SlashCommandClosure } from "../../../slash-commands/SlashCommandClosure.js";
import { isTrueBoolean } from "../../../utils.js";

/**
 * Checks if a local variable exists.
 * @param {string} name Local variable name
 * @returns {boolean} True if the local variable exists, false otherwise
 */
export function existsLocalVariable(name) {
    // @ts-ignore
    return chat_metadata.variables && chat_metadata.variables[name] !== undefined;
}

/**
 * Deletes a local variable.
 * @param {string} name Variable name to delete
 * @param {boolean?} noSave
 * @returns {string} Empty string
 */
export function deleteLocalVariable(name, noSave=false) {
    if (!existsLocalVariable(name)) {
        return 'The local variable "${name}" does not exist.';
    }

    // @ts-ignore
    delete chat_metadata.variables[name];
    if (!noSave) saveMetadataDebounced();
    return '';
}

/**
 * @param {Array<string>} names 
 * @returns 
 */
export function deleteLocalVariables(names = []) {
    for (const name of names) {
        deleteLocalVariable(name, true);
    }
    saveMetadataDebounced();
    return '';
}

/**
 * Checks if a global variable exists.
 * @param {string} name Global variable name
 * @returns {boolean} True if the global variable exists, false otherwise
 */
export function existsGlobalVariable(name) {
    // @ts-ignore
    return extension_settings.variables.global && extension_settings.variables.global[name] !== undefined;
}

/**
 * Deletes a global variable.
 * @param {string} name Variable name to delete
 * @param {boolean?} noSave
 * @returns {string} Empty string
 */
export function deleteGlobalVariable(name, noSave=false) {
    if (!existsGlobalVariable(name)) {
        return '[WQR] The global variable "${name}" does not exist.';
    }

    // @ts-ignore
    delete extension_settings.variables.global[name];
    if (!noSave) saveSettingsDebounced();
    return '';
}

/**
 * @param {Array<string>} names 
 * @returns 
 */
export function deleteGlobalVariables(names = []) {
    for (const name of names) {
        deleteGlobalVariable(name, true);
    }
    saveMetadataDebounced();
    return '';
}

/**
 * @param {string} idArgument
 * @param {boolean?} noSave
 */
export function flushInject(idArgument, noSave=false) {
    // @ts-ignore
    if (!chat_metadata.script_injects) {
        return '';
    }

    // @ts-ignore
    for (const [id, inject] of Object.entries(chat_metadata.script_injects)) {
        if (idArgument && id !== idArgument) {
            continue;
        }

        const prefixedId = `script_inject_${id}`;
        setExtensionPrompt(prefixedId, '', inject.position, inject.depth, inject.scan, inject.role);
        // @ts-ignore
        delete chat_metadata.script_injects[id];
    }

    if (!noSave) saveMetadataDebounced();
    return '';
}

/**
 * @param {string} name
 * @param {any} value
 * @param {boolean?} noSave
 */
export function setLocalVariable(name, value, noSave=false) {
    if (!name) {
        return 'Variable name cannot be empty or undefined.';
    }

    // @ts-ignore
    if (!chat_metadata.variables) {
        // @ts-ignore
        chat_metadata.variables = {};
    }

    // @ts-ignore
    chat_metadata.variables[name] = value;

    if (!noSave) saveMetadataDebounced();
    return value;
}

/**
 * @param {string} name
 * @param {any} value
 * @param {boolean?} noSave
 */
export function setGlobalVariable(name, value, noSave=false) {
    if (!name) {
        return 'Variable name cannot be empty or undefined.';
    }

    // @ts-ignore
    extension_settings.variables.global[name] = value;

    if (!noSave) saveSettingsDebounced();
    return value;
}

/**
 * Converts a SlashCommandClosure to a filter function that returns a boolean.
 * @param {SlashCommandClosure} closure
 * @returns {() => Promise<boolean>}
 */
function closureToFilter(closure) {
    return async () => {
        try {
            const localClosure = closure.getCopy();
            localClosure.onProgress = () => { };
            const result = await localClosure.execute();
            return isTrueBoolean(result.pipe);
        } catch (e) {
            console.error('Error executing filter closure', e);
            return false;
        }
    };
}

/**
 * @param {{ id?: string; ephemeral?: string; position?: string; depth?: string; role?: string; scan?: string; filter?: SlashCommandClosure; }} args
 * @param {string} value
 */
export function inject(args, value) {
    const positions = {
        'before': extension_prompt_types.BEFORE_PROMPT,
        'after': extension_prompt_types.IN_PROMPT,
        'chat': extension_prompt_types.IN_CHAT,
        'none': extension_prompt_types.NONE,
    };
    const roles = {
        'system': extension_prompt_roles.SYSTEM,
        'user': extension_prompt_roles.USER,
        'assistant': extension_prompt_roles.ASSISTANT,
    };

    const id = String(args?.id ?? '') || Math.random().toString(36).substring(2);
    const ephemeral = isTrueBoolean(String(args?.ephemeral ?? ''));

    const defaultPosition = 'after';
    const defaultDepth = 4;
    const positionValue = args?.position ?? defaultPosition;
    const position = positions[positionValue] ?? positions[defaultPosition];
    const depthValue = Number(args?.depth ?? defaultDepth);
    const depth = isNaN(depthValue) ? defaultDepth : depthValue;
    const roleValue = typeof args?.role === 'string' ? args.role.toLowerCase().trim() : Number(args?.role ?? extension_prompt_roles.SYSTEM);
    const role = roles[roleValue] ?? extension_prompt_roles.SYSTEM;
    const scan = isTrueBoolean(String(args?.scan));
    const filter = args?.filter instanceof SlashCommandClosure ? args.filter.rawText : null;
    const filterFunction = args?.filter instanceof SlashCommandClosure ? closureToFilter(args.filter) : null;
    value = value || '';

    if (args?.filter && !String(filter ?? '').trim()) {
        throw new Error('Failed to parse the filter argument. Make sure it is a valid non-empty closure.');
    }

    const prefixedId = `script_inject_${id}`;

    if (!chat_metadata.script_injects) {
        chat_metadata.script_injects = {};
    }

    if (value) {
        const inject = { value, position, depth, scan, role, filter };
        chat_metadata.script_injects[id] = inject;
    } else {
        delete chat_metadata.script_injects[id];
    }

    setExtensionPrompt(prefixedId, String(value), position, depth, scan, role, filterFunction);
    saveMetadataDebounced();

    if (ephemeral) {
        let deleted = false;
        const unsetInject = () => {
            if (deleted) {
                return;
            }
            console.log('Removing ephemeral script injection', id);
            delete chat_metadata.script_injects[id];
            setExtensionPrompt(prefixedId, '', position, depth, scan, role, filterFunction);
            saveMetadataDebounced();
            deleted = true;
        };
        eventSource.once(event_types.GENERATION_ENDED, unsetInject);
        eventSource.once(event_types.GENERATION_STOPPED, unsetInject);
    }

    return id;
}