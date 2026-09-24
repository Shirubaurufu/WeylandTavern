# WeyPhone 2.0 — major release changelog and user guide

This document compares WeyPhone 2.0 with the original `WeylandTavern-WeyPhone` fan release. It
describes substantial user-facing systems, not every code or CSS edit.

The original extension by **aerosplat-dev** supplied the foundation: conversations, threads,
memories, basic tethering, the first social apps, and experimental parsing/injection of generated
phone blocks. WeyPhone 2.0 keeps that good idea, substantially rebuilds its workflow and safety
rules, and expands the extension into a complete Weyland Tavern device.

## At a glance

WeyPhone is now:

- A complete phone shell on desktop and mobile, launched from Weyland Tavern's own chat-bar phone
  button.
- A lore-aware messenger for downloaded characters, lorebook-only characters, and imported
  community Registrar characters.
- A bridge between text messages generated inside roleplay and conversations continued inside the
  phone.
- A synchronized in-world media suite: The Chronicle, Chitter, Discorgi, and Yip Yap.
- A home for Kressa, PawXai image-prompt generation, Mien expression browsing, Housing, Notes, and
  Calculator.
- A portable user-owned device with backup, restore, reset, extensive personalization, and
  cross-device save protection.
- The home of **Copycat**, a cat-themed second-pass rewriter for the latest character reply
  through a different model without destroying the original.
- Home to **PromptOS**, a clearer phone-native interface for Storytelling Settings that continues
  to read canonical prompt text and run the existing Weyland Quick Reply rebuilds.

## Quick start

1. Click the existing **phone icon in Weyland Tavern's chat bar**. The former floating orange
   launcher is gone.
2. Complete the short first-time setup and swipe up from the lock screen.
3. Use **Sync** once to populate all four social apps in one generation request.
4. Open **Contacts** or **Messages** to start texting.
5. Use each app's **?** button for a short in-app explanation.

On desktop, WeyPhone is draggable and resizable. On mobile it becomes the full visible browser
area, stopping immediately above the real device navigation bar. The in-frame **X** beside the
clock closes it. The lock-screen power button puts it to sleep.

---

## 1. The device itself

### What changed

- Rebuilt the extension panel as an Android-adjacent phone with a lock screen, live status bar,
  battery, notification shade, quick settings, app grid, dock, sleep state, and first-time setup.
- Integrated the close control into the status bar instead of covering the signal/battery area.
- Added a passive lock screen, swipe-to-unlock affordance, Do Not Disturb and airplane-style quick
  controls, and app notifications.
- Added camera/notch and safe-area handling for modern mobile browsers. Android and iOS bottom
  insets are treated separately so WeyPhone's navigation bar does not float above or collide with
  the physical device UI.
- Added desktop drag/resize boundaries and mobile full-screen behavior. Mobile intentionally has no
  dragging: the real phone should feel like it *is* WeyPhone.
- Replaced the long onboarding app description with a contextual **What is this?** dialog in every
  app. Explanations use short bullets where a list is clearer than a paragraph.
- Added customizable app names behind one dedicated **Edit app names** screen so the main Settings
  page stays readable.

### How to use it

- **Open/close:** click Weyland Tavern's chat-bar phone icon; use the X beside the WeyPhone clock to
  close.
- **Sleep/wake:** use the power control on the lock screen, then open WeyPhone again to wake it.
- **Unlock:** swipe upward from the bottom lock-screen prompt.
- **Notifications:** tap the status area to open the shade; tap an item to open its app.
- **Help:** tap the ? in an app's own title bar.

---

## 2. Messages: realistic texting instead of single-turn chat

### What changed

- Split composing and generating into two actions:
  - The **arrow** adds the typed message to the chatlog without calling a model.
  - The **refresh** button sends the complete queued burst to the phone model.
- Users can therefore send two, three, or ten short bubbles before a reply, and characters can
  return multiple bubbles naturally.
