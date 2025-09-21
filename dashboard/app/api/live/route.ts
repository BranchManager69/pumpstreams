import { NextResponse } from 'next/server';
import { fetchTopStreams, getDashboardConfig, __cacheStore } from '../../../lib/fetch-top-streams';
import type { DashboardPayload } from '../../../types/dashboard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort') ?? undefined;
    const data = await fetchTopStreams(sort ?? undefined);
    const config = getDashboardConfig();
    const payload: DashboardPayload & { config: ReturnType<typeof getDashboardConfig> } = {
      ...data,
      config,
    };
    __cacheStore(payload);
    return NextResponse.json(payload, {
      headers: {
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[api/live] failed', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
