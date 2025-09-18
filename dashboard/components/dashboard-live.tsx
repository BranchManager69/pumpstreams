'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DashboardPayload } from '../types/dashboard';
import type { DashboardStream, StreamStatus } from '../lib/types';
import { LiveLeaderboard } from './stream-leaderboard';
import { SpotlightReel } from './spotlight-reel';
import { OctoboxDock } from './octobox-dock';
import { CriticalEventsBar } from './critical-events';

const REFRESH_INTERVAL_MS = Number(process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_MS ?? '20000');
const OCTOBOX_SLOTS = 8;

export type DashboardLiveProps = {
  initialPayload: DashboardPayload;
};

type FetchState = 'idle' | 'loading' | 'error';

type ApiResponse = DashboardPayload & {
  config: {
    topLimit: number;
    lookbackMinutes: number;
  };
};

type FiltersState = {
  search: string;
  statuses: Set<StreamStatus>;
};

function createInitialFilters(): FiltersState {
  return {
    search: '',
    statuses: new Set<StreamStatus>(['live', 'disconnecting']),
  };
}

export function DashboardLive({ initialPayload }: DashboardLiveProps) {
  const [payload, setPayload] = useState<DashboardPayload>(initialPayload);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [filters, setFilters] = useState<FiltersState>(createInitialFilters);
  const [octobox, setOctobox] = useState<(string | null)[]>(() => Array(OCTOBOX_SLOTS).fill(null));
  const [expandedOctobox, setExpandedOctobox] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

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
    return payload.streams
      .filter((stream) => filters.statuses.has(stream.status))
      .filter((stream) => {
        if (!query) return true;
        const name = stream.name?.toLowerCase() ?? '';
        const symbol = stream.symbol?.toLowerCase() ?? '';
        const mint = stream.mintId.toLowerCase();
        return name.includes(query) || symbol.includes(query) || mint.includes(query);
      })
      .sort((a, b) => b.score - a.score);
  }, [payload.streams, filters]);

  const spotlightStreams = payload.spotlight;

  const octoboxStreams = octobox.map((mintId) => (mintId ? streamsByMint.get(mintId) ?? null : null));

  const isOffline = Boolean(payload.supabaseOffline) || fetchState === 'error';

  function toggleStatus(status: StreamStatus) {
    setFilters((prev) => {
      const next = new Set(prev.statuses);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      if (!next.size) {
        next.add('live');
      }
      return { ...prev, statuses: next };
    });
  }

  function handleAddToOctobox(mintId: string) {
    setOctobox((prev) => {
      const idx = prev.findIndex((slot) => slot === mintId);
      if (idx !== -1) return prev;
      const emptyIndex = prev.findIndex((slot) => slot === null);
      if (emptyIndex !== -1) {
        const next = [...prev];
        next[emptyIndex] = mintId;
        return next;
      }
      const next = [...prev];
      next[next.length - 1] = mintId;
      return next;
    });
  }

  function handleRemoveOctobox(index: number) {
    setOctobox((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  }

  return (
    <section className="dashboard-shell">
      {isOffline && (
        <div className="offline-banner" role="alert">
          <strong>Snapshot service offline.</strong>
          <span>
            Showing the most recent cached data{errorMessage ? ` · ${errorMessage}` : ''}.
          </span>
        </div>
      )}
      <header className="command-bar">
        <div className="brand">Pumpstreams</div>
        <div className="summary">
          <span><strong>{payload.totals.liveStreams}</strong> live</span>
          <span>{payload.totals.totalLiveViewers.toLocaleString()} viewers</span>
          {payload.totals.disconnectingStreams > 0 && (
            <span>{payload.totals.disconnectingStreams} signal lost</span>
          )}
          <span>Last poll {lastPollLabel}</span>
          {oldestSampleLabel && <span>Oldest sample {oldestSampleLabel}</span>}
          <span>Updated {lastUpdatedLabel}</span>
        </div>
        <div className="actions">
          <input
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Search stream or mint"
            aria-label="Search streams"
          />
          <div className="status-toggle">
            {(['live', 'disconnecting'] as StreamStatus[]).map((status) => (
              <button
                key={status}
                type="button"
                className={filters.statuses.has(status) ? 'active' : ''}
                onClick={() => toggleStatus(status)}
              >
                {status === 'live' ? 'Live' : 'Signal lost'}
              </button>
            ))}
          </div>
          <button type="button" className="octobox-launch" onClick={() => setExpandedOctobox((open) => !open)}>
            {expandedOctobox ? 'Hide Octobox' : 'Launch Octobox'}
          </button>
        </div>
      </header>

      <CriticalEventsBar events={payload.events} />

      <SpotlightReel streams={spotlightStreams} onAddToOctobox={handleAddToOctobox} />

      {expandedOctobox && <OctoboxDock slots={octoboxStreams} onRemove={handleRemoveOctobox} />}

      {fetchState === 'error' && errorMessage && (
        <div className="alert error" role="status">
          Refresh failed: {errorMessage}
        </div>
      )}

      <LiveLeaderboard
        streams={filteredStreams}
        onAddToOctobox={handleAddToOctobox}
        ageOffsetSeconds={ageOffsetSeconds}
      />
    </section>
  );
}
