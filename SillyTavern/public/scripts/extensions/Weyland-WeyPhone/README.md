# WeyPhone 2.0

The official Weyland Tavern phone: a complete in-world device that lives in a draggable desktop
panel or becomes the full visible screen on mobile.

For the full release notes and practical instructions, read the
**[WeyPhone 2.0 major changelog and user guide](CHANGELOG.md)**.

Built on the original fan extension by **aerosplat-dev**. Its conversation, memory, tethering, and
experimental phone-block work provided the foundation for this rebuild. Thank you. ♥

## Apps

| App | Purpose |
|---|---|
| **The Weyland Chronicle** | Campus alerts and city news |
| **Chitter** | Public posts, profiles, likes, retweets, bookmarks, and Following |
| **Discorgi** | Weyland Tavern server chatter |
| **Yip Yap** | Anonymous nearby campus posts |
| **Messages** | Multi-bubble lore-aware DMs and group chats |
| **Contacts** | Searchable official cast plus imported Registrar characters |
| **Kressa** | The Wolfgirl Assistant, with ten palettes and her own model |
| **PawXai** | Titled SDXL-style prompts from the latest roleplay scene |
| **Copycat** | Cat-themed second-model rewrites stored safely as alternate swipes |
| **PromptOS** | A touch-friendly control surface for Storytelling Settings, using the same prompts and rebuild flow |
| **Mien** | Character expression and outfit gallery with temporary chat apply |
| **Housing** | Contained zoom/pan campus housing map |
| **Notes** | Persistent personal notes |
| **Calculator** | A working themed calculator |
| **Settings** | Models, roleplay texting, appearance, backup/restore, and reset |

## Opening WeyPhone

Click Weyland Tavern's existing **chat-bar phone button**. The old floating orange launcher has
been retired.

- Desktop: drag and resize the phone.
- Mobile: WeyPhone fills the browser area above the physical device controls.
- Close: use the X beside the WeyPhone clock.
- Help: every app has a **?** button with a short explanation.

## Messages in thirty seconds

The **arrow** queues a bubble without generating. Queue as many bubbles as desired, then use
**refresh** once in Unlinked or Observe mode.

- Downloaded characters use their full card.
- Characters without an installed card use an official or imported Registrar subbot when one
  exists.
- Contacts with neither source are marked **Not Reachable**.
- One-to-one DMs receive relevant lore, contact context, and relevance-gated user persona details.
- Group chats support two to four characters and always use compact subbots.

### Roleplay modes

Message bubbles display Markdown images (`![description](https://...)`) and the greeting
image shortcuts `[I001]` / `[P001]`, using the same numeric global variables as the main
Weyland formatter. Tap a preview to open the full image in a separate tab. Unresolved shortcuts
remain visible; failed previews show a link. Existing saved messages gain previews when reopened,
and editing continues to show the original source text.

- **Unlinked:** cannot read or affect the current roleplay.
- **Observe:** can read the current roleplay, but cannot write back.
- **Linked:** phone blocks round-trip through the main roleplay model. Queue the reply in WeyPhone,
  then send the next normal roleplay message; the main roleplay model answers it.

See the changelog for capture setup, Scrub messages, Kressa's special boundary, and LTM sharing.

## One-call Sync

One explicit **Sync** request refreshes The Chronicle, Chitter, Discorgi, and Yip Yap together.
Nothing auto-generates simply because content is stale. Ordinary texting, social Sync, Kressa, and
PawXai have independent model settings.

## Data and transfer

WeyPhone data is stored in SillyTavern user settings, not extension source files. Settings includes:

- Full-device JSON export and validated import.
- Merge-safe saves for desktop/mobile use against the same server.
- Wallpaper focus, dim, and white-wash controls.
- **Format WeyPhone**, which deliberately clears the phone after confirmation.

Export a backup before moving servers or making a major installation change.

## For maintainers

- Install directly at `public/scripts/extensions/Weyland-WeyPhone/`, not under `third-party/`.
- App definitions live in `lib/appRegistry.js`.
- The unified social prompt/parser live in `lib/unifiedPrompt.js` and `lib/unifiedParsing.js`.
- Roleplay capture/injection lives in `lib/roleplayTether.js` and `lib/roleplayMode.js`.
- All Connection Profile requests pass through `lib/requestBudget.js`, which keeps estimated input
  below 35K tokens by retaining required instructions and newest context first.
- Cross-tab/device merge helpers live in `lib/settingsSync.js`.
- The cast directory caches for 24 hours and falls back to `lib/castSnapshot.js`.
- Test command: `node --test "test/*.test.js"` from the extension directory.
- Current release result: **522 tests passing** with no package install required.

The installation overlay also includes `public/scripts/world-info.js`. Its one compatibility hook
lets synthetic WeyPhone scans suppress only the World Info overflow toast; normal roleplay scans,
budget calculation, entry activation, and truncation remain unchanged.

The release overlay ships visually checked 256 px WebP app icons and feed-profile art. Original
source images, unused icon concepts, screenshots, tests, and build tooling stay outside the runtime
package so mobile users do not download development artifacts.
