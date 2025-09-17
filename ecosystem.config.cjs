module.exports = {
  apps: [
    {
      name: 'pumpstreams-live-poller',
      script: 'live-poller.mjs',
      instances: 1,
      env: {
        LIVE_POLLER_INTERVAL_MS: '30000',
        LIVE_POLLER_LIMIT: '50',
      },
    },
  ],
};
