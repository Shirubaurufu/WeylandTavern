import test from 'node:test';
import assert from 'node:assert/strict';
import { firstNameForSpeaker, renderContactsScreen, renderConversationScreen, renderGroupComposeScreen, renderPanelAvatar, renderPhoneAppScreen, renderTwitterFeedScreen, renderTwitterFollowingScreen } from '../lib/panel.js';
import { renderAppNamesScreen, renderCharacterWallpapersScreen, renderSettingsScreen, WALLPAPER_PRESETS, CHARACTER_WALLPAPERS } from '../lib/ui/apps/settings.js';
import { CALCULATOR_PALETTES, renderCalculatorScreen, renderCalculatorSettingsScreen } from '../lib/ui/apps/calculator.js';
import { renderContactDetailScreen } from '../lib/ui/apps/contacts.js';
import { KRESSA_PALETTES, renderKressaSettingsScreen } from '../lib/ui/apps/kressaSettings.js';
import { renderPawXaiScreen } from '../lib/ui/apps/pawxai.js';
import { normalizePawXaiSettings } from '../lib/pawxai.js';
import { APP_REGISTRY } from '../lib/appRegistry.js';
import { HOME_GRID_ORDER, renderHomeScreen } from '../lib/ui/homeScreen.js';
import { DISCORGI_CHANNELS } from '../lib/discorgiChannels.js';

function container() {
    return { innerHTML: '' };
}

test('conversation composer queues with an arrow, requests with refresh, and has no image attachment UI', () => {
    const target = container();
    renderConversationScreen(target);
    assert.match(target.innerHTML, /id="wp-request-reply-button"/);
    assert.match(target.innerHTML, /fa-rotate/);
    assert.match(target.innerHTML, /id="wp-send-button"/);
    assert.match(target.innerHTML, /fa-arrow-up/);
    assert.doesNotMatch(target.innerHTML, /wp-attach|paperclip|type="file"/);
    assert.match(target.innerHTML, /data-roleplay-mode="unlinked"/);
    assert.match(target.innerHTML, /data-roleplay-mode="observe"/);
    assert.match(target.innerHTML, /data-roleplay-mode="linked"/);
    assert.match(target.innerHTML, /data-action="scrub-roleplay"[^>]*hidden/);
    assert.match(target.innerHTML, /id="wp-select-delete" class="wp-select-action wp-select-delete"/);
    assert.doesNotMatch(target.innerHTML, /id="wp-select-delete" class="menu_button"/);
});

test('single-message and group-message creation use separate entry points', () => {
    const contacts = container();
    renderContactsScreen(contacts, [{ name: 'Summer' }, { name: 'Miu' }], {});
    assert.match(contacts.innerHTML, /data-name="Summer"/);
    assert.doesNotMatch(contacts.innerHTML, /wp-new-group-button|New group chat/);

    const selecting = container();
    renderGroupComposeScreen(selecting, { contacts: [{ name: 'Summer', bookName: 'Weyland' }, { name: 'Miu', bookName: 'Weyland' }], selectedNames: [] });
    assert.match(selecting.innerHTML, /wp-group-contact-checkbox/);
    assert.doesNotMatch(selecting.innerHTML, /id="wp-group-title"/);

    const naming = container();
    renderGroupComposeScreen(naming, { contacts: [{ name: 'Summer', bookName: 'Weyland' }, { name: 'Miu', bookName: 'Weyland' }], selectedNames: ['Summer', 'Miu'] });
    assert.match(naming.innerHTML, /What should this group be called/);
    assert.match(naming.innerHTML, /id="wp-group-title"/);
    assert.match(naming.innerHTML, /Create group \(2\/4\)/);
});

test('group conversations use first-name speaker labels and a default group avatar', () => {
    assert.equal(firstNameForSpeaker('Blake Fuyuki'), 'Blake');
    assert.equal(firstNameForSpeaker('Briar Adeyemi'), 'Briar');
    const avatar = container();
    renderPanelAvatar(avatar, { group: true });
    assert.match(avatar.innerHTML, /wp-avatar-group/);
    assert.match(avatar.innerHTML, /fa-user-group/);
});

