#!/usr/bin/env node
'use strict';

/*
 * Weyland Tavern Repair - V6.0 (Node port of the V5 batch script)
 * by Kressa, Lucky Paw, Shiru & FFFox
 *
 * Why Node instead of batch:
 *  - cmd reads .bat files by byte offset WHILE they run, so the old script
 *    had to copy itself to %TEMP% and relaunch before git reset could
 *    replace it. That self-copy pattern is a classic AV heuristic trigger
 *    (Gen:Heur.Bat.*). Node loads this whole file into memory at startup,
 *    so git can freely replace it on disk mid-run - no relaunch trick needed.
 *  - Node writes to the Windows console via WriteConsoleW, so the Unicode
 *    header renders correctly on CJK codepages too - no chcp detection or
 *    plain-ASCII fallback required.
 *
 * Requires Node 18+ (global fetch). The installer ships Node 24.
 * Zero dependencies - runs before/without npm install.
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const WTDirectory = path.join(__dirname, "..");
const STDirectory = path.join(WTDirectory, "SillyTavern");

// Anchor everything to the folder this script lives in, never the process
// CWD (launched "as administrator", Windows defaults CWD to System32).
process.chdir(WTDirectory);

const tty = process.stdout.isTTY;
const esc = (code) => (tty ? `\x1b[${code}m` : '');

// Weyland palette (matches the Weyland-Router extension theme)
const R = esc('0');
const WINE = esc('38;2;180;38;58');
const PINK = esc('38;2;224;68;92');
const ROSE = esc('38;2;255;150;165');
const DIM = esc('38;2;125;125;125');
const GRY = esc('38;2;190;190;190');
const GRN = esc('38;2;97;191;124');
const AMB = esc('38;2;230;180;80');
const BLD = esc('1');

const log = console.log;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, def) {
  return new Promise((resolve) => {
    let settled = false;
    rl.question(question, (answer) => {
      settled = true;
      resolve((answer || '').trim() || def);
    });
    // stdin closing (piped input ran dry) should not hang the script
    rl.once('close', () => { if (!settled) resolve(def); });
  });
}

async function yesNo(prompt, def) {
  const answer = await ask(`  ${PINK}›${R} ${prompt} (Y/N) [Default: ${def}] `, def);
  return answer.toUpperCase() === 'Y';
}

async function waitEnter(msg) {
  await ask(`  ${DIM}${msg || 'Press Enter to close...'}${R}`, '');
}

async function fail(exitCode) {
  await waitEnter();
  rl.close();
  process.exit(exitCode);
}

// --- child-process helpers -------------------------------------------------

function git(...args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return r.stdout.trim();
}

function gitStatusToConsole() {
  spawnSync('git', ['status'], { stdio: 'inherit' });
}

function findPidOnPort(port) {
  if (process.platform === 'win32') {
    const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
    if (r.error || r.status !== 0) return null;
    for (const line of r.stdout.split('\n')) {
      if (line.includes('LISTENING') && new RegExp(`:${port}\\s`).test(line)) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (/^\d+$/.test(pid)) return pid;
      }
    }
    return null;
  }
  const r = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return r.stdout.trim().split('\n')[0] || null;
}

function killPid(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
  } else {
    try { process.kill(Number(pid), 'SIGKILL'); } catch {}
  }
}

// --- header ------------------------------------------------------------------

const BOX_INNER = 57; // interior width of the framed info box

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function boxLine(text) {
  const pad = ' '.repeat(Math.max(0, BOX_INNER - stripAnsi(text).length));
  return `  ${WINE}│${R} ${text}${pad}${WINE}│${R}`;
}

function printHeader() {
  if (tty) process.stdout.write('\x1b]0;Weyland Tavern Repair\x07'); // console title
  if (tty) process.stdout.write('\x1b[2J\x1b[H'); // cls
  log('');
  log(`  ${WINE}██╗    ██╗███████╗██╗   ██╗██╗      █████╗ ███╗   ██╗██████╗${R}`);
  log(`  ${WINE}██║    ██║██╔════╝╚██╗ ██╔╝██║     ██╔══██╗████╗  ██║██╔══██╗${R}`);
  log(`  ${PINK}██║ █╗ ██║█████╗   ╚████╔╝ ██║     ███████║██╔██╗ ██║██║  ██║${R}`);
  log(`  ${PINK}██║███╗██║██╔══╝    ╚██╔╝  ██║     ██╔══██║██║╚██╗██║██║  ██║${R}`);
  log(`  ${ROSE}╚███╔███╔╝███████╗   ██║   ███████╗██║  ██║██║ ╚████║██████╔╝${R}`);
  log(`  ${ROSE} ╚══╝╚══╝ ╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝${R}`);
  log('');
  const dash = '─'.repeat(22);
  log(`  ${DIM}${dash}${R}  ${BLD}${PINK}R E P A I R${R}  ${DIM}${dash}${R}`);
  log(`            ${DIM}V6.0 - by Kressa, Lucky Paw, Shiru & FFFox${R}`);
  log('');
  const top = `  ${WINE}┌${'─'.repeat(BOX_INNER + 1)}┐${R}`;
  const bottom = `  ${WINE}└${'─'.repeat(BOX_INNER + 1)}┘${R}`;
  log(top);
  log(boxLine(` ${AMB}●${R}  ${GRY}This tool rebuilds a broken Weyland Tavern install${R}`));
  log(boxLine(`    ${GRY}after a wonky update.${R}`));
  log(boxLine(''));
  log(boxLine(` ${GRN}●${R}  ${GRY}KEEPS: chats, personas, characters, lorebooks,${R}`));
  log(boxLine(`    ${GRY}settings, themes and backgrounds.${R}`));
  log(boxLine(''));
  log(boxLine(` ${PINK}●${R}  ${GRY}RESETS: all app files back to the latest official${R}`));
  log(boxLine(`    ${GRY}version, and reinstalls dependencies from scratch.${R}`));
  log(bottom);
  log('');
}

function printDivider() {
  log('');
  log(`  ${DIM}${'─'.repeat(61)}${R}`);
  log('');
}

// --- optional character re-download -----------------------------------------

const BASE = 'http://127.0.0.1:8000';

async function serverReady() {
  try {
    const response = await fetch(`${BASE}/csrf-token`, {
      signal: AbortSignal.timeout(1000),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return typeof data.token === "string" && data.token.length > 0;
  } catch {
    return false;
  }
}

async function redownloadCharacters() {
  try {
    const tokenRes = await fetch(`${BASE}/csrf-token`, { signal: AbortSignal.timeout(30000) });
    const rawCookies = tokenRes.headers.getSetCookie
      ? tokenRes.headers.getSetCookie()
      : (tokenRes.headers.get('set-cookie') ? [tokenRes.headers.get('set-cookie')] : []);
    const cookie = rawCookies.map((c) => c.split(';')[0]).join('; ');
    const token = (await tokenRes.json()).token;
    const headers = { 'X-Csrf-Token': token, 'X-User-Handle': 'default-user', ...(cookie ? { Cookie: cookie } : {}) };

    const manifestRes = await fetch(`${BASE}/api/weyland/fetch-manifests`, {
      headers: { ...headers, 'X-Rebuild-Manifest': '1' },
      signal: AbortSignal.timeout(300000),
    });
    const manifests = await manifestRes.json();
    const names = ((manifests.localManifest || {}).characters || [])
      .filter((ch) => ch.version)
      .map((ch) => ch.name);

    if (names.length === 0) {
      log('   No downloaded characters found - nothing to re-download.');
      return 3;
    }
    log(`   Found ${names.length} installed characters. Downloading fresh copies...`);

    const dlRes = await fetch(`${BASE}/api/weyland/download`, {
      method: 'POST',
      headers: { ...headers, 'X-Redownload': 'true', 'Content-Type': 'application/json' },
      body: JSON.stringify({ characters: names }),
      signal: AbortSignal.timeout(7200000),
    });
    const result = await dlRes.json();
    return result.success ? 0 : 4;
  } catch (err) {
    log(`   Character re-download failed: ${err.message}`);
    return 5;
  }
}

// --- main --------------------------------------------------------------------

async function main() {
  printHeader();

  // Verify git is available at all
  if (spawnSync('git', ['--version'], { stdio: 'ignore' }).error) {
    log(`  ${WINE}x${R}  ${WINE}Git is not installed - the repair tool needs it.${R}`);
    log(`     ${DIM}Please run the Weyland Tavern installer first.${R}`);
    log('');
    return fail(1);
  }

  // Verify we're in a git repo
  if (git('rev-parse', '--git-dir') === null) {
    log(`  ${WINE}x${R}  ${WINE}This doesn't appear to be the Weyland Tavern folder.${R}`);
    log(`     ${DIM}Place this script next to your launcher (beside the${R}`);
    log(`     ${DIM}SillyTavern folder) and run it again.${R}`);
    log('');
    return fail(1);
  }

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD') || 'release';
  log(`  ${DIM}›${R}  ${GRY}Detected branch:${R} ${PINK}${branch}${R}`);
  log('');

  if (!(await yesNo('Start the repair?', 'Y'))) return exitNoChanges();

  // --- Optional safety backup of user data ---
  log('');
  log(`  ${GRY}Before repairing, a backup copy of your personal data can be${R}`);
  log(`  ${GRY}saved next to this script. Recommended, but it can take a few${R}`);
  log(`  ${GRY}minutes and some disk space if you have a lot of chats.${R}`);
  log('');
  if (await yesNo('Back up personal data first?', 'Y')) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const backupDir = path.join(__dirname, `WT-DataBackup-${stamp}`);
    log('');
    log(`  ${DIM}›${R}  ${GRY}Backing up SillyTavern${path.sep}data to:${R}`);
    log(`     ${PINK}${backupDir}${R}`);
    let backupOk = true;
    try {
      fs.cpSync(path.join(STDirectory, 'data'), backupDir, { recursive: true });
    } catch {
      backupOk = false;
    }
    if (backupOk) {
      log(`  ${GRN}+${R}  ${GRY}Backup complete.${R}`);
    } else {
      log(`  ${AMB}!${R}  ${AMB}The backup did not complete cleanly.${R}`);
      log('');
      if (!(await yesNo('Continue the repair anyway?', 'N'))) return exitNoChanges();
    }
  }

  printDivider();

  // --- Stop any running server so files aren't locked ---
  const runningPid = findPidOnPort(8000);
  if (runningPid) {
    log(`  ${DIM}›${R}  ${GRY}Closing the running Weyland Tavern server...${R}`);
    killPid(runningPid);
    await sleep(2000);
  }

  // --- Clear any stuck merge state ---
  log(`  ${DIM}[1/4]${R}  ${GRY}Clearing any stuck update state...${R}`);
  git('merge', '--abort');
  const conflicted = git('diff', '--name-only', '--diff-filter=U');
  if (conflicted) {
    for (const file of conflicted.split('\n').filter(Boolean)) {
      git('checkout', '--theirs', file);
      git('add', file);
    }
  }

  // --- Force-reset all app files to the official version ---
  // Node loaded this script into memory at startup, so git replacing
  // Repair-WeylandTavern.js on disk right here is completely safe.
  log(`  ${DIM}[2/4]${R}  ${GRY}Downloading the latest official version...${R}`);
  git('fetch');
  if (git('reset', '--hard', `origin/${branch}`) === null) {
    log(`  ${WINE}x${R}  ${WINE}Reset failed. Please contact support with this output:${R}`);
    log('');
    gitStatusToConsole();
    log('');
    return fail(1);
  }
  log(`  ${GRN}+${R}  ${GRY}App files restored to the official version.${R}`);

  // --- Rebuild dependencies from scratch ---
  log(`  ${DIM}[3/4]${R}  ${GRY}Removing old dependencies...${R}`);
  try {
    fs.rmSync(path.join(STDirectory, 'node_modules'), { recursive: true, force: true });
  } catch {}

  log(`  ${DIM}[4/4]${R}  ${GRY}Reinstalling dependencies from scratch...${R} ${DIM}(this can take a few minutes)${R}`);
  const npmResult = spawnSync('npm install --no-audit --no-fund --loglevel=error --no-progress --omit=dev', {
    cwd: STDirectory,
    shell: true,
    stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  let depsOk = !npmResult.error && npmResult.status === 0;
  if (depsOk) {
    log(`  ${GRN}+${R}  ${GRY}Dependencies reinstalled.${R}`);
  } else {
    log(`  ${AMB}!${R}  ${GRY}Dependency install reported a problem.${R}`);
    log(`     ${DIM}The launcher will retry automatically on next start.${R}`);
  }

  // --- Optional: force re-download all installed characters ---
  if (depsOk) {
    log('');
    log(`  ${GRY}Optional: all installed characters can also be re-downloaded${R}`);
    log(`  ${GRY}fresh from the character server - this fixes characters whose${R}`);
    log(`  ${GRY}updates went wrong. Chats and personal data stay untouched.${R}`);
    log(`  ${DIM}This can take a while if you have many characters installed.${R}`);
    log('');
    if (await yesNo('Re-download all installed characters too?', 'N')) {
      log('');
      log(`  ${DIM}›${R}  ${GRY}Starting a temporary local server for the re-download...${R}`);
      // --browserLaunchEnabled false: the shipped config opens a browser on startup, which popped a
      // tab to this throwaway server mid-repair (and that tab dies when we kill the server below).
      const server = spawn(process.execPath, ['server.js', '--listen', 'false', '--port', '8000', '--browserLaunchEnabled', 'false'], {
        cwd: STDirectory,
        stdio: 'ignore',
      });

      let up = false;
      for (let tick = 0; tick < 300 && !up; tick++) {
        up = await serverReady();
        if (!up) {
          await sleep(2000);
        }
      }

      if (!up) {
        log(`  ${AMB}!${R}  ${GRY}The temporary server did not come online - skipping the${R}`);
        log(`     ${GRY}character re-download. You can retry from the Character${R}`);
        log(`     ${GRY}Downloader inside Weyland Tavern instead.${R}`);
      } else {
        log(`  ${DIM}›${R}  ${GRY}Re-downloading characters...${R} ${DIM}(progress prints below)${R}`);
        const code = await redownloadCharacters();
        if (code === 0) log(`  ${GRN}+${R}  ${GRY}All installed characters re-downloaded fresh.${R}`);
        else if (code === 3) log(`  ${DIM}›${R}  ${GRY}No downloaded characters were found to refresh.${R}`);
        else {
          log(`  ${AMB}!${R}  ${GRY}The character re-download hit a problem - you can retry from${R}`);
          log(`     ${GRY}the Character Downloader inside Weyland Tavern.${R}`);
        }
      }

      // We spawned the server ourselves, so shut down our own child directly
      killPid(server.pid);
      const leftover = findPidOnPort(8000);
      if (leftover) killPid(leftover);
      await sleep(1000);
    }
  }

  // --- Verify ---
  log('');
  log(`  ${DIM}›${R}  ${GRY}Verifying...${R}`);

  const stillBroken = git('diff', '--name-only', '--diff-filter=U');
  const stillAhead = git('rev-list', '--count', `origin/${branch}..HEAD`) || '0';
  if (stillBroken || stillAhead !== '0') {
    log(`  ${WINE}x${R}  ${WINE}Something is still off. Please contact support with this output:${R}`);
    log('');
    gitStatusToConsole();
    log('');
    return fail(1);
  }

  const nowVersion = git('rev-parse', '--short', 'HEAD') || 'unknown';

  log('');
  const top = `  ${WINE}┌${'─'.repeat(BOX_INNER + 1)}┐${R}`;
  const bottom = `  ${WINE}└${'─'.repeat(BOX_INNER + 1)}┘${R}`;
  log(top);
  log(boxLine(''));
  log(boxLine(`     ${GRN}●${R}  ${BLD}${GRY}REPAIR COMPLETE${R}`));
  log(boxLine(`        ${DIM}Your chats and personal data are untouched.${R}`));
  log(boxLine(''));
  log(bottom);
  log('');
  log(`  ${GRN}+${R}  ${GRY}Now on official version${R} ${PINK}${nowVersion}${R}`);
  log(`  ${DIM}›${R}  ${GRY}You can start Weyland Tavern with your normal launcher~${R}`);
  log('');
  await waitEnter();
  rl.close();
  process.exit(0);
}

async function exitNoChanges() {
  log('');
  log(`  ${DIM}›${R}  ${GRY}No changes made. Exiting... see you soon~${R}`);
  await waitEnter();
  rl.close();
  process.exit(0);
}

main().catch(async (err) => {
  log('');
  log(`  ${WINE}x${R}  ${WINE}The repair hit an unexpected error:${R}`);
  log(`     ${DIM}${err.message}${R}`);
  log('');
  await waitEnter();
  rl.close();
  process.exit(1);
});
