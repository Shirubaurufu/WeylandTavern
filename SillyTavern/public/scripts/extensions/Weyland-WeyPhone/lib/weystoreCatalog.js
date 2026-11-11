// lib/weystoreCatalog.js
//
// The WeyStore's shelf: one honest listing per app. Storefront copy only, no behavior.
//
// House rules for this file (Lucky, 2026-11-09), enforced by test/weystore.test.js:
//  - Nothing invented. No ratings, download counts, reviews or version histories. The first store
//    draft had all of those and they read as filler; a store this small does not need to pretend to
//    be a big one. Every line here describes something the app really does (cross-check
//    lib/ui/appHelp.js when editing).
//  - No character writes a blurb. A cast member's voice belongs to their card.
//  - No unreleased characters by name, and no em dashes.
//
// `cost` is the fact players ask about most, so every listing states it:
//    free    = never calls a model
//    sync    = written by the shared Sync (one request fills all four feeds)
//    message = one request per use, on the model named in Settings
//
// Another extension can describe its own tile by adding a `store` object to what it pushes onto
// window.weyPhoneExternalApps (same fields as below; `hero` is a full URL). Anything it leaves out
// falls back to the entry here for its key, then to a plain default.

import { ASSET_BASE_URL, EXTENSION_BASE_URL } from './assetPaths.js';

const hero = id => `${ASSET_BASE_URL}/weystore/hero_${id}.webp`;
// Sibling extensions live next to this one; drop our own folder name to get their shared root.
const EXTENSIONS_ROOT_URL = EXTENSION_BASE_URL.slice(0, EXTENSION_BASE_URL.lastIndexOf('/'));

export const STORE_SHELVES = Object.freeze([
    { id: 'games', title: 'Games and demos', blurb: 'Things to play between scenes.' },
    { id: 'feeds', title: 'The feed four', blurb: 'One Sync writes all four at once.', order: ['chronicle', 'feed', 'chat', 'board'] },
    { id: 'story', title: 'Story tools', blurb: 'For the roleplay you have open.', order: ['narrative', 'understudy', 'pawxai', 'mien'] },
    { id: 'people', title: 'People', blurb: 'Who you can reach, and how.', order: ['kressa', 'messages', 'contacts'] },
    { id: 'campus', title: 'Around Weyland', blurb: 'The campus and the community.', order: ['housing', 'registrar', 'weybooru'] },
    { id: 'pocket', title: 'Pocket stuff', blurb: 'Small, quiet, and free to run.', order: ['clock', 'notes', 'calculator', 'settings'] },
    { id: 'extras', title: 'Extras', blurb: 'Added by other extensions.' },
]);

const SYNC_COST = { kind: 'sync', label: 'Filled by Sync' };
// Sync writes all four feeds in a single request, and the request is not smaller when one is
// missing. Saying so up front stops "I removed Yip Yap to save messages" before it starts.
const SYNC_NOTE = 'Sync still writes all four feeds in one request, so removing this one does not save messages. It only clears the tile and its notifications.';

