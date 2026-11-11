// lib/ui/apps/weystore.js
//
// WeyStore's screens. Pure rendering: takes the model from lib/weystore.js (buildStoreModel) plus
// a little view state and writes markup. Every control carries data-ws-action, which index.js
// handles in one place (handleWeyStoreAction), so nothing here touches settings.
//
// Three screens share one container:
//   Shelf     the whole store on one scrolling page (it is under 30 apps; no search, no charts),
//             every app a small poster in its own lettering and colours
//   My phone  a miniature of the home screen where a tap adds or removes an app, plus loadouts
//   App page  banner art, the honest facts (cost, needs, what it holds on this phone), and the button

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** weystore.css sits next to this module and is linked the first time the store opens, the same
 *  way customShift.css and errorHelp.css are, so the home screen never pays for it. */
function ensureStylesheet() {
    if (typeof document === 'undefined' || document.getElementById('wp-weystore-css')) return;
    const link = document.createElement('link');
    link.id = 'wp-weystore-css';
    link.rel = 'stylesheet';
    link.href = new URL('./weystore.css', import.meta.url).href;
    document.head.appendChild(link);
}

function iconMarkup(app, className = 'wp-ws-icon') {
    const inner = app.icon
        ? `<img src="${escapeHtml(app.icon)}" alt="" loading="lazy" />`
        : `<i class="${escapeHtml(app.iconFa ?? 'fa-solid fa-mobile-screen')}" aria-hidden="true"></i>`;
    return `<span class="${className}" style="--ws-accent:${escapeHtml(app.accent)}">${inner}</span>`;
}

