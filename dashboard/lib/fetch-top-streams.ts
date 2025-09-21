import { getServiceClient } from './supabase';
import { fetchFreshLatestViaPg } from './pg';
import fs from 'fs/promises';
import path from 'path';
import type { DashboardPayload, DashboardTotals, DashboardEvent } from '../types/dashboard';
import type { DashboardStream, StreamMetadata, StreamSort } from './types';

const TOP_LIMIT = Number(process.env.DASHBOARD_TOP_LIMIT ?? '100');
const FETCH_LIMIT = Math.min(
  Number(process.env.DASHBOARD_FETCH_LIMIT ?? process.env.LIVE_POLLER_LIMIT ?? '1000'),
  1000
);
const DEFAULT_SORT: StreamSort = process.env.DASHBOARD_DEFAULT_SORT === 'viewers' ? 'viewers' : 'marketCap';
const DEFAULT_POLLER_INTERVAL_MS = 30000;
const rawPollerIntervalMs = Number(process.env.LIVE_POLLER_INTERVAL_MS ?? DEFAULT_POLLER_INTERVAL_MS);
const POLLER_INTERVAL_MS = Number.isFinite(rawPollerIntervalMs) && rawPollerIntervalMs > 0 ? rawPollerIntervalMs : DEFAULT_POLLER_INTERVAL_MS;
const POLLER_INTERVAL_SECONDS = Math.max(1, Math.round(POLLER_INTERVAL_MS / 1000));
const LIVE_THRESHOLD_SECONDS = POLLER_INTERVAL_SECONDS;
const DROP_THRESHOLD_SECONDS = Math.max(LIVE_THRESHOLD_SECONDS * 2, LIVE_THRESHOLD_SECONDS + 1);
const SPOTLIGHT_LIMIT = Number(process.env.DASHBOARD_SPOTLIGHT_LIMIT ?? '8');
const WINDOW_MINUTES = Number(process.env.DASHBOARD_LOOKBACK_MINUTES ?? '180');
const API_TTL_MS = Math.max(1000, Number(process.env.DASHBOARD_API_TTL_MS ?? '8000'));

export const SORT_OPTIONS: StreamSort[] = ['marketCap', 'viewers'];

let lastPayload: (DashboardPayload & { config?: any }) | null = null;
let lastFetchedAtMs = 0;
let lastSource: 'snapshot' | 'pg' | 'supabase' | 'fallback' = 'fallback';

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

