import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PORTRAIT_MOODS, costumeTagOf, isReplyPlaceholder, moodTagOf, portraitSignature, saysNothingAboutCostume, speakerTagsOf } from '../../quick-reply-ext/src/portraitSignature.js';

// Reported 2026-11-11 (Loona, drunk start, on a phone): a reroll was cut off mid-sentence, then finished with
// Continue. Its footer read "[Nervousness] [O1] [10]" but the portrait showed Excitement in the Regular Outfit:
// the one look at the reply happened before the footer existed, and Continue keeps the same message id and swipe.

const source = await readFile(new URL('../../quick-reply-ext/index.js', import.meta.url), 'utf8');

const HEADER = '¦¦ Friday, Mar 17th ~ 11:52 PM ~ Shared Apartment (Unit 312) ~ ¦¦\n\n';
const cutOff = `${HEADER}*She shoves you back onto the couch, working her way through another slopp*`;
const finished = `${HEADER}*She shoves you back onto the couch.*\n\n"Th-this is just the booze talkin', okay?!"\n\n[Nervousness] [O1] [10]`;

test('a reply finished with Continue reads differently from the cut-off version', () => {
    assert.equal(moodTagOf(cutOff), '');
    assert.equal(costumeTagOf(cutOff), '');
    assert.equal(moodTagOf(finished), 'nervousness');
    assert.equal(costumeTagOf(finished), 'O1');
    assert.notEqual(portraitSignature(cutOff), portraitSignature(finished));
});

test('text changes that do not touch the portraits keep the signature', () => {
    const a = `${HEADER}*She grins.*\n\n[Joy] [RC]`;
    assert.equal(portraitSignature(a), portraitSignature(a.replace('grins', 'smirks')));
    // the trailing number is not a mood or a costume
    assert.equal(portraitSignature(a), portraitSignature(`${a} [6]`));
    assert.equal(costumeTagOf(`${a} [6]`), 'RC');
});

test('a changed mood, costume, side character or phone status changes the signature', () => {
    const base = `${HEADER}__Loona:__ "Hi."\n\n[Joy] [RC]`;
    const signature = portraitSignature(base);
    assert.notEqual(portraitSignature(base.replace('[Joy]', '[Anger]')), signature);
    assert.notEqual(portraitSignature(base.replace('[RC]', '[NK]')), signature);
    assert.notEqual(portraitSignature(base.replace('__Loona:__', '__Summer:__ "Hey."\n\n__Loona:__')), signature);
    assert.notEqual(portraitSignature(base.replace('"Hi."', '*Phone Status: 40%*')), signature);
});

test('the mood is the last known mood word in single brackets, any case', () => {
    assert.equal(moodTagOf('[Disgust]\n\ntext\n\n[SURPRISE] [RC]'), 'surprise');
    assert.equal(moodTagOf('text [P052] [Smug] [RC]'), '', 'unknown words are not moods');
    assert.equal(moodTagOf('[Mood: Anger] (Anger) [ Anger ]'), '', 'only the plain [Word] form counts');
    assert.equal(moodTagOf(''), '');
    assert.equal(moodTagOf(undefined), '');
});

test('speaker tags are read the way the side-character code reads them', () => {
    assert.deepEqual(speakerTagsOf('__Summer:__ "Hi."\n\n__Loona:__ "No."'), ['Summer', 'Loona']);
});

test('the mood list is the one Expressions() accepts', () => {
    const list = source.match(/const expressions = \[([\s\S]*?)\];/);
    assert.ok(list, 'Expressions() still declares its list');
    const inSource = [...list[1].matchAll(/"([a-z]+)"/g)].map(match => match[1]);
    assert.deepEqual([...PORTRAIT_MOODS].sort(), inSource.sort());
});

test('index.js looks at a reply again when its portrait signature changed', () => {
    // Continue: same message id and swipe, new footer
    assert.match(source, /\} else if \(portraitSignature\(charText\) !== lastPortraitSignature\) \{/);
    // every draw records what it drew from
    assert.match(source, /lastPortraitSignature = portraitSignature\(charText\);\r?\n\s+await Expressions\(charName, charMessage, true\);/);
    // edits and deletes
    assert.match(source, /eventSource\.on\(event_types\.MESSAGE_EDITED, OnReplyChanged\);/);
    assert.match(source, /eventSource\.on\(event_types\.MESSAGE_DELETED, OnReplyChanged\);/);
    // and never redraws when the last reply reads the same (that would re-roll the sprite variant on every edit)
    assert.match(source, /if \(portraitSignature\(charMessage\.mes\) === lastPortraitSignature\) return;/);
});

