-- Sync infrastructure (docs/ARCHITECTURE.md §3, DECISIONS.md D-008).
-- Every syncable row carries a server-assigned monotonic version taken from a
-- single global sequence, so clients can pull with one cursor per farm and
-- never depend on device clocks.

create extension if not exists pgcrypto;

create sequence if not exists public.sync_version_seq;

-- Assigns server_version and server_updated_at on every insert/update.
create or replace function public.set_server_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.server_version := nextval('public.sync_version_seq');
  new.server_updated_at := now();
  return new;
end;
$$;
