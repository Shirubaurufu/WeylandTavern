// Mien's Wear / Keep on (2026-11-18): the outfit half of the old wand-menu costume picker, moved into Mien.
// The dressing rules live in quick-reply-ext/src/outfitPick.js (pure); the screen in lib/ui/apps/mien.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { activeOutfitPick, decideCostume, isExtraOutfit, isNsfwOutfit, outfitToShow, splitOutfitFolder } from '../../quick-reply-ext/src/outfitPick.js';
import { loadMienGallery, sameFaceIn, withoutNsfwOutfits } from '../lib/mien.js';
import { renderMienScreen } from '../lib/ui/apps/mien.js';

test('base outfits are free to wear, everything else is a Plus extra (Plus or Platinum, since 2026-11-18)', () => {
    for (const outfit of ['', 'Regular Outfit', 'Lingerie', 'Naked', 'Lounge', 'SFW', 'CommunityRegular Outfit']) {
        assert.equal(isExtraOutfit(outfit), false, outfit);
    }
    for (const outfit of ['Cheerleader', 'Fairy', 'Casual Clothes', 'CommunityCheerleader']) assert.equal(isExtraOutfit(outfit), true, outfit);
    assert.deepEqual(['Lingerie', 'Naked', 'Lounge', 'CommunityNaked', 'SFW', 'Regular Outfit'].map(isNsfwOutfit), [true, true, true, true, false, false]);
    assert.deepEqual(splitOutfitFolder('Summer/Regular Outfit'), { character: 'Summer', outfit: 'Regular Outfit' });
});

test('a pick holds until the story asks for a DIFFERENT outfit than it last did, then is forgotten', () => {
    const base = { costmSave: 'Summer/Regular Outfit', pick: 'Summer/Cheerleader', stick: false, characterName: 'Summer' };
    // Footer still says [RC]: she stays in the cheerleader outfit (callers skip a redraw when it already shows).
    assert.deepEqual(decideCostume({ ...base, storyCostume: 'Summer/Regular Outfit' }), { show: 'Summer/Cheerleader', saveStory: '', clearPick: false });
    // No costume tag at all: nothing changes either.
    assert.deepEqual(decideCostume({ ...base, storyCostume: '' }), { show: 'Summer/Cheerleader', saveStory: '', clearPick: false });
    // The story undresses her: follow it and drop the pick.
    assert.deepEqual(decideCostume({ ...base, storyCostume: 'Summer/Naked' }), { show: 'Summer/Naked', saveStory: 'Summer/Naked', clearPick: true });
});

test('Keep on holds the pick through outfit codes, while CostmSave quietly keeps following the story', () => {
    const base = { costmSave: 'Summer/Regular Outfit', pick: 'Summer/Cheerleader', stick: true, characterName: 'Summer' };
    assert.deepEqual(decideCostume({ ...base, storyCostume: 'Summer/Naked' }), { show: 'Summer/Cheerleader', saveStory: 'Summer/Naked', clearPick: false });
    assert.deepEqual(decideCostume({ ...base, storyCostume: '' }), { show: 'Summer/Cheerleader', saveStory: '', clearPick: false });
    // After the Phone portrait (CostmSave "Phone") the held outfit comes back.
    assert.equal(decideCostume({ ...base, costmSave: 'Phone', storyCostume: 'Summer/Regular Outfit' }).show, 'Summer/Cheerleader');
});

test('a pick never carries over to another character, and no pick means the old rule exactly', () => {
    assert.equal(activeOutfitPick('Summer/Cheerleader', 'Jenn'), '');
    assert.deepEqual(decideCostume({ costmSave: 'Jenn/Regular Outfit', pick: 'Summer/Cheerleader', stick: true, characterName: 'Jenn', storyCostume: 'Jenn/Hoodie' }),
        { show: 'Jenn/Hoodie', saveStory: 'Jenn/Hoodie', clearPick: false });
    assert.equal(outfitToShow({ costmSave: 'Summer/Regular Outfit', pick: 'Summer/Dress', characterName: 'Summer' }), 'Summer/Dress');
    assert.equal(outfitToShow({ costmSave: 'Summer/Regular Outfit', pick: '', characterName: 'Summer' }), 'Summer/Regular Outfit');
});

function summerFetch() {
    const folders = ['Baker', 'Cheerleader', 'Lingerie', 'Naked', 'Regular Outfit'];
    return async url => ({
        ok: true,
        json: async () => {
            if (url.includes('/folders?')) return folders.map(name => ({ name }));
            const folder = decodeURIComponent(url.split('name=')[1]);
            return folders.some(name => folder === `Summer/${name}`) ? [{ label: 'joy', path: `/characters/${folder}/joy.avif` }, { label: 'anger', path: `/characters/${folder}/anger.avif` }] : [];
        },
    });
}

