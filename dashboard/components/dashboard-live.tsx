'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DashboardPayload } from '../types/dashboard';
import type { DashboardStream, StreamSort } from '../lib/types';
import { LiveLeaderboard } from './stream-leaderboard';
import { SpotlightReel } from './spotlight-reel';
import { formatMetric, formatUsdCompact } from './metric-formatters';
import { DebugConsole } from './debug-console';
import { useSolPrice } from './sol-price-context';

const REFRESH_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_MS ?? '20000');

export type DashboardLiveProps = {
  initialPayload: DashboardPayload;
};

type FetchState = 'idle' | 'loading' | 'error';

type ApiResponse = DashboardPayload & {
  config: {
    topLimit: number;
    windowMinutes: number;
    pollerIntervalSeconds: number;
    dropThresholdSeconds: number;
    availableSorts: StreamSort[];
    defaultSort: StreamSort;
  };
};

type FiltersState = {
  search: string;
};

function createInitialFilters(): FiltersState {
  return {
    search: '',
  };
}

export function DashboardLive({ initialPayload }: DashboardLiveProps) {
  const [payload, setPayload] = useState<DashboardPayload>(initialPayload);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [filters, setFilters] = useState<FiltersState>(createInitialFilters);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        setFetchState('loading');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Math.max(REFRESH_INTERVAL_MS - 2000, 5000));
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

        const incoming = (await res.json()) as ApiResponse;
        if (cancelled) return;

        const { config: _config, ...payloadData } = incoming;
        setPayload({ ...payloadData, supabaseOffline: false });
        setFetchState('idle');
        setErrorMessage(null);
        setRefreshCount((count) => count + 1);
      } catch (error) {
        if (cancelled) return;
        setFetchState('error');
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
        setPayload((prev) => ({ ...prev, supabaseOffline: true }));
      }
    }

    const interval = setInterval(refresh, Math.max(REFRESH_INTERVAL_MS, 5000));
    refresh();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setNowMs(Date.now());
  }, [payload.generatedAt]);

  const lastUpdatedLabel = useMemo(() => {
    if (!payload.generatedAt) return 'unknown';
    const generated = new Date(payload.generatedAt).getTime();
    if (!Number.isFinite(generated)) return 'unknown';
    const diffMs = nowMs - generated;
    const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ago`;
  }, [payload.generatedAt, nowMs]);

  const generatedMs = useMemo(() => {
    const value = new Date(payload.generatedAt).getTime();
    return Number.isFinite(value) ? value : null;
  }, [payload.generatedAt]);

  const ageOffsetSeconds = useMemo(() => {
    if (generatedMs === null) return 0;
    return Math.max(0, Math.floor((nowMs - generatedMs) / 1000));
  }, [generatedMs, nowMs]);

  const lastPollLabel = useMemo(() => {
    if (!payload.latestSnapshotAt) return 'unknown';
    const ts = new Date(payload.latestSnapshotAt).getTime();
    if (!Number.isFinite(ts)) return 'unknown';
    const diffSeconds = Math.max(0, Math.floor((nowMs - ts) / 1000));
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ago`;
  }, [payload.latestSnapshotAt, nowMs]);

  const oldestSampleLabel = useMemo(() => {
    const age = payload.oldestSnapshotAgeSeconds;
    if (age === null || age === undefined) return null;
    const total = Math.max(0, age + ageOffsetSeconds);
    if (total < 60) return `${total}s`;
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  }, [payload.oldestSnapshotAgeSeconds, ageOffsetSeconds]);

  const streamsByMint = useMemo(() => {
    const map = new Map<string, DashboardStream>();
    for (const stream of payload.streams) {
      map.set(stream.mintId, stream);
    }
    return map;
  }, [payload.streams]);

  const filteredStreams = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return payload.streams.filter((stream) => {
      if (!query) return true;
      const name = stream.name?.toLowerCase() ?? '';
      const symbol = stream.symbol?.toLowerCase() ?? '';
      const mint = stream.mintId.toLowerCase();
      return name.includes(query) || symbol.includes(query) || mint.includes(query);
    });
  }, [payload.streams, filters.search]);

  const spotlightStreams = payload.spotlight;

  const isOffline = Boolean(payload.supabaseOffline) || fetchState === 'error';

  const { priceUsd } = useSolPrice();

  const totalMarketCapUsd = useMemo(() => {
    if (priceUsd === null) return null;
    const total = payload.totals.totalLiveMarketCap;
    if (!Number.isFinite(total)) return null;
    return total * priceUsd;
  }, [payload.totals.totalLiveMarketCap, priceUsd]);

  const viewersCompact = formatMetric(payload.totals.totalLiveViewers);
  const marketCapUsdCompact = formatUsdCompact(totalMarketCapUsd);

  const sortLabel = payload.sort === 'viewers' ? 'Viewers' : 'Market cap';

  const debugSections = useMemo(() => {
    return [
      {
        title: 'Poll cadence',
        entries: [
          { label: 'Generated at', value: payload.generatedAt },
          { label: 'Latest snapshot at', value: payload.latestSnapshotAt ?? 'n/a' },
          { label: 'Oldest sample age (s)', value: payload.oldestSnapshotAgeSeconds ?? 'n/a' },
          { label: 'Age offset (s)', value: ageOffsetSeconds },
          { label: 'Refresh count', value: refreshCount },
          { label: 'Fetch state', value: fetchState },
          { label: 'Last poll label', value: lastPollLabel },
          { label: 'Updated label', value: lastUpdatedLabel },
        ],
      },
      {
        title: 'Totals',
        entries: [
          { label: 'Live', value: payload.totals.liveStreams },
          { label: 'Signal lost', value: payload.totals.disconnectingStreams },
          { label: 'Viewers', value: formatWhole(payload.totals.totalLiveViewers) },
          { label: 'Market cap (SOL)', value: formatWhole(payload.totals.totalLiveMarketCap) },
          { label: 'Market cap (USD)', value: formatUsdWhole(totalMarketCapUsd) },
        ],
      },
      {
        title: 'Filters',
        entries: [
          { label: 'Search', value: filters.search || '(none)' },
          { label: 'Sort order', value: payload.sort },
        ],
      },
    ];
  }, [
    ageOffsetSeconds,
    fetchState,
    filters.search,
    lastPollLabel,
    payload.generatedAt,
    payload.latestSnapshotAt,
    payload.oldestSnapshotAgeSeconds,
    payload.totals.disconnectingStreams,
    payload.totals.liveStreams,
    payload.totals.totalLiveMarketCap,
    payload.totals.totalLiveViewers,
    payload.sort,
    refreshCount,
    totalMarketCapUsd,
  ]);

  return (
    <section className="dashboard-shell">
      <DebugConsole open={showDebug} onClose={() => setShowDebug(false)} sections={debugSections} />
      {isOffline && (
        <div className="offline-banner" role="alert">
          <strong>Snapshot service offline.</strong>
          <span>
            Showing the most recent cached data{errorMessage ? ` · ${errorMessage}` : ''}.
          </span>
        </div>
      )}
      <header className="command-bar">
        <div className="summary">
          <span className="summary-chip" title="Live streams">
            <span className="chip-label">Live</span>
            <strong>{payload.totals.liveStreams}</strong>
          </span>
          <span className="summary-chip" title="Disconnecting streams">
            <span className="chip-label">Drop</span>
            <strong>{payload.totals.disconnectingStreams}</strong>
          </span>
          <span className="summary-chip" title="Total viewers">
            <span className="chip-label">View</span>
            <strong>{viewersCompact}</strong>
          </span>
          <span className="summary-chip" title="Aggregate market cap (USD)">
            <span className="chip-label">$ Cap</span>
            <strong>{marketCapUsdCompact}</strong>
          </span>
          <span className="summary-chip" title="Current sort order">
            <span className="chip-label">Sort</span>
            <strong>{sortLabel}</strong>
          </span>
        </div>
        <div className="actions">
          <input
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Search stream or mint"
            aria-label="Search streams"
          />
          <button type="button" className="debug-toggle" onClick={() => setShowDebug((open) => !open)}>
            {showDebug ? 'Hide debug' : 'Show debug'}
          </button>
        </div>
      </header>

      <SpotlightReel streams={spotlightStreams} />

      {fetchState === 'error' && errorMessage && (
        <div className="alert error" role="status">
          Refresh failed: {errorMessage}
        </div>
      )}

      <LiveLeaderboard streams={filteredStreams} ageOffsetSeconds={ageOffsetSeconds} />
    </section>
  );
}

function compactTime(label: string): string {
  if (!label || label === 'unknown') return '—';
  return label.replace(/\s?ago$/, '');
}

function formatWhole(value: number | null, step = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const rounded = Math.round((value as number) / step) * step;
  return Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(rounded);
}

function formatUsdWhole(value: number | null, step = 10): string {
  if (value === null || !Number.isFinite(value)) return '$—';
  const rounded = Math.round((value as number) / step) * step;
  return Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(rounded);
}
