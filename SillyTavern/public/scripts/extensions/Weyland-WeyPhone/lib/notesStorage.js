// lib/notesStorage.js

// CRUD for the Notes app, persisted in settings.ui.notes. Mirrors lib/storage.js's conversation
// conventions: id-keyed records, timestamp-sorted summaries, partial updates, no policy here.

let noteCounter = 0;
function genNoteId() {
    noteCounter++;
    return `note_${Date.now()}_${noteCounter}`;
}

function ensureNotes(settings) {
    if (!settings.ui) settings.ui = {};
    if (!Array.isArray(settings.ui.notes)) settings.ui.notes = [];
    return settings.ui.notes;
}

/**
 * @param {{ui?: {notes?: Array}}} settings
 * @param {{text?: string}} [fields]
 * @returns {{id: string, text: string, createdAt: number, updatedAt: number}}
 */
export function createNote(settings, { text = '' } = {}, now = Date.now()) {
    const notes = ensureNotes(settings);
    const note = { id: genNoteId(), text, createdAt: now, updatedAt: now };
    notes.push(note);
    return note;
}

/** @returns {Array} newest-updated first */
export function getNotes(settings) {
    return [...ensureNotes(settings)].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getNote(settings, id) {
    return ensureNotes(settings).find(n => n.id === id);
}

export function updateNote(settings, id, { text }, now = Date.now()) {
    const note = getNote(settings, id);
    if (!note) return undefined;
    if (typeof text === 'string') {
        note.text = text;
        note.updatedAt = now;
    }
    return note;
}

/** @returns {boolean} true if a note was removed */
export function deleteNote(settings, id) {
    const notes = ensureNotes(settings);
    const index = notes.findIndex(n => n.id === id);
    if (index === -1) return false;
    notes.splice(index, 1);
    return true;
}

/**
 * Display title = first non-empty line, clipped. Body preview = the rest.
 * @param {{text: string}} note
 */
export function noteTitle(note, maxLength = 40) {
    const firstLine = (note.text ?? '').split('\n').find(line => line.trim() !== '') ?? '';
    const title = firstLine.trim() || 'New note';
    return title.length > maxLength ? `${title.slice(0, maxLength - 1)}…` : title;
}
