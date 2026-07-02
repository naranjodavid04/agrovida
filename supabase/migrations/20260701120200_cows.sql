-- Cows (docs/ARCHITECTURE.md §5). Statuses are independent dimensions
-- (D-005); derived values like age or daily milk are never stored (D-006/7).

create table public.cows (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id),
  name text not null check (char_length(trim(name)) between 1 and 120),
  tag_number text check (tag_number is null or char_length(trim(tag_number)) between 1 and 40),
  photo_path text,
  birth_date date check (birth_date is null or birth_date <= now()::date),
  birth_date_is_estimated boolean not null default false,
  breed text check (breed is null or char_length(breed) <= 80),
  mother_id uuid references public.cows (id),
  calving_count integer not null default 0 check (calving_count between 0 and 30),
  lifecycle_status text not null default 'active'
    check (lifecycle_status in ('active', 'sold', 'deceased', 'culled')),
  lactation_status text not null default 'unknown'
    check (lactation_status in ('lactating', 'dry', 'unknown')),
  pregnancy_status text not null default 'unknown'
    check (pregnancy_status in ('pregnant', 'open', 'unknown')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0,
  constraint cows_not_own_mother check (mother_id is null or mother_id <> id)
);

-- Unique tag among non-deleted cows within a farm, when present
-- (PRODUCT_SPEC §6).
create unique index cows_unique_active_tag
  on public.cows (farm_id, lower(trim(tag_number)))
  where deleted_at is null and tag_number is not null;

create index cows_farm_idx on public.cows (farm_id) where deleted_at is null;
create index cows_mother_idx on public.cows (mother_id);
create index cows_version_idx on public.cows (farm_id, server_version);

create trigger cows_server_version
  before insert or update on public.cows
  for each row execute function public.set_server_version();

-- A mother must belong to the same farm (FKs cannot express this).
create or replace function public.check_cow_mother()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mother_farm uuid;
begin
  if new.mother_id is null then
    return new;
  end if;
  select farm_id into v_mother_farm from public.cows where id = new.mother_id;
  if v_mother_farm is null then
    raise exception 'mother cow not found';
  end if;
  if v_mother_farm <> new.farm_id then
    raise exception 'mother must belong to the same farm';
  end if;
  return new;
end;
$$;

create trigger cows_check_mother
  before insert or update of mother_id, farm_id on public.cows
  for each row execute function public.check_cow_mother();

-- ---------------------------------------------------------------------------
-- RLS: members read/write; only owners may move lifecycle away from 'active'
-- or touch non-active cows (PRODUCT_SPEC §2, ARCHITECTURE §8).
-- ---------------------------------------------------------------------------

alter table public.cows enable row level security;

create policy cows_select on public.cows
  for select to authenticated
  using (public.is_farm_member(farm_id));

create policy cows_insert on public.cows
  for insert to authenticated
  with check (
    public.is_farm_member(farm_id)
    and created_by = (select auth.uid())
    and (public.is_farm_owner(farm_id) or lifecycle_status = 'active')
  );

create policy cows_update on public.cows
  for update to authenticated
  using (
    public.is_farm_member(farm_id)
    and (public.is_farm_owner(farm_id) or lifecycle_status = 'active')
  )
  with check (
    public.is_farm_member(farm_id)
    and (public.is_farm_owner(farm_id) or lifecycle_status = 'active')
  );