const LISTINGS = {
    messages: {
        shelf: 'people',
        tagline: 'Text anyone in Weyland.',
        about: 'Keep your relationships moving even when the main scene is somewhere else. Text anyone in Weyland one-on-one or bring a few people into a group chat, queue everything you want to say, and ask for a reply when you are ready.',
        points: [
            'Unlinked, Observe and Linked decide how much a thread knows about your roleplay',
            'Group chats with two to four characters',
            'Pinned memories keep long threads from forgetting',
        ],
        cost: { kind: 'message', label: '1 message per reply' },
        note: 'Linked threads are answered by your roleplay model as part of the scene, so they cost nothing extra.',
        pairs: ['contacts', 'kressa'],
        hero: hero('messages'),
    },
    contacts: {
        shelf: 'people',
        tagline: 'Who is who, and who picks up.',
        about: 'Stop wondering who someone is or whether you can actually reach them. Contacts puts the official cast, downloaded characters and everyone you brought in from the Registrar into one searchable directory.',
        points: [
            'Start a thread in one tap',
            'Shows who can actually be reached',
            'Keep your own notes on where you stand with each person',
        ],
        cost: { kind: 'free', label: 'Free to run' },
        pairs: ['messages', 'registrar'],
        hero: hero('contacts'),
        slim: true,
    },
    chronicle: {
        shelf: 'feeds',
        tagline: 'Weyland’s local paper.',
        about: 'See what is happening beyond the room your roleplay is in. The Chronicle fills Weyland with fresh city headlines, campus stories and practical alerts every time you Sync.',
        points: [
            'Headlines from around the city',
            'Practical campus alerts',
            'Save the stories worth keeping',
        ],
        cost: SYNC_COST,
        note: SYNC_NOTE,
        pairs: ['feed', 'board'],
        hero: hero('chronicle'),
    },
    feed: {
        shelf: 'feeds',
        tagline: 'What the cast is posting.',
        about: 'Give Weyland’s cast lives that keep moving when you are not talking to them. Chitter is their public feed, with personal posts, profiles, likes, bookmarks and a Following tab you control.',
        points: [
            'Posts from the people of Weyland, about their own lives',
            'Characters you imported from the Registrar can show up too',
            'Bookmarks survive every Sync',
        ],
        cost: SYNC_COST,
        note: `Opening a character’s profile for the first time writes it on the spot, which uses one generation. ${SYNC_NOTE}`,
        pairs: ['chat', 'chronicle'],
        hero: hero('feed'),
    },
    chat: {
        shelf: 'feeds',
        tagline: 'The server that never shuts up.',
        about: 'Drop into the group chatter that makes the campus feel occupied. Discorgi serves up short channel conversations, announcements and the kind of community nonsense nobody would put in an official bulletin.',
        points: [
            'Choose which channels stay in the rotation',
            'Switched-off channels never reach the model at all',
            'Save the posts you want to keep',
        ],
        cost: SYNC_COST,
        note: SYNC_NOTE,
        pairs: ['feed', 'board'],
        hero: hero('chat'),
    },
    board: {
        shelf: 'feeds',
        tagline: 'Anonymous. Nearby. No names.',
        about: 'See the anonymous side of Weyland, where people say what they would never attach to their name. Yip Yap collects confessions, complaints, missed connections and campus gossip from nearby strangers.',
        points: [
            'Nobody is named, ever',
            'Standalone posts, not conversations',
            'Bookmark the good ones',
        ],
        cost: SYNC_COST,
        note: SYNC_NOTE,
        pairs: ['chronicle', 'chat'],
        hero: hero('board'),
    },
    kressa: {
        shelf: 'people',
        tagline: 'Your wolfgirl assistant.',
        about: 'Kressa is your personal wolfgirl assistant. She can help flesh out lore, explain biology, brainstorm writing, organize a plan or even help untangle your taxes. She also knows Weyland inside and out, keeps her own conversations, shares gossip and can read along with your open roleplay when you invite her.',
        points: [
            'Observe mode lets her comment on a scene without touching it',
            'Runs on her own model setting, separate from Messages',
            'A dozen colour palettes',
        ],
        cost: { kind: 'message', label: '1 message per reply' },
        pairs: ['messages', 'narrative'],
        hero: `${ASSET_BASE_URL}/weystore/hero_kressa-v2.avif`,
    },
    understudy: {
        shelf: 'story',
        tagline: 'A second take on the last reply.',
        about: 'When a reply is almost right, Copycat gives you a sharper second take without sacrificing the original. It hands the newest character reply to a different model and adds the rewrite as another swipe.',
        points: [
            'Pick what gets rewritten: everything, dialogue, thoughts or narration',
            'Catnip notes save the instructions that worked',
            'Can run by itself every few replies',
        ],
        cost: { kind: 'message', label: '1 message per rewrite' },
        note: 'Automatic rewrites pause while Copycat is off your phone.',
        pairs: ['narrative', 'pawxai'],
        hero: hero('understudy'),
    },
    narrative: {
        shelf: 'story',
        tagline: 'Storytelling settings, by touch.',
        about: 'Shape how your roleplay feels without digging through the classic settings menu. PromptOS puts narrators, prompt cartridges, Roleplay Shifts, point of view and story modes onto one tactile control panel.',
        points: [
            'Pick a narrator and a prompt cartridge',
            'Roleplay Shifts, doses and your own custom presets',
            'Error help and the Gemini filter guide live here too',
        ],
        cost: { kind: 'free', label: 'Free to run' },
        note: 'The book button in the chat bar opens PromptOS too.',
        pairs: ['understudy', 'kressa'],
        hero: hero('narrative'),
    },
    pawxai: {
        shelf: 'story',
        tagline: 'Image prompts from your scene.',
        about: 'Turn the scene you just wrote into art direction while the details are still fresh. PawXai reads the latest moment and produces titled, character-aware SDXL-style prompts ready for an image generator.',
        points: [
            'Tune focus, framing and how far the prompts vary',
            'Save the prompts you want to reuse',
            'Uses the character’s known appearance, so they stay on model',
        ],
        cost: { kind: 'message', label: '1 generation per set' },
        note: 'Prompt sets share the same cooldown as Sync.',
        pairs: ['mien', 'weybooru'],
        hero: hero('pawxai'),
    },
    mien: {
        shelf: 'story',
        tagline: 'Every face they make.',
        about: 'Put the right face on the moment instead of waiting for an automatic expression to guess. Mien lets you browse every available expression and outfit for the character in your chat and set the one you want.',
        points: [
            'Every installed outfit, side by side',
            'Full-screen viewer',
            'Set in chat lasts until their next message',
        ],
        cost: { kind: 'free', label: 'Free to run' },
        pairs: ['pawxai', 'weybooru'],
        hero: hero('mien'),
    },
    housing: {
        shelf: 'campus',
        tagline: 'Find anyone’s room.',
        about: 'Find where anyone lives before your character knocks on the wrong door. Housing gives you a zoomable residence map of Sterling dormitory and a directory of who lives in every room.',
        points: [
            'The whole residence directory in your pocket',
            'Optionally shows community characters from the Registrar',
        ],
        cost: { kind: 'free', label: 'Free to run' },
        pairs: ['contacts', 'registrar'],
        hero: hero('housing'),
    },
    registrar: {
        shelf: 'campus',
        tagline: 'The community’s Weyland.',
        about: 'Expand Weyland with people and places made by the community. Registrar lets you browse characters, locations and curated collections, then bring the ones you like into your own world.',
        points: [
            'Imports side characters and location lore into your roleplays',
            'My World tracks what you added, with updates and removal',
            'Browsing and importing never spends a message',
        ],
        cost: { kind: 'free', label: 'Free to run' },
        pairs: ['contacts', 'housing'],
        hero: hero('registrar'),
    },
    weybooru: {
        shelf: 'campus',
        tagline: 'Community art, one tap away.',
        about: 'Find the piece of Weyland art you are looking for without leaving the phone. Weybooru opens the community gallery with character and tag search ready to go.',
        points: [
            'Opens the full viewer over the page',
            'Search by character or tag',
        ],
        cost: { kind: 'free', label: 'Free to run' },
        note: 'Needs the Weybooru Viewer extension. The picture-frame button in the chat bar opens the same viewer.',
        pairs: ['mien', 'pawxai'],
        hero: hero('weybooru'),
    },
    clock: {
        shelf: 'pocket',
        tagline: 'Timers and alarms, on story time if you like.',
        about: 'Make time part of the scene instead of something you track outside it. Clock sets timers and alarms against real time or roleplay time, and characters can notice when one goes off.',
        points: [
            'Roleplay-time alarms follow the scene’s clock, not yours',
            'Pick the picture and the sound for each one',
        ],
        cost: { kind: 'free', label: 'Free to run' },
        note: 'Alarms and timers stay silent while Clock is off your phone. They are kept, and pick up again when you put it back.',
        pairs: ['notes', 'calculator'],
        hero: hero('clock'),
        slim: true,
    },
    notes: {
        shelf: 'pocket',
        tagline: 'Somewhere to write things down.',
        about: 'Keep names, plans and stray ideas somewhere they will still be waiting in the next chat. Notes gives you a simple notebook that belongs to the whole phone, not one roleplay.',
        points: [
            'Not tied to any one roleplay',
            'Included in your phone backup',
        ],
        cost: { kind: 'free', label: 'Free to run' },
        pairs: ['clock', 'calculator'],
        hero: hero('notes'),
        slim: true,
    },
    calculator: {
        shelf: 'pocket',
        tagline: 'It adds. In style.',
        about: 'Do quick math without breaking the phone fantasy or reaching for another app. Calculator handles the basics and lets you choose a palette that fits your screen.',
        points: ['Does exactly what it says'],
        cost: { kind: 'free', label: 'Free to run' },
        pairs: ['notes', 'clock'],
        hero: hero('calculator'),
        slim: true,
    },
    settings: {
        shelf: 'pocket',
        tagline: 'The phone’s controls.',
        about: 'Make WeyPhone feel and behave like your phone. Settings controls models, wallpapers, app names, backups and the tools for starting over safely.',
        points: [
            'Choose the model each kind of request runs on',
            'Export the whole phone before moving installs',
        ],
        cost: { kind: 'free', label: 'Free to run' },
        pairs: ['narrative'],
        hero: hero('settings'),
        slim: true,
    },
    // Last Smoke ships as its own extension (Weyland-LastSmoke-Demo). Its listing lives here so the
    // demo's bundled files stay untouched; the banner is its own title art, read from its folder.
    // If that extension is missing the tile never registers, so this entry is simply never shown.
    // defaultOff: the demo is a storefront window, not a factory app; players add it on purpose.
    'last-smoke-demo': {
        shelf: 'games',
        fresh: true,
        defaultOff: true,
        tagline: 'A rainy 1950s noir card game with three dangerous regulars.',
        about: 'Last Smoke reimagines Belle, Eve and Astrid in a rain-soaked 1950s noir bar clouded with cigarette and hookah smoke.\n\nMatch the colour, number or symbol on the pile, use special cards and empty your hand before the others while the table reacts to every play.\n\nThe full game will feature individual relationship trees, ~20x the amount of dialogue and banter and additional character scenes.\n\nThis playable demo allows users to play one hand in the game environment with a limited dialogue set.',
        points: [
            'Belle, Eve and Astrid each play, flirt and argue differently',
            'Match colour, number or symbol, then call LAST SMOKE when you are down to one card',
            'Relationship trees and the later character material belong to the full game, not this demo',
            'Runs entirely on your device. No model, no messages spent',
        ],
        cost: { kind: 'free', label: 'Free to play' },
        hero: `${EXTENSIONS_ROOT_URL}/Weyland-LastSmoke-Demo/demo/assets/noir/env/title-bar.avif`,
        heroPosition: '50% 44%',
        // The title art is a tall portrait; the poster is a wide strip, so aim it at their faces.
        posterPosition: '50% 39%',
        heroTone: 'dark',
    },
};

