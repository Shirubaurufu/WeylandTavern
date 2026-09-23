# WeyPhone 2.0 overlay installation

1. Close Weyland Tavern.
2. Extract the release ZIP into the **Weyland installation root**: the folder that already contains
   `SillyTavern`.
3. Allow your archive tool to merge folders and overwrite existing files.
4. Restart Weyland Tavern and hard-refresh each browser that had it open.

The archive's primary install-relative path is:

`SillyTavern/public/scripts/extensions/Weyland-WeyPhone/`

It also intentionally updates:

`SillyTavern/public/scripts/world-info.js`

That host file contains a backward-compatible, WeyPhone-specific flag which suppresses only the
World Info budget toast during synthetic phone scans. It does not change World Info budgets or
normal roleplay behavior. Seeing this file overwrite during installation is expected.

WeyPhone conversations, notes, prompts, saved posts, wallpapers, and settings live in SillyTavern's
user settings rather than this extension folder. Overwriting the extension therefore does not
erase them. A Settings > Export backup is still recommended before every major server update.

Development-only icon concepts, UI screenshots, tests, and original-resolution source art are not
part of the release overlay. Older copies of those unused files may remain on disk after an overlay
update, but WeyPhone no longer loads them.
