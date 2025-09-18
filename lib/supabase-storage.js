import { hasSupabase, getSupabase } from './supabase-client.js';
import { lamportsFrom, lamportsToNumber } from './token-math.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const SNAPSHOT_BATCH_SIZE = Number(process.env.SUPABASE_SNAPSHOT_BATCH_SIZE ?? '100');
const LATEST_BATCH_SIZE = Number(process.env.SUPABASE_LATEST_BATCH_SIZE ?? '100');
const METADATA_BATCH_SIZE = Number(process.env.SUPABASE_METADATA_BATCH_SIZE ?? '100');
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET;

let s3Client = null;
if (AWS_S3_BUCKET) {
  try {
    const region = process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const credentials = accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;
    s3Client = new S3Client({ region, credentials });
  } catch (error) {
    console.error('[s3] Failed to initialise S3 client:', error?.message ?? error);
    s3Client = null;
  }
}

function chunkArray(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function toISOString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(numeric).toISOString();
  }
  return null;
}

function buildMinimalLivestreamPayload(source = {}) {
  return {
    name: source.name ?? null,
    symbol: source.symbol ?? null,
    thumbnail: source.thumbnail ?? source.image_uri ?? null,
    creator_address: source.creatorAddress ?? source.creator ?? null,
  };
}

function buildLatestRow({
  mintId,
  fetchedAt,
  simplified,
  isLive = true,
  numParticipants = null,
  marketCap = null,
  usdMarketCap = null,
  thumbnail = null,
}) {
  return {
    mint_id: mintId,
    fetched_at: fetchedAt,
    is_live: isLive,
    num_participants: numParticipants,
    market_cap: marketCap,
    usd_market_cap: usdMarketCap,
    thumbnail,
    livestream: simplified,
    extra: null,
  };
}

const TRADE_FLUSH_INTERVAL_MS = Number(process.env.SUPABASE_TRADE_FLUSH_INTERVAL_MS || 1500);
const TRADE_BATCH_SIZE = Number(process.env.SUPABASE_TRADE_BATCH_SIZE || 200);

const tradeBuffer = [];
let flushTimer = null;
let isFlushing = false;

function ensureClient() {
  if (!hasSupabase()) {
    return null;
  }
  return getSupabase();
}

async function chunkedUpsert(client, table, rows, { chunkSize = METADATA_BATCH_SIZE, options = { onConflict: 'mint_id' }, logPrefix }) {
  if (!rows.length) return;
  for (const chunk of chunkArray(rows, chunkSize)) {
    const { error } = await client.from(table).upsert(chunk, options);
    if (error) {
      console.error(`[supabase] Failed to upsert ${logPrefix ?? table}:`, error.message);
      return;
    }
  }
}

async function chunkedInsert(client, table, rows, { chunkSize = SNAPSHOT_BATCH_SIZE, options = {}, logPrefix, ignoreConflict = false }) {
  if (!rows.length) return;
  for (const chunk of chunkArray(rows, chunkSize)) {
    const { error } = await client.from(table).insert(chunk, options);
    if (error) {
      if (ignoreConflict && error.code === '23505') {
        continue;
      }
      console.error(`[supabase] Failed to insert ${logPrefix ?? table}:`, error.message);
      return;
    }
  }
}

async function upsertTokenRows(client, rows) {
  await chunkedUpsert(client, 'tokens', rows, { chunkSize: METADATA_BATCH_SIZE, logPrefix: 'tokens', options: { onConflict: 'mint_id' } });
}

function buildMetadataRow(source = {}) {
  const mint = source.mint ?? source.mint_id ?? null;
  if (!mint) return null;
  return {
    mint_id: mint,
    name: source.name ?? null,
    symbol: source.symbol ?? null,
    description: source.description ?? null,
    website: source.website ?? null,
    twitter: source.twitter ?? null,
    telegram: source.telegram ?? null,
    image_uri: source.image_uri ?? null,
    banner_uri: source.banner_uri ?? null,
    thumbnail: source.thumbnail ?? source.image_uri ?? null,
    creator_address: source.creatorAddress ?? source.creator ?? null,
    bonding_curve: source.bonding_curve ?? null,
    real_sol_reserves: source.real_sol_reserves ?? null,
    real_token_reserves: source.real_token_reserves ?? null,
    virtual_sol_reserves: source.virtual_sol_reserves ?? null,
    virtual_token_reserves: source.virtual_token_reserves ?? null,
    ath_market_cap: source.ath_market_cap ?? null,
    ath_market_cap_timestamp: toISOString(source.ath_market_cap_timestamp),
    total_supply: source.total_supply ?? null,
    is_currently_live: source.is_currently_live ?? source.is_live ?? null,
    nsfw: source.nsfw ?? null,
    hidden: source.hidden ?? null,
    downrank_score: source.downrank_score ?? null,
    livestream_downrank_score: source.livestream_downrank_score ?? null,
    last_reply: toISOString(source.last_reply),
    last_trade_timestamp: toISOString(source.last_trade_timestamp),
    livestream_ban_expiry: toISOString(source.livestream_ban_expiry),
    king_of_the_hill_timestamp: toISOString(source.king_of_the_hill_timestamp),
    created_timestamp: toISOString(source.created_timestamp),
    metadata_uri: source.metadata_uri ?? null,
    pump_swap_pool: source.pump_swap_pool ?? null,
    raydium_pool: source.raydium_pool ?? null,
    market_id: source.market_id ?? null,
    program: source.program ?? null,
    platform: source.platform ?? null,
    hide_banner: source.hide_banner ?? null,
    complete: source.complete ?? null,
    inverted: source.inverted ?? null,
    updated_at: new Date().toISOString(),
  };
}

