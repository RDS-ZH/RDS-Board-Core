/**
 * Screenshot generator.
 *
 * Screenshots are build artifacts, not source: `shots/` is git-ignored and this
 * script regenerates the whole set on demand.
 *
 *   pnpm shots              # all suites
 *   pnpm shots betrayal     # only suites whose name matches
 *
 * It boots Vite itself when nothing is listening on the configured port and
 * shuts it down on exit, so there is no "start the dev server first" step.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import process from 'node:process';
import { ensureSoloServer } from './lib/soloserver.mjs';

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

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`))));
  });
}

if (!existsSync('shots')) mkdirSync('shots');

let dev;

try {
  dev = await ensureSoloServer();

  for (const suite of selected) {
    console.log(`\n=== ${suite.name} · ${suite.what} ===`);
    await run(suite.script);
  }
  console.log('\nScreenshots written to shots/ (git-ignored).');
} catch (error) {
  console.error(`\nshots failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  dev?.stop();
}
