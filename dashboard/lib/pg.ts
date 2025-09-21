import { Pool } from 'pg';

let pool: Pool | null = null;

function getDatabaseUrl(): string | null {
  const candidates = [
    process.env.DATABASE_URL_SESSION,
    process.env.SUPABASE_DB_URL_SESSION,
    process.env.DATABASE_URL,
    process.env.SUPABASE_DB_URL,
  ];
  for (const url of candidates) {
    if (url && url.trim()) return url.trim();
  }
  return null;
}

function getPool(): Pool | null {
  if (pool) return pool;
  const url = getDatabaseUrl();
  if (!url) return null;
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  return pool;
}

export type LatestRow = {
  mint_id: string;
  fetched_at: string;
  num_participants: number | null;
  market_cap: number | null;
  usd_market_cap: number | null;
  thumbnail: string | null;
  is_live: boolean | null;
  livestream: any | null;
};

export async function fetchFreshLatestViaPg({
  dropThresholdSeconds,
  limit,
}: {
  dropThresholdSeconds: number;
  limit: number;
}): Promise<LatestRow[] | null> {
  const p = getPool();
  if (!p) return null;

  const text = `
    select mint_id, fetched_at, num_participants, market_cap, usd_market_cap, thumbnail, is_live, livestream
    from public.livestream_latest
    where fetched_at >= now() - ($1::int * interval '1 second')
    order by num_participants desc nulls last
    limit $2
  `;
  const values = [dropThresholdSeconds, Math.max(1, limit)];
  const res = await p.query(text, values);
  return res.rows as LatestRow[];
}