- Removed DM image attachments. Most supported text models cannot inspect images, so the control
  suggested a capability the phone could not reliably provide.
- Added a dedicated **texting model** setting independent from social Sync, Kressa, and PawXai.
- Added message edit, individual/bulk delete, regenerate, multiple threads, in-app thread
  switching, and overflow actions.
- Added pinned memories and automatic memory summaries with primary/backup model support.
- Added a relationship/context field to every contact. This can establish anything from a long
  romance to open hostility without rewriting the character card.
- Added the active user persona to phone prompts as optional context. The model is explicitly told
  to ignore irrelevant details and use them only if the conversation makes them useful.
- Lorebook scans include the newest queued text. Mentioning “Sam” or “Sakurai Cafe” in the current
  burst can activate that lore before the character answers.

### How to send a burst

1. Type the first text and tap the **arrow**.
2. Repeat for every bubble you want to send.
3. In **Unlinked** or **Observe** mode, tap **refresh** once when the burst is ready.
4. The character's reply is generated against the whole waiting burst, the thread history,
   relevant lore, contact context, and any useful persona details.

The refresh button deliberately stays inactive until there is something new to answer.

### How character behavior is chosen

WeyPhone resolves a one-to-one contact in this order:

1. **Downloaded full character card.** The phone uses the installed character's full prompt data
   and relevant lore.
2. **Official Weyland subbot.** If the card is not installed—or no downloadable card exists—the
   matching compact lorebook profile defines the character.
3. **Imported Registrar subbot.** Community characters from locally imported Registrar lorebooks
   use their supplied profile and are clearly non-canon additions.
4. **Not Reachable.** A cast-directory name with no installed card and no usable subbot can be
   browsed, but its DM button cannot fabricate a personality.

This means Summer can use her full card when installed, Jenn can fall back to her Weyland subbot,
and a lorebook-only character such as Deredra remains contactable.

### Contact context and persona

Open a contact and edit its context when the normal card should know a relationship fact, for
example:

> Miu and I have been together for years and are very openly affectionate.

or:

> Bastet and I are mortal enemies.

The user's selected persona is also provided. Outfit, biography, and history details are not
forced into every answer; they are available when the user asks something that makes them relevant.

---

## 3. Contacts and community Registrar integration

### What changed

- Rebuilt Contacts around the public Weyland cast directory, including search, portraits, bios,
  species, occupation, residence, and other useful profile fields.
- Bundled an offline cast snapshot. If the live directory is unavailable, Contacts still opens.
- Cached successful directory refreshes for 24 hours and moved refreshes into the background.
- Added character renames and contact-specific context without cluttering global Settings.
- Detects locally imported **Community Registrar** lorebooks dynamically.
- Registrar characters can be added to Contacts, used as subbots in DMs and group chats, sampled
  occasionally by the social apps, included in Housing, and used as a Mien expression fallback.
- Community additions are bounded rather than injected into every generation. Importing twenty
  Registrar characters does not force twenty profiles into every prompt.

### How to use Registrar characters

1. Download the desired character lorebook from the community Registrar.
2. Import that lorebook into Weyland Tavern/SillyTavern normally.
3. Reopen Contacts or WeyPhone. Detected Registrar entries are added automatically.
4. Open the new contact and start a DM, or select it while creating a group.

Registrar integration is local-first: WeyPhone uses books the user chose to import. It does not
silently download the entire community catalog or treat community characters as canon.

---

## 4. Group chats

### What changed

- Added named group DMs with **two to four characters**.
- Groups always use compact subbot profiles, never several complete cards. This keeps generation
  size and cost predictable.
- Each assistant bubble records its speaker, and generated context keeps participants separate.
- Imported roleplay phone blocks can supply a custom group name and a nickname characters use for
  the player.

### How to use them

1. Open Messages and choose the new-conversation/group action.
2. Select two to four reachable characters.
3. Give the thread a custom name if desired.
4. Queue as many user bubbles as needed, then refresh once.

If a participant has no usable official or Registrar subbot, they cannot be added to a group.

