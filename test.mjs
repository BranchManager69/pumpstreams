import io from 'socket.io-client';

const PUMP_FUN_WS = 'https://frontend-api-v3.pump.fun';
const ORIGIN = 'https://pump.fun';

console.log('🔌 Connecting to pump.fun WebSocket...\n');

const socket = io(PUMP_FUN_WS, {
  transports: ['websocket'],
  origin: ORIGIN,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

const messageLog = [];
const eventTypes = new Set();
const maxLogSize = 100;

function logMessage(type, data) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, type, data };

  messageLog.push(entry);
  if (messageLog.length > maxLogSize) {
    messageLog.shift();
  }

  console.log(`[${timestamp}] ${type}:`, JSON.stringify(data, null, 2).substring(0, 500));
}

socket.on('connect', () => {
  console.log('✅ Connected to pump.fun WebSocket!');
  console.log('Socket ID:', socket.id);
  console.log('\nListening for events...\n');

  // Try common Socket.io event patterns
  socket.emit('subscribe', 'all');
  socket.emit('subscribe', { channel: 'trades' });
  socket.emit('subscribe', { channel: 'live' });
  socket.emit('join', 'live');
  socket.emit('join', 'all');
});

socket.on('disconnect', (reason) => {
  console.log('❌ Disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.log('Connection error:', error.message);
});

socket.on('error', (error) => {
  console.log('Socket error:', error);
});

// Catch all events using wildcard
socket.onAny((eventName, ...args) => {
  eventTypes.add(eventName);
  console.log(`📨 Event received: "${eventName}" with ${args.length} arguments`);
  if (args.length > 0 && args[0]) {
    console.log('First arg sample:', JSON.stringify(args[0]).substring(0, 200));
  }
});

// Also listen for raw messages
socket.on('message', (data) => {
  logMessage('RAW MESSAGE', data);
});

// Common event patterns for crypto/trading platforms
const commonEvents = [
  'trade', 'trades', 'transaction', 'transactions',
  'price', 'prices', 'update', 'updates',
  'stream', 'live', 'data',
  'coin', 'coins', 'token', 'tokens',
  'new', 'created', 'minted',
  'buy', 'sell', 'swap',
  'volume', 'market', 'ticker'
];

commonEvents.forEach(eventName => {
  socket.on(eventName, (data) => {
    logMessage(`SPECIFIC: ${eventName}`, data);
  });
});

// Status report every 10 seconds
setInterval(() => {
  console.log('\n📊 Status Report:');
  console.log('Connected:', socket.connected);
  console.log('Event types seen:', Array.from(eventTypes).join(', ') || 'None yet');
  console.log('Messages received:', messageLog.length);
  console.log('---\n');
}, 10000);

// Keep the script running
process.on('SIGINT', () => {
  console.log('\n\nShutting down...');
  console.log('Final event types:', Array.from(eventTypes));
  console.log('Total messages logged:', messageLog.length);

  if (messageLog.length > 0) {
    console.log('\nLast 5 messages:');
    messageLog.slice(-5).forEach(entry => {
      console.log(`[${entry.timestamp}] ${entry.type}:`, entry.data);
    });
  }

  socket.close();
  process.exit(0);
});

console.log('Press Ctrl+C to stop\n');