'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSolPrice } from './sol-price-context';
import { useAssetPrice } from './use-asset-price';

function formatUsd(price: number | null): string {
  if (price === null || Number.isNaN(price)) {
    return '—';
  }
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type TickerAsset = {
  key: 'sol' | 'btc' | 'eth';
  label: string;
  icon: string;
  priceUsd: number | null;
  status: 'idle' | 'loading' | 'error';
  error: string | null;
  refresh: () => Promise<void>;
  tooltipLabel: string;
  ariaLabel: string;
};

export function SiteHeader() {
  const sol = useSolPrice();
  const btc = useAssetPrice('btc');
  const eth = useAssetPrice('eth');

  const tickers: TickerAsset[] = [
    {
      key: 'sol',
      label: 'SOL',
      icon: '/icons/sol.svg',
      priceUsd: sol.priceUsd,
      status: sol.status,
      error: sol.error,
      refresh: sol.refresh,
      tooltipLabel: 'SOL price',
      ariaLabel: 'Refresh SOL price',
    },
    {
      key: 'btc',
      label: 'BTC',
      icon: '/icons/btc.webp',
      priceUsd: btc.priceUsd,
      status: btc.status,
      error: btc.error,
      refresh: btc.refresh,
      tooltipLabel: 'BTC price',
      ariaLabel: 'Refresh BTC price',
    },
    {
      key: 'eth',
      label: 'ETH',
      icon: '/icons/eth.svg',
      priceUsd: eth.priceUsd,
      status: eth.status,
      error: eth.error,
      refresh: eth.refresh,
      tooltipLabel: 'ETH price',
      ariaLabel: 'Refresh ETH price',
    },
  ];

  return (
    <header className="site-header">
      <Link href="/" className="site-header__brand" aria-label="Pumpstreams home">
        <span className="site-header__logo">Pumpstreams</span>
        <span className="site-header__tagline">Live attention tracker</span>
      </Link>
      <div className="site-header__tickers">
        {tickers.map((ticker) => {
          const displayPrice = formatUsd(ticker.priceUsd);
          const priceLabel = displayPrice === '—' ? '—' : `$${displayPrice}`;
          const isError = ticker.status === 'error';
          const tooltip = isError
            ? `${ticker.tooltipLabel} error: ${ticker.error ?? 'unknown error'}`
            : `Refresh ${ticker.tooltipLabel}`;

          return (
            <button
              key={ticker.key}
              type="button"
              className={`site-header__ticker${isError ? ' site-header__ticker--error' : ''}`}
              onClick={() => {
                void ticker.refresh();
              }}
              aria-label={ticker.ariaLabel}
              title={tooltip}
            >
              <span className="ticker-icon" aria-hidden="true">
                <Image src={ticker.icon} alt="" width={16} height={16} />
              </span>
              <span className="ticker-price">{priceLabel}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
