'use client';

import { Fragment } from 'react';
import type { DashboardStream } from '../lib/types';
import { StreamCard } from './stream-card';
import { useSolPrice } from './sol-price-context';
import { formatAge, formatMarketUsd, formatViewerCount } from './metric-formatters';
import { ViewersPerKVisual } from './viewers-per-k';

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

  let rankCursor = 0;
  const tableSections = statusOrder.map((status) => {
    const bucket = grouped.get(status) ?? [];
    if (!bucket.length) return null;
    return (
      <Fragment key={status}>
        <tr className="section-row">
          <td colSpan={5}>{statusLabels[status]}</td>
        </tr>
        {bucket.map((stream) => {
          rankCursor += 1;
          const thumbClass = `stream-thumb${stream.thumbnail ? '' : ' stream-thumb--fallback'}`;
          const thumbStyle = stream.thumbnail ? { backgroundImage: `url(${stream.thumbnail})` } : undefined;
          const fallbackLabel = (stream.symbol ?? stream.name ?? stream.mintId.slice(0, 2)).slice(0, 2).toUpperCase();
          const symbolLabel = stream.symbol ?? stream.mintId.slice(0, 8);
          const ageLabel = formatAge(stream.metrics.lastSnapshotAgeSeconds, ageOffsetSeconds);
          return (
            <tr key={stream.mintId} className={stream.status === 'disconnecting' ? 'status-disconnecting' : ''}>
              <td className="numeric-cell">{rankCursor}</td>
              <td className="cell-stream" title={`${symbolLabel} · Last update ${ageLabel}`}>
                <div className={thumbClass} style={thumbStyle}>
                  {!stream.thumbnail && <span className="thumb-initial">{fallbackLabel}</span>}
                </div>
                <div className="stream-meta">
                  <div className="name">{stream.name ?? stream.symbol ?? stream.mintId.slice(0, 6)}</div>
                </div>
              </td>
              <td className="align-right viewers-cell numeric-cell">{formatViewerCount(stream.metrics.viewers.current)}</td>
              <td className="align-right numeric-cell">
                <span className="market-chip">{formatMarketUsd(stream.metrics.marketCap.current, priceUsd)}</span>
              </td>
              <td className="align-right ratio-cell">
                <ViewersPerKVisual
                  solAmount={stream.metrics.marketCap.current}
                  viewerCount={stream.metrics.viewers.current}
                  priceUsd={priceUsd}
                  layout="table"
                />
              </td>
            </tr>
          );
        })}
      </Fragment>
    );
  });

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
              <th className="align-right">Viewers / $1K</th>
            </tr>
          </thead>
          <tbody>{tableSections}</tbody>
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
