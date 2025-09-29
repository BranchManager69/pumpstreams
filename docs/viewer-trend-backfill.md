# Viewer Trend Backfill

This note covers how to validate the new `/api/platform/viewer-trend` behaviour that blends recent Supabase minutes with hourly averages reconstructed from S3 snapshots.

## Prerequisites

1. Export the usual Supabase + AWS credentials (the remote env file already includes both):

   ```bash
   set -a
   source .env.remote >/dev/null 2>&1
   set +a
   export PLATFORM_SNAPSHOT_BUCKET=pumpstreams-snapshots-prod
   ```

2. Install dependencies if needed:

   ```bash
   npm install
   cd dashboard && npm install && cd ..
   ```

## Local Verification Steps

1. Run the dashboard in dev mode so the API route is available:

   ```bash
   cd dashboard
   npm run dev -- --port 3051
   ```

2. In another shell, request a long window (e.g. 7 days):

   ```bash
   curl "http://localhost:3051/api/platform/viewer-trend?windowMinutes=10080" | jq '{start, end, totalSamples, averages: {overall, daily: .averages.daily[-3:], hourly: .averages.hourly[-3:]}}'
   ```

   You should see:

   - `totalSamples` significantly larger than the ~2,000 minute-level rows Supabase retains (hourly snapshots add the older range).
   - `averages.daily` and `averages.hourly` covering the full window, not just the last 48 hours.

3. Spot-check that the earliest `start` timestamp precedes the Supabase retention boundary. For quick confirmation, compare with the raw Supabase-only response:

   ```bash
   curl "http://localhost:3051/api/platform/viewer-trend?windowMinutes=1440" | jq '.start, .end, .totalSamples'
   ```

   The 1-day request should still rely solely on Supabase minutes. Larger windows will prepend the reconstructed hourly points from S3.

## Operational Notes

- The helper reads only the snapshots needed for the requested window. Multi-week ranges take longer (one JSON per minute), so consider adding `cache-control: max-age` headers at the CDN layer if the endpoint is exposed publicly.
- If `PLATFORM_SNAPSHOT_BUCKET` (or AWS credentials) is missing, the route logs an error but still returns Supabase data, ensuring graceful degradation.
- Historical buckets are averaged per hour; future work can add stream-specific grouping by reusing `loadHourlyViewerSnapshots` and filtering entries before summing.
