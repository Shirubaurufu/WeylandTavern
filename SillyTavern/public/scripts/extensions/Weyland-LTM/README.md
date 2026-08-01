# Weyland-LTM ("LTM Engine")

Full-JS replacement for the STscript LTM pipeline (Sleep / LTMPrompt / LTMDisabler / MemorySaver). v1.5.5.

**v1.5.5 hotfix — Auto-LTM cascade on chat-open.** `updateChip()`'s `trigger` param now defaults to **false**; only the `MESSAGE_RECEIVED` listener opts in with `{trigger: true}`. Previously the default was true, and `updateChip()` is called from ~15 sites (job lifecycle transitions inside `generateDraft`, `CHAT_CHANGED`, settings changes, panel open/close...) — ANY of those firing `maybeAutoTrigger()` meant opening a long-overdue chat (or enabling Auto-LTM on one) triggered a segment immediately with zero messages sent, and — worse — each auto-job's own completion re-triggered `updateChip()` too, which fired the NEXT segment, cascading through the entire backlog in one uninterrupted burst. Now catch-up is gradual: at most one new segment per genuine incoming message. Also hardened `getOrCreateChatBookName()` with a per-chat in-flight lock (`chatBookCreationInFlight`) — the burst made a pre-existing check-then-create race (two near-simultaneous saves, e.g. an auto-save landing next to a manual Save, both seeing "no book yet") far more likely to actually manifest as a duplicated lorebook.

**v1.5.2 hotfix:** `buildMergePrompt()` and `buildRewritePrompt()` referenced `${user}` in their system message template without ever declaring `const user = getUserName();` (unlike `buildLTMPrompt`, which does). This threw a `ReferenceError` synchronously the instant Merge (or Reroll on a no-source/legacy entry) was clicked — inside an unawaited async handler, so it failed completely silently: button visibly enabled, click registered, nothing happened, no toast, no visible error. Fixed by adding the missing declaration to both. `onMergeClicked` is now also wrapped in try/catch with a toast, so a future throw in this path is visible instead of a dead click.

## How it works (backend team)

