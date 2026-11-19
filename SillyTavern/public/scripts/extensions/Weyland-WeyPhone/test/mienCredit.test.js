// Mien shows who drew a character's expressions, read from the card's creator notes (2026-11-19).
import assert from 'node:assert/strict';
import test from 'node:test';
import { creditForSet, expressionCredit, loadMienGallery } from '../lib/mien.js';
import { renderMienScreen } from '../lib/ui/apps/mien.js';

const wrap = sentence => `<div style="text-align: center;">{{char}} is a special Weyland bot created for Sonnet by Lucky Paw.</div><br><div style="text-align: center;">${sentence} Backend setup for {{char}} on SillyTavern was done by FFFox and Shiru.</div>`;

test('reads the artist and the background cleaner out of the usual sentence', () => {
    assert.deepEqual(expressionCredit(wrap('Character expressions for {{char}} were made with love by @heissenbadger, and backgrounds removed by @trafficcone472!')),
        { artist: '@heissenbadger', backgrounds: '@trafficcone472' });
    assert.deepEqual(expressionCredit(wrap('Character expressions for {{char}} were made with love by @bap with backgrounds removed by @trafficcone472!')),
        { artist: '@bap', backgrounds: '@trafficcone472' });
    // Handles hold dots, and Aiko's card says "b" for "by".
    assert.deepEqual(expressionCredit('Character expressions for {{char}} were made with love by @senp.ai!'), { artist: '@senp.ai', backgrounds: '' });
    assert.deepEqual(expressionCredit('Character expressions for {{char}} were made with love b @bluefirenick with backgrounds removed by @shirouhimaki!'),
        { artist: '@bluefirenick', backgrounds: '@shirouhimaki' });
});

test('keeps the whole phrase when one card has two artists, and plain names work too', () => {
    assert.equal(expressionCredit('Character expressions for {{char}} were made with love by @fdigl (Fawne) and @heissenbadger (Neshe & Astrid)!').artist,
        '@fdigl (Fawne) and @heissenbadger (Neshe & Astrid)');
    assert.equal(expressionCredit('Character expressions for {{char}} were made with love by Lucky Paw!').artist, 'Lucky Paw');
});

test('an empty handle or no sentence means no credit area', () => {
    assert.equal(expressionCredit('Character expressions for {{char}} were made with love by @!'), null);
    assert.equal(expressionCredit('{{char}} is a special Weyland bot.'), null);
    assert.equal(expressionCredit(''), null);
    assert.equal(expressionCredit(undefined), null);
});

function bianca(notes) {
    return { characterId: 0, characters: [{ name: "Rivera", avatar: "Rivera.png", data: { creator_notes: notes } }], extensionSettings: { variables: { global: { NSFW: 'false' } } } };
}
const fetchImpl = async url => ({
    ok: true,
    json: async () => (url.includes('/folders?') ? [] : [{ label: 'neutral', path: '/characters/Rivera/neutral.avif' }]),
});

test('the gallery carries the credit and the screen draws it only when there is one', async () => {
    const withCredit = await loadMienGallery(bianca(wrap('Character expressions for {{char}} were made with love by @heissenbadger, and backgrounds removed by @trafficcone472!')), { fetchImpl, documentRef: { querySelectorAll: () => [] } });
    assert.deepEqual(withCredit.credit, { artist: '@heissenbadger', backgrounds: '@trafficcone472' });
    const container = { innerHTML: '' };
    renderMienScreen(container, { gallery: withCredit, wardrobe: { supported: false } });
    assert.match(container.innerHTML, /class="wp-mien-credit"/);
    assert.match(container.innerHTML, /Expressions by <strong>@heissenbadger<\/strong>/);
    assert.match(container.innerHTML, /Backgrounds removed by <strong>@trafficcone472<\/strong>/);

    const without = await loadMienGallery(bianca('{{char}} is a special Weyland bot.'), { fetchImpl, documentRef: { querySelectorAll: () => [] } });
    assert.equal(without.credit, null);
    renderMienScreen(container, { gallery: without, wardrobe: { supported: false } });
    assert.doesNotMatch(container.innerHTML, /wp-mien-credit/);
});

// @trafficcone472 only cleaned the v1 sprites; the 2026-11 set was not touched by them (Lucky).
test("Bianca's redrawn set drops the v1 background credit", async () => {
    const card = { characterId: 0, characters: [{ name: 'Bianca', avatar: 'Bianca.png', data: { creator_notes: 'Character expressions for {{char}} were made with love by @heissenbadger, and backgrounds removed by @trafficcone472!' } }], extensionSettings: { variables: { global: { NSFW: 'false' } } } };
    const gallery = await loadMienGallery(card, { fetchImpl, documentRef: { querySelectorAll: () => [] } });
    assert.deepEqual(gallery.credit, { artist: '@heissenbadger', backgrounds: '' });
});

