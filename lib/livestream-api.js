import { setTimeout as sleep } from 'timers/promises';
import { Buffer } from 'node:buffer';

const env = (key, fallback) => (process.env[key] ? process.env[key].trim() : fallback);

export const runtimeConfig = {
  frontendApi: env('PUMPSTREAMS_FRONTEND_API', 'https://frontend-api-v3.pump.fun'),
  livestreamApi: env('PUMPSTREAMS_LIVESTREAM_API', 'https://livestream-api.pump.fun'),
  livekitEdge: env('PUMPSTREAMS_LIVEKIT_EDGE', 'https://pump-prod-tg2x8veh.livekit.cloud'),
  origin: env('PUMPSTREAMS_ORIGIN', 'https://pump.fun'),
  referer: env('PUMPSTREAMS_REFERER', 'https://pump.fun/live'),
};

const defaultHeaders = {
  accept: 'application/json',
  'accept-language': 'en-US,en;q=0.9',
  origin: runtimeConfig.origin,
  referer: runtimeConfig.referer,
};

const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.PUMPSTREAMS_FETCH_TIMEOUT_MS ?? '15000');

async function request(url, options = {}) {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal, ...rest } = options;

  const controller = new AbortController();
  if (signal) {
    const forwardAbort = () => {
      const reason = signal.reason ?? new Error(`Request to ${url} was aborted`);
      controller.abort(reason);
    };
    if (signal.aborted) {
      forwardAbort();
    } else {
      signal.addEventListener('abort', forwardAbort, { once: true });
    }
  }

  const init = {
    headers: {
      ...defaultHeaders,
      ...(rest.headers || {}),
    },
    ...rest,
    signal: controller.signal,
  };

  const shouldTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  const timeoutError = shouldTimeout
    ? new Error(`Request to ${url} timed out after ${timeoutMs}ms`)
    : null;
  const timeoutId = shouldTimeout ? setTimeout(() => controller.abort(timeoutError), timeoutMs) : null;
  timeoutId?.unref?.();

  let res;
  try {
    res = await fetch(url, init);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const body = await safeRead(res);
    throw new Error(`Request failed ${res.status} ${res.statusText} for ${url}\n${body}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

async function safeRead(res) {
  try {
    return await res.text();
  } catch {
    return '<unavailable>';
  }
}

export async function getCurrentlyLive({ offset = 0, limit = 60, includeNsfw = false } = {}) {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    sort: 'currently_live',
    order: 'DESC',
    includeNsfw: String(includeNsfw),
  });
  const url = `${runtimeConfig.frontendApi}/coins/currently-live?${params.toString()}`;
  const data = await request(url);
  return Array.isArray(data) ? data : [];
}

export async function getLivestreamMeta(mintId) {
  if (!mintId) throw new Error('mintId is required');
  const params = new URLSearchParams({ mintId });
  const url = `${runtimeConfig.livestreamApi}/livestream?${params.toString()}`;
  const data = await request(url);
  return data;
}

export async function getLivestreamClips(mintId, { limit = 20, clipType = 'COMPLETE' } = {}) {
  if (!mintId) throw new Error('mintId is required');
  const params = new URLSearchParams({ limit: String(limit), clipType });
  const url = `${runtimeConfig.livestreamApi}/clips/${mintId}?${params.toString()}`;
  const data = await request(url);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.clips)) return data.clips;
  return [];
}

export async function isApprovedCreator(mintId) {
  if (!mintId) throw new Error('mintId is required');
  const params = new URLSearchParams({ mintId });
  const url = `${runtimeConfig.livestreamApi}/livestream/is-approved-creator?${params.toString()}`;
  const data = await request(url);
  return Boolean(data?.isApproved || data?.approved || data);
}

export async function getJoinToken(mintId, { viewer = true } = {}) {
  if (!mintId) throw new Error('mintId is required');
  const url = `${runtimeConfig.livestreamApi}/livestream/join`;
  const payload = { mintId, viewer };
  const data = await request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return data;
}

export async function getLivekitRegions(token) {
  if (!token) throw new Error('LiveKit access token is required');
  const url = `${runtimeConfig.livekitEdge}/settings/regions`;
  const response = await request(url, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  return response?.regions || [];
}

export async function getLivekitConnectionDetails(mintId) {
  const join = await getJoinToken(mintId);
  const regions = await getLivekitRegions(join.token).catch(() => []);

  let regionUrl = runtimeConfig.livekitEdge;
  if (Array.isArray(regions) && regions.length > 0) {
    const best = [...regions].sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity))[0];
    if (best?.url) {
      regionUrl = best.url;
    }
  }

  return {
    mintId,
    join,
    regionUrl,
    regions,
  };
}

export async function getLivestreamSnapshot(mintId, { includeClips = false, includeToken = false } = {}) {
  const [meta, approved] = await Promise.all([
    getLivestreamMeta(mintId),
    isApprovedCreator(mintId).catch(() => false),
  ]);

  const snapshot = {
    mintId,
    livestream: meta,
    isApprovedCreator: approved,
  };

  if (includeClips) {
    snapshot.clips = await getLivestreamClips(mintId).catch(() => []);
  }

  if (includeToken) {
    snapshot.join = await getJoinToken(mintId).catch((error) => ({ error: error.message }));
  }

  return snapshot;
}

export function decodeJwt(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export async function getLiveOverview({ limit = 20 } = {}) {
  const streams = await getCurrentlyLive({ limit });
  const snapshots = [];

  for (const stream of streams) {
    await sleep(50);
    const meta = await getLivestreamMeta(stream.mint).catch(() => null);
    snapshots.push({
      mint: stream.mint,
      name: stream.name,
      symbol: stream.symbol,
      marketCap: stream.market_cap,
      usdMarketCap: stream.usd_market_cap,
      numParticipants: meta?.numParticipants ?? stream.num_participants ?? null,
      thumbnail: stream.thumbnail,
      streamInfo: meta,
    });
  }

  return snapshots;
}
