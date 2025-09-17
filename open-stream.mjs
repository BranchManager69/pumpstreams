import puppeteer from 'puppeteer';

console.log('🎬 OPENING A LIVE STREAM ON PUMP.FUN...\n');

async function openStream() {
  const browser = await puppeteer.launch({
    headless: false, // Show browser to see what's happening
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  const streamData = [];

  // Monitor all network traffic
  await page.setRequestInterception(true);

  page.on('request', request => {
    const url = request.url();

    // Look for streaming protocols
    if (url.includes('.m3u8') || url.includes('.ts') ||
        url.includes('webrtc') || url.includes('rtmp') ||
        url.includes('stream') || url.includes('video') ||
        url.includes('ivs') || url.includes('cloudfront') ||
        url.includes('amazonaws')) {

      if (!url.includes('thumbnail')) {
        console.log('📡 Request:', url.substring(0, 150));
        streamData.push({ type: 'request', url });
      }
    }

    request.continue();
  });

  // Monitor WebSocket messages
  await page.evaluateOnNewDocument(() => {
    const originalWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(originalWebSocket, {
      construct(target, args) {
        console.log('WebSocket created:', args[0]);
        const ws = new target(...args);

        // Monitor messages
        const originalSend = ws.send;
        ws.send = function(...sendArgs) {
          console.log('WS Send:', sendArgs[0]);
          return originalSend.apply(this, sendArgs);
        };

        ws.addEventListener('message', (event) => {
          console.log('WS Receive:', event.data?.substring?.(0, 200) || event.data);
        });

        return ws;
      }
    });
  });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('WebSocket') || text.includes('WS')) {
      console.log('🔌', text);
    }
  });

  console.log('📱 Loading pump.fun/live...\n');

  try {
    await page.goto('https://pump.fun/live', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    console.log('⏳ Waiting for page to load...\n');
    await new Promise(r => setTimeout(r, 3000));

    // Get list of live streams
    const liveStreams = await page.evaluate(() => {
      const streams = [];
      // Look for stream cards/links
      document.querySelectorAll('a[href*="/coin/"], [class*="live"], [class*="stream"]').forEach(el => {
        const href = el.href || el.querySelector('a')?.href;
        if (href && href.includes('/coin/')) {
          const text = el.innerText || '';
          if (text.includes('LIVE') || el.querySelector('[class*="live"]')) {
            streams.push({
              href,
              text: text.substring(0, 100),
              hasLiveBadge: !!el.querySelector('[class*="live"]')
            });
          }
        }
      });
      return streams;
    });

    console.log(`Found ${liveStreams.length} potential live streams\n`);

    if (liveStreams.length > 0) {
      const firstStream = liveStreams[0];
      console.log(`🎯 Opening first stream: ${firstStream.href}\n`);

      // Navigate to the stream
      await page.goto(firstStream.href, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      console.log('⏳ Waiting for stream to load...\n');
      await new Promise(r => setTimeout(r, 5000));

      // Look for video elements or streaming components
      const streamInfo = await page.evaluate(() => {
        const info = {
          videos: [],
          iframes: [],
          canvas: [],
          webrtc: false
        };

        // Check for video elements
        document.querySelectorAll('video').forEach(video => {
          info.videos.push({
            src: video.src,
            currentSrc: video.currentSrc,
            readyState: video.readyState,
            networkState: video.networkState
          });
        });

        // Check for iframes
        document.querySelectorAll('iframe').forEach(iframe => {
          info.iframes.push({
            src: iframe.src,
            id: iframe.id
          });
        });

        // Check for canvas (might be rendering video)
        document.querySelectorAll('canvas').forEach(canvas => {
          info.canvas.push({
            width: canvas.width,
            height: canvas.height,
            id: canvas.id
          });
        });

        // Check if RTCPeerConnection exists (WebRTC)
        if (window.RTCPeerConnection) {
          info.webrtc = true;
        }

        return info;
      });

      console.log('\n📊 STREAM PAGE ANALYSIS:');
      console.log('Videos found:', streamInfo.videos.length);
      streamInfo.videos.forEach(v => {
        console.log('  - src:', v.src || 'none');
        console.log('    currentSrc:', v.currentSrc || 'none');
      });

      console.log('\nIframes found:', streamInfo.iframes.length);
      streamInfo.iframes.forEach(f => {
        console.log('  - src:', f.src);
      });

      console.log('\nCanvas elements:', streamInfo.canvas.length);
      console.log('WebRTC available:', streamInfo.webrtc);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }

  console.log('\n📋 CAPTURED STREAM DATA:');
  streamData.forEach(item => {
    console.log(`  ${item.type}: ${item.url}`);
  });

  console.log('\nKeeping browser open for 30 seconds to observe...');
  await new Promise(r => setTimeout(r, 30000));

  await browser.close();
}

openStream().catch(console.error);