export type SnapshotPoint = {
  fetched_at: string;
  num_participants: number | null;
  market_cap: number | null;
};

export type StreamStatus = 'live' | 'cooldown' | 'ended' | 'archived';

export type StreamMomentumMetrics = {
  delta5m: number | null;
  delta15m: number | null;
  velocityPerMin: number | null;
};

export type StreamMetrics = {
  lastSnapshotAgeSeconds: number | null;
  viewers: {
    current: number | null;
    peak: number | null;
    momentum: StreamMomentumMetrics;
  };
  marketCap: {
    current: number | null;
    momentum: StreamMomentumMetrics;
  };
};

export type DashboardStream = {
  mintId: string;
  name: string | null;
  symbol: string | null;
  thumbnail: string | null;
  status: StreamStatus;
  latestAt: string | null;
  metrics: StreamMetrics;
  sparkline: SnapshotPoint[];
  score: number;
  livestreamMeta: {
    isCurrentlyLive: boolean | null;
    isComplete: boolean | null;
    totalSupply: number | null;
  } | null;
};
