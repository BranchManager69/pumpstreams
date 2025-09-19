#!/usr/bin/env node
import '../lib/env.js';

import { parseArgs } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

import {
  Room,
  RoomEvent,
  TrackKind,
  AudioStream,
  VideoStream,
  VideoBufferType,
} from '@livekit/rtc-node';

import { getLivekitConnectionDetails, getLivestreamMeta } from '../lib/livestream-api.js';
import {
  isS3Configured,
  uploadObjectToS3,
  persistLivestreamClip,
} from '../lib/supabase-storage.js';
import {
  buildJsonFileName,
  resolveOutputTarget,
  writeJsonFile,
  toJson,
} from '../lib/io-utils.js';

function usage() {
  console.error('Usage: npm run capture -- <mint> [--duration 30] [--min-viewers N] [--max-wait 20] [--label text] [--captured-by name] [--json]');
}

function parseNumber(raw, { defaultValue, min = 0, max = Infinity } = {}) {
  if (raw === undefined) return defaultValue;
  const value = Number(raw);
  if (!Number.isFinite(value)) return defaultValue;
  return Math.min(Math.max(value, min), max);
}

function nowIso() {
  return new Date().toISOString();
}

function slugForTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createDeferred(label) {
  let resolveFn;
  let rejectFn;
  let settled = false;
  const promise = new Promise((resolve, reject) => {
    resolveFn = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    rejectFn = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
  });
  return {
    label,
    promise,
    resolve: resolveFn,
    reject: rejectFn,
    get settled() {
      return settled;
    },
  };
}

async function waitWithTimeout(promise, timeoutMs, label) {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
    }),
  ]);
}

function bufferFromTypedArray(view) {
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}

