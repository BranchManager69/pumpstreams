#!/usr/bin/env node
import '../lib/env.js';
import { parseArgs } from 'util';
import { hasSupabase, getSupabase } from '../lib/supabase-client.js';
import { lamportsFrom, formatSol } from '../lib/token-math.js';

const { values } = parseArgs({
  options: {
    json: { type: 'boolean', default: false },
    limit: { type: 'string', default: '10' },
    refresh: { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

if (!hasSupabase()) {
  console.error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = getSupabase();
const limit = Number(values.limit) || 10;

async function fetchCurrentLivestreams() {
  const sources = ['livestream_latest', 'token_latest_snapshot'];
  let lastError = null;

  for (const source of sources) {
    const { data, error } = await supabase
      .from(source)
      .select('*')
      .order('num_participants', { ascending: false })
      .limit(limit);

    if (error) {
      // 42P01 = relation does not exist; try the next candidate.
      if (error.code !== '42P01') {
        lastError = error;
      }
      continue;
    }

    if (data?.length) {
      return data;
    }
  }

  if (lastError) {
    throw new Error(`Failed to fetch livestream snapshots: ${lastError.message}`);
  }

  return [];
}

async function fetchTradeSummary() {
  const { data, error } = await supabase
    .from('token_trade_summary')
    .select('*')
    .order('trade_count', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to fetch trade summary: ${error.message}`);
  return data ?? [];
}

async function fetchHourlyTrends() {
  const { data, error } = await supabase
    .from('token_hourly_trend')
    .select('*')
    .order('bucket', { ascending: false })
    .limit(limit * 4);
  if (error) throw new Error(`Failed to fetch hourly trends: ${error.message}`);
  return data ?? [];
}

function toSol(value) {
  if (value === null || value === undefined) return '0';
  return formatSol(lamportsFrom(String(value)), { decimals: 3 });
}

function buildReport({ livestreams, tradeSummary, hourlyTrend }) {
  const topLive = livestreams.map((row) => ({
    mintId: row.mint_id,
    name: row.livestream?.name || row.mint_id,
    symbol: row.livestream?.symbol || '—',
    participants: row.num_participants ?? 0,
    marketCapSol: row.market_cap,
    usdMarketCap: row.usd_market_cap,
    fetchedAt: row.fetched_at,
    thumbnail: row.thumbnail,
  }));

  const topVolume = tradeSummary.map((row) => ({
    mintId: row.mint_id,
    tradeCount: row.trade_count,
    buyCount: row.buy_count,
    sellCount: row.sell_count,
    buyVolumeSol: toSol(row.buy_volume_lamports ?? 0),
    sellVolumeSol: toSol(row.sell_volume_lamports ?? 0),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  }));

  const biasByMint = new Map();
  hourlyTrend.forEach((row) => {
    const current = biasByMint.get(row.mint_id) ?? { samples: [], latest: null };
    current.samples.push(row);
    if (!current.latest || row.bucket > current.latest.bucket) {
      current.latest = row;
    }
    biasByMint.set(row.mint_id, current);
  });

  const trending = Array.from(biasByMint.entries())
    .map(([mintId, { latest }]) => ({
      mintId,
      bucket: latest?.bucket,
      tradeCount: latest?.trade_count ?? 0,
      buyBias: latest?.volume_bias ?? 0,
      buyVolumeSol: toSol(latest?.buy_volume_lamports ?? 0),
      sellVolumeSol: toSol(latest?.sell_volume_lamports ?? 0),
    }))
    .sort((a, b) => Math.abs(b.buyBias ?? 0) - Math.abs(a.buyBias ?? 0))
    .slice(0, Math.min(limit, 15));

  return { topLive, topVolume, trending };
}

async function main() {
  if (values.refresh) {
    await supabase.rpc('rebuild_hourly_metrics')
      .then(({ error }) => {
        if (error) {
          throw new Error(`Failed to rebuild hourly metrics: ${error.message}`);
        }
      });
  }

  const [livestreams, tradeSummary, hourlyTrend] = await Promise.all([
    fetchCurrentLivestreams(),
    fetchTradeSummary(),
    fetchHourlyTrends(),
  ]);

  const report = buildReport({ livestreams, tradeSummary, hourlyTrend });

  if (values.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('📺  Top Live Streams (by participants)');
  if (!report.topLive.length) {
    console.log('  No livestream snapshots captured yet.');
  } else {
    report.topLive.forEach((live, idx) => {
      console.log(`  ${idx + 1}. ${live.name} (${live.symbol})`);
      console.log(`     Mint: ${live.mintId}`);
      console.log(`     Viewers: ${live.participants} | Market Cap: ${live.marketCapSol || 'n/a'} SOL (~${live.usdMarketCap || 'n/a'} USD)`);
      console.log(`     Snapshot: ${live.fetchedAt}`);
    });
  }

  console.log('\n💸  Top Tokens (by total trades)');
  if (!report.topVolume.length) {
    console.log('  No trades recorded yet.');
  } else {
    report.topVolume.forEach((token, idx) => {
      console.log(`  ${idx + 1}. ${token.mintId}`);
      console.log(`     Trades: ${token.tradeCount} (B:${token.buyCount} / S:${token.sellCount})`);
      console.log(`     Volume: buys ${token.buyVolumeSol} SOL | sells ${token.sellVolumeSol} SOL`);
      console.log(`     Window: ${token.firstSeenAt} → ${token.lastSeenAt}`);
    });
  }

  console.log('\n📈  Momentum Tokens (hourly volume bias)');
  if (!report.trending.length) {
    console.log('  No hourly metrics calculated yet.');
  } else {
    report.trending.forEach((item, idx) => {
      const bias = (item.buyBias * 100).toFixed(1);
      console.log(`  ${idx + 1}. ${item.mintId}`);
      console.log(`     Hour bucket: ${item.bucket}`);
      console.log(`     Trades: ${item.tradeCount} | Bias: ${bias}% | Buys: ${item.buyVolumeSol} SOL | Sells: ${item.sellVolumeSol} SOL`);
    });
  }
}

main().catch((error) => {
  console.error('Analysis failed:', error.message);
  process.exit(1);
});