test('Mien hides Lingerie and Naked while NSFW images are hidden, like the old picker did', async () => {
    const context = { characterId: 0, characters: [{ name: 'Summer', avatar: 'Summer.png' }], extensionSettings: { variables: { global: { NSFW: 'true' } } } };
    const gallery = await loadMienGallery(context, { documentRef: { querySelectorAll: () => [] }, fetchImpl: summerFetch() });
    assert.deepEqual(gallery.outfits.map(outfit => outfit.label).sort(), ['Baker', 'Cheerleader', 'Regular Outfit']);
    const shown = await loadMienGallery({ ...context, extensionSettings: { variables: { global: { NSFW: 'false' } } } }, { documentRef: { querySelectorAll: () => [] }, fetchImpl: summerFetch() });
    assert.equal(shown.outfits.length, 5);
    assert.deepEqual(shown.outfits.filter(outfit => outfit.extra).map(outfit => outfit.label).sort(), ['Baker', 'Cheerleader']);
    assert.deepEqual(withoutNsfwOutfits([{ source: 'registrar', outfit: 'nude' }, { source: 'registrar', outfit: 'clothed' }], true), [{ source: 'registrar', outfit: 'clothed' }]);
});

async function summerGallery(outfitId) {
    const context = { characterId: 0, characters: [{ name: 'Summer', avatar: 'Summer.png' }], extensionSettings: { variables: { global: { NSFW: 'false' } } } };
    return loadMienGallery(context, { documentRef: { querySelectorAll: () => [] }, fetchImpl: summerFetch(), outfitId });
}

function screen(gallery, wardrobe) {
    const container = { innerHTML: '' };
    renderMienScreen(container, { gallery, wardrobe });
    return container.innerHTML;
}

test('Mien offers Wear for the selected outfit and marks what she has on', async () => {
    const gallery = await summerGallery('local:Summer/Cheerleader');
    const wardrobe = { supported: true, wearing: 'Summer/Regular Outfit', pick: '', stick: false, member: true, autoCostumes: true };
    const html = screen(gallery, wardrobe);
    assert.match(html, /data-mien-wear="on"[^>]*><i class="fa-solid fa-shirt"><\/i>Wear Cheerleader/);
    assert.match(html, /Regular Outfit · wearing/);
    assert.match(html, /id="wp-mien-stick"[^>]*aria-pressed="false"/);
});

