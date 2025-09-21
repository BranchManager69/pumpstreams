export type StreamStatus = 'live' | 'disconnecting';

export type StreamMetadata = {
  mint_id: string;
  name: string | null;
  symbol: string | null;
  description: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  image_uri: string | null;
  banner_uri: string | null;
  thumbnail: string | null;
  creator_address: string | null;
  bonding_curve: Record<string, any> | null;
  real_sol_reserves: number | null;
  real_token_reserves: number | null;
  virtual_sol_reserves: number | null;
  virtual_token_reserves: number | null;
  ath_market_cap: number | null;
  ath_market_cap_timestamp: string | null;
  total_supply: number | null;
  is_currently_live: boolean | null;
  nsfw: boolean | null;
  hidden: boolean | null;
  downrank_score: number | null;
  livestream_downrank_score: number | null;
  last_reply: string | null;
  last_trade_timestamp: string | null;
  livestream_ban_expiry: string | null;
  king_of_the_hill_timestamp: string | null;
  created_timestamp: string | null;
  metadata_uri: string | null;
  pump_swap_pool: string | null;
  raydium_pool: string | null;
  market_id: string | null;
  program: string | null;
  platform: string | null;
  hide_banner: boolean | null;
  complete: boolean | null;
  inverted: boolean | null;
};

export type StreamMetrics = {
  lastSnapshotAgeSeconds: number | null;
  viewers: {
    current: number | null;
  };
  marketCap: {
    current: number | null; // USD alias for backwards compatibility
    usd: number | null;
    sol: number | null;
  };
};

export type DashboardStream = {
  mintId: string;
  name: string | null;
  symbol: string | null;
  thumbnail: string | null;
  status: StreamStatus;
  latestAt: string | null;
  dropCountdownSeconds: number | null;
  metrics: StreamMetrics;
  metadata: StreamMetadata | null;
};

export type StreamSort = 'marketCap' | 'viewers';
