import test from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_HELP_CARDS, getErrorHelpCard, searchErrorHelp } from '../lib/errorHelpCatalog.js';
import { renderErrorHelpScreen, updateErrorHelpSearch } from '../lib/ui/apps/errorHelp.js';
import { renderNarrativeSettingsScreen } from '../lib/ui/apps/narrativeSettings.js';
import { renderGeminiFilterGuide } from '../lib/ui/apps/geminiFilterGuide.js';
import { ERROR_HELP_EVENT, INTERRUPTED_TITLE, INTERRUPTED_BODY, showMessageInterrupted } from '../../../weyland-error-notice.js';
import { formatterHarness } from './helpers/formatterHarness.js';

test('search recognises reported errors, full pasted messages and informal spellings', () => {
    for (const [query, id] of [
        ['request to https://helixmind.online/v1/chat/completions failed, reason: socket hang up', 'socket'],
        ['ECONN RESET', 'socket'],
        ['write EPROTO F41D0000:error:0A00010B:SSL routines:ssl3_get_record:wrong version number:c:\\ws\\deps\\openssl\\ssl\\record\\ssl3_record.c:355:', 'tls'],
        ['SSL', 'tls'], ['getaddrinfo EAI_AGAIN helixmind.online', 'dns'],
        ['Error: 429 Too Many Requests', 'rate'], ['LTM generation failed: Got response status 429', 'ltm'], ['LTM model failed - retrying on minimax-m3', 'ltm'], ['blank reply', 'interrupted'],
        ['green circle', 'models'], ['Security Shield', 'spectrum'], ['Flare', 'vpn'],
        ['1.1.1.1', 'dns-routing'], ['certificate has expired', 'certificate'],
    ]) assert.ok(searchErrorHelp(query).some(card => card.id === id), query);
    assert.equal(searchErrorHelp('').length, ERROR_HELP_CARDS.length);
    assert.deepEqual(searchErrorHelp('no-such-error-xyz'), []);
    assert.deepEqual(searchErrorHelp('???'), []);
    assert.equal(new Set(searchErrorHelp('socket hang up')).size, searchErrorHelp('socket hang up').length);
});

test('every card renders and links to existing guides and supported actions', () => {
    const ids = new Set(ERROR_HELP_CARDS.map(card => card.id));
    assert.equal(ids.size, ERROR_HELP_CARDS.length);
    for (const card of ERROR_HELP_CARDS) {
        for (const id of card.related ?? []) assert.ok(ids.has(id), `${card.id} links to ${id}`);
        for (const action of card.actions ?? []) assert.ok(['home', 'gemini', 'dns', 'registrar'].includes(action));
        for (const [, url] of card.sources ?? []) assert.equal(new URL(url).protocol, 'https:');
        const target = { innerHTML: '' };
        renderErrorHelpScreen(target, { articleId: card.id });
        assert.equal((target.innerHTML.match(/data-error-help-action="list"/g) ?? []).length, 2);
        assert.ok(card.steps.length > 0);
        assert.doesNotMatch(target.innerHTML, /undefined|\[object Object\]/);
        const prose = target.innerHTML.replace(/<[^>]+>/g, ' ');
        assert.doesNotMatch(prose, /[\u2013\u2014]|\btoast\b|Beta Prompt|port forward/i);
        // Lucky's voice rules: contractions over "cannot", US spelling, and no support hand-off
        // (a support line lets readers skip the steps; real bugs say "let us know" instead).
        assert.doesNotMatch(prose, /\bcannot\b|recognis|organis|\bsupport\b|What to include|Also listed under/i, card.id);
    }
});

