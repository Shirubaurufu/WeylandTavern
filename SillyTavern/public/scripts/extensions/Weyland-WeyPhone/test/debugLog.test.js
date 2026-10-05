import test from 'node:test';
import assert from 'node:assert/strict';
import { pushLogLine, getLogLines, clearLogLines, MAX_LOG_LINES } from '../lib/debugLog.js';

test('push/get round-trip, ring-buffer cap, clear', () => {
    clearLogLines();
    pushLogLine('first', 100);
    pushLogLine('second', 200);
    const lines = getLogLines();
    assert.deepEqual(lines.map(l => l.message), ['first', 'second']);
    assert.equal(lines[0].timestamp, 100);

    for (let i = 0; i < MAX_LOG_LINES + 50; i++) pushLogLine(`line ${i}`);
    assert.equal(getLogLines().length, MAX_LOG_LINES);
    assert.equal(getLogLines().at(-1).message, `line ${MAX_LOG_LINES + 49}`);

    clearLogLines();
    assert.equal(getLogLines().length, 0);
});

test('getLogLines returns a copy, not the live buffer', () => {
    clearLogLines();
    pushLogLine('x');
    const copy = getLogLines();
    copy.push({ timestamp: 0, message: 'injected' });
    assert.equal(getLogLines().length, 1);
});
