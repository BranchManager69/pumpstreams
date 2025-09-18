begin;

drop view if exists public.token_trade_summary;
drop function if exists public.refresh_mv_token_trade_summary(boolean);
drop materialized view if exists public.mv_token_trade_summary;

create table if not exists public.trade_summary_cache (
  mint_id text primary key,
  trade_count bigint not null,
  buy_count bigint not null,
  sell_count bigint not null,
  buy_volume_lamports numeric(38,0) not null,
  sell_volume_lamports numeric(38,0) not null,
  first_seen_at timestamptz,
  last_seen_at timestamptz
);

create index if not exists trade_summary_cache_rank_idx
  on public.trade_summary_cache (trade_count desc, mint_id);

create or replace function public.refresh_trade_summary_cache()
returns void
language plpgsql
as $$
begin
  truncate table public.trade_summary_cache;
  insert into public.trade_summary_cache (mint_id, trade_count, buy_count, sell_count, buy_volume_lamports, sell_volume_lamports, first_seen_at, last_seen_at)
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
  where t.observed_at >= now() - interval '1 hour'
  group by t.mint_id;
end;
$$;

create or replace view public.token_trade_summary as
  select * from public.trade_summary_cache;

commit;