---

## 5. Roleplay ↔ WeyPhone texting

The original extension proved that generated phone blocks could be parsed. WeyPhone 2.0 turns that
experiment into an explicit per-DM workflow with three modes, chat scoping, duplicate protection,
and information-bleed guards.

### The three modes

- **Unlinked** — complete isolation. The phone model cannot read the active roleplay, and the DM
  cannot write into it.
- **Observe** — read-only. The phone model can inspect the active roleplay for commentary or
  context, but nothing from the DM is injected back into that story.
- **Linked** — two-way roleplay texting. Compatible texts generated by the roleplay model appear in
  a chat-scoped DM; texts sent from that DM are attached invisibly to the next roleplay request so
  the full roleplay model answers them.

Linked threads belong to the roleplay chat in which they were linked. Opening another scenario
does not silently grant that new chat access to an old texting transcript.

### First-time setup

1. Open **Settings → Roleplay texting**.
2. Enable **Bidirectional roleplay texting**.
3. Enable automatic phone-block capture if you want new compatible blocks imported as they appear.
4. In a DM, choose **Linked** when that character is genuinely participating in the active
   roleplay. Selecting Linked also enables the required round-trip settings.

The manual **Capture last reply** and **Scan current roleplay** buttons can backfill compatible
blocks after enabling the feature.

### If a character texts inside the roleplay

1. The roleplay model outputs the official `Phone¦…`, `Texting¦…`, and `Incoming¦…`/`Outgoing¦…`
   structure. Common pipe/box-drawing delimiter variants are also accepted.
2. WeyPhone recognizes the participants, custom title, consecutive messages, and possible user
   nickname.
3. The original text remains visible in the roleplay. A deduplicated copy appears in a **Linked**
   WeyPhone thread scoped to that roleplay.
4. Open that DM and queue your answer with the arrow.
5. Do **not** request a phone-model reply. Linked mode waits for the main roleplay model.
6. Send your next normal roleplay message. WeyPhone attaches the unsent phone transcript as hidden
   context beginning with `*The texting chatlog is updated*`.
7. The main roleplay model answers with its full card, complete story context, selected premium
   model, and relevant lore. If it emits another compatible phone block, that reply is captured
   back into WeyPhone.

Captured roleplay messages are not injected back a second time. Only phone-side additions and
pinned phone memories need to round-trip, which avoids duplicating the model's own visible prose.
An explicit caution block tells uninvolved characters not to know private texts.

### Observe versus Linked: the Kressa example

If Kressa is reading a Nara roleplay and commenting as an outside friend, use **Observe**. Kressa
can understand the story, but her commentary cannot invade Nara's roleplay.

Use **Linked** for Kressa only when the currently open roleplay is the literal Kressa character-card
chat. The UI enforces that boundary.

### Scrub messages

In a Linked DM, open the overflow menu and choose **Scrub messages** to prevent the current
phone-side batch from being injected again. The bubbles remain visible in WeyPhone. Later texts can
form a new batch normally.

This is useful after changing your mind, correcting an accidental queue, or deciding that a
side-conversation should stop affecting the main scene.

### Share to long-term memory

The Share action writes a recent texting transcript into the current chat's World Info book using
a Weyland-LTM-compatible entry. It can be toggled on/off from the LTM/World Info interface and works
even when the separate Weyland-LTM extension is not installed.

Use this for durable “we arranged this over text” facts. Use Linked mode for an active back-and-
forth that the roleplay model should answer immediately.

---

## 6. One-call social Sync

### What changed

- Replaced separate background generations with one deliberate **Sync** request that fills:
  - The Weyland Chronicle
  - Chitter
  - Discorgi
  - Yip Yap
- Nothing generates merely because content is old. This protects limited daily message budgets.
- The unified prompt tells the world not to orbit the user. Most posts concern other characters'
  lives; at most one plausible *public* event from the active roleplay may surface.