test('real app messages find their own advice instead of sharing misleading fragments', () => {
    for (const [query, id] of [
        ['Chat deletion timed out. Please try again.', 'chat-delete'],
        ['Model select control not found: openai[custom]', 'model-control'],
        ['No model options found. Check your API settings.', 'models'],
        ['No model found with name "Example model"', 'model'],
        ['WeyPhone: The model did not return usable content this time.', 'app-sync'],
        ['WeyPhone: Sync partially succeeded — no usable content for: Chitter. Their previous content is untouched.', 'app-sync'],
        ['WeyPhone: The model returned an empty memory.', 'phone-memory'],
        ['No Connection Profile available (none selected in WeyPhone settings and none active in SillyTavern)', 'connection-profile'],
        ['WeyPhone could not save. Keep this tab open and check the server connection.', 'save'],
        ['Failed to save preset', 'save-data'],
        ['Chat could not be saved: Check the server connection and reload the page to prevent data loss.', 'save-data'],
        ['Group Chat could not be saved: Check the server connection and reload the page to prevent data loss.', 'save-data'],
        ['Settings could not be saved: Check the server connection and reload the page to prevent data loss.', 'save-data'],
        ['Settings could not be loaded after multiple attempts. Please try again later.', 'load-data'],
        ['Could not load chat data. Try reloading the page.', 'load-data'],
        ["Error: Couldn't get CSRF token. Please refresh the page.", 'session'],
        ["Please copy the entire key, including the 'helix-' part.", 'key'],
        ['429: insufficient_quota', 'credits'],
    ]) assert.deepEqual(searchErrorHelp(query).map(card => card.id), [id], query);
    // A validation error is not a storage outage, and numbers in URLs aren't status codes.
    assert.deepEqual(searchErrorHelp('Could not save regex script: The script name was undefined or empty!'), []);
    assert.deepEqual(searchErrorHelp('Coqui: Get local model list request failed: Not Found'), []);
    assert.deepEqual(searchErrorHelp('The provided key has invalid permissions. Please use an admin key for downloading.'), []);
    assert.deepEqual(searchErrorHelp('request to https://example.com:500/api/404 failed, reason: socket hang up').map(card => card.id), ['socket']);
});

