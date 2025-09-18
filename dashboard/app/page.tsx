export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { fetchTopStreams } from '../lib/fetch-top-streams';
import { DashboardLive } from '../components/dashboard-live';

export default async function DashboardPage() {
  const payload = await fetchTopStreams();

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
