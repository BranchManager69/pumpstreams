import WebSocket from 'ws';

console.log('🚀 PUMPPORTAL WEBSOCKET MONITOR');
console.log('================================');
console.log('Connecting to PumpPortal public API...\n');

const ws = new WebSocket('wss://pumpportal.fun/api/data');

const stats = {
  newTokens: 0,
  migrations: 0,
  trades: 0,
  connected: false,
  startTime: Date.now()
};

const recentTokens = [];
const recentMigrations = [];

ws.on('open', function open() {
  stats.connected = true;
  console.log('✅ Connected to PumpPortal WebSocket!\n');

  // Subscribe to new token creation
  console.log('📝 Subscribing to new token creation events...');
  ws.send(JSON.stringify({
    method: "subscribeNewToken"
  }));

  // Subscribe to token migrations (to Raydium)
  console.log('🚀 Subscribing to migration events...');
  ws.send(JSON.stringify({
    method: "subscribeMigration"
  }));

  console.log('\n🎧 Listening for events...\n');
});

ws.on('message', function message(data) {
  try {
    const parsed = JSON.parse(data.toString());

    // New token created
    if (parsed.txType === 'create') {
      stats.newTokens++;

      const tokenInfo = {
        name: parsed.name,
        symbol: parsed.symbol,
        mint: parsed.mint,
        creator: parsed.traderPublicKey,
        timestamp: new Date().toISOString()
      };

      recentTokens.push(tokenInfo);
      if (recentTokens.length > 10) recentTokens.shift();

      console.log(`\n🆕 NEW TOKEN CREATED:`);
      console.log(`   Name: ${parsed.name}`);
      console.log(`   Symbol: ${parsed.symbol}`);
      console.log(`   Mint: ${parsed.mint}`);
      console.log(`   Creator: ${parsed.traderPublicKey}`);
      console.log(`   URI: ${parsed.uri || 'N/A'}`);
    }

    // Token migrated to Raydium
    else if (parsed.txType === 'migration' || parsed.migration) {
      stats.migrations++;

      const migrationInfo = {
        name: parsed.name,
        symbol: parsed.symbol,
        mint: parsed.mint,
        timestamp: new Date().toISOString()
      };

      recentMigrations.push(migrationInfo);
      if (recentMigrations.length > 5) recentMigrations.shift();

      console.log(`\n🎉 TOKEN MIGRATED TO RAYDIUM:`);
      console.log(`   Name: ${parsed.name}`);
      console.log(`   Symbol: ${parsed.symbol}`);
      console.log(`   Mint: ${parsed.mint}`);
      console.log(`   This token has graduated from pump.fun!`);
    }

    // Trade event
    else if (parsed.txType === 'buy' || parsed.txType === 'sell') {
      stats.trades++;

      // Only show large trades (> 1 SOL)
      const solAmount = parsed.solAmount / 1e9;
      if (solAmount > 1) {
        const action = parsed.txType === 'buy' ? '🟢 BUY' : '🔴 SELL';
        console.log(`\n${action}: ${solAmount.toFixed(2)} SOL`);
        console.log(`   Token: ${parsed.name || 'Unknown'} (${parsed.symbol})`);
        console.log(`   Trader: ${parsed.traderPublicKey?.substring(0, 8)}...`);
      }
    }

    // Unknown event type
    else if (parsed.txType) {
      console.log(`\n📨 Event: ${parsed.txType}`);
      console.log(`   Data: ${JSON.stringify(parsed).substring(0, 200)}...`);
    }

  } catch (err) {
    console.error('Error parsing message:', err.message);
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err.message);
});

ws.on('close', function close(code, reason) {
  stats.connected = false;
  console.log('\n📴 Disconnected from PumpPortal');
  console.log(`   Code: ${code}`);
  console.log(`   Reason: ${reason || 'No reason provided'}`);
});

// Display stats every 30 seconds
setInterval(() => {
  const runtime = Math.floor((Date.now() - stats.startTime) / 1000);
  const minutes = Math.floor(runtime / 60);
  const seconds = runtime % 60;

  console.log('\n' + '═'.repeat(60));
  console.log('📊 STATISTICS');
  console.log('═'.repeat(60));
  console.log(`⏱️  Runtime: ${minutes}m ${seconds}s`);
  console.log(`🆕 New Tokens Created: ${stats.newTokens}`);
  console.log(`🚀 Tokens Migrated to Raydium: ${stats.migrations}`);
  console.log(`📈 Trades Observed: ${stats.trades}`);
  console.log(`🔌 Connection Status: ${stats.connected ? 'Connected' : 'Disconnected'}`);

  if (recentTokens.length > 0) {
    console.log('\n📝 Recent Token Launches:');
    recentTokens.slice(-3).forEach((token, i) => {
      console.log(`   ${i + 1}. ${token.name} (${token.symbol})`);
    });
  }

  if (recentMigrations.length > 0) {
    console.log('\n🎉 Recent Migrations:');
    recentMigrations.forEach((token, i) => {
      console.log(`   ${i + 1}. ${token.name} (${token.symbol})`);
    });
  }

  console.log('═'.repeat(60) + '\n');
}, 30000);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down...');

  const runtime = Math.floor((Date.now() - stats.startTime) / 1000);
  console.log('\n📋 Final Statistics:');
  console.log(`   Runtime: ${Math.floor(runtime / 60)}m ${runtime % 60}s`);
  console.log(`   New Tokens: ${stats.newTokens}`);
  console.log(`   Migrations: ${stats.migrations}`);
  console.log(`   Trades: ${stats.trades}`);

  ws.close();
  process.exit(0);
});

console.log('Press Ctrl+C to stop\n');