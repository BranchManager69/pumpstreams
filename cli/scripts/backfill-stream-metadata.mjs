#!/usr/bin/env node
import '../../lib/env.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const PAGE_SIZE = Number(process.env.STREAM_METADATA_BACKFILL_BATCH ?? '100');
let offset = Number(process.env.STREAM_METADATA_BACKFILL_OFFSET ?? '0');
if (!Number.isFinite(offset) || offset < 0) {
  offset = 0;
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Date(numeric).toISOString() : null;
}

function buildRow(mintId, source = {}) {
  if (!mintId) return null;
  return {
    mint_id: mintId,
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
    ath_market_cap_timestamp: toIso(source.ath_market_cap_timestamp),
    total_supply: source.total_supply ?? null,
    is_currently_live: source.is_currently_live ?? source.isLive ?? null,
    nsfw: source.nsfw ?? null,
    hidden: source.hidden ?? null,
    downrank_score: source.downrank_score ?? null,
    livestream_downrank_score: source.livestream_downrank_score ?? null,
    last_reply: toIso(source.last_reply),
    last_trade_timestamp: toIso(source.last_trade_timestamp),
    livestream_ban_expiry: toIso(source.livestream_ban_expiry),
    king_of_the_hill_timestamp: toIso(source.king_of_the_hill_timestamp),
    created_timestamp: toIso(source.created_timestamp),
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

async function main() {
  while (true) {
    const { data, error } = await client
      .from('livestream_latest')
      .select('mint_id, livestream')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch livestream_latest: ${error.message}`);
    }

    if (!data || !data.length) {
      break;
    }

    const rows = data
      .map(({ mint_id, livestream }) => buildRow(mint_id, livestream ?? {}))
      .filter(Boolean);

    if (rows.length) {
      const { error: upsertError } = await client
        .from('stream_metadata')
        .upsert(rows, { onConflict: 'mint_id' });
      if (upsertError) {
        throw new Error(`Failed to upsert stream_metadata: ${upsertError.message}`);
      }
      console.log(`Processed ${offset + rows.length} rows (offset ${offset})...`);
    }

    if (data.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  console.log('Metadata backfill complete.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
