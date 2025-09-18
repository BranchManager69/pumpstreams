import '../lib/env.js';
import io from 'socket.io-client';
import fs from 'fs/promises';
import path from 'path';
import { formatSol, lamportsFrom, lamportsToNumber } from '../lib/token-math.js';
import { persistTradeEvent, flushSupabaseQueues } from '../lib/supabase-storage.js';

const PUMP_FUN_WS = 'https://frontend-api-v3.pump.fun';
const ORIGIN = 'https://pump.fun';

// Configuration
const config = {
  logToFile: true,
  logDir: './logs',
  showBuys: true,
  showSells: true,
  minSolAmount: 0.1, // Filter trades below this SOL amount
  trackSpecificMints: [], // Add mint addresses to track specific tokens
  statsInterval: 30000, // Stats report every 30 seconds
};

// Statistics tracking
const stats = {
  totalTrades: 0,
  buys: 0,
  sells: 0,
  totalSolVolume: 0n,
  uniqueUsers: new Set(),
  uniqueMints: new Set(),
  largestTrade: null,
  largestTradeLamports: 0n,
  tokenStats: new Map(), // Track per-token statistics
};

// Initialize logging
async function initLogging() {
  if (config.logToFile) {
    try {
      await fs.mkdir(config.logDir, { recursive: true });
      console.log(`📁 Logs will be saved to ${config.logDir}/`);
    } catch (error) {
      console.error('Failed to create log directory:', error);
      config.logToFile = false;
    }
  }
}

// Format token amount with dynamic decimals
function formatTokenAmount(amount) {
  const num = Number(amount);
  if (num > 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num > 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num > 1e6) return (num / 1e6).toFixed(2) + 'M';
  return num.toLocaleString();
}

// Process trade event
function processTrade(trade) {
  stats.totalTrades++;
  stats.uniqueUsers.add(trade.user);
  stats.uniqueMints.add(trade.mint);

  const solLamports = lamportsFrom(trade.sol_amount);
  stats.totalSolVolume += solLamports;

  if (trade.is_buy) {
    stats.buys++;
  } else {
    stats.sells++;
  }

  // Track per-token stats
  if (!stats.tokenStats.has(trade.mint)) {
    stats.tokenStats.set(trade.mint, {
      name: trade.name,
      symbol: trade.symbol,
      trades: 0,
      buys: 0,
      sells: 0,
      volume: 0n,
      firstSeen: new Date(),
      lastTrade: null,
    });
  }

  const tokenStat = stats.tokenStats.get(trade.mint);
  tokenStat.trades++;
  tokenStat.volume += solLamports;
  tokenStat.lastTrade = new Date();
  if (trade.is_buy) {
    tokenStat.buys++;
  } else {
    tokenStat.sells++;
  }

  // Track largest trade
  if (!stats.largestTrade || solLamports > lamportsFrom(stats.largestTrade.sol_amount)) {
    stats.largestTrade = trade;
    stats.largestTradeLamports = solLamports;
  }

  // Format and display trade
  const solFormatted = formatSol(solLamports);
  const solNumeric = lamportsToNumber(solLamports);
  const shouldShow = solNumeric >= config.minSolAmount &&
                     ((trade.is_buy && config.showBuys) || (!trade.is_buy && config.showSells));

  if (shouldShow || config.trackSpecificMints.includes(trade.mint)) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const action = trade.is_buy ? '🟢 BUY ' : '🔴 SELL';
    const tokenAmount = formatTokenAmount(trade.token_amount);

    const logLine = `[${timestamp}] ${action} ${solFormatted} SOL → ${tokenAmount} ${trade.name || 'Unknown'} | User: ${trade.user.slice(0, 8)}... | Mint: ${trade.mint.slice(0, 8)}...`;

    console.log(logLine);

    // Log to file
    if (config.logToFile) {
      const logFile = path.join(config.logDir, `trades-${new Date().toISOString().split('T')[0]}.jsonl`);
      fs.appendFile(logFile, JSON.stringify({
        ...trade,
        timestamp: new Date().toISOString(),
        solLamports: solLamports.toString(),
        sol: solNumeric,
        solFormatted,
      }) + '\n').catch(console.error);
    }
  }

  persistTradeEvent(trade);
}