- Added bounded official and Registrar roster sampling so the cast feels broad without bloating
  every request.
- Added app-specific offline/empty states and notifications when a sync completes.

### How to use it

Tap **Sync** in the bottom dock or notification shade. One request refreshes all four apps. A second
tap is unnecessary unless the user explicitly wants a new batch.

Social Sync, texting, Kressa, and PawXai each have their own model setting. The Settings guidance
recommends Minimax M3 or DeepSeek V4 Pro for routine phone work and asks users to preserve shared
Sonnet availability for heavier roleplay.

---

## 7. The social apps

### The Weyland Chronicle

- Rebuilt the campus newspaper presentation and empty state.
- Shows campus alerts and broader Weyland news from the shared Sync response.

### Chitter

- Replaced the generic social page with a dedicated dark, blue-accented Chitter shell.
- Integrated **For You** and **Following** inside the same app instead of navigating to an unstyled
  separate page.
- Added character profiles, post statistics, retweets, likes, bookmarks, saved posts, and a larger
  centered title.
- Saved/bookmarked posts persist across later Sync generations.

### Discorgi

- Added an app-specific server header and channel-like group chatter.
- Handles ordinary cast chatter and selected public-facing personas such as `@luckypaww` without
  turning every roleplay into server gossip.

### Yip Yap

- Added a distinct anonymous-campus-board theme, vote counts, and “guess who posted this” energy.
- **Hot** and **New** are visibly marked **Coming soon!** rather than appearing broken. Nearby is the
  currently implemented feed.

---

## 8. Kressa, the Wolfgirl Assistant

### What changed

- Rebuilt Kressa from a formal assistant panel into a warm text conversation: user bubbles sit to
  the right, Kressa sits to the left, and her name stays outside her message boxes.
- Renamed her subtitle from Weyland Assistant to **Wolfgirl Assistant**.
- Removed “prior history” framing. Kressa always knows the user.
- Kept multi-message bursts for both participants and moved thread switching into Kressa's own
  themed interface.
- Gave Kressa an independent model setting and fixed Weyland-lore retrieval, plus relevant active
  lore and persona context.
- Added **ten** purple/pink palettes, including two true dark modes.
- Added Paw Patrol Plus/Platinum entitlement detection and a friendly locked-state explanation.
- Enforced the roleplay rule described above: she can Observe other stories but Linked is reserved
  for her actual character-card roleplay.

### How to use her

- Open Kressa from the home screen and queue bubbles exactly like Messages.
- Use her gear for model, palette, and thread controls.
- Choose **Observe** to show her the current roleplay as an outside confidante.
- Choose **Unlinked** when the current roleplay should be completely private.

Without a recognized Plus or Platinum key in Weyland Tavern, the app remains visibly locked.

---

## 9. PawXai prompt studio

### What changed

- Added a dedicated SDXL-style prompt writer based on the latest roleplay scene.
- Sends up to the final three non-system turns for scene, mood, pose, clothing, and location context,
  while instructing the model to depict the **last character message**.
- Generates one to ten options, with **five by default**.
- Every result has a readable title for browsing and a separate copyable tag block. Character names
  may appear in the title but are forbidden from the actual image-generator tags.
- Added copy, save, delete, regenerate, and refresh-source controls.
- Saved prompts are grouped first by character name, then opened as that character's library.
- Added independent model, prompt count, framing, focus, variation, quality suffix, custom fragment,
  direct feedback, and color-palette controls.
- Added a curated conditional appearance library for major Weyland characters. Difficult weighted
  features—such as Vera's red inner hair and curled horns—are available when that character is
  actually in the scene.
- Curated clothing is a useful base outfit, not an override. If the current scene establishes a
  different outfit, underwear, nudity, or no visible body, the scene wins.
- PawXai is told to prompt only camera-visible details. A close-up does not waste tags on shoes.
- Removed the former `aged up` tag from the curated data and prompt rules. It is not generated and
  then stripped afterward.
