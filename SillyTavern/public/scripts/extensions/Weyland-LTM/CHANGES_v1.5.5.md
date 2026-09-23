# Weyland-LTM — Changes since v1.3.3 (→ v1.5.5)

Read-first summary for the backend team. Full technical detail on each item is in `README.md`; this is the "what changed and why" changelog.

---

## v1.5.5: Auto-LTM firing a burst of drafts on chat-open, and a lorebook-duplication race

**Reported:** opening a 300-message chat with Auto-LTM on (Semi or Full) started generating LTMs immediately, with no message sent. Separately, possible duplicate lorebook for the chat (unconfirmed whether the same incident, but plausible given the mechanism below).

**Root cause 1 — trigger fired from the wrong events.** `maybeAutoTrigger()` is called from inside `updateChip()`, which is called from ~15 places: job lifecycle transitions inside `generateDraft` (status → generating/ready/failed), `CHAT_CHANGED`, settings changes, panel open/close, etc. All of them defaulted to allowing a trigger. Two consequences:
- `CHAT_CHANGED` → `updateChip()` → `maybeAutoTrigger()` meant simply **opening** a chat that was far behind the cadence cursor (never auto-drafted before, or Auto-LTM just turned on) fired a segment instantly — no message required.
- Worse, `generateDraft`'s own completion handler and `runAutoJob`'s trailing call both call `updateChip()` too. Since the cursor only advances by one segment per job, a job's own completion left the cursor STILL behind, immediately firing the next one — a self-perpetuating chain that burned through the entire backlog (6 segments for a 300-message chat at cadence 50) in one uninterrupted burst.

**Fix:** `updateChip({ trigger = false } = {})` — flipped the default to **false**. Only the `MESSAGE_RECEIVED` listener now opts in with `{trigger: true}`; every other call site (all ~15 of them) inherits the safe default automatically rather than needing to be individually audited and annotated. Catch-up on a long-overdue chat is now gradual — at most one new segment per genuine incoming message — instead of an instant burst.

**Root cause 2 (hardened defensively) — lorebook creation race.** `getOrCreateChatBookName()` did a plain check-then-create: read `meta[METADATA_KEY]`, and if unset, `await createNewWorldInfo(name)` then write the metadata key. Two callers landing close together (e.g. an auto-save completing at nearly the same moment as a manual Save from the panel — made far more likely by the burst above) could both read "no book yet" before either one's write lands, each independently calling `createNewWorldInfo()` — producing two lorebooks for the same chat. Fixed with a per-chat in-flight promise lock (`chatBookCreationInFlight: Map<chatId, Promise<string>>`): whoever calls first does the real work, everyone else for the SAME chat awaits that same promise instead of racing it. Keyed by chatId so unrelated chats' activity never blocks on each other.

---

## v1.5.4: Tapped nudges stay dismissed

The chip's tap handler already hid the element, but `updateChip()` re-runs on every incoming message and would immediately re-request the same still-true nudge ("Time for an LTM?" while due, "LTM ready for approval" while a semi-auto draft waits) — so it popped straight back on top of the panel the tap had just opened. Added `chipDismissedText`: a tap records the shown text, and `setChip()` suppresses any request matching it (hiding via `hideChipEl()`, which preserves the dismissal) until a genuinely different message wants the chip or the condition lapses entirely (`updateChip`'s no-notification fall-through calls the full `hideChip()`, which clears the dismissal so the same nudge can legitimately return later). Split the old `hideChip()` into `hideChipEl()` (element + timer only, keeps dismissal — used by the tap handler and the auto-hide timer) and `hideChip()` (also clears dismissal).

---

## Install location (read this first, corrected)

Canonical location is **`public/scripts/extensions/Weyland-LTM/`** — the plain system-extension path, no `third-party/` segment. Static imports are `../../` (two levels up to `/scripts/`), correct for the served URL `/scripts/extensions/Weyland-LTM/`. Per FFFox: LTM belongs at this path (like a bundled/system extension), NOT under `third-party/` — that's reserved for extensions like Weyland-SillyTavern. Weyland-Router stays in `data/default-user/extensions/`; don't confuse the two conventions.

