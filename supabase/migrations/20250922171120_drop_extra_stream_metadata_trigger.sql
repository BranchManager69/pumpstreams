begin;

drop view if exists public.token_latest_snapshot;

alter table if exists public.livestream_snapshots
  drop column if exists extra;

alter table if exists public.livestream_latest
  drop column if exists extra;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stream_metadata_updated_at on public.stream_metadata;
create trigger trg_stream_metadata_updated_at
before update on public.stream_metadata
for each row execute function public.set_updated_at();

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
    ls.livestream
  from public.livestream_snapshots ls
  order by ls.mint_id, ls.fetched_at desc;

commit;
