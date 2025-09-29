import { ListObjectsV2Command, GetObjectCommand, type ListObjectsV2CommandInput } from '@aws-sdk/client-s3';
import type { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import type { SdkStreamMixin } from '@aws-sdk/types';
import { Readable } from 'node:stream';
import { getS3Client } from './s3';

export type ViewerSnapshotPoint = {
  bucket: string;
  totalViewers: number;
  sampleCount: number;
};

type SnapshotEntry = {
  num_participants?: number;
  is_currently_live?: boolean;
};

type SnapshotPayload = {
  fetchedAt: string;
  entries: SnapshotEntry[];
};

type HourlyAccumulator = {
  sum: number;
  count: number;
};

const DEFAULT_PREFIX = 'snapshots/';

function requireSnapshotBucket(): string {
  const bucket = process.env.PLATFORM_SNAPSHOT_BUCKET;
  if (!bucket) {
    throw new Error('PLATFORM_SNAPSHOT_BUCKET is not configured');
  }
  return bucket;
}

function startOfUtcDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, increment: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + increment);
  return copy;
}

function sanitisePrefix(prefix?: string): string {
  if (!prefix) return DEFAULT_PREFIX;
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

function parseSnapshotTimestamp(key: string, prefix: string): Date | null {
  if (!key.startsWith(prefix) || !key.endsWith('.json')) {
    return null;
  }

  const basename = key.slice(prefix.length, -'.json'.length);
  // Expecting shape YYYY-MM-DDThh-mm-ss-SSSZ
  const datePart = basename.slice(0, 10);
  const timePart = basename.slice(11);
  if (!datePart || !timePart) return null;
  const components = timePart.split('-');
  if (components.length < 4) return null;
  const [hour, minute, second, milliWithZone] = components;
  const millis = milliWithZone.replace('Z', '');
  if (!hour || !minute || !second || !millis) return null;
  const iso = `${datePart}T${hour}:${minute}:${second}.${millis}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function bodyToString(body: GetObjectCommandOutput['Body']): Promise<string> {
  if (!body) return '';
  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString('utf-8');
  }

  if (typeof (body as SdkStreamMixin).transformToString === 'function') {
    return (body as SdkStreamMixin).transformToString();
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  if (typeof (body as Blob).arrayBuffer === 'function') {
    const buffer = Buffer.from(await (body as Blob).arrayBuffer());
    return buffer.toString('utf-8');
  }

  // Final fallback: treat as async iterable.
  const chunks: Buffer[] = [];
  for await (const chunk of (body as unknown as AsyncIterable<Uint8Array>)) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function readSnapshot(key: string, bucket: string): Promise<SnapshotPayload | null> {
  const client = getS3Client();
  const { Body } = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!Body) return null;

  const raw = await bodyToString(Body);
  if (!raw) return null;

  const parsed = JSON.parse(raw) as SnapshotPayload;
  return parsed;
}

function accumulateHourlyPoint(hourly: Map<string, HourlyAccumulator>, timestamp: Date, totalViewers: number) {
  if (!Number.isFinite(totalViewers)) return;
  const hour = new Date(timestamp);
  hour.setUTCMinutes(0, 0, 0);
  const key = hour.toISOString();
  const current = hourly.get(key) ?? { sum: 0, count: 0 };
  current.sum += totalViewers;
  current.count += 1;
  hourly.set(key, current);
}

function sumViewers(entries: SnapshotEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    if (!entry) continue;
    const { num_participants, is_currently_live } = entry;
    if (is_currently_live === false) continue;
    if (typeof num_participants === 'number') {
      total += num_participants;
    }
  }
  return total;
}

async function listDayKeys({
  bucket,
  prefix,
  day,
  start,
  end,
}: {
  bucket: string;
  prefix: string;
  day: Date;
  start: Date;
  end: Date;
}): Promise<string[]> {
  const client = getS3Client();
  const dayStamp = day.toISOString().slice(0, 10);
  const dayPrefix = `${prefix}${dayStamp}`;

  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const params: ListObjectsV2CommandInput = {
      Bucket: bucket,
      Prefix: dayPrefix,
      ContinuationToken: continuationToken,
    };
    const response = await client.send(new ListObjectsV2Command(params));
    const objects = response.Contents ?? [];

    for (const object of objects) {
      const key = object.Key;
      if (!key) continue;
      const timestamp = parseSnapshotTimestamp(key, prefix);
      if (!timestamp) continue;
      if (timestamp < start || timestamp >= end) continue;
      keys.push(key);
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

export async function loadHourlyViewerSnapshots({
  start,
  end,
  prefix,
}: {
  start: Date;
  end: Date;
  prefix?: string;
}): Promise<ViewerSnapshotPoint[]> {
  if (end <= start) {
    return [];
  }

  const bucket = requireSnapshotBucket();
  const resolvedPrefix = sanitisePrefix(prefix ?? process.env.PLATFORM_SNAPSHOT_PREFIX ?? DEFAULT_PREFIX);
  const hourly = new Map<string, HourlyAccumulator>();

  const firstDay = startOfUtcDay(start);
  const lastDay = startOfUtcDay(end);

  for (let current = new Date(firstDay); current <= lastDay; current = addDays(current, 1)) {
    const keys = await listDayKeys({ bucket, prefix: resolvedPrefix, day: current, start, end });
    for (const key of keys) {
      const snapshot = await readSnapshot(key, bucket);
      if (!snapshot) continue;
      const fetchedAt = new Date(snapshot.fetchedAt);
      if (Number.isNaN(fetchedAt.getTime())) continue;
      if (fetchedAt < start || fetchedAt >= end) continue;
      const totalViewers = sumViewers(snapshot.entries ?? []);
      accumulateHourlyPoint(hourly, fetchedAt, totalViewers);
    }
  }

  return Array.from(hourly.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, { sum, count }]) => ({ bucket, totalViewers: sum / count, sampleCount: count }));
}
