import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHelixKey, describeKeyProblem, NARA_SHOP_INVITE } from '../public/scripts/weyland-key-format.js';

test('a HelixMind key is accepted as pasted, and the usual copy-paste debris is removed', () => {
    assert.deepEqual(normalizeHelixKey('helix-abc123'), { ok: true, key: 'helix-abc123' });
    assert.deepEqual(normalizeHelixKey('  helix-abc123 \n'), { ok: true, key: 'helix-abc123' });
    assert.deepEqual(normalizeHelixKey('"helix-abc123"'), { ok: true, key: 'helix-abc123' });
    assert.deepEqual(normalizeHelixKey('Bearer helix-abc123'), { ok: true, key: 'helix-abc123' });
});

test('anything that is not a HelixMind key is refused before it can be saved', () => {
    assert.deepEqual(normalizeHelixKey(''), { ok: false, reason: 'empty' });
    assert.deepEqual(normalizeHelixKey('   '), { ok: false, reason: 'empty' });
    assert.deepEqual(normalizeHelixKey(null), { ok: false, reason: 'empty' });
    // a Paw Patrol password pasted into the API key box is the usual mistake
    assert.deepEqual(normalizeHelixKey('K9$monthlyPassword'), { ok: false, reason: 'format' });
    assert.deepEqual(normalizeHelixKey('sk-ant-123'), { ok: false, reason: 'format' });
    // two pasted values, or a key with a space in it, are not one key
    assert.deepEqual(normalizeHelixKey('helix-abc helix-def'), { ok: false, reason: 'format' });
});

test('the problem text tells a player with no key where to get one, and reassures one who has a key', () => {
    assert.match(describeKeyProblem('format'), new RegExp(NARA_SHOP_INVITE.replace(/[.]/g, '[.]')));
    assert.match(describeKeyProblem('invalid'), /Nara's Message Shop/);
    assert.doesNotMatch(describeKeyProblem('format'), /current key was kept/);
    for (const status of ['format', 'invalid', 'unreachable', 'failed']) {
        assert.match(describeKeyProblem(status, { hadKey: true }), /Your current key was kept\./);
    }
});
