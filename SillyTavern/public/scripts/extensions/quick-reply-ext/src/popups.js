import { DOMPurify } from '../../../../lib.js';
import { substituteParams } from '../../../../script.js';
import { t } from '../../../i18n.js';
import { callGenericPopup, Popup, POPUP_RESULT, POPUP_TYPE } from '../../../popup.js';
import { SlashCommandClosure } from '../../../slash-commands/SlashCommandClosure.js';
import { delay } from '../../../utils.js';
import { resolveVariable } from '../../../variables.js';

/**
 * @param {{ header?: string, result?: boolean, scroll?: boolean, large?: boolean, wide?: boolean, wider?: boolean, transparent?: boolean, okButton?: string, cancelButton?: string}} args
 * @param {string} value
 */
export async function doPopup(args, value) {
    value = substituteParams(value);
    const safeBody = DOMPurify.sanitize(value || '');
    const safeHeader = args?.header && typeof args?.header === 'string' ? DOMPurify.sanitize(args.header) : null;
    const requestedResult = args?.result === true;

    /** @type {import('../../../popup.js').PopupOptions} */
    const popupOptions = {
        allowVerticalScrolling: args?.scroll !== false,
        large: args?.large === true,
        wide: args?.wide === true,
        wider: args?.wider === true,
        transparent: args?.transparent === true,
        okButton: args?.okButton !== undefined && typeof args?.okButton === 'string' ? args.okButton : 'Ok',
        cancelButton: args?.cancelButton !== undefined && typeof args?.cancelButton === 'string' ? args.cancelButton : null,
    };
    const result = await Popup.show.text(safeHeader, safeBody, popupOptions);
    return String(requestedResult ? result ?? '' : value);
}

/**
 * Displays a popup with buttons based on provided labels and handles button interactions.
 *
 * @param {object} args - Named arguments for the command
 * @param {string} args.labels - JSON string of an array of button labels
 * @param {string} [args.multiple=false] - Flag indicating if multiple buttons can be toggled
 * @param {string} text - The text content to be displayed within the popup
 *
 * @returns {Promise<string>} - A promise that resolves to a string of the button labels selected
 *                              If 'multiple' is true, returns a JSON string array of labels.
 *                              If 'multiple' is false, returns a single label string.
 */
export async function doButtons(args, text) {
    try {
        /** @type {string[]} */
        const buttons = JSON.parse(resolveVariable(args?.labels));

        if (!Array.isArray(buttons) || !buttons.length) {
            console.warn('[WQR] WARN: Invalid labels provided for /buttons command');
            return '';
        }

        /** @type {Set<number>} */
        const multipleToggledState = new Set();
        const multiple = args?.multiple === "true";

        // Map custom buttons to results. Start at 2 because 1 and 0 are reserved for ok and cancel
        const resultToButtonMap = new Map(buttons.map((button, index) => [index + 2, button]));

        return new Promise(async (resolve) => {
            const safeValue = DOMPurify.sanitize(substituteParams(text) || '');

            /** @type {Popup} */
            let popup;

            const buttonContainer = document.createElement('div');
            buttonContainer.classList.add('flex-container', 'flexFlowColumn', 'wide100p');

            const scrollableContainer = document.createElement('div');
            scrollableContainer.classList.add('scrollable-buttons-container');

            for (const [result, button] of resultToButtonMap) {
                const buttonElement = document.createElement('div');
                buttonElement.classList.add('menu_button', 'wide100p');

                if (multiple) {
                    buttonElement.classList.add('toggleable');
                    buttonElement.dataset.toggleValue = String(result);
                    buttonElement.addEventListener('click', async () => {
                        buttonElement.classList.toggle('toggled');
                        if (buttonElement.classList.contains('toggled')) {
                            multipleToggledState.add(result);
                        } else {
                            multipleToggledState.delete(result);
                        }
                    });
                } else {
                    buttonElement.classList.add('result-control');
                    buttonElement.dataset.result = String(result);
                }

                buttonElement.innerText = button;
                buttonContainer.appendChild(buttonElement);
            }

            scrollableContainer.appendChild(buttonContainer);

            const popupContainer = document.createElement('div');
            popupContainer.innerHTML = safeValue;
            popupContainer.appendChild(scrollableContainer);

            // Ensure the popup uses flex layout
            popupContainer.style.display = 'flex';
            popupContainer.style.flexDirection = 'column';
            popupContainer.style.maxHeight = '80vh'; // Limit the overall height of the popup

            popup = new Popup(popupContainer, POPUP_TYPE.TEXT, '', { okButton: multiple ? t`Ok` : t`Cancel`, allowVerticalScrolling: true });
            popup.show()
                // @ts-ignore
                .then((result => resolve(getResult(result))))
                .catch(() => resolve(''));

            /** @returns {string} @param {string|number|boolean} result */
            function getResult(result) {
                if (multiple) {
                    const array = result === POPUP_RESULT.AFFIRMATIVE ? Array.from(multipleToggledState).map(r => resultToButtonMap.get(r) ?? '') : [];
                    return JSON.stringify(array);
                }
                return typeof result === 'number' ? resultToButtonMap.get(result) ?? '' : '';
            }
        });
    } catch (err) {
        console.error(`[WQR] doButtons Error:`, err);
        return '';
    }
}

/**
 * @param {{ default?: string; large?: boolean; wide?: boolean; okButton?: string; rows?: number; onCancel?: { execute: () => any; }; onSuccess?: { execute: () => any; }; }} args
 * @param {string?} prompt
 */
export async function doInput(args, prompt="") {
    const safeValue = DOMPurify.sanitize(substituteParams(prompt || "") || '');
    const defaultInput = args?.default !== undefined && typeof args?.default === 'string' ? args.default : '';
    const popupOptions = {
        large: args?.large === true,
        wide: args?.wide === true,
        okButton: args?.okButton !== undefined && typeof args?.okButton === 'string' ? args.okButton : 'Ok',
        rows: args?.rows !== undefined && typeof args?.rows === 'number' ? isNaN(args.rows) ? 4 : args.rows : 4,
    };
    // Do not remove this delay, otherwise the prompt will not show up
    await delay(1);
    const result = await callGenericPopup(safeValue, POPUP_TYPE.INPUT, defaultInput, popupOptions);
    await delay(1);

    // Input will return null on nothing entered, and false on cancel clicked
    if (result === null || result === false) {
        // Veryify if a cancel handler exists and it is valid
        if (args?.onCancel) {
            if (!(args.onCancel instanceof SlashCommandClosure)) {
                return ""
            }
            await args.onCancel.execute();
        }
    } else {
        // Verify if an ok handler exists and it is valid
        if (args?.onSuccess) {
            if (!(args.onSuccess instanceof SlashCommandClosure)) {
                return ""
            }
            await args.onSuccess.execute();
        }
    }

    return String(result || '');
}