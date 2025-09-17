import puppeteer from 'puppeteer';

console.log('🔍 Finding ALL WebSocket connections on pump.fun/live...\n');

async function findWebSockets() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  const websockets = [];

  // Intercept WebSocket connections
  page.on('response', response => {
    const url = response.url();
    const status = response.status();

    // Check for WebSocket upgrade responses
    if (status === 101) {
      console.log('🔌 WebSocket found:', url);
      websockets.push(url);
    }
  });

  // Also monitor network requests for socket.io, ws://, wss://
  page.on('request', request => {
    const url = request.url();
    if (url.includes('socket.io') || url.startsWith('ws://') || url.startsWith('wss://')) {
      if (!websockets.includes(url)) {
        console.log('📡 Socket-related request:', url);
      }
    }
  });

  // Inject script to capture WebSocket creation
  await page.evaluateOnNewDocument(() => {
    const originalWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(originalWebSocket, {
      construct(target, args) {
        console.log('WebSocket created with URL:', args[0]);
        return new target(...args);
      }
    });
  });

  page.on('console', msg => {
    if (msg.text().includes('WebSocket created')) {
      console.log('🎯', msg.text());
    }
  });

  console.log('📱 Loading pump.fun/live...\n');

  try {
    await page.goto('https://pump.fun/live', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('⏳ Waiting 10 seconds to capture all connections...\n');
    await new Promise(r => setTimeout(r, 10000));

    // Try to find any video elements or streaming components
    const streamingInfo = await page.evaluate(() => {
      const results = {
        videos: document.querySelectorAll('video').length,
        iframes: document.querySelectorAll('iframe').length,
        streamElements: document.querySelectorAll('[class*="stream"], [class*="live"], [class*="video"], [class*="broadcast"]').length,
        dataAttributes: []
      };

      // Look for data attributes that might contain stream info
      document.querySelectorAll('[data-stream], [data-video], [data-broadcast], [data-live]').forEach(el => {
        results.dataAttributes.push({
          tag: el.tagName,
          attributes: Array.from(el.attributes).map(attr => `${attr.name}=${attr.value}`)
        });
      });

      return results;
    });

    console.log('\n📊 Page Analysis:');
    console.log('  Video elements:', streamingInfo.videos);
    console.log('  Iframes:', streamingInfo.iframes);
    console.log('  Stream-related elements:', streamingInfo.streamElements);

    if (streamingInfo.dataAttributes.length > 0) {
      console.log('  Data attributes:', streamingInfo.dataAttributes);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }

  console.log('\n📋 Summary:');
  console.log('Total WebSockets found:', websockets.length);
  websockets.forEach((ws, i) => {
    console.log(`  ${i + 1}. ${ws}`);
  });

  await browser.close();
}

findWebSockets().catch(console.error);