async function readLocalTopSnapshot() {
  try {
    const repoRoot = path.resolve(process.cwd(), '..');
    const filePath = path.join(repoRoot, 'artifacts', 'top', 'latest.json');
    const raw = await fs.readFile(filePath, 'utf8');
    const json = JSON.parse(raw ?? '{}');
    if (!json?.fetchedAt || !Array.isArray(json?.entries)) return null;
    return json;
  } catch {
    return null;
  }
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseSort(value: string | null | undefined): StreamSort {
  if (!value) return DEFAULT_SORT;
  const normalised = value.toLowerCase();
  return normalised === 'viewers' ? 'viewers' : 'marketCap';
}

function classifyStreamAge(ageSeconds: number | null): { status: DashboardStream['status']; countdownSeconds: number | null } | null {
  if (ageSeconds === null || !Number.isFinite(ageSeconds)) return null;
  if (ageSeconds <= LIVE_THRESHOLD_SECONDS) {
    return { status: 'live', countdownSeconds: null };
  }

  if (ageSeconds <= DROP_THRESHOLD_SECONDS) {
    return { status: 'disconnecting', countdownSeconds: Math.max(0, DROP_THRESHOLD_SECONDS - ageSeconds) };
  }

  return null;
}

function buildTotals(streams: DashboardStream[]): DashboardTotals {
  let totalStreams = 0;
  let liveStreams = 0;
  let disconnectingStreams = 0;
  let totalLiveViewers = 0;
  let totalLiveMarketCap = 0;

  for (const stream of streams) {
    totalStreams += 1;
    if (stream.status === 'live') {
      liveStreams += 1;
      totalLiveViewers += stream.metrics.viewers.current ?? 0;
      const marketCapUsd = stream.metrics.marketCap.usd ?? stream.metrics.marketCap.current;
      if (marketCapUsd !== null && Number.isFinite(marketCapUsd)) {
        totalLiveMarketCap += marketCapUsd;
      }
    } else if (stream.status === 'disconnecting') {
      disconnectingStreams += 1;
    }
  }

  return {
    totalStreams,
    liveStreams,
    disconnectingStreams,
    totalLiveViewers,
    totalLiveMarketCap,
  };
}

function numericDesc(a: number | null | undefined, b: number | null | undefined): number {
  const left = Number.isFinite(a) ? (a as number) : Number.NEGATIVE_INFINITY;
  const right = Number.isFinite(b) ? (b as number) : Number.NEGATIVE_INFINITY;
  if (right === left) return 0;
  return right > left ? 1 : -1;
}

function compareBySort(a: DashboardStream, b: DashboardStream, sort: StreamSort): number {
  if (sort === 'viewers') {
    const primary = numericDesc(a.metrics.viewers.current, b.metrics.viewers.current);
    if (primary !== 0) return primary;
    return numericDesc(a.metrics.marketCap.usd ?? a.metrics.marketCap.current, b.metrics.marketCap.usd ?? b.metrics.marketCap.current);
  }

  const primary = numericDesc(a.metrics.marketCap.usd ?? a.metrics.marketCap.current, b.metrics.marketCap.usd ?? b.metrics.marketCap.current);
  if (primary !== 0) return primary;
  return numericDesc(a.metrics.viewers.current, b.metrics.viewers.current);
}

function sortStreams(streams: DashboardStream[], sort: StreamSort): DashboardStream[] {
  return [...streams].sort((a, b) => compareBySort(a, b, sort));
}

export async function fetchTopStreams(sortRequest?: string): Promise<DashboardPayload> {
  const sort = parseSort(sortRequest);
  const supabase = getServiceClient();
  const nowMs = Date.now();
  const freshCutoffIso = new Date(nowMs - DROP_THRESHOLD_SECONDS * 1000).toISOString();

  // Serve from cache if within TTL and sort hasn't changed materially (we only cache by latest payload regardless of sort since both views are derived from the same base set and we cap at TOP_LIMIT).
  if (lastPayload && nowMs - lastFetchedAtMs < API_TTL_MS) {
    lastSource = 'fallback';
    return { ...(lastPayload as DashboardPayload), sort } as DashboardPayload;
  }

  // Try local top snapshot first (written by poller)
  const localTop = await readLocalTopSnapshot();
  if (localTop) {
    const fetchedAt = localTop.fetchedAt as string;
    const ts = new Date(fetchedAt).getTime();
    const ageSeconds = Number.isFinite(ts) ? Math.max(0, Math.floor((Date.now() - ts) / 1000)) : null;
    // Consider valid if within two drop windows (covers a missed cycle)
    const valid = ageSeconds !== null && ageSeconds <= DROP_THRESHOLD_SECONDS * 2;
    if (valid) {
      const entries = Array.isArray(localTop.entries) ? localTop.entries : [];
      const streams: DashboardStream[] = [];
      for (const item of entries) {
        const solCap = toNumberOrNull(item?.market_cap);
        const usdCap = toNumberOrNull(item?.usd_market_cap);
        const classification = classifyStreamAge(ageSeconds);
        if (!classification) continue;
        const { status, countdownSeconds } = classification;
        streams.push({
          mintId: item.mint,
          name: item.name ?? null,
          symbol: item.symbol ?? null,
          thumbnail: item.thumbnail ?? null,
          status,
          latestAt: fetchedAt,
          dropCountdownSeconds: countdownSeconds,
          metrics: {
            lastSnapshotAgeSeconds: ageSeconds,
            viewers: { current: toNumberOrNull(item?.num_participants) },
            marketCap: {
              current: usdCap ?? solCap ?? null,
              usd: usdCap,
              sol: solCap,
            },
          },
          metadata: null,
        });
      }

      const limitedStreams = sortStreams(streams, sort).slice(0, TOP_LIMIT);
      const totals = buildTotals(limitedStreams);
      const spotlight = limitedStreams.slice(0, SPOTLIGHT_LIMIT);

      lastSource = 'snapshot';
      return {
        generatedAt: new Date().toISOString(),
        windowMinutes: WINDOW_MINUTES,
        streams: limitedStreams,
        spotlight,
        totals,
        events: [],
        latestSnapshotAt: fetchedAt,
        oldestSnapshotAgeSeconds: ageSeconds,
        sort,
      };
    }
  }

  // Try PG fast-path first to avoid PostgREST/schema-cache flakiness entirely.
  let latestRows: any[] | null = null;
  try {
    latestRows = await fetchFreshLatestViaPg({ dropThresholdSeconds: DROP_THRESHOLD_SECONDS, limit: Math.max(TOP_LIMIT, FETCH_LIMIT) });
    if (latestRows && latestRows.length) {
      lastSource = 'pg';
    }
  } catch {}

  let latestError: any = null;
  if (!latestRows || latestRows.length === 0) {
    const resp = await supabase
      .from('livestream_latest')
      .select('mint_id, fetched_at, num_participants, market_cap, usd_market_cap, thumbnail, is_live, livestream')
      .gte('fetched_at', freshCutoffIso)
      .order('num_participants', { ascending: false })
      .limit(Math.max(TOP_LIMIT, FETCH_LIMIT));
    latestRows = resp.data as any[] | null;
    latestError = resp.error;
    if (latestRows && latestRows.length) {
      lastSource = 'supabase';
    }
  }

  if (latestError) {
    // Attempt PG fallback for any upstream error first.
    const pgRows = await fetchFreshLatestViaPg({ dropThresholdSeconds: DROP_THRESHOLD_SECONDS, limit: Math.max(TOP_LIMIT, FETCH_LIMIT) }).catch(() => null);
    if (pgRows && pgRows.length) {
      (latestRows as any) = pgRows;
    } else {
      const msg = latestError.message || '';
      if (
        msg.includes('Could not find the table') ||
        msg.includes('Could not query the database for the schema cache') ||
        msg.includes('schema cache')
      ) {
        if (lastPayload) {
          lastSource = 'fallback';
          return { ...(lastPayload as DashboardPayload), sort } as DashboardPayload;
        }
        return {
          generatedAt: new Date().toISOString(),
          windowMinutes: WINDOW_MINUTES,
          streams: [],
          spotlight: [],
          totals: {
            totalStreams: 0,
            liveStreams: 0,
            disconnectingStreams: 0,
            totalLiveViewers: 0,
            totalLiveMarketCap: 0,
          },
          events: [],
          latestSnapshotAt: null,
          oldestSnapshotAgeSeconds: null,
          sort,
          supabaseOffline: true,
        };
      }
      if (lastPayload) {
        lastSource = 'fallback';
        return { ...(lastPayload as DashboardPayload), sort } as DashboardPayload;
      }
      throw new Error(`Failed to fetch latest livestream snapshots: ${latestError.message}`);
    }
  }

  const rows = ((latestRows ?? []).filter((row) => Boolean(row?.mint_id)) as LatestRow[]);
  const uniqueRows = new Map<string, LatestRow>();
  for (const row of rows) {
    if (!uniqueRows.has(row.mint_id)) {
      uniqueRows.set(row.mint_id, row);
    }
    if (uniqueRows.size >= FETCH_LIMIT) break;
  }

  const latestEntries = Array.from(uniqueRows.values());
  const mintIds = latestEntries.map((row) => row.mint_id);

  let metadataMap: Map<string, StreamMetadata> = new Map();
  if (mintIds.length) {
    const { data: metadataRows, error: metadataError } = await supabase
      .from('stream_metadata')
      .select('*')
      .in('mint_id', mintIds);
    if (metadataError) {
      console.error('[supabase] Failed to fetch stream metadata:', metadataError.message);
    } else {
      metadataMap = new Map((metadataRows ?? []).map((row) => [row.mint_id, row as StreamMetadata]));
    }
  }

  const streams: DashboardStream[] = [];

  for (const latest of latestEntries) {
    const mintId = latest.mint_id;
    if (!mintId || !latest.fetched_at) continue;

    const metadata = metadataMap.get(mintId) ?? null;
    const simplified = latest.livestream ?? null;
    const latestTimestamp = new Date(latest.fetched_at).getTime();
    const ageSeconds = Number.isFinite(latestTimestamp) ? Math.max(0, Math.floor((nowMs - latestTimestamp) / 1000)) : null;
    const classification = classifyStreamAge(ageSeconds);
    if (!classification) continue;

    const { status, countdownSeconds } = classification;
    const marketCapSol = toNumberOrNull(latest.market_cap);
    const marketCapUsd = toNumberOrNull(latest.usd_market_cap);

    streams.push({
      mintId,
      name: (metadata?.name as string | undefined) ?? (simplified?.name as string | undefined) ?? null,
      symbol: (metadata?.symbol as string | undefined) ?? (simplified?.symbol as string | undefined) ?? null,
      thumbnail:
        metadata?.thumbnail ??
        latest.thumbnail ??
        (simplified?.thumbnail as string | undefined) ??
        null,
      status,
      latestAt: latest.fetched_at,
      dropCountdownSeconds: countdownSeconds,
      metrics: {
        lastSnapshotAgeSeconds: ageSeconds,
        viewers: {
          current: latest.num_participants ?? null,
        },
        marketCap: {
          current: marketCapUsd ?? marketCapSol ?? null,
          usd: marketCapUsd,
          sol: marketCapSol,
        },
      },
      metadata,
    });
  }

  const sortedStreams = sortStreams(streams, sort);
  const limitedStreams = sortedStreams.slice(0, TOP_LIMIT);
  const totals = buildTotals(limitedStreams);

  let latestSnapshotAt: string | null = null;
  let oldestSnapshotAgeSeconds: number | null = null;

  for (const stream of limitedStreams) {
    if (stream.latestAt) {
      const ts = new Date(stream.latestAt).getTime();
      if (Number.isFinite(ts) && (!latestSnapshotAt || ts > new Date(latestSnapshotAt).getTime())) {
        latestSnapshotAt = stream.latestAt;
      }
    }

    const age = stream.metrics.lastSnapshotAgeSeconds;
    if (age !== null && age !== undefined) {
      oldestSnapshotAgeSeconds = oldestSnapshotAgeSeconds === null ? age : Math.max(oldestSnapshotAgeSeconds, age);
    }
  }

  const spotlight = limitedStreams
    .filter((stream) => stream.status === 'live')
    .slice(0, SPOTLIGHT_LIMIT);

  const events: DashboardEvent[] = limitedStreams
    .filter((stream) => stream.status === 'disconnecting')
    .map((stream) => ({
      type: 'drop' as const,
      mintId: stream.mintId,
      message: `${stream.name ?? stream.symbol ?? stream.mintId.slice(0, 6)} signal lost`,
      severity: 'warning' as const,
      timestamp: stream.latestAt,
    }))
    .slice(0, 12);

  return {
    generatedAt: new Date().toISOString(),
    windowMinutes: WINDOW_MINUTES,
    streams: limitedStreams,
    spotlight,
    totals,
    events,
    latestSnapshotAt,
    oldestSnapshotAgeSeconds,
    sort,
  };
}

export function getDashboardConfig() {
  return {
    topLimit: TOP_LIMIT,
    windowMinutes: WINDOW_MINUTES,
    pollerIntervalSeconds: LIVE_THRESHOLD_SECONDS,
    dropThresholdSeconds: DROP_THRESHOLD_SECONDS,
    availableSorts: SORT_OPTIONS,
    defaultSort: DEFAULT_SORT,
  };
}

// Patch NextResponse producer to populate cache when called via API route
export function __cacheStore(payload: DashboardPayload & { config?: any }) {
  lastPayload = payload;
  lastFetchedAtMs = Date.now();
}

export function __getLastSource() {
  return lastSource;
}
