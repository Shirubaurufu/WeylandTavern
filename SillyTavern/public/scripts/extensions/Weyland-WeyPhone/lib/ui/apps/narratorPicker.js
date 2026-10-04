// lib/ui/apps/narratorPicker.js
//
// The PromptOS Narrator tab's picker ("Slats"): four slanted slats side by side, flat and art-free. Picking
// one swings it open around that narrator's portrait, collapses the rest to spines, and drops a name plate
// (landscape art, subtitle, typed description slip, tags) underneath. Default has no art: it shows an empty
// chair, so a narrator's artwork is always the reward for choosing them.
//
// Presentation only. Which narrators exist, their order, labels and descriptions still come from
// NARRATOR_OPTIONS in lib/narrativeSettings.js, and picking one still goes through the existing
// `set-global-narrator` action in index.js (every slat carries data-narrative-action/data-value, so the
// existing click delegation needs no changes). Colors, art, subtitles and tags live here because they are
// look, not the variable/Quick Reply contract that file protects.
//
// MOTION, and why this file has an `after` hook: renderNarrativeSettingsScreen replaces innerHTML on every
// redraw, so a CSS transition has no "previous state" to start from. When `from` differs from `selected`
// the slats are painted in their PREVIOUS state first; playNarratorMotion() then forces a reflow and flips
// them to the new one, which gives the transitions a real start. index.js only passes `from` for
// the one optimistic draw right after a tap (see 'set-global-narrator'); every other redraw, including
// the final one when the rebuild finishes, passes none and draws the settled state with nothing replaying.
import { ASSET_BASE_URL } from '../../assetPaths.js';

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const ART = `${ASSET_BASE_URL}/narrators`;

// `tags` are the adjectives from each narrator's description, pulled out as stamps. `subtitle` is the epithet under
// the name. `focus` / `lfocus` are object-position crops for the portrait (inside its slat) / landscape (the plate's
// art panel): the landscapes are framed so the character sits in the right third of the plate, where no text is.
// Colors are sampled from each narrator's art; Default borrows PromptOS's own parchment + ember. `onAccent` is the
// readable text color for anything printed ON the accent.
const NARRATOR_LOOK = {
    Default: { tags: ['Objective', 'Balanced'], main: '#983132', accent: '#ff8c66', ink: '#2a0f0c', cream: '#f4e6d8', paper: '#e2c9b8' },
    Lauren: { subtitle: 'The Sunset Romantic', tags: ['Hopeful', 'Romantic', 'Unapologetic'], main: '#e8457f', accent: '#ffb27d', ink: '#3a1330', cream: '#fff4e8', paper: '#ffe9dc', art: 'lauren', focus: '48% 22%', lfocus: '76% 30%' },
    Lucky: { subtitle: 'The Glowing Ember', tags: ['Gritty', 'Witty', 'Balanced'], main: '#8f1d3c', accent: '#ff9b2f', ink: '#1a0c0d', cream: '#f4e7cf', paper: '#e9d6b6', art: 'lucky', focus: '50% 18%', lfocus: '55% 40%' },
    Salem: { subtitle: 'The Midnight Hour', tags: ['Dark', 'Emotional', 'Horror & angst'], main: '#6a4bd6', accent: '#d8294f', ink: '#0b0d1f', cream: '#ece4f3', paper: '#d8cbe0', art: 'salem', focus: '40% 20%', lfocus: '62% 50%' },
};
// A narrator added to NARRATOR_OPTIONS without a look here still works: it just gets Default's
// colors, no subtitle and no art, rather than breaking the whole Narrator tab.
const lookFor = id => NARRATOR_LOOK[id] ?? NARRATOR_LOOK.Default;

const vars = look => `--np-main:${look.main};--np-accent:${look.accent};--np-ink:${look.ink};--np-cream:${look.cream};--np-paper:${look.paper};--np-focus:${look.focus || '50% 20%'}`;

function statusLine(option, busy) {
    if (busy) return 'Applying…';
    return option.id === 'Default' ? 'No narrator set' : `${option.label} is narrating`;
}

