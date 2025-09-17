export const dynamic = 'force-dynamic';
import { StreamLeaderboard } from '../components/stream-leaderboard';
import type { SerializableStream, SnapshotPoint } from '../lib/types';
import { getServiceClient } from '../lib/supabase';

export const revalidate = 30;

const TOP_LIMIT = Number(process.env.DASHBOARD_TOP_LIMIT ?? '100');
const LOOKBACK_MINUTES = Number(process.env.DASHBOARD_LOOKBACK_MINUTES ?? '180');
const STALE_THRESHOLD_MINUTES = Number(process.env.DASHBOARD_STALE_THRESHOLD_MINUTES ?? '10');
const FETCH_LIMIT = Math.min(
  Number(process.env.DASHBOARD_FETCH_LIMIT ?? process.env.LIVE_POLLER_LIMIT ?? '500'),
  1000
);

type DashboardSummary = {
  entries: SerializableStream[];
  totals: {
    activeCount: number;
    inactiveCount: number;
    totalViewers: number;
    totalMarketCap: number;
  };
};

type HistoryRow = SnapshotPoint & { mint_id: string };

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

const HISTORY_CHUNK_SIZE = Number(process.env.DASHBOARD_HISTORY_CHUNK_SIZE ?? '100');

async function fetchTopStreams(): Promise<DashboardSummary> {
  const supabase = getServiceClient();
  const lookbackIso = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();
  const staleCutoff = Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000;

  const latestLimit = Math.max(TOP_LIMIT * 3, FETCH_LIMIT);
  const { data: latestRows, error: latestError } = await supabase
    .from('livestream_latest')
    .select('mint_id, fetched_at, num_participants, market_cap, usd_market_cap, thumbnail, livestream, is_live')
    .order('num_participants', { ascending: false })
    .limit(latestLimit);

  if (latestError) {
    throw new Error(`Failed to fetch latest livestream snapshots: ${latestError.message}`);
  }

  const orderedLatest = (latestRows ?? []).filter((row): row is Exclude<typeof latestRows, null>[number] => Boolean(row?.mint_id));
  const mintOrder: string[] = [];
  const seen = new Set<string>();

  for (const row of orderedLatest) {
    if (!seen.has(row.mint_id)) {
      seen.add(row.mint_id);
      mintOrder.push(row.mint_id);
    }
    if (mintOrder.length >= latestLimit) {
      break;
    }
  }

  if (!mintOrder.length) {
    return {
      entries: [],
      totals: { activeCount: 0, inactiveCount: 0, totalViewers: 0, totalMarketCap: 0 },
    };
  }

  const historyChunks: HistoryRow[][] = [];
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

    historyChunks.push((data ?? []) as HistoryRow[]);
  }

  const historyRows = historyChunks.flat();
  const historyMap = buildHistoryMap(historyRows, mintOrder);

  const entries: SerializableStream[] = mintOrder.map((mintId) => {
    const latest = orderedLatest.find((row) => row.mint_id === mintId) ?? null;
    const history = historyMap.get(mintId) ?? [];
    const fetchedAt = latest?.fetched_at ?? null;
    const isStale = fetchedAt ? new Date(fetchedAt).getTime() < staleCutoff : true;
    const livestreamMeta = (latest?.livestream as Record<string, any> | null) ?? null;

    return {
      mintId,
      name: livestreamMeta?.name ?? null,
      symbol: livestreamMeta?.symbol ?? null,
      latest: latest
        ? {
            fetchedAt,
            numParticipants: latest.num_participants ?? null,
            marketCap: latest.market_cap ?? null,
            usdMarketCap: latest.usd_market_cap ?? null,
            thumbnail: latest.thumbnail ?? null,
          }
        : null,
      history,
      isStale,
    };
  });

  entries.sort((a, b) => {
    const aParticipants = a.latest?.numParticipants ?? 0;
    const bParticipants = b.latest?.numParticipants ?? 0;
    return bParticipants - aParticipants;
  });

  const activeEntries = entries.filter((entry) => !entry.isStale).slice(0, TOP_LIMIT);
  const inactiveCount = entries.filter((entry) => entry.isStale).length;
  const totals = {
    activeCount: activeEntries.length,
    inactiveCount,
    totalViewers: activeEntries.reduce((acc, entry) => acc + (entry.latest?.numParticipants ?? 0), 0),
    totalMarketCap: activeEntries.reduce((acc, entry) => acc + (entry.latest?.marketCap ?? 0), 0),
  };

  return { entries, totals };
}

export default async function DashboardPage() {
  const { entries, totals } = await fetchTopStreams();

  return (
    <main>
      <header>
        <h1>Pumpstreams Live Dashboard</h1>
        <p style={{ opacity: 0.7 }}>
          Tracking the most active Pump.fun livestreams. Updated every 30 seconds · lookback {LOOKBACK_MINUTES} minutes.
        </p>
        <div className="summary-strip">
          <div className="summary-pill">
            <span>Active streams (top {TOP_LIMIT})</span>
            <strong>{totals.activeCount}</strong>
          </div>
          <div className="summary-pill">
            <span>Inactive in buffer</span>
            <strong>{totals.inactiveCount}</strong>
          </div>
          <div className="summary-pill">
            <span>Total viewers (active)</span>
            <strong>{totals.totalViewers.toLocaleString()}</strong>
          </div>
          <div className="summary-pill">
            <span>Aggregate market cap (SOL)</span>
            <strong>{totals.totalMarketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
          </div>
        </div>
      </header>

      <section className="section-heading">
        <h2>Leaderboard</h2>
        <span style={{ opacity: 0.6, fontSize: '0.9rem' }}>
          Showing viewer and market cap trends for the past {LOOKBACK_MINUTES} minutes. Streams stale for more than {STALE_THRESHOLD_MINUTES} minutes are treated as inactive.
        </span>
      </section>

      <StreamLeaderboard entries={entries} limit={TOP_LIMIT} />
    </main>
  );
}
