'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type SnapshotPoint = {
  fetched_at: string;
  num_participants: number | null;
  market_cap: number | null;
};

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

export function StreamCard(props: StreamCardProps) {
  const history = props.snapshotHistory.map((point) => ({
    time: new Date(point.fetched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    participants: point.num_participants ?? 0,
    marketCap: point.market_cap ?? 0,
  }));

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="badge">#{props.rank}</div>
          <div className="card-title">{props.name || 'Untitled Stream'}</div>
          <div className="card-subtitle">{props.symbol || '—'} · {props.mintId.slice(0, 8)}...</div>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric">
          <span>Viewers</span>
          <strong>{formatNumber(props.participants)}</strong>
          <small>Δ {formatNumber(props.viewersChange, 1)}</small>
        </div>
        <div className="metric">
          <span>Market Cap (SOL)</span>
          <strong>{formatCompact(props.marketCap)}</strong>
          <small>Δ {formatCompact(props.marketCapChange ?? 0)}</small>
        </div>
      </div>

      <div className="sparkline-wrapper">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
            <defs>
              <linearGradient id={`colorViewers-${props.mintId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7bf0ff" stopOpacity={0.75} />
                <stop offset="100%" stopColor="#7bf0ff" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis hide dataKey="time" interval="preserveStartEnd" />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{
                background: 'rgba(12, 14, 22, 0.85)',
                border: '1px solid rgba(123, 240, 255, 0.35)',
                borderRadius: 12,
              }}
              labelStyle={{ color: '#93b3ff', fontWeight: 600 }}
              formatter={(value: number, name: string) => [value.toLocaleString(), name === 'participants' ? 'Viewers' : 'Market Cap (SOL)']}
            />
            <Area type="monotone" dataKey="participants" stroke="#7bf0ff" fill={`url(#colorViewers-${props.mintId})`} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