// Display statistics
function displayStats() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 PUMP.FUN LIVE STATISTICS');
  console.log('='.repeat(80));

  const runtime = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(runtime / 3600);
  const minutes = Math.floor((runtime % 3600) / 60);
  const seconds = runtime % 60;

  console.log(`⏱️  Runtime: ${hours}h ${minutes}m ${seconds}s`);
  console.log(`📈 Total Trades: ${stats.totalTrades.toLocaleString()}`);

  if (stats.totalTrades === 0) {
    console.log('   Waiting for first trade...');
  } else {
    const buyPercent = ((stats.buys * 100) / stats.totalTrades).toFixed(1);
    const sellPercent = ((stats.sells * 100) / stats.totalTrades).toFixed(1);
    console.log(`   ├─ Buys: ${stats.buys.toLocaleString()} (${buyPercent}%)`);
    console.log(`   └─ Sells: ${stats.sells.toLocaleString()} (${sellPercent}%)`);
  }

  console.log(`💰 Total Volume: ${formatSol(stats.totalSolVolume)} SOL`);
  console.log(`👥 Unique Users: ${stats.uniqueUsers.size.toLocaleString()}`);
  console.log(`🪙 Unique Tokens: ${stats.uniqueMints.size.toLocaleString()}`);

  if (stats.largestTrade) {
    const largestLamports = stats.largestTradeLamports ?? lamportsFrom(stats.largestTrade.sol_amount);
    console.log(`\n🏆 Largest Trade: ${formatSol(largestLamports)} SOL`);
    console.log(`   Token: ${stats.largestTrade.name || 'Unknown'}`);
    console.log(`   Type: ${stats.largestTrade.is_buy ? 'BUY' : 'SELL'}`);
  }

  // Top 5 most traded tokens
  const topTokens = Array.from(stats.tokenStats.entries())
    .sort((a, b) => {
      if (b[1].volume === a[1].volume) return 0;
      return b[1].volume > a[1].volume ? 1 : -1;
    })
    .slice(0, 5);

  if (topTokens.length > 0) {
    console.log('\n🔥 TOP 5 TOKENS BY VOLUME:');
    topTokens.forEach(([mint, data], index) => {
      console.log(`${index + 1}. ${data.name || 'Unknown'} (${mint.slice(0, 8)}...)`);
      console.log(`   Volume: ${formatSol(data.volume)} SOL | Trades: ${data.trades} | B/S: ${data.buys}/${data.sells}`);
    });
  }

  console.log('='.repeat(80) + '\n');
}

// Main execution
const startTime = Date.now();
await initLogging();

console.log('🚀 PUMP.FUN WEBSOCKET MONITOR');
console.log('================================');
console.log(`📡 Connecting to: ${PUMP_FUN_WS}`);
console.log(`🎯 Min SOL Filter: ${config.minSolAmount} SOL`);
console.log(`📊 Stats Interval: ${config.statsInterval / 1000} seconds`);
console.log('================================\n');

const socket = io(PUMP_FUN_WS, {
  transports: ['websocket'],
  origin: ORIGIN,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity,
});

// Socket event handlers
socket.on('connect', () => {
  console.log('✅ Connected! Socket ID:', socket.id);
  console.log('🎧 Listening for trades...\n');

  // Explicitly subscribe to events - pump.fun might require this
  socket.emit('subscribe', 'tradeCreated');
  socket.emit('subscribe', { event: 'tradeCreated' });
  socket.emit('subscribe', { type: 'tradeCreated' });
  socket.emit('join', 'tradeCreated');
  socket.emit('join', 'trades');
  socket.emit('subscribe', 'all');
});

socket.on('disconnect', (reason) => {
  console.log('\n⚠️  Disconnected:', reason);
  console.log('🔄 Attempting to reconnect...');
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});

// Main event: tradeCreated
socket.on('tradeCreated', (data) => {
  // Data comes as a direct object, not an array
  if (data) {
    processTrade(data);
  }
});

// Catch any other events
socket.onAny((eventName, ...args) => {
  if (eventName !== 'tradeCreated') {
    console.log(`📨 New Event Type: "${eventName}"`);

    // Log new event types to file for analysis
    if (config.logToFile) {
      const eventFile = path.join(config.logDir, 'events.jsonl');
      fs.appendFile(eventFile, JSON.stringify({
        event: eventName,
        data: args,
        timestamp: new Date().toISOString(),
      }) + '\n').catch(console.error);
    }
  }
});

// Periodic stats display
setInterval(displayStats, config.statsInterval);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');

  displayStats();

  if (config.logToFile) {
    const summaryFile = path.join(config.logDir, `summary-${Date.now()}.json`);
    await fs.writeFile(summaryFile, JSON.stringify({
      startTime: new Date(startTime).toISOString(),
      endTime: new Date().toISOString(),
      runtime: Date.now() - startTime,
      stats: {
        totalTrades: stats.totalTrades,
        buys: stats.buys,
        sells: stats.sells,
        totalSolVolume: stats.totalSolVolume.toString(),
        uniqueUsers: stats.uniqueUsers.size,
        uniqueMints: stats.uniqueMints.size,
        largestTrade: stats.largestTrade,
        topTokens: Array.from(stats.tokenStats.entries())
          .sort((a, b) => Number(b[1].volume - a[1].volume))
          .slice(0, 20)
          .map(([mint, data]) => ({ mint, ...data, volume: data.volume.toString() })),
      },
    }, null, 2));
    console.log(`\n💾 Summary saved to ${summaryFile}`);
  }

  await flushSupabaseQueues().catch((error) => {
    console.error('[supabase] Flush failed during shutdown:', error.message);
  });

  socket.close();
  process.exit(0);
});

console.log('Press Ctrl+C to stop\n');
