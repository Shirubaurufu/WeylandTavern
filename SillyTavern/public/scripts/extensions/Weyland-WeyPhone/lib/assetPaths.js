// lib/assetPaths.js

// Extension files are served relative to this extension's own folder under /scripts/extensions/.
// If the folder is ever renamed, this is the only line to change.
export const EXTENSION_BASE_URL = '/scripts/extensions/Weyland-WeyPhone';

// Shared by lib/panel.js (app-tile icons) and lib/portraits.js (PSA/business account portraits).
export const ASSET_BASE_URL = `${EXTENSION_BASE_URL}/assets`;

// The Housing app's self-contained map page (maps/weyland_dorms.html), rendered in an iframe.
export const MAPS_BASE_URL = `${EXTENSION_BASE_URL}/maps`;
