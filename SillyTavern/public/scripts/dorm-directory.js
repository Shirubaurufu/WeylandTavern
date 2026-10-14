// Dorm Layouts: a searchable Sterling Hall directory (home screen -> Dorm Layouts).
//
// Why: the page used to be three floor-plan images stacked in a ~460px chat column, where the room
// labels are too small to read and there was no way to find anyone. A player coming from Character
// Info (searchable) found it jarring. This keeps the plans (they ARE the page) and adds what was
// missing: search by name, nickname, room or roommate; floor tabs that show how many matches each
// floor has; the resident's room lit up on the plan; and a full-size view of the plan on demand.
//
// Look: matches Character Info (cast.weybooru.com), whose data it reads: polaroid portraits and
// names in the same handwriting (Mynerve, bundled in css/fonts), on the user's own theme colours.
// Data and parsing: dorm-directory-data.js. Styles: css/dorm-directory.css (loaded here, once).
//
// If either source can't be reached and nothing is cached, this throws and welcomeinfo.js falls
// back to the old markdown page, so the floor plans always show.

import { ROOM_BOX, ROOM_POSITIONS, matchesQuery, ordinal, parseDormMarkdown, parseResidents } from './dorm-directory-data.js';

const CAST_DATA_URL = 'https://cast.weybooru.com/data/data.json';
const DORM_MD_URL = 'https://raw.githubusercontent.com/FFFox-ST-Manager/Weylandpedia/main/dorm.md';
const CACHE_KEY = 'weyland-dorm-directory-v1';
const FETCH_TIMEOUT_MS = 15000;

let stylesheetLoaded = null;

function loadStylesheet() {
    if (!stylesheetLoaded) {
        stylesheetLoaded = new Promise(resolve => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/css/dorm-directory.css';
            link.onload = resolve;
            link.onerror = resolve;
            document.head.append(link);
        });
    }
    return stylesheetLoaded;
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

async function fetchWithTimeout(url, as) {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return as === 'json' ? response.json() : response.text();
}

function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}

function writeCache(value) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch { /* private mode / quota: cache is a convenience */ }
}

/** Fresh data when it can be had, the last good copy when it can't. */
async function loadDirectoryData() {
    const [cast, markdown] = await Promise.allSettled([fetchWithTimeout(CAST_DATA_URL, 'json'), fetchWithTimeout(DORM_MD_URL, 'text')]);
    const cached = readCache();
    const people = cast.status === 'fulfilled' ? parseResidents(cast.value) : cached?.people;
    const floors = markdown.status === 'fulfilled' ? parseDormMarkdown(markdown.value) : cached?.floors;
    if (!floors?.length) throw new Error('No floor plans available');
    const stale = cast.status !== 'fulfilled' || markdown.status !== 'fulfilled';
    if (!stale) writeCache({ people, floors });
    return { people: people ?? { residents: [], elsewhere: [] }, floors, stale };
}

/** Portrait, or the first letter on a soft tile when the cast site has no photo (yet). */
function portrait(person, className) {
    return person.image
        ? `<img class="${className}" src="${escapeHtml(person.image)}" alt="" loading="lazy" decoding="async" data-initial="${escapeHtml(person.first.charAt(0))}">`
        : `<span class="${className} dd-initial">${escapeHtml(person.first.charAt(0))}</span>`;
}

/** A missing photo becomes the initial tile instead of a broken-image icon. (error does not bubble: capture.) */
function swapBrokenPortraits(element) {
    element.addEventListener('error', (event) => {
        const img = event.target;
        if (!(img instanceof HTMLImageElement) || !img.dataset.initial) return;
        const tile = document.createElement('span');
        tile.className = `${img.className} dd-initial`;
        tile.textContent = img.dataset.initial;
        img.replaceWith(tile);
    }, true);
}

/**
 * Draws the directory into `container` (the #dormInfo section) and wires it up.
 * @param {HTMLElement} container
 */