- Retains the requested `broad shoulders` character tag. Multi-character repair adds it to each
  visible subject line instead of one ambiguous shared line.
- Explicit adult content may be described at full prompt weight; minors are prohibited.

### Multi-character output format

PawXai requires separated subjects so actions and clothing do not bleed together:

```text
2girls,
1girl, long red hair, pink sleeveless top, seated on left, holding coffee,
1girl, short blue hair, black tank top, seated on right, reading a menu,
cafe interior, across-table POV, morning light, quality tags,
```

### How to use PawXai

1. Open a roleplay containing at least one character reply.
2. Open PawXai. Confirm the source preview is the scene you want.
3. Use refresh-source if the roleplay changed while PawXai was open.
4. Adjust prompt count and optional feedback. Feedback is a direct instruction such as “Use only
   objective physical tags” or “Focus carefully on her hair.”
5. Generate, copy the tag block, or save it to the character's library.

PawXai produces portable prompts; direct PixAI generation remains optional and is not required to
use the app.

---

## 10. Mien expression gallery

### What changed

- Added **Mien**, a purpose-built expression browser for the active character.
- Uses installed/local expression sprites first and imported Registrar expressions as fallback.
- Detects arbitrary local outfit folders and Registrar `clothed`, `underwear`, and `nude` variants.
- Added outfit selection, thumbnail browsing, previous/next controls, and a full-screen viewer.
- Separates browsing from applying: looking through expressions does not change the roleplay.
- **Set in chat** applies the selected expression temporarily. Normal expression automation can
  choose a new one after the next character message.
- In group roleplays, Mien follows the most recent character speaker where possible.

### How to use it

1. Open a roleplay whose character has local or Registrar expression assets.
2. Open Mien.
3. Choose an outfit, then browse expressions.
4. Use full screen for a phone-sized view.
5. Tap **Set in chat** when the desired expression should appear in the active roleplay.

Characters without expression assets receive a clear empty state rather than a broken gallery.

---

## 11. Utility apps

### Housing

- Added a contained zoom-and-pan map viewer. Zoom changes the scale *inside* the viewport instead of
  growing the map element and pushing the rest of the phone away.
- Defaults to Sterling Hall's second floor.
- Supports touch panning after zoom and optional Registrar residents.

### Notes

- Added local notes with durable save/edit/delete behavior.
- Notes are part of WeyPhone export/import and are stored in user settings, not extension source.

### Calculator

- Added a complete calculator engine and a solid, legible app background.
- Added selectable color themes through its settings cog.

---

## 12. Personalization and system settings

### Added controls

- Independent model selectors for social Sync, ordinary texting, Kressa, and PawXai.
- Recommended quick-fill guidance for Minimax M3 and DeepSeek V4 Pro.
- App-name editing in a dedicated sub-screen.
- Wallpaper presets and a separate alphabetized **Character wallpapers** gallery.
- Custom image URL, horizontal focus, vertical focus, dimming, and **white wash**. White wash places
  a translucent white layer over a busy image so foreground text stays readable without modifying
  the source file.
- Per-character wallpaper editing.
- Roleplay-derived clock mode.
- Kressa, PawXai, and Calculator palettes.
- Optional “messages left” battery mode using WT-HelixUsage's `HMKey`. If the tracker is unavailable
  or returns bad data, WeyPhone falls back to its theatrical battery drain.
- A compact roleplay-texting explanation with controls placed beneath it.

The battery number now appears to the left of the battery icon, matching the final mobile layout.

---

## 13. Backup, migration, and data safety

### Export and import

**Settings → Export WeyPhone** downloads a JSON backup containing conversations, memories, contact
context, notes, PawXai prompts, saved posts, wallpapers, and preferences.

**Import WeyPhone** validates the file, rejects oversized/deep/prototype-polluting data, migrates
older supported shapes, and replaces the device only after confirmation. Keep a recent export
before moving servers or doing a large update.

### Format WeyPhone

