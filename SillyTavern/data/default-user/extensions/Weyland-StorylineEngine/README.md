# Weyland-StorylineEngine ("Story Engine")

Forward-looking companion to Weyland-LTM. Where LTM summarizes what already happened into memory, the Storyline Engine takes a premise ("the zombie apocalypse begins") and generates a structured, **paced** storyline that then guides the roleplay one beat at a time. v1.0.0.

Built on the same bones as Weyland-LTM — same draggable popout, same async generation through `ChatCompletionService`, same reroll / version-history / notification-chip / wand-menu / slash-command scaffolding — so the two extensions read as siblings. The visual language is shifted from crimson to amethyst so the windows are tellable apart at a glance.

## The problem it solves (read this first)

Bots blow through a plot in three messages for two reasons:

1. **Pacing is implicit prose.** "Spend 2-3 messages on this step" is an instruction the model has to remember to re-honor every turn, buried in a wall of text. It doesn't.
2. **The model can see the ending.** If the whole arc — including "Jenn gets bitten" — is in context, the model races toward it.

The Storyline Engine fixes both:

1. **Pacing is a parsed field, not a vibe.** Every beat carries a `PACING: <min>-<max> messages` range that becomes real numbers (`beat.min`, `beat.max`). See `TEMPO_PROFILES` and `parsePacing`. A hallucinated "every beat = 1 message" storyline is clamped up to the tempo floor, so it can't self-destruct.
2. **Only the current beat is ever injected.** The full storyline never enters the prompt. At roleplay time we project **just the current beat** as an at-depth system "director" note (`buildDirectorText` → `writeDirector`). Future beats and the ending stay invisible, so there's nothing downstream to rush toward.

## How it works (backend team)

