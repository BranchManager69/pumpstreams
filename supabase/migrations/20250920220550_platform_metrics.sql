create table if not exists public.platform_metrics_minute (
  bucket timestamptz primary key,
  live_streams integer not null,
  total_viewers integer,
  total_market_cap numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_metrics_minute_bucket_idx on public.platform_metrics_minute (bucket desc);

-- Optional: keep updated_at fresh
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_platform_metrics_minute_updated_at') then
    create trigger trg_platform_metrics_minute_updated_at
    before update on public.platform_metrics_minute
    for each row execute procedure public.set_updated_at();
  end if;
end $$;

-- Improve snapshot time filtering for analytical queries
create index if not exists livestream_snapshots_fetched_idx on public.livestream_snapshots (fetched_at desc);