test('a picked outfit can be taken off, and Keep on says what it does', async () => {
    const gallery = await summerGallery('local:Summer/Cheerleader');
    const picked = screen(gallery, { supported: true, wearing: 'Summer/Cheerleader', pick: 'Summer/Cheerleader', stick: false, member: true, autoCostumes: true });
    assert.match(picked, /data-mien-wear="off"/);
    assert.match(picked, /Wearing Cheerleader until the story changes outfits/);
    const stuck = screen(gallery, { supported: true, wearing: 'Summer/Cheerleader', pick: 'Summer/Cheerleader', stick: true, member: true, autoCostumes: true });
    assert.match(stuck, /wp-mien-stick is-on" aria-pressed="true"/);
    assert.match(stuck, /Summer stays in Cheerleader in this chat\. Moods still change\./);
});

test('without Paw Patrol Plus an extra outfit can be browsed but not worn', async () => {
    const gallery = await summerGallery('local:Summer/Cheerleader');
    const html = screen(gallery, { supported: true, wearing: 'Summer/Regular Outfit', pick: '', stick: false, member: false, autoCostumes: true });
    assert.match(html, /id="wp-mien-wear" class="wp-mien-wear" disabled><i class="fa-solid fa-crown"><\/i>Plus outfit/);
    assert.match(html, /Cheerleader · Plus/);
    assert.match(html, /id="wp-mien-stick"[^>]*disabled/);
    // Base outfits stay wearable.
    const base = await summerGallery('local:Summer/Lingerie');
    assert.match(screen(base, { supported: true, wearing: 'Summer/Regular Outfit', pick: '', member: false, autoCostumes: true }), /Wear Lingerie/);
});

test('no wardrobe (other cards, or quick-reply-ext missing) leaves Mien the plain gallery', async () => {
    const gallery = await summerGallery('local:Summer/Cheerleader');
    for (const wardrobe of [null, { supported: false, reason: 'duo-card' }]) {
        const html = screen(gallery, wardrobe);
        assert.doesNotMatch(html, /wp-mien-wardrobe|wp-mien-wear/);
        assert.match(html, /Only “Set in chat” applies an expression/);
    }
});

test('a locked face moves to the same mood in the new outfit', async () => {
    const gallery = await summerGallery('local:Summer/Baker');
    const baker = gallery.outfits.find(outfit => outfit.label === 'Baker');
    assert.equal(sameFaceIn(baker, 'anger')?.folderName, 'Summer/Baker');
    assert.equal(sameFaceIn(baker, 'grief'), null);
});

test('the costume menu reaches Mien through a core command, and Mien can no longer be uninstalled', async () => {
    // STScript refuses to parse a script that names a missing command, so the Costume quick reply must reach Mien
    // with /dom (core), never a WeyPhone slash command. The old {{weyphoneOutfits}} fallback check is retired.
    const source = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    assert.match(source, /mienMenuButton\.id = 'wp-open-mien-outfits'/);
    assert.ok(!source.includes("name: 'weyphone-outfits'") && !source.includes("'weyphoneOutfits'"));
    const { SYSTEM_APP_KEYS } = await import('../lib/weystore.js');
    assert.ok(SYSTEM_APP_KEYS.includes('mien'));
});

// Lucky, 2026-11-18: without Paw Patrol Plus, bonus outfits still show in Mien, but only their neutral face is open.
test('without Plus, bonus outfits open only their neutral face; base outfits and members are untouched', async () => {
    const { lockBonusFaces, firstOpenFace } = await import('../lib/mien.js');
    const gallery = await summerGallery('local:Summer/Cheerleader');
    const withNeutral = { ...gallery, outfits: gallery.outfits.map(outfit => ({ ...outfit, expressions: [...outfit.expressions, { label: 'neutral', path: `/characters/${outfit.folderName}/neutral.avif`, folderName: outfit.folderName, source: 'local' }] })) };
    assert.equal(lockBonusFaces(withNeutral, true), withNeutral);
    const locked = lockBonusFaces(withNeutral, false);
    const cheer = locked.outfits.find(outfit => outfit.label === 'Cheerleader');
    assert.deepEqual(cheer.expressions.map(expression => [expression.label, Boolean(expression.plusLocked)]), [['joy', true], ['anger', true], ['neutral', false]]);
    assert.ok(locked.outfits.find(outfit => outfit.label === 'Regular Outfit').expressions.every(expression => !expression.plusLocked));
    assert.equal(locked.expressions, cheer.expressions, 'the selected outfit carries the locks too');
    assert.equal(firstOpenFace(cheer.expressions), 2);

    const container = { innerHTML: '' };
    renderMienScreen(container, { gallery: locked, selectedIndex: 0, wardrobe: { supported: true, wearing: 'Summer/Regular Outfit', member: false, autoCostumes: true } });
    assert.match(container.innerHTML, /wp-mien-preview is-plus-locked/);
    assert.match(container.innerHTML, /id="wp-mien-apply" class="wp-mien-apply" disabled/);
    assert.match(container.innerHTML, /id="wp-mien-lock"[^>]*disabled/);
    assert.match(container.innerHTML, /Neutral is free for everyone/);
    assert.equal((container.innerHTML.match(/wp-mien-thumb[^"]*is-plus-locked/g) ?? []).length, 2);
    renderMienScreen(container, { gallery: locked, selectedIndex: 2, wardrobe: { supported: true, wearing: 'Summer/Regular Outfit', member: false, autoCostumes: true } });
    assert.doesNotMatch(container.innerHTML, /wp-mien-preview is-plus-locked/);
    assert.match(container.innerHTML, /id="wp-mien-apply" class="wp-mien-apply">/);
});

test('the header 18+ switch shows the NSFW state, and is left out when the caller gives none', () => {
    const container = { innerHTML: '' };
    renderMienScreen(container, { nsfwHidden: true });
    assert.match(container.innerHTML, /id="wp-mien-nsfw" class="wp-mien-nsfw" aria-pressed="false"/);
    assert.match(container.innerHTML, /fa-eye-slash/);
    renderMienScreen(container, { nsfwHidden: false });
    assert.match(container.innerHTML, /id="wp-mien-nsfw" class="wp-mien-nsfw is-on" aria-pressed="true"/);
    renderMienScreen(container, {});
    assert.doesNotMatch(container.innerHTML, /wp-mien-nsfw/);
    // It sits in the right-hand header group, before the help button.
    renderMienScreen(container, { nsfwHidden: true });
    assert.match(container.innerHTML, /wp-mien-header-actions-right">\s*<button type="button" id="wp-mien-nsfw"[\s\S]*wp-inline-help/);
});

test('index.js switches NSFW the way the Costumes & Backgrounds menu does', () => {
    const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    assert.match(src, /\/setglobalvar key=NSFW \$\{hide\}/);
    assert.match(src, /'\/:Weyland\.Pic'/);
    assert.match(src, /closest\('#wp-mien-nsfw'\)/);
});
