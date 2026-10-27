import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src`, import.meta.url));

const commitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash)
  },
  resolve: {
    alias: [
      { find: '@rds/kernel', replacement: pkg('kernel') },
      { find: '@rds/games', replacement: pkg('games') },
      { find: '@rds/app', replacement: pkg('app') },
      { find: '@rds/net', replacement: pkg('net') },
      { find: '@rds/web', replacement: fileURLToPath(new URL('./apps/web/src', import.meta.url)) },
      { find: '@rds/room-protocol', replacement: fileURLToPath(new URL('./packages/room-protocol/src/index.ts', import.meta.url)) }
    ]
  },
  // 相对路径：dist 会被挂在子路径（如 Hub 的 /games/rds-board-core/）下提供，
  // 默认的绝对 /assets/... 会打到宿主站点根路径而 404→HTML fallback
  base: './',
  server: {
    port: 3000,
    host: true,
    open: false,
    // Dev-time proxy to apps/server (8787)：让统一外壳在 vite dev 下也能探测到大厅。
    // 没有它，/healthz 命中 SPA fallback 的 200 HTML，shell 会退回本地单机模式。
    proxy: {
      '/healthz': 'http://localhost:8787',
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true }
    }
  },
  build: {
    target: 'esnext'
  }
});
