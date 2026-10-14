// The chatbar phone button ("View Character's Phone") belongs to WeyPhone. index.js intercepts its click, so
// the "Check Phone" Quick Reply behind it only ever runs when WeyPhone failed to load (a browser glitch).
// It used to open the retired "Whose phone do you wish to see?" flow; it must now tell the player to refresh.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoFile = rel => fileURLToPath(new URL(`../../../../../../${rel}`, import.meta.url));
const qr = JSON.parse(readFileSync(repoFile('SillyTavern/data/default-user/QuickReplies/Weyland.json'), 'utf8'))
    .qrList.find(q => q.label === 'Check Phone');

test('the Check Phone button keeps the title WeyPhone intercepts', () => {
    assert.equal(qr.title, "View Character's Phone");
    const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    assert.ok(index.includes(String.raw`[title="View Character\'s Phone"]`), 'WeyPhone launcher selector changed');
});

test('without WeyPhone the button shows the refresh/repair popup, not the retired phone flow', () => {
    assert.match(qr.message, /^\/popup /);
    assert.match(qr.message, /does not seem to be running/);
    assert.match(qr.message, /refresh/i);
    assert.match(qr.message, /Repair-WeylandTavern\.bat/);
    for (const old of ['Whose phone', '/input', '/gen ', '/send ', 'PhoneBG', 'key=Phone']) {
        assert.ok(!qr.message.includes(old), `retired phone flow is back: ${old}`);
    }
});

// Storytelling Settings: same story. WeyPhone intercepts the button, so the Quick Reply only runs when
// WeyPhone failed to load. It starts with a popup + /abort, and the rest of the script must stay intact
// because PromptOS reads its canonical prompt text from it.
const narrativeQr = JSON.parse(readFileSync(repoFile('SillyTavern/data/default-user/QuickReplies/Weyland.json'), 'utf8'))
    .qrList.find(q => q.label === 'NarrativeSettings');

test('NarrativeSettings opens with a refresh/repair popup and aborts before the old menu', () => {
    assert.equal(narrativeQr.title, 'Storytelling Settings');
    const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    assert.ok(index.includes('[title="Storytelling Settings"]'), 'WeyPhone redirect selector changed');
    const abort = narrativeQr.message.indexOf('\n/abort |');
    const popup = narrativeQr.message.indexOf('/popup ');
    const oldMenu = narrativeQr.message.indexOf('/buttons');
    assert.ok(popup >= 0 && popup < abort && abort < oldMenu, 'popup, then abort, then the old script');
    assert.match(narrativeQr.message.slice(0, abort), /does not seem to be running/);
    assert.match(narrativeQr.message.slice(0, abort), /Repair-WeylandTavern\.bat/);
});

test('the guarded NarrativeSettings script still yields every prompt PromptOS extracts from it', async () => {
    const lib = await import('../lib/narrativeSettings.js');
    const script = narrativeQr.message;
    assert.ok(lib.extractHardModeDirective(script).startsWith('[TEMPORARY SCENE DIRECTION]'));
    assert.ok(lib.extractHardModeOffDirective(script));
    assert.ok(lib.extractClothingDirective(script).startsWith('[CLOTHING SUBSECTION:'));
    assert.ok(lib.extractLanguageDirective(script, 'German').includes('German'));
    for (const id of ['3rd POV Narration/2nd POV Persona', '1st POV Narration/3rd POV Persona']) {
        assert.ok(lib.extractPovDirective(script, id), `POV text missing for ${id}`);
    }
});