function scheduleFlush() {
  if (flushTimer) return;
  const timer = setTimeout(flushTrades, TRADE_FLUSH_INTERVAL_MS);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  flushTimer = timer;
}

async function flushTrades() {
  flushTimer = null;
  if (isFlushing) return;
  if (!tradeBuffer.length) return;

  const client = ensureClient();
  if (!client) {
    tradeBuffer.length = 0;
    return;
  }

  isFlushing = true;
  try {
    while (tradeBuffer.length) {
      const batch = tradeBuffer.splice(0, TRADE_BATCH_SIZE);

      const tokenRows = [];
      const seenMints = new Set();
      for (const row of batch) {
        if (!row?.mint_id) continue;
        if (seenMints.has(row.mint_id)) continue;
        seenMints.add(row.mint_id);
        tokenRows.push({
          mint_id: row.mint_id,
          symbol: row.symbol ?? row.raw?.symbol ?? null,
          name: row.name ?? row.raw?.name ?? null,
          creator_address: row.raw?.creator ?? row.raw?.creatorAddress ?? null,
        });
      }

      if (tokenRows.length) {
        const { error: tokenError } = await client.from('tokens').upsert(tokenRows, { onConflict: 'mint_id' });
        if (tokenError) {
          console.error('[supabase] Failed to upsert tokens for trade batch:', tokenError.message);
        }
      }

      const { error } = await client.from('trade_events').insert(batch);
      if (error) {
        console.error('[supabase] Failed to insert trade batch:', error.message);
        tradeBuffer.unshift(...batch);
        break;
      }

      const metricRows = batch.map((row) => ({
        mint_id: row.mint_id,
        observed_at: row.observed_at,
        is_buy: row.is_buy,
        lamports: row.lamports,
      }));

      const { error: metricError } = await client.rpc('record_trade_metric_bulk', { rows: metricRows });
      if (metricError) {
        console.error('[supabase] Failed to update hourly metrics:', metricError.message);
      }
    }
  } finally {
    isFlushing = false;
    if (tradeBuffer.length) {
      scheduleFlush();
    }
  }
}

export async function persistLivestreamSnapshot(payload) {
  const client = ensureClient();
  if (!client) return null;

  const { snapshot, mintId, fetchedAt } = payload;
  if (!snapshot || !mintId) return null;
  const source = snapshot.livestream ?? snapshot;
  const metadataRow = buildMetadataRow({ ...source, mint: mintId });
  const tokenRow = {
    mint_id: mintId,
    symbol: source?.symbol ?? snapshot?.token?.symbol ?? null,
    name: source?.name ?? snapshot?.token?.name ?? null,
    creator_address: source?.creatorAddress ?? source?.creator ?? null,
    is_approved_creator: snapshot?.isApprovedCreator ?? null,
  };

  if (tokenRow.mint_id) {
    await chunkedUpsert(client, 'tokens', [tokenRow], { chunkSize: 1, logPrefix: 'tokens', options: { onConflict: 'mint_id' } });
  }

  if (metadataRow) {
    await chunkedUpsert(client, 'stream_metadata', [metadataRow], { chunkSize: 1, logPrefix: 'stream_metadata', options: { onConflict: 'mint_id' } });
  }

  const minimal = buildMinimalLivestreamPayload(source);
  const snapshotRow = {
    mint_id: mintId,
    fetched_at: fetchedAt,
    is_live: source?.isLive ?? source?.is_currently_live ?? null,
    num_participants: source?.numParticipants ?? source?.num_participants ?? null,
    max_participants: source?.maxParticipants ?? null,
    market_cap: snapshot?.market_cap ?? snapshot?.stats?.market_cap ?? null,
    usd_market_cap: snapshot?.usd_market_cap ?? snapshot?.stats?.usd_market_cap ?? null,
    mode: source?.mode ?? null,
    thumbnail: minimal.thumbnail ?? null,
    livestream: minimal,
    extra: null,
  };

  const { error: snapshotError } = await client
    .from('livestream_snapshots')
    .upsert(snapshotRow, { onConflict: 'mint_id,fetched_at' });
  if (snapshotError) {
    console.error('[supabase] Failed to upsert livestream snapshot', snapshotError.message);
  }

  const latestRow = buildLatestRow({
    mintId,
    fetchedAt,
    simplified: minimal,
    isLive: snapshotRow.is_live,
    numParticipants: snapshotRow.num_participants,
    marketCap: snapshotRow.market_cap,
    usdMarketCap: snapshotRow.usd_market_cap,
    thumbnail: snapshotRow.thumbnail,
  });

  const { error: latestError } = await client
    .from('livestream_latest')
    .upsert(latestRow, { onConflict: 'mint_id' });
  if (latestError) {
    console.error('[supabase] Failed to upsert livestream latest snapshot', latestError.message);
  }
}

