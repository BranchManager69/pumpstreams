<p align="center">
  <img src="https://docs.dexter.cash/previews/dexter-stack-wordmark.svg" alt="Dexter Stack wordmark" width="360">
</p>

<p align="center">
  <a href="https://github.com/BranchManager69/dexter-api">Dexter API</a>
  · <a href="https://github.com/BranchManager69/dexter-fe">Dexter FE</a>
  · <a href="https://github.com/BranchManager69/dexter-mcp">Dexter MCP</a>
  · <a href="https://github.com/BranchManager69/dexter-ops">Dexter Ops</a>
  · <strong>PumpStreams</strong>
</p>

<h1 align="center">PumpStreams</h1>

<p align="center">
  <a href="https://nodejs.org/en/download"><img src="https://img.shields.io/badge/node-%3E=20.0-green.svg" alt="Node >=20"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://pump.fun/live"><img src="https://img.shields.io/badge/pump.fun-live%20API-success.svg" alt="pump.fun live"></a>
</p>

Comprehensive reconnaissance and monitoring toolkit for Pump.fun’s trading and livestream stack. It discovers active rooms, captures WebSocket traffic, records LiveKit metadata, and now surfaces the results through a live dashboard (with the legacy CLI still available for diagnostics).

## Highlights

- **Real-time dashboard** – Next.js UI surfaces the top livestreams with live viewer counts, market-cap chips, and ratio metrics backed by Supabase.
- **Automated ingestion** – pollers persist `/live` rosters, hourly metrics, and snapshots (with S3 archiving) on a 30 s cadence.
- **Targeted diagnostics** – CLI helpers fetch livestream metadata (optional clip metadata and join-token preview) and sample LiveKit sessions for troubleshooting.
- **Browser recon capture** – Puppeteer script records `/live` page artifacts plus an optional first-stream detail for reference.
- **Configurable + automation-friendly** – environment variables drive both local Supabase stacks and cloud deployments; Prisma client generation now runs automatically.

## Preview

<p align="center">
  <video src="https://docs.dexter.cash/previews/pumpstreams.webm"
         poster="https://docs.dexter.cash/previews/pumpstreams.png"
         width="960"
         autoplay
         loop
         muted
         playsinline>
  </video>
</p>

---

## Dexter Stack

| Repo | Role |
|------|------|
| [`dexter-api`](https://github.com/BranchManager69/dexter-api) | Issues realtime tokens, proxies MCP, x402 billing |
| [`dexter-fe`](https://github.com/BranchManager69/dexter-fe) | Next.js frontend for voice/chat surfaces |
| [`dexter-mcp`](https://github.com/BranchManager69/dexter-mcp) | Hosted MCP transport powering tool access |
| [`dexter-ops`](https://github.com/BranchManager69/dexter-ops) | Shared operations scripts, PM2 config, nginx templates |

---

## Quick Start

### Install dependencies

```bash
git clone https://github.com/BranchManager69/pumpstreams.git
cd pumpstreams
npm install

cd dashboard
npm install
cd ..
```

Requires Node.js 20+. The dashboard shares the root lockfile but keeps its own `node_modules`.

### Configure environments

- Copy `.env.example` to `.env.remote` for the hosted Supabase project and paste the `SUPABASE_*` secrets.
- For local analytics, copy `.env.example` to `.env.local`, then run `supabase start` (brings up Postgres on high ports). Prefix CLI or scripts with `PUMPSTREAMS_ENV_FILE=.env.local` when you want to target it.
- `npm run prisma:generate` (or `npm install`) refreshes the Prisma client automatically after environment changes.

### Run the core checks

```bash
npm test                    # hits live pump.fun APIs; keep limits small when poking locally
npm run offline             # fixture-based helper tests, no network required

cd dashboard
npm run build
cd ..
```

### Launch the dashboard locally

```bash
cd dashboard
npm run dev -- --port 3051   # free port so it doesn't collide with the PM2 instance on 3050
```

The production dashboard is served by PM2 on port 3050. Use a different port for hot reload to avoid clobbering it.

---

## Everyday tasks

### CLI helpers

- Run `npm run cli` for the interactive menu or append `--help` to any command for flags.
- Quick checks: `npm run live -- list --json`, `npm run subscribe -- <mint> --duration 45`, `npm run cli -- investigate`.
- Capture workflow: `. .env.remote && npm run capture -- <mintId> --duration 15 --label "sample" --captured-by "agent"` (needs Supabase + AWS credentials).

### Dashboard deployment

```bash
cd dashboard
npm run build
pm2 restart pumpstreams-fe --update-env
cd ..
```

After the restart, spot-check `/tokens/<mint>` (or the page you touched) to confirm data and assets load.

---

## Data & Prisma

- Supabase migrations live in `supabase/migrations/*.sql`; use the Supabase CLI (`supabase db reset --local --yes`) to rebuild local databases.
- `npm run prisma:pull` and `npm run prisma:generate` keep Prisma types aligned with Supabase. The `postinstall` hook runs `generate` automatically.
- Set `SUPABASE_DB_URL` / `SUPABASE_DB_URL_SESSION` when you need direct Postgres access (dashboard API routes and migration scripts rely on them).

---

## Documentation (optional)

- `npm run docs:build` renders Honkit output to `docs/_book/`.
- `npm run docs:serve` previews locally (default port 3052).
- `npm run docs:deploy` rsyncs the build to `/var/www/docs.dexter.cash/`. Run `tools/install-docs-hook.sh` once if you want commits touching docs to auto-deploy.

Systemd users can enable the hourly refresher with `sudo systemctl enable --now docs-deploy.timer`.

---

## Testing

- Offline fixtures: `node --test tests/helpers-offline.test.mjs`.
- Live API smoke: `npm run smoke` (limit 1 stream, 30 s timeout).
- Full run: `npm test` (limit 3 streams, 60 s timeout by default). Adjust with `PUMPSTREAMS_TEST_LIMIT` and `PUMPSTREAMS_TEST_TIMEOUT` to reduce load.

---

## Key environment variables

| Variable(s) | Required for | Notes |
|-------------|--------------|-------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | CLI ingest, dashboard APIs | Primary Supabase project credentials. Without them, writes and server-side reads are disabled. |
| `SUPABASE_ANON_KEY` | Dashboard client | Used by the Next.js client for read access. |
| `SUPABASE_DB_URL`, `SUPABASE_DB_URL_SESSION` | Dashboard SSR, migrations | Point to Supabase Postgres (read-only + primary). Needed for metrics queries and Prisma scripts. |
| `PUMPSTREAMS_ENV_FILE` | CLI + scripts | Picks the env file (`.env.remote` by default, set to `.env.local` for local Supabase). |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION` | Capture CLI, clip presign routes | Required when archiving livestream clips to S3. |

Additional knobs (poller cadence, dashboard limits, etc.) still exist—check inline help or the docs when you need to tune them.

---

## Reference

- WebSocket endpoint: `wss://frontend-api-v3.pump.fun/socket.io/?EIO=4&transport=websocket` (Socket.io v4, primary event `tradeCreated`).
- MCP proxy helper: `node tools/mcp-http-proxy.mjs --url https://mcp.dexter.cash/mcp --bearer "$TOKEN_AI_MCP_TOKEN"` (add `-H` for extra headers, `-v` for verbose logging).

## License

Distributed under the [MIT License](LICENSE).
