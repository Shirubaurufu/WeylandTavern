// The home screen's "Unlock Platinum" box (2026-11-18, Discord: Leroy, gifted Platinum while on Plus).
// The box only shows once Plus is verified, and PP_VERIFY_COMMAND used to start with "skip everything if PP1 is true",
// so every real Platinum key there came back "Incorrect Paw Patrol Key". The guard must check PPP1 (Platinum) instead:
// a Plus player can still upgrade, and a Platinum player skips the check as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/scripts/welcomeinfo.js', import.meta.url), 'utf8');
const line = source.split(/\r?\n/).find(l => l.startsWith('const PP_VERIFY_COMMAND = '));

test('the key check is skipped only when Platinum is already on, never because Plus is', () => {
    assert.ok(line, 'PP_VERIFY_COMMAND is in welcomeinfo.js');
    assert.match(line, /^const PP_VERIFY_COMMAND = '\/if left=\{\{getglobalvar::PPP1\}\} right=true rule=neq \{:/);
    assert.doesNotMatch(line, /^const PP_VERIFY_COMMAND = '\/if left=\{\{getglobalvar::PP1\}\}/);
});

test('both monthly keys are still compared, and the Platinum one sets both tiers', () => {
    // A7b~3C9$Dq is the Plus key (its closure, last on the line, sets PP1 only); 9$DqA7b~3C is the Platinum key (the
    // closure nested in A7b's else sets PP1 and PPP1). Checked on :8000 with test values on 2026-11-18.
    assert.match(line, /right=\{\{getglobalvar::A7b~3C9\$Dq\}\} rule=eq else=/);
    assert.match(line, /right=\{\{getglobalvar::9\$DqA7b~3C\}\} rule=eq else=/);
    assert.match(line, /\{:\/setglobalvar key=PP1 true \| \/setglobalvar key=PPP1 true \| ' \+ SIDE_CHARACTER_RESTORE \+ ' \| \/:Weyland\.NewEntries :\} :\} \{:\/setglobalvar key=PP1 true \| ' \+ SIDE_CHARACTER_RESTORE/);
});
