#!/usr/bin/env node
import io from 'socket.io-client';
import { parseArgs } from 'util';

// Parse command line arguments
const { values: options } = parseArgs({
  options: {
    'min-sol': { type: 'string', default: '0.1' },
    'token': { type: 'string' },
    'user': { type: 'string' },
    'buys-only': { type: 'boolean', default: false },
    'sells-only': { type: 'boolean', default: false },
    'large-trades': { type: 'boolean', default: false },
    'raw': { type: 'boolean', default: false },
    'stats': { type: 'boolean', default: false },
    'csv': { type: 'boolean', default: false },
    'help': { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

// Show help
if (options.help) {
  console.log(`
PumpStreams - Advanced WebSocket Monitor for Pump.fun

Usage: node advanced.mjs [options]

Options:
  --min-sol <amount>    Minimum SOL amount to display (default: 0.1)
  --token <mint>        Track specific token by mint address
  --user <address>      Track specific user's trades
  --buys-only          Show only buy transactions
  --sells-only         Show only sell transactions
  --large-trades       Show only trades > 10 SOL
  --raw                Show raw JSON data
  --stats              Show statistics mode
  --csv                Output in CSV format
  --help               Show this help message

Examples:
  node advanced.mjs --min-sol 1 --buys-only
  node advanced.mjs --token vW7pHSNTemdmLF4aUVe7u78itim4ksKy9UqxAgfpump
  node advanced.mjs --large-trades --csv > trades.csv
  `);
  process.exit(0);
}

const PUMP_FUN_WS = 'https://frontend-api-v3.pump.fun';
const minSol = parseFloat(options['min-sol'] || '0.1');
const targetToken = options.token;
const targetUser = options.user;
const buysOnly = options['buys-only'];
const sellsOnly = options['sells-only'];
const largeTradesOnly = options['large-trades'];
const rawMode = options.raw;
const statsMode = options.stats;
const csvMode = options.csv;

// Statistics
const stats = {
  startTime: Date.now(),
  trades: 0,
  buys: 0,
  sells: 0,
  volume: 0,
  tokens: new Map(),
  users: new Map(),
};

// Utility functions
function formatSol(lamports) {
  return (Number(lamports) / 1e9).toFixed(6);
}

function formatTokenAmount(amount) {
  const num = Number(amount);
  if (num > 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num > 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num > 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num > 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

function shouldShowTrade(trade) {
  const solAmount = formatSol(trade.sol_amount);

  // Apply filters
  if (Number(solAmount) < minSol) return false;
  if (largeTradesOnly && Number(solAmount) < 10) return false;
  if (targetToken && trade.mint !== targetToken) return false;
  if (targetUser && trade.user !== targetUser) return false;
  if (buysOnly && !trade.is_buy) return false;
  if (sellsOnly && trade.is_buy) return false;

  return true;
}

function displayTrade(trade) {
  const solAmount = formatSol(trade.sol_amount);

  if (rawMode) {
    console.log(JSON.stringify(trade));
    return;
  }

  if (csvMode) {
    if (stats.trades === 0) {
      // Print CSV header
      console.log('timestamp,signature,type,sol_amount,token_amount,token_name,mint,user,slot');
    }
    console.log([
      new Date().toISOString(),
      trade.signature,
      trade.is_buy ? 'BUY' : 'SELL',
      solAmount,
      trade.token_amount,
      `"${trade.name || 'Unknown'}"`,
      trade.mint,
      trade.user,
      trade.slot,
    ].join(','));
    return;
  }

  // Standard display
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const action = trade.is_buy ? '🟢 BUY ' : '🔴 SELL';
  const tokenAmount = formatTokenAmount(trade.token_amount);

  console.log(
    `[${timestamp}] ${action} ${solAmount} SOL → ${tokenAmount} ${trade.name || 'Unknown'} | ` +
    `Slot: ${trade.slot} | User: ${trade.user.slice(0, 8)}...`
  );
}

function updateStats(trade) {
  stats.trades++;
  stats.volume += Number(formatSol(trade.sol_amount));

  if (trade.is_buy) {
    stats.buys++;
  } else {
    stats.sells++;
  }

  // Track token stats
  const tokenKey = `${trade.mint}:${trade.name || 'Unknown'}`;
  if (!stats.tokens.has(tokenKey)) {
    stats.tokens.set(tokenKey, { trades: 0, volume: 0, buys: 0, sells: 0 });
  }
  const tokenStat = stats.tokens.get(tokenKey);
  tokenStat.trades++;
  tokenStat.volume += Number(formatSol(trade.sol_amount));
  if (trade.is_buy) tokenStat.buys++;
  else tokenStat.sells++;

  // Track user stats
  if (!stats.users.has(trade.user)) {
    stats.users.set(trade.user, { trades: 0, volume: 0 });
  }
  const userStat = stats.users.get(trade.user);
  userStat.trades++;
  userStat.volume += Number(formatSol(trade.sol_amount));
}

function showStats() {
  const runtime = Math.floor((Date.now() - stats.startTime) / 1000);
  const tradesPerSecond = (stats.trades / runtime).toFixed(2);

  console.clear();
  console.log('═'.repeat(60));
  console.log('PUMPSTREAMS LIVE STATISTICS');
  console.log('═'.repeat(60));
  console.log(`Runtime: ${runtime}s | TPS: ${tradesPerSecond}`);
  console.log(`Trades: ${stats.trades} | Buys: ${stats.buys} | Sells: ${stats.sells}`);
  console.log(`Volume: ${stats.volume.toFixed(2)} SOL`);
  console.log(`Unique Tokens: ${stats.tokens.size} | Unique Users: ${stats.users.size}`);

  // Top tokens
  const topTokens = Array.from(stats.tokens.entries())
    .sort((a, b) => b[1].volume - a[1].volume)
    .slice(0, 5);

  if (topTokens.length > 0) {
    console.log('\nTop Tokens by Volume:');
    topTokens.forEach(([key, data], i) => {
      const [mint, name] = key.split(':');
      console.log(`${i + 1}. ${name} - ${data.volume.toFixed(2)} SOL (${data.trades} trades)`);
    });
  }

  // Top traders
  const topUsers = Array.from(stats.users.entries())
    .sort((a, b) => b[1].volume - a[1].volume)
    .slice(0, 3);

  if (topUsers.length > 0) {
    console.log('\nTop Traders:');
    topUsers.forEach(([user, data], i) => {
      console.log(`${i + 1}. ${user.slice(0, 8)}... - ${data.volume.toFixed(2)} SOL (${data.trades} trades)`);
    });
  }
}

// Main execution
if (!csvMode && !rawMode) {
  console.log('🚀 PUMPSTREAMS WebSocket Monitor (Advanced)');
  console.log('=========================================');
  console.log(`Filters: Min SOL: ${minSol}` +
    (targetToken ? ` | Token: ${targetToken}` : '') +
    (targetUser ? ` | User: ${targetUser}` : '') +
    (buysOnly ? ' | Buys Only' : '') +
    (sellsOnly ? ' | Sells Only' : '') +
    (largeTradesOnly ? ' | Large Trades (>10 SOL)' : ''));
  console.log('=========================================\n');
}

const socket = io(PUMP_FUN_WS, {
  transports: ['websocket'],
  origin: 'https://pump.fun',
  reconnection: true,
});

socket.on('connect', () => {
  if (!csvMode && !rawMode) {
    console.log('✅ Connected to pump.fun\n');
  }
});

socket.on('tradeCreated', (data) => {
  // Data comes as a direct object, not an array
  if (data) {
    const trade = data;

    if (shouldShowTrade(trade)) {
      displayTrade(trade);
    }

    updateStats(trade);

    if (statsMode) {
      showStats();
    }
  }
});

socket.on('disconnect', () => {
  if (!csvMode && !rawMode) {
    console.log('\n⚠️ Disconnected. Reconnecting...');
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  if (!csvMode && !rawMode) {
    console.log('\n\nFinal Statistics:');
    console.log(`Total Trades: ${stats.trades}`);
    console.log(`Total Volume: ${stats.volume.toFixed(2)} SOL`);
    console.log(`Buy/Sell Ratio: ${stats.buys}/${stats.sells}`);
  }
  socket.close();
  process.exit(0);
});

// Keep process alive
process.stdin.resume();