// The ? explainer is a typed note: one paragraph per array entry, a "\n" inside an entry is a line break, and the
// last paragraph is the punchline (styled bigger in style.css).
function blurbHtml(blurb) {
    // a single string is one paragraph, so a caller passing plain text still works
    const paragraphs = Array.isArray(blurb) ? blurb : (blurb ? [blurb] : []);
    return paragraphs.map(text => `<p>${esc(text).replace(/\n/g, '<br>')}</p>`).join('');
}

/**
 * @param {object} p
 * @param {Array<{id:string,label:string,description:string}>} p.options  NARRATOR_OPTIONS
 * @param {string} p.selected  the narrator that is (or is becoming) the global default
 * @param {string} [p.from]    the previous narrator, only for the single animated draw after a tap
 * @param {boolean} [p.busy]   a prompt rebuild is running; show "Applying…" and ignore further taps
 * @param {string[]} [p.blurb] the "what is a narrator?" paragraphs, kept behind the ? chip
 */
export function narratorPickerHtml({ options, selected, from, busy = false, blurb = [] }) {
    const current = options.find(option => option.id === selected) ?? options[0];
    const look = lookFor(current.id);
    const animating = Boolean(from) && from !== current.id;
    // When animating, the slats start in the previous narrator's state (see the file header).
    const shown = animating ? from : current.id;
    return `
    <section class="wp-np" data-busy="${busy}" data-np-selected="${esc(current.id)}">
        <details class="wp-np-top">
            <summary class="wp-np-head" aria-label="Narrator. What is a narrator?">
                <span><span class="wp-np-k">Global default</span><span class="wp-np-title">Narrator</span></span>
                <span class="wp-np-help" aria-hidden="true">?</span>
            </summary>
            <div class="wp-np-blurb">${blurbHtml(blurb)}</div>
        </details>
        <div class="wp-np-stage" role="group" aria-label="Narrator" aria-busy="${busy}">
            ${options.map((option, index) => {
                const l = lookFor(option.id);
                return `
            <button type="button" class="wp-np-slat" data-narrative-action="set-global-narrator" data-value="${esc(option.id)}" aria-pressed="${option.id === shown}" aria-label="${esc(option.label)}" style="${vars(l)}">
                <span class="wp-np-slat-bg"></span>
                ${l.art
                    ? `<img class="wp-np-slat-art" src="${ART}/${l.art}-portrait.webp" alt="" draggable="false">`
                    : '<span class="wp-np-slat-void"><i><b>No<br>persona</b><small>just the story</small></i></span>'}
                <span class="wp-np-slat-idx">0${index + 1}</span>
                <span class="wp-np-slat-name">${esc(option.label)}</span>
                <span class="wp-np-slat-wipe"></span>
            </button>`;
            }).join('')}
        </div>
        <div class="wp-np-plate${animating ? ' wp-np-swap' : ''}" data-id="${esc(current.id)}" data-busy="${busy}" style="${vars(look)}">
            <div class="wp-np-plate-art">${look.art ? `<img src="${ART}/${look.art}-landscape.webp" alt="" draggable="false" style="object-position:${look.lfocus}">` : ''}</div>
            <div class="wp-np-plate-stripe"></div>
            <div class="wp-np-plate-body">
                <span class="wp-np-sub">Narrator</span>
                <h3 class="wp-np-name">${esc(current.label)}</h3>
                ${look.subtitle ? `<p class="wp-np-subtitle">${esc(look.subtitle)}</p>` : ''}
                <p class="wp-np-desc">${esc(current.description)}</p>
                <ul class="wp-np-tags">${look.tags.map(tag => `<li>${esc(tag)}</li>`).join('')}</ul>
                <div class="wp-np-status"><i></i><span>${esc(statusLine(current, busy))}</span></div>
            </div>
        </div>
    </section>`;
}

/** The "flip" half of the motion trick: commit the painted previous state, then switch to the new one. */
export function playNarratorMotion(container, selected) {
    // Tests render into a bare { innerHTML } object, which has no DOM to animate.
    if (typeof container?.querySelector !== 'function') return;
    const stage = container.querySelector('.wp-np-stage');
    if (!stage) return;
    void stage.offsetWidth;
    stage.querySelectorAll('.wp-np-slat').forEach(slat => {
        const on = slat.dataset.value === selected;
        slat.setAttribute('aria-pressed', String(on));
        if (on) slat.classList.add('wp-np-just');
    });
}