**History, for context:** two copies had been loading at once in an earlier revision — a stale v1.3.3 at this same system location (imports `../../`, correct for it) and the working copy at `data/default-user/extensions/` (imports `../../../`, correct for *that* location). Both registered the same chip element, modal, settings key (`Weyland-LTM`) and slash commands, so they fought — presenting as "it said ready, I clicked, there was no draft, and it says Time for an LTM in semi-auto." Fixed by consolidating to one copy — first (incorrectly) under `third-party/` with 3-level imports, then corrected to this plain system location with 2-level imports per FFFox's guidance above. Extension state (drafts, per-chat coverage cursors) was unaffected throughout — it lives in `extensionSettings['Weyland-LTM']` in settings.json, keyed by module name, not by folder path.

## v1.5.3: Notification redesign — orange brain glow → red top-center chip

v1.5.1 tried moving the passive "time for an LTM?" nudge onto the brain quick-reply button itself (orange glow via a `MutationObserver`-maintained CSS class on `.qr--button .fa-brain`). In practice, that approach depends on the LTM QR button actually being present and visible in the user's quick-reply bar — not guaranteed for every user/setup — so the nudge could silently never appear no matter how overdue the chat was. Reverted.

**New design:** one reusable chip, but repositioned and re-themed to fix the two original complaints (`v1.3.3`-era chip was top-right and too easy to miss on desktop; needed to also not overstay its welcome on mobile):
- **Position:** top-**center** instead of top-right — much harder to miss.
- **Color:** anything wanting the user's attention (`due`, `drafting`, `ready for approval`, `generating`, `failed`) now renders in a shared red "urgent" style with a pulse, instead of the old muted per-kind styling.
- **Sizing:** responsive — smaller/tighter on ≤700px so it doesn't crowd a phone screen, larger on desktop so it's actually noticed.
- **Auto-hide:** every chip now disappears on its own after `CHIP_AUTO_HIDE_MS` (60s) via a timer started in `setChip()`. Tapping it dismisses immediately (`hideChip()` fires before `openPanel()` in the click handler). This directly fixes the mobile complaint that the old chip "wouldn't go away."
- The timer only restarts on a genuinely **new** `{text, kind}` pair, tracked via a `chipShown` comparison — otherwise `updateChip()` firing on every incoming message while a condition (like "due") stays true would keep resetting the clock and the chip would never actually time out.

**Text per Auto-LTM mode**, all through the same chip:
- Off: `Time for an LTM?`
- Semi-Auto: `Drafting an LTM…` while generating, then `LTM ready for approval` once waiting on the user.
- Full-Auto: `Generating LTM…`, then nothing (auto-saves, no lingering state).

All `applyBrainDue`/`watchQrBarForBrain`/`.wlm-brain-due` code and CSS from v1.5.1 has been removed outright rather than left dormant.

---

## 0. Hotfix (v1.5.2): Merge silently did nothing

**Symptom reported:** select two LTMs, hit Merge — button lights up (enabled), but clicking it does nothing at all. No error, no toast, no new draft.

**Root cause:** `buildMergePrompt()` referenced `${user}` inside its system-message template literal but never declared it — unlike `buildLTMPrompt()`, which does `const user = getUserName();`. Clicking Merge threw a `ReferenceError` the instant the template literal was evaluated, which happens synchronously as an argument to `createJob(...)` inside `onMergeClicked` — an `async` function with no try/catch. The throw happened before anything else in the handler ran (no toast, no job, no sidebar update), so the failure was completely invisible from the UI: an unhandled promise rejection, console-only.

The exact same bug existed in `buildRewritePrompt()` — the path used when rerolling a **legacy** or **merged** entry (no known `sourceRange` to regenerate from). That would have failed identically and just as silently.

**Fix:**
- Added the missing `const user = getUserName();` to both `buildMergePrompt()` and `buildRewritePrompt()`.
- Wrapped `onMergeClicked()` in try/catch with a `toast('error', ...)`, matching the pattern already used by `onSaveClicked`/`onDeleteClicked`/`onPinToggleClicked` — a future throw in this path will now surface instead of failing as a dead click.

---

## 1. Fixed: duplicate/re-summarized LTMs after a page reload

**Symptom reported:** saved an LTM at message 50, saved a second one at message 100, and the second one re-summarized the *entire* chat from message 0 — including ground the first LTM already covered.

