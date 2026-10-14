// Narrator choices and OOC mode are account settings, but every tab keeps a separate snapshot.
// Send the last observed values with saves so an unrelated save cannot undo another tab's pick.
import { narratorSelection } from './extensions/quick-reply-ext/src/narratorSelection.js';

export const NARRATOR_SETTING_KEYS = Object.freeze(['Narrator', 'NarratorStrength', 'OOCMode']);

function sameSelection(key, left, right) {
    if (key !== 'Narrator') return left === right;
    const a = narratorSelection(left), b = narratorSelection(right);
    // Refreshing the built-in prose does not count as picking a different narrator.
    return a !== 'Custom' && b !== 'Custom' ? a === b : left === right;
}

export function narratorSettingsValues(globals = {}) {
    return Object.fromEntries(NARRATOR_SETTING_KEYS.map(key => [key, globals[key] ?? null]));
}

/** Merge only unchanged narrator fields; an explicit change in the sending tab still wins. */
export function mergeNarratorSettings(payload, stored) {
    const baseline = payload.weylandNarratorBaseline;
    delete payload.weylandNarratorBaseline;
    const globals = payload.extension_settings?.variables?.global;
    const current = narratorSettingsValues(stored.extension_settings?.variables?.global);
    if (baseline && globals) {
        for (const key of NARRATOR_SETTING_KEYS) {
            if (!Object.hasOwn(baseline, key) || !sameSelection(key, globals[key] ?? null, baseline[key])) continue;
            if (current[key] === null) delete globals[key];
            else globals[key] = current[key];
        }
    }
    const incoming = narratorSettingsValues(globals);
    const changed = NARRATOR_SETTING_KEYS.some(key => incoming[key] !== current[key]);
    // The server assigns this, never the sending tab. Delayed responses must not restore an
    // older choice after a newer refresh has already reached the client.
    payload.weylandNarratorRevision = (Number(stored.weylandNarratorRevision) || 0) + Number(changed);
}

/** Dependencies are supplied by script.js so this module also runs in regression tests. */
export function createNarratorSettingsSync({ getGlobals, fetchValues }) {
    let baseline = null;
    let refreshing = null;
    let revision = 0;
    const edits = Object.fromEntries(NARRATOR_SETTING_KEYS.map(key => [key, 0]));
    const savedEdits = { ...edits };

    function apply(values, observed, observedEdits) {
        if (!values || !baseline) return false;
        const globals = getGlobals();
        let changed = false;
        for (const key of NARRATOR_SETTING_KEYS) {
            if (!Object.hasOwn(values, key) || edits[key] !== observedEdits[key] || (globals[key] ?? null) !== observed[key]) continue;
            changed ||= (globals[key] ?? null) !== values[key];
            if (values[key] === null) delete globals[key];
            else globals[key] = values[key];
            baseline[key] = values[key];
            savedEdits[key] = observedEdits[key];
        }
        return changed;
    }

    return {
        initialize(globals, savedRevision = 0) {
            baseline = narratorSettingsValues(globals);
            revision = savedRevision;
            for (const key of NARRATOR_SETTING_KEYS) savedEdits[key] = ++edits[key];
        },
        // Selecting Default again is an explicit choice even if this tab already shows Default
        // and another tab has since selected Salem. The old baseline must not hide that click.
        markChanged(key) { if (NARRATOR_SETTING_KEYS.includes(key)) edits[key]++; },
        prepareSave() {
            const unchanged = baseline && Object.fromEntries(NARRATOR_SETTING_KEYS
                .filter(key => edits[key] === savedEdits[key]).map(key => [key, baseline[key]]));
            return { baseline: unchanged, values: narratorSettingsValues(getGlobals()), edits: { ...edits } };
        },
        acceptSave(saved, values, savedRevision = revision) {
            if (savedRevision < revision) {
                // The write succeeded, but its response is older than a read we've applied.
                for (const key of NARRATOR_SETTING_KEYS) {
                    if (edits[key] === saved.edits[key]) savedEdits[key] = saved.edits[key];
                }
                return false;
            }
            revision = savedRevision;
            return apply(values, saved.values, saved.edits);
        },
        refresh() {
            if (refreshing) return refreshing;
            if (!baseline) return Promise.resolve(false);
            // A pick waiting for its debounced save belongs to this tab. Never replace it with
            // an older server value, including when the user taps while this read is in flight.
            const observed = narratorSettingsValues(getGlobals());
            const observedEdits = { ...edits };
            const clean = Object.fromEntries(NARRATOR_SETTING_KEYS.map(key => [key, sameSelection(key, observed[key], baseline[key]) && edits[key] === savedEdits[key]]));
            refreshing = Promise.resolve().then(fetchValues).then(values => {
                if (!values) return false;
                const receivedRevision = values.revision ?? revision;
                if (receivedRevision < revision) return false;
                revision = receivedRevision;
                const eligible = Object.fromEntries(NARRATOR_SETTING_KEYS.filter(key => clean[key] && Object.hasOwn(values, key)).map(key => [key, values[key]]));
                return apply(eligible, observed, observedEdits);
            }).finally(() => { refreshing = null; });
            return refreshing;
        },
    };
}
