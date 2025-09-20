import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getTokenDetail } from '../../../lib/get-token-detail';
import { getSolPriceUSD } from '../../../lib/sol-price';
import { TokenDetailView } from '../../../components/token-detail-view';
import { SolPriceProvider } from '../../../components/sol-price-context';

type PageProps = {
  params: { mint: string };
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const mintId = params.mint;
  const detail = await getTokenDetail(mintId);
  if (!detail) {
    return { title: 'Stream not found · Pumpstreams' };
  }
  const name = detail.token?.name ?? detail.token?.symbol ?? mintId.slice(0, 6);
  return {
    title: `${name} · Pumpstreams`,
    description: `Livestream metrics and captured clips for ${name}.`,
  };
}

async function loadSolPrice(): Promise<number | null> {
  try {
    const price = await getSolPriceUSD({ cacheMs: 60_000 });
    return Number.isFinite(price) ? price! : null;
  } catch {
    return null;
  }
}

export default async function TokenDetailPage({ params }: PageProps) {
  const mintId = params.mint;
  const [detail, solPrice] = await Promise.all([getTokenDetail(mintId), loadSolPrice()]);

  if (!detail) {
    notFound();
  }

  return (
    <SolPriceProvider initialSnapshot={{ priceUsd: solPrice, fetchedAt: new Date().toISOString() }}>
      <Suspense fallback={<div className="token-loading">Loading token…</div>}>
        <TokenDetailView detail={detail} solUsdPrice={solPrice} />
      </Suspense>
    </SolPriceProvider>
  );
}
