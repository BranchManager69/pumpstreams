create materialized view if not exists public.mv_livestream_top as
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
where ls.fetched_at >= now() - interval '15 minutes'
order by ls.num_participants desc nulls last
limit 600
with no data;

create unique index if not exists mv_livestream_top_mint_idx on public.mv_livestream_top (mint_id);

create or replace function public.refresh_mv_livestream_top(concurrent boolean default true)
returns void
language plpgsql
as $$
begin
  if concurrent then
    refresh materialized view concurrently public.mv_livestream_top;
  else
    refresh materialized view public.mv_livestream_top;
  end if;
end;
$$;
