// The Connection dial (2026-11-18): Unset sends nothing; every other step puts one plain line in the mood block,
// with both names filled in. The app (app/parlor.js) and this file must agree on the ids.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFortuneMessages, connectionLine } from '../fortuneCore.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cards = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
const userText = connection => buildFortuneMessages({ charName: 'Belle', userName: 'Lucky', cards, connection })[1].content;

test('Unset (null) sends no Connection line', () => {
    assert.equal(userText(null).includes('Connection:'), false);
    assert.equal(userText(undefined).includes('Connection:'), false);
    assert.equal(userText('nonsense').includes('Connection:'), false);
});

test('each step sends its own line, right after Pacing, with the names filled in', () => {
    for (const id of ['platonic', 'interested', 'casual', 'complicated', 'dating', 'partnered', 'breaking', 'broken']) {
        const text = userText(id);
        const line = connectionLine(id, 'Belle', 'Lucky');
        assert.ok(line.startsWith(`Connection: ${id}:`), id);
        assert.ok(text.includes(line), id);
        assert.ok(text.indexOf('Pacing:') < text.indexOf('Connection:'), id);
        assert.equal(/\{char\}|\{you\}/.test(line), false, id);
        assert.ok(line.includes('Belle') && line.includes('Lucky'), id);
    }
});

test('the app sends exactly these ids', () => {
    const app = fs.readFileSync(path.join(here, '..', 'app', 'parlor.js'), 'utf8');
    assert.match(app, /CONN_IDS = \[null, 'platonic', 'interested', 'casual', 'complicated', 'dating', 'partnered', 'breaking', 'broken'\]/);
    assert.match(app, /connection: CONN_IDS\[state\.conn\]/);
});
