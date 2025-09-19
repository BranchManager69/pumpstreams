import { setTimeout as delay } from 'node:timers/promises';

const caches = new Map();
const inflight = new Map();

function getCacheEntry(assetId) {
  const entry = caches.get(assetId);
  if (!entry) {
    return null;
  }
  return entry;
}

function normalizeCacheMs(cacheMs) {
  if (!Number.isFinite(cacheMs) || cacheMs <= 0) {
    return 15000;
  }
  return cacheMs;
}

export function getCachedAssetPriceUSD(assetId) {
  const entry = getCacheEntry(assetId);
  return entry?.price ?? null;
}

export function getCachedSolPriceUSD() {
  return getCachedAssetPriceUSD('solana');
}

export async function getAssetPriceUSD({ assetId, cacheMs = 15000, retries = 2 } = {}) {
  if (!assetId) {
    throw new Error('assetId is required');
  }

  const cacheWindow = normalizeCacheMs(cacheMs);
  const now = Date.now();
  const entry = getCacheEntry(assetId);

  if (entry?.price != null && now - entry.fetchedAt < cacheWindow) {
    return entry.price;
  }

  const inflightRequest = inflight.get(assetId);
  if (inflightRequest) {
    return inflightRequest;
  }

  const request = fetchWithRetry(assetId, retries).finally(() => {
    inflight.delete(assetId);
  });

  inflight.set(assetId, request);
  return request;
}

export async function getSolPriceUSD({ cacheMs = 15000, retries = 2 } = {}) {
  return getAssetPriceUSD({ assetId: 'solana', cacheMs, retries });
}

async function fetchWithRetry(assetId, retries) {
  const endpoint = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(assetId)}&vs_currencies=usd`;
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
      const price = payload?.[assetId]?.usd;

      if (typeof price !== 'number' || Number.isNaN(price)) {
        throw new Error('Unexpected response shape');
      }

      caches.set(assetId, { price, fetchedAt: Date.now() });
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

  throw new Error(`Failed to fetch ${assetId} price: ${lastError?.message ?? 'unknown error'}`);
}
