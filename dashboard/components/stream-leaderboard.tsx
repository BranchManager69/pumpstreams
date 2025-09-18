'use client';

import type { DashboardStream } from '../lib/types';
import { StreamCard } from './stream-card';

export type LiveLeaderboardProps = {
  streams: DashboardStream[];
  onAddToOctobox: (mintId: string) => void;
  ageOffsetSeconds: number;
};

const statusOrder: DashboardStream['status'][] = ['live', 'disconnecting'];
const statusLabels: Record<DashboardStream['status'], string> = {
  live: 'Live right now',
  disconnecting: 'Signal lost · pending cutoff',
};

export function LiveLeaderboard({ streams, onAddToOctobox, ageOffsetSeconds }: LiveLeaderboardProps) {
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
                    <tr key={stream.mintId} className={stream.status === 'disconnecting' ? 'status-disconnecting' : ''}>
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
                        <div
                          className={`preview-thumb${stream.status === 'disconnecting' ? ' preview-thumb--disconnecting' : ''}`}
                          style={{ backgroundImage: `url(${stream.thumbnail ?? ''})` }}
                        >
                          <span>{formatAge(stream.metrics.lastSnapshotAgeSeconds, ageOffsetSeconds)}</span>
                          {stream.status === 'disconnecting' && (
                            <div
                              className="preview-thumb__overlay"
                              role="status"
                              aria-label={`Signal lost, removing in ${Math.max(
                                0,
                                (stream.dropCountdownSeconds ?? 0) - ageOffsetSeconds
                              )} seconds`}
                            >
                              <DisconnectIcon />
                              <span>{formatCountdown(stream.dropCountdownSeconds, ageOffsetSeconds)}</span>
                            </div>
                          )}
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
          <StreamCard
            key={stream.mintId}
            stream={stream}
            rank={index + 1}
            onAddToOctobox={onAddToOctobox}
            ageOffsetSeconds={ageOffsetSeconds}
          />
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

function DisconnectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M5.75 4.25L3 7l2.75 2.75M10.25 4.25L13 7l-2.75 2.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 12.5h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
