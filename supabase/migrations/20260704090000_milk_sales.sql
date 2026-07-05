-- Milk sales/settlements (ROADMAP H1): liters delivered to the buyer,
-- price, and optional quality metrics. Income totals are derived on read
-- (liters * price), never stored. Same sync contract as every table.

create table public.milk_sales (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id),
  sale_date date not null,
  liters numeric(8, 2) not null check (liters > 0),
  price_per_liter numeric(10, 2) not null check (price_per_liter >= 0),
  fat_percent numeric(4, 2) check (fat_percent is null or (fat_percent >= 0 and fat_percent <= 15)),
  protein_percent numeric(4, 2) check (protein_percent is null or (protein_percent >= 0 and protein_percent <= 10)),
  notes text check (notes is null or char_length(notes) <= 500),
  recorded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0
);

create index milk_sales_farm_date_idx on public.milk_sales (farm_id, sale_date desc)
  where deleted_at is null;
create index milk_sales_version_idx on public.milk_sales (farm_id, server_version);

create trigger milk_sales_server_version
  before insert or update on public.milk_sales
  for each row execute function public.set_server_version();

grant select, insert, update on public.milk_sales to authenticated;

alter table public.milk_sales enable row level security;

create policy milk_sales_select on public.milk_sales
  for select to authenticated using (public.is_farm_member(farm_id));
create policy milk_sales_insert on public.milk_sales
  for insert to authenticated
  with check (public.is_farm_member(farm_id) and recorded_by = (select auth.uid()));
create policy milk_sales_update on public.milk_sales
  for update to authenticated
  using (public.is_farm_member(farm_id))
  with check (public.is_farm_member(farm_id));

-- Extend the unified pull feed (D-014).
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

    union all

    select 'milk_sale', s.id, s.server_version, s.deleted_at, to_jsonb(s)
    from public.milk_sales s
    where s.farm_id = p_farm_id and s.server_version > p_after_version
  ) changes
  order by server_version
  limit least(greatest(p_limit, 1), 1000);
$$;

revoke execute on function public.pull_changes(uuid, bigint, integer) from public, anon;
grant execute on function public.pull_changes(uuid, bigint, integer) to authenticated;
