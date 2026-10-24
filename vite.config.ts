import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@rds/kernel', replacement: pkg('kernel') },
      { find: '@rds/games', replacement: pkg('games') },
      { find: '@rds/app', replacement: pkg('app') },
      { find: '@rds/net', replacement: pkg('net') },
      { find: '@rds/web', replacement: fileURLToPath(new URL('./apps/web/src', import.meta.url)) }
    ]
  },
  // 相对路径：dist 会被挂在子路径（如 Hub 的 /games/rds-board-core/）下提供，
  // 默认的绝对 /assets/... 会打到宿主站点根路径而 404→HTML fallback
  base: './',
  server: {
    port: 3000,
    host: true,
    open: false
  },
  build: {
    target: 'esnext'
  }
});
