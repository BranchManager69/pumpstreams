import { NextResponse } from 'next/server';
import { getAssetPriceUSD } from '../../../../lib/sol-price';

const DEFAULT_REFRESH_MS = 60_000;

const SUPPORTED_ASSETS = {
  sol: {
    id: 'solana',
    cacheEnv: 'NEXT_SOL_PRICE_CACHE_MS',
  },
  btc: {
    id: 'bitcoin',
    cacheEnv: 'NEXT_BTC_PRICE_CACHE_MS',
  },
  eth: {
    id: 'ethereum',
    cacheEnv: 'NEXT_ETH_PRICE_CACHE_MS',
  },
} as const;

type SupportedSymbol = keyof typeof SUPPORTED_ASSETS;

type Params = {
  asset: string;
};

function normalizeRefreshMs(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 5_000) {
    return DEFAULT_REFRESH_MS;
  }
  return value;
}

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Params }) {
  const symbol = params.asset?.toLowerCase();
  if (!symbol || !(symbol in SUPPORTED_ASSETS)) {
    return NextResponse.json({ error: 'Unsupported asset' }, { status: 404 });
  }

  const config = SUPPORTED_ASSETS[symbol as SupportedSymbol];
  const rawEnv = config.cacheEnv ? process.env[config.cacheEnv] : undefined;
  const cacheWindow = normalizeRefreshMs(rawEnv !== undefined ? Number(rawEnv) : undefined);

  try {
    const priceUsd = await getAssetPriceUSD({ assetId: config.id, cacheMs: cacheWindow });
    return NextResponse.json(
      {
        symbol: symbol.toUpperCase(),
        assetId: config.id,
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
    console.error(`[api/asset-price/${symbol}] failed`, error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
