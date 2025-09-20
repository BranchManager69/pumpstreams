'use client';

import Image from 'next/image';
import type { DashboardStream } from '../lib/types';

export type SpotlightReelProps = {
  streams: DashboardStream[];
};

function formatMarketCap(value: number | null): string {
  if (value === null || value === undefined) return 'MC n/a';
  const compact = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
  return `MC ${compact} SOL`;
}

export function SpotlightReel({ streams }: SpotlightReelProps) {
  if (!streams.length) {
    return null;
  }

  return (
    <section className="spotlight-reel">
      {streams.map((stream) => (
        <div key={stream.mintId} className="spotlight-item">
          <div className="thumb">
            {stream.thumbnail ? (
              <Image src={stream.thumbnail} alt={stream.name ?? stream.symbol ?? stream.mintId} fill sizes="240px" />
            ) : (
              <div className="thumb-placeholder" />
            )}
            <div className="overlay">
              <div className="title">{stream.name ?? stream.symbol ?? stream.mintId.slice(0, 6)}</div>
              <div className="stats">
                <span>{(stream.metrics.viewers.current ?? 0).toLocaleString()} viewers</span>
                <span className="muted">{formatMarketCap(stream.metrics.marketCap.current)}</span>
              </div>
            </div>
          </div>
          <div className="actions">
            <a href={`https://pump.fun/${stream.mintId}`} target="_blank" rel="noreferrer">
              Open stream ↗
            </a>
          </div>
        </div>
      ))}
    </section>
  );
}
