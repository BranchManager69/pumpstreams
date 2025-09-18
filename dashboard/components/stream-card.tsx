'use client';

import type { DashboardStream } from '../lib/types';
import { useSolPrice } from './sol-price-context';

export type StreamCardProps = {
  stream: DashboardStream;
  rank: number;
  ageOffsetSeconds: number;
};

export function StreamCard({ stream, rank, ageOffsetSeconds }: StreamCardProps) {
  const { priceUsd } = useSolPrice();
  return (
    <article className={`mobile-card mobile-${stream.status}`}>
      <header>
        <div className="rank">#{rank}</div>
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
        <strong>{(stream.metrics.viewers.current ?? 0).toLocaleString()}</strong>
        <span>viewers</span>
      </div>
      <div className="second-line">
        <span className="market-line">MC {formatMarketUsd(stream.metrics.marketCap.current, priceUsd)}</span>
      </div>
      <footer>
        <span className="mint">{stream.mintId.slice(0, 4)}…{stream.mintId.slice(-4)}</span>
      </footer>
    </article>
  );
}

function formatMarketUsd(sol: number | null, priceUsd: number | null): string {
  if (sol === null || !Number.isFinite(sol) || priceUsd === null || !Number.isFinite(priceUsd)) return '$—';
  const usd = sol * priceUsd;
  if (usd < 1_000) return '<$1.0K';
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  return `$${(usd / 1_000).toFixed(1)}K`;
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
