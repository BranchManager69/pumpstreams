# PumpStreams

[![Node.js](https://img.shields.io/badge/node-%3E=20.0-green.svg)](https://nodejs.org/en/download)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Live Endpoints](https://img.shields.io/badge/pump.fun-live%20API-success.svg)](https://pump.fun/live)

Comprehensive reconnaissance and monitoring toolkit for Pump.fun’s trading and livestream stack. It discovers active rooms, captures WebSocket traffic, records LiveKit metadata, and surfaces everything through a clean CLI.

## Highlights

- **Livestream discovery** – enumerate active coins with viewer counts, market caps, and thumbnails.
- **Metadata deep dive** – fetch full livestream snapshots (clips, approval status, viewer tokens) in structured JSON.
- **LiveKit session capture** – connect as a viewer, subscribe to tracks, and log participants/connection events.
- **Browser-grade recon** – headless capture of `pump.fun/live`, including screenshots, DOM dumps, and network payloads.
- **Configurable + automation-friendly** – environment variables for hosts/headers, file-based outputs, and live integration tests.

---

## Installation

```bash
git clone https://github.com/BranchManager69/pumpstreams.git
cd pumpstreams
npm install

# Local analytics (no cloud required)
cp .env.example .env.local
supabase start               # launches the bundled Supabase warehouse on high ports

# Hosted analytics (optional)
cp .env.example .env.remote  # then paste the Supabase URL + keys from the dashboard
```

The repo supports two analytics back-ends out of the box:

- **Hosted Supabase Cloud (default)** – commands look for `.env.remote` first. With the supplied file in
  place, every CLI run will persist to the cloud project automatically.
- **Local Supabase** – `supabase start` spins up a Postgres instance on ports `5542x`. Prefix commands with
  `PUMPSTREAMS_ENV_FILE=.env.local` whenever you want to target the local warehouse instead.

## WebSocket Endpoint

- **URL:** `wss://frontend-api-v3.pump.fun/socket.io/?EIO=4&transport=websocket`
- **Protocol:** Socket.io v4 (`tradeCreated` is the primary event)

## CLI & Automation Toolkit

### WebSocket Monitors

```bash
# Connectivity smoke test
npm run ws-test

# Full monitor with stats + JSONL logging
npm run monitor
```

### Advanced Trade Explorer (`advanced.mjs`)

```bash
npm run advanced -- --help
npm run advanced -- --min-sol 1 --buys-only
npm run advanced -- --token vW7pHSNTemdmLF4aUVe7u78itim4ksKy9UqxAgfpump
npm run advanced -- --csv > trades.csv
```

### Livestream Catalogue (`livestream-cli.mjs`)

```bash
# Top live streams with viewer counts + market caps
npm run live -- --limit 10

# Deep dive on a mint (clips + viewer token)
npm run live -- info <mint> --clips --includeToken

# Structured JSON output (auto filenames inside ./dumps)
npm run live -- info <mint> --json --output dumps/

# Inspect LiveKit regions used by a room
npm run live -- regions <mint>

# Emit raw JSON for scripting
npm run live -- list --json

# Persist snapshot for analytics, then print top movers
npm run live -- info <mint> --json --output dumps/ && npm run analyze -- --limit 5
```

### Live Investigator (`live-investigator.mjs`)
Headless Puppeteer reconnaissance that captures screenshots, DOM summaries, WebSocket frames, and REST payloads powering `pump.fun/live`.

Artifacts (HTML snapshot, JSON logs, PNG screenshots) are saved under `artifacts/<timestamp>/` for further analysis:

```bash
npm run investigate
```

### LiveKit Subscriber (`livekit-subscriber.mjs`)
Connects to a livestream room with the issued viewer token, listens for participants and tracks, and captures a structured session summary.

```bash
# Observe a room for 45 seconds, write summary JSON to ./captures/
npm run subscribe -- <mint> --duration 45 --output captures/ --json

# Quick peek with console output only
npm run subscribe -- --mint <mint> --duration 20
```

Each subscriber run writes a structured session document to Supabase (`livestream_sessions`), which plugs
directly into the analytics CLI: `npm run analyze -- --limit 10`.

### Analytics Console

```bash
# Refresh hourly aggregates then dump the top streams as JSON
PUMPSTREAMS_ENV_FILE=.env.local npm run analyze -- --refresh --json

# Human-readable snapshot (top 10 by participants and trade flow)
PUMPSTREAMS_ENV_FILE=.env.remote npm run analyze -- --limit 10
```

The analytics script pulls from the Supabase tables populated by the monitoring pipeline:

| Table | Purpose |
|-------|---------|
| `tokens` | 1:1 catalogue of Pump.fun mints with core metadata |
| `livestream_snapshots` | Time-series snapshots of livestream viewers/thumbnail/mode |
| `livestream_sessions` | LiveKit subscriber session summaries (tracks, participants, duration) |
| `livestream_regions` | Region latency probes tied to a snapshot |
| `trade_events` | Raw trade feed captured from the WebSocket monitors |
| `token_hourly_metrics` | Rolling per-token hourly volume/bias metrics |

Views such as `token_latest_snapshot`, `token_trade_summary`, and `token_hourly_trend` power the console output.

> Tip: omit `PUMPSTREAMS_ENV_FILE=…` to use the default `.env.remote` configuration; set
> `PUMPSTREAMS_ENV_FILE=.env.local` when you want the bundled local stack.

### Live Roster Poller

Keep Supabase stocked with the `/live` roster by running the poller loop.

```bash
# Smoke test (single iteration)
npm run poller -- --iterations 1 --limit 10

# Continuous polling every 30s via PM2 (cloud by default)
pm2 start ecosystem.config.cjs --only pumpstreams-live-poller

# Override interval/limit at launch
pm2 start ecosystem.config.cjs --only pumpstreams-live-poller \
  --update-env --env LIVE_POLLER_INTERVAL_MS=15000 --env LIVE_POLLER_LIMIT=75

# Watch the output
pm2 logs pumpstreams-live-poller
```

The poller reads `.env.remote` first, so cloud writes are automatic. To target the local warehouse, start PM2 with
`PUMPSTREAMS_ENV_FILE=.env.local` in the environment.

### Analytics Dashboard (Next.js + PM2)

The repo ships with a self-hosted Next.js dashboard that surfaces the top 30 livestreams and their historical metrics.
It listens on port **3050** by default.

```bash
# Install dependencies (first time only)
cd dashboard
set -a && source ../.env.remote && npm install

# Build for production (ensure Supabase env vars are present)
set -a && source ../.env.remote && npm run build

# Start under PM2 (from repo root)
cd ..
pm2 start ecosystem.config.cjs --only pumpstreams-dashboard

# Tail the logs
pm2 logs pumpstreams-dashboard
```

The dashboard uses Supabase service-role credentials at runtime (sourced from `.env.remote`). Adjust
`DASHBOARD_TOP_LIMIT` or `DASHBOARD_LOOKBACK_MINUTES` to change the view. For local development:

```bash
cd dashboard
set -a && source ../.env.remote && npm run dev
```

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

Edit the config object in `monitor.mjs` for WebSocket behaviour:

```javascript
const config = {
  logToFile: true,              // Save logs to disk
  logDir: './logs',             // Log directory
  showBuys: true,               // Display buy trades
  showSells: true,              // Display sell trades
  minSolAmount: 0.1,            // Minimum SOL filter
  trackSpecificMints: [],       // Array of mint addresses to always show
  statsInterval: 30000,         // Stats display interval (ms)
};
```

## Trade Data Structure

Each `tradeCreated` event contains:

```javascript
{
  "signature": "transaction_signature",
  "sol_amount": 123456789,        // in lamports (use lib/token-math.js helpers for SOL conversions)
  "token_amount": 999999999999,    // raw token amount
  "is_buy": true,                  // true=buy, false=sell
  "user": "wallet_address",
  "timestamp": 1758066946,         // Unix timestamp
  "mint": "token_mint_address",
  "virtual_sol_reserves": 12345,   // bonding curve reserves
  "virtual_token_reserves": 99999, // bonding curve reserves
  "slot": 367308199,              // Solana slot number
  "tx_index": 1,                  // transaction index in slot
  "name": "Token Name",
  "symbol": "SYMBOL"              // sometimes included
}
```

## Log Files

When logging is enabled, the monitor creates:
- `logs/trades-YYYY-MM-DD.jsonl` - Daily trade logs
- `logs/events.jsonl` - Other WebSocket events
- `logs/summary-[timestamp].json` - Session summary on exit

## Advanced CLI Options

| Option | Description |
|--------|-------------|
| `--min-sol <amount>` | Minimum SOL amount to display (default: 0.1) |
| `--token <mint>` | Track specific token by mint address |
| `--user <address>` | Track specific user's trades |
| `--buys-only` | Show only buy transactions |
| `--sells-only` | Show only sell transactions |
| `--large-trades` | Show only trades > 10 SOL |
| `--raw` | Show raw JSON data |
| `--stats` | Show statistics mode |
| `--csv` | Output in CSV format |
| `--help` | Show help message |

## Notes

- All SOL amounts are in lamports (1 SOL = 1,000,000,000 lamports)
- The WebSocket auto-reconnects on disconnection
- Press Ctrl+C for graceful shutdown with statistics summary
- Trade volume can be very high (multiple trades per second)
- Livestream APIs require standard browser headers; scripts in this repo set `origin`/`referer` automatically
- `npm test` exercises the live pump.fun APIs—runs require network access and will consume short-lived LiveKit viewer tokens.

## Browser Usage

To see WebSocket data in browser:
1. Open https://pump.fun/live
2. Open Developer Tools (F12)
3. Go to Network tab
4. Filter by "WS" (WebSocket)
5. Click on the socket.io connection
6. View Messages tab for real-time data

## License

Distributed under the [MIT License](LICENSE). Feel free to fork, extend, and build your own monitoring pipelines—credit is appreciated.
