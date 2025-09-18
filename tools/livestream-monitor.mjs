import WebSocket from 'ws';

console.log('🎬 PUMP.FUN LIVESTREAM MONITOR');
console.log('================================');
console.log('Monitoring for livestream-related activity...\n');

// All known pump.fun WebSocket endpoints
const ENDPOINTS = {
  trading: 'wss://frontend-api-v3.pump.fun/socket.io/?EIO=4&transport=websocket',
  pumpportal: 'wss://pumpportal.fun/api/data',
  // NATS endpoints require auth but let's try to connect anyway
  nats1: 'wss://unified-prod.nats.realtime.pump.fun:443/',
  nats2: 'wss://prod-v2.nats.realtime.pump.fun:443/'
};

class LivestreamMonitor {
  constructor() {
    this.connections = new Map();
    this.streamData = {
      tokens: new Map(),
      possibleStreams: [],
      events: []
    };
  }

  connectPumpPortal() {
    console.log('📡 Connecting to PumpPortal...');
    const ws = new WebSocket(ENDPOINTS.pumpportal);

    ws.on('open', () => {
      console.log('✅ Connected to PumpPortal');

      // Subscribe to all events
      ws.send(JSON.stringify({ method: "subscribeNewToken" }));
      ws.send(JSON.stringify({ method: "subscribeMigration" }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // Look for any livestream-related fields
        if (msg.isLive || msg.livestream || msg.streaming || msg.broadcast) {
          console.log('\n🎥 POSSIBLE LIVESTREAM DATA:');
          console.log(JSON.stringify(msg, null, 2));
          this.streamData.possibleStreams.push(msg);
        }

        // Store token data
        if (msg.mint) {
          this.streamData.tokens.set(msg.mint, {
            name: msg.name,
            symbol: msg.symbol,
            creator: msg.traderPublicKey,
            timestamp: new Date().toISOString()
          });
        }

      } catch (e) {
        // Silently ignore parse errors
      }
    });

    ws.on('error', (err) => {
      console.log('⚠️ PumpPortal error:', err.message);
    });

    ws.on('close', () => {
      console.log('📴 PumpPortal disconnected');
    });

    this.connections.set('pumpportal', ws);
  }

  connectSocketIO() {
    console.log('📡 Connecting to Socket.io endpoint...');

    // Use socket.io-client for this endpoint
    import('socket.io-client').then(({ default: io }) => {
      const socket = io('https://frontend-api-v3.pump.fun', {
        transports: ['websocket'],
        reconnection: false
      });

      socket.on('connect', () => {
        console.log('✅ Connected to Socket.io');

        // Try various livestream-related subscriptions
        socket.emit('subscribe', 'livestream');
        socket.emit('subscribe', 'stream');
        socket.emit('subscribe', 'live');
        socket.emit('subscribe', 'broadcast');
        socket.emit('join', 'livestreams');
      });

      socket.onAny((eventName, ...args) => {
        // Look for livestream events
        if (eventName.toLowerCase().includes('live') ||
            eventName.toLowerCase().includes('stream') ||
            eventName.toLowerCase().includes('broadcast')) {
          console.log(`\n🎬 LIVESTREAM EVENT: ${eventName}`);
          console.log('Data:', JSON.stringify(args[0]).substring(0, 200));

          this.streamData.events.push({
            event: eventName,
            data: args[0],
            timestamp: new Date().toISOString()
          });
        }
      });

      socket.on('disconnect', () => {
        console.log('📴 Socket.io disconnected');
      });

      this.connections.set('socketio', socket);
    }).catch(err => {
      console.log('❌ Failed to load socket.io-client:', err.message);
    });
  }

  tryNATSEndpoints() {
    // Try NATS endpoints (will likely fail auth but worth checking)
    ['nats1', 'nats2'].forEach(key => {
      const url = ENDPOINTS[key];
      console.log(`📡 Trying ${url.split('/')[2]}...`);

      const ws = new WebSocket(url, {
        headers: {
          'Origin': 'https://pump.fun',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      ws.on('open', () => {
        console.log(`✅ Connected to ${key}`);
        // Try subscribing to livestream topics
        ws.send('SUB livestream.* 1\r\n');
        ws.send('SUB stream.* 2\r\n');
        ws.send('SUB live.* 3\r\n');
      });

      ws.on('message', (data) => {
        const msg = data.toString();
        if (!msg.includes('INFO') && !msg.includes('-ERR')) {
          console.log(`\n📨 ${key} message:`, msg.substring(0, 100));
        }
      });

      ws.on('error', () => {
        // Silently handle errors
      });

      ws.on('close', (code, reason) => {
        if (reason && reason.toString().includes('Auth')) {
          console.log(`❌ ${key} requires authentication`);
        }
      });

      this.connections.set(key, ws);
    });
  }

  start() {
    this.connectPumpPortal();
    this.connectSocketIO();
    this.tryNATSEndpoints();

    // Status report every 30 seconds
    setInterval(() => {
      console.log('\n' + '═'.repeat(50));
      console.log('📊 LIVESTREAM MONITOR STATUS');
      console.log('═'.repeat(50));
      console.log(`Tokens seen: ${this.streamData.tokens.size}`);
      console.log(`Possible streams found: ${this.streamData.possibleStreams.length}`);
      console.log(`Livestream events: ${this.streamData.events.length}`);

      if (this.streamData.events.length > 0) {
        console.log('\nRecent livestream events:');
        this.streamData.events.slice(-3).forEach(e => {
          console.log(`  - ${e.event} at ${e.timestamp}`);
        });
      }

      console.log('═'.repeat(50));
    }, 30000);
  }

  shutdown() {
    console.log('\n🛑 Shutting down connections...');

    this.connections.forEach((conn, name) => {
      try {
        if (conn.close) conn.close();
        if (conn.disconnect) conn.disconnect();
      } catch (e) {
        // Ignore errors during shutdown
      }
    });

    if (this.streamData.possibleStreams.length > 0) {
      console.log('\n📋 Possible livestream data found:');
      this.streamData.possibleStreams.forEach((s, i) => {
        console.log(`${i + 1}.`, JSON.stringify(s).substring(0, 200));
      });
    }

    if (this.streamData.events.length > 0) {
      console.log('\n📋 Livestream events captured:');
      this.streamData.events.forEach(e => {
        console.log(`  - ${e.event}: ${JSON.stringify(e.data).substring(0, 100)}`);
      });
    }
  }
}

// Start monitoring
const monitor = new LivestreamMonitor();
monitor.start();

// Handle shutdown
process.on('SIGINT', () => {
  monitor.shutdown();
  setTimeout(() => process.exit(0), 1000);
});

console.log('Press Ctrl+C to stop\n');