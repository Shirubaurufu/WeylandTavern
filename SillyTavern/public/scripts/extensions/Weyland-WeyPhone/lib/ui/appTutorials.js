import { APP_TUTORIALS, TUTORIAL_CONTROLS, tutorialText } from './appTutorialContent.js';
import { renderRegistrar } from './apps/registrar.js';
import { ASSET_BASE_URL } from '../assetPaths.js';
export { APP_TUTORIALS } from './appTutorialContent.js';

function populateControlPreviews(guide, screen) {
    for (const preview of guide.querySelectorAll('[data-tour-control]')) {
        const source = screen.querySelector(TUTORIAL_CONTROLS[preview.dataset.tourControl][1]);
        if (!source) continue;
        const style = screen.ownerDocument.defaultView.getComputedStyle(source);
        const icon = source.querySelector('i');
        if (icon && !preview.querySelector('i')) {
            const copy = screen.ownerDocument.createElement('i');
            copy.className = icon.className;
            copy.setAttribute('aria-hidden', 'true');
            preview.prepend(copy, ' ');
        }
        for (const property of ['color', 'border-color', 'border-style', 'border-width', 'border-radius', 'font-family', 'font-weight', 'text-transform', 'letter-spacing']) preview.style.setProperty(property, style.getPropertyValue(property));
        if (!['rgba(0, 0, 0, 0)', 'transparent'].includes(style.backgroundColor)) preview.style.backgroundColor = style.backgroundColor;
    }
}

function renderCardExample(container, screen) {
    const doc = screen.ownerDocument, holder = doc.createElement('div');
    let card = screen.querySelector('.rg-card-wrap:has(.rg-card-character)');
    if (!card) {
        const item = { key: 'character:example', kind: 'character', id: 'example', name: 'Example character', species: 'NPC', summary: 'A downloaded character appears here.', owner: 'Example', active: true };
        renderRegistrar(holder, { tab: 'library', query: '', sort: 'name', page: 0, items: [], library: { items: [item], sources: [{ ...item, members: [] }], entryCount: 1 }, active: true });
        card = holder.querySelector('.rg-card-wrap');
    }
    container.replaceChildren();
    const caption = doc.createElement('figcaption');
    caption.textContent = 'Card preview — controls are shown for reference';
    const replica = card.cloneNode(true);
    for (const element of [replica, ...replica.querySelectorAll('*')]) {
        for (const attr of [...element.attributes]) if (attr.name === 'id' || attr.name.startsWith('data-') || attr.name.startsWith('on')) element.removeAttribute(attr.name);
        if (element.tagName === 'BUTTON') { element.tabIndex = -1; element.setAttribute('aria-hidden', 'true'); }
    }
    const shell = doc.createElement('div');
    shell.className = 'rg-app wp-tour-card-replica';
    shell.inert = true;
    shell.append(replica);
    container.append(caption, shell);
}

export function shouldShowAppTutorial(settings, appKey) {
    return Object.hasOwn(APP_TUTORIALS, appKey) && settings.ui?.appTutorials?.[appKey] !== 1;
}

const ACTIONS = '[data-rg-install], [data-rg-remove], [data-rg-toggle], [data-rg-action="active"], [data-rg-action="confirm"], [data-rg-action="scanUpdates"], #wp-understudy-run, #wp-understudy-apply, #wp-understudy-discard, #wp-understudy-refresh, #wp-pawxai-generate, .wp-pawxai-save, .wp-pawxai-delete-result, .wp-pawxai-delete-saved';

