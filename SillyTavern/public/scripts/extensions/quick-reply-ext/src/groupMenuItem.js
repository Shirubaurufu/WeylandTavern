import { quickReplyApi } from "../../quick-reply/index.js";

/**
 * "Add to group" entry in the chat-bar hamburger menu (#options).
 *
 * The Weyland "GroupAddButton" quick reply used to sit on the chat bar; it was hidden there
 * (isHidden in the Weyland QR set) to declutter the bar. This puts it back one click deeper,
 * right above ST's own "Convert to group", which is the step it needs first (the QR answers
 * "Convert Chat into a Group Chat First" in a solo chat).
 *
 * Only for the full UI: style.css hides it under body.streamlined-ui, because Streamlined UI
 * hides "Convert to group" too. Gating in CSS rather than here means it follows the body class
 * live, whenever Streamlined UI adds it, with no load-order race between the two extensions.
 *
 * The QR itself does everything else: the "who to add" prompt, blocking cards that can't join
 * groups (Kressa, Weybot, Kinsbane, Mirror, the pair/trio cards), and loading the added
 * character's personality.
 */
export function installGroupAddMenuItem() {
    const menu = document.querySelector('#options .options-content');
    if (!menu || document.getElementById('option_weyland_group_add')) {
        return;
    }

    const item = document.createElement('a');
    item.id = 'option_weyland_group_add';
    item.innerHTML = '<i class="fa-lg fa-solid fa-user-plus"></i><span>Add to group</span>';
    menu.insertBefore(item, document.getElementById('option_convert_to_group'));

    item.addEventListener('click', async () => {
        // ST binds its menu-closing handler to the #options items present at startup, so an
        // injected item closes the menu itself. Clicking the toggle (instead of hide()) keeps ST's
        // own "menu is open" flag in sync; otherwise the next hamburger click would do nothing.
        if (document.getElementById('options')?.style.display !== 'none') {
            document.getElementById('options_button')?.click();
        }
        const ctx = window.SillyTavern?.getContext?.();
        const inChat = (ctx?.characterId !== undefined && ctx?.characterId !== null && ctx?.characterId !== '')
            || !!ctx?.groupId;
        if (!inChat) {
            toastr.info('Open a chat first.', 'Add to group');
            return;
        }
        await quickReplyApi.executeQuickReply('Weyland', 'GroupAddButton');
    });
}
