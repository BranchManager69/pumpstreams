export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { fetchTopStreams } from '../lib/fetch-top-streams';
import { DashboardLive } from '../components/dashboard-live';
import type { DashboardPayload } from '../types/dashboard';
import type { SolPriceSnapshot } from '../components/sol-price-context';
import { SolPriceProvider } from '../components/sol-price-context';
import { SiteHeader } from '../components/site-header';
import { SiteFooter } from '../components/site-footer';
import { getSolPriceUSD } from '../lib/sol-price';

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

function fallbackSolPrice(): SolPriceSnapshot {
  return {
    priceUsd: null,
    fetchedAt: null,
  };
}

export default async function DashboardPage() {
  let payload: DashboardPayload;
  let solPriceSnapshot: SolPriceSnapshot = fallbackSolPrice();
  try {
    payload = await fetchTopStreams();
  } catch (error) {
    console.error('[dashboard] fetchTopStreams failed', error);
    payload = fallbackPayload();
  }

  try {
    const priceUsd = await getSolPriceUSD({ cacheMs: 60_000 });
    if (Number.isFinite(priceUsd)) {
      solPriceSnapshot = {
        priceUsd,
        fetchedAt: new Date().toISOString(),
      };
    }
  } catch (error) {
    console.error('[dashboard] getSolPriceUSD failed', error);
  }

  return (
    <SolPriceProvider initialSnapshot={solPriceSnapshot}>
      <div className="site-shell">
        <SiteHeader />
        <main>
          <DashboardLive initialPayload={payload} />
        </main>
        <SiteFooter />
      </div>
    </SolPriceProvider>
  );
}
