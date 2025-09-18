'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_REFRESH_MS = 60_000;
const MIN_REFRESH_MS = 15_000;

function resolveRefreshInterval(): number {
  const raw = process.env.NEXT_PUBLIC_SOL_PRICE_REFRESH_MS;
  if (!raw) return DEFAULT_REFRESH_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_REFRESH_MS;
  return Math.max(MIN_REFRESH_MS, parsed);
}

const REFRESH_INTERVAL_MS = resolveRefreshInterval();

export type SolPriceSnapshot = {
  priceUsd: number | null;
  fetchedAt: string | null;
};

export type SolPriceState = SolPriceSnapshot & {
  status: 'idle' | 'loading' | 'error';
  error: string | null;
  refresh: () => Promise<void>;
};

const SolPriceContext = createContext<SolPriceState | undefined>(undefined);

export type SolPriceProviderProps = {
  children: React.ReactNode;
  initialSnapshot?: SolPriceSnapshot | null;
};

export function SolPriceProvider({ children, initialSnapshot }: SolPriceProviderProps) {
  const [snapshot, setSnapshot] = useState<SolPriceSnapshot>(() => ({
    priceUsd: initialSnapshot?.priceUsd ?? null,
    fetchedAt: initialSnapshot?.fetchedAt ?? null,
  }));
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>(initialSnapshot?.priceUsd != null ? 'idle' : 'loading');
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);

  const performFetch = useCallback(async () => {
    if (inflightRef.current) {
      return inflightRef.current;
    }

    const request = (async () => {
      try {
        setStatus((prev) => (prev === 'error' ? 'loading' : prev));
        const response = await fetch('/api/sol-price', {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json()) as { priceUsd: number; fetchedAt: string };
        setSnapshot({ priceUsd: payload.priceUsd, fetchedAt: payload.fetchedAt });
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
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function ensureInitial() {
      if (snapshot.priceUsd == null) {
        await performFetch();
      }
    }

    ensureInitial();

    const id = setInterval(() => {
      if (cancelled) return;
      void performFetch();
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [performFetch, snapshot.priceUsd]);

  const value = useMemo<SolPriceState>(() => ({
    ...snapshot,
    status,
    error,
    refresh: performFetch,
  }), [snapshot, status, error, performFetch]);

  return <SolPriceContext.Provider value={value}>{children}</SolPriceContext.Provider>;
}

export function useSolPrice() {
  const context = useContext(SolPriceContext);
  if (!context) {
    throw new Error('useSolPrice must be used within a SolPriceProvider');
  }
  return context;
}
