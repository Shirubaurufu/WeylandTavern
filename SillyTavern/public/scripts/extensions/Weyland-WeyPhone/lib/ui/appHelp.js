const APP_HELP = {
    chronicle: {
        intro: 'Weyland’s local newspaper and campus bulletin.',
        bullets: ['Read city headlines and practical campus alerts.', 'Refreshes together with Chitter, Discorgi, and Yip Yap when you tap Sync.', 'One Sync uses one shared generation slot and updates all four social apps.', 'Shared cooldown: Standard gets 2 generations per 15 minutes, Paw Patrol Plus gets 2 per 10 minutes, and Platinum gets 2 per 5 minutes.'],
    },
    feed: {
        intro: 'A public social feed for Weyland’s cast and local accounts.',
        bullets: ['Browse posts, likes, and character profiles.', 'Registrar characters you imported may appear occasionally.', 'Refreshes as part of the four-app Sync.', 'Sync and newly generated character profiles use the shared cooldown: Standard gets 2 generations per 15 minutes, Plus gets 2 per 10 minutes, and Platinum gets 2 per 5 minutes.'],
    },
    chat: {
        intro: 'A live server-style view of Weyland community chatter.',
        bullets: ['Messages are grouped into channels.', 'Expect short conversations, announcements, and campus nonsense.', 'Refreshes as part of the four-app Sync.', 'Shared cooldown: Standard gets 2 generations per 15 minutes, Paw Patrol Plus gets 2 per 10 minutes, and Platinum gets 2 per 5 minutes.'],
    },
    board: {
        intro: 'Weyland’s anonymous local message board.',
        bullets: ['Expect confessions, complaints, missed connections, and gossip.', 'Posts are anonymous and are not organized conversations.', 'Refreshes as part of the four-app Sync.', 'Shared cooldown: Standard gets 2 generations per 15 minutes, Paw Patrol Plus gets 2 per 10 minutes, and Platinum gets 2 per 5 minutes.'],
    },
    messages: {
        intro: 'Private text conversations with available Weyland contacts.',
        sections: [
            {
                heading: 'General',
                bullets: [
                    'The arrow adds your message to the thread without calling a model. Queue as many separate texts as you want.',
                    'In Unlinked and Observe, the refresh button sends the queued burst through WeyPhone’s texting model.',
                    'Downloaded characters use their full card in one-person chats. Otherwise WeyPhone uses an available lorebook subbot. Group chats always use subbots.',
                ],
            },
            {
                heading: 'Unlinked',
                bullets: [
                    'The thread is completely isolated from the active roleplay.',
                    'It cannot read roleplay context and cannot add anything to the roleplay prompt.',
                    'Replies come from WeyPhone’s texting model when you tap refresh.',
                ],
            },
            {
                heading: 'Observe',
                bullets: [
                    'The contact can read the active roleplay as background context.',
                    'The thread cannot write its textlog back into the roleplay.',
                    'Replies still come from WeyPhone’s texting model when you tap refresh. This is useful when Kressa or another contact is commenting on a separate scene.',
                ],
            },
            {
                heading: 'Linked',
                bullets: [
                    'Linked connects the thread to its matching active roleplay. Compatible texts generated inside the roleplay are imported into WeyPhone automatically.',
                    'Queue your reply in WeyPhone, then continue roleplaying normally. Your next ordinary roleplay request receives the updated textlog invisibly in the background. Nothing extra appears in your visible roleplay history.',
                    'The main roleplay model writes the character’s response. Compatible phone output is imported back into the thread.',
                    'The latest eligible text batch remains hidden background context on each roleplay generation, even when no new text was added. This does not create a second model request or spend another message.',
                    'Scrub messages stops sending the current batch without deleting its WeyPhone bubbles. Texts added afterward begin a new batch.',
                    'Only the people in the text conversation know its contents unless somebody reveals them during the roleplay.',
                ],
            },
        ],
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
        bullets: ['Uses the latest three messages for context and depicts the final character message.', 'Generated prompts can be copied, deleted, or saved by character.', 'It writes prompts only. Image generation happens in the service of your choice.', 'A full prompt set uses one shared generation slot, whether it contains one prompt or ten. Paw Patrol tiers have shorter cooldown windows.'],
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
    if (!help) return null;
    if (help.sections?.length) {
        const sections = help.sections.map(section => ({ ...section, bullets: [...(section.bullets ?? [])] }));
        const general = sections.find(section => section.heading === 'General') ?? sections[0];
        general.bullets.push(MESSAGE_BUDGET_BULLET);
        return { ...help, sections };
    }
    return { ...help, bullets: [...(help.bullets ?? []), MESSAGE_BUDGET_BULLET] };
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
    const details = help.sections?.length
        ? help.sections.map(section => `
            <section class="wp-app-help-section">
                <h3>${escapeHtml(section.heading)}</h3>
                ${section.bullets?.length ? `<ul>${section.bullets.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
            </section>`).join('')
        : (help.bullets?.length ? `<ul>${help.bullets.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '');
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
    ${details}
</section>`;
    container.hidden = false;
}
