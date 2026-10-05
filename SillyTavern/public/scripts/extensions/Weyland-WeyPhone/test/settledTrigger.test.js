import test from 'node:test';
import assert from 'node:assert/strict';

import { createSettledTrigger } from '../lib/settledTrigger.js';

// Manual clock: timers only fire when the test advances time, so ordering is exact.
function fakeClock() {
    let now = 0;
    let nextId = 1;
    const timers = new Map();
    return {
        setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: now + ms }); return id; },
        clearTimer: (id) => { timers.delete(id); },
        advance(ms) {
            const until = now + ms;
            for (;;) {
                const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                timers.delete(due[0]);
                now = due[1].at;
                due[1].fn();
            }
            now = until;
        },
    };
}

function setup(fallbackMs = 4000) {
    const clock = fakeClock();
    let runs = 0;
    const trigger = createSettledTrigger({ run: () => { runs++; }, fallbackMs, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    return { clock, trigger, runs: () => runs };
}

// The bug: SillyTavern emits MESSAGE_RECEIVED, then finishes storing the swipe, then GENERATION_ENDED.
test('a reply is not acted on at MESSAGE_RECEIVED, only once GENERATION_ENDED says it is finished', () => {
    const { clock, trigger, runs } = setup();
    trigger.onMessageReceived();
    clock.advance(0);
    assert.equal(runs(), 0, 'must not start while SillyTavern is still storing the reply');
    trigger.onGenerationEnded();
    assert.equal(runs(), 0, 'yields one tick so other GENERATION_ENDED listeners finish first');
    clock.advance(0);
    assert.equal(runs(), 1);
});

test('runs exactly once per reply: the fallback timer is cancelled when generation ends', () => {
    const { clock, trigger, runs } = setup();
    trigger.onMessageReceived();
    trigger.onGenerationEnded();
    clock.advance(10_000);
    assert.equal(runs(), 1);
    assert.equal(trigger.isPending(), false);
});

test('a generation that ends with no reply (failed, stopped, 520) does nothing', () => {
    const { clock, trigger, runs } = setup();
    trigger.onGenerationEnded();
    clock.advance(10_000);
    assert.equal(runs(), 0);
});

test('a reply with no generation behind it (a greeting) still runs, after the fallback wait', () => {
    const { clock, trigger, runs } = setup(4000);
    trigger.onMessageReceived();
    clock.advance(3999);
    assert.equal(runs(), 0);
    clock.advance(1);
    clock.advance(0);
    assert.equal(runs(), 1);
});

test('several replies in one generation (Router retries) collapse into a single run', () => {
    const { clock, trigger, runs } = setup();
    trigger.onMessageReceived();
    clock.advance(1000);
    trigger.onMessageReceived();
    trigger.onGenerationEnded();
    clock.advance(10_000);
    assert.equal(runs(), 1);
});

test('each new reply gets its own run', () => {
    const { clock, trigger, runs } = setup();
    for (let i = 0; i < 3; i++) {
        trigger.onMessageReceived();
        trigger.onGenerationEnded();
        clock.advance(0);
    }
    assert.equal(runs(), 3);
});
