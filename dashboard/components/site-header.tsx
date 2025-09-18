'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import { useSolPrice } from './sol-price-context';

function formatUsd(price: number | null): string {
  if (price === null || Number.isNaN(price)) {
    return '—';
  }
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SiteHeader() {
  const { priceUsd, status, error, refresh } = useSolPrice();

  const displayPrice = useMemo(() => formatUsd(priceUsd), [priceUsd]);
  const priceLabel = displayPrice === '—' ? '—' : `$${displayPrice}`;
  const isError = status === 'error';
  const tooltip = isError ? `SOL price error: ${error ?? 'unknown error'}` : 'Refresh SOL price';

  return (
    <header className="site-header">
      <Link href="/" className="site-header__brand" aria-label="Pumpstreams home">
        <span className="site-header__logo">Pumpstreams</span>
        <span className="site-header__tagline">Live attention tracker</span>
      </Link>
      <button
        type="button"
        className={`site-header__ticker${isError ? ' site-header__ticker--error' : ''}`}
        onClick={() => {
          void refresh();
        }}
        aria-label="Refresh SOL price"
        title={tooltip}
      >
        <span className="ticker-icon" aria-hidden="true">
          <Image src="/icons/sol.svg" alt="" width={16} height={16} />
        </span>
        <span className="ticker-price">{priceLabel}</span>
      </button>
    </header>
  );
}
