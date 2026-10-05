import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexUrl = new URL('../index.js', import.meta.url);

test('single-contact prompts place relationship context immediately before the final no-thoughts rule', async () => {
    const source = await readFile(indexUrl, 'utf8');
    assert.match(source, /TEXTING_MODE_INSTRUCTIONS,\s*relationshipContext,\s*kressaObserverInstructions,\s*TEXTING_THOUGHTS_DISABLED/);
});

test('Kressa observation keeps active lore but caps the shared roleplay transcript at 15 messages', async () => {
    const source = await readFile(indexUrl, 'utf8');
    assert.match(source, /const worldInfo = await resolveWorldInfoTetheredForMainChat\(context\)/);
    assert.match(source, /historyCap: kressaObserver\s*\? Math\.min\(15,/);
});

test('conversation header name and portrait navigate to the matching contact', async () => {
    const source = await readFile(indexUrl, 'utf8');
    assert.match(source, /setHeaderContactTarget\(panel, contactEntry\.name\)/);
    assert.match(source, /currentContactName = contactName;\s*showScreen\('contact-detail'\)/);
    assert.match(source, /getElementById\('wp-panel-avatar'\).*getElementById\('wp-panel-title'\)/s);
});
