import { cache } from 'react';
import { getServiceClient } from './supabase';

export type TokenDetail = {
  mintId: string;
  token?: {
    mint_id: string;
    name: string | null;
    symbol: string | null;
    creator_address: string | null;
    is_approved_creator: boolean | null;
    created_at: string | null;
    updated_at: string | null;
  };
  latest?: {
    mint_id: string;
    fetched_at: string;
    num_participants: number | null;
    market_cap: number | null;
    usd_market_cap: number | null;
    thumbnail: string | null;
    is_live: boolean | null;
    livestream: Record<string, unknown> | null;
  } | null;
  history: Array<{
    fetched_at: string;
    num_participants: number | null;
    market_cap: number | null;
  }>;
  clips: Array<{
    id: string;
    label: string | null;
    captured_by: string | null;
    started_at: string;
    ended_at: string;
    duration_ms: number;
    viewer_count_min: number | null;
    viewer_count_max: number | null;
    status: string | null;
    notes: string | null;
    s3_audio_key: string | null;
    s3_video_key: string | null;
    params: Record<string, unknown> | null;
    created_at: string;
  }>;
};

const HISTORY_LIMIT = Number(process.env.DASHBOARD_TOKEN_HISTORY_LIMIT ?? '240');
const CLIP_LIMIT = Number(process.env.DASHBOARD_TOKEN_CLIP_LIMIT ?? '50');

export const getTokenDetail = cache(async (mintId: string): Promise<TokenDetail | null> => {
  if (!mintId) return null;

  const supabase = getServiceClient();

  const [{ data: tokenRow, error: tokenError }, { data: latestRow, error: latestError }, { data: historyRows, error: historyError }, { data: clipRows, error: clipsError }]
    = await Promise.all([
      supabase
        .from('tokens')
        .select('mint_id, name, symbol, creator_address, is_approved_creator, created_at, updated_at')
        .eq('mint_id', mintId)
        .maybeSingle(),
      supabase
        .from('livestream_latest')
        .select('mint_id, fetched_at, num_participants, market_cap, usd_market_cap, thumbnail, is_live, livestream')
        .eq('mint_id', mintId)
        .maybeSingle(),
      supabase
        .from('livestream_snapshots')
        .select('fetched_at, num_participants, market_cap')
        .eq('mint_id', mintId)
        .order('fetched_at', { ascending: false })
        .limit(HISTORY_LIMIT),
      supabase
        .from('livestream_clips')
        .select('id, label, captured_by, started_at, ended_at, duration_ms, viewer_count_min, viewer_count_max, status, notes, params, s3_audio_key, s3_video_key, created_at')
        .eq('mint_id', mintId)
        .order('created_at', { ascending: false })
        .limit(CLIP_LIMIT),
    ]);

  if (tokenError && tokenError.code !== 'PGRST116') {
    throw new Error(`Failed to load token metadata: ${tokenError.message}`);
  }

  if (latestError && latestError.code !== 'PGRST116') {
    throw new Error(`Failed to load latest livestream snapshot: ${latestError.message}`);
  }

  if (historyError && historyError.code !== 'PGRST116') {
    throw new Error(`Failed to load snapshot history: ${historyError.message}`);
  }

  if (clipsError && clipsError.code !== 'PGRST116') {
    throw new Error(`Failed to load clips: ${clipsError.message}`);
  }

  if (!tokenRow && !latestRow && !(historyRows && historyRows.length) && !(clipRows && clipRows.length)) {
    return null;
  }

  return {
    mintId,
    token: tokenRow ?? undefined,
    latest: latestRow ?? undefined,
    history: (historyRows ?? []).map((row) => ({
      fetched_at: row.fetched_at,
      num_participants: row.num_participants,
      market_cap: row.market_cap,
    })).reverse(),
    clips: (clipRows ?? []).map((clip) => ({
      id: clip.id,
      label: clip.label,
      captured_by: clip.captured_by,
      started_at: clip.started_at,
      ended_at: clip.ended_at,
      duration_ms: clip.duration_ms,
      viewer_count_min: clip.viewer_count_min,
      viewer_count_max: clip.viewer_count_max,
      status: clip.status,
      notes: clip.notes,
      params: clip.params as Record<string, unknown> | null,
      s3_audio_key: clip.s3_audio_key,
      s3_video_key: clip.s3_video_key,
      created_at: clip.created_at,
    })),
  };
});
