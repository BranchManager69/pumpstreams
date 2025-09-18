import { getServiceClient } from './supabase';
import type { DashboardPayload, DashboardTotals, DashboardEvent } from '../types/dashboard';
import type { DashboardStream, SnapshotPoint, StreamMomentumMetrics } from './types';

const TOP_LIMIT = Number(process.env.DASHBOARD_TOP_LIMIT ?? '100');
const LOOKBACK_MINUTES = Number(process.env.DASHBOARD_LOOKBACK_MINUTES ?? '180');
const FETCH_LIMIT = Math.min(
  Number(process.env.DASHBOARD_FETCH_LIMIT ?? process.env.LIVE_POLLER_LIMIT ?? '500'),
  1000
);
const HISTORY_CHUNK_SIZE = Number(process.env.DASHBOARD_HISTORY_CHUNK_SIZE ?? '100');
const HISTORY_MAX_POINTS = Number(process.env.DASHBOARD_HISTORY_MAX_POINTS ?? '180');
const MINT_LIMIT = Math.min(TOP_LIMIT * 3, FETCH_LIMIT);
const MOMENTUM_WINDOWS_MINUTES = [5, 15] as const;
const LIVE_THRESHOLD_SECONDS = Number(process.env.DASHBOARD_LIVE_THRESHOLD_SECONDS ?? '90');
const COOLDOWN_THRESHOLD_SECONDS = Number(process.env.DASHBOARD_COOLDOWN_THRESHOLD_SECONDS ?? '300');
const ENDED_THRESHOLD_SECONDS = Number(process.env.DASHBOARD_ENDED_THRESHOLD_SECONDS ?? '3600');
const SPOTLIGHT_LIMIT = Number(process.env.DASHBOARD_SPOTLIGHT_LIMIT ?? '8');
const DROP_VIEWER_DELTA = Number(process.env.DASHBOARD_DROP_VIEWER_DELTA ?? '100');
const SURGE_VIEWER_DELTA = Number(process.env.DASHBOARD_SURGE_VIEWER_DELTA ?? '120');

interface LatestRow {
  mint_id: string;
  fetched_at: string;
  num_participants: number | null;
  market_cap: number | null;
  usd_market_cap?: number | null;
  thumbnail: string | null;
  is_live?: boolean | null;
  livestream: Record<string, any> | null;
}

interface HistoryRow {
  mint_id: string;
  fetched_at: string;
  num_participants: number | null;
  market_cap: number | null;
}

function buildHistoryMap(rows: HistoryRow[], mintedOrder: string[]): Map<string, SnapshotPoint[]> {
  const historyMap = new Map<string, SnapshotPoint[]>();
  for (const mint of mintedOrder) {
    historyMap.set(mint, []);
  }

  for (const row of rows) {
    if (!historyMap.has(row.mint_id)) {
      historyMap.set(row.mint_id, []);
    }
    historyMap.get(row.mint_id)!.push({
      fetched_at: row.fetched_at,
      num_participants: row.num_participants,
      market_cap: row.market_cap,
    });
  }

  for (const [, points] of historyMap) {
    points.sort((a, b) => new Date(a.fetched_at).getTime() - new Date(b.fetched_at).getTime());
  }

  return historyMap;
}

function computeMomentum(history: SnapshotPoint[], windowMinutes: number): number | null {
  if (!history.length) return null;
  const windowMs = windowMinutes * 60 * 1000;
  const nowMs = Date.now();
  const windowStart = nowMs - windowMs;

  const relevantPoints = history.filter((point) => {
    const pointMs = new Date(point.fetched_at).getTime();
    return Number.isFinite(pointMs) && pointMs >= windowStart;
  });

  if (relevantPoints.length < 2) return null;

  const first = relevantPoints[0].num_participants;
  const last = relevantPoints[relevantPoints.length - 1].num_participants;
  if (first === null || first === undefined || last === null || last === undefined) return null;

  return last - first;
}

function buildMomentumMetrics(history: SnapshotPoint[]): StreamMomentumMetrics {
  const metrics = MOMENTUM_WINDOWS_MINUTES.map((minutes) => computeMomentum(history, minutes));
  const [delta5, delta15] = metrics;
  const windowMinutes = MOMENTUM_WINDOWS_MINUTES[0];
  const velocity = delta5 !== null && windowMinutes > 0 ? delta5 / windowMinutes : null;

  return {
    delta5m: delta5,
    delta15m: delta15,
    velocityPerMin: velocity,
  };
}

function calculatePeakViewers(history: SnapshotPoint[]): number | null {
  let peak: number | null = null;
  for (const point of history) {
    if (point.num_participants === null || point.num_participants === undefined) continue;
    if (peak === null || point.num_participants > peak) {
      peak = point.num_participants;
    }
  }
  return peak;
}

function inferStatus(ageSeconds: number | null, meta: LatestRow['livestream'] | null): DashboardStream['status'] {
  if (ageSeconds === null) return 'archived';
  if (ageSeconds <= LIVE_THRESHOLD_SECONDS) return 'live';
  if (ageSeconds <= COOLDOWN_THRESHOLD_SECONDS) return 'cooldown';
  if (ageSeconds <= ENDED_THRESHOLD_SECONDS) return 'ended';
  const isComplete = Boolean(meta?.complete ?? meta?.is_complete ?? false);
  return isComplete ? 'ended' : 'archived';
}

