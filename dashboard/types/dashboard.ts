import type { SerializableStream } from '../lib/types';

export type DashboardTotals = {
  activeCount: number;
  inactiveCount: number;
  totalViewers: number;
  totalMarketCap: number;
};

export type DashboardPayload = {
  entries: SerializableStream[];
  totals: DashboardTotals;
};
