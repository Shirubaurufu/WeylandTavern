/** Fit the phone panel above the keyboard without rebuilding any editor fields. */
export function bindMobileViewport(modal) {
    const viewport = window.visualViewport;
    const mobile = window.matchMedia('(max-width: 700px)');
    const controller = new AbortController();
    const options = { signal: controller.signal };

    const update = () => {
        // Leave desktop dragging/resizing and mobile pinch zoom alone.
        if (!mobile.matches || (viewport && Math.abs(viewport.scale - 1) > 0.01)) {
            modal.style.removeProperty('--wlm-viewport-height');
            modal.style.removeProperty('--wlm-viewport-top');
            modal.classList.remove('wlm-mobile-editing');
            return;
        }

        // dvh follows browser chrome, but keyboards can shrink only the visual
        // viewport. Its offset also follows the browser panning a focused input.
        const height = viewport?.height ?? window.innerHeight;
        modal.style.setProperty('--wlm-viewport-height', `${height}px`);
        modal.style.setProperty('--wlm-viewport-top', `${viewport?.offsetTop ?? 0}px`);
        const editing = modal.querySelector('#wlm-editor')?.contains(document.activeElement)
            && document.activeElement?.matches('input, textarea');
        const cramped = height < 500 || window.innerHeight - height > 100;
        // Focusing Memories happens before its click. Keep its position stable
        // until that click runs, or restoring the toolbar moves it away from
        // the finger between pointer-down and pointer-up.
        const switchingList = document.activeElement?.id === 'wlm-mobile-expand-btn'
            && modal.classList.contains('wlm-mobile-editing');
        modal.classList.toggle('wlm-mobile-editing', Boolean(cramped && (editing || switchingList)));
    };

    viewport?.addEventListener('resize', update, options);
    viewport?.addEventListener('scroll', update, options);
    window.addEventListener('resize', update, options);
    mobile.addEventListener('change', update, options);
    modal.addEventListener('focusin', update, options);
    modal.addEventListener('pointerdown', event => {
        if (event.target.closest?.('#wlm-mobile-expand-btn')
            && modal.classList.contains('wlm-mobile-editing')) {
            // Keep the field focused until the button's click has arrived.
            // The toggle then dismisses the keyboard and reveals the list.
            event.preventDefault();
        }
    }, options);
    // During focusout activeElement can still be the old input. Check after
    // focus settles, including moves between the title and memory fields.
    modal.addEventListener('focusout', event => {
        if (event.relatedTarget?.id === 'wlm-mobile-expand-btn') return;
        queueMicrotask(update);
    }, options);
    update();
    return () => controller.abort();
}