**Format WeyPhone** intentionally erases the complete WeyPhone state and returns to first-time
setup. It is confirmation-gated. It is the reset tool, not an ordinary troubleshooting button.

### Where user data lives

Chats, notes, prompts, saved posts, wallpaper choices, and app preferences live in SillyTavern's
user settings—not inside the extension's JavaScript or asset folders. Updating/replacing the
extension therefore does not normally overwrite personal phone data.

### Cross-device and multi-tab saving

WeyPhone now protects against the stale-tab failure found during mobile testing:

- Opening the phone or returning focus to a tab refreshes the current WeyPhone state from the
  server.
- Before a WeyPhone save, the tab fetches the newest server settings and replays only the paths it
  actually changed.
- A desktop tab that changes a wallpaper should no longer overwrite conversations created minutes
  later from a phone over Tailscale.
- Saves are debounced, serialized, and retried rather than issuing a full settings write for every
  keystroke.

Two devices editing the **same message array or exact setting simultaneously** remain last-writer-
wins. Unrelated threads and preferences merge safely. A stale non-WeyPhone SillyTavern tab can
still be a broader host-level risk if another extension writes an old complete settings snapshot,
so keeping important backups remains wise.

---

## 14. Compatibility, reliability, and performance pass

### Fixes included in this release

- **Android safe areas:** WeyPhone's nav bar is flush with the visible browser bottom while the
  swipe-to-unlock hint remains above it. The real Android navigation bar stays outside WeyPhone.
- **iPhone/notch handling:** status and bottom controls respect CSS safe-area insets.
- **Mobile viewport sizing:** uses modern dynamic viewport behavior with fallbacks for older
  browsers and browser chrome expansion/collapse.
- **Main-chat streaming:** paint/layout containment and isolated scrolling reduce WeyPhone work
  while the roleplay is streaming.
- **Cross-device saves:** path-level merge protection prevents a stale WeyPhone snapshot from
  replacing unrelated newer data. Settings requests time out cleanly, and a failed write cannot
  permanently jam the serialized save queue.
- **Directory availability:** Contacts renders immediately from cache or a bundled snapshot. The
  live refresh now times out rather than hanging forever.
- **Helix battery availability:** quota requests are cached, deduplicated, and time out cleanly.
- **Registrar loading:** multiple imported books load concurrently while failures remain isolated
  per book.
- **Mien loading:** outfit folders and Registrar variants are checked concurrently instead of one
  network round-trip at a time.
- **Image decode:** scrolling feed avatars use lazy loading and asynchronous decode.
- **Prompt correctness:** PawXai multi-character repair now applies required subject tags to each
  person rather than the shared scene line.
- **Import hardening:** backup parsing enforces size/depth limits and blocks dangerous object keys.
- **Capture hardening:** malformed or ambiguous phone blocks stay untouched; captured messages are
  deduplicated; unknown speakers do not get guessed into the wrong DM.
- **Legacy migrations:** older conversation records, social cache names, settings defaults, and
  retired app/contact data are normalized without clobbering user choices.

### Compatibility boundaries worth knowing

- WeyPhone is a browser extension inside the same page as Weyland Tavern, not a separate OS
  process. A very heavy main-thread task in the host page can still delay taps briefly while a
  response streams. True process isolation would require a separate worker/window and a much larger
  host architecture change; the current containment work addresses the safe part available to an
  extension.
- Linked roleplay capture depends on a recognizable phone-block format. Freeform prose such as “she
  sent a text saying hello” remains prose and will not be guessed into a DM.
- Live cast portraits, custom URL wallpapers, Registrar services, and Helix quota display depend on
  their respective network services. Core Contacts and the theatrical battery have offline
  fallbacks.
- Mien can browse only assets that actually exist for the active character. Applying an expression
  also requires the host expression surface to be available.
- Kressa's locked state depends on Weyland Tavern exposing a recognized Plus/Platinum entitlement.

### Release asset optimization