// Last Smoke draws this same block-letter ember logo in its own lobby. Repeating the tiny renderer
// here keeps the store card on-brand without loading the whole game or substituting a lookalike
// typeface. The animated hot-pixel pass is intentionally omitted on the quieter store shelf.
const LAST_SMOKE_ANSI = {
    L: ['██╗     ', '██║     ', '██║     ', '██║     ', '███████╗', '╚══════╝'],
    A: [' █████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
    S: ['███████╗', '██╔════╝', '███████╗', '╚════██║', '███████║', '╚══════╝'],
    T: ['████████╗', '╚══██╔══╝', '   ██║   ', '   ██║   ', '   ██║   ', '   ╚═╝   '],
    M: ['███╗   ███╗', '████╗ ████║', '██╔████╔██║', '██║╚██╔╝██║', '██║ ╚═╝ ██║', '╚═╝     ╚═╝'],
    O: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
    K: ['██╗  ██╗', '██║ ██╔╝', '█████╔╝ ', '██╔═██╗ ', '██║  ██╗', '╚═╝  ╚═╝'],
    E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
    ' ': ['   ', '   ', '   ', '   ', '   ', '   '],
};
const LAST_SMOKE_ARMS = { '═': 'LR', '║': 'UD', '╗': 'LD', '╔': 'RD', '╝': 'LU', '╚': 'RU' };
let lastSmokeLogoNumber = 0;

function lastSmokeLogoMarkup() {
    const word = 'LAST SMOKE';
    const CW = 6, CH = 12, cx = 3, cy = 6, d = 1.5;
    const rows = [0, 1, 2, 3, 4, 5].map(row => [...word].map(char => LAST_SMOKE_ANSI[char][row]).join(''));
    const columns = Math.max(...rows.map(row => [...row].length));
    const id = `ws-last-smoke-${++lastSmokeLogoNumber}`;
    const stops = '<stop offset="0" stop-color="#3a0d14"/><stop offset=".25" stop-color="#3a0d14"/><stop offset=".25" stop-color="#6e1420"/><stop offset=".5" stop-color="#6e1420"/><stop offset=".5" stop-color="#d1263a"/><stop offset=".72" stop-color="#d1263a"/><stop offset=".72" stop-color="#e8622a"/><stop offset=".9" stop-color="#e8622a"/><stop offset=".9" stop-color="#efeadf"/><stop offset="1" stop-color="#efeadf"/>';
    const parts = [];
    rows.forEach((line, row) => {
        let rects = '', path = '';
        [...line].forEach((char, index) => {
            const x = index * CW, y = row * CH;
            if (char === '█') {
                rects += `<rect x="${x}" y="${y}" width="${CW}" height="${CH - 1}"/>`;
                return;
            }
            const arms = LAST_SMOKE_ARMS[char];
            if (!arms) return;
            if (arms === 'LR') path += `M${x} ${y + cy - d}h${CW}M${x} ${y + cy + d}h${CW}`;
            else if (arms === 'UD') path += `M${x + cx - d} ${y}v${CH}M${x + cx + d} ${y}v${CH}`;
            else {
                const sx = arms[0] === 'L' ? -1 : 1, sy = arms[1] === 'U' ? -1 : 1;
                const hx = sx < 0 ? x : x + CW, vy = sy < 0 ? y : y + CH;
                for (const offset of [-1, 1]) path += `M${hx} ${y + cy + offset * sy * d}H${x + cx + offset * sx * d}V${vy}`;
            }
        });
        parts.push(`<g fill="url(#${id})">${rects}</g><path class="wp-ws-last-smoke-shadow" d="${path}"/>`);
    });
    return `<span class="wp-ws-last-smoke-logo" role="img" aria-label="Last Smoke"><svg viewBox="-1 -1 ${columns * CW + 2} ${6 * CH + 2}" shape-rendering="crispEdges" aria-hidden="true"><defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${6 * CH}">${stops}</linearGradient></defs>${parts.join('')}</svg></span>`;
}

function posterWordmarkMarkup(app) {
    return app.key === 'last-smoke-demo'
        ? lastSmokeLogoMarkup()
        : `<span class="wp-ws-wordmark">${escapeHtml(app.label)}</span>`;
}

const COST_ICONS = {
    free: 'fa-solid fa-leaf',
    sync: 'fa-solid fa-rotate',
    message: 'fa-solid fa-bolt',
    unknown: 'fa-solid fa-puzzle-piece',
};

/** The small facts under an app's name: what it costs, and what it needs before it will open.
 *  The cost is spelled out. The "needs" is a single glyph with a tooltip, because a row is narrow
 *  and two worded chips wrapped onto a second line; the app page says it in full. */
function chipsMarkup(app) {
    const cost = app.listing.cost ?? { kind: 'unknown', label: '' };
    const chips = [];
    if (cost.label) chips.push(`<span class="wp-ws-chip wp-ws-chip-${escapeHtml(cost.kind)}"><i class="${COST_ICONS[cost.kind] ?? COST_ICONS.unknown}" aria-hidden="true"></i>${escapeHtml(cost.label)}</span>`);
    if (app.key === 'last-smoke-demo') chips.push('<span class="wp-ws-chip wp-ws-chip-demo">(DEMO)</span>');
    if (app.needsMembership) chips.push('<span class="wp-ws-chip wp-ws-chip-member" title="Opens with Paw Patrol Plus or Platinum"><i class="fa-solid fa-crown" aria-hidden="true"></i><span class="wp-ws-sr">Opens with Paw Patrol Plus or Platinum</span></span>');
    else if (app.needsRoleplay) chips.push('<span class="wp-ws-chip wp-ws-chip-needs" title="Needs a roleplay chat open"><i class="fa-solid fa-book-open" aria-hidden="true"></i><span class="wp-ws-sr">Needs a roleplay chat open</span></span>');
    return chips.join('');
}

/** The one button every app gets. Not installed = Get (unless the player's membership cannot
 *  open it, in which case a dimmed crown pill that adds nothing). Installed = Open. Mid-install = Adding. */
function ctaMarkup(app, { busyKey, size = '' } = {}) {
    const sizeClass = size ? ` wp-ws-cta-${size}` : '';
    const name = escapeHtml(app.label);
    if (busyKey === app.key) {
        return `<button type="button" class="wp-ws-cta wp-ws-cta-busy${sizeClass}" disabled aria-label="Adding ${name}"><span>Adding</span></button>`;
    }
    if (!app.installed && app.locked) {
        return `<button type="button" class="wp-ws-cta wp-ws-cta-membership${sizeClass}" disabled aria-label="${name} needs a Paw Patrol Plus or Platinum membership"><i class="fa-solid fa-crown" aria-hidden="true"></i><span>Members</span></button>`;
    }
    if (!app.installed) {
        return `<button type="button" class="wp-ws-cta wp-ws-cta-get${sizeClass}" data-ws-action="get" data-key="${escapeHtml(app.key)}" aria-label="Get ${name}"><span>Get</span></button>`;
    }
    return `<button type="button" class="wp-ws-cta wp-ws-cta-open${sizeClass}" data-ws-action="launch" data-key="${escapeHtml(app.key)}" aria-label="Open ${name}"><span>Open</span></button>`;
}

function heroMarkup(app, extra = '') {
    const { hero, heroPosition, heroTone } = app.listing;
    // An app with no banner (an extension that supplied none) gets one built from its accent and
    // its icon, so no page ever shows an empty box. A banner that fails to load falls back to the
    // same thing (see the error listener in renderWeyStoreScreen).
    const art = hero
        ? `<img class="wp-ws-hero-art" src="${escapeHtml(hero)}" alt="" style="object-position:${escapeHtml(heroPosition ?? '50% 50%')}" />`
        : '';
    // Spans, not divs: the spotlight puts this banner inside a <button>.
    return `<span class="wp-ws-hero${hero ? '' : ' is-plain'}${heroTone === 'dark' ? ' is-dark' : ''}" style="--ws-accent:${escapeHtml(app.accent)}">
        ${art}
        <span class="wp-ws-hero-plain" aria-hidden="true">${iconMarkup(app, 'wp-ws-icon wp-ws-icon-ghost')}</span>
        <span class="wp-ws-hero-shade" aria-hidden="true"></span>
        ${extra}
    </span>`;
}

function spotlightMarkup(model, view) {
    const app = model.spotlight ? model.byKey.get(model.spotlight.key) : null;
    if (!app) return '';
    return `<section class="wp-ws-spot ${posterClass(app.key)}" aria-label="${escapeHtml(model.spotlight.kicker)}">
        <button type="button" class="wp-ws-spot-open" data-ws-action="detail" data-key="${escapeHtml(app.key)}" aria-label="${escapeHtml(app.label)}: ${escapeHtml(app.listing.tagline)}">
            ${heroMarkup(app)}
            <span class="wp-ws-spot-copy">
                <span class="wp-ws-kicker">${escapeHtml(model.spotlight.kicker)}</span>
                <span class="wp-ws-spot-name">${posterWordmarkMarkup(app)}</span>
                <span class="wp-ws-spot-tagline">${escapeHtml(app.listing.tagline)}</span>
            </span>
        </button>
    </section>`;
}

/** A CSS-safe form of an app key, for the per-app poster class (wp-ws-p-<key>). */
const posterClass = key => `wp-ws-p-${String(key).toLowerCase().replace(/[^a-z0-9-]/g, '')}`;

/**
 * One app on the shelf, drawn as a small poster for that app: its banner art across the tile, a
 * dark wash of the art's own colour on the left so text stays readable, and the name set in the
 * app's own lettering (the .wp-ws-wordmark rules in weystore.css). Same idea as the feature tiles
 * in Aethel's Play menu, which is what Lucky pointed at (2026-11-09): every tile is a little poster,
 * not a row in a list.
 *
 * The whole poster opens the app's page; the Get/Open button sits on top of it as a sibling, never
 * inside, because a button cannot contain a button. `slim` listings (the small factory apps) get a
 * shorter poster so five utilities do not take up as much room as five headline apps.
 */
function posterMarkup(app, view) {
    const { listing } = app;
    const state = app.system ? '<span class="wp-ws-tag wp-ws-tag-builtin">Built in</span>'
        : app.fresh ? '<span class="wp-ws-tag wp-ws-tag-new">New</span>'
        : '';
    // No banner (an extension that supplied none): the poster draws the app's icon large on the
    // right instead, over a wash of its accent colour.
    const art = listing.hero
        ? `<img class="wp-ws-hero-art" src="${escapeHtml(listing.hero)}" alt="" loading="lazy" style="object-position:${escapeHtml(listing.posterPosition ?? '50% 42%')}" />`
        : '';
    return `<li class="wp-ws-poster ${posterClass(app.key)}${listing.slim ? ' is-slim' : ''}${app.installed ? '' : ' is-off'}" style="--ws-accent:${escapeHtml(app.accent)}">
        <span class="wp-ws-poster-art wp-ws-hero${listing.hero ? '' : ' is-plain'}" aria-hidden="true">
            ${art}
            <span class="wp-ws-hero-plain">${iconMarkup(app, 'wp-ws-icon wp-ws-icon-ghost')}</span>
        </span>
        <button type="button" class="wp-ws-poster-open" data-ws-action="detail" data-key="${escapeHtml(app.key)}">
            <span class="wp-ws-poster-title">${posterWordmarkMarkup(app)}${state}</span>
            <span class="wp-ws-poster-tagline">${escapeHtml(listing.tagline)}</span>
            <span class="wp-ws-chips">${chipsMarkup(app)}</span>
        </button>
    </li>`;
}

function shelfMarkup(shelf, model, view) {
    return `<section class="wp-ws-shelf" data-shelf="${escapeHtml(shelf.id)}">
        <header class="wp-ws-shelf-head">
            <h3>${escapeHtml(shelf.title)}</h3>
            <p>${escapeHtml(shelf.blurb)}</p>
        </header>
        <ul class="wp-ws-posters">${shelf.keys.map(key => posterMarkup(model.byKey.get(key), view)).join('')}</ul>
    </section>`;
}

function browseMarkup(model, view) {
    return `${spotlightMarkup(model, view)}
    ${model.shelves.map(shelf => shelfMarkup(shelf, model, view)).join('')}
    <p class="wp-ws-colophon">© 2026 Lucky Paw Inc</p>`;
}

function miniAppMarkup(app, { draggable = false } = {}) {
    const label = escapeHtml(app.label);
    const drag = draggable ? ` data-ws-drag-key="${escapeHtml(app.key)}" data-ws-drop-kind="app" data-ws-drop-key="${escapeHtml(app.key)}"` : '';
    if (app.system) {
        return `<span class="wp-ws-mini-app is-system"${drag} title="${label} is built in">
            ${iconMarkup(app)}<span class="wp-ws-mini-pin" aria-hidden="true"><i class="fa-solid fa-thumbtack"></i></span>
            <span class="wp-ws-mini-label">${label}</span>
        </span>`;
    }
    return `<span class="wp-ws-mini-app${app.installed ? '' : ' is-off'}"${drag}>
        ${iconMarkup(app)}
        ${app.installed || !app.locked
            ? `<button type="button" class="wp-ws-mini-mark" data-ws-action="toggle" data-key="${escapeHtml(app.key)}" aria-pressed="${app.installed}"
                aria-label="${app.installed ? `Remove ${label} from the phone` : `Add ${label} to the phone`}"><i class="fa-solid ${app.installed ? 'fa-minus' : 'fa-plus'}" aria-hidden="true"></i></button>`
            : `<span class="wp-ws-mini-mark wp-ws-mini-mark-member" title="Needs a Paw Patrol Plus or Platinum membership"><i class="fa-solid fa-crown" aria-hidden="true"></i><span class="wp-sr-only">Needs a Paw Patrol Plus or Platinum membership</span></span>`}
        <span class="wp-ws-mini-label">${label}</span>
    </span>`;
}

function miniFolderMarkup(id, folder, apps, open) {
    const label = escapeHtml(folder.name);
    return `<span class="wp-ws-mini-app wp-ws-mini-folder${open ? ' is-open' : ''}" data-ws-drag-folder="${escapeHtml(id)}" data-ws-drop-kind="folder" data-ws-folder-id="${escapeHtml(id)}">
        <button type="button" class="wp-ws-mini-folder-open" data-ws-action="folder" data-folder-id="${escapeHtml(id)}" aria-expanded="${open}">
            <span class="wp-ws-folder-preview">${apps.slice(0, 4).map(app => iconMarkup(app, 'wp-ws-folder-preview-icon')).join('')}</span>
            <span class="wp-ws-mini-label">${label}</span>
        </button>
        ${apps.length === 0 ? `<button type="button" class="wp-ws-mini-mark" data-ws-action="remove-folder" data-folder-id="${escapeHtml(id)}" data-ws-no-drag aria-label="Remove ${label} folder"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>` : ''}
    </span>`;
}

function phoneLayoutMarkup(model, view) {
    const folderId = view.folderId && model.layout.folders[view.folderId] ? view.folderId : '';
    const installed = new Set(model.apps.filter(app => app.installed).map(app => app.key));
    const used = new Set();
    // The store's own tile is not in model.apps (the shelf never lists it) but it is on the home
    // screen, so it has to be here or the player could never move it.
    const find = key => model.byKey.get(key) ?? (model.self?.key === key ? model.self : undefined);
    const appTiles = [];
    const folderTiles = [];
    for (const item of model.layout.order) {
        if (item.startsWith('folder:')) {
            const id = item.slice(7);
            const folder = model.layout.folders[id];
            const apps = (folder?.apps ?? []).map(find).filter(app => app?.installed);
            apps.forEach(app => used.add(app.key));
            if (apps.length >= 2 || id.startsWith('custom-')) folderTiles.push(miniFolderMarkup(id, folder, apps, id === folderId));
            else if (apps.length === 1) folderTiles.push(miniAppMarkup(apps[0], { draggable: true }));
        } else {
            const app = find(item);
            if (app?.installed) {
                used.add(app.key);
                appTiles.push(miniAppMarkup(app, { draggable: true }));
            }
        }
    }
    const dock = new Set(model.dockKeys ?? []);
    const strays = model.apps.filter(app => app.installed && !used.has(app.key) && !dock.has(app.key));
    appTiles.push(...strays.map(app => miniAppMarkup(app, { draggable: true })));
    const tiles = [...appTiles, ...folderTiles];

    const folder = folderId ? model.layout.folders[folderId] : null;
    const folderApps = (folder?.apps ?? []).map(find).filter(app => app?.installed);
    const editor = folder ? `<section class="wp-ws-folder-editor">
        <header><input class="wp-ws-folder-name" value="${escapeHtml(folder.name)}" maxlength="24" aria-label="Folder name" />
            <button type="button" data-ws-action="rename-folder" data-folder-id="${escapeHtml(folderId)}">Save name</button>
            <button type="button" data-ws-action="close-folder" data-folder-id="${escapeHtml(folderId)}">Done</button></header>
        <div class="wp-ws-folder-grid">${folderApps.map(app => miniAppMarkup(app, { draggable: true })).join('')}</div>
        <p>Drag an app out to move it. Drop an app on this folder's tile to add it here.</p>
    </section>` : '';
    // The dock, as on the real home screen: fixed tiles, so no drag handle and no drop target.
    const dockApps = (model.dockKeys ?? []).map(find).filter(Boolean);
    const dockRow = dockApps.length ? `<div class="wp-ws-mini-dock" role="group" aria-label="Dock">
        ${dockApps.map(app => miniAppMarkup(app)).join('')}
        <p>The dock stays put.</p>
    </div>` : '';
    return `<div class="wp-ws-mini" data-ws-drop-kind="home" role="group" aria-label="Apps on your phone">${tiles.join('')}</div>${dockRow}${editor}`;
}

function phoneMarkup(model, view) {
    const available = model.apps.filter(app => !app.installed);
    const folderCount = Object.keys(model.layout.folders).length;
    return `<section class="wp-ws-mine">
        <p class="wp-ws-lead">Drag apps and folders to arrange your home screen. On a touch screen, hold a tile for a moment first. Drop an app on a folder to move it inside; drag it back onto the home screen to take it out.</p>
        <div class="wp-ws-mine-tools">
            <button type="button" class="wp-ws-new-folder" data-ws-action="new-folder"${folderCount >= (model.folderLimit ?? 4) ? ' disabled title="Your home screen holds up to four folders"' : ''}>
                <i class="fa-solid fa-folder-plus" aria-hidden="true"></i>New folder
            </button>
        </div>
        ${phoneLayoutMarkup(model, view)}
        ${available.length ? `<header class="wp-ws-shelf-head"><h3>Available apps</h3><p>Tap + to put one back in its saved place.</p></header><div class="wp-ws-mini wp-ws-mini-available">${available.map(app => miniAppMarkup(app)).join('')}</div>` : ''}
        <header class="wp-ws-shelf-head">
            <h3>Loadouts</h3>
            <p>One tap to a different phone.</p>
        </header>
        <div class="wp-ws-loadouts">
            ${model.loadouts.map(loadout => `<button type="button" class="wp-ws-loadout" data-ws-action="loadout" data-loadout="${escapeHtml(loadout.id)}" aria-pressed="${model.activeLoadout === loadout.id}">
                <span class="wp-ws-loadout-name">${escapeHtml(loadout.label)}</span>
                <span class="wp-ws-loadout-blurb">${escapeHtml(loadout.blurb)}</span>
            </button>`).join('')}
        </div>
    </section>`;
}

function factMarkup(icon, label, value) {
    return `<div class="wp-ws-fact"><i class="${icon}" aria-hidden="true"></i><span class="wp-ws-fact-label">${escapeHtml(label)}</span><span class="wp-ws-fact-value">${escapeHtml(value)}</span></div>`;
}

function detailMarkup(app, model, view) {
    const { listing } = app;
    const cost = listing.cost ?? { kind: 'unknown', label: '' };
    const needs = app.needsMembership ? 'Paw Patrol Plus or Platinum'
        : app.needsRoleplay ? 'A roleplay chat open'
        : 'Nothing. Opens any time';
    const holding = app.footprint || 'Nothing saved yet';
    const pairs = (listing.pairs ?? []).map(key => model.byKey.get(key)).filter(Boolean);
    const removal = app.system
        ? 'This one is part of the phone itself, so it stays put.'
        : 'Removing it takes the tile off your home screen and nothing else. Everything you saved in it is kept, and it comes back exactly as you left it.';
    const demoActionNote = app.key === 'last-smoke-demo' && !app.installed
        ? '<span class="wp-ws-action-note">(DEMO)</span>'
        : '';
    return `<article class="wp-ws-detail ${posterClass(app.key)}" style="--ws-accent:${escapeHtml(app.accent)}">
        <div class="wp-ws-detail-top">
            ${heroMarkup(app, app.fresh ? '<span class="wp-ws-hero-flag">New arrival</span>' : '')}
            <button type="button" class="wp-ws-back" data-ws-action="back"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i>${view.tab === 'phone' ? 'My phone' : 'The shelf'}</button>
        </div>
        <header class="wp-ws-id">
            ${iconMarkup(app, 'wp-ws-icon wp-ws-icon-lg')}
            <div class="wp-ws-id-text">
                ${app.key === 'last-smoke-demo'
                    ? `<h2 class="wp-ws-detail-logo">${lastSmokeLogoMarkup()}</h2>`
                    : `<h2 class="wp-ws-wordmark">${escapeHtml(app.label)}</h2>`}
                <p>${escapeHtml(listing.tagline)}</p>
            </div>
        </header>
        <div class="wp-ws-actions">
            <span class="wp-ws-action-primary">${ctaMarkup(app, { ...view, size: 'wide' })}${demoActionNote}</span>
            ${app.installed && !app.system ? `<button type="button" class="wp-ws-remove" data-ws-action="remove" data-key="${escapeHtml(app.key)}">Remove</button>` : ''}
            ${app.system ? '<span class="wp-ws-builtin-note"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i>Built in</span>' : ''}
        </div>
        ${app.locked ? `<p class="wp-ws-locked"><i class="fa-solid fa-lock" aria-hidden="true"></i>${app.installed
            ? 'You can keep the tile on your phone, but it opens with a Paw Patrol Plus or Platinum membership.'
            : 'Adding this one takes a Paw Patrol Plus or Platinum membership.'}</p>` : ''}
        ${String(listing.about ?? '').split(/\n{2,}/).map(paragraph => paragraph.trim()).filter(Boolean)
            .map(paragraph => `<p class="wp-ws-about">${escapeHtml(paragraph)}</p>`).join('')}
        <div class="wp-ws-facts">
            ${factMarkup(COST_ICONS[cost.kind] ?? COST_ICONS.unknown, 'Costs', cost.label || 'Set by its extension')}
            ${factMarkup('fa-solid fa-key', 'Needs', needs)}
            ${factMarkup('fa-solid fa-box-archive', 'On your phone', app.installed ? holding : `Not installed${app.footprint ? `. Still holding ${app.footprint}` : ''}`)}
            ${factMarkup('fa-solid fa-location-dot', 'Lives in', app.home)}
        </div>
        ${listing.points?.length ? `<ul class="wp-ws-points">${listing.points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>` : ''}
        ${listing.note ? `<aside class="wp-ws-note"><span class="wp-ws-kicker">Good to know</span><p>${escapeHtml(listing.note)}</p></aside>` : ''}
        ${app.system ? '' : `<aside class="wp-ws-note wp-ws-note-quiet"><span class="wp-ws-kicker">If you remove it</span><p>${removal}</p></aside>`}
        ${pairs.length ? `<section class="wp-ws-pairs">
            <span class="wp-ws-kicker">Goes well with</span>
            <div class="wp-ws-pair-list">${pairs.map(pair => `<button type="button" class="wp-ws-pair" data-ws-action="detail" data-key="${escapeHtml(pair.key)}">${iconMarkup(pair)}<span>${escapeHtml(pair.label)}</span></button>`).join('')}</div>
        </section>` : ''}
    </article>`;
}

function snackMarkup(snack) {
    if (!snack?.text) return '';
    return `<div class="wp-ws-snack" role="status">
        <span>${escapeHtml(snack.text)}</span>
        ${snack.undo ? '<button type="button" data-ws-action="undo">Undo</button>' : ''}
    </div>`;
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {ReturnType<import('../../weystore.js').buildStoreModel>} model
 * @param {{tab?: 'browse'|'phone', detailKey?: string|null, busyKey?: string|null, snack?: {text: string, undo?: object}|null, entering?: boolean}} [view]
 */
export function renderWeyStoreScreen(container, model, view = {}) {
    ensureStylesheet();
    const tab = view.tab === 'phone' ? 'phone' : 'browse';
    const detailApp = view.detailKey ? model.byKey.get(view.detailKey) : null;
    const body = detailApp ? detailMarkup(detailApp, model, view)
        : tab === 'phone' ? phoneMarkup(model, view)
        : browseMarkup(model, view);
    // The masthead stays on the two top-level screens; an app page gives its banner the full width
    // and carries its own back pill (the phone's back button works too).
    const masthead = detailApp ? '' : `<header class="wp-ws-top">
        <div class="wp-ws-brand">
            <span class="wp-ws-mark">Wey<b>Store</b></span>
            <span class="wp-ws-count"><b>${model.installedCount}</b> of ${model.totalCount} on your phone</span>
            <button type="button" class="wp-ws-help" data-ws-action="help" aria-label="What is the WeyStore?"><i class="fa-solid fa-question" aria-hidden="true"></i></button>
        </div>
        <div class="wp-ws-tabs" role="tablist">
            <button type="button" role="tab" data-ws-action="tab" data-tab="browse" aria-selected="${tab === 'browse'}">The shelf</button>
            <button type="button" role="tab" data-ws-action="tab" data-tab="phone" aria-selected="${tab === 'phone'}">My phone</button>
        </div>
    </header>`;
    // data-ws-enter marks real navigation (a tab switch, opening or leaving an app page) so the CSS
    // entrance plays then and never on an in-place redraw like an install.
    container.innerHTML = `<div class="wp-ws" data-ws-screen="${detailApp ? 'detail' : tab}"${view.entering ? ' data-ws-enter' : ''}>
        ${masthead}
        <div class="wp-ws-body">${body}</div>
        ${snackMarkup(view.snack)}
    </div>`;
    // A banner that will not load (an extension pointed at a missing file, or the Last Smoke folder
    // is absent) swaps to the built-in accent banner. Image errors do not bubble, hence capture.
    // Registered once per container; the flag survives because the container outlives its markup.
    if (container.dataset && !container.dataset.wsHeroGuard && typeof container.addEventListener === 'function') {
        container.dataset.wsHeroGuard = 'true';
        container.addEventListener('error', event => {
            const art = event.target;
            if (!art?.classList?.contains('wp-ws-hero-art')) return;
            art.closest('.wp-ws-hero')?.classList.add('is-plain');
            art.remove();
        }, true);
    }
}
