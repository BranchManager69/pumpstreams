create table if not exists public.livestream_clips (
  id uuid primary key default gen_random_uuid(),
  mint_id text not null references public.tokens (mint_id) on delete cascade,
  captured_by text,
  label text,
  started_at timestamptz(6) not null,
  ended_at timestamptz(6) not null,
  duration_ms integer not null,
  viewer_count_min integer,
  viewer_count_max integer,
  params jsonb,
  s3_audio_key text,
  s3_video_key text,
  status text not null default 'ready',
  notes text,
  created_at timestamptz(6) not null default now()
);

create index if not exists livestream_clips_mint_started_idx
  on public.livestream_clips (mint_id, started_at desc);
