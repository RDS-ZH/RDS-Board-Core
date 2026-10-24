import { defineConfig } from 'vite';

export default defineConfig({
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
