import { hasSupabase, getSupabase } from './supabase-client.js';
import { lamportsFrom, lamportsToNumber } from './token-math.js';

function buildLatestRow({
  mintId,
  fetchedAt,
  livestream,
  isLive = true,
  numParticipants = null,
  marketCap = null,
  usdMarketCap = null,
  thumbnail = null,
  extra = null,
}) {
  return {
    mint_id: mintId,
    fetched_at: fetchedAt,
    is_live: isLive,
    num_participants: numParticipants,
    market_cap: marketCap,
    usd_market_cap: usdMarketCap,
    thumbnail,
    livestream,
    extra,
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
  const { livestream } = snapshot;

  const tokenRow = {
    mint_id: mintId,
    symbol: livestream?.symbol || snapshot?.token?.symbol || null,
    name: livestream?.name || snapshot?.token?.name || null,
    creator_address: livestream?.creatorAddress || null,
    is_approved_creator: snapshot?.isApprovedCreator ?? null,
  };

  const { error: tokenError } = await client.from('tokens').upsert(tokenRow, { onConflict: 'mint_id' });
  if (tokenError) {
    console.error('[supabase] Failed to upsert token', tokenError.message);
  }

  const snapshotRow = {
    mint_id: mintId,
    fetched_at: fetchedAt,
    is_live: livestream?.isLive ?? null,
    num_participants: livestream?.numParticipants ?? livestream?.num_participants ?? null,
    max_participants: livestream?.maxParticipants ?? null,
    market_cap: snapshot?.market_cap ?? snapshot?.stats?.market_cap ?? null,
    usd_market_cap: snapshot?.usd_market_cap ?? snapshot?.stats?.usd_market_cap ?? null,
    mode: livestream?.mode ?? null,
    thumbnail: livestream?.thumbnail ?? null,
    livestream: snapshot?.livestream ?? snapshot,
    extra: snapshot?.extra ?? null,
  };

  const { error: snapshotError } = await client.from('livestream_snapshots').upsert(snapshotRow, { onConflict: 'mint_id,fetched_at' });
  if (snapshotError) {
    console.error('[supabase] Failed to upsert livestream snapshot', snapshotError.message);
  }

  const latestRow = buildLatestRow({
    mintId,
    fetchedAt,
    livestream: snapshot?.livestream ?? snapshot,
    isLive: snapshotRow.is_live,
    numParticipants: snapshotRow.num_participants,
    marketCap: snapshotRow.market_cap,
    usdMarketCap: snapshotRow.usd_market_cap,
    thumbnail: snapshotRow.thumbnail,
    extra: snapshot?.extra ?? null,
  });

  const { error: latestError } = await client.from('livestream_latest').upsert(latestRow, { onConflict: 'mint_id' });
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
    creator_address: item.creatorAddress ?? null,
  }));

  const snapshotRows = entries.map((item) => ({
    mint_id: item.mint,
    fetched_at: fetchedAt,
    is_live: true,
    num_participants: item.num_participants ?? item.numParticipants ?? null,
    market_cap: item.market_cap ?? null,
    usd_market_cap: item.usd_market_cap ?? null,
    mode: item.mode ?? null,
    thumbnail: item.thumbnail ?? null,
    livestream: item,
    extra: null,
  }));

  const { error: tokenError } = await client.from('tokens').upsert(tokenRows, { onConflict: 'mint_id' });
  if (tokenError) {
    console.error('[supabase] Failed to upsert live roster tokens', tokenError.message);
  }

  const { error: rosterError } = await client.from('livestream_snapshots').insert(snapshotRows, { upsert: false });
  if (rosterError && rosterError.code !== '23505') {
    console.error('[supabase] Failed to insert live roster snapshots', rosterError.message);
  }

  const latestRows = entries.map((item) => buildLatestRow({
    mintId: item.mint,
    fetchedAt,
    livestream: item,
    isLive: true,
    numParticipants: item.num_participants ?? item.numParticipants ?? null,
    marketCap: item.market_cap ?? null,
    usdMarketCap: item.usd_market_cap ?? null,
    thumbnail: item.thumbnail ?? null,
  }));

  const { error: latestError } = await client.from('livestream_latest').upsert(latestRows, { onConflict: 'mint_id' });
  if (latestError) {
    console.error('[supabase] Failed to upsert live roster latest snapshots', latestError.message);
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
