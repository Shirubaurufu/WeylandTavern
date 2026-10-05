import { catnipRecipes } from '../copycatInstructions.js';

export function closeCatnipJar(panel) {
    panel?.querySelector('.wp-catnip-overlay')?.remove();
}

export function showCatnipJar(panel, { getConfig, save, getOnce, setOnce, note = '', onClose }) {
    closeCatnipJar(panel);
    const origin = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'wp-catnip-overlay';
    overlay.innerHTML = `<section class="wp-catnip-dialog" role="dialog" aria-modal="true" aria-labelledby="wp-catnip-title">
        <header class="wp-catnip-header"><h2 id="wp-catnip-title"><i class="fa-solid fa-jar" aria-hidden="true"></i> Catnip Jar</h2><button type="button" class="wp-catnip-close" aria-label="Close Catnip Jar"><i class="fa-solid fa-xmark"></i></button></header>
        <p class="wp-catnip-description">Save your secret spices here for future use.~</p>
        <div class="wp-catnip-list"></div>
        <button type="button" class="wp-catnip-new"><i class="fa-solid fa-plus"></i> New recipe</button>
        <form class="wp-catnip-form" hidden>
            <h3>New recipe</h3>
            <label>Name<input name="name" maxlength="80" required placeholder="Name your recipe"></label>
            <label>Instructions<textarea name="instructions" rows="4" maxlength="6000" required placeholder="Your secret spices…"></textarea></label>
            <label class="wp-catnip-auto">Automatically apply<span class="wp-copycat-switch"><input name="auto" type="checkbox"><i></i></span></label>
            <div class="wp-catnip-actions"><button type="submit" class="wp-catnip-save"><i class="fa-solid fa-check"></i> Save recipe</button><button type="button" class="wp-catnip-cancel"><i class="fa-solid fa-xmark"></i> Cancel</button></div>
        </form>
        <p class="wp-catnip-status" role="status"></p>
    </section>`;
    const list = overlay.querySelector('.wp-catnip-list');
    const form = overlay.querySelector('form');
    const status = overlay.querySelector('.wp-catnip-status');
    let editingId = null;
    const node = (tag, text, className) => {
        const el = document.createElement(tag); if (text !== undefined) el.textContent = text;
        if (className) el.className = className; return el;
    };
    const button = (label, icon, action) => {
        const el = node('button'); el.type = 'button';
        const mark = node('i', undefined, `fa-solid fa-${icon}`); mark.setAttribute('aria-hidden', 'true');
        el.append(mark, document.createTextNode(` ${label}`)); el.addEventListener('click', action); return el;
    };
    const edit = recipe => {
        editingId = recipe?.id ?? null; form.reset();
        form.querySelector('h3').textContent = recipe ? 'Edit recipe' : 'New recipe';
        form.elements.namedItem('name').value = recipe?.name ?? '';
        form.elements.namedItem('instructions').value = recipe?.instructions ?? note;
        form.elements.namedItem('auto').checked = recipe?.auto ?? false;
        form.hidden = false; form.elements.namedItem('name').focus();
    };
    const update = recipes => { getConfig().catnipRecipes = recipes; save(); };
    const render = () => {
        list.replaceChildren();
        const recipes = catnipRecipes(getConfig());
        if (!recipes.length) list.append(node('p', 'Your jar is empty. Add your first recipe below.', 'wp-catnip-empty'));
        for (const recipe of recipes) {
            const card = node('section', undefined, 'wp-catnip-recipe');
            card.append(node('h3', recipe.name), node('p', recipe.instructions));
            const auto = node('label', undefined, 'wp-catnip-auto');
            auto.append(node('span', 'Automatically apply'));
            const toggle = node('span', undefined, 'wp-copycat-switch');
            const input = node('input'); input.type = 'checkbox'; input.checked = recipe.auto;
            input.setAttribute('aria-label', `Automatically apply ${recipe.name}`);
            input.addEventListener('change', () => {
                update(catnipRecipes(getConfig()).map(r => r.id === recipe.id ? { ...r, auto: input.checked } : r));
                if (input.checked) setOnce(getOnce().filter(id => id !== recipe.id));
                render(); list.querySelector(`[data-recipe-toggle="${CSS.escape(recipe.id)}"]`)?.focus();
            });
            input.dataset.recipeToggle = recipe.id;
            toggle.append(input, node('i')); auto.append(toggle); card.append(auto);
            const actions = node('div', undefined, 'wp-catnip-actions');
            const queued = getOnce().includes(recipe.id);
            const once = button(queued ? 'Queued once' : 'Use once', queued ? 'check' : 'leaf', () => {
                setOnce(queued ? getOnce().filter(id => id !== recipe.id) : [...getOnce(), recipe.id]);
                render(); status.textContent = queued ? 'Recipe removed from the next rewrite.' : 'Recipe queued for your next manual rewrite of this reply.';
            });
            once.disabled = recipe.auto; once.setAttribute('aria-pressed', String(queued));
            actions.append(once, button('Edit', 'pen', () => edit(recipe)), button('Delete', 'trash-can', () => {
                update(catnipRecipes(getConfig()).filter(r => r.id !== recipe.id));
                setOnce(getOnce().filter(id => id !== recipe.id));
                if (editingId === recipe.id) form.hidden = true;
                render(); status.textContent = 'Recipe deleted.';
                const undo = button('Undo', 'rotate-left', () => { update([...catnipRecipes(getConfig()), recipe]); render(); status.replaceChildren(); });
                status.append(' ', undo);
            }));
            card.append(actions); list.append(card);
        }
    };
    const close = () => { overlay.remove(); onClose?.(); if (origin?.isConnected) origin.focus(); else panel.querySelector('#wp-catnip-open')?.focus(); };
    overlay.querySelector('.wp-catnip-close').addEventListener('click', close);
    overlay.querySelector('.wp-catnip-new').addEventListener('click', () => edit(null));
    overlay.querySelector('.wp-catnip-cancel').addEventListener('click', () => { form.hidden = true; overlay.querySelector('.wp-catnip-new').focus(); });
    form.addEventListener('submit', event => {
        event.preventDefault(); event.stopPropagation();
        const name = form.elements.namedItem('name').value.trim();
        const instructions = form.elements.namedItem('instructions').value.trim();
        if (!name || !instructions) { status.textContent = 'Add a name and instructions before saving.'; return; }
        const recipe = { id: editingId ?? crypto.randomUUID(), name, instructions, auto: form.elements.namedItem('auto').checked };
        const recipes = catnipRecipes(getConfig()); const index = recipes.findIndex(r => r.id === editingId);
        if (index < 0) recipes.push(recipe); else recipes[index] = recipe;
        update(recipes);
        if (recipe.auto) setOnce(getOnce().filter(id => id !== recipe.id));
        render(); form.hidden = true; status.textContent = `Saved “${name}”.`; overlay.querySelector('.wp-catnip-new').focus();
    });
    overlay.addEventListener('click', event => { event.stopPropagation(); if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.stopPropagation(); close(); }
        if (event.key === 'Tab') {
            const controls = [...overlay.querySelectorAll('button:not(:disabled),input,textarea')].filter(el => el.getClientRects().length);
            if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
            else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
        }
    });
    render(); panel.append(overlay); overlay.querySelector('.wp-catnip-close').focus();
}
