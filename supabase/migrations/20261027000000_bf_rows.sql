-- BetterFlashcards sync store. One table holds every synced row as JSON, keyed by
-- (user, kind, id). The `bf_` prefix keeps it apart from anything else in the project.
--
-- Last write wins on the client's updated_at; server_at is the pull cursor (server clock, so a
-- device with a wrong clock or a long offline stretch never gets skipped).

create table if not exists public.bf_rows (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('folders', 'decks', 'cards', 'cardStates', 'reviewLogs')),
  id         text        not null,
  data       jsonb,
  updated_at timestamptz not null,
  purged     boolean     not null default false,
  server_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, id)
);

create index if not exists bf_rows_pull on public.bf_rows (user_id, server_at);

alter table public.bf_rows enable row level security;

drop policy if exists "bf_rows own rows" on public.bf_rows;
create policy "bf_rows own rows" on public.bf_rows
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Keep the newer write. Returning NULL skips the update, so an older or identical row
-- (e.g. a device echoing back what it just pulled) never bumps server_at.
create or replace function public.bf_rows_lww() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
    return null;
  end if;
  new.server_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists bf_rows_lww on public.bf_rows;
create trigger bf_rows_lww before insert or update on public.bf_rows
  for each row execute function public.bf_rows_lww();
