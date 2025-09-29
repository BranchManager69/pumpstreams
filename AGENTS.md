# Agent Guide

This repo powers the Pumpstreams CLI and dashboard. Use the steps below to set up,
run checks, deploy updates, and capture livestreams reliably.

> **Response Formatting Preference**
>
> When summarising findings or instructions, present information with clear ASCII
> structure (boxes, section headers, divider lines, bullet lists) so it is easy to
> scan even when exhausted. Keep technical fidelity high while making the layout
> visually distinct.

## Quick Setup

```bash
# install root dependencies
npm install

# install dashboard (Next.js) dependencies
cd dashboard
npm install
cd ..
```

Requires Node.js 20+. The default `universal` Codex image already includes it.

## Tests & Checks

```bash
# CLI lint/unit suite (hits live APIs by default)
npm test

# Dashboard build sanity check
cd dashboard
npm run build
cd ..
```

## Deployment Workflow

Whenever you change the dashboard (UI, API routes, styles, etc.), redeploy:

```bash
cd dashboard
npm run build
pm2 restart pumpstreams-fe --update-env
cd ..
```

After restarting, spot-check `/tokens/<mint>` (or the relevant page).

## Platform Metrics APIs

- `GET /api/platform/metrics` &rarr; Raw platform metrics samples; accepts optional `windowMinutes`.
- `GET /api/platform/viewer-trend` &rarr; Aggregated total-viewer trend with daily/hourly averages and min/max.

## Environment Notes

- Supabase credentials arrive via env vars: `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and when needed
  `SUPABASE_DB_URL` / `SUPABASE_DB_URL_SESSION`.
- Dashboard production runs on port `3050`. For local dev/HMR use another port
  (e.g. `npm run dev -- --port 3051`) to avoid conflicts with PM2.
- `codex/setup.sh` exists for Codex cache warmups if desired.

## Capture CLI Quickstart

```bash
. .env.remote
npm run capture -- <mintId> --duration 15 --label "sample" --captured-by "agent"
```

Requires AWS creds (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`)
plus the Supabase vars above. Captures store metadata in `livestream_clips` and
upload files to `captures/<mint>/<timestamp>/` in S3.
