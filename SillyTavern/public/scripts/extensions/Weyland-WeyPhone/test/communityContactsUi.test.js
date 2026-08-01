import test from 'node:test';
import assert from 'node:assert/strict';

import {
    communityContactsSummaryMarkup,
    renderCommunityDeleteScreen,
} from '../lib/ui/apps/communityContacts.js';

function container() {
    return { innerHTML: '' };
}

test('community contact settings offer selective deletion instead of clear-all', () => {
    const markup = communityContactsSummaryMarkup({ count: 2 });
    assert.match(markup, /Delete community contacts/);
    assert.match(markup, /Choose individual contacts to remove/);
    assert.doesNotMatch(markup, /Clear community contacts/);
});

test('delete screen starts safe and enables only the selected contacts', () => {
    const target = container();
    const contacts = [
        { name: 'Felonious', lorebookName: 'Registrar' },
        { name: 'Vera', lorebookName: 'Community Book' },
    ];

    renderCommunityDeleteScreen(target, { contacts, selected: new Set() });
    assert.equal((target.innerHTML.match(/wp-community-delete-checkbox/g) ?? []).length, 2);
    assert.doesNotMatch(target.innerHTML, /type="checkbox"[^>]* checked/);
    assert.match(target.innerHTML, /id="wp-community-delete-confirm"[^>]* disabled/);

    renderCommunityDeleteScreen(target, { contacts, selected: new Set(['vera|community book']) });
    assert.equal((target.innerHTML.match(/type="checkbox"[^>]* checked/g) ?? []).length, 1);
    assert.match(target.innerHTML, />Delete 1 Contact<\/button>/);
    assert.doesNotMatch(target.innerHTML, /id="wp-community-delete-confirm"[^>]* disabled/);
});
