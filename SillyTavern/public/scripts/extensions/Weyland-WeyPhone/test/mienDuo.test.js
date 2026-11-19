// Mien on duo cards (2026-11-18): Lyris & Vesper, Blake & Serra and the Cerberus Sisters are drawn from several
// sprite sets (each member's, plus combined ones like "LyrisVesper"). A pick there is who is shown AND what they wear.
import assert from 'node:assert/strict';
import test from 'node:test';
import { cardSpriteSets, decideCostume, isExtraOutfit, outfitDisplayName } from '../../quick-reply-ext/src/outfitPick.js';
import { loadMienGallery } from '../lib/mien.js';
import { renderMienScreen } from '../lib/ui/apps/mien.js';

// Same table as quick-reply-ext's CHARACTER_GROUPS_WITH_EXPRESSIONS.
const GROUPS = [
    { output: 'BlakeSerra', members: ['Blake', 'Serra'] },
    { output: 'LyrisVesper', members: ['Lyris', 'Vesper'] },
    { output: 'JennLucy', members: ['Jenn', 'Lucy'] },
    { output: 'AstridNeshe', members: ['Astrid', 'Neshe'] },
];

test('a duo card is drawn from its combined set first, then each member', () => {
    assert.deepEqual(cardSpriteSets('Lyris & Vesper', ['Lyris', 'Vesper'], GROUPS).map(set => [set.base, set.label]),
        [['LyrisVesper', 'Lyris & Vesper'], ['Lyris', 'Lyris'], ['Vesper', 'Vesper']]);
    assert.deepEqual(cardSpriteSets('Cerberus Sisters', ['Astrid', 'Neshe', 'Fawne'], GROUPS).map(set => set.base),
        ['AstridNeshe', 'Astrid', 'Neshe', 'Fawne']);
    assert.deepEqual(cardSpriteSets('Summer', [], GROUPS), [{ base: 'Summer', label: 'Summer', members: ['Summer'] }]);
});

test('on a duo card the scene can change who is shown without undoing the pick; a new outfit code does', () => {
    const bases = ['LyrisVesper', 'Lyris', 'Vesper'];
    const pick = 'Lyris/Casual';
    // Scene now has both of them, still in their regular outfits: the pick (Lyris alone, Casual) holds.
    assert.deepEqual(decideCostume({ storyCostume: 'LyrisVesper/Regular Outfit', costmSave: 'Lyris/Regular Outfit', pick, bases }),
        { show: 'Lyris/Casual', saveStory: 'LyrisVesper/Regular Outfit', clearPick: false });
    // The footer undresses them: follow the story.
    assert.deepEqual(decideCostume({ storyCostume: 'LyrisVesper/Naked', costmSave: 'LyrisVesper/Regular Outfit', pick, bases }),
        { show: 'LyrisVesper/Naked', saveStory: 'LyrisVesper/Naked', clearPick: true });
    // Keep on: "show only Lyris" for good, the old menu's option that had stopped working.
    assert.equal(decideCostume({ storyCostume: 'LyrisVesper/Naked', costmSave: 'Vesper/Regular Outfit', pick, bases, stick: true }).show, 'Lyris/Casual');
    // A pick from another card is ignored.
    assert.equal(decideCostume({ storyCostume: 'Blake/Regular Outfit', costmSave: '', pick: 'Summer/Dress', bases: ['BlakeSerra', 'Blake', 'Serra'] }).show, 'Blake/Regular Outfit');
});

test("Blake & Serra's combined Festival set stays free, like getCharacterCostumeFromText's list", () => {
    assert.equal(isExtraOutfit('Festival', 'BlakeSerra'), false);
    assert.equal(isExtraOutfit('Festival', 'Blake'), true);
});

test('Lingerie reads "Undergarments" where the old menu said so; Lounge and everyone else keep the folder name', () => {
    for (const name of ['Seth', 'Cairo', 'Fasti', 'Lentyl']) assert.equal(outfitDisplayName(name, 'Lingerie'), 'Undergarments');
    assert.equal(outfitDisplayName('Summer', 'Lingerie'), 'Lingerie');
    assert.equal(outfitDisplayName('Bastet', 'Lounge'), 'Lounge');
    assert.equal(outfitDisplayName('Nara', 'CommunityNaked'), 'Community · Naked');
});

function duoFetch() {
    const folders = { LyrisVesper: ['Casual', 'Regular Outfit'], Lyris: ['Casual', 'Regular Outfit'], Vesper: ['Regular Outfit'] };
    return async url => ({
        ok: true,
        json: async () => {
            const name = decodeURIComponent(url.split('name=')[1]);
            if (url.includes('/folders?')) return (folders[name] ?? []).map(folder => ({ name: folder }));
            const [set, outfit] = name.split('/');
            return folders[set]?.includes(outfit) ? [{ label: 'neutral', path: `/characters/${name}/neutral.avif` }, { label: 'joy', path: `/characters/${name}/joy.avif` }] : [];
        },
    });
}

const SETS = cardSpriteSets('Lyris & Vesper', ['Lyris', 'Vesper'], GROUPS);
const context = { characterId: 0, characters: [{ name: 'Lyris & Vesper', avatar: 'Lyris & Vesper.png' }], extensionSettings: { variables: { global: { NSFW: 'false' } } } };

test("Mien lists every set's outfits on a duo card, tagged with who is in them", async () => {
    const gallery = await loadMienGallery(context, { fetchImpl: duoFetch(), sets: SETS });
    assert.equal(gallery.duo, true);
    assert.deepEqual(gallery.outfits.map(outfit => `${outfit.setLabel}: ${outfit.label}`).sort(),
        ['Lyris & Vesper: Casual', 'Lyris & Vesper: Regular Outfit', 'Lyris: Casual', 'Lyris: Regular Outfit', 'Vesper: Regular Outfit']);
    assert.ok(gallery.outfits.every(outfit => outfit.folderName.startsWith(`${outfit.set}/`)));
});

test("the duo screen shows a who's-showing switch and lists only the browsed set's outfits", async () => {
    const gallery = await loadMienGallery(context, { fetchImpl: duoFetch(), sets: SETS, outfitId: 'local:Lyris/Casual' });
    const container = { innerHTML: '' };
    const wardrobe = { supported: true, duo: true, sets: SETS, wearing: 'LyrisVesper/Regular Outfit', pick: '', stick: false, member: true, autoCostumes: true };
    renderMienScreen(container, { gallery, wardrobe });
    const html = container.innerHTML;
    assert.match(html, /class="wp-mien-cast"/);
    assert.match(html, /wp-mien-cast-pill is-on" data-mien-set="Lyris"/);
    assert.match(html, /data-mien-set="LyrisVesper"[^>]*title="On screen now"><span class="wp-mien-cast-dot"/);
    const options = [...html.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(options.sort(), ['local:Lyris/Casual', 'local:Lyris/Regular Outfit']);
    assert.match(html, /Wear Casual/);

    // Kept on: the note says who stays on screen.
    renderMienScreen(container, { gallery, wardrobe: { ...wardrobe, wearing: 'Lyris/Casual', pick: 'Lyris/Casual', stick: true } });
    assert.match(container.innerHTML, /Lyris stays on screen in Casual in this chat\./);
});
