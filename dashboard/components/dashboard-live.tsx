'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SerializableStream } from '../lib/types';
import type { DashboardPayload, DashboardTotals } from '../types/dashboard';
import { StreamLeaderboard } from './stream-leaderboard';

const REFRESH_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_MS ?? '20000');

export type DashboardLiveProps = {
  initialEntries: SerializableStream[];
  initialTotals: DashboardTotals;
  topLimit: number;
  lookbackMinutes: number;
  staleThresholdMinutes: number;
};

type FetchState = 'idle' | 'loading' | 'error';

type ApiResponse = DashboardPayload & {
  config: {
    topLimit: number;
    lookbackMinutes: number;
    staleThresholdMinutes: number;
  };
};

export function DashboardLive(props: DashboardLiveProps) {
  const [entries, setEntries] = useState<SerializableStream[]>(props.initialEntries);
  const [totals, setTotals] = useState<DashboardTotals>(props.initialTotals);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        setFetchState('loading');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Math.max(REFRESH_INTERVAL_MS - 1000, 5000));
        const res = await fetch('/api/live', {
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        });
        clearTimeout(timeout);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const payload = (await res.json()) as ApiResponse;
        if (cancelled) return;

        setEntries(payload.entries);
        setTotals(payload.totals);
        setLastUpdated(new Date());
        setFetchState('idle');
        setErrorMessage(null);
        setRefreshCount((count) => count + 1);
      } catch (error) {
        if (cancelled) return;
        setFetchState('error');
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
      }
    }

    const interval = setInterval(refresh, Math.max(REFRESH_INTERVAL_MS, 5000));
    refresh();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const lastUpdatedLabel = useMemo(() => {
    const diffMs = Date.now() - lastUpdated.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    if (diffSeconds <= 45) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ago`;
  }, [lastUpdated]);

  return (
    <>
      <section className="section-heading" style={{ marginTop: '2rem' }}>
        <h2>Leaderboard</h2>
        <span style={{ opacity: 0.6, fontSize: '0.9rem' }}>
          Auto-refreshing every {Math.round(REFRESH_INTERVAL_MS / 1000)}s · Last update {lastUpdatedLabel}
          {fetchState === 'loading' ? ' · refreshing…' : ''}
          {fetchState === 'error' ? ' · refresh failed' : ''}
        </span>
      </section>

      {fetchState === 'error' && errorMessage && (
        <div
          style={{
            margin: '1rem 0',
            padding: '0.75rem 1rem',
            borderRadius: '12px',
            border: '1px solid rgba(255, 115, 0, 0.45)',
            background: 'rgba(255, 115, 0, 0.08)',
            color: '#ffbf88',
            fontSize: '0.9rem',
          }}
        >
          Refresh failed: {errorMessage}
        </div>
      )}

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

      <div style={{ opacity: 0.35, fontSize: '0.75rem', marginTop: '0.5rem' }}>
        Live refreshes: {refreshCount}
      </div>
    </>
  );
}
