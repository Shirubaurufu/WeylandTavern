import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContactContextBlock, buildGroupContactContextBlock, buildPersonaContextBlock, resolveContactContext } from '../lib/contactContext.js';

test('contact context resolves exact identities and unique first-name aliases', () => {
    const contexts = { Jenn: 'We are old friends.', Bastet: 'Mortal enemies.' };
    assert.equal(resolveContactContext(contexts, 'Jenn'), 'We are old friends.');
    assert.equal(resolveContactContext(contexts, 'Jenn Morrison'), 'We are old friends.');
    assert.equal(resolveContactContext(contexts, 'Unknown'), '');
});

test('relationship block frames user text as established background', () => {
    const block = buildContactContextBlock('Miu', 'Miu and I have been together for years.');
    assert.match(block, /HIGH-PRIORITY USER-PROVIDED RELATIONSHIP CONTEXT: Miu/);
    assert.match(block, /established relationship and history/);
    assert.match(block, /been together for years/);
    assert.match(block, /overrides generic\s+relationship assumptions/i);
    assert.equal(buildContactContextBlock('Miu', '   '), '');
});

test('group relationship context includes only participants with notes', () => {
    const block = buildGroupContactContextBlock(['Miu', 'Bastet', 'Summer'], {
        Miu: 'Dating for years.',
        Bastet: 'Mortal enemies.',
    });
    assert.match(block, /Dating for years/);
    assert.match(block, /Mortal enemies/);
    assert.doesNotMatch(block, /CONTEXT: Summer/);
});

test('persona context is available but explicitly relevance-gated', () => {
    const block = buildPersonaContextBlock('Lucky', 'Usually wears a red sweater. Grew up by the coast.');
    assert.match(block, /ACTIVE USER PERSONA: Lucky/);
    assert.match(block, /Use only the details that\s+are relevant/i);
    assert.match(block, /Most details will usually be unnecessary/i);
    assert.match(block, /red sweater/);
    assert.equal(buildPersonaContextBlock('Lucky', '   '), '');
});
