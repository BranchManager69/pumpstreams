#!/usr/bin/env node
import '../lib/env.js';
import { parseArgs } from 'util';
import { getLivekitConnectionDetails, decodeJwt } from '../lib/livestream-api.js';
import { buildJsonFileName, resolveOutputTarget, toJson, writeJsonFile } from '../lib/io-utils.js';
import { persistLivestreamSession } from '../lib/supabase-storage.js';

const { positionals, values } = parseArgs({
  options: {
    mint: { type: 'string' },
    duration: { type: 'string', default: '30' },
    output: { type: 'string' },
    json: { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

const mintId = positionals[0] || values.mint;

if (!mintId) {
  console.error('Usage: npm run subscribe -- <mint> [--duration 30] [--output path/] [--json]');
  process.exit(1);
}

const durationSec = Math.max(5, Number(values.duration) || 30);
const outputTarget = values.output;
const verbose = values.verbose;

if (!verbose && !process.env.LIVEKIT_LOG_LEVEL) {
  process.env.LIVEKIT_LOG_LEVEL = 'warn';
}

const summary = {
  mintId,
  requestedAt: new Date().toISOString(),
  durationSec,
  livekit: {},
  participants: {},
  tracks: [],
  events: [],
};

function recordEvent(type, details = {}) {
  summary.events.push({
    type,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

async function main() {
  const { mintId: canonicalMint, join, regionUrl, regions } = await getLivekitConnectionDetails(mintId);
  summary.mintId = canonicalMint;
  const decoded = decodeJwt(join.token);
  summary.livekit = {
    regionUrl,
    availableRegions: regions,
    tokenExpiry: decoded?.exp || null,
    role: join?.role,
    room: decoded?.video?.room,
    permissions: decoded?.video ? {
      canSubscribe: decoded.video.canSubscribe,
      canPublish: decoded.video.canPublish,
      canPublishData: decoded.video.canPublishData,
    } : null,
  };

  const { Room, RoomEvent } = await import('@livekit/rtc-node');

  const room = new Room({
    adaptiveStream: false,
    dynacast: false,
  });

  room.on(RoomEvent.ParticipantConnected, (participant) => {
    summary.participants[participant.identity] = {
      sid: participant.sid,
      name: participant.name,
      connectedAt: new Date().toISOString(),
    };
    recordEvent('participant-connected', { identity: participant.identity, sid: participant.sid });
  });

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    summary.participants[participant.identity] = {
      ...(summary.participants[participant.identity] || {}),
      sid: participant.sid,
      disconnectedAt: new Date().toISOString(),
    };
    recordEvent('participant-disconnected', { identity: participant.identity, sid: participant.sid });
  });

  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    const kind = humanTrackKind(publication?.kind ?? track?.kind);
    const source = humanTrackSource(publication?.source);
    const entry = {
      trackSid: publication?.trackSid,
      kind,
      source,
      participant: participant?.identity,
      participantSid: participant?.sid,
      trackName: publication?.name,
      dimensions: track?.dimensions || null,
      muted: publication?.isMuted,
      firstSubscribedAt: new Date().toISOString(),
    };
    summary.tracks.push(entry);
    recordEvent('track-subscribed', entry);
  });

  room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
    recordEvent('track-unsubscribed', {
      trackSid: publication?.trackSid,
      participant: participant?.identity,
    });
  });

  room.on(RoomEvent.ConnectionStateChanged, (state) => {
    recordEvent('connection-state', { state: humanConnectionState(state) });
  });

  const startedAt = Date.now();
  try {
    await room.connect(regionUrl, join.token, { autoSubscribe: true });
    recordEvent('connected', { regionUrl });

    await new Promise((resolve) => setTimeout(resolve, durationSec * 1000));
  } catch (error) {
    recordEvent('error', { message: error.message });
    throw error;
  } finally {
    await room.disconnect().catch(() => {});
    recordEvent('disconnected');
    summary.sessionDurationMs = Date.now() - startedAt;
  }

  await outputSummary();
  process.exit(0);
}

async function outputSummary() {
  const json = toJson(summary);

  await persistLivestreamSession(summary).catch((error) => {
    console.error('[supabase] Failed to persist LiveKit session:', error.message);
  });

  if (outputTarget) {
    const fileName = buildJsonFileName({
      prefix: 'livekit',
      label: summary.mintId,
      fallbackLabel: 'mint',
      timestamp: summary.sessionDurationMs ? new Date().toISOString() : summary.requestedAt,
    });
    const target = await resolveOutputTarget(outputTarget, fileName);
    await writeJsonFile(target, summary);
    const msg = values.json ? `Summary saved to ${target}` : `LiveKit summary written to ${target}`;
    console.log(msg);
  }

  if (values.json) {
    console.log(json);
  } else if (!outputTarget) {
    console.log('\nLiveKit session summary:');
    console.log(`  Tracks observed: ${summary.tracks.length}`);
    console.log(`  Participants seen: ${Object.keys(summary.participants).length}`);
    console.log(`  Session duration: ${(summary.sessionDurationMs || 0) / 1000}s`);
  }
}

function humanTrackKind(value) {
  if (typeof value === 'string') return value;
  const map = {
    0: 'unspecified',
    1: 'audio',
    2: 'video',
    3: 'data',
  };
  return map[value] || value || 'unknown';
}

function humanTrackSource(value) {
  if (typeof value === 'string') return value;
  const map = {
    0: 'unknown',
    1: 'microphone',
    2: 'camera',
    3: 'screenshare',
    4: 'screenshare_audio',
  };
  return map[value] || value || 'unknown';
}

function humanConnectionState(value) {
  if (typeof value === 'string') return value;
  const map = {
    0: 'disconnected',
    1: 'connected',
    2: 'reconnecting',
    3: 'connecting',
  };
  return map[value] || value || 'unknown';
}

main().catch((error) => {
  console.error('LiveKit subscriber failed:', error.message);
  process.exit(1);
});
