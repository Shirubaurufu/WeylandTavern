// lib/ui/apps/discorgiSettings.js
//
// Discorgi's settings screen: which channels a Sync is allowed to roll. Players kept asking to
// pick the channels they actually want to read (and to drop ones they don't), so every real
// channel gets a checkbox. Sync still picks 1-2 at random, just from the checked ones. The saved
// value is settings.discorgiExcludedChannels (see lib/discorgiChannels.js for why it is an
// exclusion list); index.js's handleScreenBodyChange owns the writes.
import { DISCORGI_CHANNELS, allowedDiscorgiChannels } from '../../discorgiChannels.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {{excludedChannels?: string[]}} state
 */
export function renderDiscorgiSettingsScreen(container, { excludedChannels = [] } = {}) {
    const allowed = new Set(allowedDiscorgiChannels(excludedChannels).map(channel => channel.name));
    const onlyOne = allowed.size === 1;
    const rows = DISCORGI_CHANNELS.map(channel => {
        const checked = allowed.has(channel.name);
        // The last checked channel can't be unticked - a Sync always needs somewhere to post.
        const locked = checked && onlyOne;
        return `
        <label class="wp-discorgi-setting-channel${checked ? ' wp-checked' : ''}"${locked ? ' title="At least one channel has to stay on"' : ''}>
            <input type="checkbox" data-discorgi-channel="${escapeHtml(channel.name)}"${checked ? ' checked' : ''}${locked ? ' disabled' : ''} />
            <span class="wp-discorgi-setting-copy">
                <strong><span aria-hidden="true">#</span>${escapeHtml(channel.name.slice(1))}</strong>
                <small>${escapeHtml(channel.blurb)}</small>
            </span>
        </label>`;
    }).join('');
    container.innerHTML = `
<div class="wp-discorgi-settings">
    <div class="wp-discorgi-settings-intro">
        <strong>Channels in rotation</strong>
        <span>Each Sync fills one or two channels, picked at random from the ones switched on here.</span>
    </div>
    <div class="wp-discorgi-settings-count">${allowed.size} of ${DISCORGI_CHANNELS.length} on</div>
    <div class="wp-discorgi-settings-list">${rows}</div>
    <div class="wp-discorgi-settings-actions">
        <button type="button" data-discorgi-action="all"${allowed.size === DISCORGI_CHANNELS.length ? ' disabled' : ''}>Turn all on</button>
    </div>
</div>`;
}
