// Low is the default; an explicit High keeps post-history placement.
export function resolveNarratorStrength(value) {
    return String(value ?? '').trim().toLowerCase() === 'high' ? 'High' : 'Low';
}

// The scenario is the final character-card field, before after-card lorebooks.
// This changes only the generated prompt, never the saved card or its scenario.
export function appendEarlyNarrator(scenario, narrator) {
    if (!String(narrator ?? '').trim()) return scenario;
    return [scenario, narrator].filter(Boolean).join('\n\n');
}
