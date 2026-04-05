// PM2 defaults `cwd` to the directory `pm2 start` is invoked from,
// so running `pm2 start ecosystem.config.js` from the repo root just works.
module.exports = {
  apps: [
    {
      name: 'sentinel',
      script: 'node_modules/.bin/next',
      args: 'start -p 3201',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'sentinel-capture',
      script: 'node_modules/.bin/tsx',
      args: 'services/capture/index.ts',
      env: {
        NODE_ENV: 'production',
        SENTINEL_BASE_URL: 'http://localhost:3201',
      },
      // Give the Next.js app time to boot before we hammer its endpoints.
      restart_delay: 5000,
    }
  ]
};
