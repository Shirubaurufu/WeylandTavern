import test from 'node:test';
import assert from 'node:assert/strict';

import { APP_REGISTRY } from '../lib/appRegistry.js';
import { getAppHelp, renderAppHelpDialog } from '../lib/ui/appHelp.js';
import { createPanelMarkup } from '../lib/panel.js';

// Apps that cannot spend a message on their own — the budget rule is deliberately omitted from
// their help (see NO_BUDGET_RULE_APPS in lib/ui/appHelp.js).
const NO_BUDGET_RULE_APPS = new Set(['contacts', 'notes', 'calculator', 'clock', 'housing', 'mien']);

test('every WeyPhone app has contextual help with concise structured copy', () => {
    for (const app of APP_REGISTRY) {
        const help = getAppHelp(app.key);
        assert.ok(help, `${app.key} should have help`);
        assert.ok(help.intro.length > 0);
        const bullets = help.sections?.flatMap(section => section.bullets ?? []) ?? help.bullets;
        assert.ok(Array.isArray(bullets));
        assert.ok(bullets.length > 0, `${app.key} should have at least one bullet`);
        const hasBudgetRule = bullets.some(item => /one generation request = one message spent/i.test(item));
        assert.equal(hasBudgetRule, !NO_BUDGET_RULE_APPS.has(app.key), `${app.key} budget-rule bullet presence`);
    }
});

test('the budget rule is omitted for apps that never call a model, and getAppHelp stays pure', () => {
    for (const key of NO_BUDGET_RULE_APPS) {
        const help = getAppHelp(key);
        assert.ok(help, `${key} should have help`);
        assert.ok(!help.bullets.some(item => /Budget rule/i.test(item)), `${key} should not carry the budget rule`);
    }
    // Repeated calls must not accumulate duplicates — getAppHelp copies before pushing.
    assert.deepEqual(getAppHelp('chronicle').bullets, getAppHelp('chronicle').bullets);
    assert.deepEqual(
        getAppHelp('messages').sections.map(s => s.bullets.length),
        getAppHelp('messages').sections.map(s => s.bullets.length),
    );
});

test('Messages help clearly separates all connection modes and explains persistent hidden Linked context', () => {
    const help = getAppHelp('messages');
    assert.deepEqual(help.sections.map(section => section.heading), ['General', 'Unlinked', 'Observe', 'Linked']);
    const linked = help.sections.find(section => section.heading === 'Linked').bullets.join(' ');
    assert.match(linked, /continue roleplaying normally/i);
    assert.match(linked, /invisibly in the background/i);
    assert.match(linked, /each roleplay generation/i);
    assert.match(linked, /does not create a second model request/i);
    assert.match(linked, /Scrub messages/i);
    assert.doesNotMatch(linked, /;/);

    const target = { hidden: true, innerHTML: '' };
    renderAppHelpDialog(target, { appKey: 'messages', appLabel: 'Messages' });
    assert.match(target.innerHTML, /<h3>General<\/h3>/);
    assert.match(target.innerHTML, /<h3>Linked<\/h3>/);
});

test('notice dialog renders an in-phone modal rather than host toast markup', async () => {
    const { renderNoticeDialog } = await import('../lib/ui/appHelp.js');
    const target = { hidden: true, innerHTML: '' };
    renderNoticeDialog(target, { kicker: 'Kressa', title: 'Locked', body: 'Plus feature', bullets: ['Upgrade to unlock.'] });
    assert.equal(target.hidden, false);
    assert.match(target.innerHTML, /wp-app-help-card/);
    assert.match(target.innerHTML, /Kressa/);
    assert.match(target.innerHTML, /Upgrade to unlock/);
});

test('app help renders a What is this dialog and bullet list', () => {
    const target = { hidden: true, innerHTML: '' };
    renderAppHelpDialog(target, { appKey: 'contacts', appLabel: 'Contacts' });
    assert.equal(target.hidden, false);
    assert.match(target.innerHTML, /What is this\?/);
    assert.match(target.innerHTML, /<ul>/);
    assert.match(target.innerHTML, /Not reachable/);
});

test('the shared app header includes a question-mark help button with hover copy', () => {
    const markup = createPanelMarkup();
    assert.match(markup, /id="wp-help-button"/);
    assert.match(markup, /id="wp-group-compose-button"[^>]*title="New Group Chat"/);
    assert.match(markup, /title="What is this\?"/);
    assert.match(markup, /id="wp-app-help"/);
});
