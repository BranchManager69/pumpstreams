'use client';

import type { DashboardStream } from '../lib/types';

export type StreamCardProps = {
  stream: DashboardStream;
  rank: number;
  onAddToOctobox: (mintId: string) => void;
};

export function StreamCard({ stream, rank, onAddToOctobox }: StreamCardProps) {
  return (
    <article className={`mobile-card mobile-${stream.status}`}>
      <header>
        <div className="rank">#{rank}</div>
        <div>
          <h3>{stream.name ?? stream.symbol ?? stream.mintId.slice(0, 6)}</h3>
          <span className="meta">{stream.symbol ?? stream.mintId.slice(0, 8)}</span>
        </div>
        <small>{formatAge(stream.metrics.lastSnapshotAgeSeconds)}</small>
      </header>
      <div className="hero-line">
        <strong>{(stream.metrics.viewers.current ?? 0).toLocaleString()}</strong>
        <span>viewers</span>
        <span className={deltaClass(stream.metrics.viewers.momentum.delta5m)}>
          {formatDelta(stream.metrics.viewers.momentum.delta5m)} / 5m
        </span>
      </div>
      <div className="second-line">
        <span>Δ15m {formatDelta(stream.metrics.viewers.momentum.delta15m)}</span>
        <span>Market {formatNumber(stream.metrics.marketCap.current)} SOL</span>
      </div>
      <footer>
        <button type="button" onClick={() => onAddToOctobox(stream.mintId)}>
          Add to Octobox
        </button>
        <span className="mint">{stream.mintId.slice(0, 4)}…{stream.mintId.slice(-4)}</span>
      </footer>
    </article>
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

function formatNumber(value: number | null): string {
  if (value === null) return '—';
  if (!Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatAge(age: number | null): string {
  if (age === null) return '—';
  if (age < 60) return `${age}s ago`;
  const minutes = Math.floor(age / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
