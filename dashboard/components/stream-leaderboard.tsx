'use client';

import type { DashboardStream } from '../lib/types';
import { StreamCard } from './stream-card';
import { useSolPrice } from './sol-price-context';

export type LiveLeaderboardProps = {
  streams: DashboardStream[];
  ageOffsetSeconds: number;
};

const statusOrder: DashboardStream['status'][] = ['live', 'disconnecting'];
const statusLabels: Record<DashboardStream['status'], string> = {
  live: 'Live right now',
  disconnecting: 'Signal lost · pending cutoff',
};

export function LiveLeaderboard({ streams, ageOffsetSeconds }: LiveLeaderboardProps) {
  const { priceUsd } = useSolPrice();
  const grouped = new Map<DashboardStream['status'], DashboardStream[]>();
  for (const status of statusOrder) grouped.set(status, []);

  for (const stream of streams) {
    if (!grouped.has(stream.status)) grouped.set(stream.status, []);
    grouped.get(stream.status)!.push(stream);
  }

  return (
    <section className="leaderboard">
      <div className="leaderboard-table-wrapper">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Stream</th>
              <th className="align-right">Viewers</th>
              <th className="align-right">Mkt Cap</th>
              <th className="align-right">$/Viewer</th>
            </tr>
          </thead>
          <tbody>
            {statusOrder.map((status) => {
              const bucket = grouped.get(status) ?? [];
              if (!bucket.length) return null;
              return (
                <>
                  <tr key={`${status}-divider`} className="section-row">
                    <td colSpan={5}>{statusLabels[status]}</td>
                  </tr>
                  {bucket.map((stream, index) => (
                    <tr key={stream.mintId} className={stream.status === 'disconnecting' ? 'status-disconnecting' : ''}>
                      <td>{index + 1}</td>
                      <td className="cell-stream">
                        <div
                          className="stream-thumb"
                          style={{ backgroundImage: `url(${stream.thumbnail ?? ''})` }}
                        />
                        <div className="stream-meta">
                          <div className="name">{stream.name ?? stream.symbol ?? stream.mintId.slice(0, 6)}</div>
                          <div className="meta">{stream.symbol ?? stream.mintId.slice(0, 8)}</div>
                          <div className="age-label">{formatAge(stream.metrics.lastSnapshotAgeSeconds, ageOffsetSeconds)}</div>
                        </div>
                      </td>
                      <td className="align-right viewers-cell">{formatViewerCount(stream.metrics.viewers.current)}</td>
                      <td className="align-right">
                        <span className="market-chip">{formatMarketUsd(stream.metrics.marketCap.current, priceUsd)}</span>
                      </td>
                      <td className="align-right ratio-cell">
                        {formatMarketPerViewer(stream.metrics.marketCap.current, stream.metrics.viewers.current, priceUsd)}
                      </td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="leaderboard-mobile">
        {streams.map((stream, index) => (
          <StreamCard
            key={stream.mintId}
            stream={stream}
            rank={index + 1}
            ageOffsetSeconds={ageOffsetSeconds}
            priceUsd={priceUsd}
          />
        ))}
      </div>
    </section>
  );
}

function formatViewerCount(count: number | null): string {
  if (count === null || !Number.isFinite(count)) return '—';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}

function formatAge(age: number | null, offsetSeconds = 0): string {
  if (age === null) return '—';
  const total = Math.max(0, age + offsetSeconds);
  if (total < 60) return `${total}s ago`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatCountdown(seconds: number | null, offsetSeconds = 0): string {
  if (seconds === null) return '0s';
  const remaining = Math.max(0, seconds - offsetSeconds);
  if (remaining <= 0) return '0s';
  return `${remaining}s`;
}

function formatMarketUsd(sol: number | null, priceUsd: number | null): string {
  if (sol === null || !Number.isFinite(sol) || priceUsd === null || !Number.isFinite(priceUsd)) return '$—';
  const usd = sol * priceUsd;
  if (usd < 1_000) return '<$1.0K';
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  return `$${(usd / 1_000).toFixed(1)}K`;
}

function formatMarketPerViewer(sol: number | null, viewers: number | null, priceUsd: number | null): string {
  if (sol === null || viewers === null || viewers <= 0 || !Number.isFinite(viewers) || priceUsd === null || !Number.isFinite(priceUsd)) {
    return '$—';
  }
  const usd = sol * priceUsd;
  const ratio = usd / viewers;
  if (ratio < 1_000) return '<$1.0K';
  if (ratio >= 1_000_000) return `$${(ratio / 1_000_000).toFixed(1)}M`;
  return `$${(ratio / 1_000).toFixed(1)}K`;
}
