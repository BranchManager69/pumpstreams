export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { fetchTopStreams } from '../lib/fetch-top-streams';
import { DashboardLive } from '../components/dashboard-live';
import type { DashboardPayload } from '../types/dashboard';

function fallbackPayload(): DashboardPayload {
  return {
    generatedAt: new Date().toISOString(),
    windowMinutes: 48,
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
    supabaseOffline: true,
    latestSnapshotAt: null,
    oldestSnapshotAgeSeconds: null,
  };
}

export default async function DashboardPage() {
  let payload: DashboardPayload;
  try {
    payload = await fetchTopStreams();
  } catch (error) {
    console.error('[dashboard] fetchTopStreams failed', error);
    payload = fallbackPayload();
  }

  return (
    <main>
      <header>
        <h1>Pumpstreams Live Dashboard</h1>
        <p>Live attention tracker for Pump.fun streams. Fresh data, no ghosts.</p>
      </header>

      <DashboardLive initialPayload={payload} />
    </main>
  );
}
