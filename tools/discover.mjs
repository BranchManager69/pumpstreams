import io from 'socket.io-client';
import fs from 'fs/promises';

const PUMP_FUN_WS = 'https://frontend-api-v3.pump.fun';
const ORIGIN = 'https://pump.fun';
const SUBSCRIPTION_COOLDOWN_MS = 30_000;

console.log('🔍 PUMP.FUN WEBSOCKET DISCOVERY TOOL');
console.log('=====================================');
console.log('Discovering ALL available events and data...\n');

const socket = io(PUMP_FUN_WS, {
  transports: ['websocket'],
  origin: ORIGIN,
  reconnection: true,
});

const discoveredEvents = new Map();
const eventSamples = new Map();
let totalEvents = 0;
const subscriptionAttempts = new Map();

function serializePayload(payload) {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object') {
    const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)));
    return JSON.stringify(sorted);
  }
  return String(payload);
}

function emitWithThrottle(action, payload) {
  const key = `${action}:${serializePayload(payload)}`;
  const now = Date.now();
  const last = subscriptionAttempts.get(key) || 0;
  if (now - last < SUBSCRIPTION_COOLDOWN_MS) {
    return false;
  }
  subscriptionAttempts.set(key, now);
  socket.emit(action, payload);
  return true;
}

function describeEmit(action, payload) {
  const descriptor = typeof payload === 'string'
    ? `'${payload}'`
    : JSON.stringify(payload);
  return `   Trying: socket.emit('${action}', ${descriptor})`;
}

// Track ALL events
socket.onAny((eventName, ...args) => {
  totalEvents++;

  // Count event occurrences
  if (!discoveredEvents.has(eventName)) {
    discoveredEvents.set(eventName, 0);
    console.log(`\n🆕 NEW EVENT TYPE DISCOVERED: "${eventName}"`);
    console.log('─'.repeat(50));
  }
  discoveredEvents.set(eventName, discoveredEvents.get(eventName) + 1);

  // Store sample data for each event type (keep first 3 samples)
  if (!eventSamples.has(eventName)) {
    eventSamples.set(eventName, []);
  }

  const samples = eventSamples.get(eventName);
  if (samples.length < 3) {
    samples.push({
      timestamp: new Date().toISOString(),
      data: args,
    });

    // Print sample data
    console.log(`\n📦 Sample of "${eventName}" event:`);
    if (args.length === 0) {
      console.log('   No data payload');
    } else {
      args.forEach((arg, index) => {
        const preview = JSON.stringify(arg, null, 2);
        if (preview.length > 500) {
          console.log(`   Arg[${index}]: ${preview.substring(0, 500)}...`);
        } else {
          console.log(`   Arg[${index}]: ${preview}`);
        }
      });
    }
  }
});

socket.on('connect', () => {
  console.log('✅ Connected to pump.fun WebSocket');
  console.log('Socket ID:', socket.id);
  console.log('\n🎯 Attempting to subscribe to various channels...\n');

  // Try various subscription patterns
  const subscriptions = [
    'all',
    'trades',
    'tradeCreated',
    'streams',
    'stream',
    'livestream',
    'live',
    'video',
    'broadcast',
    'chat',
    'messages',
    'comments',
    'viewers',
    'streaming',
    'channels',
    'rooms',
    '*',
  ];

  subscriptions.forEach((sub) => {
    const attempts = [
      ['subscribe', sub],
      ['subscribe', { channel: sub }],
      ['subscribe', { type: sub }],
      ['subscribe', { event: sub }],
      ['join', sub],
      ['join', { room: sub }],
      ['watch', sub],
    ];

    attempts.forEach(([action, payload]) => {
      if (emitWithThrottle(action, payload)) {
        console.log(describeEmit(action, payload));
      }
    });
  });

  // Also try without any subscription to see what comes by default
  console.log('\n📡 Listening for ALL events...\n');
});

socket.on('disconnect', (reason) => {
  console.log('\n⚠️ Disconnected:', reason);
});

socket.on('error', (error) => {
  console.log('❌ Error:', error);
});

// Status report every 10 seconds
setInterval(() => {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 DISCOVERY STATUS REPORT');
  console.log('═'.repeat(60));
  console.log(`Total events received: ${totalEvents}`);
  console.log(`Unique event types: ${discoveredEvents.size}`);

  if (discoveredEvents.size > 0) {
    console.log('\nEvent types and counts:');
    for (const [event, count] of discoveredEvents) {
      console.log(`   • ${event}: ${count} occurrences`);
    }
  }
  console.log('═'.repeat(60) + '\n');
}, 10000);

// Save discovery results on exit
process.on('SIGINT', async () => {
  console.log('\n\n💾 Saving discovery results...');

  const results = {
    timestamp: new Date().toISOString(),
    totalEvents,
    eventTypes: Array.from(discoveredEvents.entries()).map(([event, count]) => ({
      event,
      count,
      samples: eventSamples.get(event),
    })),
  };

  const filename = `discovery-${Date.now()}.json`;
  await fs.writeFile(filename, JSON.stringify(results, null, 2));
  console.log(`Results saved to ${filename}`);

  console.log('\n📋 FINAL SUMMARY:');
  console.log(`   • Total events: ${totalEvents}`);
  console.log(`   • Event types discovered: ${discoveredEvents.size}`);

  if (discoveredEvents.size > 0) {
    console.log('\n   Event types:');
    for (const [event, count] of discoveredEvents) {
      console.log(`      - ${event} (${count} times)`);
    }
  }

  socket.close();
  process.exit(0);
});

console.log('Press Ctrl+C to stop and save results\n');
