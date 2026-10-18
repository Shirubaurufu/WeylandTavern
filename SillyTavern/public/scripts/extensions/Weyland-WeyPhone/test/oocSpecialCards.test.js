import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOocToCardSlots, buildOocPostHistory, buildOocSystemPrompt, OOC_CARD_SLOTS } from '../../quick-reply-ext/src/oocMode.js';

// A chat-local variable store like quick-reply-ext's get/setLocalVariable.
function store(initial = {}) {
    const values = new Map(Object.entries(initial));
    return { values, vars: { get: name => values.get(name) ?? '', set: (name, value) => values.set(name, value) } };
}
const OOC = { system: buildOocSystemPrompt('[CRITICAL - NARRATOR - LAUREN]'), post: buildOocPostHistory('[CRITICAL - NARRATOR - LAUREN]') };

test('OOC text opens with the marker the stash logic recognises', () => {
    assert.ok(OOC.system.startsWith('[OOC MODE'));
    assert.ok(OOC.post.startsWith('[OOC MODE'));
});

test('other cards are left alone', () => {
    const { values, vars } = store({ ravteg: 'x' });
    assert.equal(applyOocToCardSlots('Rosa', true, vars, OOC), false);
    assert.equal(values.get('ravteg'), 'x');
});

test('Kinsbane Manor: its own variables are replaced, nothing needs stashing', () => {
    const { values, vars } = store({ ravtegKinsB: 'KINS SHEET', postravKinsB: 'KINS NOTE' });
    assert.equal(applyOocToCardSlots('Kinsbane Manor', true, vars, OOC), true);
    assert.equal(values.get('ravtegKinsB'), OOC.system);
    assert.equal(values.get('postravKinsB'), OOC.post);
    assert.equal(values.get('OocCardStash') ?? '', '', 'the 64k prompt is not copied into the chat file');
    // XXX re-runs SpecialChar before this, which restores the originals; with OOC off nothing is left to undo.
    values.set('ravtegKinsB', 'KINS SHEET');
    values.set('postravKinsB', 'KINS NOTE');
    applyOocToCardSlots('Kinsbane Manor', false, vars);
    assert.equal(values.get('ravtegKinsB'), 'KINS SHEET');
    assert.equal(values.get('postravKinsB'), 'KINS NOTE');
});

test('Mirror Weyland: the chat\'s own prompt survives an OOC round trip, even across a narrator change', () => {
    const { values, vars } = store({ Mi33var: 'MIRROR SYSTEM {{getglobalvar::MHR}}', Mi33rav: 'MIRROR POST' });
    applyOocToCardSlots('Mirror Weyland', true, vars, OOC);
    assert.equal(values.get('Mi33var'), OOC.system);
    assert.equal(values.get('Mi33rav'), OOC.post);
    // Another XXX while OOC is on (different narrator): our own text must not be stashed as the original.
    const other = { system: buildOocSystemPrompt('[CRITICAL - NARRATOR - SALEM]'), post: buildOocPostHistory('[CRITICAL - NARRATOR - SALEM]') };
    applyOocToCardSlots('Mirror Weyland', true, vars, other);
    assert.equal(values.get('Mi33var'), other.system);
    applyOocToCardSlots('Mirror Weyland', false, vars);
    assert.equal(values.get('Mi33var'), 'MIRROR SYSTEM {{getglobalvar::MHR}}');
    assert.equal(values.get('Mi33rav'), 'MIRROR POST');
    assert.equal(values.get('OocCardStash'), '');
    // Turning it off again changes nothing.
    applyOocToCardSlots('Mirror Weyland', false, vars);
    assert.equal(values.get('Mi33var'), 'MIRROR SYSTEM {{getglobalvar::MHR}}');
});

test('Mirror Weyland: a prompt written AFTER OOC went on (new chat setup) is what comes back', () => {
    const { values, vars } = store();
    applyOocToCardSlots('Mirror Weyland', true, vars, OOC);
    values.set('Mi33var', 'REAL SYSTEM'); // the Mirror quick reply finished setting the chat up
    values.set('Mi33rav', 'REAL POST');
    applyOocToCardSlots('Mirror Weyland', true, vars, OOC);
    assert.equal(values.get('Mi33var'), OOC.system);
    applyOocToCardSlots('Mirror Weyland', false, vars);
    assert.equal(values.get('Mi33var'), 'REAL SYSTEM');
    assert.equal(values.get('Mi33rav'), 'REAL POST');
});

test('Mirror Weyland: if there was never an original, OOC text is cleared on the way out', () => {
    const { values, vars } = store();
    applyOocToCardSlots('Mirror Weyland', true, vars, OOC);
    applyOocToCardSlots('Mirror Weyland', false, vars);
    assert.equal(values.get('Mi33var'), '');
    assert.equal(values.get('Mi33rav'), '');
});

test('Muse: Mu3ePost (her start-context post-history) is blanked in OOC and restored after', () => {
    const { values, vars } = store({ ravtegMu3e: 'MUSE SHEET', PostMuse: 'MUSE NOTE', Mu3ePost: 'DAY 3 DIRECTIONS' });
    applyOocToCardSlots('Muse', true, vars, OOC);
    assert.equal(values.get('ravtegMu3e'), OOC.system);
    assert.equal(values.get('PostMuse'), OOC.post);
    assert.equal(values.get('Mu3ePost'), '');
    values.set('ravtegMu3e', 'MUSE SHEET'); // SpecialChar rewrites these on every XXX
    values.set('PostMuse', 'MUSE NOTE');
    applyOocToCardSlots('Muse', false, vars);
    assert.equal(values.get('Mu3ePost'), 'DAY 3 DIRECTIONS');
    assert.equal(values.get('ravtegMu3e'), 'MUSE SHEET');
});

test('the slot table matches what the three cards actually carry', async () => {
    const { readFileSync } = await import('node:fs');
    const root = new URL('../../../../../data/default-user/characters/', import.meta.url);
    for (const [card, slots] of Object.entries(OOC_CARD_SLOTS)) {
        const png = readFileSync(new URL(`${card}.png`, root));
        let p = 8, text = null;
        while (p < png.length) {
            const len = png.readUInt32BE(p);
            if (png.toString('latin1', p + 4, p + 8) === 'tEXt') {
                const d = png.subarray(p + 8, p + 8 + len); const z = d.indexOf(0);
                if (d.toString('latin1', 0, z) === 'ccv3') text = d.subarray(z + 1).toString('latin1');
            }
            p += 12 + len;
        }
        const data = JSON.parse(Buffer.from(text, 'base64').toString('utf8')).data;
        assert.ok(data.system_prompt.includes(`{{getvar::${slots.system}}}`), `${card} system prompt`);
        assert.ok(data.post_history_instructions.includes(`{{getvar::${slots.post}}}`), `${card} post-history`);
        for (const name of slots.blank) assert.ok(data.post_history_instructions.includes(`{{getvar::${name}}}`), `${card} ${name}`);
    }
});
