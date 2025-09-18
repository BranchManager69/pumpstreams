import type { DashboardStream } from '../lib/types';

export type DashboardTotals = {
  totalStreams: number;
  liveStreams: number;
  disconnectingStreams: number;
  totalLiveViewers: number;
  totalLiveMarketCap: number;
};

export type DashboardEvent = {
  mintId: string;
  type: 'drop' | 'surge';
  message: string;
  severity: 'info' | 'warning';
  timestamp: string | null;
};

export type DashboardPayload = {
  generatedAt: string;
  windowMinutes: number;
  streams: DashboardStream[];
  spotlight: DashboardStream[];
  totals: DashboardTotals;
  events: DashboardEvent[];
  supabaseOffline?: boolean;
  latestSnapshotAt: string | null;
  oldestSnapshotAgeSeconds: number | null;
};
