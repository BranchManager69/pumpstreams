export const dynamic = 'force-dynamic';
import { StreamCard, SnapshotPoint } from '../components/stream-card';
import { getServiceClient } from '../lib/supabase';

export const revalidate = 30;

const TOP_LIMIT = Number(process.env.DASHBOARD_TOP_LIMIT ?? '30');
const LOOKBACK_MINUTES = Number(process.env.DASHBOARD_LOOKBACK_MINUTES ?? '180');

async function fetchTopStreams() {
  const supabase = getServiceClient();

  const { data: latestRows, error: latestError } = await supabase
    .from('token_latest_snapshot')
    .select('mint_id, num_participants, market_cap, livestream')
    .order('num_participants', { ascending: false })
    .limit(TOP_LIMIT);

  if (latestError) {
    throw new Error(`Failed to fetch latest snapshots: ${latestError.message}`);
  }

  if (!latestRows?.length) {
    return { topStreams: [], histories: new Map<string, SnapshotPoint[]>() };
  }

  const mintIds = latestRows.map((row) => row.mint_id);
  const lookbackIso = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();

  const { data: snapshotHistory, error: historyError } = await supabase
    .from('livestream_snapshots')
    .select('mint_id, fetched_at, num_participants, market_cap')
    .in('mint_id', mintIds)
    .gte('fetched_at', lookbackIso)
    .order('fetched_at', { ascending: true });

  if (historyError) {
    throw new Error(`Failed to fetch snapshot history: ${historyError.message}`);
  }

  const histories = new Map<string, SnapshotPoint[]>();
  snapshotHistory?.forEach((row) => {
    if (!histories.has(row.mint_id)) {
      histories.set(row.mint_id, []);
    }
    histories.get(row.mint_id)!.push({
      fetched_at: row.fetched_at,
      num_participants: row.num_participants,
      market_cap: row.market_cap,
    });
  });

  return { topStreams: latestRows, histories };
}

function computeDelta(points: SnapshotPoint[] | undefined, key: 'num_participants' | 'market_cap') {
  if (!points || points.length < 2) return null;
  const first = points[0]?.[key];
  const last = points[points.length - 1]?.[key];
  if (first === null || last === null || first === undefined || last === undefined) return null;
  return last - first;
}

export default async function DashboardPage() {
  const { topStreams, histories } = await fetchTopStreams();

  const summary = topStreams.reduce(
    (acc, row) => {
      const participants = row.num_participants ?? 0;
      const marketCap = row.market_cap ?? 0;
      return {
        totalViewers: acc.totalViewers + participants,
        totalMarketCap: acc.totalMarketCap + marketCap,
      };
    },
    { totalViewers: 0, totalMarketCap: 0 }
  );

  return (
    <main>
      <header>
        <h1>Pumpstreams Live Dashboard</h1>
        <p style={{ opacity: 0.7 }}>
          Tracking the most active Pump.fun livestreams. Updated every 30 seconds · lookback {LOOKBACK_MINUTES} minutes.
        </p>
        <div className="summary-strip">
          <div className="summary-pill">
            <span>Streams tracked</span>
            <strong>{topStreams.length}</strong>
          </div>
          <div className="summary-pill">
            <span>Total viewers (top {topStreams.length})</span>
            <strong>{summary.totalViewers.toLocaleString()}</strong>
          </div>
          <div className="summary-pill">
            <span>Aggregate market cap (SOL)</span>
            <strong>{summary.totalMarketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
          </div>
        </div>
      </header>

      <section className="section-heading">
        <h2>Top {topStreams.length} Livestreams</h2>
        <span style={{ opacity: 0.6, fontSize: '0.9rem' }}>
          Showing viewer sparkline + market cap trend for the past {LOOKBACK_MINUTES} minutes.
        </span>
      </section>

      <div className="stream-grid">
        {topStreams.map((row, idx) => {
          const history = histories.get(row.mint_id) ?? [];
          const viewersChange = computeDelta(history, 'num_participants');
          const marketCapChange = computeDelta(history, 'market_cap');
          const livestreamMeta = row.livestream as Record<string, any> | null;

          return (
            <StreamCard
              key={row.mint_id}
              rank={idx + 1}
              mintId={row.mint_id}
              name={(livestreamMeta?.name as string) ?? ''}
              symbol={(livestreamMeta?.symbol as string) ?? ''}
              participants={row.num_participants}
              marketCap={row.market_cap}
              viewersChange={viewersChange}
              marketCapChange={marketCapChange}
              snapshotHistory={history}
            />
          );
        })}
      </div>
    </main>
  );
}
