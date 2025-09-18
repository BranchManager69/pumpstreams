'use client';

import { useState } from 'react';
import type { DashboardStream } from '../lib/types';

export type OctoboxDockProps = {
  slots: (DashboardStream | null)[];
  onRemove: (index: number) => void;
};

export function OctoboxDock({ slots, onRemove }: OctoboxDockProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleSlots = expanded ? slots : slots.slice(0, 4);

  return (
    <section className={`octobox-dock${expanded ? ' expanded' : ''}`}>
      <header>
        <h2>Octobox</h2>
        <button type="button" onClick={() => setExpanded((open) => !open)}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </header>
      <div className="octobox-grid">
        {visibleSlots.map((stream, index) => (
          <div key={index} className="octobox-slot">
            {stream ? (
              <>
                <div
                  className="slot-thumb"
                  style={{ backgroundImage: `url(${stream.thumbnail ?? ''})` }}
                >
                  <div className="slot-overlay">
                    <strong>{stream.name ?? stream.symbol ?? stream.mintId.slice(0, 6)}</strong>
                    <span>{(stream.metrics.viewers.current ?? 0).toLocaleString()} viewers</span>
                    <a href={`https://pump.fun/${stream.mintId}`} target="_blank" rel="noreferrer">
                      Open stream ↗
                    </a>
                  </div>
                </div>
                <button type="button" className="remove" onClick={() => onRemove(index)}>
                  Remove
                </button>
              </>
            ) : (
              <div className="slot-empty">Empty slot</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
