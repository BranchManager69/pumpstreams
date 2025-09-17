# PumpStreams - Pump.fun WebSocket Monitor

Standalone toolkit for mapping pump.fun live trading and livestream infrastructure.

## Installation

```bash
cd /home/branchmanager/websites/pumpstreams
npm install
```

## WebSocket Details

**Endpoint:** `wss://frontend-api-v3.pump.fun/socket.io/?EIO=4&transport=websocket`
**Protocol:** Socket.io v4
**Main Event:** `tradeCreated`

## Available Scripts

### 1. Test Connection (`test.mjs`)
Simple connection test to verify WebSocket is working and see raw events.

```bash
npm test
# or
node test.mjs
```

### 2. Full Monitor (`monitor.mjs`)
Comprehensive monitor with statistics, logging, and filtering.

```bash
npm start
# or
npm run monitor
# or
node monitor.mjs
```

Features:
- Real-time trade display with filtering
- Statistics tracking (volume, unique users, top tokens)
- File logging (JSON Lines format)
- Configurable filters (min SOL amount, buy/sell)
- Automatic summary generation on exit

### 3. Advanced CLI (`advanced.mjs`)
Command-line tool with extensive filtering options.

```bash
npm run advanced
# or
node advanced.mjs [options]

# Show help
node advanced.mjs --help

# Filter examples
node advanced.mjs --min-sol 1 --buys-only
node advanced.mjs --large-trades
node advanced.mjs --token vW7pHSNTemdmLF4aUVe7u78itim4ksKy9UqxAgfpump
node advanced.mjs --user 5AdtwpiT5gD4eupzPkEoYaqcUnXixgmKtFae9CxXJbSD

# Output formats
node advanced.mjs --csv > trades.csv
node advanced.mjs --raw
node advanced.mjs --stats
```

### 4. Livestream CLI (`livestream-cli.mjs`)
Discover the real livestream catalogue, gather token metadata, and retrieve viewer credentials for Pump.fun's LiveKit infrastructure.

```bash
# Show top live streams with viewer counts and market caps
npm run live -- --limit 10

# Inspect a specific mint (include LiveKit token & clip history)
npm run live -- info <mint> --clips --includeToken

# Emit machine-readable JSON (optionally write to file)
npm run live -- info <mint> --json --output live.json

# Fetch LiveKit edge regions (requires mint)
npm run live -- regions <mint>

# Emit raw JSON for scripting
npm run live -- list --json
```

### 5. Live Investigator (`live-investigator.mjs`)
Headless Puppeteer reconnaissance that captures screenshots, DOM summaries, WebSocket frames, and REST payloads powering `pump.fun/live`.

Artifacts (HTML snapshot, JSON logs, PNG screenshots) are saved under `artifacts/<timestamp>/` for further analysis:

```bash
npm run investigate
```

### 6. LiveKit Subscriber (`livekit-subscriber.mjs`)
Connects to a livestream room with the issued viewer token, listens for participants and tracks, and captures a structured session summary.

```bash
# Observe a room for 45 seconds, write summary JSON to ./captures/
npm run subscribe -- V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump --duration 45 --output captures/ --json

# Quick peek with console output only
npm run subscribe -- --mint V5cCiSixPLAiEDX2zZquT5VuLm4prr5t35PWmjNpump --duration 20
```

## Testing

The test suite talks to the public pump.fun APIs—no mocks, no fixtures. Keep usage polite and trim the roster size when needed:

```bash
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
