// lib/ui/apps/notes.js

import { noteTitle } from '../../notesStorage.js';

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Notes list screen.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{notes: Array, formatRelativeTime: (ts: number) => string}} state newest first
 */
export function renderNotesScreen(container, { notes, formatRelativeTime }) {
    const listMarkup = notes.length === 0
        ? '<div class="wp-empty-state"><i class="fa-solid fa-note-sticky wp-empty-state-icon"></i><div>Nothing here yet. Jot something down.</div></div>'
        : notes.map(note => `
<button type="button" class="wp-note-row" data-note-id="${escapeHtml(note.id)}">
    <span class="wp-note-row-title">${escapeHtml(noteTitle(note))}</span>
    <span class="wp-note-row-meta">${escapeHtml(formatRelativeTime(note.updatedAt))}</span>
</button>`).join('');
    container.innerHTML = `
<div class="wp-notes">
    <div class="wp-note-list">${listMarkup}</div>
    <button id="wp-note-add" class="wp-fab" title="New note"><i class="fa-solid fa-plus"></i></button>
</div>`;
}

/**
 * Single-note editor. Saves on input (debounced at the index.js layer via saveSettingsDebounced).
 * @param {HTMLElement} container #wp-screen-body
 * @param {{note: {id: string, text: string}}} state
 */
export function renderNoteEditorScreen(container, { note }) {
    container.innerHTML = `
<div class="wp-note-editor">
    <textarea id="wp-note-text" data-note-id="${escapeHtml(note.id)}" placeholder="Write something…">${escapeHtml(note.text)}</textarea>
    <div class="wp-note-editor-actions">
        <button id="wp-note-delete" class="menu_button wp-secondary-button" data-note-id="${escapeHtml(note.id)}"><i class="fa-solid fa-trash-can"></i> Delete</button>
    </div>
</div>`;
}
