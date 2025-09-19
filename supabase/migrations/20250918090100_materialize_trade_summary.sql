-- Materialized view to avoid heavy scan on token_trade_summary
create materialized view if not exists public.mv_token_trade_summary as
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
where t.observed_at >= now() - interval '7 days'
group by t.mint_id
with no data;

create unique index if not exists mv_token_trade_summary_mint_idx on public.mv_token_trade_summary (mint_id);

create or replace function public.refresh_mv_token_trade_summary(concurrent boolean default true)
returns void
language plpgsql
as $$
begin
  if concurrent then
    refresh materialized view concurrently public.mv_token_trade_summary;
  else
    refresh materialized view public.mv_token_trade_summary;
  end if;
end;
$$;

create or replace view public.token_trade_summary as
  select * from public.mv_token_trade_summary;