// `fresh` is off by default: only a curated listing (or an extension's own store block) may call
// itself new, so an unknown extension tile can never take the front-page spotlight.
const FALLBACK = Object.freeze({
    shelf: 'extras',
    fresh: false,
    // true = the tile ships OFF the phone and only a player's Get puts it on (see lib/weystore.js).
    defaultOff: false,
    tagline: 'Added by another extension.',
    about: 'This app was added to your WeyPhone by a separate extension.',
    points: [],
    cost: { kind: 'unknown', label: 'Set by its extension' },
    note: '',
    pairs: [],
    hero: null,
    heroPosition: '50% 50%',
    // Where the shelf poster crops the banner (it is a wider strip than the app page's banner).
    posterPosition: '50% 42%',
    // true = the shorter poster used for the small factory apps.
    slim: false,
    heroTone: 'art',
});

const LISTING_FIELDS = Object.keys(FALLBACK);

/**
 * The listing for one app.
 * @param {string} key
 * @param {{store?: object}|null} [externalApp] the registration object of an extension tile, if any
 */
export function storeListing(key, externalApp = null) {
    const own = LISTINGS[key] ?? {};
    const supplied = externalApp?.store && typeof externalApp.store === 'object' ? externalApp.store : {};
    const listing = { ...FALLBACK, ...own };
    for (const field of LISTING_FIELDS) {
        if (supplied[field] !== undefined && supplied[field] !== null) listing[field] = supplied[field];
    }
    return listing;
}

/** Every key with a hand-written listing (tests check the registry against this). */
export function listedKeys() {
    return Object.keys(LISTINGS);
}
