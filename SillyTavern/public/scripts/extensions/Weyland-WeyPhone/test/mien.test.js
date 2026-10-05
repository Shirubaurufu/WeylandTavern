import assert from 'node:assert/strict';
import test from 'node:test';
import { loadMienGallery, mienFolderCandidates, normalizeLocalSprites, normalizeRegistrarSprites, resolveMienCharacter, selectMienOutfit } from '../lib/mien.js';
import { renderMienScreen } from '../lib/ui/apps/mien.js';

function target() { return { innerHTML: '' }; }

test('Mien uses existing same-origin authentication for local sprite APIs', async () => {
    const calls = [];
    const gallery = await loadMienGallery({ characterId: 0, characters: [{ name: 'Auth Test', avatar: 'Auth Test.png' }] }, {
        documentRef: { querySelectorAll: () => [] },
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            if (options.credentials !== 'same-origin') return { ok: false, json: async () => [] };
            return { ok: true, json: async () => url.includes('/folders?') ? [{ name: 'Festival' }]
                : url.includes('Auth%20Test%2FFestival') ? [{ label: 'joy', path: '/characters/Auth%20Test/Festival/joy.png' }] : [] };
        },
    });
    assert.equal(gallery.source, 'local');
    assert.equal(gallery.folderName, 'Auth Test/Festival');
    assert.ok(calls.every(({ url, options }) => url.startsWith('/api/sprites/') && options.credentials === 'same-origin'));
    assert.ok(calls.every(({ options }) => options.method === 'GET' && options.signal && !options.headers));
});

test('Mien keeps external Registrar fallback requests credential-free', async () => {
    const external = [];
    const gallery = await loadMienGallery({ characterId: 0, characters: [{ name: 'No Local Gallery', avatar: 'No Local Gallery.png' }] }, {
        documentRef: { querySelectorAll: () => [] },
        fetchImpl: async (url, options) => {
            if (url.startsWith('/api/')) return { ok: true, json: async () => [] };
            external.push({ url, options });
            return { ok: true, json: async () => [{ label: 'neutral', path: 'https://registrar.weybooru.com/neutral.png' }] };
        },
    });
    assert.equal(gallery.source, 'registrar');
    assert.equal(external.length, 3);
    assert.ok(external.every(({ options }) => options.credentials === 'omit' && !options.headers));
});

test('Mien resolves the active card in one-on-one chats and latest speaker in groups', () => {
    const single = resolveMienCharacter({
        characterId: 0,
        characters: [{ name: 'Summer', avatar: 'Summer.png' }],
        chat: [{ is_user: false, name: 'Summer', mes: 'Hi.' }],
    });
    assert.deepEqual(single, { name: 'Summer', avatar: 'Summer.png', message: { is_user: false, name: 'Summer', mes: 'Hi.' } });

    const group = resolveMienCharacter({
        characterId: undefined,
        groupId: 'group-1',
        characters: [{ name: 'Jenn', avatar: 'Jenn.png' }],
        chat: [{ is_user: false, name: 'Jenn', original_avatar: 'Jenn.png', mes: 'Coffee?' }],
    });
    assert.equal(group.name, 'Jenn');
    assert.equal(group.avatar, 'Jenn.png');
});

test('Mien folder candidates prefer the displayed folder and include override, current, and common outfit folders', () => {
    const image = { getAttribute: name => name === 'data-sprite-folder-name' ? 'Summer/Cheerleader' : '' };
    const context = {
        extensionSettings: { expressionOverrides: [{ name: 'Summer', path: 'Summer/Hoodie' }] },
        chat: [{ is_user: false, mes: '[LG] hello' }],
        chatMetadata: { variables: {} },
    };
    const candidates = mienFolderCandidates(context, { name: 'Summer', avatar: 'Summer.png' }, { querySelectorAll: () => [image] });
    assert.deepEqual(candidates.slice(0, 3), ['Summer/Cheerleader', 'Summer/Hoodie', 'Summer/Lingerie']);
    assert.ok(candidates.includes('Summer/CommunityRegular Outfit'));
    assert.ok(candidates.includes('Summer/CommunityLingerie'));
    assert.ok(candidates.includes('Summer/CommunityNaked'));
    assert.ok(candidates.includes('Summer'));
});

