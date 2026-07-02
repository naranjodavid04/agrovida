-- Unified pull feed (DECISIONS.md D-014). SECURITY INVOKER so RLS filters
-- every branch; the client keeps a single per-farm cursor and applies rows
-- in server_version order.

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
  ) changes
  order by server_version
  limit least(greatest(p_limit, 1), 1000);
$$;

revoke execute on function public.pull_changes(uuid, bigint, integer) from anon;