export async function renderDormDirectory(container) {
    if (container.dataset.ddReady === 'true') return;
    await loadStylesheet();
    container.innerHTML = '<h2>Dorm Layouts</h2><div class="dd-loading"><i class="fa-solid fa-building fa-fade"></i> Unlocking Sterling Hall...</div>';

    const { people, floors, stale } = await loadDirectoryData();
    const { residents, elsewhere } = people;
    const floorNumbers = floors.map(f => f.floor);
    const state = {
        floor: floorNumbers.includes(2) ? 2 : floorNumbers[0], // the busiest floor first
        query: '',
        selected: null, // a room ("292") whose pin is lit
    };

    container.dataset.ddReady = 'true';
    container.innerHTML = `
        <div class="dd" data-floor="${state.floor}">
            <header class="dd-head">
                <div class="dd-title">
                    <span class="dd-eyebrow">Weyland University</span>
                    <h2>Sterling Hall</h2>
                    <span class="dd-script">resident directory</span>
                </div>
                <div class="dd-total"><b>${residents.length}</b><span>residents</span></div>
            </header>
            ${stale ? '<p class="dd-stale"><i class="fa-solid fa-cloud"></i> Showing your last saved copy; the latest could not be reached.</p>' : ''}
            <label class="dd-search">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <input type="search" placeholder="Find a resident, nickname or room..." aria-label="Search residents" autocomplete="off" spellcheck="false">
                <button type="button" class="dd-clear" aria-label="Clear search" hidden><i class="fa-solid fa-xmark"></i></button>
            </label>
            <div class="dd-floors" role="tablist" aria-label="Floors"></div>
            <figure class="dd-plan" tabindex="0" aria-label="Floor plan. Press Enter for a larger view.">
                <img class="dd-plan-img" alt="" decoding="async">
                <div class="dd-pins"></div>
                <button type="button" class="dd-expand" title="Open the full-size plan"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>
                <figcaption class="dd-plan-caption"></figcaption>
            </figure>
            <section class="dd-list">
                <div class="dd-list-head"><h3></h3><span class="dd-list-hint"></span></div>
                <div class="dd-cards"></div>
            </section>
            <details class="dd-elsewhere"${elsewhere.length ? '' : ' hidden'}>
                <summary><i class="fa-solid fa-signs-post"></i> Lives elsewhere <span class="dd-badge"></span></summary>
                <div class="dd-elsewhere-list"></div>
            </details>
        </div>`;

    const root = /** @type {HTMLElement} */ (container.querySelector('.dd'));
    const input = /** @type {HTMLInputElement} */ (root.querySelector('.dd-search input'));
    const clear = /** @type {HTMLButtonElement} */ (root.querySelector('.dd-clear'));
    const plan = /** @type {HTMLElement} */ (root.querySelector('.dd-plan'));
    const planImg = /** @type {HTMLImageElement} */ (root.querySelector('.dd-plan-img'));

    swapBrokenPortraits(root);

    const matching = () => residents.filter(r => matchesQuery(r, state.query));
    const floorOf = n => floors.find(f => f.floor === n);

    /**
     * Pins for one floor: a dot per occupied room; selected or matching rooms get a glowing ring.
     * Name tags: in the small inline plan only for the selected room (or a single match), because two
     * tags at that size cover each other; the full-size view has room to tag every lit room.
     */
    function pinsMarkup(floor, { tagAll = false } = {}) {
        const hits = new Set(state.query ? matching().map(r => r.room) : []);
        const onFloor = [...hits].filter(room => residents.some(r => r.room === room && r.floor === floor));
        const rooms = new Map();
        for (const r of residents.filter(r => r.floor === floor)) {
            if (!rooms.has(r.room)) rooms.set(r.room, []);
            rooms.get(r.room).push(r);
        }
        let html = '';
        for (const [room, people] of rooms) {
            const position = ROOM_POSITIONS[people[0].key];
            if (!position) continue;
            const [x, y] = position;
            const lit = room === state.selected || hits.has(room);
            const names = people.map(p => p.first).join(' & ');
            const tagged = lit && (tagAll || room === state.selected || (!state.selected && onFloor.length === 1));
            html += `<button type="button" class="dd-pin${lit ? ' is-lit' : ''}${state.query && !lit ? ' is-dim' : ''}" data-room="${escapeHtml(room)}"
                style="left:${x}%;top:${y}%;--box-w:${ROOM_BOX.width}%;--box-h:${ROOM_BOX.height}%" title="Room ${escapeHtml(room)}: ${escapeHtml(names)}" aria-label="Room ${escapeHtml(room)}, ${escapeHtml(names)}">
                <span class="dd-pin-ring"></span><span class="dd-pin-dot"></span>
                ${tagged ? `<span class="dd-tag${y < 22 ? ' is-below' : ''}${x > 82 ? ' is-left' : x < 18 ? ' is-right' : ''}">${people.map(p => portrait(p, 'dd-tag-face')).join('')}<span class="dd-tag-text"><b>${escapeHtml(names)}</b><small>Room ${escapeHtml(room)}</small></span></span>` : ''}
            </button>`;
        }
        return html;
    }

    function render() {
        const hits = matching();
        root.dataset.floor = String(state.floor);

        // Floor tabs, each with how many residents (or matches) it holds.
        root.querySelector('.dd-floors').innerHTML = floors.map(f => {
            const count = (state.query ? hits : residents).filter(r => r.floor === f.floor).length;
            return `<button type="button" role="tab" class="dd-floor${f.floor === state.floor ? ' is-active' : ''}${state.query && !count ? ' is-empty' : ''}" data-floor="${f.floor}" aria-selected="${f.floor === state.floor}">
                <span>${ordinal(f.floor)} floor</span><b>${count}</b></button>`;
        }).join('');

        // The plan.
        const current = floorOf(state.floor);
        if (planImg.dataset.src !== current.image) {
            planImg.dataset.src = current.image;
            plan.classList.add('is-loading');
            planImg.onload = () => plan.classList.remove('is-loading');
            planImg.src = current.image;
            planImg.alt = current.title;
        }
        root.querySelector('.dd-pins').innerHTML = pinsMarkup(state.floor);
        root.querySelector('.dd-plan-caption').innerHTML = `<span>${escapeHtml(current.title)}</span><span class="dd-plan-help"><i class="fa-solid fa-magnifying-glass-plus"></i> Tap to enlarge</span>`;

        // Who matches but lives outside Sterling Hall (shown in "Lives elsewhere" below).
        const away = elsewhere.filter(p => matchesQuery(p, state.query));

        // Resident cards: this floor normally; every match on every floor while searching.
        const shown = state.query ? hits : residents.filter(r => r.floor === state.floor);
        root.querySelector('.dd-list-head h3').textContent = state.query
            ? (hits.length ? `${hits.length} match${hits.length === 1 ? '' : 'es'}` : (away.length ? 'Not in Sterling Hall' : 'No one by that name here'))
            : `${ordinal(state.floor)} floor residents`;
        root.querySelector('.dd-list-hint').textContent = state.query ? '' : 'Tap someone to find their room';
        root.querySelector('.dd-cards').innerHTML = shown.length
            ? shown.map((r, i) => `
                <button type="button" class="dd-card${r.room === state.selected ? ' is-selected' : ''}" data-room="${escapeHtml(r.room)}" data-floor="${r.floor}" style="--tilt:${(i % 3 - 1) * 1.6}deg">
                    <span class="dd-polaroid">${portrait(r, 'dd-face')}</span>
                    <span class="dd-card-text">
                        <span class="dd-name">${escapeHtml(r.first)}</span>
                        ${r.name !== r.first ? `<span class="dd-fullname">${escapeHtml(r.name)}</span>` : ''}
                        ${r.roommates.length ? `<span class="dd-roommates"><i class="fa-solid fa-people-roof"></i> with ${escapeHtml(r.roommates.join(' & '))}</span>` : ''}
                    </span>
                    <span class="dd-room"><small>${state.query && r.floor !== state.floor ? `${ordinal(r.floor)} fl` : 'Room'}</small>${escapeHtml(r.room)}</span>
                </button>`).join('')
            : `<div class="dd-empty">${state.query && away.length
                ? `<i class="fa-solid fa-arrow-down"></i> ${away.length === 1 ? 'They live' : `${away.length} of them live`} outside Sterling Hall. See below.`
                : `<i class="fa-regular fa-face-meh"></i> ${state.query ? 'Try a first name, a nickname, or a room number.' : 'No residents listed on this floor yet.'}`}</div>`;

        // Lives elsewhere: always available, filtered and opened while searching.
        const details = /** @type {HTMLDetailsElement} */ (root.querySelector('.dd-elsewhere'));
        details.hidden = !away.length;
        details.querySelector('.dd-badge').textContent = String(away.length);
        if (state.query && away.length) details.open = true;
        details.querySelector('.dd-elsewhere-list').innerHTML = away.map(p => `
            <div class="dd-away">${portrait(p, 'dd-away-face')}<span><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.home)}</small></span></div>`).join('');

        clear.hidden = !state.query;
    }

    function selectRoom(room, floor) {
        state.selected = state.selected === room ? null : room;
        if (floor) state.floor = floor;
        render();
        if (state.selected && plan.getBoundingClientRect().top < 0) plan.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    input.addEventListener('input', () => {
        state.query = input.value;
        state.selected = null;
        const hits = matching();
        // Follow the matches: if this floor has none, show the floor that does.
        if (state.query && hits.length && !hits.some(r => r.floor === state.floor)) state.floor = hits[0].floor;
        render();
    });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && input.value) {
            event.stopPropagation();
            input.value = '';
            input.dispatchEvent(new Event('input'));
        }
        if (event.key === 'Enter') {
            const first = matching()[0];
            if (first) selectRoom(first.room, first.floor);
        }
    });
    clear.addEventListener('click', () => {
        input.value = '';
        input.dispatchEvent(new Event('input'));
        input.focus();
    });
    root.addEventListener('click', (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        const floorButton = target.closest('.dd-floor');
        if (floorButton) {
            state.floor = Number(floorButton.getAttribute('data-floor'));
            state.selected = null;
            render();
            return;
        }
        const card = target.closest('.dd-card');
        if (card) {
            selectRoom(card.getAttribute('data-room'), Number(card.getAttribute('data-floor')));
            return;
        }
        const pin = target.closest('.dd-pin');
        if (pin && !target.closest('.dd-lightbox')) {
            event.stopPropagation();
            selectRoom(pin.getAttribute('data-room'));
            return;
        }
        if (target.closest('.dd-plan')) openLightbox();
    });
    plan.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openLightbox();
        }
    });

    /** The plan at full size, with the same pins: the only way to actually read the room labels. */
    function openLightbox() {
        const current = floorOf(state.floor);
        const overlay = document.createElement('div');
        overlay.className = 'dd-lightbox';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', current.title);
        overlay.innerHTML = `
            <div class="dd-lightbox-bar">
                <span>${escapeHtml(current.title)}</span>
                <div class="dd-lightbox-floors">${floors.map(f => `<button type="button" data-floor="${f.floor}" class="${f.floor === state.floor ? 'is-active' : ''}">${ordinal(f.floor)}</button>`).join('')}</div>
                <button type="button" class="dd-lightbox-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="dd-lightbox-stage"><div class="dd-lightbox-plan"><img src="${escapeHtml(current.image)}" alt="${escapeHtml(current.title)}"><div class="dd-pins">${pinsMarkup(state.floor, { tagAll: true })}</div></div></div>`;
        const close = () => {
            overlay.classList.add('is-closing');
            document.removeEventListener('keydown', onKey, true);
            setTimeout(() => overlay.remove(), 160);
        };
        const onKey = (event) => {
            if (event.key === 'Escape') { event.stopPropagation(); close(); }
        };
        overlay.addEventListener('click', (event) => {
            const target = /** @type {HTMLElement} */ (event.target);
            const floorButton = target.closest('.dd-lightbox-floors button');
            if (floorButton) {
                state.floor = Number(floorButton.getAttribute('data-floor'));
                state.selected = null;
                render();
                overlay.remove();
                document.removeEventListener('keydown', onKey, true);
                openLightbox();
                return;
            }
            const pin = target.closest('.dd-pin');
            if (pin) {
                state.selected = state.selected === pin.getAttribute('data-room') ? null : pin.getAttribute('data-room');
                render();
                overlay.querySelector('.dd-lightbox-plan .dd-pins').innerHTML = pinsMarkup(state.floor, { tagAll: true });
                return;
            }
            if (target.closest('.dd-lightbox-close') || !target.closest('.dd-lightbox-plan, .dd-lightbox-bar')) close();
        });
        document.addEventListener('keydown', onKey, true);
        swapBrokenPortraits(overlay);
        document.body.append(overlay);
        overlay.querySelector('.dd-lightbox-close').focus();
    }

    render();
}