test('home launcher uses the requested Mien/Notes and Calculator/PawXai swaps', () => {
    const target = container();
    renderHomeScreen(target, {
        apps: APP_REGISTRY,
        badges: {}, flavorAppsEnabled: true, syncing: false, airplane: false,
    });
    const rendered = [...target.innerHTML.matchAll(/data-app="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(rendered.slice(0, HOME_GRID_ORDER.length), HOME_GRID_ORDER);
    assert.ok(rendered.indexOf('pawxai') < rendered.indexOf('calculator'));
    assert.ok(rendered.indexOf('mien') < rendered.indexOf('notes'));
});

test('Kressa conversation gets a dedicated assistant-workspace masthead', () => {
    const target = container();
    renderConversationScreen(target, { appKey: 'kressa' });
    assert.match(target.innerHTML, /wp-kressa-chat-header/);
    assert.match(target.innerHTML, /Wolfgirl Assistant/);
    assert.doesNotMatch(target.innerHTML, /data-action="prior-history"/);
});

test('ordinary character conversation keeps the Prior History control', () => {
    const target = container();
    renderConversationScreen(target);
    assert.match(target.innerHTML, /data-action="prior-history"/);
});

test('Kressa settings offers ten unique palettes including two dark modes and marks the saved palette selected', () => {
    assert.equal(KRESSA_PALETTES.length, 10);
    assert.equal(new Set(KRESSA_PALETTES.map(palette => palette.id)).size, KRESSA_PALETTES.length);
    assert.deepEqual(KRESSA_PALETTES.slice(-2).map(palette => palette.id), ['night-owl', 'terminal-bloom']);
    const target = container();
    renderKressaSettingsScreen(target, {
        settings: { kressaModel: '', kressaPalette: 'forest-sprite', kressaHardModeEnabled: false },
        currentLiveModel: 'live-model',
    });
    assert.equal((target.innerHTML.match(/class="wp-kressa-palette-button/g) ?? []).length, 10);
    assert.match(target.innerHTML, /wp-kressa-palette-button wp-selected" data-palette="forest-sprite" aria-pressed="true"/);
    assert.match(target.innerHTML, /id="wp-kressa-hard-mode"/);
    assert.doesNotMatch(target.innerHTML, /id="wp-kressa-hard-mode"[^>]*checked/);
});

test('Yip Yap and Chitter render their static in-app headers even before generation', () => {
    const board = container();
    renderPhoneAppScreen(board, {
        appKey: 'board', appLabel: 'Yip Yap', emptyCopy: 'Nothing yet.', entry: undefined,
        isGenerating: false, formatRelativeTime: () => 'now',
        generationAllowance: { remaining: 2, maxRequests: 2 },
    });
    assert.match(board.innerHTML, /wp-yipyap-header/);
    assert.match(board.innerHTML, /Weyland Campus/);
    assert.match(board.innerHTML, /weyphone_yikyak\.webp/);
    assert.equal((board.innerHTML.match(/Coming soon!/g) ?? []).length, 2);
    assert.match(board.innerHTML, /wp-yipyap-header-actions[^]*wp-generation-rate-counter[^>]*[^]*>2\/2</);
    assert.doesNotMatch(board.innerHTML, /2\/2 ready|wp-generation-rate-strip/);

    const feed = container();
    renderTwitterFeedScreen(feed, {
        entry: undefined, isGenerating: false, formatRelativeTime: () => 'now', portraitMap: {},
        generationAllowance: { remaining: 1, maxRequests: 2 },
    });
    assert.match(feed.innerHTML, /wp-chitter-header/);
    assert.match(feed.innerHTML, /For you/);
    assert.equal((feed.innerHTML.match(/id="wp-twitter-following-link"/g) ?? []).length, 1);
    assert.match(feed.innerHTML, /wp-chitter-icons[^]*wp-generation-rate-counter[^>]*[^]*>1\/2</);
    assert.doesNotMatch(feed.innerHTML, /1\/2 ready|wp-generation-rate-strip/);
    assert.doesNotMatch(feed.innerHTML, /Following →/);

    const following = container();
    renderTwitterFollowingScreen(following, {
        roster: [{ name: 'Summer', handle: '@summer' }],
        portraitMap: { Summer: { initial: 'S' } },
        generationAllowance: { remaining: 0, maxRequests: 2 },
    });
    assert.match(following.innerHTML, /wp-chitter-header/);
    assert.match(following.innerHTML, /id="wp-twitter-feed-link"/);
    assert.match(following.innerHTML, /wp-chitter-following-pane/);
    assert.match(following.innerHTML, />0\/2</);
});

test('Discorgi and Calculator own their help-enabled app chrome', () => {
    const discorgi = container();
    renderPhoneAppScreen(discorgi, {
        appKey: 'chat', appLabel: 'Discorgi', emptyCopy: 'Offline.', entry: {
            generatedAt: 1,
            content: {
                sections: [
                    { title: '#dorm-commons', items: [{ timestamp: '1:00 PM', boldPrefix: '@Summer', text: '@Summer hello' }] },
                    { title: '#fur-hall', items: [{ timestamp: '1:01 PM', boldPrefix: '@Nix', text: '@Nix hello' }] },
                ],
            },
        },
        isGenerating: false, formatRelativeTime: () => 'now',
        generationAllowance: { remaining: 2, maxRequests: 2 },
    });
    assert.match(discorgi.innerHTML, /wp-discorgi-header/);
    assert.match(discorgi.innerHTML, /data-app-key="chat"/);
    for (const channel of DISCORGI_CHANNELS) assert.ok(discorgi.innerHTML.includes(channel.name));
    assert.equal((discorgi.innerHTML.match(/wp-discorgi-channel-option wp-active/g) ?? []).length, 2);
    assert.match(discorgi.innerHTML, /Weyland Discorgi/);
    assert.match(discorgi.innerHTML, /wp-discorgi-topline[^]*wp-generation-rate-counter[^>]*[^]*>2\/2</);
    assert.doesNotMatch(discorgi.innerHTML, /2\/2 ready|wp-generation-rate-strip/);
    assert.doesNotMatch(discorgi.innerHTML, />campus</);

    const calculator = container();
    renderCalculatorScreen(calculator, { display: '0' });
    assert.match(calculator.innerHTML, /wp-calculator-header/);
    assert.match(calculator.innerHTML, /id="wp-calc-settings-button"/);
    renderCalculatorSettingsScreen(calculator, { selectedPalette: 'mint' });
    assert.equal(CALCULATOR_PALETTES.length, 6);
    assert.match(calculator.innerHTML, /wp-calc-palette-button wp-selected" data-calc-palette="mint"/);
});

test('character wallpapers render alphabetically with editable focus controls', () => {
    assert.equal(CHARACTER_WALLPAPERS.length, 14);
    assert.deepEqual(CHARACTER_WALLPAPERS.map(item => item.name), [...CHARACTER_WALLPAPERS.map(item => item.name)].sort((a, b) => a.localeCompare(b)));
    const target = container();
    renderCharacterWallpapersScreen(target, { settings: { ui: { wallpaper: CHARACTER_WALLPAPERS[0].url, wallpaperPositionX: 40, wallpaperPositionY: 65, wallpaperDim: 30, wallpaperLightWash: 50 } } });
    assert.equal((target.innerHTML.match(/wp-character-wallpaper-card/g) ?? []).length, 14);
    assert.match(target.innerHTML, /wp-character-wallpaper-card wp-selected/);
    assert.match(target.innerHTML, /id="wp-settings-wallpaper-x"/);
    assert.match(target.innerHTML, /id="wp-settings-wallpaper-y"/);
    assert.match(target.innerHTML, /id="wp-settings-wallpaper-dim"/);
    assert.match(target.innerHTML, /id="wp-settings-wallpaper-wash"[^>]*value="50"/);
});

test('Settings renders independent models, custom-wallpaper controls, and format confirmation', () => {
    const target = container();
    renderSettingsScreen(target, {
        settings: {
            ui: { wallpaper: 'https://example.test/wallpaper.jpg', wallpaperPositionX: 20, wallpaperPositionY: 70, wallpaperDim: 35, wallpaperLightWash: 45 },
            modelOverride: 'sync-model', textingModelOverride: 'text-model', phoneHardModeEnabled: false, appLabels: {},
        },
        currentLiveModel: 'live-model',
        logLines: [],
        formatClockTime: () => '1:00 PM',
    });
    assert.match(target.innerHTML, /id="wp-settings-model"[^>]*value="sync-model"/);
    assert.match(target.innerHTML, /id="wp-settings-texting-model"[^>]*value="text-model"/);
    assert.match(target.innerHTML, /id="wp-settings-hard-mode"/);
    assert.doesNotMatch(target.innerHTML, /id="wp-settings-hard-mode"[^>]*checked/);
    assert.match(target.innerHTML, /id="wp-settings-battery-tracker"/);
    assert.match(target.innerHTML, /Messages-left battery/);
    assert.match(target.innerHTML, /id="wp-settings-capture-roleplay-texts"/);
    assert.doesNotMatch(target.innerHTML, /wp-settings-bidirectional-tether/);
    assert.match(target.innerHTML, /even when automatic capture is off/);
    assert.match(target.innerHTML, /id="wp-settings-wallpaper-x"[^>]*value="20"/);
    assert.match(target.innerHTML, /id="wp-settings-wallpaper-y"[^>]*value="70"/);
    assert.match(target.innerHTML, /id="wp-settings-wallpaper-dim"[^>]*value="35"/);
    assert.match(target.innerHTML, /id="wp-settings-wallpaper-wash"[^>]*value="45"/);
    assert.match(target.innerHTML, /Background dimming <small>Default 20%/);
    assert.match(target.innerHTML, /Light wash <small>Default 0%/);
    assert.match(target.innerHTML, /wp-wallpaper-hints/);
    assert.doesNotMatch(target.innerHTML, /like the example you showed/);
    assert.match(target.innerHTML, /id="wp-format-confirm"/);
    assert.match(target.innerHTML, /id="wp-export-button"/);
    assert.match(target.innerHTML, /id="wp-import-button"/);
    assert.match(target.innerHTML, /id="wp-import-file"[^>]*accept="application\/json,.json"/);
    assert.match(target.innerHTML, /id="wp-app-names-button"/);
    assert.match(target.innerHTML, /class="wp-settings-credit"/);
    assert.match(target.innerHTML, /WeyPhone V2 by Kressa and Lucky/);
    assert.match(target.innerHTML, /class="wp-settings-credit-v1"/);
    assert.match(target.innerHTML, /@aerosplat/);
    assert.doesNotMatch(target.innerHTML, /class="wp-settings-applabel"/);
});

test('tier-gated home apps remain visible with a tappable lock marker', () => {
    const target = container();
    renderHomeScreen(target, {
        apps: [{ key: 'kressa', label: 'Kressa', icon: '/kressa.png', accent: '#8B7BB8', requiresRoleplay: false, tierLocked: true }],
        badges: {}, flavorAppsEnabled: true, syncing: false, airplane: false,
    });
    assert.match(target.innerHTML, /wp-app-tile-tier-locked/);
    assert.match(target.innerHTML, /wp-app-tier-lock/);
    assert.match(target.innerHTML, /data-app="kressa"/);
});

test('App-name editing lives on its dedicated settings sub-screen', () => {
    const target = container();
    renderAppNamesScreen(target, { settings: { appLabels: { feed: 'Critter' } } });
    assert.equal((target.innerHTML.match(/class="wp-settings-applabel"/g) ?? []).length, APP_REGISTRY.length);
    assert.match(target.innerHTML, /data-app-key="feed"[^>]*value="Critter"/);
});

test('wallpaper presets are restored to the original ten static choices', () => {
    assert.deepEqual(Object.keys(WALLPAPER_PRESETS), ['default', 'violet', 'forest', 'mono', 'observatory', 'sakura', 'lantern', 'barrel', 'kodo', 'sterling']);
    assert.equal(WALLPAPER_PRESETS.default.label, 'Weyland Ember');
    assert.match(WALLPAPER_PRESETS.observatory.css, /3px 3px/);
    assert.ok(Object.values(WALLPAPER_PRESETS).every(preset => !('motion' in preset)));
});

test('a lorebook-only contact remains messageable and explains its personality source', () => {
    const target = container();
    renderContactDetailScreen(target, {
        entry: { name: 'Vindica Blackwood', tag: [], description: '', species: '', occupation: '' },
        messagable: true,
        lorebookOnly: true,
        renameKey: 'Vindica Blackwood',
    });
    const messageButtonTag = target.innerHTML.match(/<button id="wp-contact-message-btn"[^>]*>/)[0];
    assert.match(messageButtonTag, /data-contact-name="Vindica Blackwood"/);
    assert.doesNotMatch(messageButtonTag, /disabled/);
    assert.doesNotMatch(target.innerHTML, /Not reachable/);
    assert.match(target.innerHTML, /personality comes from the Weyland lorebook/);
});

test('a contact with neither a card nor a subbot is visibly not reachable', () => {
    const target = container();
    renderContactDetailScreen(target, {
        entry: { name: 'Joanna', species: '', occupation: '', age: '', birthday: '', height: '', home: '', association: '', handle: '', tag: [], summary: '', description: '', image: '' },
        messagable: false,
        lorebookOnly: false,
        displayName: 'Joanna',
        renameKey: 'Joanna',
    });
    assert.match(target.innerHTML, /Not reachable/);
    assert.match(target.innerHTML, /wp-contact-message-btn[^>]*disabled/);
    assert.doesNotMatch(target.innerHTML, /wp-contact-history-toggle/);
});

test('PawXai renders generation, saved-library, and settings surfaces', () => {
    const settings = normalizePawXaiSettings({
        promptCount: 5,
        modelFeedback: 'Use less subjective prompts.',
        lastRun: { characterName: 'Kressa', prompts: [{ title: 'Kressa adjusts her glasses', prompt: '1girl, broad shoulders, glasses' }] },
        savedPrompts: [{ id: 'saved-1', characterName: 'Kressa', title: 'Kressa adjusts her glasses', prompt: '1girl, broad shoulders', createdAt: 1 }],
    });
    const target = container();
    renderPawXaiScreen(target, {
        settings,
        activeTab: 'generate',
        source: { characterName: 'Kressa', message: 'Kressa adjusts her glasses.' },
        generating: false,
        currentLiveModel: 'live-model',
        formatRelativeTime: () => 'now',
    });
    assert.match(target.innerHTML, /id="wp-pawxai-generate"/);
    assert.match(target.innerHTML, /id="wp-pawxai-refresh-source"/);
    assert.match(target.innerHTML, /Kressa adjusts her glasses/);
    assert.match(target.innerHTML, /wp-pawxai-delete-result/);
    assert.match(target.innerHTML, /Latest from Kressa/);
    assert.match(target.innerHTML, /data-pawxai-tab="saved"/);
    assert.match(target.innerHTML, /weyphone_pawxai\.webp/);

    renderPawXaiScreen(target, { settings, activeTab: 'saved', formatRelativeTime: () => 'now' });
    assert.match(target.innerHTML, /wp-pawxai-character-row/);
    assert.match(target.innerHTML, /Kressa/);

    renderPawXaiScreen(target, { settings, activeTab: 'saved', selectedSavedCharacter: 'Kressa', formatRelativeTime: () => 'now' });
    assert.match(target.innerHTML, /wp-pawxai-library-back/);
    assert.match(target.innerHTML, /Kressa adjusts her glasses/);

    renderPawXaiScreen(target, { settings, activeTab: 'settings', currentLiveModel: 'live-model', formatRelativeTime: () => 'now' });
    assert.match(target.innerHTML, /id="wp-pawxai-model"/);
    assert.match(target.innerHTML, /max 10/);
    assert.match(target.innerHTML, /POV and Quality Suffix/);
    assert.match(target.innerHTML, /data-pawxai-suffix="male POV"/);
    assert.match(target.innerHTML, /data-pawxai-suffix="\(dynamic angle:1\.2\)"/);
    assert.match(target.innerHTML, /data-pawxai-suffix="sound effects"/);
    assert.match(target.innerHTML, /wp-pawxai-suffix-button wp-selected/);
    assert.match(target.innerHTML, /Adult-only explicit scenes are preserved/);
    assert.match(target.innerHTML, /id="wp-pawxai-feedback"[^>]*placeholder="Really focus on the tags for the hair!"/);
    assert.match(target.innerHTML, /Use less subjective prompts/);
    assert.match(target.innerHTML, /wp-pawxai-palette-button/);
    assert.match(target.innerHTML, /class="wp-pawxai-referral-card"/);
    assert.match(target.innerHTML, /refCode=YB7SKUFW&amp;utm_source=referral/);
    assert.match(target.innerHTML, /20,000 free credits/);
    assert.match(target.innerHTML, /Referral code <b>YB7SKUFW<\/b>/);
});