export function createAppTutorial({ panel, onFinish, prepareStep = () => {}, onClose = () => {} }) {
    let guide, appKey, page = 0, observer, highlighted, previousFocus;
    const screen = panel.querySelector('#wp-screen-body');
    function unhighlight() {
        highlighted?.classList.remove('wp-tour-target');
        highlighted = null;
    }
    function locate(scroll = false) {
        if (!guide) return;
        const step = APP_TUTORIALS[appKey].steps[page];
        // Settings is embedded above the guide, not a modal blocking the guide.
        screen.querySelectorAll('.rg-dialog[aria-modal]').forEach(dialog => dialog.removeAttribute('aria-modal'));
        const target = screen.querySelector(step.target);
        if (target !== highlighted) {
            unhighlight();
            highlighted = target;
            highlighted?.classList.add('wp-tour-target');
            scroll = true;
        }
        const missing = !target && step.missing;
        const body = missing || (step.empty && target?.matches('.rg-empty') ? step.empty : step.body);
        const copy = guide.querySelector('#wp-tour-body');
        if (copy.dataset.copy !== body) { copy.innerHTML = tutorialText(body); copy.dataset.copy = body; }
        const list = guide.querySelector('.wp-tour-bullets');
        if (list) list.hidden = Boolean(missing && !step.keepBullets);
        populateControlPreviews(guide, screen);
        const example = guide.querySelector('.wp-tour-example');
        if (example && (scroll || !example.firstChild)) renderCardExample(example, screen);
        // Scroll only the app, never the document or the dock.
        if (scroll && highlighted) {
            for (let ancestor = highlighted.parentElement; ancestor && ancestor !== screen; ancestor = ancestor.parentElement) {
                if (ancestor.scrollHeight <= ancestor.clientHeight || !/(auto|scroll)/.test(getComputedStyle(ancestor).overflowY)) continue;
                const bounds = ancestor.getBoundingClientRect(), item = highlighted.getBoundingClientRect();
                if (item.top < bounds.top || item.bottom > bounds.bottom) ancestor.scrollTop += item.top - bounds.top - 8;
            }
            const area = screen.getBoundingClientRect(), rect = highlighted.getBoundingClientRect();
            if (rect.top < area.top || rect.bottom > area.bottom) screen.scrollTop += rect.top - area.top - 8;
        }
    }
    function close() {
        if (!guide) return;
        const key = appKey;
        observer?.disconnect();
        panel.removeEventListener('click', onAppClick, true);
        panel.removeEventListener('keydown', onKey, true);
        unhighlight();
        guide.remove();
        guide = null;
        appKey = null;
        panel.classList.remove('wp-tour-active');
        onClose(key);
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    }
    function finish() {
        const key = appKey;
        close();
        onFinish(key);
    }
    function draw() {
        const tour = APP_TUTORIALS[appKey], step = tour.steps[page];
        guide.classList.toggle('wp-tour-welcome', Boolean(step.welcome));
        unhighlight();
        prepareStep(appKey, step.id);
        guide.innerHTML = `<section class="wp-tour-card" aria-label="${tour.name} walkthrough">
            <header><span>${tour.name} guide · ${page + 1} of ${tour.steps.length}</span><button type="button" data-tour="skip">Skip guide</button></header>
            <div class="wp-tour-copy">
            ${step.welcome ? `<div class="wp-tour-welcome-art"><img src="${ASSET_BASE_URL}/${tour.logo || 'registrar_seal.png'}" alt="${tour.name} logo" /></div>` : ''}
            <h2 id="wp-tour-title" tabindex="-1">${step.title}</h2><p id="wp-tour-body"></p>
            ${step.indented ? `<p class="wp-tour-indented">${tutorialText(step.indented)}</p>` : ''}
            ${step.paragraphs ? step.paragraphs.map(text => `<p>${tutorialText(text)}</p>`).join('') : ''}
            ${step.example ? '<figure class="wp-tour-example"></figure>' : ''}
            ${step.bullets ? `<ul class="wp-tour-bullets">${step.bullets.map(item => `<li>${tutorialText(item)}</li>`).join('')}</ul>` : ''}
            <p class="wp-tour-warning" role="status" hidden></p></div>
            <footer><button type="button" data-tour="back" ${page === 0 ? 'disabled' : ''}>Back</button><span class="wp-tour-track" aria-hidden="true"><span style="width:${100 * (page + 1) / tour.steps.length}%"></span></span><button type="button" class="wp-tour-next" data-tour="next">${page === tour.steps.length - 1 ? 'Finish guide' : 'Next'} <span aria-hidden="true">→</span></button></footer>
        </section>`;
        locate(true);
        guide.querySelector('#wp-tour-title').focus({ preventScroll: true });
    }
    function onKey(event) {
        if (event.key !== 'Escape') return;
        event.preventDefault(); event.stopPropagation(); finish();
    }
    function onAppClick(event) {
        if (guide.contains(event.target)) return;
        if (event.target.closest(ACTIONS) || event.target.closest('[data-rg-action="updateAll"]') || (appKey === 'mien' && event.target.closest('#wp-mien-apply, #wp-mien-fullscreen'))) {
            event.preventDefault(); event.stopImmediatePropagation();
            const warning = guide.querySelector('.wp-tour-warning');
            warning.hidden = false;
            warning.textContent = appKey === 'mien' ? 'Finish or skip the guide before setting an expression or opening full screen.' : 'Finish or skip the guide to use this action. The walkthrough does not generate content or change your downloads and saved results.';
            return;
        }
        // Opening a real card teaches the next step using the user's selected entry.
        if (appKey === 'registrar' && ['intro', 'browse', 'search'].includes(APP_TUTORIALS.registrar.steps[page].id) && event.target.closest('[data-rg-open]')) {
            queueMicrotask(() => { if (guide && appKey === 'registrar') { page = APP_TUTORIALS.registrar.steps.findIndex(step => step.id === 'detail'); draw(); } });
        }
    }
    return {
        close,
        navigate(view) {
            if (guide && view !== appKey && !(appKey === 'understudy' && view === 'understudy-settings')) close();
        },
        open(key) {
            if (!Object.hasOwn(APP_TUTORIALS, key) || (guide && appKey === key)) return;
            close();
            appKey = key; page = 0;
            previousFocus = panel.ownerDocument.activeElement;
            guide = panel.ownerDocument.createElement('div');
            guide.className = `wp-tour wp-tour-${key}`;
            screen.after(guide);
            panel.classList.add('wp-tour-active');
            guide.addEventListener('click', event => {
                const action = event.target.closest('[data-tour]');
                if (!action || action.disabled) return;
                if (action.dataset.tour === 'skip') return finish();
                if (action.dataset.tour === 'next') {
                    if (page === APP_TUTORIALS[appKey].steps.length - 1) return finish();
                    page++;
                } else if (action.dataset.tour === 'back') page = Math.max(0, page - 1);
                draw();
            });
            panel.addEventListener('click', onAppClick, true);
            panel.addEventListener('keydown', onKey, true);
            observer = new MutationObserver(() => locate());
            observer.observe(screen, { childList: true, subtree: true });
            draw();
        },
    };
}
