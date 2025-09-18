#!/usr/bin/env node
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[cleanup] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const retentionHours = Number(process.env.SNAPSHOT_RETENTION_HOURS ?? '48');
if (!Number.isFinite(retentionHours) || retentionHours <= 0) {
  console.error(`[cleanup] Invalid SNAPSHOT_RETENTION_HOURS: ${process.env.SNAPSHOT_RETENTION_HOURS}`);
  process.exit(1);
}

const batchSize = Number(process.env.SNAPSHOT_CLEANUP_BATCH ?? '5000');
if (!Number.isInteger(batchSize) || batchSize <= 0) {
  console.error(`[cleanup] Invalid SNAPSHOT_CLEANUP_BATCH: ${process.env.SNAPSHOT_CLEANUP_BATCH}`);
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const maxIterations = Number(process.env.SNAPSHOT_CLEANUP_MAX_ITER ?? '200');

const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { fetch: (...args) => fetch(...args) },
});

const cutoffIso = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString();
console.log(`[cleanup] Removing snapshots older than ${retentionHours}h (cutoff ${cutoffIso})`);

async function prune() {
  const start = performance.now();
  let totalRemoved = 0;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const { data: rows, error: selectError } = await client
      .from('livestream_snapshots')
      .select('id')
      .lt('fetched_at', cutoffIso)
      .order('fetched_at', { ascending: true })
      .limit(batchSize);

    if (selectError) {
      console.error('[cleanup] select failed:', selectError.message);
      break;
    }

    if (!rows?.length) {
      console.log(`[cleanup] No rows older than cutoff after ${iteration - 1} iterations.`);
      break;
    }

    if (dryRun) {
      totalRemoved += rows.length;
      console.log(`[cleanup] (dry-run) would delete ${rows.length} rows (total ${totalRemoved}).`);
      continue;
    }

    const ids = rows.map((row) => row.id);
    const { error: deleteError } = await client
      .from('livestream_snapshots')
      .delete()
      .in('id', ids);

    if (deleteError) {
      console.error('[cleanup] delete failed:', deleteError.message);
      break;
    }

    totalRemoved += ids.length;
    console.log(`[cleanup] Deleted ${ids.length} rows (total ${totalRemoved}).`);

    if (rows.length < batchSize) {
      console.log('[cleanup] Final batch smaller than limit; exiting loop.');
      break;
    }
  }

  const duration = ((performance.now() - start) / 1000).toFixed(1);
  console.log(`[cleanup] Finished in ${duration}s. Total processed: ${totalRemoved}.`);
}

prune().catch((error) => {
  console.error('[cleanup] unexpected error:', error);
  process.exit(1);
});
