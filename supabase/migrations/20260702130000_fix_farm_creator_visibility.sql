-- Bug fix: the client creates farms with INSERT ... RETURNING, and Postgres
-- checks the returned row against the SELECT policy *before* the
-- bootstrap-owner trigger has created the membership, so farm creation
-- failed with "new row violates row-level security policy for table farms".
-- The creator of a farm may always see its row.

drop policy farms_select on public.farms;

create policy farms_select on public.farms
  for select to authenticated
  using (
    public.is_farm_member(id)
    or created_by = (select auth.uid())
  );
