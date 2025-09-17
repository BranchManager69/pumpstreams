import type { SerializableStream, SnapshotPoint } from './types';
import type { DashboardTotals } from '../types/dashboard';
import { getServiceClient } from './supabase';

const TOP_LIMIT = Number(process.env.DASHBOARD_TOP_LIMIT ?? '100');
const LOOKBACK_MINUTES = Number(process.env.DASHBOARD_LOOKBACK_MINUTES ?? '180');
const STALE_THRESHOLD_MINUTES = Number(process.env.DASHBOARD_STALE_THRESHOLD_MINUTES ?? '10');
const FETCH_LIMIT = Math.min(
  Number(process.env.DASHBOARD_FETCH_LIMIT ?? process.env.LIVE_POLLER_LIMIT ?? '500'),
  1000
);
const HISTORY_CHUNK_SIZE = Number(process.env.DASHBOARD_HISTORY_CHUNK_SIZE ?? '100');
const HISTORY_MAX_POINTS = Number(process.env.DASHBOARD_HISTORY_MAX_POINTS ?? '120');
const MINT_LIMIT = Math.min(TOP_LIMIT * 2, FETCH_LIMIT);

type HistoryRow = {
  mint_id: string;
  fetched_at: string;
  num_participants: number | null;
  market_cap: number | null;
};

function buildHistoryMap(rows: HistoryRow[], mintedOrder: string[]) {
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

export type FetchTopStreamsResult = {
  entries: SerializableStream[];
  totals: DashboardTotals;
};

export async function fetchTopStreams(): Promise<FetchTopStreamsResult> {
  const supabase = getServiceClient();
  const lookbackIso = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();
  const staleCutoffMs = Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000;

  const latestLimit = Math.max(TOP_LIMIT * 3, FETCH_LIMIT);
  const { data: latestRows, error: latestError } = await supabase
    .from('livestream_latest')
    .select('mint_id, fetched_at, num_participants, market_cap, thumbnail, livestream')
    .order('num_participants', { ascending: false })
    .limit(latestLimit);

  if (latestError) {
    throw new Error(`Failed to fetch latest livestream snapshots: ${latestError.message}`);
  }

  const filteredLatest = (latestRows ?? [])
    .filter((row): row is Exclude<typeof latestRows, null>[number] => Boolean(row?.mint_id))
    .filter((row) => new Date(row.fetched_at).getTime() >= staleCutoffMs);

  const mintOrder: string[] = [];
  const seen = new Set<string>();
  for (const row of filteredLatest) {
    if (!seen.has(row.mint_id)) {
      seen.add(row.mint_id);
      mintOrder.push(row.mint_id);
    }
    if (mintOrder.length >= MINT_LIMIT) {
      break;
    }
  }

  if (!mintOrder.length) {
    return {
      entries: [],
      totals: { activeCount: 0, inactiveCount: 0, totalViewers: 0, totalMarketCap: 0 },
    };
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

  const entries: SerializableStream[] = mintOrder.flatMap((mintId) => {
    const latest = filteredLatest.find((row) => row.mint_id === mintId);
    if (!latest) return [];

    const history = historyMap.get(mintId) ?? [];
    const trimmedHistory = HISTORY_MAX_POINTS > 0 ? history.slice(-HISTORY_MAX_POINTS) : history;
    const fetchedAt = latest.fetched_at;
    const isStale = new Date(fetchedAt).getTime() < staleCutoffMs;
    const livestreamMeta = (latest.livestream as Record<string, any> | null) ?? null;

    return [{
      mintId,
      name: livestreamMeta?.name ?? null,
      symbol: livestreamMeta?.symbol ?? null,
      latest: {
        fetchedAt,
        numParticipants: latest.num_participants ?? null,
        marketCap: latest.market_cap ?? null,
        thumbnail: latest.thumbnail ?? null,
      },
      history: trimmedHistory,
      isStale,
    }];
  });

  entries.sort((a, b) => {
    const aParticipants = a.latest?.numParticipants ?? 0;
    const bParticipants = b.latest?.numParticipants ?? 0;
    return bParticipants - aParticipants;
  });

  const trimmedEntries = entries.slice(0, TOP_LIMIT);
  const activeEntries = trimmedEntries.filter((entry) => !entry.isStale);
  const inactiveCount = trimmedEntries.length - activeEntries.length;
  const totals = {
    activeCount: activeEntries.length,
    inactiveCount,
    totalViewers: activeEntries.reduce((acc, entry) => acc + (entry.latest?.numParticipants ?? 0), 0),
    totalMarketCap: activeEntries.reduce((acc, entry) => acc + (entry.latest?.marketCap ?? 0), 0),
  };

  return { entries: trimmedEntries, totals };
}

export function getDashboardConfig() {
  return {
    topLimit: TOP_LIMIT,
    lookbackMinutes: LOOKBACK_MINUTES,
    staleThresholdMinutes: STALE_THRESHOLD_MINUTES,
  };
}
