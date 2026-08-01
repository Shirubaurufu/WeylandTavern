import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const quickReplies = JSON.parse(readFileSync(
    new URL('../../../../../data/default-user/QuickReplies/Weyland.json', import.meta.url),
    'utf8',
));

test('Weybot keeps the user-authored opening scenario as message 1 if generation fails', () => {
    const start = quickReplies.qrList.find(reply => reply.label === 'WeybotStart');
    assert.ok(start, 'WeybotStart quick reply must exist');
    assert.match(start.message, /\/setvar key=WeybotGreeted true\s*\|\s*\/send OOC:/);
    assert.doesNotMatch(start.message, /\/send name="Creating Opening Scenario\.\.\."/);
    assert.match(start.message, /Starting Location and Modifiers: \{\{getvar::StartingLocation\}\}/);
    assert.match(start.message, /\/gen name=Weybot/);
    assert.doesNotMatch(start.message, /\/delay 10000[\s\S]*?\/del 1/);
    assert.doesNotMatch(start.message, /\/message-edit message=0/);
});

test('Weybot does not render an incomplete generation or auto-start a second opening', () => {
    const start = quickReplies.qrList.find(reply => reply.label === 'WeybotStart');
    const markedComplete = start.message.indexOf('/setvar key=WeybotGreeted true');
    const sentSetup = start.message.indexOf('/send OOC:');
    const generation = start.message.indexOf('/gen name=Weybot');
    assert.ok(markedComplete >= 0 && markedComplete < sentSetup && sentSetup < generation);
    assert.match(start.message, /\/setvar key=WeybotOpening \{\{pipe\}\}/);
    assert.match(start.message, /\/match pattern=.*\{\{getvar::WeybotOpening\}\}/);
    assert.match(start.message, /\/if left=\{\{pipe\}\} right="" rule=neq/);
    assert.match(start.message, /opening generation stopped before returning a complete scene/i);
    assert.match(start.message, /Use Regenerate or swipe this message to retry/i);
    assert.match(start.message, /\/sendas name=Weybot \{\{getvar::WeybotOpening\}\}/);
});

test('Weybot opening validation accepts a complete scene and rejects leaked analysis-only output', () => {
    const start = quickReplies.qrList.find(reply => reply.label === 'WeybotStart');
    const command = start.message.split('\n').find(line => line.startsWith('/match pattern='));
    assert.ok(command, 'opening completion test command must exist');
    const literal = command.match(/pattern="(\/.*\/[a-z]*)"/i)?.[1];
    assert.ok(literal, 'opening completion regex must be readable');
    const lastSlash = literal.lastIndexOf('/');
    const completeOpening = new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1));

    assert.equal(completeOpening.test(
        'SPARK [1/6]\nprep\n¦¦ Saturday, May 6th ~ 10:05 AM ~ Sterling Commons ~ ¦¦\n\n*Scene.*\n\n[Curiosity] [RC]',
    ), true);
    assert.equal(completeOpening.test(
        'SPARK [1/6]\nprep\nBOARD [2/6]\nmore prep\nICEBERG [3/6]\ntruncated before the roleplay',
    ), false);
});
