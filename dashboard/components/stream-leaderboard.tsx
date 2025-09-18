'use client';

import type { DashboardStream } from '../lib/types';
import { StreamCard } from './stream-card';

export type LiveLeaderboardProps = {
  streams: DashboardStream[];
  onAddToOctobox: (mintId: string) => void;
};

const statusOrder: DashboardStream['status'][] = ['live', 'cooldown', 'ended'];
const statusLabels: Record<DashboardStream['status'], string> = {
  live: 'Live right now',
  cooldown: 'Cooling off',
  ended: 'Recently ended',
  archived: 'Earlier sessions',
};

export function LiveLeaderboard({ streams, onAddToOctobox }: LiveLeaderboardProps) {
  const grouped = new Map<DashboardStream['status'], DashboardStream[]>();
  for (const status of statusOrder) grouped.set(status, []);
  grouped.set('archived', []);

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
              <th className="align-right">Δ5m</th>
              <th className="align-right">Δ15m</th>
              <th className="align-right">Market (SOL)</th>
              <th>Preview</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {statusOrder.map((status) => {
              const bucket = grouped.get(status) ?? [];
              if (!bucket.length) return null;
              return (
                <>
                  <tr key={`${status}-divider`} className="section-row">
                    <td colSpan={8}>{statusLabels[status]}</td>
                  </tr>
                  {bucket.map((stream, index) => (
                    <tr key={stream.mintId}>
                      <td>{index + 1}</td>
                      <td>
                        <div className="cell-stream">
                          <div className="name">{stream.name ?? stream.symbol ?? stream.mintId.slice(0, 6)}</div>
                          <div className="meta">{stream.symbol ?? stream.mintId.slice(0, 8)}</div>
                        </div>
                      </td>
                      <td className="align-right">{(stream.metrics.viewers.current ?? 0).toLocaleString()}</td>
                      <td className={deltaClass(stream.metrics.viewers.momentum.delta5m)}>
                        {formatDelta(stream.metrics.viewers.momentum.delta5m)}
                      </td>
                      <td className={deltaClass(stream.metrics.viewers.momentum.delta15m)}>
                        {formatDelta(stream.metrics.viewers.momentum.delta15m)}
                      </td>
                      <td className="align-right">{formatNumber(stream.metrics.marketCap.current)}</td>
                      <td>
                        <div className="preview-thumb" style={{ backgroundImage: `url(${stream.thumbnail ?? ''})` }}>
                          <span>{formatAge(stream.metrics.lastSnapshotAgeSeconds)}</span>
                        </div>
                      </td>
                      <td className="actions">
                        <button type="button" onClick={() => onAddToOctobox(stream.mintId)}>
                          Add to Octobox
                        </button>
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
          <StreamCard key={stream.mintId} stream={stream} rank={index + 1} onAddToOctobox={onAddToOctobox} />
        ))}
      </div>
    </section>
  );
}

function deltaClass(delta: number | null): string {
  if (delta === null) return 'align-right muted';
  if (delta > 0) return 'align-right positive';
  if (delta < 0) return 'align-right negative';
  return 'align-right muted';
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
