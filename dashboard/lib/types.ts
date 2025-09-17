export type SnapshotPoint = {
  fetched_at: string;
  num_participants: number | null;
  market_cap: number | null;
};

export type SerializableStream = {
  mintId: string;
  name: string | null;
  symbol: string | null;
  latest: {
    fetchedAt: string | null;
    numParticipants: number | null;
    marketCap: number | null;
    thumbnail: string | null;
  } | null;
  history: SnapshotPoint[];
  isStale: boolean;
};
