/**
 * Single verification entrypoint.
 *
 * Replaces the old mix of ad-hoc flow/probe scripts for CI-style checks:
 *   node scripts/test-all.mjs           # kernel + fixture matrix + types + build
 *   node scripts/test-all.mjs --ui      # additionally boots every game screen
 */

import { spawnSync } from 'node:child_process';

const steps = [
  ['kernel suite', [process.execPath, 'scripts/test-core.mjs']],
  ['fixture matrix', [process.execPath, 'scripts/test-matrix.mjs']],
  ['typecheck', [process.execPath, 'node_modules/typescript/bin/tsc', '--noEmit']],
  ['production build', [process.execPath, 'node_modules/vite/bin/vite.js', 'build']]
];

if (process.argv.includes('--ui')) {
  steps.push(['UI matrix', [process.execPath, 'scripts/test-ui-matrix.mjs']]);
}

for (const [label, command] of steps) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    console.error(`\n${label} failed with exit code ${result.status ?? 'unknown'}`);
    process.exit(result.status ?? 1);
  }
}
console.log('\nAll verification steps passed.');
