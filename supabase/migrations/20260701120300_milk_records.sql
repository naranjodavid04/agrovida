-- Milk records: one active record per farm/cow/date/session
-- (PRODUCT_SPEC §6, ARCHITECTURE §5). Daily totals and trends are derived.

create table public.milk_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id),
  cow_id uuid not null references public.cows (id),
  record_date date not null,
  session text not null check (session in ('morning', 'afternoon')),
  -- Shared bound mirrored in src/lib/constants.ts (MAX_LITERS_PER_SESSION).
  liters numeric(6, 2) not null check (liters >= 0 and liters <= 60),
  recorded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0
);

create unique index milk_records_unique_active_session
  on public.milk_records (farm_id, cow_id, record_date, session)
  where deleted_at is null;

create index milk_records_cow_date_idx
  on public.milk_records (cow_id, record_date desc)
  where deleted_at is null;
create index milk_records_farm_date_idx
  on public.milk_records (farm_id, record_date desc)
  where deleted_at is null;
create index milk_records_version_idx on public.milk_records (farm_id, server_version);

create trigger milk_records_server_version
  before insert or update on public.milk_records
  for each row execute function public.set_server_version();

-- No delete grant: corrections are soft deletes (updates), D-009.
grant select, insert, update on public.milk_records to authenticated;

-- The cow must belong to the same farm as the record.
create or replace function public.check_milk_record_cow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cow_farm uuid;
begin
  select farm_id into v_cow_farm from public.cows where id = new.cow_id;
  if v_cow_farm is null then
    raise exception 'cow not found';
  end if;
  if v_cow_farm <> new.farm_id then
    raise exception 'cow must belong to the same farm';
  end if;
  return new;
end;
$$;

create trigger milk_records_check_cow
  before insert or update of cow_id, farm_id on public.milk_records
  for each row execute function public.check_milk_record_cow();

-- ---------------------------------------------------------------------------
-- RLS: any active member records and edits milk.
-- ---------------------------------------------------------------------------

alter table public.milk_records enable row level security;

create policy milk_records_select on public.milk_records
  for select to authenticated
  using (public.is_farm_member(farm_id));

create policy milk_records_insert on public.milk_records
  for insert to authenticated
  with check (
    public.is_farm_member(farm_id)
    and recorded_by = (select auth.uid())
  );

create policy milk_records_update on public.milk_records
  for update to authenticated
  using (public.is_farm_member(farm_id))
  with check (public.is_farm_member(farm_id));
