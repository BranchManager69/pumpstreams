#!/usr/bin/env node
import '../lib/env.js';
import { parseArgs } from 'util';
import { getCurrentlyLive } from '../lib/livestream-api.js';
import { persistLiveRoster, persistPlatformMinuteMetrics, isS3Configured, uploadObjectToS3 } from '../lib/supabase-storage.js';
import { buildJsonFileName, resolveOutputTarget, writeJsonFile } from '../lib/io-utils.js';
import { optionalEnv } from '../lib/env.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { values } = parseArgs({
  options: {
    interval: { type: 'string' },
    limit: { type: 'string' },
    iterations: { type: 'string' },
    output: { type: 'string' },
    once: { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

const intervalMs = Number(values.interval ?? optionalEnv('LIVE_POLLER_INTERVAL_MS', '30000'));
if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
  throw new Error(`Invalid poller interval: ${intervalMs}`);
}

const pageSize = Number(values.limit ?? optionalEnv('LIVE_POLLER_LIMIT', '1000'));
if (!Number.isFinite(pageSize) || pageSize <= 0) {
  throw new Error(`Invalid poller limit: ${pageSize}`);
}

const iterations = values.once ? 1 : (values.iterations ? Number(values.iterations) : null);
if (iterations !== null && (!Number.isFinite(iterations) || iterations <= 0)) {
  throw new Error(`Invalid iterations value: ${values.iterations}`);
}

const outputPath = values.output ?? optionalEnv('LIVE_POLLER_OUTPUT');
let shouldStop = false;

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT. Exiting after current iteration...');
  shouldStop = true;
});

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistSnapshot(data, fetchedAt) {
  if (!data?.length) {
    console.log(`[${fetchedAt}] No live streams reported.`);
    return;
  }

  try {
    await persistLiveRoster(data, fetchedAt);
    console.log(`[${fetchedAt}] Persisted ${data.length} streams to Supabase.`);
    await persistPlatformMinuteMetrics({ fetchedAt, entries: data });
    // Write compact top-100 snapshot for the dashboard hot path
    try {
      const top = [...data]
        .sort((a, b) => (Number(b?.num_participants ?? 0) - Number(a?.num_participants ?? 0)))
        .slice(0, 100)
        .map((item) => ({
          mint: item.mint,
          name: item.name ?? null,
          symbol: item.symbol ?? null,
          num_participants: item.num_participants ?? item.numParticipants ?? null,
          market_cap: item.market_cap ?? null,
          usd_market_cap: item.usd_market_cap ?? null,
          thumbnail: item.thumbnail ?? item.image_uri ?? null,
        }));

      const topPayload = { fetchedAt, entries: top };
      const repoRoot = path.resolve(__dirname, '..');
      const localDir = path.join(repoRoot, 'artifacts', 'top');
      const localPath = path.join(localDir, 'latest.json');
      await fs.mkdir(localDir, { recursive: true });
      await fs.writeFile(localPath, JSON.stringify(topPayload));
      console.log(`[${fetchedAt}] Wrote top snapshot to ${localPath}`);

      if (isS3Configured()) {
        const key = 'dashboard/top/latest.json';
        await uploadObjectToS3({ key, body: JSON.stringify(topPayload), contentType: 'application/json', cacheControl: 'no-cache' });
        console.log(`[${fetchedAt}] Uploaded top snapshot to s3://${process.env.AWS_S3_BUCKET}/${key}`);
      }
    } catch (err) {
      console.error(`[${fetchedAt}] Failed to write/upload top snapshot:`, err?.message ?? err);
    }
  } catch (error) {
    console.error(`[${fetchedAt}] Failed to persist roster:`, error.message);
  }

  if (!outputPath) return;

  try {
    const fileName = buildJsonFileName({
      prefix: 'live-roster',
      label: data[0]?.mint ?? 'batch',
      timestamp: fetchedAt,
    });
    const target = await resolveOutputTarget(outputPath, fileName);
    await writeJsonFile(target, { fetchedAt, pageSize, streams: data });
    console.log(`[${fetchedAt}] Snapshot written to ${target}`);
  } catch (error) {
    console.error(`[${fetchedAt}] Failed to write snapshot:`, error.message);
  }
}

async function fetchFullRoster(pageLimit) {
  const all = [];
  let offset = 0;

  while (true) {
    const batch = await getCurrentlyLive({ offset, limit: pageLimit, includeNsfw: true });
    const count = Array.isArray(batch) ? batch.length : 0;

    if (!count) {
      break;
    }

    all.push(...batch);
    if (count < pageLimit) {
      break;
    }

    offset += pageLimit;
  }

  return all;
}

async function main() {
  let iteration = 0;
  console.log(`Starting live poller (interval ${intervalMs}ms, pageSize ${pageSize})`);
  while (!shouldStop && (iterations === null || iteration < iterations)) {
    const startedAt = Date.now();
    const fetchedAt = new Date().toISOString();
    try {
      const data = await fetchFullRoster(pageSize);
      await persistSnapshot(data, fetchedAt);
    } catch (error) {
      console.error(`[${fetchedAt}] Poll failed:`, error.message);
    }

    iteration += 1;
    if (shouldStop || (iterations !== null && iteration >= iterations)) {
      break;
    }

    const elapsed = Date.now() - startedAt;
    const waitFor = Math.max(0, intervalMs - elapsed);
    if (waitFor > 0) {
      await sleep(waitFor);
    }
  }

  console.log('Live poller stopped.');
}

main().catch((error) => {
  console.error('Live poller failed:', error);
  process.exit(1);
});
