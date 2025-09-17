export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { fetchTopStreams, getDashboardConfig } from '../lib/fetch-top-streams';
import { DashboardLive } from '../components/dashboard-live';

export default async function DashboardPage() {
  const { entries, totals } = await fetchTopStreams();
  const config = getDashboardConfig();

  return (
    <main>
      <header>
        <h1>Pumpstreams Live Dashboard</h1>
        <p style={{ opacity: 0.7 }}>
          Tracking the most active Pump.fun livestreams. Updated continuously · lookback {config.lookbackMinutes} minutes.
        </p>
      </header>

      <DashboardLive
        initialEntries={entries}
        initialTotals={totals}
        topLimit={config.topLimit}
        lookbackMinutes={config.lookbackMinutes}
        staleThresholdMinutes={config.staleThresholdMinutes}
      />
    </main>
  );
}
