'use client';

import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SnapshotPoint } from '../lib/types';

export type StreamCardProps = {
  rank: number;
  mintId: string;
  name: string;
  symbol: string;
  participants: number | null;
  marketCap: number | null;
  viewersChange?: number | null;
  marketCapChange?: number | null;
  snapshotHistory: SnapshotPoint[];
  isStale: boolean;
  latestAt: string | null;
};

function formatNumber(value: number | null | undefined, fractionDigits = 0) {
  if (value === null || value === undefined) return '—';
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}

function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function formatRelativeToNow(value: string | null) {
  if (!value) return '—';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '—';
  const diffMs = timestamp - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 1) {
    const diffSeconds = Math.round(diffMs / 1000);
    return relativeTime.format(diffSeconds, 'second');
  }
  if (Math.abs(diffMinutes) < 60) {
    return relativeTime.format(diffMinutes, 'minute');
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return relativeTime.format(diffHours, 'hour');
  }
  const diffDays = Math.round(diffHours / 24);
  return relativeTime.format(diffDays, 'day');
}

function formatDelta(value: number | null | undefined, compact = false) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return compact ? `${prefix}${formatCompact(Math.abs(value))}` : `${prefix}${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
}

export function StreamCard(props: StreamCardProps) {
  const gapThresholdMinutes = Number(process.env.NEXT_PUBLIC_SPARKLINE_GAP_MINUTES ?? '3');
  const gapThresholdMs = gapThresholdMinutes * 60 * 1000;

  const { chartData, hasGap } = useMemo(() => {
    const sortedHistory = [...props.snapshotHistory]
      .map((point) => ({
        timestamp: new Date(point.fetched_at).getTime(),
        participants: point.num_participants ?? null,
        marketCap: point.market_cap ?? null,
      }))
      .filter((point) => Number.isFinite(point.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp);

    const data: Array<{
      timestamp: number;
      label: string;
      participants: number | null;
      marketCap: number | null;
    }> = [];
    let previousTimestamp: number | null = null;
    let detectedGap = false;

    const pushPoint = (timestamp: number, participants: number | null, marketCap: number | null) => {
      data.push({
        timestamp,
        label: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        participants,
        marketCap,
      });
    };

    for (const point of sortedHistory) {
      if (previousTimestamp !== null && point.timestamp - previousTimestamp > gapThresholdMs) {
        detectedGap = true;
        data.push({
          timestamp: point.timestamp - 1,
          label: 'gap',
          participants: null,
          marketCap: null,
        });
      }
      pushPoint(point.timestamp, point.participants, point.marketCap);
      previousTimestamp = point.timestamp;
    }

    const latestTimestamp = props.latestAt ? new Date(props.latestAt).getTime() : null;
    const latestParticipants = props.participants ?? null;
    const latestMarketCap = props.marketCap ?? null;

    const lastPoint = data.at(-1);
    const shouldAppendLatest =
      latestTimestamp !== null &&
      (lastPoint === undefined || lastPoint.timestamp !== latestTimestamp || lastPoint.participants !== latestParticipants);

    if (shouldAppendLatest && latestTimestamp !== null) {
      if (lastPoint && latestTimestamp - lastPoint.timestamp > gapThresholdMs) {
        detectedGap = true;
        data.push({
          timestamp: latestTimestamp - 1,
          label: 'gap',
          participants: null,
          marketCap: null,
        });
      }
      pushPoint(latestTimestamp, latestParticipants, latestMarketCap);
    }

    return { chartData: data, hasGap: detectedGap };
  }, [props.snapshotHistory, props.participants, props.marketCap, props.latestAt, gapThresholdMs]);

  const deltaClass = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '';
    if (value > 0) return 'delta-positive';
    if (value < 0) return 'delta-negative';
    return '';
  };

  return (
    <div className={`stream-row${props.isStale ? ' stale' : ''}`}>
      <div className="row-rank">
        <div className="rank-pill">#{props.rank}</div>
        <div className={`status-pill ${props.isStale ? 'inactive' : 'active'}`}>
          {props.isStale ? 'Inactive' : 'Live'}
        </div>
      </div>
      <div className="row-content">
        <div className="row-header">
        <div>
          <div className="row-title">{props.name || 'Untitled Stream'}</div>
          <div className="row-subtitle">{props.symbol || '—'} · {props.mintId.slice(0, 8)}...</div>
        </div>
        <div className="row-meta">
          <span className="last-updated">Updated {formatRelativeToNow(props.latestAt)}</span>
          {hasGap && (
            <span className="gap-indicator" title={`No data for ≥${gapThresholdMinutes} minutes`}>gap ≥ {gapThresholdMinutes}m</span>
          )}
        </div>
      </div>
        <div className="row-metrics">
          <div className="metric">
            <span>Viewers</span>
            <strong>{formatNumber(props.participants)}</strong>
            <small className={deltaClass(props.viewersChange)}>Δ {formatDelta(props.viewersChange)}</small>
          </div>
          <div className="metric">
            <span>Market Cap (SOL)</span>
            <strong>{formatCompact(props.marketCap)}</strong>
            <small className={deltaClass(props.marketCapChange)}>Δ {formatDelta(props.marketCapChange, true)}</small>
          </div>
        </div>
      </div>
      <div className="row-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
            <defs>
              <linearGradient id={`colorViewers-${props.mintId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7bf0ff" stopOpacity={0.75} />
                <stop offset="100%" stopColor="#7bf0ff" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis hide dataKey="label" interval="preserveStartEnd" />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{
                background: 'rgba(12, 14, 22, 0.85)',
                border: '1px solid rgba(123, 240, 255, 0.35)',
                borderRadius: 12,
              }}
              labelStyle={{ color: '#93b3ff', fontWeight: 600 }}
              formatter={(value, name) => {
                const metricName = name === 'participants' ? 'Viewers' : 'Market Cap (SOL)';
                if (value === null || value === undefined) {
                  return ['No data', metricName];
                }
                if (Array.isArray(value)) {
                  const numeric = Number(value[0]);
                  if (Number.isFinite(numeric)) {
                    return [numeric.toLocaleString(), metricName];
                  }
                  return [String(value[0]), metricName];
                }
                if (typeof value === 'number') {
                  return [value.toLocaleString(), metricName];
                }
                const numeric = Number(value);
                if (Number.isFinite(numeric)) {
                  return [numeric.toLocaleString(), metricName];
                }
                return [String(value), metricName];
              }}
            />
            <Area
              type="monotone"
              dataKey="participants"
              stroke="#7bf0ff"
              fill={`url(#colorViewers-${props.mintId})`}
              strokeWidth={2}
              connectNulls={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