**Generation path.** Every LTM call goes through `ChatCompletionService.processRequest()` — a raw fetch to `/api/backends/chat-completions/generate` — NOT the chat `Generate()` pipeline. Consequences:
- Weyland-Router's interceptor never fires on LTM calls. No pause/resume, no model-strike interference, no retry collisions.
- Streaming works into the LTM editor even when chat streaming is globally off (it's per-call).
- The model override is passed per-request; the user's connection settings are never written to.
- The old system's crash mode (a failed `/trigger` wedging the whole STscript pipeline) is gone — a failed call marks the job `failed` and lights up the Reroll button. One attempt per click, no auto-retry.

**Prompt structure.** Three-message sandwich, built in `buildLTMPrompt()` / `buildMergePrompt()` / `buildRewritePrompt()`:
1. `system` — ruleset: format template, anti-hallucination checklist, POV instruction, macro instruction, thinking discipline.
2. `user` — the raw material (chat excerpt, or existing entries for merge/rewrite), explicitly framed as "NOT something to continue".
3. `user` — short high-recency reminder: don't resume roleplay, don't stop after the `<think>` block. `reasoning_effort: 'min'` is also sent on the payload for sources that honor it.

**Dates are extracted, not inferred.** `extractTimelineFromRange()` parses the `¦¦ Day, Date ~ Time ~ Location ~ (TAG) ¦¦` headers our house style mandates on every AI message, and injects the exact timeline into the prompt as ground truth. The entry's date line is pre-filled with the last marker. Only if an excerpt has zero headers does it fall back to context inference (with a hard "never use today's real-world date" instruction).

**Storage.** Entries live in the chat-bound lorebook (auto-created if missing):
- `automationId: "ltm:<uuid>"` — new-format marker
- `constant: true`, `position: 0`, `preventRecursion: true`
- `wlmPinned` (bool) — pin state; pinned entries never demote
- `wlmSourceRange` ({firstMessageId, lastMessageId}) — the chat span the entry was summarized from, so Reroll can regenerate from the real conversation instead of just rewriting saved text
- Only the newest `activeLTMCount` (default 3) unpinned entries stay `constant`; older ones flip to `vectorized` (semantic recall only). Legacy entries from the old STscript system (numeric automationId) are detected and fully manageable.

**Range/coverage (v1.4.0 fixes).** A new LTM's range starts after `__chatState[chatId].lastLtmMessageId` and is capped at `summarizeSpan` (user setting; 0 = auto = the cadence). Coverage is advanced on save only for `isFreshSummary` jobs, keyed by the **job's** chatId (not the currently-open chat — the user may have switched chats while the draft generated). Persisted drafts (`__drafts`) carry the job's `range`/`sourceRangeForSave`/`isFreshSummary` so a draft restored after a reload still advances coverage when saved — before v1.4.0 restored drafts silently didn't, which made the next LTM re-summarize ground an earlier memory already covered. Drafts older than 14 days are swept at startup (orphaned chat-id keys can't otherwise be told apart from live ones).

**Notification chip (v1.5.3 redesign).** Went through two iterations: a top-right floating chip (v1.3.3-era) was too subtle to notice on desktop; a brain-QR-button orange glow (v1.5.1) turned out to depend on the button actually being visible in the user's QR bar, which isn't guaranteed. Landed on: a single reusable chip, top-**center**, colored red (`data-kind="urgent"`/`"error"`) for anything that wants the user's attention, positioned/sized responsively (smaller on ≤700px, bigger on desktop — see the `@media` blocks in style.css). It auto-hides after `CHIP_AUTO_HIDE_MS` (60s) via a timer in `setChip()`, and tapping it dismisses immediately (`ensureChip()`'s click handler calls `hideChip()` before `openPanel()`). The timer only (re)starts on a genuinely new `{text, kind}` pair (`chipShown` comparison) — otherwise repeated `updateChip()` calls for an unchanged still-true condition (e.g. every incoming message while "due") would keep resetting the clock and the chip would never actually leave, which was the specific mobile complaint that killed the orange-glow approach.

**Auto-LTM (v1.5.1, chip text finalized v1.5.3).** `settings.autoLtmMode`: `'off'` (default) | `'semi'` | `'full'`.
- **Off** — unchanged manual flow. Chip shows "Time for an LTM?" when `getEffectiveGoal()` is reached; user clicks "+ New LTM" themselves.
- **Semi** — `maybeAutoTrigger()` (called from every `updateChip()` pass) fires `runAutoJob()` the instant the cap is hit, generating a draft in the background with `job.autoTriggered = true`. Chip shows "Drafting an LTM…" while it generates, then "LTM ready for approval" once it's waiting on the user — it is NOT saved automatically. `onRerollClicked` already reuses `job.range` unchanged for a job-kind draft, so rerolling this draft — even much later — always regenerates from the original span, never a grown one.
- **Full** — same auto-trigger, but `runAutoJob()` calls `autoSaveJob()` the moment the draft passes `validateLTMShape()`. Chip just shows "Generating LTM…" and then disappears — nothing is ever left waiting on the user in this mode.

**Drafts stack.** Semi-Auto drafts are meant to pile up if ignored — reaching cadence 50 at message 50, then again at message 100 without approving the first, produces TWO separate pending drafts (0–50 and 50–100), not one. This needed its own cursor: `getAutoTriggerCursor()` tracks `__chatState[chatId].lastAutoDraftMessageId`, maxed against the saved-coverage `lastLtmMessageId`, and is advanced by `recordAutoDraftCoverage()` the instant a segment is queued — independent of whether that segment ever gets saved. `recordLTMCoverage()` (called on save) explicitly preserves `lastAutoDraftMessageId` through its otherwise-wholesale `__chatState[chatId]` overwrite, so saving one stacked draft out of order can't reset the cursor backward and cause a later still-pending segment to be re-summarized from scratch.

`maybeAutoTrigger`'s only blocking guard is an in-flight generation for the chat (`status === 'generating' | 'queued'`) — segments are produced one at a time, never concurrently. If the cursor is still behind after one finishes, `runAutoJob`'s own `updateChip()` call re-enters `maybeAutoTrigger` and queues the next segment; each segment is capped to exactly one `resolveSummarizeSpan()` (via `computeNextAutoRange`), so a long absence cascades through several appropriately-sized drafts instead of one giant dump.

Auto-trigger only evaluates the **currently active** chat — it runs off `SillyTavern.getContext().chat`, so a chat you're not currently viewing won't auto-generate/cascade in the background.

**Real names, not macros, in entry content.** The model always writes real names ("Saph kissed me", not "{{char}} kissed me") — the prompt's instructions to the model use resolved names throughout, and entry content is expected to match.

**Per-character POV (backend-controlled).** WeyTav doesn't use ST's native group chats — multi-character casts are single cards — so there's no automatic way to detect them. Instead, `getCharacterPovTag()` reads the character card's embedded `data.tags` field:
- `LTM-POV-Third` or `LTM-POV-Group` → neutral third-person narrator (use for casts like Cerberus Sisters)
- `LTM-POV-First` → first-person diary (also the default when no tag exists)
- Matching is case-insensitive, tolerant of `:`/space separators.

**Tag the cast cards before release** — untagged multi-char bots will produce first-person entries from an ambiguous "I". This is a card-authoring step on our side; users never see or touch it (cards are locked down, and the settings UI deliberately doesn't mention tags).

**Default model.** Fresh installs default `modelOverride` to `glm-4.7-thinking`. Existing installs that already have saved settings keep whatever they had — the default only applies when `extensionSettings['Weyland-LTM']` doesn't exist yet. The settings panel has one-click quick-fill buttons for the recommended model plus two alternates (`minimax-m3`, `gemini-3.1-pro-preview`) — Lucky wants Sonnet reserved for actual roleplay messaging rather than spent on LTM summarization.

## Key files / functions map

| Concern | Where |
|---|---|
| Settings schema + defaults | `defaultSettings`, top of index.js |
| Job lifecycle (queued→generating→ready/failed) | `createJob`, `generateDraft` |
| Prompt builders | `buildLTMPrompt`, `buildMergePrompt`, `buildRewritePrompt` |
| Header/timeline parsing | `HEADER_RE`, `extractMessageHeader`, `extractTimelineFromRange` |
| Output cleanup + validation | `stripThinkBlocks`, `cutToMemoryEntry`, `validateLTMShape` |
| Lorebook IO | `readAllLTMEntries`, `saveLTMEntry`, `deleteLTMEntry`, `demoteExcessLTMs` |
| Panel UI | `buildModalHtml`, `injectModal`, `refreshSidebar`, editor handlers |
| Goal/progress ("64/126") | `getEffectiveGoal`, `renderProgress`, goal edit buttons |
| Slash commands | `/ltm` (open panel), `/ltm-new` (queue draft) |

## QR migration status

Both old entry points route to `/ltm` (the brain-icon `LTMSettings` QR id 18, and the embedded LTM submenu inside master `Settings` QR id 248). `Weyland.Sleep` is unreferenced anywhere in Weyland.json. The old `Sleep`/`LTMPrompt`/`LTMDisabler`/`MemorySaver` QR entries still exist as unreachable dead code — safe to delete after release confidence, kept for now as rollback material.

## Known limitations

- Requires a chat-completion source (all WeyTav presets qualify).
- The model override must be a valid model ID for the connected source.
- `wlmPinned`/`wlmSourceRange` are custom WI fields — they persist through normal save/load but tools that strip unknown fields on export would drop them (entries still work, they just lose pin state / regenerate-from-source).
- The suggestion nudge counts messages since the last saved LTM per chat, persisted in extension settings.