export async function persistLiveRoster(entries = [], fetchedAt = new Date().toISOString()) {
  const client = ensureClient();
  if (!client || !entries.length) return;
  const tokenRows = entries.map((item) => ({
    mint_id: item.mint,
    symbol: item.symbol ?? null,
    name: item.name ?? null,
    creator_address: item.creatorAddress ?? item.creator ?? null,
  }));

  const metadataRows = entries
    .map((item) => buildMetadataRow(item))
    .filter(Boolean);

  const snapshotRows = entries.map((item) => {
    const minimal = buildMinimalLivestreamPayload(item);
    return {
      mint_id: item.mint,
      fetched_at: fetchedAt,
      is_live: true,
      num_participants: item.num_participants ?? item.numParticipants ?? null,
      market_cap: item.market_cap ?? null,
      usd_market_cap: item.usd_market_cap ?? null,
      mode: item.mode ?? null,
      thumbnail: minimal.thumbnail ?? null,
      livestream: minimal,
      extra: null,
    };
  });

  const latestRows = entries.map((item) => {
    const minimal = buildMinimalLivestreamPayload(item);
    return buildLatestRow({
      mintId: item.mint,
      fetchedAt,
      simplified: minimal,
      isLive: true,
      numParticipants: item.num_participants ?? item.numParticipants ?? null,
      marketCap: item.market_cap ?? null,
      usdMarketCap: item.usd_market_cap ?? null,
      thumbnail: minimal.thumbnail ?? null,
    });
  });

  await upsertTokenRows(client, tokenRows);
  await chunkedUpsert(client, 'stream_metadata', metadataRows, { chunkSize: METADATA_BATCH_SIZE, logPrefix: 'stream_metadata', options: { onConflict: 'mint_id' } });
  await chunkedInsert(client, 'livestream_snapshots', snapshotRows, {
    chunkSize: SNAPSHOT_BATCH_SIZE,
    logPrefix: 'livestream_snapshots',
    ignoreConflict: true,
  });
  await chunkedUpsert(client, 'livestream_latest', latestRows, { chunkSize: LATEST_BATCH_SIZE, logPrefix: 'livestream_latest', options: { onConflict: 'mint_id' } });

  if (s3Client && AWS_S3_BUCKET) {
    try {
      const key = `snapshots/${fetchedAt.replace(/[:.]/g, '-')}.json`;
      const body = JSON.stringify({ fetchedAt, entries });
      await s3Client.send(new PutObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: 'application/json',
      }));
    } catch (error) {
      console.error('[s3] Failed to archive snapshot batch:', error?.message ?? error);
    }
  }
}

export async function persistLivestreamRegions({ mintId, fetchedAt, regions = [] }) {
  const client = ensureClient();
  if (!client || !regions.length) return;

  const rows = regions.map((region) => ({
    mint_id: mintId,
    fetched_at: fetchedAt,
    region: region.region || region.name,
    region_url: region.url,
    distance: region.distance,
    payload: region,
  }));

  const { error } = await client.from('livestream_regions').insert(rows);
  if (error) {
    console.error('[supabase] Failed to insert livestream regions', error.message);
  }
}

export async function persistLivestreamSession(summary) {
  const client = ensureClient();
  if (!client) return;

  const row = {
    mint_id: summary.mintId,
    observed_at: summary.requestedAt,
    duration_ms: summary.sessionDurationMs ?? null,
    participant_count: summary.participants ? Object.keys(summary.participants).length : null,
    track_count: Array.isArray(summary.tracks) ? summary.tracks.length : null,
    region_url: summary.livekit?.regionUrl ?? null,
    summary,
  };

  const { error } = await client.from('livestream_sessions').insert(row);
  if (error) {
    console.error('[supabase] Failed to insert livestream session', error.message);
  }
}

export function persistTradeEvent(trade) {
  const client = ensureClient();
  if (!client) return;

  try {
    const lamports = lamportsFrom(trade.sol_amount);
    const sol = lamportsToNumber(lamports);
    const observedAt = new Date().toISOString();

    tradeBuffer.push({
      mint_id: trade.mint,
      signature: trade.signature ?? null,
      slot: trade.slot ?? null,
      tx_index: trade.tx_index ?? null,
      is_buy: Boolean(trade.is_buy),
      lamports: lamports.toString(),
      sol,
      token_amount: Number(trade.token_amount ?? 0) || null,
      token_amount_raw: trade.token_amount ?? null,
      user_address: trade.user ?? null,
      name: trade.name ?? null,
      symbol: trade.symbol ?? null,
      raw: trade,
      observed_at: observedAt,
    });

    scheduleFlush();
  } catch (error) {
    console.error('[supabase] Failed to buffer trade', error.message);
  }
}

export async function flushSupabaseQueues() {
  await flushTrades();
}
