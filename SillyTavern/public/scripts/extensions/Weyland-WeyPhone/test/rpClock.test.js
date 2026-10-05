import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRpHeader, findMostRecentRpTime } from '../lib/rpClock.js';

const SAMPLE = '¦¦ Saturday, Oct 18th ~ 9:28 AM ~ Dormitory ~ (ONYX) ¦¦';

test('parses the canonical sample header', () => {
    const parsed = parseRpHeader(SAMPLE);
    assert.deepEqual(parsed, { weekday: 'Saturday', date: 'Oct 18th', time: '9:28 AM', location: 'Dormitory' });
});

test('tolerates spacing/case/punctuation drift', () => {
    assert.equal(parseRpHeader('¦¦Sunday Oct. 19 ~ 11:05pm~Sterling Hall¦¦').time, '11:05 PM');
    assert.equal(parseRpHeader('¦¦ Monday, Nov 2nd ~ 12:00 P.M. ~ Cafeteria ~ ¦¦').time, '12:00 PM');
    assert.equal(parseRpHeader('¦¦ Friday, Dec 5th ~ 8:15 am ¦¦').location, null); // no location
});

test('accepts Weyland academic markers between the date and time', () => {
    const parsed = parseRpHeader('¦¦ Wednesday, March 9th (Sophomore) ~ 7:42 PM ~ Senaka Boulevard ¦¦');
    assert.deepEqual(parsed, {
        weekday: 'Wednesday',
        date: 'March 9th',
        time: '7:42 PM',
        location: 'Senaka Boulevard',
    });
    assert.equal(parseRpHeader('¦¦ Friday, May 12th (Junior) (Spring Term) ~ 8:03AM ~ Quad ¦¦').time, '8:03 AM');
});

test('fails closed on anything that is not a real header', () => {
    for (const junk of ['no header here', '¦¦ broken ~ header ¦¦', '¦¦ 9:28 AM ¦¦', '', null, undefined, 42]) {
        assert.equal(parseRpHeader(junk), null, `junk: ${String(junk)}`);
    }
});

test('takes the LAST header within a single message', () => {
    const multi = `${SAMPLE}\nsome narration\n¦¦ Saturday, Oct 18th ~ 11:45 PM ~ Rooftop ~ (ONYX) ¦¦`;
    assert.equal(parseRpHeader(multi).time, '11:45 PM');
    assert.equal(parseRpHeader(multi).location, 'Rooftop');
});

test('findMostRecentRpTime scans the chat from the end', () => {
    const chat = [
        { mes: '¦¦ Friday, Oct 17th ~ 2:00 PM ~ Quad ~ ¦¦ stuff' },
        { mes: 'no header in this one' },
        { mes: SAMPLE },
        { mes: 'latest message, still no header' },
    ];
    assert.equal(findMostRecentRpTime(chat).time, '9:28 AM');
    assert.equal(findMostRecentRpTime([]), null);
    assert.equal(findMostRecentRpTime(null), null);
});
