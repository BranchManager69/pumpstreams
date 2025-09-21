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

## Installation

```bash
git clone https://github.com/BranchManager69/pumpstreams.git
cd pumpstreams
npm install

# Local analytics (no cloud required)
cp .env.example .env.local
supabase start               # launches the bundled Supabase warehouse on high ports

# Prisma client (optional but recommended)
npx prisma generate          # uses the schema pulled from Supabase migrations

# Hosted analytics (optional)
cp .env.example .env.remote  # then paste the Supabase URL + keys from the dashboard
```

## Documentation

- Build the self-hosted GitBook-style site with `npm run docs:build` (output in `docs/_book/`)
- Preview locally on this server with `npm run docs:serve` (defaults to port 3052)
- Deploy the latest build to `docs.dexter.cash` with `npm run docs:deploy` (renders + rsyncs to `/var/www/docs.dexter.cash/`)
- Publish by pointing your web server or reverse proxy at the `docs/_book/` directory—perfect for a `docs.<domain>` subdomain
- Add or reorder pages by editing Markdown inside `docs/` and updating `docs/SUMMARY.md`

> Tip: run `tools/install-docs-hook.sh` once on the server so every commit to `main` that touches `docs/` or `README.md` auto-runs `npm run docs:deploy`.

Hourly auto-publish (exactly on the clock):

```bash
sudo systemctl enable --now docs-deploy.timer
```

Systemd will trigger the deploy script at `HH:00:00` every hour, ensuring the static site stays fresh even if nobody pushes commits locally.

The repo supports two analytics back-ends out of the box:

- **Hosted Supabase Cloud (default)** – commands look for `.env.remote` first. With the supplied file in
  place, every CLI run will persist to the cloud project automatically.
- **Local Supabase** – `supabase start` spins up a Postgres instance on ports `5542x`. Prefix commands with
  `PUMPSTREAMS_ENV_FILE=.env.local` whenever you want to target the local warehouse instead.

### Prisma workflow

- The repo now ships a generated Prisma client (`@prisma/client`).
- Schema changes should continue to live in `supabase/migrations/*.sql`; the Supabase CLI remains the source of truth for applying them.
- Run `supabase db reset --local --yes` to rebuild the local database from migrations, then `npm run prisma:pull` and `npm run prisma:generate` to refresh Prisma types.
- Deployments regenerate the client automatically via the `postinstall` hook, so PM2 restarts always pick up the latest schema.

## WebSocket Endpoint

- **URL:** `wss://frontend-api-v3.pump.fun/socket.io/?EIO=4&transport=websocket`
- **Protocol:** Socket.io v4 (`tradeCreated` is the primary event)

## Legacy CLI utilities

The original CLI remains for diagnostics and scripted exports, but the dashboard is the primary interface now. Every entry point has inline help—run `npm run cli -- --help` for the menu or append `--help` to any command (for example, `npm run live -- --help`, `npm run monitor -- --help`, or `npm run subscribe -- --help`).

Common uses today:

- Spot-check `/live` metadata: `npm run live -- list --json` (add `--clips` or `--includeToken` only when you explicitly need clip metadata or a short-lived join-token preview).
- Capture a diagnostic LiveKit session: `npm run subscribe -- <mint> --duration 45 --json` (persists a session summary into Supabase’s `livestream_sessions`).
- Re-run the Puppeteer recon: `npm run cli -- investigate` (scrolls through multiple `/live` segments, captures artifacts, and clicks the first stream card once).

Anything beyond those tasks should be treated as legacy; consult the built-in help output before relying on older commands.

### MCP proxy helper

To bridge the hosted Dexter MCP endpoint into a local stdio transport, run:

```bash
node tools/mcp-http-proxy.mjs --url https://mcp.dexter.cash/mcp --bearer "$TOKEN_AI_MCP_TOKEN"
```

The proxy opens a Streamable HTTP connection to the remote server and forwards all JSON-RPC traffic over stdio, making it compatible with Codex or any other local MCP client. You can add `-H "Header: value"` for custom headers and `-v` for verbose logging.

## Testing

Start with the offline helper sanity check (uses recorded fixtures, no network calls):

```bash
node --test tests/helpers-offline.test.mjs
```

Live endpoint coverage still exercises the public pump.fun APIs—no mocks. Keep usage polite and trim the roster size when needed:

```bash
# Quick smoke check (limit 1 stream, 30s timeout)
npm run smoke

# Default run (limit 3 streams, 60s timeout)
npm test

# Reduce load during CI or local runs
PUMPSTREAMS_TEST_LIMIT=1 PUMPSTREAMS_TEST_TIMEOUT=30000 npm test
```

## Configuration

Environment variables let you point the tooling at alternate hosts or tweak behaviour without touching source. Defaults target production pump.fun endpoints.

| Variable | Default | Purpose |
|----------|---------|---------|
| `PUMPSTREAMS_FRONTEND_API` | `https://frontend-api-v3.pump.fun` | REST endpoint serving `coins/currently-live` |
| `PUMPSTREAMS_LIVESTREAM_API` | `https://livestream-api.pump.fun` | Livestream metadata, clips, join tokens |
| `PUMPSTREAMS_LIVEKIT_EDGE` | `https://pump-prod-tg2x8veh.livekit.cloud` | Base URL queried for LiveKit regions |
| `PUMPSTREAMS_ORIGIN` | `https://pump.fun` | Spoofed `Origin` header for REST requests |
| `PUMPSTREAMS_REFERER` | `https://pump.fun/live` | Spoofed `Referer` header for REST requests |
| `LIVE_POLLER_LIMIT` | `1000` | Page size for live roster pagination (poller walks all pages, includes NSFW) |
| `LIVE_POLLER_INTERVAL_MS` | `30000` | Polling cadence for `/live` roster |
| `DASHBOARD_FETCH_LIMIT` | `1000` | Latest snapshots pulled into the dashboard buffer |
| `DASHBOARD_TOP_LIMIT` | `100` | Active streams rendered above the fold |
| `DASHBOARD_LOOKBACK_MINUTES` | `180` | Metadata hint shown in the dashboard payload |
| `DASHBOARD_DISCONNECT_CYCLES` | *(unused)* | Former grace-cycle override (drop window now auto=2× poll interval) |
| `DASHBOARD_SPOTLIGHT_LIMIT` | `8` | Live streams highlighted in the hero reel |
| `DASHBOARD_DEFAULT_SORT` | `marketCap` | Primary ordering (`marketCap` or `viewers`) returned by `/api/live` |
| `NEXT_PUBLIC_DASHBOARD_REFRESH_MS` | `20000` | Client-side refresh cadence for the live leaderboard (ms) |

For deeper knobs (including legacy monitor flags), consult the inline CLI help or the docs in `docs/` if you truly need them.

## License

Distributed under the [MIT License](LICENSE).
