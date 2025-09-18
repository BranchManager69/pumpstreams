begin;

drop function if exists public.refresh_mv_livestream_top(boolean);
drop materialized view if exists public.mv_livestream_top;

create table if not exists public.livestream_top_cache (
  mint_id text primary key,
  fetched_at timestamptz not null,
  num_participants integer,
  market_cap numeric,
  usd_market_cap numeric,
  thumbnail text,
  is_live boolean,
  livestream jsonb
);

create index if not exists livestream_top_cache_participants_idx
  on public.livestream_top_cache (num_participants desc nulls last, fetched_at desc);

create or replace function public.refresh_livestream_top_cache()
returns void
language plpgsql
as $$
begin
  truncate table public.livestream_top_cache;
  insert into public.livestream_top_cache (mint_id, fetched_at, num_participants, market_cap, usd_market_cap, thumbnail, is_live, livestream)
  select
    ls.mint_id,
    ls.fetched_at,
    ls.num_participants,
    ls.market_cap,
    ls.usd_market_cap,
    ls.thumbnail,
    ls.is_live,
    ls.livestream
  from public.livestream_latest ls
  where ls.fetched_at >= now() - interval '20 minutes'
  order by ls.num_participants desc nulls last
  limit 600;
end;
$$;

commit;
