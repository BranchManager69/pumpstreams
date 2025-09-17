const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env.remote') });

module.exports = {
  apps: [
    {
      name: 'pumpstreams-live-poller',
      script: 'live-poller.mjs',
      instances: 1,
      env: {
        LIVE_POLLER_INTERVAL_MS: '30000',
        LIVE_POLLER_LIMIT: process.env.LIVE_POLLER_LIMIT || '500',
        PUMPSTREAMS_ENV_FILE: process.env.PUMPSTREAMS_ENV_FILE || '.env.remote',
      },
    },
    {
      name: 'pumpstreams-dashboard',
      cwd: 'dashboard',
      script: 'npm',
      args: 'run start',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '3050',
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        DASHBOARD_TOP_LIMIT: process.env.DASHBOARD_TOP_LIMIT || '100',
        DASHBOARD_LOOKBACK_MINUTES: process.env.DASHBOARD_LOOKBACK_MINUTES || '180',
        NEXT_PUBLIC_SPARKLINE_GAP_MINUTES: process.env.NEXT_PUBLIC_SPARKLINE_GAP_MINUTES || '3',
        NEXT_PUBLIC_DASHBOARD_REFRESH_MS: process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_MS || '20000',
      },
    },
  ],
};
