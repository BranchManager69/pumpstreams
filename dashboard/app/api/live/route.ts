import { NextResponse } from 'next/server';
import { fetchTopStreams, getDashboardConfig } from '../../../lib/fetch-top-streams';
import type { DashboardPayload } from '../../../types/dashboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await fetchTopStreams();
    const config = getDashboardConfig();
    const payload: DashboardPayload & { config: ReturnType<typeof getDashboardConfig> } = {
      ...data,
      config,
    };
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
