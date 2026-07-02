-- Defense in depth: the app never queries domain data anonymously, so the
-- anon role gets no table access at all (RLS already returned zero rows;
-- this removes even the ability to ask). Function EXECUTE moves from the
-- implicit PUBLIC grant to an explicit authenticated grant.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;

grant execute on function public.is_farm_member(uuid) to authenticated;
grant execute on function public.farm_role(uuid) to authenticated;
grant execute on function public.is_farm_owner(uuid) to authenticated;
grant execute on function public.accept_farm_invite(uuid) to authenticated;
grant execute on function public.pull_changes(uuid, bigint, integer) to authenticated;
