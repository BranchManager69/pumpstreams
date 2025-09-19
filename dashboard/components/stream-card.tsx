'use client';

import type { DashboardStream } from '../lib/types';
import { useSolPrice } from './sol-price-context';
import { formatAge, formatCountdown, formatMarketUsd, formatViewerCount } from './metric-formatters';
import { ViewersPerKVisual } from './viewers-per-k';

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
        <div
          className={`thumb${stream.thumbnail ? '' : ' thumb--fallback'}`}
          style={stream.thumbnail ? { backgroundImage: `url(${stream.thumbnail})` } : undefined}
        >
          {!stream.thumbnail && (
            <span className="thumb-initial">{(stream.symbol ?? stream.name ?? stream.mintId.slice(0, 2)).slice(0, 2).toUpperCase()}</span>
          )}
        </div>
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
        <span className="metric metric--iconic">
          <span className="metric__label">V/$1K</span>
          <ViewersPerKVisual
            solAmount={stream.metrics.marketCap.current}
            viewerCount={stream.metrics.viewers.current}
            priceUsd={priceUsd}
            layout="card"
          />
        </span>
      </div>
      <footer>
        <span className="mint">{stream.mintId.slice(0, 4)}…{stream.mintId.slice(-4)}</span>
      </footer>
    </article>
  );
}
