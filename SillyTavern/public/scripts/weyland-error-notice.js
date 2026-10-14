// A DOM event keeps the Formatter independent of WeyPhone's startup and navigation state.
export const ERROR_HELP_EVENT = 'weyland:open-error-help';
export const INTERRUPTED_TITLE = 'Message Interrupted';
export const INTERRUPTED_BODY = 'The AI was mid-analysis when it was interrupted, either by a content filter, API issue or your ISP.';

export function showMessageInterrupted() {
    const open = () => document.dispatchEvent(new CustomEvent(ERROR_HELP_EVENT, { detail: { articleId: 'interrupted' } }));
    const notice = toastr.warning(`${INTERRUPTED_BODY}<br><br>Tap this message for more information.`, INTERRUPTED_TITLE, {
        timeOut: 15000, extendedTimeOut: 10000, closeButton: true, escapeHtml: false,
        preventDuplicates: true, onclick: open,
    });
    // Toastr supports pointer activation; supply keyboard activation for the same destination.
    notice?.attr({ tabindex: '0', role: 'button', 'aria-label': 'Message Interrupted. Open error information.' });
    notice?.on('keydown', event => {
        if (event.target !== event.currentTarget) return; // Leave the close button's keys alone.
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
}
