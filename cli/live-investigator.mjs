import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

const TARGET_URL = 'https://pump.fun/live';
const ARTIFACT_DIR = path.resolve('./artifacts');
const RUN_LABEL = new Date().toISOString().replace(/[:.]/g, '-');

const interestingPattern = /(live|stream|broadcast|video|ivs|hls|playlist|websocket|socket|pump\.fun\/api|pumpportal|graphql|viewer|contract)/i;

const SCROLL_ITERATIONS = Number(process.env.PUMPSTREAMS_INVESTIGATOR_SCROLLS ?? '6');
const SCROLL_DELAY_MS = Number(process.env.PUMPSTREAMS_INVESTIGATOR_SCROLL_DELAY ?? '4000');
const CAPTURE_SCROLL_SHOTS = process.env.PUMPSTREAMS_INVESTIGATOR_SCROLL_SHOTS !== '0';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function extractStreamCards(page) {
  return await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('a[href*="/live/"], a[href*="/coin/"]'));
    return cards.map((card, index) => {
      const rect = card.getBoundingClientRect();
      const img = card.querySelector('img');
      const badge = card.querySelector('[class*="Live" i], [data-testid*="live" i]');
      const href = card.href;
      const mintMatch = href && href.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
      return {
        href,
        mint: mintMatch ? mintMatch[1] : null,
        text: card.innerText.slice(0, 200),
        hasLiveBadge: Boolean(badge),
        imageSrc: img?.src || null,
        imageAlt: img?.alt || null,
        boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        index,
      };
    });
  });
}

