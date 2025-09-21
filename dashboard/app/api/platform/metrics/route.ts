import { NextResponse } from 'next/server';
import { getServiceClient } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const windowMinutes = Math.max(1, Number(searchParams.get('windowMinutes') ?? '1440'));
    const sinceIso = new Date(Date.now() - windowMinutes * 60_000).toISOString();

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('platform_metrics_minute')
      .select('bucket, live_streams, total_viewers, total_market_cap')
      .gte('bucket', sinceIso)
      .order('bucket', { ascending: true });

    if (error) {
      if (error.message.includes('Could not find the table')) {
        return NextResponse.json({
          windowMinutes,
          samples: [],
        });
      }
      throw error;
    }

    return NextResponse.json({
      windowMinutes,
      samples: data ?? [],
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[api/platform/metrics] failed', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

