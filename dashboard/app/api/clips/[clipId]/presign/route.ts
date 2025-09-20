import { NextResponse } from 'next/server';
import { getServiceClient } from '../../../../../lib/supabase';
import { presignObject } from '../../../../../lib/s3';

const EXPIRES_SECONDS = Number(process.env.DASHBOARD_CLIP_PRESIGN_SECONDS ?? '1800');

export async function GET(
  request: Request,
  { params }: { params: { clipId: string } },
) {
  const clipId = params.clipId;
  const url = new URL(request.url);
  const track = url.searchParams.get('track') ?? 'video';

  if (!clipId) {
    return NextResponse.json({ error: 'Missing clip id' }, { status: 400 });
  }

  if (track !== 'audio' && track !== 'video') {
    return NextResponse.json({ error: 'Track must be audio or video' }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: clip, error } = await supabase
    .from('livestream_clips')
    .select('id, s3_audio_key, s3_video_key')
    .eq('id', clipId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!clip) {
    return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  }

  const key = track === 'audio' ? clip.s3_audio_key : clip.s3_video_key;
  if (!key) {
    return NextResponse.json({ error: `Clip has no ${track} track` }, { status: 404 });
  }

  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    return NextResponse.json({ error: 'Bucket not configured' }, { status: 500 });
  }

  try {
    const signedUrl = await presignObject({ bucket, key, expiresIn: EXPIRES_SECONDS });
    return NextResponse.json({ url: signedUrl, expiresIn: EXPIRES_SECONDS });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sign object';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