async function recordAudio(track, outputPath, { signal } = {}) {
  return new Promise(async (resolve, reject) => {
    const args = [
      '-loglevel', 'error',
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '1',
      '-i', 'pipe:0',
      '-c:a', 'libopus',
      '-b:a', '128k',
      '-y', outputPath,
    ];

    const ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    const errorChunks = [];
    let aborted = false;

    ffmpeg.stderr.on('data', (chunk) => {
      errorChunks.push(chunk.toString());
    });

    ffmpeg.on('error', (error) => {
      reject(new Error(`ffmpeg audio spawn failed: ${error.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (signalListener) {
        signal?.removeEventListener('abort', signalListener);
      }
      if (code === 0 || code === null || aborted) {
        resolve();
      } else {
        reject(new Error(`ffmpeg audio exited with code ${code}: ${errorChunks.join('')}`));
      }
    });

    const stream = new AudioStream(track, { sampleRate: 48000, numChannels: 1 });
    const reader = stream.getReader();

    const stopRecording = () => {
      if (aborted) return;
      aborted = true;
      try {
        reader.cancel().catch(() => {});
      } catch {}
      try {
        stream.cancel().catch(() => {});
      } catch {}
      try {
        ffmpeg.stdin.end();
      } catch {}
      try {
        ffmpeg.kill('SIGINT');
      } catch {}
    };

    let signalListener = null;
    if (signal) {
      signalListener = () => stopRecording();
      if (signal.aborted) {
        stopRecording();
      } else {
        signal.addEventListener('abort', signalListener, { once: true });
      }
    }

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        if (aborted || signal?.aborted) break;
        const chunk = bufferFromTypedArray(value.data);
        try {
          if (!ffmpeg.stdin.write(chunk)) {
            await once(ffmpeg.stdin, 'drain');
          }
        } catch (error) {
          if (error.code === 'EPIPE') {
            break;
          }
          throw error;
        }
      }
    } catch (error) {
      if (!aborted) {
        reject(error);
        return;
      }
    } finally {
      try {
        reader.releaseLock?.();
      } catch {}
      try {
        stream.cancel().catch(() => {});
      } catch {}
      try {
        ffmpeg.stdin.end();
      } catch {}
    }
  });
}

async function recordVideo(track, outputPath, { signal } = {}) {
  return new Promise(async (resolve, reject) => {
    const stream = new VideoStream(track);
    const reader = stream.getReader();
    let ffmpeg = null;
    const errorChunks = [];
    let frameCount = 0;
    let aborted = false;

    const stopRecording = () => {
      if (aborted) return;
      aborted = true;
      try {
        reader.cancel().catch(() => {});
      } catch {}
      try {
        stream.cancel().catch(() => {});
      } catch {}
      if (ffmpeg) {
        try {
          ffmpeg.stdin.end();
        } catch {}
        try {
          ffmpeg.kill('SIGINT');
        } catch {}
      }
    };

    let signalListener = null;
    if (signal) {
      signalListener = () => stopRecording();
      if (signal.aborted) {
        stopRecording();
      } else {
        signal.addEventListener('abort', signalListener, { once: true });
      }
    }

    const startFfmpeg = (width, height) => {
      const args = [
        '-loglevel', 'error',
        '-f', 'rawvideo',
        '-pix_fmt', 'yuv420p',
        '-s', `${width}x${height}`,
        '-framerate', '30',
        '-i', 'pipe:0',
        '-an',
        '-c:v', 'libvpx-vp9',
        '-b:v', '2500k',
        '-deadline', 'realtime',
        '-cpu-used', '4',
        '-y', outputPath,
      ];

      ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
      ffmpeg.stderr.on('data', (chunk) => {
        errorChunks.push(chunk.toString());
      });
      ffmpeg.on('error', (error) => {
        if (signalListener) {
          signal?.removeEventListener('abort', signalListener);
        }
        reject(new Error(`ffmpeg video spawn failed: ${error.message}`));
      });
      ffmpeg.on('close', (code) => {
        if (signalListener) {
          signal?.removeEventListener('abort', signalListener);
        }
        if (code === 0 || code === null || aborted) {
          resolve();
        } else {
          reject(new Error(`ffmpeg video exited with code ${code}: ${errorChunks.join('')}`));
        }
      });
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        if (aborted || signal?.aborted) break;
        let frame = value.frame;
        if (!frame) continue;
        if (frame.type !== VideoBufferType.I420) {
          frame = frame.convert(VideoBufferType.I420);
        }
        if (!ffmpeg) {
          startFfmpeg(frame.width, frame.height);
        }
        if (!ffmpeg) {
          throw new Error('Failed to start ffmpeg for video');
        }
        const chunk = bufferFromTypedArray(frame.data);
        frameCount += 1;
        try {
          if (!ffmpeg.stdin.write(chunk)) {
            await once(ffmpeg.stdin, 'drain');
          }
        } catch (error) {
          if (error.code === 'EPIPE') {
            break;
          }
          throw error;
        }
      }
    } catch (error) {
      if (!aborted) {
        reject(error);
        return;
      }
    } finally {
      if (ffmpeg) {
        ffmpeg.stdin.end();
      }
      try {
        reader.releaseLock?.();
      } catch {}
      try {
        stream.cancel().catch(() => {});
      } catch {}
    }

    if (frameCount === 0) {
      reject(new Error('No video frames received'));
    }
  });
}

async function ensureFileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { positionals, values } = parseArgs({
    options: {
      mint: { type: 'string' },
      duration: { type: 'string', default: '30' },
      'min-duration': { type: 'string' },
      'max-duration': { type: 'string' },
      'min-viewers': { type: 'string' },
      'max-wait': { type: 'string', default: '20' },
      'segment-length': { type: 'string', default: '0' },
      label: { type: 'string' },
      json: { type: 'boolean', default: false },
      output: { type: 'string' },
      'captured-by': { type: 'string' },
    },
    allowPositionals: true,
  });

  const mintId = positionals[0] || values.mint;
  if (!mintId) {
    usage();
    process.exit(1);
  }

  if (!isS3Configured()) {
    console.error('AWS_S3_BUCKET / credentials are not configured; capture cannot proceed.');
    process.exit(1);
  }

  const durationSec = parseNumber(values.duration, { defaultValue: 30, min: 1, max: 3600 });
  const minDurationSec = parseNumber(values['min-duration'], { defaultValue: 0, min: 0, max: 3600 });
  const maxDurationSecRaw = parseNumber(values['max-duration'], { defaultValue: 0, min: 0, max: 3600 });
  const maxDurationSec = maxDurationSecRaw > 0 ? maxDurationSecRaw : null;
  const minViewers = parseNumber(values['min-viewers'], { defaultValue: 0, min: 0, max: 100000 });
  const waitSec = parseNumber(values['max-wait'], { defaultValue: 20, min: 1, max: 120 });
  const segmentLengthSec = parseNumber(values['segment-length'], { defaultValue: 0, min: 0, max: 3600 });
  const label = values.label ?? null;
  const capturedBy = values['captured-by'] ?? 'system';
  const wantsJson = Boolean(values.json);
  const outputDir = values.output ? resolve(values.output) : null;

  if (segmentLengthSec > 0) {
    console.warn('Segmented captures are not yet implemented; recording a single clip.');
  }

  if (maxDurationSec && durationSec > maxDurationSec) {
    console.warn(`Requested duration (${durationSec}s) exceeds --max-duration (${maxDurationSec}s); trimming to max.`);
  }

  const effectiveDuration = maxDurationSec ? Math.min(durationSec, maxDurationSec) : durationSec;
  if (minDurationSec && effectiveDuration < minDurationSec) {
    console.warn(`Duration ${effectiveDuration}s is below --min-duration (${minDurationSec}s); increasing to minimum.`);
  }
  const finalDuration = Math.max(effectiveDuration, minDurationSec || effectiveDuration);

  const meta = await getLivestreamMeta(mintId).catch(() => null);
  const initialViewers = meta?.numParticipants ?? meta?.num_participants ?? null;
  if (minViewers && (initialViewers === null || initialViewers < minViewers)) {
    console.error(`Livestream has ${initialViewers ?? 0} viewers, below required minimum (${minViewers}).`);
    process.exit(2);
  }

  const { join: joinInfo, regionUrl } = await getLivekitConnectionDetails(mintId);
  const room = new Room({ adaptiveStream: false, dynacast: false });

  const tmpRoot = await mkdtemp(join(tmpdir(), 'pumpclip-'));
  const audioPath = join(tmpRoot, 'audio.webm');
  const videoPath = join(tmpRoot, 'video.webm');

  let interrupted = false;
  process.on('SIGINT', async () => {
    if (interrupted) return;
    interrupted = true;
    console.warn('\nInterrupt received, stopping capture…');
    stopViewerPolling();
    await room.disconnect().catch(() => {});
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    process.exit(130);
  });

  const audioDeferred = createDeferred('audio track');
  const videoDeferred = createDeferred('video track');
  const captureStarted = createDeferred('first media track');
  const captureController = new AbortController();
  const captureSignal = captureController.signal;
  let audioCapturePromise = null;
  let videoCapturePromise = null;
  const activePublications = new Set();

  let startedAt = null;
  let endedAt = null;
  let viewerMin = initialViewers ?? null;
  let viewerMax = initialViewers ?? null;

  const updateViewerStats = (count) => {
    if (typeof count !== 'number' || Number.isNaN(count)) return;
    if (viewerMin === null || count < viewerMin) viewerMin = count;
    if (viewerMax === null || count > viewerMax) viewerMax = count;
  };

  updateViewerStats(initialViewers);

  let viewerPollTimer = null;
  const startViewerPolling = () => {
    if (viewerPollTimer) return;
    viewerPollTimer = setInterval(async () => {
      try {
        const snapshot = await getLivestreamMeta(mintId).catch(() => null);
        const count = snapshot?.numParticipants ?? snapshot?.num_participants ?? null;
        updateViewerStats(count);
      } catch {
        // ignore polling errors
      }
    }, 5000);
  };

  const stopViewerPolling = () => {
    if (viewerPollTimer) {
      clearInterval(viewerPollTimer);
      viewerPollTimer = null;
    }
  };

  const handleTrackSubscribed = (track, publication, participant) => {
    if (!track) return;
    const kind = publication?.kind ?? track.kind;
    const humanKind = kind === TrackKind.KIND_AUDIO ? 'audio' : kind === TrackKind.KIND_VIDEO ? 'video' : kind;
    console.log(`Subscribed to ${humanKind} track from ${participant?.identity ?? 'unknown'}`);
    if (publication) {
      activePublications.add(publication);
    }
    if (!captureStarted.settled) {
      captureStarted.resolve(track);
    }
    if (!startedAt) {
      startedAt = new Date();
    }
    startViewerPolling();
    if (kind === TrackKind.KIND_AUDIO && !audioDeferred.settled && !audioCapturePromise) {
      audioCapturePromise = recordAudio(track, audioPath, { signal: captureSignal });
      audioDeferred.resolve(track);
    } else if (kind === TrackKind.KIND_VIDEO && !videoDeferred.settled && !videoCapturePromise) {
      videoCapturePromise = recordVideo(track, videoPath, { signal: captureSignal });
      videoDeferred.resolve(track);
    }
  };

  room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
  room.on(RoomEvent.TrackUnsubscribed, (_, publication) => {
    if (publication) {
      activePublications.delete(publication);
    }
  });

  captureSignal.addEventListener('abort', () => {
    for (const publication of activePublications) {
      try {
        publication.setSubscribed(false);
      } catch {}
    }
  }, { once: true });

  const waitMs = waitSec * 1000;

  try {
    await room.connect(regionUrl, joinInfo.token, { autoSubscribe: true });

    await waitWithTimeout(captureStarted.promise, waitMs, 'first media track');
    if (!startedAt) {
      startedAt = new Date();
    }
    startViewerPolling();

    const targetMs = finalDuration * 1000;
    await delay(targetMs);
    if (!captureSignal.aborted) {
      captureController.abort(new Error('capture duration reached'));
    }
    await room.disconnect().catch(() => {});
    const captureResults = await Promise.allSettled([audioCapturePromise, videoCapturePromise].filter(Boolean));
    const failedCapture = captureResults.find((entry) => entry.status === 'rejected');
    if (failedCapture) {
      throw failedCapture.reason instanceof Error
        ? failedCapture.reason
        : new Error(`Capture failed: ${String(failedCapture.reason)}`);
    }
    endedAt = new Date();
  } catch (error) {
    if (!captureSignal.aborted) {
      captureController.abort(error);
    }
    stopViewerPolling();
    await room.disconnect().catch(() => {});
    console.error('Capture failed:', error.message);
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    process.exit(1);
  }

  stopViewerPolling();

  if (!startedAt) {
    startedAt = new Date();
  }
  if (!endedAt) {
    endedAt = new Date();
  }

  const durationMsRaw = endedAt.getTime() - startedAt.getTime();
  const durationMs = durationMsRaw > 0 ? durationMsRaw : finalDuration * 1000;

  const audioExpected = Boolean(audioCapturePromise);
  const videoExpected = Boolean(videoCapturePromise);
  const audioExists = audioExpected ? await ensureFileExists(audioPath) : false;
  const videoExists = videoExpected ? await ensureFileExists(videoPath) : false;

  if (!audioExpected) {
    console.warn('No audio track detected; continuing without audio.');
  } else if (!audioExists) {
    console.warn('Audio track subscribed but produced no data; skipping audio output.');
  }

  if (!videoExpected) {
    console.warn('No video track detected; continuing without video.');
  } else if (!videoExists) {
    console.warn('Video track subscribed but produced no data; skipping video output.');
  }

  if (!audioExists && !videoExists) {
    console.error('Capture did not produce any media files.');
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    process.exit(1);
  }

  try {
    const finalMeta = await getLivestreamMeta(mintId).catch(() => null);
    const finalCount = finalMeta?.numParticipants ?? finalMeta?.num_participants ?? null;
    updateViewerStats(finalCount);
  } catch {
    // ignore
  }

  const timestampSlug = slugForTimestamp(startedAt);
  const baseKey = `captures/${mintId}/${timestampSlug}`;
  let audioKey = null;
  let videoKey = null;

  let uploadError = null;
  try {
    if (audioExists) {
      audioKey = `${baseKey}/audio.webm`;
      await uploadObjectToS3({ key: audioKey, body: createReadStream(audioPath), contentType: 'video/webm' });
    }
    if (videoExists) {
      videoKey = `${baseKey}/video.webm`;
      await uploadObjectToS3({ key: videoKey, body: createReadStream(videoPath), contentType: 'video/webm' });
    }
  } catch (error) {
    uploadError = error;
  }

  const paramsSummary = {
    duration: durationSec,
    minDuration: minDurationSec,
    maxDuration: maxDurationSec,
    minViewers,
    segmentLength: segmentLengthSec,
  };

  const capturedTracks = [];
  const missingTracks = [];
  if (audioExists) capturedTracks.push('audio'); else missingTracks.push('audio');
  if (videoExists) capturedTracks.push('video'); else missingTracks.push('video');
  const clipStatus = missingTracks.length === 0 ? 'ready' : 'partial';
  const clipNotes = missingTracks.length === 0 ? null : `missing:${missingTracks.join(',')}`;

  if (!uploadError) {
    await persistLivestreamClip({
      mintId,
      capturedBy,
      label,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs,
      viewerCountMin: viewerMin,
      viewerCountMax: viewerMax,
      params: paramsSummary,
      s3AudioKey: audioKey,
      s3VideoKey: videoKey,
      status: clipStatus,
      notes: clipNotes,
    });
  }

  const result = {
    mintId,
    label,
    capturedBy,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs,
    viewerCountMin: viewerMin,
    viewerCountMax: viewerMax,
    s3AudioKey: audioKey,
    s3VideoKey: videoKey,
    params: paramsSummary,
    tracksCaptured: capturedTracks,
    missingTracks,
  };

  if (uploadError) {
    console.error('Upload failed:', uploadError.message);
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    process.exit(1);
  }

  if (!captureSignal.aborted) {
    captureController.abort(new Error('capture completed'));
  }

  if (outputDir) {
    const fileName = buildJsonFileName({ prefix: 'clip', label: mintId, timestamp: nowIso() });
    const target = await resolveOutputTarget(outputDir, fileName);
    await writeJsonFile(target, result);
    console.log(`Capture metadata saved to ${target}`);
  }

  if (wantsJson) {
    console.log(toJson(result));
  } else {
    console.log('Capture complete');
    console.log(`  Mint: ${mintId}`);
    console.log(`  Duration: ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`  Viewers (min/max): ${viewerMin ?? 'n/a'} / ${viewerMax ?? 'n/a'}`);
    console.log(`  Audio: ${audioKey ? `s3://${audioKey}` : 'not captured'}`);
    console.log(`  Video: ${videoKey ? `s3://${videoKey}` : 'not captured'}`);
  }

  await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  process.exit(0);
}

main();
