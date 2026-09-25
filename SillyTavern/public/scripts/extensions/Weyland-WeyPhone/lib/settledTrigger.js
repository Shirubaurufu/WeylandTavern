/**
 * Runs a callback only once a character reply has fully SETTLED, not the moment it arrives.
 *
 * Why this exists (Copycat auto mode, live-tested 2026-09-24): SillyTavern emits MESSAGE_RECEIVED
 * before it has finished storing the reply. In the streaming path it emits the event, THEN calls
 * syncMesToSwipe() and saves the chat; the non-streaming saveReply() likewise emits before its swipe
 * bookkeeping is done. Copycat fingerprinted the stored swipe at event time, the fingerprint changed
 * a moment later when SillyTavern finished, and every automatic rewrite was then thrown away as
 * "message moved mid-generation" even though nobody had touched the chat.
 *
 * GENERATION_ENDED fires after all of that (from hideStopButton, once generation is unblocked), in
 * both streaming and non-streaming mode, so a reply is noted on MESSAGE_RECEIVED and acted on at
 * GENERATION_ENDED. A reply that arrives without a generation behind it (a greeting, /sendas) never
 * gets GENERATION_ENDED, so a fallback timer runs it anyway once it has had time to settle.
 *
 * @param {object} options
 * @param {() => void} options.run what to do once the reply has settled
 * @param {number} [options.fallbackMs] how long to wait for GENERATION_ENDED before running anyway
 * @param {(fn: () => void, ms: number) => any} [options.setTimer]
 * @param {(handle: any) => void} [options.clearTimer]
 * @returns {{ onMessageReceived: () => void, onGenerationEnded: () => void, isPending: () => boolean }}
 */
export function createSettledTrigger({ run, fallbackMs = 4000, setTimer = setTimeout, clearTimer = clearTimeout }) {
    let fallback = null;

    const fire = () => {
        if (fallback === null) return;
        clearTimer(fallback);
        fallback = null;
        // Let every other GENERATION_ENDED listener (Router's finalize, the formatter) finish first.
        setTimer(run, 0);
    };

    return {
        // A reply arrived. Several can land in one generation (Router retries), so each one just
        // restarts the wait; the run happens once, for whichever reply is last when things settle.
        onMessageReceived() {
            if (fallback !== null) clearTimer(fallback);
            fallback = setTimer(fire, fallbackMs);
        },
        // Generation is fully over. Nothing pending means there is nothing new to act on (a failed
        // or stopped generation ends without a reply), so it does nothing.
        onGenerationEnded() {
            fire();
        },
        isPending() {
            return fallback !== null;
        },
    };
}
