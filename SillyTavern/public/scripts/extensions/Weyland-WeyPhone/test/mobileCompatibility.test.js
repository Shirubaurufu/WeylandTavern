import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const styleUrl = new URL('../style.css', import.meta.url);
const indexUrl = new URL('../index.js', import.meta.url);
const mapUrl = new URL('../maps/weyland_dorms.html', import.meta.url);

test('notification shade reserves the measured clock row and apps use opaque chrome', async () => {
    const [style, source] = await Promise.all([readFile(styleUrl, 'utf8'), readFile(indexUrl, 'utf8')]);
    assert.match(style, /#wp-shade-panel\s*\{[^}]*padding-top: var\(--wp-status-height, calc\(40px \+ var\(--wp-safe-top\)\)\)/);
    assert.match(source, /statusSizeObserver\.observe\(statusBar\)/);
    assert.match(source, /setProperty\('--wp-status-height', `\$\{statusBar\.offsetHeight\}px`\)/);
    assert.match(style, /#wp-panel:not\(\[data-view="home"\]\) #wp-panel-header\s*\{\s*background: var\(--wp-chrome-bg\)/);
    for (const app of ['pawxai', 'mien', 'kressa', 'calculator', 'registrar', 'understudy']) {
        assert.ok(style.includes(`#wp-panel[data-app="${app}"] { --wp-chrome-bg:`));
    }
});

test('fullscreen and desktop behaviors use non-overlapping width and height queries', async () => {
    const [style, source] = await Promise.all([
        readFile(styleUrl, 'utf8'),
        readFile(indexUrl, 'utf8'),
    ]);

    assert.match(style, /@media \(min-width: 769px\) and \(min-height: 521px\)/);
    assert.match(style, /@media \(max-width: 768px\), \(max-height: 520px\)/);
    assert.match(source, /DESKTOP_PHONE_MEDIA = '\(min-width: 769px\) and \(min-height: 521px\)'/);
    assert.match(source, /FULLSCREEN_PHONE_MEDIA = '\(max-width: 768px\), \(max-height: 520px\)'/);
    assert.doesNotMatch(source, /matchMedia\('\(min-width: 601px\)'\)/);
    assert.doesNotMatch(source, /matchMedia\('\(max-width: 600px\)'\)/);
});

test('phone shell reserves camera and home-indicator safe areas', async () => {
    const style = await readFile(styleUrl, 'utf8');

    assert.match(style, /--wp-safe-top: env\(safe-area-inset-top, 0px\)/);
    assert.match(style, /--wp-safe-right: env\(safe-area-inset-right, 0px\)/);
    assert.match(style, /--wp-safe-bottom-raw: env\(safe-area-inset-bottom, 0px\)/);
    assert.match(style, /--wp-safe-bottom: min\(var\(--wp-safe-bottom-raw\), 42px\)/);
    assert.match(style, /#wp-panel\[data-mobile-platform="android"\][\s\S]*?--wp-safe-bottom: 0px/);
    assert.match(style, /padding: calc\(6px \+ var\(--wp-safe-top\)\) 14px 4px/);
    assert.match(style, /padding: 4px 24px calc\(8px \+ var\(--wp-safe-bottom\)\)/);
    assert.match(style, /padding-right: var\(--wp-safe-right\)/);
    assert.match(style, /padding-left: var\(--wp-safe-left\)/);
    assert.match(style, /height: min\(740px, calc\(100dvh - 110px\)\)/);
});

test('portal and housing map retain fallbacks while opting into dynamic mobile viewports', async () => {
    const [source, map] = await Promise.all([
        readFile(indexUrl, 'utf8'),
        readFile(mapUrl, 'utf8'),
    ]);

    assert.match(source, /width:100vw; width:100dvw; height:100vh; height:100dvh/);
    assert.match(source, /window\.visualViewport\?\.addEventListener\('resize', updateTopBarOffset\)/);
    assert.match(map, /viewport-fit=cover/);
    assert.match(map, /min-height:100vh;[\s\S]*?min-height:100dvh;/);
    assert.match(map, /safe-area-inset-top/);
    assert.match(map, /transform-origin:top left/);
    assert.match(map, /wrap\.style\.transform = `scale\(\$\{mapZoom\}\)`/);
    assert.doesNotMatch(map, /wrap\.style\.width = `\$\{mapZoom \* 100\}%`/);
    assert.match(map, /@media \(pointer:coarse\)[\s\S]*?\.map-tools\{display:none\}/);
    assert.match(map, /Pinch to zoom .* drag to pan/);
    assert.match(map, /mapViewport\.addEventListener\('pointermove'[\s\S]*?mapPinch/);
});

test('housing map pins rooms by click, titles itself Residence Directory, and marks room 271', async () => {
    const map = await readFile(mapUrl, 'utf8');
    // Capturing the pointer on every press retargeted clicks away from rooms, so pinning never
    // happened and hovering swapped the cards. Capture must wait for a real pan/pinch.
    const pointerdown = map.slice(map.indexOf("mapViewport.addEventListener('pointerdown'"), map.indexOf("mapViewport.addEventListener('pointermove'"));
    assert.doesNotMatch(pointerdown, /\n\s*mapViewport\.setPointerCapture\(event\.pointerId\);/);
    assert.match(map, /if\(!mapPan\.moved\)\{ try \{ mapViewport\.setPointerCapture\(event\.pointerId\)/);
    // A pin only clears on its own room or another populated room - no document-wide dismiss.
    assert.doesNotMatch(map, /document\.addEventListener\('mousedown'/);
    assert.match(map, /<span>Residence Directory<\/span>/);
    assert.match(map, /const USER_ROOM = '271';/);
    assert.match(map, /Your default room/);
    // Zoom controls sit below the map, outside the map stage.
    assert.ok(map.indexOf('class="map-tools"') > map.indexOf('id="btabs"'));
});

test('the duplicate top-left Home control is gone while the V2 bottom Home remains', async () => {
    const panel = await readFile(new URL('../lib/panel.js', import.meta.url), 'utf8');
    assert.doesNotMatch(panel, /id="wp-home-button"/);
    assert.match(panel, /id="wp-nav-home"/);
});

test('shared scroll regions can shrink and touch layouts keep usable targets', async () => {
    const style = await readFile(styleUrl, 'utf8');

    assert.match(style, /#wp-screen-body[\s\S]*?min-width: 0;[\s\S]*?min-height: 0;/);
    assert.match(style, /\.wp-contact-list \{ flex: 1; min-height: 0; overflow-y: auto;/);
    assert.match(style, /@media \(pointer: coarse\)/);
    assert.match(style, /\.wp-compose-action \{ width: 40px; height: 40px; \}/);
    assert.match(style, /\.wp-nav-btn \{ min-width: 48px; min-height: 44px;/);
    assert.match(style, /overscroll-behavior: contain/);
    assert.match(style, /max-height: calc\(64px \+ var\(--wp-safe-bottom\)\)/);
    assert.match(style, /flex: 0 0 auto !important/);
    assert.match(style, /#wp-nav-bar \{[\s\S]*?position: absolute;[\s\S]*?bottom: 0;/);
    assert.match(style, /#wp-lock-screen[\s\S]*?calc\(94px \+ var\(--wp-safe-bottom\)\)/);
    assert.match(style, /#wp-portal \{[\s\S]*?contain: layout style paint;[\s\S]*?transform: translateZ\(0\);/);
});

test('put-away control is integrated beside the clock rather than floating over the battery', async () => {
    const [style, statusBar] = await Promise.all([
        readFile(styleUrl, 'utf8'),
        readFile(new URL('../lib/ui/statusBar.js', import.meta.url), 'utf8'),
    ]);
    assert.match(statusBar, /class="wp-status-left"[\s\S]*id="wp-status-clock"[\s\S]*id="wp-panel-close"/);
    assert.match(statusBar, /id="wp-status-battery"[\s\S]*id="wp-battery-percent"[\s\S]*id="wp-battery-shell"/);
    assert.match(statusBar, /id="wp-status-sleep"/);
    assert.match(style, /#wp-panel-close[\s\S]*border-radius: 5px/);
    assert.match(style, /#wp-panel\[data-locked="true"\] #wp-status-sleep/);
    assert.doesNotMatch(style, /#wp-panel-close\s*\{[^}]*position:\s*absolute/);
});