**Root cause:** `saveDraftState()` only ever persisted `{text, savedAt}` for an unsaved draft. If the panel was closed and later reopened (e.g. after a page reload), the restore path (`openPanel`) rebuilt the job from scratch via `computeRangeFromCurrentChat()` and — critically — **without** `isFreshSummary: true`. The save handler only advances the coverage cursor (`__chatState[chatId].lastLtmMessageId`) when `isFreshSummary` is set, so saving a restored draft looked like it worked but silently never moved the cursor. The next "+ New LTM" started from message 0 again.

**Fix:**
- `saveDraftState()` now persists the job's `range`, `sourceRangeForSave`, and `isFreshSummary` alongside the text, and the restore path rebuilds the job with those intact.
- `recordLTMCoverage()` is now keyed by the **job's** `chatId`, not whatever chat happens to be open at save time (the UX explicitly encourages chatting elsewhere while a draft generates, so "current chat at save" was never a safe assumption).
- Drafts are also now saved under the *job's* chat id when the panel closes (was `getCurrentChatId()`).
- A startup sweep (`sweepStaleDrafts()`) discards any persisted draft older than 14 days, cleaning up orphaned entries from before this fix.

## 2. New: "Messages summarized per LTM" setting

New field in LTM Settings, `summarizeSpan` (default: blank/0 = **Auto**, which matches the existing cadence setting — identical to old behavior). Set it to a specific number to make every LTM cover a fixed number of messages regardless of the suggestion cadence. It only ever overrides the *size cap*, never the "skip what a previous memory already covered" start point.

## 3. Changed: "Time for an LTM?" chip → orange brain button

The floating suggestion chip is gone — it was easy to miss on desktop and ate real estate on mobile. The 🧠 brain quick-reply button itself now glows orange (`.wlm-brain-due` class, pulsing amber) when a memory is due, applied via `applyBrainDue()` and re-asserted by a `MutationObserver` on `#qr--bar` since the QR bar's own re-renders wipe DOM classes. The transient generating/ready/failed chips are unchanged (still the right call — they're actionable and short-lived).

## 4. New: Auto-LTM (Off / Semi-Auto / Full-Auto)

New setting `autoLtmMode`, one dropdown so the modes are naturally mutually exclusive. **Off by default.**

- **Off** (default) — unchanged manual flow.
- **Semi-Auto** — the moment the cadence cap is hit, a draft generates in the background automatically. It is **not** saved automatically — the brain keeps glowing (instead of the usual "draft ready" chip) until the user opens the panel and approves it themselves.
- **Full-Auto** — same background generation, but it saves itself the instant it passes validation, with zero manual step. The brain never glows in this mode; the only feedback is the existing transient "🧠 LTM generating…" chip.

**Drafts stack.** This was the one non-obvious design point: Semi-Auto drafts are meant to accumulate if ignored. Hitting cadence 50 at message 50, then again at message 100 without approving the first, produces **two** separate pending drafts (0–50 and 50–100) — not one. This required a second, independent coverage cursor (`lastAutoDraftMessageId`, tracked alongside but separately from the saved-coverage `lastLtmMessageId`), because "has anything been saved" is the wrong question for "has an auto-draft already claimed this span." `recordLTMCoverage()` (fired on manual save) was updated to explicitly preserve this cursor through its otherwise-wholesale `__chatState` overwrite, so saving one stacked draft out of order can't reset the cursor and cause a later still-pending segment to get silently re-summarized.

The only thing that blocks a new auto-trigger is an in-flight generation for that chat — segments are always produced one at a time. If the cursor is still behind after one finishes, the completion handler re-checks and queues the next, so a long absence cascades through several correctly-sized drafts instead of one giant dump or a lost gap.

Auto-trigger only evaluates the chat currently being viewed (same scope limitation the old suggestion-chip logic always had) — it won't generate anything for a chat you're not actively in.

**Rerolling a stacked/semi-auto draft** already worked correctly for free: job-kind reroll (`onRerollClicked`) reuses `job.range` unchanged, so even coming back 300 messages later, rerolling always regenerates from the *original* span, never a grown one — matching what Lucky specifically asked for.

---

## Files changed

- `index.js` — all logic above; version bumped `1.3.3 → 1.5.1`.
- `style.css` — chip CSS trimmed (dropped `[data-kind="suggest"]`), added `.wlm-brain-due` glow/pulse rules.
- `manifest.json` — version bump to match.
- `README.md` — backend-facing technical notes updated for all four items above.
- `USER_GUIDE.md` — user-facing wording updated (see the separate plain-language summary for the actual copy).