function buildTotals(streams: DashboardStream[]): DashboardTotals {
  let totalStreams = 0;
  let liveStreams = 0;
  let coolingStreams = 0;
  let endedStreams = 0;
  let totalLiveViewers = 0;
  let totalLiveMarketCap = 0;

  for (const stream of streams) {
    totalStreams += 1;
    if (stream.status === 'live') {
      liveStreams += 1;
      totalLiveViewers += stream.metrics.viewers.current ?? 0;
      totalLiveMarketCap += stream.metrics.marketCap.current ?? 0;
    } else if (stream.status === 'cooldown') {
      coolingStreams += 1;
    } else if (stream.status === 'ended') {
      endedStreams += 1;
    }
  }

  return {
    totalStreams,
    liveStreams,
    coolingStreams,
    endedStreams,
    totalLiveViewers,
    totalLiveMarketCap,
  };
}

export async function fetchTopStreams(): Promise<DashboardPayload> {
  const supabase = getServiceClient();
  const lookbackIso = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();

  const latestLimit = Math.max(TOP_LIMIT * 3, FETCH_LIMIT);
  const { data: latestRows, error: latestError } = await supabase
    .from('livestream_latest')
    .select('mint_id, fetched_at, num_participants, market_cap, usd_market_cap, thumbnail, is_live, livestream')
    .order('num_participants', { ascending: false })
    .limit(latestLimit);

  if (latestError) {
    if (latestError.message.includes('Could not find the table')) {
      return {
        generatedAt: new Date().toISOString(),
        windowMinutes: LOOKBACK_MINUTES,
        streams: [],
        spotlight: [],
        totals: {
          totalStreams: 0,
          liveStreams: 0,
          coolingStreams: 0,
          endedStreams: 0,
          totalLiveViewers: 0,
          totalLiveMarketCap: 0,
        },
        events: [],
      };
    }
    throw new Error(`Failed to fetch latest livestream snapshots: ${latestError.message}`);
  }

  const validRows = (latestRows ?? []).filter((row) => Boolean(row?.mint_id)) as LatestRow[];

  const mintOrder: string[] = [];
  const seen = new Set<string>();
  for (const row of validRows) {
    if (!seen.has(row.mint_id)) {
      seen.add(row.mint_id);
      mintOrder.push(row.mint_id);
    }
    if (mintOrder.length >= MINT_LIMIT) {
      break;
    }
  }

  const historyRows: HistoryRow[] = [];
  for (let i = 0; i < mintOrder.length; i += HISTORY_CHUNK_SIZE) {
    const chunk = mintOrder.slice(i, i + HISTORY_CHUNK_SIZE);
    const { data, error } = await supabase
      .from('livestream_snapshots')
      .select('mint_id, fetched_at, num_participants, market_cap')
      .in('mint_id', chunk)
      .gte('fetched_at', lookbackIso)
      .order('fetched_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch livestream histories (chunk ${i / HISTORY_CHUNK_SIZE + 1}): ${error.message}`);
    }

    historyRows.push(...((data ?? []) as HistoryRow[]));
  }

  const historyMap = buildHistoryMap(historyRows, mintOrder);

  const latestByMint = new Map<string, LatestRow>();
  for (const row of validRows) {
    if (!latestByMint.has(row.mint_id)) {
      latestByMint.set(row.mint_id, row);
    }
  }

  const nowMs = Date.now();

  const streams: DashboardStream[] = mintOrder.map((mintId) => {
    const latest = latestByMint.get(mintId);
    if (!latest) {
      return {
        mintId,
        name: null,
        symbol: null,
        thumbnail: null,
        status: 'ended',
        latestAt: null,
        metrics: {
          lastSnapshotAgeSeconds: null,
          viewers: {
            current: null,
            peak: null,
            momentum: { delta5m: null, delta15m: null, velocityPerMin: null },
          },
          marketCap: {
            current: null,
            momentum: { delta5m: null, delta15m: null, velocityPerMin: null },
          },
        },
        sparkline: [],
        score: 0,
        livestreamMeta: null,
      };
    }

    const history = historyMap.get(mintId) ?? [];
    const trimmedHistory = HISTORY_MAX_POINTS > 0 ? history.slice(-HISTORY_MAX_POINTS) : history;

    const latestAt = latest.fetched_at ?? null;
    const latestTimestamp = latestAt ? new Date(latestAt).getTime() : null;
    const ageSeconds = latestTimestamp ? Math.max(0, Math.floor((nowMs - latestTimestamp) / 1000)) : null;

    const currentViewers = latest.num_participants ?? null;
    const currentMarketCap = latest.market_cap ?? null;

    const viewerMomentum = buildMomentumMetrics(trimmedHistory);
    const marketCapMomentum = (() => {
      if (!trimmedHistory.length) {
        return { delta5m: null, delta15m: null, velocityPerMin: null };
      }
      const windowMs = MOMENTUM_WINDOWS_MINUTES[0] * 60 * 1000;
      const now = Date.now();
      const windowStart = now - windowMs;
      const relevant = trimmedHistory.filter((point) => {
        const pointMs = new Date(point.fetched_at).getTime();
        return Number.isFinite(pointMs) && pointMs >= windowStart;
      });
      if (relevant.length < 2) {
        return { delta5m: null, delta15m: null, velocityPerMin: null };
      }
      const delta5 = computeMomentum(trimmedHistory.map((point) => ({
        fetched_at: point.fetched_at,
        num_participants: point.market_cap,
        market_cap: point.market_cap,
      })), MOMENTUM_WINDOWS_MINUTES[0]);
      const delta15 = computeMomentum(trimmedHistory.map((point) => ({
        fetched_at: point.fetched_at,
        num_participants: point.market_cap,
        market_cap: point.market_cap,
      })), MOMENTUM_WINDOWS_MINUTES[1]);
      const velocityPerMin = delta5 !== null && MOMENTUM_WINDOWS_MINUTES[0] > 0 ? delta5 / MOMENTUM_WINDOWS_MINUTES[0] : null;
      return {
        delta5m: delta5,
        delta15m: delta15,
        velocityPerMin,
      };
    })();

    const meta = latest.livestream ?? null;
    const status = inferStatus(ageSeconds, meta);
    let freshnessWeight = 0.05;
    if (status === 'live') {
      freshnessWeight = 1;
    } else if (status === 'cooldown') {
      freshnessWeight = 0.2;
    } else if (status === 'ended') {
      freshnessWeight = 0.05;
    } else {
      freshnessWeight = 0.001;
    }
    const momentumBoost = Math.max(viewerMomentum.delta5m ?? 0, 0);
    const score = ((currentViewers ?? 0) + momentumBoost) * freshnessWeight;

    return {
      mintId,
      name: (meta?.name as string | undefined) ?? null,
      symbol: (meta?.symbol as string | undefined) ?? null,
      thumbnail: latest.thumbnail ?? (meta?.thumbnail as string | undefined) ?? null,
      status,
      latestAt,
      metrics: {
        lastSnapshotAgeSeconds: ageSeconds,
        viewers: {
          current: currentViewers,
          peak: calculatePeakViewers(trimmedHistory),
          momentum: viewerMomentum,
        },
        marketCap: {
          current: currentMarketCap,
          momentum: marketCapMomentum,
        },
      },
      sparkline: trimmedHistory,
      score,
      livestreamMeta: {
        isCurrentlyLive: (latest.is_live ?? meta?.is_currently_live) ?? null,
        isComplete: (meta?.complete ?? meta?.is_complete) ?? null,
        totalSupply: (meta?.total_supply as number | undefined) ?? null,
      },
    };
  });

  const totals = buildTotals(streams);

  const spotlight = [...streams]
    .filter((stream) => stream.status === 'live')
    .sort((a, b) => b.score - a.score)
    .slice(0, SPOTLIGHT_LIMIT);

  const events: DashboardEvent[] = [];
  for (const stream of streams) {
    const delta5 = stream.metrics.viewers.momentum.delta5m ?? 0;
    const age = stream.metrics.lastSnapshotAgeSeconds ?? null;
    if (stream.status === 'cooldown' && (stream.metrics.viewers.current ?? 0) > 0) {
      events.push({
        type: 'drop',
        mintId: stream.mintId,
        message: `${stream.name ?? stream.symbol ?? stream.mintId.slice(0, 6)} audio/video offline ${age !== null ? `${Math.floor(age)}s` : ''} ago`,
        severity: 'warning',
        timestamp: stream.latestAt,
      });
    } else if (stream.status === 'live' && delta5 >= SURGE_VIEWER_DELTA) {
      events.push({
        type: 'surge',
        mintId: stream.mintId,
        message: `${stream.name ?? stream.symbol ?? stream.mintId.slice(0, 6)} up ${delta5.toLocaleString()} viewers in 5m`,
        severity: 'info',
        timestamp: stream.latestAt,
      });
    } else if (stream.status === 'live' && delta5 <= -DROP_VIEWER_DELTA) {
      events.push({
        type: 'drop',
        mintId: stream.mintId,
        message: `${stream.name ?? stream.symbol ?? stream.mintId.slice(0, 6)} down ${Math.abs(delta5).toLocaleString()} viewers in 5m`,
        severity: 'warning',
        timestamp: stream.latestAt,
      });
    }
  }

  events.sort((a, b) => (b.timestamp ? new Date(b.timestamp).getTime() : 0) - (a.timestamp ? new Date(a.timestamp).getTime() : 0));

  return {
    generatedAt: new Date().toISOString(),
    windowMinutes: LOOKBACK_MINUTES,
    streams,
    spotlight,
    totals,
    events: events.slice(0, 12),
  };
}

export function getDashboardConfig() {
  return {
    topLimit: TOP_LIMIT,
    lookbackMinutes: LOOKBACK_MINUTES,
  };
}
