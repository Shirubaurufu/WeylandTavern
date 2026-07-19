// lib/ltmShare.js
//
// Writes a shared texting conversation (lib/shareContext.js) into the chat-bound lorebook in
// Weyland-LTM's exact entry format — automationId "ltm:<uuid>", constant, before_char — so the
// entry shows up in the LTM panel with a working on/off toggle, WITHOUT Weyland-LTM needing to
// be installed (it's a plain chat-book World Info entry either way; ST injects it natively).
//
// The book naming/creation mirrors LTM's getOrCreateChatBookName (which itself mirrors ST's
// /getchatbook convention), so a chat that already has a bound lorebook — from LTM, the old
// STscript pipeline, or a manual attach — is reused, never duplicated.

import {
    loadWorldInfo,
    saveWorldInfo,
    createWorldInfoEntry,
    createNewWorldInfo,
    METADATA_KEY,
    world_names,
} from '../../../world-info.js';
import { findSharedLtmEntry } from './shareContext.js';

const chatBookCreationInFlight = new Map();

async function getOrCreateChatBookName(context) {
    const meta = context.chatMetadata;
    // The metadata binding is authoritative. world_names can briefly lag during reload/creation;
    // requiring both caused a second create attempt and ST's misleading "already exists" dialog.
    if (meta?.[METADATA_KEY]) return meta[METADATA_KEY];
    if (!context.chatId) throw new Error('Open a roleplay chat first — the share needs a chat to attach to.');
    if (!meta) throw new Error('The active roleplay chat has no metadata to attach a memory to.');

    const chatId = context.chatId;
    if (chatBookCreationInFlight.has(chatId)) return chatBookCreationInFlight.get(chatId);
    const creation = (async () => {
        try {
            const name = `Chat Book ${chatId}`.replace(/[^a-z0-9]/gi, '_').replace(/_{2,}/g, '_').substring(0, 64);
            // An interrupted attempt may have created this deterministic book without saving its
            // binding. Reattach it rather than asking ST to overwrite the existing lorebook.
            if (!(Array.isArray(world_names) && world_names.includes(name))) {
                await createNewWorldInfo(name);
            }
            meta[METADATA_KEY] = name;
            await context.saveMetadata();
            document.querySelectorAll('.chat_lorebook_button').forEach(el => el.classList.add('world_set'));
            return name;
        } finally {
            chatBookCreationInFlight.delete(chatId);
        }
    })();
    chatBookCreationInFlight.set(chatId, creation);
    return creation;
}

/**
 * Create or update the LTM-compatible lorebook entry owned by one WeyPhone thread.
 * @param {{title: string, content: string, shareId?: string}} args
 * @returns {Promise<{uid: string|number, updated: boolean, bookName: string}>}
 */
export async function saveShareAsLtmEntry({ title, content, shareId = '' }) {
    const context = SillyTavern.getContext();
    const bookName = await getOrCreateChatBookName(context);
    const book = await loadWorldInfo(bookName);
    if (!book) throw new Error(`Could not load lorebook "${bookName}"`);

    // Adopt a same-title entry made by the interrupted implementation on first re-share, then
    // use the stable WeyPhone thread id so different threads on the same day never collide.
    let entry = findSharedLtmEntry(book.entries, { title, shareId });
    const updated = Boolean(entry);
    if (!entry) {
        entry = createWorldInfoEntry(bookName, book);
        if (!entry) throw new Error('Could not create a lorebook entry');
        entry.automationId = `ltm:${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
        // Same defaults as Weyland-LTM's saveLTMEntry: always-on, injected before the character
        // definition, never triggering other entries, newest sorts last.
        const maxOrder = Math.max(0, ...Object.values(book.entries).map(e => e.order ?? 0));
        entry.order = maxOrder + 1;
        entry.constant = true;
        entry.position = 0; // before_char
        entry.preventRecursion = true;
        entry.addMemo = true;
    }
    entry.comment = title;
    entry.content = content;
    entry.disable = false;
    if (shareId) entry.weyphoneShareId = shareId;

    await saveWorldInfo(bookName, book, true);
    return { uid: entry.uid, updated, bookName };
}
