// Budget correction for the bundled legacy tokenizer, not an exact provider tokenizer.
// Sonnet 5 sample: 35,927 estimated vs 42,800 backend input tokens.
// Applied to all Claude versions by policy, including 4.6.
export const CLAUDE_TOKEN_MULTIPLIER = 1.20;
export const TOKEN_COUNT_CACHE_VERSION = 'claude-budget-120-v1';
export function calibrateClaudeTokenCount(count) {
    return Math.ceil(count * CLAUDE_TOKEN_MULTIPLIER);
}