test('Mien resolves an override folder that does not match the character name (the Sofya bug)', () => {
    // Sofya renders live in the roleplay via an expression override whose path is NOT name-prefixed,
    // and the DOM sprite image (if any) is therefore rejected by the name-prefix filter. Mien must
    // still surface the override folder ST is actually rendering from, plus its outfit siblings.
    const context = {
        extensionSettings: { expressionOverrides: [{ name: 'Sofya', path: 'SofyaSprites/Clothed' }] },
        chat: [{ is_user: false, mes: 'hello' }],
        chatMetadata: { variables: {} },
    };
    const candidates = mienFolderCandidates(context, { name: 'Sofya', avatar: 'Sofya.png' }, { querySelectorAll: () => [] });
    // The exact folder ST renders from is present...
    assert.ok(candidates.includes('SofyaSprites/Clothed'));
    // ...and its siblings are enumerable from the derived custom base.
    assert.ok(candidates.includes('SofyaSprites/Naked'));
    assert.ok(candidates.includes('SofyaSprites/Lingerie'));
});

test('Mien discovers every Nara outfit when the card name uses stacked Unicode marks and folder listing is unavailable', async () => {
    const decorated = 'Ṇ̶̰̼͘a̶͍̅́̒r̵̓̏̉̈́ā̸͒̔̄';
    const context = {
        characterId: 0,
        characters: [{ name: decorated, avatar: `${decorated}.png` }],
        chat: [{ is_user: false, name: decorated, mes: 'Hi.' }],
        extensionSettings: { expressionOverrides: [{ name: 'Nara', path: 'Nara/Regular Outfit' }] },
    };
    const available = new Set(['Regular Outfit', 'CommunityRegular Outfit', 'CommunityLingerie', 'CommunityNaked']);
    const gallery = await loadMienGallery(context, {
        documentRef: { querySelectorAll: () => [] },
        fetchImpl: async url => {
            if (url.includes('/folders?')) return { ok: false, json: async () => [] };
            const decoded = decodeURIComponent(url);
            const folder = [...available].find(name => decoded.includes(`${decorated}/${name}`));
            return { ok: true, json: async () => folder ? [{ label: 'neutral', path: `/${folder}/neutral.avif` }] : [] };
        },
    });
    assert.deepEqual(gallery.outfits.map(outfit => outfit.label), [
        'Regular Outfit', 'CommunityRegular Outfit', 'CommunityLingerie', 'CommunityNaked',
    ]);
});

test('Mien normalizes local and Registrar galleries into one UI shape', () => {
    assert.deepEqual(normalizeLocalSprites([{ label: 'joy', path: '/characters/Summer/joy-2.png?t=1' }], 'Summer'), [{
        label: 'joy', path: '/characters/Summer/joy-2.png?t=1', fileName: 'joy-2.png', folderName: 'Summer', source: 'local',
    }]);
    assert.deepEqual(normalizeRegistrarSprites([{ label: 'neutral', path: 'https://example/neutral.avif' }], 'Nova', 'clothed'), [{
        label: 'neutral', path: 'https://example/neutral.avif', fileName: 'neutral.avif', folderName: 'Nova', outfit: 'clothed', source: 'registrar',
    }]);
});

test('Mien loads installed sprites before attempting Registrar fallback', async () => {
    const calls = [];
    const context = {
        characterId: 0,
        characters: [{ name: 'Summer', avatar: 'Summer.png' }],
        chat: [{ is_user: false, name: 'Summer', mes: 'Hi.' }],
        extensionSettings: { expressionOverrides: [] },
    };
    const gallery = await loadMienGallery(context, {
        documentRef: { querySelectorAll: () => [] },
        fetchImpl: async url => {
            calls.push(url);
            return { ok: true, json: async () => url.startsWith('/api/') ? [{ label: 'joy', path: '/characters/Summer/Regular%20Outfit/joy.avif' }] : [] };
        },
    });
    assert.equal(gallery.source, 'local');
    assert.equal(gallery.folderName, 'Summer/Regular Outfit');
    assert.equal(gallery.expressions[0].label, 'joy');
    assert.equal(calls.some(url => url.includes('registrar.weybooru.com')), false);
});

test('Mien falls back to the Registrar when installed sprites are absent', async () => {
    const context = {
        characterId: 0,
        characters: [{ name: 'Nova', avatar: 'Nova.png' }],
        chat: [{ is_user: false, name: 'Nova', mes: 'Hi.' }],
        extensionSettings: { expressionOverrides: [] },
    };
    const gallery = await loadMienGallery(context, {
        documentRef: { querySelectorAll: () => [] },
        fetchImpl: async url => ({
            ok: true,
            json: async () => url.includes('registrar.weybooru.com') ? [{ label: 'neutral', path: 'https://registrar/neutral.avif' }] : [],
        }),
    });
    assert.equal(gallery.source, 'registrar');
    assert.equal(gallery.expressions[0].path, 'https://registrar/neutral.avif');
    assert.deepEqual(gallery.outfits.map(outfit => outfit.label), ['Clothed', 'Underwear', 'Nude']);
});

