create or replace function public.record_trade_metric(
  _mint_id text,
  _observed timestamptz,
  _is_buy boolean,
  _lamports numeric
)
returns void
language plpgsql
as $$
declare
  _bucket timestamptz := date_trunc('hour', coalesce(_observed, now()));
begin
  insert into public.token_hourly_metrics as th (
    mint_id,
    bucket,
    trade_count,
    buy_count,
    sell_count,
    buy_volume_lamports,
    sell_volume_lamports
  ) values (
    _mint_id,
    _bucket,
    1,
    case when _is_buy then 1 else 0 end,
    case when not _is_buy then 1 else 0 end,
    case when _is_buy then _lamports else 0 end,
    case when not _is_buy then _lamports else 0 end
  )
  on conflict (mint_id, bucket)
  do update set
    trade_count = th.trade_count + 1,
    buy_count = th.buy_count + case when EXCLUDED.buy_count > 0 then 1 else 0 end,
    sell_count = th.sell_count + case when EXCLUDED.sell_count > 0 then 1 else 0 end,
    buy_volume_lamports = th.buy_volume_lamports + EXCLUDED.buy_volume_lamports,
    sell_volume_lamports = th.sell_volume_lamports + EXCLUDED.sell_volume_lamports;
end;
$$;

create or replace function public.rebuild_hourly_metrics(_since timestamptz default now() - interval '48 hours')
returns void
language plpgsql
as $$
begin
  delete from public.token_hourly_metrics where bucket >= date_trunc('hour', _since);

  insert into public.token_hourly_metrics (
    mint_id,
    bucket,
    trade_count,
    buy_count,
    sell_count,
    buy_volume_lamports,
    sell_volume_lamports
  )
  select
    mint_id,
    date_trunc('hour', observed_at) as bucket,
    count(*) as trade_count,
    sum(case when is_buy then 1 else 0 end) as buy_count,
    sum(case when not is_buy then 1 else 0 end) as sell_count,
    sum(case when is_buy then lamports::numeric else 0 end) as buy_volume_lamports,
    sum(case when not is_buy then lamports::numeric else 0 end) as sell_volume_lamports
  from public.trade_events
  where observed_at >= _since
  group by 1,2
  order by 1,2;
end;
$$;

create or replace function public.record_trade_metric_bulk(rows jsonb)
returns void
language plpgsql
as $$
declare
  _item jsonb;
begin
  if rows is null then
    return;
  end if;

  for _item in select * from jsonb_array_elements(rows)
  loop
    perform public.record_trade_metric(
      (_item->>'mint_id')::text,
      (_item->>'observed_at')::timestamptz,
      (_item->>'is_buy')::boolean,
      (_item->>'lamports')::numeric
    );
  end loop;
end;
$$;
