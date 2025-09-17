-- Enable required extensions
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- Tokens linked 1:1 with livestream mints
create table if not exists public.tokens (
  mint_id text primary key,
  symbol text,
  name text,
  creator_address text,
  is_approved_creator boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.livestream_snapshots (
  id uuid primary key default gen_random_uuid(),
  mint_id text not null references public.tokens (mint_id) on delete cascade,
  fetched_at timestamptz not null,
  is_live boolean,
  num_participants integer,
  max_participants integer,
  market_cap numeric,
  usd_market_cap numeric,
  mode text,
  thumbnail text,
  livestream jsonb not null,
  extra jsonb,
  created_at timestamptz not null default now(),
  unique (mint_id, fetched_at)
);

create table if not exists public.livestream_regions (
  id uuid primary key default gen_random_uuid(),
  mint_id text not null references public.tokens (mint_id) on delete cascade,
  fetched_at timestamptz not null,
  region text not null,
  region_url text,
  distance numeric,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.livestream_sessions (
  id uuid primary key default gen_random_uuid(),
  mint_id text not null references public.tokens (mint_id) on delete cascade,
  observed_at timestamptz not null,
  duration_ms bigint,
  participant_count integer,
  track_count integer,
  region_url text,
  summary jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.trade_events (
  id bigserial primary key,
  mint_id text not null references public.tokens (mint_id) on delete cascade,
  signature text,
  slot bigint,
  tx_index integer,
  is_buy boolean,
  lamports numeric(38,0) not null,
  sol numeric,
  token_amount numeric,
  token_amount_raw text,
  user_address text,
  name text,
  symbol text,
  raw jsonb,
  observed_at timestamptz not null default now()
);

create index if not exists trade_events_mint_time_idx on public.trade_events (mint_id, observed_at desc);
create index if not exists trade_events_signature_idx on public.trade_events (signature);

create table if not exists public.token_hourly_metrics (
  mint_id text not null references public.tokens (mint_id) on delete cascade,
  bucket timestamptz not null,
  trade_count integer not null default 0,
  buy_count integer not null default 0,
  sell_count integer not null default 0,
  buy_volume_lamports numeric(38,0) not null default 0,
  sell_volume_lamports numeric(38,0) not null default 0,
  primary key (mint_id, bucket)
);

create view public.token_latest_snapshot as
  select distinct on (ls.mint_id)
    ls.mint_id,
    ls.fetched_at,
    ls.is_live,
    ls.num_participants,
    ls.market_cap,
    ls.usd_market_cap,
    ls.mode,
    ls.thumbnail,
    ls.livestream,
    ls.extra
  from public.livestream_snapshots ls
  order by ls.mint_id, ls.fetched_at desc;

create view public.token_trade_summary as
  select
    t.mint_id,
    count(*) as trade_count,
    sum(case when is_buy then 1 else 0 end) as buy_count,
    sum(case when is_buy then 0 else 1 end) as sell_count,
    coalesce(sum(case when is_buy then lamports else 0 end), 0) as buy_volume_lamports,
    coalesce(sum(case when not is_buy then lamports else 0 end), 0) as sell_volume_lamports,
    min(observed_at) as first_seen_at,
    max(observed_at) as last_seen_at
  from public.trade_events t
  group by t.mint_id;

create view public.token_hourly_trend as
  select
    mint_id,
    bucket,
    trade_count,
    buy_count,
    sell_count,
    buy_volume_lamports,
    sell_volume_lamports,
    case when buy_volume_lamports + sell_volume_lamports > 0
      then (buy_volume_lamports::numeric - sell_volume_lamports::numeric) / (buy_volume_lamports + sell_volume_lamports)
      else 0 end as volume_bias
  from public.token_hourly_metrics;

-- Trigger to maintain tokens.updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_tokens_updated_at
before update on public.tokens
for each row execute procedure public.set_updated_at();
