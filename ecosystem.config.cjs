module.exports = {
  apps: [
    {
      name: 'rds-board-core',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'apps/server/src/index.ts',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '8787',
        HUB_SECRET: process.env.HUB_SECRET || 'dev-secret-do-not-use-in-prod'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    }
  ]
};
