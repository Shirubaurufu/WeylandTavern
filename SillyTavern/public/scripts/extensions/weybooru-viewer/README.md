# Weybooru Viewer (SillyTavern Extension)

Full-screen booru viewer that lives inside SillyTavern. Currently fetches from **Rule34** as a stand-in until the Weybooru API is ready.

**v0.2.0** — major refactor to align with the [Weyland Downloader](https://github.com/) (by Mika) for visual consistency across the Weyland extension family. Mobile support, modal-window UI (instead of full-bleed), `--rb-*` design tokens, and template-based markup.

## Install

1. Drop this folder into your SillyTavern install at:
   ```
   public/scripts/extensions/third-party/weybooru-viewer/
   ```
2. Restart ST (or reload the page).
3. Click the **🖼 image icon** in the toolbar at the top of the character list — it appears alongside the Weyland Downloader's server icon.

You can also use the slash command `/weybooru [tags]` (e.g. `/weybooru serra`).

## First-time setup

Open the viewer → in the left panel, paste your **Rule34 User ID** and **API Key** (rule34.xxx → My Account → Options) → click *Save Credentials*.

## Usage

- Type tags in the header search → hit Enter or *Search*
- When a character is loaded in ST, a `↻ {name}` button appears next to the search bar — click to jump straight to that character's tag
- Save frequently-used tags as chips in the **Saved Tags** section (click `+ save` while a tag is in the search box)
- Closing the viewer **doesn't reset state** — your search, current image, and play position persist next time you open it

## Hotkeys (desktop)

| Key | Action |
|---|---|
| ← / A | Previous |
| → / D | Next |
| W | Back 10 |
| S | Forward 10 |
| Space | Play / Pause |
| F | Toggle auto-fit |
| Z | Hide/show side panels (full-screen image mode) |
| E | Open source page |
| G | Fave / Unfave |
| Esc | Close viewer |

## Mobile

The viewer is fully mobile-responsive. Below 900px width:
- Three panes become slide-over panels controlled by the bottom nav (☰ settings | 🖼 viewer | 🎚 filters)
- Tap the left/right edges of the image to navigate prev/next
- Floating control bar stays at the bottom of the image area
- Brand header doubles as a button to bring up the settings pane

## v0.2.0 Changelog

- **Architecture refactor** — adopted Weyland Downloader's modal pattern (`.st-modal-overlay` → `.st-modal-window` → `.st-grid-container`)
- **Design tokens shared with Weyland Downloader** (`--rb-bg-darkest`, `--rb-accent`, etc.)
- **Mobile slide-over panes** with bottom nav (3 icons)
- **Touch gestures** — tap left/right thirds of image to navigate
- **Toolbar mount** — button now lives in `#extensions_info` next to the Weyland Downloader server icon
- **Template extracted** to `template.html` for easier editing
- Modal window (95vw × 90vh) instead of full-bleed overlay — chat stays visible behind
- FontAwesome icons throughout (matches downloader)
- Uses `SillyTavern.getContext()` instead of imported `extension_settings`

## Roadmap

- Swap `fetchRule34` → `fetchWeybooru` once the Weybooru API is live
- Per-character tag mappings (e.g. ST "Serra" → booru `serra_(weyland)`)
- Right-click → "Send to chat" / "Set as character avatar"
- Pinch-to-zoom on mobile

## Files

- `manifest.json` — extension metadata
- `index.js` — logic (state, fetcher, ST integration)
- `template.html` — markup (extracted for editability)
- `style.css` — styling (uses `--rb-*` tokens shared with Weyland Downloader)