The distributable overlay no longer ships the roughly **38 MB** of unused icon concepts and UI
screenshots. The selected app icons and feed-profile portraits are resized to 256 px and exported
as visually checked WebP assets; original-resolution source art remains in the working tree only.
This cuts the runtime image payload from roughly **33 MB** to well under **0.5 MB**, substantially
reducing first-open cost on phones and Tailscale/mobile-data connections.

---

## 15. Final reliability and credit polish

- Incoming DM bubbles are now discarded before storage when a single bubble exceeds three
  paragraphs or 2,000 characters. Separate normal bubbles remain unlimited, preventing accidental
  system-prompt dumps without flattening realistic multi-text replies.
- PawXai copy now supports both the modern Clipboard API and the synchronous textarea fallback
  needed by HTTP/Tailscale mobile sessions.
- Incoming character replies now create unread Messages notifications and home-screen badges when
  the user is outside that conversation. Manual roleplay history scans do not create notification
  spam.
- First-time setup now opens with the requested Aero thank-you, and the same permanent credit sits
  at the bottom of System Settings.
- Aero's onboarding thank-you now has its own bold line; every app help card states the one-request,
  one-message budget rule; wallpaper readability controls show their 20% dimming and 0% light-wash
  defaults; and Observatory stars are larger.
- Kressa's tier lock is now an in-phone dialog. Discorgi uses the Weyland University Discord
  masthead, stronger channel headings, established-character-only handles, and platform-appropriate
  college-age language including explicit adult language in the NSFW channel.
- The Settings footer now credits “WeyPhone V2 by Kressa and Lucky” before an indented Aero/V1
  thank-you. Messages now has separate pencil and group icons: the pencil opens the reachable
  one-person contact list, while the group icon opens a two-to-four-person subbot selector and asks
  for a group name after the selection is valid.
- Group-chat replies now place each speaker's first name in a small label immediately above their
  bubble. Group threads use a dedicated group silhouette in the conversation header and Messages
  list instead of a missing single-character portrait.
- PawXai's Paper Bloom settings now use their light palette surfaces consistently, and its Settings
  page opens with an optional PixAI referral card. Mien's refresh/full-screen tools sit on the left
  side of its centered masthead. Kressa's overlapping palettes were separated into maroon/white,
  true dark violet, and cream/gold families while preserving saved palette IDs.
- Wallpaper readability guidance is split into two indented help lines with neutral product copy.
  Kressa's model recommendation is a true second line, and Messenger's bulk-delete controls no
  longer inherit the host theme's font, glow, or button shadow.

## 16. Overnight compatibility pass

- Every phone-model request now has a conservative **35K estimated-input-token ceiling**. The
  limiter preserves the system instruction, final request, and newest conversation turns while
  removing oldest context first. This gives providers substantial headroom below a 65K hard
  rejection point and prevents long (~1,800-message) roleplays from breaking Sync.
- Synthetic WeyPhone World Info scans can now suppress the frightening budget-overflow toast.
  World Info still uses the same budget and stops at the same entry; ordinary roleplay scans still
  show their configured warning. The release overlay carries the tiny host compatibility hook that
  distinguishes WeyPhone scans.
- Messages-left battery mode now matches WT-HelixUsage's current endpoint, `HMKey` credential, and
  rolling-24-hour response schema. Settings displays the active mode, current remaining-message
  count when available, and the exact theatrical fallback behavior when disabled or unavailable.
- Removed the redundant top-left Home control that could expose legacy V1 navigation. WeyPhone's
  bottom Home button remains the single route to the V2 launcher.
- Chitter's stats row now vertically centers retweets and views with its tappable like control on
  mobile.
- Housing hides overlay zoom buttons on touch devices and supports two-finger pinch zoom plus drag
  panning; desktop retains the explicit zoom controls.

## 17. Contact identity and mode guidance

- Loona now defaults to `[REDACTED]` in Contacts and Messages. Users can still replace the label
  through app-name/contact customization.
