'use client';

import type { DashboardEvent } from '../types/dashboard';

export type CriticalEventsBarProps = {
  events: DashboardEvent[];
};

export function CriticalEventsBar({ events }: CriticalEventsBarProps) {
  if (!events.length) return null;

  return (
    <div className="critical-events" role="status" aria-live="polite">
      {events.slice(0, 5).map((event) => (
        <div key={`${event.type}-${event.mintId}`} className={`event ${event.severity}`}>
          <span className="tag">{event.type === 'drop' ? 'Drop' : 'Surge'}</span>
          <span className="message">{event.message}</span>
        </div>
      ))}
    </div>
  );
}