test('redrawn sets credit their new artist, not the one the card still names', async () => {
    const loona = { characterId: 0, characters: [{ name: 'Loona', avatar: 'Loona.png', data: { creator_notes: 'Character expressions for {{char}} were made with love by @spyder7878!' } }], extensionSettings: { variables: { global: { NSFW: 'false' } } } };
    const gallery = await loadMienGallery(loona, { fetchImpl, documentRef: { querySelectorAll: () => [] } });
    assert.deepEqual(gallery.credit, { artist: 'Lucky Paw', backgrounds: '' });
});

test('credit text is escaped before it reaches the page', () => {
    const container = { innerHTML: '' };
    const gallery = { character: { name: 'X' }, outfits: [], expressions: [{ label: 'neutral', path: '/a.avif', fileName: 'a.avif' }], credit: { artist: '<img src=x onerror=1>', backgrounds: '' }, selectedOutfitId: '', source: 'local' };
    renderMienScreen(container, { gallery, wardrobe: { supported: false } });
    assert.doesNotMatch(container.innerHTML, /<img src=x/);
});

// Duo cards credit the set being browsed, so a line names one artist instead of the whole card's list (2026-11-19).
const CERBERUS = 'Character expressions for {{char}} were made with love by @fdigl (Fawne) and @heissenbadger (Neshe & Astrid)!';

test('the Cerberus credit is split per sister', () => {
    const card = expressionCredit(CERBERUS);
    assert.deepEqual(card.byMember, { fawne: '@fdigl', neshe: '@heissenbadger', astrid: '@heissenbadger' });
    assert.equal(creditForSet({}, card, { base: 'Fawne', members: ['Fawne'] }).artist, '@fdigl');
    assert.equal(creditForSet({}, card, { base: 'Astrid', members: ['Astrid'] }).artist, '@heissenbadger');
    assert.equal(creditForSet({}, card, { base: 'AstridNeshe', members: ['Astrid', 'Neshe'] }).artist, '@heissenbadger', 'one artist, named once');
});

test("a duo member's own credit wins over the card's line; with nothing better the card's line stays", () => {
    const card = expressionCredit('Character expressions for {{char}} were made with love by @spyder7878!');
    const context = { characters: [{ name: 'Serra', avatar: 'Serra.png', data: { creator_notes: 'Character expressions for {{char}} were made with love by @spyder7878!' } }] };
    assert.equal(creditForSet(context, card, { base: 'Blake', members: ['Blake'] }).artist, '@Barco', "Blake's redrawn set");
    assert.equal(creditForSet(context, card, { base: 'Serra', members: ['Serra'] }).artist, '@spyder7878');
    assert.equal(creditForSet(context, card, { base: 'BlakeSerra', members: ['Blake', 'Serra'] }).artist, '@spyder7878');
    assert.equal(creditForSet({}, card, { base: 'Lyris', members: ['Lyris'] }).artist, '@spyder7878');
});

test('the duo screen shows the browsed sister only, each line kept to one line', () => {
    const card = expressionCredit(CERBERUS);
    const outfits = [
        { id: 'local:Fawne/Regular Outfit', set: 'Fawne', setLabel: 'Fawne', label: 'Regular Outfit', source: 'local', folderName: 'Fawne/Regular Outfit', expressions: [{ label: 'neutral', path: '/f.avif', fileName: 'f.avif' }] },
        { id: 'local:Astrid/Regular Outfit', set: 'Astrid', setLabel: 'Astrid', label: 'Regular Outfit', source: 'local', folderName: 'Astrid/Regular Outfit', expressions: [{ label: 'neutral', path: '/a.avif', fileName: 'a.avif' }] },
    ];
    const setCredits = { Fawne: creditForSet({}, card, { members: ['Fawne'] }), Astrid: creditForSet({}, card, { members: ['Astrid'] }) };
    const gallery = { character: { name: 'Cerberus Sisters' }, duo: true, credit: card, setCredits, outfits, selectedOutfitId: outfits[0].id, expressions: outfits[0].expressions, source: 'local' };
    const container = { innerHTML: '' };
    renderMienScreen(container, { gallery, wardrobe: { supported: false } });
    assert.match(container.innerHTML, /Expressions by <strong>@fdigl<\/strong>/);
    assert.doesNotMatch(container.innerHTML, /heissenbadger/);
    assert.match(container.innerHTML, /class="wp-mien-credit-line" title="Expressions by @fdigl"/);
    renderMienScreen(container, { gallery: { ...gallery, selectedOutfitId: outfits[1].id, expressions: outfits[1].expressions }, wardrobe: { supported: false } });
    assert.match(container.innerHTML, /Expressions by <strong>@heissenbadger<\/strong>/);
    assert.doesNotMatch(container.innerHTML, /fdigl/);
});
