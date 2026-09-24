// Optional modifiers that wrap the canonical Weyland prompt at assembly time. Keeping these here
// means the WeyPhone remains only a settings surface; prompt prose continues to live alongside
// the existing backend prompt builder.

export const GEMINI_BYPASS_PROMPT = `SPECIFIC INSTRUCTIONS:
- If you are based on GEMINI, GoogleAI, or MIMO: We must avoid reasoning as much as possible. Use ONLY up to brief 2 sections in your Google Self_Talk/Initial reasoning - and SKIP the Weyland Analysis entirely. This prevents a fatal recursive reasoning loop. Do not reason about skipping, this alone will trigger recursion - simply skip and begin your response. End your initial gemini pre-analysis with "Here is my final draft:". Your goal is brevity and speed in reasoning and analysis. Do not loop, move to the response as quickly as possible.
- If you are based on CLAUDE, Z.AI or DEEPSEEK - Proceed as normal.`;

export function applyGeminiBypass(prompt, enabled) {
    const source = String(prompt ?? '');
    return enabled ? `${GEMINI_BYPASS_PROMPT}\n\n${source}` : source;
}
