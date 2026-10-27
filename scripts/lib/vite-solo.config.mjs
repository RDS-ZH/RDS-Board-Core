import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * Solo-mode Vite config for layout/probe scripts.
 *
 * The repo config proxies `/healthz`, `/api` and `/ws` to the Hub server so the
 * unified shell can detect the lobby in dev. That makes every probe's result
 * depend on whether a Hub happens to be running: with it up the shell shows the
 * lobby and the game DOM never mounts, which silently turns geometry assertions
 * into no-ops.
 *
 * This config drops the proxy, so `hubAlive()` fails and the shell boots
 * straight into single-machine mode — the same view a probe wants to measure.
 */

const root = fileURLToPath(new URL('../../', import.meta.url));
const pkg = name => `${root}packages/${name}/src`;

export default defineConfig({
  root,
  resolve: {
    alias: [
      { find: '@rds/kernel', replacement: pkg('kernel') },
      { find: '@rds/games', replacement: pkg('games') },
      { find: '@rds/app', replacement: pkg('app') },
      { find: '@rds/net', replacement: pkg('net') },
      { find: '@rds/web', replacement: `${root}apps/web/src` },
      { find: '@rds/room-protocol', replacement: `${root}packages/room-protocol/src/index.ts` }
    ]
  },
  base: './',
  server: { port: 5180, host: '127.0.0.1', open: false, strictPort: true },
  build: { target: 'esnext' }
});
