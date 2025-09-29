import { NextResponse } from 'next/server';
import { getServiceClient } from '../../../../lib/supabase';
import { loadHourlyViewerSnapshots } from '../../../../lib/platformSnapshots';

type Sample = {
  bucket: string;
  total_viewers: number | null;
};

type TrendPoint = {
  bucket: string;
  totalViewers: number;
};

type AggregatePoint = {
  timestamp: string;
  totalViewers: number;
};

type DailyAverage = {
  date: string;
  avgViewers: number;
  change?: number;
  changePct?: number;
};

type HourlyAverage = {
  hour: string;
  avgViewers: number;
};

type TrendSummary = {
  windowMinutes: number;
  totalSamples: number;
  start: string | null;
  end: string | null;
  averages: {
    overall: number | null;
    daily: DailyAverage[];
    hourly: HourlyAverage[];
  };
  extrema: {
    min: AggregatePoint | null;
    max: AggregatePoint | null;
  };
};

export const dynamic = 'force-dynamic';

function normaliseSamples(samples: Sample[]): TrendPoint[] {
  return samples
    .filter((sample) => typeof sample.total_viewers === 'number')
    .map((sample) => ({
      bucket: new Date(sample.bucket).toISOString(),
      totalViewers: sample.total_viewers as number,
    }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function buildDailyAverages(points: TrendPoint[]): DailyAverage[] {
  const dailyTotals = new Map<string, { sum: number; count: number }>();

  for (const point of points) {
    const dayKey = point.bucket.slice(0, 10);
    const current = dailyTotals.get(dayKey) ?? { sum: 0, count: 0 };
    current.sum += point.totalViewers;
    current.count += 1;
    dailyTotals.set(dayKey, current);
  }

  const sortedDays = Array.from(dailyTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  let previousAvg: number | undefined;

  return sortedDays.map(([date, { sum, count }]) => {
    const avg = sum / count;
    const delta = previousAvg === undefined ? undefined : avg - previousAvg;
    const deltaPct = previousAvg ? (delta! / previousAvg) * 100 : undefined;
    previousAvg = avg;

    return {
      date,
      avgViewers: avg,
      ...(delta === undefined ? {} : { change: delta, changePct: deltaPct }),
    };
  });
}

function buildHourlyAverages(points: TrendPoint[], limit = 48): HourlyAverage[] {
  const hourlyTotals = new Map<string, { sum: number; count: number }>();

  for (const point of points) {
    const hour = new Date(point.bucket);
    hour.setMinutes(0, 0, 0);
    const hourKey = hour.toISOString();
    const current = hourlyTotals.get(hourKey) ?? { sum: 0, count: 0 };
    current.sum += point.totalViewers;
    current.count += 1;
    hourlyTotals.set(hourKey, current);
  }

  const allHours = Array.from(hourlyTotals.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, { sum, count }]) => ({ hour, avgViewers: sum / count }));

  return allHours.slice(-limit);
}

function buildExtrema(points: TrendPoint[]): TrendSummary['extrema'] {
  if (points.length === 0) {
    return { min: null, max: null };
  }

  let minPoint = points[0];
  let maxPoint = points[0];

  for (const point of points) {
    if (point.totalViewers < minPoint.totalViewers) {
      minPoint = point;
    }
    if (point.totalViewers > maxPoint.totalViewers) {
      maxPoint = point;
    }
  }

  return {
    min: { timestamp: minPoint.bucket, totalViewers: minPoint.totalViewers },
    max: { timestamp: maxPoint.bucket, totalViewers: maxPoint.totalViewers },
  };
}

function computeSummary(points: TrendPoint[], windowMinutes: number): TrendSummary {
  const totalSamples = points.length;

  if (totalSamples === 0) {
    return {
      windowMinutes,
      totalSamples,
      start: null,
      end: null,
      averages: {
        overall: null,
        daily: [],
        hourly: [],
      },
      extrema: {
        min: null,
        max: null,
      },
    };
  }

  const sumViewers = points.reduce((sum, point) => sum + point.totalViewers, 0);
  const daily = buildDailyAverages(points);
  const hourly = buildHourlyAverages(points);
  const { min, max } = buildExtrema(points);

  return {
    windowMinutes,
    totalSamples,
    start: points[0].bucket,
    end: points[points.length - 1].bucket,
    averages: {
      overall: sumViewers / totalSamples,
      daily,
      hourly,
    },
    extrema: { min, max },
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const windowMinutes = Math.max(1, Number(searchParams.get('windowMinutes') ?? '1440'));
    const sinceIso = new Date(Date.now() - windowMinutes * 60_000).toISOString();

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('platform_metrics_minute')
      .select('bucket, total_viewers')
      .gte('bucket', sinceIso)
      .order('bucket', { ascending: true });

    if (error) {
      if (error.message.includes('Could not find the table')) {
        return NextResponse.json(computeSummary([], windowMinutes));
      }
      throw error;
    }

    const now = new Date();
    const targetStart = new Date(now.getTime() - windowMinutes * 60_000);
    const supabasePoints = normaliseSamples(data ?? []);
    const supabaseStart = supabasePoints[0] ? new Date(supabasePoints[0].bucket) : null;

    let mergedPoints = supabasePoints;

    const needsHistorical = !supabaseStart || targetStart < supabaseStart;

    if (needsHistorical) {
      const historicalStart = targetStart;
      const historicalEnd = supabaseStart ?? now;

      if (historicalEnd > historicalStart) {
        try {
          const historicalSnapshots = await loadHourlyViewerSnapshots({ start: historicalStart, end: historicalEnd });
          const historicalPoints = historicalSnapshots.map((point) => ({
            bucket: point.bucket,
            totalViewers: point.totalViewers,
          }));
          mergedPoints = [...historicalPoints, ...supabasePoints].sort((a, b) => a.bucket.localeCompare(b.bucket));
        } catch (historicalError) {
          console.error('[api/platform/viewer-trend] historical snapshot fetch failed', historicalError);
        }
      }
    }

    const summary = computeSummary(mergedPoints, windowMinutes);

    return NextResponse.json(summary, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[api/platform/viewer-trend] failed', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
