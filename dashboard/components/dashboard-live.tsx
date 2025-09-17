'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SerializableStream } from '../lib/types';
import type { DashboardPayload, DashboardTotals } from '../types/dashboard';
import { StreamLeaderboard } from './stream-leaderboard';

const REFRESH_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_MS ?? '20000');

type DashboardLiveProps = {
  initialEntries: SerializableStream[];
  initialTotals: DashboardTotals;
  topLimit: number;
  lookbackMinutes: number;
  staleThresholdMinutes: number;
};

export function DashboardLive(props: DashboardLiveProps) {
  const [entries, setEntries] = useState<SerializableStream[]>(props.initialEntries);
  const [totals, setTotals] = useState<DashboardTotals>(props.initialTotals);
  const [isFetching, setIsFetching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        setIsFetching(true);
        const res = await fetch('/api/live', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const payload: DashboardPayload & { config: { topLimit: number } } = await res.json();
        if (cancelled) return;
        setEntries(payload.entries);
        setTotals(payload.totals);
        setLastUpdated(new Date());
      } catch (error) {
        console.error('[dashboard-live] refresh failed', error);
      } finally {
        if (!cancelled) {
          setIsFetching(false);
        }
      }
    }

    const interval = setInterval(refresh, Math.max(REFRESH_INTERVAL_MS, 5000));
    refresh();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const statusText = useMemo(() => {
    const diffMs = Date.now() - lastUpdated.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    return `${diffMinutes}m ago`;
  }, [lastUpdated]);

  return (
    <>
      <section className="section-heading" style={{ marginTop: '2rem' }}>
        <h2>Leaderboard</h2>
        <span style={{ opacity: 0.6, fontSize: '0.9rem' }}>
          Auto-refreshing every {Math.round(REFRESH_INTERVAL_MS / 1000)}s · Last update {statusText}
          {isFetching ? ' · refreshing…' : ''}
        </span>
      </section>

      <StreamLeaderboard entries={entries} limit={props.topLimit} />

      <div className="summary-strip" style={{ marginTop: '1.5rem' }}>
        <div className="summary-pill">
          <span>Active streams (top {props.topLimit})</span>
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
    </>
  );
}
