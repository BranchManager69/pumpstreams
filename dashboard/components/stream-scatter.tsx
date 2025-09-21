"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardStream } from "../lib/types";

const MIN_VALUE = 0.001;
const TRANSITION_MS = 900;
const EDGE_PADDING_PERCENT = 6; // keep bubbles away from border

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value: number | null | undefined, options: Intl.NumberFormatOptions = {}) {
  if (value === null || value === undefined) return "n/a";
  return new Intl.NumberFormat(undefined, options).format(value);
}

type TooltipState = {
  id: string;
  left: number;
  top: number;
  content: {
    name: string;
    viewers: number;
    marketCapUsd: number | null;
    marketCapSol: number | null;
    snapshotAge: number | null;
  };
} | null;

export type StreamScatterProps = {
  streams: DashboardStream[];
  priceUsd: number | null;
};

export function StreamScatter({ streams, priceUsd }: StreamScatterProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [renderKey, setRenderKey] = useState(0);

  const points = useMemo(() => {
    return streams
      .map((stream) => {
        const viewers = stream.metrics.viewers.current ?? 0;
        const marketCapSol = stream.metrics.marketCap.current ?? 0;
        const marketCapUsd = priceUsd ? marketCapSol * priceUsd : null;
        return {
          id: stream.mintId,
          name: stream.name ?? stream.symbol ?? stream.mintId.slice(0, 6),
          thumbnail: stream.thumbnail ?? null,
          status: stream.status,
          viewers,
          marketCapSol,
          marketCapUsd,
          viewersSafe: Math.max(viewers, MIN_VALUE),
          marketCapSafe: Math.max(marketCapUsd ?? marketCapSol, MIN_VALUE),
          snapshotAge: stream.metrics.lastSnapshotAgeSeconds ?? null,
        };
      })
      .filter((point) => point.viewersSafe > 0 || point.marketCapSafe > 0);
  }, [streams, priceUsd]);

  const scales = useMemo(() => {
    if (!points.length) {
      return {
        toX: () => 50,
        toY: () => 50,
        radius: () => 10,
      };
    }

    const viewerValues = points.map((p) => p.viewersSafe);
    const marketValues = points.map((p) => p.marketCapSafe);

    const viewerMin = Math.min(...viewerValues);
    const viewerMax = Math.max(...viewerValues);
    const marketMin = Math.min(...marketValues);
    const marketMax = Math.max(...marketValues);

    const viewerRange = Math.log10(viewerMax + 1) - Math.log10(viewerMin + 1) || 1;
    const marketRange = Math.log10(marketMax + 1) - Math.log10(marketMin + 1) || 1;

    const minCoord = EDGE_PADDING_PERCENT;
    const maxCoord = 100 - EDGE_PADDING_PERCENT;

    const toX = (value: number) => {
      const normalized = (Math.log10(value + 1) - Math.log10(viewerMin + 1)) / viewerRange;
      return clamp(minCoord + normalized * (maxCoord - minCoord), minCoord, maxCoord);
    };

    const toY = (value: number) => {
      const normalized = (Math.log10(value + 1) - Math.log10(marketMin + 1)) / marketRange;
      const inverted = 1 - normalized;
      return clamp(minCoord + inverted * (maxCoord - minCoord), minCoord, maxCoord);
    };

    const radius = (value: number) => {
      const combined = Math.log10(value + 1);
      return clamp(8 + combined * 3.6, 6, 30);
    };

    return { toX, toY, radius };
  }, [points]);

  useEffect(() => {
    setRenderKey((key) => key + 1);
  }, [points.length]);

  const handleEnter = (event: React.MouseEvent<HTMLAnchorElement>, point: (typeof points)[number]) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const { clientX, clientY } = event;
    setTooltip({
      id: point.id,
      left: clientX - rect.left,
      top: clientY - rect.top,
      content: {
        name: point.name,
        viewers: point.viewers,
        marketCapUsd: point.marketCapUsd,
        marketCapSol: point.marketCapSol,
        snapshotAge: point.snapshotAge,
      },
    });
  };

  const handleMove = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!canvasRef.current) return;
    if (!tooltip) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const { clientX, clientY } = event;
    setTooltip((prev) =>
      prev
        ? {
            ...prev,
            left: clientX - rect.left,
            top: clientY - rect.top,
          }
        : null,
    );
  };

  const handleLeave = () => {
    setTooltip(null);
  };

  if (!points.length) {
    return (
      <div className="stream-scatter__empty">
        <p>No live streams to plot right now.</p>
      </div>
    );
  }

  return (
    <div className="stream-scatter" role="presentation">
      <div className="stream-scatter__body" ref={canvasRef}>
        <div className="stream-scatter__grid" aria-hidden="true" />
        <div className="stream-scatter__points" key={renderKey}>
          {points.map((point) => {
            const x = scales.toX(point.viewersSafe);
            const y = scales.toY(point.marketCapSafe);
            const size = scales.radius(point.viewersSafe + point.marketCapSafe);
            const statusClass = point.status === "disconnecting" ? "status-disc" : "status-live";

            return (
              <Link
                key={point.id}
                href={`/tokens/${point.id}`}
                className={`scatter-point ${statusClass}`}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                  transitionDuration: `${TRANSITION_MS}ms`,
                  backgroundImage: point.thumbnail ? `url(${point.thumbnail})` : undefined,
                }}
                onMouseEnter={(event) => handleEnter(event, point)}
                onMouseMove={handleMove}
                onMouseLeave={handleLeave}
              >
                {!point.thumbnail && <span>{point.name.slice(0, 2).toUpperCase()}</span>}
              </Link>
            );
          })}
        </div>

        {tooltip && (
          <div className="stream-scatter__tooltip" style={{ left: tooltip.left, top: tooltip.top }} role="status">
            <div className="tooltip-name">{tooltip.content.name}</div>
            <div className="tooltip-row">
              <span>Viewers</span>
              <span>{formatNumber(tooltip.content.viewers)}</span>
            </div>
            <div className="tooltip-row">
              <span>Mkt cap</span>
              <span>
                {tooltip.content.marketCapUsd !== null
                  ? `$${formatNumber(tooltip.content.marketCapUsd, { maximumFractionDigits: 0 })}`
                  : `${formatNumber(tooltip.content.marketCapSol, { maximumFractionDigits: 1 })} SOL`}
              </span>
            </div>
            {tooltip.content.snapshotAge !== null && (
              <div className="tooltip-row">
                <span>Snapshot age</span>
                <span>{tooltip.content.snapshotAge}s</span>
              </div>
            )}
          </div>
        )}
      </div>

      <span className="stream-scatter__axis stream-scatter__axis--x">Viewers</span>
      <span className="stream-scatter__axis stream-scatter__axis--y">
        <span>MKT</span>
        <span>CAP</span>
      </span>
    </div>
  );
}
