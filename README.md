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
```

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

## Testing

The test suite talks to the public pump.fun APIs—no mocks, no fixtures. Keep usage polite and trim the roster size when needed:

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
  "sol_amount": 123456789,        // in lamports (divide by 1e9 for SOL)
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
