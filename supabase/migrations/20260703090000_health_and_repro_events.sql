-- Health and reproduction events (D-019). Same sync contract as the rest:
-- farm-scoped, server_version trigger, soft-delete tombstones, RLS for
-- active members. Expected calving date is derived client-side from the
-- last insemination (never stored).

create table public.health_events (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id),
  cow_id uuid not null references public.cows (id),
  event_date date not null,
  event_type text not null
    check (event_type in ('treatment', 'vaccination', 'illness', 'checkup', 'other')),
  description text not null check (char_length(trim(description)) between 1 and 500),
  -- Milk must be discarded until this date (inclusive) due to medication.
  withdrawal_until date,
  recorded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0
);

create table public.repro_events (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id),
  cow_id uuid not null references public.cows (id),
  event_date date not null,
  event_type text not null
    check (event_type in ('heat', 'insemination', 'pregnancy_check', 'calving', 'abortion')),
  -- For pregnancy_check: confirmed result; free-form notes otherwise.
  result text check (result is null or result in ('pregnant', 'open')),
  notes text check (notes is null or char_length(notes) <= 500),
  recorded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0
);

create index health_events_cow_idx on public.health_events (cow_id, event_date desc)
  where deleted_at is null;
create index health_events_version_idx on public.health_events (farm_id, server_version);
create index repro_events_cow_idx on public.repro_events (cow_id, event_date desc)
  where deleted_at is null;
create index repro_events_version_idx on public.repro_events (farm_id, server_version);

create trigger health_events_server_version
  before insert or update on public.health_events
  for each row execute function public.set_server_version();
create trigger repro_events_server_version
  before insert or update on public.repro_events
  for each row execute function public.set_server_version();

-- The generic cow/farm consistency check (validates new.cow_id belongs to
-- new.farm_id; despite the historical name it is table-agnostic).
create trigger health_events_check_cow
  before insert or update of cow_id, farm_id on public.health_events
  for each row execute function public.check_milk_record_cow();
create trigger repro_events_check_cow
  before insert or update of cow_id, farm_id on public.repro_events
  for each row execute function public.check_milk_record_cow();

grant select, insert, update on public.health_events to authenticated;
grant select, insert, update on public.repro_events to authenticated;

alter table public.health_events enable row level security;
alter table public.repro_events enable row level security;

create policy health_events_select on public.health_events
  for select to authenticated using (public.is_farm_member(farm_id));
create policy health_events_insert on public.health_events
  for insert to authenticated
  with check (public.is_farm_member(farm_id) and recorded_by = (select auth.uid()));
create policy health_events_update on public.health_events
  for update to authenticated
  using (public.is_farm_member(farm_id))
  with check (public.is_farm_member(farm_id));

create policy repro_events_select on public.repro_events
  for select to authenticated using (public.is_farm_member(farm_id));
create policy repro_events_insert on public.repro_events
  for insert to authenticated
  with check (public.is_farm_member(farm_id) and recorded_by = (select auth.uid()));
create policy repro_events_update on public.repro_events
  for update to authenticated
  using (public.is_farm_member(farm_id))
  with check (public.is_farm_member(farm_id));

-- Extend the unified pull feed (D-014) with both event tables.
create or replace function public.pull_changes(
  p_farm_id uuid,
  p_after_version bigint,
  p_limit integer default 500
)
returns table (
  entity_type text,
  entity_id uuid,
  server_version bigint,
  deleted_at timestamptz,
  row_data jsonb
)
language sql
security invoker
stable
set search_path = ''
as $$
  select * from (
    select
      'farm'::text as entity_type,
      f.id as entity_id,
      f.server_version,
      null::timestamptz as deleted_at,
      to_jsonb(f) as row_data
    from public.farms f
    where f.id = p_farm_id and f.server_version > p_after_version

    union all

    select 'farm_member', m.id, m.server_version, null::timestamptz, to_jsonb(m)
    from public.farm_members m
    where m.farm_id = p_farm_id and m.server_version > p_after_version

    union all

    select 'farm_invite', i.id, i.server_version, null::timestamptz, to_jsonb(i)
    from public.farm_invites i
    where i.farm_id = p_farm_id and i.server_version > p_after_version

    union all

    select 'cow', c.id, c.server_version, c.deleted_at, to_jsonb(c)
    from public.cows c
    where c.farm_id = p_farm_id and c.server_version > p_after_version

    union all

    select 'milk_record', r.id, r.server_version, r.deleted_at, to_jsonb(r)
    from public.milk_records r
    where r.farm_id = p_farm_id and r.server_version > p_after_version

    union all

    select 'health_event', h.id, h.server_version, h.deleted_at, to_jsonb(h)
    from public.health_events h
    where h.farm_id = p_farm_id and h.server_version > p_after_version

    union all

    select 'repro_event', e.id, e.server_version, e.deleted_at, to_jsonb(e)
    from public.repro_events e
    where e.farm_id = p_farm_id and e.server_version > p_after_version
  ) changes
  order by server_version
  limit least(greatest(p_limit, 1), 1000);
$$;

revoke execute on function public.pull_changes(uuid, bigint, integer) from public, anon;
grant execute on function public.pull_changes(uuid, bigint, integer) to authenticated;
