import { NextResponse } from 'next/server';
import { getSolPriceUSD } from '../../../lib/sol-price';

const DEFAULT_REFRESH_MS = 60_000;

function normalizeRefreshMs(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 5_000) {
    return DEFAULT_REFRESH_MS;
  }
  return value;
}

export const dynamic = 'force-dynamic';

export async function GET() {
  const envValue = process.env.NEXT_SOL_PRICE_CACHE_MS;
  const cacheWindow = normalizeRefreshMs(envValue !== undefined ? Number(envValue) : undefined);

  try {
    const priceUsd = await getSolPriceUSD({ cacheMs: cacheWindow });
    return NextResponse.json(
      {
        priceUsd,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          'cache-control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error('[api/sol-price] failed', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
