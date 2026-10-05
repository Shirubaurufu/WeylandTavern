import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_INBOUND_MESSAGE_CHARS, parseGroupReply, parseReply } from '../lib/messageParsing.js';

test('parseReply extracts a single Incoming line after an analysis block', () => {
    const raw = '<analysis>reasoning here</analysis>\nIncoming¦3:47 PM¦Rosa¦hey whats up';
    assert.deepEqual(parseReply(raw), { messages: ['hey whats up'], usedFallback: false });
});

test('parseReply extracts multiple Incoming lines in order, discarding Phone/Texting headers', () => {
    const raw = '<analysis>x</analysis>\nPhone¦Weynet - Tim¦76%\nTexting¦Rosa\nIncoming¦3:47 PM¦Rosa¦first\nIncoming¦3:48 PM¦Rosa¦second';
    assert.deepEqual(parseReply(raw), { messages: ['first', 'second'], usedFallback: false });
});

test('parseReply works with no analysis block present at all', () => {
    const raw = 'Incoming¦3:47 PM¦Rosa¦hey';
    assert.deepEqual(parseReply(raw), { messages: ['hey'], usedFallback: false });
});

test('parseReply strips a trailing footer line of bracketed tokens', () => {
    const raw = '<analysis>x</analysis>\nIncoming¦3:47 PM¦Rosa¦hey\n[Amusement] [RC]';
    assert.deepEqual(parseReply(raw), { messages: ['hey'], usedFallback: false });
});

test('parseReply discards narration and Outgoing lines, keeping only Incoming lines', () => {
    const raw = '<analysis>x</analysis>\n*she hesitates*\nIncoming¦3:47 PM¦Rosa¦hey\nOutgoing¦3:48 PM¦Tim¦hi back\nIncoming¦3:49 PM¦Rosa¦you there?';
    assert.deepEqual(parseReply(raw), { messages: ['hey', 'you there?'], usedFallback: false });
});

test('parseReply falls back to the cleaned remainder as one message when no Incoming lines are found', () => {
    const raw = '<analysis>x</analysis>\nRosa walks into the room and smiles at you.';
    assert.deepEqual(parseReply(raw), { messages: ['Rosa walks into the room and smiles at you.'], usedFallback: true });
});

test('parseReply returns no messages when the analysis block is never closed', () => {
    const raw = '<analysis>reasoning that got cut off mid-stream';
    assert.deepEqual(parseReply(raw), { messages: [], usedFallback: false });
});

test('parseReply returns no messages when nothing remains after stripping', () => {
    const raw = '<analysis>x</analysis>\n   \n';
    assert.deepEqual(parseReply(raw), { messages: [], usedFallback: false });
});

test('parseReply skips an Incoming line whose message field is empty', () => {
    const raw = '<analysis>x</analysis>\nIncoming¦3:47 PM¦Rosa¦\nIncoming¦3:48 PM¦Rosa¦real message';
    assert.deepEqual(parseReply(raw), { messages: ['real message'], usedFallback: false });
});

test('parseReply normalizes CRLF line endings before matching Incoming lines', () => {
    const raw = '<analysis>x</analysis>\r\nIncoming¦3:47 PM¦Rosa¦hey\r\nIncoming¦3:48 PM¦Rosa¦there';
    assert.deepEqual(parseReply(raw), { messages: ['hey', 'there'], usedFallback: false });
});

test('parseReply degrades gracefully (no throw) for null/undefined input, matching the "nothing usable survives" convention', () => {
    assert.deepEqual(parseReply(null), { messages: [], usedFallback: false });
    assert.deepEqual(parseReply(undefined), { messages: [], usedFallback: false });
});

test('parseReply permits three paragraphs in one bubble but rejects four', () => {
    assert.deepEqual(parseReply('one\n\ntwo\n\nthree'), { messages: ['one\n\ntwo\n\nthree'], usedFallback: true });
    assert.deepEqual(parseReply('one\n\ntwo\n\nthree\n\nfour'), { messages: [], usedFallback: true });
});

test('parseReply rejects giant one-paragraph prompt dumps', () => {
    assert.deepEqual(parseReply('x'.repeat(MAX_INBOUND_MESSAGE_CHARS + 1)), { messages: [], usedFallback: true });
});

test('parseReply evaluates separate Incoming bubbles independently', () => {
    const raw = Array.from({ length: 6 }, (_, i) => `IncomingÂ¦3:4${i} PMÂ¦RosaÂ¦normal bubble ${i}`).join('\n');
    assert.equal(parseReply(raw.replaceAll('\u00C2\u00A6', '\u00A6')).messages.length, 6);
});

test('parseReply rejects four literal escaped paragraphs in one Incoming bubble', () => {
    const raw = String.raw`IncomingÂ¦3:47 PMÂ¦RosaÂ¦one\n\ntwo\n\nthree\n\nfour`;
    assert.deepEqual(parseReply(raw.replaceAll('\u00C2\u00A6', '\u00A6')), { messages: [], usedFallback: true });
});

test('parseGroupReply applies the same oversized-bubble guard', () => {
    const raw = `IncomingÂ¦3:47 PMÂ¦RosaÂ¦one\n\ntwo\n\nthree\n\nfour`;
    const escapedRaw = raw.replaceAll('\n', '\\n');
    assert.deepEqual(parseGroupReply(escapedRaw.replaceAll('\u00C2\u00A6', '\u00A6')), { messages: [], usedFallback: true });
});
