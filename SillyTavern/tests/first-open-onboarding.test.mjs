import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quickReplyPaths = [
    'data/default-user/QuickReplies/Weyland.json',
    // The duplicate root-level set was retired in 6dc8de31. Check it only on older
    // installs that still have it; the active QuickReplies copy is always required.
    ...(fs.existsSync(path.join(root, 'data/default-user/Weyland.json')) ? ['data/default-user/Weyland.json'] : []),
];
const firstOpenMessages = quickReplyPaths.map(file => {
    const data = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    return data.qrList.find(reply => reply.label === 'FirstOpen')?.message;
});

test('the active FirstOpen Quick Reply exists and any legacy copy stays in sync', () => {
    assert.ok(firstOpenMessages[0]);
    for (const message of firstOpenMessages) assert.equal(message, firstOpenMessages[0]);
});

test('key and password prompts offer Skip without a prefilled password', () => {
    const message = firstOpenMessages[0];
    assert.match(message, /\/input skipButton=Skip scroll=on wide=on Do you have a HelixMind API key to enter\?/);
    assert.match(message, /\/input okButton=Submit skipButton=Skip scroll=on wide=on/);
    assert.doesNotMatch(message, /default=password/);
});

test('the HelixMind key goes through /wtsethelixkey and a bad key explains where to get one', () => {
    const message = firstOpenMessages[0];
    assert.match(message, /\/wtsethelixkey \{\{getvar::KeyEntered\}\}/);
    // the old path wrote whatever was typed straight into the secrets store, unchecked
    assert.doesNotMatch(message, /\/secret-write/);
    assert.doesNotMatch(message, /setglobalvar key=HMKey/);
    for (const status of ['ok', 'unchecked', 'format', 'invalid', 'unreachable', 'failed']) {
        assert.match(message, new RegExp(`right="wt-key-${status}" rule=eq`));
    }
    // a key that is not a helix key (or is refused) gets the longer explanation with the Nara's Message Shop invite
    assert.match(message, /wt-key-format" rule=eq \{:\/popup[^\n]*https:\/\/discord\.gg\/xP6UDEZu7y/);
    assert.match(message, /wt-key-invalid" rule=eq \{:\/popup[^\n]*https:\/\/discord\.gg\/xP6UDEZu7y/);
});

test('the Paw Patrol password is checked by /wtverifykey and the channel link follows the tier picked', () => {
    const message = firstOpenMessages[0];
    assert.match(message, /\/wtverifykey \{\{getvar::answer\}\}/);
    // setup used to carry its own copy of the key comparison
    assert.doesNotMatch(message, /A7b~3C9\$Dq/);
    // `right=Beta` was read as the global variable Beta ("false"), so every tier got the Beta link; the label has to match exactly
    assert.doesNotMatch(message, /right=Beta\b/);
    assert.match(message, /right="PP Platinum or Above \(Alpha\)" rule=eq else=\{:\/pass <a href="[^"]*1367466920810381312">Beta Access Channel/);
    assert.match(message, /\{:\/pass <a href="[^"]*1367466640060583946">Alpha Access Channel/);
    assert.match(message, /wt-pass-platinum" rule=eq \{:\/popup[^\n]*Platinum Account has been verified/);
    assert.match(message, /wt-pass-plus" rule=eq \{:\/popup[^\n]*Plus Account has been verified/);
    assert.match(message, /wt-pass-wrong" rule=eq \{:\/echo Password does not match/);
});

test('every monthly key block in Startup Commands sets its own done flag and separates its commands', () => {
    const data = JSON.parse(fs.readFileSync(path.join(root, quickReplyPaths[0]), 'utf8'));
    const startup = data.qrList.find(reply => reply.label === 'Startup Commands').message;
    for (const flag of ['102026', '112026', '122026', '012027']) {
        assert.match(startup, new RegExp(`/setglobalvar key=${flag} true \\|`), `${flag} flag`);
        assert.match(startup, new RegExp(`getglobalvar::${flag}\\}\\} right=true rule=neq`), `${flag} guard`);
    }
    // without the flag the block re-ran on every start and reset everyone's membership; a missing pipe glued two commands together
    const jan = startup.slice(startup.indexOf('getglobalvar::012027'), startup.indexOf('getglobalvar::LuckyAdminKey'));
    for (const line of jan.split('\n').slice(0, -1)) {
        assert.match(line, /(\||:\}|\{:)\s*$/, `unterminated line: ${line}`);
    }
});

test('Skip discards popup input and its controls wrap on mobile', () => {
    const commands = fs.readFileSync(path.join(root, 'public/scripts/slash-commands.js'), 'utf8');
    const popupCss = fs.readFileSync(path.join(root, 'public/css/popup.css'), 'utf8');
    assert.match(commands, /name: 'skipButton'/);
    assert.match(commands, /name: 'scroll'/);
    assert.match(commands, /allowVerticalScrolling: isTrueBoolean\(args\?\.scroll\)/);
    assert.match(commands, /text: args\.skipButton, result: POPUP_RESULT\.NEGATIVE/);
    assert.match(popupCss, /\.popup-controls:has\(\.popup-button-skip\)\s*\{[^}]*flex-wrap: wrap/);
});

test('unchanged or skipped persona is never written, then downloader opens', () => {
    const message = firstOpenMessages[0];
    assert.match(message, /One last thing - do you want a persona\?/);
    assert.match(message, /Be aware that characters are able to view your persona details at all times/);
    assert.match(message, /We have provided a basic layout for your persona below/);
    assert.match(message, /\/setvar key=PersonaTemplate \{\{pipe\}\}/);
    assert.match(message, /\/input okButton="Set as Persona" skipButton=Skip scroll=on default=\{\{getvar::PersonaTemplate\}\}/);
    assert.match(message, /\/if left=\{\{getvar::PersonaDraft\}\} right=\{\{getvar::PersonaTemplate\}\} rule=neq/);
    assert.match(message, /\/if left=\{\{getvar::PersonaDraft\}\} right="" rule=neq/);
    assert.doesNotMatch(message, /onCancel="Not Yet"/);
    assert.ok(message.lastIndexOf('/dom action=click [id="wt-char-menu-btn"]') > message.lastIndexOf('key=PersonaDraft'));
});
