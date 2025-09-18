'use client';

import type { DashboardStream } from '../lib/types';
import { useSolPrice } from './sol-price-context';

export type StreamCardProps = {
  stream: DashboardStream;
  rank: number;
  ageOffsetSeconds: number;
  priceUsd?: number | null;
};

export function StreamCard({ stream, rank, ageOffsetSeconds, priceUsd: priceUsdProp }: StreamCardProps) {
  const { priceUsd: priceUsdContext } = useSolPrice();
  const priceUsd = priceUsdProp ?? priceUsdContext;

  return (
    <article className={`mobile-card mobile-${stream.status}`}>
      <header>
        <div className="rank">#{rank}</div>
        <div className="thumb" style={{ backgroundImage: `url(${stream.thumbnail ?? ''})` }} />
        <div>
          <h3>{stream.name ?? stream.symbol ?? stream.mintId.slice(0, 6)}</h3>
          <span className="meta">{stream.symbol ?? stream.mintId.slice(0, 8)}</span>
        </div>
        <div className="status-cluster">
          <small>{formatAge(stream.metrics.lastSnapshotAgeSeconds, ageOffsetSeconds)}</small>
          {stream.status === 'disconnecting' && (
            <span
              className="status-chip status-chip--disconnecting"
              role="status"
              aria-label={`Signal lost, removing in ${Math.max(0, (stream.dropCountdownSeconds ?? 0) - ageOffsetSeconds)} seconds`}
            >
              <span className="disconnect-ring">
                <span className="disconnect-seconds">
                  {formatCountdown(stream.dropCountdownSeconds, ageOffsetSeconds)}
                </span>
              </span>
              <span className="disconnect-label">Signal lost</span>
            </span>
          )}
        </div>
      </header>
      <div className="hero-line">
        <strong>{formatViewerCount(stream.metrics.viewers.current)}</strong>
        <span>viewers</span>
      </div>
      <div className="secondary-line">
        <span className="metric">MC {formatMarketUsd(stream.metrics.marketCap.current, priceUsd)}</span>
        <span className="metric">$/Viewer {formatMarketPerViewer(stream.metrics.marketCap.current, stream.metrics.viewers.current, priceUsd)}</span>
      </div>
      <footer>
        <span className="mint">{stream.mintId.slice(0, 4)}…{stream.mintId.slice(-4)}</span>
      </footer>
    </article>
  );
}

function formatViewerCount(count: number | null): string {
  if (count === null || !Number.isFinite(count)) return '—';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
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
