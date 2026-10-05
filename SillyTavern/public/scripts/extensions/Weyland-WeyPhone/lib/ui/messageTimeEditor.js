import { getMessageTime, setMessageTime } from '../messageTime.js';

export function closeMessageTimeEditor(panel) {
    panel?.querySelector('.wp-time-overlay')?.remove();
}

export function showMessageTimeEditor(panel, message, onSave, options = {}) {
    closeMessageTimeEditor(panel);
    const origin = document.activeElement;
    const stored = getMessageTime(message, options);
    const overlay = document.createElement('div');
    overlay.className = 'wp-time-overlay';
    overlay.innerHTML = `<div class="wp-time-dialog" role="dialog" aria-modal="true" aria-labelledby="wp-time-title">
        <h3 id="wp-time-title">Edit message</h3>
        <label class="wp-message-content-label">Message<textarea class="wp-message-content-input" rows="4"></textarea></label>
        <div class="wp-time-fields">
            <label>Date (optional)<input class="wp-time-date" type="date"></label>
            <label>Time<input class="wp-time-input" type="time"></label>
        </div>
        <div class="wp-time-error" role="alert"></div>
        <button type="button" class="wp-time-save">Save changes</button>
        <button type="button" class="wp-message-delete">Delete message</button>
        <button type="button" class="wp-time-cancel">Cancel</button>
    </div>`;
    const contentInput = overlay.querySelector('.wp-message-content-input');
    contentInput.value = String(message.content ?? '');
    const timeInput = overlay.querySelector('.wp-time-input');
    const dateInput = overlay.querySelector('.wp-time-date');
    if (stored.minutes !== null) timeInput.value = `${String(Math.floor(stored.minutes / 60)).padStart(2, '0')}:${String(stored.minutes % 60).padStart(2, '0')}`;
    dateInput.value = stored.date;
    const initialTime = timeInput.value;
    const initialDate = dateInput.value;
    const close = () => { overlay.remove(); if (origin?.isConnected) origin.focus(); };
    overlay.querySelector('.wp-time-save').addEventListener('click', () => {
        if (!timeInput.reportValidity() || !dateInput.reportValidity()) return;
        // Content-only edits must preserve unknown/legacy clocks and never invent a scene time.
        const timeChanged = timeInput.value !== initialTime || dateInput.value !== initialDate;
        if (timeChanged && !setMessageTime(message, timeInput.value, dateInput.value)) {
            overlay.querySelector('.wp-time-error').textContent = 'Enter a valid date and time.';
            return;
        }
        message.content = contentInput.value;
        onSave();
        close();
    });
    overlay.querySelector('.wp-message-delete').addEventListener('click', () => {
        options.onDelete?.();
        close();
    });
    overlay.querySelector('.wp-time-cancel').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.stopPropagation(); close(); }
        if (event.key === 'Tab') {
            const controls = [...overlay.querySelectorAll('textarea, input, button')];
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
    panel.appendChild(overlay);
    contentInput.focus();
}

/** Delegated gestures survive conversation rerenders. Scrolling cancels a pending hold. */
export function initMessageTimeGestures(container, onOpen) {
    let timer, target, pointer, x, y, consumed = null;
    const cancel = () => { clearTimeout(timer); target = null; };
    const bubbleFor = event => event.target.closest('.wp-message[data-index]:not(.wp-message-editing):not(.wp-message-selectable)');
    container.addEventListener('pointerdown', event => {
        cancel(); consumed = null;
        if (event.button !== 0 || event.target.closest('button, input, textarea, a')) return;
        target = bubbleFor(event);
        if (!target) return;
        pointer = event.pointerId; x = event.clientX; y = event.clientY;
        const held = target;
        timer = setTimeout(() => {
            if (!held.isConnected) return;
            consumed = held; cancel(); onOpen(Number(held.dataset.index));
        }, 550);
    });
    container.addEventListener('pointermove', event => {
        if (event.pointerId === pointer && Math.hypot(event.clientX - x, event.clientY - y) > 10) cancel();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => container.addEventListener(type, cancel));
    container.addEventListener('scroll', cancel, true);
    container.addEventListener('click', event => {
        if (consumed && event.target.closest('.wp-message') === consumed) {
            consumed = null; event.preventDefault(); event.stopImmediatePropagation(); return;
        }
        consumed = null;
    }, true);
    container.addEventListener('contextmenu', event => {
        const bubble = bubbleFor(event);
        if (!bubble || event.target.closest('a, textarea, input')) return;
        event.preventDefault(); cancel(); onOpen(Number(bubble.dataset.index));
    });
    container.addEventListener('keydown', event => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
        const bubble = bubbleFor(event);
        if (!bubble) return;
        event.preventDefault(); onOpen(Number(bubble.dataset.index));
    });
}
