import WebSocket from 'ws';

console.log('🎬 PUMP.FUN STREAMING WEBSOCKET MONITOR');
console.log('========================================\n');

const STREAMING_ENDPOINTS = [
  'wss://unified-prod.nats.realtime.pump.fun:443/',
  'wss://prod-v2.nats.realtime.pump.fun:443/'
];

class StreamMonitor {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.messages = [];
    this.connect();
  }

  connect() {
    console.log(`\n🔌 Connecting to: ${this.url}`);

    this.ws = new WebSocket(this.url, {
      headers: {
        'Origin': 'https://pump.fun',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    this.ws.on('open', () => {
      console.log(`✅ Connected to ${this.url.split('/')[2]}`);

      // Try various subscription commands (NATS protocol)
      this.trySubscriptions();
    });

    this.ws.on('message', (data) => {
      const message = data.toString();
      this.messages.push(message);

      console.log(`\n📨 Message from ${this.url.split('/')[2]}:`);

      // Try to parse as JSON
      try {
        const parsed = JSON.parse(message);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        // Not JSON, show raw
        console.log('Raw:', message.substring(0, 500));
      }
    });

    this.ws.on('error', (error) => {
      console.log(`❌ Error on ${this.url.split('/')[2]}:`, error.message);
    });

    this.ws.on('close', (code, reason) => {
      console.log(`📴 Disconnected from ${this.url.split('/')[2]} - Code: ${code}, Reason: ${reason}`);
    });
  }

  trySubscriptions() {
    // NATS protocol commands
    const subscriptions = [
      'SUB stream.* 1',
      'SUB livestream.* 2',
      'SUB broadcast.* 3',
      'SUB video.* 4',
      'SUB live.* 5',
      'SUB chat.* 6',
      'SUB viewers.* 7',
      'SUB * 8',
      'SUB >.* 9',
      'PING',
      'INFO'
    ];

    subscriptions.forEach((sub, index) => {
      setTimeout(() => {
        console.log(`   → Sending: ${sub}`);
        this.ws.send(sub + '\r\n');
      }, index * 100);
    });

    // Also try JSON-based subscriptions
    setTimeout(() => {
      const jsonSubs = [
        { type: 'subscribe', channel: 'stream' },
        { type: 'subscribe', channel: 'livestream' },
        { type: 'subscribe', channel: 'all' },
        { subscribe: 'stream' },
        { subscribe: 'livestream' },
        { action: 'subscribe', topic: 'stream' }
      ];

      jsonSubs.forEach((sub, index) => {
        setTimeout(() => {
          console.log(`   → Sending JSON: ${JSON.stringify(sub)}`);
          this.ws.send(JSON.stringify(sub));
        }, index * 100);
      });
    }, 2000);
  }

  getStatus() {
    return {
      url: this.url,
      state: this.ws?.readyState,
      messages: this.messages.length
    };
  }
}

// Connect to both endpoints
const monitors = STREAMING_ENDPOINTS.map(url => new StreamMonitor(url));

// Status report every 15 seconds
setInterval(() => {
  console.log('\n' + '═'.repeat(50));
  console.log('📊 STATUS REPORT');
  console.log('═'.repeat(50));

  monitors.forEach(monitor => {
    const status = monitor.getStatus();
    const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
    console.log(`${status.url.split('/')[2]}:`);
    console.log(`  State: ${states[status.state] || 'UNKNOWN'}`);
    console.log(`  Messages received: ${status.messages}`);
  });

  console.log('═'.repeat(50));
}, 15000);

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down...');

  monitors.forEach(monitor => {
    const status = monitor.getStatus();
    console.log(`\n${status.url}:`);
    console.log(`  Total messages: ${status.messages}`);
    if (monitor.messages.length > 0) {
      console.log('  Last message:', monitor.messages[monitor.messages.length - 1]);
    }
    monitor.ws?.close();
  });

  process.exit(0);
});

console.log('Press Ctrl+C to stop\n');