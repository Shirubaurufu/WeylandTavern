// App-owned defaults. Main chat models and connection profiles are deliberately independent.
// 2026-11-14: Google restored Gemini 3.8 Flash the day after the update that removed it, so it is the
// first pick everywhere again and each app's previous first pick moved down to be its backup (Lucky).
export const WEYLAND_MODEL_DEFAULTS = Object.freeze({
    texting: Object.freeze({ primary: 'gemini-3.8-flash', backup: 'deepseek-v4.1-flash' }),
    sync: Object.freeze({ primary: 'gemini-3.8-flash', backup: 'gemma-4-31b-it' }),
    ltm: Object.freeze({ primary: 'gemini-3.8-flash', backup: 'glm-4.7-thinking' }),
    pawxai: Object.freeze({ primary: 'gemini-3.8-flash', backup: 'glm-4.7-thinking' }),
    copycat: Object.freeze({ primary: 'gemini-3.8-flash', backup: 'glm-5' }),
});

// The 2026-11-13 update also rewrote any saved "gemini-3.8-flash" to these defaults on load
// (migrateGeminiFlashModels). That conversion is gone: a saved 3.8 Flash is a valid choice again.
