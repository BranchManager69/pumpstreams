#!/usr/bin/env node
import '../lib/env.js';
import { parseArgs } from 'util';
import { getCurrentlyLive } from '../lib/livestream-api.js';
import { persistLiveRoster } from '../lib/supabase-storage.js';
import { buildJsonFileName, resolveOutputTarget, writeJsonFile } from '../lib/io-utils.js';
import { optionalEnv } from '../lib/env.js';

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

const limit = Number(values.limit ?? optionalEnv('LIVE_POLLER_LIMIT', '500'));
if (!Number.isFinite(limit) || limit <= 0) {
  throw new Error(`Invalid poller limit: ${limit}`);
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
    await writeJsonFile(target, { fetchedAt, limit, streams: data });
    console.log(`[${fetchedAt}] Snapshot written to ${target}`);
  } catch (error) {
    console.error(`[${fetchedAt}] Failed to write snapshot:`, error.message);
  }
}

async function main() {
  let iteration = 0;
  console.log(`Starting live poller (interval ${intervalMs}ms, limit ${limit})`);
  while (!shouldStop && (iterations === null || iteration < iterations)) {
    const startedAt = Date.now();
    const fetchedAt = new Date().toISOString();
    try {
      const data = await getCurrentlyLive({ limit });
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
