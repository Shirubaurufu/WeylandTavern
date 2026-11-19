import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// index.js cannot be imported outside the app, so the real function is cut out of the source and run.
const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
const start = source.indexOf('function collectUnderstudyContext(');
assert.ok(start > 0, 'collectUnderstudyContext is in index.js');
// index.js is CRLF on disk, so find the closing brace at the start of a line without assuming the ending.
const end = start + source.slice(start).search(/\n\}/) + 2;
const collect = new Function(`${source.slice(start, end)}\nreturn collectUnderstudyContext;`)();

const msg = (name, mes, extra = {}) => ({ name, mes, is_user: name === 'Me', ...extra });
const context = chat => ({ chat, name1: 'Me', name2: 'Kressa' });

// The Discord report: a hidden reply must not reach the rewriter.
test('a hidden message never appears in the Copycat context', () => {
    const chat = [
        msg('Kressa', 'Intro.'),
        msg('Me', 'Make wind spells.'),
        msg('Kressa', 'Here are ice spells.', { is_system: true }),
        msg('Kressa', 'Wind spells: ...'),
    ];
    const got = collect(context(chat), 3, 10);
    assert.deepEqual(got.map(m => m.text), ['Intro.', 'Make wind spells.']);
});

test('hidden messages do not use up the count, so visible ones are still found', () => {
    const chat = [
        msg('Kressa', 'one'),
        msg('Me', 'two'),
        msg('Kressa', 'hidden a', { is_system: true }),
        msg('Me', 'hidden b', { is_system: true }),
        msg('Kressa', 'three'),
        msg('Kressa', 'target'),
    ];
    assert.deepEqual(collect(context(chat), 5, 2).map(m => m.text), ['two', 'three']);
    assert.deepEqual(collect(context(chat), 5, 3).map(m => m.text), ['one', 'two', 'three']);
});

test('order, names and the plain cases are unchanged', () => {
    const chat = [msg('Kressa', ' a '), msg('Me', 'b'), msg('Kressa', ''), msg('Kressa', 'target')];
    assert.deepEqual(collect(context(chat), 3, 5), [{ name: 'Kressa', text: 'a' }, { name: 'Me', text: 'b' }]);
    assert.deepEqual(collect(context(chat), 3, 0), []);
    assert.deepEqual(collect(context(chat), 0, 5), []);
    assert.deepEqual(collect({ name1: 'Me' }, 2, 5), []);
});
