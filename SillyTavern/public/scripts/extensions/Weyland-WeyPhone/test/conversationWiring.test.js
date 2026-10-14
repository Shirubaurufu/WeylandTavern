import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexUrl = new URL('../index.js', import.meta.url);

// The single-contact prompt is built from labelled sections (lib/generation.js buildTextingSystemPrompt): Kressa's observer
// instructions ride in DISCUSSION INSTRUCTIONS at the top, relationship context follows right after, and the no-thoughts
// rule is always the last section.
test('single-contact prompts put the relationship context after the discussion rules and the no-thoughts rule last', async () => {
    const source = await readFile(indexUrl, 'utf8');
    assert.match(source, /discussionInstructions: joinNonEmptySections\(\[[\s\S]*?kressaObserverInstructions,[\s\S]*?\]\),\s*relationshipContext,\s*textingInstructions: TEXTING_MODE_INSTRUCTIONS/);
    assert.match(source, /finalInstructions: TEXTING_THOUGHTS_DISABLED,\s*\}\);/);
    const { buildTextingSystemPrompt } = await import('../lib/generation.js');
    const prompt = buildTextingSystemPrompt({
        discussionInstructions: 'D', relationshipContext: 'R', textingInstructions: 'T', personaContext: 'P',
        descriptionText: 'C', finalInstructions: 'F',
    });
    const order = ['DISCUSSION INSTRUCTIONS', 'RELATIONSHIP CONTEXT', 'TEXTING RULES', 'USER PERSONA', 'CHARACTER DESCRIPTION', 'FINAL REPLY INSTRUCTIONS']
        .map(name => prompt.indexOf('[WEYPHONE SECTION: ' + name + ']'));
    assert.ok(order.every(position => position >= 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
});

// The old Kressa-only 15-message cap is gone: Observe now has one ceiling for everyone (35 messages / 10k tokens, see
// lib/requestBudget.js and tetheredContext.test.js), and the transcript is sliced by the conversation's own history cap.
test('Kressa observation keeps active lore and slices the shared roleplay transcript by the conversation cap', async () => {
    const source = await readFile(indexUrl, 'utf8');
    assert.match(source, /const worldInfo = await resolveWorldInfoTetheredForMainChat\(context\)/);
    assert.match(source, /historyCap: conversation\.tetheredHistoryCap,/);
    assert.doesNotMatch(source, /Math\.min\(15,/);
});

test('conversation header name and portrait navigate to the matching contact', async () => {
    const source = await readFile(indexUrl, 'utf8');
    assert.match(source, /setHeaderContactTarget\(panel, contactEntry\.name\)/);
    assert.match(source, /currentContactName = contactName;\s*showScreen\('contact-detail'\)/);
    assert.match(source, /getElementById\('wp-panel-avatar'\).*getElementById\('wp-panel-title'\)/s);
});
