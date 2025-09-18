import puppeteer from 'puppeteer';

console.log('🎬 FINDING LIVE STREAMS ON PUMP.FUN...\n');

async function findStreams() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Intercept all network requests
  const streamUrls = new Set();
  const apiCalls = new Set();

  await page.setRequestInterception(true);

  page.on('request', request => {
    const url = request.url();

    // Look for video/streaming related URLs
    if (url.includes('.m3u8') || url.includes('.ts') || url.includes('.mp4') ||
        url.includes('stream') || url.includes('video') || url.includes('broadcast') ||
        url.includes('live') || url.includes('hls') || url.includes('dash') ||
        url.includes('rtmp') || url.includes('flv') || url.includes('webrtc')) {
      streamUrls.add(url);
      console.log('🎥 Stream URL found:', url);
    }

    // Look for API calls
    if (url.includes('api') && (url.includes('stream') || url.includes('live'))) {
      apiCalls.add(url);
      console.log('📡 API call:', url);
    }

    request.continue();
  });

  page.on('response', response => {
    const url = response.url();
    const headers = response.headers();

    // Check content-type for video
    const contentType = headers['content-type'] || '';
    if (contentType.includes('video') || contentType.includes('stream')) {
      console.log('🎬 Video response:', url, 'Type:', contentType);
    }
  });

  console.log('📱 Loading pump.fun/live...\n');

  try {
    await page.goto('https://pump.fun/live', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    console.log('⏳ Waiting for content to load...\n');
    await new Promise(r => setTimeout(r, 5000));

    // Look for video elements and iframes
    const pageContent = await page.evaluate(() => {
      const results = {
        videos: [],
        iframes: [],
        streamElements: [],
        scripts: []
      };

      // Find video elements
      document.querySelectorAll('video').forEach(video => {
        results.videos.push({
          src: video.src,
          currentSrc: video.currentSrc,
          poster: video.poster,
          id: video.id,
          className: video.className,
          dataset: Object.assign({}, video.dataset)
        });
      });

      // Find iframes (might be embedding external streams)
      document.querySelectorAll('iframe').forEach(iframe => {
        results.iframes.push({
          src: iframe.src,
          id: iframe.id,
          className: iframe.className,
          title: iframe.title
        });
      });

      // Find elements that might contain streams
      const streamSelectors = [
        '[class*="stream"]',
        '[class*="live"]',
        '[class*="video"]',
        '[class*="player"]',
        '[class*="broadcast"]',
        '[id*="stream"]',
        '[id*="live"]',
        '[id*="video"]',
        '[data-stream]',
        '[data-video]',
        '[data-broadcast]'
      ];

      streamSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          const info = {
            tag: el.tagName,
            id: el.id,
            className: el.className,
            innerHTML: el.innerHTML.substring(0, 200),
            dataset: Object.assign({}, el.dataset)
          };

          // Check if it has meaningful content
          if (el.innerHTML.length > 50) {
            results.streamElements.push(info);
          }
        });
      });

      // Look for script tags that might initialize streams
      document.querySelectorAll('script').forEach(script => {
        const src = script.src || '';
        const content = script.innerHTML || '';

        if (src.includes('stream') || src.includes('video') || src.includes('player') ||
            content.includes('stream') || content.includes('video') || content.includes('player')) {
          results.scripts.push({
            src: src,
            hasStreamContent: content.includes('stream') || content.includes('video')
          });
        }
      });

      return results;
    });

    console.log('\n📊 ANALYSIS RESULTS:');
    console.log('='.repeat(50));

    console.log('\n🎥 Video Elements:', pageContent.videos.length);
    if (pageContent.videos.length > 0) {
      pageContent.videos.forEach((v, i) => {
        console.log(`\nVideo ${i + 1}:`);
        console.log('  src:', v.src || 'none');
        console.log('  currentSrc:', v.currentSrc || 'none');
        console.log('  id:', v.id || 'none');
        console.log('  class:', v.className || 'none');
      });
    }

    console.log('\n🖼️ Iframes:', pageContent.iframes.length);
    if (pageContent.iframes.length > 0) {
      pageContent.iframes.forEach((f, i) => {
        console.log(`\nIframe ${i + 1}:`);
        console.log('  src:', f.src);
        console.log('  title:', f.title || 'none');
      });
    }

    console.log('\n🎬 Stream-related Elements:', pageContent.streamElements.length);
    if (pageContent.streamElements.length > 0) {
      console.log('First 3 elements:');
      pageContent.streamElements.slice(0, 3).forEach((el, i) => {
        console.log(`\n${i + 1}. ${el.tag} (id: ${el.id}, class: ${el.className})`);
        if (Object.keys(el.dataset).length > 0) {
          console.log('  Data attributes:', el.dataset);
        }
      });
    }

    console.log('\n📜 Stream-related Scripts:', pageContent.scripts.length);

    // Try clicking on stream elements to trigger loading
    console.log('\n🖱️ Looking for clickable stream cards...');
    const clickableStreams = await page.evaluate(() => {
      const cards = document.querySelectorAll('[class*="card"], [class*="stream"], a[href*="live"]');
      const clickable = [];
      cards.forEach(card => {
        if (card.offsetHeight > 100) { // Likely a meaningful card
          clickable.push({
            tag: card.tagName,
            text: card.innerText?.substring(0, 50),
            href: card.href
          });
        }
      });
      return clickable;
    });

    if (clickableStreams.length > 0) {
      console.log(`Found ${clickableStreams.length} potential stream cards`);
      clickableStreams.slice(0, 3).forEach(c => {
        console.log(`  - ${c.text || 'No text'} (${c.href || 'no href'})`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  }

  console.log('\n📋 NETWORK SUMMARY:');
  console.log('Stream URLs found:', streamUrls.size);
  streamUrls.forEach(url => console.log('  -', url));

  console.log('\nAPI calls found:', apiCalls.size);
  apiCalls.forEach(url => console.log('  -', url));

  await browser.close();
}

findStreams().catch(console.error);