**Generation path.** Identical to LTM: `ChatCompletionService.processRequest()` — a raw fetch to `/api/backends/chat-completions/generate`, never the chat `Generate()` pipeline. Consequences carry over verbatim: Weyland-Router's interceptor never fires, streaming works even when chat streaming is globally off, the model override is per-request, and a failed call lights up Reroll instead of wedging anything. Critically, because generation does **not** go through `Generate()`, it never emits `MESSAGE_RECEIVED` — so the per-beat message counter is never polluted by the engine's own calls (or by LTM's).

**Prompt structure.** Three-message sandwich, built in `buildStorylinePrompt()`:
1. `system` — the story-architect ruleset: use `{{char}}`/`{{user}}` macros for the leads (portability), honor explicit user-demanded outcomes, measurable objectives, 5-9 beats, and the pacing philosophy for the selected tempo. Plus the exact output template and thinking discipline.
2. `user` — the premise, framed as "the brief, NOT something to roleplay", with an optional recent-scene excerpt for continuity.
3. `user` — short high-recency reminder to emit only the `[STORYLINE]` block with real pacing on every beat. `reasoning_effort: 'min'` is sent for sources that honor it.

**The canonical format.** Same philosophy as LTM's `[MEMORY ENTRY]` template — a human-readable, regex-parseable block the model emits, the user edits freely, and `parseStoryline()` turns back into the runtime object. `serializeStoryline()` is the exact inverse (round-trip verified). Shape:

```
[STORYLINE]
TITLE / SETTING / TONE
CAST: (- Name — role (introduced: Beat n))
--- BEAT n ---
  SUMMARY / OBJECTIVE / ADVANCE WHEN / PACING / INTRODUCES / OUTCOME
ENDING:
[END STORYLINE]
```

**Tempo profiles** (`TEMPO_PROFILES`) are the headline pacing knob. `brisk` (~1-3 msg/beat), `standard` (~2-5), `slowburn` (~4-8). Tempo (a) feeds the generator its target ranges and (b) supplies the clamp `floor`/defaults `parsePacing` uses when a beat's own `PACING` is missing or absurd. This is the anti-"all beats = 1 message" safety net.

**The director note** is the whole trick. When a storyline is active, one lorebook entry (`automationId: "story:director:<id>"`) holds the current beat, rewritten as beats advance:
- `constant: true`, `position: atDepth (4)`, `depth: settings.injectDepth` (default 1), `role: 0` (system) — the highest-recency, most-obeyed placement, so it reads like a live stage direction rather than distant background.
- **Two-phase directive.** A per-beat message counter (`computeMessagesIntoBeat`) drives the phrasing:
  - **BUILD** (`into < beat.min`): "let it breathe, do NOT resolve or advance yet." The beat's outcome is mentioned only as *where it's heading, don't rush there*.
  - **READY** (`into >= beat.min`): "bring it to its conclusion when earned." The outcome is now surfaced as a **required** thing to make happen.
- The director note is only rewritten on an actual phase or beat change, so the vast majority of turns cost nothing.

**Runtime advance** (`runtimeTick`, on `MESSAGE_RECEIVED`): recompute how many character messages have landed since the beat's anchor; flip BUILD→READY at `min`; auto-advance at `max` (if `autoAdvance` is on). The counter is derived from a **length anchor** (`beatAnchorLen`), not an event tally, so it's reload-safe and immune to swipe double-counting (a swipe replaces an index, it doesn't add one). User advances beats manually from the active-story panel or `/story-advance`.

**Portability / the library.** Storylines are banked to `settings.__library` (reusable across any character). Because the leads are `{{char}}`/`{{user}}`, a banked story runs on any card; new NPCs it introduces keep their literal names. Two worked examples ("The Outbreak", "The Unspoken Thing") are seeded on first run, guarded by `settings.__seeded`.

**Self-healing.** `reconcileDirector` runs on `CHAT_CHANGED` and `APP_READY`: if a chat has an active storyline but its director entry has gone missing (book reloaded, entry stripped by an export round-trip), it's rewritten with the phase recomputed from current chat length.

## Key files / functions map

| Concern | Where |
|---|---|
| Settings schema + defaults + seeding | `defaultSettings`, `loadSettings` |
| Tempo / pacing knob | `TEMPO_PROFILES`, `tempoProfile`, `parsePacing` |
| Genre quick-fills | `PRESETS` |
| Job lifecycle (queued→generating→ready/failed) | `createJob`, `generateDraft` |
| Generator prompt | `buildStorylinePrompt` |
| Format parse/serialize | `parseStoryline`, `serializeStoryline`, `parseKeyedBlock` |
| Output cleanup + validation | `stripThinkBlocks`, `cutToStoryline`, `validateStorylineShape` |
| Director projection (the pacing fix) | `buildDirectorText`, `writeDirector`, `removeAllDirectorEntries` |
| Beat runtime | `computeMessagesIntoBeat`, `activateStoryline`, `stepBeat`, `runtimeTick`, `reconcileDirector` |
| Library IO | `getLibrary`, `addToLibrary`, `removeFromLibrary` |
| Panel UI | `buildModalHtml`, `injectModal`, `refreshSidebar`, `renderActiveBox`, `renderLibraryList` |
| Slash commands | `/story`, `/story-advance`, `/story-off` |

## Default model

Same house rule as LTM: `modelOverride` defaults to `glm-4.7-thinking` on fresh installs, with quick-fill buttons for `minimax-m3` and `gemini-3.1-pro-preview`. Keep Sonnet reserved for actual roleplay messaging, not spent on structural generation (which a thinking model does better anyway). Storyline generation is infrequent — once per story — so this is cheap.

## Known limitations

- Requires a chat-completion source (all WeyTav presets qualify).
- `advanceWhen` is guidance for the model + a label for the user; it is **not** auto-evaluated. Auto-advance is driven purely by the message-budget counter — the honest, reliable signal. Manual advance is always available.
- The director note (`story:director:*`) is a custom-marked WI entry: it persists through normal save/load but a tool that strips unknown automationIds on export would drop it. `reconcileDirector` rebuilds it from persisted runtime state on next load.
- Beat pacing counts **character** messages only (user/system don't count), matching the original "spend N messages on this step" intent.
- Coexists cleanly with Weyland-LTM in the same chat book — different `automationId` prefixes (`story:` vs `ltm:`), and each reader filters to its own.