- Messages-left battery mode now displays remaining allowance as a true percentage of the active
  limit. For example, 367 of 500 messages displays as 73%, rather than capping the raw remaining
  count at 100%.
- Tapping a character's portrait or name in a one-person DM opens that character's Contact page.
- Relationship Context is placed near the end of texting prompts as a high-priority instruction so
  it reliably shapes familiarity, tone, boundaries, and relationship assumptions.
- Texting prompts explicitly disable `[THOUGHTS]` blocks, hidden reasoning, and internal-monologue
  footers.
- Messages help is reorganized into General, Unlinked, Observe, and Linked sections. Linked now
  documents invisible textlog injection, normal roleplay workflow, repeated background inclusion,
  request cost, automatic imports, Scrub messages, and knowledge boundaries.

## 18. Copycat, the second-pass reply rewriter

Copycat is a new app. It hands the latest character reply to a second model and asks for a better
version of the same moment, then stores the result as a swipe beside the original.

### Why it exists

Frontier models understand a character's nuance and then regress toward clean, well-behaved prose,
and that regression compounds because each turn conditions on the slightly tidier turn before it.
Copycat runs a model with a looser prose distribution over the first model's output, so the scene
keeps its events while the voice comes back.

### What it does

- Rewrites the most recent character reply. The original stays exactly where it was, at its own
  swipe, so the chat arrows cycle between readings and nothing is overwritten.
- Applies rewrites as swipes, never as edits. Any reading can be re-rolled later, and an applied
  rewrite becomes a reading you can rewrite from in turn.
- Runs on its own model and its own backup model, independent of the roleplay connection.

### Scope: how much of the reply it may touch

- **Everything**, or **Unflinching** for a whole-passage rewrite aimed at wherever the previous
  model softened.
- **Dialogue**, **Thoughts**, **Actions**, or **Dialogue + thoughts** for narrow rewrites.
- A narrow scope extracts only those fragments, sends them numbered, and splices the results back
  by position. Anything outside them is structurally incapable of changing rather than merely
  asked to stay put.

### Direction

- A **Catnip note** on the Pawpad screen is the strongest instruction in the request. It carries
  across repeated rewrites of the same message.
- **Let it wander** lets Copycat discard what happens in the reply and write a different
  move, instead of rewording the one the first model chose. Off by default.
- A **narrator** can be applied to rewrites only, using the same personas as Storytelling Settings,
  without touching the narrator the chat itself is running.

### What it protects

- The date/time/location header and the closing expression and clothing codes are never sent to the
  second model and are restored exactly. The header's facts travel separately as labelled scene
  reference, so the rewrite knows where and when it is without being able to reformat the header.
- The second model is told that anything it knows only from the character profile has not been
  revealed on the page yet, so a rewrite cannot spill backstory into narration.
- Your language and POV settings always travel with a rewrite. Message modes travel when the reply
  already carries one, so a scene keeps its register instead of drifting.

### Automation

- Off by default. Optionally Copycat can prepare a rewrite and notify you, or add one as a swipe
  automatically, on every reply, every few replies, or at random.
- Every automatic rewrite is a model call and spends a generation. Copycat never rewrites one of its
  own rewrites.

---

## 19. Validation and implementation scale

Compared directly with the original ZIP, the current tree changes **177 files** and adds roughly
8,600 net lines. The implementation is split into **66 library modules** and **55 test files**.

Release validation completed on July 19, 2026:

- `index.js` syntax check: passed.
- Complete automated suite: **522/522 tests passed**.
- Focused tests cover mobile safe areas, phone-block routing, roleplay modes, prompt generation,
  lorebook resolution, Registrar parsing, Mien, Kressa tiering, settings backup/import, cross-device
  merging, network timeouts, and UI rendering.
- Android bottom-spacing behavior was confirmed on a physical device.

## Credit

Thank you to **aerosplat-dev** for the original WeyPhone and especially the early bidirectional
phone-block experiment. WeyPhone 2.0 is a very large rebuild, but that work established the core
idea this release turns into a full workflow.
