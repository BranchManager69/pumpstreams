const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env.remote') });

module.exports = {
  apps: [
    {
      name: 'pumpstreams-api',
      script: 'cli/index.mjs',
      args: 'poller',
      instances: 1,
      exec_mode: 'fork',
      merge_logs: true,
      env: {
        LIVE_POLLER_INTERVAL_MS: process.env.LIVE_POLLER_INTERVAL_MS || '30000',
        LIVE_POLLER_LIMIT: process.env.LIVE_POLLER_LIMIT || '1000',
        SUPABASE_SNAPSHOT_BATCH_SIZE: process.env.SUPABASE_SNAPSHOT_BATCH_SIZE || '100',
        SUPABASE_LATEST_BATCH_SIZE: process.env.SUPABASE_LATEST_BATCH_SIZE || '100',
        SUPABASE_METADATA_BATCH_SIZE: process.env.SUPABASE_METADATA_BATCH_SIZE || '100',
        PUMPSTREAMS_ENV_FILE: process.env.PUMPSTREAMS_ENV_FILE || '.env.remote',
      },
    },
    {
      name: 'pumpstreams-fe',
      cwd: 'dashboard',
      script: 'npm',
      args: 'run start',
      instances: 1,
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '3050',
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        // Provide direct DB URLs for server-side PG fallback
        DATABASE_URL_SESSION: process.env.DATABASE_URL_SESSION,
        DATABASE_URL: process.env.DATABASE_URL,
        SUPABASE_DB_URL_SESSION: process.env.SUPABASE_DB_URL_SESSION,
        SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
        DASHBOARD_TOP_LIMIT: process.env.DASHBOARD_TOP_LIMIT || '100',
        DASHBOARD_LOOKBACK_MINUTES: process.env.DASHBOARD_LOOKBACK_MINUTES || '180',
        NEXT_PUBLIC_SPARKLINE_GAP_MINUTES: process.env.NEXT_PUBLIC_SPARKLINE_GAP_MINUTES || '3',
        NEXT_PUBLIC_DASHBOARD_REFRESH_MS: process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_MS || '20000',
      },
    },
  ],
};
