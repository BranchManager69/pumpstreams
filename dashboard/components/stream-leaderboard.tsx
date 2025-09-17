'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { StreamCard } from './stream-card';
import type { SerializableStream, SnapshotPoint } from '../lib/types';

const PAGE_SIZE = 25;

function computeDelta(points: SnapshotPoint[], key: 'num_participants' | 'market_cap') {
  if (!points?.length) return null;
  const first = points[0]?.[key];
  const last = points[points.length - 1]?.[key];
  if (first === null || first === undefined || last === null || last === undefined) return null;
  return last - first;
}

export type StreamLeaderboardProps = {
  entries: SerializableStream[];
  limit: number;
};

export function StreamLeaderboard({ entries, limit }: StreamLeaderboardProps) {
  const [query, setQuery] = useState('');
  const [minViewers, setMinViewers] = useState(0);
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    const sorted = entries.slice().sort((a, b) => {
      const aParticipants = a.latest?.numParticipants ?? 0;
      const bParticipants = b.latest?.numParticipants ?? 0;
      return bParticipants - aParticipants;
    });

    return sorted.filter((entry) => {
      if (!showInactive && entry.isStale) return false;
      const participants = entry.latest?.numParticipants ?? 0;
      if (participants < minViewers) return false;
      if (!normalized) return true;
      const name = entry.name?.toLowerCase() ?? '';
      const symbol = entry.symbol?.toLowerCase() ?? '';
      const mint = entry.mintId.toLowerCase();
      return name.includes(normalized) || symbol.includes(normalized) || mint.includes(normalized);
    });
  }, [entries, query, minViewers, showInactive]);

  const [visibleCount, setVisibleCount] = useState(() => Math.min(limit, filtered.length));

  useEffect(() => {
    setVisibleCount(Math.min(limit, filtered.length));
  }, [filtered.length, limit]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (visibleCount >= filtered.length) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entriesList) => {
      if (entriesList.some((entry) => entry.isIntersecting)) {
        setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length));
      }
    }, { threshold: 0.4 });

    observer.observe(node);
    return () => observer.disconnect();
  }, [filtered.length, visibleCount]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const hiddenByFilters = entries.length - filtered.length;

  return (
    <section className="leaderboard">
      <div className="leaderboard-controls">
        <label className="control">
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, symbol, or mint…"
          />
        </label>
        <label className="control">
          <span>Min viewers</span>
          <input
            type="number"
            min={0}
            value={minViewers}
            onChange={(event) => setMinViewers(Math.max(0, Number(event.target.value) || 0))}
          />
        </label>
        <label className="toggle-control">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />
          <span>Include inactive</span>
        </label>
      </div>

      <div className="leaderboard-meta">
        <span>
          Showing {visible.length} of {filtered.length} stream{filtered.length === 1 ? '' : 's'}
        </span>
        {hiddenByFilters > 0 && (
          <span className="muted">{hiddenByFilters} filtered out</span>
        )}
      </div>

      {!visible.length ? (
        <div className="empty-state">No streams match the current filters.</div>
      ) : (
        <div className="rows">
          {visible.map((entry, index) => {
            const history = entry.history;
            const viewersChange = computeDelta(history, 'num_participants');
            const marketCapChange = computeDelta(history, 'market_cap');
            return (
              <StreamCard
                key={entry.mintId}
                rank={index + 1}
                mintId={entry.mintId}
                name={entry.name ?? ''}
                symbol={entry.symbol ?? ''}
                participants={entry.latest?.numParticipants ?? null}
                marketCap={entry.latest?.marketCap ?? null}
                viewersChange={viewersChange}
                marketCapChange={marketCapChange}
                snapshotHistory={history}
                isStale={entry.isStale}
                latestAt={entry.latest?.fetchedAt ?? null}
              />
            );
          })}
        </div>
      )}

      {hasMore && (
        <div ref={sentinelRef} className="sentinel">
          <span>Loading more…</span>
        </div>
      )}
    </section>
  );
}
