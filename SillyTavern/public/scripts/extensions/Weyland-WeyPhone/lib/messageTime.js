import { formatClockTime } from './formatTime.js';

export function validMessageDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
    const date = new Date(`${value}T12:00:00`);
    return Number.isFinite(date.getTime()) && localDate(date) === value;
}

function localDate(date) {
    return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseMessageClock(value) {
    const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return null;
    if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
    return hour * 60 + minute;
}

export function getMessageTime(message, { suppressTimestampFallback = false } = {}) {
    const sceneClock = String(message?.displayTime ?? '').trim();
    if (sceneClock) {
        return { clock: sceneClock, minutes: parseMessageClock(sceneClock), date: validMessageDate(message.displayDate) ? message.displayDate : '', source: 'scene' };
    }
    if (suppressTimestampFallback || !Number.isFinite(message?.timestamp)) return { clock: '', minutes: null, date: '', source: '' };
    const date = new Date(message.timestamp);
    if (!Number.isFinite(date.getTime())) return { clock: '', minutes: null, date: '', source: '' };
    return { clock: formatClockTime(message.timestamp), minutes: date.getHours() * 60 + date.getMinutes(), date: localDate(date), source: 'real' };
}

export function canGroupMessageTimes(previous, next, options = {}) {
    if (!previous || !next || previous.role !== next.role || (previous.role !== 'user' && (previous.speaker ?? '') !== (next.speaker ?? ''))) return false;
    const a = getMessageTime(previous, options), b = getMessageTime(next, options);
    if (a.minutes === null || b.minutes === null || a.date !== b.date) return false;
    // Do not hide backwards times, midnight boundaries, or messages without a known clock.
    const gap = a.source === 'real' && b.source === 'real' ? (next.timestamp - previous.timestamp) / 60000 : b.minutes - a.minutes;
    return gap >= 0 && gap <= 5;
}

/** Change only the story clock. The real send timestamp and message order stay intact. */
export function setMessageTime(message, time, date = '') {
    if (!message || !/^\d{2}:\d{2}$/.test(time) || parseMessageClock(time) === null || (date && !validMessageDate(date))) return false;
    const minutes = parseMessageClock(time), hour = Math.floor(minutes / 60);
    message.displayTime = `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
    if (date) message.displayDate = date;
    else delete message.displayDate;
    return true;
}

export function withMessageDate(message, clock) {
    return clock && validMessageDate(message?.displayDate) ? `${message.displayDate} ${clock}` : clock;
}