test('Mien discovers arbitrary local outfit folders and switches without refetching', async () => {
    const context = {
        characterId: 0,
        characters: [{ name: 'Summer', avatar: 'Summer.png' }],
        chat: [{ is_user: false, name: 'Summer', mes: 'Hi.' }],
        extensionSettings: { expressionOverrides: [] },
    };
    const gallery = await loadMienGallery(context, {
        documentRef: { querySelectorAll: () => [] },
        fetchImpl: async url => ({
            ok: true,
            json: async () => {
                if (url.includes('/folders?')) return [{ name: 'Festival' }, { name: 'Naked' }];
                if (url.includes('Summer%2FFestival')) return [{ label: 'joy', path: '/festival-joy.avif' }];
                if (url.includes('Summer%2FNaked')) return [{ label: 'neutral', path: '/naked-neutral.avif' }];
                return [];
            },
        }),
    });
    assert.deepEqual(gallery.outfits.map(outfit => outfit.label).sort(), ['Festival', 'Naked']);
    const switched = selectMienOutfit(gallery, 'local:Summer/Naked');
    assert.equal(switched.selectedOutfitId, 'local:Summer/Naked');
    assert.equal(switched.expressions[0].label, 'neutral');
});

test('Mien checks discovered outfit folders in parallel', async () => {
    let active = 0;
    let maxActive = 0;
    const context = {
        characterId: 0,
        characters: [{ name: 'Summer', avatar: 'Summer.png' }],
        chat: [{ is_user: false, name: 'Summer', mes: 'Hi.' }],
        extensionSettings: { expressionOverrides: [] },
    };
    await loadMienGallery(context, {
        documentRef: { querySelectorAll: () => [] },
        fetchImpl: async url => {
            if (url.includes('/folders?')) {
                return { ok: true, json: async () => [{ name: 'Festival' }, { name: 'Winter' }, { name: 'Naked' }] };
            }
            if (url.startsWith('/api/sprites/get')) {
                active++;
                maxActive = Math.max(maxActive, active);
                await new Promise(resolve => setTimeout(resolve, 5));
                active--;
                return { ok: true, json: async () => [{ label: 'neutral', path: '/neutral.avif' }] };
            }
            return { ok: true, json: async () => [] };
        },
    });
    assert.ok(maxActive >= 2);
});

test('Mien renderer separates browsing from its explicit Set in chat action', () => {
    const container = target();
    renderMienScreen(container, {
        gallery: {
            character: { name: 'Summer' },
            source: 'local',
            selectedOutfitId: 'local:Summer/Festival',
            outfits: [
                { id: 'local:Summer/Festival', label: 'Festival' },
                { id: 'local:Summer/Naked', label: 'Naked' },
            ],
            expressions: [
                { label: 'joy', path: '/joy.avif' },
                { label: 'surprise', path: '/surprise.avif' },
            ],
        },
        selectedIndex: 1,
    });
    assert.match(container.innerHTML, /wp-mien-header/);
    assert.match(container.innerHTML, /weyphone_mien_2\.webp/);
    assert.match(container.innerHTML, /Summer/);
    assert.match(container.innerHTML, /id="wp-mien-apply"/);
    assert.match(container.innerHTML, /id="wp-mien-outfit"/);
    assert.match(container.innerHTML, /id="wp-mien-fullscreen"/);
    assert.match(container.innerHTML, /Festival/);
    assert.match(container.innerHTML, /Set in chat/);
    assert.match(container.innerHTML, /Browsing here will not change the chat/);
    assert.equal((container.innerHTML.match(/class="wp-mien-thumb/g) ?? []).length, 2);
    assert.match(container.innerHTML, /wp-mien-thumb wp-selected/);
});

test('Mien full-screen mode keeps expression navigation, apply, and an exit control', () => {
    const container = target();
    renderMienScreen(container, {
        gallery: {
            character: { name: 'Summer' },
            source: 'local',
            selectedOutfitId: 'local:Summer/Festival',
            outfits: [{ id: 'local:Summer/Festival', label: 'Festival' }],
            expressions: [{ label: 'joy', path: '/joy.avif' }, { label: 'anger', path: '/anger.avif' }],
        },
        selectedIndex: 1,
        fullscreen: true,
    });
    assert.match(container.innerHTML, /wp-mien-fullscreen-view/);
    assert.match(container.innerHTML, /id="wp-mien-fullscreen-exit"/);
    assert.match(container.innerHTML, /id="wp-mien-prev"/);
    assert.match(container.innerHTML, /id="wp-mien-next"/);
    assert.match(container.innerHTML, /id="wp-mien-apply"/);
    assert.match(container.innerHTML, /anger/);
});
