#!/usr/bin/env node
import './lib/env.js';
import { parseArgs } from 'util';
import { getCurrentlyLive, getLivestreamSnapshot, getJoinToken, decodeJwt, getLivekitRegions } from './lib/livestream-api.js';
import { buildJsonFileName, resolveOutputTarget, toJson, writeJsonFile } from './lib/io-utils.js';
import { persistLivestreamSnapshot, persistLivestreamRegions, persistLiveRoster } from './lib/supabase-storage.js';

const commands = ['list', 'info', 'join', 'regions', 'help'];

const { positionals, values } = parseArgs({
  options: {
    limit: { type: 'string', default: '12' },
    json: { type: 'boolean', default: false },
    mint: { type: 'string' },
    clips: { type: 'boolean', default: false },
    includeToken: { type: 'boolean', default: false },
    output: { type: 'string' },
  },
  allowPositionals: true,
});

const command = positionals[0] || 'list';
const outputPath = values.output;

if (!commands.includes(command)) {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

function printHelp() {
  console.log(`Pump.fun Livestream CLI

Usage: node livestream-cli.mjs <command> [options]

Commands:
  list                 Show currently live tokens with headline stats
  info <mint>          Fetch livestream metadata for a token
  join <mint>          Retrieve a LiveKit viewer token for the livestream
  regions              Inspect LiveKit edges available to clients
  help                 Show this message

Options:
  --limit <n>          Number of items to fetch (default: 12)
  --json               Emit raw JSON for scripting
  --clips              Include recorded clip metadata (info command)
  --includeToken       Include LiveKit join token + decoded payload (info command)
  --output <path>      Save structured JSON to the specified file
`);
}

async function run() {
  let payload;
  switch (command) {
    case 'help':
      printHelp();
      return;

    case 'list':
      payload = await handleList();
      break;

    case 'info':
      payload = await handleInfo(positionals[1] || values.mint);
      break;

    case 'join':
      payload = await handleJoin(positionals[1] || values.mint);
      break;

    case 'regions':
      payload = await handleRegions(positionals[1] || values.mint);
      break;

    default:
      printHelp();
      return;
  }

  await maybeEmitJson(payload);
}

async function handleList() {
  const limit = Number(values.limit);
  const data = await getCurrentlyLive({ limit });
  const fetchedAt = new Date().toISOString();

  if (!values.json) {
    if (!data.length) {
      console.log('No live streams reported.');
    } else {
      console.log(`Found ${data.length} live streams (showing up to ${limit})\n`);
      data.forEach((item, index) => {
        const rank = String(index + 1).padStart(2, '0');
        const mcap = formatNumber(item.market_cap, 'SOL');
        const usdMcap = formatNumber(item.usd_market_cap, 'USD');
        const viewers = item.num_participants ?? item.numParticipants ?? 'n/a';
        console.log(`${rank}. ${item.name || 'Unknown'} (${item.symbol || '—'})`);
        console.log(`    Mint: ${item.mint}`);
        console.log(`    Participants: ${viewers} | Market Cap: ${mcap} (~${usdMcap})`);
        console.log(`    Thumbnail: ${item.thumbnail}`);
      });
    }
  }

  await persistLiveRoster(data, fetchedAt).catch((error) => {
    console.error('[supabase] Failed to persist live roster:', error.message);
  });

  return {
    fetchedAt,
    limit,
    streams: data,
  };
}

async function handleInfo(mintId) {
  if (!mintId) {
    console.error('Mint address required (pass as positional argument or --mint)');
    process.exit(1);
  }

  const snapshot = await getLivestreamSnapshot(mintId, {
    includeClips: values.clips,
    includeToken: values.includeToken,
  });
  const fetchedAt = new Date().toISOString();

  if (!values.json) {
    const { livestream } = snapshot;
    if (!livestream) {
      console.log(`Livestream metadata unavailable for ${mintId}`);
    } else {
      console.log(`Livestream for ${mintId}`);
      console.log(`  Creator: ${livestream.creatorAddress}`);
      console.log(`  Started: ${new Date(livestream.streamStartTimestamp).toISOString()}`);
      console.log(`  Participants: ${livestream.numParticipants}`);
      console.log(`  Mode: ${livestream.mode}`);
      console.log(`  Thumbnail: ${livestream.thumbnail}`);
      console.log(`  Approved Creator: ${snapshot.isApprovedCreator}`);

      if (values.clips && Array.isArray(snapshot.clips)) {
        console.log('\nRecent Clips:');
        snapshot.clips.slice(0, 5).forEach((clip, idx) => {
          console.log(`  ${idx + 1}. ${clip.id} (${clip.clipType}) -> ${clip.url || clip.storageUrl}`);
        });
      }

      if (values.includeToken && snapshot.join?.token) {
        const decoded = decodeJwt(snapshot.join.token);
        console.log('\nLiveKit Token (viewer)');
        console.log(`  token: ${snapshot.join.token}`);
        console.log(`  expires: ${decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : 'unknown'}`);
        console.log(`  payload: ${JSON.stringify(decoded, null, 2)}`);
      }
    }
  }

  await persistLivestreamSnapshot({ mintId, fetchedAt, snapshot }).catch((error) => {
    console.error('[supabase] Failed to persist livestream snapshot:', error.message);
  });

  return {
    mintId,
    fetchedAt,
    snapshot,
  };
}

async function handleJoin(mintId) {
  if (!mintId) {
    console.error('Mint address required (pass as positional argument or --mint)');
    process.exit(1);
  }

  const response = await getJoinToken(mintId);
  const decoded = decodeJwt(response.token);

  if (!values.json) {
    console.log(`LiveKit viewer token for ${mintId}`);
    console.log(`  token: ${response.token}`);
    console.log(`  role: ${response.role}`);
    console.log(`  expires: ${decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : 'unknown'}`);
    console.log(`  payload: ${JSON.stringify(decoded, null, 2)}`);
  }

  return {
    mintId,
    fetchedAt: new Date().toISOString(),
    response,
    decoded,
  };
}

async function handleRegions(mintId) {
  if (!mintId) {
    console.error('Mint address required for regions command (pass as positional argument or --mint)');
    process.exit(1);
  }

  const join = await getJoinToken(mintId);
  const regions = await getLivekitRegions(join.token);
  const fetchedAt = new Date().toISOString();
  if (!values.json) {
    if (!regions.length) {
      console.log('No LiveKit regions reported');
    } else {
      console.log('LiveKit Regions (distance in meters)');
      regions.forEach((region) => {
        console.log(`  - ${region.region}: ${region.url} (distance ${formatNumber(region.distance, 'm')})`);
      });
    }
  }

  await persistLivestreamRegions({ mintId, fetchedAt, regions }).catch((error) => {
    console.error('[supabase] Failed to persist regions:', error.message);
  });

  return {
    mintId,
    fetchedAt,
    regions,
  };
}

async function maybeEmitJson(payload) {
  if (!payload) return;

  const fileName = buildJsonFileName({
    prefix: command,
    label: payload?.mintId || payload?.snapshot?.mintId || payload?.streams?.[0]?.mint,
    fallbackLabel: 'mint',
    timestamp: payload?.fetchedAt,
  });

  const targetPath = await resolveOutputTarget(outputPath, fileName);

  if (targetPath) {
    await writeJsonFile(targetPath, payload);
    const message = values.json ?
      `JSON saved to ${targetPath}` :
      `JSON written to ${targetPath}`;
    console.log(message);
  } else if (values.json) {
    console.log(toJson(payload));
  }
}

function formatNumber(value, unit = 'SOL') {
  if (value === null || value === undefined) return 'n/a';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  if (Math.abs(num) >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B ${unit}`;
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M ${unit}`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(2)}K ${unit}`;
  return `${num.toFixed(2)} ${unit}`;
}

run().catch((error) => {
  console.error('Command failed:', error.message);
  process.exit(1);
});
