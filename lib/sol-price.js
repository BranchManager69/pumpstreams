import { setTimeout as delay } from 'node:timers/promises';

let cachedPrice = null;
let lastFetch = 0;
let inflight = null;

function normalizeCacheMs(cacheMs) {
  if (!Number.isFinite(cacheMs) || cacheMs <= 0) {
    return 15000;
  }
  return cacheMs;
}

export function getCachedSolPriceUSD() {
  return cachedPrice;
}

export async function getSolPriceUSD({ cacheMs = 15000, retries = 2 } = {}) {
  const cacheWindow = normalizeCacheMs(cacheMs);
  const now = Date.now();

  if (cachedPrice !== null && now - lastFetch < cacheWindow) {
    return cachedPrice;
  }

  if (inflight) {
    return inflight;
  }

  inflight = fetchWithRetry(retries).finally(() => {
    inflight = null;
  });

  return inflight;
}

async function fetchWithRetry(retries) {
  const endpoint = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';
  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const price = payload?.solana?.usd;

      if (typeof price !== 'number' || Number.isNaN(price)) {
        throw new Error('Unexpected response shape');
      }

      cachedPrice = price;
      lastFetch = Date.now();
      return price;
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt > retries) {
        break;
      }
      await delay(Math.min(500 * attempt, 2000));
    }
  }

  throw new Error(`Failed to fetch SOL price: ${lastError?.message ?? 'unknown error'}`);
}
