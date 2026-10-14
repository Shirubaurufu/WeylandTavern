// "Peek at the expression" (the magnifying-glass button on mobile): the chat UI fades away, the portrait stays up for
// a few seconds, then the UI comes back. A tap anywhere brings it back at once.
//
// Why this exists: the button used to turn Visual Novel mode on and rewrite the Custom CSS box, then undo both with a
// timer. `/vn` is a toggle, so a second tap during the window (or a page that was backgrounded mid-peek) left VN mode
// switched on, and the saved Custom CSS in a global. Now the whole state is ONE attribute on <body>
// (`expression-peek`), styled by registrar-expressions/style.css. Nothing is saved anywhere, so a reload always
// returns to the normal UI, and there is nothing to toggle back.
//
// How the quick reply talks to us: its script sets `expression-peek="start"` on <body> (one /dom line). We watch that
// attribute, turn it into "true" and run the timer. Keeping the trigger in an attribute means no coupling to the
// button's title or id, and if this extension is missing the quick reply is simply a no-op.

const PEEK_ATTRIBUTE = 'expression-peek';
const ZOOM_ATTRIBUTE = 'expression-zoom';
const PEEK_MS = 3000;
// After a tap ends the peek, the click that belongs to that same tap must not reach the UI that just reappeared
// (it could press Send, swipe a message...). Long enough to cover the touch-to-click delay, short enough to forget.
const SWALLOW_CLICK_MS = 450;

let peeking = false;
let timer = null;
let previousZoom = null;
let swallowClickUntil = 0;

function hasVisiblePortrait() {
    return Boolean(document.querySelector('#registrar-expressions-container .registrar-expression-holder .registrar-expression-img[style*="display: block"]'));
}

function endPeek() {
    if (!peeking) return;
    peeking = false;
    clearTimeout(timer);
    timer = null;
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('visibilitychange', onVisibilityChange, true);
    window.removeEventListener('pagehide', endPeek, true);
    document.body.removeAttribute(PEEK_ATTRIBUTE);
    // Put the zoom flag back exactly as we found it (it is normally absent).
    if (previousZoom === null) document.body.removeAttribute(ZOOM_ATTRIBUTE);
    else document.body.setAttribute(ZOOM_ATTRIBUTE, previousZoom);
    previousZoom = null;
}

function onPointerDown(event) {
    // Capture phase: the tap is ours, not the chat's. Swallow it and its click, then give the UI back.
    event.preventDefault();
    event.stopPropagation();
    swallowClickUntil = Date.now() + SWALLOW_CLICK_MS;
    endPeek();
}

function onVisibilityChange() {
    // Phone locked or app switched mid-peek: don't wait for a timer the browser may never run.
    if (document.hidden) endPeek();
}

function swallowStrayClick(event) {
    if (Date.now() > swallowClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
    swallowClickUntil = 0;
}

function startPeek() {
    if (peeking) {
        // A second tap on the button while a peek is running: keep the peek exactly as it is (no restart, no extension).
        document.body.setAttribute(PEEK_ATTRIBUTE, 'true');
        return;
    }
    if (!hasVisiblePortrait()) {
        // Nothing to show: peeking would just blank the screen for three seconds.
        document.body.removeAttribute(PEEK_ATTRIBUTE);
        // @ts-ignore toastr is a page global
        if (typeof toastr !== 'undefined') toastr.info('There is no expression on screen to look at.');
        return;
    }
    peeking = true;
    previousZoom = document.body.getAttribute(ZOOM_ATTRIBUTE);
    document.body.setAttribute(ZOOM_ATTRIBUTE, 'true');
    document.body.setAttribute(PEEK_ATTRIBUTE, 'true');
    // Registered on the NEXT tick: the tap that started the peek is still finishing and must not end it.
    setTimeout(() => {
        if (!peeking) return;
        document.addEventListener('pointerdown', onPointerDown, true);
    }, 0);
    document.addEventListener('visibilitychange', onVisibilityChange, true);
    window.addEventListener('pagehide', endPeek, true);
    timer = setTimeout(endPeek, PEEK_MS);
}

export function initExpressionPeek() {
    // Always listening for the stray click, but it only acts inside the short window after a peek-ending tap.
    document.addEventListener('click', swallowStrayClick, true);

    // A stale value from a previous page can't exist (attributes die with the page), but be safe if one was written early.
    new MutationObserver(() => {
        if (document.body.getAttribute(PEEK_ATTRIBUTE) === 'start') startPeek();
    }).observe(document.body, { attributes: true, attributeFilter: [PEEK_ATTRIBUTE] });
}
