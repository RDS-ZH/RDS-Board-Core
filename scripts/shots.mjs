/**
 * Screenshot generator.
 *
 * Screenshots are build artifacts, not source: `shots/` is git-ignored and this
 * script regenerates the whole set on demand.
 *
 *   pnpm shots              # all suites
 *   pnpm shots betrayal     # only suites whose name matches
 *
 * It boots Vite itself when nothing is listening on 5173, and shuts it down on
 * exit, so there is no "start the dev server first" step.
 */
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { existsSync, mkdirSync } from 'node:fs';
import process from 'node:process';

const PORT = 5173;
const HOST = '127.0.0.1';
const filter = process.argv[2];

const SUITES = [
  { name: 'core', script: 'scripts/shoot.mjs', what: '内核检查器与五款夹具' },
  { name: 'betrayal', script: 'scripts/shoot-betrayal.mjs', what: '山屋流程（探索/交易/作祟）' },
  { name: 'rooms', script: 'scripts/shoot-rooms.mjs', what: '房间 2.5D 特写' },
  { name: 'card', script: 'scripts/shoot-card.mjs', what: '卡牌详情浮层' }
];

const selected = filter ? SUITES.filter(s => s.name.includes(filter)) : SUITES;
if (selected.length === 0) {
  console.error(`No suite matches "${filter}". Available: ${SUITES.map(s => s.name).join(', ')}`);
  process.exit(1);
}

/** Resolve once something accepts TCP connections on the dev port. */
function waitForPort(timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = connect({ port: PORT, host: HOST });
      socket.setTimeout(1200);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        retry();
      });
      socket.once('error', () => {
        socket.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error(`dev server did not listen on ${HOST}:${PORT}`));
      else setTimeout(attempt, 400);
    };
    attempt();
  });
}

function portInUse() {
  return new Promise(resolve => {
    const socket = connect({ port: PORT, host: HOST });
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`))));
  });
}

if (!existsSync('shots')) mkdirSync('shots');

let server;
let startedServer = false;

try {
  if (await portInUse()) {
    console.log(`· reusing the dev server already listening on ${HOST}:${PORT}`);
  } else {
    console.log('· starting vite …');
    server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort', '--host', HOST],
      { stdio: 'inherit' }
    );
    startedServer = true;
    await waitForPort();
    // Vite reports ready slightly before the first transform; give it a beat.
    await new Promise(r => setTimeout(r, 1200));
  }

  for (const suite of selected) {
    console.log(`\n=== ${suite.name} · ${suite.what} ===`);
    await run(suite.script);
  }
  console.log('\nScreenshots written to shots/ (git-ignored).');
} catch (error) {
  console.error(`\nshots failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (startedServer && server) {
    server.kill();
    // Vite spawns a worker on Windows; make sure the tree goes away.
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    }
  }
}