async function scrollAndHarvest(page, { iterations, delayMs, logDir, captureShots }) {
  const aggregate = new Map();
  const stats = [];

  const record = (cards, iteration) => {
    let added = 0;
    cards.forEach((card) => {
      const key = card.mint || card.href || `${card.text}-${card.index}`;
      if (!aggregate.has(key)) {
        aggregate.set(key, { ...card, discoveredAtScroll: iteration });
        added += 1;
      }
    });
    stats.push({ iteration, total: aggregate.size, added });
    return added;
  };

  const initialCards = await extractStreamCards(page);
  record(initialCards, 0);

  if (iterations <= 0) {
    return { cards: Array.from(aggregate.values()), stats, iterationsUsed: 0 };
  }

  let iterationsUsed = 0;
  let stagnant = 0;

  for (let i = 0; i < iterations; i += 1) {
    iterationsUsed = i + 1;
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
    await sleep(delayMs);

    if (captureShots) {
      const shotPath = path.join(logDir, `pump-live-scroll-${String(iterationsUsed).padStart(2, '0')}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
    }

    const cards = await extractStreamCards(page);
    const added = record(cards, iterationsUsed);
    if (added === 0) {
      stagnant += 1;
      if (stagnant >= 2) {
        break;
      }
    } else {
      stagnant = 0;
    }
  }

  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
  await sleep(750);

  return {
    cards: Array.from(aggregate.values()),
    stats,
    iterationsUsed,
  };
}

async function main() {
  await ensureDir(ARTIFACT_DIR);
  const logDir = path.join(ARTIFACT_DIR, RUN_LABEL);
  await ensureDir(logDir);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--enable-logging',
      '--ignore-certificate-errors'
    ],
    defaultViewport: {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1
    }
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const client = await page.target().createCDPSession();
  await client.send('Network.enable');

  const requests = new Map();
  const responses = new Map();
  const responseBodies = new Map();
  const websocketEvents = [];

  client.on('Network.requestWillBeSent', async (params) => {
    const { requestId, request, type, wallTime } = params;
    const entry = {
      id: requestId,
      url: request.url,
      method: request.method,
      type,
      timestamp: wallTime,
      headers: request.headers,
    };

    if (interestingPattern.test(entry.url)) {
      if (request.hasPostData) {
        try {
          const post = await client.send('Network.getRequestPostData', { requestId });
          if (post?.postData) {
            entry.postData = post.postData;
          }
        } catch (error) {
          entry.postDataError = error.message;
        }
      }

      requests.set(requestId, entry);
    }
  });

  client.on('Network.responseReceived', (params) => {
    const { requestId, response } = params;
    if (!requests.has(requestId) && !interestingPattern.test(response.url)) {
      return;
    }

    responses.set(requestId, {
      id: requestId,
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      mimeType: response.mimeType,
      remoteIPAddress: response.remoteIPAddress,
      headers: response.headers,
    });
  });

  client.on('Network.loadingFinished', async (params) => {
    const { requestId, encodedDataLength } = params;
    if (!responses.has(requestId)) {
      return;
    }

    const responseMeta = responses.get(requestId);
    const isBinary = responseMeta.mimeType && !responseMeta.mimeType.includes('json') && !responseMeta.mimeType.includes('text');
    const sizeLimit = 512 * 1024; // 512 KB

    try {
      if (!isBinary && encodedDataLength <= sizeLimit) {
        const bodyResult = await client.send('Network.getResponseBody', { requestId });
        if (bodyResult?.body) {
          responseBodies.set(requestId, {
            ...responseMeta,
            body: bodyResult.body,
          });
        }
      }
    } catch (error) {
      // Some responses cannot be fetched (e.g., cross-origin with opaque response)
    }
  });

  client.on('Network.webSocketCreated', (params) => {
    websocketEvents.push({
      type: 'created',
      time: Date.now(),
      requestId: params.requestId,
      url: params.url,
      initiator: params.initiator,
    });
  });

  client.on('Network.webSocketFrameSent', (params) => {
    websocketEvents.push({
      type: 'sent',
      time: Date.now(),
      requestId: params.requestId,
      opcode: params.response.opcode,
      payload: params.response.payloadData,
    });
  });

  client.on('Network.webSocketFrameReceived', (params) => {
    websocketEvents.push({
      type: 'received',
      time: Date.now(),
      requestId: params.requestId,
      opcode: params.response.opcode,
      payload: params.response.payloadData?.length > 500
        ? params.response.payloadData.slice(0, 500) + '...'
        : params.response.payloadData,
    });
  });

  const consoleMessages = [];
  page.on('console', (msg) => {
    consoleMessages.push({
      timestamp: new Date().toISOString(),
      type: msg.type(),
      text: msg.text(),
    });
  });

  const errors = [];
  page.on('pageerror', (err) => {
    errors.push({
      timestamp: new Date().toISOString(),
      message: err.message,
      stack: err.stack,
    });
  });

  console.log('Navigating to pump.fun/live...');
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('body', { timeout: 60000 });
  // Give client-side bundles time to hydrate before inspection
  await sleep(5000);
  console.log('Initial load reached DOMContentLoaded. Gathering data...');

  await sleep(15000);

  // Extract Next.js data and stream card info
  const result = await page.evaluate(() => {
    const data = {
      location: document.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      nextData: typeof window.__NEXT_DATA__ === 'object' ? window.__NEXT_DATA__ : null,
      streamCards: [],
      visibleStats: {},
    };

    // Grab stream cards (top-level anchors with live indicators)
    const cards = document.querySelectorAll('a[href*="/live/"], a[href*="/coin/"]');
    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      if (rect.width < 150 || rect.height < 120) return;
      const badge = card.querySelector('[class*="Live" i], [data-testid*="live" i]');
      const img = card.querySelector('img');
      const meta = {
        href: card.href,
        text: card.innerText.slice(0, 200),
        hasLiveBadge: Boolean(badge),
        imageSrc: img?.src || null,
        imageAlt: img?.alt || null,
        boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
      data.streamCards.push(meta);
    });

    // Attempt to grab any global state the page exposes
    const globalKeys = ['__PUMP_STATE__', '__NUXT__', 'APP_INITIAL_STATE'];
    data.globals = globalKeys.reduce((acc, key) => {
      if (window[key]) {
        acc[key] = window[key];
      }
      return acc;
    }, {});

    return data;
  });

  await page.screenshot({
    path: path.join(logDir, 'pump-live.png'),
    fullPage: true,
  });

  const scrollCapture = await scrollAndHarvest(page, {
    iterations: SCROLL_ITERATIONS,
    delayMs: SCROLL_DELAY_MS,
    logDir,
    captureShots: CAPTURE_SCROLL_SHOTS,
  });

  result.streamCards = scrollCapture.cards;
  result.scrollStats = scrollCapture.stats;
  result.scrollIterationsConfigured = SCROLL_ITERATIONS;
  result.scrollIterationsPerformed = scrollCapture.iterationsUsed;

  // Try to click the first live stream card for deeper discovery
  if (result.streamCards.length > 0) {
    console.log('Attempting to open first stream card...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => null),
      page.evaluate(() => {
        const cards = document.querySelectorAll('a[href*="/live/"], a[href*="/coin/"]');
        for (const card of cards) {
          const rect = card.getBoundingClientRect();
          if (rect.width >= 150 && rect.height >= 120) {
            card.click();
            break;
          }
        }
      }),
    ]);

    await sleep(10000);

    await page.screenshot({
      path: path.join(logDir, 'pump-live-detail.png'),
      fullPage: true,
    });
  }

  const pageContent = await page.content();

  await browser.close();

  const summary = {
    fetchedAt: new Date().toISOString(),
    target: TARGET_URL,
    runLabel: RUN_LABEL,
    streamCards: result.streamCards,
    streamCardCount: result.streamCards.length,
    scrollCapture: {
      configuredIterations: SCROLL_ITERATIONS,
      delayMs: SCROLL_DELAY_MS,
      iterationsPerformed: scrollCapture.iterationsUsed,
      screenshotsCaptured: CAPTURE_SCROLL_SHOTS ? scrollCapture.iterationsUsed : 0,
      stats: scrollCapture.stats,
    },
    nextDataExists: Boolean(result.nextData),
    globals: result.globals,
    consoleMessages,
    errors,
    websocketSummary: websocketEvents.slice(0, 100),
    totalWebSocketEvents: websocketEvents.length,
    interestingRequests: Array.from(requests.values()),
    interestingResponses: Array.from(responses.values()),
    capturedResponseBodies: Array.from(responseBodies.values()),
  };

  await writeJson(path.join(logDir, 'page-data.json'), result);
  await writeJson(path.join(logDir, 'summary.json'), summary);
  await fs.writeFile(path.join(logDir, 'page.html'), pageContent);
  await writeJson(path.join(logDir, 'console.json'), consoleMessages);
  await writeJson(path.join(logDir, 'errors.json'), errors);
  await writeJson(path.join(logDir, 'websockets.json'), websocketEvents);
  await writeJson(path.join(logDir, 'requests.json'), Array.from(requests.values()));
  await writeJson(path.join(logDir, 'responses.json'), Array.from(responses.values()));
  await writeJson(path.join(logDir, 'response-bodies.json'), Array.from(responseBodies.values()));

  console.log(`Artifacts saved to ${logDir}`);
}

main().catch(async (error) => {
  console.error('Investigation failed:', error);
  process.exit(1);
});
