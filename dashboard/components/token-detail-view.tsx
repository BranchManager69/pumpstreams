"use client";

import Link from 'next/link';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TokenDetail } from '../lib/get-token-detail';
import { format } from '../lib/time-format';
import { formatMetric, formatUsdCompact } from './metric-formatters';
import { ClipDownloadButton } from './token-detail/clip-download-button';

type TokenDetailViewProps = {
  detail: TokenDetail;
  solUsdPrice?: number | null;
};

function formatDurationMs(duration: number | null | undefined): string {
  if (!duration || duration <= 0) return 'n/a';
  const seconds = Math.round(duration / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}h ${remMinutes}m`;
  }
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'n/a';
  try {
    return format(new Date(value));
  } catch {
    return value;
  }
}

function buildHistorySeries(detail: TokenDetail) {
  return detail.history.map((point) => ({
    fetched_at: point.fetched_at,
    label: format(new Date(point.fetched_at), { style: 'time' }),
    viewers: point.num_participants ?? 0,
    market_cap: point.market_cap ?? 0,
  }));
}

export function TokenDetailView({ detail, solUsdPrice }: TokenDetailViewProps) {

  const { token, latest } = detail;
  const mintId = detail.mintId;
  const historySeries = buildHistorySeries(detail);
  const latestViewers = latest?.num_participants ?? null;
  const latestMarketCap = latest?.market_cap ?? null;
  const latestMarketUsd = solUsdPrice && latestMarketCap ? formatUsdCompact(latestMarketCap * solUsdPrice) : 'n/a';
  const viewersLabel = latestViewers !== null ? formatMetric(latestViewers) : 'n/a';
  const marketCapLabel = latestMarketCap !== null ? `${formatMetric(latestMarketCap)} SOL` : 'n/a';

  const clipCount = detail.clips.length;
  const liveUrl = `https://pump.fun/${mintId}`;

  return (
    <div className="token-detail">
      <section className="token-hero">
        <div className="token-identity">
          <div
            className={`token-thumb${latest?.thumbnail ? '' : ' token-thumb--fallback'}`}
            style={latest?.thumbnail ? { backgroundImage: `url(${latest.thumbnail})` } : undefined}
          >
            {!latest?.thumbnail && (
              <span className="token-thumb__initial">{(token?.symbol ?? token?.name ?? mintId.slice(0, 2)).slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div>
            <h1>{token?.name ?? token?.symbol ?? mintId.slice(0, 6)}</h1>
            <p className="token-subtitle">{token?.symbol ?? mintId.slice(0, 8)}</p>
            <p className="token-mint">
              <code>{mintId}</code>
            </p>
          </div>
        </div>
        <div className="token-metrics">
          <dl>
            <div>
              <dt>Viewers</dt>
              <dd>{viewersLabel}</dd>
            </div>
            <div>
              <dt>Market Cap</dt>
              <dd>{marketCapLabel}</dd>
            </div>
            <div>
              <dt>Market Cap (USD)</dt>
              <dd>{latestMarketUsd}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{latest?.is_live ? 'Live' : 'Offline'}</dd>
            </div>
            <div>
              <dt>Approved Creator</dt>
              <dd>{token?.is_approved_creator ? 'Yes' : 'Unknown'}</dd>
            </div>
          </dl>
        </div>
        <div className="token-actions">
          <Link href={liveUrl} target="_blank" rel="noreferrer" className="action-button">
            View on Pump.fun
          </Link>
          <a href="#clips" className="action-button secondary">
            Clips ({clipCount})
          </a>
        </div>
      </section>

      <section className="token-section">
        <header>
          <h2>Activity</h2>
          <span>
            Last sample: {formatDateTime(latest?.fetched_at)} · Created:{' '}
            {formatDateTime(token?.created_at)}
          </span>
        </header>
        <div className="token-chart">
          {historySeries.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={historySeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="viewersGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#61dfff" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#61dfff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 12 }} width={60} />
                <Tooltip
                  contentStyle={{ background: '#0a0f16', border: '1px solid #1a2230', borderRadius: 8 }}
                  labelFormatter={(label, payload) => {
                    if (payload && payload.length && payload[0]?.payload?.fetched_at) {
                      return format(new Date(payload[0].payload.fetched_at));
                    }
                    return label;
                  }}
                  formatter={(value: number) => [`${value.toLocaleString()} viewers`, 'Viewers']}
                />
                <Area type="monotone" dataKey="viewers" stroke="#1fb6ff" fill="url(#viewersGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="token-chart__empty">No history captured yet.</p>
          )}
        </div>
      </section>

      <section className="token-section" id="clips">
        <header>
          <h2>Clips</h2>
          <span>{clipCount ? `${clipCount} stored` : 'No clips captured yet.'}</span>
        </header>
        {clipCount ? (
          <div className="clip-table-wrapper">
            <table className="clip-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Captured By</th>
                  <th>Duration</th>
                  <th>Viewers (min / max)</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {detail.clips.map((clip) => (
                  <tr key={clip.id}>
                    <td>{clip.label ?? '—'}</td>
                    <td>{clip.captured_by ?? 'system'}</td>
                    <td>{formatDurationMs(clip.duration_ms)}</td>
                    <td>
                      {clip.viewer_count_min ?? '—'} / {clip.viewer_count_max ?? '—'}
                    </td>
                    <td>
                      <span className={`status-pill status-pill--${clip.status ?? 'unknown'}`}>
                        {clip.status ?? 'unknown'}
                      </span>
                      {clip.notes ? <small className="clip-notes">{clip.notes}</small> : null}
                    </td>
                    <td>{formatDateTime(clip.created_at)}</td>
                    <td className="clip-actions">
                      <ClipDownloadButton clipId={clip.id} track="video" disabled={!clip.s3_video_key} />
                      <ClipDownloadButton clipId={clip.id} track="audio" disabled={!clip.s3_audio_key} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No clips captured for this mint yet.</p>
        )}
      </section>
    </div>
  );
}
