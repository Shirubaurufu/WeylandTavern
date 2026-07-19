const APP_HELP = {
    chronicle: {
        intro: 'Weyland’s local newspaper and campus bulletin.',
        bullets: ['Read city headlines and practical campus alerts.', 'Refreshes together with Chitter, Discorgi, and Yip Yap when you tap Sync.'],
    },
    feed: {
        intro: 'A public social feed for Weyland’s cast and local accounts.',
        bullets: ['Browse posts, likes, and character profiles.', 'Registrar characters you imported may appear occasionally.', 'Refreshes as part of the four-app Sync.'],
    },
    chat: {
        intro: 'A live server-style view of Weyland community chatter.',
        bullets: ['Messages are grouped into channels.', 'Expect short conversations, announcements, and campus nonsense.', 'Refreshes as part of the four-app Sync.'],
    },
    board: {
        intro: 'Weyland’s anonymous local message board.',
        bullets: ['Expect confessions, complaints, missed connections, and gossip.', 'Posts are anonymous and are not organized conversations.', 'Refreshes as part of the four-app Sync.'],
    },
    messages: {
        intro: 'Private text conversations with available Weyland contacts.',
        bullets: ['The arrow queues as many messages as you want.', 'Unlinked is isolated; Observe can read the active roleplay; Linked sends your texts through the main roleplay model.', 'In a Linked DM, Scrub messages stops injecting the current chatlog without deleting its bubbles; later texts form a new batch.', 'In Unlinked and Observe, refresh sends the queued burst through WeyPhone’s texting model.', 'Downloaded characters use their full card; otherwise WeyPhone uses an available lorebook subbot.'],
    },
    contacts: {
        intro: 'A directory of official Weyland cast members and imported Registrar characters.',
        bullets: ['Downloaded character cards are preferred for texting.', 'A matching Weyland or Registrar subbot is used when no card is installed.', 'Contacts with neither source are marked Not reachable.'],
    },
    calculator: {
        intro: 'A simple offline calculator.',
        bullets: ['Nothing here calls a model or spends a message.'],
    },
    notes: {
        intro: 'Private notes stored inside this WeyPhone.',
        bullets: ['Create, edit, and delete notes without generation.', 'Notes are included when you export a WeyPhone backup.'],
    },
    housing: {
        intro: 'An interactive directory of Weyland housing.',
        bullets: ['Browse dorms, rooms, and known residents.', 'The Registrar toggle can add community residents to the map.'],
    },
    kressa: {
        intro: 'Kressa, your Wolfgirl Assistant.',
        bullets: ['She can use Weyland lore and maintain multiple conversation threads.', 'Use Observe when you want her to comment on another character’s roleplay without affecting it.', 'Linked is available only while Kressa’s own character-card roleplay is open.', 'Her model and color palette are separate from ordinary Messages.', 'She always knows who you are.'],
    },
    pawxai: {
        intro: 'An SDXL-style prompt writer based on the latest roleplay scene.',
        bullets: ['Uses the latest three messages for context and depicts the final character message.', 'Generated prompts can be copied, deleted, or saved by character.', 'It writes prompts only; image generation happens in the service of your choice.'],
    },
    mien: {
        intro: 'A pocket expression gallery for the character in your active chat.',
        bullets: ['Choose among every installed outfit available for the character.', 'Browse sprites or open the immersive full-screen viewer without changing the chat portrait.', 'Tap Set in chat to apply one expression temporarily.', 'The next character message returns expression control to SillyTavern.', 'If local sprites are missing, Mien checks each Registrar outfit gallery.'],
    },
    settings: {
        intro: 'Controls for this WeyPhone.',
        bullets: ['Change wallpapers, models, app names, and device preferences.', 'Export or import the full phone when moving between installs.', 'Format WeyPhone erases its stored data and returns to first-time setup.'],
    },
};

const MESSAGE_BUDGET_BULLET = 'Budget rule: one generation request = one message spent. Actions that do not call a model spend nothing.';

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function getAppHelp(appKey) {
    const help = APP_HELP[appKey];
    return help ? { ...help, bullets: [...(help.bullets ?? []), MESSAGE_BUDGET_BULLET] } : null;
}

export function renderNoticeDialog(container, { kicker = 'WeyPhone', title, body, bullets = [] }) {
    container.innerHTML = `
<div class="wp-app-help-backdrop" data-help-close></div>
<section class="wp-app-help-card" role="dialog" aria-modal="true" aria-labelledby="wp-app-help-title">
    <div class="wp-app-help-heading">
        <div>
            <div class="wp-app-help-kicker">${escapeHtml(kicker)}</div>
            <div id="wp-app-help-title" class="wp-app-help-title">${escapeHtml(title)}</div>
        </div>
        <button type="button" class="wp-app-help-close" data-help-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <p>${escapeHtml(body)}</p>
    ${bullets.length ? `<ul>${bullets.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
</section>`;
    container.hidden = false;
}

export function renderAppHelpDialog(container, { appKey, appLabel }) {
    const help = getAppHelp(appKey);
    if (!help) {
        container.hidden = true;
        container.innerHTML = '';
        return;
    }
    container.innerHTML = `
<div class="wp-app-help-backdrop" data-help-close></div>
<section class="wp-app-help-card" role="dialog" aria-modal="true" aria-labelledby="wp-app-help-title">
    <div class="wp-app-help-heading">
        <div>
            <div class="wp-app-help-kicker">What is this?</div>
            <div id="wp-app-help-title" class="wp-app-help-title">${escapeHtml(appLabel)}</div>
        </div>
        <button type="button" class="wp-app-help-close" data-help-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <p>${escapeHtml(help.intro)}</p>
    ${help.bullets?.length ? `<ul>${help.bullets.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
</section>`;
    container.hidden = false;
}
