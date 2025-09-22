# Pumpstreams Platform Metrics Chart

This document captures the work completed to produce a dual-axis chart of live streams and total viewers, plus the steps to regenerate or iterate on it later.

## What Was Added

- Introduced `scripts/generate_platform_chart.py`, a Python script that:
  - fetches every row from the Supabase `platform_metrics_minute` table using the service role key;
  - downsamples the full series to a maximum of 720 points so charts stay readable and performant;
  - renders a dual-axis line chart (live streams on the left axis, total viewers on the right) via Matplotlib using the Agg backend;
  - writes the generated PNG to `dashboard/public/charts/platform-metrics.png`.
- Restarted the dashboard PM2 process (`pumpstreams-fe`) so the new static asset is served.
- Verified the public URL `https://pump.dexter.cash/charts/platform-metrics.png` now responds with HTTP 200.

A leftover debug artifact from early QuickChart attempts (`artifacts/quickchart-error.png`) was removed as part of cleanup.

## Regenerating the Chart

1. Ensure Python 3 with Matplotlib is available (already present in this environment). The script sets the backend to Agg, so no additional display packages are required.
2. Load the remote environment variables so Supabase credentials are in scope:

   ```bash
   set -a
   source .env.remote >/dev/null 2>&1
   set +a
   ```

3. Run the generator:

   ```bash
   python3 scripts/generate_platform_chart.py
   ```

   Output is written to `dashboard/public/charts/platform-metrics.png`. The script will raise an error if Supabase returns no rows or if the file cannot be created.

4. Redeploy/restart the dashboard so it serves the new asset:

   ```bash
   pm2 restart pumpstreams-fe --update-env
   ```

5. Confirm delivery from the live site:

   ```bash
   curl -I https://pump.dexter.cash/charts/platform-metrics.png
   ```

   An HTTP 200 response indicates success.

## Tuning & Extension Points

- **Downsampling**: The script defaults to 720 points. Adjust `max_points` inside `downsample()` if you want more or fewer samples.
- **Chart styling**: Modify colors, line widths, titles, or axis formatting in `build_chart()`.
- **Additional series**: To add market-cap or other metrics, extend the data extraction in `build_chart()` and plot additional lines (consider adding a third axis or separate chart to keep readability).
- **Automation**: For scheduled refreshes, invoke the Python script plus PM2 restart from a cron job or CI workflow.

## Current File Inventory

- `scripts/generate_platform_chart.py`
- `dashboard/public/charts/platform-metrics.png`
- `PLATFORM_METRICS_CHART.md` (this document)

No other temporary files remain from the chart generation process.

---

This write-up should give future you (or anyone on the team) a clear starting point for evolving the platform metrics visualization.
