'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type TickerStatus = 'idle' | 'loading' | 'error';

type PriceState = {
  priceUsd: number | null;
  fetchedAt: string | null;
  status: TickerStatus;
  error: string | null;
  refresh: () => Promise<void>;
};

type SupportedAsset = 'btc' | 'eth';

type AssetConfig = {
  symbol: SupportedAsset;
  endpoint: string;
  refreshMs: number;
};

const MIN_REFRESH_MS = 15_000;
const DEFAULT_REFRESH_MS = 60_000;

function parseRefresh(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < MIN_REFRESH_MS) {
    return undefined;
  }
  return parsed;
}

const SOL_FALLBACK_REFRESH = parseRefresh(process.env.NEXT_PUBLIC_SOL_PRICE_REFRESH_MS);
const BTC_REFRESH = parseRefresh(process.env.NEXT_PUBLIC_BTC_PRICE_REFRESH_MS) ?? SOL_FALLBACK_REFRESH;
const ETH_REFRESH = parseRefresh(process.env.NEXT_PUBLIC_ETH_PRICE_REFRESH_MS) ?? SOL_FALLBACK_REFRESH;

const ASSET_CONFIG: Record<SupportedAsset, AssetConfig> = {
  btc: {
    symbol: 'btc',
    endpoint: '/api/asset-price/btc',
    refreshMs: BTC_REFRESH ?? DEFAULT_REFRESH_MS,
  },
  eth: {
    symbol: 'eth',
    endpoint: '/api/asset-price/eth',
    refreshMs: ETH_REFRESH ?? DEFAULT_REFRESH_MS,
  },
};

export function useAssetPrice(symbol: SupportedAsset): PriceState {
  const config = ASSET_CONFIG[symbol];
  const [priceUsd, setPriceUsd] = useState<number | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<TickerStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);

  const performFetch = useCallback(async () => {
    if (inflightRef.current) {
      return inflightRef.current;
    }

    const request = (async () => {
      try {
        setStatus((prev) => (prev === 'error' ? 'loading' : prev));
        const response = await fetch(config.endpoint, {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json()) as { priceUsd: number; fetchedAt: string };
        setPriceUsd(payload.priceUsd);
        setFetchedAt(payload.fetchedAt);
        setStatus('idle');
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        setStatus('error');
      } finally {
        inflightRef.current = null;
      }
    })();

    inflightRef.current = request;
    return request;
  }, [config.endpoint]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!cancelled) {
        await performFetch();
      }
    })();

    const id = setInterval(() => {
      if (cancelled) return;
      void performFetch();
    }, config.refreshMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [config.refreshMs, performFetch]);

  return useMemo(
    () => ({
      priceUsd,
      fetchedAt,
      status,
      error,
      refresh: performFetch,
    }),
    [priceUsd, fetchedAt, status, error, performFetch],
  );
}
