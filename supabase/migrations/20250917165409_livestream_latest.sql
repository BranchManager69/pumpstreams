create table if not exists public.livestream_latest (
  mint_id text primary key references public.tokens (mint_id) on delete cascade,
  fetched_at timestamptz not null,
  is_live boolean,
  num_participants integer,
  market_cap numeric,
  usd_market_cap numeric,
  thumbnail text,
  livestream jsonb not null,
  extra jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists livestream_latest_num_participants_idx on public.livestream_latest (num_participants desc nulls last);
create index if not exists livestream_latest_fetched_idx on public.livestream_latest (fetched_at desc);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_livestream_latest_updated_at') then
    create trigger trg_livestream_latest_updated_at
    before update on public.livestream_latest
    for each row execute procedure public.set_updated_at();
  end if;
end $$;