test('notice styling, route diagram and no support hand-off', () => {
    const target = { innerHTML: '' };
    renderErrorHelpScreen(target, { articleId: 'save-data' });
    assert.doesNotMatch(target.innerHTML, /wp-eh-support-list|Hide your API key/);
    renderErrorHelpScreen(target, { articleId: 'socket' });
    assert.match(target.innerHTML, /Where it usually goes wrong/);
    assert.match(target.innerHTML, /wp-gf-stack-row l3[\s\S]*Your internet[\s\S]*usually here/);
    assert.doesNotMatch(target.innerHTML, /Wait for the current attempt/);
    renderErrorHelpScreen(target, { articleId: 'key' });
    assert.doesNotMatch(target.innerHTML, /Where it usually goes wrong/, 'cards without a route draw none');
    renderErrorHelpScreen(target, {});
    assert.doesNotMatch(target.innerHTML, /Only searched on this device/);
    assert.match(target.innerHTML, /Not every error or warning has a definition in this database/);
    renderErrorHelpScreen(target, { articleId: 'world-info-budget' });
    assert.match(target.innerHTML, /wp-eh-notice/);
    assert.doesNotMatch(target.innerHTML, /triangle-exclamation/);
    // Distillation: honest that it may not work, and the order Lucky set (2026-10-09).
    const distillation = getErrorHelpCard('distillation').steps.map(step => step.title);
    assert.deepEqual(distillation.map(title => title.split(' ')[0]), ['Reroll', 'Turn', 'Swap', 'Switch']);
    assert.match(distillation[1], /Analysis off/);
    renderErrorHelpScreen(target, { articleId: 'distillation' });
    assert.match(target.innerHTML, /won&#39;t always work/);
    assert.doesNotMatch(target.innerHTML, /Beta Prompt/);
});

test('context help names the defaults, the suspects and shows where to look', () => {
    const card = getErrorHelpCard('context');
    const text = JSON.stringify(card);
    assert.match(text, /60,000/);
    assert.match(text, /5,000/);
    assert.match(text, /World Info over 16,000/);
    assert.match(text, /User Persona over 1,000/);
    const target = { innerHTML: '' };
    renderErrorHelpScreen(target, { articleId: 'context' });
    assert.match(target.innerHTML, /assets\/help\/prompt-itemization-button\.png/);
    assert.match(target.innerHTML, /class="wp-eh-itemize"/);
    assert.equal((target.innerHTML.match(/is-watch/g) ?? []).length, 2);
    // Every visual a card names must exist, or it would silently render nothing.
    for (const c of ERROR_HELP_CARDS) {
        const named = JSON.stringify(c).match(/"visual":"[^"]+"/g) ?? [];
        renderErrorHelpScreen(target, { articleId: c.id });
        assert.equal((target.innerHTML.match(/<figure class="wp-eh-figure">/g) ?? []).length, named.length, c.id);
    }
});

test('help is last on Home, and a search cannot become markup', () => {
    const target = { innerHTML: '' };
    renderNarrativeSettingsScreen(target, { snapshot: { modes: {}, mental: {} }, tab: 'essentials' });
    assert.ok(target.innerHTML.indexOf('wp-error-help-entry') > target.innerHTML.indexOf('wp-narrative-gemini-card'));
    assert.match(target.innerHTML, /data-error-help-action="open"/);
    const query = '\"><img src=x onerror=alert(1)>';
    renderErrorHelpScreen(target, { query });
    assert.doesNotMatch(target.innerHTML, /<img/);
    assert.match(target.innerHTML, /&quot;&gt;&lt;img/);
    assert.match(target.innerHTML, /Nothing matches that yet/);
    renderErrorHelpScreen(target, { articleId: 'missing' });
    assert.match(target.innerHTML, /id="wp-error-search"/);
});

test('typing updates results without replacing the search field', () => {
    const results = { innerHTML: '' };
    const target = { innerHTML: 'unchanged search input', querySelector: selector => selector === '.wp-eh-results' ? results : null };
    updateErrorHelpSearch(target, 'ECONNRESET');
    assert.equal(target.innerHTML, 'unchanged search input');
    assert.match(results.innerHTML, /data-error-help-card="socket"/);
    assert.doesNotMatch(results.innerHTML, /data-error-help-card="key"/);
});

test('blank-message advice follows the requested troubleshooting order', () => {
    const card = getErrorHelpCard('interrupted');
    const titles = card.steps.map(step => step.title);
    // Lucky, 2026-10-17: check what the player is on before asking them to change anything.
    assert.match(titles[0], /mobile data/i);
    assert.match(titles[1], /reroll/i);
    assert.match(titles[2], /Gemini Bypass/);
    assert.match(titles[3], /Analysis off/);
    // No "try a tame chat" step: it burns a message and tells the player nothing new (Lucky).
    assert.match(titles[4], /different model/);
    assert.doesNotMatch(JSON.stringify(card.steps), /without explicit|tame chat|non-explicit/i);
    assert.match(titles[5], /connection/);
});

test('World Info budget wording finds a normal notice, separately from account limits', () => {
    for (const count of [0, 3, 10, 27, 100]) {
        assert.deepEqual(searchErrorHelp(`World info budget reached after ${count} entries.`).map(card => card.id), ['world-info-budget']);
    }
    for (const query of ['Maximum lorebooks reached', 'lorebook budget', 'Registrar', '!Command']) {
        assert.ok(searchErrorHelp(query).some(card => card.id === 'world-info-budget'));
    }
    assert.ok(!searchErrorHelp('Insufficient credits').some(card => card.id === 'world-info-budget'));
    const card = getErrorHelpCard('world-info-budget');
    assert.match(card.steps[0].title, /Registrar.*custom character/);
    const target = { innerHTML: '' };
    renderErrorHelpScreen(target, { articleId: card.id });
    assert.match(target.innerHTML, /Notice<\/b>/);
    assert.doesNotMatch(target.innerHTML, /Error<\/b>|data-error-help-action="dns"/);
});

test('article explanations and longer steps render as separate escaped paragraphs', () => {
    const target = { innerHTML: '' };
    renderErrorHelpScreen(target, { articleId: 'interrupted' });
    const explanation = target.innerHTML.match(/<div class="wp-eh-explanation">([\s\S]*?)<\/div>/)[1];
    assert.equal((explanation.match(/<p>/g) ?? []).length, 4); // 4th: the mobile-data heads-up (2026-10-17)
    assert.match(explanation, /can&#39;t tell which/);
    assert.match(target.innerHTML, /class="wp-eh-step-copy"><p>[^<]+<\/p><p>/);
    assert.doesNotMatch(target.innerHTML, /<small><p>|\[object Object\]/);
    // Keep paragraph contents as text even if future copy includes literal markup.
    const card = getErrorHelpCard('interrupted');
    const original = card.explanation;
    try {
        card.explanation = ['<img src=x onerror=alert(1)>', 'Next paragraph'];
        renderErrorHelpScreen(target, { articleId: card.id });
        assert.match(target.innerHTML, /<p>&lt;img/);
        assert.doesNotMatch(target.innerHTML, /<img/);
    } finally {
        card.explanation = original;
    }
});

test('Gemini guide names the correct return destination when opened from error help', () => {
    const target = { innerHTML: '' };
    renderGeminiFilterGuide(target, { fromErrorHelp: true });
    assert.equal((target.innerHTML.match(/Back to error information/g) ?? []).length, 2);
    renderGeminiFilterGuide(target);
    assert.match(target.innerHTML, /Back to PromptOS/);
    assert.doesNotMatch(target.innerHTML, /Back to error information/);
});

test('the interruption notification has the requested copy and opens help with pointer or keyboard', () => {
    const saved = { toastr: globalThis.toastr, document: globalThis.document, CustomEvent: globalThis.CustomEvent };
    let shown, attrs, keyHandler;
    const events = [];
    try {
        globalThis.document = { dispatchEvent: event => events.push(event) };
        globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
        globalThis.toastr = { warning: (body, title, options) => {
            shown = { body, title, options };
            return { attr: value => { attrs = value; }, on: (name, handler) => { assert.equal(name, 'keydown'); keyHandler = handler; } };
        } };
        showMessageInterrupted();
        assert.equal(shown.title, INTERRUPTED_TITLE);
        assert.equal(shown.title, 'Message Interrupted');
        assert.equal(INTERRUPTED_BODY, 'The AI was mid-analysis when it was interrupted, either by a content filter, API issue or your ISP.');
        assert.equal(shown.body, `${INTERRUPTED_BODY}<br><br>Tap this message for more information.`);
        assert.equal(attrs.tabindex, '0');
        shown.options.onclick();
        const notice = {};
        for (const key of ['Enter', ' ']) keyHandler({ key, target: notice, currentTarget: notice, preventDefault() {} });
        keyHandler({ key: 'Enter', target: {}, currentTarget: notice });
        assert.equal(events.length, 3, 'close button does not activate the help action');
        for (const event of events) {
            assert.equal(event.type, ERROR_HELP_EVENT);
            assert.deepEqual(event.detail, { articleId: 'interrupted' });
        }
    } finally {
        for (const [name, value] of Object.entries(saved)) {
            if (value === undefined) delete globalThis[name];
            else globalThis[name] = value;
        }
    }
});

test('only new replies stripped to empty trigger the interruption notification', async () => {
    for (const raw of ['[SCENE SHEET]\nPrivate notes cut off', '<analysis>Private notes cut off']) {
        const formatter = formatterHarness();
        formatter.chat[1].mes = raw;
        await formatter.context.formatNewMessage(1, 'normal');
        assert.equal(formatter.chat[1].mes, '');
        assert.deepEqual(formatter.interruptionNotices, ['interrupted']);
    }
    for (const [name, raw, type] of [
        ['Muse', '[SCENE SHEET]\nnotes\n[END OF SCENE SHEET]\nHello.', 'normal'],
        ['Kressa', '*Kressa waves.* Hello.', 'normal'],
        ['Muse', 'Incoming¦3:47 PM¦Rosa¦hey whats up', 'normal'],
        ['Muse', '', 'normal'],
        ['Weybot', '[SCENE SHEET]\nnotes', 'first_message'],
    ]) {
        const formatter = formatterHarness();
        Object.assign(formatter.chat[1], { name, mes: raw });
        await formatter.context.formatNewMessage(1, type);
        assert.equal(formatter.interruptionNotices.length, 0, `${name}: ${raw}`);
    }
    const formatter = formatterHarness();
    await formatter.format('[SCENE SHEET]\nHistorical notes');
    assert.equal(formatter.interruptionNotices.length, 0, 'history/edit formatting remains silent');
});
