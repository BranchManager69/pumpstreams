'use client';

import Image from 'next/image';
import type { DashboardStream } from '../lib/types';

export type SpotlightReelProps = {
  streams: DashboardStream[];
};

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
                <span className={deltaClass(stream.metrics.viewers.momentum.delta5m)}>
                  {formatDelta(stream.metrics.viewers.momentum.delta5m)} / 5m
                </span>
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

function deltaClass(delta: number | null): string {
  if (delta === null) return 'muted';
  if (delta > 0) return 'positive';
  if (delta < 0) return 'negative';
  return 'muted';
}

function formatDelta(delta: number | null): string {
  if (delta === null) return '—';
  if (delta === 0) return '0';
  return `${delta > 0 ? '+' : ''}${delta.toLocaleString()}`;
}
