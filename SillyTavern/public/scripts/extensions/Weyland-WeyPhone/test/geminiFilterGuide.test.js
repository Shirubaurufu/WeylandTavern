import test from 'node:test';
import assert from 'node:assert/strict';

import { GEMINI_FILTER_ERROR, renderGeminiFilterGuide } from '../lib/ui/apps/geminiFilterGuide.js';
import { renderNarrativeSettingsScreen } from '../lib/ui/apps/narrativeSettings.js';
import { decorateMessageText, GEMINI_BLOCK_TRIGGER, geminiBlockNoticeHtml, isGeminiBlockText } from '../lib/ui/geminiBlockNotice.js';

test('the Gemini card ends with the READ ME button, and the old eyebrow is gone', () => {
    const target = { innerHTML: '' };
    renderNarrativeSettingsScreen(target, { snapshot: { prompt: 'Beta Prompt', modes: {}, mental: {} }, tab: 'essentials' });
    const card = target.innerHTML.match(/<section class="wp-narrative-card wp-narrative-gemini-card[\s\S]*?<\/section>/)[0];
    assert.match(card, /<button type="button" class="wp-narrative-readme" data-narrative-guide="open">[\s\S]*READ ME - Gemini Filter Guide<\/button>\s*<\/section>$/);
    assert.doesNotMatch(card, /Optional model compatibility/);
});

test('the chat note fires on the real block text (link and all) and names the button it points to', () => {
    // How the provider's reply is actually rendered: the policy name is a link, so only its words remain.
    assert.ok(isGeminiBlockText(GEMINI_FILTER_ERROR));
    assert.ok(isGeminiBlockText('The prompt could not be submitted. The prompt contains sensitive words that violate Google’s\n Generative AI Prohibited Use policy. Try rephrasing'));
    assert.ok(!isGeminiBlockText('She mentions Google once and moves on.'));
    assert.ok(GEMINI_FILTER_ERROR.includes(GEMINI_BLOCK_TRIGGER));
    // The note must send players to a button that exists, under the exact label.
    const card = { innerHTML: '' };
    renderNarrativeSettingsScreen(card, { snapshot: { prompt: 'Beta Prompt', modes: {}, mental: {} }, tab: 'essentials' });
    assert.ok(geminiBlockNoticeHtml().includes('Tap "READ ME - Gemini Filter Guide"'));
    assert.ok(card.innerHTML.includes('READ ME - Gemini Filter Guide'));
    assert.doesNotMatch(geminiBlockNoticeHtml().replace(/<[^>]+>/g, ' '), /[–—]/);
});

test('decorateMessageText adds the note once, and only to block messages', () => {
    const fake = (text) => {
        let html = '';
        return {
            textContent: text,
            querySelector: () => (html ? {} : null),
            insertAdjacentHTML: (_, value) => { html += value; },
            get added() { return html; },
        };
    };
    const blocked = fake(GEMINI_FILTER_ERROR);
    assert.equal(decorateMessageText(blocked), true);
    assert.equal(decorateMessageText(blocked), false, 'never twice');
    assert.match(blocked.added, /SYSTEM NOTE/);
    assert.equal(decorateMessageText(fake('*She smiles.*')), false);
});

test('the README shows the exact Google error, every section, and a way back', () => {
    const target = { innerHTML: '' };
    renderGeminiFilterGuide(target);
    const html = target.innerHTML;
    assert.ok(html.includes(GEMINI_FILTER_ERROR), 'the error is shown verbatim so players can match it');
    assert.match(GEMINI_FILTER_ERROR, /^The prompt could not be submitted\. The prompt contains sensitive words/);
    for (const title of ['Got this message?', 'There\'s a filter in front of Gemini', 'It scores words and phrases.<br>It doesn\'t read.', 'It mostly checks the end of the chat', 'It\'s the mix, not just the words', 'Words that cause trouble', 'Rerolling won\'t help', 'Fixing a blocked message', 'The "smart" filter']) {
        assert.ok(html.includes(title), `missing section: ${title}`);
    }
    // "Got this message?" sits above the error it's asking about.
    assert.ok(html.indexOf('Got this message?') < html.indexOf(GEMINI_FILTER_ERROR));
    // Explicit examples stay behind a tap-to-reveal cover, each with its own working label.
    const covers = [...html.matchAll(/<input type="checkbox" id="([^"]+)" class="wp-gf-nsfw-input">/g)].map(match => match[1]);
    assert.ok(covers.length >= 2);
    for (const id of covers) assert.match(html, new RegExp(`<label for="${id}" class="wp-gf-nsfw-cover"`));
    assert.equal((html.match(/data-narrative-guide="close"/g) || []).length, 2, 'back at the top and the bottom');
    // The flip demos must stay CSS-only: each checkbox needs a matching label.
    for (const [, id] of html.matchAll(/<input type="checkbox" id="([^"]+)"/g)) {
        assert.match(html, new RegExp(`<label for="${id}"`));
    }
    // Nothing on this page should go through handleNarrativeAction.
    assert.doesNotMatch(html, /data-narrative-action/);
});

test('the README copy has no em or en dashes (readers tune out when they see them)', () => {
    const target = { innerHTML: '' };
    renderGeminiFilterGuide(target);
    const text = target.innerHTML.replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(text, /[–—]/);
});

test('Course correction has a "?" that opens its explainer as a multi-paragraph notice', async () => {
    const { NARRATIVE_HELP } = await import('../lib/ui/apps/narrativeSettings.js');
    const { renderNoticeDialog } = await import('../lib/ui/appHelp.js');
    const target = { innerHTML: '' };
    renderNarrativeSettingsScreen(target, { snapshot: { prompt: 'Beta Prompt', modes: {}, mental: {} }, tab: 'essentials' });
    assert.match(target.innerHTML, /Course correction<span class="wp-narrative-slash">\/<\/span><button type="button" class="wp-narrative-cc-help" data-narrative-help="course-correction"/);
    const dialog = { innerHTML: '', hidden: true };
    renderNoticeDialog(dialog, NARRATIVE_HELP['course-correction']);
    assert.equal(dialog.hidden, false);
    assert.equal((dialog.innerHTML.match(/<p>/g) || []).length, 6);
    assert.match(dialog.innerHTML, /<b><i>not counting rerolls<\/i><\/b>/);
    assert.doesNotMatch(dialog.innerHTML.replace(/<[^>]+>/g, ' '), /[\u2013\u2014]/);
    // The old single-body notices still render the same way.
    renderNoticeDialog(dialog, { title: 'x', body: 'one', bullets: ['a'] });
    assert.match(dialog.innerHTML, /<p>one<\/p>\s*<ul><li>a<\/li><\/ul>/);
});