// [XX] is the clothing list's "ONLY IF NONE apply" code. Seen live 2026-11-11: Loona, wrapped in a towel after a
// shower, footer "[Surprise] [XX]", drawn in her regular crop top. Lucky: [XX] keeps the current costume.
test('[XX] and a missing costume tag both say nothing about the costume; other codes do', () => {
    assert.equal(saysNothingAboutCostume('text\n\n[Surprise] [XX] [7]'), true);
    assert.equal(saysNothingAboutCostume('text\n\n[Surprise] [xx]'), true);
    assert.equal(saysNothingAboutCostume('*She stops mid-sentence, working her way thr*'), true);
    assert.equal(saysNothingAboutCostume('text\n\n[Surprise]'), true);
    assert.equal(saysNothingAboutCostume('text\n\n[Surprise] [RC] [7]'), false);
    assert.equal(saysNothingAboutCostume('text\n\n[Surprise] [NK]'), false);
    assert.equal(saysNothingAboutCostume('text\n\n[Surprise] [O1]'), false);
    assert.equal(saysNothingAboutCostume('text\n\n[Surprise] [O9]'), false, 'an unknown code is still the regular outfit');
});

test('a reply with no costume tag keeps the costume that is showing', () => {
    assert.match(source, /const keepsCostume = saysNothingAboutCostume\(charMessage\.mes\) && getLocalVariable\("CostmSave"\)\.startsWith\(`\$\{charName\}\/`\);/);
    assert.match(source, /if \(costume && !keepsCostume && getLocalVariable\("CostmSave"\) !== charCostume/);
});

// Measured 2026-11-11 with real Sonnet 5 replies, streaming on: a reroll fires MESSAGE_RECEIVED twice for the same
// message number and swipe number, first with the placeholder "..." and then with the finished reply. Reading the
// placeholder made the finished reply look already handled, so a streamed reroll kept the previous swipe's face
// (Lucky's Loona: "[Nervousness] [O1]" under an Excitement, Regular Outfit portrait). Without streaming there is
// only the one event, which is why it never showed there.
test('the "..." a streamed reroll announces first is recognised as a placeholder', () => {
    assert.equal(isReplyPlaceholder('...'), true);
    assert.equal(isReplyPlaceholder(' ...\n'), true);
    assert.equal(isReplyPlaceholder('\u2026'), true);
    assert.equal(isReplyPlaceholder(''), true);
    assert.equal(isReplyPlaceholder(undefined), true);
    assert.equal(isReplyPlaceholder('"..."'), false);
    assert.equal(isReplyPlaceholder('*She says nothing.* ...'), false);
    assert.equal(isReplyPlaceholder('[Joy] [RC]'), false);
});

test('OnAi skips the placeholder before it can mark the reply as handled', () => {
    const skip = source.indexOf('if (isReplyPlaceholder(charText)) return;');
    const key = source.indexOf('const currentMessID = ');
    assert.ok(skip > 0 && key > 0);
    assert.ok(skip < key, 'the placeholder check comes before lastMessID is compared or written');
});

// Also measured that day: Continue on a reply that was already complete. The model appended a whole second reply
// ("[Sadness]"), OnAi drew from it, and a later listener cut the reply back to the original ("[Caring]").
test('the reply is compared once more after every MESSAGE_RECEIVED listener has run', () => {
    assert.match(source, /recheckAfterRender = messageID;/);
    assert.match(source, /eventSource\.on\(event_types\.CHARACTER_MESSAGE_RENDERED, OnReplyRendered\);/);
    // only for the message OnAi just handled: the event also fires for every message while a chat loads
    assert.match(source, /async function OnReplyRendered\(messageID\) \{\r?\n\s+if \(messageID !== recheckAfterRender\) return;\r?\n\s+recheckAfterRender = -1;/);
});
